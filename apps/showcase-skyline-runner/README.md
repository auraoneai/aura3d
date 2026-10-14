# Skyline Runner

Status: prototype — rebuilt single-path on the shared platformer kit; browser look and playthrough are not yet independently verified.

Claim label: prototype.

Primary asset: showcaseKenneyOobiPlatformerHero (rigged; embedded idle/walk/sprint/jump/fall clips).

Every URL boots `src/main.ts`. The former legacy/v2 dispatcher, the Rapier
solver merge, and the generated game-geometry level bound to a world GLB are
deleted. Gameplay is the public `game.platformer` kit over fresh authored
level data (`src/level.ts`: platforms, one bonus moving platform,
collectibles, one missed-jump hazard, one checkpoint, finish). Motion comes
from the shared `solvePlatformerMotion` solver (snappy feel, jump height
2.3 character heights) — there are no route-local gravity or jump constants
and no pixel-ratio cap.

The hero faces its travel direction in the play plane
(`src/facing.ts: playerYawForFacing`) and its locomotion clips are selected
by the shared locomotion kit and crossfaded through an `AnimationController`
bound to the runtime node with root motion suppressed. The rig has no
dedicated land clip, so the brief land state plays its real `crouch` clip.

Flow scoring (`src/flow.ts`) is re-authored from the salvaged design numbers:
flow rises while moving/airborne, decays while idle, chained collects earn
bonus score, checkpoint splits are recorded, and a death zeroes flow.
Ghost replay is dropped: the deleted implementation replayed recorded inputs
through a second kit instance bound to the trashed level — only that design
(input recording, visual-only) was separable, not its code, and re-earning it
is out of scope for this rebuild.

Evidence is published every frame as `window.__aura3dGameSnapshot` (framed,
kit state, player position/velocity/grounded/facing/yaw, coins, flow score,
finished, hero clip name and time). Completion starts as
`completed: false` and is stamped only when the kit reports the finish.

Controls: A/D or arrows move, Space/W/Up jump, Shift dash, S/Down fast-fall,
R reset. Touch uses the shared dpad-2btn preset.
