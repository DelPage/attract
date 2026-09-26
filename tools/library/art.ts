/**
 * Downloads cover, screenshot and title-screen art from the libretro thumbnail
 * server and stores TV-sized WebP files in output/media/<system>/.
 * Existing files are kept, so reruns only fetch what is missing.
 *
 *   npx tsx tools/library/art.ts [systemId ...]
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Catalog, CatalogArt, CatalogGame } from './catalog';
import { ART_KINDS, type ArtKind } from './sources';

const ROOT = path.resolve(import.meta.dirname, '../../output');
const CATALOG = path.join(ROOT, 'catalog.json');
const SERVER = 'https://thumbnails.libretro.com';
const CONCURRENCY = 6;
/** Longest edge in pixels for each kind at 1080p. */
const SIZE: Record<ArtKind, { width: number; height: number; quality: number }> = {
  cover: { width: 720, height: 960, quality: 82 },
  screen: { width: 960, height: 720, quality: 78 },
  title: { width: 640, height: 480, quality: 78 },
};

const relFile = (game: CatalogGame, kind: ArtKind): string => `media/${game.system}/${game.id}-${kind}.webp`;

/** Which thumbnail each saved file came from, so a changed match is downloaded again. */
const SOURCES_FILE = path.join(ROOT, 'media', 'sources.json');
const sources: Record<string, string> = existsSync(SOURCES_FILE) ? JSON.parse(readFileSync(SOURCES_FILE, 'utf8')) : {};

async function fetchArt(set: string, kind: ArtKind, file: string): Promise<Buffer | undefined> {
  const url = `${SERVER}/${encodeURIComponent(set)}/${ART_KINDS[kind]}/${encodeURIComponent(file)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (response.status === 404) return undefined;
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch { /* retried below */ }
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
  }
  throw new Error(`Could not download ${set}/${kind}/${file}`);
}

async function saveArt(game: CatalogGame, kind: ArtKind): Promise<string | undefined> {
  const source = game.artSource[kind];
  const rel = relFile(game, kind);
  const target = path.join(ROOT, rel);
  const origin = source ? `${game.artSource.set}/${source}` : '';
  if (existsSync(target) && sources[rel] === origin) return rel;
  rmSync(target, { force: true });
  delete sources[rel];
  if (!source) return undefined;
  const png = await fetchArt(game.artSource.set, kind, source);
  if (!png) return undefined;
  const { width, height, quality } = SIZE[kind];
  await sharp(png).resize({ width, height, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toFile(target);
  sources[rel] = origin;
  return rel;
}

async function main(): Promise<void> {
  const only = new Set(process.argv.slice(2));
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8')) as Catalog;
  const queue = catalog.games.filter((g) => !g.extra && (!only.size || only.has(g.system)));
  for (const system of new Set(queue.map((g) => g.system))) mkdirSync(path.join(ROOT, 'media', system), { recursive: true });
  const art = new Map<string, CatalogArt>();
  let done = 0, failed = 0;
  const worker = async (): Promise<void> => {
    for (let game = queue.shift(); game; game = queue.shift()) {
      const result: CatalogArt = {};
      for (const kind of Object.keys(ART_KINDS) as ArtKind[]) {
        try { const rel = await saveArt(game, kind); if (rel) result[kind] = rel; }
        catch (error) { failed++; console.warn((error as Error).message); }
      }
      art.set(game.id, result);
      if (++done % 200 === 0) console.log(`${done} games processed`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  writeFileSync(SOURCES_FILE, JSON.stringify(sources));
  // Re-read so descriptions written by a concurrent describe run are kept.
  const latest = JSON.parse(readFileSync(CATALOG, 'utf8')) as Catalog;
  const games = latest.games.map((g) => (art.has(g.id) ? { ...g, art: art.get(g.id)! } : g));
  writeFileSync(CATALOG, JSON.stringify({ ...latest, games }));
  console.log(`Artwork ready for ${art.size} games, ${failed} downloads failed.`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
