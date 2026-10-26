#!/usr/bin/env node

const path = require('path');
const { TutorialValidator } = require('../dist/cli/validator.js');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'test';
  const targetDir = path.resolve(args[1] || process.cwd());

  if (command !== 'test' && command !== 'validate') {
    console.log('SimIDE Tutorial Validator CLI');
    console.log('Usage:');
    console.log('  npx @simide/cli test [dir]       Validate tutorial manifest, security, and C++ code');
    process.exit(0);
  }

  console.log(`\n🔍 Validating SimIDE tutorial in: ${targetDir}\n`);

  const result = await TutorialValidator.validateDirectory(targetDir);

  if (result.warnings.length > 0) {
    console.log('⚠️  Security / Portability Warnings:');
    result.warnings.forEach((w) => console.log(`   - ${w}`));
    console.log('');
  }

  if (!result.success) {
    console.error('❌ Tutorial validation failed with the following errors:');
    result.errors.forEach((err) => console.error(`   • ${err}`));
    console.log('');
    process.exit(1);
  }

  console.log(`✓ Manifest schema valid: "${result.manifest.title}" (v${result.manifest.version})`);
  console.log(`✓ Primary structure: ${result.manifest.structureType}`);
  console.log(`✓ Verified ${result.lessonsTested} lesson(s) compiled successfully with debug flags`);
  console.log('\n🎉 All tutorial checks passed! Ready for community release on GitHub.\n');
}

main().catch((err) => {
  console.error('Fatal validation error:', err);
  process.exit(1);
});
