# Physics backend decision (WS-4.2)

**Status:** decided
**Date:** 2026-08-05
**Evidence:** `tests/reports/physics-backend-bakeoff/report.json`
**Harness:** `tools/physics-backend-bakeoff/index.ts` — `npx tsx tools/physics-backend-bakeoff/index.ts`
**Platform:** darwin arm64, Node v22.15.0

> PRD WS-4.2 requires this file to exist, with numbers, **before any solver code changes**.
> The PRD explicitly permits any outcome including "no multi-backend abstraction at all".

---

## Decision

**One production backend: `cannon-es`, kept and hardened behind the WS-4.1 contract.**
**No multi-backend abstraction.** **`aura-js` is removed, not fixed.**

Rapier is technically the better solver on almost every physical dimension. It is rejected
on one measured dimension it cannot win: **delivered bytes**, which §B.1 makes a release
gate. This is a browser 3D library, and physics is one subsystem inside a bundle already
7.25x over budget.

This decision is **reversible and dated** — see "When to revisit".

---

## The measurements

| Dimension | cannon-es 0.20.0 | Rapier 0.19.3 | Winner |
|---|---|---|---|
| Bundle, gzip | **27,006 B** | 829,957 B compat / **612,861 B** fair | cannon-es, 22.7x |
| Init | **16.1 ms** | 23.6 ms (WASM) | cannon-es |
| Step, 1000 bodies | 4.97 ms | **0.299 ms** | Rapier, 16.6x |
| Step at real route ceiling (220) | 0.472 ms (2.8% frame) | **0.201 ms (1.2% frame)** | Rapier, by 0.27 ms |
| Determinism across runs | identical, divergence 0 | identical, divergence 0 | tie |
| Stack stability | settled, drift 0.111 | **settled, drift 0.0029** | Rapier |
| Joints constrain motion | yes (4.22 vs −38.9) | yes (4.05 vs −39.2) | tie |
| Tunnelling, raw step | **fails** (y −392) | **stops** (y 0.149) | Rapier |
| Tunnelling, with our shipped mitigation | stops (y 109) | stops (unchanged) | tie |
| Character controller | none — we hand-wrote it | **native Kinematic CC** | Rapier |
| Vehicle controller | RaycastVehicle (unused by us) | **native DynamicRayCast VC** | Rapier |
| Web Worker offload | none | **SAB/transferable** | Rapier |
| License | MIT | Apache-2.0 | tie |

**Rapier wins 6 of 13. It is genuinely the stronger solver.** The decision does not
pretend otherwise.

### Why bundle size overrides a 16.6x step advantage

The 16.6x figure is measured at 1000 bodies. **No Aura3D route reaches 1000 bodies.** The
densest is `showcase-blockfall-reactor`, whose board is 10x22 = **220 bodies fully packed**
(`apps/showcase-blockfall-reactor/src/rules.ts`), and a fully-packed board is the worst
case — normal play holds far fewer settled cells.

At 220 bodies:

- cannon-es 0.472 ms/step = **2.8%** of a 60 fps frame
- Rapier 0.201 ms/step = **1.2%** of a 60 fps frame

**The entire performance advantage is 0.27 ms per frame — 1.6% of one frame's budget.**
Neither backend is anywhere near being the bottleneck at the load this product produces.

The bundle consequence, projected into §B.1 scenario 3 (game runtime vs an equivalent
Three.js stack, limit 1.5x):

- cannon-es: 95,153 B vs three 143,669 B = **0.662x — PASSES**
- Rapier: 898,104 B vs three 143,669 B = **6.251x — FAILS**

Trading a §B.1 release-gate failure for 1.6% of a frame nobody is losing is a bad trade.

### The Rapier bundle number is corrected in Rapier's favour

`@dimforge/rapier3d-compat` base64-inlines `rapier_wasm3d_bg.wasm` into `rapier.mjs`
(verified: one 2,092,784-char base64 literal). Base64 costs ~33% before compression, so
scoring Rapier from the compat bundle would overstate its cost. Measuring the non-compat
delivery — glue JS with the literal stripped, plus the raw `.wasm` gzipped as a browser
receives it:

- glue JS: 26,594 B gzip
- wasm as a separate asset: 586,267 B gzip
- **fair total: 612,861 B gzip**

Still **22.7x** cannon-es. The conclusion survives its own fairness correction; it is not
a packaging artifact.

---

## The multi-backend question, answered explicitly

The PRD requires this answered either way. **Answer: no multi-backend abstraction.**

