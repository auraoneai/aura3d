import { diagnostic } from "@aura3d/ai-scene";
import { collectSecretFieldPaths } from "./AuraProviderSecretPolicy.js";
import type {
  AuraProviderRequestValidationResult,
  AuraProviderProxyRequest,
  AuraProviderValidatedRequest,
  AuraSceneServerProviderId
} from "./AuraProviderTypes.js";

const PROVIDERS = new Set<AuraSceneServerProviderId>(["mock", "openai", "anthropic", "gemini", "local"]);
const DEFAULT_MODELS: Record<AuraSceneServerProviderId, string> = {
  mock: "aura-mock-scene-v1",
  openai: "gpt-5.1",
  anthropic: "claude-sonnet-4.5",
  gemini: "gemini-2.5-pro",
  local: "local-json-scene-model"
};

export function validateProviderProxyRequest(
  input: unknown,
  options: {
    readonly defaultProvider?: AuraSceneServerProviderId;
    readonly defaultTimeoutMs?: number;
    readonly defaultRetryCount?: number;
  } = {}
): AuraProviderRequestValidationResult {
  const issues: ReturnType<typeof diagnostic>[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [diagnostic("", "AURA_PROVIDER_REQUEST_NOT_OBJECT", "error", "Provider proxy request must be an object.", "Send a structured server proxy request.")]
    };
  }

  const secretPaths = collectSecretFieldPaths(input);
  for (const path of secretPaths) {
    issues.push(diagnostic(path, "AURA_PROVIDER_SECRET_IN_REQUEST", "error", "Provider proxy request must not include raw API keys, bearer tokens, or secrets.", "Configure provider secrets only on the server via environment variables."));
  }

  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt) issues.push(diagnostic("prompt", "AURA_PROVIDER_PROMPT_REQUIRED", "error", "Prompt must be a non-empty string.", "Send the cinematic scene prompt."));
  if (prompt.length > 20_000) issues.push(diagnostic("prompt", "AURA_PROVIDER_PROMPT_TOO_LONG", "error", "Prompt must be 20,000 characters or less.", "Shorten the prompt before calling the provider proxy."));

  const provider = normalizeProvider(input.provider, options.defaultProvider ?? "mock");
  if (!provider) issues.push(diagnostic("provider", "AURA_PROVIDER_UNKNOWN", "error", "Provider must be mock, openai, anthropic, gemini, or local.", "Choose a supported provider id."));

  const timeoutMs = normalizeInteger(input.timeoutMs, options.defaultTimeoutMs ?? 15_000);
  if (timeoutMs < 250 || timeoutMs > 120_000) issues.push(diagnostic("timeoutMs", "AURA_PROVIDER_TIMEOUT_INVALID", "error", "timeoutMs must be between 250 and 120000.", "Use a bounded server timeout."));

  const retryCount = normalizeInteger(input.retryCount, options.defaultRetryCount ?? 1);
  if (retryCount < 0 || retryCount > 3) issues.push(diagnostic("retryCount", "AURA_PROVIDER_RETRY_INVALID", "error", "retryCount must be between 0 and 3.", "Use a small bounded retry count."));

  const metadata = normalizeMetadata(input.metadata, issues);
  const assetManifestIds = normalizeStringArray(input.assetManifestIds, "assetManifestIds", issues);
  const requestId = typeof input.requestId === "string" && input.requestId.trim() ? input.requestId.trim() : createProviderRequestId();
  const model = typeof input.model === "string" && input.model.trim() ? input.model.trim() : DEFAULT_MODELS[provider ?? "mock"];

  if (issues.some((issue) => issue.severity === "error") || !provider) return { ok: false, issues };

  const request: AuraProviderValidatedRequest = {
    prompt,
    provider,
    model,
    timeoutMs,
    retryCount,
    requestId,
    metadata,
    ...(assetManifestIds ? { assetManifestIds } : {}),
    ...(typeof input.qualityTarget === "string" ? { qualityTarget: input.qualityTarget as never } : {}),
    ...(typeof input.backendPreference === "string" ? { backendPreference: input.backendPreference as never } : {}),
    ...(input.signal instanceof AbortSignal ? { signal: input.signal } : {})
  };
  return { ok: true, request, issues };
}

export function createProviderRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `aura-provider-${crypto.randomUUID()}`;
  return `aura-provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeProvider(value: unknown, fallback: AuraSceneServerProviderId): AuraSceneServerProviderId | undefined {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return undefined;
  return PROVIDERS.has(value as AuraSceneServerProviderId) ? (value as AuraSceneServerProviderId) : undefined;
}

function normalizeInteger(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

function normalizeMetadata(value: unknown, issues: ReturnType<typeof diagnostic>[]): Readonly<Record<string, string>> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    issues.push(diagnostic("metadata", "AURA_PROVIDER_METADATA_INVALID", "error", "metadata must be a string record.", "Send metadata as key/value strings."));
    return {};
  }
  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      issues.push(diagnostic(`metadata.${key}`, "AURA_PROVIDER_METADATA_VALUE_INVALID", "error", "metadata values must be strings.", "Convert metadata values to strings before sending."));
      continue;
    }
    output[key] = entry;
  }
  return output;
}

function normalizeStringArray(value: unknown, path: string, issues: ReturnType<typeof diagnostic>[]): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    issues.push(diagnostic(path, "AURA_PROVIDER_STRING_ARRAY_INVALID", "error", `${path} must be an array of strings.`, "Send only string ids."));
    return undefined;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
