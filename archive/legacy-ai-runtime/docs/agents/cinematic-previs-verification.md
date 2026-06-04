# Cinematic Previs Verification

Use this checklist to verify cinematic previs cinematic previs work. Record exact commands and reports in the final handoff.

## Documentation

- cinematic previs is described as cinematic realtime previs.
- runtime scene routes are described as architecture proofs.
- Fixture, mock, and live provider modes are explained.
- Live provider setup uses a server-side proxy.
- Browser API key handling is explicitly forbidden.
- Asset-backed routes and asset manifests are documented.
- Quality gates are documented.
- Export bundle contents are documented.
- Final-film and studio-final claims are blocked.

## Templates

Run from each template root:

```sh
pnpm install
pnpm quality
pnpm build
```

For workspace verification without installing each generated project, at minimum run:

```sh
node scripts/quality-gate.mjs
pnpm exec vite build
```

Expected template evidence:

- no API keys required;
- `asset-manifest.json` exists;
- `pnpm quality` writes a JSON quality report;
- browser source does not read provider keys;
- provider modes include fixture or mock plus server proxy path;
- export action or export endpoint exists;
- build output succeeds.

## Runtime Route

For a public cinematic previs route, verify:

- provider mode is visible in UI and diagnostics;
- fixture mode renders the north-star asset-backed scene;
- mock mode is deterministic and no-network;
- live mode requires explicit server proxy configuration;
- provider failure falls back without blanking the scene;
- WebGL2 or WebGPU is the claimed public backend;
- screenshots show renderer-owned cinematic content.

## Quality Reports

Reports should include:

- `schema`;
- `generatedAt`;
- `pass`;
- `providerMode`;
- `backend`;
- `inputs`;
- `evidence`;
- `failures`.

Reports must not include secrets. Inspect generated JSON before using it as release evidence.

## Claim Review

Allowed:

- cinematic realtime previs;
- asset-backed realtime scene;
- browser-run inspectable scene;
- exported diagnostics and asset provenance.

- final film;
- Pixar-quality;
- studio-final;
- offline-rendered;
- production animation replacement.
