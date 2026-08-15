# Skyline Runner

Status: five-act Level 1 rebuild under final visual review

Claim label: createAuraApp

Primary asset: showcaseKenneyOobiPlatformerHero

The route contains an original five-act side-scroller story: Home Grove,
Broken Canopy, Sentry Pass, Cloudstep Rise, and Aurora Crown. Ten distinct
district transforms, typed robot sentries, act landmarks, relay checkpoints,
sky-shard collection, retries, flow scoring, and a summit-beacon finish create
a complete Level 1 rather than a short repeated obstacle strip.

The public `game.platformer` kit proof drives the physical start-to-finish
course with the shipped movement and jump configuration. Collectible coins add
score, and `KeyJ` fires ember volleys that defeat sentries through
`input.clearHazardIds` and the kit `defeat` event. Jump-release scaling applies
once per jump. The authored target is 95 seconds, and completion must occur
between 70 and 115 seconds; reaching the finish early and waiting on a timer
does not pass. Browser evidence separately proves the same keyboard controls,
checkpoint/fall/respawn chain, typed rendered actors, and real finish event.

Duration is proven by `src/level-proof.ts`
(`tests/unit/apps/skyline-sixty-second-level.test.ts`) across a 10,800-frame
window. That deterministic proof intentionally publishes
`provesMountedKitPlayback: false`; the Playwright gameplay proof owns mounted
browser playback and the retained visual states.

Boundary: this is a bounded certified-surface platformer showcase. It does not
claim arbitrary GLB-to-game conversion or general engine parity.
