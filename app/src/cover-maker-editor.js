// The editor: add your own photos, pick a panel layout, drag each panel to crop and position its photo, write the
// caption, choose a sunset or neon grade and export the cover as a PNG. Every change redraws the live preview with
// the same renderer the export uses. Photos are read with object URLs on this machine and never uploaded.

import { BACKDROP_SCENES } from './backdrop-scenes.js';
import { LETTERING_STYLES, loadCaptionFonts } from './caption-lettering.js';
import { COLOUR_GRADES } from './colour-grades.js';
import {
  POST_SIZES, autoFillPanels, createCoverDesign, cyclePanelContent, findPostSize, placePhotoInPanel, reconcileSlots,
} from './cover-design.js';
import { exportAllPostSizes, exportCoverPng } from './export-png.js';
import { PANEL_LAYOUTS, pointInPolygon, polygonBounds, tracePolygonPath } from './panel-layouts.js';
import { flipCrop, panCropByPixels, zoomCrop } from './photo-crop.js';
import { panelPolygonsInPixels, renderCover } from './render-cover.js';
import { applyScreenshotScene } from './screenshot-scenes.js';

const SAMPLE_PHOTOS = ['samples/boulevard.jpg', 'samples/pier.jpg'];
const PHOTO_MAX_SIDE = 2200;
const PREVIEW_MAX_SIDE = 1280;

const design = createCoverDesign();
const photos = [];
let selectedPanel = 0;
let nextPhotoId = 1;
let previewQueued = false;
let coverOnly = false;

const $ = (id) => document.getElementById(id);
const preview = $('live-cover-preview-drag-to-crop');
const previewFrame = $('preview-frame');
const status = $('export-status');

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not read ${url}`));
    image.src = url;
  });
}

/** Copies a loaded photo onto a canvas no larger than PHOTO_MAX_SIDE, so huge camera photos stay quick to crop. */
function normalisePhoto(image) {
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function thumbnailOf(canvas) {
  const thumb = document.createElement('canvas');
  thumb.width = 104;
  thumb.height = 104;
  const scale = Math.max(104 / canvas.width, 104 / canvas.height);
  thumb.getContext('2d').drawImage(canvas, (104 - canvas.width * scale) / 2, (104 - canvas.height * scale) * 0.3, canvas.width * scale, canvas.height * scale);
  return thumb.toDataURL('image/jpeg', 0.8);
}

async function addPhotoFromUrl(url, name, isSample) {
  const image = normalisePhoto(await loadImage(url));
  photos.push({ id: nextPhotoId, name, image, thumbnail: thumbnailOf(image), isSample });
  nextPhotoId += 1;
}

/** Reads the person's own image files. The first real photo replaces the built-in samples. */
async function addPhotoFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith('image/'));
  if (!files.length) return;
  if (photos.some((photo) => photo.isSample)) photos.splice(0, photos.length);
  for (const file of files) {
    const url = URL.createObjectURL(file);
    try {
      await addPhotoFromUrl(url, file.name, false);
    } catch {
      say(`Could not read ${file.name}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  design.shuffleSeed = 0;
  autoFillPanels(design, photos.length);
  selectedPanel = 0;
  say(`${photos.length} photo${photos.length === 1 ? '' : 's'} loaded · drag a panel to position`);
  refreshEverything();
}

function removePhoto(index) {
  photos.splice(index, 1);
  autoFillPanels(design, photos.length);
  refreshEverything();
}

function say(message, saved = false) {
  status.textContent = message;
  status.classList.toggle('saved', saved);
}

// ---- Live preview -------------------------------------------------------------------------------------------------

