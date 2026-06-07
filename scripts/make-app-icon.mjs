import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const src =
  process.argv[2] ||
  path.join(
    process.env.USERPROFILE || '',
    '.cursor/projects/c-Users-mashi-Desktop-rim-launcher/assets/c__Users_mashi_AppData_Roaming_Cursor_User_workspaceStorage_694f983ec4e10539026b2320b679904a_images_ChatGPT_Image_6____._2026__.__02_45_54__1_-c736016a-8785-4542-b5ed-096b454de389.png'
  );

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

await sharp(rounded).png().toFile(path.join(buildDir, 'icon.png'));
await sharp(rounded).resize(256, 256).png().toFile(path.join(publicDir, 'logo.png'));
await sharp(rounded).resize(256, 256).toFile(path.join(buildDir, 'icon.ico'));

console.log('Icons written to build/icon.png, build/icon.ico, public/assets/logo.png');
