// SPDX-License-Identifier: AGPL-3.0-only
// Sem certificado da Apple, o app do Mac recebe uma assinatura ad-hoc: sem ela, o macOS se recusa
// a abrir binários arm64 (Apple Silicon). Com MAC_SIGNED=1 o electron-builder assina de verdade.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin' || process.env.MAC_SIGNED === '1') return;
  if (context.appOutDir.endsWith('-temp')) return; // pastas intermediárias do build universal
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • assinatura ad-hoc: ${app}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
