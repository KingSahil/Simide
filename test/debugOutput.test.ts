import * as assert from 'assert';
import { DebugTrackerFactory } from '../src/debug/debugAdapterTracker';
import { StateExtractor } from '../src/debug/stateExtractor';

StateExtractor.reset();
assert.strictEqual(
  StateExtractor.appendDapOutput('debug adapter message\n', 'console'),
  false,
  'Debugger console messages must not be shown as program output'
);
assert.strictEqual(StateExtractor.getAccumulatedTerminalOutput(), '');
assert.strictEqual(StateExtractor.appendDapOutput('Graph ready\n', 'stdout'), true);
assert.strictEqual(StateExtractor.appendDapOutput('warning\n', 'stderr'), true);
assert.strictEqual(
  StateExtractor.getAccumulatedTerminalOutput(),
  'Graph ready\nwarning\n'
);

const session = { id: 'simide-session' } as never;
let outputSession: unknown;
let outputText = '';
let outputCategory = '';
const subscription = DebugTrackerFactory.onOutput((receivedSession, text, category) => {
  outputSession = receivedSession;
  outputText = text;
  outputCategory = category || '';
});
const tracker = new DebugTrackerFactory().createDebugAdapterTracker(session);
tracker.onDidSendMessage?.({
  type: 'event',
  event: 'output',
  body: { output: 'step output\n', category: 'stdout' },
} as never);
subscription.dispose();
assert.strictEqual(outputSession, session, 'Output events must retain their debugger session');
assert.strictEqual(outputText, 'step output\n');
assert.strictEqual(outputCategory, 'stdout');
StateExtractor.reset();

console.log('Debug output capture tests passed.');
