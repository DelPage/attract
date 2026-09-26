import { gameCount, mediaUrl, metaLine, type CatalogGame, type CatalogSystem, type Library } from '../data';
import type { Shell } from '../shell';
import { isFavorite, toggleFavorite, userState } from '../store';
import { clamp, h, img, revealInside, type Command, type Screen } from '../ui';

export interface LibraryActions { openGame(game: CatalogGame, list: CatalogGame[]): void; openSearch(): void }

interface Filter { id: string; label: string; test(game: CatalogGame): boolean }

const MAX_GENRE_FILTERS = 6;

const firstLetter = (game: CatalogGame): string => {
  const c = game.sortTitle.charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
};

/** Primary genre only, e.g. "Action > Platform" and "Action" both count as Action. */
const mainGenre = (game: CatalogGame): string | undefined => game.genre?.split(/[>/,]/)[0].trim() || undefined;

export function tile(game: CatalogGame, extraClass = ''): HTMLElement {
  // No box art: show the title screen (or a screenshot) with the name over it.
  const cover = img(mediaUrl(game.art.cover), 'tile-cover')
    ?? h('span', { class: 'tile-fallback' },
      img(mediaUrl(game.art.title ?? game.art.screen), 'tile-fallback-art'),
      h('span', { class: 'tile-fallback-title', text: game.title }));
  return h('button', { class: `tile ${extraClass}`.trim(), attrs: { 'data-game': game.id } }, cover, h('span', { class: 'tile-star', attrs: { 'aria-hidden': 'true' } }));
}

export class LibraryScreen implements Screen {
  readonly el = h('section', { class: 'screen library' });
  private readonly grid = h('div', { class: 'grid' });
  private readonly chips = h('div', { class: 'chips' });
  private readonly focusTitle = h('h2', { class: 'focus-title' });
  private readonly focusMeta = h('p', { class: 'focus-meta' });
  private readonly countLabel = h('span', { class: 'library-count' });
  private readonly letter = h('div', { class: 'letter-flash' });
  private readonly all: CatalogGame[];
  private readonly filters: Filter[];
  private filterIndex = 0;
  private shown: CatalogGame[] = [];
  private tiles: HTMLElement[] = [];
  private index = 0;
  private zone: 'filters' | 'grid' = 'grid';
  private letterTimer: number | undefined;

  constructor(library: Library, private readonly system: CatalogSystem, private readonly shell: Shell, private readonly actions: LibraryActions) {
    this.all = library.bySystem.get(system.id) ?? [];
    this.filters = this.buildFilters();
    this.el.dataset.system = system.id;
    this.el.append(
      h('header', { class: 'library-head' },
        h('div', { class: 'library-heading' }, h('h1', { class: 'library-name', text: system.name }), this.countLabel),
        this.chips),
      h('div', { class: 'focus-info' }, this.focusTitle, this.focusMeta),
      this.grid,
      this.letter,
    );
    this.applyFilter();
  }

  private buildFilters(): Filter[] {
    const counts = new Map<string, number>();
    for (const g of this.all) { const genre = mainGenre(g); if (genre) counts.set(genre, (counts.get(genre) ?? 0) + 1); }
    const genres = [...counts].filter(([, n]) => n >= 8).sort((a, b) => b[1] - a[1]).slice(0, MAX_GENRE_FILTERS).map(([g]) => g);
    return [
      { id: 'all', label: 'All games', test: () => true },
      { id: 'favorites', label: 'Favorites', test: (g) => isFavorite(g.id) },
      { id: 'recent', label: 'Recently played', test: (g) => userState().recent.some((r) => r.id === g.id) },
      ...genres.sort().map((genre) => ({ id: `genre:${genre}`, label: genre, test: (g: CatalogGame) => mainGenre(g) === genre })),
    ];
  }

  private applyFilter(keepId?: string): void {
    const filter = this.filters[this.filterIndex];
    this.shown = this.all.filter(filter.test);
    if (filter.id === 'recent') {
      const order = new Map(userState().recent.map((r, i) => [r.id, i]));
      this.shown.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    }
    this.tiles = this.shown.map((g) => tile(g, isFavorite(g.id) ? 'is-favorite' : ''));
    this.grid.replaceChildren(...(this.tiles.length ? this.tiles : [h('p', { class: 'empty', text: this.emptyText(filter.id) })]));
    this.chips.replaceChildren(...this.filters.map((f, i) => h('span', { class: `chip${i === this.filterIndex ? ' is-selected' : ''}`, text: f.label })));
    this.countLabel.textContent = gameCount(this.shown.length);
    const kept = keepId ? this.shown.findIndex((g) => g.id === keepId) : -1;
    this.index = kept >= 0 ? kept : 0;
    if (!this.tiles.length) this.zone = 'filters';
    this.grid.scrollTop = 0;
    this.render();
  }

