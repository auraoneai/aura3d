/**
 * #1141 / 02-S2 — the neutral room lights legacy-path scenes under
 * A3D_QR_LIGHTING, and the analytic room matches three r185's
 * RoomEnvironment (point-lit white walls, y = -3.5 scene offset).
 *
 * Without A3D_QR_COMPILER no C-09 probe is bound (only compileScene binds
 * one), so before this fix a flag-on scene with no environment map was lit
 * only by the legacy procedural/ambient-only environment: prd02-no-lights
 * read 0.19× three's RoomEnvironment on GPU (lighting-quality run 38126910230).
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { collectEnvironmentLighting } from "../../../../packages/rendering/src/renderer/Background";
import { TextureBinding } from "../../../../packages/rendering/src/TextureBinding";
import { Texture } from "../../../../packages/rendering/src/Texture";
import {
  createRoomEnvironmentScene,
  ROOM_ENVIRONMENT_SCENE_OFFSET_Y,
  sampleRoomEnvironment
} from "../../../../packages/rendering/src/environment/RoomEnvironmentScene";
import { NEUTRAL_FLOOR_RADIANCE, NEUTRAL_FLOOR_SH9 } from "../../../../packages/rendering/src/environment/probeBuild";
import { createProductionRuntimeEnvironment } from "../../../../packages/engine/src/agent-api/compiler/environment";

const LIGHTING_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
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
  it("scenes with authored lights keep their legacy environment (01/12/14 stay at three parity)", () => {
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

/** three r185 getDistanceAttenuation + BRDF_Lambert on a white wall, computed independently. */
function threeWallRadiance(p: readonly number[], n: readonly number[]): number {
  const light = [0.418, 16.199, 0.3];
  const l = [light[0]! - p[0]!, light[1]! - p[1]!, light[2]! - p[2]!];
  const d = Math.hypot(l[0]!, l[1]!, l[2]!);
  const nDotL = Math.max(0, (n[0]! * l[0]! + n[1]! * l[1]! + n[2]! * l[2]!) / d);
  const window = Math.min(Math.max(1 - (d / 28) ** 4, 0), 1) ** 2;
  return (1 / Math.PI) * 900 * nDotL * (1 / Math.max(d * d, 0.01)) * window;
}

describe("RoomEnvironmentScene matches pinned three r185 RoomEnvironment", () => {
  const upstream = readFileSync("node_modules/three/examples/jsm/environments/RoomEnvironment.js", "utf8");
  const scene = createRoomEnvironmentScene();

  it("scene offset, white standard materials and the point light come from the pinned file", () => {
    expect(Number(/this\.position\.y\s*=\s*(-?\s*[\d.]+)/.exec(upstream)![1]!.replace(/\s/g, ""))).toBe(ROOM_ENVIRONMENT_SCENE_OFFSET_Y);
    expect(upstream).toMatch(/new MeshStandardMaterial\(\s*\{\s*side: BackSide\s*\}\s*\)/);
    expect(upstream).toMatch(/new MeshStandardMaterial\(\)/);
    expect(scene.room.albedo).toEqual([1, 1, 1]);
    for (const box of scene.boxes) expect(box.albedo).toEqual([1, 1, 1]);
  });

  it("the floor straight down is point-lit like three (capture point at y = +3.5 in scene space)", () => {
    // Room floor plane: y = 13.219 - 28.305 / 2 = -0.9335 in scene space; the capture point is (0, 3.5, 0).
    const floorY = scene.room.position[1] - scene.room.scale[1] / 2;
    const expected = threeWallRadiance([0, floorY, 0], [0, 1, 0]);
    const [r] = sampleRoomEnvironment([0, -1, 0]);
    expect(r).toBeCloseTo(expected, 5);
    expect(r).toBeGreaterThan(0.5);
  });

  it("a wall straight ahead (+z, no box in the way) is point-lit like three", () => {
    const wallZ = scene.room.position[2] + scene.room.scale[2] / 2;
    const [r] = sampleRoomEnvironment([0, 0.05, 1]);
    const t = (wallZ - 0) / (1 / Math.hypot(0, 0.05, 1));
    const p = [0, 3.5 + (0.05 / Math.hypot(0, 0.05, 1)) * t, wallZ];
    expect(r).toBeCloseTo(threeWallRadiance(p, [0, 0, -1]), 4);
  });

  it("neutral floor constants follow the re-baked preset (DC ≈ radiance · 3.5483)", () => {
    const bytes = readFileSync("public/aura-environments/neutral.sh9.f32");
    const baked = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(Array.from(NEUTRAL_FLOOR_SH9)).toEqual(Array.from(baked));
    expect(NEUTRAL_FLOOR_SH9[0]! / NEUTRAL_FLOOR_RADIANCE).toBeCloseTo(3.5483, 3);
  });
});
