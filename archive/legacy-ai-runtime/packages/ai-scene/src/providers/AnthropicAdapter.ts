import { createProviderFailure, type AuraAIProvider, type AuraProviderTransport } from "../AuraAIProvider.js";
import { createMockProvider } from "./MockProvider.js";

export interface AnthropicAdapterOptions {
  readonly model?: string;
  readonly transport?: AuraProviderTransport;
}

export function createAnthropicAdapter(options: AnthropicAdapterOptions = {}): AuraAIProvider {
  const model = options.model ?? "claude-sonnet-4.5";
  const mock = createMockProvider({ model: `anthropic-${model}-mock-transport` });
  return {
    id: "anthropic",
    displayName: "Anthropic",
    defaultModel: model,
    capabilities: { structuredJson: true, promptToIR: true, promptToPatch: true, streaming: false, serverSideProxy: true, noNetworkDefault: true },
    async completeScene(request) {
      if (!options.transport) return createProviderFailure("anthropic", model, "TRANSPORT_NOT_CONFIGURED", "Anthropic adapter requires an explicit server-side transport; no API key is read by default.");
      const response = await options.transport({ providerId: "anthropic", model, system: "Return AuraSceneIR JSON only.", prompt: request.prompt, timeoutMs: request.timeoutMs ?? 15_000, signal: request.signal });
      return response.json ? { ok: true, value: response.json as never, provider: "anthropic", model, networkUsed: response.networkUsed, warnings: [] } : await mock.completeScene(request);
    },
    async completePatch(request) {
      if (!options.transport) return createProviderFailure("anthropic", model, "TRANSPORT_NOT_CONFIGURED", "Anthropic patch adapter requires explicit server-side transport.");
      const response = await options.transport({ providerId: "anthropic", model, system: "Return AuraScenePatch JSON only.", prompt: request.prompt, timeoutMs: request.timeoutMs ?? 15_000, signal: request.signal });
      return response.json ? { ok: true, value: response.json as never, provider: "anthropic", model, networkUsed: response.networkUsed, warnings: [] } : await mock.completePatch(request);
    }
  };
}
