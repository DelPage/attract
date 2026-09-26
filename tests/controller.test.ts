import { describe, expect, it } from "vitest";
import {
  XboxControllerMapper,
  type XboxControllerSnapshot,
} from "../src/input/controller";

const snapshot = (
  pressed: readonly number[] = [],
  axes: readonly number[] = [0, 0, 0, 0],
  standardizedGamepad = true,
): XboxControllerSnapshot => {
  const buttons = Array<boolean>(17).fill(false);
  for (const index of pressed) buttons[index] = true;
  return { standardizedGamepad, buttons, axes };
};

describe("XboxControllerMapper", () => {
  it("maps action buttons and bumpers on rising edges", () => {
    const mapper = new XboxControllerMapper();

    expect(mapper.step(snapshot([0, 1, 2, 3, 4, 5, 8, 9]), 0)).toEqual([
      "select",
      "back",
      "pause",
      "search",
      "channelDown",
      "channelUp",
      "guide",
      "menu",
    ]);
    expect(mapper.step(snapshot([0, 1, 2, 3, 4, 5, 8, 9]), 30)).toEqual([]);
    expect(mapper.step(snapshot(), 60)).toEqual([]);
    expect(mapper.step(snapshot([0]), 90)).toEqual(["select"]);
  });

  it("repeats one held navigation direction with bounded timing", () => {
    const mapper = new XboxControllerMapper();

    expect(mapper.step(snapshot([12]), 0)).toEqual(["up"]);
    expect(mapper.step(snapshot([12]), 349)).toEqual([]);
    expect(mapper.step(snapshot([12]), 350)).toEqual(["up"]);
    expect(mapper.step(snapshot([12]), 469)).toEqual([]);
    expect(mapper.step(snapshot([12]), 470)).toEqual(["up"]);

    // A delayed frame produces one repeat and schedules from the current
    // frame; it does not emit a catch-up burst.
    expect(mapper.step(snapshot([12]), 2_000)).toEqual(["up"]);
    expect(mapper.step(snapshot([12]), 2_001)).toEqual([]);
  });

  it("uses d-pad priority and chooses one dominant diagonal stick axis", () => {
    const mapper = new XboxControllerMapper();

    expect(mapper.step(snapshot([], [0.61, -0.8, 0, 0]), 0)).toEqual(["up"]);
    expect(mapper.step(snapshot([15], [-0.9, -0.8, 0, 0]), 30)).toEqual(["right"]);
    expect(mapper.step(snapshot([12, 13], [0, 0, 0, 0]), 60)).toEqual(["up"]);
    expect(mapper.step(snapshot(), 90)).toEqual([]);
  });

  it("holds through the hysteresis band and releases below it", () => {
    const mapper = new XboxControllerMapper();

    expect(mapper.step(snapshot([], [0.54, 0, 0, 0]), 0)).toEqual([]);
    expect(mapper.step(snapshot([], [0.56, 0, 0, 0]), 30)).toEqual(["right"]);
    expect(mapper.step(snapshot([], [0.4, 0, 0, 0]), 60)).toEqual([]);
    expect(mapper.step(snapshot([], [0.34, 0, 0, 0]), 90)).toEqual([]);
    expect(mapper.step(snapshot([], [0, 0, 0, 0]), 120)).toEqual([]);
    expect(mapper.step(snapshot([], [-0.56, 0, 0, 0]), 150)).toEqual(["left"]);
  });

  it("requires a neutral frame after reset and ignores unsupported pads", () => {
    const mapper = new XboxControllerMapper();

    expect(mapper.step(snapshot([0]), 0)).toEqual(["select"]);
    mapper.reset();
    expect(mapper.step(snapshot([0]), 30)).toEqual([]);
    expect(mapper.step(snapshot(), 60)).toEqual([]);
    expect(mapper.step(snapshot([0]), 90)).toEqual(["select"]);

    mapper.reset();
    expect(mapper.step(snapshot([0], [0, 0, 0, 0], false), 120)).toEqual([]);
    expect(mapper.step(snapshot(), 150)).toEqual([]);
  });
});
