import { cinematicSceneSystemPrompt } from "./prompts/cinematic-scene-system-prompt.js";
import { validateProviderProxyRequest } from "./AuraProviderRequestValidator.js";
import { validateProviderSceneResponse } from "./AuraProviderResponseValidator.js";
import { sanitizeProviderErrorMessage } from "./AuraProviderSecretPolicy.js";
import { createAuraProviderRouter } from "./AuraProviderRouter.js";
import {
  AuraProviderProxyError,
  type AuraProviderProxyOptions,
  type AuraProviderProxyRequest,
  type AuraProviderProxyResult,
  type AuraProviderValidatedRequest,
  type AuraSceneServerProviderId
} from "./AuraProviderTypes.js";

export class AuraProviderProxy {
  private readonly router;
  private readonly defaultProvider;
  private readonly defaultTimeoutMs;
  private readonly defaultRetryCount;

  constructor(private readonly options: AuraProviderProxyOptions = {}) {
    this.router = this.options.router ?? createAuraProviderRouter();
    this.defaultProvider = this.options.defaultProvider ?? "mock";
    this.defaultTimeoutMs = this.options.defaultTimeoutMs ?? 15_000;
    this.defaultRetryCount = this.options.defaultRetryCount ?? 1;
  }

  capabilities() {
    return this.router.capabilities();
  }

  async promptToScene(input: AuraProviderProxyRequest | unknown): Promise<AuraProviderProxyResult> {
    const startedAt = Date.now();
    const validation = validateProviderProxyRequest(input, {
      defaultProvider: this.defaultProvider,
      defaultTimeoutMs: this.defaultTimeoutMs,
      defaultRetryCount: this.defaultRetryCount
    });

    if (!validation.ok || !validation.request) {
      return {
        ok: false,
        requestId: "aura-provider-request-invalid",
        provider: this.defaultProvider,
        model: "unknown",
        networkUsed: false,
        attempts: 0,
        elapsedMs: Date.now() - startedAt,
        error: {
          code: "AURA_PROVIDER_REQUEST_INVALID",
          message: "Provider proxy request failed validation.",
          retryable: false,
          diagnostics: validation.issues
        }
      };
    }

    const request = validation.request;
    let attempts = 0;
    let networkUsed = false;
    let lastError: AuraProviderProxyError | undefined;

    for (let attempt = 0; attempt <= request.retryCount; attempt += 1) {
      attempts = attempt + 1;
      const attemptSignal = createAttemptSignal(request.signal, request.timeoutMs);
      try {
        const provider = this.router.resolve(request.provider);
        const raw = await provider.completeScene({
          ...request,
          signal: attemptSignal.signal,
          system: cinematicSceneSystemPrompt
        });
        networkUsed = networkUsed || raw.networkUsed;
        const scene = validateProviderSceneResponse(raw);
        return {
          ok: true,
          requestId: request.requestId,
          provider: request.provider,
          model: raw.model,
          scene,
          networkUsed,
          attempts,
          elapsedMs: Date.now() - startedAt,
          warnings: validation.issues.map((issue) => issue.message),
          capabilities: provider.capabilities
        };
      } catch (error) {
        lastError = normalizeProviderError(error, request, attemptSignal.timedOut());
        networkUsed = networkUsed || lastError.networkUsed;
        if (!lastError.retryable || attempt >= request.retryCount || request.signal?.aborted) break;
        await delay(backoffMs(attempt), request.signal);
      } finally {
        attemptSignal.dispose();
      }
    }

    const error = lastError ?? new AuraProviderProxyError("Provider request failed.", {
      code: "AURA_PROVIDER_UNKNOWN_FAILURE",
      provider: request.provider,
      requestId: request.requestId
    });
    return {
      ok: false,
      requestId: request.requestId,
      provider: request.provider,
      model: request.model,
      networkUsed,
      attempts,
      elapsedMs: Date.now() - startedAt,
      error: {
        code: error.code,
        message: sanitizeProviderErrorMessage(error.message),
        retryable: error.retryable,
        status: error.status,
        diagnostics: error.diagnostics
      }
    };
  }
}

export function createAuraProviderProxy(options: AuraProviderProxyOptions = {}): AuraProviderProxy {
  return new AuraProviderProxy(options);
}

function normalizeProviderError(error: unknown, request: AuraProviderValidatedRequest, timedOut: boolean): AuraProviderProxyError {
  if (error instanceof AuraProviderProxyError) {
    if (timedOut && error.code === "AURA_PROVIDER_CANCELLED") {
      return new AuraProviderProxyError("Provider request timed out.", {
        code: "AURA_PROVIDER_TIMEOUT",
        provider: request.provider,
        requestId: request.requestId,
        retryable: true,
        networkUsed: error.networkUsed,
        cause: error
      });
    }
    return error;
  }
  if (request.signal?.aborted) {
    return new AuraProviderProxyError("Provider request was cancelled.", {
      code: "AURA_PROVIDER_CANCELLED",
      provider: request.provider,
      requestId: request.requestId,
      retryable: false,
      cause: error
    });
  }
  if (timedOut) {
    return new AuraProviderProxyError("Provider request timed out.", {
      code: "AURA_PROVIDER_TIMEOUT",
      provider: request.provider,
      requestId: request.requestId,
      retryable: true,
      cause: error
    });
  }
  return new AuraProviderProxyError(error instanceof Error ? error.message : "Provider request failed.", {
    code: "AURA_PROVIDER_TRANSPORT_ERROR",
    provider: request.provider,
    requestId: request.requestId,
    retryable: true,
    cause: error
  });
}

function createAttemptSignal(parent: AbortSignal | undefined, timeoutMs: number): { readonly signal: AbortSignal; readonly dispose: () => void; readonly timedOut: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("Provider request timed out."));
  }, timeoutMs);
  const onAbort = () => controller.abort(parent?.reason ?? new Error("Provider request was cancelled."));
  if (parent?.aborted) onAbort();
  else parent?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", onAbort);
    }
  };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(signal.reason);
    }, { once: true });
  });
}

function backoffMs(attempt: number): number {
  return 150 * 2 ** attempt;
}

export type { AuraSceneServerProviderId };
