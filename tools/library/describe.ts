/**
 * Adds a short "About" paragraph to games from the English Wikipedia lead
 * section. Only accepts an article whose title matches the game and whose
 * text is about a video game. Results are cached, so reruns are cheap.
 *
 *   npx tsx tools/library/describe.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Catalog, CatalogGame } from './catalog';
import { matchKey } from './names';
import { CACHE } from './sources';
import { systemById } from './systems';

const CATALOG = path.resolve(import.meta.dirname, '../../output/catalog.json');
const CACHE_FILE = path.join(CACHE, 'wiki.json');
const API = 'https://en.wikipedia.org/w/api.php';
const HEADERS = { 'User-Agent': 'AttractLibraryBuilder/0.1 (personal game library; https://github.com/DelPage)' };
const CONCURRENCY = 2;
const MAX_CHARS = 900;

type CacheEntry = { page?: string; text?: string; length?: number };
const cache: Record<string, CacheEntry> = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};

async function api(params: Record<string, string>): Promise<any> {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
    if (response.ok) return response.json();
    if (response.status !== 429 && response.status < 500) throw new Error(`Wikipedia HTTP ${response.status}`);
    await new Promise((r) => setTimeout(r, 3000 * 2 ** attempt));
  }
  throw new Error('Wikipedia unavailable');
}

const baseTitle = (page: string): string => page.replace(/\s*\([^)]*\)\s*$/, '');

function trimLead(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_CHARS) return clean;
  const cut = clean.slice(0, MAX_CHARS);
  return cut.slice(0, cut.lastIndexOf('. ') + 1) || `${cut}…`;
}

async function describe(game: CatalogGame): Promise<CacheEntry> {
  const system = systemById(game.system)!;
  const search = await api({ action: 'query', list: 'search', srlimit: '6', srsearch: `${game.title} ${system.name} video game` });
  const want = matchKey(game.title);
  const pages: string[] = (search.query?.search ?? []).map((r: { title: string }) => r.title)
    .filter((t: string) => matchKey(baseTitle(t)) === want && !/^List of/i.test(t));
  if (!pages.length) return {};
  const body = await api({ action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', redirects: '1', titles: pages.join('|') });
  for (const page of pages) {
    const hit = (body.query?.pages ?? []).find((p: { title: string }) => p.title === page);
    const text: string | undefined = hit?.extract;
    if (text && /video game|arcade game|game developed|game published/i.test(text.slice(0, 400))) return { page, text: trimLead(text) };
  }
  return {};
}

/** Article length for every matched page, 50 titles per request. */
async function addArticleLengths(): Promise<void> {
  const missing = Object.values(cache).filter((e) => e.page && e.length === undefined);
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    const body = await api({ action: 'query', prop: 'info', redirects: '1', titles: batch.map((e) => e.page!).join('|') });
    const lengths = new Map<string, number>((body.query?.pages ?? []).map((p: { title: string; length?: number }) => [p.title, p.length ?? 0]));
    for (const entry of batch) entry.length = lengths.get(entry.page!) ?? 0;
  }
}

async function main(): Promise<void> {
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8')) as Catalog;
  const todo = catalog.games.filter((g) => !g.extra && !g.description && !(g.id in cache));
  console.log(`${todo.length} games to look up (${Object.keys(cache).length} cached).`);
  let done = 0;
  const worker = async (): Promise<void> => {
    for (let game = todo.shift(); game; game = todo.shift()) {
      try { cache[game.id] = await describe(game); } catch (error) { console.warn(`${game.title}: ${(error as Error).message}`); }
      if (++done % 100 === 0) { writeFileSync(CACHE_FILE, JSON.stringify(cache)); console.log(`${done} looked up`); }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await addArticleLengths();
  writeFileSync(CACHE_FILE, JSON.stringify(cache));
  // Re-read so artwork written by a concurrent art run is kept.
  const latest = JSON.parse(readFileSync(CATALOG, 'utf8')) as Catalog;
  const games = latest.games.map((g) => {
    const hit = cache[g.id];
    if (!hit?.text) return g;
    return { ...g, description: g.description ?? hit.text, fame: hit.length };
  });
  writeFileSync(CATALOG, JSON.stringify({ ...latest, games }));
  const shown = games.filter((g) => !g.extra);
  console.log(`About text for ${shown.filter((g) => g.description).length} of ${shown.length} games.`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
