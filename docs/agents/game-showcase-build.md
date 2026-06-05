# World War X game showcase build guide

World War X is the production game showcase for Aura3D: an original satirical 1v1 browser arena fighter built with `@aura3d/engine`.

Use this guide when editing, reviewing, or documenting `apps/world-war-x-showcase`.

## Non-negotiables

- Read `llms.txt` before authoring Aura3D code.
- Use public imports from `@aura3d/engine`.
- Mount one Aura app per route with `createAuraApp`.
- Use typed GLB members from `src/aura-assets.ts`; never pass string asset IDs to `model(...)`.
- Keep the roster at 10 V1 fighters unless the PRD changes.
- Keep public copy production-grade: original satirical 1v1 arena fighter, browser-native, built with `@aura3d/engine`.
- Do not use franchise comparisons or renderer-library comparison marketing in public copy.
- Keep arcade action non-lethal, stylized, and comedic.

## Current app shape

The app has a complete documentation and evidence contract around these systems:

- 10-fighter G7+India+Russia+China roster in `src/fighters/v1Roster.ts`.
- Typed asset keys in `src/fighters/FighterDefinition.ts`.
- Generated fighter GLB registration in `src/aura-assets.ts`.
- Generated GLB creation script in `scripts/generate-fighter-glbs.mjs`.
- Runtime app orchestration in `src/WorldWarXApp.ts`.
- Combat state, hitboxes, projectiles, movement, guard, meter, and result flow under `src/combat`, `src/physics`, and `src/state`.
- Evidence, accessibility, capture, and route-health contracts under `src/evidence`, `src/accessibility`, and `src/capture`.
- Playwright contracts under `tests`.

## V1 roster

| Fighter | Country inspiration | Leader snapshot | Asset member |
| --- | --- | --- | --- |
| The Dealbreaker | United States | Donald J. Trump | `assets.fighterDealbreaker` |
| The Central Banker | Canada | Mark Carney | `assets.fighterCentralBanker` |
| The Republic Duelist | France | Emmanuel Macron | `assets.fighterRepublicDuelist` |
| The Iron Ledger | Germany | Friedrich Merz | `assets.fighterIronLedger` |
| The Roman Signal | Italy | Giorgia Meloni | `assets.fighterRomanSignal` |
| The Rising Circuit | Japan | Sanae Takaichi | `assets.fighterRisingCircuit` |
| The Barrister | United Kingdom | Keir Starmer | `assets.fighterBarrister` |
| The Lotus Storm | India | Narendra Modi | `assets.fighterLotusStorm` |
| The Kremlin Shadow | Russia | Vladimir Putin | `assets.fighterKremlinShadow` |
| The Dragon Protocol | China | Xi Jinping | `assets.fighterDragonProtocol` |

Roster metadata uses the June 3, 2026 snapshot date. Copy must describe these as stylized fictionalized public-leader avatars with original move names, original visual motifs, and no official emblems.

## Typed GLB assets

The current app uses 10 generated GLB slots:

- `fighterDealbreaker`
- `fighterCentralBanker`
- `fighterRepublicDuelist`
- `fighterIronLedger`
- `fighterRomanSignal`
- `fighterRisingCircuit`
- `fighterBarrister`
- `fighterLotusStorm`
- `fighterKremlinShadow`
- `fighterDragonProtocol`

The app registers them through `defineAuraAssets` in `src/aura-assets.ts`. The generator script writes stylized fighter GLBs to `public/aura-assets/fighters` and the marketing public asset folder.

When adding or replacing model assets, use the Aura3D asset workflow:

```bash
npx @aura3d/cli@latest assets add ./assets/model.glb --name model
```

Then import generated typed assets and use `model(assets.name)`.

## Routes

`WORLD_WAR_X_ROUTES` in `src/evidence/route-health.ts` is the route source of truth.

| Route key | Path | Marker |
| --- | --- | --- |
| `landing` | `/` | `[data-wwx-route="landing"]` |
| `evidence` | `/evidence` | `[data-wwx-route="evidence"]` |
| `playable` | `/playable` | `[data-wwx-route="playable"]` |
| `summitRemix` | `/summit-remix` | `[data-wwx-route="summit-remix"]` |
| `poster` | `/poster` | `[data-wwx-route="poster"]` |
| `accessibility` | `/accessibility` | `[data-wwx-route="accessibility"]` |
| `deployCheck` | `/deploy-check` | `[data-wwx-route="deploy-check"]` |

Every route exposes route-specific evidence selectors. Keep selectors stable because tests and docs consume them directly.

## Evidence manifest

Use `createWorldWarXEvidenceManifest()` from `src/evidence/model.ts`.

The app exposes evidence in two places:

```ts
window.__WORLD_WAR_X_EVIDENCE__ = evidence;
```

```html
<script type="application/json" data-world-war-x-evidence>
  { "...": "serialized evidence manifest" }
</script>
```

The manifest schema is `wwx-evidence.v1` and includes:

- route definitions;
- required DOM evidence hooks;
- content safety checklist status;
- performance budgets;
- accessibility settings;
- poster scenarios;
- reviewer notes.

## Summit Remix

Summit Remix is the bounded prompt-remix feature for arena presentation. Keep copy focused on arcade arena changes and visible Aura3D systems.

Current presets:

- `currency-storm`: ticker boards, currency particles, market lighting, volatility hazards.
- `orbital-debate`: orbital glass floor, star parallax, low-gravity presentation, cyan bloom.
- `paperwork-blizzard`: paper particles, gavel sparks, smoke haze, stamp decals.

Do not imply open-ended LLM generation. The current implementation uses curated prompt presets and clear repair hints.

## Poster capture

`WORLD_WAR_X_POSTER_SCENARIOS` in `src/capture/poster-scenarios.ts` defines four deterministic capture scenarios:

- `key-art-command-map`
- `playable-frontline`
- `summit-remix-diplomacy`
- `accessibility-safe-frame`

Poster routes must set `[data-wwx-capture-ready]` only after the camera, lighting, overlays, and route-specific acceptance criteria are stable.

## Tests

Playwright contracts:

- `route-health.spec.ts`
- `screenshot.spec.ts`
- `playable-smoke.spec.ts`
- `summit-remix.spec.ts`
- `deploy-check.spec.ts`

Environment variables:

```bash
WORLD_WAR_X_BASE_URL=http://127.0.0.1:5173
WORLD_WAR_X_ROUTE_PREFIX=
```

Do not run Playwright, builds, or deploy checks from an agent process unless explicitly asked. These tests are the route contract for implementation and review.

## Marketing integration

The marketing homepage uses a poster-first World War X section and links to `/apps/world-war-x-showcase/`. Sitemap and robots entries include the live app route and the docs copy target.

Keep marketing copy aligned to:

> World War X is an original satirical 1v1 arena fighter, browser-native, built with `@aura3d/engine`.

Header GitHub and npm links remain prominent on the marketing site.

## Content safety and copy

World War X is satire, not a political simulator.

Use:

- stylized fictionalized public-leader avatars;
- original fighter codenames;
- public-persona archetype humor;
- non-lethal arcade effects;
- confetti, paperwork, shields, debate waves, currency bursts, and comic knockback;
- explicit no-endorsement copy.

Avoid:

- official emblems, seals, or party logos;
- private-life claims;
- protected-trait jokes;
- real-world casualty, assassination, or war-crime framing;
- realistic weapons as primary specials;
- copied franchise names, moves, UI patterns, or audio.
