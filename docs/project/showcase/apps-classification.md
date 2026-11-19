# Aura3D Showcase Apps Classification

Date: 2026-08-11
Status: current classification policy

App classification controls what public copy may say. A route can be useful and
still not be a public release candidate.

## Classification Labels

| Label | Meaning |
| --- | --- |
| `starter example` | Teaches one public root API pattern with minimal claims. |
| `library demo` | Demonstrates a package/API surface; visual quality claims stay scoped. |
| `diagnostic` | Helps inspect assets, rendering, telemetry, or evidence. |
| `prototype` | Explores an idea; not public release material. |
| `release-ready candidate` | Legacy gate candidate; the label alone does not establish current public availability, fresh evidence, or visual approval. |
| `internal diagnostic` | Useful retained evidence route; not public showcase material. |
| `playable-showcase` | Useful prototype route with exact blockers; not public showcase material. |
| `index route` | Showcase catalog/index route; not a deployable 3D showcase app. |
| `blocked` | Must not be promoted until named blockers close. |
| `development showcase` | Playable route that may be live on the site, with no release-ready gate evidence; a documented example, not a release, approval or launch claim. |

## Starter Registry

The starter example routes (`hello-world-typed-asset`, `material-lighting`, `camera-path`,
`instancing-performance`) and their diagnostic siblings were removed in the 30-game prune; the
`create-aura3d` templates are the starter surface. The look-dev capture tool behind
`aura3d assets lookdev` stays:

| Route | Classification | Public use |
| --- | --- | --- |
| `/apps/asset-lookdev/` | internal diagnostic | Look-dev comparison tool: needs `?glb=`, carries a three.js reference adapter (`src/three-adapter.ts`) and imports workspace package source; not a standalone Aura3D example. |

## Showcase Slate

| Route directory | Classification | Public use |
| --- | --- | --- |
| `showcase-blockfall-reactor` | prototype | Removed in 5.6.0: falling-block app source deleted. The retained historical gate keeps it `prototype-blocked` and non-public; marketing redirects its URL. |
| `showcase-racing-game-layer-proof` | game-layer diagnostic | Retained geometry-contract/debug harness; not public showcase material. |
| `showcase-platformer-game-layer-proof` | game-layer diagnostic | Retained geometry-contract/debug harness; not public showcase material. |
| `showcase-skyline-runner` | prototype | Retired in 4.0.1: app source and route health are absent, and the marketing build redirects its URL to the showcase index. The retained `prototype-blocked` gate and platformer evidence are historical, not a current playable-route or approval claim. |
| `showcase-turbo-drift-circuit` | prototype | Retired in 4.0.1: app source and route health are absent, and the marketing build redirects its URL to the showcase index. The retained `prototype-blocked` gate and arcade-racing evidence are historical, not a current playable-route or approval claim. |
| `showcase-bank-shot` | prototype | Removed in 5.6.0: billiards app source deleted. Historical `prototype-blocked` gate, non-public; marketing redirects its URL. |
| `showcase-deep-recovery` | prototype | Retired source and route health are absent; marketing redirects the URL. The blocked gate and submarine-salvage evidence are historical. |
| `showcase-gallery-shift` | prototype | Retired source and route health are absent; marketing redirects the URL. The blocked gate and stealth-heist evidence are historical. |
| `showcase-gravity-post` | prototype | Retired source and route health are absent; marketing redirects the URL. The blocked gate and delivery evidence are historical. |
| `showcase-neon-swarm` | prototype | Retired source and route health are absent; marketing redirects the URL. The blocked gate and survival evidence are historical. |
| `showcase-patrol-wing` | prototype | Retired source and route health are absent; marketing redirects the URL. The blocked gate and flight-patrol evidence are historical. |
| `showcase-rooftop-buckets` | prototype | Retired source and route health are absent; marketing redirects the URL. The blocked gate and basketball evidence are historical. |
| `showcase-siege-golf` | prototype | Retired source and route health are absent; marketing redirects the URL. The blocked gate and golf evidence are historical. |
| `showcase-vault-breakers` | prototype | Removed in 5.6.0: pinball app source deleted. Historical `prototype-blocked` gate, non-public; marketing redirects its URL. |
| `showcase-courier-rush` | prototype | Retired source and route health are absent; marketing redirects the URL. The blocked gate and courier evidence are historical. |
| `showcase-aurora-lander` | prototype | Removed in 5.6.0: precision-landing app source deleted. Historical `prototype-blocked` gate, non-public; marketing redirects its URL. |
| `showcase-pulse-tunnel` | prototype | Retired source and route health are absent; marketing redirects the URL. The blocked gate and rhythm evidence are historical. |
| `showcase-mech-hangar` | prototype | Retired source and route health are absent; marketing redirects the URL. The blocked gate and mech evidence are historical. |
| `showcase-meshy-relic-pilot` | prototype | Meshy CLI asset-pipeline prototype with a typed relic collection loop; private-generation rights and collision claims remain unproven, so it is not public showcase material. |
| `aura-clash-showcase` | development showcase | Removed in 5.6.0: arena-fighter app source and its launch evidence deleted; marketing redirects its URL and `/showcase/aura-clash` to the showcase index. |
| `showcase-index` | index route | Catalog/index route only; not deploy-asset or route-primary checked as a 3D app. |

