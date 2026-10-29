import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const APP = path.resolve("apps/showcase-iron-crown");
const manifest = JSON.parse(readFileSync(path.join(APP, "aura.assets.json"), "utf8"));
const entries: Array<{ id: string; source: string }> = manifest.assets ?? manifest;

describe("iron crown fighters: flat stylised faces", () => {
  for (const id of ["ironcrownKenji", "ironcrownVolt", "ironcrownBoulder", "ironcrownSeraph", "ironcrownSovereign"]) {
    it(`${id}: head skin uses a small flat face texture and the head hair a flat colour`, async () => {
      const entry = entries.find((e) => e.id === id)!;
      const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(path.join(APP, entry.source));
      const root = doc.getRoot();
      const mats = root.listMaterials().map((m) => m.getName());
      expect(mats).toContain("face");
      const helmeted = id === "ironcrownSovereign"; // a helmet covers the hair: no hair primitive
      if (!helmeted) expect(mats).toContain("hair");
      const face = root.listMaterials().find((m) => m.getName() === "face")!;
      const faceTex = face.getBaseColorTexture()!;
      expect(faceTex.getSize()![0]).toBeLessThanOrEqual(512);
      if (!helmeted) expect(root.listMaterials().find((m) => m.getName() === "hair")!.getBaseColorTexture()).toBeNull();
      // the skeleton and the animation clips are untouched
      expect(root.listSkins()).toHaveLength(1);
      expect(root.listAnimations().length).toBeGreaterThanOrEqual(10);
      // the face primitive keeps skinning attributes so it animates with the body
      const prim = root.listMeshes()[0]!.listPrimitives().find((p) => p.getMaterial() === face)!;
      expect(prim.getAttribute("JOINTS_0")).toBeTruthy();
      expect(prim.getAttribute("WEIGHTS_0")).toBeTruthy();
    });
  }
});
