import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const ROUTE = readFileSync(path.join(ROOT, "apps/showcase-aura-hoops-3d/src/aura-assets.route.ts"), "utf8");
const MAIN = readFileSync(path.join(ROOT, "apps/showcase-aura-hoops-3d/src/main.ts"), "utf8");

function entry(key: string): { url: string; hash: string; sizeBytes: number } {
  const block = ROUTE.slice(ROUTE.indexOf(`"${key}": {`));
  const get = (field: string) => new RegExp(`${field}:\\s*"?([^",\\n]+)"?`).exec(block)![1]!;
  return { url: get("url"), hash: get("hash"), sizeBytes: Number(get("sizeBytes")) };
}

function glbJson(buf: Buffer): Record<string, any> {
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString("utf8"));
}

describe("Aura Hoops athlete models", () => {
  for (const key of ["hoopsAthleteGuard", "hoopsAthleteBig"]) {
    it(`${key}: file matches its declared hash and size, is painted by four materials with no texture, and keeps rig and clips`, () => {
      const e = entry(key);
      const buf = readFileSync(path.join(ROOT, "public", e.url));
      expect(buf.length).toBe(e.sizeBytes);
      expect(`sha256-${createHash("sha256").update(buf).digest("hex")}`).toBe(e.hash);
      const json = glbJson(buf);
      // The original atlas tore single triangles across the whole texture (shard artefacts): no texture may come back.
      expect(json.images ?? []).toHaveLength(0);
      expect(json.textures ?? []).toHaveLength(0);
      // Painted by four material primitives (the engine ignores glTF COLOR_0 on this skinned path): kit, shorts, skin, dark.
      const prims = json.meshes[0].primitives as Array<{ attributes: Record<string, number>; material: number }>;
      expect(prims).toHaveLength(4);
      for (const prim of prims) {
        expect(prim.attributes.JOINTS_0).toBeTypeOf("number");
        expect(prim.attributes.WEIGHTS_0).toBeTypeOf("number");
        expect(prim.attributes.COLOR_0).toBeUndefined();
      }
      expect(new Set(prims.map((p) => p.material)).size).toBe(4);
      expect(json.skins).toHaveLength(1);
      const clips = (json.animations as Array<{ name: string }>).map((a) => a.name);
      for (const needed of ["Idle", "Ready", "Run", "Sprint_Loop", "Shoot", "Jump", "Crouch_Idle_Loop"]) expect(clips).toContain(needed);
    });
  }

});
