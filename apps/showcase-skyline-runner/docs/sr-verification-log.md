# Skyline Runner — incorporation verification log (05-Skyline-Runner)

Executed 2026-08-21/22 against the working tree containing this PRD's changes.

| Task | Verification | Result |
|---|---|---|
| SR-01 | Constraint note committed (docs/sr-constraints.md) | DONE |
| SR-02 | Ghost: app typecheck; unit round-trip; mounted visibility via seeded replay | PASS |
| SR-03 | Foliage/sparkle planners deterministic; pools render per act | PASS |
| SR-04 | Backdrop chunks = 20, two LOD levels, hysteresis 0.4 | PASS |
| SR-05 | Gates = 4 text3D nodes at act boundaries | PASS |
| SR-06 | Sensors = 6 boxes containing radial triggers; kit behavior untouched | PASS |
| SR-07 | 3 ambience stems CLI-registered (grove/steel/crown); buses + summit ducking live | PASS |
| SR-08 | Memo docs/sr-a7-moving-platforms-decision.md (NO-GO) | COMMITTED |
| SR-09 | New units: skyline-ghost / skyline-relay-sensors / skyline-foliage-instances = 22 green; existing skyline units = 31 green incl. the 70-115s window proof | GREEN |
| SR-10 | Playwright: ceremony spec (2 tests incl. incorporations) + motion spec = 3 passed in 2.6m; evidence in tests/reports/skyline-ceremony-evidence/ | GREEN |
| SR-11 | App build succeeded; README + evidence checklist updated | DONE (see deploy note) |

## Deploy verification note (honest record)

Command executed per showcase-evidence-checklist.json:

```
pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy \
  --dist apps/showcase-skyline-runner/dist --release \
  --source apps/showcase-skyline-runner/src \
  --asset showcaseKenneyOobiPlatformerHero \
  --asset showcaseKenneyVerdantPlatformerWorld
```

Outcome: BLOCKED, and the blockers are pre-existing asset-probe state, not this
PRD. Every blocking message cites only the two certified models (stale rendered-
probe sha256/color buckets, hero foreground size, world grade/bounds/textures).
The incorporations touch neither asset: git show HEAD:aura.assets.json vs the
worktree proves both entries are byte-identical to HEAD, while the only manifest
delta from this PRD is the three new ambience audio entries. Regenerating those
probes is the release-asset-probe pipeline plus the human visual review the PRD
checklist deliberately leaves open.

## Contract invariants held

- src/generated/game-geometry.ts: byte-identical (no diff).
- Level/motion tuning: untouched; finish-frame window proof still green.
- Existing ceremony/traversal assertions: unedited and passing.
- Route label: unchanged (createAuraApp / prototype-blocked).
