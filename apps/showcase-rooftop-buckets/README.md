# Rooftop Buckets

Rooftop Buckets is a root-safe Aura3D prototype: one public `createGameApp(...)` mount presents a five-heat summer-night shooting session. Shot flight, composed rim/backboard/defender regions, the bounded first-flight guide, heat objectives, clocks, score, streak, fire, gold outcome, and outcome fixtures are route-local TypeScript. They are not Rapier bodies and do not establish a reusable basketball, rim-physics, defender, or sports kit.

The route remains `prototype-blocked` and is not a public showcase card. Machine evidence does not grant visual approval; promotion requires independent review of the exact hash-bound desktop, mobile, and reduced-motion artifacts recorded by route health.

## Player loop

Use `A`/`D` to choose one of six marked spots, `W`/`S` to adjust the bounded arc, and hold/release Space to charge and shoot. `P` pauses and `R` resets the entire session. Touch controls operate the same live spot, aim, charge/release, pause, and reset state.

The session escalates through five exact modes: an open six-point heat, three unique required spots, a shorter-clock pressure heat with a visible defender telegraph, a three-consecutive-make fire heat, and one gold-ball finale attempt. A gold make wins; a gold miss or finale clock violation fails. Terminal outcomes lock further scoring until reset.

The preview and the actual pre-contact ball path call the same deterministic free-flight integrator. The guide deliberately stops at the hoop plane and promises nothing after the first rim or board contact. A make is accepted only after the ball arms above the rim and crosses downward through the inner scoring region. All contacts and rebounds are authored route-local approximations, not generic physical simulation.

## Typed assets and audio

All primary subjects are provenance-bound typed assets registered through the Aura3D CLI. The court equipment is deterministic original CC0 geometry; the characters retain their reviewed external licenses and materials:

- `assets.rooftopCourt`: metre-scale 16 by 14 metre rooftop play surface.
- `assets.rooftopBackboard`: metre-scale backboard aligned with the composed board region.
- `assets.rooftopRim`: 0.48 metre readable hoop aligned with the composed rim/scoring regions.
- `assets.rooftopBall`: unit-normalized basketball scaled by the route to a 0.24 metre diameter.
- `assets.rooftopAthleteShooter`: CC-BY-4.0 textured static shooter derivative of the retained Sketchfab Basketball Player source by 3DDomino. The source ball hierarchy is removed, the continuous raised-ball release pose and packed materials are preserved, and the route owns the typed gameplay ball plus all pose/state staging.
- `assets.rooftopAthleteDefender`: CC-BY-4.0 textured static contest derivative of the same retained source by 3DDomino. The source ball hierarchy is removed and the arms are opened into an asymmetric contest silhouette with a blue/gold team recolor; it is one licensed source identity adapted into a second route visual variant, not a reusable animation kit.
- Ten `assets.rooftopBuckets*Sfx` members: deterministic seeded/oscillator CC0 ambience, charge, contact, make/miss, fire, heat, gold, and buzzer cues.

The manifest retains durable source/download URLs, license, author, hash, role, suitability, orientation, and current hash-bound root-renderer probes for all six models. The two athlete derivatives intentionally have no embedded skins or animation clips: route-local state names (`Ready`, `Load`, `Release`, `FollowThrough`, `Telegraph`, and `Contest`) describe deterministic placement, compression, and contest staging only. Audio is candidate-quality and is validated separately because model release-bounds checks do not apply to WAV files.

## Evidence boundary

- `tests/unit/apps/rooftop-buckets-heats.test.ts` proves five exact modes, fixed non-pressure hoop state, deterministic defender telegraphs/rebound, the contest launch offset, the armed top-to-bottom sensor, and exact predictor/integrator agreement.
- `tests/unit/apps/rooftop-buckets-scoring.test.ts` proves unique spots, shorter pressure clock, fire sequence, single gold attempt, win/fail, terminal lock, multipliers, clock/pause behavior, and ordered heat advancement.
- `tests/browser/rooftop-buckets-playable.spec.ts` naturally drives keyboard spot/aim/charge/release, authored flight and settlement, pause/freeze/resume, full reset, the complete five-heat session, gold miss/win, buzzer, and promised touch controls.
- `tests/browser/rooftop-buckets-shot-visual.spec.ts` produces opening, charge, release, swish, miss, contest, fire, buzzer, gold, mobile, touch-active, and reduced-motion artifacts. Source-controlled outcome fixtures drive the same live score, HUD/audio, typed handles, and scene synchronization; they do not replace the separate flight/contact unit and natural-input browser proof.
- Renderer-owned release rays, contest-link rings, and rim/board/swish/block bursts are synchronized to the live route flight, defender telegraph, and exact contact events. They are scene feedback, not DOM particles and not a reusable effects system.
- `performance-report.json`, `deploy-report.json`, and `route-health.json` bind their producer and current route source before reporting a machine pass.

## Reproduce

From the repository root:

```bash
# The production-art registration script is dry-run by default because it
# updates the generated root manifest. Use --apply only after retained probes
# are captured and the release coordinator has reviewed the exact hashes.
pnpm --dir apps/showcase-rooftop-buckets exec node scripts/register-production-art.mjs
pnpm --dir apps/showcase-rooftop-buckets typecheck
pnpm --dir apps/showcase-rooftop-buckets build
pnpm exec vitest run tests/unit/apps/rooftop-buckets-heats.test.ts tests/unit/apps/rooftop-buckets-scoring.test.ts
pnpm exec playwright test tests/browser/rooftop-buckets-playable.spec.ts tests/browser/rooftop-buckets-shot-visual.spec.ts --reporter=line
pnpm --dir apps/showcase-rooftop-buckets evidence:performance
pnpm --dir apps/showcase-rooftop-buckets evidence:deploy
pnpm --dir apps/showcase-rooftop-buckets write-route-health
```

The exact artifact hashes and the independent-review blocker are recorded in `route-health.json`.
