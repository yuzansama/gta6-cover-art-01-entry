// Fixed designs for the screenshots in screenshots/. `?shot=cover&scene=<name>` shows the cover alone, drawn by the
// app at the window's size; `?shot=editor&scene=<name>` shows the whole editor with that design loaded. Both use the
// two sample photos under app/samples (photo 0 is the boulevard, photo 1 the pier), cropped as a person would by
// dragging. The editor sets window.__shotReady once the scene is painted.

const photo = (index, fx, fy, zoom = 1, flip = false) => ({ kind: 'photo', photo: index, crop: { fx, fy, zoom, flip } });
const scene = (id) => ({ kind: 'scene', scene: id });

const SCREENSHOT_SCENES = {
  'neon-coast-landscape': {
    selectedPanel: 0,
    design: {
      sizeId: 'landscape',
      layoutId: 'mosaic',
      gradeId: 'sunset',
      letteringStyle: 'block',
      caption: { title: 'Neon Coast', tagline: 'Summer never ends' },
      slots: [
        photo(0, 0.55, 0.3, 1.05), photo(1, 0.42, 0.27, 1.2), photo(0, 0.14, 0.2, 1.9),
        photo(1, 0.45, 0.4, 1), photo(0, 0.2, 0.74, 1.7), photo(1, 0.8, 0.68, 2.2),
      ],
    },
  },
  'boulevard-queen-portrait': {
    selectedPanel: 1,
    design: {
      sizeId: 'portrait',
      layoutId: 'slash',
      gradeId: 'neon',
      letteringStyle: 'comic',
      caption: { title: 'Boulevard Queen', tagline: 'Vice nights' },
      slots: [photo(0, 0.58, 0.2, 2), scene('highway'), photo(1, 0.42, 0.27, 1.5), photo(0, 0.5, 0.45, 1), photo(1, 0.6, 0.5, 1)],
    },
  },
  'pier-pressure-square': {
    selectedPanel: 0,
    design: {
      sizeId: 'square',
      layoutId: 'hero',
      gradeId: 'miami',
      letteringStyle: 'block',
      caption: { title: 'Pier Pressure', tagline: 'Gone fishing' },
      slots: [photo(1, 0.45, 0.3, 1), photo(0, 0.58, 0.2, 2.2), scene('palms'), photo(1, 0.8, 0.68, 2.4)],
    },
  },
  'editor-midnight-run': {
    selectedPanel: 0,
    design: {
      sizeId: 'landscape',
      layoutId: 'hero',
      gradeId: 'neon',
      letteringStyle: 'block',
      caption: { title: 'Midnight Run', tagline: 'Ocean drive' },
      slots: [photo(0, 0.5, 0.32, 1), photo(1, 0.42, 0.27, 1.6), scene('skyline'), photo(0, 0.2, 0.74, 1.8)],
    },
  },
};

/** Copies the named scene's design onto the editor's design and returns the panel to show as selected. */
export function applyScreenshotScene(name, design) {
  const chosen = SCREENSHOT_SCENES[name] ?? SCREENSHOT_SCENES['neon-coast-landscape'];
  Object.assign(design, structuredClone(chosen.design));
  return chosen.selectedPanel;
}
