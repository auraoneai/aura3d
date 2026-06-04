import type { AuraAIProvider } from "./AuraAIProvider.js";
import type { AuraPatchPromptRequest, AuraPromptRequest, AuraPromptToPatchResult, AuraPromptToSceneResult } from "./AuraPromptRequest.js";

export interface AuraPromptAdapter {
  readonly provider: AuraAIProvider;
  promptToSceneIR(request: AuraPromptRequest): Promise<AuraPromptToSceneResult>;
  promptToScenePatch(request: AuraPatchPromptRequest): Promise<AuraPromptToPatchResult>;
}

export function createAuraPromptAdapter(provider: AuraAIProvider): AuraPromptAdapter {
  return {
    provider,
    async promptToSceneIR(request) {
      return await withTimeout(() => provider.completeScene(request), request.timeoutMs ?? 15_000, request.signal);
    },
    async promptToScenePatch(request) {
      return await withTimeout(() => provider.completePatch(request), request.timeoutMs ?? 15_000, request.signal);
    }
  };
}

async function withTimeout<TResult>(factory: () => Promise<TResult>, timeoutMs: number, signal?: AbortSignal): Promise<TResult> {
  if (signal?.aborted) throw new Error("Aura prompt request was aborted before it started.");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      factory(),
      new Promise<TResult>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Aura prompt request timed out after ${timeoutMs}ms.`)), timeoutMs);
        signal?.addEventListener("abort", () => reject(new Error("Aura prompt request was aborted.")), { once: true });
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
