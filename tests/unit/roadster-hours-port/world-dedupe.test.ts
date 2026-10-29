import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MESHY_MODELS } from "../../../examples/roadster-hours-port/meshy.baked";
import { registerMeshyForTest } from "../../../examples/roadster-hours-port/meshy";
import { buildWorld, matrixFor } from "../../../examples/roadster-hours-port/world";

const bin = (key: string): ArrayBuffer => {
  const b = readFileSync(resolve("examples/roadster-hours-port/assets/meshy", `${key}.bin`));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
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
const landmarks = (names: string[]): string[] => names.filter((n) => /^lighthouse|^town/.test(n)).sort();

describe("Saltwind Highway landmarks are built once (audit C3)", () => {
  it("without the generated models, the procedural lighthouse and town stand in", () => {
    expect(landmarks(nodeNames(buildWorld(0).scene))).toEqual([
      "lighthouse-band-a", "lighthouse-band-b", "lighthouse-base", "lighthouse-cap", "lighthouse-gallery", "lighthouse-lantern", "lighthouse-rock", "lighthouse-shaft", "town"
    ]);
  });
  it("with the generated models, only the models (and the rock island under them) are built", () => {
    for (const key of Object.keys(MESHY_MODELS)) registerMeshyForTest(key, bin(key));
    expect(landmarks(nodeNames(buildWorld(0).scene))).toEqual(["lighthouse-model", "lighthouse-rock", "town-townhouses", "town-villas"]);
  });
  it("other routes have no coastal landmarks", () => {
    expect(landmarks(nodeNames(buildWorld(1).scene))).toEqual([]);
    expect(landmarks(nodeNames(buildWorld(2).scene))).toEqual([]);
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
