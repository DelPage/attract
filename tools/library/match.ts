import { matchKey, parseName, versionScore } from './names';

/**
 * Index of database / artwork names keyed by normalized title, so a dump
 * named "Sim City (U) [!]" finds "SimCity (USA)".
 */
export class NameIndex<T> {
  private readonly byKey = new Map<string, { name: string; value: T }[]>();
  private readonly keys: string[] = [];

  constructor(items: Iterable<{ name: string; value: T }>) {
    for (const item of items) {
      const key = matchKey(item.name);
      if (!key) continue;
      const list = this.byKey.get(key);
      if (list) list.push(item);
      else { this.byKey.set(key, [item]); this.keys.push(key); }
    }
  }

  get size(): number { return this.byKey.size; }

  /** Best candidate for a title, preferring the same region family and retail releases. */
  find(title: string): { name: string; value: T } | undefined {
    const key = matchKey(title);
    if (!key) return undefined;
    const exact = this.byKey.get(key);
    if (exact) return best(exact);
    const loose = this.looseKey(key);
    return loose ? best(this.byKey.get(loose)!) : undefined;
  }

  /** One-sided prefix match for subtitle differences, only when it is close in length. */
  private looseKey(key: string): string | undefined {
    if (key.length < 6) return undefined;
    let chosen: string | undefined;
    for (const candidate of this.keys) {
      const [short, long] = candidate.length < key.length ? [candidate, key] : [key, candidate];
      if (short.length < 6 || !long.startsWith(short) || short.length / long.length < 0.72) continue;
      // A trailing number or a short tail is a different game in the series ("Tetris" vs "Tetris 2").
      const tail = long.slice(short.length);
      if (tail.length < 4 || /^\d/.test(tail)) continue;
      if (!chosen || Math.abs(candidate.length - key.length) < Math.abs(chosen.length - key.length)) chosen = candidate;
    }
    return chosen;
  }
}

function best<T>(list: { name: string; value: T }[]): { name: string; value: T } {
  return list.reduce((a, b) => (versionScore(parseName(b.name)) < versionScore(parseName(a.name)) ? b : a));
}
