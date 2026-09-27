import { gameCount, mediaUrl, type CatalogGame, type CatalogSystem, type Library } from '../data';
import type { Shell } from '../shell';
import { showcase } from '../showcase';
import { isFavorite, userState } from '../store';
import { clamp, h, img, type Command, type Screen } from '../ui';

export { showcase } from '../showcase';

const ATTRACT_INTERVAL_MS = 5500;
/** Focused card height in rem; everything in the deck scales from it. */
const CARD_HEIGHT = 34;
/** Tall poster cards for systems. */
const POSTER_ASPECT = 0.7;
const COVER_ASPECT = 0.72;
/** Each card further back is this much smaller than the one in front of it. */
const RECEDE = 0.8;
const GAP = 1.75;
const VISIBLE_BEHIND = 6;

export interface HomeActions {
  openSystem(system: CatalogSystem): void;
  openGame(game: CatalogGame): void;
  openSearch(): void;
}

interface Card { el: HTMLElement; aspect: number; system?: CatalogSystem; game?: CatalogGame }
interface Channel { id: string; label: string; cards: Card[]; index: number }

/**
 * Home in the spirit of the Xbox 360 dashboard (2008): stacked channels, and
 * in the current channel a row of glossy cards that recedes into the screen
 * with the focused card large at the front.
 */
export class HomeScreen implements Screen {
  readonly el = h('section', { class: 'screen home nxe' });
  private readonly labels = h('nav', { class: 'nxe-channels' });
  private readonly below = h('nav', { class: 'nxe-channels-below' });
  private readonly deck = h('div', { class: 'nxe-deck' });
  private channels: Channel[] = [];
  private channelIndex = 0;
  private attractTimer: number | undefined;

  constructor(private readonly library: Library, private readonly shell: Shell, private readonly actions: HomeActions) {
    this.el.append(h('header', { class: 'topbar' }, h('div', { class: 'wordmark', text: 'Attract' })), this.labels, this.deck, this.below);
  }

  private buildChannels(): void {
    const keep = new Map(this.channels.map((c) => [c.id, c.cards[c.index]?.el.dataset.key]));
    const systems = this.library.systems.map((s) => this.systemCard(s));
    const recent = userState().recent.map((r) => this.library.byId.get(r.id)).filter((g): g is CatalogGame => !!g);
    const favorites = userState().favorites.map((id) => this.library.byId.get(id)).filter((g): g is CatalogGame => !!g && isFavorite(g.id));
    const channels: Channel[] = [{ id: 'systems', label: 'Systems', cards: systems, index: 0 }];
    if (recent.length) channels.push({ id: 'recent', label: 'Recently played', cards: recent.map((g) => this.gameCard(g)), index: 0 });
    if (favorites.length) channels.push({ id: 'favorites', label: 'Favorites', cards: favorites.map((g) => this.gameCard(g)), index: 0 });
    for (const channel of channels) {
      const key = keep.get(channel.id);
      const found = channel.cards.findIndex((c) => c.el.dataset.key === key);
      channel.index = found >= 0 ? found : 0;
    }
    const currentId = this.channels[this.channelIndex]?.id;
    this.channels = channels;
    this.channelIndex = Math.max(0, channels.findIndex((c) => c.id === currentId));
  }

  /** A card plus its floor reflection. The reflection mirrors only the picture, never the text. */
  private slot(key: string, aspect: number, extra: string, face: HTMLElement, mirror?: HTMLElement): HTMLElement {
    return h('button', { class: `nxe-slot ${extra}`, attrs: { 'data-key': key, style: `--aspect:${aspect}` } },
      h('span', { class: 'nxe-card' }, face, h('span', { class: 'nxe-gloss' })),
      mirror ? h('span', { class: 'nxe-mirror', attrs: { 'aria-hidden': 'true' } }, mirror) : undefined);
  }

  /** Poster card: the system's brand colors, its logo, and the console standing at the bottom. */
  private systemCard(system: CatalogSystem): Card {
    const [top, bottom] = system.brand ?? ['#36343b', '#141218'];
    const colors = `--brand-top:${top};--brand-bottom:${bottom}`;
    const logo = img(mediaUrl(system.logo), `poster-logo${system.logoInColor ? ' is-color' : ''}`, system.name)
      ?? h('span', { class: 'poster-wordmark', text: system.name });
    const face = h('span', { class: 'poster', attrs: { style: colors } },
      h('span', { class: 'poster-light' }),
      h('span', { class: 'poster-head' }, logo),
      h('span', { class: 'poster-floor' }),
      img(mediaUrl(system.console), `poster-console poster-console-${system.id}`, '') ?? h('span'),
      h('span', { class: 'poster-foot' },
        h('span', { class: 'poster-count', text: gameCount(system.gameCount) }),
        h('span', { class: 'poster-meta', text: `${system.maker} · ${system.year}` })));
    const mirror = h('span', { class: 'poster poster-mirror', attrs: { style: colors } },
      img(mediaUrl(system.console), `poster-console poster-console-${system.id}`, '') ?? h('span'));
    return { el: this.slot(system.id, POSTER_ASPECT, 'is-system', face, mirror), aspect: POSTER_ASPECT, system };
  }

