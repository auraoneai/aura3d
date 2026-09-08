# muse3jsparity completion audit — 2026-09-05

Verdict: **not completed in full**. The retained release evidence supports a successful bounded 3.0.0 build, but does not close every original PRD requirement. Several checked items describe reduced scope, and the readiness aggregator can return `supersede` with blocked parts.

## Scope and method

Audited `muse3jsparity-PRD.md` and its byte-identical archived copy, current source/tests, retained JSON reports, and release history. Worktree HEAD: `137280b3705e1968a35ddd1c891329e06199597e` (release close-out). Tag `v3.0.0`: `c71aff6e9a82948d5474c424e79182a37fe428c2`. The PRD reports a later validation freeze at `16ea94f0`; the readiness JSON itself has no source-commit binding.

This was a read-only implementation/evidence audit, apart from this report. No new build, browser suite, publication, or cloud deployment was executed. Historical test results below are retained receipts, not tests rerun by this audit. Current live registry/deployment status was not independently rechecked.

## Retained successful evidence

- `tests/reports/unit.json`: 4,417/4,417 passed, zero failed or pending.
- `tests/reports/integration.json`: 11/11 passed.
- `tests/reports/agent-templates.json`: 149 checks, 19 scaffold smokes, `pass: true`, workspace source aliases.
- `tests/reports/installed-template-lifecycle.json`: 149 checks, 19 scaffold smokes, `pass: true`, fresh local 3.0.0 tarballs.
- `tests/reports/muse3jsparity/readiness.json`: generated 2026-09-05 15:05:27 UTC, all 14 recorded gates pass.
- `release-artifacts/3.0-npm-registry-verification.json`: 29 expected and verified packages, version 3.0.0, `ok: true`, recorded 2026-09-05 14:25:39 UTC.

These supersede some old red-suite and unfinished-lifecycle notes in the PRD. They do not establish full scope completion.

## Confirmed completion gaps

| Area | Required result | Actual evidence / implementation | Finding |
| --- | --- | --- | --- |
| K2 aggregate | Trustworthy per-part and overall readiness | `tools/muse3jsparity-readiness/index.ts:255-279` sets uncovered parts to blocked, then computes overall solely from recorded gate results. Retained report has E/H/I/U blocked and overall supersede. | Overall success does not mean every part passed; coverage missing for animation, physics, input/audio and resource/recovery parts in this aggregate. This is not proof those implementations themselves fail. |
| K1 comparison | Same-scene r185 feature comparisons including bloom, night lighting, water, decals, SDF text, particles and camera effects, with deltas/SSIM | `tests/browser/game-visual-superiority.spec.ts:302` uses a 96-box comparison. `tests/reports/muse3jsparity/head-to-head.json` explicitly says no similarity threshold is asserted. Perf harness is explicitly workload-class microbenchmarks, not end-to-end Aura frame times. | Passing K1 does not establish the requested feature-by-feature visual superiority. |
| A1 root async | Root-only sync and async fused-path proof | PRD line 43 explicitly substitutes rendering-package async proof because no root route drives renderAsync. | Package proof exists; original root async requirement is unfulfilled. |
| A3 / J2 postprocess | All requested root effects pixel-backed; WebGPU TAA parity | `packages/engine/src/agent-api/index.ts:4451,4462` explicitly withholds motion blur and TAA for absent velocity/history bindings. `docs/rendering/webgpu-current-architecture.md:46` says TAA remains unproven. | Honest diagnostics are implemented, but requested rendering functionality/proof remains incomplete. |
| A4 particles | 10,000-particle scene sustaining 60fps with collision and trails | `tests/reports/gpu-particle-a4-fps.json` records 4,500 live particles over 180 frames (~3 seconds). Test checks configured capacity 10,000 and live count >1,000 (`tests/browser/gpu-particle-a4.spec.ts:516`). | Receipt does not prove 10,000 simultaneously live particles at the target frame rate. |
| C1 material maps | Root promotion of clearcoat/sheen/iridescence/anisotropy texture maps | `AuraMaterialSpec` and production texture intent expose basic PBR texture slots; extension settings remain scalar (`packages/engine/src/agent-api/index.ts:1030,1052,13499`). | Basic textured PBR proof is narrower than the requested extended texture-map surface. |
| F1 controls | Damping/zoom-to-cursor/pan-bound gaps closed | `docs/controls/interaction-and-picking.md:53` still labels Orbit damping and zoom-to-cursor GAP. | Documented omissions remain despite checked section status. |
| F2 adoption | Turbo, Skyline and Aura Clash adopt follow/shake/punch-in | PRD line 465 explicitly says Aura Clash remains open and substitutes a two-route minimum. | Original named three-route adoption incomplete. |
| N1 adoption | Night-cinematic and Aura Clash use root spotlights | Evidence uses street/arena rigs in a test harness (`tests/browser/root-spot-shadow-n1.spec.ts:23`). Source scan found no `lights.spot(` adoption in apps/templates. | Harness proof does not satisfy named production-route adoption. |
| N4 labels | Role-specific collision spacing affects real label placement | PRD line 768 explicitly leaves minGap plumbing into resolveLabelCollisions open; role tuning is not connected to actual collision resolution. | Exported tuning/telemetry is not full behavioral integration. |
| P2 adoption | Smart City plus crowd scene use instanced GLBs | New `instanced-model-p2` browser proof exists and closes the earlier missing-pixels issue. Source scan found no `instances.model` adoption in apps/templates. | Core instancing proof improved; requested route adoption remains absent. |
| S decoder alignment | Required companion decoder versions aligned | Matrix records meshoptimizer installed 1.1.1 versus r185 1.2.0, with re-pin deferred (`benchmark/context/muse3jsparity-r185-matrix.json:24`). | Disclosing a divergence is not completing the requested alignment. |
| T3 framegraph passes | Each former stub owns real pass logic, or is removed and references updated | `OpaquePass.execute` only validates context and increments counters (`packages/rendering/src/production-runtime/passes/OpaquePass.ts:58`); peers use the same bookkeeping model. | Nonempty methods and graph metadata do not satisfy the required rendering-pass implementation. |
| L4 visual approval | Independent human approval bound to exact 3.0.0 artifacts | PRD line 1224 explicitly remains open. Existing `2.0-final-visual-review-approval.json` applies to an August 12 manifest and different commit/hashes. | Older approval cannot close this requirement. |

