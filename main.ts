// Neon Coast: a GTA-style cover art maker (make.fun bounty gta6-cover-art-01). Node 22, standard library only.
//
// The app is the static files under app/: app/index.html and its ES modules run offline in a desktop browser and
// turn a person's photos and a caption into multi-panel cover art, exported as a PNG. This program hands it in: it
// copies app/ and screenshots/ from beside this file to the output directory and writes dossier.json there with the
// kit's library (vendor/makefun-app.ts, unchanged).
//
//   node serve.ts                                        try the app on http://localhost:8080
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts  hand it in locally

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repository = fileURLToPath(new URL('.', import.meta.url));
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Copies one of the entry's directories into the output directory. */
function handInDirectory(name: string): void {
  const from = join(repository, name);
  const to = join(output, name);
  mkdirSync(to, { recursive: true });
  if (existsSync(from)) cpSync(from, to, { recursive: true });
}

// Fail early, with a plain message, when the entry is not whole: the gate needs app/index.html and 3 or 4 screenshots.
const indexHtml = join(repository, 'app', 'index.html');
if (!existsSync(indexHtml)) throw new Error(`missing ${indexHtml}: the cover maker's page`);
const screenshotsDir = join(repository, 'screenshots');
const screenshotNames = existsSync(screenshotsDir)
  ? readdirSync(screenshotsDir).filter((name) => !name.startsWith('.') && /\.(?:png|jpe?g)$/i.test(name)).sort()
  : [];
if (screenshotNames.length < 3 || screenshotNames.length > 4) {
  throw new Error(`screenshots/ holds ${screenshotNames.length} images; the bounty asks for 3 or 4 (the first by name is the cover)`);
}

mkdirSync(output, { recursive: true });
handInDirectory('app');
handInDirectory('screenshots');

writeFileSync(
  join(output, 'dossier.json'),
  buildDossier(output, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
