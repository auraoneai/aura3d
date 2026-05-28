# Cinematic Previs Build Playbook

Use this playbook when implementing cinematic previs cinematic prompt-to-scene docs, routes, templates, or tooling.

## Scope

cinematic previs proves cinematic realtime previs:

- asset-backed browser scene;
- explicit fixture, mock, and live provider modes;
- server-side provider proxy for secrets;
- cinematic camera, lighting, materials, VFX, and timeline;
- diagnostics, asset provenance, screenshots, and export bundle;
- quality gates that reject placeholder-only results.

It does not prove final-film rendering.

## Build Order

1. Start with fixture mode.
2. Add deterministic mock provider behavior.
3. Add server-proxy contract for optional live providers.
4. Add or update the cinematic asset manifest.
5. Render real scene content through the runtime backend.
6. Add diagnostics and export bundle support.
7. Add quality gates and evidence reports.
8. Run verification before updating claims.

Fixture mode should be visually strong before live providers are considered complete. Live providers must match the structured contract and should not be used to hide missing runtime or asset work.

## Provider Rules

- Browser builds may include proxy URLs and provider mode labels, not API keys.
- Live provider keys stay in server environment variables or a secret manager.
- Mock and fixture modes must run without network access.
- Provider failures fall back visibly and do not blank the route.
- Reports and exports must distinguish fixture, mock, and live modes.

## Asset Rules

- Maintain `asset-manifest.json` for templates and route fixtures.
- Prefer hero-quality assets for hero roles.
- Track procedural assets as provenance, not invisible implementation detail.
- Emit explicit placeholder diagnostics.
- Keep public cinematic previs fixture hero placeholders at zero.

## Quality Rules

Before making a public cinematic previs claim, prove:

- route renders through WebGL2 or WebGPU for the public cinematic target;
- screenshot gate passes;
- asset readiness gate passes;
- secret audit passes;
- claim scan passes;
- export bundle includes IR, diagnostics, screenshots, and asset provenance;
- provider mode evidence is present.

Do not update marketing or release claims from architecture-proof routes.

## Template Rules

Templates must:

- build in a clean project;
- run without API keys;
- default to fixture or mock mode;
- document server-side proxy setup for live providers;
- include `asset-manifest.json`;
- include a local `pnpm quality` script;
- avoid final-film wording.

If CLI registration is outside the worker's write scope, create the template folders and document the registration gap instead of editing another worker's owned file.
