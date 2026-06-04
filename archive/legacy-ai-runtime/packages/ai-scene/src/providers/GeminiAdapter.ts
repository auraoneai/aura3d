import { createProviderFailure, type AuraAIProvider, type AuraProviderTransport } from "../AuraAIProvider.js";
import { createMockProvider } from "./MockProvider.js";

export interface GeminiAdapterOptions {
  readonly model?: string;
  readonly transport?: AuraProviderTransport;
}

export function createGeminiAdapter(options: GeminiAdapterOptions = {}): AuraAIProvider {
  const model = options.model ?? "gemini-2.5-pro";
  const mock = createMockProvider({ model: `gemini-${model}-mock-transport` });
  return {
    id: "gemini",
    displayName: "Gemini",
    defaultModel: model,
    capabilities: { structuredJson: true, promptToIR: true, promptToPatch: true, streaming: false, serverSideProxy: true, noNetworkDefault: true },
    async completeScene(request) {
      if (!options.transport) return createProviderFailure("gemini", model, "TRANSPORT_NOT_CONFIGURED", "Gemini adapter requires an explicit server-side transport; no API key is read by default.");
      const response = await options.transport({ providerId: "gemini", model, system: "Return AuraSceneIR JSON only.", prompt: request.prompt, timeoutMs: request.timeoutMs ?? 15_000, signal: request.signal });
      return response.json ? { ok: true, value: response.json as never, provider: "gemini", model, networkUsed: response.networkUsed, warnings: [] } : await mock.completeScene(request);
    },
    async completePatch(request) {
      if (!options.transport) return createProviderFailure("gemini", model, "TRANSPORT_NOT_CONFIGURED", "Gemini patch adapter requires explicit server-side transport.");
      const response = await options.transport({ providerId: "gemini", model, system: "Return AuraScenePatch JSON only.", prompt: request.prompt, timeoutMs: request.timeoutMs ?? 15_000, signal: request.signal });
      return response.json ? { ok: true, value: response.json as never, provider: "gemini", model, networkUsed: response.networkUsed, warnings: [] } : await mock.completePatch(request);
    }
  };
}