The retained `docs/project/showcase-launch-evidence.json` carries a 2026-09-08
generation timestamp, predating these retirements, but was later edited in commit
`fea96ea0f` without a new timestamp. Its declared gate hash differs from the
gate-config fingerprint embedded in its route-primary freshness dependencies.
These historical records do not establish a current route inventory, a verified
current gate binding, or approval; a fresh run is required.

## Published Games Without Release Gates

Decision 2026-11-03 (agent, owner-delegated, 5.0 unit-gate pass). The conservative classifier
(`tools/route-tiers`, commit `bd5119ec6`) refuses to classify a marketing-published app unless it
has a `release-ready candidate` gate in `tools/showcase-library/route-gates.json` or an explicit
`release-ready candidate` label here. The 25 live games below have neither. Evidence checked per
route: `route-gates.json` (no entry for any of the 25), `tools/site/games.catalog.json` and
`docs/workflows/game-inventory.json` (all 25 present, `status: live`), and this document (no prior
row). Catalog membership is not release evidence, so none is promoted to `release-ready candidate`.
Each is labelled `development showcase` (Tier 3): playable and public, but with no release gate,
visual approval or launch claim. Promotion requires a fresh `release-ready candidate` gate entry
with current evidence.

Addendum 2026-11-07 (5.2.0 site, 30 live games). The five original games added by the
Splat Siblings and Beat Hopper work (`showcase-shape-shift-sprint`, `showcase-number-surge`,
`showcase-splat-turf`, `showcase-polarity-orbs`, `showcase-beat-hopper`) were checked the same way:
no `route-gates.json` entry, present in `tools/site/games.catalog.json` and
`docs/workflows/game-inventory.json` with `status: live` and `verification: playable`, and not
redirected by `marketing/public/_redirects`. They take the same `development showcase` label.

