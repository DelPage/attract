/**
 * Builds output/catalog.json from the console's ROM folders (read over Device
 * Portal) plus libretro artwork indexes and metadata in media-cache.
 *
 *   npx tsx tools/library/build-catalog.ts
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Catalog, CatalogGame, CatalogSystem } from './catalog';
import { matchKey, parseName, stripTags, versionScore } from './names';
import { CONSOLE_ROMS, Portal, type PortalFile } from './portal';
import { SYSTEMS, type SystemDef } from './systems';
import { ART_KINDS, arcadeMeta, loadArcadeNames, loadArt, loadMeta, type ArtKind, type ArtSet, type GameMeta } from './sources';

interface Dump { file: PortalFile; title: string; sourceName: string; score: number; extra: boolean; meta?: GameMeta }

function portalBase(): string {
  const base = process.env.XBOX_PORTAL;
  if (!base) throw new Error('Set XBOX_PORTAL (for example in .env) to the console\'s Device Portal address.');
  return base;
}
const OUT = path.resolve(import.meta.dirname, '../../output');
const arcadeNames = loadArcadeNames();
const squash = (name: string): string => stripTags(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
/** Some arcade sets are named by squashed full title ("kingofthemonsters2") instead of the ROM short name. */
const arcadeByTitle = new Map([...arcadeNames.values()].map((e) => [squash(e.name), e] as const));
const arcadeEntry = (file: string) => {
  const base = file.toLowerCase().replace(/\.zip$/, '');
  return arcadeNames.get(base) ?? arcadeByTitle.get(squash(base));
};

const gameId = (system: string, file: string): string =>
  createHash('sha1').update(`${system}/${file.toLowerCase()}`).digest('hex').slice(0, 12);

const sortTitle = (title: string): string => title.replace(/^(the|a|an)\s+/i, '').toLowerCase();

function playableFiles(system: SystemDef, files: PortalFile[]): PortalFile[] {
  const allowed = files.filter((f) => system.extensions.includes(path.extname(f.name).slice(1).toLowerCase()));
  if (system.id !== 'psx') return allowed;
  // Disc games: one entry per game, launching disc 1 (or the .m3u when present).
  const byGame = new Map<string, PortalFile>();
  for (const f of allowed.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    const key = f.name.replace(/\s*\(Disc \d+\)/i, '').replace(/\.[^.]+$/, '');
    const current = byGame.get(key);
    if (!current || f.name.toLowerCase().endsWith('.m3u')) byGame.set(key, f);
  }
  return [...byGame.values()];
}

function toDump(system: SystemDef, file: PortalFile): Dump {
  const parsed = parseName(file.name);
  if (system.arcade) {
    const entry = arcadeEntry(file.name);
    const title = entry ? stripTags(entry.name) : file.name.replace(/\.zip$/i, '');
    const clone = entry ? /\((bootleg|hack|prototype|set \d+|.*\bver\b.*)\)/i.test(entry.name) : false;
    return { file, title, sourceName: entry?.name ?? title, score: clone ? 1 : 0, extra: !entry, meta: entry ? arcadeMeta(entry) : undefined };
  }
  const title = parsed.title.replace(/\s*\(Disc \d+\)/i, '');
  return { file, title, sourceName: file.name.replace(/\.[^.]+$/, ''), score: versionScore(parsed), extra: parsed.nonRetail };
}

function findArt(sets: ArtSet[], names: string[]): CatalogGame['artSource'] {
  for (const set of sets) {
    const found: Partial<Record<ArtKind, string>> = {};
    for (const kind of Object.keys(ART_KINDS) as ArtKind[]) {
      for (const name of names) { const hit = set.indexes[kind].find(name); if (hit) { found[kind] = hit.value; break; } }
    }
    if (found.cover || found.screen || found.title) return { set: set.set, ...found };
  }
  return { set: sets[0].set };
}

function versionLabel(d: Dump): string {
  const tags = [...d.file.name.matchAll(/[([]([^)\]]+)[)\]]/g)].map((m) => m[1]).join(', ');
  return tags || d.file.name;
}

async function buildSystem(portal: Portal, system: SystemDef): Promise<CatalogGame[]> {
  const files = playableFiles(system, await portal.systemFiles(system.folder, system.id === 'psx' ? 3 : 0));
  const art = [system.libretro, ...(system.libretroFallbacks ?? [])].map(loadArt);
  const meta = loadMeta(system);
  const groups = new Map<string, Dump[]>();
  for (const dump of files.map((f) => toDump(system, f))) {
    const key = matchKey(dump.title) || dump.file.name;
    groups.set(key, [...(groups.get(key) ?? []), dump]);
  }
  return [...groups.values()].map((dumps) => {
    const [best, ...rest] = [...dumps].sort((a, b) => a.score - b.score);
    const details = best.meta ?? meta.find(best.sourceName)?.value ?? meta.find(best.title)?.value ?? {};
    return {
      id: gameId(system.id, best.file.relPath),
      system: system.id,
      title: best.title,
      sortTitle: sortTitle(best.title),
      path: `${CONSOLE_ROMS}\\${system.folder}\\${best.file.relPath}`,
      core: system.core,
      versions: rest.map((d) => ({ label: versionLabel(d), path: `${CONSOLE_ROMS}\\${system.folder}\\${d.file.relPath}` })),
      extra: best.extra,
      ...details,
      artSource: findArt(art, [best.sourceName, best.title]),
      art: {},
    } satisfies CatalogGame;
  }).sort((a, b) => a.sortTitle.localeCompare(b.sortTitle));
}

async function main(): Promise<void> {
  const portal = new Portal(portalBase());
  const games: CatalogGame[] = [];
  const systems: CatalogSystem[] = [];
  for (const system of SYSTEMS) {
    const list = await buildSystem(portal, system);
    if (!list.length) continue;
    games.push(...list);
    const shown = list.filter((g) => !g.extra);
    systems.push({ id: system.id, name: system.name, shortName: system.shortName, maker: system.maker, year: system.year, gameCount: shown.length });
    const pct = (n: number) => `${Math.round((100 * n) / Math.max(1, shown.length))}%`;
    console.log(`${system.shortName.padEnd(14)} ${String(shown.length).padStart(5)} games (+${list.length - shown.length} extras)  cover ${pct(shown.filter((g) => g.artSource.cover).length)}  screen ${pct(shown.filter((g) => g.artSource.screen).length)}  year ${pct(shown.filter((g) => g.year).length)}  genre ${pct(shown.filter((g) => g.genre).length)}  about ${pct(shown.filter((g) => g.description).length)}`);
  }
  mkdirSync(OUT, { recursive: true });
  const catalog: Catalog = { version: 1, generatedAt: new Date().toISOString(), systems, games };
  writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify(catalog));
  console.log(`Wrote ${games.length} games across ${systems.length} systems.`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
