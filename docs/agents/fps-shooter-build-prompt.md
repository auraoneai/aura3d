# FPS Shooter Build Prompt (DOOM-Inspired)

Copy everything below the horizontal rule into an AI coding agent to build a modern
DOOM-inspired browser FPS in Aura3D.

**Capability label:** `prototype` until all evidence gates pass.  
**Do not claim:** DOOM parity, commercial FPS engine quality, Unity/Unreal replacement,
or "better than DOOM" in README or marketing copy.

---

# Mission

Build **`neon-corridor-strike`**: a browser first-person shooter inspired by DOOM — dark
corridors, fast combat, ammo scarcity, enemy pressure, pointer-lock controls, and a
modern HUD. Target **60+ seconds** of meaningful play.

---

# Phase 0 — Read everything below BEFORE writing code

Read in this order. Do not skip tiers 1–3.

---

## Tier 0 — Non-markdown entry points (read first)

| File | Why |
| --- | --- |
| `llms.txt` | Canonical agent quick reference: API patterns, game loop, assets, anti-patterns, verification commands. **Read this before any `.md`.** |
| `.cursor/rules/aura3d.mdc` | Cursor rule file: same hard constraints in IDE context. |
| `AGENTS.md` | Repo-wide map: packages, templates, tests, evidence, where game APIs live. |

> **Do not use** frozen copies under `benchmark/context/aura3d/files/` — they are benchmark
> snapshots. Always use repo-root paths.

---

## Tier 1 — Mandatory agent docs (`docs/agents/`)

Read **every** file in this folder:

| File | Purpose |
| --- | --- |
| `docs/agents/README.md` | Agent manual index and golden path. |
| `docs/agents/claims-and-boundaries.md` | **Canonical** claim labels, proof requirements, anti-patterns. |
| `docs/agents/agent-quickstart.md` | Scaffold → assets → scene → build → deploy workflow. |
| `docs/agents/agent-context.md` | Active repo areas, scene-kit mapping, prompt workflow. |
| `docs/agents/codebase-map.md` | Where public API, agent-api, CLI, templates, and tests live. |
| `docs/agents/api-surface.md` | Allowed `@aura3d/engine` imports and root API boundary. |
| `docs/agents/no-hackjob-rules.md` | No CSS fake 3D, no loader hacks, no workaround slop. |
| `docs/agents/anti-hallucination-rules.md` | No invented URLs, asset IDs, or capabilities. |
| `docs/agents/asset-workflow.md` | `assets search` / `resolve` / `add` / `validate` / typegen. |
| `docs/agents/asset-selection.md` | Catalog search strategy and profiles. |
| `docs/agents/templates.md` | Which `create-aura3d` template to start from. |
| `docs/agents/build-playbook.md` | Build order, prompt plans, verification sequence. |
| `docs/agents/prompt-to-3d-workflow.md` | Prompt → typed assets → scene composition. |
| `docs/agents/game-example-standards.md` | **Required** public game bar: input, objective, reset, tests, screenshots. |
| `docs/agents/rendering-proof-required.md` | When pixel/browser proof is mandatory. |
| `docs/agents/verification.md` | Build, route-health, deploy, evidence commands. |
| `docs/agents/deployment.md` | Static deploy and `check-deploy`. |
| `docs/agents/troubleshooting.md` | Common failure modes and fixes. |
| `docs/agents/cinematic-scene-quality.md` | Moody lighting / atmosphere guidance (corridor horror tone). |
| `docs/agents/benchmark-recipes.md` | Scene-kit recipes (reference only; do not run dev/Playwright inside benchmark agent process). |

### Tier 1 — Optional agent docs (read if touching those areas)

| File | When |
| --- | --- |
| `docs/agents/game-showcase-build.md` | Referencing or extending `apps/aura-clash-showcase`. |
| `docs/agents/full-public-example-audit-prompt.md` | Final public/release audit pass. |

---

## Tier 2 — Game, API, and guide docs

