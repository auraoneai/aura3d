# Q-03-12 — phase-6 browser probes fail on merged main (post-plan antiAlias / autoExposure / custom pass)

**Requesting lane:** 15 (T8.2 gate triage, PR #357)
**Owning lane:** 03 (PRD-03 post pipeline + the spec itself, `d4f65a884`)
**Blocking:** `Lane 03 browser specs` job red on every run; assertions were never
exercised before lane 15's dev-server bundle fix made beforeAll reach the probes.

## Observed (CI job 112813386842 and local SwiftShader run, identical numbers)

1. `SMAA smooths thin-wire edges` — `r.smaa.ratio === r.none.ratio === 0.0068125`.
   Root cause on the harness side was a dead `...(opts.antiAlias ? {} : {})`
   spread: `mount({antiAlias:"smaa"})` never added the
   `effects.antiAlias({mode:"smaa"})` scene node, so the two mounts were
   identical. Lane 15 fixed the harness (its owned file) to attach the node,
   matching the phase-4 `mode:"taa"` pattern — **but the SMAA ratio is still
   identical to the none baseline after the fix**, and the app post
   diagnostics report `antiAlias: null` with only `tone-mapping` submitted,
   i.e. the authored anti-alias node is not reaching the production bridge's
   post plan.
2. `auto-exposure settles within 0.1 EV in ≤ 1.5 s` — `settleSeconds = 0`
   (first 10 frames already inside the band, i.e. no adaptation happened).
   `output.autoExposure` is forwarded; the meter path never engages.
3. `custom pass at after-tonemap inverts red` — `|after[0] − (255−before[0])| = 201`;
   `app.addPostPass` (flag-on `Prd03PostSurface.addPostPass` → `registerPostPass`)
   is accepted but the pass never executes (same `post-graph-v2-pending` state
   diagnostics show for `prd10.underwaterDistortion`).

## Why this is not a lane-15 regression

- Harness/spec are byte-identical to main (`d4f65a884`, landed 2026-10-07) except
  lane 15's diagnostics additions and the anti-alias wiring fix above.
- `git diff origin/main...HEAD` over `packages/rendering/src/post/**`,
  `packages/engine/src/agent-api/postBridge.ts`, `compiler/postprocess.ts` is
  empty — T8.1 removed deprecated wrappers/exports only.
- The same numbers reproduce on SwiftShader locally and ANGLE Metal in CI.

## Requested of lane 03

Verify on a current-main browser run: (a) `effects.antiAlias({mode:"smaa"})`
produces a submitted smaa stage in `app.diagnostics().post.submittedPasses`,
(b) `output.autoExposure` adaptation engages (non-zero settle), (c) a
registered `addPostPass` descriptor leaves `post-graph-v2-pending` and reaches
`pixelBackedPasses`. If any is genuinely unimplemented in the merged tree,
mark the spec `untested`/skip until the Phase-6 features land rather than
shipping a red `Lane 03 browser specs` lane.
