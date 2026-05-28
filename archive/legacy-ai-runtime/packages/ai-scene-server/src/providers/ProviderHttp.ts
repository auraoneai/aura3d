import { AURA_SCENE_SCHEMA } from "@aura3d/ai-scene";
import { redactProviderSecrets } from "../AuraProviderSecretPolicy.js";
import { AuraProviderProxyError, type AuraProviderRawResponse, type AuraProviderTransportSceneRequest, type AuraSceneServerProviderId } from "../AuraProviderTypes.js";

export interface ProviderHttpOptions {
  readonly fetchImpl?: typeof fetch;
}

export function liveProviderEnabled(provider: AuraSceneServerProviderId, optionsEnabled?: boolean): boolean {
  if (optionsEnabled === false) return false;
  const providerFlag = `AURA3D_${provider.toUpperCase()}_ENABLED`;
  return process.env.AURA3D_LIVE_PROVIDER_TESTS === "true" || process.env.AURA3D_ENABLE_LIVE_PROVIDERS === "true" || process.env[providerFlag] === "true";
}

export async function postProviderJson(input: {
  readonly provider: AuraSceneServerProviderId;
  readonly request: AuraProviderTransportSceneRequest;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly fetchImpl?: typeof fetch;
}): Promise<AuraProviderRawResponse> {
  const fetcher = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetcher(input.url, {
      method: "POST",
      headers: input.headers,
      body: JSON.stringify(input.body),
      signal: input.request.signal
    });
  } catch (error) {
    if (input.request.signal?.aborted) {
      throw new AuraProviderProxyError("Provider request was cancelled.", {
        code: "AURA_PROVIDER_CANCELLED",
        provider: input.provider,
        requestId: input.request.requestId,
        networkUsed: true,
        cause: error
      });
    }
    throw new AuraProviderProxyError("Provider network request failed.", {
      code: "AURA_PROVIDER_NETWORK_ERROR",
      provider: input.provider,
      requestId: input.request.requestId,
      retryable: true,
      networkUsed: true,
      cause: error
    });
  }

  const text = await response.text();
  if (!response.ok) {
    throw new AuraProviderProxyError(`Provider HTTP ${response.status}: ${redactProviderSecrets(text).slice(0, 500)}`, {
      code: "AURA_PROVIDER_HTTP_ERROR",
      provider: input.provider,
      requestId: input.request.requestId,
      retryable: response.status === 429 || response.status >= 500,
      status: response.status,
      networkUsed: true
    });
  }

  return {
    provider: input.provider,
    model: input.request.model,
    requestId: input.request.requestId,
    text,
    json: extractKnownJsonPayload(input.provider, text),
    networkUsed: true,
    status: response.status
  };
}

export function requireConfiguredProvider(input: {
  readonly provider: AuraSceneServerProviderId;
  readonly request: AuraProviderTransportSceneRequest;
  readonly configured: boolean;
  readonly missingMessage: string;
}): void {
  if (input.configured) return;
  throw new AuraProviderProxyError(input.missingMessage, {
    code: "AURA_PROVIDER_NOT_CONFIGURED",
    provider: input.provider,
    requestId: input.request.requestId,
    retryable: false,
    networkUsed: false
  });
}

export function sceneJsonSchemaPromptHint(): string {
  return JSON.stringify(AURA_SCENE_SCHEMA);
}

function extractKnownJsonPayload(provider: AuraSceneServerProviderId, text: string): unknown | undefined {
  const parsed = tryParseJson(text);
  if (!isRecord(parsed)) return undefined;
  if (provider === "openai") {
    const outputText = typeof parsed.output_text === "string" ? parsed.output_text : undefined;
    const textFromOutput = extractOpenAIOutputText(parsed);
    return tryParseJson(outputText ?? textFromOutput ?? "");
  }
  if (provider === "anthropic") {
    const content = parsed.content;
    if (Array.isArray(content)) {
      const textBlock = content.find((entry) => isRecord(entry) && entry.type === "text" && typeof entry.text === "string");
      return tryParseJson(isRecord(textBlock) ? String(textBlock.text) : "");
    }
  }
  if (provider === "gemini") {
    const candidates = parsed.candidates;
    const first = Array.isArray(candidates) ? candidates[0] : undefined;
    const parts = isRecord(first) && isRecord(first.content) && Array.isArray(first.content.parts) ? first.content.parts : undefined;
    const textPart = parts?.find((entry) => isRecord(entry) && typeof entry.text === "string");
    return tryParseJson(isRecord(textPart) ? String(textPart.text) : "");
  }
  if (provider === "local") {
    if ("json" in parsed) return parsed.json;
    if (typeof parsed.response === "string") return tryParseJson(parsed.response);
    if (typeof parsed.text === "string") return tryParseJson(parsed.text);
  }
  return parsed;
}

function extractOpenAIOutputText(parsed: Record<string, unknown>): string | undefined {
  const output = parsed.output;
  if (!Array.isArray(output)) return undefined;
  const chunks: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("");
}

function tryParseJson(text: string): unknown | undefined {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