/** Sizes the preview canvas to fit its frame at the post size's aspect ratio. */
function fitPreviewToFrame() {
  const size = findPostSize(design.sizeId);
  const aspect = size.width / size.height;
  const frame = previewFrame.getBoundingClientRect();
  const pad = coverOnly ? 0 : 20;
  const cssWidth = Math.max(120, Math.min(frame.width - pad, (frame.height - pad) * aspect));
  const cssHeight = cssWidth / aspect;
  const density = coverOnly ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const pixelScale = Math.min(density, PREVIEW_MAX_SIDE / Math.max(cssWidth, cssHeight));
  preview.style.width = `${cssWidth}px`;
  preview.style.height = `${cssHeight}px`;
  const width = Math.round(cssWidth * pixelScale);
  const height = Math.round(cssHeight * pixelScale);
  if (preview.width !== width || preview.height !== height) {
    preview.width = width;
    preview.height = height;
  }
}

function outlineSelectedPanel() {
  const polygons = panelPolygonsInPixels(design, preview.width, preview.height);
  const points = polygons[selectedPanel];
  if (!points) return;
  const ctx = preview.getContext('2d');
  ctx.save();
  tracePolygonPath(ctx, points);
  ctx.lineWidth = Math.max(2, preview.width * 0.004);
  ctx.strokeStyle = '#3fe3f2';
  ctx.setLineDash([preview.width * 0.014, preview.width * 0.008]);
  ctx.stroke();
  ctx.restore();
}

function drawPreviewNow() {
  previewQueued = false;
  fitPreviewToFrame();
  renderCover(preview, design, photos);
  if (!coverOnly) outlineSelectedPanel();
}

function queuePreview() {
  if (previewQueued) return;
  previewQueued = true;
  requestAnimationFrame(drawPreviewNow);
}

// ---- Crop and position by dragging on the preview -----------------------------------------------------------------

function pointerInCanvasPixels(event) {
  const box = preview.getBoundingClientRect();
  return [((event.clientX - box.left) / box.width) * preview.width, ((event.clientY - box.top) / box.height) * preview.height];
}

function panelUnderPointer(event) {
  const [x, y] = pointerInCanvasPixels(event);
  return panelPolygonsInPixels(design, preview.width, preview.height).findIndex((points) => pointInPolygon(x, y, points));
}

function selectedPhotoSlot() {
  const slot = design.slots[selectedPanel];
  return slot && slot.kind === 'photo' && photos[slot.photo] ? slot : null;
}

function selectedPanelBox() {
  return polygonBounds(panelPolygonsInPixels(design, preview.width, preview.height)[selectedPanel]);
}

function changeSelectedCrop(change) {
  const slot = selectedPhotoSlot();
  if (!slot) return;
  const { image } = photos[slot.photo];
  const box = selectedPanelBox();
  slot.crop = change(slot.crop, image.width, image.height, box.w, box.h);
  syncSelectedPanelControls();
  queuePreview();
}

function wirePreviewDragging() {
  let last = null;
  preview.addEventListener('pointerdown', (event) => {
    const hit = panelUnderPointer(event);
    if (hit < 0) return;
    selectedPanel = hit;
    last = pointerInCanvasPixels(event);
    preview.setPointerCapture(event.pointerId);
    preview.classList.add('dragging');
    syncSelectedPanelControls();
    refreshPhotoTray();
    queuePreview();
  });
  preview.addEventListener('pointermove', (event) => {
    if (!last) return;
    const now = pointerInCanvasPixels(event);
    const dx = now[0] - last[0];
    const dy = now[1] - last[1];
    last = now;
    changeSelectedCrop((crop, pw, ph, bw, bh) => panCropByPixels(crop, dx, dy, pw, ph, bw, bh));
  });
  const stop = () => {
    last = null;
    preview.classList.remove('dragging');
  };
  preview.addEventListener('pointerup', stop);
  preview.addEventListener('pointercancel', stop);
  preview.addEventListener('wheel', (event) => {
    event.preventDefault();
    const hit = panelUnderPointer(event);
    if (hit >= 0) selectedPanel = hit;
    changeSelectedCrop((crop, pw, ph, bw, bh) => zoomCrop(crop, Math.exp(-event.deltaY * 0.0015), pw, ph, bw, bh));
  }, { passive: false });
  preview.addEventListener('dblclick', () => {
    cyclePanelContent(design, selectedPanel, photos.length);
    refreshEverything();
  });
}

