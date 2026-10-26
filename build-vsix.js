const fs = require('fs');
const path = require('path');

const pkg = require('./package.json');
const vsixName = `simide-ide-${pkg.version}.vsix`;

// Clean up
try { fs.unlinkSync(vsixName); } catch {}

// Build extension first - use node directly without shell
const { spawnSync } = require('child_process');
const tsc = spawnSync('node_modules/.bin/tsc', ['--noEmit'], { stdio: 'inherit' });
if (tsc.status !== 0) process.exit(tsc.status);
const esb = spawnSync('node', ['esbuild.js'], { stdio: 'inherit' });
if (esb.status !== 0) process.exit(esb.status);

// Use system zip command directly
const zipResult = spawnSync('zip', [
  '-r', vsixName,
  'dist/',
  'package.json',
  'resources/',
  'LICENSE',
  'README.md',
  '-x', '*.ts', '*.map', 'node_modules/**', 'test/**', 'webview/**', 'src/**', '*.vsix', '*.tgz', 'build-vsix.js'
], { stdio: 'inherit' });

if (zipResult.status === 0) {
  console.log(`\nCreated ${vsixName}`);
  spawnSync('unzip', ['-l', vsixName], { stdio: 'inherit' });
} else {
  console.error('zip failed');
  process.exit(1);
}
