import { describe, expect, it } from "vitest";
import { buildWorld } from "../../../examples/roadster-hours-port/world";

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

describe("Saltwind Highway hero-first scene order", () => {
  it("adds the player's car before the procedural props and traffic", () => {
    const names = nodeNames(buildWorld(0, "gu47").scene);
    const car = names.indexOf("car-body");
    expect(car).toBeGreaterThanOrEqual(0);
    const downstream = names.filter((n) => /^vehicles-(hatch|sedan|pickup|suv|bus|semi|tanker|boxtruck)$/.test(n) || ["lighthouse-model", "town-villas", "town-townhouses", "palms", "pines", "boulders"].includes(n));
    expect(downstream.length).toBeGreaterThanOrEqual(10);
    for (const name of downstream) expect(names.indexOf(name)).toBeGreaterThan(car);
  });
});
