import { describe, expect, it } from "vitest";
import { createOrbitAudio } from "../../../examples/strange-orbit-port/audio";

describe("strange-orbit presentation audio", () => {
  it("is an inert no-op API when no AudioContext exists (node, SSR, tests)", () => {
    const sound = createOrbitAudio();
    expect(() => {
      sound.unlock();
      sound.cue("dust", 2);
      sound.update({ speed: 30, boosting: true, drafting: false, flight: false, racing: true }, 0.016);
    }).not.toThrow();
    expect(sound.toggleMute()).toBe(true);
  });
});
