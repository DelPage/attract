/**
 * Turns controller and keyboard input into screen commands. The native host
 * streams numbered gamepad snapshots; until it does (or in a desktop browser)
 * the Gamepad API and Xbox platform key events are used instead.
 */
import { XboxControllerMapper, type XboxCommand, type XboxControllerSnapshot } from '../input/controller';
import { XboxNativeInputGate, platformNavigationCommand } from '../input/native-input';
import { isNative, onNativeMessage } from './bridge';
import type { Command } from './ui';

const FROM_XBOX: Record<XboxCommand, Command> = {
  up: 'up', down: 'down', left: 'left', right: 'right', select: 'select', back: 'back',
  pause: 'x', search: 'y', channelDown: 'lb', channelUp: 'rb', guide: 'view', menu: 'menu',
};

const KEYS: Record<string, Command> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'select', Escape: 'back',
  Backspace: 'back', x: 'x', y: 'y', '[': 'lb', ']': 'rb',
};

const POLL_MS = 16;

export function startInput(dispatch: (command: Command) => void): void {
  const mapper = new XboxControllerMapper();
  const gate = new XboxNativeInputGate();
  let latest: XboxControllerSnapshot = { buttons: [], axes: [] };

  onNativeMessage((m) => {
    if (m.type === 'gamepad' && Array.isArray(m.buttons) && Array.isArray(m.axes) && gate.acceptSequence(m.sequence, performance.now())) {
      latest = { buttons: m.buttons.map((b) => b === true), axes: m.axes.map((a) => (typeof a === 'number' && Number.isFinite(a) ? a : 0)) };
    } else if (m.type === 'input-owner' && m.active === false) {
      gate.setOwner(false); mapper.reset(); latest = { buttons: [], axes: [] };
    } else if (m.type === 'back') dispatch('back');
  });

  const editing = (): boolean => document.activeElement instanceof HTMLInputElement;

  document.addEventListener('keydown', (event) => {
    if (isNative() && gate.shouldSuppressPlatformKey(event.key, event.keyCode, performance.now())) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    const platform = platformNavigationCommand(event.key, event.keyCode);
    const isPad = event.key.startsWith('Gamepad') || (event.keyCode >= 195 && event.keyCode <= 218);
    let command: Command | undefined = isPad && platform ? FROM_XBOX[platform] : KEYS[event.key];
    if (editing() && !isPad && !['ArrowDown', 'ArrowUp', 'Escape', 'Enter'].includes(event.key)) command = undefined;
    if (!command) return;
    event.preventDefault();
    dispatch(command);
  }, true);

  window.addEventListener('gamepaddisconnected', () => { mapper.reset(); latest = { buttons: [], axes: [] }; });

  const poll = (): void => {
    if (!gate.nativeOwner && typeof navigator.getGamepads === 'function') {
      const pad = [...navigator.getGamepads()].find((p) => p?.connected && p.mapping === 'standard');
      latest = pad ? { buttons: pad.buttons.map((b) => b.pressed), axes: [...pad.axes] } : { buttons: [], axes: [] };
    }
    if (!document.hidden) for (const c of mapper.step(latest, performance.now())) dispatch(FROM_XBOX[c]);
    window.setTimeout(poll, POLL_MS);
  };
  poll();
}
