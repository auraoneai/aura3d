import { createMockProvider } from "@aura3d/ai-scene";
import type { AuraProviderCapabilityMetadata, AuraProviderRawResponse, AuraProviderTransportSceneRequest, AuraSceneProviderTransport } from "../AuraProviderTypes.js";

export interface MockProviderTransportOptions {
  readonly model?: string;
  readonly generatedAt?: string;
  readonly seed?: string;
  readonly fixture?: unknown;
}

export class MockProviderTransport implements AuraSceneProviderTransport {
  readonly id = "mock";
  readonly capabilities: AuraProviderCapabilityMetadata;
  private readonly provider;

  constructor(options: MockProviderTransportOptions = {}) {
    const model = options.model ?? "aura-mock-scene-v1";
    this.provider = createMockProvider({
      model,
      generatedAt: options.generatedAt ?? "2026-01-01T00:00:00.000Z",
      seed: options.seed,
      fixture: options.fixture
    });
    this.capabilities = {
      id: "mock",
      displayName: "Aura3D Mock Provider Transport",
      defaultModel: model,
      structuredJson: true,
      promptToIR: true,
      promptToPatch: true,
      streaming: false,
      serverSideProxy: true,
      noNetworkDefault: true,
      liveNetwork: false,
      configured: true,
      requiredEnv: []
    };
  }

  async completeScene(request: AuraProviderTransportSceneRequest): Promise<AuraProviderRawResponse> {
    const result = await this.provider.completeScene(request);
    if (!result.ok) throw new Error(result.error.message);
    return {
      provider: "mock",
      model: result.model,
      requestId: request.requestId,
      text: JSON.stringify(result.value),
      json: result.value,
      networkUsed: false,
      status: 200
    };
  }
}
