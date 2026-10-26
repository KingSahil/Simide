import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { TutorialManager } from '../src/tutorial/tutorialManager';
import { TutorialValidator } from '../src/cli/validator';

async function runLiveTest() {
  console.log('🚀 Running Live GitHub Import Test against private repo: FeV-06/simide-live-test-tutorial\n');

  const testStorageDir = path.resolve(process.cwd(), 'test/fixtures/.live-storage-download');
  if (fs.existsSync(testStorageDir)) {
    fs.rmSync(testStorageDir, { recursive: true, force: true });
  }

  const repo = 'FeV-06/simide-advanced-dsa-masterclass';
  console.log(`📡 Fetching live archive via GitHub REST API for: ${repo}...`);

  const t0 = Date.now();
  const result = await TutorialManager.importFromGitHub(repo, testStorageDir);
  const duration = Date.now() - t0;

  console.log(`⏱️  Download & Extraction completed in ${duration}ms\n`);

  assert.strictEqual(result.success, true, `Import failed: ${result.error}`);
  assert.ok(result.tutorial, 'Tutorial must be returned');

  const tut = result.tutorial!;
  console.log('✅ Real GitHub Repository Downloaded & Validated:');
  console.log(`   - Course Title: "${tut.manifest.title}"`);
  console.log(`   - Author: "${tut.manifest.author}"`);
  console.log(`   - Structure: ${tut.manifest.structureType}`);
  console.log(`   - On-disk storage path: ${tut.rootDir}`);
  console.log(`   - Source URL: ${tut.sourceUrl}`);
  console.log(`   - Lesson count: ${tut.manifest.lessons.length}`);

  assert.strictEqual(tut.manifest.name, 'advanced-dsa-masterclass');
  assert.strictEqual(tut.manifest.structureType, 'linked_list');
  assert.strictEqual(tut.manifest.lessons.length, 3);

  // Verify lesson code and guide exist on disk
  const lesson = TutorialManager.selectLesson('doubly-linked-list');
  assert.ok(lesson, 'Must select lesson doubly-linked-list');
  assert.ok(fs.existsSync(lesson!.codePath), 'Lesson code file must exist on disk');
  assert.ok(lesson!.guideMarkdown?.includes('Doubly Linked List'), 'Lesson guide must be loaded');

  console.log('\n📖 Lesson Verified:');
  console.log(`   - Title: ${lesson!.lesson.title}`);
  console.log(`   - Code path: ${lesson!.codePath}`);
  console.log(`   - Guide markdown content preview:\n${lesson!.guideMarkdown?.slice(0, 150)}...\n`);

  // Run the tutorial validator on the downloaded repository
  console.log('🔍 Running TutorialValidator on the downloaded repository:');
  const cliSummary = await TutorialValidator.validateDirectory(tut.rootDir);
  assert.strictEqual(cliSummary.success, true);
  assert.strictEqual(cliSummary.lessonsTested, 3);
  console.log(`   ✓ Compiled ${cliSummary.lessonsTested} lesson(s) successfully with -g -O0`);

  // Clean up downloaded test artifacts
  if (fs.existsSync(testStorageDir)) {
    fs.rmSync(testStorageDir, { recursive: true, force: true });
  }

  console.log('\n🎉 Real Private GitHub Repository Ingestion VERIFIED LIVE!');
}

runLiveTest().catch((err) => {
  console.error('❌ Live test failed:', err);
  process.exit(1);
});
