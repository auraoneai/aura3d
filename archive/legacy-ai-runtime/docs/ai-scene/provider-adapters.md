# Provider Adapters

Version: 0.1.0

Provider adapters connect Aura3D to OpenAI, Anthropic, Gemini, local models, or mock providers. Aura3D is not the model; adapters translate between model-specific APIs and Aura3D's provider-neutral scene contracts.

## Adapter Contract

Every adapter should expose the same capabilities:

- `promptToSceneIR(request)`: turn a prompt into validated or validate-ready `AuraSceneIR`.
- `promptToScenePatch(request)`: turn an edit prompt into a structured scene patch.
- `getCapabilities()`: report model name, structured-output support, streaming support, max input/output sizes, timeout support, and whether live network access is required.
- `cancel(requestId)`: stop in-flight live provider calls where the provider supports cancellation.
- `redact(value)`: remove keys, tokens, and provider secrets from reports and logs.

## Required Providers

- `MockProvider`: deterministic, no network, no API key, used by local demos, CI, and route health.
- `OpenAIAdapter`: optional live provider selected explicitly by configuration.
- `AnthropicAdapter`: optional live provider selected explicitly by configuration.
- `GeminiAdapter`: optional live provider selected explicitly by configuration.
- `LocalModelAdapter`: optional local endpoint or in-process model bridge.

## No-Network Default

Default development, tests, route health, and CI must use `MockProvider`. Live provider tests should be opt-in through environment variables and should skip when credentials or endpoints are absent.

## Structured Output

Adapters should request JSON or schema-constrained output where the provider supports it. They must still validate the returned JSON through Aura3D's own scene schema. Provider success is not scene success until Aura3D validation passes.

## Failure Behavior

Adapter failures must return structured errors:

- provider unavailable;
- authentication missing;
- timeout;
- cancellation;
- invalid JSON;
- schema validation failure;
- unsupported provider capability;
- redaction failure.

No provider failure should produce a blank route, silent WebGL/WebGPU fallback, leaked secret, or undocumented approximation.

## Security Rules

- No API key should be required unless the user explicitly selects a live provider.
- No API key should enter browser bundles by default.
- Reports should name provider and model but redact secrets.
- Prompt provenance should record provider, model, timestamp, and adapter version.
