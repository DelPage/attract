/**
 * Home screen card art for each system: a cut-out console photo and the
 * system's logo in white. Photos and logos come from Wikimedia Commons
 * (public domain, or CC licensed and credited in output/credits.txt).
 * Writes output/media/systems/<id>-console.webp and <id>-logo.png.
 *
 *   npx tsx tools/library/consoles.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CACHE } from './sources';

const OUT = path.resolve(import.meta.dirname, '../../output/media/systems');
const HEADERS = { 'User-Agent': 'AttractLibraryBuilder/0.1 (personal game library; https://github.com/DelPage)' };
const CONSOLE_WIDTH = 1100;
const LOGO_HEIGHT = 180;

interface Source {
  photo: string;
  logo?: string;
  /** Photo has a white studio background instead of transparency. */
  whiteBackground?: boolean;
  /** Logo is built on filled shapes, so it keeps its own colors instead of turning white. */
  logoInColor?: boolean;
}

export const SYSTEM_ART: Record<string, Source> = {
  nes: { photo: 'NES-Console-Set.png', logo: 'NES logo.svg', whiteBackground: true, logoInColor: true },
  snes: { photo: 'SNES-Mod1-Console-Set.png', logo: 'Super Nintendo Entertainment System logo.svg' },
  n64: { photo: 'N64-Console-Set.png', logo: 'Nintendo 64 wordmark.svg' },
  gba: { photo: 'Nintendo-Game-Boy-Advance-Purple-FL.png', logo: 'Game Boy Advance logo.svg', logoInColor: true },
  genesis: { photo: 'Sega-Genesis-Mod1-Set.png', logo: 'Sega genesis logo.svg', logoInColor: true },
  mastersystem: { photo: 'Sega-Master-System-Set.png', logo: 'Master System Logo.svg' },
  pcengine: { photo: 'TurboGrafx16-Console-Set.png' },
  atari2600: { photo: 'Atari-2600-Wood-4Sw-Set.png', logo: 'Logo Atari 2600.svg' },
  psx: { photo: 'PSX-Console-wController.png', logo: 'PlayStation wordmark (1994-2009).svg' },
  arcade: { photo: 'Borne arcade Pacman.png' },
};

interface FileInfo { url: string; page: string; license: string; artist: string }

async function fileInfo(file: string, width?: number): Promise<FileInfo> {
  const params = new URLSearchParams({ action: 'query', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|extmetadata', format: 'json', formatversion: '2' });
  if (width) params.set('iiurlwidth', String(width));
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Commons lookup failed for ${file}: HTTP ${response.status}`);
  const info = (await response.json()).query.pages[0].imageinfo?.[0];
  if (!info) throw new Error(`Commons has no file named ${file}`);
  const meta = info.extmetadata ?? {};
  return {
    url: width ? info.thumburl ?? info.url : info.url,
    page: info.descriptionurl,
    license: meta.LicenseShortName?.value ?? 'unknown',
    artist: String(meta.Artist?.value ?? '').replace(/<[^>]+>/g, '').trim(),
  };
}

async function cached(name: string, url: string): Promise<Buffer> {
  const file = path.join(CACHE, 'consoles', 'src', name);
  if (existsSync(file)) return readFileSync(file);
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Download failed for ${name}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
  return data;
}

/** Make the white studio background transparent, starting from the edges so light consoles keep their color. */
async function removeWhite(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const isWhite = (i: number) => data[i * 4] > 246 && data[i * 4 + 1] > 246 && data[i * 4 + 2] > 246;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i] || !isWhite(i)) continue;
    seen[i] = 1;
    data[i * 4 + 3] = 0;
    const x = i % width;
    if (x > 0) stack.push(i - 1);
    if (x < width - 1) stack.push(i + 1);
    if (i >= width) stack.push(i - width);
    if (i < width * (height - 1)) stack.push(i + width);
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function consoleImage(id: string, source: Source, info: FileInfo): Promise<Buffer> {
  let png = await cached(`${id}-photo${path.extname(source.photo)}`, info.url);
  if (source.whiteBackground) png = await removeWhite(png);
  return sharp(png).trim({ threshold: 1 }).resize({ width: CONSOLE_WIDTH, height: CONSOLE_WIDTH, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 100 }).toBuffer();
}

/** The logo's shape in solid white, so every card reads the same over its brand colors. */
async function logoImage(id: string, info: FileInfo, inColor = false): Promise<Buffer> {
  const svg = await cached(`${id}-logo.svg`, info.url);
  const { data, info: size } = await sharp(svg, { density: 400 }).resize({ height: LOGO_HEIGHT * 2, fit: 'inside' })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (!inColor) for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; }
  const white = await sharp(data, { raw: { width: size.width, height: size.height, channels: 4 } }).png().toBuffer();
  return sharp(white).trim({ threshold: 1 }).resize({ height: LOGO_HEIGHT }).png().toBuffer();
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const credits: string[] = ['Console photos and logos from Wikimedia Commons:', ''];
  for (const [id, source] of Object.entries(SYSTEM_ART)) {
    const photo = await fileInfo(source.photo, 1920);
    writeFileSync(path.join(OUT, `${id}-console.webp`), await consoleImage(id, source, photo));
    credits.push(`${source.photo}: ${photo.license}${photo.artist ? `, ${photo.artist}` : ''}, ${photo.page}`);
    if (source.logo) {
      const logo = await fileInfo(source.logo);
      writeFileSync(path.join(OUT, `${id}-logo.png`), await logoImage(id, logo, source.logoInColor));
      credits.push(`${source.logo}: ${logo.license}${logo.artist ? `, ${logo.artist}` : ''}, ${logo.page}`);
    }
    console.log(`${id}: ${photo.license}`);
  }
  writeFileSync(path.resolve(OUT, '../../credits.txt'), `${credits.join('\n')}\n`);
}

if (process.argv[1]?.endsWith('consoles.ts')) main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
