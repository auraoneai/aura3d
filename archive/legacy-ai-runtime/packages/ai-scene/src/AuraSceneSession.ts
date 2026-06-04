import { createAuraPromptAdapter, type AuraPromptAdapter } from "./AuraPromptAdapter.js";
import { createDefaultAssetResolver, type AuraAssetResolver } from "./AuraAssetResolver.js";
import { createAuraSceneCompiler, type AuraCompiledSceneRuntime, type AuraSceneCompiler } from "./AuraSceneCompiler.js";
import { applyScenePatch, type AuraScenePatchResult } from "./AuraScenePatch.js";
import { createMockProvider } from "./providers/MockProvider.js";
import type { AuraAIProvider } from "./AuraAIProvider.js";
import type { AuraPatchPromptRequest, AuraPromptRequest } from "./AuraPromptRequest.js";
import type { AuraSceneIR } from "./AuraSceneIR.js";

export interface AuraSceneSession {
  readonly provider: AuraAIProvider;
  readonly adapter: AuraPromptAdapter;
  compilePromptToScene(request: AuraPromptRequest): Promise<AuraCompiledSceneRuntime>;
  compileSceneIRToRuntime(scene: AuraSceneIR): Promise<AuraCompiledSceneRuntime>;
  applyScenePatch(request: AuraPatchPromptRequest): Promise<AuraScenePatchResult>;
  dispose(): void;
}

export interface AuraSceneSessionOptions {
  readonly provider?: AuraAIProvider;
  readonly assetResolver?: AuraAssetResolver;
  readonly compiler?: AuraSceneCompiler;
}

export function createAISceneSession(options: AuraSceneSessionOptions = {}): AuraSceneSession {
  const provider = options.provider ?? createMockProvider();
  const adapter = createAuraPromptAdapter(provider);
  const compiler = options.compiler ?? createAuraSceneCompiler({ assetResolver: options.assetResolver ?? createDefaultAssetResolver() });
  let currentRuntime: AuraCompiledSceneRuntime | undefined;
  return {
    provider,
    adapter,
    async compilePromptToScene(request) {
      const result = await adapter.promptToSceneIR(request);
      if (!result.ok) throw new Error(`Aura prompt failed (${result.error.code}): ${result.error.message}`);
      currentRuntime?.dispose();
      currentRuntime = await compiler.compile(result.value);
      return currentRuntime;
    },
    async compileSceneIRToRuntime(scene) {
      currentRuntime?.dispose();
      currentRuntime = await compiler.compile(scene);
      return currentRuntime;
    },
    async applyScenePatch(request) {
      const result = await adapter.promptToScenePatch(request);
      if (!result.ok) throw new Error(`Aura patch failed (${result.error.code}): ${result.error.message}`);
      return applyScenePatch(request.scene, result.value);
    },
    dispose() {
      currentRuntime?.dispose();
      currentRuntime = undefined;
    }
  };
}
