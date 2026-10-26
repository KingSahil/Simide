import * as fs from 'fs';
import * as path from 'path';

export interface ExampleEntry {
  fileName: string;
  title: string;
  category: string;
}

const categories = ['Arrays & Sorting', 'Linked Lists', 'Stacks', 'Queues', 'Trees', 'Graphs', 'Strings', 'Other Examples'];

export function listExamples(...roots: string[]): ExampleEntry[] {
  const files = new Set<string>();
  function visit(directory: string, relative = ''): void {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const file = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) visit(path.join(directory, entry.name), file);
      else if (entry.isFile() && /\.(cpp|cc|cxx)$/i.test(entry.name)) files.add(file);
    }
  }
  for (const root of roots) visit(path.join(root, 'examples'));
  return [...files].map(fileName => {
    const name = fileName.toLowerCase();
    const category = /array|sort/.test(name) ? categories[0]
      : /linked|leetcode-206|gfg-push-delete/.test(name) ? categories[1]
      : /stack/.test(name) ? categories[2]
      : /queue/.test(name) ? categories[3]
      : /tree|bst/.test(name) ? categories[4]
      : /graph/.test(name) ? categories[5]
      : /string/.test(name) ? categories[6] : categories[7];
    const title = path.basename(fileName).replace(/\.(cpp|cc|cxx)$/i, '')
      .split(/[-_]/).map(word => /^(bst|oop|gfg)$/i.test(word) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)).join(' ');
    return { fileName, title, category };
  }).sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category) || a.fileName.localeCompare(b.fileName));
}
