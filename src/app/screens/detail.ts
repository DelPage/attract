import { isNative, launchGame } from '../bridge';
import { mediaUrl, type CatalogGame, type CatalogVersion, type Library } from '../data';
import type { Shell } from '../shell';
import { isFavorite, markPlayed, toggleFavorite } from '../store';
import { clamp, h, img, type Command, type Screen } from '../ui';

type Action = 'play' | 'favorite' | 'versions';

const playersText = (n: number): string => (n === 1 ? '1 player' : `1 to ${n} players`);

export class DetailScreen implements Screen {
  readonly el = h('section', { class: 'screen detail' });
  private actions: Action[] = [];
  private actionEls: HTMLElement[] = [];
  private actionIndex = 0;
  private versionIndex = -1;
  private versionPanel: HTMLElement | undefined;

  constructor(private readonly library: Library, private game: CatalogGame, private readonly list: CatalogGame[], private readonly shell: Shell) {
    this.render();
  }

  private render(): void {
    const g = this.game;
    const system = this.library.systems.find((s) => s.id === g.system)!;
    this.actions = ['play', 'favorite', ...(g.versions.length ? ['versions' as const] : [])];
    this.actionIndex = clamp(this.actionIndex, 0, this.actions.length - 1);
    this.actionEls = this.actions.map((a) => h('button', { class: `action action-${a}`, text: this.actionLabel(a) }));
    const facts: [string, string | undefined][] = [
      ['Released', g.year ? String(g.year) : undefined],
      ['Genre', g.genre],
      ['Players', g.players ? playersText(g.players) : undefined],
      ['Developer', g.developer],
      ['Publisher', g.publisher],
    ];
    const shots = [g.art.title, g.art.screen].map((rel) => img(mediaUrl(rel), 'shot')).filter((x): x is HTMLImageElement => !!x);
    const position = this.list.indexOf(g);
    this.el.replaceChildren(
      h('div', { class: 'detail-cover-wrap' },
        img(mediaUrl(g.art.cover), 'detail-cover', g.title) ?? h('div', { class: 'detail-cover tile-fallback' }, h('span', { class: 'tile-fallback-title', text: g.title }))),
      h('div', { class: 'detail-body' },
        h('p', { class: 'detail-system', text: position >= 0 ? `${system.name} · ${position + 1} of ${this.list.length}` : system.name }),
        h('h1', { class: 'detail-title', text: g.title }),
        h('dl', { class: 'facts' }, ...facts.filter(([, v]) => v).flatMap(([k, v]) => [h('div', { class: 'fact' }, h('dt', { text: k }), h('dd', { text: v! }))])),
        h('div', { class: 'actions' }, ...this.actionEls),
        g.description ? h('p', { class: 'about', text: g.description }) : undefined,
        shots.length ? h('div', { class: 'shots' }, ...shots) : undefined),
    );
    this.shell.setBackdrop(mediaUrl(g.art.screen ?? g.art.title));
    this.focus();
  }

  private actionLabel(action: Action): string {
    if (action === 'play') return 'Play';
    if (action === 'favorite') return isFavorite(this.game.id) ? 'Favorited' : 'Favorite';
    return `Versions (${this.game.versions.length + 1})`;
  }

  private focus(): void {
    this.actionEls.forEach((el, i) => el.classList.toggle('is-focused', i === this.actionIndex && !this.versionPanel));
    this.actionEls[this.actionIndex]?.focus({ preventScroll: true });
    this.actionEls.find((_, i) => this.actions[i] === 'favorite')?.classList.toggle('is-on', isFavorite(this.game.id));
  }

  private play(version?: CatalogVersion): void {
    const path = version?.path ?? this.game.path;
    markPlayed(this.game.id);
    launchGame({ gameId: this.game.id, core: this.game.core, path });
    const overlay = h('div', { class: 'launching' },
      img(mediaUrl(this.game.art.cover), 'launching-cover'),
      h('p', { class: 'launching-text', text: `Starting ${this.game.title}` }));
    this.el.append(overlay);
    this.launching = overlay;
    // In a desktop browser nothing starts; clear the overlay after a moment.
    if (!isNative()) window.setTimeout(() => this.clearLaunch(), 2500);
  }

  private launching: HTMLElement | undefined;

  clearLaunch(problem?: string): void {
    this.launching?.remove();
    this.launching = undefined;
    if (!problem) return;
    const note = h('div', { class: 'launching' }, h('p', { class: 'launching-text', text: problem }), h('p', { class: 'launching-sub', text: 'Press B to go back.' }));
    this.launching = note;
    this.el.append(note);
  }

  private openVersions(): void {
    const all: CatalogVersion[] = [{ label: 'Recommended', path: this.game.path }, ...this.game.versions];
    this.versionIndex = 0;
    this.versionPanel = h('div', { class: 'versions' },
      h('h2', { class: 'versions-title', text: 'Choose a version' }),
      ...all.map((v) => h('button', { class: 'version', text: v.label, attrs: { 'data-path': v.path } })));
    this.el.append(this.versionPanel);
    this.focusVersion();
  }

  private focusVersion(): void {
    const items = [...(this.versionPanel?.querySelectorAll<HTMLElement>('.version') ?? [])];
    items.forEach((el, i) => el.classList.toggle('is-focused', i === this.versionIndex));
    items[this.versionIndex]?.scrollIntoView({ block: 'nearest' });
    this.focus();
  }

  private closeVersions(): void { this.versionPanel?.remove(); this.versionPanel = undefined; this.focus(); }

  private step(delta: 1 | -1): void {
    const i = this.list.indexOf(this.game);
    const next = this.list[i + delta];
    if (!next) return;
    this.game = next;
    this.render();
  }

  handle(command: Command): boolean {
    if (this.launching) { if (command === 'back') this.clearLaunch(); return true; }
    if (this.versionPanel) {
      const items = this.versionPanel.querySelectorAll<HTMLElement>('.version');
      if (command === 'up' || command === 'down') { this.versionIndex = clamp(this.versionIndex + (command === 'up' ? -1 : 1), 0, items.length - 1); this.focusVersion(); }
      else if (command === 'select') { const path = items[this.versionIndex].dataset.path!; this.closeVersions(); this.play({ label: '', path }); }
      else if (command === 'back') this.closeVersions();
      return true;
    }
    switch (command) {
      case 'left': case 'right': this.actionIndex = clamp(this.actionIndex + (command === 'left' ? -1 : 1), 0, this.actions.length - 1); this.focus(); return true;
      case 'lb': case 'rb': this.step(command === 'rb' ? 1 : -1); return true;
      case 'x': toggleFavorite(this.game.id); this.refreshFavorite(); return true;
      case 'select': {
        const action = this.actions[this.actionIndex];
        if (action === 'play') this.play();
        else if (action === 'favorite') { toggleFavorite(this.game.id); this.refreshFavorite(); }
        else this.openVersions();
        return true;
      }
      case 'up': case 'down': return true;
      default: return false;
    }
  }

  private refreshFavorite(): void {
    const i = this.actions.indexOf('favorite');
    this.actionEls[i].textContent = this.actionLabel('favorite');
    this.focus();
  }

  onShow(): void { this.shell.setBackdrop(mediaUrl(this.game.art.screen ?? this.game.art.title)); this.focus(); }

  hints(): [string, string][] {
    if (this.versionPanel) return [['B', 'Close'], ['A', 'Play this version']];
    return [['B', 'Back'], ['LB/RB', 'Previous or next game'], ['X', isFavorite(this.game.id) ? 'Remove favorite' : 'Favorite'], ['A', 'Select']];
  }
}
