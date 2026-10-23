import { describe, expect, it } from "vitest";
import { diffCues, type AudioState } from "../../../examples/last-train-port/audio";

const base: AudioState = { phase: "docked", speed: 0, roll: 0, fares: 0, tips: 0, lost: 0, night: false, weather: "clear", complete: false };
const at = (patch: Partial<AudioState>): AudioState => ({ ...base, ...patch });

describe("last-train-port audio cues", () => {
  it("emits nothing for the first observed state or an unchanged one", () => {
    expect(diffCues(null, base)).toEqual([]);
    expect(diffCues(base, base)).toEqual([]);
  });

  it("maps phase changes to door, departure and arrival cues", () => {
    expect(diffCues(base, at({ phase: "opening" }))).toEqual(["doors"]);
    expect(diffCues(at({ phase: "ready" }), at({ phase: "retracting" }))).toEqual(["depart"]);
    expect(diffCues(at({ phase: "ready" }), at({ phase: "boarding" }))).toEqual([]);
    expect(diffCues(at({ phase: "enroute" }), at({ phase: "docked" }))).toEqual(["arrive"]);
  });

  it("maps fares, tips, lost riders and completion", () => {
    expect(diffCues(base, at({ fares: 1 }))).toEqual(["fare"]);
    expect(diffCues(base, at({ tips: 3 }))).toEqual(["tip"]);
    expect(diffCues(base, at({ lost: 1 }))).toEqual(["lost"]);
    expect(diffCues(at({ phase: "ready" }), at({ phase: "ready", complete: true }))).toEqual(["complete"]);
    expect(diffCues(at({ fares: 2 }), at({ fares: 3, tips: 1 }))).toEqual(["fare", "tip"]);
  });
});
