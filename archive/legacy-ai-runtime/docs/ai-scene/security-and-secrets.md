# Security And Secrets

Version: 0.1.0

Aura3D AI scene demos and templates are safe-by-default:

- no provider API keys are required for local demos or CI;
- `MockProvider` is the default;
- browser bundles must not contain real OpenAI, Anthropic, Gemini, local gateway, or other provider secrets;
- live provider calls should use explicit server-side transport;
- reports and screenshots must redact secret-looking values.

## Template Guidance

Use `MockProvider` for demos, screenshots, and tests. When enabling live providers, route requests through a trusted server endpoint that owns the API key and returns validated structured scene JSON.

## Verification

```sh
pnpm ai-scene:secret-audit
```

The report is written to `tests/reports/ai-scene/secret-audit.json`.
