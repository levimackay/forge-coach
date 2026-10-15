// Rasterizes the FORGE mark into every icon and launch image the PWA needs.
// Run with `npm run icons`. Output is committed; this only re-runs when the mark changes.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GROUND = "#14110e";
const EMBER = "#ff6b2b";
const INK = "#f3ede4";

// The mark lives on a 64 unit grid: an anvil in ember and three strike sparks in ink.
const ANVIL =
  "M4 27.5L18 22H57V29.5H50.5C50.5 33.2 47.5 35.6 43.5 36.2V44.2L51 48.2V54.5H15V48.2L22.5 44.2V36.2C15 35.6 8.2 32 4 27.5Z";
const SPARKS = "M36.5 17.2L34.4 11.4M43.5 15.6V9.4M50.6 17.2L52.7 11.4";
// Bounding box of the mark on the grid, used to center it.
const BOX = { x: 4, y: 9.4, w: 53, h: 45.1 };

function markSvg({ canvas, widthRatio, shiftY = 0 }) {
  const scale = (canvas.w * widthRatio) / BOX.w;
  const tx = canvas.w / 2 - (BOX.x + BOX.w / 2) * scale;
  const ty = canvas.h / 2 - (BOX.y + BOX.h / 2) * scale + shiftY;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.w}" height="${canvas.h}" viewBox="0 0 ${canvas.w} ${canvas.h}">
  <rect width="100%" height="100%" fill="${GROUND}"/>
  <g transform="translate(${tx} ${ty}) scale(${scale})">
    <path d="${ANVIL}" fill="${EMBER}"/>
    <path d="${SPARKS}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  </g>
</svg>`;
}

async function png(file, svg) {
  await mkdir(path.dirname(file), { recursive: true });
  const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: false }).toBuffer();
  await writeFile(file, buffer);
  console.log(path.relative(root, file), `${(buffer.length / 1024).toFixed(1)} KB`);
}

const square = (size, widthRatio, shiftY = 0) =>
  markSvg({ canvas: { w: size, h: size }, widthRatio, shiftY });

// Purpose "any" icons fill most of the tile; maskable keeps everything inside the safe circle.
await png(path.join(root, "public/icons/icon-192.png"), square(192, 0.66));
await png(path.join(root, "public/icons/icon-512.png"), square(512, 0.66));
await png(path.join(root, "public/icons/icon-maskable-512.png"), square(512, 0.5));
await png(path.join(root, "src/app/apple-icon.png"), square(180, 0.66));
await png(path.join(root, "src/app/icon.png"), square(96, 0.72));

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

for (const [w, h, ratio] of SPLASH) {
  const canvas = { w: w * ratio, h: h * ratio };
  await png(
    path.join(root, `public/splash/splash-${canvas.w}x${canvas.h}.png`),
    markSvg({ canvas, widthRatio: 0.26 * (w / 390 > 1 ? 390 / w : 1) }),
  );
}

// Printed so layout.tsx can be checked against the files that exist.
console.log(JSON.stringify(SPLASH));