| File | Purpose |
| --- | --- |
| `docs/guides/build-a-browser-game.md` | **Primary end-to-end game walkthrough.** Start here for FPS architecture. |
| `docs/api/readme.md` | API doc index. |
| `docs/api/public-api.md` | Full public export surface. |
| `docs/api/game-runtime.md` | **`game.*` reference:** input, kinematicBody, collisionWorld, combatWorld, fighting kit, effects, HUD, evidence. |
| `docs/api/app-api.md` | `createAuraApp`, frame loop, nodes, pause/resume/step. |
| `docs/api/assets.md` | Asset manifest and typed asset contract. |
| `docs/api/animation-runtime-events.md` | Clip events, hitbox windows, morph/viseme sync (if enemies animate). |
| `docs/api/character-assembly.md` | Multi-part character assembly (optional for varied enemies). |
| `docs/api/contracts/public-api-contract.md` | Public API contract boundaries. |

---

## Tier 3 — Concepts, controls, physics, templates

| File | Purpose |
| --- | --- |
| `docs/concepts/physics.md` | **`app.physics`:** raycast, sphereCast, layers, triggers, bullets — critical for shooters. |
| `docs/concepts/assets.md` | Asset model and provenance concepts. |
| `docs/concepts/engine-lifecycle.md` | App mount, dispose, frame loop lifecycle. |
| `docs/concepts/scene-vs-ecs.md` | Scene descriptor vs runtime mutation model. |
| `docs/concepts/animation.md` | Animation concepts (enemy death clips, etc.). |
| `docs/concepts/rendering.md` | Rendering capability labels (do not overclaim). |
| `docs/controls/interaction-and-picking.md` | **PointerLockControls, FirstPersonControls, FlyControls.** |
| `docs/physics/runtime.md` | Lower-level physics package (reference only; gameplay uses `app.physics`). |
| `docs/templates/create-aura3d-templates.md` | Template catalog and expectations. |

---

## Tier 4 — Project governance, limits, and showcase quality

| File | Purpose |
| --- | --- |
| `docs/project/documentation-index.md` | Master doc map. |
| `docs/project/claim-guidelines.md` | Public claim labels (`proven`, `partial`, `prototype`, etc.). |
| `docs/project/status/known-limits.md` | **What root `createAuraApp` does NOT prove** — read before claiming modern graphics. |
| `docs/project/status/current-state.md` | Current product state. |
| `docs/project/game-runtime-release.md` | Game-runtime release gates. |
| `docs/project/showcase/quality-gates.md` | Showcase quality requirements. |
| `docs/project/showcase/visual-quality-standard.md` | Visual QA bar for public routes. |
| `docs/project/showcase/apps-classification.md` | How showcase apps are classified. |
| `docs/project/getting-started.md` | General onboarding (secondary). |

---

## Tier 5 — Rendering docs (read before claiming "modern" visuals)

Only claim features these docs + browser tests prove:

| File | Topic |
| --- | --- |
| `docs/rendering/environment-lighting.md` | Environment / IBL boundaries. |
| `docs/rendering/lighting-environment-color.md` | Lighting presets and limits. |
| `docs/rendering/postprocess.md` | Postprocess — do not claim without route proof. |
| `docs/rendering/pbr-gltf-correctness.md` | PBR boundaries on root API. |
| `docs/rendering/controls-picking-xr-context.md` | Controls/picking evidence scope. |
| `docs/rendering/world-labels-and-text.md` | 3D labels (objective markers, etc.). |
| `docs/rendering/skinning-and-morphs.md` | Skinned enemies — evidence-bound. |
| `docs/rendering/renderer-lifecycle.md` | Renderer lifecycle (internal context). |

---

## Tier 6 — Examples and reference game docs

| File | Purpose |
| --- | --- |
| `docs/examples/fighting-game.md` | Fighting template / combat patterns. |
| `docs/examples/aura-clash.md` | Flagship fighting showcase reference. |
| `docs/examples/world-war-x-showcase.md` | Large showcase reference (if applicable). |
| `docs/examples/advanced-gallery.md` | Advanced route patterns (controls, stats HUD). |

---

## Tier 7 — Area `AGENTS.md` files (read for the folders you touch)

