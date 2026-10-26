import * as assert from 'assert';
import { AiSecretManager } from '../src/ai/secretManager';
import { AiService } from '../src/ai/aiService';

async function run() {
  console.log('=== Running AI Assistant & Secret Manager Tests ===');

  // 1. Test AiSecretManager (In-memory fallback & configuration)
  console.log('[Test 1] Testing AiSecretManager storage & retrieval...');
  const secretManager = new AiSecretManager();

  assert.strictEqual(await secretManager.hasKey(), false, 'Should have no key initially');
  assert.strictEqual(await secretManager.getConfig(), null, 'Config should be null initially');

  await secretManager.saveConfig({
    provider: 'gemini',
    apiKey: 'AIzaSyFakeTestKey12345',
    model: 'gemini-1.5-flash',
  });

  assert.strictEqual(await secretManager.hasKey(), true, 'Should have key after save');
  const config = await secretManager.getConfig();
  assert.ok(config !== null, 'Config should not be null');
  assert.strictEqual(config?.provider, 'gemini');
  assert.strictEqual(config?.apiKey, 'AIzaSyFakeTestKey12345');
  assert.strictEqual(config?.model, 'gemini-1.5-flash');

  // Test updating to custom / OpenAI provider
  await secretManager.saveConfig({
    provider: 'custom',
    apiKey: 'sk-test-local-key',
    customEndpoint: 'http://localhost:11434/v1',
    model: 'llama3',
  });

  const updatedConfig = await secretManager.getConfig();
  assert.strictEqual(updatedConfig?.provider, 'custom');
  assert.strictEqual(updatedConfig?.apiKey, 'sk-test-local-key');
  assert.strictEqual(updatedConfig?.customEndpoint, 'http://localhost:11434/v1');
  assert.strictEqual(updatedConfig?.model, 'llama3');

  // Test deleting key
  await secretManager.deleteConfig();
  assert.strictEqual(await secretManager.hasKey(), false, 'Should have no key after deletion');
  assert.strictEqual(await secretManager.getConfig(), null, 'Config should be null after deletion');
  console.log('  ✓ AiSecretManager persistence and deletion verified');

  // 2. Test Prompt Construction in AiService
  console.log('[Test 2] Testing AiService Prompt Building & Invariant Packaging...');
  const sampleProblem = 'Given a string s, return true if s is a palindrome.';
  const sampleCode = `int main() {\n    std::string str = "racecar";\n    return 0;\n}`;
  const visualSummary = `String "str" (len 7): ['r', 'a', 'c', 'e', 'c', 'a', 'r']`;

  const builtPrompt = (AiService as any).buildUserPrompt({
    problemStatement: sampleProblem,
    promptType: 'hint',
    activeCode: sampleCode,
    fileName: 'palindrome.cpp',
    visualSnapshotSummary: visualSummary,
    terminalOutput: 'Program exited with code 0',
  });

  assert.ok(builtPrompt.includes('### Problem Statement:'), 'Prompt should include problem statement section');
  assert.ok(builtPrompt.includes(sampleProblem), 'Prompt should include exact problem text');
  assert.ok(builtPrompt.includes('palindrome.cpp'), 'Prompt should include target file name');
  assert.ok(builtPrompt.includes('### Active DSA Visualization State:'), 'Prompt should include visual state section');
  assert.ok(builtPrompt.includes(visualSummary), 'Prompt should include visual snapshot summary');
  assert.ok(builtPrompt.includes('Instruction: Give me a thoughtful hint'), 'Prompt should format hint instruction for hint type');

  const solvePrompt = (AiService as any).buildUserPrompt({
    problemStatement: sampleProblem,
    promptType: 'solve',
    activeCode: sampleCode,
  });
  assert.ok(solvePrompt.includes('Instruction: Provide the corrected, complete, and idiomatic C++ code'), 'Prompt should format solve instruction');
  console.log('  ✓ AiService multi-modal prompt construction verified');

  // 3. Test Provider Test Key with Mock / Intercepted Fetch
  console.log('[Test 3] Testing AiService API testKey error handling...');
  const originalFetch = globalThis.fetch;
  try {
    // Mock network failure or invalid key response
    (globalThis as any).fetch = async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: { message: 'API_KEY_INVALID' } }),
    });

    const geminiTest = await AiService.testKey({
      provider: 'gemini',
      apiKey: 'invalid_key',
    });
    assert.strictEqual(geminiTest.ok, false, 'Should reject invalid gemini key');
    assert.ok(geminiTest.message.includes('API_KEY_INVALID'), 'Should capture provider error message');

    const openaiTest = await AiService.testKey({
      provider: 'openai',
      apiKey: 'sk-invalid',
    });
    assert.strictEqual(openaiTest.ok, false, 'Should reject invalid openai key');

    // Mock successful 200 response
    (globalThis as any).fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
        choices: [{ message: { content: 'Hello' } }],
      }),
    });

    const successGeminiTest = await AiService.testKey({
      provider: 'gemini',
      apiKey: 'valid_test_key',
    });
    assert.strictEqual(successGeminiTest.ok, true, 'Should accept valid mock key');
    assert.ok(successGeminiTest.message.includes('Connected to Google Gemini'), 'Should report success');

    // Test ask execution
    const responseText = await AiService.ask(
      { provider: 'gemini', apiKey: 'valid_test_key' },
      { problemStatement: sampleProblem, promptType: 'hint', activeCode: sampleCode }
    );
    assert.strictEqual(responseText, 'Hello', 'Should extract candidate text');

    console.log('  ✓ AiService testKey and ask payload round-trip verified');
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('=== All AI Assistant Tests PASSED ===');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
