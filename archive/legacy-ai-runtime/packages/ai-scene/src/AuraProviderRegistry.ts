import type { AuraAIProvider } from "./AuraAIProvider.js";

export interface AuraProviderRegistry {
  register(provider: AuraAIProvider): void;
  get(providerId?: string): AuraAIProvider;
  list(): readonly AuraAIProvider[];
}

export function createAuraProviderRegistry(providers: readonly AuraAIProvider[] = []): AuraProviderRegistry {
  const entries = new Map<string, AuraAIProvider>();
  for (const provider of providers) entries.set(provider.id, provider);
  return {
    register(provider) {
      entries.set(provider.id, provider);
    },
    get(providerId = "mock") {
      const provider = entries.get(providerId);
      if (!provider) throw new Error(`Unknown Aura AI provider: ${providerId}`);
      return provider;
    },
    list() {
      return [...entries.values()];
    }
  };
}
