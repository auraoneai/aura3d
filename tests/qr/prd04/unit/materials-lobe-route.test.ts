/**
 * QR-04 pixels, not evidence: `A3D_QR_MATERIALS` alone must put r185 lobes on
 * the GPU. The lobes exist only as generated-program chunks, and ForwardPass
 * used to route every generated draw on `A3D_QR_CORE` only — so under
 * `materials` the legacy pbr-direct program (no sheen/iridescence/anisotropy
 * code) drew every material and frames were byte-identical to flags-off
 * (L4 run 38130885306).
 *
 * Asserts on the program the forward pass actually submits (MockRenderDevice):
 *  - materials + lobe material + linear target → generated program with the lobe chunk;
 *  - flags-off, lobe-free material, srgb target, `-core_generator` → legacy program.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  ForwardPass,
  GENERATED_PROGRAM_MARKER,
  Geometry,
  MockRenderDevice,
  PBRMaterial,
  type RenderShaderProgram,
  type ShaderSources
} from "@aura3d/rendering";
import type { RenderItem } from "../../../../packages/rendering/src/ForwardPass";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { qrGeneratedProgramsOn, qrMaterialsLobeProgramsOn, qrCoreOutputOn, rendererAuraFrame } from "../../../../packages/rendering/src/renderer/qrSubFlags";

const OFF = resolveQrFlags({ env: { A3D_QR: "none" } });
const CORE = resolveQrFlags({ env: { A3D_QR: "core,none" } });
const MATERIALS = resolveQrFlags({ env: { A3D_QR: "materials,none" } });
const MATERIALS_NO_GEN = resolveQrFlags({ env: { A3D_QR: "materials,-core_generator,none" } });

class RecordingDevice extends MockRenderDevice {
  readonly sources: ShaderSources[] = [];
  override createShaderProgram(sources: ShaderSources): RenderShaderProgram {
    this.sources.push(sources);
    return super.createShaderProgram(sources);
  }
}

const isGenerated = (s: ShaderSources) => s.marker === GENERATED_PROGRAM_MARKER || s.vertex.includes(GENERATED_PROGRAM_MARKER);

function draw(material: PBRMaterial, outputColorSpace: "linear" | "srgb"): RecordingDevice {
  const device = new RecordingDevice();
  const item: RenderItem = { geometry: Geometry.box(), material, label: "qr04-lobe-route" };
  // Two frames: an async-skip first frame still has to have created the program.
  for (let i = 0; i < 2; i++) {
    device.beginFrame(16, 16);
    new ForwardPass({ items: [item], outputColorSpace }).execute({ device, width: 16, height: 16 });
    device.endFrame();
  }
  return device;
}

const sheen = () => new PBRMaterial({ name: "qr04-sheen", sheenColorFactor: [0.8, 0.2, 0.2], sheenRoughnessFactor: 0.5 });
const plain = () => new PBRMaterial({ name: "qr04-plain" });

afterEach(() => setRendererQrFlags(OFF));

describe("QR-04: materials lobes reach the generated program without A3D_QR_CORE", () => {
  it("flag predicates", () => {
    expect(qrMaterialsLobeProgramsOn(OFF)).toBe(false);
    expect(qrMaterialsLobeProgramsOn(MATERIALS)).toBe(true);
    expect(qrMaterialsLobeProgramsOn(MATERIALS_NO_GEN)).toBe(false);
    expect(qrGeneratedProgramsOn(MATERIALS)).toBe(true);
    expect(MATERIALS.on("A3D_QR_CORE")).toBe(false);
    expect(qrCoreOutputOn(MATERIALS)).toBe(false);
  });

  it("core-only still generates plain materials and binds a real frame buffer", () => {
    setRendererQrFlags(CORE);
    const device = draw(plain(), "linear");
    expect(device.sources.filter(isGenerated).length).toBeGreaterThan(0);
    expect(rendererAuraFrame(device, CORE).buffer).not.toBeNull();
    device.dispose();
  });

  it("materials-only selects a real frame provider without promoting core or output", () => {
    const device = new RecordingDevice();
    expect(rendererAuraFrame(device, MATERIALS).buffer).not.toBeNull();
    expect(MATERIALS.on("A3D_QR_CORE")).toBe(false);
    expect(qrCoreOutputOn(MATERIALS)).toBe(false);
    device.dispose();
    for (const flags of [OFF, MATERIALS_NO_GEN]) {
      const disabledDevice = new RecordingDevice();
      expect(rendererAuraFrame(disabledDevice, flags).buffer).toBeNull();
      disabledDevice.dispose();
    }
  });

  it("materials on: a sheen material draws with a generated program carrying the sheen lobe", () => {
    setRendererQrFlags(MATERIALS);
    const device = draw(sheen(), "linear");
    const generated = device.sources.filter(isGenerated);
    expect(generated.length).toBeGreaterThan(0);
    expect(generated.some((s) => /sheen/i.test(s.fragment))).toBe(true);
    expect(device.drawCommands.length).toBeGreaterThan(0);
    device.dispose();
  });

  it("flags-off: the same material stays on the legacy program", () => {
    setRendererQrFlags(OFF);
    const device = draw(sheen(), "linear");
    expect(device.sources.filter(isGenerated)).toHaveLength(0);
    device.dispose();
  });

  it("materials on: lobe-free materials, srgb targets and -core_generator stay legacy", () => {
    setRendererQrFlags(MATERIALS);
    for (const device of [draw(plain(), "linear"), draw(sheen(), "srgb")]) {
      expect(device.sources.filter(isGenerated)).toHaveLength(0);
      device.dispose();
    }
    setRendererQrFlags(MATERIALS_NO_GEN);
    const device = draw(sheen(), "linear");
    expect(device.sources.filter(isGenerated)).toHaveLength(0);
    device.dispose();
  });
});
