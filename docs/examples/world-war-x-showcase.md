# World War X showcase

World War X is Aura3D's flagship game showcase: an original satirical 1v1 browser arena fighter built with `@aura3d/engine`.

Open the live game: `/apps/world-war-x-showcase/`

## Website copy target

World War X turns the Aura3D SDK into a playable product surface. The route combines a 10-fighter satirical roster, generated GLB fighter assets, typed asset references, arena primitives, arcade knockback physics, Article X supers, Summit Remix prompt controls, evidence dashboards, poster capture routes, and Playwright contracts in one browser-native app.

Use this line in marketing copy:

> Pick a world leader. Enter the summit arena. Throw diplomacy out the window.

Use this line for developer copy:

> A full browser fighter built with Aura3D: typed assets, primitives, particles, physics, prompt-generated arenas, UI, diagnostics, screenshots, and deploy-ready TypeScript.

## Current roster

The V1 roster is the G7 plus India, Russia, and China. Fighter metadata uses a June 3, 2026 leader snapshot and stylized fictionalized public-leader avatars.

| Slot | Fighter | Country inspiration | Leader snapshot | Typed asset member |
| --- | --- | --- | --- | --- |
| 1 | The Dealbreaker | United States | Donald J. Trump | `assets.fighterDealbreaker` |
| 2 | The Central Banker | Canada | Mark Carney | `assets.fighterCentralBanker` |
| 3 | The Republic Duelist | France | Emmanuel Macron | `assets.fighterRepublicDuelist` |
| 4 | The Iron Ledger | Germany | Friedrich Merz | `assets.fighterIronLedger` |
| 5 | The Roman Signal | Italy | Giorgia Meloni | `assets.fighterRomanSignal` |
| 6 | The Rising Circuit | Japan | Sanae Takaichi | `assets.fighterRisingCircuit` |
| 7 | The Barrister | United Kingdom | Keir Starmer | `assets.fighterBarrister` |
| 8 | The Lotus Storm | India | Narendra Modi | `assets.fighterLotusStorm` |
| 9 | The Kremlin Shadow | Russia | Vladimir Putin | `assets.fighterKremlinShadow` |
| 10 | The Dragon Protocol | China | Xi Jinping | `assets.fighterDragonProtocol` |

## Typed GLB asset workflow

The showcase uses 10 generated fighter GLB assets. `apps/world-war-x-showcase/scripts/generate-fighter-glbs.mjs` creates stylized arcade fighter rigs and writes them to the app and marketing asset folders. `apps/world-war-x-showcase/src/aura-assets.ts` registers those files with `defineAuraAssets`.

Runtime code uses typed members only. The app resolves the generated asset objects and passes them into `model(...)`; it does not use string asset IDs in the safe runtime path.

Asset keys:

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

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing route with playable, evidence, and capture links. |
| `/evidence` | Human-readable evidence dashboard for routes, budgets, content safety, and SDK proof. |
| `/playable` | Interactive smoke route with HUD, controls, arcade movement, AI pressure, and match state. |
| `/summit-remix` | Prompt remix route with bounded arena remix controls. |
| `/poster` | Deterministic poster capture route. |
| `/accessibility` | Reduced motion, contrast, captions, keyboard, and camera-comfort settings route. |
| `/deploy-check` | Machine-readable deploy evidence route. |

Each route exposes a `data-wwx-route` marker. The deploy route mirrors the evidence manifest through `window.__WORLD_WAR_X_EVIDENCE__` and `script[type="application/json"][data-world-war-x-evidence]`.

## Summit Remix

Summit Remix is the prompt-to-scene proof for the game route. Current remix presets:

- `Currency Storm`: volatile tickers, currency particles, market lighting, and readable guard flashes.
- `Orbital Debate`: orbital glass floor, star parallax, low-gravity camera language, and cyan bloom.
- `Paperwork Blizzard`: paper particles, gavel sparks, smoke haze, and stamp decals.

The remix copy is bounded to arcade satire, fictional arena changes, visual tone, hazards, and accessibility-safe presentation changes.

## Evidence and tests

The showcase exports a `wwx-evidence.v1` manifest covering route health, required DOM evidence, content safety, performance budgets, accessibility settings, and poster scenarios.

Playwright contracts live in `apps/world-war-x-showcase/tests`:

- `route-health.spec.ts`
- `screenshot.spec.ts`
- `playable-smoke.spec.ts`
- `summit-remix.spec.ts`
- `deploy-check.spec.ts`

The tests cover route readiness, deterministic poster captures, playable HUD/input smoke behavior, bounded Summit Remix controls, and deploy evidence shape.

## Marketing integration

The marketing homepage features World War X as a poster-first section with a primary `Play World War X` action to `/apps/world-war-x-showcase/`. The sitemap includes the live game URL and this docs copy target. `robots.txt` allows the game route and the docs route.

Homepage copy should stay direct:

> World War X is an original satirical 1v1 arena fighter, browser-native, built with `@aura3d/engine`.

## Aura3D proof points

- `createAuraApp` mounts one browser-native Aura app per route.
- `model(typedAsset)` renders generated GLB fighter assets.
- `primitives`, `material`, `lights`, and `effects` build the arenas, fight floor, stage screens, lane markers, projectiles, glows, and Article X presentation.
- The combat layer tracks movement, hitboxes, projectiles, knockback, meter, combos, guard state, and round results.
- Evidence routes expose route health, performance budgets, content safety, accessibility defaults, and poster capture readiness.
- The app is normal TypeScript built around the public `@aura3d/engine` API.
