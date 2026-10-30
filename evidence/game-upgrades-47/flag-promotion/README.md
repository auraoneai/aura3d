# GU47 WP-7 flag promotion: capture plan and luma table

Owner: lane E-G (`gu47/eg`). PRD WP-7 (lines 426-433) and §7.1 (line 1464): every promotion needs a before/after table over all 64 luma targets showing no unintended change above 2 mean luma on games that do not use the promoted feature. Every number is software WebGL2 (remote runner) until an owner real-GPU run exists.

## What is promoted (one revertible commit each, at the end of `gu47/eg`)

| Flag | Gates | Flag-on audit for scenes without the feature (phase 1, unit-tested) |
|---|---|---|
| `A3D_QR_VFX_SKY` | `sky` node handler, `prd07.sky` contributor, atmosphere extension sky path | the contributor emits no pass without a sky node (`flag-promotion-noop.test.ts`) |
| `A3D_QR_VFX_FOG` | PRD-07 fog runtime (height fog, fog volumes), `prd07.fog` shader feature, `prd07.fog` collect | the shader feature used to select for every forward program once the flag was on; it now selects only while a fog node is live (`fogUniformStore`), so fog-free scenes keep their programs |
| `A3D_QR_WORLD_WATER` (alone, WORLD stays dev) | `water` node handler, `water.surface` upgrade, water passes | water passes rode the WORLD-gated `prd10.world` contributor; the new `prd10.waterOnly` contributor (flag `A3D_QR_WORLD_WATER`, defers when WORLD is on) emits them and nothing without a water body |
| `A3D_QR_POST_VELOCITY_MRT` | `prd03.velocity` shader feature (location-1/2 velocity and reactive outputs) | the registered feature used to select every forward draw; it now also needs a prepared temporal frame (`velocityFramePrepared`), so scenes without TAA or motion blur get no velocity outputs, uniforms or MRT writes |
| `A3D_QR_ANIMATION_SKINNED_SHADOWS` | `prd06.deform` depth variant + skinned bounds provider | the depth variant selects skinned items only |
| `A3D_QR_WORLD_WIND` (GU47 E-G addition) | `prd10.wind` deform + `prd10.instanceWind` contributor (`instances.*({ wind })`) | selection is label-driven; the contributor registers on the first wind-opted build; no live game opts in |

A promoted sub-flag stays off when its lane flag was explicitly turned off (`none`, `-vfx`, `-post`, `-animation`, `-world`; `contracts/flags.ts`), so the kill switches keep meaning "everything in that lane off".

## Captures (phase 2, remote runner only)

1. Build A = the parent of the first flip commit on `gu47/eg` (all six flags at their pre-GU47 state); build B = the branch head (all six flips). Same machine image, same settle (`GL_SETTLE=25,60`).
2. For each build, run all eight groups of `tests/browser/game-luma-capture.spec.ts` (targets `g1` ... `g8`, 64 targets, `tests/browser/game-luma-targets.ts`):
   `RUN_ID=gu47-eg-flags-<A|B>-g<n> SPECS='tests/browser/game-luma-capture.spec.ts --grep=@g<n>' tools/remote-acr/run.sh`
3. Record per target: mean luma at 25 s and 60 s, the frame PNG, and LPIPS(A, B) of the 60 s frame.
4. Fill the table below. A target passes when |Δ luma| ≤ 2 at both settle times, or when it is in the expected-change set of a promoted feature and its change is the feature (check the frame).
5. A failing target is attributed by reverting the flips one at a time (each flip is one commit) and re-capturing that target's group; revert the flip that causes it and record the revert here.

## Expected-change sets (from the code audit, branch state of `gu47/eg`)

- `A3D_QR_VFX_FOG`: games with fog nodes route through the PRD-07 fog path (legacy-parity mode where the generator is off): aura-links-3d, bunker-zero, cross-hop, dot-dash-3d, heatsink, pips-big-leap, teleoperator, drift-and-deliver-port, kid-goku-beyond-the-clouds-port (Cumulus Dash), last-train-port, ninja-runner-port, roadster-hours-port, silt-and-signal-port. Parity is designed to match; any of these moving more than 2 luma is a parity defect, not a feature change: revert the `A3D_QR_VFX_FOG` flip.
- `A3D_QR_POST_VELOCITY_MRT`: games with TAA or motion blur: aura-fc-3d.
- `A3D_QR_ANIMATION_SKINNED_SHADOWS`: games with skinned actors that cast shadows: aura-diamond-3d, aura-fc-3d, aura-hoops-3d, aura-links-3d, heatsink, iron-crown, aura-slam (top-tennis), last-train-port, ninja-runner-port, saiyan-snake-way-port (serpentine-sky-run), silt-and-signal-port. Expected: character shadows deform with the pose.
- `A3D_QR_VFX_SKY`: games with sky nodes: pips-big-leap (sky builder in its scene code; verify the frame).
- `A3D_QR_WORLD_WATER`, `A3D_QR_WORLD_WIND`: no live game uses `world.water`, `water.surface` or instance wind at this commit; every target must stay within 2 luma.

Game lanes that adopt a feature in wave 2 (sky in 12 games, height fog in 14, water in 6, velocity in 6, skinned shadows in 7) are captured by their own lanes; this table is about the flips alone.

## Receipts

`evidence/receipts/{sky,height-fog,water}/` from `tests/browser/gu47/{sky,height-fog,water}.spec.ts` (harness `tests/browser/gu47/world-receipts.ts`):
`RUN_ID=gu47-eg-receipts SPECS='tests/browser/gu47/sky.spec.ts tests/browser/gu47/height-fog.spec.ts tests/browser/gu47/water.spec.ts' tools/remote-acr/run.sh`, then `node tools/receipts/extract-from-acr-log.mjs <acr-run.log>`.

## Luma table (filled in phase 2)

| Target | Group | Luma A 25 s / 60 s | Luma B 25 s / 60 s | Δ max | LPIPS | Uses promoted feature | Verdict |
|---|---|---|---|---|---|---|---|
| (64 rows, one per `GAME_LUMA_TARGETS` entry) | | | | | | | |
