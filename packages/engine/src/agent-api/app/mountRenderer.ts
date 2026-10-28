// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) from agent-api/index.ts.
// 4.0 Live Fix E1: the safe-basic fallback branch was removed (see below).

import type { AuraCreateAppRendererOptions, AuraSceneSnapshot, AuraRuntimeNodeRegistry, WebGLSceneRenderer } from "../nodes/types.js";
import type { AuraDegradation } from "../../contracts/compiler.js";
import { AuraRuntimeError } from "./errors.js";
import { analyzeProductionBridgeEligibility } from "../compiler/observations.js";
import { createProductionRuntimeSceneRenderer } from "../compiler/renderer.js";
import { groups } from "../nodes/groups.js";
import { normalizeCreateAppRendererOptions } from "./rendererOptions.js";
import { productionRenderErrorMessage } from "../compiler/observations.js";
import type { QrFlags } from "@aura3d/rendering/contracts";

export interface AuraSceneDegradationOptions {
  /** C-38 (PRD-15 T4.1): strict throw and consumer hook for degrade() calls. */
  readonly strict?: boolean;
  readonly onDegradation?: (degradation: AuraDegradation) => void;
}

/** WebGL context attributes the app chooses (beat-three.js L-P1). Absent keeps the device defaults. */
export interface AuraCanvasContextOptions {
  /** Keep the drawing buffer after presentation (capture/evidence runs). Default false. */
  readonly preserveDrawingBuffer?: boolean;
}

export async function createProductionSceneRenderer(
  canvas: HTMLCanvasElement,
  snapshot: AuraSceneSnapshot,
  rendererOptions?: AuraCreateAppRendererOptions,
  runtimeNodes?: AuraRuntimeNodeRegistry,
  qrFlags?: QrFlags,
  degradation?: AuraSceneDegradationOptions,
  canvasContext?: AuraCanvasContextOptions
): Promise<WebGLSceneRenderer> {
  const rendererSelection = normalizeCreateAppRendererOptions(rendererOptions);
  // 4.0 Live Fix E1: there is no fallback renderer. The former non-strict
  // safe-basic branch silently swapped in the degraded webglRuntime
  // (non-sRGB texture uploads, Blinn lighting, dropped glTF features),
  // which shipped washed-out scenes that still reported as mounted. A
  // non-production mode request or a failed production mount is an error.
  if (rendererSelection.mode !== "production") {
    throw new AuraRuntimeError(
      "backend-fallback",
      `Aura3D renderer mode "${rendererSelection.mode}" no longer exists: the safe-basic fallback renderer was removed in 4.0. Use mode "production" (the default) with renderer.quality for feature levels.`
    );
  }

  const flattened = groups.flatten(snapshot.nodes);
  const eligibility = analyzeProductionBridgeEligibility(flattened);
  if (!eligibility.eligible) {
    throw new AuraRuntimeError(
      "backend-fallback",
      `Aura3D production renderer rejected this scene: ${eligibility.reasons.join("; ")}. Suggested fix: import models through generated typed aura-assets.`
    );
  }

  try {
    return await createProductionRuntimeSceneRenderer(canvas, snapshot, rendererOptions, runtimeNodes, qrFlags, degradation, canvasContext);
  } catch (error) {
    throw new AuraRuntimeError(
      "renderer-mount-failed",
      `Aura3D production renderer failed to mount: ${productionRenderErrorMessage(error)}`,
      { cause: error }
    );
  }
}
