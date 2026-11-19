/**
 * 5.7.0 — directional `shadow.fit: { center, extent, depth }` is read.
 *
 * Before 5.7.0 the option was declared on `AuraDirectionalShadowOptions` and never read: the sun's cascade always followed
 * the camera, so the world size of a shadow-map texel (and with it a texel-measured `normalBias`) changed with framing and
 * resize. With a box set, the sun draws one cascade over the fixed light-space ortho box; the light matrix and the texel
 * world size do not depend on the camera. Unset keeps the camera fit byte for byte.
 */
import { afterEach, describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { PerspectiveCamera, identityMat4 } from "@aura3d/scene";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import type { CollectedLight } from "../../../packages/rendering/src/LightCollector";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { Prd02ShadowSystem, type ShadowSystemConfigInput } from "../../../packages/rendering/src/shadows/ShadowSystem";
import { fitDirectionalCascades, fitFixedDirectionalShadow } from "../../../packages/rendering/src/shadows/DirectionalCascadeFitter";
import { executePrd02BridgedShadowMap, prd02ShadowConfig } from "../../../packages/rendering/src/shadows/Prd02ShadowBridge";
import { createPrd02ShadowOptions, resolveShadowFit, resolveShadowSystemConfig } from "../../../packages/engine/src/agent-api/compiler/shadows";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
afterEach(() => setRendererQrFlags(resolveQrFlags({ options: ["none"] })));

const SNAPSHOT = { nodes: [{ kind: "primitive", primitive: "box", position: [0, 0, 0] }] } as unknown as AuraSceneSnapshot;
const sunWith = (shadowOptions?: Record<string, unknown>) => [{ shadowRequested: true, ...(shadowOptions ? { shadowOptions } : {}) }] as never;

const SUN_DIRECTION: readonly [number, number, number] = [-0.5, -0.7, -0.5];
const sun = {
  kind: "directional", color: [1, 1, 1], intensity: 2, position: [3, 4, 3], direction: SUN_DIRECTION,
  range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 1, source: { id: "sun", name: "sun", visible: true }
} as unknown as CollectedLight;

const caster = { geometry: Geometry.box(), modelMatrix: identityMat4(), label: "crate" } as RenderItem;
/** A 60 x 60 m casting floor: larger than any view slice, so the camera fit cannot shrink to a caster rectangle. */
const floor = { geometry: Geometry.box(), modelMatrix: new Float32Array([60, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 60, 0, 0, -0.6, 0, 1]), label: "floor" } as RenderItem;

/** The homepage-hero-like box: the three.js original's 16 x 12 orthographic shadow camera. */
const BOX = { center: [0, 0, 0] as [number, number, number], halfExtents: [8, 6] as [number, number], depth: 30 };

const PRD02_SHADOWS = {
  enabled: true, mapSize: 2048, cascades: 3, maxDistance: 150, splitLambda: 0.75, blend: 0.1,
  filter: "pcf", strength: 1, bias: 0, normalBias: 1.5, sceneRadius: 6
};

function camera(position: readonly [number, number, number], aspect = 16 / 9, fovDeg = 45): PerspectiveCamera {
  const cam = new PerspectiveCamera({ fovYRadians: (fovDeg * Math.PI) / 180, aspect, near: 0.1, far: 80 });
  cam.transform.setPosition(position[0], position[1], position[2]);
  cam.updateCameraMatrices();
  return cam;
}

/** Wide desktop framing, a compact (portrait, zoomed-in) framing and a moved camera. */
const CAMERAS = [camera([0, 3, 14]), camera([0, 2, 7], 9 / 16, 60), camera([6, 9, 20], 4 / 3, 30)];

function apply(m: ArrayLike<number>, p: readonly number[]): [number, number, number] {
  const w = m[3]! * p[0]! + m[7]! * p[1]! + m[11]! * p[2]! + m[15]!;
  return [
    (m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!) / w,
    (m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!) / w,
    (m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!) / w
  ];
}

/** The light basis the fitter uses (right, up across the light; forward along it). */
function basis(direction: readonly [number, number, number]) {
  const l = Math.hypot(...direction);
  const f = direction.map((v) => v / l) as [number, number, number];
  const cross = (a: readonly number[], b: readonly number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
  const r0 = cross(f, [0, 1, 0]);
  const rl = Math.hypot(r0[0]!, r0[1]!, r0[2]!);
  const right = r0.map((v) => v / rl);
  return { right, up: cross(right, f), forward: f };
}

function updateSystem(config: ShadowSystemConfigInput, cam: PerspectiveCamera) {
  const device = new MockRenderDevice();
  device.beginFrame(256, 256);
  const system = new Prd02ShadowSystem(device, config);
  system.update({ camera: { viewProjectionMatrix: cam.viewProjectionMatrix, near: 0.1, far: 80 }, sun: { direction: SUN_DIRECTION }, casters: [caster], localLights: [], flags: FLAGS_ON, tier: QUALITY_TIERS.high });
  device.endFrame();
  return system.cascadeFits();
}

describe("fitFixedDirectionalShadow: the light-space ortho box", () => {
  it("maps the box's light-space corners to the clip-space edges and its centre to the origin", () => {
    const fit = fitFixedDirectionalShadow({ box: BOX, lightDirection: SUN_DIRECTION, mapSize: 2048 });
    const { right, up, forward } = basis(SUN_DIRECTION);
    const corner = (sx: number, sy: number, sz: number) => [0, 1, 2].map((i) => sx * 8 * right[i]! + sy * 6 * up[i]! + sz * 15 * forward[i]!);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const clip = apply(fit.drawViewProjection, corner(sx, sy, sz));
      expect(clip[0]).toBeCloseTo(sx, 5);
      expect(clip[1]).toBeCloseTo(sy, 5);
      expect(clip[2]).toBeCloseTo(sz, 5);
    }
    const uv = apply(fit.viewProjection, [0, 0, 0]);
    for (const v of uv) expect(v).toBeCloseTo(0.5, 6);
    expect(fit.index).toBe(0);
    // Square map over a 16 x 12 box: the coarser (16 m) axis sets the texel.
    expect(fit.texelWorld).toBeCloseTo(16 / 2048, 9);
  });

  it("moves with the authored centre", () => {
    const fit = fitFixedDirectionalShadow({ box: { ...BOX, center: [3, 1, -2] }, lightDirection: SUN_DIRECTION, mapSize: 1024 });
    for (const v of apply(fit.viewProjection, [3, 1, -2])) expect(v).toBeCloseTo(0.5, 6);
  });

  it("without depth spans the box and every caster over it, and never widens x / y", () => {
    const tall = { ...caster, modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 40, 0, 1]) } as RenderItem;
    const fit = fitFixedDirectionalShadow({ box: { center: [0, 0, 0], halfExtents: [4, 4] }, lightDirection: [0, -1, 0], mapSize: 1024, casters: [tall] });
    const top = apply(fit.drawViewProjection, [0, 40.5, 0]);
    expect(top[2]).toBeGreaterThan(-1);
    expect(fit.texelWorld).toBeCloseTo(8 / 1024, 9);
    const edge = apply(fit.drawViewProjection, [4, 0, 0]);
    expect(Math.max(Math.abs(edge[0]), Math.abs(edge[1]))).toBeCloseTo(1, 5);
  });
});

