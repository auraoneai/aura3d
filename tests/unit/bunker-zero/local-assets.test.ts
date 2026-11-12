import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assets } from "../../../apps/showcase-bunker-zero/src/aura-assets";
import { assets as localAssets } from "../../../apps/showcase-bunker-zero/src/aura-assets.local";
import { VIEWMODEL_ASSET } from "../../../apps/showcase-bunker-zero/src/weapons-view";

const APP = path.resolve("apps/showcase-bunker-zero");
const manifest = JSON.parse(readFileSync(path.join(APP, "aura.assets.json"), "utf8"));

function findGlbFiles(dir: string): string[] {
  const found: string[] = [];
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findGlbFiles(full));
    } else if (entry.name.toLowerCase().endsWith(".glb")) {
      found.push(path.relative(APP, full));
    }
  }
  return found;
}

describe("bunker zero zero-GLB procedural asset contract", () => {
  it("ships zero .glb files and zero model entries in aura.assets.json", () => {
    expect(manifest.schema).toBe("aura3d.assets/1.0");
    expect(manifest.assets).toEqual([]);
    expect(Object.keys(localAssets)).toEqual([]);
    expect(findGlbFiles(APP)).toEqual([]);
  });

  it("types all 4 first-person weapon viewmodels as procedural descriptors", () => {
    const expectedKeys = [
      "bzProceduralCombatMachete",
      "bzProceduralPulseCarbine",
      "bzProceduralRocketLauncher",
      "bzProceduralServicePistol"
    ];
    expect(Object.keys(assets).sort()).toEqual(expectedKeys);
    expect(Object.values(VIEWMODEL_ASSET).sort()).toEqual(expectedKeys);
    for (const key of expectedKeys) {
      const entry = assets[key as keyof typeof assets];
      expect(entry).toEqual({ id: key, type: "procedural" });
    }
  });

  it("preserves PBR surface textures, decals and per-floor LUT assets untouched", () => {
    const texDir = path.join(APP, "public/aura-assets/textures");
    const decalDir = path.join(APP, "public/aura-assets/decals");
    const lutDir = path.join(APP, "public/aura-assets/luts");

    const textures = readdirSync(texDir).filter((f) => f.endsWith(".jpg"));
    const decals = readdirSync(decalDir).filter((f) => f.endsWith(".png")).sort();
    const luts = readdirSync(lutDir).filter((f) => f.endsWith(".cube")).sort();

    expect(textures.length).toBe(18);
    expect(existsSync(path.join(texDir, "ATTRIBUTION.md"))).toBe(true);
    expect(decals).toEqual([
      "bz-bullet-hole.png",
      "bz-crack.png",
      "bz-hazard-stripe.png",
      "bz-scorch.png"
    ]);
    expect(luts).toEqual([
      "bz-f1-tungsten.cube",
      "bz-f2-cellar.cube",
      "bz-f3-forge.cube",
      "bz-f4-brass.cube",
      "bz-f5-fluorescent.cube",
      "bz-f6-alarm.cube"
    ]);
  });
});
