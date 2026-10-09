# PRD-13 evidence — PR A (T0.1–T0.3)

> **Run-id status (P-57):** no passing remote run id is cited in this file yet; every claim below is recorded NOT RUN until the proving lane-workflow/GitLab run is linked here. File moved from `evidence/prd13/` → `docs/project/aura3d-quality-rebuild/evidence/prd-13/` (13-EVID).


Lane 13 Phase-1 day-0 deliverables. This is a **baseline record**, not an approved
golden.

## T0.1 `tools/agent-templates/capture-templates.mjs`

- Builds every `packages/create-aura3d/templates/<id>` (19 discovered) from packed
  release tarballs: `node tools/release/publish-all.mjs --pack-only` (read-only),
  then per template installs the transitive `@aura3d/*` tarball closure with
  `npm install --no-save` in a scratch scaffold under `out/<ts>-template-lookdev/work/`.
- `npm run build` → `vite preview --strictPort` → Playwright Chromium capture.
- C-33 conventions: readiness = `__AURA3D_GAME__?.state === "playing"` first, else
  the instrumented `__QRC__` draw probe / `__AURA3D_LIVE_APPS__` drawCalls, else the
  6 s no-signal fallback; flags via `a3d-qr=<list>` only (no `?capture=` keys).
- 3 shots (opening/mid/action) × 2 viewports (1920×1080 DPR 1, 390×844 DPR 3
  mobile+touch Pixel-8 UA) → 19 × 6 = 114 PNGs + `report.json`
  (`aura3d.template-lookdev/1`: template, shot, viewport, sha256, flags, run id,
  `ciProvider`, `browserChannel`, environment block).
- Verified locally: `node --check`, `--list` (19 ids), `--skip-pack` error path.
  Remote execution only: first full run is the `template-lookdev.yml` workflow on
  macos-14 (link pending in `benchmarks/agent-eval/baseline/README.md`).

## T0.2 `.github/workflows/template-lookdev.yml`

- `workflow_dispatch` (templates/qr_flags/skip_pack inputs) + `push` to `main`
  scoped to template/tooling paths. No `pull_request` trigger → no secrets and no
  untrusted fork code. `macos-14`, ANGLE Metal (`QRC_GPU_ARGS`), Node 22, pnpm
  11.1.3, `pnpm build:raw` before pack (tarballs ship `dist/`), artifacts always
  uploaded (`template-lookdev`, 30 d).

## T0.3 `benchmarks/agent-eval/prompts.json` + unit test

- 12 §18.3 prompts verbatim: 3 product / 2 character / 2 environment / 4 game /
  1 cinematic; `allowedAssets` only on P01 (`benchmark/assets/sneaker.glb`);
  non-game prompts carry the 12 `AGENT_LOOK` rubric categories, game prompts carry
  all 27 C-32 `GAME_VISUAL_CATEGORIES` + `controls` + `game_feel`;
  `referenceFrames` = threejs.org example ids.
- `tests/unit/tools/agent-eval-prompts.test.ts`: schema, unique `P\d{2}` ids,
  verbatim text, category counts 3/2/2/4/1, rubric categories ⊆
  `GAME_VISUAL_CATEGORIES ∪ {controls, game_feel}`, P01-only `allowedAssets`,
  `benchmark/assets/sneaker.glb` on disk, `referenceFrames` shape.
- `pnpm exec vitest run tests/unit/tools/agent-eval-prompts.test.ts` → 7/7 pass.
- `pnpm exec eslint` on the new files → clean. `pnpm typecheck:raw` → clean.

## Flags

- Captured pages read flags from `a3d-qr` URL param only. First look-dev run uses
  `none`; `--flags` also accepts `all` or an explicit list for later rounds.
- PR A changes no engine/template runtime behaviour; flag-off byte identity is
  unaffected (S9).

## NOT RUN

- Full 19-template capture run — runs only inside `template-lookdev.yml` on
  macos-14 (PRD-13 §17); first green run is linked in
  `benchmarks/agent-eval/baseline/README.md` once the workflow lands on `main`.
