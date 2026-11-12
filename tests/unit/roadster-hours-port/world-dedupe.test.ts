import { describe, expect, it } from "vitest";
import { buildWorld, matrixFor } from "../../../examples/roadster-hours-port/world";

function nodeNames(scene: { toJSON(): unknown }): string[] {
  const names: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { for (const item of v) walk(item); return; }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.name === "string" && ("kind" in o || "geometry" in o || "material" in o)) names.push(o.name);
      for (const key of Object.keys(o)) walk(o[key]);
    }
  };
  walk(scene.toJSON());
  return names;
}
const landmarks = (names: string[]): string[] => names.filter((n) => /^lighthouse|^town/.test(n) && !n.endsWith("-far")).sort();

describe("Saltwind Highway landmarks are built once (audit C3)", () => {
  it("with richScenery off (?look=original), the legacy lighthouse and town stand in", () => {
    expect(landmarks(nodeNames(buildWorld(0, "original").scene))).toEqual([
      "lighthouse-band-a", "lighthouse-band-b", "lighthouse-base", "lighthouse-cap", "lighthouse-gallery", "lighthouse-lantern", "lighthouse-rock", "lighthouse-shaft", "town"
    ]);
  });
  it("with sculpted procedural scenery (GU47), only the sculpted models (and the rock island under them) are built", () => {
    expect(landmarks(nodeNames(buildWorld(0, "gu47").scene))).toEqual(["lighthouse-model", "lighthouse-rock", "town-townhouses", "town-villas"]);
  });
  it("other routes have no coastal landmarks", () => {
    expect(landmarks(nodeNames(buildWorld(1, "gu47").scene))).toEqual([]);
    expect(landmarks(nodeNames(buildWorld(2, "gu47").scene))).toEqual([]);
  });
});

describe("instance matrices reuse one buffer (audit C14)", () => {
  it("writes into the scratch buffer and matches a fresh matrix", () => {
    const out = new Float32Array(16);
    const a = matrixFor(0.3, [1, 2, 3], [2, 1, 4], out);
    expect(a).toBe(out);
    const fresh = matrixFor(0.3, [1, 2, 3], [2, 1, 4]);
    expect(Array.from(a)).toEqual(Array.from(fresh));
    expect(fresh[12]).toBe(1);
    expect(fresh[5]).toBe(1);
  });
});
