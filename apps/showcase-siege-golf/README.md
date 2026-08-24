# Siege Golf: Wrecking Green

Status: machine-verifiable route evidence green; independent human visual review pending

Claim label: `prototype`

Primary assets: `siegeGolfBall`, `siegeWoodenCrate`, `siegeWoodenBarrel`,
`siegePlankSet` (all catalog-registered typed GLBs)

The first Aura3D game where rigid-body physics is the gameplay. You launch a
weighted range ball at stacked, jointed structures; knock-down pins must end up
resting inside sensor cup zones. Fewest strokes wins. Nine authored holes,
each a different contraption, escalate the joint usage: free stacks → fixed
gate joints → hinged flip panels → barrels and a ramp → a spring pad → a
hinged pendulum → a crowned tower → staggered double hinges → a finale mixing
every mechanic across two cups.

## What is proven (route-local, root safe API)

- **Physics as gameplay** — `physics.world(...)` on the Rapier backend owns
  every body: dynamic ball/crates/barrels/planks/pins, static felt/rails,
  hinge joints (flip panels, pendulum), spring joints (bounce pads), fixed
  joints (gate lintels), and once-per-overlap cup **sensors**.
- **Deterministic toppling** — fixed 1/60 step; identical shot inputs produce
  identical outcomes (FNV-1a pose hash). `R` reset rebuilds the hole from its
  definition and asserts the pre-shot hash matches a fresh build
  (`tests/unit/apps/siege-golf-physics.test.ts`).
- **Launch contract reuse** — aim/charge/strike runs through the public
  `games.createMiniGolfState()` oracle and `games.miniGolfPointerShot()` for
  touch drags; the velocity law (power × 0.32 / 0.045 kg) is pinned against
  the live kit in `tests/unit/apps/siege-golf-scoring.test.ts`.
- **Full game loop** — par 2–5 per hole, stroke limit par+4 (the failing
  stroke is playable; one past it fails the hole), star ratings (≤par 3★,
  ≤par+2 2★, else 1★), round totals, hole progression, retry-on-fail. A
  deterministic 60-second replay proof (`src/replay-proof.ts`, unit-pinned)
  demonstrates the ≥60 s meaningful-play bar per hole.
- **Best solution ghost** — a successful hole records only accepted shot
  inputs and sampled live-ball positions. A lower-stroke result replaces that
  hole's best; returning to the hole shows a renderer-owned dotted trajectory.
  `G` toggles it. The ghost creates no body, collider, sensor, score event, or
  replay write and cannot mutate the live Rapier pose hash.
- **Input** — `←`/`→` fine aim, hold `Space` to charge (monotonic power
  meter), release to strike, precision aim/power sliders plus `J` for exact
  puzzle solutions, `R` hole reset, `T` round reset, `P` pause (freezes the
  sim mid-topple), drag-back-and-release touch, and compact hold-to-charge plus
  left/right aim controls in the mobile safe area.
- **Presentation** — golden-hour siege yard: warm timber and dust values,
  layered blue hills, red target cloth, white ball/chalk cup marks, dark iron,
  distance haze, and restrained bloom. Opening, aim, flight, and settle camera
  phases use distinct root-safe camera specs; reduced-motion removes smoothing.
- **Audio** — nine original CC0 cues (author "Aura3D synthesis") synthesized
  deterministically by `scripts/build-sfx.mjs`, registered through the asset
  CLI, split across sfx/ambient/ui buses, gesture-unlocked.

## Evidence

- `window.__SIEGE_GOLF_EVIDENCE__` publishes the PRD contract: `mounted`,
  `holeIndex`, `strokes`, `par`, `state`, `targetsDown`, `targetsSunk`,
  `physicsBodyCount`, `sensorEventCount`, `lastShotHash`, `resetHashMatch`,
  `audioCues`, plus route-local extras (backend, pin states, frame count,
  active camera phase, bounded `golden-hour-siege-yard` thesis id, and
  visual-only best-solution input/trajectory/visible-node evidence).
- Unit: `tests/unit/apps/siege-golf-physics.test.ts` (determinism hashes,
  reset equality, once-per-entry sensors, per-hole containment),
  `tests/unit/apps/siege-golf-scoring.test.ts` (stars, stroke limit, round
  math, shot contract), `tests/unit/apps/siege-golf-replay.test.ts` (a
  deterministic 3600-frame / 60 s replay through the route's own `HoleFlow`:
  varied aim + power, sensor fires, topple, sink, mid-window reset with hash
  equality — mechanics flags derived, never declared; scope-limited to the
  route simulation, with mounted input proven in the browser specs).
- Browser: `tests/browser/siege-golf-playable.spec.ts` (aim → fire → sensor →
  score → advance → reset; pause freeze; stroke-limit fail path),
  `tests/browser/siege-golf-shot-visual.spec.ts` (ball leaves the tee and the
  structure visibly reacts, proven with before/mid/after pixel SHA deltas),
  `tests/browser/siege-golf-captures.spec.ts` (the six required evidence views
  captured desktop + mobile under `tests/reports/siege-golf/screenshots/`),
  and `tests/browser/siege-golf-course-completion.spec.ts` (all nine holes
  completed through the mounted player controls at 10 strokes / 27 stars,
  including direct, collapse, bank, final-hole, and course-complete artifacts).
- Route health: `apps/showcase-siege-golf/route-health.json` (generated by
  `scripts/write-route-health.mjs`), classification blocked pending human
  review; renderer mode `safe-basic` via the root `createAuraApp` safe API.
- Performance: `apps/showcase-siege-golf/performance-report.json` is generated
  by `pnpm --dir apps/showcase-siege-golf write:performance`; all nine canonical
  solutions complete while staying within the authored 32-body, 8-constraint,
  and 16.7 ms physics-step-p95 budgets. This is route-local headless Rapier
  evidence and does not claim rendering performance.
- Shared release evidence: the route is registered in
  `tools/showcase-library/route-gates.json` as `prototype-blocked`; its retained
  route-primary probe isolates the typed ball through a presentation-only pixel
  diff, while the generated launch evidence records passing build and deploy
  checks. Registration in these gates does not make it a public showcase card.

## Known limits

- The ball is a 500 g weighted trainer ball, not a regulation 45 g ball: at
  reachable launch speeds a regulation ball cannot topple even featherweight
  props (smoke-proven during tuning). Mass affects collision momentum only;
  launch speed follows the public mini-golf contract.
- "Pin down" is geometric (height + displacement from the authored spot), not
  orientation-based: a face-flat plank keeps its local Y aligned with world up
  either way.
- No destruction/fracture simulation (the engine does not implement it), no
  wind, no slope lies, no ball spin beyond impulses, no multiplayer, no course
  editor.
- Primitives (felt, rails, cup rings, aim ticks, trail puffs) are set dressing
  around the typed ball/crate/barrel/plank models.
- Headless browser runs report audio via cue evidence because they have no
  audio output.
- Route is listed in the internal remediation/index metadata and release gates,
  but `publicShowcase` remains false and no public card may be promoted until
  independent human visual review approves the exact final artifacts. The
  `prototype` label stays unchanged pending that verdict.
