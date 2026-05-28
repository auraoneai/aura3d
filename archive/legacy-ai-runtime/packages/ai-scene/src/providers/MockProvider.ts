import { createProviderFailure, type AuraAIProvider } from "../AuraAIProvider.js";
import { createPromptProvenance } from "../AuraPromptProvenance.js";
import type { AuraPatchPromptRequest, AuraPromptRequest } from "../AuraPromptRequest.js";
import { createTinyProductSceneIR, createTinyRobotGreenhouseSceneIR } from "../AuraSceneIR.js";
import type { AuraScenePatch } from "../AuraScenePatch.js";
import { diagnostic } from "../AuraSceneValidator.js";

export interface AuraMockProvider extends AuraAIProvider {
  promptToScene(request: AuraPromptRequest): Promise<{
    readonly ir: unknown;
    readonly providerMode: string;
    readonly networkUsed: boolean;
    readonly diagnostics: readonly ReturnType<typeof diagnostic>[];
  }>;
  promptToPatch(request: { readonly sceneId: string; readonly prompt: string }): Promise<{
    readonly patch: unknown;
    readonly networkUsed: boolean;
  }>;
}

export function createMockProvider(options: { readonly model?: string; readonly generatedAt?: string; readonly seed?: string; readonly fixture?: unknown } = {}): AuraMockProvider {
  const model = options.model ?? "aura-mock-scene-v1";
  const generatedAt = options.generatedAt ?? "2026-01-01T00:00:00.000Z";
  return {
    id: "mock",
    displayName: "Aura3D Mock Provider",
    defaultModel: model,
    capabilities: {
      structuredJson: true,
      promptToIR: true,
      promptToPatch: true,
      streaming: false,
      serverSideProxy: false,
      noNetworkDefault: true
    },
    async completeScene(request: AuraPromptRequest) {
      if (!request.prompt.trim()) return createProviderFailure("mock", model, "EMPTY_PROMPT", "MockProvider requires a non-empty prompt.");
      if (options.fixture) {
        return { ok: true, value: options.fixture as never, provider: "mock", model, networkUsed: false, warnings: [] };
      }
      const product = /product|duck|prop|studio/i.test(request.prompt);
      const scene = product ? createTinyProductSceneIR({ generatedAt }) : createTinyRobotGreenhouseSceneIR({ generatedAt });
      return {
        ok: true,
        value: {
          ...scene,
          brief: `${scene.brief} Prompt: ${request.prompt}`,
          backendPreference: request.backendPreference ?? scene.backendPreference,
          qualityTarget: request.qualityTarget ?? scene.qualityTarget,
          provenance: createPromptProvenance({
            prompt: request.prompt,
            provider: "mock",
            model,
            generatedAt,
            networkUsed: false
          })
        },
        provider: "mock",
        model,
        networkUsed: false,
        warnings: ["MockProvider used deterministic local scene generation; no network or API key was used."]
      };
    },
    async completePatch(request: AuraPatchPromptRequest) {
      const target = request.scene.objects[0]?.id;
      if (!target) return createProviderFailure("mock", model, "NO_PATCH_TARGET", "Scene has no object to patch.");
      const patch: AuraScenePatch = {
        patchId: `patch-${Date.now().toString(36)}`,
        prompt: request.prompt,
        provider: "mock",
        model,
        generatedAt,
        operations: [
          {
            id: "op-hero-scale",
            op: "merge",
            targetKind: "object",
            targetId: target,
            value: {
              transform: {
                scale: /larger|bigger|closer/i.test(request.prompt) ? [1.35, 1.35, 1.35] : [0.85, 0.85, 0.85]
              }
            }
          }
        ]
      };
      return { ok: true, value: patch, provider: "mock", model, networkUsed: false, warnings: [] };
    },
    async promptToScene(request: AuraPromptRequest) {
      const result = await this.completeScene(request);
      if (!result.ok) throw new Error(result.error.message);
      return {
        ir: result.value,
        providerMode: "mock",
        networkUsed: false,
        diagnostics: [
          diagnostic("provider", "AURA_PROVIDER_MOCK_DETERMINISTIC", "info", `MockProvider generated deterministic IR using seed '${options.seed ?? "default"}'.`, "Use a live provider only through explicit server-side transport.")
        ]
      };
    },
    async promptToPatch(request: { readonly sceneId: string; readonly prompt: string }) {
      return {
        networkUsed: false,
        patch: {
          sceneId: request.sceneId,
          objects: [{ id: "robot_01", transform: { scale: /smaller/i.test(request.prompt) ? [0.65, 0.65, 0.65] : [1.25, 1.25, 1.25] } }],
          vfx: [{ id: "fog_01", density: /fog/i.test(request.prompt) ? 0.45 : 0.28 }],
          cameras: [{ id: "camera_hero", position: [0, 0.55, 3.4], lens: "wide" }]
        }
      };
    }
  };
}
