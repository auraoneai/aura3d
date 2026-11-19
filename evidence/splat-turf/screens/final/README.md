# Splat Turf: final screens

Route: `/apps/showcase-splat-turf/` (`?autoplay=1` plays hands-free; O toggles the autopilot).
Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build served on :8790.

| viewport | frame | meaning |
|---|---|---|
| 1280x720 | 1280-01-title.jpg | title screen over the causeway |
| 1280x720 | 1280-02-early.jpg | kart rolling out, purple wet-ink lane painted behind it |
| 1280x720 | 1280-03-pickup.jpg | amber paint trail beside a solvent strip, can pickup ahead |
| 1280x720 | 1280-04-action.jpg | lane changes leave a multi-colour paint trail, ink bursts at the roller |
| 1280x720 | 1280-05-finish.jpg | finish gantry ahead, purple paint behind the kart |
| 1280x720 | 1280-06-results.jpg | RUN COMPLETE results (31,700, S) |
| 390x844 | 390-01-title.jpg | title screen |
| 390x844 | 390-02-early.jpg | long green paint lane behind the kart |
| 390x844 | 390-03-action.jpg | ink bursts while painting |
| 390x844 | 390-04-mid.jpg | paint accumulating across several lanes |
| 390x844 | 390-05-finish.jpg | finish gantry, orange paint trail |
| 390x844 | 390-06-results.jpg | RUN COMPLETE results (S grade) |
| 720x450 | card-1x.jpg | card: hero kart laying an orange paint lane between two rival scrubber karts (LANCZOS downscale of card-2x) |
| 1440x900 | card-2x.jpg | card: hero kart laying an orange paint lane between two rival scrubber karts |

Checked in the frames: the wet-ink splat map now reaches the GPU, so painted turf appears on the road where the kart
drives and stays there (each 25 m stretch in its team colour). Can pickups, solvent strips, rival karts, curbs, lamp
posts and pennants visible over the whole 1,200 m run.

Fixed (2026-11-19): `texture.data` snapshotted the caller's pixel array, so `needsUpdate` re-uploaded the stale
all-transparent copy (engine `packages/engine/src/agent-api/nodes/texture.ts`, now kept by reference like three's
DataTexture); the splat map is also `linear` now so the shader's own sRGB decode is not applied twice.

Results: full 1,200 m `?autoplay=1` run to RUN COMPLETE (31,700, S, 100% coverage, 18 cans); the run restarts by itself.

Console page errors: none.

Fixed (2026-11-19): recycled rival karts all land on the same row; they used to slide through each other. The sim now
keeps them `CONFIG.ERASER_GAP` apart and bounces them off each other; a rammed kart pops clear of the rover and knocks
the karts beside it off with it (tests/unit/splat-turf/kart-separation.test.ts checks every drawn frame of full runs).

Known issues: none.
