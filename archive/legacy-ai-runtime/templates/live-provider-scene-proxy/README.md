# Aura3D Live Provider Scene Proxy

This starter shows the cinematic previs live-provider boundary: the browser calls a server proxy, and provider secrets stay on the server. It still runs without API keys because the proxy defaults to fixture or mock behavior and the browser has a no-key fallback.

## Run Without API Keys

```sh
pnpm install
pnpm quality
pnpm build
pnpm proxy
pnpm dev
```

The proxy listens on `http://127.0.0.1:8787`. In another terminal, start Vite and open the printed URL.

## Modes

| Mode | Command | Network | API key |
|---|---|---:|---:|
| `fixture` | `AURA_PROVIDER_MODE=fixture pnpm proxy` | No | No |
| `mock` | `AURA_PROVIDER_MODE=mock pnpm proxy` | No | No |
| `live` | `AURA_PROVIDER_MODE=live AURA_PROVIDER=local LOCAL_MODEL_ENDPOINT=http://127.0.0.1:11434 pnpm proxy` | Server only | Server only if needed |

For hosted model providers, set server-only variables such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` in the proxy environment. Do not put those values in `VITE_*` variables.

## Generic Live Provider Endpoint

The template includes a generic upstream hook:

```sh
AURA_PROVIDER_MODE=live \
AURA_PROVIDER=openai \
OPENAI_API_KEY=... \
AURA_PROVIDER_ENDPOINT=https://your-server-owned-provider-adapter.example/api/scene \
pnpm proxy
```

`AURA_PROVIDER_ENDPOINT` is called from `server/provider-proxy.mjs`, never from browser code. The upstream endpoint should return validated `AuraSceneIR` JSON. If it is absent or fails, the proxy returns the fixture scene with a sanitized fallback warning.

## Asset Manifest

`asset-manifest.json` includes procedural rooftop, beacon, rain haze, city depth, material, and light-rig assets. The manifest exists so quality gates and export bundles can prove the starter is asset-backed even when no provider is configured.

## Quality Gate

Run:

```sh
pnpm quality
```

The script writes `reports/cinematic-template-quality.json` and checks the manifest, server proxy script, fixture/mock/live modes, package scripts, client proxy usage, and obvious secret leaks.

## Aura3D advantage

This template demonstrates server-side provider key handling for cinematic realtime previs. It does not claim final-film quality, studio-final VFX, or that any specific provider produces production-ready scenes.
