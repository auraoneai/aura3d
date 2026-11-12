import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG_IDS, assets } from "../../../apps/showcase-teleoperator/src/aura-assets";

const root = resolve(__dirname, "../../..");
const appSrc = (file: string): string => readFileSync(join(root, "apps/showcase-teleoperator/src", file), "utf8");

describe("grid dispatch per-app asset manifest (RH-06, C6, 100% @aura3d/engine procedural)", () => {
  it("does not import the root asset catalog", () => {
    for (const file of ["main.ts", "scene.ts", "sim.ts", "aura-assets.ts"]) expect(appSrc(file)).not.toMatch(/src\/aura-assets["']/);
  });
  it("ships zero GLB or Meshy model entries (all vehicles, landmarks, buildings, and commuters are @aura3d/engine procedural)", () => {
    expect(Object.keys(assets)).toHaveLength(0);
    expect(Object.keys(CATALOG_IDS)).toHaveLength(0);
    expect(existsSync(join(root, "apps/showcase-teleoperator/public/aura-assets/meshy"))).toBe(false);
    for (const file of ["main.ts", "scene.ts", "aura-assets.ts", "art/proceduralModels.ts"]) {
      expect(appSrc(file), file).not.toMatch(/\.glb\b/);
    }
  });
  it("game keys and ids carry no real brand names", () => {
    const brands = /waymo|cybercab|cybertruck|corvette|tesla|jaguar|mindblown/i;
    for (const key of Object.keys(assets)) expect(key).not.toMatch(brands);
    for (const file of ["main.ts", "scene.ts", "sim.ts", "rules.ts", "hud.ts", "touch.ts", "audio.ts", "../index.html", "../package.json", "../route-health.json"]) {
      const text = file === "aura-assets.ts" ? "" : appSrc(file);
      expect(text, file).not.toMatch(brands);
    }
  });
});
