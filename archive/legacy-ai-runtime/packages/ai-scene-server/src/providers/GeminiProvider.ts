import { AURA_SCENE_SCHEMA } from "@aura3d/ai-scene";
import type { AuraProviderCapabilityMetadata, AuraProviderRawResponse, AuraProviderTransportSceneRequest, AuraSceneProviderTransport } from "../AuraProviderTypes.js";
import { liveProviderEnabled, postProviderJson, requireConfiguredProvider, type ProviderHttpOptions } from "./ProviderHttp.js";

export interface GeminiProviderOptions extends ProviderHttpOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly enabled?: boolean;
}

export class GeminiProvider implements AuraSceneProviderTransport {
  readonly id = "gemini";
  readonly capabilities: AuraProviderCapabilityMetadata;
  private readonly apiKey: string | undefined;
  private readonly enabled: boolean;
  private readonly baseUrl: string;

  constructor(private readonly options: GeminiProviderOptions = {}) {
    this.apiKey = this.options.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? process.env.AURA3D_GEMINI_API_KEY;
    this.enabled = liveProviderEnabled("gemini", this.options.enabled);
    this.baseUrl = this.options.baseUrl ?? process.env.AURA3D_GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
    const model = options.model ?? process.env.AURA3D_GEMINI_MODEL ?? "gemini-2.5-pro";
    this.capabilities = {
      id: "gemini",
      displayName: "Gemini",
      defaultModel: model,
      structuredJson: true,
      promptToIR: true,
      promptToPatch: true,
      streaming: false,
      serverSideProxy: true,
      noNetworkDefault: true,
      liveNetwork: this.enabled,
      configured: Boolean(this.enabled && this.apiKey),
      requiredEnv: ["GEMINI_API_KEY, GOOGLE_API_KEY, or AURA3D_GEMINI_API_KEY", "AURA3D_ENABLE_LIVE_PROVIDERS=true or AURA3D_GEMINI_ENABLED=true"]
    };
  }

  async completeScene(request: AuraProviderTransportSceneRequest): Promise<AuraProviderRawResponse> {
    requireConfiguredProvider({
      provider: "gemini",
      request,
      configured: this.capabilities.configured,
      missingMessage: "Gemini transport is disabled until a Gemini API key and explicit Aura3D live-provider env flag are configured."
    });
    const url = `${this.baseUrl}/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(String(this.apiKey))}`;
    return await postProviderJson({
      provider: "gemini",
      request,
      url,
      headers: { "content-type": "application/json" },
      body: {
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: AURA_SCENE_SCHEMA
        }
      },
      fetchImpl: this.options.fetchImpl
    });
  }
}
