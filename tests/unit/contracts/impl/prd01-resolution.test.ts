/**
 * PRD-01 Phase-2 §6.9 impl tests (lane 01, §15): `resolveCanvasPixelRatio`
 * (explicit ?? resolution.pixelRatio ?? min(dpr, tier cap) with no [1,2] clamp),
 * `ResolutionGovernor` hysteresis (down at 30, up at 120, HiDPI floor,
 * allowSubCssResolution), `Renderer.setRenderScaleCeiling` +
 * `resolutionReport` (C-31 surface), and `resolveCanvasContextAttributes`.
 */

import { describe, expect, it, vi } from "vitest";

import {
  ResolutionGovernor,
  RESOLUTION_GOVERNOR_STEP,
  Renderer,
  resolveCanvasContextAttributes,
  resolveCanvasPixelRatio
} from "../../../../packages/rendering/src";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { AuraQualityTierSettings } from "../../../../packages/rendering/src/contracts/quality";

const SLOW_MS = 16.7 * 1.1 + 0.01;
const FAST_MS = 16.7 * 0.8 - 0.01;

describe("resolveCanvasPixelRatio", () => {
  it("computes min(devicePixelRatio, tier.maxPixelRatio) for every tier at DPR 1/2/3", () => {
    for (const tierName of Object.keys(QUALITY_TIERS) as Array<keyof typeof QUALITY_TIERS>) {
      const tier = QUALITY_TIERS[tierName];
      for (const dpr of [1, 2, 3]) {
        expect(
          resolveCanvasPixelRatio({ devicePixelRatio: dpr, tier }),
          `tier ${tierName} @ dpr ${dpr}`
        ).toBe(Math.min(dpr, tier.maxPixelRatio));
      }
    }
  });

  it("has no [1,2] clamp: Ultra at DPR 3 resolves to 3", () => {
    expect(resolveCanvasPixelRatio({ devicePixelRatio: 3, tier: QUALITY_TIERS.ultra })).toBe(3);
  });

  it("honours the explicit override verbatim, including > tier cap", () => {
    expect(resolveCanvasPixelRatio({ devicePixelRatio: 2, tier: QUALITY_TIERS.low, explicit: 2.5 })).toBe(2.5);
  });

  it("honours resolution.pixelRatio over the tier cap", () => {
    const resolution = { pixelRatio: 1.25 };
    expect(resolveCanvasPixelRatio({ devicePixelRatio: 3, tier: QUALITY_TIERS.ultra, resolution })).toBe(1.25);
  });

  it("lets resolution.maxPixelRatio override the tier cap", () => {
    const resolution = { maxPixelRatio: 1.4 };
    expect(resolveCanvasPixelRatio({ devicePixelRatio: 3, tier: QUALITY_TIERS.ultra, resolution })).toBe(1.4);
  });

  it("falls back to DPR 1 when the environment reports an invalid DPR", () => {
    expect(resolveCanvasPixelRatio({ devicePixelRatio: 0, tier: QUALITY_TIERS.high })).toBe(1);
    expect(resolveCanvasPixelRatio({ devicePixelRatio: Number.NaN, tier: QUALITY_TIERS.high })).toBe(1);
  });
});

describe("ResolutionGovernor", () => {
  const tier = QUALITY_TIERS.medium as AuraQualityTierSettings;

  it("holds renderScale at 1 until 30 consecutive over-budget frames", () => {
    const governor = new ResolutionGovernor({
      targetFrameMs: tier.targetFrameMs,
      minRenderScale: tier.minRenderScale,
      maxRenderScale: 1,
      devicePixelRatio: 1,
      allowSubCssResolution: true
    });
    for (let i = 0; i < 29; i++) governor.sample(SLOW_MS);
    expect(governor.scale).toBe(1);
    governor.sample(SLOW_MS);
    expect(governor.scale).toBeCloseTo(1 - RESOLUTION_GOVERNOR_STEP);
  });

  it("prefers gpuMs over the interval when lane 11 provides it", () => {
    const governor = new ResolutionGovernor({
      targetFrameMs: tier.targetFrameMs,
      minRenderScale: 0.5,
      maxRenderScale: 1,
      allowSubCssResolution: true
    });
    // Fast interval but over-budget GPU: must use gpuMs.
    for (let i = 0; i < 30; i++) governor.sample(1, SLOW_MS);
    expect(governor.scale).toBeLessThan(1);
    // Slow interval but fast GPU: must not step down.
    governor.reset();
    for (let i = 0; i < 60; i++) governor.sample(SLOW_MS, 1);
    expect(governor.scale).toBe(1);
  });

  it("steps back up only after 120 consecutive under-budget frames", () => {
    const governor = new ResolutionGovernor({
      targetFrameMs: tier.targetFrameMs,
      minRenderScale: 0.5,
      maxRenderScale: 1,
      allowSubCssResolution: true
    });
    for (let i = 0; i < 30; i++) governor.sample(SLOW_MS);
    expect(governor.scale).toBeLessThan(1);
    const before = governor.scale;
    for (let i = 0; i < 119; i++) governor.sample(FAST_MS);
    expect(governor.scale).toBe(before);
    governor.sample(FAST_MS);
    expect(governor.scale).toBeCloseTo(before + RESOLUTION_GOVERNOR_STEP);
  });

  it("clamps at minRenderScale and at the 1/devicePixelRatio floor", () => {
    const governor = new ResolutionGovernor({
      targetFrameMs: tier.targetFrameMs,
      minRenderScale: 0.1,
      maxRenderScale: 1,
      devicePixelRatio: 3,
      allowSubCssResolution: false
    });
    for (let i = 0; i < 600; i++) governor.sample(SLOW_MS);
    expect(governor.scale).toBeCloseTo(1 / 3);
    expect(governor.scale).toBeGreaterThanOrEqual(1 / 3);
  });

  it("allowSubCssResolution drops the 1/DPR floor to tier.minRenderScale", () => {
    const governor = new ResolutionGovernor({
      targetFrameMs: tier.targetFrameMs,
      minRenderScale: 0.25,
      maxRenderScale: 1,
      devicePixelRatio: 3,
      allowSubCssResolution: true
    });
    for (let i = 0; i < 600; i++) governor.sample(SLOW_MS);
    expect(governor.scale).toBeCloseTo(0.25);
  });

  it("resets streaks when a frame is on-budget", () => {
    const governor = new ResolutionGovernor({
      targetFrameMs: tier.targetFrameMs,
      minRenderScale: 0.5,
      maxRenderScale: 1,
      allowSubCssResolution: true
    });
    for (let i = 0; i < 29; i++) governor.sample(SLOW_MS);
    governor.sample(16.7); // in-band frame breaks the streak
    for (let i = 0; i < 29; i++) governor.sample(SLOW_MS);
    expect(governor.scale).toBe(1);
    governor.sample(SLOW_MS);
    expect(governor.scale).toBeLessThan(1);
  });
});

