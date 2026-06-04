import { createProviderFailure, type AuraAIProvider, type AuraProviderTransport } from "../AuraAIProvider.js";
import { createMockProvider } from "./MockProvider.js";

export interface OpenAIAdapterOptions {
  readonly model?: string;
  readonly transport?: AuraProviderTransport;
  readonly serverSideProxyUrl?: string;
}

export function createOpenAIAdapter(options: OpenAIAdapterOptions = {}): AuraAIProvider {
  const model = options.model ?? "gpt-5.1";
  const mock = createMockProvider({ model: `openai-${model}-mock-transport` });
  return {
    id: "openai",
    displayName: "OpenAI",
    defaultModel: model,
    capabilities: { structuredJson: true, promptToIR: true, promptToPatch: true, streaming: false, serverSideProxy: true, noNetworkDefault: true },
    async completeScene(request) {
      if (!options.transport) return createProviderFailure("openai", model, "TRANSPORT_NOT_CONFIGURED", "OpenAI adapter requires an explicit server-side transport; it never reads API keys in the browser bundle.");
      const response = await options.transport({ providerId: "openai", model, system: "Return AuraSceneIR JSON only.", prompt: request.prompt, timeoutMs: request.timeoutMs ?? 15_000, signal: request.signal });
      if (response.json) return { ok: true, value: response.json as Awaited<ReturnType<typeof mock.completeScene>> extends { ok: true; value: infer T } ? T : never, provider: "openai", model, networkUsed: response.networkUsed, warnings: [] };
      return await mock.completeScene({ ...request, model });
    },
    async completePatch(request) {
      if (!options.transport) return createProviderFailure("openai", model, "TRANSPORT_NOT_CONFIGURED", "OpenAI patch adapter requires explicit server-side transport.");
      const response = await options.transport({ providerId: "openai", model, system: "Return AuraScenePatch JSON only.", prompt: request.prompt, timeoutMs: request.timeoutMs ?? 15_000, signal: request.signal });
      if (response.json) return { ok: true, value: response.json as Awaited<ReturnType<typeof mock.completePatch>> extends { ok: true; value: infer T } ? T : never, provider: "openai", model, networkUsed: response.networkUsed, warnings: [] };
      return await mock.completePatch({ ...request, model });
    }
  };
}
