# Aura3D-only audit (2026-10-24)

Scope: the 11 Crayon ports, the 15 index games, their v2 siblings and the 14 retired showcase apps. Excluded on purpose: `apps/showcase-top-tennis`, `apps/showcase-top-tennis-v2`, `examples/aura-slam`, `apps/showcase-aura-slam` (owned by the Aura Slam lane). Kept on purpose: the `aura3d migrate three` codemod and migration docs, `apps/showcase-kits` (look-dev, not a game), `apps/threejs-parity-lab`, `apps/asset-lookdev/src/three-adapter.ts`, parity tests, tool-only devDependencies.

## Method

1. Source scan (`rg`) of every in-scope app and example for `from "three"`, `require("three")`, `THREE.`, `WebGLRenderer`, `BufferGeometry`, `MeshStandardMaterial`, `GLTFLoader`, `three/examples`, `three/addons`, and a `"three"` dependency.
2. Surface scan: every `@aura3d/game*` import (a private, unpublished package) in shipped source.
3. Production-build smoke on a remote runner (`tools/remote-acr/run.sh`, ACR run ids `threeaudit-*`, software WebGL2): `tests/browser/aura3d-only-smoke.spec.ts` builds each app with one Rollup input and the root vite aliases, serves the build, and records boot, canvas pixels, draw calls, console and page errors, failed requests, and three.js signatures in the built JS.

## Findings and removals

| Item | three markers found | Removed | Size |
|---|---|---|---|
| `apps/showcase-ninja-runner-port/public/fixtures/threejs-parity/assets/character/soldier.glb` | three.js example Soldier model, unreferenced by the port | deleted | 2,112 KB |
| In-scope game sources (all 11 ports, 15 index games, v2 siblings) | no three imports, no three dependency. Comment-only mentions (`examples/ninja-runner-port/shaders.ts`, `strange-orbit-port/shaders.ts`, `PORTING-NOTES.md`, `showcase-iron-crown/README.md`) and a forbidden-token list in `showcase-aurora-lander/scripts/write-route-health.mjs` | none needed | 0 |
| Vendored non-Aura engine code in scope | none | none | 0 |
| Private `@aura3d/game` imports (19 TS files in bunker-zero, bank-shot, blockfall-reactor, aurora-lander, vault-breakers, aura-clash-showcase) and two `"@aura3d/game": "workspace:*"` deps (bunker-zero, teleoperator-v2) | n/a (not three, but not the published surface) | rewritten to `@aura3d/engine/game` and `@aura3d/engine/game/art`, deps dropped | 0 |
| Per-app `gameAlias` blocks in 12 `apps/*/vite.config.ts` | n/a | removed, apps use the shared alias list | 0 |

Alias changes: root `vite.config.ts` and `marketing/scripts/build-showcase-routes.mjs` now map `@aura3d/engine/game`, `/game/art`, `/game/capture`, `/game/util` and `/game/styles.css` (explicit entries before the bare `@aura3d/engine` alias, because vite string aliases prefix-match).

Not touched (owned by the `slam-swap` lane): the legacy three-era bundles `renderer.bundle.js` (736 KB) and `renderer_custom.js` (184 KB) in the excluded Aura Slam apps, and root `public/toptennis-v2/`.

In the smoke, the built bundles contain no three.js package signature (`__THREE__`, `isWebGLRenderer`, `isBufferGeometry`, `isMeshStandardMaterial`). The single "strong" hit per bundle is Aura's own `Object3D.isObject3D` flag (`packages/scene/src/Object3D.ts`). The 30 "weak" hits per bundle are Aura strings: a GLSL comment ("three.js MeshStandardMaterial parity") and the glTF extension capability table that lists `"GLTFLoader"`, plus `ThreeCompatGLTFLoader`, a diagnostic stub in `@aura3d/assets`.

## Remote production-build smoke (retired and newly rewired apps)

Viewport 960x540 (480x270 retry noted), 12 s boot wait. "Non-black" is the fraction of pixels above luma 8. Draw calls come from the app's own evidence hook; `n/a` means the app exposes no counter.

