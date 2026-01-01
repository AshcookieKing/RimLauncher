import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'logo_sff (1).png');

const buildDir = path.join(root, 'build');
const publicDir = path.join(root, 'public', 'assets');
fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });

const size = 512;
const radius = Math.round(size * 0.18);
const mask = Buffer.from(
  `<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/></svg>`
);

const rounded = await sharp(src)
  .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer();

// UI logo: keep original circular PNG (no extra effects)
await sharp(src)
  .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
  .png()
  .toFile(path.join(publicDir, 'logo.png'));

await sharp(rounded).png().toFile(path.join(buildDir, 'icon.png'));
await sharp(rounded).resize(256, 256).toFile(path.join(buildDir, 'icon.ico'));

console.log('Icons written to build/icon.png, build/icon.ico, public/assets/logo.png');
