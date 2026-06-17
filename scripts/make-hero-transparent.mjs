import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src =
  process.argv[2] ||
  path.join(
    root,
    '..',
    '..',
    '.cursor',
    'projects',
    'c-Users-mashi-Desktop-rim-launcher',
    'assets',
    'c__Users_mashi_AppData_Roaming_Cursor_User_workspaceStorage_694f983ec4e10539026b2320b679904a_images_ChatGPT_Image_26____._2026__.__19_43_33-3ef0972d-81f2-4e7e-baa3-f45cbebc23a4.png'
  );
const out = path.join(root, 'public', 'assets', 'hero.png');

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (r < 35 && g < 35 && b < 35) {
    data[i + 3] = 0;
  } else if (r < 55 && g < 55 && b < 55) {
    data[i + 3] = Math.min(data[i + 3], 80);
  }
}

await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png()
  .toFile(out);

console.log('Saved', out);