  private emptyText(id: string): string {
    if (id === 'favorites') return 'Press X on any game to add it to your favorites.';
    if (id === 'recent') return 'Games you play will show up here.';
    return 'No games here yet.';
  }

  private columns(): number {
    if (this.tiles.length < 2) return 1;
    const top = this.tiles[0].offsetTop;
    const next = this.tiles.findIndex((t) => t.offsetTop !== top);
    return next === -1 ? this.tiles.length : next;
  }

  private render(): void {
    this.tiles.forEach((t, i) => t.classList.toggle('is-focused', this.zone === 'grid' && i === this.index));
    [...this.chips.children].forEach((c, i) => c.classList.toggle('is-focused', this.zone === 'filters' && i === this.filterIndex));
    this.el.classList.toggle('in-filters', this.zone === 'filters');
    const game = this.shown[this.index];
    if (this.zone === 'grid' && game) {
      const t = this.tiles[this.index];
      t.focus({ preventScroll: true });
      revealInside(this.grid, t, 60);
      this.focusTitle.textContent = game.title;
      this.focusMeta.textContent = metaLine(game).join(' · ');
      this.shell.setBackdrop(mediaUrl(game.art.screen ?? game.art.title));
    } else {
      this.focusTitle.textContent = this.filters[this.filterIndex].label;
      this.focusMeta.textContent = gameCount(this.shown.length);
    }
  }

  private jumpLetter(direction: 1 | -1): void {
    if (!this.shown.length) return;
    const current = firstLetter(this.shown[this.index]);
    let i = this.index;
    if (direction === 1) { while (i < this.shown.length - 1 && firstLetter(this.shown[i]) === current) i++; }
    else {
      while (i > 0 && firstLetter(this.shown[i - 1]) === current) i--;
      if (i === this.index && i > 0) { const prev = firstLetter(this.shown[i - 1]); while (i > 0 && firstLetter(this.shown[i - 1]) === prev) i--; }
    }
    this.index = i;
    this.letter.textContent = firstLetter(this.shown[i]);
    this.letter.classList.add('is-on');
    window.clearTimeout(this.letterTimer);
    this.letterTimer = window.setTimeout(() => this.letter.classList.remove('is-on'), 700);
    this.render();
  }

  handle(command: Command): boolean {
    if (this.zone === 'filters') return this.handleFilters(command);
    const cols = this.columns();
    const last = this.shown.length - 1;
    switch (command) {
      case 'left': if (this.index % cols > 0) this.index--; break;
      case 'right': if (this.index % cols < cols - 1 && this.index < last) this.index++; break;
      case 'up': if (this.index < cols) { this.zone = 'filters'; } else this.index -= cols; break;
      case 'down': if (this.index + cols <= last) this.index += cols; else if (Math.floor(this.index / cols) < Math.floor(last / cols)) this.index = last; break;
      case 'lb': case 'rb': this.jumpLetter(command === 'rb' ? 1 : -1); return true;
      case 'select': this.actions.openGame(this.shown[this.index], this.shown); return true;
      case 'x': this.toggleFavorite(); return true;
      case 'y': this.actions.openSearch(); return true;
      default: return false;
    }
    this.render();
    return true;
  }

  private handleFilters(command: Command): boolean {
    switch (command) {
      case 'left': case 'right':
        this.filterIndex = clamp(this.filterIndex + (command === 'left' ? -1 : 1), 0, this.filters.length - 1);
        this.applyFilter();
        this.zone = 'filters';
        break;
      case 'down': case 'select': if (this.tiles.length) this.zone = 'grid'; break;
      case 'y': this.actions.openSearch(); return true;
      case 'back': if (this.filterIndex === 0) return false; this.filterIndex = 0; this.applyFilter(); this.zone = 'filters'; break;
      case 'up': return true;
      default: return false;
    }
    this.render();
    return true;
  }

  private toggleFavorite(): void {
    const game = this.shown[this.index];
    if (!game) return;
    const on = toggleFavorite(game.id);
    this.tiles[this.index].classList.toggle('is-favorite', on);
  }

  onShow(): void {
    const keep = this.shown[this.index]?.id;
    this.tiles.forEach((t, i) => t.classList.toggle('is-favorite', isFavorite(this.shown[i].id)));
    if (this.filters[this.filterIndex].id !== 'all') this.applyFilter(keep);
    else this.render();
  }

  hints(): [string, string][] {
    if (this.zone === 'filters') return [['B', 'Back'], ['Y', 'Search'], ['A', 'Show games']];
    const fav = this.shown[this.index] && isFavorite(this.shown[this.index].id) ? 'Remove favorite' : 'Favorite';
    return [['B', 'Back'], ['LB/RB', 'Jump letter'], ['X', fav], ['Y', 'Search'], ['A', 'Details']];
  }
}
