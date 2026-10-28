/**
 * PRD-2 WP-7: sun cascades that no receiver can select are allocated but not redrawn (`device.skipUnusedShadowCascades`, set for
 * quality auto / cinematic). The skip decision is computed with the forward path's own depth expression (`forwardCascadeSelectionDepth`),
 * so these tests check it against the real `selectForwardShadowMap` and, end to end, against the shadow map every forward draw of a real
 * `Renderer` frame binds: a draw must never sample a cascade that was skipped.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { DirectionalLight, PerspectiveCamera, identityMat4, lookAtMat4, multiplyMat4 } from "@aura3d/scene";
import { MockRenderDevice, type DrawCommand, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import type { CollectedLight } from "../../../packages/rendering/src/LightCollector";
import type { ForwardShadowMapOptions } from "../../../packages/rendering/src/ForwardPass";
import { selectForwardShadowMap } from "../../../packages/rendering/src/forward/Lighting";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { executePrd02BridgedShadowMap, shadowFrameCamera, takePrd02BridgedShadowFrame } from "../../../packages/rendering/src/shadows/Prd02ShadowBridge";
import { unusedCascadeIndices } from "../../../packages/rendering/src/shadows/CascadeUse";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const BASE = resolveQrFlags({ options: ["none"] });
afterEach(() => setRendererQrFlags(BASE));

/** Deterministic PRNG so failures reproduce. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function translation(x: number, y: number, z: number): Float32Array {
  const m = Float32Array.from(identityMat4());
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

function itemAt(x: number, y: number, z: number): RenderItem {
  return { geometry: Geometry.triangle(), modelMatrix: translation(x, y, z), label: `item@${x},${y},${z}` } as RenderItem;
}

interface Rig {
  readonly eye: [number, number, number];
  readonly viewMatrix: Float32Array;
  readonly viewProjection: Float32Array;
}

/** A structural camera (view + projection), looking from `eye` at `target`. */
function rig(eye: [number, number, number], target: [number, number, number], far = 100): Rig {
  const proj = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 16 / 9, near: 0.1, far });
  proj.updateCameraMatrices();
  const viewMatrix = Float32Array.from(lookAtMat4(eye, target, [0, 1, 0]));
  const viewProjection = Float32Array.from(multiplyMat4(Array.from(proj.projectionMatrix) as never, Array.from(viewMatrix) as never));
  return { eye, viewMatrix, viewProjection };
}

const RIGS: Rig[] = [
  rig([0, 3, 8], [0, 0, 0]),
  rig([0, 3, 8], [10, 0, -10]),
  rig([-12, 6, 4], [5, 0, -6]),
  rig([30, 20, 30], [0, 0, 0]),
  rig([0, 60, 0.5], [0, 0, 0]),
  rig([4, 1, -25], [0, 2, 20])
];