| Route directory | Classification | Evidence |
| --- | --- | --- |
| `showcase-top-tennis` | development showcase | Live in the games catalog and the marketing build; no `route-gates.json` entry. Not release-ready. |
| `showcase-roadster-rush` | development showcase | Live in the games catalog and the marketing build; no `route-gates.json` entry. Not release-ready. |
| `showcase-heatsink` | development showcase | Live in the games catalog and the marketing build; no `route-gates.json` entry. Not release-ready. |
| `showcase-teleoperator` | development showcase | Live in the games catalog and the marketing build; no `route-gates.json` entry. Not release-ready. |
| `showcase-iron-crown` | development showcase | Live in the games catalog and the marketing build; no `route-gates.json` entry. Not release-ready. |
| `showcase-pips-big-leap` | development showcase | Live in the games catalog and the marketing build; no `route-gates.json` entry. Not release-ready. |
| `showcase-aura-hoops-3d` | development showcase | Live in the games catalog and the marketing build; no `route-gates.json` entry. Not release-ready. |
| `showcase-aura-diamond-3d` | development showcase | Live in the games catalog and the marketing build; no `route-gates.json` entry. Not release-ready. |
| `showcase-aura-fc-3d` | development showcase | Live in the games catalog and the marketing build; no `route-gates.json` entry. Not release-ready. |
| `showcase-aura-links-3d` | development showcase | Live in the games catalog and the marketing build; no `route-gates.json` entry. Not release-ready. |
| `showcase-bunker-zero` | development showcase | Live in the games catalog and the marketing build; no `route-gates.json` entry. Not release-ready. |
| `showcase-slingshot-siege` | development showcase | Live in the games catalog and the marketing build; no `route-gates.json` entry. Not release-ready. |
| `showcase-dot-dash-3d` | development showcase | Live in the games catalog and the marketing build; no `route-gates.json` entry. Not release-ready. |
| `showcase-cross-hop` | development showcase | Live in the games catalog and the marketing build; no `route-gates.json` entry. Not release-ready. |
| `showcase-strange-orbit-port` | development showcase | Live in the games catalog under the canonical alias `/apps/craterline-gp/` (`marketing/public/_redirects` sends the source URL there); no `route-gates.json` entry. Not release-ready. |
| `showcase-splat-rush-port` | development showcase | Live in the games catalog under the canonical alias `/apps/chroma-roll/` (`marketing/public/_redirects` sends the source URL there); no `route-gates.json` entry. Not release-ready. |
| `showcase-serpentine-sky-run-port` | development showcase | Live in the games catalog under the canonical alias `/apps/serpentine-sky-run/` (`marketing/public/_redirects` sends the source URL there); no `route-gates.json` entry. Not release-ready. |
| `showcase-drift-and-deliver-port` | development showcase | Live in the games catalog under the canonical alias `/apps/gridlock-courier/` (`marketing/public/_redirects` sends the source URL there); no `route-gates.json` entry. Not release-ready. |
| `showcase-heatsink-port` | development showcase | Live in the games catalog under the canonical alias `/apps/ion-circuit/` (`marketing/public/_redirects` sends the source URL there); no `route-gates.json` entry. Not release-ready. |
| `showcase-ninja-runner-port` | development showcase | Live in the games catalog under the canonical alias `/apps/shadowstep-gauntlet/` (`marketing/public/_redirects` sends the source URL there); no `route-gates.json` entry. Not release-ready. |
| `showcase-last-train-port` | development showcase | Live in the games catalog under the canonical alias `/apps/lamplight-line/` (`marketing/public/_redirects` sends the source URL there); no `route-gates.json` entry. Not release-ready. |
| `showcase-roadster-hours-port` | development showcase | Live in the games catalog under the canonical alias `/apps/saltwind-highway/` (`marketing/public/_redirects` sends the source URL there); no `route-gates.json` entry. Not release-ready. |
| `showcase-where-the-wind-wanders-port` | development showcase | Live in the games catalog under the canonical alias `/apps/the-bellkeepers-walk/` (`marketing/public/_redirects` sends the source URL there); no `route-gates.json` entry. Not release-ready. |
| `showcase-silt-and-signal-port` | development showcase | Live in the games catalog under the canonical alias `/apps/duneglide/` (`marketing/public/_redirects` sends the source URL there); no `route-gates.json` entry. Not release-ready. |
| `showcase-cloud-runner-port` | development showcase | Live in the games catalog under the canonical alias `/apps/cumulus-dash/` (`marketing/public/_redirects` sends the source URL there); no `route-gates.json` entry. Not release-ready. |
| `showcase-shape-shift-sprint` | development showcase | Live in the games catalog and the marketing build (added 2026-11-07); no `route-gates.json` entry. Not release-ready. |
| `showcase-number-surge` | development showcase | Live in the games catalog and the marketing build (added 2026-11-07); no `route-gates.json` entry. Not release-ready. |
| `showcase-splat-turf` | development showcase | Live in the games catalog and the marketing build (added 2026-11-07); no `route-gates.json` entry. Not release-ready. |
| `showcase-polarity-orbs` | development showcase | Live in the games catalog and the marketing build (added 2026-11-07); no `route-gates.json` entry. Not release-ready. |
| `showcase-beat-hopper` | development showcase | Live in the games catalog and the marketing build (added 2026-11-07); no `route-gates.json` entry. Not release-ready. |

## Published Interactive Examples Without Release Gates

Addendum 2026-11-19 (5.7.0 release check). The three interactive scene examples featured on the
site home page and docs examples hub (`ember-courier`, `vesper-gt`, `relay-workcell`) were checked
the same way: no `route-gates.json` entry, not in `tools/site/games.catalog.json` or
`docs/workflows/game-inventory.json`, and listed in `tools/site/interactive-examples.mjs` (scene
source downloads). They take the `development showcase` label (Tier 3): public, but with no release
gate, visual approval or launch claim.

