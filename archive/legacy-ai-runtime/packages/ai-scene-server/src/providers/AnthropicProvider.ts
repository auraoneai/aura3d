import type { AuraProviderCapabilityMetadata, AuraProviderRawResponse, AuraProviderTransportSceneRequest, AuraSceneProviderTransport } from "../AuraProviderTypes.js";
import { liveProviderEnabled, postProviderJson, requireConfiguredProvider, sceneJsonSchemaPromptHint, type ProviderHttpOptions } from "./ProviderHttp.js";

export interface AnthropicProviderOptions extends ProviderHttpOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly enabled?: boolean;
}

export class AnthropicProvider implements AuraSceneProviderTransport {
  readonly id = "anthropic";
  readonly capabilities: AuraProviderCapabilityMetadata;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly enabled: boolean;

  constructor(private readonly options: AnthropicProviderOptions = {}) {
    this.apiKey = this.options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.AURA3D_ANTHROPIC_API_KEY;
    this.baseUrl = this.options.baseUrl ?? process.env.AURA3D_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1/messages";
    this.enabled = liveProviderEnabled("anthropic", this.options.enabled);
    const model = options.model ?? process.env.AURA3D_ANTHROPIC_MODEL ?? "claude-sonnet-4.5";
    this.capabilities = {
      id: "anthropic",
      displayName: "Anthropic",
      defaultModel: model,
      structuredJson: true,
      promptToIR: true,
      promptToPatch: true,
      streaming: false,
      serverSideProxy: true,
      noNetworkDefault: true,
      liveNetwork: this.enabled,
      configured: Boolean(this.enabled && this.apiKey),
      requiredEnv: ["ANTHROPIC_API_KEY or AURA3D_ANTHROPIC_API_KEY", "AURA3D_ENABLE_LIVE_PROVIDERS=true or AURA3D_ANTHROPIC_ENABLED=true"]
    };
  }

  async completeScene(request: AuraProviderTransportSceneRequest): Promise<AuraProviderRawResponse> {
    requireConfiguredProvider({
      provider: "anthropic",
      request,
      configured: this.capabilities.configured,
      missingMessage: "Anthropic transport is disabled until an Anthropic API key and explicit Aura3D live-provider env flag are configured."
    });
    return await postProviderJson({
      provider: "anthropic",
      request,
      url: this.baseUrl,
      headers: {
        "content-type": "application/json",
        "x-api-key": String(this.apiKey),
        "anthropic-version": "2023-06-01"
      },
      body: {
        model: request.model,
        max_tokens: 4096,
        system: `${request.system}\n\nReturn one JSON object matching this schema and no prose:\n${sceneJsonSchemaPromptHint()}`,
        messages: [{ role: "user", content: request.prompt }]
      },
      fetchImpl: this.options.fetchImpl
    });
  }
}
