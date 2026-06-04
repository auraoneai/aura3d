import {
  applyScenePatch,
  createAuraCinematicPatch,
  validateAuraCinematicPatchPrompt,
  type AuraCinematicPatchContractResult,
  type AuraSceneIR,
  type AuraScenePatchResult
} from "@aura3d/ai-scene";

export interface AuraCinematicPatchRuntime {
  readonly validate: (prompt: string) => AuraCinematicPatchContractResult;
  readonly applyPromptPatch: (scene: AuraSceneIR, prompt: string) => AuraScenePatchResult<AuraSceneIR>;
}

export function createAuraCinematicPatchRuntime(): AuraCinematicPatchRuntime {
  return {
    validate: validateAuraCinematicPatchPrompt,
    applyPromptPatch(scene, prompt) {
      return applyScenePatch(scene, createAuraCinematicPatch(prompt, scene.sceneId));
    }
  };
}
