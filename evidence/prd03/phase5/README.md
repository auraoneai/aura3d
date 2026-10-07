# PRD-03 Phase 5 evidence — presets, C-27 tier map, post-v2 codemod

Branch `qr/prd03-phase5-*`, flag `A3D_QR_POST` (flag-off byte-identical — all
new behavior is flag-on or additive-only).

## Landed

- `packages/engine/src/agent-api/postPresets.ts` — the seven §6.8 presets as
  `AuraPostPreset` data (`prd03PostPresets`); `contracts/post.ts` `postPresets`
  is a live re-export (the PR-0a stub's own TODO). `expandPostPreset` merges
  `preset.output` under authored `output` (authored wins per field) and preset
  effect nodes under authored same-effect nodes via `postAuthored`
  (preset-only fields appended + recorded authored). agx/neutral presets emit
  `preset-capability-degraded` while C-05's operator selection is a stub.
- `packages/rendering/src/post/PostQualityTiers.ts` — `resolvePostTier` per
  the §6.8 tier×feature table; C-27 rows (msaa/AA/DPR/renderScale/bloomMips)
  are read off `QUALITY_TIERS[tier]`, never copied. The bridge gates GTAO /
  SSR / god rays / DoF / motion blur / grain / CA per the resolution and
  reports `post-tier-disabled` instead of silently dropping the stage.
- `post.setQualityTier` delegates to `app.quality.set` (C-27 surface duck-typed);
  `quality.onChange` re-records the tier so the next pipeline resolve re-tiers.
- `tools/quality-rebuild/codemods/post-v2.mjs` — complete per §10: write-mode
  rewrites (bloom field strip, `threshold<1 → 1.0 /* was */`, fxaa-antiAlias
  deletion incl. `.add(...)` wraps, `contactOcclusion → ambientOcclusion`
  merge, per-game `output.preset` insert) + the emissive luma×strength < 1.0
  audit (report only). `--dry-run` prints a per-file unified diff + the
  emissive report (additive branch in `commands/prd15/index.ts`, F-03-30).

## Codemod reports (`codemod/`)

`aura3d codemod post-v2 <glob> --report` over the real dispatcher:

- `codemod/<game>.json` — all 17 game showcases (`src/**/*.ts` — the PRD-14
  T1.10 dispatcher move put the real code in `src/legacy/main.ts`).
- `codemod/aura-clash-showcase.json` — `apps/aura-clash-showcase/src/**`.
- `codemod/neon-corridor-strike.json` — `examples/neon-corridor-strike/src/**`.
- `templates` are lane 13's (Q-13-1); reports attach to Q-14-1/Q-13-1.

Each report: `files`, `changed` (files the transform would rewrite),
`rows` (construct → exact/approximate/none + rewrite notes), `reports[]`
(per-file `emissive` audit + resolved preset). Nothing was written
(`--write` is lane 14's call under R21).

## Tests

- `tests/unit/contracts/impl/prd03-post-presets.test.ts` — id set = C-13,
  deterministic expansion/override order, capability-degraded, bridge-level
  expansion (pipeline option bags + diagnostics).
- `tests/unit/contracts/impl/prd03-post-quality-tiers.test.ts` — every
  tier×feature cell vs `QUALITY_TIERS`.
- `tests/unit/contracts/impl/prd03-post-v2-codemod.test.ts` — courier 296-297,
  deep-recovery 268-279, mech 689, bank-shot dual-AO fixtures; default file
  list = 17 games + Aura Clash + neon-corridor + templates; no non-game
  showcase listed.

## Deferred / not run

- Route captures (`?a3d-qr=post`/`none` × DSF1/DSF2/mobile on all 18 routes)
  run on the remote capture lane (`qr-prd03-captures.yml`), not in-session.
- F-03-01..05 rows already appended `proposed` in Phase 0; F-03-28..30 added
  here. `prd15/index.ts` + `contracts/post.ts` are lane-15 files — declared
  cross-lane touches (F-03-28, F-03-30).
