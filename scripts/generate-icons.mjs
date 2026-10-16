// Draws every icon and launch image the PWA needs: an F and a period in Sofia Sans Semi Condensed
// Light, ink on true black, nothing else. forge-mark.png is that pair of glyphs rendered from the
// font at weight 300 and cropped to its bounds, so this script needs no font tooling.
// Run with `npm run icons`. Output is committed; this only re-runs when the mark changes.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GROUND = "#000000";
const MARK = await readFile(path.join(root, "scripts/forge-mark.png"));
// Width over height of forge-mark.png.
const ASPECT = 813 / 1332;

async function tile({ w, h, markHeight }) {
  const mh = Math.round(markHeight);
  const mw = Math.round(mh * ASPECT);
  const glyph = await sharp(MARK).resize({ width: mw, height: mh, kernel: "lanczos3" }).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 3, background: GROUND } })
    .composite([{ input: glyph, left: Math.round((w - mw) / 2), top: Math.round((h - mh) / 2) }])
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function png(file, buffer) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buffer);
  console.log(path.relative(root, file), `${(buffer.length / 1024).toFixed(1)} KB`);
}

const square = (size, heightRatio) => tile({ w: size, h: size, markHeight: size * heightRatio });

// Purpose "any" icons fill most of the tile; maskable keeps everything inside the safe circle.
await png(path.join(root, "public/icons/icon-192.png"), await square(192, 0.6));
await png(path.join(root, "public/icons/icon-512.png"), await square(512, 0.6));
await png(path.join(root, "public/icons/icon-maskable-512.png"), await square(512, 0.46));
await png(path.join(root, "src/app/apple-icon.png"), await square(180, 0.6));
await png(path.join(root, "src/app/icon.png"), await square(96, 0.7));

// Current iPhone portrait launch images: [css width, css height, pixel ratio].
const SPLASH = [
  [440, 956, 3],
  [420, 912, 3],
  [402, 874, 3],
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [414, 896, 2],
  [375, 667, 2],
];

// The launch image shows the mark at the size the in-app loading screen draws it (an 80px tall
// F. in CSS pixels), so the handover from one to the other does not jump.
const SPLASH_MARK_CSS_HEIGHT = 80;

for (const [w, h, ratio] of SPLASH) {
  const canvas = { w: w * ratio, h: h * ratio };
  await png(
    path.join(root, `public/splash/splash-${canvas.w}x${canvas.h}.png`),
    await tile({ ...canvas, markHeight: SPLASH_MARK_CSS_HEIGHT * ratio }),
  );
}

// Printed so layout.tsx can be checked against the files that exist.
console.log(JSON.stringify(SPLASH));
