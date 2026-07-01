# PACKAGE TEMPLATE KNOWLEDGE BASE

**Scope:** `packages/create-aura3d/templates/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 18 - many public scaffold variants with distinct tests.

## OVERVIEW

These directories are copied into new user projects. Write them as complete,
honest starter apps, not as internal demos.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Core starters | `product-viewer/`, `cinematic-scene/` | Public safe API examples. |
| Game starters | `mini-game/`, `racing-starter/`, `falling-blocks-starter/`, `fighting-game/` | Must prove input, reset, objective, and progression/scoring/fail. |
| Animation starters | `animation-channel/`, `prompt-animation-channel/`, `episode-builder/`, `animation-studio/` | Timeline/storyboard/route-health evidence. |
| Migration templates | `three-compat-*` | Label as compat/migration, not root-safe proof. |
| Tests | `*/tests/*.spec.ts` | Template contract lives with the template. |

## CONVENTIONS

- Template `src/main.ts` should be the first thing a generated user sees.
  Prefer clear public APIs and typed assets over helper magic.
- Use template-local `src/aura-assets.ts` and `aura.assets.json` when a
  primary model is needed.
- `animation-studio/AGENTS.md` is deeper and more specific; follow it inside
  that folder.
- Game templates need playable browser tests, not only route-health.
- `three-compat-*` templates may describe migration compatibility, but must
  not claim root `createAuraApp` parity.

## ANTI-PATTERNS

- No direct `three`, `GLTFLoader`, raw URLs, string model IDs, or hand-wired
  renderer loops in safe starter templates.
- No generic placeholder primitives as the hero subject for named starters.
- No README claims beyond what route-health, screenshot, playable, or
  storyboard tests prove.
- No generated `dist` or `test-results` committed as template source.

## VERIFY

Run the template's own `tests/` suite and the root template smoke command before
calling a scaffold public.
