import { h, type Command, type Screen } from './ui';

/**
 * App frame: the full-screen art backdrop, the screen stack and the
 * controller hint bar. Screens only deal with their own content.
 */
export class Shell {
  private readonly stack: Screen[] = [];
  private readonly layers: HTMLImageElement[];
  private activeLayer = 0;
  private backdropSrc = '';
  private readonly stage = h('main', { class: 'stage' });
  private readonly footer = h('footer', { class: 'hints' });
  private readonly clock = h('div', { class: 'clock' });
  private readonly caption = h('div', { class: 'backdrop-caption' });
  private readonly backdrop: HTMLElement;

  constructor(root: HTMLElement) {
    this.layers = [h('img', { class: 'backdrop-art', attrs: { alt: '' } }), h('img', { class: 'backdrop-art', attrs: { alt: '' } })];
    this.backdrop = h('div', { class: 'backdrop' }, ...this.layers, h('div', { class: 'backdrop-scanlines' }), h('div', { class: 'backdrop-shade' }));
    root.append(this.backdrop, this.stage, this.clock, this.caption, this.footer);
    this.tick();
    window.setInterval(() => this.tick(), 15_000);
  }

  private tick(): void {
    this.clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  get current(): Screen | undefined { return this.stack.at(-1); }

  push(screen: Screen): void {
    this.current?.onHide?.();
    this.current?.el.classList.add('is-behind');
    this.stack.push(screen);
    this.stage.append(screen.el);
    screen.onShow?.();
    this.refreshHints();
  }

  pop(): boolean {
    if (this.stack.length < 2) return false;
    const leaving = this.stack.pop()!;
    leaving.onHide?.();
    leaving.el.remove();
    this.current!.el.classList.remove('is-behind');
    this.current!.onShow?.();
    this.refreshHints();
    return true;
  }

  handle(command: Command): void {
    const screen = this.current;
    if (!screen) return;
    if (screen.handle(command)) { this.refreshHints(); return; }
    if (command === 'back') this.pop();
  }

  refreshHints(): void {
    const hints = this.current?.hints() ?? [];
    this.footer.replaceChildren(...hints.map(([button, label]) =>
      h('span', { class: 'hint' }, h('kbd', { class: `btn btn-${button.toLowerCase().replace(/[^a-z]/g, '')}`, text: button }), label)));
  }

  /** A short message at the top of the screen that stays until the next launch. */
  notice(text: string): void {
    this.stage.parentElement?.append(h('div', { class: 'notice', text }));
  }

  /** Small line naming the game shown behind the home screen. */
  setCaption(text: string): void { this.caption.textContent = text; }

  /**
   * Crossfade the full-screen art. "soft" is a blurred color wash for busy
   * screens; "pixel" and "smooth" show gameplay sharp, the way the console drew it.
   */
  setBackdrop(src: string | undefined, look: 'soft' | 'pixel' | 'smooth' = 'soft'): void {
    this.backdrop.dataset.look = look;
    const next = src ?? '';
    if (next === this.backdropSrc) return;
    this.backdropSrc = next;
    const incoming = this.layers[1 - this.activeLayer];
    const outgoing = this.layers[this.activeLayer];
    if (!next) { outgoing.classList.remove('is-on'); return; }
    incoming.onload = () => {
      if (this.backdropSrc !== next) return;
      incoming.classList.add('is-on');
      outgoing.classList.remove('is-on');
      this.activeLayer = 1 - this.activeLayer;
    };
    incoming.src = next;
  }
}
