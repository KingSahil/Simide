import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { StateExtractor } from '../src/debug/stateExtractor';
import { CppCompiler } from '../src/debug/compiler';
import { ExplanationGenerator } from '../src/visualization/explanationGenerator';
import { StringVariable, LinkedListSnapshot } from '../src/visualization/linkedListModel';

async function runStringTests() {
  console.log('=== Running String Data Structure Test Suite ===\n');

  // 1. Static Source Analysis Tests
  console.log('[Test 1] Testing Static Source Analysis for Strings...');
  const palindromeFile = path.resolve('examples/string-palindrome.cpp');
  const reverseFile = path.resolve('examples/string-reverse.cpp');
  const slidingWinFile = path.resolve('examples/sliding-window-string.cpp');
  const cTraversalFile = path.resolve('examples/c-string-traversal.cpp');
  const cReverseFile = path.resolve('examples/c-string-reverse.cpp');

  // Verify structureType parsing
  assert.strictEqual(StateExtractor.parseStructMembers(palindromeFile).structureType, 'string');
  assert.strictEqual(StateExtractor.parseStructMembers(reverseFile).structureType, 'string');
  assert.strictEqual(StateExtractor.parseStructMembers(slidingWinFile).structureType, 'string');
  assert.strictEqual(StateExtractor.parseStructMembers(cTraversalFile).structureType, 'string');
  assert.strictEqual(StateExtractor.parseStructMembers(cReverseFile).structureType, 'string');
  console.log('  ✓ Verified parseStructMembers detects structureType: string across all 5 example programs');

  // Verify declaration discovery
  const palinDecls = StateExtractor.discoverStringDeclarations(palindromeFile);
  assert.ok(palinDecls.some((d) => d.name === 'word' && d.type === 'std_string'));

  const cRevDecls = StateExtractor.discoverStringDeclarations(cReverseFile);
  assert.ok(cRevDecls.some((d) => d.name === 'str' && d.type === 'char_array' && d.size === 10));

  const cTravDecls = StateExtractor.discoverStringDeclarations(cTraversalFile);
  assert.ok(cTravDecls.some((d) => d.name === 'greeting' && d.type === 'char_array'));
  console.log('  ✓ Verified discoverStringDeclarations parses std::string and char[] declarations, sizes, and initial values');

  // Verify algorithm pattern heuristics
  const palinPattern = StateExtractor.detectStringAlgorithmPattern(palindromeFile);
  assert.strictEqual(palinPattern.pattern, 'two_pointer');
  assert.strictEqual(palinPattern.leftPtr, 'left');
  assert.strictEqual(palinPattern.rightPtr, 'right');

  const revPattern = StateExtractor.detectStringAlgorithmPattern(reverseFile);
  assert.strictEqual(revPattern.pattern, 'two_pointer');

  const slidingPattern = StateExtractor.detectStringAlgorithmPattern(slidingWinFile);
  assert.strictEqual(slidingPattern.pattern, 'sliding_window');
  console.log('  ✓ Verified detectStringAlgorithmPattern identifies two-pointer and sliding-window patterns');

  // 2. DAP Runtime Extraction Engine Tests
  console.log('\n[Test 2] Testing DAP Runtime Extraction Engine (extractStrings)...');
  const mockLocalVars = {
    word: { value: '"algorithm"', type: 'std::string', variablesReference: 0, isArgument: false },
    left: { value: '0', type: 'int', variablesReference: 0, isArgument: false },
    right: { value: '8', type: 'int', variablesReference: 0, isArgument: false },
  };
  const mockVarDecls = new Map<string, number[]>([
    ['word', [18]],
    ['left', [5]],
    ['right', [6]],
  ]);

  const extracted = await StateExtractor.extractStrings(
    {} as any,
    1,
    mockLocalVars,
    async (expr) => (expr === 'word' ? '"algorithm"' : null),
    20,
    mockVarDecls,
    null,
    reverseFile
  );

  assert.strictEqual(extracted.strings.length, 1);
  const str = extracted.strings[0];
  assert.strictEqual(str.name, 'word');
  assert.strictEqual(str.length, 9);
  assert.strictEqual(str.elements.length, 9);
  assert.strictEqual(str.elements[0].char, 'a');
  assert.strictEqual(str.elements[0].ascii, 97);
  assert.strictEqual(str.elements[8].char, 'm');
  assert.strictEqual(str.elements[8].ascii, 109);
  assert.strictEqual(extracted.indexPointers.length, 2);
  assert.strictEqual(extracted.indexPointers[0].name, 'left');
  assert.strictEqual(extracted.indexPointers[0].targetIndex, 0);
  assert.strictEqual(extracted.indexPointers[1].name, 'right');
  assert.strictEqual(extracted.indexPointers[1].targetIndex, 8);
  console.log('  ✓ Verified extractStrings handles std::string single-roundtrip extraction and index pointer linking');

  // C-String buffer extraction with null terminator
  const mockCLocalVars = {
    str: { value: '"hello"', type: 'char[10]', variablesReference: 0, isArgument: false },
    i: { value: '0', type: 'int', variablesReference: 0, isArgument: false },
    j: { value: '4', type: 'int', variablesReference: 0, isArgument: false },
  };
  const mockCVarDecls = new Map<string, number[]>([
    ['str', [6]],
    ['i', [7]],
    ['j', [8]],
  ]);

  const extractedC = await StateExtractor.extractStrings(
    {} as any,
    1,
    mockCLocalVars,
    async (expr) => (expr === '(char*)str' ? '"hello"' : null),
    10,
    mockCVarDecls,
    null,
    cReverseFile
  );

  assert.strictEqual(extractedC.strings.length, 1);
  const cStr = extractedC.strings[0];
  assert.strictEqual(cStr.name, 'str');
  assert.strictEqual(cStr.hasNullTerminator, true);
  assert.strictEqual(cStr.elements.length, 6); // 'h','e','l','l','o', '\0'
  assert.strictEqual(cStr.elements[5].isNullTerminator, true);
  assert.strictEqual(cStr.elements[5].char, '\\0');
  assert.strictEqual(cStr.elements[5].ascii, 0);
  console.log('  ✓ Verified extractStrings adds explicit null terminator for C-style fixed buffers');

  // 3. Mutation and Swap Detection
  console.log('\n[Test 3] Testing Character Mutation & In-Place Swap Diffing...');
  const prevSnapshot: LinkedListSnapshot = {
    stepNumber: 1,
    structureType: 'string',
    source: { file: 'string-reverse.cpp', line: 10 },
    hasHead: true,
    headId: null,
    nodes: [],
    strings: [str],
    indexPointers: extracted.indexPointers,
    explanation: 'Initialized string',
    changeType: 'string_initialized',
  };

  // Swapped: 'algorithm' -> 'mlgoritha' (index 0 and 8 swapped)
  const mockSwappedVars = {
    word: { value: '"mlgoritha"', type: 'std::string', variablesReference: 0, isArgument: false },
    left: { value: '1', type: 'int', variablesReference: 0, isArgument: false },
    right: { value: '7', type: 'int', variablesReference: 0, isArgument: false },
  };
  const extractedSwapped = await StateExtractor.extractStrings(
    {} as any,
    1,
    mockSwappedVars,
    async (expr) => (expr === 'word' ? '"mlgoritha"' : null),
    20,
    mockVarDecls,
    null,
    reverseFile,
    prevSnapshot
  );

  assert.strictEqual(extractedSwapped.strings[0].elements[0].isModified, true);
  assert.strictEqual(extractedSwapped.strings[0].elements[8].isModified, true);
  assert.strictEqual(extractedSwapped.strings[0].elements[1].isModified, false);

  const swapExplanation = ExplanationGenerator.generate(
    [], null, prevSnapshot, true, [], null, '', 'string', null, undefined,
    undefined, extractedSwapped.indexPointers, undefined, undefined, extractedSwapped.strings
  );
  assert.strictEqual(swapExplanation.changeType, 'string_char_swapped');
  assert.ok(swapExplanation.explanation.includes('Swapped characters word[0]'));
  console.log(`  ✓ Verified in-place character swap detection and explanation: "${swapExplanation.explanation}"`);

  // 4. Compilation Test for all String Example Files
  console.log('\n[Test 4] Testing Real C++ Compilation of All String Examples...');
  for (const examplePath of [palindromeFile, reverseFile, slidingWinFile, cTraversalFile, cReverseFile]) {
    const res = await CppCompiler.compile(examplePath);
    assert.ok(res.success, `Compilation failed for ${examplePath}: ${res.errorMessage}`);
    console.log(`  ✓ Successfully compiled ${path.basename(examplePath)}`);
  }

  console.log('\n=== All String Data Structure Tests PASSED ===\n');
}

runStringTests().catch((err) => {
  console.error('❌ String Extraction Test failed:', err);
  process.exit(1);
});
