// Bundles the TV interface into dist/. The game library (catalog + art) is
// generated separately by tools/library and lives beside it as library/.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
await rm('dist', { recursive: true, force: true });
await mkdir('dist/fonts', { recursive: true });
await build({ entryPoints: ['src/app/main.ts'], outfile: 'dist/app.js', bundle: true, format: 'iife', platform: 'browser', target: 'chrome110', minify: true });
await writeFile('dist/style.css', (await Promise.all(['src/app/style.css', 'src/app/home.css'].map((f) => readFile(f, 'utf8')))).join('\n'));
await cp('public', 'dist', { recursive: true });
for (const weight of [400, 500, 700]) {
  await cp(`node_modules/@fontsource/roboto/files/roboto-latin-${weight}-normal.woff2`, `dist/fonts/roboto-latin-${weight}-normal.woff2`);
}
await cp('node_modules/@fontsource/roboto/LICENSE', 'dist/fonts/LICENSE-Roboto.txt');
console.log('Built dist/.');
