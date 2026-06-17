const https = require('https');
const { URL } = require('url');

const GITHUB_OWNER = 'AshcookieKing';
const GITHUB_REPO = 'RimLauncher';
const USER_AGENT = 'RimConflictLauncher';

function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': USER_AGENT,
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirects > 5) return reject(new Error('Too many redirects'));
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          res.resume();
          return resolve(fetchText(next, redirects + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve(body));
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

function parseVersion(input) {
  const raw = String(input || '')
    .trim()
    .replace(/^v/i, '');
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?$/i);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].toLowerCase() : '',
    raw,
  };
}

function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return 0;
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  if (va.patch !== vb.patch) return va.patch - vb.patch;
  if (!va.prerelease && vb.prerelease) return 1;
  if (va.prerelease && !vb.prerelease) return -1;
  if (va.prerelease && vb.prerelease) return va.prerelease.localeCompare(vb.prerelease);
  return 0;
}

function isNewerVersion(remote, current) {
  return compareVersions(remote, current) > 0;
}

function parseLatestYml(text) {
  const versionMatch = text.match(/^version:\s*(.+)$/m);
  const releaseDateMatch = text.match(/^releaseDate:\s*['"]?([^'"\n]+)['"]?/m);
  const files = [];
  const fileBlocks = text.split(/\n\s*-\surl:/).slice(1);
  for (const block of fileBlocks) {
    const urlMatch = block.match(/^\s*(.+)$/m);
    const shaMatch = block.match(/^\s*sha512:\s*(.+)$/m);
    const sizeMatch = block.match(/^\s*size:\s*(\d+)/m);
    if (urlMatch) {
      files.push({
        url: urlMatch[1].trim(),
        sha512: shaMatch ? shaMatch[1].trim() : '',
        size: sizeMatch ? Number(sizeMatch[1]) : 0,
      });
    }
  }
  return {
    version: versionMatch ? versionMatch[1].trim() : '',
    releaseDate: releaseDateMatch ? releaseDateMatch[1].trim() : '',
    files,
  };
}

function releasePublishedAt(release) {
  return new Date(release?.published_at || release?.created_at || 0).getTime();
}

function pickLatestRelease(list) {
  return (list || [])
    .filter((r) => r && !r.draft)
    .sort((a, b) => releasePublishedAt(b) - releasePublishedAt(a))[0];
}

function releaseDownloadUrl(release, fileName) {
  const asset = (release?.assets || []).find((a) => a.name === fileName);
  if (asset?.browser_download_url) return asset.browser_download_url;
  const tag = String(release?.tag_name || '').trim();
  if (tag && fileName) {
    return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tag}/${fileName}`;
  }
  return release?.html_url || '';
}

async function fetchLatestReleaseJson() {
  const listUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=20`;
  const listText = await fetchText(listUrl);
  const release = pickLatestRelease(JSON.parse(listText));
  if (!release) throw new Error('No published releases');
  return release;
}

async function checkForUpdates(currentVersion) {
  try {
    const release = await fetchLatestReleaseJson();
    if (release.draft) {
      return { updateAvailable: false, currentVersion, error: 'release is draft' };
    }
    const tagVersion = String(release.tag_name || '').replace(/^v/i, '');
    const ymlAsset = (release.assets || []).find((a) => a.name === 'latest.yml');
    let manifest = null;
    if (ymlAsset?.browser_download_url) {
      try {
        manifest = parseLatestYml(await fetchText(ymlAsset.browser_download_url));
      } catch {}
    }
    const remoteVersion = manifest?.version || tagVersion;
    if (!remoteVersion || !isNewerVersion(remoteVersion, currentVersion)) {
      return { updateAvailable: false, currentVersion, remoteVersion: remoteVersion || currentVersion };
    }
    const exeAsset =
      (release.assets || []).find((a) => /^RimConflictLauncher\.exe$/i.test(a.name)) ||
      (release.assets || []).find((a) => /^RimConflictLauncher.*\.exe$/i.test(a.name)) ||
      (release.assets || []).find((a) => a.name.endsWith('.exe'));
    const zipAsset = (release.assets || []).find((a) => /\.zip$/i.test(a.name));
    const fileFromManifest = manifest?.files?.find((f) => /\.exe$/i.test(f.url));
    const fileName = exeAsset?.name || fileFromManifest?.url || 'RimConflictLauncher.exe';
    const sha512 =
      manifest?.files?.find((f) => f.url === fileName)?.sha512 ||
      manifest?.files?.find((f) => /\.exe$/i.test(f.url))?.sha512 ||
      '';
    return {
      updateAvailable: true,
      currentVersion,
      remoteVersion,
      releaseName: release.name || release.tag_name,
      releaseNotes: release.body || '',
      releasePage: release.html_url,
      releaseTag: release.tag_name || '',
      downloadUrl: releaseDownloadUrl(release, fileName),
      zipUrl: zipAsset ? releaseDownloadUrl(release, zipAsset.name) : '',
      manifest,
      fileName,
      sha512,
      fileSize: exeAsset?.size || manifest?.files?.find((f) => f.url === fileName)?.size || 0,
    };
  } catch (e) {
    return { updateAvailable: false, currentVersion, error: e.message || 'update check failed' };
  }
}

module.exports = {
  checkForUpdates,
  compareVersions,
  parseVersion,
  releaseDownloadUrl,
  pickLatestRelease,
  GITHUB_OWNER,
  GITHUB_REPO,
};
