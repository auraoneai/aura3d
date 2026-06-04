import { validateAuraSceneIR, type AuraSceneIR } from "@aura3d/ai-scene";
import { safeProviderSnippet } from "./AuraProviderSecretPolicy.js";
import { AuraProviderProxyError, type AuraProviderRawResponse } from "./AuraProviderTypes.js";

export function validateProviderSceneResponse(response: AuraProviderRawResponse): AuraSceneIR {
  const json = response.json ?? parseProviderJson(response.text, response);
  const validation = validateAuraSceneIR(json);
  if (!validation.ok) {
    throw new AuraProviderProxyError("Provider returned JSON that does not satisfy AuraSceneIR.", {
      code: "AURA_PROVIDER_IR_INVALID",
      provider: response.provider,
      requestId: response.requestId,
      diagnostics: validation.errors,
      networkUsed: response.networkUsed
    });
  }
  return json as AuraSceneIR;
}

export function parseProviderJson(text: string, responseContext?: Pick<AuraProviderRawResponse, "provider" | "requestId" | "networkUsed">): unknown {
  const candidate = extractJsonCandidate(text);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new AuraProviderProxyError(`Provider returned malformed JSON: ${safeProviderSnippet(text)}`, {
      code: "AURA_PROVIDER_JSON_MALFORMED",
      provider: responseContext?.provider,
      requestId: responseContext?.requestId,
      retryable: false,
      networkUsed: responseContext?.networkUsed ?? false,
      cause: error
    });
  }
}

function extractJsonCandidate(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  return trimmed;
}
