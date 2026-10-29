import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NodeIO } from "@gltf-transform/core";

const root = resolve(__dirname, "../../..");
const manifest = JSON.parse(readFileSync(join(root, "aura.assets.json"), "utf8")) as { assets: Array<{ name: string; source: string }> };

describe("teleoperator robotaxi: flat region materials", () => {
  for (const key of ["gridCruiser", "gridRivalCruiser"]) {
    it(`${key}: no baked atlas, no cover discs, flat materials only, inside the triangle budget`, async () => {
      const entry = manifest.assets.find((a) => a.name === key)!;
      const file = join(root, entry.source);
      expect(existsSync(file)).toBe(true);
      const doc = await new NodeIO().read(file);
      const r = doc.getRoot();
      expect(r.listTextures()).toHaveLength(0);
      const names = r.listMaterials().map((m) => m.getName());
      for (const required of ["veh-body", "veh-glass", "veh-tyre", "veh-rim"]) expect(names).toContain(required);
      expect(names.some((n) => /^cover\d+$/.test(n))).toBe(false);
      let tris = 0;
      for (const m of r.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
      expect(tris).toBeLessThanOrEqual(42_000);
    });
  }
});
