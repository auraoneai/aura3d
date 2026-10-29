// PRD 04 F1.2: context loss (and the hidden tab) is deterministic and never resumes speech by itself.
import { describe, expect, it } from "vitest";
import { createPauseSet } from "../../../src/runtime/pause-reasons.js";

describe("pause reasons", () => {
  it("a lost device pauses; restoring it keeps the story paused until a grown-up resumes", () => {
    const pauses = createPauseSet();
    expect(pauses.add("device")).toBe(true);
    expect(pauses.paused()).toBe(true);
    expect(pauses.holdForGrownUp("device")).toBe(true);
    expect(pauses.paused()).toBe(true);
    expect(pauses.reasons()).toEqual(["user"]);
    expect(pauses.release(["user", "hidden", "device"])).toBe(true);
    expect(pauses.paused()).toBe(false);
  });

  it("a hidden tab works the same way and a second reason never resumes early", () => {
    const pauses = createPauseSet();
    expect(pauses.add("user")).toBe(true);
    expect(pauses.add("hidden")).toBe(false);
    expect(pauses.add("device")).toBe(false);
    expect(pauses.holdForGrownUp("hidden")).toBe(true);
    expect(pauses.holdForGrownUp("device")).toBe(true);
    expect(pauses.reasons()).toEqual(["user"]);
    // The parent area closing alone does not resume while the grown-up's pause holds.
    expect(pauses.add("parent")).toBe(false);
    expect(pauses.release(["parent"])).toBe(false);
    expect(pauses.paused()).toBe(true);
    expect(pauses.release(["user", "hidden", "device"])).toBe(true);
  });

  it("restoring a device that never paused the story does nothing", () => {
    const pauses = createPauseSet();
    expect(pauses.holdForGrownUp("device")).toBe(false);
    expect(pauses.paused()).toBe(false);
    expect(pauses.release(["user"])).toBe(false);
    pauses.add("device");
    pauses.clear();
    expect(pauses.paused()).toBe(false);
  });
});
