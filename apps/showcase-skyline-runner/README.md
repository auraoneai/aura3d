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
does not pass. `P` pauses/resumes traversal; `R` resets the full run. Browser
evidence separately proves the same keyboard controls,
checkpoint/fall/respawn chain, typed rendered actors, and real finish event.

Duration is proven by `src/level-proof.ts`
(`tests/unit/apps/skyline-sixty-second-level.test.ts`) across a 10,800-frame
window. That deterministic proof intentionally publishes
`provesMountedKitPlayback: false`; the Playwright gameplay proof owns mounted
browser playback and the retained visual states.

Boundary: this is a bounded certified-surface platformer showcase. It does not
claim arbitrary GLB-to-game conversion or general engine parity.

## Sound

Original CC0 synthesized SFX (author "Aura3D synthesis", license CC0-1.0) are
generated in-repo by `scripts/build-sfx.mjs` and registered as typed audio
assets via the CLI, then played through the public `createGameAudio` API with a
gesture-unlocked AudioContext. Cue-to-asset mapping lives in
`src/skyline-audio-manifest.ts`; playback/evidence in `src/skyline-audio.ts`.

## Known limits (routes must disclose gaps)

- Root `createAuraApp` does not yet stream or layer music/sound-design tracks;
  the summit theme is a short synthesized sting, not a scored ambient bed.
- Played audio in automated tests is reported via cue evidence (`feel.audio`
  counts tried / suppressed cues) because headless browsers have no audio output.
- Sentinel/hero articulated poses still come from a bounded procedural pose;
  root skinned-GLB clip playback remains a root-integration gap (published as
  `animation.skinnedClipPlaybackProvenAtRoot: false`), not a route claim.