describe("unusedCascadeIndices follows selectForwardShadowMap", () => {
  const fits = [{ index: 0, splitFar: 14 }, { index: 1, splitFar: 33 }, { index: 2, splitFar: 100 }];
  const cascades = fits.map((fit, i) => ({
    index: fit.index, near: i === 0 ? 0 : fits[i - 1]!.splitFar, far: fit.splitFar, shadowMap: { tag: fit.index } as unknown as Omit<ForwardShadowMapOptions, "cascades">
  }));
  const map = { cascades } as unknown as ForwardShadowMapOptions;
  const picked = (item: RenderItem, r: { viewMatrix?: Float32Array; eye?: [number, number, number] }): number =>
    (selectForwardShadowMap(map, item, r.viewMatrix, r.eye) as unknown as { tag: number }).tag;

  it("never reports a cascade that a receiver's real forward selection picks, and reports exactly the unpicked ones", () => {
    const rand = lcg(7);
    let skippedSomething = 0;
    for (let trial = 0; trial < 400; trial += 1) {
      const r = RIGS[trial % RIGS.length]!;
      const camera = trial % 3 === 0 ? { eye: r.eye } : trial % 3 === 1 ? { viewMatrix: r.viewMatrix } : { viewMatrix: r.viewMatrix, eye: r.eye };
      const count = 1 + Math.floor(rand() * 6);
      const items = Array.from({ length: count }, () => itemAt((rand() - 0.5) * 80, (rand() - 0.2) * 12, (rand() - 0.5) * 90));
      const used = new Set(items.map((item) => picked(item, camera)));
      const unused = unusedCascadeIndices(fits, items, camera);
      const expectedUnused = fits.map((f) => f.index).filter((i) => !used.has(i));
      for (const i of unused ?? []) expect(used.has(i), `trial ${trial}: cascade ${i} is picked by an item`).toBe(false);
      // Exact, not just safe: a defined answer is the complement of the picked set; undefined only when nothing can be skipped.
      expect([...(unused ?? [])].sort()).toEqual(unused ? expectedUnused : []);
      if (!unused) expect(expectedUnused).toEqual([]);
      if (unused) skippedSomething += 1;
    }
    expect(skippedSomething).toBeGreaterThan(20);
  });

  it("items straddling a split boundary use both neighbouring cascades", () => {
    const r = RIGS[0]!;
    // Items at view depth 14 - e (cascade 0, `depth <= far`) and 14 + e (cascade 1) along the camera axis.
    const n = Math.hypot(0, 3, 8);
    const at = (d: number) => itemAt(r.eye[0], r.eye[1] - (3 / n) * d, r.eye[2] - (8 / n) * d);
    const items = [at(14 - 1e-3), at(14 + 1e-3)];
    expect(items.map((i) => picked(i, r))).toEqual([0, 1]);
    expect([...unusedCascadeIndices(fits, items, r)!]).toEqual([2]);
  });

  it("uses the view matrix when present and the eye distance otherwise, like the forward path", () => {
    // Off to the side: view depth ~11 (cascade 0) but eye distance ~27 (cascade 1).
    const wide = itemAt(25, 3, -3);
    const view = { viewMatrix: RIGS[0]!.viewMatrix, eye: RIGS[0]!.eye };
    expect(picked(wide, view)).toBe(0);
    expect(picked(wide, { eye: RIGS[0]!.eye })).toBe(1);
    expect([...unusedCascadeIndices(fits, [wide], view)!].sort()).toEqual([1, 2]);
    expect([...unusedCascadeIndices(fits, [wide], { eye: RIGS[0]!.eye })!].sort()).toEqual([0, 2]);
  });

  it("returns undefined when every cascade is used or the answer is unsafe", () => {
    const r = RIGS[0]!;
    expect(unusedCascadeIndices(fits, [itemAt(0, 0, 4), itemAt(0, 0, -20), itemAt(0, 0, -60)], r)).toBeUndefined();
    expect(unusedCascadeIndices(fits, [], r)).toBeUndefined();
    expect(unusedCascadeIndices([fits[0]!], [itemAt(0, 0, 0)], r)).toBeUndefined();
    expect(unusedCascadeIndices(fits, [itemAt(0, 0, 0)], {})).toBeUndefined();
    expect(unusedCascadeIndices(fits, [itemAt(Number.NaN, 0, 0)], r)).toBeUndefined();
  });
});

const sun = {
  kind: "directional", color: [1, 1, 1], intensity: 2, position: [3, 4, 3], direction: [-0.5, -0.7, -0.5], range: 0, spotAngle: 0, penumbra: 0,
  castsShadow: true, layerMask: 1, source: new DirectionalLight("sun")
} as unknown as CollectedLight;

const BRIDGE_SOURCE = {
  shadow: { enabled: true, prd02Shadows: { enabled: true, mapSize: 256, cascades: 3, maxDistance: 100, splitLambda: 0.6, blend: 0.1, filter: "pcf", strength: 1, bias: 0, normalBias: 0.02, sceneRadius: 6 } },
  collectedLights: [sun]
} as never;

/** Draw calls and skipped cascades for one bridged frame. */
function runBridge(receivers: readonly RenderItem[], skip: boolean) {
  const device = new MockRenderDevice();
  if (skip) (device as unknown as { skipUnusedShadowCascades?: boolean }).skipUnusedShadowCascades = true;
  const r = RIGS[0]!;
  device.beginFrame(256, 256);
  const map = executePrd02BridgedShadowMap({
    device, source: BRIDGE_SOURCE, items: receivers, camera: undefined,
    frameCamera: shadowFrameCamera(r.viewProjection, r.eye, r.viewMatrix), receivers, flags: FLAGS_ON
  });
  const draws = device.getDiagnostics().drawCalls;
  device.endFrame();
  const frame = takePrd02BridgedShadowFrame(device);
  return { map, draws, skipped: frame?.system.diagnostics().skippedCascades ?? [] };
}

