// Exports the cover as a PNG at a full post size: 1920 x 1080, 1080 x 1350 or 1080 x 1080. The cover is rendered
// again on a canvas of exactly that size, encoded in the browser and saved through a download link. Nothing is
// uploaded anywhere.

import { POST_SIZES, findPostSize, reconcileSlots } from './cover-design.js';
import { renderCover } from './render-cover.js';

/** Renders the design at the full pixel size of the given post size and returns the canvas. */
export function renderCoverAtPostSize(design, photos, sizeId) {
  const size = findPostSize(sizeId);
  const sized = sizeId === design.sizeId
    ? design
    : reconcileSlots({ ...structuredClone(design), sizeId }, photos.length);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  return renderCover(canvas, sized, photos);
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png');
  });
}

export function pngFileName(design, sizeId) {
  const size = findPostSize(sizeId);
  const slug = design.caption.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cover';
  return `${slug}-${size.width}x${size.height}.png`;
}

function saveBlobAsFile(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

/** One click from the editor: render at full size, encode and download. Resolves to the saved file's name. */
export async function exportCoverPng(design, photos, sizeId = design.sizeId) {
  const blob = await canvasToPngBlob(renderCoverAtPostSize(design, photos, sizeId));
  const name = pngFileName(design, sizeId);
  saveBlobAsFile(blob, name);
  return name;
}

/** Exports the same cover in all three post sizes, one PNG each. */
export async function exportAllPostSizes(design, photos) {
  const names = [];
  for (const size of POST_SIZES) names.push(await exportCoverPng(design, photos, size.id));
  return names;
}
