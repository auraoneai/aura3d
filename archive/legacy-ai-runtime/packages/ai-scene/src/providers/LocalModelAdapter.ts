import { createProviderFailure, type AuraAIProvider, type AuraProviderTransport } from "../AuraAIProvider.js";
import { createMockProvider } from "./MockProvider.js";

export interface LocalModelAdapterOptions {
  readonly model?: string;
  readonly transport?: AuraProviderTransport;
}

export function createLocalModelAdapter(options: LocalModelAdapterOptions = {}): AuraAIProvider {
  const model = options.model ?? "local-json-scene-model";
  const mock = createMockProvider({ model: `local-${model}-mock-transport` });
  return {
    id: "local",
    displayName: "Local Model",
    defaultModel: model,
    capabilities: { structuredJson: true, promptToIR: true, promptToPatch: true, streaming: false, serverSideProxy: true, noNetworkDefault: true },
    async completeScene(request) {
      if (!options.transport) return createProviderFailure("local", model, "LOCAL_TRANSPORT_NOT_CONFIGURED", "Local model adapter needs an explicit local transport endpoint.");
      const response = await options.transport({ providerId: "local", model, system: "Return AuraSceneIR JSON only.", prompt: request.prompt, timeoutMs: request.timeoutMs ?? 15_000, signal: request.signal });
      return response.json ? { ok: true, value: response.json as never, provider: "local", model, networkUsed: response.networkUsed, warnings: [] } : await mock.completeScene(request);
    },
    async completePatch(request) {
      if (!options.transport) return createProviderFailure("local", model, "LOCAL_TRANSPORT_NOT_CONFIGURED", "Local model patch adapter needs an explicit local transport endpoint.");
      const response = await options.transport({ providerId: "local", model, system: "Return AuraScenePatch JSON only.", prompt: request.prompt, timeoutMs: request.timeoutMs ?? 15_000, signal: request.signal });
      return response.json ? { ok: true, value: response.json as never, provider: "local", model, networkUsed: response.networkUsed, warnings: [] } : await mock.completePatch(request);
    }
  };
}
