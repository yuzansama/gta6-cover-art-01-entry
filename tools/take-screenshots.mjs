// Takes the screenshots listed in shots.json with desktop Chrome, headless, over the DevTools protocol.
// Node 22+, standard library only (the built-in WebSocket and fetch). Start `node serve.ts` first, then:
//
//   node tools/take-screenshots.mjs [--only <name-prefix>] [--out <dir>]
//
// Each shot opens the app at its query, waits for window.__shotReady and saves a JPEG no larger than 256 KiB.
// With --export-check it also clicks nothing but calls the app's own export for each post size and reports the PNG
// dimensions, to prove the export path works.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const appUrl = flag('--url') ?? 'http://localhost:8080/';
const outDir = flag('--out') ?? join(root, 'screenshots');
const only = flag('--only');
const MAX_BYTES = 256 * 1024;

const chromePaths = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const chromePath = chromePaths.find((path) => existsSync(path));
if (!chromePath) throw new Error('Chrome not found: set CHROME_PATH');

const profile = mkdtempSync(join(tmpdir(), 'neon-coast-shots-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chrome picks a free debugging port itself (port 0) and writes it to DevToolsActivePort in its profile, so a stale
 * browser from an earlier run can never be mistaken for this one.
 */
async function openPage() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })).json();
      const page = pages.find((candidate) => candidate.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await sleep(200);
  }
  throw new Error('Chrome did not open a page');
}

/** A minimal DevTools protocol client: send(method, params) resolves to the command's result. */
async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 1;
  const waiting = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      console.error(`page error: ${details.exception?.description ?? details.text} (${details.url ?? ''}:${details.lineNumber ?? ''})`);
    }
    if (!message.id || !waiting.has(message.id)) return;
    const { resolve, reject } = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  return {
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        // A command the browser never answers must not hang the run.
        const timer = setTimeout(() => {
          waiting.delete(id);
          reject(new Error(`${method} timed out`));
        }, 20000);
        waiting.set(id, {
          resolve: (value) => (clearTimeout(timer), resolve(value)),
          reject: (error) => (clearTimeout(timer), reject(error)),
        });
      });
    },
    close: () => socket.close(),
  };
}

async function evaluate(page, expression) {
  const { result, exceptionDetails } = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

async function openShot(page, shot) {
  await page.send('Emulation.setDeviceMetricsOverride', { width: shot.w, height: shot.h, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url: appUrl + shot.query });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await sleep(150);
    if (await evaluate(page, 'window.__shotReady === true').catch(() => false)) return;
  }
  throw new Error(`${shot.name}: the app never became ready`);
}

async function captureJpegUnderLimit(page) {
  for (let quality = 92; quality >= 40; quality -= 4) {
    const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality });
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length <= MAX_BYTES) return { bytes, quality };
  }
  throw new Error('could not fit the screenshot under 256 KiB');
}

try {
  const page = await connect(await openPage());
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8')).filter((shot) => !only || shot.name.startsWith(only));
  mkdirSync(outDir, { recursive: true });
  const downloads = mkdtempSync(join(tmpdir(), 'neon-coast-exports-'));
  await page.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  for (const shot of shots) {
    await openShot(page, shot);
    if (shot.query.includes('shot=editor')) {
      // The editor shot is taken after a real export: click Export PNG and wait for the app to say it saved the file.
      await evaluate(page, `document.getElementById('export-png-button').click()`);
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await sleep(150);
        if (await evaluate(page, `document.getElementById('export-status').classList.contains('saved')`)) break;
      }
      await sleep(1500);
      const saved = readdirSync(downloads).map((name) => {
        // A PNG's width and height are the two big-endian integers at bytes 16 and 20 of the file.
        const png = readFileSync(join(downloads, name));
        return `${name} (${png.readUInt32BE(16)}x${png.readUInt32BE(20)}, ${png.length} bytes)`;
      });
      console.log(`exported by click: ${saved.join(', ') || 'nothing'}`);
    }
    await sleep(300);
    const { bytes, quality } = await captureJpegUnderLimit(page);
    writeFileSync(join(outDir, shot.name), bytes);
    console.log(`${shot.name}  ${shot.w}x${shot.h}  ${bytes.length} bytes  quality ${quality}`);
  }
  if (args.includes('--export-check')) {
    await openShot(page, { name: 'export-check', query: '?shot=editor&scene=neon-coast-landscape', w: 1280, h: 720 });
    const report = await evaluate(page, `(async () => {
      const { renderCoverAtPostSize, canvasToPngBlob } = await import('./src/export-png.js');
      const { POST_SIZES } = await import('./src/cover-design.js');
      const lines = [];
      for (const size of POST_SIZES) {
        const started = performance.now();
        const canvas = renderCoverAtPostSize(window.neonCoast.design, window.neonCoast.photos, size.id);
        const blob = await canvasToPngBlob(canvas);
        lines.push(size.id + ' ' + canvas.width + 'x' + canvas.height + ' ' + blob.type + ' ' + blob.size + ' bytes ' + Math.round(performance.now() - started) + ' ms');
      }
      return lines.join('\\n');
    })()`);
    console.log(report);
  }
  page.close();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  // On Windows chrome.kill() stops only the launcher, so the whole process tree is ended by pid.
  if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(chrome.pid)], { stdio: 'ignore' });
  else chrome.kill();
  await sleep(1500);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    // Chrome can hold its profile open for a moment on Windows; the temp folder is harmless.
  }
  process.exit();
}