describe("compiler: shadow.fit (resolveShadowSystemConfig)", () => {
  it("leaves fit out when unset or \"camera\", so the default config is unchanged", () => {
    for (const options of [undefined, { fit: "camera" }]) {
      const config = resolveShadowSystemConfig(SNAPSHOT, sunWith(options), "high");
      expect("fit" in config).toBe(false);
    }
    expect(resolveShadowSystemConfig(SNAPSHOT, sunWith({ fit: "camera", cascades: 3 }), "high").cascades).toBe(3);
  });

  it("threads a box through as one cascade, square or [halfWidth, halfHeight]", () => {
    const square = resolveShadowSystemConfig(SNAPSHOT, sunWith({ fit: { center: [1, 0, 2], extent: 10 }, cascades: 4 }), "high");
    expect(square.cascades).toBe(1);
    expect(square.fit).toEqual({ center: [1, 0, 2], halfExtents: [10, 10] });
    const rect = resolveShadowSystemConfig(SNAPSHOT, sunWith({ fit: { center: [0, 0, 0], extent: [8, 6], depth: 30 } }), "ultra");
    expect(rect.fit).toEqual(BOX);
    expect(rect.cascades).toBe(1);
  });

  it("reaches prd02Shadows from an authored lights.directional shadow (scene snapshot)", () => {
    const snapshotWith = (shadow: unknown) => ({
      schema: "aura3d-scene-snapshot/1.0", camera: { mode: "orbit", position: [0, 2, 5], target: [0, 1, 0] }, diagnostics: { enabled: false },
      nodes: [
        { kind: "primitive", primitive: "box", name: "floor", position: [0, 0, 0], scale: [30, 0.1, 30] },
        { kind: "light", light: "directional", name: "sun", intensity: 2, position: [3, 4, 3], shadow }
      ]
    }) as unknown as AuraSceneSnapshot;
    const boxed = createPrd02ShadowOptions(snapshotWith({ fit: { center: [0, 0, 0], extent: [8, 6], depth: 30 } }), { tier: "high" });
    expect(boxed.prd02Shadows?.fit).toEqual(BOX);
    expect(boxed.prd02Shadows?.cascades).toBe(1);
    expect(boxed.cascadeCount).toBe(1);
    const plain = createPrd02ShadowOptions(snapshotWith(true), { tier: "high" });
    expect(plain.prd02Shadows && "fit" in plain.prd02Shadows).toBe(false);
  });

  it("rejects malformed boxes", () => {
    for (const bad of [{}, { center: [0, 0], extent: 4 }, { center: [0, 0, 0], extent: 0 }, { center: [0, 0, 0], extent: [4] }, { center: [0, 0, 0], extent: 4, depth: -1 }, { center: [0, Number.NaN, 0], extent: 4 }, "box", 3]) {
      expect(() => resolveShadowFit(bad)).toThrow(/SHADOW_FIT_INVALID/);
    }
  });
});

