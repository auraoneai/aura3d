/**
 * PRD-2 WP-7: sun cascades that no receiver can select are allocated but not redrawn (`device.skipUnusedShadowCascades`, set for
 * quality auto / cinematic). The legacy forward path picks one cascade per item from its centre depth, so a cascade outside every
 * item's [view depth, eye distance] range is never sampled and skipping it changes no pixel.
 */
import { afterEach, describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { DirectionalLight, PerspectiveCamera, identityMat4 } from "@aura3d/scene";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import type { CollectedLight } from "../../../packages/rendering/src/LightCollector";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { executePrd02BridgedShadowMap, shadowFrameCamera, takePrd02BridgedShadowFrame } from "../../../packages/rendering/src/shadows/Prd02ShadowBridge";
import { unusedCascadeIndices } from "../../../packages/rendering/src/shadows/CascadeUse";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const BASE = resolveQrFlags({ options: ["none"] });
afterEach(() => setRendererQrFlags(BASE));

const EYE: [number, number, number] = [0, 3, 8];

function camera(): PerspectiveCamera {
  const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 100 });
  cam.transform.setPosition(EYE[0], EYE[1], EYE[2]);
  cam.updateCameraMatrices();
  return cam;
}

/** An item whose world centre sits at (x, y, z). */
function itemAt(x: number, y: number, z: number): RenderItem {
  const m = identityMat4();
  m[12] = x; m[13] = y; m[14] = z;
  return { geometry: Geometry.triangle(), modelMatrix: m, label: `item@${z}` } as RenderItem;
}

const sun = {
  kind: "directional", color: [1, 1, 1], intensity: 2, position: [3, 4, 3], direction: [-0.5, -0.7, -0.5], range: 0, spotAngle: 0, penumbra: 0,
  castsShadow: true, layerMask: 1, source: new DirectionalLight({ castShadow: true })
} as unknown as CollectedLight;

const SOURCE = {
  shadow: { enabled: true, prd02Shadows: { enabled: true, mapSize: 256, cascades: 3, maxDistance: 100, splitLambda: 0.6, blend: 0.1, filter: "pcf", strength: 1, bias: 0, normalBias: 0.02, sceneRadius: 6 } },
  collectedLights: [sun]
} as never;

/** Draw calls and skipped cascades for one bridged frame. */
function run(receivers: readonly RenderItem[], skip: boolean) {
  const device = new MockRenderDevice();
  if (skip) (device as unknown as { skipUnusedShadowCascades?: boolean }).skipUnusedShadowCascades = true;
  const cam = camera();
  const casters = receivers;
  device.beginFrame(256, 256);
  const map = executePrd02BridgedShadowMap({
    device, source: SOURCE, items: casters, camera: undefined,
    frameCamera: shadowFrameCamera(cam.viewProjectionMatrix, EYE), receivers, flags: FLAGS_ON
  });
  const draws = device.getDiagnostics().drawCalls;
  device.endFrame();
  const frame = takePrd02BridgedShadowFrame(device);
  return { map, draws, skipped: frame?.system.diagnostics().skippedCascades ?? [] };
}

describe("unusedCascadeIndices", () => {
  const cam = camera();
  const vp = cam.viewProjectionMatrix;
  const fits = [{ index: 0, splitFar: 14 }, { index: 1, splitFar: 33 }, { index: 2, splitFar: 100 }];

  it("reports the cascades no item can select", () => {
    // View depth 8 + 12 = 20..28 from the camera: all inside cascade 1.
    const items = [itemAt(0, 0, -12), itemAt(2, 0, -20)];
    expect([...unusedCascadeIndices(fits, items, vp, EYE)!].sort()).toEqual([0, 2]);
  });

  it("counts every cascade between the view-depth pick and the eye-distance pick as used", () => {
    // An item far off to the side: view depth ~11 (cascade 0) but eye distance ~ 27 (cascade 1).
    const wide = itemAt(25, 3, -3);
    const unused = unusedCascadeIndices(fits, [wide], vp, EYE);
    expect(unused === undefined || !unused.has(0)).toBe(true);
    expect(unused === undefined || !unused.has(1)).toBe(true);
  });

  it("returns undefined when every cascade is used or the answer is unsafe", () => {
    expect(unusedCascadeIndices(fits, [itemAt(0, 0, 4), itemAt(0, 0, -20), itemAt(0, 0, -60)], vp, EYE)).toBeUndefined();
    expect(unusedCascadeIndices(fits, [], vp, EYE)).toBeUndefined();
    expect(unusedCascadeIndices([fits[0]!], [itemAt(0, 0, 0)], vp, EYE)).toBeUndefined();
    const ortho = new Float32Array(16); ortho[0] = 0.1; ortho[5] = 0.1; ortho[10] = -0.02; ortho[15] = 1;
    expect(unusedCascadeIndices(fits, [itemAt(0, 0, 0)], ortho, EYE)).toBeUndefined();
    expect(unusedCascadeIndices(fits, [itemAt(Number.NaN, 0, 0)], vp, EYE)).toBeUndefined();
  });
});

describe("bridge cascade skipping", () => {
  const band = [itemAt(0, 0, -12), itemAt(2, 0, -18), itemAt(-3, 0, -15)];

  it("draws every cascade without the device flag", () => {
    const base = run(band, false);
    expect(base.map?.cascades).toHaveLength(3);
    expect(base.skipped).toEqual([]);
    expect(base.draws).toBe(band.length * 3);
  });

  it("skips the cascades nothing selects, keeps the map layout and still allocates all targets", () => {
    const base = run(band, false);
    const fast = run(band, true);
    expect(fast.skipped.length).toBeGreaterThan(0);
    expect(fast.draws).toBe(band.length * (3 - fast.skipped.length));
    expect(fast.map?.cascades).toHaveLength(3);
    expect(fast.map?.cascades?.map((c) => c.far)).toEqual(base.map?.cascades?.map((c) => c.far));
    for (const c of fast.map!.cascades!) expect(c.shadowMap.texture.texture).toBeTruthy();
  });

  it("draws everything when the receivers span all cascades", () => {
    const wide = [itemAt(0, 0, 4), itemAt(0, 0, -20), itemAt(0, 0, -70)];
    const fast = run(wide, true);
    expect(fast.skipped).toEqual([]);
    expect(fast.draws).toBe(wide.length * 3);
  });
});
