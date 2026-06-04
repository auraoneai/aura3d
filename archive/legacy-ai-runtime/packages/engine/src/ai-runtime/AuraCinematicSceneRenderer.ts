import type { AuraCinematicCompiledSceneRuntime } from "./AuraCinematicSceneCompiler.js";

export interface AuraCinematicSceneRenderSource {
  readonly renderItems: AuraCinematicCompiledSceneRuntime["renderItems"];
  readonly environmentLighting: AuraCinematicCompiledSceneRuntime["baseRuntime"]["environmentLighting"];
  readonly postprocess: AuraCinematicCompiledSceneRuntime["baseRuntime"]["postprocess"];
  readonly cameraPolicy: "require";
  readonly diagnostics: AuraCinematicCompiledSceneRuntime["diagnostics"];
}

export function createAuraCinematicSceneRenderSource(runtime: AuraCinematicCompiledSceneRuntime): AuraCinematicSceneRenderSource {
  return {
    renderItems: runtime.renderItems,
    environmentLighting: runtime.baseRuntime.environmentLighting,
    postprocess: runtime.baseRuntime.postprocess,
    cameraPolicy: "require",
    diagnostics: runtime.diagnostics
  };
}
