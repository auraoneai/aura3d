import type { AuraSceneIR } from "@aura3d/ai-scene";
import { compileAuraCinematicScene, type AuraCinematicCompiledSceneRuntime, type AuraCinematicSceneCompilerOptions } from "./AuraCinematicSceneCompiler.js";

export interface AuraCinematicSceneRuntimeSession {
  compileSceneIRToRuntime(scene: AuraSceneIR): Promise<AuraCinematicCompiledSceneRuntime>;
}

export function createAuraCinematicSceneRuntime(options: AuraCinematicSceneCompilerOptions = {}): AuraCinematicSceneRuntimeSession {
  return {
    async compileSceneIRToRuntime(scene) {
      return await compileAuraCinematicScene(scene, options);
    }
  };
}
