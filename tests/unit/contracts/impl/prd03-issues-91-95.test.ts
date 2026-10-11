import { afterEach, describe, expect, it, vi } from "vitest";
import { effects, primitives, scene, type AuraApp } from "@aura3d/engine";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import { createProductionRuntimePostprocess } from "../../../../packages/engine/src/agent-api/compiler/postprocess";
import {
  collectPostSection,
  recordAuthoredPostContext,
  resetAuthoredPostContext,
  resetSubmittedPostprocess
} from "../../../../packages/engine/src/agent-api/postBridge";
import {
  guardRendererPostprocessPlan,
  postSkippedReasons,
  resetPostSkipped,
  RendererPostprocessPipeline
} from "../../../../packages/rendering/src/renderer/PostprocessExecution";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { resetPostprocessGuardWarnings } from "../../../../packages/rendering/src/quality/PostprocessGuard";
import { renderTargetPoolSlot } from "../../../../packages/rendering/src/contracts/device";
import { MockRenderDevice, type RenderTarget } from "../../../../packages/rendering/src/RenderDevice";
import type { RendererPostProcessPassPlan } from "../../../../packages/rendering/src/RendererPostprocessPlan";

/**
 * 03-ISSUES (PRD-16 G1 lane 03).
 * #91 (Q-03-1): under A3D_QR_TIERS the legacy chain runs lane 11's
 *   `guardPostprocessPlan` before any pass, and takes its intermediate
 *   targets from the C-28 pool (released when the chain finishes) instead of
 *   allocating per frame. Flag-off is unchanged.
 * #95 (Q-03-2): flag-on, on the compat.post "3.0" route, authored film grain,
 *   chromatic aberration and volumetric fog report `EFFECT_PENDING_GPU_PASS:<name>`.
 */

const flagsWith = (...names: string[]) =>
  resolveQrFlags({ options: Object.fromEntries(names.map((name) => [name, true])) }) as never;
const EMPTY = flagsWith();

afterEach(() => {
  setRendererQrFlags(EMPTY);
  resetPostSkipped();
  resetPostprocessGuardWarnings();
  resetAuthoredPostContext();
  resetSubmittedPostprocess();
  vi.restoreAllMocks();
});

const plan = (...names: string[]) => names.map((name) => ({ name, options: {} })) as unknown as RendererPostProcessPassPlan[];

