import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const releaseDir = path.join(root, 'release');

function sha512(filePath) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64');
}

const exeName = 'RimConflictLauncher.exe';
const zipName = `RimConflictLauncher-${version}.zip`;
const exePath = path.join(releaseDir, exeName);
const zipPath = path.join(releaseDir, zipName);

if (!fs.existsSync(exePath)) {
  console.error(`EXE not found: ${exePath}`);
  process.exit(1);
}

const files = [
  {
    url: exeName,
    sha512: sha512(exePath),
    size: fs.statSync(exePath).size,
  },
];

if (fs.existsSync(zipPath)) {
  files.push({
    url: zipName,
    sha512: sha512(zipPath),
    size: fs.statSync(zipPath).size,
  });
}

const yml = [
  `version: ${version}`,
  `releaseDate: '${new Date().toISOString()}'`,
  'files:',
  ...files.flatMap((f) => [
    `  - url: ${f.url}`,
    `    sha512: ${f.sha512}`,
    `    size: ${f.size}`,
  ]),
  '',
].join('\n');

const outPath = path.join(releaseDir, 'latest.yml');
fs.writeFileSync(outPath, yml, 'utf8');
console.log(`Wrote ${outPath}`);
console.log(yml);
