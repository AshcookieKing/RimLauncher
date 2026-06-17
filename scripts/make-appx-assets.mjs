import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'build', 'icon.png');
const outDir = path.join(root, 'build', 'appx');

if (!fs.existsSync(src)) {
  console.error('Сначала создайте build/icon.png (npm run icon)');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const assets = [
  ['StoreLogo.png', 50, 50],
  ['Square44x44Logo.png', 44, 44],
  ['Square150x150Logo.png', 150, 150],
  ['Wide310x150Logo.png', 310, 150],
  ['LargeTile.png', 310, 310],
  ['SmallTile.png', 71, 71],
  ['SplashScreen.png', 620, 300],
  ['BadgeLogo.png', 24, 24],
];

for (const [name, w, h] of assets) {
  await sharp(src)
    .resize(w, h, { fit: 'contain', background: { r: 2, g: 8, b: 16, alpha: 1 } })
    .png()
    .toFile(path.join(outDir, name));
}

console.log(`AppX assets written to ${outDir}`);
