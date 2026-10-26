import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as zlib from 'zlib';
import {
  auditCppSourceSafety,
  isPathSafe,
  validateTutorialManifest,
} from '../src/tutorial/tutorialModel';
import { TutorialManager } from '../src/tutorial/tutorialManager';
import { TutorialValidator } from '../src/cli/validator';

export async function runTutorialIngestionTests() {
  console.log('=== Running Tutorial Ingestion & Author SDK Tests ===\n');

  // Test 1: URL Parsing
  console.log('[Test 1] Testing GitHub URL Parser...');
  const ref1 = TutorialManager.parseGitHubUrl('https://github.com/acm-chapter/bst-masterclass');
  assert.deepStrictEqual(ref1, { owner: 'acm-chapter', repo: 'bst-masterclass', ref: 'main' });

  const ref2 = TutorialManager.parseGitHubUrl('johndoe/linked-lists#dev-branch');
  assert.deepStrictEqual(ref2, { owner: 'johndoe', repo: 'linked-lists', ref: 'dev-branch' });

  const ref3 = TutorialManager.parseGitHubUrl('https://github.com/uni/cs101/tree/fall2026');
  assert.deepStrictEqual(ref3, { owner: 'uni', repo: 'cs101', ref: 'fall2026' });

  const refInvalid = TutorialManager.parseGitHubUrl('not-a-valid-url-format-at-all!!!');
  assert.strictEqual(refInvalid, null);
  console.log('  ✓ Verified URL parsing for full URLs, shorthands, branches, and invalid inputs');

  // Test 2: Path Safety
  console.log('[Test 2] Testing Path Traversal Defense...');
  assert.strictEqual(isPathSafe('lessons/01/main.cpp'), true);
  assert.strictEqual(isPathSafe('../outside.cpp'), false);
  assert.strictEqual(isPathSafe('lessons/../../etc/passwd'), false);
  assert.strictEqual(isPathSafe('/root/secret.cpp'), false);
  console.log('  ✓ Verified directory traversal defenses (../, absolute paths rejected)');

  // Test 3: Manifest Validation
  console.log('[Test 3] Testing Manifest Validation...');
  const validManifest = {
    name: 'test-dsa',
    version: '1.0.0',
    title: 'Test DSA',
    structureType: 'linked_list',
    lessons: [
      { id: 'l1', title: 'Lesson 1', path: 'main.cpp', guide: 'lesson.md' },
    ],
  };
  const val1 = validateTutorialManifest(validManifest);
  assert.strictEqual(val1.valid, true);

  const invalidManifest = {
    name: 'INVALID NAME WITH SPACES',
    version: 'bad-ver',
    title: 123,
    structureType: 'non_existent_structure',
    lessons: [],
  };
  const val2 = validateTutorialManifest(invalidManifest);
  assert.strictEqual(val2.valid, false);
  assert.ok(val2.errors.length >= 4, 'Must catch all invalid fields');
  console.log('  ✓ Verified manifest validation catches naming, semver, types, and empty lessons');

  // Test 4: Security Audit
  console.log('[Test 4] Testing C++ Source Security Auditing...');
  const safeCode = `
    #include <iostream>
    struct Node { int data; Node* next; };
    int main() { return 0; }
  `;
  const auditSafe = auditCppSourceSafety(safeCode);
  assert.strictEqual(auditSafe.isSafe, true);

  const maliciousCode = `
    #include <windows.h>
    #include <cstdlib>
    int main() {
      system("calc.exe");
      return 0;
    }
  `;
  const auditMalicious = auditCppSourceSafety(maliciousCode);
  assert.strictEqual(auditMalicious.isSafe, false);
  assert.ok(auditMalicious.warnings.some((w) => w.includes('system call')), 'Must detect system() call');
  assert.ok(auditMalicious.warnings.some((w) => w.includes('<windows.h>')), 'Must detect <windows.h>');
  console.log('  ✓ Verified security linter detects prohibited system calls and platform headers');

  // Test 5: Loading Local Tutorial Fixture
  console.log('[Test 5] Testing TutorialManager Loading from Directory...');
  const fixtureDir = path.resolve(process.cwd(), 'test/fixtures/sample-tutorial');
  const loadResult = await TutorialManager.loadFromDirectory(fixtureDir);
  assert.strictEqual(loadResult.success, true, loadResult.error);
  assert.ok(loadResult.tutorial, 'Tutorial must be returned');
  assert.strictEqual(loadResult.tutorial?.manifest.name, 'intro-binary-trees');
  assert.strictEqual(loadResult.tutorial?.manifest.lessons.length, 2);

  // Test lesson selection
  const lesson1 = TutorialManager.selectLesson('insert-root');
  assert.ok(lesson1, 'Must find lesson insert-root');
  assert.ok(fs.existsSync(lesson1!.codePath), 'Code path must exist on disk');
  assert.ok(lesson1!.guideMarkdown?.includes('Lesson 1'), 'Guide markdown must be loaded');

  const lesson2 = TutorialManager.selectLesson('inorder-traversal');
  assert.ok(lesson2, 'Must find lesson inorder-traversal');
  assert.ok(lesson2!.guideMarkdown?.includes('Inorder traversal'), 'Guide markdown must match Lesson 2');
  console.log('  ✓ Verified TutorialManager loaded sample tutorial, switched lessons, and extracted guides');

  // Test 6: CLI Validator Harness
  console.log('[Test 6] Testing TutorialValidator Execution...');
  const cliSummary = await TutorialValidator.validateDirectory(fixtureDir);
  assert.strictEqual(cliSummary.success, true);
  assert.strictEqual(cliSummary.lessonsTested, 2);
  assert.strictEqual(cliSummary.errors.length, 0);
  console.log('  ✓ Verified CLI validator compiled and verified all lesson files in fixture');

  // Test 7: Tarball Extraction Logic
  console.log('[Test 7] Testing In-Memory Tarball Extraction...');
  const tempExtractDir = path.resolve(process.cwd(), 'test/fixtures/.test-tar-extract');
  if (fs.existsSync(tempExtractDir)) {
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
  }

  // Construct a minimal synthetic tar archive for "repo-commit/simide.json"
  const fileName = 'repo-head/simide.json';
  const fileContent = Buffer.from(JSON.stringify(validManifest));
  const tarHeader = Buffer.alloc(512);
  tarHeader.write(fileName, 0, 100, 'utf8');
  tarHeader.write(fileContent.length.toString(8).padStart(11, '0') + ' ', 124, 12, 'utf8');
  tarHeader.write('0', 156, 1, 'utf8'); // regular file
  tarHeader.write('ustar\0', 257, 6, 'utf8');

  const contentBlock = Buffer.alloc(Math.ceil(fileContent.length / 512) * 512);
  fileContent.copy(contentBlock);
  const endBlock = Buffer.alloc(1024); // two null blocks

  const syntheticTar = Buffer.concat([tarHeader, contentBlock, endBlock]);
  TutorialManager.extractTar(syntheticTar, tempExtractDir);

  const extractedFile = path.join(tempExtractDir, 'simide.json');
  assert.ok(fs.existsSync(extractedFile), 'Extracted file must exist');
  const readBack = JSON.parse(fs.readFileSync(extractedFile, 'utf8'));
  assert.strictEqual(readBack.name, 'test-dsa');

  fs.rmSync(tempExtractDir, { recursive: true, force: true });
  console.log('  ✓ Verified pure-Node zero-dependency tarball unpacking stripped prefix correctly');

  console.log('\n=== All Tutorial Ingestion & Author SDK Tests PASSED ===\n');
}

if (require.main === module) {
  runTutorialIngestionTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
