import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { HOOPS_FX_PRESETS } from "../../../apps/showcase-aura-hoops-3d/src/fxPack";
import { lumaJumpStats, meanLuma } from "../../../apps/showcase-aura-hoops-3d/src/lumaProbe";
import { assets } from "../../../apps/showcase-aura-hoops-3d/src/aura-assets.route";

const ROOT = path.resolve(__dirname, "../../..");

describe("aura hoops: no white flashes", () => {
  it("measures mean luma and frame-to-frame flashes", () => {
    expect(meanLuma([255, 255, 255, 255, 0, 0, 0, 255])).toBeCloseTo(127.5, 5);
    // steady play with a slow pan: no flash
    const steady = Array.from({ length: 120 }, (_, i) => 80 + Math.sin(i / 20) * 4);
    expect(lumaJumpStats(steady).flashes).toBe(0);
    expect(lumaJumpStats(steady).maxJump).toBeLessThan(2);
    // the one-frame white pop the probe caught on GPU (90 -> 124 -> 86) is a flash
    const pop = [...steady.slice(0, 30), 90, 124, 86, ...steady.slice(0, 30)];
    const s = lumaJumpStats(pop);
    expect(s.flashes).toBeGreaterThan(0);
    expect(s.maxFlash).toBeGreaterThan(30);
    // a lasting cut to a brighter shot is not a flash
    expect(lumaJumpStats([...Array(20).fill(70), ...Array(40).fill(110)]).flashes).toBe(0);
  });

  it("no VFX preset adds a transient light (a light appearing mid-play drew one white-void frame)", () => {
    for (const [kind, spec] of Object.entries(HOOPS_FX_PRESETS)) {
      expect(spec.layers.filter((l) => l.type === "light"), kind).toHaveLength(0);
    }
  });

  it("every athlete GLB has unit tangents (zero tangents normalize to NaN and bloom into a white veil)", async () => {
    const io = new NodeIO();
    const keys = Object.keys(assets).filter((k) => /^hoopsIdol(?!BallCart|Trophy)/.test(k));
    expect(keys.length).toBe(10);
    for (const key of keys) {
      const url = (assets as Record<string, { url: string }>)[key]!.url;
      const doc = await io.read(path.join(ROOT, "public", url));
      for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
        const t = prim.getAttribute("TANGENT");
        if (!t) continue;
        const v = [0, 0, 0, 0];
        let bad = 0;
        for (let i = 0; i < t.getCount(); i++) {
          t.getElement(i, v);
          const l = Math.hypot(v[0]!, v[1]!, v[2]!);
          if (!(l > 0.5 && l < 1.5)) bad++;
        }
        expect(bad, key).toBe(0);
      }
    }
  }, 60000);
});
