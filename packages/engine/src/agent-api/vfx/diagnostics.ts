// PRD-07 P1-T2 — C-31 diagnostics sections "effects" and "atmosphere".
// Collectors read the app's live ProductionEffectSystem — observed values only.

import type { AuraApp } from "../index";
import { prd07SystemFor } from "./effects-api";

export function collectEffectsSection(app: AuraApp): import("../../contracts/effects").AuraEffectsDiagnostics {
  const system = prd07SystemFor(app);
  if (!system) {
    return {
      nodes: [],
      batches: 0,
      liveParticles: 0,
      budget: { tier: "medium", cap: 0, culled: 0 },
      errors: [],
      pixelBacked: []
    };
  }
  const report = system.diagnostics.report();
  return {
    nodes: report.nodes.map((n) => ({
      id: n.nodeId,
      effect: n.effect,
      consumer: n.consumer,
      live: n.live,
      drawCalls: n.drawCalls,
      instancesDrawn: n.instancesDrawn,
      sim: n.sim,
      softDepth: n.softDepth,
      zeroPixelFrames: n.zeroPixelFrames
    })),
    batches: report.batches,
    liveParticles: report.liveParticles,
    budget: { tier: "medium", cap: 10000, culled: 0 },
    ...(report.gpuMs !== undefined ? { gpuMs: report.gpuMs } : {}),
    errors: report.errors,
    pixelBacked: report.pixelBacked,
    ...(report.deviceReadbacks !== undefined ? { deviceReadbacks: report.deviceReadbacks } : {})
  };
}

export function collectAtmosphereSection(app: AuraApp): ReturnType<import("../../production-runtime/effects/LiveAtmosphere").LiveAtmosphere["report"]> {
  const system = prd07SystemFor(app);
  return system
    ? system.atmosphere.report()
    : {
        background: "none",
        fog: { mode: "exp2", path: "legacy-uniforms", activeNodeId: null, maxOpacity: null },
        volumetric: { mode: "analytic" }
      };
}
