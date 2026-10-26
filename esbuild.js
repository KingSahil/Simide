const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

async function build() {
  // Ensure dist directory exists
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
  }

  // Copy webview static files (index.html, styles.css)
  if (fs.existsSync('webview/index.html')) {
    fs.copyFileSync('webview/index.html', 'dist/webview.html');
  }
  if (fs.existsSync('webview/styles.css')) {
    fs.copyFileSync('webview/styles.css', 'dist/webview.css');
  }

  // Extension host bundle (Node)
  const extContext = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: false,
    sourcemap: true,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
  });

  // CLI Validator bundle (Node)
  const cliContext = await esbuild.context({
    entryPoints: ['src/cli/validator.ts'],
    bundle: true,
    format: 'cjs',
    minify: false,
    sourcemap: true,
    platform: 'node',
    outfile: 'dist/cli/validator.js',
    external: ['vscode'],
    logLevel: 'info',
  });

  // Webview bundle (Browser)
  const webviewContext = await esbuild.context({
    entryPoints: ['webview/app.ts'],
    bundle: true,
    format: 'iife',
    minify: false,
    sourcemap: true,
    platform: 'browser',
    outfile: 'dist/webview.js',
    logLevel: 'info',
  });

  if (isWatch) {
    console.log('[esbuild] Watching for changes...');
    await extContext.watch();
    await cliContext.watch();
    await webviewContext.watch();
  } else {
    await extContext.rebuild();
    await cliContext.rebuild();
    await webviewContext.rebuild();
    await extContext.dispose();
    await cliContext.dispose();
    await webviewContext.dispose();
    console.log('[esbuild] Build complete.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