## Additional source-confirmed shortfalls

- **B4 reflection-surface SSR:** `createSsrPassDescriptor` in `packages/rendering/src/PlanarReflection.ts:659` validates and returns configuration; it does not implement the requested ray-marching pass. `packages/rendering/src/ReflectionSurfaces.ts:296` explicitly says no depth/normal ray-march pass is created. This finding is specific to B4; a separate bounded native postprocess SSR implementation exists.
- **B1 shimmer evidence:** `tests/browser/contact-shimmer-b1b2.spec.ts:64` performs 3,600 pure cascade-selection samples, followed by 24 rendered GPU frames at line 100. This is narrower than a sustained 60-second rendered moving-camera shimmer test; requested shimmerScore diagnostics also remain absent.
- **E2 locomotion proof:** `tests/unit/assets/gltf-root-motion-real-clip.test.ts:43` tests an in-place clip with zero travel, not translated locomotion with measured foot slip and nav/physics integration. `packages/animation/src/HumanoidRetargeting.ts:134` retains an empty correction-profile registry. The PRD explains the measured decision not to invent profiles; that is a scope adjustment requiring explicit accounting, not literal delivery of per-rig profiles.
- **O1 crowd LOD:** `NavigationCrowds.ts:196` classifies agents into distance tiers. The browser harness creates spheres and only updates their positions (`tests/browser/part-o1-navigation-crowd-harness.ts:114,172`); its test checks tier counts. The required visual switch to distant impostors/billboards is not proven or implemented by that classification.

## Tracking and evidence discrepancies

- Raw Markdown has 218 checked and 26 unchecked checkbox lines, including duplicated master-checklist items. This is not a completion percentage.
- Several master-checklist entries are stale relative to newer per-section receipts. K2's local checklist still says the first full run is open despite the later retained full report.
- The K1 library report still lists P2 rendered GLB proof as open, while the PRD and newer `tests/reports/instanced-model-p2/p2-result.json` document the subsequent browser proof. Do not treat that stale note as a current P2 rendering defect.
- The machine-readable matrix records 7 COVERED, 15 PARTIAL, 4 GAP and 10 OUT rows. Owned gaps and reasoned exclusions are valid tracking; they are not universal parity proof, and OUT items should not be counted as missing original in-scope work without checking their requirements.
- Readiness uses shared `tests/reports/browser.json` receipt paths and does not include source-commit/hash binding in its own JSON. Release notes' commit attribution cannot be validated from that JSON alone.
- `tests/reports/muse3jsparity/quarantine.json` retains an earlier two-strike library-spec failure even though the later full gate records that spec passing. Reconcile it as historical/resolved rather than declaring the later run failed.
- Existing 3.0.0 release notes distinguish the engine release from still-open showcase camera/framing/human-review gates. Those exclusions prevent interpreting publication as full PRD completion.

## Completion conditions

1. Make overall K2 readiness depend on required per-part coverage and verdicts; add concrete E/H/I/U gate coverage and regression protection for the demonstrated false-success case.
2. Restore original requirement traceability: each task gets implementation, exact test/receipt and final status; distinguish accepted scope changes from completed original tasks.
3. Implement the missing effects/material-map/label/pass behavior and route integrations, or explicitly obtain and record requirement changes.
4. Run the original workloads at their stated scope, including 10,000 live particles and the requested per-feature same-scene r185 comparisons. Bind receipts to the final source/artifact hashes.
5. Reconcile PRD/archive/report contradictions, then run appropriate full validation remotely under the repository execution policy.
6. Complete independent human visual review for the exact final route artifacts. Automated success cannot substitute for it.

No completion checkboxes or generated evidence were modified by this audit.
