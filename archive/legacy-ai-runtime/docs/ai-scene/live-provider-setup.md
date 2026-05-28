# Live Provider Setup

Aura3D cinematic routes run without API keys by default. Live model access is optional and must go through a server-side provider proxy. Browser code must not accept raw OpenAI, Anthropic, Gemini, or other provider API keys.

## Modes

| Mode | Configuration | Secret handling | Use |
|---|---|---|---|
| `fixture` | No configuration | No secrets | Public visual baseline and screenshots |
| `mock` | No configuration | No secrets | CI, local development, provider contract tests |
| `live` | Explicit server proxy URL and provider env | Secrets stored on server only | Optional provider evaluation |

The route should display the active mode as `fixture`, `mock`, `OpenAI`, `Anthropic`, `Gemini`, or `local`. Reports should use the same provider mode names so failures can be traced.

## Browser Configuration

Browser-side configuration may include only non-secret values:

```sh
VITE_AURA_PROVIDER_MODE=fixture
VITE_AURA_PROVIDER_MODE=mock
VITE_AURA_PROVIDER_MODE=live
VITE_AURA_SCENE_PROXY_URL=/api/scene
```

Do not put provider keys in `VITE_*` variables. Vite exposes those values to the browser bundle.

## Server Configuration

Server-side configuration owns provider secrets:

```sh
AURA_PROVIDER_MODE=fixture
AURA_PROVIDER_MODE=mock
AURA_PROVIDER_MODE=live

AURA_PROVIDER=openai
OPENAI_API_KEY=server-only-secret
OPENAI_MODEL=configured-on-server

AURA_PROVIDER=anthropic
ANTHROPIC_API_KEY=server-only-secret
ANTHROPIC_MODEL=configured-on-server

AURA_PROVIDER=gemini
GEMINI_API_KEY=server-only-secret
GEMINI_MODEL=configured-on-server

AURA_PROVIDER=local
LOCAL_MODEL_ENDPOINT=http://127.0.0.1:11434
```

For template projects, prefer a same-origin proxy endpoint such as `/api/scene`. Production deployments should add authentication, rate limits, request size limits, provider timeouts, audit logging, and secret redaction.

## Proxy Contract

The browser sends:

```json
{
  "prompt": "A rain-soaked neon alley with a robot protecting a glowing flower.",
  "mode": "live",
  "qualityTarget": "L3-cinematic-realtime"
}
```

The proxy returns validated scene data:

```json
{
  "schema": "aura-scene-ir/0.1",
  "providerMode": "openai",
  "qualityTarget": "L3-cinematic-realtime",
  "scene": {},
  "diagnostics": {
    "networkUsed": true,
    "secretsExposed": false,
    "fallbackUsed": false
  }
}
```

If the provider fails, the proxy should return a sanitized error and the browser should keep or restore the fixture scene. Error bodies must not include raw authorization headers, API keys, cookies, provider request payloads containing secrets, or full upstream stack traces.

## API Key Handling Rules

- Store provider keys only in server environment variables or a server-side secret manager.
- Never expose keys through `import.meta.env`, route metadata, diagnostics, reports, screenshots, exports, or client logs.
- Redact `Authorization`, `x-api-key`, cookies, bearer tokens, and provider-key-shaped strings from logs.
- Keep provider prompt/response logs opt-in, short-lived, and secret-scanned.
- Treat provider output as untrusted and validate it before compiling a scene.
- Fail closed if a live provider is selected without the required server secret.

## Local Development

Use fixture mode when checking visual quality:

```sh
pnpm dev
```

Use mock mode when checking contract stability:

```sh
VITE_AURA_PROVIDER_MODE=mock pnpm dev
```

Use live mode only with a server proxy:

```sh
AURA_PROVIDER_MODE=live AURA_PROVIDER=openai OPENAI_API_KEY=... pnpm proxy
VITE_AURA_PROVIDER_MODE=live VITE_AURA_SCENE_PROXY_URL=http://127.0.0.1:8787/api/scene pnpm dev
```

The browser app should still build and run without any of those live-provider variables.
