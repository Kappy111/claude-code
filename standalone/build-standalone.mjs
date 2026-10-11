// Builds vidtotext-standalone.html: a single self-contained HTML file with the
// CSS and all JS inlined, transcription running on the main thread (no Web
// Worker) so it works even when opened directly from disk.
//
// Usage (from the repo root):
//   npx esbuild@0.24.0 --version   # ensure esbuild is available
//   node standalone/build-standalone.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-'));
const jsDir = path.join(tmp, 'js');

// Copy js/ and swap transcribe.js for the main-thread version.
fs.cpSync(path.join(ROOT, 'js'), jsDir, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'standalone', 'transcribe-main.js'), path.join(jsDir, 'transcribe.js'));

// Bundle, keeping the transformers CDN import external (loaded at runtime).
const bundlePath = path.join(tmp, 'app.bundle.js');
execFileSync('npx', ['esbuild@0.24.0', path.join(jsDir, 'app.js'), '--bundle', '--format=esm',
  '--external:https://*', '--outfile=' + bundlePath], { stdio: 'inherit' });

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
const bundle = fs.readFileSync(bundlePath, 'utf8');

html = html.replace(/<link rel="stylesheet" href="css\/styles.css" \/>/, '<style>\n' + css + '\n</style>');
html = html.replace(/<script type="module" src="js\/app.js"><\/script>/, '<script type="module">\n' + bundle + '\n</script>');
html = html.replace('<title>VidToText',
  '<!-- VidToText single-file standalone. Open in Chrome/Edge; needs internet for the Whisper model on first run. -->\n  <title>VidToText');

fs.writeFileSync(path.join(ROOT, 'vidtotext-standalone.html'), html);
console.log('Wrote vidtotext-standalone.html (' + (fs.statSync(path.join(ROOT, 'vidtotext-standalone.html')).size / 1024).toFixed(0) + ' KB)');
