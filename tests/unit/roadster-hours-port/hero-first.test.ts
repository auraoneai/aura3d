import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MESHY_MODELS } from "../../../examples/roadster-hours-port/meshy.baked";
import { registerMeshyForTest } from "../../../examples/roadster-hours-port/meshy";
import { buildWorld } from "../../../examples/roadster-hours-port/world";

const bin = (key: string): ArrayBuffer => {
  const b = readFileSync(resolve("examples/roadster-hours-port/assets/meshy", `${key}.bin`));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/** Node names in scene order from the serialized builder. */
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

describe("Saltwind Highway texture order", () => {
  it("adds the player's car before the generated props and traffic, so it is the first model to get its texture", () => {
    for (const key of Object.keys(MESHY_MODELS)) registerMeshyForTest(key, bin(key));
    const names = nodeNames(buildWorld(0).scene);
    const car = names.indexOf("car-body");
    expect(car).toBeGreaterThanOrEqual(0);
    const textured = names.filter((n) => /^vehicles-(hatch|sedan|pickup|suv|bus|semi|tanker|boxtruck)$/.test(n) || ["lighthouse-model", "town-villas", "town-townhouses", "palms", "pines", "boulders"].includes(n));
    expect(textured.length).toBeGreaterThanOrEqual(10);
    for (const name of textured) expect(names.indexOf(name)).toBeGreaterThan(car);
  });
});
