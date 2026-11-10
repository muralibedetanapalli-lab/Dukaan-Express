// Renders the source artwork for each app into <app>/assets/, then `capacitor-assets` expands it
// into every Android density (adaptive icons, round icons, splash screens incl. dark mode).
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const BOLT = `<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>`;
// lucide "store" icon
const STORE = `<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>`;

const APPS = [
  { dir: "customer", glyph: BOLT, from: "#22c55e", to: "#15803d", dark: "#0f3d24", fill: true },
  { dir: "shop", glyph: STORE, from: "#15803d", to: "#0f3d24", dark: "#08241a", fill: false },
];

// glyph drawn in a 24x24 box, scaled to `size` and centred in a `canvas` square
const glyphSvg = (glyph, fill, canvas, size) => {
  const off = (canvas - size) / 2;
  const s = size / 24;
  const style = fill
    ? `fill="#ffffff" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round"`
    : `fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  return `<g transform="translate(${off} ${off}) scale(${s})" ${style}>${glyph}</g>`;
};

const bg = (canvas, from, to) =>
  `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="${canvas}" height="${canvas}" fill="url(#g)"/>`;

const svg = (canvas, inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">${inner}</svg>`);

for (const a of APPS) {
  const out = `${a.dir}/assets`;
  mkdirSync(out, { recursive: true });
  // Legacy/full icon: gradient + glyph
  await sharp(svg(1024, bg(1024, a.from, a.to) + glyphSvg(a.glyph, a.fill, 1024, 560))).png().toFile(`${out}/icon-only.png`);
  // Adaptive icon layers: glyph must sit inside the central ~66% safe zone
  await sharp(svg(1024, glyphSvg(a.glyph, a.fill, 1024, 440))).png().toFile(`${out}/icon-foreground.png`);
  await sharp(svg(1024, bg(1024, a.from, a.to))).png().toFile(`${out}/icon-background.png`);
  // Splash (light & dark)
  await sharp(svg(2732, bg(2732, a.from, a.to) + glyphSvg(a.glyph, a.fill, 2732, 520))).png().toFile(`${out}/splash.png`);
  await sharp(svg(2732, bg(2732, a.dark, a.dark) + glyphSvg(a.glyph, a.fill, 2732, 520))).png().toFile(`${out}/splash-dark.png`);
  console.log(`assets rendered for ${a.dir}`);
}
