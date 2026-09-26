/**
 * Semantic input mapping for a standardized Xbox gamepad.
 *
 * The mapper is deliberately independent of DOM and native bridge code. A
 * caller can feed it the same snapshot shape from either the native host or
 * navigator.getGamepads().
 */

export type XboxDirection = "up" | "down" | "left" | "right";

export type XboxCommand =
  | "select"
  | "back"
  | "pause"
  | "search"
  | "channelDown"
  | "channelUp"
  | "guide"
  | "menu"
  | XboxDirection;

export interface XboxControllerSnapshot {
  readonly standardizedGamepad?: boolean;
  readonly buttons: readonly boolean[];
  readonly axes: readonly number[];
}

export const XBOX_BUTTON_INDEX = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  leftBumper: 4,
  rightBumper: 5,
  view: 8,
  menu: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

export const XBOX_DIRECTION_INITIAL_DELAY_MS = 350;
export const XBOX_DIRECTION_REPEAT_MS = 120;

const ACTIVATE_DEADZONE = 0.55;
const RELEASE_DEADZONE = 0.35;
const BUTTON_COUNT = 17;

const EDGE_COMMANDS: ReadonlyArray<readonly [number, XboxCommand]> = [
  [XBOX_BUTTON_INDEX.a, "select"],
  [XBOX_BUTTON_INDEX.b, "back"],
  [XBOX_BUTTON_INDEX.x, "pause"],
  [XBOX_BUTTON_INDEX.y, "search"],
  [XBOX_BUTTON_INDEX.leftBumper, "channelDown"],
  [XBOX_BUTTON_INDEX.rightBumper, "channelUp"],
  [XBOX_BUTTON_INDEX.view, "guide"],
  [XBOX_BUTTON_INDEX.menu, "menu"],
];

const DPAD_DIRECTIONS: ReadonlyArray<readonly [number, XboxDirection]> = [
  [XBOX_BUTTON_INDEX.dpadUp, "up"],
  [XBOX_BUTTON_INDEX.dpadDown, "down"],
  [XBOX_BUTTON_INDEX.dpadLeft, "left"],
  [XBOX_BUTTON_INDEX.dpadRight, "right"],
];

/**
 * Maps one gamepad snapshot to semantic commands.
 *
 * Action buttons and bumpers are emitted only on a rising edge. The d-pad
 * and left stick share one navigation stream, so a frame never emits two
 * opposing or duplicate navigation commands. Bumpers intentionally remain
 * edge-triggered to avoid an unbounded tune loop when the controller polls
 * at 30 Hz.
 */
export class XboxControllerMapper {
  private previousButtons = Array<boolean>(BUTTON_COUNT).fill(false);
  private direction: XboxDirection | null = null;
  private stickDirection: XboxDirection | null = null;
  private nextDirectionRepeatAt: number | null = null;
  private armed = true;

  /**
   * Map a snapshot captured at nowMs (typically Date.now()).
   *
   * After reset(), a neutral snapshot is required before input is accepted.
   * This prevents a controller that reconnects while A is held from causing
   * an accidental selection. The mapper starts armed, so the first ordinary
   * snapshot still treats held buttons as newly pressed.
   */
  step(snapshot: XboxControllerSnapshot, nowMs: number): XboxCommand[] {
    if (snapshot.standardizedGamepad === false) {
      this.reset();
      return [];
    }

    const buttons = this.readButtons(snapshot.buttons);
    const stickDirection = this.readStickDirection(snapshot.axes);

    if (!this.armed) {
      this.previousButtons = buttons;
      if (!this.hasInput(buttons, stickDirection)) {
        this.armed = true;
        this.direction = null;
        this.nextDirectionRepeatAt = null;
      }
      return [];
    }

    const commands: XboxCommand[] = [];
    for (const [index, command] of EDGE_COMMANDS) {
      if (buttons[index] && !this.previousButtons[index]) {
        commands.push(command);
      }
    }

    const dpadDirection = this.readDpadDirection(buttons);
    const nextDirection = dpadDirection ?? stickDirection;
    if (nextDirection !== this.direction) {
      this.direction = nextDirection;
      this.nextDirectionRepeatAt =
        nextDirection === null ? null : nowMs + XBOX_DIRECTION_INITIAL_DELAY_MS;
      if (nextDirection !== null) {
        commands.push(nextDirection);
      }
    } else if (
      nextDirection !== null &&
      this.nextDirectionRepeatAt !== null &&
      nowMs >= this.nextDirectionRepeatAt
    ) {
      // Schedule from this frame instead of catching up from the old
      // deadline. A delayed frame therefore emits at most one repeat.
      commands.push(nextDirection);
      this.nextDirectionRepeatAt = nowMs + XBOX_DIRECTION_REPEAT_MS;
    }

    this.previousButtons = buttons;
    return commands;
  }

  /**
   * Clear all held state. The next snapshot must be neutral before it can
   * produce commands; see step() for the reconnect rationale.
   */
  reset(): void {
    this.previousButtons.fill(false);
    this.direction = null;
    this.stickDirection = null;
    this.nextDirectionRepeatAt = null;
    this.armed = false;
  }

  private readButtons(buttons: readonly boolean[]): boolean[] {
    return Array.from({ length: BUTTON_COUNT }, (_, index) => buttons[index] === true);
  }

  private hasInput(buttons: readonly boolean[], stickDirection: XboxDirection | null): boolean {
    return buttons.some(Boolean) || stickDirection !== null;
  }

  private readDpadDirection(buttons: readonly boolean[]): XboxDirection | null {
    // Keep an already-held d-pad direction stable if a second direction is
    // reported at the same time. This still guarantees one direction only.
    const current = DPAD_DIRECTIONS.find(
      ([index, direction]) => direction === this.direction && buttons[index],
    );
    if (current) {
      return current[1];
    }

    for (const [index, direction] of DPAD_DIRECTIONS) {
      if (buttons[index]) {
        return direction;
      }
    }
    return null;
  }

  private readStickDirection(axes: readonly number[]): XboxDirection | null {
    const x = this.axisValue(axes[0]);
    const y = this.axisValue(axes[1]);
    const candidate = this.dominantStickDirection(x, y);
    const current = this.stickDirection;

    if (current === null) {
      this.stickDirection = candidate;
      return candidate;
    }

    const currentMagnitude = this.directionAxisMagnitude(current, x, y);
    if (currentMagnitude < RELEASE_DEADZONE) {
      this.stickDirection = candidate;
      return candidate;
    }

    if (candidate !== null && candidate !== current) {
      const candidateMagnitude = this.directionAxisMagnitude(candidate, x, y);
      const sameAxis = this.isHorizontal(candidate) === this.isHorizontal(current);
      if (candidateMagnitude > currentMagnitude || sameAxis) {
        this.stickDirection = candidate;
      }
    }
    return this.stickDirection;
  }

  private dominantStickDirection(x: number, y: number): XboxDirection | null {
    const horizontalMagnitude = Math.abs(x);
    const verticalMagnitude = Math.abs(y);
    if (Math.max(horizontalMagnitude, verticalMagnitude) < ACTIVATE_DEADZONE) {
      return null;
    }
    if (horizontalMagnitude >= verticalMagnitude) {
      return x < 0 ? "left" : "right";
    }
    return y < 0 ? "up" : "down";
  }

  private directionAxisMagnitude(direction: XboxDirection, x: number, y: number): number {
    return this.isHorizontal(direction) ? Math.abs(x) : Math.abs(y);
  }

  private isHorizontal(direction: XboxDirection): boolean {
    return direction === "left" || direction === "right";
  }

  private axisValue(value: number | undefined): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  }
}
