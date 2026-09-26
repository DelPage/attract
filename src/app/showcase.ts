import type { CatalogGame } from './data';

/** Stable pseudo-random order so the same system always shows the same picks. */
export function seeded<T>(items: T[], seed: string): T[] {
  let x = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const next = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return items.map((item) => ({ item, k: next() })).sort((a, b) => a.k - b.k).map((e) => e.item);
}

const SHOWCASE_POOL = 24;

/** Well-known games first (longest encyclopedia articles), shuffled within that pool for variety. */
export function showcase(games: CatalogGame[], seed: string, count: number, needs: 'cover' | 'screen'): CatalogGame[] {
  const withArt = games.filter((g) => g.art[needs]);
  const famous = [...withArt].sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0)).slice(0, Math.max(count, SHOWCASE_POOL));
  return seeded(famous, seed).slice(0, count);
}
