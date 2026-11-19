// Crop and position maths for a photo inside a panel. A crop is { fx, fy, zoom, flip }: the point of the photo (0..1)
// held at the panel's centre, how far it is zoomed past "just covers the panel", and whether it is mirrored.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export function defaultCrop() {
  return { fx: 0.5, fy: 0.36, zoom: 1, flip: false };
}

/** Where the whole photo is drawn so it covers a box of boxW x boxH with the crop's focus point at the box centre. */
export function cropDrawRect(photoW, photoH, boxW, boxH, crop) {
  const scale = Math.max(boxW / photoW, boxH / photoH) * crop.zoom;
  const dw = photoW * scale;
  const dh = photoH * scale;
  const dx = Math.min(0, Math.max(boxW - dw, boxW / 2 - crop.fx * dw));
  const dy = Math.min(0, Math.max(boxH - dh, boxH / 2 - crop.fy * dh));
  return { dx, dy, dw, dh };
}

/** Keeps the focus point where the photo still covers the box, so panning stops at the photo's edges. */
export function clampCropToPhoto(crop, photoW, photoH, boxW, boxH) {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, crop.zoom));
  const scale = Math.max(boxW / photoW, boxH / photoH) * zoom;
  const halfX = boxW / 2 / (photoW * scale);
  const halfY = boxH / 2 / (photoH * scale);
  return {
    fx: Math.min(1 - halfX, Math.max(halfX, crop.fx)),
    fy: Math.min(1 - halfY, Math.max(halfY, crop.fy)),
    zoom,
    flip: crop.flip,
  };
}

/** Drag to position: moves the photo under the pointer by a pixel delta measured in the box's own pixels. */
export function panCropByPixels(crop, deltaX, deltaY, photoW, photoH, boxW, boxH) {
  const { dw, dh } = cropDrawRect(photoW, photoH, boxW, boxH, crop);
  return clampCropToPhoto({ ...crop, fx: crop.fx - deltaX / dw, fy: crop.fy - deltaY / dh }, photoW, photoH, boxW, boxH);
}

export function zoomCrop(crop, factor, photoW, photoH, boxW, boxH) {
  return clampCropToPhoto({ ...crop, zoom: crop.zoom * factor }, photoW, photoH, boxW, boxH);
}

/** Mirrors the photo and keeps the same subject centred. */
export function flipCrop(crop) {
  return { ...crop, flip: !crop.flip, fx: 1 - crop.fx };
}

/** Draws the cropped photo into ctx at (0, 0)..(boxW, boxH), offset by (offsetX, offsetY). */
export function drawCroppedPhoto(ctx, image, crop, boxW, boxH, offsetX = 0, offsetY = 0) {
  const { dx, dy, dw, dh } = cropDrawRect(image.width, image.height, boxW, boxH, crop);
  ctx.save();
  if (crop.flip) {
    ctx.translate(offsetX + dx + dw, offsetY + dy);
    ctx.scale(-1, 1);
    ctx.drawImage(image, 0, 0, dw, dh);
  } else {
    ctx.drawImage(image, offsetX + dx, offsetY + dy, dw, dh);
  }
  ctx.restore();
}
