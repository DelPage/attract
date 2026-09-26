import { gameCount, mediaUrl, type CatalogGame, type Library } from '../data';
import { matchKeyForSearch } from '../search-key';
import type { Shell } from '../shell';
import { clamp, h, revealInside, type Command, type Screen } from '../ui';
import { tile } from './library';

const MAX_RESULTS = 120;

export class SearchScreen implements Screen {
  readonly el = h('section', { class: 'screen search' });
  private readonly input = h('input', { class: 'search-input', attrs: { type: 'search', placeholder: 'Search all games', autocomplete: 'off', spellcheck: 'false' } });
  private readonly summary = h('p', { class: 'search-summary' });
  private readonly grid = h('div', { class: 'grid grid-search' });
  private readonly keys: { game: CatalogGame; key: string }[];
  private results: CatalogGame[] = [];
  private tiles: HTMLElement[] = [];
  private index = 0;
  private zone: 'input' | 'grid' = 'input';

  constructor(private readonly library: Library, private readonly shell: Shell, private readonly openGame: (game: CatalogGame, list: CatalogGame[]) => void) {
    this.keys = library.games.map((game) => ({ game, key: matchKeyForSearch(game.title) }));
    this.el.append(h('header', { class: 'search-head' }, h('h1', { class: 'library-name', text: 'Search' }), this.input), this.summary, this.grid);
    this.input.addEventListener('input', () => this.update());
    this.update();
  }

  private update(): void {
    const query = matchKeyForSearch(this.input.value);
    if (!query) {
      this.results = [];
      this.summary.textContent = `Type a name to search ${gameCount(this.library.games.length)}.`;
    } else {
      // Best-known games first, so "mario" leads with the Mario games people look for.
      const matches = this.keys.filter((k) => k.key.includes(query))
        .sort((a, b) => (b.game.fame ?? 0) - (a.game.fame ?? 0) || Number(b.key.startsWith(query)) - Number(a.key.startsWith(query)) || a.game.sortTitle.localeCompare(b.game.sortTitle));
      this.results = matches.slice(0, MAX_RESULTS).map((k) => k.game);
      const total = matches.length;
      this.summary.textContent = total ? (total > MAX_RESULTS ? `Showing ${MAX_RESULTS} of ${gameCount(total)}` : gameCount(total)) : 'No games match that name.';
    }
    const shortName = new Map(this.library.systems.map((s) => [s.id, s.shortName]));
    this.tiles = this.results.map((g) => {
      const t = tile(g);
      t.append(h('span', { class: 'tile-system', text: shortName.get(g.system) ?? '' }));
      return t;
    });
    this.grid.replaceChildren(...this.tiles);
    this.index = 0;
    this.render();
  }

  private columns(): number {
    if (this.tiles.length < 2) return 1;
    const top = this.tiles[0].offsetTop;
    const next = this.tiles.findIndex((t) => t.offsetTop !== top);
    return next === -1 ? this.tiles.length : next;
  }

  private render(): void {
    this.tiles.forEach((t, i) => t.classList.toggle('is-focused', this.zone === 'grid' && i === this.index));
    this.input.classList.toggle('is-focused', this.zone === 'input');
    if (this.zone === 'grid' && this.tiles[this.index]) {
      revealInside(this.grid, this.tiles[this.index], 60);
      this.tiles[this.index].focus({ preventScroll: true });
      const game = this.results[this.index];
      this.shell.setBackdrop(mediaUrl(game.art.screen ?? game.art.title));
    }
  }

  handle(command: Command): boolean {
    if (this.zone === 'input') {
      if (command === 'down' && this.tiles.length) { this.zone = 'grid'; this.input.blur(); this.render(); return true; }
      if (command === 'select') { this.input.focus(); return true; }
      return command !== 'back';
    }
    const cols = this.columns();
    switch (command) {
      case 'left': if (this.index % cols > 0) this.index--; break;
      case 'right': if (this.index % cols < cols - 1 && this.index < this.tiles.length - 1) this.index++; break;
      case 'up': if (this.index < cols) { this.zone = 'input'; this.input.focus(); } else this.index -= cols; break;
      case 'down': this.index = clamp(this.index + cols, 0, this.tiles.length - 1); break;
      case 'select': this.openGame(this.results[this.index], this.results); return true;
      case 'back': case 'y': this.zone = 'input'; this.input.focus(); break;
      default: return false;
    }
    this.render();
    return true;
  }

  onShow(): void { if (this.zone === 'input') window.setTimeout(() => this.input.focus(), 50); this.render(); }
  onHide(): void { this.input.blur(); }

  hints(): [string, string][] {
    return this.zone === 'input' ? [['B', 'Back'], ['A', 'Type'], ['↓', 'Results']] : [['B', 'Edit search'], ['A', 'Details']];
  }
}
