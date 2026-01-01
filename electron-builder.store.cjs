const fs = require('fs');
const path = require('path');

const pkg = require('./package.json');
const identityPath = path.join(__dirname, 'build', 'store.identity.json');

function loadStoreIdentity() {
  if (!fs.existsSync(identityPath)) {
    throw new Error(
      'Создайте build/store.identity.json из build/store.identity.example.json ' +
        '(Partner Center → Идентификация продукта).'
    );
  }
  const data = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  const required = ['identityName', 'publisher', 'publisherDisplayName', 'applicationId'];
  for (const key of required) {
    const value = String(data[key] || '').trim();
    if (!value) {
      throw new Error(`Заполните поле "${key}" в build/store.identity.json (из Partner Center).`);
    }
  }
  return data;
}

const store = loadStoreIdentity();

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...pkg.build,
  directories: {
    ...pkg.build.directories,
    buildResources: 'build',
  },
  win: {
    icon: 'build/icon.ico',
    target: [{ target: 'appx', arch: ['x64'] }],
    artifactName: 'StarFrontLauncher-${version}.${ext}',
    signAndEditExecutable: false,
  },
  appx: {
    applicationId: store.applicationId,
    identityName: store.identityName,
    publisher: store.publisher,
    publisherDisplayName: store.publisherDisplayName,
    displayName: store.displayName || pkg.build.productName,
    backgroundColor: '#020810',
    languages: ['ru-RU', 'en-US'],
    showNameOnTiles: false,
  },
};
