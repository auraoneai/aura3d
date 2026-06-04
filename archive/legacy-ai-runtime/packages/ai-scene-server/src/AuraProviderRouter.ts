import { AnthropicProvider } from "./providers/AnthropicProvider.js";
import { GeminiProvider } from "./providers/GeminiProvider.js";
import { LocalModelProvider } from "./providers/LocalModelProvider.js";
import { MockProviderTransport } from "./providers/MockProviderTransport.js";
import { OpenAIProvider } from "./providers/OpenAIProvider.js";
import { AuraProviderProxyError, type AuraProviderCapabilityMetadata, type AuraSceneProviderTransport, type AuraSceneServerProviderId } from "./AuraProviderTypes.js";

export interface AuraProviderRouterOptions {
  readonly providers?: readonly AuraSceneProviderTransport[];
}

export class AuraProviderRouter {
  private readonly providers = new Map<AuraSceneServerProviderId, AuraSceneProviderTransport>();

  constructor(options: AuraProviderRouterOptions = {}) {
    for (const provider of options.providers ?? []) this.register(provider);
  }

  register(provider: AuraSceneProviderTransport): void {
    this.providers.set(provider.id, provider);
  }

  resolve(providerId: AuraSceneServerProviderId): AuraSceneProviderTransport {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new AuraProviderProxyError(`Provider '${providerId}' is not registered.`, {
        code: "AURA_PROVIDER_NOT_REGISTERED",
        provider: providerId,
        retryable: false
      });
    }
    return provider;
  }

  capabilities(): readonly AuraProviderCapabilityMetadata[] {
    return [...this.providers.values()].map((provider) => provider.capabilities);
  }
}

export function createAuraProviderRouter(options: AuraProviderRouterOptions = {}): AuraProviderRouter {
  if (options.providers) return new AuraProviderRouter(options);
  return new AuraProviderRouter({
    providers: [
      new MockProviderTransport(),
      new OpenAIProvider(),
      new AnthropicProvider(),
      new GeminiProvider(),
      new LocalModelProvider()
    ]
  });
}