describe("#91 guardRendererPostprocessPlan", () => {
  const source = { depthTexture: null } as unknown as RenderTarget;

  it("flag-off returns the plan untouched", () => {
    const passes = plan("tone-mapping", "film-grain");
    expect(guardRendererPostprocessPlan(new MockRenderDevice(), {}, source, passes)).toBe(passes);
  });

  it("A3D_QR_TIERS drops non-GPU passes and records POSTPROCESS_PASS_DROPPED", () => {
    setRendererQrFlags(flagsWith("A3D_QR_TIERS"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const device = Object.assign(new MockRenderDevice(), { presentLdrPostprocess: () => undefined });
    const kept = guardRendererPostprocessPlan(device as never, {}, source, plan("tone-mapping", "film-grain", "ssao"));
    expect(kept.map((pass) => pass.name)).toEqual(["tone-mapping"]);
    expect(postSkippedReasons()).toEqual(expect.arrayContaining(["POSTPROCESS_PASS_DROPPED:film-grain", "POSTPROCESS_PASS_DROPPED:ssao"]));
  });

  it("A3D_QR_TIERS + A3D_QR_STRICT throws POSTPROCESS_PASS_CPU_ONLY", () => {
    setRendererQrFlags(flagsWith("A3D_QR_TIERS", "A3D_QR_STRICT"));
    expect(() => guardRendererPostprocessPlan(new MockRenderDevice(), {}, source, plan("film-grain")))
      .toThrowError(expect.objectContaining({ code: "POSTPROCESS_PASS_CPU_ONLY" }));
  });

  it("cpu-deterministic passes through under A3D_QR_TIERS", () => {
    setRendererQrFlags(flagsWith("A3D_QR_TIERS"));
    const passes = plan("film-grain");
    expect(guardRendererPostprocessPlan(new MockRenderDevice(), { execution: "cpu-deterministic" }, source, passes)).toEqual(passes);
  });
});

describe("#91 chain targets come from the C-28 pool under A3D_QR_TIERS", () => {
  function run(flags: never) {
    setRendererQrFlags(flags);
    const device = new MockRenderDevice();
    const acquired: RenderTarget[] = [];
    const released: RenderTarget[] = [];
    const pool = {
      acquire: (desc: { width: number; height: number }) => {
        const target = device.createRenderTarget({ width: desc.width, height: desc.height, format: "rgba8", depth: false });
        acquired.push(target);
        return target;
      },
      release: (target: RenderTarget) => { released.push(target); },
      trim: () => undefined
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const create = vi.spyOn(device, "createRenderTarget");
    const pipeline = new RendererPostprocessPipeline({ device, width: 8, height: 8, fusedLdrPostprocessScratch: {}, frameIndex: 0 } as never);
    const forward = device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false });
    create.mockClear();
    const owned = [forward];
    // cpu-deterministic keeps both passes on the per-pass loop (the guard
    // passes it through) so the chain needs one intermediate target.
    pipeline.executePostprocess({ filmGrain: { intensity: 0.05 }, toneMapping: {}, execution: "cpu-deterministic" } as never, owned);
    // Chain targets are the only allocations labelled `renderer-postprocess-*`.
    const chainCreated = create.mock.calls.filter(([desc]) => String((desc as { label?: string }).label ?? "").startsWith("renderer-postprocess-")).length;
    return { acquired, released, created: chainCreated, owned };
  }

  it("flag-off allocates on the device and hands targets to the frame", () => {
    const r = run(EMPTY);
    expect(r.acquired).toEqual([]);
    expect(r.created).toBeGreaterThan(0);
    expect(r.owned.length).toBeGreaterThan(1);
  });

  it("A3D_QR_TIERS acquires from the pool and releases every target when the chain ends", () => {
    const r = run(flagsWith("A3D_QR_TIERS"));
    expect(r.created).toBe(0);
    expect(r.acquired.length).toBeGreaterThan(0);
    expect(r.released).toEqual(r.acquired);
    expect(r.owned).toHaveLength(1);
  });
});

describe("#95 EFFECT_PENDING_GPU_PASS", () => {
  const authored = () => scene()
    .add(primitives.box())
    .add(effects.filmGrain({ intensity: 0.05 }))
    .add(effects.chromaticAberration({ intensity: 0.002 }))
    .toJSON();

  it("flag-on compat.post 3.0 reports the effects that have no GPU pass", () => {
    recordAuthoredPostContext({ flags: resolveQrFlags({ options: ["post"] }), options: { compat: { post: "3.0" } } });
    createProductionRuntimePostprocess(authored(), [], 64, 64);
    const warnings = collectPostSection({} as AuraApp).warnings;
    expect(warnings).toContain("EFFECT_PENDING_GPU_PASS:film-grain");
    expect(warnings).toContain("EFFECT_PENDING_GPU_PASS:chromatic-aberration");
  });

  it("the strict v2 route runs them on the GPU and reports nothing", () => {
    recordAuthoredPostContext({ flags: resolveQrFlags({ options: ["post"] }), options: {} });
    createProductionRuntimePostprocess(authored(), [], 64, 64);
    expect(collectPostSection({} as AuraApp).warnings.some((w) => w.startsWith("EFFECT_PENDING_GPU_PASS"))).toBe(false);
  });

  it("flag-off is unchanged (no diagnostic)", () => {
    recordAuthoredPostContext({ flags: resolveQrFlags({ options: [] }), options: {} });
    createProductionRuntimePostprocess(authored(), [], 64, 64);
    expect(collectPostSection({} as AuraApp).warnings.some((w) => w.startsWith("EFFECT_PENDING_GPU_PASS"))).toBe(false);
  });
});

describe("T0-17 skipped CPU passes cost no readback", () => {
  it("flag-on, a CPU-only chain is skipped before the loop: no readPixels, source presented", () => {
    setRendererQrFlags(flagsWith("A3D_QR_POST"));
    const device = new MockRenderDevice();
    const read = vi.spyOn(device, "readPixels");
    const present = vi.fn();
    (device as unknown as { presentRenderTarget: (t: RenderTarget) => void }).presentRenderTarget = present;
    const pipeline = new RendererPostprocessPipeline({ device, width: 8, height: 8, fusedLdrPostprocessScratch: {}, frameIndex: 0 } as never);
    const forward = device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false });
    pipeline.executePostprocess({ filmGrain: { intensity: 0.05 }, toneMapping: false } as never, [forward]);
    expect(read).not.toHaveBeenCalled();
    expect(present).toHaveBeenCalledWith(forward);
    expect(postSkippedReasons()).toContain("POSTPROCESS_PASS_NOT_GPU:film-grain");
  });
});
