// Renders a cover design onto a canvas at the canvas's own size. The live preview and the PNG export both call
// renderCover, the preview on a small canvas and the export on one of the full post size, so what is exported is
// what was previewed.

import { paintBackdropScene } from './backdrop-scenes.js';
import { drawCaptionLettering } from './caption-lettering.js';
import { findColourGrade, gradeForPanel, rgbaFromHex } from './colour-grades.js';
import { illustratePhotoCrop } from './illustrated-photo-filter.js';
import { buildPanelLayout, polygonBounds, scalePolygon, tracePolygonPath } from './panel-layouts.js';

/** The panel polygons of a design in canvas pixels, for drawing and for picking the panel under the pointer. */
export function panelPolygonsInPixels(design, width, height) {
  const layout = buildPanelLayout(design.layoutId, width / height);
  return layout.panels.map((panel) => scalePolygon(panel, width, height));
}

/**
 * Evening light for a photo panel: the sky colour washes down from the top (multiplied, so a pale daytime sky turns
 * sunset or neon), a deep shade gathers at the foot, and a soft glow lifts the middle.
 */
function paintPanelLighting(ctx, box, grade) {
  const sky = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
  sky.addColorStop(0, rgbaFromHex(grade.sky, 0.7));
  sky.addColorStop(0.3, rgbaFromHex(grade.sky, 0.3));
  sky.addColorStop(0.6, rgbaFromHex(grade.sky, 0));
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = sky;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  const shade = ctx.createLinearGradient(0, box.y + box.h * 0.5, 0, box.y + box.h);
  shade.addColorStop(0, rgbaFromHex(grade.shade, 0));
  shade.addColorStop(1, rgbaFromHex(grade.shade, 0.7));
  ctx.fillStyle = shade;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  const glow = ctx.createRadialGradient(box.x + box.w * 0.5, box.y + box.h * 0.42, 0, box.x + box.w * 0.5, box.y + box.h * 0.42, Math.max(box.w, box.h) * 0.6);
  glow.addColorStop(0, rgbaFromHex(grade.glow, 0.2));
  glow.addColorStop(1, rgbaFromHex(grade.glow, 0));
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = glow;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.globalCompositeOperation = 'source-over';
}

function paintPhotoPanel(ctx, points, slot, photo, grade, look, unit) {
  const box = polygonBounds(points);
  ctx.save();
  tracePolygonPath(ctx, points);
  ctx.clip();
  ctx.drawImage(illustratePhotoCrop(photo, slot.crop, box.w, box.h, grade, look, unit), box.x, box.y);
  paintPanelLighting(ctx, box, grade);
  ctx.restore();
}

function paintScenePanel(ctx, points, sceneId, grade, seed) {
  const box = polygonBounds(points);
  ctx.save();
  tracePolygonPath(ctx, points);
  ctx.clip();
  paintBackdropScene(ctx, sceneId, box.x, box.y, box.w, box.h, grade, seed);
  ctx.restore();
}

/** Dark ink gutters between the panels with a thin light keyline, and a frame around the whole cover. */
function paintGuttersAndFrame(ctx, polygons, width, height, grade, unit) {
  const gutter = unit * 0.014;
  ctx.lineJoin = 'miter';
  for (const [colour, weight] of [[grade.ink, gutter], [rgbaFromHex(grade.lettering[0], 0.9), gutter * 0.16]]) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = weight;
    for (const points of polygons) {
      tracePolygonPath(ctx, points);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = grade.ink;
  ctx.lineWidth = gutter * 2;
  ctx.strokeRect(0, 0, width, height);
}

/**
 * Draws the whole cover: every panel, the title plate, the gutters and frame, then the caption lettering.
 * `photos` is the editor's photo list ({ id, image }); a panel whose photo is missing falls back to a scene.
 */
export function renderCover(canvas, design, photos) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const unit = Math.min(width, height);
  const layout = buildPanelLayout(design.layoutId, width / height);
  const baseGrade = findColourGrade(design.gradeId);
  const polygons = layout.panels.map((panel) => scalePolygon(panel, width, height));

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = baseGrade.ink;
  ctx.fillRect(0, 0, width, height);

  polygons.forEach((points, i) => {
    const slot = design.slots[i];
    const grade = gradeForPanel(design.gradeId, i, design.perPanelMix);
    const photo = slot && slot.kind === 'photo' ? photos[slot.photo] : null;
    if (photo) paintPhotoPanel(ctx, points, slot, photo, grade, design.look, unit);
    else paintScenePanel(ctx, points, slot && slot.kind === 'scene' ? slot.scene : 'palms', grade, i + 1);
  });

  const outlines = [...polygons];
  if (layout.titlePlate) {
    const plate = scalePolygon(layout.titlePlate, width, height);
    paintScenePanel(ctx, plate, 'palms', baseGrade, 0);
    outlines.push(plate);
  }
  paintGuttersAndFrame(ctx, outlines, width, height, baseGrade, unit);
  drawCaptionLettering(ctx, width, height, layout.caption, design.caption, baseGrade, design.letteringStyle);
  return canvas;
}
