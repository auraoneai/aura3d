# Aura3D 1.1 Cartoon Studio Progress

Version: 1.1
Date started: 2026-06-06
Source PRD: `docs/project/aura3d-1.1-cartoon-studio-prd.md`

This file tracks verified implementation progress for the 1.1 Cartoon Studio PRD. A checkbox is marked only when source changes and verification evidence exist in the current worktree.

## Current Verified Items

- [x] Detailed 1.1 PRD exists at `docs/project/aura3d-1.1-cartoon-studio-prd.md`.
- [x] Documentation index links the 1.1 PRD.
- [x] Site map links the 1.1 PRD.
- [x] Failed image-puppet proof is explicitly rejected by the PRD.

## Active Parallel Lanes

| Lane | Scope | Status | Verification required |
| --- | --- | --- | --- |
| 1 | `cartoon-studio` template render/package/review scripts | Complete for encoded WebM package proof | `npm run episode:render`, `npm run episode:package`, and `npm run episode:verify` write/verify the package. |
| 2 | Engine package, route-proof, and motion-quality APIs | Complete | Unit tests pass for package validation, route proof, and motion gate. |
| 3 | CLI/cartoon asset readiness | Complete | `assets validate-cartoon --episode --require-license --no-placeholders` passes in the template and external smoke. |
| 4 | Docs and claims | Complete | Docs describe 1.1 workflow and reject still-image puppet proof. |
| 5 | Release tools/readiness gates | Complete for current package proof | `pnpm aura3d11:readiness` passes with package, visual, motion, docs, and expanded external template smoke gates. |
| 6 | Failed-puppet cleanup and browser specs | Complete | Release-facing scripts omit failed puppet routes; browser specs exist. |

## P0 PRD Checklist Progress

- [x] `cartoon-studio` template is the main 1.1 template.
- [x] Clean external scaffold installs and builds.
- [x] Three typed assets are resolved or supplied by a license-clean starter pack: `miko`, `luma`, `moonGarden`.
- [x] `assets validate-cartoon --require-license --no-placeholders` passes for the episode.
- [x] Episode route uses `model(assets.x)` and public `@aura3d/engine` APIs only.
- [x] Route proof exposes shots, captions, visemes, gestures, assets, render status, errors.
- [x] All shots can be scrubbed in browser tests.
- [x] Captions render within one frame of dialogue timing.
- [x] Mouth movement is visible during dialogue.
- [x] Characters move independently during action beats.
- [x] Global-only still-image motion fails.
- [x] `episode.webm` is produced and playable.
- [x] `thumbnail.png` is captured from actual route state.
- [x] `captions.vtt` and `captions.srt` are exported.
- [x] `metadata.json`, `asset-provenance.json`, `route-proof.json`, `prompt-animation-evidence.json`, `visual-acceptance.json`, and `render-manifest.json` are written.
- [x] Package validation passes for the encoded WebM package.
- [x] Human review package is generated.
- [x] Docs/README/llms explain exact commands and limits.
- [x] Release readiness fails if source-only proof is used as publish proof.
- [x] Release readiness fails if `notTrue3D: true` routes are counted as success.

## Notes

- The 1.0.10 `cartoon-image-puppet-animation.webm` experiment remains rejected evidence. It may be kept only as a negative fixture proving the 1.1 motion gate fails global still-image motion.
- Current encoded package proof: `packages/create-aura3d/templates/cartoon-studio/dist/episodes/moon-garden-001/episode.webm` is VP9 WebM, 1280x720, 30fps, 60 seconds, and 2.4 MB. `tests/reports/aura3d11/readiness.json` is `ok: true` with expanded clean-project smoke included.
- The external smoke report `tests/reports/aura3d11/cartoon-template-smoke.json` now proves `scaffold`, `install`, `asset-validate-cartoon`, `episode-plan`, `episode-preview`, `episode-package`, `episode-review`, `build`, and `test` all exit 0 in a generated project.
- Remaining open PRD rows are primarily broader engine/editor/audio/P1/P2 work: real MediaRecorder/WebCodecs playable adapter proof, MP4 output, typed dialogue audio assets, review UI editing, waveform/manual viseme editing, cloud/upload, mocap, and nonlinear animation editing.
- This progress file does not replace the PRD. The PRD remains the full source of scope.
