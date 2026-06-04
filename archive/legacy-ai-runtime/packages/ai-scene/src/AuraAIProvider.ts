import type { AuraPatchPromptRequest, AuraPromptAdapterResult, AuraPromptRequest } from "./AuraPromptRequest.js";
import type { AuraSceneIR } from "./AuraSceneIR.js";
import type { AuraScenePatch } from "./AuraScenePatch.js";

export interface AuraAIProviderCapabilityMetadata {
  readonly structuredJson: boolean;
  readonly promptToIR: boolean;
  readonly promptToPatch: boolean;
  readonly streaming: boolean;
  readonly serverSideProxy: boolean;
  readonly noNetworkDefault: boolean;
}

export interface AuraProviderTransportRequest {
  readonly providerId: string;
  readonly model: string;
  readonly system: string;
  readonly prompt: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface AuraProviderTransportResponse {
  readonly text: string;
  readonly json?: unknown;
  readonly networkUsed: boolean;
}

export type AuraProviderTransport = (request: AuraProviderTransportRequest) => Promise<AuraProviderTransportResponse>;

export interface AuraAIProvider {
  readonly id: string;
  readonly displayName: string;
  readonly defaultModel: string;
  readonly capabilities: AuraAIProviderCapabilityMetadata;
  completeScene(request: AuraPromptRequest): Promise<AuraPromptAdapterResult<AuraSceneIR>>;
  completePatch(request: AuraPatchPromptRequest): Promise<AuraPromptAdapterResult<AuraScenePatch>>;
  promptToScene?(request: AuraPromptRequest): Promise<{
    readonly ir: unknown;
    readonly providerMode: string;
    readonly networkUsed: boolean;
    readonly diagnostics: readonly { readonly code: string; readonly severity: "info" | "warning" | "error"; readonly path: string; readonly message: string; readonly fixSuggestion: string }[];
  }>;
  promptToPatch?(request: { readonly sceneId: string; readonly prompt: string }): Promise<{
    readonly patch: unknown;
    readonly networkUsed: boolean;
  }>;
}

export function createProviderFailure(
  provider: string,
  model: string,
  code: string,
  message: string,
  options: { readonly networkUsed?: boolean; readonly retryable?: boolean; readonly recoverableByMock?: boolean } = {}
): AuraPromptAdapterResult<never> {
  return {
    ok: false,
    provider,
    model,
    networkUsed: options.networkUsed ?? false,
    error: {
      code,
      message,
      retryable: options.retryable ?? false,
      recoverableByMock: options.recoverableByMock ?? true
    }
  };
}
