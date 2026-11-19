// Original vector backdrops, drawn with canvas paths and no image files: a striped sunset sun over the sea with palm
// silhouettes, a neon skyline at night and a coast highway running to the horizon. They fill the title plate and any
// panel that has no photo, so a cover made from one photo still looks like a full poster.

import { rgbaFromHex } from './colour-grades.js';

export const BACKDROP_SCENES = [
  { id: 'palms', name: 'Sunset palms' },
  { id: 'skyline', name: 'Neon skyline' },
  { id: 'highway', name: 'Coast highway' },
];

/** A small seeded random number generator, so a scene is the same every time it is drawn. */
export function seededRandom(seed) {
  let state = (seed >>> 0) + 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function skyGradient(ctx, x, y, h, grade) {
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, grade.ramp[0]);
  sky.addColorStop(0.35, grade.ramp[1]);
  sky.addColorStop(0.7, grade.ramp[2]);
  sky.addColorStop(1, grade.ramp[3]);
  return sky;
}

/** The retro sun: a glowing disc whose lower half is cut by widening stripes of sky. */
export function paintStripedSun(ctx, cx, cy, radius, grade, sky) {
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius * 2.4);
  halo.addColorStop(0, rgbaFromHex(grade.glow, 0.55));
  halo.addColorStop(1, rgbaFromHex(grade.glow, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(cx - radius * 2.4, cy - radius * 2.4, radius * 4.8, radius * 4.8);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  const disc = ctx.createLinearGradient(0, cy - radius, 0, cy + radius);
  disc.addColorStop(0, grade.ramp[4]);
  disc.addColorStop(0.45, grade.lettering[1]);
  disc.addColorStop(1, grade.ramp[2]);
  ctx.fillStyle = disc;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.fillStyle = sky;
  for (let i = 0; i < 6; i += 1) {
    const stripeY = cy + radius * (0.08 + i * 0.16);
    ctx.fillRect(cx - radius, stripeY, radius * 2, radius * (0.035 + i * 0.016));
  }
  ctx.restore();
}

/** One palm in silhouette: a leaning tapered trunk and a crown of drooping feathered fronds. */
export function paintPalmSilhouette(ctx, baseX, baseY, height, lean, colour, random) {
  const topX = baseX + lean * height;
  const topY = baseY - height;
  const bendX = baseX + lean * height * 0.2;
  const bendY = baseY - height * 0.55;
  const trunk = height * 0.035;
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.beginPath();
  ctx.moveTo(baseX - trunk, baseY);
  ctx.quadraticCurveTo(bendX - trunk * 0.8, bendY, topX - trunk * 0.4, topY);
  ctx.lineTo(topX + trunk * 0.4, topY);
  ctx.quadraticCurveTo(bendX + trunk * 0.8, bendY, baseX + trunk, baseY);
  ctx.closePath();
  ctx.fill();

  const fronds = 9;
  ctx.lineCap = 'round';
  for (let i = 0; i < fronds; i += 1) {
    const angle = -Math.PI * (0.02 + (i / (fronds - 1)) * 0.96) + (random() - 0.5) * 0.18;
    const length = height * (0.34 + random() * 0.1);
    const tipX = topX + Math.cos(angle) * length;
    const tipY = topY + Math.sin(angle) * length * 0.55 + length * 0.42;
    const midX = topX + Math.cos(angle) * length * 0.55;
    const midY = topY + Math.sin(angle) * length * 0.75;
    ctx.lineWidth = height * 0.012;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY);
    ctx.stroke();
    // Leaflets on both sides of the spine, swept back toward the trunk and pulled down by their own weight.
    ctx.lineWidth = height * 0.006;
    ctx.beginPath();
    for (let s = 1; s <= 18; s += 1) {
      const t = s / 18;
      const u = 1 - t;
      const px = u * u * topX + 2 * u * t * midX + t * t * tipX;
      const py = u * u * topY + 2 * u * t * midY + t * t * tipY;
      const tangentX = 2 * u * (midX - topX) + 2 * t * (tipX - midX);
      const tangentY = 2 * u * (midY - topY) + 2 * t * (tipY - midY);
      const norm = Math.hypot(tangentX, tangentY) || 1;
      const leaf = length * 0.2 * Math.sin(Math.PI * Math.min(1, t * 1.08)) ** 0.7 + length * 0.02;
      for (const side of [-1, 1]) {
        ctx.moveTo(px, py);
        ctx.lineTo(
          px + ((-tangentY * side) / norm) * leaf * 0.75 - (tangentX / norm) * leaf * 0.45,
          py + ((tangentX * side) / norm) * leaf * 0.75 - (tangentY / norm) * leaf * 0.45 + leaf * 0.5,
        );
      }
    }
    ctx.stroke();
  }
}

function paintSeaWithReflections(ctx, x, horizonY, w, bottomY, grade, random) {
  const sea = ctx.createLinearGradient(0, horizonY, 0, bottomY);
  sea.addColorStop(0, grade.ramp[2]);
  sea.addColorStop(0.5, grade.ramp[1]);
  sea.addColorStop(1, grade.ramp[0]);
  ctx.fillStyle = sea;
  ctx.fillRect(x, horizonY, w, bottomY - horizonY);
  ctx.fillStyle = rgbaFromHex(grade.ramp[4], 0.55);
  const depth = bottomY - horizonY;
  for (let i = 0; i < 26; i += 1) {
    const t = random();
    const lineW = w * (0.04 + random() * 0.16) * (0.4 + t);
    const lx = x + w * 0.5 + (random() - 0.5) * w * (0.25 + t * 0.6) - lineW / 2;
    ctx.fillRect(lx, horizonY + depth * t * t + depth * 0.02, lineW, Math.max(1, depth * 0.012));
  }
}

