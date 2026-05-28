# Security

Version: 0.1.0

AI scene features must be safe by default. Aura3D integrates with OpenAI, Anthropic, Gemini, local models, and other providers, but it should not require live provider credentials for local demos, CI, or route health.

## Secrets

- No API key in browser bundles by default.
- No API key in screenshots.
- No API key in generated reports.
- No API key in console logs.
- No API key in route metadata.
- No API key in exported scene JSON.

Provider adapters should support server-side proxy mode for live models. Browser-side direct provider calls should be treated as an explicit advanced deployment choice, not the default.

## Redaction

Reports should preserve useful provenance while redacting secrets:

- provider name: allowed;
- model name: allowed;
- request ID: allowed if not sensitive;
- prompt hash: allowed;
- prompt text: allowed only when the user or route policy permits it;
- API keys, bearer tokens, cookies, secrets: always redacted.

## Prompt And Asset Safety

AI scene pipelines should treat model output as untrusted input:

- validate JSON before use;
- reject unsupported URLs unless explicitly allowed;
- do not execute generated code;
- sanitize exported metadata;
- restrict asset loading to approved manifests or user-approved URLs;
- record provenance for prompt, provider, assets, placeholders, and patches.

## CI And Local Development

CI and local route health must use deterministic mock mode by default. Live provider smoke tests should require explicit environment variables and should skip safely when those variables are absent.

## Deployment Requirement

Any public demo that calls a live provider should use a server-side proxy with rate limits, logging, secret storage, and redaction. Static demos should use mock or precomputed scene IR.
