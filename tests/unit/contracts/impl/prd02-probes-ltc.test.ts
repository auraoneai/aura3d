// PRD-02 §6.6/§8.5 Phase 5 — reflection probes, irradiance volume, LTC LUTs.

import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import {
  ReflectionProbeSystem, boxWeight, type ReflectionProbeSpec
} from "../../../../packages/rendering/src/probes/ReflectionProbeSystem";
import {
  IrradianceVolumeSystem
} from "../../../../packages/rendering/src/probes/IrradianceVolume";
import {
  createPrd02ProbesContributor, probeNodesFromSource,
  PROBE_SELECTION_BLACKBOARD_KEY, IRRADIANCE_VOLUME_BLACKBOARD_KEY,
  ENV_SPECULAR_BLACKBOARD_KEY, ROUGHNESS_TO_LOD_BLACKBOARD_KEY,
  PROBE_RENDER_FACE_KEY
} from "../../../../packages/rendering/src/probes/Prd02ProbesContributor";
import {
  fetchLtcLutTextures, gaussLegendreRectDiffuse, rectDiffuseReference,
  LTC_LUT_SIZE, LTC_LUT_BYTES
} from "../../../../packages/rendering/src/probes/LtcLuts";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import type { RenderTarget } from "../../../../packages/rendering/src/RenderDevice";

const spec = (over: Partial<ReflectionProbeSpec> = {}): ReflectionProbeSpec => ({
  name: "p1",
  position: [0, 0, 0],
  boxHalfExtents: [1, 1, 1],
  blendDistance: 0.5,
  update: "once",
  ...over
});

const flatFace: Float32Array[] = Array.from({ length: 6 }, () => {
  const f = new Float32Array(4 * 4 * 4);
  f.fill(0.5);
  return f;
});

const flatRenderer = (face: number, target: RenderTarget) => {
  void face; void target;
};

describe("prd02 ReflectionProbeSystem (PRD-02 §6.6)", () => {
  it("boxWeight fades over blendDistance outside the box", () => {
    const s = spec();
    expect(boxWeight(s, [0, 0, 0])).toBe(1);            // inside box
    expect(boxWeight(s, [1, 0, 0])).toBe(1);            // on the box surface
    expect(boxWeight(s, [1.25, 0, 0])).toBeCloseTo(0.5); // halfway across blend
    expect(boxWeight(s, [1.5, 0, 0])).toBe(0);          // at/behind blend edge
    expect(boxWeight(s, [3, 0, 0])).toBe(0);            // beyond box+blend
  });

  it("assign picks ≤2 nearest probes and leaves the remainder to global", () => {
    const device = new MockRenderDevice();
    const sys = new ReflectionProbeSystem(device, flatRenderer, { defaultFaceSize: 128 });
    sys.register(spec({ name: "near", position: [0, 0, 0], blendDistance: 2 }));
    sys.register(spec({ name: "far", position: [10, 0, 0], blendDistance: 0.5 }));
    sys.update(); // build captured probes so assign() can see them
    const item = { position: [0, 0, 0] as [number, number, number] };
    const a = sys.assign(item);
    expect(a.a?.spec.name).toBe("near");
    expect(a.b).toBeNull();                            // "far" has no weight here
    expect(a.globalWeight).toBeCloseTo(0, 5);          // inside "near" fully
    const a2 = sys.assign({ position: [5, 0, 0] });
    expect(a2.globalWeight).toBe(1);                   // outside all boxes
    device.dispose();
  });

  it("update captures 6 faces for once-mode and on-demand only when flagged", () => {
    const device = new MockRenderDevice();
    let renders = 0;
    const sys = new ReflectionProbeSystem(device, () => { renders += 1; });
    sys.register(spec({ name: "once" }));
    sys.register(spec({ name: "lazy", update: "on-demand" }));
    sys.update();
    expect(renders).toBe(6);                           // once → 6 faces
    expect(sys.update()).toEqual([]);                  // done; nothing re-captured
    sys.updateProbe("lazy");
    sys.update();
    expect(renders).toBe(12);
    device.dispose();
  });
});

describe("prd02 IrradianceVolumeSystem (PRD-02 §6.6)", () => {
  it("samples SH-L1 irradiance with bounds fade", () => {
    const device = new MockRenderDevice();
    // readFloatPixels returns zeros — fill via a renderer that writes the target
    // is not possible through the mock; capture produces 0-radiance SH, which is
    // still a valid sample (fade + trilinear exercised).
    const sys = new IrradianceVolumeSystem(device, flatRenderer);
    sys.configure({ name: "vol", min: [-1, -1, -1], max: [1, 1, 1], resolution: [2, 2, 2] });
    sys.update();
    const vol = sys.get();
    expect(vol).not.toBeNull();
    const s = sys.sample([0, 0, 0], [0, 1, 0]);
    expect(s).not.toBeNull();
    expect(s![0]).toBeCloseTo(0, 5); expect(s![1]).toBeCloseTo(0, 5); expect(s![2]).toBeCloseTo(0, 5);
    // Outside bounds + fade shell → null (no contribution)
    expect(sys.sample([50, 50, 50], [0, 1, 0])).toBeNull();
    void flatFace;
    device.dispose();
  });
});