function paintSunsetPalms(ctx, x, y, w, h, grade, random) {
  const sky = skyGradient(ctx, x, y, h * 0.72, grade);
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  const horizonY = y + h * 0.7;
  paintStripedSun(ctx, x + w * 0.5, horizonY - h * 0.16, Math.min(w, h) * 0.3, grade, sky);
  paintSeaWithReflections(ctx, x, horizonY, w, y + h, grade, random);
  const size = Math.max(h * 0.8, w * 0.4);
  paintPalmSilhouette(ctx, x + w * 0.12, y + h * 1.02, size, 0.12, grade.ink, random);
  paintPalmSilhouette(ctx, x + w * 0.9, y + h * 1.02, size * 0.82, -0.14, grade.ink, random);
  paintPalmSilhouette(ctx, x + w * 0.76, y + h * 1.02, size * 0.56, 0.08, grade.ink, random);
}

function paintNeonSkyline(ctx, x, y, w, h, grade, random) {
  const sky = skyGradient(ctx, x, y, h * 0.9, grade);
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  const groundY = y + h * 0.8;
  paintStripedSun(ctx, x + w * 0.68, groundY - h * 0.2, Math.min(w, h) * 0.26, grade, sky);
  const unit = Math.min(w, h);
  for (let layer = 0; layer < 2; layer += 1) {
    let cursor = x - unit * 0.05;
    while (cursor < x + w) {
      const towerW = unit * (0.09 + random() * 0.1);
      const towerH = h * (layer ? 0.18 + random() * 0.34 : 0.3 + random() * 0.36);
      const top = groundY - towerH;
      ctx.fillStyle = layer ? grade.ink : grade.shade;
      ctx.fillRect(cursor, top, towerW, towerH + h);
      const cell = unit * 0.022;
      for (let wy = top + cell; wy < groundY - cell; wy += cell * 1.7) {
        for (let wx = cursor + cell * 0.7; wx < cursor + towerW - cell; wx += cell * 1.5) {
          const lit = random();
          if (lit > 0.58) {
            ctx.fillStyle = lit > 0.82 ? grade.script : rgbaFromHex(grade.glow, 0.9);
            ctx.fillRect(wx, wy, cell * 0.7, cell * 0.9);
          }
        }
      }
      cursor += towerW + unit * random() * 0.03;
    }
  }
  ctx.fillStyle = grade.ink;
  ctx.fillRect(x, groundY, w, h);
  paintPalmSilhouette(ctx, x + w * 0.14, y + h * 1.02, h * 0.74, 0.1, grade.ink, random);
}

function paintCoastHighway(ctx, x, y, w, h, grade, random) {
  const sky = skyGradient(ctx, x, y, h * 0.62, grade);
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  const horizonY = y + h * 0.6;
  const vanishX = x + w * 0.5;
  paintStripedSun(ctx, vanishX, horizonY - h * 0.1, Math.min(w, h) * 0.27, grade, sky);
  const ground = ctx.createLinearGradient(0, horizonY, 0, y + h);
  ground.addColorStop(0, grade.shade);
  ground.addColorStop(1, grade.ink);
  ctx.fillStyle = ground;
  ctx.fillRect(x, horizonY, w, h);
  ctx.fillStyle = grade.ramp[0];
  ctx.beginPath();
  ctx.moveTo(vanishX - w * 0.012, horizonY);
  ctx.lineTo(vanishX + w * 0.012, horizonY);
  ctx.lineTo(x + w * 0.92, y + h);
  ctx.lineTo(x + w * 0.08, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = grade.lettering[1];
  for (let i = 0; i < 7; i += 1) {
    const near = ((i + 0.2) / 7) ** 2.2;
    const far = ((i + 0.62) / 7) ** 2.2;
    const y0 = horizonY + (y + h - horizonY) * near;
    const y1 = horizonY + (y + h - horizonY) * far;
    const half0 = w * 0.002 + w * 0.014 * near;
    const half1 = w * 0.002 + w * 0.014 * far;
    ctx.beginPath();
    ctx.moveTo(vanishX - half0, y0);
    ctx.lineTo(vanishX + half0, y0);
    ctx.lineTo(vanishX + half1, y1);
    ctx.lineTo(vanishX - half1, y1);
    ctx.closePath();
    ctx.fill();
  }
  // Palms line both verges, smaller toward the horizon and always clear of the sun.
  for (let i = 2; i >= 0; i -= 1) {
    const depth = 1 - i * 0.33;
    const palmH = Math.min(h * 0.62, w * 0.7) * depth;
    const baseY = horizonY + (y + h - horizonY) * depth * depth * 0.9 + h * 0.02;
    const offset = w * (0.2 + 0.26 * depth);
    paintPalmSilhouette(ctx, vanishX - offset, baseY, palmH, -0.08, grade.ink, random);
    paintPalmSilhouette(ctx, vanishX + offset, baseY, palmH, 0.08, grade.ink, random);
  }
}

/** Paints the named scene into the box (x, y, w, h); the caller clips to the panel. */
export function paintBackdropScene(ctx, sceneId, x, y, w, h, grade, seed) {
  const random = seededRandom(seed * 7919 + 13);
  ctx.save();
  if (sceneId === 'skyline') paintNeonSkyline(ctx, x, y, w, h, grade, random);
  else if (sceneId === 'highway') paintCoastHighway(ctx, x, y, w, h, grade, random);
  else paintSunsetPalms(ctx, x, y, w, h, grade, random);
  ctx.restore();
}