| App | Built | Non-black | Draw calls | Console / page errors | Notes |
|---|---|---|---|---|---|
| showcase-bean-brawl-race | yes | 1.00 | 89 | 0 / 0 | |
| showcase-kart-havoc | yes | 0.995 | 707 | 0 / 0 | |
| showcase-turbo-ball | yes | 1.00 | 206 | 4 / 0 | four `navigator.vibrate` autoplay-policy warnings (no user gesture in the harness) |
| showcase-bank-shot | yes | 0.79 | 151 | 0 / 0 | |
| showcase-aurora-lander | yes | 0.73 | 46 | 0 / 0 | |
| showcase-blockfall-reactor | yes | 0.54 | 101 | 0 / 0 | |
| showcase-vault-breakers | yes | 0.22 | 116 | 0 / 0 | dark table, most pixels near black |
| showcase-product-configurator | yes | 0.99 | 33 | 0 / 0 | |
| showcase-smart-city-control | yes | 0.91 | 903 | 0 / 0 | |
| showcase-digital-twin-ops | yes | 0.91 | 835 | 0 / 0 | |
| showcase-cinematic-architecture | yes | 1.00 | 1244 | 0 / 0 | |
| showcase-data-galaxy | yes | 0.26 | 27 | 0 / 0 | sparse points on a dark field |
| showcase-webgpu-particle-lab | yes | 0.78 | 16 | 0 / 0 | WebGL2 path only in this harness |
| showcase-asset-audition | yes | 1.00 | 0 | 0 / 0 | DOM tool, no scene draw calls |
| showcase-material-asset-inspector | yes | 1.00 | 2 | 0 / 0 | tool UI, 127 distinct colors |
| aura-clash-showcase | yes | 0.00 | 0 | 0 / 0 | builds and boots, but the frame stays black (1 distinct color) at 960x540 and again at 480x270; the 4,100-line legacy arena app never draws on the published surface |
| showcase-bunker-zero (live route) | yes | 0.955 | n/a | 0 / 0 | no draw counter exposed (same as live 4.1.2) |
| showcase-ninja-runner-port (live route) | yes | 1.00 | 39 | 0 / 0 | after soldier.glb removal |

Every listed app built with the root alias set and no `@aura3d/game` or `three` resolution. The harness first failed on missing staging (root `src/aura-assets.ts`, `apps/common`, `apps/showcase-port-shared`, `assets/packs`, the referenced `public/aura-assets` files); those are now staged by `tools/remote-acr/run.sh` and `Dockerfile.playwright`.

Live games: not re-measured. `evidence/live-412/README.md` (production 4.1.2, same remote runner) already covers all 15 index games and 11 ports with 0 console errors, 0 page errors and 0 bad responses; the only source changes here to those apps are the `@aura3d/engine/game` import swaps (bunker-zero) and the Ninja fixture deletion, both covered by the table above.

## Retired and prototype-blocked app classification

Retirement was a visual-quality call (the owner judged the games Atari-era), not a build failure. The smoke only proves each app boots, draws and is free of three/private-package dependencies on the published surface, so no route was un-retired here: un-retiring changes the public site and needs a look-dev pass against the genre recipe and the per-route gates in `tools/showcase-library/route-gates.json`.

| App | Class | Evidence and next step |
|---|---|---|
| showcase-bean-brawl-race | revivable | boots, 89 draws; add route gates + index card, then art pass |
| showcase-kart-havoc | revivable | boots, 707 draws; same |
| showcase-turbo-ball | revivable | boots, 206 draws; same |
| showcase-bank-shot | revivable | boots, 151 draws; has gates; swapped to published game kit |
| showcase-aurora-lander | revivable | boots, 46 draws; has gates; swapped to published game kit |
| showcase-blockfall-reactor | revivable | boots, 101 draws; has gates; swapped to published game kit |
| showcase-vault-breakers | revivable, needs lighting pass | boots, 116 draws, only 22% non-black |
| showcase-product-configurator | revivable | boots, 33 draws; not a game, belongs in the apps gallery |
| showcase-smart-city-control | revivable | boots, 903 draws |
| showcase-digital-twin-ops | revivable | boots, 835 draws |
| showcase-cinematic-architecture | revivable | boots, 1244 draws |
| showcase-data-galaxy | needs real work | 27 draws, 26% non-black: sparse, needs a composed scene |
| showcase-webgpu-particle-lab | needs real work | 16 draws on the WebGL2 path; the WebGPU path is not exercised by the software runner |
| showcase-asset-audition | needs real work (tool) | no scene draws; keep as an internal look-dev tool, not a showcase |
| showcase-material-asset-inspector | needs real work (tool) | 2 draws; keep as an internal look-dev tool |
| aura-clash-showcase | needs real work | builds clean on the published surface but renders a black frame with 0 draw calls and no errors; the legacy arena app needs a render-path fix before any revival |
| meshy-relic-pilot | no action | no source under `apps/`; only referenced by `tests/browser/meshy-relic-pilot.spec.ts` and examples metadata |

Nothing was deleted from the retired set: none of it carries three.js or vendored foreign engine code, and removing a route needs the card, sitemap and gate entries edited together, which is a product decision rather than part of this audit.

## Reproduce

```
RUN_ID=threeaudit-x KEEP_IMAGE=0 EXTRA_DIRS="apps/showcase-port-shared apps/common apps/<app>" \
  PUBLIC_ASSETS="<hashed files from public/aura-assets>" \
  SPECS=tests/browser/aura3d-only-smoke.spec.ts tools/remote-acr/run.sh
```

List the apps to build, one per line, in `tests/browser/aura3d-only-apps.txt` (the spec falls back to all 18 in this document). Results print as `A3O_JSON` lines in the ACR run log. Never run it locally.