describe("bridge cascade skipping", () => {
  // Along the (0,3,8) -> origin axis, view depth 20..28 sits inside cascade 1 of the 3-cascade split.
  const along = (d: number, side = 0) => {
    const n = Math.hypot(0, 3, 8);
    return itemAt(side, 3 - (3 / n) * d, 8 - (8 / n) * d);
  };
  const band = [along(20), along(24, 2), along(27, -3)];

  it("draws every cascade without the device flag", () => {
    const base = runBridge(band, false);
    expect(base.map?.cascades).toHaveLength(3);
    expect(base.skipped).toEqual([]);
    expect(base.draws).toBe(band.length * 3);
  });

  it("skips the cascades nothing selects, keeps the map layout and still allocates all targets", () => {
    const base = runBridge(band, false);
    const fast = runBridge(band, true);
    expect(fast.skipped.length).toBeGreaterThan(0);
    expect(fast.draws).toBe(band.length * (3 - fast.skipped.length));
    expect(fast.map?.cascades).toHaveLength(3);
    expect(fast.map?.cascades?.map((c) => c.far)).toEqual(base.map?.cascades?.map((c) => c.far));
    for (const c of fast.map!.cascades!) expect(c.shadowMap.texture.texture).toBeTruthy();
  });

  it("draws everything when the receivers span all cascades", () => {
    const wide = [along(4), along(30), along(80)];
    const fast = runBridge(wide, true);
    expect(fast.skipped).toEqual([]);
    expect(fast.draws).toBe(wide.length * 3);
  });

  it("draws every cascade when the frame camera carries neither a view matrix nor an eye", () => {
    const device = new MockRenderDevice();
    (device as unknown as { skipUnusedShadowCascades?: boolean }).skipUnusedShadowCascades = true;
    device.beginFrame(256, 256);
    executePrd02BridgedShadowMap({
      device, source: BRIDGE_SOURCE, items: band, camera: undefined,
      frameCamera: shadowFrameCamera(RIGS[0]!.viewProjection, undefined), receivers: band, flags: FLAGS_ON
    });
    expect(device.getDiagnostics().drawCalls).toBe(band.length * 3);
    device.endFrame();
  });
});

