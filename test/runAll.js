const esbuild = require('esbuild');
const path = require('path');
const { spawnSync } = require('child_process');

console.log('Building test bundle...');
esbuild.buildSync({
  entryPoints: ['test/runTests.ts', 'test/gdbExecution.test.ts', 'test/startup.test.ts', 'test/stateExtraction.test.ts', 'test/arrayIndices.test.ts', 'test/oopExtraction.test.ts', 'test/gfgExtraction.test.ts', 'test/codePatcher.test.ts', 'test/edgeLinkHandler.test.ts'],
  bundle: true,
  platform: 'node',
  outdir: 'dist',
  alias: { vscode: './test/mockVscode.ts' },
});

console.log('Running simulation startup regression tests...');
const startup = spawnSync('node', ['dist/startup.test.js'], { stdio: 'inherit' });
if (startup.status !== 0) process.exit(startup.status || 1);
const extraction = spawnSync('node', ['dist/stateExtraction.test.js'], { stdio: 'inherit' });
if (extraction.status !== 0) process.exit(extraction.status || 1);
const indices = spawnSync('node', ['dist/arrayIndices.test.js'], { stdio: 'inherit' });
if (indices.status !== 0) process.exit(indices.status || 1);
const oop = spawnSync('node', ['dist/oopExtraction.test.js'], { stdio: 'inherit' });
if (oop.status !== 0) process.exit(oop.status || 1);
const gfg = spawnSync('node', ['dist/gfgExtraction.test.js'], { stdio: 'inherit' });
if (gfg.status !== 0) process.exit(gfg.status || 1);
console.log('Running test/codePatcher.test.ts...');
const patcher = spawnSync('node', ['dist/codePatcher.test.js'], { stdio: 'inherit' });
if (patcher.status !== 0) process.exit(patcher.status || 1);
console.log('Running test/edgeLinkHandler.test.ts...');
const edge = spawnSync('node', ['dist/edgeLinkHandler.test.js'], { stdio: 'inherit' });
if (edge.status !== 0) process.exit(edge.status || 1);
console.log('Running test/runTests.ts...');
const res1 = spawnSync('node', ['dist/runTests.js'], { stdio: 'inherit' });
if (res1.status !== 0) {
  process.exit(res1.status || 1);
}

console.log('Running test/gdbExecution.test.ts...');
const res2 = spawnSync('node', ['dist/gdbExecution.test.js'], { stdio: 'inherit' });
if (res2.status !== 0) {
  process.exit(res2.status || 1);
}

console.log('All tests completed successfully!');
