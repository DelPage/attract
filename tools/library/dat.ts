/** Minimal clrmamepro .dat reader for libretro-database metadata files. */

export interface DatEntry {
  /** No-Intro / Redump / arcade display name. */
  name: string;
  fields: Record<string, string>;
  /** ROM file name inside the entry, when present (arcade short names). */
  romName?: string;
}

const FIELD = /^\s*(\w+)\s+(?:"((?:[^"\\]|\\.)*)"|(\S+))\s*$/;

export function parseDat(text: string): DatEntry[] {
  const entries: DatEntry[] = [];
  const blocks = text.split(/\n(?=game \()/);
  for (const block of blocks) {
    if (!block.startsWith('game (')) continue;
    const fields: Record<string, string> = {};
    let romName: string | undefined;
    for (const line of block.split('\n')) {
      const rom = /^\s*rom \(.*?\bname\s+("([^"]+)"|(\S+))/.exec(line);
      if (rom) { romName ??= rom[2] ?? rom[3]; continue; }
      const m = FIELD.exec(line);
      if (m && m[3] !== '(' && !(m[1] in fields)) fields[m[1]] = (m[2] ?? m[3]).replace(/\\"/g, '"');
    }
    const name = fields.name ?? fields.comment;
    if (name) entries.push({ name, fields, romName });
  }
  return entries;
}
