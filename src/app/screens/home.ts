import { gameCount, mediaUrl, type CatalogGame, type CatalogSystem, type Library } from '../data';
import type { Shell } from '../shell';
import { showcase } from '../showcase';
import { isFavorite, userState } from '../store';
import { clamp, h, img, type Command, type Screen } from '../ui';

export { showcase } from '../showcase';

const ATTRACT_INTERVAL_MS = 6000;
/** Focused card height in rem; everything in the deck scales from it. */
const CARD_HEIGHT = 30;
const SYSTEM_ASPECT = 1.6;
const COVER_ASPECT = 0.72;
/** Each card further back is this much smaller than the one in front of it. */
const RECEDE = 0.74;
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

  /** A card plus its floor reflection. The reflection mirrors only the picture, never the name plate. */
  private card(key: string, src: string | undefined, title: string, sub: string, aspect: number, extra: string): HTMLElement {
    const art = img(src, 'nxe-art', title);
    const mirror = img(src, 'nxe-mirror-art');
    return h('button', { class: `nxe-slot ${extra}`, attrs: { 'data-key': key, style: `--aspect:${aspect}` } },
      h('span', { class: 'nxe-card' },
        art ?? h('span', { class: 'nxe-card-empty', text: title }),
        h('span', { class: 'nxe-gloss' }),
        h('span', { class: 'nxe-band' }, h('span', { class: 'nxe-title', text: title }), h('span', { class: 'nxe-sub', text: sub }))),
      mirror ? h('span', { class: 'nxe-mirror', attrs: { 'aria-hidden': 'true' } }, mirror) : undefined);
  }

  private systemCard(system: CatalogSystem): Card {
    return { el: this.card(system.id, mediaUrl(system.image), system.name, `${system.maker} · ${system.year} · ${gameCount(system.gameCount)}`, SYSTEM_ASPECT, 'is-system'), aspect: SYSTEM_ASPECT, system };
  }

  private gameCard(game: CatalogGame): Card {
    const system = this.library.systems.find((s) => s.id === game.system);
    return { el: this.card(game.id, mediaUrl(game.art.cover), game.title, [system?.shortName, game.year].filter(Boolean).join(' · '), COVER_ASPECT, 'is-game'), aspect: COVER_ASPECT, game };
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
        style.zIndex = '0';
      } else {
        const scale = RECEDE ** k;
        const y = CARD_HEIGHT * (1 - scale) * 0.32;
        style.transform = `translate3d(${x}rem, ${y}rem, 0) rotateY(${k === 0 ? 0 : -9}deg) scale(${scale})`;
        style.opacity = k > VISIBLE_BEHIND ? '0' : String(1 - k * 0.1);
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
      this.startAttract(showcase(games, `${card.system.id}-screens`, 12, 'screen').map((g) => mediaUrl(g.art.screen)!));
    } else if (card?.game) {
      this.startAttract([mediaUrl(card.game.art.screen) ?? mediaUrl(card.game.art.title)].filter((x): x is string => !!x));
    }
  }

  /** Cycle real screenshots from the focused system behind the cards. */
  private startAttract(frames: string[]): void {
    window.clearInterval(this.attractTimer);
    let i = 0;
    this.shell.setBackdrop(frames[0]);
    if (frames.length < 2) return;
    this.attractTimer = window.setInterval(() => { i = (i + 1) % frames.length; this.shell.setBackdrop(frames[i]); }, ATTRACT_INTERVAL_MS);
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
  onHide(): void { window.clearInterval(this.attractTimer); }

  hints(): [string, string][] {
    return this.channels.length > 1 ? [['↕', 'Switch row'], ['Y', 'Search'], ['A', 'Open']] : [['Y', 'Search'], ['A', 'Open']];
  }
}
