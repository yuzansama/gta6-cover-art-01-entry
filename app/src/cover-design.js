// The cover design: everything the editor changes and the renderer reads. A design holds the post size, the panel
// layout, what fills each panel (a photo with its crop, or a drawn backdrop scene), the caption and the look.

import { BACKDROP_SCENES, seededRandom } from './backdrop-scenes.js';
import { buildPanelLayout } from './panel-layouts.js';
import { defaultCrop } from './photo-crop.js';

/** The common post sizes the app exports. */
export const POST_SIZES = [
  { id: 'landscape', label: '1920 × 1080', hint: 'Landscape', width: 1920, height: 1080 },
  { id: 'portrait', label: '1080 × 1350', hint: 'Portrait', width: 1080, height: 1350 },
  { id: 'square', label: '1080 × 1080', hint: 'Square', width: 1080, height: 1080 },
];

export function findPostSize(id) {
  return POST_SIZES.find((size) => size.id === id) ?? POST_SIZES[0];
}

export function createCoverDesign() {
  return {
    sizeId: 'landscape',
    layoutId: 'mosaic',
    slots: [],
    caption: { title: 'Neon Coast', tagline: 'Summer never ends' },
    letteringStyle: 'block',
    gradeId: 'sunset',
    perPanelMix: true,
    look: { gradeStrength: 0.55, inkStrength: 0.75 },
    shuffleSeed: 0,
  };
}

export function panelCountOf(design) {
  const size = findPostSize(design.sizeId);
  return buildPanelLayout(design.layoutId, size.width / size.height).panels.length;
}

// Crops for the first, second, third and fourth time one photo is used: wide, then closer looks at other parts.
const REPEAT_CROPS = [
  { fx: 0.5, fy: 0.34, zoom: 1, flip: false },
  { fx: 0.5, fy: 0.26, zoom: 1.8, flip: true },
  { fx: 0.42, fy: 0.5, zoom: 1.4, flip: false },
  { fx: 0.58, fy: 0.3, zoom: 2.4, flip: true },
];

/**
 * Fills every panel from the photos: each photo is used in turn, a photo used again gets a different crop, and when
 * there are few photos some panels take a drawn backdrop scene. A shuffle seed above 0 varies the order and crops.
 */
export function autoFillPanels(design, photoCount) {
  const panelCount = panelCountOf(design);
  const random = seededRandom(design.shuffleSeed);
  const shuffled = design.shuffleSeed > 0;
  const slots = [];
  const repeats = photoCount ? Math.min(4, Math.max(1, Math.round((panelCount * 0.75) / photoCount))) : 0;
  const photoPanels = Math.min(panelCount, photoCount * repeats);
  const sceneCount = panelCount - photoPanels;
  // Scene panels are spread evenly between the photo panels, never first.
  const scenePanels = new Set();
  for (let k = 0; k < sceneCount; k += 1) scenePanels.add(Math.round(((k + 1) * panelCount) / (sceneCount + 1)));
  const uses = new Array(photoCount).fill(0);
  let nextPhoto = shuffled ? Math.floor(random() * Math.max(1, photoCount)) : 0;
  let nextScene = shuffled ? Math.floor(random() * BACKDROP_SCENES.length) : 0;
  for (let i = 0; i < panelCount; i += 1) {
    if (!photoCount || scenePanels.has(i)) {
      slots.push({ kind: 'scene', scene: BACKDROP_SCENES[nextScene % BACKDROP_SCENES.length].id });
      nextScene += 1;
      continue;
    }
    const photo = nextPhoto % photoCount;
    nextPhoto += 1;
    const preset = REPEAT_CROPS[uses[photo] % REPEAT_CROPS.length];
    uses[photo] += 1;
    const crop = shuffled
      ? { fx: 0.3 + random() * 0.4, fy: 0.2 + random() * 0.3, zoom: 1 + random() * random() * 1.6, flip: random() > 0.5 }
      : { ...preset };
    slots.push({ kind: 'photo', photo, crop });
  }
  design.slots = slots;
  return design;
}

/** Keeps the slots in step with the layout and the photo list after a size, layout or photo change. */
export function reconcileSlots(design, photoCount) {
  const panelCount = panelCountOf(design);
  const valid = design.slots.length === panelCount
    && design.slots.every((slot) => slot.kind === 'scene' || slot.photo < photoCount);
  if (!valid) autoFillPanels(design, photoCount);
  return design;
}

/** Puts a photo into one panel with a fresh crop. */
export function placePhotoInPanel(design, panelIndex, photoIndex) {
  design.slots[panelIndex] = { kind: 'photo', photo: photoIndex, crop: defaultCrop() };
}

/** Steps a panel through every photo and then every backdrop scene. */
export function cyclePanelContent(design, panelIndex, photoCount) {
  const slot = design.slots[panelIndex];
  const choices = photoCount + BACKDROP_SCENES.length;
  const current = slot.kind === 'photo' ? slot.photo : photoCount + BACKDROP_SCENES.findIndex((scene) => scene.id === slot.scene);
  const next = (current + 1) % choices;
  if (next < photoCount) placePhotoInPanel(design, panelIndex, next);
  else design.slots[panelIndex] = { kind: 'scene', scene: BACKDROP_SCENES[next - photoCount].id };
}
