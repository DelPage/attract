import type { Catalog, CatalogGame, CatalogSystem, CatalogVersion } from '../../tools/library/catalog';

export type { Catalog, CatalogGame, CatalogSystem, CatalogVersion };

/** The native host serves the library from its own storage; the browser preview serves it beside the page. */
export const LIBRARY_BASE: string = (window as unknown as { ATTRACT_LIBRARY?: string }).ATTRACT_LIBRARY ?? 'library/';

export interface Library {
  systems: CatalogSystem[];
  games: CatalogGame[];
  byId: Map<string, CatalogGame>;
  bySystem: Map<string, CatalogGame[]>;
}

export async function loadLibrary(): Promise<Library> {
  const response = await fetch(`${LIBRARY_BASE}catalog.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error('library-missing');
  const catalog = (await response.json()) as Catalog;
  if (catalog.version !== 1 || !Array.isArray(catalog.games)) throw new Error('library-invalid');
  const games = catalog.games.filter((g) => !g.extra);
  const bySystem = new Map<string, CatalogGame[]>();
  for (const game of games) bySystem.set(game.system, [...(bySystem.get(game.system) ?? []), game]);
  const systems = catalog.systems.filter((s) => bySystem.has(s.id));
  return { systems, games, byId: new Map(games.map((g) => [g.id, g])), bySystem };
}

export const mediaUrl = (rel: string | undefined): string | undefined => (rel ? `${LIBRARY_BASE}${rel}` : undefined);

/** Words for the game count, e.g. "735 games". */
export const gameCount = (n: number): string => `${n.toLocaleString()} ${n === 1 ? 'game' : 'games'}`;

export function metaLine(game: CatalogGame): string[] {
  return [
    game.year ? String(game.year) : '',
    game.genre ?? '',
    game.players ? (game.players === 1 ? '1 player' : `1 to ${game.players} players`) : '',
  ].filter(Boolean);
}