  private gameCard(game: CatalogGame): Card {
    const system = this.library.systems.find((s) => s.id === game.system);
    const src = mediaUrl(game.art.cover);
    const face = h('span', { class: 'cover-face' },
      img(src, 'nxe-art', game.title) ?? h('span', { class: 'nxe-card-empty', text: game.title }),
      h('span', { class: 'nxe-band' }, h('span', { class: 'nxe-title', text: game.title }),
        h('span', { class: 'nxe-sub', text: [system?.shortName, game.year].filter(Boolean).join(' · ') })));
    const mirror = img(src, 'nxe-mirror-art');
    return { el: this.slot(game.id, COVER_ASPECT, 'is-game', face, mirror), aspect: COVER_ASPECT, game };
  }

  private get channel(): Channel { return this.channels[this.channelIndex]; }

  /** Lay the current channel's cards out along the receding row. */
  private layout(): void {
    const { cards, index } = this.channel;
    let x = 0;
    cards.forEach((card, i) => {
      const k = i - index;
      const style = card.el.style;
      const width = CARD_HEIGHT * card.aspect;
      if (k < 0) {
        style.transform = `translate3d(${-(width + 8)}rem, 2rem, 0) scale(0.9)`;
        style.opacity = '0';
        style.filter = '';
        style.zIndex = '0';
      } else {
        const scale = RECEDE ** k;
        const y = CARD_HEIGHT * (1 - scale) * 0.32;
        style.transform = `translate3d(${x}rem, ${y}rem, 0) rotateY(${k === 0 ? 0 : -9}deg) scale(${scale})`;
        style.opacity = k > VISIBLE_BEHIND ? '0' : '1';
        style.filter = k === 0 ? '' : `brightness(${(1 - k * 0.13).toFixed(2)})`;
        style.zIndex = String(100 - k);
        x += (width + GAP) * scale;
      }
      card.el.classList.toggle('is-focused', k === 0);
      card.el.classList.toggle('is-behind', k > 0);
    });
    cards[index]?.el.focus({ preventScroll: true });
    this.describe();
  }

  private renderChannel(direction: 0 | 1 | -1): void {
    this.labels.replaceChildren(...this.channels.slice(0, this.channelIndex + 1).map((c, i) =>
      h('span', { class: `nxe-channel${i === this.channelIndex ? ' is-current' : ''}`, text: c.label })));
    this.below.replaceChildren(...this.channels.slice(this.channelIndex + 1).map((c) => h('span', { class: 'nxe-channel', text: c.label })));
    this.deck.replaceChildren(...this.channel.cards.map((c) => c.el));
    this.deck.classList.remove('slide-up', 'slide-down');
    if (direction) { void this.deck.offsetWidth; this.deck.classList.add(direction > 0 ? 'slide-up' : 'slide-down'); }
    this.layout();
  }

  private describe(): void {
    const card = this.channel.cards[this.channel.index];
    if (card?.system) {
      const games = this.library.bySystem.get(card.system.id) ?? [];
      this.startAttract(showcase(games, `${card.system.id}-screens`, 12, 'screen'), card.system.smoothArt ? 'smooth' : 'pixel');
    } else if (card?.game) {
      const system = this.library.systems.find((s) => s.id === card.game!.system);
      this.startAttract([card.game], system?.smoothArt ? 'smooth' : 'pixel');
    }
  }

  /** Full-screen gameplay from the focused system's best known games, changing every few seconds. */
  private startAttract(games: CatalogGame[], look: 'pixel' | 'smooth'): void {
    window.clearInterval(this.attractTimer);
    const frames = games.filter((g) => g.art.screen || g.art.title);
    const show = (g: CatalogGame | undefined) => {
      this.shell.setBackdrop(mediaUrl(g?.art.screen ?? g?.art.title), look);
      this.shell.setCaption(g ? [g.title, g.year].filter(Boolean).join(' · ') : '');
    };
    let i = 0;
    show(frames[0]);
    if (frames.length < 2) return;
    this.attractTimer = window.setInterval(() => { i = (i + 1) % frames.length; show(frames[i]); }, ATTRACT_INTERVAL_MS);
  }

  handle(command: Command): boolean {
    const channel = this.channel;
    switch (command) {
      case 'left': case 'right': {
        const next = clamp(channel.index + (command === 'left' ? -1 : 1), 0, channel.cards.length - 1);
        if (next !== channel.index) { channel.index = next; this.layout(); }
        return true;
      }
      case 'up': case 'down': {
        const next = clamp(this.channelIndex + (command === 'up' ? -1 : 1), 0, this.channels.length - 1);
        if (next !== this.channelIndex) { this.channelIndex = next; this.renderChannel(command === 'down' ? 1 : -1); }
        return true;
      }
      case 'select': {
        const card = channel.cards[channel.index];
        if (card?.system) this.actions.openSystem(card.system);
        else if (card?.game) this.actions.openGame(card.game);
        return true;
      }
      case 'y': this.actions.openSearch(); return true;
      case 'back': return true;
      default: return false;
    }
  }

  onShow(): void { this.buildChannels(); this.renderChannel(0); }
  onHide(): void { window.clearInterval(this.attractTimer); this.shell.setCaption(''); }

  hints(): [string, string][] {
    return this.channels.length > 1 ? [['↕', 'Switch row'], ['Y', 'Search'], ['A', 'Open']] : [['Y', 'Search'], ['A', 'Open']];
  }
}
