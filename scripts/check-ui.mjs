// Drives the built interface in Chrome with the real library and keyboard
// equivalents of the controller, and saves screenshots to output/screens.
//   npm run build && npm run check:ui
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'output', 'screens');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2' };

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const [base, rel] = clean.startsWith('/library/') ? [path.join(root, 'output'), clean.slice('/library/'.length)] : [path.join(root, 'dist'), clean === '/' ? 'index.html' : clean.slice(1)];
  const file = path.resolve(base, rel);
  return file.startsWith(base + path.sep) ? file : undefined;
}

const server = createServer(async (req, res) => {
  const file = resolve(req.url ?? '/');
  try {
    if (!file) throw new Error('outside');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
await mkdir(shots, { recursive: true });

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = {};

async function session(width, height, name, steps) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector('.nxe-slot.is-focused');
  await steps(page, async (label) => { await wait(1100); await page.screenshot({ path: path.join(shots, `${name}-${label}.png`) }); });
  assert(!errors.length, `${name}: page errors ${errors.join('; ')}`);
  await page.close();
}

const press = async (page, key, times = 1) => { for (let i = 0; i < times; i++) { await page.keyboard.press(key); await wait(90); } };

await session(1920, 1080, '1080p', async (page, shot) => {
  await shot('home');
  results.systems = await page.$$eval('.nxe-slot.is-system', (n) => n.map((x) => x.querySelector('.nxe-title').textContent));
  await press(page, 'ArrowRight');
  const home = await page.$eval('.nxe-slot.is-focused .nxe-title', (n) => n.textContent);
  results.homeSecond = home;
  await shot('home-snes');
  await press(page, 'Enter');
  await page.waitForSelector('.library .tile.is-focused');
  await shot('library-snes');
  await press(page, 'ArrowRight', 2); await press(page, 'ArrowDown', 2);
  results.libraryFocus = await page.$eval('.focus-title', (n) => n.textContent);
  await shot('library-snes-moved');
  await press(page, ']', 3);
  results.afterJump = await page.$eval('.focus-title', (n) => n.textContent);
  await press(page, 'Enter');
  await page.waitForSelector('.detail .action.is-focused');
  results.detailTitle = await page.$eval('.detail-title', (n) => n.textContent);
  await shot('detail');
  await press(page, 'Enter');
  await wait(3000);
  await press(page, 'x');
  results.favorited = await page.$eval('.action-favorite', (n) => n.classList.contains('is-on'));
  await press(page, 'Escape');
  await press(page, 'ArrowUp', 60);
  await press(page, 'ArrowRight');
  results.filter = await page.$eval('.chip.is-focused', (n) => n.textContent);
  await press(page, 'Enter');
  results.favoritesShown = await page.$$eval('.library .tile', (n) => n.length);
  await shot('library-favorites');
  await press(page, 'Escape', 3);
  await page.waitForSelector('.home:not(.is-behind)');
  results.channels = await page.$$eval('.nxe-channel', (n) => n.map((x) => x.textContent));
  await press(page, 'ArrowDown');
  await shot('home-recent-row');
  await press(page, 'ArrowUp');
  await shot('home-with-recent');
  await press(page, 'y');
  await page.waitForSelector('.search-input');
  await page.keyboard.type('mario');
  await wait(300);
  results.searchSummary = await page.$eval('.search-summary', (n) => n.textContent);
  await press(page, 'ArrowDown');
  await shot('search');
});

// First screen at the other sizes the owner's rules ask for.
for (const [w, h, n] of [[1280, 720, '720p'], [1440, 900, '1440x900'], [390, 844, 'phone']]) {
  await session(w, h, n, async (page, shot) => { await shot('home'); await press(page, 'ArrowRight', 3); await press(page, 'Enter'); await page.waitForSelector('.tile.is-focused'); await shot('library'); });
}

await browser.close();
server.close();
console.log(JSON.stringify(results, null, 2));
