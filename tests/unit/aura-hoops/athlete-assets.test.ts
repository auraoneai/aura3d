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
    it(`${key}: file matches its declared hash and size, is a flat palette strip (no shard atlas, no seam normal map), and keeps rig and clips`, () => {
      const e = entry(key);
      const buf = readFileSync(path.join(ROOT, "public", e.url));
      expect(buf.length).toBe(e.sizeBytes);
      expect(`sha256-${createHash("sha256").update(buf).digest("hex")}`).toBe(e.hash);
      const json = glbJson(buf);
      // The original atlas tore single triangles across the whole texture (shard artefacts) and its normal map outlined every
      // seam: only a tiny flat palette strip may remain, sampled NEAREST so cells never blend into each other.
      expect(json.images ?? []).toHaveLength(1);
      expect(json.textures ?? []).toHaveLength(1);
      expect(json.materials).toHaveLength(1);
      expect(json.materials[0].normalTexture).toBeUndefined();
      expect(json.materials[0].pbrMetallicRoughness.metallicRoughnessTexture).toBeUndefined();
      expect(json.samplers[0].minFilter).toBe(9728);
      expect(json.samplers[0].magFilter).toBe(9728);
      const prims = json.meshes[0].primitives as Array<{ attributes: Record<string, number> }>;
      expect(prims).toHaveLength(1);
      expect(prims[0]!.attributes.JOINTS_0).toBeTypeOf("number");
      expect(prims[0]!.attributes.WEIGHTS_0).toBeTypeOf("number");
      expect(json.skins).toHaveLength(1);
      const clips = (json.animations as Array<{ name: string }>).map((a) => a.name);
      for (const needed of ["Idle", "Ready", "Run", "Sprint_Loop", "Shoot", "Jump", "Crouch_Idle_Loop"]) expect(clips).toContain(needed);
    });
  }

  it("relaxed arms hang nearly straight: hand drop leaves under 10 cm of elbow bend on the 0.555 m arm", () => {
    const drop = Number(/const IDLE_HAND_DROP = ([0-9.]+);/.exec(MAIN)![1]);
    const [l1, l2] = [0.255, 0.3];
    const s = (l1 + l2 + drop) / 2;
    const bend = (2 * Math.sqrt(s * (s - l1) * (s - l2) * (s - drop))) / drop;
    expect(drop).toBeLessThanOrEqual(l1 + l2);
    expect(bend).toBeLessThan(0.1);
    expect(MAIN).toContain("const flare = dribbleNow ? 0.22 : 0.06;");
  });

  it("runs the frame loop behind the library frame error boundary", () => {
    expect(MAIN).toContain("createFrameErrorBoundary");
    expect(MAIN).toMatch(/frameBoundary\.run\(\(\) => \{[\s\S]*frame\(dt\)/);
  });
});