| Route directory | Classification | Evidence |
| --- | --- | --- |
| `ember-courier` | development showcase | Featured interactive example on the site; no `route-gates.json` entry. Not release-ready. |
| `vesper-gt` | development showcase | Featured interactive example on the site; no `route-gates.json` entry. Not release-ready. |
| `relay-workcell` | development showcase | Featured interactive example on the site; no `route-gates.json` entry. Not release-ready. |

## Example Diagnostics

The example diagnostics (labs, probes and harness examples under `examples/`) were removed in the
30-game prune. `examples/native-capabilities` remains as the capability-scenario source of the
native examples catalog.

## Retained Engine Evidence

The 59 rows added below are Three.js-parity and product-surface routes restored from git history
(they were deleted by the docs/examples consolidation while 52 browser specs still drove them).
They are labelled `retained engine evidence` deliberately: that is the most restrictive useful
label, and under the Policy section below it cannot be presented as a public showcase example.
Promoting any of them to `starter example`, `library demo`, or `release-ready candidate` is a
separate decision that requires passing the current evidence gates — it is not implied here.

| Route directory | Classification |
| --- | --- |
| `three-compat-animation-studio-pro` | retained engine evidence |
| `three-compat-asset-studio-pro` | retained engine evidence |
| `three-compat-controls-lab` | retained engine evidence |
| `three-compat-large-scene-lab` | retained engine evidence |
| `three-compat-material-studio-pro` | retained engine evidence |
| `three-compat-postprocess-studio-pro` | retained engine evidence |
| `three-compat-product-studio-pro` | retained engine evidence |
| `three-compat-scene-studio-pro` | retained engine evidence |
| `three-compat-shader-lab-pro` | retained engine evidence |
| `three-compat-threejs-migration-lab` | retained engine evidence |

## `examples/` routes

The tables above cover `apps/`. `examples/` routes are classified by what depends on them, and
`tools/route-tiers` derives that mechanically: a route referenced by a shipped `docs/` page, a
`create-aura3d` template name, or a retained spec/gate under `tests/` or `tools/` is at least a
public documentation example. One route matches none of those and is therefore recorded here.

| Route directory | Classification |
| --- | --- |

**`examples/data-galaxy`** has no live consumer: its scene logic now lives in
`apps/showcase-data-galaxy` and `apps/advanced-examples-gallery/src/dataGalaxy*.ts`, and the
directory still carries committed `.js` / `.js.map` build output beside its sources. It was
therefore a Tier 4 (obsolete) candidate.

**R8 refused the deletion.** `tools/deletion-safety` found **370 blocking references** to
`examples/data-galaxy/index.html`, all of them `runtime-consumer` hits inside retained launch
evidence (`apps/aura-clash-showcase/launch-evidence/readiness.json`,
`cross-runtime-evidence.json` and siblings). Deleting the route would invalidate retained
evidence that other gates read, so it is retained and labelled instead. Its `src/main.ts` is
individually clear; the directory as a whole is not.

This is the same outcome as ADR 0001 and the WS-3.5 fixture triage: a candidate that looks
obviously deletable, and is not, because generated evidence in this repository names files
directly. Revisit only if that launch evidence is regenerated without these references.
(5.6.0: `apps/aura-clash-showcase` and its launch evidence were deleted, so this block can be re-checked with `tools/deletion-safety`.)
| `showcase-orbital-defense` | blocked primitive-only prototype |
| `world-war-x-showcase` | blocked legacy showcase |
| `wow-webgpu-instancing` | retained lower-level WebGPU evidence |
| `showcase-port-shared` | support-only shared code; not a route. Provides the port pages' `diag.ts` diagnostics panel and `quickbar.css`; it has no `index.html` or `package.json`. |
| `common` | support-only shared code; not a route. Provides `src/runtime.ts` and `src/styles.css` to 25 `apps/*` routes and has no `index.html`. |

These routes may remain only when their READMEs and route labels name the exact
package/path they prove. They must not be treated as starter templates or root
API proof unless they import only public root APIs and pass current evidence
gates.

## Policy

Marketing may embed a route only when it labels the route with the correct
classification. `prototype`, `playable-showcase`, `internal diagnostic`, and
`blocked` routes cannot be presented as public showcase examples. The configured
route-library inventory currently contains four non-game candidate entries, two
internal diagnostics, and three materially rebuilt but independent-review-
pending game routes; classification and current promotion eligibility are
separate.