// ---- Controls -----------------------------------------------------------------------------------------------------

/** Fills a container with one toggle button per option and keeps aria-pressed on the current one. */
function buildChoiceChips(container, options, isCurrent, onPick, labelOf = (option) => option.name) {
  container.replaceChildren(
    ...options.map((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = labelOf(option);
      button.setAttribute('aria-pressed', String(isCurrent(option)));
      button.addEventListener('click', () => {
        onPick(option);
        refreshEverything();
      });
      return button;
    }),
  );
}

function refreshChoiceChips() {
  buildChoiceChips($('post-size-picker-1080x1080-1080x1350-1920x1080'), POST_SIZES, (size) => size.id === design.sizeId, (size) => {
    design.sizeId = size.id;
    reconcileSlots(design, photos.length);
  }, (size) => `${size.label}<small>${size.hint}</small>`);
  buildChoiceChips($('panel-layout-picker'), PANEL_LAYOUTS, (layout) => layout.id === design.layoutId, (layout) => {
    design.layoutId = layout.id;
    autoFillPanels(design, photos.length);
    selectedPanel = 0;
  });
  buildChoiceChips($('caption-lettering-style-picker'), LETTERING_STYLES, (style) => style.id === design.letteringStyle, (style) => {
    design.letteringStyle = style.id;
  });
  buildChoiceChips($('sunset-neon-colour-grade-picker'), COLOUR_GRADES, (grade) => grade.id === design.gradeId, (grade) => {
    design.gradeId = grade.id;
  });
}

function refreshPhotoTray() {
  const tray = $('photo-tray-click-to-place-in-panel');
  const slot = design.slots[selectedPanel];
  tray.replaceChildren(
    ...photos.map((photo, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = `Place ${photo.name} in panel ${selectedPanel + 1}`;
      button.style.backgroundImage = `url(${photo.thumbnail})`;
      button.classList.toggle('in-panel', Boolean(slot && slot.kind === 'photo' && slot.photo === index));
      button.addEventListener('click', () => {
        placePhotoInPanel(design, selectedPanel, index);
        refreshEverything();
      });
      const remove = document.createElement('span');
      remove.className = 'remove';
      remove.textContent = '×';
      remove.title = 'Remove photo';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        removePhoto(index);
      });
      button.append(remove);
      return button;
    }),
  );
}

function syncSelectedPanelControls() {
  const slot = design.slots[selectedPanel];
  const what = !slot ? '' : slot.kind === 'photo' && photos[slot.photo]
    ? photos[slot.photo].name
    : (BACKDROP_SCENES.find((scene) => scene.id === slot.scene) ?? BACKDROP_SCENES[0]).name;
  $('selected-panel-label').textContent = `Panel ${selectedPanel + 1} · ${what.length > 22 ? `${what.slice(0, 21)}…` : what}`;
  const zoom = $('panel-photo-zoom');
  const photoSlot = selectedPhotoSlot();
  zoom.disabled = !photoSlot;
  $('flip-panel-photo').disabled = !photoSlot;
  if (photoSlot) zoom.value = String(Math.round(photoSlot.crop.zoom * 100));
}

function refreshEverything() {
  selectedPanel = Math.min(selectedPanel, Math.max(0, design.slots.length - 1));
  $('caption-title-input').value = design.caption.title;
  $('caption-tagline-input').value = design.caption.tagline;
  $('colour-grade-strength').value = String(Math.round(design.look.gradeStrength * 100));
  $('ink-outline-strength').value = String(Math.round(design.look.inkStrength * 100));
  $('per-panel-colour-mix').checked = design.perPanelMix;
  refreshChoiceChips();
  refreshPhotoTray();
  syncSelectedPanelControls();
  queuePreview();
}