| File | When |
| --- | --- |
| `docs/AGENTS.md` | Editing any docs. |
| `packages/AGENTS.md` | Cross-package boundaries. |
| `packages/engine/AGENTS.md` | Engine / agent-api work. |
| `packages/create-aura3d/AGENTS.md` | Scaffold generator changes. |
| `packages/create-aura3d/templates/AGENTS.md` | Template source in `templates/`. |
| `packages/aura3d-cli/AGENTS.md` | CLI asset commands. |
| `packages/assets/AGENTS.md` | Asset pipeline internals. |
| `tests/AGENTS.md` | Writing tests. |
| `tests/browser/AGENTS.md` | Playwright browser tests. |
| `apps/AGENTS.md` | If placing route under `apps/` instead of scaffold. |
| `examples/AGENTS.md` | If placing under `examples/`. |
| `templates/AGENTS.md` | Top-level `templates/` mirror (keep aligned with package templates). |

---

## Tier 8 — Template READMEs (read your starter + nearest references)

Primary starter:

- `packages/create-aura3d/templates/mini-game/README.md`

Also read for patterns:

- `packages/create-aura3d/templates/fighting-game/README.md` — combat, hitboxes, stage, evidence
- `packages/create-aura3d/templates/character-controller/README.md` — locomotion / optional physics capsule
- `packages/create-aura3d/templates/cinematic-scene/README.md` — moody lighting / atmosphere
- `packages/create-aura3d/templates/racing-starter/README.md` — checkpoint/progression/reset patterns
- `packages/create-aura3d/templates/product-viewer/README.md` — camera framing reference

Secondary:

- `packages/create-aura3d/README.md`

---

# Phase 1 — Codebase files to READ (implementation reference)

## A. Shooter / physics foundation (required)

| Path | Why |
| --- | --- |
| `tests/clean-room/top-down-shooter/src/main.ts` | **Canonical custom-genre pattern.** No `game.shooter()` kit exists. Shows `createCollisionLayers`, `app.physics`, `game.input`, bullet layers, triggers, win/reset, evidence object. **Adapt this to first-person.** |
| `tests/clean-room/top-down-shooter/src/assets.ts` | Asset pattern in clean-room tests. |
| `docs/concepts/physics.md` | Raycast / sphereCast / layer docs tied to above. |

## B. Game runtime source (required)

| Path | Why |
| --- | --- |
| `packages/engine/src/agent-api/GameRuntime.ts` | `game.input`, `game.collisionWorld`, `game.combatWorld`, genre kits. |
| `packages/engine/src/agent-api/GameEvidence.ts` | `game.evidence(...)` shape. |
| `packages/engine/src/agent-api/PhysicsRuntime.ts` | Public `app.physics` API: bodies, queries, layers, joints. |
| `packages/engine/src/index.ts` | Authoritative public exports (verify imports here). |

## C. Starter template to copy structure from (required)

| Path | Why |
| --- | --- |
| `packages/create-aura3d/templates/mini-game/src/main.ts` | Starter game route structure. |
| `packages/create-aura3d/templates/mini-game/tests/route-health.spec.ts` | Route-health contract. |
| `packages/create-aura3d/templates/mini-game/tests/playable.spec.ts` | Playable input smoke pattern. |
| `packages/create-aura3d/templates/mini-game/tests/screenshot.spec.ts` | Screenshot gate pattern. |
| `packages/create-aura3d/templates/mini-game/playwright.config.ts` | Playwright setup. |

## D. Combat / FPS-adjacent references (strongly recommended)

| Path | Why |
| --- | --- |
| `packages/create-aura3d/templates/fighting-game/src/main.ts` | Combat loop, frame updates, evidence publishing. |
| `packages/create-aura3d/templates/fighting-game/src/game/moves.ts` | Hitbox / attack window patterns. |
| `packages/create-aura3d/templates/fighting-game/src/game/stage.ts` | Stage bounds / combat arena. |
| `packages/create-aura3d/templates/fighting-game/tests/gameplay-smoke.spec.ts` | Gameplay browser test pattern. |
| `packages/create-aura3d/templates/character-controller/src/main.ts` | First-person / locomotion reference. |

## E. Showcase references (optional, for polish ideas)

| Path | Why |
| --- | --- |
| `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts` | Full fighting showcase bootstrap. |
| `apps/aura-clash-showcase/src/game/` | Combat/state/rendering helpers. |
| `docs/agents/game-showcase-build.md` | Rules for editing aura-clash. |

## F. Controls / first-person (required for FPS camera)

