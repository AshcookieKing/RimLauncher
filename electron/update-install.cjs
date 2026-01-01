const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const USER_AGENT = 'StarFrontLauncher';

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;

    const request = (fetchUrl, redirects = 0) => {
      const req = lib.get(
        fetchUrl,
        { headers: { 'User-Agent': USER_AGENT } },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (redirects > 8) return reject(new Error('Слишком много перенаправлений'));
            const next = res.headers.location.startsWith('http')
              ? res.headers.location
              : new URL(res.headers.location, fetchUrl).href;
            res.resume();
            return request(next, redirects + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`Ошибка загрузки: HTTP ${res.statusCode}`));
          }

          const total = Number(res.headers['content-length'] || 0);
          let received = 0;
          const file = fs.createWriteStream(destPath);

          res.on('data', (chunk) => {
            received += chunk.length;
            onProgress?.({
              received,
              total,
              percent: total ? Math.min(100, Math.round((received / total) * 100)) : 0,
            });
          });

          res.on('error', (err) => {
            file.close(() => {
              fs.unlink(destPath, () => reject(err));
            });
          });

          file.on('error', (err) => {
            fs.unlink(destPath, () => reject(err));
          });

          file.on('finish', () => {
            file.close(() => resolve({ path: destPath, size: received }));
          });

          res.pipe(file);
        }
      );

      req.on('error', reject);
      req.setTimeout(600000, () => {
        req.destroy(new Error('Таймаут загрузки'));
      });
    };

    request(url);
  });
}

function verifySha512(filePath, expected) {
  if (!expected) return true;
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64') === expected;
}

function applyPortableUpdate(newExePath, currentExePath) {
  const scriptPath = path.join(os.tmpdir(), `rim-launcher-update-${Date.now()}.cmd`);
  const q = (value) => String(value || '').replace(/"/g, '""');
  const lines = [
    '@echo off',
    'ping 127.0.0.1 -n 3 > nul',
    `copy /Y "${q(newExePath)}" "${q(currentExePath)}" > nul`,
    `start "" "${q(currentExePath)}"`,
    `del /F /Q "${q(newExePath)}" > nul 2>&1`,
    'del /F /Q "%~f0" > nul 2>&1',
  ];
  fs.writeFileSync(scriptPath, lines.join('\r\n'), 'utf8');
  spawn('cmd.exe', ['/c', scriptPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
}

module.exports = {
  downloadFile,
  verifySha512,
  applyPortableUpdate,
};
