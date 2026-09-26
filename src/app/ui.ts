/** Small DOM helpers shared by the screens. */

export type Command = 'up' | 'down' | 'left' | 'right' | 'select' | 'back' | 'x' | 'y' | 'lb' | 'rb' | 'view' | 'menu';

export interface Screen {
  readonly el: HTMLElement;
  /** Returns true when the command was used. */
  handle(command: Command): boolean;
  onShow?(): void;
  onHide?(): void;
  /** Controller hints for the footer: [button, label]. */
  hints(): [string, string][];
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; attrs?: Record<string, string> } = {},
  ...children: (Node | string | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v);
  for (const child of children) if (child) node.append(child);
  return node;
}

export function img(src: string | undefined, className: string, alt = ''): HTMLImageElement | undefined {
  if (!src) return undefined;
  const image = h('img', { class: className, attrs: { src, alt, decoding: 'async', loading: 'lazy' } });
  image.addEventListener('error', () => image.remove(), { once: true });
  return image;
}

/** Keep the focused element inside its scroll container with some breathing room. */
export function revealInside(container: HTMLElement, target: HTMLElement, margin = 120): void {
  const c = container.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  if (t.top - margin < c.top) container.scrollBy({ top: t.top - c.top - margin, behavior: 'smooth' });
  else if (t.bottom + margin > c.bottom) container.scrollBy({ top: t.bottom - c.bottom + margin, behavior: 'smooth' });
  if (t.left - margin < c.left) container.scrollBy({ left: t.left - c.left - margin, behavior: 'smooth' });
  else if (t.right + margin > c.right) container.scrollBy({ left: t.right - c.right + margin, behavior: 'smooth' });
}

export const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
