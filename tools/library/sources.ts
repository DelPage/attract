import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseDat, type DatEntry } from './dat';
import { NameIndex } from './match';
import type { SystemDef } from './systems';

export const CACHE = path.resolve(import.meta.dirname, '../../media-cache');
export const ART_KINDS = { cover: 'Named_Boxarts', screen: 'Named_Snaps', title: 'Named_Titles' } as const;
export type ArtKind = keyof typeof ART_KINDS;
const META_FIELDS = ['developer', 'publisher', 'genre', 'releaseyear', 'maxusers'] as const;

export interface GameMeta {
  year?: number; developer?: string; publisher?: string; genre?: string; players?: number; description?: string;
}

export interface ArtSet { set: string; indexes: Record<ArtKind, NameIndex<string>> }

function readLines(file: string): string[] {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
}

export function loadArt(set: string): ArtSet {
  const indexes = {} as Record<ArtKind, NameIndex<string>>;
  for (const [kind, folder] of Object.entries(ART_KINDS) as [ArtKind, string][]) {
    const names = readLines(path.join(CACHE, 'index', `${set}|${folder}.txt`));
    // The thumbnail server stores "&" (and other reserved characters) as "_".
    indexes[kind] = new NameIndex(names.map((file) => ({ name: file.replace(/\.png$/, '').replace(/ _ /g, ' & '), value: file })));
  }
  return { set, indexes };
}

function metaFrom(fields: Record<string, string>): GameMeta {
  const year = Number.parseInt(fields.releaseyear ?? '', 10);
  const players = Number.parseInt(fields.users ?? fields.maxusers ?? '', 10);
  return {
    year: Number.isFinite(year) && year > 1970 ? year : undefined,
    developer: fields.developer || undefined,
    publisher: fields.publisher || undefined,
    genre: fields.genre || undefined,
    players: Number.isFinite(players) && players > 0 ? players : undefined,
    description: fields.description || undefined,
  };
}

/** Merge the per-field libretro metadata files into one record per game name. */
export function loadMeta(system: SystemDef): NameIndex<GameMeta> {
  const merged = new Map<string, Record<string, string>>();
  for (const field of META_FIELDS) {
    const file = path.join(CACHE, 'meta', `${system.libretro}|${field}.dat`);
    if (!existsSync(file)) continue;
    for (const entry of parseDat(readFileSync(file, 'utf8'))) {
      merged.set(entry.name, { ...(merged.get(entry.name) ?? {}), ...entry.fields });
    }
  }
  return new NameIndex([...merged].map(([name, fields]) => ({ name, value: metaFrom(fields) })));
}

/** Arcade short ROM name → FBNeo entry (full title, year, publisher). */
export function loadArcadeNames(): Map<string, DatEntry> {
  const file = path.join(CACHE, 'meta', 'FBNeo - Arcade Games|fbneo.dat');
  const map = new Map<string, DatEntry>();
  for (const entry of parseDat(readFileSync(file, 'utf8'))) {
    if (entry.romName) map.set(entry.romName.toLowerCase().replace(/\.zip$/, ''), entry);
  }
  return map;
}

export const arcadeMeta = (entry: DatEntry): GameMeta => metaFrom(entry.fields);
