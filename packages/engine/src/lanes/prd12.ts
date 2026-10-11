/**
 * Lane prd12 barrel — owned by lane 12 (CONTRACTS.md §3.8). Registers the two
 * C-31 diagnostics sections this lane owns (PRD-12 §7.4, T1.14):
 *   appliedLook  — assembled from the renderer diagnostics report plus the
 *                  collected-light chain (no constants where a source is null)
 *   frameTiming  — a bounded 120-frame rAF sampler, armed on demand only
 * Budget: ≤ 1 KB gzip added to @aura3d/engine (§17.2) — keep this file small.
 *
 * T1.14-fix. Sections run *inside* `app.diagnostics()` (createAuraApp.ts runs
 * every registered section), so `appliedLook` calling back into
 * `app.diagnostics()` recursed until a RangeError that the catch swallowed —
 * on every poll, in every build. A per-app reentrancy guard now bounds it: the
 * outer collect makes exactly one nested `diagnostics()` call to read the
 * renderer report, and the nested `appliedLook` returns null at once without
 * calling back. (A single-pass read needs a renderer-report seam in the PRD-15
 * createAuraApp; that is a §12.3 request, not a lane-12 edit.)
 */
import type { AuraApp } from "../agent-api/index";
import { createProductionRuntimeCollectedLights } from "../agent-api/index";
import type { AppliedLookReport, DiagnosticsSection, ShadowReport } from "../contracts/diagnostics";
import { registerDiagnosticsSection } from "../contracts/diagnostics";
import { resolveQrFlags } from "../contracts/flags";

/** Apps whose `appliedLook` is being assembled right now (reentrancy guard). */
const assembling = new WeakSet<object>();

function collectAppliedLook(app: AuraApp): AppliedLookReport | null {
  // Nested call from our own app.diagnostics() below: never call back again.
  if (assembling.has(app)) return null;
  assembling.add(app);
  try {
    const renderer = app.diagnostics().renderer;
    if (!renderer) return null;
    const env = renderer.environment;
    const intensity = env?.intensity ?? Number.NaN;
    const shadows = renderer.shadows;
    const shadowReport: ShadowReport | null = shadows
      ? {
          mapRendered: Boolean(shadows.mapRendered),
          mapSampled: Boolean(shadows.mapSampled),
          mapSize: shadows.mapSize ?? null,
          strength: null,
          casterName: shadows.spot?.casterName ?? shadows.label ?? null
        }
      : null;
    const lights = createProductionRuntimeCollectedLights(app.scene);
    const fallbackActive = lights.length > 0
      && lights.every((light) => (light.source.userData as Record<string, unknown>).aura3dAuthoredLight === "fallback");
    return {
      exposure: renderer.exposure?.exposure ?? Number.NaN,
      toneMapping: renderer.toneMapping ?? "none",
      environment: {
        specularIntensity: intensity,
        diffuseIntensity: intensity,
        background: env?.enabled ? (env.hdriStatus === "ready" ? "hdri" : "sky") : "color"
      },
      shadows: shadowReport,
      fallbackLightsActive: fallbackActive,
      renderPath: renderer.rendererMode === "production" ? "production" : "safe-basic",
      pixelRatio: renderer.qualityProfile?.pixelRatio ?? Number.NaN
    };
  } catch {
    // A disposed or mid-mount app must never break diagnostics().
    return null;
  } finally {
    assembling.delete(app);
  }
}

const TIMING_CAPACITY = 120;

interface FrameTimingSample {
  readonly source: "rAF" | "gpu-timer-query";
  readonly frames: number;
  readonly cpuMsP50: number;
  readonly cpuMsP95: number;
  readonly gpuMsP50: number | null;
  readonly gpuMsP95: number | null;
  readonly rafFps: number;
}

/*
 * rAF sampler. One window = one baseline callback + 120 measured intervals
 * between consecutive rAF timestamps (never `performance.now()` at arm time,
 * whose offset to the first rAF timestamp is not a frame interval). A window
 * stops itself when full, so no rAF loop outlives the polling that asked for
 * it; the next collect re-arms a fresh window and reports the last full one.
 * It is gated by `frameTimingSection.flag`; flag off cancels any live window.
 */
let windowDeltas: number[] = [];
let windowLast: number | null = null;
let windowHandle: number | null = null;
let lastSample: FrameTimingSample | null = null;

function percentile(sorted: readonly number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summarize(deltas: readonly number[]): FrameTimingSample {
  const sorted = [...deltas].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    source: "rAF",
    frames: sorted.length,
    cpuMsP50: percentile(sorted, 50),
    cpuMsP95: percentile(sorted, 95),
    gpuMsP50: null,
    gpuMsP95: null,
    rafFps: (1000 * sorted.length) / total
  };
}

function onTimingFrame(now: number): void {
  windowHandle = null;
  if (windowLast !== null) {
    const delta = now - windowLast;
    if (Number.isFinite(delta) && delta > 0) windowDeltas.push(delta);
  }
  windowLast = now;
  if (windowDeltas.length >= TIMING_CAPACITY) {
    lastSample = summarize(windowDeltas);
    windowDeltas = [];
    windowLast = null;
    return; // window full: stop, do not reschedule
  }
  windowHandle = requestAnimationFrame(onTimingFrame);
}

function armTimingWindow(): void {
  if (windowHandle !== null || typeof requestAnimationFrame !== "function") return;
  windowHandle = requestAnimationFrame(onTimingFrame);
}

function cancelTimingWindow(): void {
  if (windowHandle !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(windowHandle);
  windowHandle = null;
  windowDeltas = [];
  windowLast = null;
}

function sectionFlagOn(flag: DiagnosticsSection["flag"]): boolean {
  const env = typeof process !== "undefined" && process.env ? process.env : {};
  const url = typeof location !== "undefined" ? location.href : undefined;
  return resolveQrFlags({ url, env }).on(flag);
}

function collectFrameTiming(): FrameTimingSample | null {
  try {
    if (!sectionFlagOn(frameTimingSection.flag)) {
      cancelTimingWindow();
      return null;
    }
    armTimingWindow();
    // Null until one full window was measured — never a guess.
    return lastSample;
  } catch {
    return null;
  }
}

/*
 * `appliedLook` is read-only reporting (C-31 "Flag: none"; PRD 12 runs no
 * runtime flags), so it is collected whatever its registry tag. `frameTiming`
 * starts a global rAF loop — a runtime behaviour — so it honours its flag.
 */
const appliedLookSection: DiagnosticsSection<AppliedLookReport | null> = {
  id: "prd12.appliedLook",
  owner: "prd12",
  flag: "A3D_QR_STRICT",
  key: "appliedLook",
  collect: collectAppliedLook
};

const frameTimingSection: DiagnosticsSection<FrameTimingSample | null> = {
  id: "prd12.frameTiming",
  owner: "prd12",
  flag: "A3D_QR_STRICT",
  key: "frameTiming",
  collect: collectFrameTiming
};

registerDiagnosticsSection(appliedLookSection);
registerDiagnosticsSection(frameTimingSection);

export { appliedLookSection, frameTimingSection };
