/**
 * WebGPU refuses the `prd03.indirectFraction` alpha tag on a non-float colour target (`validateGeneratedPbrTarget`), so a
 * scene with `output.toneMapping: "none"` (rgba8 scene target) failed its whole mount on the first lit draw (Chroma Roll).
 * The forward pass now leaves the tag off such draws on WebGPU; float targets and WebGL2 keep selecting it.
 */
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd03";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";

type FeaturesFor = (material: PBRMaterial, device: MockRenderDevice, item: RenderItem) => ProgramFeatures;

function selectedFeatures(kind: "webgl2" | "webgpu", format: "rgba8" | "rgba16f" | null): Readonly<Record<string, unknown>> {
  const device = new MockRenderDevice();
  Object.defineProperty(device, "kind", { value: kind });
  setRendererQrFlags(createTrustedQrFlags(resolveQrFlags({ options: ["post"], env: { A3D_QR_CORE: "v2" } }).values), device);
  const geometry = Geometry.triangle();
  const material = new PBRMaterial();
  const target = format ? device.createRenderTarget({ width: 8, height: 8, format, label: `scene-${format}` }) : undefined;
  try {
    device.beginFrame(8, 8);
    if (target) device.setRenderTarget(target);
    const pass = new ForwardPass({ items: [] } as never);
    const features = (pass as unknown as { programFeaturesFor: FeaturesFor }).programFeaturesFor(material, device, { geometry, material });
    return features.features;
  } finally {
    target?.dispose();
    material.dispose();
    geometry.dispose();
  }
}

describe("WebGPU indirect-fraction tag on non-float scene targets", () => {
  it("drops the tag on WebGPU when the bound colour target is rgba8", () => {
    expect(selectedFeatures("webgpu", "rgba8")).not.toHaveProperty("prd03.indirectFraction");
  });
  it("keeps the tag on WebGPU float targets and on every WebGL2 target", () => {
    expect(selectedFeatures("webgpu", "rgba16f")).toHaveProperty("prd03.indirectFraction", "indirectFraction");
    expect(selectedFeatures("webgl2", "rgba8")).toHaveProperty("prd03.indirectFraction", "indirectFraction");
    expect(selectedFeatures("webgl2", "rgba16f")).toHaveProperty("prd03.indirectFraction", "indirectFraction");
  });
  it("keeps the tag when no target is bound (selection before binding is unchanged)", () => {
    expect(selectedFeatures("webgpu", null)).toHaveProperty("prd03.indirectFraction", "indirectFraction");
  });
});
