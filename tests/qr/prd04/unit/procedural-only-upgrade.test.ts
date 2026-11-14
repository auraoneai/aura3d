/**
 * procedural-only-upgrade.test.ts — 04-S7 regression (main GPU run 38144924567):
 * `material.fabric()` and the other procedural presets carry only procedural
 * inputs (no URL maps). upgradeProductionPrimitiveTextures skipped them, so with
 * A3D_QR_MATERIALS on the procedural maps were never rasterized and the S7 frame
 * equalled flag-off exactly. Flag-on, a procedural-only resource now upgrades
 * (no fetch). Flag-off it is still skipped, with the "no rasterizer" warning.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { upgradeProductionPrimitiveTextures } from "../../../../packages/engine/src/agent-api/compiler/textures";
import { material } from "../../../../packages/engine/src/agent-api/nodes/material";
import { setTypedGLBActorQrFlags } from "../../../../packages/engine/src/production-runtime/actor/extensions";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { PBRMaterial } from "../../../../packages/rendering/src/PBRMaterial";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_MATERIALS: true } });
const FLAGS_OFF = resolveQrFlags({ options: { A3D_QR_MATERIALS: false } }); // explicit: materials is default-on

afterEach(() => {
  setTypedGLBActorQrFlags(FLAGS_OFF);
  vi.unstubAllGlobals();
});

function resource(materialSpec: Record<string, unknown>) {
  return {
    name: "probe",
    materialSpec,
    sourceNode: { kind: "primitive", primitive: "sphere", material: materialSpec },
    material: new PBRMaterial(),
    geometry: { vertexBuffer: { format: { hasAttribute: (_name: string) => true } } },
    textureStatus: "none",
    textureWarnings: [] as string[],
    textureSlots: [] as string[],
    texturedMaterial: null as PBRMaterial | null,
    textureDisposer: undefined as (() => void) | undefined
  };
}

async function upgrade(value: ReturnType<typeof resource>, warn: (message: string) => void) {
  await upgradeProductionPrimitiveTextures([{ resources: [value] }] as unknown as Parameters<typeof upgradeProductionPrimitiveTextures>[0], warn);
}

describe("procedural-only primitive materials (04-S7)", () => {
  it("flag on: material.fabric() runs the textured upgrade without any fetch", async () => {
    setTypedGLBActorQrFlags(FLAGS_ON);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const value = resource(material.fabric() as Record<string, unknown>);
    const warnings = vi.fn();
    await upgrade(value, warnings);
    expect(fetch).not.toHaveBeenCalled();
    expect(warnings.mock.calls).toEqual([]);
    expect(value.textureStatus).toBe("textured");
    expect(value.textureSlots).toContain("normal");
    expect(value.textureWarnings.some((w) => w.includes("has no rasterizer"))).toBe(false);
  });

  it("flag on: material.blackRubber() binds an upward tangent-space normal map, not its greyscale roughness field", async () => {
    setTypedGLBActorQrFlags(FLAGS_ON);
    vi.stubGlobal("fetch", vi.fn());
    const value = resource(material.blackRubber() as Record<string, unknown>);
    await upgrade(value, vi.fn());
    expect(value.textureStatus).toBe("textured");
    expect(value.textureSlots).toContain("normal");
    const binding = value.texturedMaterial?.getParameter("u_normalTexture") as { texture: { getMipLevel(level: number): { data: Uint8Array } | null; generateMipmaps: boolean } } | undefined;
    const texture = binding!.texture;
    // Full mip chain is generated for the shared procedural map on both backends.
    expect(texture.generateMipmaps).toBe(true);
    const data = texture.getMipLevel(0)!.data;
    let minZ = 1;
    let greyTexels = 0;
    for (let i = 0; i < data.length; i += 4) {
      minZ = Math.min(minZ, data[i + 2]! / 255 * 2 - 1);
      if (data[i] === data[i + 1] && data[i + 1] === data[i + 2]) greyTexels++;
    }
    // Pre-fix the raw field (R=G=B, z in [-0.2, 0.2]) was decoded as a normal: ~55-90 deg tilts flipping per texel.
    expect(minZ).toBeGreaterThan(0.85);
    expect(greyTexels).toBe(0);
    const sampler = value.texturedMaterial?.getParameter("u_normalTexture") as { sampler?: { minFilter: string } };
    expect(sampler.sampler?.minFilter).toBe("linear-mipmap-linear");
  });

  it("flag on: material.brushedMetal() binds a groove normal map, not its near-tangent direction field (S1)", async () => {
    setTypedGLBActorQrFlags(FLAGS_ON);
    vi.stubGlobal("fetch", vi.fn());
    const value = resource(material.brushedMetal() as Record<string, unknown>);
    await upgrade(value, vi.fn());
    expect(value.textureStatus).toBe("textured");
    expect(value.textureSlots).toContain("normal");
    expect(value.textureSlots).toContain("metallicRoughness");
    const binding = value.texturedMaterial?.getParameter("u_normalTexture") as { texture: { getMipLevel(level: number): { data: Uint8Array } | null; generateMipmaps: boolean } } | undefined;
    const texture = binding!.texture;
    expect(texture.generateMipmaps).toBe(true);
    const data = texture.getMipLevel(0)!.data;
    let minZ = 1;
    let maxAbsX = 0;
    for (let i = 0; i < data.length; i += 4) {
      minZ = Math.min(minZ, data[i + 2]! / 255 * 2 - 1);
      maxAbsX = Math.max(maxAbsX, Math.abs(data[i]! / 255 * 2 - 1));
    }
    // Pre-fix the raw field decoded to (1, 0, <=0): every texel pointed along the tangent.
    expect(minZ).toBeGreaterThan(0.9);
    expect(maxAbsX).toBeLessThan(0.35);
    // roughnessMap: streaky G (was a constant 128 from the encoded brush direction), mean unchanged.
    const mr = (value.texturedMaterial?.getParameter("u_metallicRoughnessTexture") as { texture: { getMipLevel(level: number): { data: Uint8Array } | null } }).texture.getMipLevel(0)!.data;
    const greens = new Set<number>();
    let gSum = 0;
    for (let i = 0; i < mr.length; i += 4) { greens.add(mr[i + 1]!); gSum += mr[i + 1]!; }
    expect(greens.size).toBeGreaterThan(20);
    expect(Math.abs(gSum / (mr.length / 4) - 128)).toBeLessThan(1.5);
  });

  it("flag off: a procedural-only spec is still skipped with the 'no rasterizer' record", async () => {
    setTypedGLBActorQrFlags(FLAGS_OFF);
    const value = resource(material.fabric() as Record<string, unknown>);
    await upgrade(value, vi.fn());
    expect(value.textureStatus).toBe("none");
    expect(value.textureWarnings.some((w) => w.includes("has no rasterizer"))).toBe(true);
  });
});