| Path | Why |
| --- | --- |
| `packages/controls/src/PointerLockControls.ts` | Pointer-lock FPS camera. |
| `packages/controls/src/FirstPersonControls.ts` | First-person movement. |
| `docs/controls/interaction-and-picking.md` | Public controls boundary. |

## G. Test patterns in monorepo (required for your own tests)

| Path | Why |
| --- | --- |
| `tests/browser/game-runtime-mutability.spec.ts` | Runtime node mutation proof. |
| `tests/browser/game-runtime-visible-node-movement.spec.ts` | Visible movement evidence. |
| `tests/browser/fighting-game-runtime.spec.ts` | Fighting runtime browser proof. |
| `tests/browser/showcase-games-input-proof.spec.ts` | Showcase input proof pattern. |
| `tests/game-runtime/keyboard-operation-browser.spec.ts` | Keyboard operation browser test. |
| `tests/browser/current-routes-route-health.spec.ts` | Canonical route-health spec pattern. |

## H. CLI / asset tooling (required)

| Path | Why |
| --- | --- |
| `packages/aura3d-cli/src/index.ts` | CLI commands entry. |
| Generated after CLI use: `src/aura-assets.ts`, `aura.assets.json` | Typed asset manifest — never hand-invent IDs. |

## I. Other clean-room genre prototypes (optional inspiration)

| Path | Why |
| --- | --- |
| `tests/clean-room/platformer-prototype/src/main.ts` | Platformer on generic physics. |
| `tests/clean-room/racing-prototype/src/main.ts` | Progression/checkpoint pattern. |
| `tests/clean-room/physics-sandbox/src/main.ts` | Physics interaction sandbox. |

---

# Phase 2 — Hard rules (from all docs above)

1. **Public imports only:** `@aura3d/engine` — no `three`, no `GLTFLoader`, no hand-wired render loops.
2. **Typed assets only:** `model(assets.x)` from `./src/aura-assets.ts` — no string IDs, no invented URLs, no `unsafeModelUrl(...)` in public routes.
3. **No primitive heroes:** corridor, weapon, and enemies must be real GLB/glTF assets from CLI catalog or `assets add`.
4. **One app per route:** single `createAuraApp(...)`; mutate in `app.onFrame(...)`.
5. **DOM/CSS = UI only:** crosshair, HP, ammo, menus — not fake muzzle flashes or 3D effects.
6. **Simulation leads, render follows:** sync runtime nodes from physics bodies each frame.
7. **Label honestly:** `prototype` until browser tests + screenshots + route-health + asset validation pass.
8. **No `game.shooter()`:** build on `app.physics` + `game.input` + controls + optional `game.combatWorld` / `game.effects`.

---

# Phase 3 — Scaffold and assets

## Scaffold

```bash
npx create-aura3d@latest neon-corridor-strike --template mini-game
cd neon-corridor-strike
```

Replace platformer logic with FPS. **Keep and extend** the template's Playwright tests.

## Resolve assets BEFORE gameplay code

```bash
npx @aura3d/cli@latest assets search "dark sci-fi corridor interior industrial"
npx @aura3d/cli@latest assets resolve "dark sci-fi corridor interior industrial" --name arena

npx @aura3d/cli@latest assets search "horror demon creature game enemy" --json
npx @aura3d/cli@latest assets resolve "horror demon creature game enemy" --name impA
npx @aura3d/cli@latest assets resolve "horror demon creature game enemy" --name impB

npx @aura3d/cli@latest assets search "fps sci-fi gun weapon game ready"
npx @aura3d/cli@latest assets resolve "fps sci-fi gun weapon game ready" --name pulseRifle

npx @aura3d/cli@latest assets search "ammo crate game prop"
npx @aura3d/cli@latest assets resolve "ammo crate game prop" --name ammoCrate

npx @aura3d/cli@latest assets search "health pickup game prop"
npx @aura3d/cli@latest assets resolve "health pickup game prop" --name medkit

npx @aura3d/cli@latest assets validate
```

Use render-normalization helpers from `llms.txt`. Align **physics colliders to visible geometry**.

---

# Phase 4 — Game design requirements

## Core loop (60+ seconds meaningful play)

- Spawn in dark sci-fi corridor (`model(assets.arena)`).
- 4+ enemies from typed assets; patrol → aggro → chase → attack.
- Ammo + health pickups via sensor triggers.
- Win: clear all enemies **or** reach exit sensor. Lose: HP → 0. **Reset (R)** always works.