describe("renderer: shadow.fit reaches the cascade fit", () => {
  it("prd02ShadowConfig carries the box only when the compiler set it, as one cascade", () => {
    const plain = prd02ShadowConfig({ shadow: { prd02Shadows: PRD02_SHADOWS } }, FLAGS_ON, QUALITY_TIERS.high, 80);
    expect("fit" in plain).toBe(false);
    expect(plain.cascades).toBe(3);
    const boxed = prd02ShadowConfig({ shadow: { prd02Shadows: { ...PRD02_SHADOWS, cascades: 1, fit: BOX } } }, FLAGS_ON, QUALITY_TIERS.high, 80);
    expect(boxed.fit).toEqual(BOX);
    expect(boxed.cascades).toBe(1);
  });

  it("with a box the light matrix is the box's and does not change when the camera moves, zooms or changes aspect", () => {
    const config = prd02ShadowConfig({ shadow: { prd02Shadows: { ...PRD02_SHADOWS, cascades: 1, fit: BOX } } }, FLAGS_ON, QUALITY_TIERS.high, 80);
    const expected = fitFixedDirectionalShadow({ box: BOX, lightDirection: SUN_DIRECTION, mapSize: 2048, casters: [caster], splitFar: 80 });
    for (const cam of CAMERAS) {
      const fits = updateSystem(config, cam);
      expect(fits).toHaveLength(1);
      expect([...fits[0]!.viewProjection]).toEqual([...expected.viewProjection]);
      expect([...fits[0]!.drawViewProjection]).toEqual([...expected.drawViewProjection]);
      expect(fits[0]!.texelWorld).toBe(16 / 2048);
    }
  });

  it("without a box the cascades still follow the camera exactly as before", () => {
    const config = prd02ShadowConfig({ shadow: { prd02Shadows: PRD02_SHADOWS } }, FLAGS_ON, QUALITY_TIERS.high, 80);
    const matrices = CAMERAS.map((cam) => {
      const fits = updateSystem(config, cam);
      const reference = fitDirectionalCascades({
        camera: { viewProjectionMatrix: cam.viewProjectionMatrix, near: 0.1, far: 80 }, lightDirection: SUN_DIRECTION, casters: [caster],
        mapSize: config.mapSize, cascadeCount: config.cascades, splitLambda: config.splitLambda, maxDistance: config.maxDistance
      });
      expect(fits.map((fit) => [...fit.viewProjection])).toEqual(reference.map((fit) => [...fit.viewProjection]));
      return fits.map((fit) => fit.texelWorld).join(",");
    });
    // The camera fit really does move with framing (what `fit` exists to stop).
    expect(new Set(matrices).size).toBeGreaterThan(1);
  });

  it("the bridged forward map keeps the same light matrix and world-space normalBias across cameras", () => {
    const bridged = (cam: PerspectiveCamera, prd02Shadows: Record<string, unknown>) => {
      const device = new MockRenderDevice();
      device.beginFrame(256, 256);
      const map = executePrd02BridgedShadowMap({
        device, source: { shadow: { enabled: true, prd02Shadows }, collectedLights: [sun] } as never, items: [caster, floor], camera: cam, flags: FLAGS_ON
      });
      device.endFrame();
      expect(map).toBeDefined();
      expect(map!.cascades).toBeUndefined();
      return map!;
    };
    const maps = CAMERAS.map((cam) => bridged(cam, { ...PRD02_SHADOWS, cascades: 1, fit: BOX }));
    for (const map of maps) {
      expect([...map.lightMatrix]).toEqual([...maps[0]!.lightMatrix]);
      // normalBias is in texels (1.5) times the box's texel world size.
      expect(map.normalBias).toBeCloseTo(1.5 * (16 / 2048), 12);
    }
    const cameraFit = CAMERAS.map((cam) => bridged(cam, { ...PRD02_SHADOWS, cascades: 1 }).normalBias);
    expect(new Set(cameraFit).size).toBeGreaterThan(1);
  });
});
