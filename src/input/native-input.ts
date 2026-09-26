export type NativeNavigationCommand = "up" | "down" | "left" | "right" | "select" | "back";
export type PlatformControllerCommand = NativeNavigationCommand | "pause" | "search" | "channelDown" | "channelUp" | "guide" | "menu";

export const platformNavigationCommand = (key: string, keyCode: number): PlatformControllerCommand | undefined => {
  if (["ArrowUp", "GamepadDPadUp", "GamepadLeftThumbstickUp", "GamepadRightThumbstickUp"].includes(key) || [38, 203, 211, 215].includes(keyCode)) return "up";
  if (["ArrowDown", "GamepadDPadDown", "GamepadLeftThumbstickDown", "GamepadRightThumbstickDown"].includes(key) || [40, 204, 212, 216].includes(keyCode)) return "down";
  if (["ArrowLeft", "GamepadDPadLeft", "GamepadLeftThumbstickLeft", "GamepadRightThumbstickLeft"].includes(key) || [37, 205, 214, 218].includes(keyCode)) return "left";
  if (["ArrowRight", "GamepadDPadRight", "GamepadLeftThumbstickRight", "GamepadRightThumbstickRight"].includes(key) || [39, 206, 213, 217].includes(keyCode)) return "right";
  if (key === "Enter" || key === "GamepadA" || keyCode === 13 || keyCode === 195) return "select";
  if (key === "Escape" || key === "Back" || key === "GamepadB" || keyCode === 27 || keyCode === 196) return "back";
  if (key === "GamepadX" || keyCode === 197) return "pause";
  if (key === "GamepadY" || keyCode === 198) return "search";
  if (key === "GamepadLeftShoulder" || keyCode === 200) return "channelDown";
  if (key === "GamepadRightShoulder" || keyCode === 199) return "channelUp";
  if (key === "GamepadView" || keyCode === 208) return "guide";
  if (key === "GamepadMenu" || keyCode === 207) return "menu";
  return undefined;
};

const isPlatformControllerKey = (key: string, keyCode: number): boolean =>
  platformNavigationCommand(key, keyCode) !== undefined
  || key.startsWith("Gamepad")
  || (keyCode >= 195 && keyCode <= 218);

/**
 * Gives the native gamepad bridge ownership only after the WebView confirms a
 * native snapshot arrived. Until then Xbox's platform-generated key events are
 * left alone as a controller fallback.
 */
export class XboxNativeInputGate {
  private owner = false;
  private lastSequence = -1;
  private lastSnapshotAt = -Infinity;
  private internalDispatchDepth = 0;

  get nativeOwner(): boolean { return this.owner; }
  get sequence(): number { return this.lastSequence; }

  setOwner(active: boolean): void {
    this.owner = active;
    if (!active) { this.lastSequence = -1; this.lastSnapshotAt = -Infinity; }
  }

  acceptSequence(value: unknown, nowMs: number): boolean {
    if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) <= this.lastSequence) return false;
    this.lastSequence = value as number;
    this.lastSnapshotAt = nowMs;
    this.owner = true;
    return true;
  }

  dispatchInternal<T>(run: () => T): T {
    this.internalDispatchDepth += 1;
    try { return run(); }
    finally { this.internalDispatchDepth -= 1; }
  }

  shouldSuppressPlatformKey(key: string, keyCode: number, nowMs: number): boolean {
    return this.owner && nowMs - this.lastSnapshotAt <= 750 && this.internalDispatchDepth === 0
      && isPlatformControllerKey(key, keyCode);
  }
}
