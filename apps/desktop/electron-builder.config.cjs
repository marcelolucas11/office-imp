// SPDX-License-Identifier: AGPL-3.0-only
// Configuração dos instaladores (Mac universal e Windows). Forks: troquem os valores em branding.json.
const branding = require('./branding.json');
const [owner, repo] = branding.github.split('/');
// Com certificado da Apple (MAC_SIGNED=1): assina, notariza e habilita a atualização automática no Mac.
// Sem certificado: assinatura ad-hoc feita em scripts/after-pack.cjs (obrigatória para abrir em Apple Silicon).
const macSigned = process.env.MAC_SIGNED === '1';

module.exports = {
  appId: branding.appId,
  productName: branding.productName,
  copyright: 'office-imp (AGPL-3.0)',
  directories: { output: 'release', buildResources: 'build' },
  files: ['dist/**', 'assets/**', 'package.json'],
  asar: true,
  npmRebuild: false,
  ...(process.env.APP_VERSION ? { extraMetadata: { version: process.env.APP_VERSION } } : {}),
  artifactName: 'office-imp-${version}-${os}-${arch}.${ext}',
  publish: [{ provider: 'github', owner, repo, releaseType: 'release' }],
  afterPack: './scripts/after-pack.cjs',
  mac: {
    target: [
      { target: 'dmg', arch: ['universal'] },
      { target: 'zip', arch: ['universal'] },
    ],
    category: 'public.app-category.business',
    icon: 'assets/icon.icns',
    gatekeeperAssess: false,
    hardenedRuntime: macSigned,
    notarize: macSigned,
    ...(macSigned ? { entitlements: 'build/entitlements.mac.plist', entitlementsInherit: 'build/entitlements.mac.plist' } : { identity: null }),
    extendInfo: {
      NSCameraUsageDescription: 'O Office Impera usa a câmera nas conversas por vídeo do escritório virtual.',
      NSMicrophoneUsageDescription: 'O Office Impera usa o microfone nas conversas do escritório virtual.',
      NSScreenCaptureUsageDescription: 'O Office Impera precisa desta permissão para você compartilhar a tela.',
    },
  },
  dmg: { sign: false },
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'assets/icon.ico' },
  nsis: { installerIcon: 'assets/icon.ico', uninstallerIcon: 'assets/icon.ico', oneClick: true, perMachine: false, deleteAppDataOnUninstall: false },
  linux: { target: [{ target: 'AppImage', arch: ['x64'] }], category: 'Office', icon: 'assets/icon.png' },
};
