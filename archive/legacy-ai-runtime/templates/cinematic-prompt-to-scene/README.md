# Aura3D Cinematic Prompt To Scene

This starter turns a cinematic prompt into an inspectable realtime previs scene. It defaults to a fixture-backed scene and runs without API keys, provider accounts, or network access.

## Run

```sh
pnpm install
pnpm quality
pnpm build
pnpm dev
```

Open the local Vite URL printed by the dev server.

## Modes

| Mode | Requires API key | Requires network | Purpose |
|---|---:|---:|---|
| `fixture` | No | No | Curated cinematic baseline for screenshots and demos |
| `mock` | No | No | Deterministic no-network provider behavior |
| `proxy` | No browser key | Yes, server only | Optional server-side live provider proxy |

The browser template never reads provider API keys. If you connect a live provider, point `VITE_AURA_SCENE_PROXY_URL` at a trusted server endpoint that owns the key and returns validated scene JSON.

## Asset Manifest

`asset-manifest.json` lists the procedural starter assets used by the fixture:

- wet neon alley environment;
- guardian robot character;
- glowing flower hero prop;
- rain and haze VFX;
- wet asphalt material;
- blue rim and warm practical light rig.

Procedural assets are still tracked as provenance so exports and quality gates can explain what was rendered.

## Quality Gate

Run:

```sh
pnpm quality
```

The script writes `reports/cinematic-template-quality.json` and checks:

- manifest schema and required cinematic roles;
- fixture, mock, and proxy mode coverage;
- export bundle support;
- no browser-side provider secret variables;
- no obvious provider-key-shaped strings.

This local gate is a template smoke check. Full cinematic previs release evidence also needs route screenshots, runtime readiness, asset readiness, secret audit, claim scan, and completion reports.

## Export

The Export button downloads a JSON bundle with scene IR, asset provenance, quality metadata, provider mode, backend, and the no-final-film boundary.

## Claim Boundary

This template demonstrates cinematic realtime previs. It does not claim final-film quality, studio-final VFX, offline rendering, or production-ready live provider output.