## Controls (must pass browser + automated tests)

| Input | Action |
| --- | --- |
| Click canvas | Pointer lock / start |
| WASD | Move |
| Mouse | Look |
| Space | Jump |
| Shift | Sprint |
| LMB / J | Fire |
| R | Reload |
| P / Esc | Pause |
| R (on death/win) | Reset run |

Use `game.input(...)` + `PointerLockControls` / `FirstPersonControls` from public controls surface.

## Combat (implement one primary mode and prove it)

**Preferred — hitscan:**

```ts
app.physics.queries.raycast(origin, direction, { maxDistance, ignore: [playerBodyId] });
// or sphereCast when projectile has width
```

**Alternate — physical bullets:**

- Follow `createCollisionLayers` pattern from `tests/clean-room/top-down-shooter`.
- Prove `bulletOnBulletContacts === 0`.

## Layers (required)

```ts
const layers = createCollisionLayers({
  player: ["wall", "pickup", "enemy"],
  bullet: ["enemy", "wall"],      // bullets never hit bullets
  enemy: ["bullet", "wall", "player"],
  wall: ["player", "bullet", "enemy"],
  pickup: ["player"]
});
```

## Modern feel (within safe claims)

- Moody directional + fill + emissive accent lighting.
- `game.effects(...)` for muzzle flash / impact sparks where supported.
- `game.cameraDirector(...)` for brief hit/recoil impulse.
- DOM HUD: crosshair, HP, ammo, enemy count, objective, low-ammo warning.
- `game.accessibility.reducedMotion(...)` disables camera shake.
- Do **not** claim bloom/SSAO/WebGPU/full PBR unless route screenshots prove them (`docs/project/status/known-limits.md`).

---

# Phase 5 — Target project structure

```text
neon-corridor-strike/
  src/
    main.ts                 # createAuraApp, pointer lock, frame loop
    aura-assets.ts          # CLI-generated
    game/
      input.ts              # actions + pointer-lock lifecycle
      player.ts             # move, sprint, jump, HP, reload
      weapons.ts            # hitscan or projectile firing
      enemies.ts            # spawn, AI, damage, death
      level.ts              # arena, colliders, pickups, exit
      hud.ts                # DOM HUD
      state.ts              # score, win/lose/reset
  tests/
    route-health.spec.ts    # extend template test
    gameplay-smoke.spec.ts  # NEW: move, shoot, kill, pickup, reset, win
    screenshot.spec.ts      # extend template test
  README.md                 # honest prototype label + controls
  KNOWN-LIMITS.md           # route-local gaps vs public API
```

Patterns:

- `.runtime(game.runtimeNode("id", { tags: [...] }))` on mutable actors.
- `physics.onCollision` / `onTriggerEnter` for hits and pickups.
- Publish `window.__AURA3D_FPS_EVIDENCE__` + `game.evidence(app, ...)`.

---

# Phase 6 — Evidence gates (required before "playable" claim)

## Project-local

```bash
npm run build
npm run test
npx @aura3d/cli@latest assets validate
npx @aura3d/cli@latest check-deploy --dist dist
```

## Playwright must prove

- [ ] Start / pointer lock engages
- [ ] WASD + mouse change player/camera state
- [ ] Fire reduces ammo and damages/kills ≥1 enemy
- [ ] Pickup increases ammo or HP
- [ ] Reset restores baseline after death or win
- [ ] Win condition reachable (use `game.inputReplay(...)` for deterministic paths if needed)

## Screenshots required

- First load
- Mid-combat
- After kill
- Win screen
- Death + reset

## Route-health JSON must include

- Renderer mode + fallback
- Exact primary typed asset keys
- Primitive count
- Claim label: `prototype`
- Known limits list

## Monorepo gates (if integrating into aura3d repo)

```bash
pnpm game-runtime:unit
pnpm game-runtime:browser
pnpm check:game-runtime
```

Reference test locations:

- `tests/browser/game-runtime-*.spec.ts`
- `tests/game-runtime/keyboard-operation-browser.spec.ts`
- `packages/create-aura3d/templates/fighting-game/tests/gameplay-smoke.spec.ts`

