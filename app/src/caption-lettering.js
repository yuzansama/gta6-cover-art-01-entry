// Bold caption lettering for the cover: a big title with a block-shadow extrusion, a dark ink outline, a white
// keyline and a sunset gradient face, and a smaller tagline with a neon glow. The three fonts are open-licensed
// files under app/fonts (SIL Open Font License): Anton, Bangers and Pacifico.

import { rgbaFromHex } from './colour-grades.js';

export const LETTERING_STYLES = [
  { id: 'block', name: 'Block', titleFont: 'Anton', taglineFont: 'Pacifico', upper: true, slant: -0.12, leading: 1.02 },
  { id: 'comic', name: 'Comic', titleFont: 'Bangers', taglineFont: 'Bangers', upper: true, slant: -0.06, leading: 0.9 },
  { id: 'script', name: 'Script', titleFont: 'Pacifico', taglineFont: 'Anton', upper: false, slant: 0, leading: 1.08 },
];

const FONT_FILES = {
  Anton: 'fonts/Anton-Regular.ttf',
  Bangers: 'fonts/Bangers-Regular.ttf',
  Pacifico: 'fonts/Pacifico-Regular.ttf',
};

let fontsReady = null;

/** Loads the three caption fonts from app/fonts so the canvas can draw with them. */
export function loadCaptionFonts() {
  if (!fontsReady) {
    fontsReady = Promise.all(
      Object.entries(FONT_FILES).map(async ([family, file]) => {
        const face = new FontFace(family, `url(${new URL(`../${file}`, import.meta.url).href})`);
        document.fonts.add(await face.load());
      }),
    ).catch(() => undefined);
  }
  return fontsReady;
}

export function findLetteringStyle(id) {
  return LETTERING_STYLES.find((style) => style.id === id) ?? LETTERING_STYLES[0];
}

/** Breaks a long title into two balanced lines at a space; short titles stay on one line. */
export function splitTitleIntoLines(title) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || title.trim().length <= 9) return [words.join(' ')];
  let best = [words.join(' ')];
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const first = words.slice(0, i).join(' ');
    const second = words.slice(i).join(' ');
    const widest = Math.max(first.length, second.length);
    if (widest < bestWidth) {
      bestWidth = widest;
      best = [first, second];
    }
  }
  return best;
}

function fitFontSize(ctx, lines, family, maxWidth, maxHeight, leading) {
  let size = maxHeight / (lines.length * leading);
  ctx.font = `${size}px "${family}"`;
  const widest = Math.max(...lines.map((line) => ctx.measureText(line).width), 1);
  if (widest > maxWidth) size *= maxWidth / widest;
  return size;
}

function titleFaceGradient(ctx, centreY, size, colours) {
  const face = ctx.createLinearGradient(0, centreY - size * 0.46, 0, centreY + size * 0.46);
  face.addColorStop(0, colours[0]);
  face.addColorStop(0.42, colours[1]);
  face.addColorStop(0.56, colours[2]);
  face.addColorStop(1, colours[3]);
  return face;
}

function drawTitleLines(ctx, lines, size, lineHeight, grade, unit) {
  const centres = lines.map((_, i) => (i - (lines.length - 1) / 2) * lineHeight);
  const each = (draw) => lines.forEach((line, i) => draw(line, centres[i]));
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  // Block shadow: the outlined word repeated down and to the right.
  const depth = Math.max(3, Math.round(size * 0.085));
  ctx.strokeStyle = grade.ink;
  ctx.fillStyle = grade.ink;
  ctx.lineWidth = size * 0.17;
  for (let step = depth; step >= 1; step -= Math.max(1, Math.floor(depth / 6))) {
    each((line, y) => {
      ctx.strokeText(line, step * 0.85, y + step);
      ctx.fillText(line, step * 0.85, y + step);
    });
  }

  // A coloured rim glow behind the outline lifts the caption off busy panels.
  ctx.save();
  ctx.shadowColor = rgbaFromHex(grade.script, 0.9);
  ctx.shadowBlur = unit * 0.03;
  each((line, y) => ctx.strokeText(line, 0, y));
  ctx.restore();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.075;
  each((line, y) => ctx.strokeText(line, 0, y));

  ctx.strokeStyle = grade.ink;
  ctx.lineWidth = size * 0.03;
  each((line, y) => {
    ctx.strokeText(line, 0, y);
    ctx.fillStyle = titleFaceGradient(ctx, y, size, grade.lettering);
    ctx.fillText(line, 0, y);
  });
}

