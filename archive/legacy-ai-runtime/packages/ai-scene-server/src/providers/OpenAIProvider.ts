import { AURA_SCENE_SCHEMA } from "@aura3d/ai-scene";
import type { AuraProviderCapabilityMetadata, AuraProviderRawResponse, AuraProviderTransportSceneRequest, AuraSceneProviderTransport } from "../AuraProviderTypes.js";
import { liveProviderEnabled, postProviderJson, requireConfiguredProvider, type ProviderHttpOptions } from "./ProviderHttp.js";

export interface OpenAIProviderOptions extends ProviderHttpOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly enabled?: boolean;
}

export class OpenAIProvider implements AuraSceneProviderTransport {
  readonly id = "openai";
  readonly capabilities: AuraProviderCapabilityMetadata;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly enabled: boolean;

  constructor(private readonly options: OpenAIProviderOptions = {}) {
    this.apiKey = this.options.apiKey ?? process.env.OPENAI_API_KEY ?? process.env.AURA3D_OPENAI_API_KEY;
    this.baseUrl = this.options.baseUrl ?? process.env.AURA3D_OPENAI_BASE_URL ?? "https://api.openai.com/v1/responses";
    this.enabled = liveProviderEnabled("openai", this.options.enabled);
    const model = options.model ?? process.env.AURA3D_OPENAI_MODEL ?? "gpt-5.1";
    this.capabilities = {
      id: "openai",
      displayName: "OpenAI",
      defaultModel: model,
      structuredJson: true,
      promptToIR: true,
      promptToPatch: true,
      streaming: false,
      serverSideProxy: true,
      noNetworkDefault: true,
      liveNetwork: this.enabled,
      configured: Boolean(this.enabled && this.apiKey),
      requiredEnv: ["OPENAI_API_KEY or AURA3D_OPENAI_API_KEY", "AURA3D_ENABLE_LIVE_PROVIDERS=true or AURA3D_OPENAI_ENABLED=true"]
    };
  }

  async completeScene(request: AuraProviderTransportSceneRequest): Promise<AuraProviderRawResponse> {
    requireConfiguredProvider({
      provider: "openai",
      request,
      configured: this.capabilities.configured,
      missingMessage: "OpenAI transport is disabled until an OpenAI API key and explicit Aura3D live-provider env flag are configured."
    });
    return await postProviderJson({
      provider: "openai",
      request,
      url: this.baseUrl,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: {
        model: request.model,
        input: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "AuraSceneIR",
            schema: AURA_SCENE_SCHEMA,
            strict: true
          }
        }
      },
      fetchImpl: this.options.fetchImpl
    });
  }
}
