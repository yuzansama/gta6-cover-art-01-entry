// Turns a cropped photo into poster-style illustration: flat posterised tones, inked outlines and a sunset or neon
// colour grade. It works on pixels with the 2D canvas alone, so it runs offline in the browser on any photo.
//
// The steps: draw the crop twice at two blur radii; the difference of the two luminances finds edges (a difference
// of Gaussians), which become ink lines; the lightly blurred copy is posterised into a few soft-stepped tones, its
// saturation lifted, and blended with the grade's ramp colour for its tone.

import { buildGradeRampLookup, hexToRgb } from './colour-grades.js';
import { drawCroppedPhoto } from './photo-crop.js';

const TONE_LEVELS = 5;
const TONE_SOFTNESS = 0.2;

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function blurredPixels(source, radius, extraFilter = '') {
  const canvas = makeCanvas(source.width, source.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.filter = `blur(${radius.toFixed(2)}px) ${extraFilter}`.trim();
  ctx.drawImage(source, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Posterises, inks and grades the pixels in place. `fine` and `coarse` are the same picture at a small and a large
 * blur; the result is written into `fine`.
 */
export function posteriseInkAndGrade(fine, coarse, grade, look) {
  const lookup = buildGradeRampLookup(grade);
  const [inkR, inkG, inkB] = hexToRgb(grade.ink);
  const a = fine.data;
  const b = coarse.data;
  const gradeMix = look.gradeStrength;
  const inkMix = look.inkStrength;
  const saturation = 1.45;
  for (let i = 0; i < a.length; i += 4) {
    let r = a[i];
    let g = a[i + 1];
    let bl = a[i + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
    const lumCoarse = (0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2]) / 255;

    // A gentle S-curve for contrast, then soft-stepped tone bands.
    const curved = lum + (lum * lum * (3 - 2 * lum) - lum) * 0.7;
    const scaled = curved * TONE_LEVELS;
    const band = Math.floor(scaled);
    const tone = Math.min(1, (band + smoothstep(0.5 - TONE_SOFTNESS, 0.5 + TONE_SOFTNESS, scaled - band)) / TONE_LEVELS + 0.04);

    // Re-light the pixel to its tone band and lift its saturation.
    const gain = tone / Math.max(lum, 0.02);
    const grey = tone * 255;
    r = grey + (r * gain - grey) * saturation;
    g = grey + (g * gain - grey) * saturation;
    bl = grey + (bl * gain - grey) * saturation;

    // Blend toward the grade's ramp colour for this tone.
    const k = Math.min(255, Math.max(0, Math.round(tone * 255))) * 3;
    r += (lookup[k] - r) * gradeMix;
    g += (lookup[k + 1] - g) * gradeMix;
    bl += (lookup[k + 2] - bl) * gradeMix;

    // Ink where the fine picture is darker than its surroundings.
    const ink = smoothstep(0.012, 0.05, lumCoarse - lum) * inkMix;
    a[i] = r + (inkR - r) * ink;
    a[i + 1] = g + (inkG - g) * ink;
    a[i + 2] = bl + (inkB - bl) * ink;
    a[i + 3] = 255;
  }
  return fine;
}

const filteredCrops = new Map();
const FILTER_CACHE_LIMIT = 40;

/**
 * The illustrated crop of `photo` for a panel box of boxW x boxH pixels, as a canvas of that size. `unit` is the
 * cover's short side in pixels, so blur radii and line weights scale with the export size. Results are cached, so
 * editing the caption or another panel does not filter this one again.
 */
export function illustratePhotoCrop(photo, crop, boxW, boxH, grade, look, unit) {
  const key = [
    photo.id, boxW, boxH, crop.fx.toFixed(4), crop.fy.toFixed(4), crop.zoom.toFixed(3), crop.flip ? 1 : 0,
    grade.id, look.gradeStrength, look.inkStrength, Math.round(unit),
  ].join('|');
  const cached = filteredCrops.get(key);
  if (cached) return cached;

  const fineRadius = Math.max(0.5, unit * 0.0016);
  const coarseRadius = fineRadius * 3.2;
  const pad = Math.ceil(coarseRadius * 3);
  const source = makeCanvas(boxW + pad * 2, boxH + pad * 2);
  const sourceCtx = source.getContext('2d');
  sourceCtx.drawImage(photo.image, 0, 0, source.width, source.height);
  drawCroppedPhoto(sourceCtx, photo.image, crop, boxW, boxH, pad, pad);

  const fine = blurredPixels(source, fineRadius, 'saturate(1.15)');
  const coarse = blurredPixels(source, coarseRadius);
  posteriseInkAndGrade(fine, coarse, grade, look);

  const filtered = makeCanvas(source.width, source.height);
  filtered.getContext('2d').putImageData(fine, 0, 0);
  const result = makeCanvas(boxW, boxH);
  result.getContext('2d').drawImage(filtered, -pad, -pad);

  if (filteredCrops.size >= FILTER_CACHE_LIMIT) filteredCrops.delete(filteredCrops.keys().next().value);
  filteredCrops.set(key, result);
  return result;
}

export function clearFilteredCropCache() {
  filteredCrops.clear();
}
