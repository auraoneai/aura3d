// T0-07 (lane-03 half): under `A3D_QR_CORE_OUTPUT` the PostGraph v2 seam in
// `RendererPostprocessPipeline.tryExecutePostGraphV2` must report every
// decline reason through the §6.9 skip registry — `postSkippedReasons()` is
// what lane 01 stamps into `diagnostics().output.postSkipped`. With the flag
// off, the same declines must stay silent (flag-off identity).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RendererPostprocessPipeline,
  postSkippedReasons,
  resetPostSkipped
} from "../../../../packages/rendering/src/renderer/PostprocessExecution";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import type {
  RendererPostProcessOptions,
  RenderTarget,
  RendererPostProcessPassPlan
} from "../../../../packages/rendering/src";
import type { RendererHost } from "../../../../packages/rendering/src/renderer/RendererHost";
import type { QrFlags } from "../../../../packages/rendering/src/contracts/core";

const CORE_OUTPUT_FLAGS = {
  values: { A3D_QR_CORE_OUTPUT: "1" },
  on: (name: string) => name === "A3D_QR_CORE_OUTPUT"
} as unknown as QrFlags;
const NO_FLAGS = { values: {}, on: () => false } as unknown as QrFlags;

const LDR_TARGET = { colorTexture: { format: "rgba8" } } as unknown as RenderTarget;

function makePipeline(): RendererPostprocessPipeline {
  const pipeline = Object.create(RendererPostprocessPipeline.prototype) as RendererPostprocessPipeline;
  Object.defineProperty(pipeline, "host", {
    value: { device: { kind: "webgl2" } } as unknown as RendererHost,
    configurable: true
  });
  return pipeline;
}

function tryV2(
  pipeline: RendererPostprocessPipeline,
  postprocess: RendererPostProcessOptions,
  passes: readonly RendererPostProcessPassPlan[] = []
): boolean {
  return (pipeline as unknown as Record<string, (p: RendererPostProcessOptions, t: RenderTarget, q: readonly RendererPostProcessPassPlan[]) => boolean>)
    .tryExecutePostGraphV2(postprocess, LDR_TARGET, passes);
}

describe("T0-07 POSTPROCESS_V2_UNMIGRATED reporting (lane-03 half)", () => {
  beforeEach(() => {
    resetPostSkipped();
    setRendererQrFlags(CORE_OUTPUT_FLAGS);
  });
  afterEach(() => {
    setRendererQrFlags(NO_FLAGS);
    resetPostSkipped();
  });

  it("records no-v2-plan when the authored chain lacks a v2 pipeline", () => {
    expect(tryV2(makePipeline(), { toneMapping: "krajuice" } as RendererPostProcessOptions)).toBe(false);
    expect(postSkippedReasons()).toContain("POSTPROCESS_V2_UNMIGRATED:no-v2-plan");
  });

  it("records cpu-deterministic as the decline reason", () => {
    const plan = { v2: true, pipeline: {}, execution: "cpu-deterministic" } as RendererPostProcessOptions;
    expect(tryV2(makePipeline(), plan)).toBe(false);
    expect(postSkippedReasons()).toContain("POSTPROCESS_V2_UNMIGRATED:cpu-deterministic");
  });

  it("names unfusable passes when the fused LDR set cannot take the chain", () => {
    const plan = { v2: true, pipeline: {} } as RendererPostProcessOptions;
    const passes = [{ name: "film-grain", options: {} }] as unknown as readonly RendererPostProcessPassPlan[];
    expect(tryV2(makePipeline(), plan, passes)).toBe(false);
    expect(postSkippedReasons()).toContain("POSTPROCESS_V2_UNMIGRATED:film-grain");
  });

  it("records nothing when A3D_QR_CORE_OUTPUT is off", () => {
    setRendererQrFlags(NO_FLAGS);
    expect(tryV2(makePipeline(), { toneMapping: "krajuice" } as RendererPostProcessOptions)).toBe(false);
    expect(postSkippedReasons()).toEqual([]);
  });
});
