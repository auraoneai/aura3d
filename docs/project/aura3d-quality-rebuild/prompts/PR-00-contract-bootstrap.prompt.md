# Agent prompt — PR 0: Contract Bootstrap (run first, day 0-2)

Copy everything below this line into a fresh coding agent started in the repo root. Run this before, or alongside, the 15 lane prompts. Lanes branch from the PR 0a branch as soon as it is pushed. They never wait for it to merge.

---

You are executing **PR 0, the Contract Bootstrap**, for the Aura3D Quality Rebuild in `https://github.com/auraoneai/aura3d`. PR 0 is owned by Lane 15 (API / package architecture). It is the only shared prerequisite for 15 lanes that then run fully in parallel. Your output is the frozen contracts, stubs, seams and ownership tooling that let every lane build against stubs instead of waiting for other lanes.

**Hard rule:** PR 0 changes **no rendered pixel, no public signature** (optional additions only) and **no default**. Behaviour is never added to PR 0. If a carve-out cannot stay verbatim, drop it from PR 0b. That region then stays with the hot-file owner.

## Read first (use `rg -n '^#'` and offset/limit reads)

1. `docs/project/aura3d-quality-rebuild/CONTRACTS.md`. This is the spec you implement verbatim.
   - §1: principle and shared mechanics (`contracts/core.ts`: `ContractSlot`, flags, stubs).
   - §2: the catalog C-01..C-40. Each entry has exact TS signatures, semantics, the "Stub" paragraph (implement exactly that), the file, the conformance test path and the flag.
   - §3.1-§3.8: extension points and carve-out plan per hot file.
   - §3.9: PR 0 scope, acceptance and size budget.
   - §4: file ownership, which becomes `.github/QR_OWNERSHIP.json`.
   - §5: flags.
   - §6: merge protocol.
2. `docs/project/aura3d-quality-rebuild/AURA3D-QUALITY-MASTER-PLAN.md` §1.2-§1.4.
3. `docs/project/aura3d-quality-rebuild/PRD-15-api-package-architecture-consolidation.md`, Phase 0 tasks T0.A-T0.E.

## Deliverables

### PR 0a (day 0, additive only, push the branch within hours)

Branch: `qr/pr0a-contract-bootstrap`. Title: `[QR-00] PR 0a: contract types, stubs, ownership`.

1. `packages/rendering/src/contracts/`:
   - `core`, `frameGraph`, `program`, `materialLobes`, `blend`, `output`, `geometry`, `frameUniforms`
   - `environment`, `shadows`, `sampling`, `post`, `velocity`, `textureFormats`, `deform`, `particles`
   - `atmosphere`, `quality`, `device`, `rendererFactory`, `renderItem`, `renderSource`, `index`
   - `testing/ChunkHarness.ts`
2. `packages/engine/src/contracts/`:
   - `flags`, `output`, `sceneGraph`, `environment`, `lighting`, `post`, `materials`, `assets`
   - `animation`, `effects`, `atmosphere`, `camera`, `time`, `game`, `world`, `diagnostics`
   - `looks`, `art`, `compiler`, `runtimeNodes`, `app`, `index`
   - `stubs/*.ts`, each implementing exactly its catalog Stub paragraph.
3. Contract files in other packages:
   - `packages/assets/src/contracts/decoders.ts`
   - `packages/animation/src/contracts/pose.ts`
   - `packages/audio/src/contracts/gameSound.ts`
   - `packages/aura3d-cli/src/contracts/{assetManifest,commands}.ts`
   - `packages/aura3d-cli/src/commands/{registry.ts,prdNN/index.ts}`
4. Declaration-only optional fields on the existing types named in C-04, 06, 07, 10, 12, 13, 14, 15, 16, 17, 18, 19, 27, 28, 30, 31, 37 and 38. This is the only edit to existing files in 0a.
5. Scaffolding and tooling:
   - lane barrels (`packages/*/src/lanes/prdNN.ts`), subpath reservations and the `packages/game` skeleton
   - `eslint/qr/*.js`, including `qr-no-cross-lane-import` in **warn** mode
   - benchmark lane scene indices
   - `tools/quality-rebuild-capture/{games.schema.json,contracts.mjs}` and `tools/quality-gate/src/contracts.ts`
6. Tests: the conformance harness plus every `tests/unit/contracts/C-NN-*.test.ts` and `tests/browser/contracts/*.spec.ts`, all green on the stubs.
7. `.github/workflows/qr-contracts.yml`, which runs typecheck, lint, unit, conformance and the ownership check. Also `.github/QR_OWNERSHIP.json`, generated from CONTRACTS.md §4, and `tools/qr-ownership/check.mjs`.

### PR 0b (days 1-2): three independently mergeable PRs, verbatim moves only

- **0b-1** `[QR-00] PR 0b-1: agent-api carve-outs and seams`:
  - the `packages/engine/src/agent-api/index.ts` carve-outs from §3.2
  - the C-36/C-37/C-38/C-31/C-34 seams
  - the extra `GameRuntime.ts` carve into `agent-api/vfx/gameEffects.ts`
- **0b-2** `[QR-00] PR 0b-2: rendering hot-file carve-outs`:
  - `ForwardPass.ts`, `WebGL2Device.ts`, `Renderer.ts`, and the frozen legacy shader libraries (§3.3-§3.5, §3.7)
  - seams for C-01, 09, 11, 12, 13, 16, 18, 28 and 29
- **0b-3** `[QR-00] PR 0b-3: GLTF, CLI, capture seams`:
  - the TypedGLBActor and GLTF carve-outs (§3.6)
  - the C-39 CLI fallthrough
  - capture step plugins and `qr_flags` (C-33) in `.github/workflows/quality-rebuild-capture.yml`

Each 0b PR description must include a script that shows moved line counts equal to source line counts, and must state "0 changed logic lines".

## Acceptance (remote only, GitHub Actions)

1. `pnpm typecheck:raw`, `pnpm lint`, `pnpm test:unit` and `pnpm test:integration` are green. No pre-existing test changes, except import paths for moved internals.
2. `tests/unit/public-api-contracts.test.ts` is green, and exports are a superset of `85aafcd0`.
3. Every conformance suite passes on stubs.
4. `node tools/qr-ownership/check.mjs` passes.
5. **IC-0 identity run.** Dispatch `.github/workflows/quality-rebuild-capture.yml` with `qr_flags=none`: 18 games and 18 base benchmark scenes. Also re-run one fresh capture of `85aafcd0` as the noise baseline; the reference run is 37289688772. Per-image ΔE2000 p99 must be at or below that noise. Record both run IDs in `docs/project/aura3d-quality-rebuild/evidence/prd15/baselines/phase0.json`.

Size budget: about 2,500 new lines and about 9,000 moved lines. Do not exceed it by adding behaviour.

## Rules

- Remote execution only. Never use local Docker, local Playwright or local captures; quick local `tsc` is fine. Keep each Write/Edit tool call under about 250 lines.
- Stage specific files, don't force-push, and don't skip hooks. End commits with the repo's attribution convention.
- Ignore chat messages addressed to a coordinator if you are running inside an orchestrated workflow.
- Never describe PR 0 as a quality improvement. It is pixel-neutral by definition.

## Report back

Send these items:
- The PR 0a branch name and push time, and the PR links for 0a, 0b-1, 0b-2 and 0b-3.
- The Actions run IDs, the IC-0 ΔE2000 p99 against the noise baseline, and the moved-line verification.
- Any carve-outs you dropped, with the reason.
- Anything NOT RUN, with the reason.