---

# Phase 7 — Explicit non-goals

Do not implement or claim unless separately proven:

- Multiplayer / netcode
- Full DOOM WAD/mod pipeline
- Nav mesh / advanced AI
- Gore shaders beyond supported effects
- WebGPU / full postprocess stack / commercial engine parity
- Three.js imports or CSS fake rendering

If a feature is missing from public APIs, document it in `KNOWN-LIMITS.md` as **route-local prototype** — do not hack around with forbidden imports.

---

# Phase 8 — Deliverables checklist

- [ ] Working FPS route in scaffold project
- [ ] All Tier 1–3 docs constraints satisfied
- [ ] Typed assets with provenance in `aura.assets.json`
- [ ] Physics layers proven (especially bullet-on-bullet = 0 if using projectiles)
- [ ] README with capability label `prototype`, controls, and honest limits
- [ ] Passing Playwright tests + screenshots
- [ ] `window.__AURA3D_FPS_EVIDENCE__` object for automation
- [ ] Short summary: what feels "modern DOOM-inspired" vs what remains prototype

---

# Execution order

1. Read Tier 0 → Tier 3 docs completely.
2. Read codebase files in Phase 1 sections A–G.
3. Scaffold project and resolve all assets.
4. Implement pointer lock + movement + camera first.
5. Add hitscan/projectiles + collision layers.
6. Add enemies, pickups, win/lose, reset.
7. Add HUD + effects + accessibility.
8. Write/extend tests and capture screenshots.
9. Run verification commands; only then tighten README claims.

Start now. Do not write gameplay code until assets are resolved and typed.

---

## Quick checklist: all `.md` files (repo root only)

**Agent docs (read all):**  
`docs/agents/README.md`, `claims-and-boundaries.md`, `agent-quickstart.md`, `agent-context.md`, `codebase-map.md`, `api-surface.md`, `no-hackjob-rules.md`, `anti-hallucination-rules.md`, `asset-workflow.md`, `asset-selection.md`, `templates.md`, `build-playbook.md`, `prompt-to-3d-workflow.md`, `game-example-standards.md`, `rendering-proof-required.md`, `verification.md`, `deployment.md`, `troubleshooting.md`, `cinematic-scene-quality.md`, `benchmark-recipes.md`  
(+ optional: `game-showcase-build.md`, `full-public-example-audit-prompt.md`)

**API & guides:**  
`docs/guides/build-a-browser-game.md`, `docs/api/readme.md`, `public-api.md`, `game-runtime.md`, `app-api.md`, `assets.md`, `animation-runtime-events.md`, `character-assembly.md`, `contracts/public-api-contract.md`

**Concepts & controls:**  
`docs/concepts/physics.md`, `assets.md`, `engine-lifecycle.md`, `scene-vs-ecs.md`, `animation.md`, `rendering.md`, `docs/controls/interaction-and-picking.md`, `docs/physics/runtime.md`, `docs/templates/create-aura3d-templates.md`

**Governance:**  
`docs/project/documentation-index.md`, `claim-guidelines.md`, `status/known-limits.md`, `status/current-state.md`, `game-runtime-release.md`, `showcase/quality-gates.md`, `showcase/visual-quality-standard.md`, `showcase/apps-classification.md`

**Rendering (before visual claims):**  
`docs/rendering/environment-lighting.md`, `lighting-environment-color.md`, `postprocess.md`, `pbr-gltf-correctness.md`, `controls-picking-xr-context.md`, `world-labels-and-text.md`, `skinning-and-morphs.md`, `renderer-lifecycle.md`

**Examples:**  
`docs/examples/fighting-game.md`, `aura-clash.md`, `world-war-x-showcase.md`, `advanced-gallery.md`

**AGENTS.md files:**  
Root `AGENTS.md`, plus `docs/`, `packages/`, `packages/engine/`, `packages/create-aura3d/`, `packages/create-aura3d/templates/`, `packages/aura3d-cli/`, `packages/assets/`, `tests/`, `tests/browser/`, `apps/`, `examples/`, `templates/`

**Template READMEs:**  
`mini-game`, `fighting-game`, `character-controller`, `cinematic-scene`, `racing-starter`, `product-viewer` under `packages/create-aura3d/templates/`
