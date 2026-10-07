// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraCreateAppRendererOptions, AuraSceneSnapshot, AuraRuntimeNodeRegistry, WebGLSceneRenderer } from "../nodes/types.js";
import type { AuraDegradation } from "../../contracts/compiler.js";
import { AuraRuntimeError } from "./errors.js";
import { analyzeProductionBridgeEligibility } from "../compiler/observations.js";
import { createProductionRuntimeSceneRenderer } from "../compiler/renderer.js";
import { createWebGLSceneRenderer } from "../compiler/webglRuntime.js";
import { groups } from "../nodes/groups.js";
import { normalizeCreateAppRendererOptions } from "./rendererOptions.js";
import { productionRenderErrorMessage } from "../compiler/observations.js";
import type { QrFlags } from "@aura3d/rendering/contracts";

export interface AuraSceneDegradationOptions {
  /** C-38 (PRD-15 T4.1): strict throw and consumer hook for degrade() calls. */
  readonly strict?: boolean;
  readonly onDegradation?: (degradation: AuraDegradation) => void;
}

export async function createProductionSceneRenderer(
  canvas: HTMLCanvasElement,
  snapshot: AuraSceneSnapshot,
  rendererOptions?: AuraCreateAppRendererOptions,
  runtimeNodes?: AuraRuntimeNodeRegistry,
  qrFlags?: QrFlags,
  degradation?: AuraSceneDegradationOptions
): Promise<WebGLSceneRenderer> {
  const rendererSelection = normalizeCreateAppRendererOptions(rendererOptions);
  const strict = degradation?.strict ?? qrFlags?.on("A3D_QR_STRICT") ?? false;
  // T4.2: under A3D_QR_STRICT (or an explicit options.strict) there is no
  // non-production branch — an unmountable renderer is an error, not a
  // fallback.
  if (!strict && rendererSelection.mode !== "production") {
    return await createWebGLSceneRenderer(canvas, snapshot, rendererOptions, [], runtimeNodes);
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
    return await createProductionRuntimeSceneRenderer(canvas, snapshot, rendererOptions, runtimeNodes, qrFlags, degradation);
  } catch (error) {
    if (strict) {
      throw new AuraRuntimeError(
        "renderer-mount-failed",
        `Aura3D production renderer failed to mount: ${productionRenderErrorMessage(error)}`,
        { cause: error }
      );
    }
    return await createWebGLSceneRenderer(canvas, snapshot, rendererOptions, [
      `Production bridge failed and safe-basic fallback rendered instead: ${productionRenderErrorMessage(error)}`
    ], runtimeNodes);
  }
}
