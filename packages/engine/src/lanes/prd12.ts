/**
 * Lane prd12 barrel — owned by lane 12 (CONTRACTS.md §3.8). Registers the two
 * C-31 diagnostics sections this lane owns (PRD-12 §7.4, T1.14):
 *   appliedLook  — assembled from the renderer diagnostics report plus the
 *                  collected-light chain (no constants where a source is null)
 *   frameTiming  — a 120-frame rAF sampler armed on first collect only
 * Budget: ≤ 1 KB gzip added to @aura3d/engine (§17.2) — keep this file small.
 */
import type { AuraApp } from "../agent-api/index";
import { createProductionRuntimeCollectedLights } from "../agent-api/index";
import type { AppliedLookReport, DiagnosticsSection, ShadowReport } from "../contracts/diagnostics";
import { registerDiagnosticsSection } from "../contracts/diagnostics";

function collectAppliedLook(app: AuraApp): AppliedLookReport | null {
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

const timingDeltas: number[] = [];
let timingArmed = false;

function armTimingSampler(): void {
  if (timingArmed || typeof requestAnimationFrame !== "function") return;
  timingArmed = true;
  let last = performance.now();
  const loop = (now: number): void => {
    timingDeltas.push(now - last);
    if (timingDeltas.length > TIMING_CAPACITY) timingDeltas.shift();
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function percentile(sorted: readonly number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function collectFrameTiming(): FrameTimingSample | null {
  try {
    armTimingSampler();
    if (timingDeltas.length < 2) return null; // not yet measured — null, never a guess
    const sorted = [...timingDeltas].sort((a, b) => a - b);
    const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    return {
      source: "rAF",
      frames: timingDeltas.length,
      cpuMsP50: percentile(sorted, 50),
      cpuMsP95: percentile(sorted, 95),
      gpuMsP50: null,
      gpuMsP95: null,
      rafFps: mean > 0 ? 1000 / mean : 0
    };
  } catch {
    return null;
  }
}

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
