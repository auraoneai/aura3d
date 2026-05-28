import { AURA_SCENE_SCHEMA } from "@aura3d/ai-scene";
import type { AuraProviderCapabilityMetadata, AuraProviderRawResponse, AuraProviderTransportSceneRequest, AuraSceneProviderTransport } from "../AuraProviderTypes.js";
import { liveProviderEnabled, postProviderJson, requireConfiguredProvider, type ProviderHttpOptions } from "./ProviderHttp.js";

export interface LocalModelProviderOptions extends ProviderHttpOptions {
  readonly endpoint?: string;
  readonly apiKey?: string;
  readonly model?: string;
  readonly enabled?: boolean;
}

export class LocalModelProvider implements AuraSceneProviderTransport {
  readonly id = "local";
  readonly capabilities: AuraProviderCapabilityMetadata;
  private readonly endpoint: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly enabled: boolean;

  constructor(private readonly options: LocalModelProviderOptions = {}) {
    this.endpoint = this.options.endpoint ?? process.env.AURA3D_LOCAL_MODEL_ENDPOINT;
    this.apiKey = this.options.apiKey ?? process.env.AURA3D_LOCAL_MODEL_API_KEY;
    this.enabled = liveProviderEnabled("local", this.options.enabled) || process.env.AURA3D_LOCAL_MODEL_ENABLED === "true";
    const model = options.model ?? process.env.AURA3D_LOCAL_MODEL_NAME ?? "local-json-scene-model";
    this.capabilities = {
      id: "local",
      displayName: "Local Model",
      defaultModel: model,
      structuredJson: true,
      promptToIR: true,
      promptToPatch: true,
      streaming: false,
      serverSideProxy: true,
      noNetworkDefault: true,
      liveNetwork: this.enabled,
      configured: Boolean(this.enabled && this.endpoint),
      requiredEnv: ["AURA3D_LOCAL_MODEL_ENDPOINT", "AURA3D_LOCAL_MODEL_ENABLED=true or AURA3D_LOCAL_ENABLED=true"]
    };
  }

  async completeScene(request: AuraProviderTransportSceneRequest): Promise<AuraProviderRawResponse> {
    requireConfiguredProvider({
      provider: "local",
      request,
      configured: this.capabilities.configured,
      missingMessage: "Local model transport is disabled until AURA3D_LOCAL_MODEL_ENDPOINT and an explicit Aura3D local-provider env flag are configured."
    });
    return await postProviderJson({
      provider: "local",
      request,
      url: String(this.endpoint),
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {})
      },
      body: {
        model: request.model,
        system: request.system,
        prompt: request.prompt,
        schema: AURA_SCENE_SCHEMA,
        metadata: request.metadata
      },
      fetchImpl: this.options.fetchImpl
    });
  }
}
