import { gameCount, mediaUrl, type CatalogGame, type CatalogSystem, type Library } from '../data';
import type { Shell } from '../shell';
import { userState } from '../store';
import { clamp, h, img, revealInside, type Command, type Screen } from '../ui';

const ATTRACT_INTERVAL_MS = 6000;

export interface HomeActions {
  openSystem(system: CatalogSystem): void;
  openGame(game: CatalogGame): void;
  openSearch(): void;
}

/** Stable pseudo-random order so the same system always shows the same picks. */
function seeded<T>(items: T[], seed: string): T[] {
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

interface Row { kind: 'systems' | 'recent'; items: HTMLElement[]; index: number; track: HTMLElement }

export class HomeScreen implements Screen {
  readonly el = h('section', { class: 'screen home' });
  private readonly title = h('h1', { class: 'home-title' });
  private readonly detail = h('p', { class: 'home-detail' });
  private readonly rows: Row[] = [];
  private rowIndex = 0;
  private attractTimer: number | undefined;
  private attractFrames: string[] = [];
  private attractIndex = 0;

  constructor(private readonly library: Library, private readonly shell: Shell, private readonly actions: HomeActions) {
    this.el.append(
      h('header', { class: 'topbar' }, h('div', { class: 'wordmark', text: 'Attract' })),
      h('div', { class: 'home-info' }, this.title, this.detail),
    );
    this.build();
  }

  private build(): void {
    this.rows.length = 0;
    this.el.querySelectorAll('.shelf').forEach((n) => n.remove());
    this.addRow('systems', 'Systems', this.library.systems.map((s) => this.systemCard(s)));
    const recent = userState().recent.map((r) => this.library.byId.get(r.id)).filter((g): g is CatalogGame => !!g);
    if (recent.length) this.addRow('recent', 'Recently played', recent.map((g) => this.gameCard(g)));
    this.rowIndex = clamp(this.rowIndex, 0, this.rows.length - 1);
  }

  private addRow(kind: Row['kind'], label: string, items: HTMLElement[]): void {
    const track = h('div', { class: 'shelf-track' }, ...items);
    this.el.append(h('section', { class: `shelf shelf-${kind}` }, h('h2', { class: 'shelf-label', text: label }), track));
    this.rows.push({ kind, items, index: 0, track });
  }

  private systemCard(system: CatalogSystem): HTMLElement {
    const games = this.library.bySystem.get(system.id) ?? [];
    const covers = showcase(games, system.id, 3, 'cover');
    const fan = h('div', { class: 'fan' }, ...covers.map((g, i) => img(mediaUrl(g.art.cover), `fan-cover fan-${i}`)));
    const card = h('button', { class: 'system-card', attrs: { 'data-system': system.id } },
      fan,
      h('span', { class: 'system-name', text: system.shortName }),
      h('span', { class: 'system-count', text: gameCount(system.gameCount) }));
    return card;
  }

  private gameCard(game: CatalogGame): HTMLElement {
    const system = this.library.systems.find((s) => s.id === game.system);
    return h('button', { class: 'recent-card', attrs: { 'data-game': game.id } },
      img(mediaUrl(game.art.cover), 'recent-cover') ?? h('span', { class: 'cover-fallback', text: game.title }),
      h('span', { class: 'recent-title', text: game.title }),
      h('span', { class: 'recent-system', text: system?.shortName ?? '' }));
  }

  private get row(): Row { return this.rows[this.rowIndex]; }

  private focusCurrent(): void {
    for (const row of this.rows) row.items.forEach((item, i) => item.classList.toggle('is-focused', row === this.row && i === row.index));
    const item = this.row.items[this.row.index];
    if (item) { item.focus({ preventScroll: true }); revealInside(this.row.track, item, 96); }
    this.el.querySelectorAll('.shelf').forEach((shelf, i) => shelf.classList.toggle('is-active', i === this.rowIndex));
    this.describeFocus();
  }

  private describeFocus(): void {
    if (this.row.kind === 'systems') {
      const system = this.library.systems[this.row.index];
      const games = this.library.bySystem.get(system.id) ?? [];
      this.title.textContent = system.name;
      this.detail.textContent = `${system.maker} · ${system.year} · ${gameCount(system.gameCount)}`;
      this.startAttract(showcase(games, `${system.id}-screens`, 12, 'screen').map((g) => mediaUrl(g.art.screen)!));
    } else {
      const game = this.library.byId.get(this.row.items[this.row.index].dataset.game!)!;
      const system = this.library.systems.find((s) => s.id === game.system)!;
      this.title.textContent = game.title;
      this.detail.textContent = [system.name, game.year].filter(Boolean).join(' · ');
      this.startAttract([mediaUrl(game.art.screen) ?? mediaUrl(game.art.title)].filter((x): x is string => !!x));
    }
  }

  /** Cycle real screenshots from the focused system behind the menu, like an arcade attract loop. */
  private startAttract(frames: string[]): void {
    window.clearInterval(this.attractTimer);
    this.attractFrames = frames;
    this.attractIndex = 0;
    this.shell.setBackdrop(frames[0]);
    if (frames.length < 2) return;
    this.attractTimer = window.setInterval(() => {
      this.attractIndex = (this.attractIndex + 1) % this.attractFrames.length;
      this.shell.setBackdrop(this.attractFrames[this.attractIndex]);
    }, ATTRACT_INTERVAL_MS);
  }

  handle(command: Command): boolean {
    const row = this.row;
    switch (command) {
      case 'left': case 'right': {
        const next = clamp(row.index + (command === 'left' ? -1 : 1), 0, row.items.length - 1);
        if (next === row.index) return true;
        row.index = next; this.focusCurrent(); return true;
      }
      case 'up': case 'down': {
        const next = clamp(this.rowIndex + (command === 'up' ? -1 : 1), 0, this.rows.length - 1);
        if (next !== this.rowIndex) { this.rowIndex = next; this.focusCurrent(); }
        return true;
      }
      case 'select': {
        if (row.kind === 'systems') this.actions.openSystem(this.library.systems[row.index]);
        else this.actions.openGame(this.library.byId.get(row.items[row.index].dataset.game!)!);
        return true;
      }
      case 'y': this.actions.openSearch(); return true;
      case 'back': return true;
      default: return false;
    }
  }

  onShow(): void {
    const focusedSystem = this.rows[0]?.index ?? 0;
    this.build();
    this.rows[0].index = focusedSystem;
    this.focusCurrent();
  }

  onHide(): void { window.clearInterval(this.attractTimer); }

  hints(): [string, string][] { return [['A', 'Open'], ['Y', 'Search']]; }
}
