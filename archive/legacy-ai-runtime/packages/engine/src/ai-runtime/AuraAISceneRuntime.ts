import {
  compileSceneIRToRuntime as compileAISceneIRToRuntime,
  createAISceneSession as createCoreAISceneSession,
  type AuraCompiledSceneRuntime,
  type AuraSceneIR,
  type AuraSceneSession,
  type AuraSceneSessionOptions
} from "@aura3d/ai-scene";

export type AuraAIRuntimeScene = AuraCompiledSceneRuntime;

export function createAISceneSession(options: AuraSceneSessionOptions = {}): AuraSceneSession {
  return createCoreAISceneSession(options);
}

export async function compilePromptToScene(prompt: string, options: AuraSceneSessionOptions = {}): Promise<AuraAIRuntimeScene> {
  return await createCoreAISceneSession(options).compilePromptToScene({ prompt });
}

export async function compileSceneIRToRuntime(scene: AuraSceneIR): Promise<AuraAIRuntimeScene> {
  return await compileAISceneIRToRuntime(scene);
}
