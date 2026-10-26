const esbuild = require('esbuild');
const path = require('path');
const { spawnSync } = require('child_process');

console.log('Building test bundle...');
esbuild.buildSync({
  entryPoints: [
    'test/runTests.ts',
    'test/gdbExecution.test.ts',
    'test/startup.test.ts',
    'test/examples.test.ts',
    'test/graphModel.test.ts',
    'test/graphStateExtractor.test.ts',
    'test/graphRenderer.test.ts',
    'test/graphIntegration.test.ts',
    'test/debugOutput.test.ts',
    'test/stateExtraction.test.ts',
    'test/arrayIndices.test.ts',
    'test/oopExtraction.test.ts',
    'test/gfgExtraction.test.ts',
    'test/stringExtraction.test.ts',
    'test/tutorialIngestion.test.ts',
    'test/masterclassLessons.test.ts',
    'test/codePatcher.test.ts',
    'test/edgeLinkHandler.test.ts',
    'test/creativeCodeManager.test.ts',
    'test/aiService.test.ts',
  ],
  bundle: true,
  platform: 'node',
  outdir: 'dist',
  alias: { vscode: './test/mockVscode.ts' },
});

const examples = spawnSync('node', ['dist/examples.test.js'], { stdio: 'inherit' });
if (examples.status !== 0) process.exit(examples.status || 1);
for (const test of ['graphModel', 'graphStateExtractor', 'graphRenderer', 'graphIntegration', 'debugOutput']) {
  const result = spawnSync('node', ['dist/' + test + '.test.js'], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
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
console.log('Running test/stringExtraction.test.ts...');
const strRes = spawnSync('node', ['dist/stringExtraction.test.js'], { stdio: 'inherit' });
if (strRes.status !== 0) process.exit(strRes.status || 1);
console.log('Running test/codePatcher.test.ts...');
const patcher = spawnSync('node', ['dist/codePatcher.test.js'], { stdio: 'inherit' });
if (patcher.status !== 0) process.exit(patcher.status || 1);
console.log('Running test/edgeLinkHandler.test.ts...');
const edge = spawnSync('node', ['dist/edgeLinkHandler.test.js'], { stdio: 'inherit' });
if (edge.status !== 0) process.exit(edge.status || 1);
console.log('Running test/creativeCodeManager.test.ts...');
const creative = spawnSync('node', ['dist/creativeCodeManager.test.js'], { stdio: 'inherit' });
if (creative.status !== 0) process.exit(creative.status || 1);
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

console.log('Running test/tutorialIngestion.test.ts...');
const res3 = spawnSync('node', ['dist/tutorialIngestion.test.js'], { stdio: 'inherit' });
if (res3.status !== 0) {
  process.exit(res3.status || 1);
}

console.log('Running test/masterclassLessons.test.ts...');
const res4 = spawnSync('node', ['dist/masterclassLessons.test.js'], { stdio: 'inherit' });
if (res4.status !== 0) {
  process.exit(res4.status || 1);
}

console.log('Running test/aiService.test.ts...');
const resAi = spawnSync('node', ['dist/aiService.test.js'], { stdio: 'inherit' });
if (resAi.status !== 0) {
  process.exit(resAi.status || 1);
}

console.log('All tests completed successfully!');