function drawTagline(ctx, tagline, family, size, y, grade, unit, upper) {
  const text = upper ? tagline.toUpperCase() : tagline;
  ctx.font = `${size}px "${family}"`;
  ctx.lineJoin = 'round';
  if (upper) {
    // A slanted ribbon with the tagline knocked out in light type.
    const width = ctx.measureText(text).width + size * 1.1;
    const height = size * 1.45;
    ctx.fillStyle = grade.ink;
    ctx.beginPath();
    ctx.moveTo(-width / 2 + height * 0.25, y - height / 2);
    ctx.lineTo(width / 2 + height * 0.25, y - height / 2);
    ctx.lineTo(width / 2 - height * 0.25, y + height / 2);
    ctx.lineTo(-width / 2 - height * 0.25, y + height / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = grade.script;
    ctx.lineWidth = Math.max(2, unit * 0.004);
    ctx.stroke();
    ctx.fillStyle = grade.lettering[0];
    ctx.fillText(text, 0, y + size * 0.04);
    return;
  }
  ctx.strokeStyle = grade.ink;
  ctx.lineWidth = size * 0.3;
  ctx.strokeText(text, 0, y);
  ctx.save();
  ctx.shadowColor = grade.script;
  ctx.shadowBlur = unit * 0.025;
  ctx.fillStyle = grade.script;
  ctx.fillText(text, 0, y);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.82;
  ctx.fillText(text, 0, y);
  ctx.globalAlpha = 1;
}

/**
 * Draws the caption (title and optional tagline) on a cover of width x height pixels. `spot` comes from the panel
 * layout: the centre (x, y) and the room (maxW, maxH) as fractions of the cover, and the slope the lettering leans at.
 */
export function drawCaptionLettering(ctx, width, height, spot, caption, grade, styleId) {
  const style = findLetteringStyle(styleId);
  const rawTitle = caption.title.trim();
  const tagline = caption.tagline.trim();
  if (!rawTitle && !tagline) return;
  const unit = Math.min(width, height);
  const lines = splitTitleIntoLines(style.upper ? rawTitle.toUpperCase() : rawTitle);
  const hasTitle = lines[0].length > 0;
  const roomH = spot.maxH * height * (tagline && hasTitle ? 0.78 : 1);
  const size = hasTitle ? fitFontSize(ctx, lines, style.titleFont, spot.maxW * width * 0.94, roomH, style.leading) : unit * 0.12;
  const lineHeight = size * style.leading;
  const blockHeight = hasTitle ? lines.length * lineHeight : 0;

  ctx.save();
  ctx.translate(spot.x * width, spot.y * height);
  ctx.rotate(Math.atan2(spot.slope * height, width));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const taglineSize = Math.min(size * 0.4, unit * 0.075);
  const taglineY = blockHeight / 2 + taglineSize * (style.upper ? 0.5 : 0.95);
  const lift = tagline && hasTitle ? taglineSize * 0.55 : 0;

  if (hasTitle) {
    ctx.save();
    ctx.translate(0, -lift);
    ctx.transform(1, 0, style.slant, 1, 0, 0);
    ctx.font = `${size}px "${style.titleFont}"`;
    drawTitleLines(ctx, lines, size, lineHeight, grade, unit);
    ctx.restore();
  }
  if (tagline) {
    const fitted = fitTaglineSize(ctx, tagline, style, taglineSize, spot.maxW * width * 0.8);
    drawTagline(ctx, tagline, style.taglineFont, fitted, hasTitle ? taglineY - lift : 0, grade, unit, !style.upper);
  }
  ctx.restore();
}

function fitTaglineSize(ctx, tagline, style, size, maxWidth) {
  ctx.font = `${size}px "${style.taglineFont}"`;
  const measured = ctx.measureText(style.upper ? tagline : tagline.toUpperCase()).width;
  return measured > maxWidth ? (size * maxWidth) / measured : size;
}
