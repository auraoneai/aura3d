/**
 * #1141 / 02-S2 — verify native legacy-environment fallback and the separate
 * analytical studio. Existing baked neutral bytes retain their historical
 * provenance until the independent studio has actually been rebaked.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { collectEnvironmentLighting } from "../../../../packages/rendering/src/renderer/Background";
import { TextureBinding } from "../../../../packages/rendering/src/TextureBinding";
import { Texture } from "../../../../packages/rendering/src/Texture";
import { sampleRoomEnvironment } from "../../../../packages/rendering/src/environment/RoomEnvironmentScene";
import { NEUTRAL_FLOOR_RADIANCE, NEUTRAL_FLOOR_SH9 } from "../../../../packages/rendering/src/environment/probeBuild";
import { createProductionRuntimeEnvironment } from "../../../../packages/engine/src/agent-api/compiler/environment";

const LIGHTING_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true, A3D_QR_COMPILER: false } });
const BASE = resolveQrFlags({ options: ["none"] });
afterEach(() => setRendererQrFlags(BASE));

// The engine's legacy bridge marks the fallback of a scene with no environment and no lights.
const snapshot = (nodes: readonly unknown[]) => ({ nodes, camera: {}, background: "#000000" }) as never;
const AMBIENT_ONLY = createProductionRuntimeEnvironment(snapshot([{ kind: "light", light: "ambient", color: "#ffffff", intensity: 0.05 }])).lighting;
const SUN_ONLY = createProductionRuntimeEnvironment(snapshot([{ kind: "light", light: "directional", color: "#ffffff", intensity: 3 }])).lighting;
const CATEGORY = createProductionRuntimeEnvironment(snapshot([])).lighting;
const PROCEDURAL = {
  color: [0.78, 0.8, 0.84] as [number, number, number],
  intensity: 0.42,
  proceduralMap: { skyColor: [0.6, 0.7, 0.9] as [number, number, number], horizonColor: [0.9, 0.8, 0.6] as [number, number, number], groundColor: [0.1, 0.1, 0.1] as [number, number, number], specularColor: [1, 1, 1] as [number, number, number], intensity: 0.5, specularIntensity: 0.8 }
};

describe("legacy path under A3D_QR_LIGHTING binds the neutral room (#1141 / 02-S2)", () => {
  it("scenes with authored lights keep their legacy environment", () => {
    setRendererQrFlags(LIGHTING_ON);
    expect(collectEnvironmentLighting({ environmentLighting: AMBIENT_ONLY } as never)).toBe(AMBIENT_ONLY);
    expect(collectEnvironmentLighting({ environmentLighting: SUN_ONLY } as never)).toBe(SUN_ONLY);
  });

  it("no environment and no lights: the neutral room replaces the category map, no ambient added", () => {
    setRendererQrFlags(LIGHTING_ON);
    for (const source of [{}, { environmentLighting: CATEGORY }]) {
      const lighting = collectEnvironmentLighting(source as never)!;
      expect(lighting.environmentMapTexture).toBeDefined();
      expect(lighting.proceduralMap).toBeUndefined();
      expect(lighting.intensity).toBe(0);
    }
  });

  it("authored (unmarked) environments keep their lighting under the flag", () => {
    setRendererQrFlags(LIGHTING_ON);
    expect(collectEnvironmentLighting({ environmentLighting: PROCEDURAL } as never)).toBe(PROCEDURAL);
    const map = new TextureBinding({ name: "u_environmentMapTexture", texture: new Texture({ label: "hdri", width: 2, height: 1 }), required: true });
    const authored = { ...PROCEDURAL, environmentMapTexture: map, environmentMapIntensity: 0.8 };
    expect(collectEnvironmentLighting({ environmentLighting: authored } as never)).toBe(authored);
  });

  it("flag off is unchanged: the legacy environment is returned as-is", () => {
    setRendererQrFlags(BASE);
    expect(collectEnvironmentLighting({ environmentLighting: AMBIENT_ONLY } as never)).toBe(AMBIENT_ONLY);
    expect(collectEnvironmentLighting({ environmentLighting: CATEGORY } as never)).toBe(CATEGORY);
    expect(collectEnvironmentLighting({} as never)?.environmentMapTexture).toBeUndefined();
  });
});

describe("independent analytical studio and historical embedded preset", () => {
  it("the forward wall follows the independently specified Lambertian point-light equation", () => {
    // Wall at (0,0,12), light at (0,7,0), inward normal (0,0,-1).
    const distance = Math.hypot(7, 12);
    const expected = (0.8 / Math.PI) * 240 * (12 / distance) * (1 - distance / 40) ** 2 / distance ** 2;
    for (const value of sampleRoomEnvironment([0, 0, 1])) expect(value).toBeCloseTo(expected, 10);
  });

  it("embedded floor constants match the retained historical bytes (DC ≈ radiance · 3.5483)", () => {
    const bytes = readFileSync("public/aura-environments/neutral.sh9.f32");
    const baked = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(Array.from(NEUTRAL_FLOOR_SH9)).toEqual(Array.from(baked));
    expect(NEUTRAL_FLOOR_SH9[0]! / NEUTRAL_FLOOR_RADIANCE).toBeCloseTo(3.5483, 3);
  });
});

describe("legacy neutral room is directional (02-S2 follow-up)", () => {
  it("the last cube level is SH9 irradiance / pi: brighter facing the lit ceiling than the floor", async () => {
    const { buildNeutralRoomLegacyProbe } = await import("../../../../packages/rendering/src/environment/probeBuild");
    const probe = buildNeutralRoomLegacyProbe();
    expect(probe.mipCount).toBe(4);
    const faces = probe.specularCube.cubeFaces;
    const last = (face: number) => faces[face]!.mipLevels[3]!;
    expect(last(2).width).toBe(16);
    // Positive half floats order like their uint16 bit patterns.
    const centre = (face: number) => {
      const level = last(face);
      const i = ((level.height / 2) * level.width + level.width / 2) * 4;
      return (level.data as Uint16Array)[i]!;
    };
    // GL cube order +x, -x, +y, -y, +z, -z; these are historical embedded bytes.
    expect(centre(2)).toBeGreaterThan(centre(3));
  });

  it("collectEnvironmentLighting binds that probe's cube for a no-light scene", () => {
    setRendererQrFlags(LIGHTING_ON);
    const lighting = collectEnvironmentLighting({} as never)!;
    const cube = lighting.environmentCubeMapTexture!.texture!;
    expect(cube.cubeFaces[0]!.mipLevels).toHaveLength(4);
    expect(cube.label).toBe("env-neutral-room-legacy");
  });
});
