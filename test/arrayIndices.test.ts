import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StateExtractor } from '../src/debug/stateExtractor';

async function run() {
  const file = path.resolve('examples/bubble-sort.cpp');
  const source = fs.readFileSync(file, 'utf8').split('\n');
  const compareLine = source.findIndex(line => line.includes('if (arr[j]')) + 1;
  const jDeclaration = source.findIndex(line => line.includes('for (int j')) + 1;
  const local = (value: number) => ({ value: String(value), type: 'int', variablesReference: 0, isArgument: false });
  const vars = {
    arr: { value: '{64,34,25,12,22}', type: 'int [5]', variablesReference: 0, isArgument: false },
    i: local(0), j: local(0), n: local(5), temp: local(0),
  };
  const read = (line: number, sourceFile = file, variables: Record<string, any> = vars) =>
    StateExtractor.extractArrays({ customRequest: async () => ({ variables: [] }) } as any, 1,
      variables, async expression => {
        const match = expression.match(/^arr\[(\d+)\]$/);
        return match ? String([64, 34, 25, 12, 22][Number(match[1])]) : null;
      }, line, StateExtractor.getVariableDeclarations(sourceFile),
      StateExtractor.getEnclosingFunction(sourceFile, line), sourceFile);

  const before = await read(jDeclaration);
  assert.deepStrictEqual(before.indexPointers, [], 'Do not expose an uninitialized loop index');
  const first = await read(compareLine);
  assert.deepStrictEqual(first.indexPointers.map(p => [p.name, p.targetIndex]), [['j', 0], ['j+1', 1]]);
  vars.j.value = '2';
  vars.temp.value = '2';
  const advanced = await read(compareLine);
  assert.deepStrictEqual(advanced.indexPointers.map(p => [p.name, p.targetIndex]), [['j', 2], ['j+1', 3]]);
  assert.ok(advanced.arrays[0].elements[2].isActive && advanced.arrays[0].elements[3].isActive);
  vars.j.value = '4';
  const boundary = await read(compareLine);
  assert.deepStrictEqual(boundary.indexPointers.map(p => [p.name, p.targetIndex]), [['j', 4]]);
  const traversalLine = source.findIndex(line => line.includes('cout << arr[k]')) + 1;
  const traversal = await read(traversalLine, file, { arr: vars.arr, k: local(1), n: local(5) });
  assert.deepStrictEqual(traversal.indexPointers.map(p => [p.name, p.targetIndex]), [['k', 1]]);

  const fixture = path.join(os.tmpdir(), `simide-indices-${process.pid}.cpp`);
  try {
    fs.writeFileSync(fixture, ['int main() {', 'int arr[5] = {1,2,3,4,5};',
      'int cursor = 2;', 'int temp = 0;', '// arr[temp] is a comment',
      'const char* text = "arr[temp]";', 'arr[cursor] = arr[cursor - 1];', 'return 0;', '}'].join('\n'));
    const custom = await read(7, fixture, { arr: vars.arr, cursor: local(2), temp: local(0) });
    assert.deepStrictEqual(custom.indexPointers.map(p => [p.name, p.targetIndex]), [['cursor', 2], ['cursor-1', 1]]);
    console.log('✓ j/j+1 arrows, index lifetime, movement, bounds, traversal, custom names, and comment filtering passed');
  } finally { fs.unlinkSync(fixture); }
}

run().catch(error => { console.error(error); process.exit(1); });
