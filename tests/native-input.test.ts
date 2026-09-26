import { describe, expect, it } from "vitest";
import { XboxNativeInputGate, platformNavigationCommand } from "../src/input/native-input";

describe("Xbox native input ownership", () => {
  it("keeps platform controller keys as a fallback until a native snapshot arrives", () => {
    const gate = new XboxNativeInputGate();
    expect(gate.shouldSuppressPlatformKey("ArrowUp", 38, 0)).toBe(false);
    expect(gate.acceptSequence(1, 10)).toBe(true);
    expect(gate.shouldSuppressPlatformKey("ArrowUp", 38, 20)).toBe(true);
    expect(gate.shouldSuppressPlatformKey("ArrowUp", 38, 800)).toBe(false);
  });

  it("ignores stale native snapshots and restores the fallback on disconnect", () => {
    const gate = new XboxNativeInputGate();
    expect(gate.acceptSequence(4, 0)).toBe(true);
    expect(gate.acceptSequence(4, 1)).toBe(false);
    expect(gate.acceptSequence(3, 2)).toBe(false);
    gate.setOwner(false);
    expect(gate.shouldSuppressPlatformKey("Enter", 13, 3)).toBe(false);
    expect(gate.acceptSequence(1, 4)).toBe(true);
  });

  it("allows internally dispatched navigation while native input owns the page", () => {
    const gate = new XboxNativeInputGate();
    gate.acceptSequence(1, 0);
    expect(gate.shouldSuppressPlatformKey("ArrowRight", 39, 1)).toBe(true);
    gate.dispatchInternal(() => expect(gate.shouldSuppressPlatformKey("ArrowRight", 39, 1)).toBe(false));
  });

  it("maps Xbox platform virtual keys to their semantic commands", () => {
    expect(platformNavigationCommand("GamepadLeftShoulder", 0)).toBe("channelDown");
    expect(platformNavigationCommand("Unidentified", 199)).toBe("channelUp");
    expect(platformNavigationCommand("GamepadA", 0)).toBe("select");
    expect(platformNavigationCommand("GamepadB", 0)).toBe("back");
    expect(platformNavigationCommand("GamepadDPadUp", 0)).toBe("up");
    expect(platformNavigationCommand("Unidentified", 214)).toBe("left");
  });

  it("still suppresses unknown platform gamepad keys while native input is healthy", () => {
    const gate = new XboxNativeInputGate();
    gate.acceptSequence(1, 0);
    expect(gate.shouldSuppressPlatformKey("GamepadLeftTrigger", 0, 20)).toBe(true);
    expect(gate.shouldSuppressPlatformKey("Unidentified", 201, 20)).toBe(true);
  });
});
