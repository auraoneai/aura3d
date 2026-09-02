# Gravity Post

Aura3D prototype route: `apps/showcase-gravity-post/` · `/apps/showcase-gravity-post/` · public promotion blocked pending independent review.

Gravity Post is a four-delivery arcade-trajectory courier shift. Players drag to aim a typed mail pod, compare a yellow fixed-step prediction with the persistent cream flown path, bend through authored wells, avoid red collision zones, and enter the destination’s real root-safe dock sensor below its capture-speed limit.

## Claim boundary

- Label: **prototype**, using the `createAuraApp` root safe API.
- Gravity is an authored, clamped, inverse-distance route-local design field. It is explicitly **non-physical**: no orbital-mechanics, n-body, physical-simulation, or physics-parity claim is made.
- Rapier/root-safe physics owns dock-sensor entry only. The pod is a kinematic mirror of the route-local fixed-step integrator; route-local code owns trajectory, capture-speed evaluation, score, assists, timer, hulls, and progression.
- The solar-kit sun, stars, dust, and lighting are presentational dressing. Static authored bodies own gameplay positions.
- No production-renderer, PBR-parity, HDR/IBL, WebGPU, or reusable game-kit claim is made.

## Controls

| Input | Action |
| --- | --- |
| Mouse/touch drag | Aim and power; yellow prediction beads update live |
| `W` / `S` or touch buttons | Spend the route’s single bounded prograde/retrograde correction token; route 1 intentionally grants none |
| Hold `Space` / Warp button | Bounded ×8 coast time-warp |
| `N` | Advance after a successful dock |
| `R` | Retry the current dispatch; reset after campaign completion or shift failure |
| `P` | Pause/resume without advancing the route |

## Four-delivery arc

1. **Direct dispatch** — learn aim, prediction, flown path, and capture speed with no correction token.
2. **Single assist** — pass through Verdance’s meaningful assist zone before docking.
3. **Chained curve** — record distinct Sol and Gale assists on the pinned route; one optional bounded correction is available.
4. **Hazard mail** — preserve three hulls through the red collision zones and finish at Gale Terminal.

Each dispatch has a real-time limit. Collision, escape, stranding, or timeout consumes one hull; three failures end the shift. The exact integer-drag campaign fixtures complete all four deliveries with zero failures and reset cleanly.

## Prediction contract

The live route and `integratePath` consume the same `1/120` fixed integration quantum. The bounded prediction horizon publishes `predictionComparedSamples`, `predictionMaxDivergence`, `predictionTolerance`, and `predictionWithinTolerance`. The current published positional tolerance is `0.02` world units; the pinned mounted no-correction route passes it.

## Typed assets and audio

- `assets.gravityPostCourierSkiff` — original CC0 typed primary courier skiff with four grounded contact-drive pods, directional cockpit/drive lights, and an integrated guarded amber parcel with raised envelope badge. Its exact route-primary and hash-bound root probe pass; public showcase promotion remains blocked pending independent visual review.
- `assets.gravityPostDockBeacon` — release-validated typed dock landmark, CC-BY-4.0, DjalalxJay; retained root-safe probe `392×142` pixels.
- `assets.gravityPostFreightDistrict` — original CC0 typed non-colliding freight world with a connected Rust → Gale deck, loading hangar, gantry, cargo terraces, tank farm, and terminal architecture; retained isolated root probe and +X orientation evidence.
- `assets.gravityPostMailPod` — release-validated CC-BY-4.0 textured transit shuttle (박용진) used as a single Gale-side set-dressing vehicle in the named review composition; its +Z orientation and isolated root probe are hash-bound, while route-local motion and delivery state remain owned by the skiff.
- Ten typed CC0 cues are deterministically synthesized by `scripts/build-sfx.mjs`, registered by `scripts/register-sfx.mjs`, and played through four mixer buses. Launch, correction, assist, dock, rejection, loss, completion, warp, UI, and ambient cues originate from actual route state.

The legacy mail-pod capital-ship remains a single non-colliding Gale-terminal transit cue in the review lens; it is not the gameplay courier or a second physics body. The replacement courier skiff remains the sole route-primary vehicle and must not be promoted from candidate to public showcase until its exact action frame and hash-bound root probe pass. The heavy 44–115 MB ring auditions remain rejected and unused.

## Current evidence

- Standard global: `window.__AURA3D_SHOWCASE_GRAVITY_POST__`; detailed global: `window.__GRAVITY_POST_EVIDENCE__`.
- Full campaign: `tests/reports/gravity-post/full-campaign-evidence.json`.
- Collision/three-hull failure: `tests/reports/gravity-post/failure-evidence.json`.
- Mobile touch delivery: `tests/reports/gravity-post/mobile-evidence.json`.
- Reduced-motion planning: `tests/reports/gravity-post/reduced-motion-evidence.json`.
- Performance: `performance-report.json` — four captures pass; fixed-step p95 `0.003 ms`, bounded-prediction p95 `0.1546 ms`, campaign-complete draw calls `471/600`.
- Route health: `route-health.json` — `machinePass: true`, `classification: prototype-blocked`, `publicShowcase: false`.
- Route-primary probe: `tests/reports/showcase-route-primary-probes/showcase-gravity-post.json` — pass, `603×414`, 58,346 foreground pixels, readability 98, unclipped; the frame includes the typed skiff, destination beacon, freight district, and terminal MailPod shuttle.
- Unit: 19 tests across wells/pod/prediction, scoring, and flyby modules.
- Browser: 8 checks across full gameplay, correction, failure/reset, pause/warp, flyby, mobile, reduced motion, prediction pixels, labels, and real sensor capture.

## Verification commands

```bash
pnpm --dir apps/showcase-gravity-post typecheck
pnpm exec vitest run tests/unit/apps/gravity-post-*.test.ts
pnpm exec playwright test tests/browser/gravity-post-playable.spec.ts tests/browser/gravity-post-scene.spec.ts
pnpm --dir apps/showcase-gravity-post evidence:performance
pnpm --dir apps/showcase-gravity-post evidence:route-health
A3D_ROUTE_PRIMARY_IDS=showcase-gravity-post pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts
pnpm --dir apps/showcase-gravity-post build
pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-gravity-post/dist --source apps/showcase-gravity-post/src --asset gravityPostCourierSkiff --asset gravityPostDockBeacon --asset gravityPostFreightDistrict
pnpm typecheck
```

Machine evidence is complete. Independent review of the exact hash-bound artifacts remains mandatory before public-gallery promotion.