describe("Renderer resolution surface", () => {
  const fakeCanvas = (cssWidth: number, cssHeight: number) => {
    const canvas = {
      width: 0,
      height: 0,
      getBoundingClientRect: () => ({ width: cssWidth, height: cssHeight })
    };
    return canvas as unknown as HTMLCanvasElement;
  };

  it("setRenderScaleCeiling keeps the canvas backing size while renderScale drops", async () => {
    const canvas = fakeCanvas(400, 300);
    const renderer = await Renderer.create({ backend: "mock", canvas, width: 800, height: 600, resolution: {} });
    const before = { width: canvas.width, height: canvas.height };
    renderer.setRenderScaleCeiling(0.5);
    expect(renderer.renderScale).toBe(0.5);
    expect(canvas.width).toBe(before.width);
    expect(canvas.height).toBe(before.height);
    const report = renderer.resolutionReport;
    expect(report.renderScale).toBe(0.5);
    expect(report.renderScaleCeiling).toBe(0.5);
    expect(report.backingWidth).toBe(800);
    expect(report.backingHeight).toBe(600);
    // 800px backing over 400 CSS px → observed pixelRatio 2.
    expect(report.pixelRatio).toBe(2);
    renderer.dispose();
  });

  it("renderScale composes min(ceiling, governor)", async () => {
    const renderer = await Renderer.create({
      backend: "mock",
      width: 64,
      height: 64,
      resolution: { minRenderScale: 0.2, allowSubCssResolution: true }
    });
    renderer.setRenderScaleCeiling(0.5);
    // Ceiling binds first (governor is at 1); sustained over-budget frames drop
    // the governor below the ceiling and renderScale follows it.
    expect(renderer.renderScale).toBe(0.5);
    for (let i = 0; i < 400; i++) renderer.sampleResolutionGovernor(SLOW_MS);
    expect(renderer.renderScale).toBeLessThan(0.5);
    renderer.setRenderScaleCeiling(1);
    expect(renderer.renderScale).toBeCloseTo(renderer.sampleResolutionGovernor(16.7));
    renderer.dispose();
  });

  it("rejects non-positive ceilings", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const codes: Array<string | undefined> = [];
    for (const bad of [0, Number.NaN]) {
      try {
        renderer.setRenderScaleCeiling(bad);
      } catch (error) {
        codes.push((error as { code?: string }).code);
      }
    }
    expect(codes).toEqual(["INVALID_RENDER_SCALE", "INVALID_RENDER_SCALE"]);
    renderer.dispose();
  });

  it("stays at legacy behaviour without options.resolution (no governor)", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    renderer.render([]);
    expect(renderer.renderScale).toBe(1);
    expect(renderer.sampleResolutionGovernor(SLOW_MS)).toBe(1);
    renderer.dispose();
  });
});

describe("resolveCanvasContextAttributes", () => {
  it("returns the pre-flag baseline when the flag is off", () => {
    expect(resolveCanvasContextAttributes({ flagOn: false })).toEqual({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "default"
    });
  });

  it("returns §6.9 attributes when the flag is on", () => {
    expect(resolveCanvasContextAttributes({ flagOn: true })).toEqual({
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance"
    });
  });

  it("honours renderer.debug.preserveDrawingBuffer and warns once per call", () => {
    const warn = vi.fn();
    const attrs = resolveCanvasContextAttributes({ flagOn: true, debugPreserveDrawingBuffer: true, warn });
    expect(attrs.preserveDrawingBuffer).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
