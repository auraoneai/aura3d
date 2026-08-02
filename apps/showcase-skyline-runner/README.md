# Skyline Runner

Status: visual-rebuild-in-progress prototype

Claim label: createAuraApp

Primary asset: showcaseKenneyOobiPlatformerHero

The route technically proves typed character/world loading, bounded
mesh-derived surfaces, mounted movement/jump/checkpoint/hazard/finish state,
route-local challenge scoring, route-primary evidence, and deploy checks. Its
retained July 19 manual review predates the current mounted source and is not
current visual approval. Public promotion remains blocked until rebuilt
desktop, mobile, and gameplay screenshots pass the hash-bound independent
review gate. This does not claim arbitrary asset conversion or production
platformer-engine parity.

Authored duration is proven separately by `src/level-proof.ts`
(`tests/unit/apps/skyline-sixty-second-level.test.ts`), which drives the public
`game.platformer` kit over a 3,600-frame window: 60.0 s remain playable against
the authored 30 s floor, with 15.06 units of forward traversal, 38 jumps,
1,738 grounded frames against 1,862 airborne, and all 6 checkpoints activated.
That proof publishes `provesMountedKitPlayback: false` because a planned input
sequence is not mounted browser playback.