describe("Renderer frames: a forward draw never samples a skipped cascade", () => {
  const SOURCE_BASE = {
    collectedLights: [{ ...sun, source: { id: "sun", name: "sun" } }],
    shadow: { enabled: true, size: 512, cascadeCount: 3, prd02Shadows: { enabled: true, mapSize: 512, cascades: 3, maxDistance: 100, splitLambda: 0.6, filter: "pcf", strength: 1, bias: 0, normalBias: 1.5 } }
  };

  function frameItems(positions: readonly (readonly [number, number, number])[]): RenderItem[] {
    const material = new PBRMaterial({ name: "lit" });
    const ground = { geometry: Geometry.litPlane(), material, modelMatrix: Float32Array.from([200, 0, 0, 0, 0, 1, 0, 0, 0, 0, 200, 0, 0, 0, 0, 1]), label: "ground", castShadow: false, receiveShadow: true };
    const cubes = positions.map((p, i) => ({ geometry: Geometry.litCube(1), material, modelMatrix: translation(p[0], p[1], p[2]), label: `cube-${i}`, castShadow: true, receiveShadow: true }));
    return [ground, ...cubes] as unknown as RenderItem[];
  }

  interface FrameResult {
    /** Shadow-map texture label every forward draw bound, by draw label. */
    readonly bound: Map<string, string>;
    /** Cascade targets that were cleared (= drawn into) this frame. */
    readonly cleared: Set<string>;
    readonly skipped: readonly number[];
  }

  async function renderFrame(items: RenderItem[], camera: unknown, skip: boolean, extra: Record<string, unknown> = {}): Promise<FrameResult> {
    const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180, qrFlags: FLAGS_ON });
    try {
      const device = renderer.device as unknown as MockRenderDevice & { skipUnusedShadowCascades?: boolean };
      if (skip) device.skipUnusedShadowCascades = true;
      const labels = new Map<RenderTarget, string>();
      const create = device.createRenderTarget.bind(device);
      vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => {
        const target = create(descriptor);
        labels.set(target, descriptor.label ?? "");
        return target;
      });
      let current: RenderTarget | null = null;
      const set = device.setRenderTarget.bind(device);
      vi.spyOn(device, "setRenderTarget").mockImplementation((target) => { current = target; set(target); });
      const cleared = new Set<string>();
      const clear = device.clearRenderTarget.bind(device);
      vi.spyOn(device, "clearRenderTarget").mockImplementation((color, attachment) => {
        const label = current ? labels.get(current) : undefined;
        if (label?.startsWith("prd02-cascade-")) cleared.add(label);
        clear(color, attachment);
      });
      renderer.render({ ...SOURCE_BASE, renderItems: items, ...extra } as never, camera as never);
      const bound = new Map<string, string>();
      for (const draw of (device as unknown as { drawCommands: DrawCommand[] }).drawCommands) {
        const uniforms = draw.uniforms as ReadonlyMap<string, unknown> | undefined;
        if (!uniforms || uniforms.get("u_shadowMapEnabled") !== 1) continue;
        const texture = uniforms.get("u_shadowMapTexture") as { texture?: { label?: string } } | undefined;
        bound.set(draw.label ?? "", texture?.texture?.label ?? "");
      }
      const evidence = renderer.getShadowEvidence() as { cascades?: unknown[] } | null;
      expect(evidence?.cascades).toHaveLength(3);
      const skipped = [0, 1, 2].filter((i) => !cleared.has(`prd02-cascade-${i}`));
      return { bound, cleared, skipped };
    } finally {
      renderer.dispose();
    }
  }

  const concrete = (eye: [number, number, number]) => {
    const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 16 / 9, near: 0.1, far: 100 });
    cam.transform.setPosition(eye[0], eye[1], eye[2]);
    cam.updateCameraMatrices();
    return cam;
  };
  const structural = (r: Rig) => ({ viewProjectionMatrix: r.viewProjection, viewMatrix: r.viewMatrix });

  it("matches the every-cascade frame draw for draw, over rotated and off-axis cameras and straddling receiver sets", async () => {
    const rand = lcg(11);
    let framesWithSkips = 0;
    for (let trial = 0; trial < 24; trial += 1) {
      const r = RIGS[trial % RIGS.length]!;
      const count = 1 + Math.floor(rand() * 5);
      const positions = Array.from({ length: count }, () => [(rand() - 0.5) * 60, 0.5 + rand() * 4, (rand() - 0.5) * 70] as const);
      const camera = trial % 4 === 0 ? concrete([0, 4, 8]) : structural(r);
      const full = await renderFrame(frameItems(positions), camera, false);
      const fast = await renderFrame(frameItems(positions), camera, true);
      // The reference frame draws every cascade; the skipping frame binds the same cascade on every forward draw...
      expect(full.skipped).toEqual([]);
      expect([...fast.bound.entries()]).toEqual([...full.bound.entries()]);
      // ...and that cascade was actually drawn into (not left uncleared).
      for (const [draw, texture] of fast.bound) expect(fast.cleared.has(texture.replace(/-depth$/, "")), `trial ${trial}: ${draw} samples ${texture}, cleared ${[...fast.cleared]}`).toBe(true);
      if (fast.skipped.length > 0) framesWithSkips += 1;
    }
    expect(framesWithSkips).toBeGreaterThan(3);
  });

  it("matches the every-cascade frame for a rendering with no camera (auto-frame, forward measures eye distance)", async () => {
    const items = frameItems([[0, 1, 0], [3, 1, -4]]);
    const full = await renderFrame(items, undefined, false, { cameraPolicy: "auto-frame" });
    const fast = await renderFrame(items, undefined, true, { cameraPolicy: "auto-frame" });
    expect([...fast.bound.entries()]).toEqual([...full.bound.entries()]);
    for (const texture of fast.bound.values()) expect(fast.cleared.has(texture.replace(/-depth$/, ""))).toBe(true);
  });
});
