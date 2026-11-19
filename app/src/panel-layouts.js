// Multi-panel poster layouts. Every layout is a list of panel polygons on a unit square (0..1 in x and y) that is
// stretched to the post size, plus where the caption lettering sits. Some layouts change with the aspect ratio so a
// 1080 x 1350 portrait, a 1080 x 1080 square and a 1920 x 1080 landscape each get panels that suit them.

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const grid12 = (c0, r0, c1, r1) => rect(c0 / 12, r0 / 12, c1 / 12, r1 / 12);

/** Classic mosaic: six photo panels around a centre title plate. */
function mosaicLayout(aspect) {
  if (aspect > 1.2) {
    return {
      panels: [
        grid12(0, 0, 3.7, 7), grid12(3.7, 0, 8.3, 3.3), grid12(8.3, 0, 12, 5),
        grid12(8.3, 5, 12, 12), grid12(0, 7, 3.7, 12), grid12(3.7, 8.7, 8.3, 12),
      ],
      titlePlate: grid12(3.7, 3.3, 8.3, 8.7),
      caption: { x: 0.5, y: 0.5, maxW: 0.6, maxH: 0.44, slope: -0.05 },
    };
  }
  return {
    panels: [
      grid12(0, 0, 5, 4.2), grid12(5, 0, 12, 4.2), grid12(0, 4.2, 3, 7.8),
      grid12(9, 4.2, 12, 7.8), grid12(0, 7.8, 7, 12), grid12(7, 7.8, 12, 12),
    ],
    titlePlate: grid12(3, 4.2, 9, 7.8),
    caption: { x: 0.5, y: 0.5, maxW: 0.78, maxH: 0.26, slope: -0.05 },
  };
}

/** Slash: five panels cut by diagonals, the caption riding the slanted divider. */
function slashLayout() {
  const divider = (x) => 0.6 - 0.1 * x;
  return {
    panels: [
      [[0, 0], [0.37, 0], [0.3, divider(0.3)], [0, divider(0)]],
      [[0.37, 0], [0.71, 0], [0.64, divider(0.64)], [0.3, divider(0.3)]],
      [[0.71, 0], [1, 0], [1, divider(1)], [0.64, divider(0.64)]],
      [[0, divider(0)], [0.48, divider(0.48)], [0.55, 1], [0, 1]],
      [[0.48, divider(0.48)], [1, divider(1)], [1, 1], [0.55, 1]],
    ],
    titlePlate: null,
    caption: { x: 0.5, y: 0.56, maxW: 0.9, maxH: 0.3, slope: -0.1 },
  };
}

/** Hero: one big photo with a strip of three small panels beside or beneath it. */
function heroLayout(aspect) {
  if (aspect > 1.2) {
    return {
      panels: [
        [[0, 0], [0.66, 0], [0.6, 1], [0, 1]],
        [[0.66, 0], [1, 0], [1, 0.3], [0.642, 0.36]],
        [[0.642, 0.36], [1, 0.3], [1, 0.66], [0.621, 0.7]],
        [[0.621, 0.7], [1, 0.66], [1, 1], [0.6, 1]],
      ],
      titlePlate: null,
      caption: { x: 0.34, y: 0.76, maxW: 0.6, maxH: 0.36, slope: -0.06 },
    };
  }
  return {
    panels: [
      [[0, 0], [1, 0], [1, 0.6], [0, 0.68]],
      [[0, 0.68], [0.36, 0.652], [0.31, 1], [0, 1]],
      [[0.36, 0.652], [0.7, 0.624], [0.66, 1], [0.31, 1]],
      [[0.7, 0.624], [1, 0.6], [1, 1], [0.66, 1]],
    ],
    titlePlate: null,
    caption: { x: 0.5, y: 0.6, maxW: 0.9, maxH: 0.26, slope: -0.08 },
  };
}

/** Triptych: three leaning columns with the caption across the foot. */
function triptychLayout() {
  return {
    panels: [
      [[0, 0], [0.38, 0], [0.29, 1], [0, 1]],
      [[0.38, 0], [0.72, 0], [0.63, 1], [0.29, 1]],
      [[0.72, 0], [1, 0], [1, 1], [0.63, 1]],
    ],
    titlePlate: null,
    caption: { x: 0.5, y: 0.78, maxW: 0.9, maxH: 0.3, slope: -0.05 },
  };
}

export const PANEL_LAYOUTS = [
  { id: 'mosaic', name: 'Mosaic', build: mosaicLayout },
  { id: 'slash', name: 'Slash', build: slashLayout },
  { id: 'hero', name: 'Hero', build: heroLayout },
  { id: 'triptych', name: 'Triptych', build: triptychLayout },
];

/** The layout's panels, title plate and caption spot for a post of the given width / height. */
export function buildPanelLayout(layoutId, aspect) {
  const layout = PANEL_LAYOUTS.find((candidate) => candidate.id === layoutId) ?? PANEL_LAYOUTS[0];
  return layout.build(aspect);
}

export function scalePolygon(polygon, width, height) {
  return polygon.map(([x, y]) => [x * width, y * height]);
}

export function polygonBounds(points) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1) - Math.floor(x0), h: Math.ceil(y1) - Math.floor(y0) };
}

export function tracePolygonPath(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Even-odd test: is the point inside the polygon? Used to pick the panel under the pointer. */
export function pointInPolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
