# Skyline Runner

Status: five-act Level 1 rebuild under final visual review

Claim label: createAuraApp

Primary asset: showcaseKenneyOobiPlatformerHero

The route contains an original five-act side-scroller arc grouped into three
player-facing districts: cool rooftop **Steel Dawn** (Home Grove and Broken
Canopy), warm garden **Hanging Grove** (Sentry Pass and Cloudstep Rise), and
gold-sunrise **Crown Heights** (Aurora Crown). Ten certified section transforms,
typed robot sentries, district landmarks, relay checkpoints,
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

The mounted follow camera leads the runner's current facing direction rather
than retaining its initial rightward bias. Desktop and compact layouts use one
typed tuning contract; both follow the player vertically through the full jump
arc. Background dressing stays behind the actor plane, there are no rendered
foreground props, and foliage placement preserves positive clearance from
every certified landing edge. Pixel-difference browser evidence for both
viewports lives under `tests/reports/skyline-camera-readability/`.

Gameplay roles use a mounted shape-plus-color vocabulary rather than color
alone: mint/tan ledges are safe surfaces, typed hazards carry compact crossed
coral warnings, gold shards are faceted diamonds with thin halos, ember charges
are orange capsules in open rings, relays are cyan rings on posts, and the
finish is a stepped gold mast with an emerald core. The typed white/lavender
runner and cyan replay echo complete the eight-role contract in
`src/visual-language.ts`; browser evidence verifies every role is mounted and
that no standalone spherical gameplay marker remains.

Nine actual platformer events own a second, independent feedback contract:
jump, land, dash, collect, checkpoint/relay, hazard/fall, defeat/stomp,
respawn, and complete/finish. Each public-kit event triggers one distinct,
time-bounded Aura scene marker plus one distinct typed audio cue; input intent
alone cannot raise the evidence. The mounted-session ledger publishes the
event count, scene signature, runtime-node observation, cue request, and
cumulative audio attempt for every role. The browser producer stops on exact
collect and defeat frames so short effects cannot expire before capture.

Duration is proven by `src/level-proof.ts`
(`tests/unit/apps/skyline-sixty-second-level.test.ts`) across a 7,200-frame
window. That deterministic proof intentionally publishes
`provesMountedKitPlayback: false`; the Playwright gameplay proof owns mounted
browser playback and the retained visual states.

Boundary: this is a bounded certified-surface platformer showcase. It does not
claim arbitrary GLB-to-game conversion or general engine parity.

## Incorporations (05-Skyline-Runner)

Additive capability work on top of the certified course. The 70-115s window,
the generated surface map (`src/generated/game-geometry.ts`, byte-identical),
and every existing assertion are unchanged; constraints live in
`docs/sr-constraints.md`.

- **Speedrun ghost (SR-A1)** — a translucent echo of your best finish,
  recorded as input ticks and replayed through a separate kit instance in
  `src/ghost.ts`. Strictly visual-only: no collision, no pickups, no sentries,
  no effect on the completion window. Toggle with `G` or the Ghost button;
  the HUD badge shows OFF / ON (no recording) / ON with your PB time.
  Round-trip determinism is unit-proven by
  `tests/unit/apps/skyline-ghost.test.ts`; mounted visibility is proven by the
  ceremony spec.
- **Instanced foliage + sparkle consolidation (SR-A2)** — per-act ferns, steel
  scrub and aurora grass planned in `src/foliage.ts`, rendered as ONE instanced
  node per act tinted from the existing act palettes; thin torus sky-shard halos
  join the same instancing discipline while per-shard collection markers stay
  exact.
  Unit parity proof: `tests/unit/apps/skyline-foliage-instances.test.ts`.
- **LOD skyline backdrop (SR-A3)** — far/near silhouette bands, one
  `distanceLod` chunk per district with hysteresis (`src/backdrop.ts`), so the
  city reads as receding at constant cost without visible pops.
- **text3D act gates (SR-A4)** — extruded "ACT n" glyphs straddle the path at
  each act transition; the CSS act title card remains the accessible authority.
- **Relay overlap sensors (SR-A5)** — axis-aligned boxes that contain each
  relay's radial trigger (`src/level.ts`), published as robustness telemetry on
  `relaySensors`; checkpoint behavior and its assertions are untouched
  (`tests/unit/apps/skyline-relay-sensors.test.ts`).
- **Ambience bus split (SR-A6)** — three looping CC0 stems (Steel Dawn wind,
  Hanging Grove birds, Crown Heights shimmer) registered through the asset CLI,
  each on its own bus; districts switch by traversal, and the summit theme ducks
  the active stem.

Moving platforms were evaluated under SR-A7 and are deliberately NOT adopted;
the decision record lives in
`docs/sr-a7-moving-platforms-decision.md`.

## Sound

Original CC0 synthesized SFX and ambience stems (author "Aura3D synthesis",
license CC0-1.0) are generated in-repo by `scripts/build-sfx.mjs` and
registered as typed audio assets via the CLI, then played through the public
`createGameAudio` API with a gesture-unlocked AudioContext. Cue-to-asset
mapping lives in `src/skyline-audio-manifest.ts`; playback/evidence (including
the separately synthesized respawn-recovery cue, per-act ambience switching,
and summit ducking) lives in `src/skyline-audio.ts`.

## Known limits (routes must disclose gaps)

- Root `createAuraApp` does not yet stream or layer music/sound-design tracks;
  ambience is three short synthesized loops, not a scored ambient bed, and the
  summit theme is a sting that ducks them.
- Played audio in automated tests is reported through the mounted audio
  controller's cumulative `cueAttempts`, played/suppressed counts, and errors
  because headless browsers have no audible output device.
- Sentinel/hero articulated poses still come from a bounded procedural pose;
  root skinned-GLB clip playback remains a root-integration gap (published as
  `animation.skinnedClipPlaybackProvenAtRoot: false`), not a route claim.
- The ghost echo reuses the hero model with an emissive translucent material;
  if a renderer backend ignores model-level opacity the echo still renders as a
  distinct emissive shell (visual-only either way).
