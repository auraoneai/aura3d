// The renderer warmup warms the bone-texture skinning record ForwardPass draws
// (skinning.palette "texture" plus the joint input types), so a skinned draw's
// warmed key matches its draw key and native WebGPU never compiles the
// unsupported uniform-palette variant (Aura Links, Iron Crown warmup failures).
import { afterEach, describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd06";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { generatedSkinningForGeometry, type RenderItem } from "../../../packages/rendering/src/ForwardPass";
import type { ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";

const FLAGS = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_LIGHTING: true, A3D_QR_ANIMATION: true } });

afterEach(() => setRendererQrFlags(resolveQrFlags({ options: {} })));

describe("generated skinning warmup", () => {
  it("rewrites a selected skin segment to the bone-texture record with the geometry's joint types", () => {
    const geometry = new Geometry(new VertexBuffer(VertexFormat.P3N3J4W4, 3), new IndexBuffer([0, 1, 2], 3));
    const record = { features: { "prd06.deform": "skin4" }, skinning: { influences: 4, palette: "uniform" } } as Pick<ProgramFeatures, "features" | "skinning">;
    expect(generatedSkinningForGeometry(record, geometry, "m")).toEqual({ features: { "prd06.deform": "skin4", "prd06.joint0Type": "float" }, skinning: { influences: 4, palette: "texture" } });
    const rigid = { features: {}, skinning: undefined } as Pick<ProgramFeatures, "features" | "skinning">;
    expect(generatedSkinningForGeometry(rigid, geometry, "m")).toBe(rigid);
    geometry.dispose();
  });

  it("warms the record ForwardPass draws for a skinned item", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16, qrFlags: FLAGS });
    setRendererQrFlags(FLAGS);
    const geometry = new Geometry(new VertexBuffer(VertexFormat.P3N3J4W4, 3), new IndexBuffer([0, 1, 2], 3));
    const material = new PBRMaterial({ name: "skinned-warm" });
    try {
      const item: RenderItem = { geometry, material, label: "skinned", skinning: { jointCount: 2, matrices: new Float32Array(32), extraInfluences: false } };
      const internals = renderer as unknown as { collectWarmupInput(...args: unknown[]): { materials: Partial<ProgramFeatures>[] } };
      const input = internals.collectWarmupInput([item], [], undefined, undefined, undefined, undefined, FLAGS, "high");
      const skinnedRecords = input.materials.filter((record) => typeof record.features?.["prd06.deform"] === "string");
      expect(skinnedRecords.length).toBeGreaterThan(0);
      for (const record of skinnedRecords) {
        expect(record.skinning).toEqual({ influences: 4, palette: "texture" });
        expect(record.features?.["prd06.joint0Type"]).toBe("float");
      }
    } finally { renderer.dispose(); geometry.dispose(); material.dispose(); }
  });
});
