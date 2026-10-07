# PRD-13 PR E evidence — T2.1, T2.2(a,c,d,e) + staged (b), T2.3–T2.6

Branch: `qr/prd13-skills-art-direction` (stacked on `qr/prd13-prompt-plan-v2` / PR #191).

## T2.1 — AUTHORING.md

Section order is now `Look target`, `Establish the contract`, `Procedure`,
`Look-dev loop`, `Stop and report`, `References` for core/scene/game/
materials/character/art-direction skills. Benchmark line replaced verbatim
("if `aura3d look capture` is available, run the look-dev loop; otherwise
build and stop and label the result `prototype`"). `threejs.org/examples`
listed as an allowed external link class.

## T2.2 — check.ts gates

- (a) `REQUIRED_SECTION_ORDER` enforced on `SECTION_ORDER_SKILLS`
  (`aura3d-art-direction` today; each T2.7–T2.11 rewrite adds its skill).
- (c) fenced-block rules: `lights.ambient(` without
  `environments.`/`looks.`/`world.biome` in the same block fails;
  `qualityProfile`, `pixelRatio:`, `safe-basic`, `softKnee`,
  `antiAlias({mode:"fxaa"})`, `replaceTextures: true`, `@aura3d/lean` fail.
- (d) `visualQA(` fails outside
  `aura3d-art-direction/references/failure-gallery.md`; two legacy exemptions
  (`aura3d-evidence-review/SKILL.md`, `aura3d-materials-environments/SKILL.md`)
  stand until their T2.10/T2.11 rewrites remove the mentions.
- (e) threejs.org/examples links already pass `checkLink` (all https allowed) —
  asserted via fixture + documented in AUTHORING.
- (b) §6.5 craft targets implemented as `checkCraftTargets` (skills combined
  ≥, game path ≥ 2×, art-direction ≥ 3×, llms.txt ≥) — gated off by
  `ENABLE_CRAFT_TARGETS` until the T2.7–T2.13 rewrite PR so the gate and the
  compliant corpus arrive together. Deviation from the task text noted: the
  corpus cannot pass before the rewrites exist.
- Row-density (≥80% rows with numbers/API names) for `look-recipes.md` and the
  12-category presence check for `quality-bar.md`.
- `aura3d look capture|judge|rubric|lint` + their flags admitted via
  `REGISTRY_COMMANDS`/`REGISTRY_FLAGS` — C-39 registry commands per §7.6 that
  land in T2.16–T2.18.
- Driver moved under a main-module guard so the rule helpers are importable.

Test: `tests/unit/tools/agent-skills-check.test.ts` — 22 fixtures, one
positive + one negative per rule.

## T2.3 — `aura3d-art-direction` SKILL.md

Verbatim frontmatter description; body ≤ 150 lines; sections in the T2.1
order; look brief → recipe row → `looks.preset` + `looks.appOptions` → camera
→ capture/judge loop → the 12-item hard checklist; prototype label when the
loop cannot run.

## T2.4 — references/look-recipes.md

13 genre rows at the specified density; platformer row per the task text
(outdoor-day, follow2d fov 50, 18–25% subject, key 48°/35°, fog 0.0025,
daylight-outdoor, coin sparkle + land dust, webgl_animation_skinning_blending).

## T2.5 — references/quality-bar.md

12 categories (AGENT_LOOK_CATEGORIES) with observable 2/5/7/9 anchors + the
hard lint-code checklist.

## T2.6 — references/reference-frames.md + failure-gallery.md

10 named three.js r185 examples with "what you should see" (complete without
images; C-30/refs-store stills slot in once on main). Failure gallery maps the
research/21 patterns (void → sky, flat → IBL, floating → shadow, primitive
soup → typed assets, debug HUD → DOM HUD, fake-effect primitives, renderer
overrides, capture branches) to their lint codes; it is the single legal home
of `visualQA(` mentions, marked diagnostic-only.

## manifest + mirrors

`aura3d-art-direction` added to `manifest.skills` (`tier: "core"`,
`prd: "C5"`) and `coreSet`; `pnpm skills:sync` regenerated all mirrors.

## Local verification

- `pnpm check:skills` — green (all gates incl. new ones + init smoke).
- `vitest tests/unit/tools/agent-skills-check.test.ts` — 22/22.
- `tsc -p tsconfig.build.json --noEmit` — clean; `eslint` on touched files — clean.

## NOT RUN

- Craft gate (b) over the live corpus — `ENABLE_CRAFT_TARGETS=false`; flips in
  the T2.7–T2.13 rewrite PR.
- `aura3d look *` commands — registered by T2.16–T2.18 (C-39), not yet shipped.
