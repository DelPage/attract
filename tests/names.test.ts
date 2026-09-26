import { describe, expect, it } from 'vitest';
import { parseDat } from '../tools/library/dat';
import { NameIndex } from '../tools/library/match';
import { fixArticle, matchKey, parseName, versionScore } from '../tools/library/names';

describe('parseName', () => {
  it('reads GoodTools region and verified flags', () => {
    const p = parseName('Sim City (U) [!].zip');
    expect(p).toMatchObject({ title: 'Sim City', region: 'usa', verified: true, flawed: false, nonRetail: false });
  });

  it('marks bad dumps, hacks and public-domain demos', () => {
    expect(parseName('Team USA Basketball (U) [b1].zip').flawed).toBe(true);
    expect(parseName('Pal Edit by Gravis Zero (PD).zip').nonRetail).toBe(true);
    expect(parseName('Aq Renkan Awa (Unl) [c].zip').nonRetail).toBe(false);
  });

  it('moves a trailing article to the front', () => {
    expect(parseName('Adventures of Kid Kleets, The (U) [!].zip').title).toBe('The Adventures of Kid Kleets');
    expect(fixArticle('Legend of Zelda, The - A Link to the Past')).toBe('The Legend of Zelda - A Link to the Past');
  });

  it('prefers a verified USA dump over Europe and bad dumps', () => {
    const usa = versionScore(parseName('Gargoyles (U) [!].zip'));
    const eur = versionScore(parseName('Gargoyles (E) [!].zip'));
    const bad = versionScore(parseName('Gargoyles (U) [b1].zip'));
    expect(usa).toBeLessThan(eur);
    expect(eur).toBeLessThan(bad);
  });
});

describe('matchKey and NameIndex', () => {
  it('matches across naming schemes', () => {
    expect(matchKey('Adventures of Batman & Robin, The (USA)')).toBe(matchKey('The Adventures of Batman and Robin'));
    expect(matchKey('Final Fantasy III (USA)')).toBe(matchKey('Final Fantasy 3'));
  });

  it('picks the USA release when several regions share a title', () => {
    const index = new NameIndex(['Gargoyles (Europe)', 'Gargoyles (USA)', 'Gargoyles (Japan)'].map((name) => ({ name, value: name })));
    expect(index.find('Gargoyles')?.value).toBe('Gargoyles (USA)');
  });

  it('finds a close subtitle variant but not an unrelated short title', () => {
    const index = new NameIndex(['Star Wars - Episode I - The Phantom Menace (USA)', 'Tetris (USA)'].map((name) => ({ name, value: name })));
    expect(index.find('Star Wars - Episode I - Phantom Menace')?.value).toContain('Phantom Menace');
    expect(index.find('Tetris 2')).toBeUndefined();
  });
});

describe('parseDat', () => {
  it('reads names, fields and arcade ROM names', () => {
    const [entry] = parseDat('clrmamepro (\n\tname "x"\n)\n\ngame (\n\tname "\'88 Games"\n\treleaseyear "1988"\n\tpublisher "Konami"\n\trom ( name 88games.zip size 1 crc 00 )\n)\n');
    expect(entry).toEqual({ name: "'88 Games", fields: { name: "'88 Games", releaseyear: '1988', publisher: 'Konami' }, romName: '88games.zip' });
  });
});
