# APPS KNOWLEDGE BASE

**Scope:** `apps/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 16 - distinct public route surface, many generated assets/evidence.

## OVERVIEW

Showcase and demo apps are public route surfaces. Treat their code, copy,
assets, route-health files, and screenshots as release-facing unless the route
is explicitly marked prototype.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Showcase library/index | `showcase-index/`, `showcase-*` | Current public demo family. |
| Flagship game/showcase | `aura-clash-showcase/`, `world-war-x-showcase/` | Extra scripts, evidence, tests, and local asset manifests. |
| Studio app | `animation-studio-web/` | App shell for animation-studio workflow. |
| App assets | `*/aura.assets.json`, `*/public/aura-assets/` | CLI-generated; use typed refs from app source. |
| Route proof | `*/route-health.json`, `*/launch-evidence*.json` | Generated evidence, not hand-authored source. |

## CONVENTIONS

- Public app routes import from `@aura3d/engine` safe APIs unless the route is
  explicitly an internal/runtime diagnostic.
- Create one Aura app per route. Keep runtime mutation in `app.onFrame(...)`
  or public runtime handles; do not instantiate Aura apps in loops.
- App-level UI may be DOM, but visible 3D claims must come from rendered Aura3D
  pixels and runtime telemetry.
- Use app-local `src/aura-assets.ts` or root generated assets when present.
  Keep `aura.assets.json` and copied GLB/thumb files synchronized through the
  CLI, not manual path edits.
- For showcase copy, preserve the capability label and evidence level from the
  route-health or launch evidence file.

## ANTI-PATTERNS

- Do not turn route-health JSON into the source of behavior; update the route
  and rerun the evidence command instead.
- Do not use primitives as the main subject of a named product/game/world app.
- Do not add CSS particles, fake canvas effects, or DOM overlays as proof of a
  renderer feature.
- Do not cite app-local production/runtime behavior as root `createAuraApp`
  support unless a root-only browser test proves the same path.

## VERIFY

Run the narrow app or route test when one exists. For public route changes,
prefer `pnpm test:browser`, `pnpm advanced-gallery`, or the app-local gate
script over a compile-only check.
