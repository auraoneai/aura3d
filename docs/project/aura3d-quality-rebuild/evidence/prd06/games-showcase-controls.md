# PRD-06 Phase 5 — §17.4 per-game showcase controls (T5.1–T5.6, S11)

> **06-REC note (finish phase, G3):** this file cites no passing remote run id; every completion claim below is recorded as **unbacked** until a green lane-workflow/GitLab run id is added next to it.


Six failing-control specs under `tests/qr/prd06/games/` run the §17.4 gates
against today's routes and fail where the spec says they must; each route's
Q-14 change request ships as a ready-to-file issue body in
`qr-requests-q14.md` (`gh` is unauthenticated on lane VMs).

## Coverage map

| Task | Spec | Q-14 | Flag-on gate (today → fails) |
| --- | --- | --- | --- |
| T5.1 | `aura-clash-showcase.spec.ts` | Q-14-1 | `tracksApplied > 0` both fighters, uniform scale through a `KeyJ` attack, ≥1 masked idle layer |
| T5.2 | `rooftop-buckets.spec.ts` | Q-14-2 | `shooter-player-mesh`/`contest-defender-mesh` visible + socket-bound in normal play, flat shooter yaw |
| T5.3 | `skyline-runner.spec.ts` | Q-14-3 | hero GLB passes `hero-character` (today: `HERO_NOT_A_CHARACTER`, `HERO_NO_SKIN`, `HERO_TOO_FEW_JOINTS`, `HERO_MISSING_CLIP`), foot skeleton bound |
| T5.4 | `neon-swarm.spec.ts` | Q-14-4 | `neonCourierAvatar.glb` passes `hero-character`, bound skeleton, ≥2 masked layers during run+fire, courier bob < 0.5 cm |
| T5.5 | `mech-hangar.spec.ts` | Q-14-5 | a `mech-player-*` node applies tracks + bound skeleton (today's mechs are rigid assemblies) |
| T5.6 | `gallery-shift.spec.ts` | Q-14-6 | thief hips bone + socket + `tracksApplied > 0` on thief/guard-1/guard-2 (guard-2 already passes — only its leg will flip when Q-14-6 lands) |

Each spec also carries a flag-off control (`?a3d-qr=none`) asserting the
C-19 animation api is absent on the same nodes — those pass today and must
keep passing.

## Route serving

The showcase apps' `index.html` loads `/src/main.ts` absolute, so the
shared lane dev server (repo-root web root) cannot serve them — each spec
spawns the app's own `pnpm dev --host 127.0.0.1 --port <port> --strictPort`
via `startGameDevServer` (ports 5321–5326; `AURA3D_GAMES_DEV` env can point
at already-running origins). "Today's route" is the legacy boot
(`?a3d-qr=animation` leaves `route-*` off); the deterministic pump hooks
(`__GS_PUMP__`, `__RB_PUMP__`, `__AURA3D_SKYLINE_PUMP__`) live in
`src/legacy/main.ts`.

## Pre-existing repo bugs fixed to reach the routes

- `packages/rendering/src/environment/HdrEquirect.ts` used Node `Buffer`
  at module scope (`HDR_MAGIC`, `Buffer.from/alloc`, `.indexOf`, `.equals`,
  `.toString("latin1")`) — every dev-server route boot died with
  `ReferenceError: Buffer is not defined`. Rewrote to `Uint8Array` ops
  (`indexOfByte`, `latin1` helpers); RGBE decode verified on
  `kloppenheim_06_puresky_1k.hdr` (1024×512) and the m3/HDRLoader unit
  tests stay green (9/9).
- `aura.exports.json` listed `@aura3d/rendering/world` as the last `paths`
  row — after the bare `@aura3d/rendering` row. Vite's `find` matching is
  prefix-first, so the `/world` subpath rewrote to `index.ts/world` and any
  app importing it (e.g. `engine/src/agent-api/world/terrain.ts`) 500'd at
  transform time on `vite dev`. Moved the row ahead of the bare package per
  the generated file's own deeper-first invariant; regenerated
  `vite.aliases.generated.ts`, `tsconfig.paths.generated.json`,
  `tsconfig.base.json`, `tools/finalize-dist/manifest.generated.json`
  (`pnpm resolution:check` clean). Both bugs reproduce identically on
  `origin/main`.

## Headless-GL note

SwiftShader raster dominated the route main threads — page `evaluate()`
starved for minutes on the heavier games. All six specs pin
`viewport: 320x240`; route boot-to-registry drops to ~7 s and every probe
gets slots (node transforms are unaffected). Flag-off legs keep a 240 s
ceiling for cold vite transforms; measured 24–47 s after warm-up.

## Result (chromium, 2026-10-07)

`playwright.animation-matrix.config.ts --project=chromium
tests/qr/prd06/games/` → **12/12 passed**: six flag-on legs failed as
expected under `test.fail()` (S11 failing controls), six flag-off legs
green. Artifacts per spec under `artifacts/prd06/games/<name>/`
(gitignored).
