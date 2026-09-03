# Gravity Post — Orbital Courier Redesign PRD

**Route:** `apps/showcase-gravity-post/`  
**Claim:** root-safe prototype with route-local authored arcade gravity; never imply a physical orbital simulator

## Experience

Plot a courier capsule through a tiny postal system. Aim a launch vector, read a prediction path, skim gravity wells for assists, and dock at stations in sequence. The pleasure is making an elegant plan and seeing the real path match the understandable approximation.

## Visual thesis

Retro-future navigation chart made spatial: deep navy void, warm station windows, cream route lines, cyan prediction, gold successful assists, red collision risk. The camera is a calm orbital overview; close flybys briefly tighten framing but never lose destination and capsule context.

## Route arc

- Four deliveries teach direct launch, single assist, chained assist, and hazard avoidance.
- Planning pauses motion and exposes aim/power plus predicted encounters.
- Launch locks the plan; the player may use one bounded correction token on later routes.
- Dock sensors award remaining-time and assist-chain bonuses; collision or timeout consumes a dispatch life.

## Systems

- Solar scene composition and typed capsule/station assets where primary objects are named.
- Route-local deterministic inverse-distance-like arcade pull with clamps; README and evidence call it authored.
- Prediction runs the same bounded step function as live motion and publishes divergence metrics.
- Sensors own dock completion; scene path/particles visualize actual sampled positions.
- Audio uses ambient, launch, flyby, assist, dock, collision, and UI lanes.

## Proof and quality gates

- Unit tests pin gravity-well contribution, prediction/live divergence, dock once-per-entry, score, fail, and reset.
- Browser proof completes direct and chained-assist deliveries and demonstrates correction/failure.
- Acceptance captures: planning overview, launch, close assist, chained curve, dock, collision, final route.

## Definition of done

- [x] Prediction stays within the published bounded tolerance for pinned routes.
- [x] Capsule, next station, prediction, and hazards remain visually separable.
- [x] Four deliveries form a complete progression and reset cleanly.
- [x] Claims say authored arcade gravity, not simulation.
- [ ] Desktop/mobile/reduced-motion artifacts pass independent review.

## Execution ledger

**Status:** Machine-complete; independent exact-artifact review pending; courier-operator structural pass is current
**Last verified:** 2026-09-02 16:25 PDT
**Implementation scope:** `apps/showcase-gravity-post/`, Gravity Post unit/browser/evidence surfaces, generated artifacts, and this PRD  
**Authoritative evidence:** wells/scoring/flyby units; playable/scene browser specs; prediction divergence; route/deploy/review artifacts  
**Remaining blockers:** independent human review of the exact hash-bound planning, launch/path, assist/chain, dock, collision, final-route, mobile, and reduced-motion artifacts

### Current bounded visual pass — 2026-09-02

The route now mounts the release-probed typed `assets.neonCourierAvatar` as a
renderer-owned static operator seated on the courier skiff's canopy. The skiff
remains the sole primary vehicle and the operator has no controller, animation,
physics body, sensor, scoring, or route-integrator ownership. Its transform is
derived from the same displayed route velocity and yaw as the skiff, so launch,
correction, and reset keep a coherent courier heading. This is a structural
identity improvement against the Parcel Corps gap, not an independent visual
approval or a production animation claim.

The targeted exact route-primary producer passed after the pass (`1/1`):
`tests/reports/showcase-route-primary-probes/showcase-gravity-post.png`
SHA-256 `sha256-6c037ed5254e72409fb6f0f84e4271792ffac7038f30f46fa4b2a359a1d05c1c`;
route source binding `sha256-ba64e3e20f6a852bbc2df8c534757c6022a1e94bbf1fe54e952d14ee529e22c5`;
structural pass, readability `100`, `503` draws, unclipped. Focused route units
remain `19/19`, and app typecheck/build, route-health, performance, and strict
release deploy pass. The fresh exact still requires anonymous Parcel Corps
comparison and authorized human review; this pass must not be promoted as an
`ours` verdict by itself.

### Requirement checklist

