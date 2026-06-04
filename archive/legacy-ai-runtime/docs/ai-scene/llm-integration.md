# LLM Integration

Version: 0.1.0

Aura3D is not the language model. Aura3D is the scene execution layer that accepts structured creative intent from OpenAI, Anthropic, Gemini, local models, or a deterministic mock provider.

## Integration Shape

```text
user prompt
-> model/provider adapter
-> AuraSceneIR
-> validator
-> compiler
-> renderer route
-> diagnostics, screenshot, export
```

The default development and CI path uses `MockProvider`, so no network call or API key is required.

## Provider Rules

- Browser demos must not read provider API keys.
- Live providers should be called through a server-side proxy.
- Reports must include `providerMode`, `networkUsed`, `inputs`, `evidence`, `blockedClaims`, and `unsupportedCases`.
- Prompt provenance may record provider, model, prompt hash, generated time, and patch history, but never raw secrets.

## Current Provider Surface

- `createMockProvider()` produces deterministic local scene IR and patches.
- `createOpenAIAdapter()`, `createAnthropicAdapter()`, `createGeminiAdapter()`, and `createLocalModelAdapter()` expose provider contracts that require explicit transport for live calls.
- `pnpm ai-scene:provider-contracts` verifies that adapter defaults do not use network access or browser-exposed API keys.
