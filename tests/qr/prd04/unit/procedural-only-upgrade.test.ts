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
const FLAGS_OFF = resolveQrFlags({ options: {} });

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

  it("flag off: a procedural-only spec is still skipped with the 'no rasterizer' record", async () => {
    setTypedGLBActorQrFlags(FLAGS_OFF);
    const value = resource(material.fabric() as Record<string, unknown>);
    await upgrade(value, vi.fn());
    expect(value.textureStatus).toBe("none");
    expect(value.textureWarnings.some((w) => w.includes("has no rasterizer"))).toBe(true);
  });
});