function wireControls() {
  $('photo-file-input-multiple').addEventListener('change', (event) => {
    addPhotoFiles(event.target.files);
    event.target.value = '';
  });
  $('caption-title-input').addEventListener('input', (event) => {
    design.caption.title = event.target.value;
    queuePreview();
  });
  $('caption-tagline-input').addEventListener('input', (event) => {
    design.caption.tagline = event.target.value;
    queuePreview();
  });
  $('colour-grade-strength').addEventListener('input', (event) => {
    design.look.gradeStrength = Number(event.target.value) / 100;
    queuePreview();
  });
  $('ink-outline-strength').addEventListener('input', (event) => {
    design.look.inkStrength = Number(event.target.value) / 100;
    queuePreview();
  });
  $('per-panel-colour-mix').addEventListener('change', (event) => {
    design.perPanelMix = event.target.checked;
    queuePreview();
  });
  $('shuffle-photos-and-crops').addEventListener('click', () => {
    design.shuffleSeed += 1;
    autoFillPanels(design, photos.length);
    refreshEverything();
  });
  $('auto-fill-panels-from-photos').addEventListener('click', () => {
    design.shuffleSeed = 0;
    autoFillPanels(design, photos.length);
    refreshEverything();
  });
  $('panel-photo-zoom').addEventListener('input', (event) => {
    const target = Number(event.target.value) / 100;
    changeSelectedCrop((crop, pw, ph, bw, bh) => zoomCrop(crop, target / crop.zoom, pw, ph, bw, bh));
  });
  $('flip-panel-photo').addEventListener('click', () => changeSelectedCrop((crop) => flipCrop(crop)));
  $('next-photo-or-scene-in-panel').addEventListener('click', () => {
    cyclePanelContent(design, selectedPanel, photos.length);
    refreshEverything();
  });
  $('export-png-button').addEventListener('click', () => exportAndReport('Rendering PNG…', () => exportCoverPng(design, photos)));
  $('export-all-three-sizes-button').addEventListener('click', () => exportAndReport('Rendering 3 PNGs…', async () => (await exportAllPostSizes(design, photos)).join(' · ')));
}

/** Runs an export and keeps the status line truthful: a rejected PNG encode used to leave "Rendering…" on screen. */
async function exportAndReport(busyMessage, run) {
  say(busyMessage);
  try {
    say(`✓ Exported ${await run()}`, true);
  } catch (error) {
    say(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Photos can also be dropped anywhere on the page or pasted from the clipboard. */
function wireDropAndPaste() {
  const dropzone = $('photo-dropzone-add-your-own-photos');
  window.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('dragging');
    previewFrame.classList.add('dragging-file');
  });
  const calm = () => {
    dropzone.classList.remove('dragging');
    previewFrame.classList.remove('dragging-file');
  };
  window.addEventListener('dragleave', calm);
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    calm();
    if (event.dataTransfer) addPhotoFiles(event.dataTransfer.files);
  });
  window.addEventListener('paste', (event) => {
    if (event.clipboardData && event.clipboardData.files.length) addPhotoFiles(event.clipboardData.files);
  });
}

async function startEditor() {
  const query = new URLSearchParams(location.search);
  coverOnly = query.get('shot') === 'cover';
  if (coverOnly) document.body.classList.add('shot-cover');
  wireControls();
  wireDropAndPaste();
  wirePreviewDragging();
  window.addEventListener('resize', queuePreview);
  await loadCaptionFonts();
  // The samples load one after another so photo 0 and photo 1 are always the same pictures.
  for (const url of SAMPLE_PHOTOS) await addPhotoFromUrl(url, url.split('/').pop(), true).catch(() => undefined);
  autoFillPanels(design, photos.length);
  if (query.has('shot')) selectedPanel = applyScreenshotScene(query.get('scene'), design);
  refreshEverything();
  // For the screenshot script and for trying the export from the console.
  window.neonCoast = { design, photos, exportCoverPng: (sizeId) => exportCoverPng(design, photos, sizeId) };
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}

startEditor();
