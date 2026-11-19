// Sunset and neon colour grades. Each grade is a five-stop ramp from shadow to highlight that the photo filter maps
// luminance onto, plus the ink, glow, sky and lettering colours that keep panels, gutters and caption in one palette.

export const COLOUR_GRADES = [
  {
    id: 'sunset',
    name: 'Sunset',
    ramp: ['#170a35', '#5c1a6e', '#d93a6c', '#ff9547', '#ffe7a3'],
    ink: '#14062b',
    glow: '#ffb04a',
    sky: '#ff8f5a',
    shade: '#3a0f5c',
    lettering: ['#fff8bd', '#ffc23e', '#ff5a7e', '#c2189a'],
    script: '#ff4fa3',
  },
  {
    id: 'neon',
    name: 'Neon',
    ramp: ['#07051f', '#33158f', '#d726a3', '#3fd0ea', '#ecfffd'],
    ink: '#05031a',
    glow: '#ff3fc0',
    sky: '#ff62c6',
    shade: '#12086b',
    lettering: ['#f2fffd', '#56e4f2', '#a55cf5', '#ff2fa8'],
    script: '#3ff1ff',
  },
  {
    id: 'miami',
    name: 'Miami',
    ramp: ['#04202f', '#0d6f80', '#ee5f8f', '#ffc27a', '#fff6dc'],
    ink: '#03141f',
    glow: '#ffd08a',
    sky: '#ffa07a',
    shade: '#0a4a5e',
    lettering: ['#fffbe0', '#ffd166', '#ff7a8f', '#e0368a'],
    script: '#35e0d0',
  },
  {
    id: 'gold',
    name: 'Golden',
    ramp: ['#120d1f', '#4a2a4f', '#c2553c', '#f5b84e', '#fff2c9'],
    ink: '#0e0a18',
    glow: '#ffcf6b',
    sky: '#ffb45e',
    shade: '#4a1f3d',
    lettering: ['#fffbe6', '#ffd75a', '#ff8a3c', '#d1304f'],
    script: '#ffd75a',
  },
];

export function findColourGrade(id) {
  return COLOUR_GRADES.find((grade) => grade.id === id) ?? COLOUR_GRADES[0];
}

/** The grade a panel uses: the chosen one, or with the per-panel mix on, a neighbour so each panel has its own cast. */
export function gradeForPanel(gradeId, panelIndex, perPanelMix) {
  const base = COLOUR_GRADES.findIndex((grade) => grade.id === gradeId);
  const start = base < 0 ? 0 : base;
  if (!perPanelMix) return COLOUR_GRADES[start];
  const offsets = [0, 1, 0, 2, 0, 1, 2];
  return COLOUR_GRADES[(start + offsets[panelIndex % offsets.length]) % COLOUR_GRADES.length];
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbaFromHex(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const rampLookups = new Map();

/** A 256-entry RGB lookup table of the grade's ramp, luminance 0..255 to colour. */
export function buildGradeRampLookup(grade) {
  const cached = rampLookups.get(grade.id);
  if (cached) return cached;
  const stops = grade.ramp.map(hexToRgb);
  const lookup = new Uint8ClampedArray(256 * 3);
  const spans = stops.length - 1;
  for (let i = 0; i < 256; i += 1) {
    const t = (i / 255) * spans;
    const k = Math.min(spans - 1, Math.floor(t));
    const f = t - k;
    for (let c = 0; c < 3; c += 1) lookup[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f;
  }
  rampLookups.set(grade.id, lookup);
  return lookup;
}
