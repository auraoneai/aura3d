# PRD-02 Phase 6 evidence — tiers, perf budgeting, kill switches

Branch: `qr/prd02-engine-composition` (stacked on `qr/prd02-math-modules` → `qr/prd02-lane-harness`).
Lane-owned paths only. `pnpm typecheck:raw` clean; `tests/unit/contracts/impl/` 134/134 pass
(incl. new `prd02-tier-budget.test.ts`, 17 tests).

## §6.5 surgical kill switches — `?a3dLighting=` (not flags)

PRD §22: `pmrem=cpu`, `atlas=off`, `shadowFilter=legacy-grid`, `shadows=off`,
`background=off` are **URL kill switches**, not QrFlags — plus `csm=off`,
`probes=off`, `contact=off` aliases for the three real sub-flags.

- `compiler/lights.ts` `readLightingKillSwitches(url?)` parses comma-separated
  `k=v` pairs; `=0|=off|=false` all mean off; a bare `?a3dLighting=0` (lane
  kill) does **not** poison the sub-switches. Returns all-on defaults when the
  param is absent.
- Compiled onto `source.shadow.prd02KillSwitches` (additive field on
  `Prd02ShadowOptions`) — flag-off paths never see it (`prd02KillSwitches?`
  optional, defaults preserved).
- Rendering side reads it via `readPrd02KillSwitches(source)`
  (`passes/Prd02SubFlags.ts`), a structural mirror of the engine type.

Consumption points (each verified by test):
| switch | gate |
| --- | --- |
| `shadows=off` | `prd02.shadows` contributor emits no pass |
| `atlas=off` | `collectShadowSystemLights` → sun kept, `localLights: []` |
| `csm=off` / `A3D_QR_LIGHTING_CSM=off` | `cascades` folded to 1 (single fitted map) |
| `shadowFilter=legacy-grid` | config `filter: "hard"` (unfiltered single tap) |
| `contact=off` / `A3D_QR_LIGHTING_CONTACT=off` | `contactShadowRequest` → null (veto over tier/opt-in) |
| `probes=off` / `A3D_QR_LIGHTING_PROBES=off` | `prd02.probes` contributor emits no pass |
| `background=off` | `collectEnvironmentBackground` falls back to `source.environmentBackground` |
| `pmrem=cpu` | echoed as `pmremMode` on `Prd02EnvironmentBinding` (CPU prefilter is the only impl today) |

`prd02SubFlagOff` distinguishes *explicit-off* from *unset* via
`QrFlags.values` — required for the contact sub-flag where unset defers to
C-27/`effects.contactShadows()` and explicit-off vetoes.

## §6.8 tier mechanics (item 1956)

- `resolveLightingTier(requested, ctx)`: `lighting.quality === "auto"` or unset
  → `ctx.quality.tier` (C-27); an explicit tier overrides. Per-light overrides
  ride `node.shadow` objects into `AuraLightDescriptor.shadowOptions`
  (C-10 surface; phase-2 tests cover the §6.8 value table).
- Tier change reallocates once:
  - shadows: `shadowSystemForDevice` disposes + recreates `Prd02ShadowSystem`
    only when the resolved config JSON differs (map size, cascades, filter…).
  - probes: `EnvironmentCache` keys entries by `(url|preset, tier)` and
    `neutral()` per tier → a tier change regenerates the probe at the new
    `environmentSize`.
- **No-allocation test**: `system.update` ×3 on an unchanged frame —
  `device.getDiagnostics().renderTargets` delta between update 1 and 3 is 0
  (C-28 `renderTargetsCreated` equivalent on the mock device).

## §17 timing spans (item 1957)

`Prd02LightingRuntime.lightingTimings()` returns the C-31 `lighting` section's
`timings` block:

```
{ pmrem, shadowCascade[], shadowLocal, contactShadow, background, probes }  — all null
timingsSource: "none"            // no per-pass GPU timer API on RenderDevice
timerQueryAvailable: boolean     // device.probe?.timerQuery capability
```

C-28 only exposes a capability flag (`probe.timerQuery`) — no timer-query
primitive exists, so every span is `null` per the item's "else null" clause;
the §17 toggle-delta method (`?a3dLighting=<switch>=off` A/B captures) is the
number source, recorded by the lane capture report (pending lane-side capture).

## Pending / seams

- §17 budget suite (item 1958) + timing-spans capture rows need the lane
  capture path on §19 devices (macos-14 CI) — same pending surface as the
  flag-none baseline; not claimed done.
- Real per-pass GPU timer queries: C-28 seam (no API on `RenderDevice` today);
  the `timings` block fills automatically once `timerQuery` gains a query call.
- `lighting.quality` override + per-light `shadowOptions` surface exists;
  per-light `mapSize` enforcement is bounded by the tier map size (no separate
  per-light atlas sizing — C-10 contract doesn't define one).

## §6.4 shadow logic halves (item 1912) — added post-phase-6

- `DirectionalCascadeFitter`: extent switched from light-space AABB to the
  **world-space bounding sphere about the point-set centroid** — the only
  rigid-motion-invariant fit, so a 10° camera yaw leaves each cascade's
  `radius` unchanged (≤1e-16 measured, spec ≤1e-5). `center` (texel-snapped
  light-space x/y of the centroid + depth mid) and `radius` are exported on
  `DirectionalCascadeFit` for the stability assertions.
- Fixed a pre-existing **double-centring bug** in the ortho projection: the
  view matrix already translates light-z by `-(min+max)/2` and the projection
  column subtracted it again, pushing off-frustum casters past z=1 in the
  biased [0,1]³ VP. The caster-50 m-behind-camera case now projects inside.
- `resolvePrd02ShadowCasterVariant`: `batched` now real (multi-instance
  `instanceTransforms` or `static-batch-*` label from
  `SceneOptimization.batchStaticRenderItems`); `alphaHash` = BLEND +
  `castShadow: true`; `doubleSided` and MASK→`alphaTest` (`u_alphaCutoff`)
  unchanged.
- New `prd02ShadowCasterEligible(item)` (§6.4 rule: `castShadow: false` always
  excluded; BLEND excluded unless `castShadow === true`) — wired into both
  `Prd02ShadowsContributor` and `Prd02ContactShadowsContributor` caster filters.
- Tests: `tests/unit/contracts/impl/prd02-{cascade-fitter,shadow-atlas,shadow-caster-variants}.test.ts`
  — 10/10 green (vitest 2026-10-06T17:11Z on qr/prd02-engine-composition).
  PCSS/Vogel kernel correctness stays browser-side (ChunkHarness, macos-14 CI).