An abstraction is only cheap when the backends agree. Three measured dimensions diverge,
and each must be either *hidden* (the stronger backend's capability becomes unreachable) or
*exposed* (the contract is not backend-neutral):

1. **CCD.** cannon-es raw stepping does not stop a 400 m/s body; Rapier's native swept CCD
   does. `setCcdEnabled` would mean two different things — identical user code, different
   physical outcomes. (`ccdSpeedThreshold` is **not** a cannon-es 0.20.0 `Body` property —
   verified `"ccdSpeedThreshold" in new Body() === false` — so this is a real library
   limitation, not harness misconfiguration.)
2. **Character controller.** Rapier ships one; cannon-es ships none. A contract-level
   character controller is either hand-written for one backend or delegated for the other,
   never one implementation.
3. **Worker offload.** Rapier's WASM linear memory is transferable; cannon-es state lives
   in JS objects with no documented path across a thread boundary.

Shipping both also sums the bundles.

**Aura3D has already paid for this exact mistake.** `PhysicsWorld.ts:682-685` records
joints being "a silent no-op" on the default backend while the `aura-js` branch solved
them — tests green on a path users never took. That is precisely a divergence an
abstraction hid. Building a second, larger version of that machinery is not justified.

What ships instead:

- **one** production solver (`cannon-es`), and
- **one explicitly non-physical arcade-motion mode**, which is **not** a physics backend
  and must never be documented as one.

---

## Consequences for the rest of Phase 4

- **WS-4.3** — remove the `aura-js` branch entirely. Do not repair it; the joint no-op
  divergence class must be impossible, and deleting the second solver is what makes it
  impossible. Keep the adaptive-substep CCD mitigation already shipped in
  `apps/common/src/cannon-physics-proof.ts` and move it below the public contract, because
  raw cannon-es tunnels and the contract must not.

  **Done.** `PhysicsBackend` is now a one-member union, `disableCannonBackend` and the
  second integrator (`resolveContact` / `applyImpulsePair` / `effectiveMaterial`, and
  `step()`'s call to `RigidBody.integrate`) are deleted, and `PhysicsBackendSelection` no
  longer has `fallback` or `jsFallbackAvailable` to report. Passing the removed
  `"aura-js"` string now throws by name rather than quietly selecting a different solver,
  and an inexpressible collider shape throws at `createCollider` instead of downgrading the
  whole world mid-scene. Enforced by `tests/unit/physics/single-solver-ownership.test.ts`
  (7 assertions, source-level and behavioural) and by the R12 physics row in
  `tools/negative-complexity/index.ts`, which now counts the union's members rather than
  grepping for a string — the earlier substring form would have been satisfied by this
  paragraph. R12 violations: 3 of 5 → 2 of 5.

  All 19 `backend: "aura-js"` test pins were rewritten to the production backend and pass
  unchanged, which is what the WS-4.3 classification run predicted: 114 of 114 rows
  `contract`, 0 `characterization`. `tools/physics-test-classification/index.ts` is retired
  — its input was the pins themselves, so it can no longer run; the measured report at
  `tests/reports/physics-test-classification/report.json` is retained as the evidence.
- **Character controller** — stays ours by necessity; cannon-es ships none. It is now
  load-bearing rather than duplicated, so it needs the WS-4.3 grounding/slope/step tests.
- **Vehicle** — cannon-es ships `RaycastVehicle` and `grep` proves we use none of it while
  hand-writing 1,081 lines (`VehicleDynamics.ts` 553 + `VehicleMotion.ts` 528), which
  `game.racing` does not consume. Evaluate `RaycastVehicle` for the suspension/contact
  layer under WS-4.3 and keep our racing-line/telemetry work above it (WS-4.4).
- **Nine invariants** — all nine must pass on cannon-es, including the two it fails or
  lacks natively (tunnelling, character grounding). Those are now implementation
  obligations, not "the backend handles it".

---

## When to revisit

Reopen the bake-off if **any** of these becomes true:

1. A shipped route's measured body count exceeds ~2,000, where the per-step gap stops being
   1.6% of a frame.
2. Aura3D's total bundle reaches §B.1 with enough headroom that +586 KB of wasm still
   passes — i.e. physics stops being the marginal cost.
3. Rapier ships a slim build materially smaller than the current wasm.
4. A product requirement appears that cannon-es structurally cannot serve: worker-threaded
   stepping, or cross-platform bit-identical determinism as a contractual guarantee.

Re-run `npx tsx tools/physics-backend-bakeoff/index.ts` and amend this file with new
numbers. Do not change the decision without them.

---

## Rejected reasoning

- ~~"Rapier is more modern / Rust / WASM, therefore better."~~ Not a measurement. It **is**
  the better solver; it lost on delivered bytes, which is the dimension this product is
  currently failing.
- ~~"We already wrote a solver, so keep `aura-js`."~~ Sunk cost, and it is the source of the
  joint no-op defect (R6: line counts are observations, not targets).
- ~~"Support both, let users choose."~~ Three measured divergences make the abstraction a
  permanent compatibility burden, and Aura3D has already shipped one silent-divergence bug
  from exactly this design.
