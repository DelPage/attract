/**
 * Console photos for the home screen system cards. Downloads each photo from
 * Wikimedia Commons (public domain, or CC BY where noted and credited),
 * trims the studio margins and fits it edge to edge in the card shape.
 * Writes output/media/systems/<id>.webp and output/credits.txt.
 *
 *   npx tsx tools/library/consoles.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CACHE } from './sources';

const OUT = path.resolve(import.meta.dirname, '../../output');
const HEADERS = { 'User-Agent': 'AttractLibraryBuilder/0.1 (personal game library; https://github.com/DelPage)' };
/** Card shape on the home screen (width / height) and output width in pixels. */
const CARD_ASPECT = 1.6;
const WIDTH = 800;
/** Share of the card the console may fill, so it never touches the rounded edge. */
const FILL = 0.9;

export const CONSOLE_PHOTOS: Record<string, string> = {
  nes: 'NES-Console-Set.jpg',
  snes: 'SNES-Mod1-Console-Set.jpg',
  n64: 'N64-Console-Set.jpg',
  gba: 'Nintendo-Game-Boy-Advance-Purple-FL.jpg',
  genesis: 'Sega-Genesis-Mod1-Set.jpg',
  mastersystem: 'Sega-Master-System-Set.jpg',
  pcengine: 'NEC-TurboGrafx-16-Console-FL.jpg',
  atari2600: 'Atari-2600-Wood-4Sw-Set.jpg',
  psx: 'PSX-Console-wController.jpg',
  arcade: 'Borne arcade Pacman.png',
};

/** Tall subjects keep only their top part (marquee, screen, controls) so they fill a wide card. */
const KEEP_TOP: Record<string, number> = { arcade: 0.56 };

interface PhotoInfo { url: string; page: string; license: string; artist: string }

async function photoInfo(file: string): Promise<PhotoInfo> {
  const params = new URLSearchParams({
    action: 'query', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1800', format: 'json', formatversion: '2',
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Commons lookup failed for ${file}: HTTP ${response.status}`);
  const info = (await response.json()).query.pages[0].imageinfo[0];
  const meta = info.extmetadata ?? {};
  return {
    url: info.thumburl ?? info.url,
    page: info.descriptionurl,
    license: meta.LicenseShortName?.value ?? 'unknown',
    artist: String(meta.Artist?.value ?? '').replace(/<[^>]+>/g, '').trim(),
  };
}

async function original(id: string, info: PhotoInfo): Promise<Buffer> {
  const cached = path.join(CACHE, 'consoles', `${id}.source`);
  if (existsSync(cached)) return readFileSync(cached);
  const response = await fetch(info.url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Photo download failed for ${id}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  mkdirSync(path.dirname(cached), { recursive: true });
  writeFileSync(cached, data);
  return data;
}

/** Trim the white studio margin, then center the console on white in the card shape. */
async function cardImage(source: Buffer, keepTop = 1): Promise<Buffer> {
  const flat = await sharp(source).flatten({ background: '#ffffff' }).trim({ background: '#ffffff', threshold: 18 }).toBuffer({ resolveWithObject: true });
  const kept = keepTop < 1
    ? await sharp(flat.data).extract({ left: 0, top: 0, width: flat.info.width, height: Math.round(flat.info.height * keepTop) }).toBuffer()
    : flat.data;
  const height = Math.round(WIDTH / CARD_ASPECT);
  const fitted = await sharp(kept).resize({ width: Math.round(WIDTH * FILL), height: Math.round(height * FILL), fit: 'inside' }).toBuffer();
  const { width: w = 0, height: h = 0 } = await sharp(fitted).metadata();
  return sharp({ create: { width: WIDTH, height, channels: 3, background: '#ffffff' } })
    .composite([{ input: fitted, left: Math.round((WIDTH - w) / 2), top: Math.round((height - h) / 2) }])
    .webp({ quality: 86 })
    .toBuffer();
}

async function main(): Promise<void> {
  mkdirSync(path.join(OUT, 'media', 'systems'), { recursive: true });
  const credits: string[] = ['Console photos from Wikimedia Commons:', ''];
  for (const [id, file] of Object.entries(CONSOLE_PHOTOS)) {
    const info = await photoInfo(file);
    writeFileSync(path.join(OUT, 'media', 'systems', `${id}.webp`), await cardImage(await original(id, info), KEEP_TOP[id]));
    credits.push(`${file}: ${info.license}${info.artist ? `, ${info.artist}` : ''}, ${info.page}`);
    console.log(`${id}: ${info.license}`);
  }
  writeFileSync(path.join(OUT, 'credits.txt'), `${credits.join('\n')}\n`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
