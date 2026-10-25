import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { classify } from "../../../tools/gridlock-car-retexture/classify.mjs";

const dir = resolve(__dirname, "../../../examples/drift-and-deliver-port/assets/models");

describe("gridlock courier hero car", () => {
  it("is opaque flat-material regions with no baked textures, over the original geometry", async () => {
    const doc = await new NodeIO().readBinary(new Uint8Array(readFileSync(resolve(dir, "hypercar.glb"))));
    const root = doc.getRoot();
    expect(root.listTextures(), "baked glass and interior atlas is gone").toHaveLength(0);
    const names = root.listMaterials().map((m) => m.getName()).sort();
    expect(names).toEqual(["car-body", "car-glass", "car-headlight", "car-rim", "car-taillight", "car-tyre", "car-under"]);
    for (const m of root.listMaterials()) {
      expect(m.getAlphaMode(), m.getName()).toBe("OPAQUE");
      expect(m.getBaseColorFactor()[3], m.getName()).toBe(1);
    }
    const prims = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
    const tris = prims.reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0);
    expect(tris, "the original 39,182 plate triangles plus the small core loft").toBeGreaterThanOrEqual(39182);
    expect(tris).toBeLessThan(39182 + 600);
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of prims) {
      const a = p.getAttribute("POSITION")!.getArray()!;
      for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, a[i + k]!); max[k] = Math.max(max[k]!, a[i + k]!); }
    }
    expect(max[2]! - min[2]!).toBeCloseTo(1.9, 1);
    expect(min[1]!).toBeGreaterThan(-0.01);
  });

  it("classifies the cabin top as glass, the roof strip and the nose as body, the wheel hub as rim", () => {
    expect(classify(0.2, 0.42, 0.1, 0.4)).toBe("glass");
    expect(classify(0.0, 0.48, 0.1, 0.9)).toBe("body");
    expect(classify(0.0, 0.2, 0.6, 0.3)).toBe("body");
    expect(classify(0.42, 0.12, 0.47, 0)).toBe("rim");
    expect(classify(0.42, 0.04, 0.47, 0)).toBe("tyre");
    expect(classify(0.1, 0.05, 0.0, -0.9)).toBe("under");
  });
  it("gives inward-facing fragments of the glass and lights the body colour, so the second shell cannot show as patches", () => {
    expect(classify(0.2, 0.42, 0.1, -0.5, 0.0)).toBe("body");
    expect(classify(0.3, 0.2, 0.9, 0, -0.6)).toBe("body");
    expect(classify(0.3, 0.2, 0.9, 0, 0.6)).toBe("headlight");
    expect(classify(0.3, 0.24, -0.9, 0, 0.6)).toBe("body");
    expect(classify(0.3, 0.24, -0.9, 0, -0.6)).toBe("taillight");
  });

  it("shades the paint with a subtle vertical gradient and no baked textures", async () => {
    const doc = await new NodeIO().readBinary(new Uint8Array(readFileSync(resolve(dir, "hypercar.glb"))));
    const body = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).find((p) => p.getMaterial()?.getName() === "car-body")!;
    const color = body.getAttribute("COLOR_0")!;
    expect(color.getNormalized()).toBe(true);
    const c = color.getArray()!;
    let lo = 255, hi = 0;
    for (let i = 0; i < c.length; i += 4) { lo = Math.min(lo, c[i]!); hi = Math.max(hi, c[i]!); }
    expect(lo / 255).toBeGreaterThan(0.6);
    expect(hi / 255).toBeGreaterThan(0.9);
    expect(hi - lo).toBeGreaterThan(30);
  });
});