- [x] GP-01 Typed capsule/stations and retro-future chart composition make capsule, next station, prediction, and hazards separable.
- [x] GP-02 Four deliveries teach direct, single assist, chained assist, and hazard avoidance with correction/life progression.
- [x] GP-03 Route-local authored arcade gravity is deterministic, clamped, documented, and never described as physical simulation.
- [x] GP-04 Prediction uses the live bounded step function and meets the published divergence tolerance on pinned routes.
- [x] GP-05 Dock sensors fire once; time/assist score, collision, timeout, life loss, completion, pause, and reset are deterministic.
- [x] GP-06 Actual path, flyby, assist, dock, collision, and UI feedback are state-driven and typed where asset-backed.
- [x] GP-07 Browser completes direct and chained routes and proves correction, collision/fail, pause, reset, and promised touch.
- [x] GP-08 Planning, launch, assist, chain, dock, collision, final route, mobile, and reduced-mode artifacts pass.
- [ ] GP-09 Performance, route-health, assets/audio, deploy, bounded claims, accessibility, and independent review pass.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | GP baseline | Current app/route-health plus wells/scoring/flyby/playable/scene suites located | In progress |
| 2026-08-23 | GP-02, GP-05, GP-07 | `tests/reports/gravity-post/full-campaign-evidence.json`: exact mounted integer-drag fixtures complete GP-CON-1..4; Verdance is the single assist, Sol+Gale are the chain, `dockEventCount=4` with four unique captures, zero failures, one-use correction proof, campaign completion, and clean reset | Pass |
| 2026-08-23 | GP-03, GP-04, GP-05 | `pnpm exec vitest run tests/unit/apps/gravity-post-*.test.ts` | Pass: 19/19; clamped authored force/determinism, exact prediction identity, `0.02` tolerance, correction one-use, timeout, dock/capture/bounce, assist uniqueness, score, failure, and flyby gates |
| 2026-08-23 | GP-04, GP-07 | `pnpm exec playwright test tests/browser/gravity-post-playable.spec.ts tests/browser/gravity-post-scene.spec.ts` | Pass: 8/8; mounted prediction/live max divergence `0`, direct+chain completion, correction, collision/three-hull fail, pause/warp, flyby, touch, reduced motion, scene pixels, labels, and sensors |
| 2026-08-23 | GP-05, GP-06 | `tests/reports/gravity-post/failure-evidence.json` and `collision-hull-loss.png` | Pass: three actual `planet-strike:sol` events consume three hulls; state-driven launch/loss cues and explicit hull-loss HUD remain visible |
| 2026-08-23 | GP-01, GP-06, GP-08 | Agent visual audit of the exact artifact submission set below | Pass for machine/agent review: yellow prediction, cream flown path, typed pod/beacons, cyan wells/docks, red collision zones, route/HUD truth, desktop, mobile, and reduced mode are separable; this is not independent approval |
| 2026-08-23 | GP-01, GP-09 machine gates | `AURA3D_PROBE_ASSETS=gravityPostMailPod,gravityPostDockBeacon pnpm exec playwright test tests/browser/showcase-release-asset-probes.spec.ts` plus both synchronization commands | Pass: root-safe retained probes `277×172` and `392×142`, hash/orientation bound; both assets are release quality with durable CC-BY provenance |
| 2026-08-23 | GP-06, GP-09 machine gates | Two consecutive `pnpm --dir apps/showcase-gravity-post build:sfx` runs plus `register:sfx` | Pass: byte-identical hashes on all 10 deterministic CC0 cues; typed registrations current; four obsolete pre-seed generated WAVs removed |
| 2026-08-23 | GP-09 machine gates | `pnpm --dir apps/showcase-gravity-post evidence:performance` | Pass: four exact captures; single assist `[verdance]`; chain `[sol,gale]`; fixed-step p95 `0.0025 ms`; prediction p95 `0.1663 ms`; campaign draw calls `538/600` |
| 2026-08-23 | GP-01, GP-09 machine gates | `pnpm --dir apps/showcase-gravity-post evidence:route-health` | Pass: `machinePass=true`, 14/40 primitive source occurrences, current source-bound campaign/mobile/reduced/failure artifacts, `prototype-blocked`, `publicShowcase=false` |
| 2026-08-23 | GP-01, GP-09 machine gates | `A3D_ROUTE_PRIMARY_IDS=showcase-gravity-post pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts` | Pass: typed pod `147×94`, 2,808 foreground pixels, readability 50, unclipped; both mounted primary assets present; source `sha256-24354001...` |
| 2026-08-23 | GP-09 machine gates | App build; exact `check-deploy --release --source apps/showcase-gravity-post/src --asset gravityPostMailPod --asset gravityPostDockBeacon`; root `pnpm typecheck` | Pass: build succeeds; release deploy has zero failures/warnings; root TypeScript command proof passes |

### Exact artifact submission set

| Artifact | SHA-256 | Machine/agent review |
| --- | --- | --- |
| `tests/reports/gravity-post/aim-prediction-line.png` | `c5652dbc67c85deb36473f70944d08f5eeafbe68d22cc0f6bf05f8b2f76b8d30` | Pass; planning/prediction visible |
| `tests/reports/gravity-post/chained-assist-dock.png` | `67d5c7a44517a1868ad809a3f52ef7ffab7e43a448d9560ee79ca9bad9f6de89` | Pass; cream chained path and dock visible |
| `tests/reports/gravity-post/collision-hull-loss.png` | `352fdb786b73993bb53a5001b40aa269bb48990ecc7da0e89c6270daf871a316` | Pass; actual collision reason and hull decrement visible |
| `tests/reports/gravity-post/campaign-complete.png` | `e951d1ba6e2806f589a1a64298b0e6a145eb04494b30f021ce25ba733a3349b3` | Pass; fourth route, final score, and completion visible |
| `tests/reports/gravity-post/mobile-dock.png` | `4867e6ffcdcd2be8da5d6b7c203a9046547ff5c69a82d25e8ad7cd1ceac1aa73` | Pass; touch delivery truth and controls visible without covering the board |
| `tests/reports/gravity-post/reduced-planning.png` | `56d9c78beef46e64eae96ce00c5d372bc7e8baa86e1000d3975458f9eee4bad7` | Pass; reduced-mode prediction, destination, timer, hulls, and controls retained |
| `tests/reports/showcase-route-primary-probes/showcase-gravity-post.png` | `dd62e2df1869673c9f4da375040cc19c6316a52d253ccf9e35f673175d9e1ba9` | Pass; shared typed-pod route-primary gate |

Independent human verdict: **pending**. GP-09 and the final definition-of-done checkbox remain open until that reviewer approves these exact hashes.