describe("prd02 probes contributor (PRD-02 §6.6)", () => {
  const node = {
    kind: "probe", probe: "reflection", name: "lounge",
    options: { position: [1, 1, 1], boxHalfExtents: [2, 2, 2], blendDistance: 1, update: "once" }
  };
  const ctxFor = (source: Record<string, unknown>): FrameContributorContext => ({
    device: new MockRenderDevice(),
    width: 64, height: 64, frameIndex: 0, timeSeconds: 0,
    camera: null, source, items: [], tier: null,
    flags: { on: () => true }, sceneDepth: null,
    blackboard: new Map<string, unknown>()
  }) as unknown as FrameContributorContext;

  it("reads `prd02.probes.*` nodes from the compiled source", () => {
    const ctx = ctxFor({ "prd02.probes.lounge": node, other: 1 });
    const nodes = probeNodesFromSource(ctx);
    expect(nodes.map((n) => n.name)).toEqual(["lounge"]);
  });

  it("pass publishes probe selection + env/roughness keys on the blackboard", () => {
    const ctx = ctxFor({ "prd02.probes.lounge": node });
    ctx.blackboard.set(PROBE_RENDER_FACE_KEY, flatRenderer);
    const contrib = createPrd02ProbesContributor();
    const [pass] = contrib.passes!("shadows", ctx);
    expect(pass).toBeDefined();
    pass!.execute({ device: ctx.device, width: 64, height: 64 });
    expect(ctx.blackboard.has(PROBE_SELECTION_BLACKBOARD_KEY)).toBe(true);
    const envSpec = ctx.blackboard.get(ENV_SPECULAR_BLACKBOARD_KEY) as { width: number } | null;
    expect(envSpec?.width).toBe(128); // dominant probe's PMREM cube
    expect(typeof ctx.blackboard.get(ROUGHNESS_TO_LOD_BLACKBOARD_KEY)).toBe("function");
    expect(ctx.blackboard.has(IRRADIANCE_VOLUME_BLACKBOARD_KEY)).toBe(false);
  });
});

describe("prd02 LTC rect lights (PRD-02 §8.5)", () => {
  it("LUT fetch is lazy, cached, and validates byte size", async () => {
    const device = new MockRenderDevice();
    let calls = 0;
    const lut = new Float32Array(LTC_LUT_SIZE * LTC_LUT_SIZE * 4).fill(0.25);
    const luts = await fetchLtcLutTextures(device, {
      fetch: async () => { calls += 1; return lut; }
    });
    expect(calls).toBe(2);
    expect(luts.mInv.width).toBe(LTC_LUT_SIZE);
    // cached — no second fetch
    await fetchLtcLutTextures(device, { fetch: async () => { calls += 9; return lut; } });
    expect(calls).toBe(2);
    expect(LTC_LUT_BYTES).toBe(64 * 64 * 16);
    device.dispose();
  });

  it("rejects a LUT with a byte-size mismatch", async () => {
    const device = new MockRenderDevice();
    await expect(fetchLtcLutTextures(device, {
      fetch: async () => new Float32Array(8)
    })).rejects.toThrow(/size mismatch/);
    device.dispose();
  });

  it("Gauss–Legendre 4-tap stays within 10% total energy of dense integration", () => {
    // Facing rect above a reference plane point (PRD §8.5 acceptance).
    const center: [number, number, number] = [0, 1.5, 0];
    const right: [number, number, number] = [1, 0, 0];
    const up: [number, number, number] = [0, 0, 1];
    const half: [number, number] = [1, 0.75];
    const rgb: [number, number, number] = [10, 10, 10];
    const pos: [number, number, number] = [0, 0, 0];
    const n: [number, number, number] = [0, 1, 0];
    const gl = gaussLegendreRectDiffuse(center, right, up, half, rgb, pos, n);
    const ref = rectDiffuseReference(center, right, up, half, rgb, pos, n, 48);
    const glE = gl[0] + gl[1] + gl[2];
    const refE = ref[0] + ref[1] + ref[2];
    expect(refE).toBeGreaterThan(0);
    expect(Math.abs(glE - refE) / refE).toBeLessThanOrEqual(0.10);
  });
});
