const esbuild = require('esbuild');
const path = require('path');
const { spawnSync } = require('child_process');

console.log('Building test bundle...');
esbuild.buildSync({
  entryPoints: ['test/runTests.ts', 'test/gdbExecution.test.ts'],
  bundle: true,
  platform: 'node',
  outdir: 'dist',
  alias: { vscode: './test/mockVscode.ts' },
});

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
