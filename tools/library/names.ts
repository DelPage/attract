/**
 * Filename parsing for GoodTools ("Title (U) [!]") and No-Intro
 * ("Title (USA) (Rev 1)") naming, plus the normalized key used to match a
 * dump against cover art and metadata databases.
 */

export type Region = 'usa' | 'world' | 'europe' | 'japan' | 'other' | 'unknown';

export interface ParsedName {
  title: string;
  region: Region;
  /** Known-good dump ([!]). */
  verified: boolean;
  /** Bad dump, hack, overdump, trainer, pirate, fixed or alternate dump. */
  flawed: boolean;
  /** Homebrew, public-domain demo, utility, beta, prototype or sample. */
  nonRetail: boolean;
  translated: boolean;
}

const REGION_CODES: Record<string, Region> = {
  u: 'usa', usa: 'usa', '4': 'usa', ue: 'usa', ju: 'usa', uj: 'usa', 'usa, europe': 'usa',
  w: 'world', world: 'world', jue: 'world',
  e: 'europe', europe: 'europe', eu: 'europe', uk: 'europe', g: 'europe', f: 'europe', s: 'europe', i: 'europe',
  j: 'japan', japan: 'japan', 'japan, usa': 'usa',
};

const NON_RETAIL = /\b(pd|homebrew|demo|beta|proto|prototype|sample|test|program|utility|hack)\b/i;
const FLAWED_BRACKET = /^(b\d*|h\w*|o\d*|t\d*|p\d*|f\d*|a\d*|bf|x)$/i;

export function stripTags(name: string): string {
  return name
    .replace(/\.[a-z0-9]{1,4}$/i, '')
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Adventures of Kid Kleets, The" → "The Adventures of Kid Kleets" */
export function fixArticle(title: string): string {
  const m = /^(.*?),\s*(The|A|An)(\s*-\s*.*|:.*)?$/i.exec(title);
  if (!m) return title;
  return `${m[2]} ${m[1]}${m[3] ?? ''}`.trim();
}

function regionOf(tags: string[]): Region {
  for (const tag of tags) {
    const hit = REGION_CODES[tag.toLowerCase()];
    if (hit) return hit;
  }
  if (tags.some((t) => /^[a-z]{2,}(, [a-z]{2,})+$/i.test(t))) return 'other';
  return 'unknown';
}

export function parseName(file: string): ParsedName {
  const base = file.replace(/\.[a-z0-9]{1,4}$/i, '');
  const paren = [...base.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim());
  const bracket = [...base.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1].trim());
  return {
    title: fixArticle(stripTags(file)),
    region: regionOf(paren),
    verified: bracket.includes('!'),
    flawed: bracket.some((b) => FLAWED_BRACKET.test(b)),
    nonRetail: paren.some((p) => NON_RETAIL.test(p)),
    translated: bracket.some((b) => /^T[+-]/i.test(b)),
  };
}

/** Key used for matching across naming schemes. */
export function matchKey(title: string): string {
  return fixArticle(stripTags(title))
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\bii\b/g, '2').replace(/\biii\b/g, '3').replace(/\biv\b/g, '4')
    .replace(/[^a-z0-9]+/g, '');
}

export const REGION_RANK: Record<Region, number> = { usa: 0, world: 1, unknown: 2, europe: 3, other: 4, japan: 5 };

/** Lower is better when picking the version to show for a title. */
export function versionScore(p: ParsedName): number {
  return (p.flawed ? 100 : 0) + (p.nonRetail ? 50 : 0) + (p.translated ? 20 : 0)
    + REGION_RANK[p.region] * 2 + (p.verified ? 0 : 1);
}
