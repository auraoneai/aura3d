# PRD: Beat three.js, part 2 (remaining gaps after the 4.5.0 candidate)

Status: ready for parallel execution. Owner: Gurbaksh. Written 2026-10-28 against the `beat3js/integration` candidate that follows `docs/prds/beat-threejs/PRD-beat-threejs-performance-parity-and-proof.md` (part 1). Execution mode: zero-hostage; decisions are resolved from the repo and the measurements cited here.

Evidence base: `evidence/vs-threejs/RESULTS-candidate.md` (candidate run, software WebGL2, workspace-source build, one run), `evidence/vs-threejs/failing-rows-analysis.md` (the 86 "three.js better" rows by cause), `evidence/forest-10k/README.md`, `evidence/exposure-parity/README.md`, `evidence/vs-threejs/4.3.7/direct-path-parity.json`, `evidence/vs-threejs/4.3.7/pbr-viewer-fusion.json`, `tests/unit/aura3d-cli/migrate-three-fidelity.test.ts`.

Companion (not repeated here): `docs/prds/agent-first-authoring/PRD-agent-first-game-authoring.md` owns bundle size, requests on first load and first-frame init (its Track C, WP-C1 to C6). That is 42 of the 86 failing rows plus the init share of 8 more.

Claim policy: unchanged from part 1. No public surface says Aura3D is faster, lighter or higher quality than three.js until `node tools/bench-vs-threejs/gate.mjs` prints PASS for the targeted rows on a fresh run (T1 included), and any speed claim carries the software-WebGL2 qualifier until owner-run real-GPU receipts exist. Sales surfaces state only the Aura3D side with method.

---

## 1. Codebase Grounding & Autonomous Decisions

### Where part 1 ended (candidate gate, software WebGL2)

| Target | Result | Cause recorded in |
| --- | --- | --- |
| P1 cube frame <= 5 ms | 5.6 ms FAIL | `RESULTS-candidate.md`; about 65% of the frame is the harness `readPixels` wait |
| P2 cube CPU in `frame()` <= 0.5 ms | 1.1 ms FAIL | per-frame GL submission (39 GL calls, 1 draw) after `getError` sampling |
| P3 first frame <= 500 ms | 696 ms FAIL (source build) | needs a published-package run |
| P5 requests <= 8 | 33 FAIL (source build) | companion Track C |
| P6 forest | 212 s, 2.99x PASS (fragile, one run) | `evidence/forest-10k/README.md` |
| P7 real GPU | NO-DATA | owner step |
| M1 codemod | 164 / 47 / 0 FAIL | immutable math classes |
| T1 | 86 of 125 FAIL (target <= 30) | `failing-rows-analysis.md` |

### Code facts this PRD relies on

- **Bloom fusion (part 1, lane P1):** on `quality: "auto"` and `"cinematic"`, mips 1 to 4 blur in one 2-D pass, the five-mip sum is a single pass and the last upsample is folded into the composite; the PBR viewer drops from 33 to 24 draws (P4 met) with frames within 1/255 of `production`. On software GL the 2-D blur costs more fill: PBR viewer `aura-auto` 632.9 ms vs `aura-production` 407.0 ms vs three-msaa 322.3 ms. Real-GPU cost is unmeasured. Files: `packages/rendering/src/**` bloom passes, `tests/unit/rendering/bloom-pass-fusion.test.ts`.
- **Shadow cost:** `MAX_FORWARD_SHADOW_PCF_SAMPLES = 32` in `packages/rendering/src/ForwardPass.ts:278`; sample kernels are validated in `packages/rendering/src/forward/Lighting.ts` (around line 422). The forest camera fragment spends about 1.2 s per frame on shadow sampling and each depth pass about 280 ms on 282 draws.
- **Instance shadow proxies (part 1, lane P2):** `RenderItem.shadowGeometry` is used for nodes that cast shadows, are builtin primitives and have >= 1,024 instances; opt-out `shadowproxy=off` / `__A3D_SHADOW_PROXY__="off"`. Auto cascades cap at 2 for 8,192+ shadow-casting instances.
- **Contact shadows:** `effects.contactShadows()` lowers to the SSAO contact-occlusion pass because its mask has no shading consumer (`packages/engine/src/agent-api/postBridge.ts` `contactShadowsAsOcclusion`, `compiler/postprocess.ts` lines 64 to 74). The capability audit therefore keeps it `partial`.
- **Math classes** (`packages/math/src/{Vector2,Vector3,Matrix3,Matrix4,Quaternion,Euler,Color,Box3,Sphere,Plane,Ray,Frustum,...}.ts`) are immutable value types; three.js methods mutate and return `this`. `tests/fixtures/migrate-three/` has a `MutationSemantics` fixture proving `v.add(w);` is a no-op on Aura3D. `packages/math/package.json` exports only `"."`.
- **Exposure:** Q1 (skinned character) passes at 144.0 vs 136.2, but cube luma is 12.8 vs 2.9, PBR viewer 91.1 vs 55.0 and forest 119.6 vs 148.2 (3.2 fixture in `tests/unit/rendering/exposure-parity.test.ts` covers directional, ambient and hemisphere only).
- **Direct path:** `quality: "auto"` silhouettes differ from the HDR path by up to 48/255 on 0.1 to 0.3% of pixels (canvas MSAA resolves in display space, as three.js does); interior diff <= 2/255.
- **Remaining row counts** (see `failing-rows-analysis.md`): G3 frame time 17, G4 CPU 6, G5 draws/triangles/programs 11, G2 first frame 10, G1 bundle 42 (companion).

### Autonomous decisions

1. **Defaults follow measurement, not the draw-count target.** P4 is a means, not the goal: a render-path optimisation that adds fill and slows the scene on the only hardware measured must not be the default. WP-1 keeps the draw reduction that adds no fill and gates the 2-D blur behind a measured real-GPU result.
2. **Mutable three-compatible math ships as a separate subpath, never by changing the existing classes.** Existing `@aura3d/math` immutable classes keep their behaviour; the compat layer is `@aura3d/math/three` (new export) so no current consumer changes. The codemod points at it only for rows it can make exact.
3. **Exposure differences are attributed before they are "fixed".** Each of the three gaps gets a CPU-reference case; those traced to a bug are calibrated, those traced to an intentional default (neutral room probe) are documented and removed from the claim surface.
4. **No float of targets.** Targets below are the part 1 targets or direct restatements. A target that cannot be met gets its measured value and cause in `evidence/`, and the next PRD is cut from it.
5. **Owner steps stay owner steps.** Real-GPU captures and the three-author LLM batch (paid calls) are never started by an agent.

---

## 2. Data Model, API & Interface Contracts

### 2.1 Bloom fusion selection

```ts
// packages/rendering/src/contracts/quality.ts (extend)
export type AuraBloomFusion = "separable" | "fused-2d";
// "separable": existing per-mip separable blur; the fusions that remove draws without adding fill
// (five-mip sum in one pass, last upsample folded into the composite) stay on.
// "fused-2d": mips 1..4 blurred in a single 2-D pass. Off by default until a real-GPU receipt exists.
```

`app.diagnostics().renderPath` additionally reports `bloomFusion`. `quality: "production"` is unchanged.

### 2.2 Math compat subpath

```ts
// packages/math/src/three/index.ts, exported as "@aura3d/math/three"
export class Vector3 { x: number; y: number; z: number; add(v: Vector3): this; /* ... three r185 API ... */ }
// Same for Vector2, Vector4, Matrix3, Matrix4, Quaternion, Euler, Color, Box3, Sphere, Plane, Ray.
// Each class has fromImmutable(v) / toImmutable() to cross into @aura3d/math.
```

Fidelity is proven by goldens generated from real three@0.185.1 (`tests/fixtures/migrate-three/generate.mjs`), not by the class list.

### 2.3 Contact shadow mask sampling

`effects.contactShadows()` produces a screen-space mask that the forward lighting stage samples when present (`u_contactShadowMask`, multiplied into direct light only). When absent, behaviour is unchanged. `contactShadowsAsOcclusion` is removed only after the receipt passes.

### 2.4 Receipts

Same schema as part 1, section 3.5 (`evidence/receipts/<capability>/<version>.json`). Receipts are regenerated for the release minor; `node tools/receipts/check.mjs` lists those that are stale.

---

## 3. File-by-File Breakdown

### CREATE

| Path | Content |
| --- | --- |
| `packages/math/src/three/{index,Vector2,Vector3,Vector4,Matrix3,Matrix4,Quaternion,Euler,Color,Box3,Sphere,Plane,Ray}.ts` | WP-2 mutable classes. |
| `tests/unit/math/three-compat-parity.test.ts` | WP-2: every method against `tests/fixtures/migrate-three/goldens.json`. |
| `tests/unit/rendering/bloom-fusion-select.test.ts` | WP-1: `separable` vs `fused-2d` selection and draw counts. |
| `tests/browser/bloom-fusion-cost.spec.ts` | WP-1: PBR viewer frame time and draws for both modes, remote. |
| `tests/unit/rendering/shadow-filter-tier.test.ts` | WP-3: per-tier tap count and kernel validity. |
| `tests/browser/contact-shadow-mask.spec.ts`, `evidence/receipts/effects-contact-shadows/<ver>.json` | WP-4. |
| `tests/unit/rendering/frame-submission-budget.test.ts` | WP-5: GL call count and per-frame allocation budget for the cube. |
| `tests/unit/rendering/exposure-cases.test.ts` | WP-6: environment-lit, ambient-only and forest-like fixtures. |
| `evidence/vs-threejs/RESULTS-4.5.0.md` | WP-10 published-package run. |

### MODIFY

| Path | Change |
| --- | --- |
| `packages/rendering/src/**` (bloom passes), `contracts/quality.ts`, `packages/engine/src/agent-api/app/rendererOptions.ts` | WP-1: `bloomFusion`, default `separable`. |
| `packages/rendering/src/ForwardPass.ts`, `forward/Lighting.ts`, shadow shaders in `ShaderLibrary.ts` | WP-3: tap count per quality tier; dense instanced scenes use the lower tier. |
| `packages/engine/src/agent-api/postBridge.ts`, `compiler/postprocess.ts`, `packages/rendering` forward shading | WP-4: mask consumer; remove the SSAO lowering after the receipt. |
| `packages/rendering/src/{RenderDevice,Renderer}.ts`, `packages/engine/src/agent-api/app/frameLoop.ts` | WP-5, WP-7: state cache, uniform batching, per-frame allocations. |
| `packages/rendering/src/forward/Lighting.ts`, `packages/engine/src/agent-api/app/colorManagement.ts`, `compiler/environment.ts` | WP-6: calibrate the cases traced to bugs. |
| `packages/rendering/src/renderer/**`, `SkinnedLitMaterial.ts`, instanced draw submission | WP-7, WP-9. |
| `packages/math/package.json` | WP-2: `"./three"` export. |
| `packages/aura3d-cli/src/migrate-three/mappings.ts`, `tests/unit/aura3d-cli/migrate-three-fidelity.test.ts` | WP-2: rows switch to `@aura3d/math/three` where exact. |
| `docs/comparisons/aura3d-capability-audit.md`, `docs/agents/claims-and-boundaries.md`, `CHANGELOG.md` | WP-11, only after the matching gate. |

### DELETE

`contactShadowsAsOcclusion` in `postBridge.ts` after WP-4 passes. Nothing else.

---

## 4. Detailed Parallelizable Tasklist

All lanes own disjoint files; merge order WP-1, WP-6, WP-3, WP-5/7/9, WP-4, WP-2, WP-8, WP-10, WP-11. Browser work runs only via `tools/remote-acr/run.sh` (no local Docker or Playwright).

- **WP-1 Bloom fusion safety (G3, PBR viewer rows).**
  1. Add `bloomFusion` per 2.1; default `separable` with the sum and upsample-into-composite fusions kept.
  2. Re-measure draws on the PBR viewer: must stay <= 25 (P4); if the separable-plus-sum fusions give > 25, record the count and keep 33 only for `production`.
  3. Edge cases: `quality: "production"` byte-identical; bloom disabled; resize 390x844 and 1440x900.
  4. Acceptance: PBR viewer `aura-auto` frame time <= `aura-production` frame time on the remote run; frames within mean 2/255, max edge 6/255.
- **WP-2 Mutable math layer (M1, 64+ approximate rows).**
  1. Implement the compat classes in `packages/math/src/three` with full three r185 method sets for the listed classes.
  2. Generate goldens from three@0.185.1 (`THREE_DIR=<dir> node tests/fixtures/migrate-three/generate.mjs`); mark a mappings row `exact` only with a passing fixture.
  3. Update the codemod to import from `@aura3d/math/three` for those rows.
  4. Edge cases: aliasing (`a.add(a)`), `target` out-parameters, NaN propagation, `copy`/`clone` identity, no change to existing immutable class behaviour.
  5. Acceptance: approximate <= 100. The 26 rows that are deliberate loader and exporter exclusions stay `none`, so `none <= 20` is recorded as unreachable with that cause, not relabelled.
- **WP-3 Shadow filter tiers (P6 margin, G3 forest rows).**
  1. Introduce a tap-count tier (32 / 16 / 8) per quality tier and per scene density; dense instanced shadow casters (>= 8,192) default to the lower tier.
  2. Keep `production` kernels as today.
  3. Acceptance: forest per-frame median <= 2.5x three.js 4x MSAA over 3 runs on the remote runner (P6 currently 2.99x on one run); shadow visual diff on shadow-heavy showcase games within the visual-regression tolerance, or the tier stays opt-in.
- **WP-4 Contact shadows (C1 honesty).**
  1. Implement 2.3; add `contact-shadow-mask.spec.ts` with on/off pixel deltas (floor under the subject darkens, far floor does not).
  2. Write the receipt; remove `contactShadowsAsOcclusion` only when the receipt passes.
  3. Acceptance: audit row can move to `shipped` with receipt, unit test and compiling example; otherwise it stays `partial`.
- **WP-5 Frame submission residue (P2, G4).**
  1. Profile the cube frame (V8 profile via `frame-cost.spec.ts`); target the 39 GL calls: state cache for repeated binds, batched uniform uploads, no per-frame object or closure allocation.
  2. Acceptance: cube CPU in `frame()` <= 0.5 ms on the remote run (or the measured floor and cause recorded); `webgl2-sampled-error-policy` test still passes; no WebGL errors masked.
- **WP-6 Exposure attribution (Q1 beyond the skinned character).**
  1. Add CPU-reference cases for environment-lit (IBL), ambient-only and the forest light set; attribute the cube (12.8 vs 2.9), PBR viewer (91.1 vs 55.0) and forest (119.6 vs 148.2) gaps to a cause (probe intensity, sky, implicit fill, tone map, shadow term).
  2. Calibrate where the cause is a bug; document where it is the intentional neutral room probe, and keep that out of any claim.
  3. Acceptance: each of the three scenes within 10% of three.js luma for identical nominal lights, or the cause and decision recorded; look presets re-captured (`look capture` / `look judge`) before and after.
- **WP-7 Skinned character and game loop frame cost (G3, G4, G5).**
  1. Profile skinned character (3.6x three-msaa, 6 programs vs 3, 4.5 ms CPU) and game loop (6.3x, 38 draws vs 19, 6 programs vs 2); find draws that can merge and programs that can share.
  2. Acceptance: game loop draws <= 25 and programs <= 4; skinned programs <= 5; frame-time change reported on the remote run.
- **WP-8 First-frame init beyond the companion (G2).** After the companion's Track C lands, remove remaining init work in `createAuraApp` (probe build, context and program setup). Acceptance: P3 <= 500 ms measured on the published-package run (WP-10); until then, no statement.
- **WP-9 Draw and triangle reduction (G5).**
  1. Find why the forest has 282 draws per cascade for five instanced nodes (RESULTS: 569 total vs three.js 7); merge chunked instanced submissions to one draw per node per pass where the culling path allows it.
  2. Compare shader-water triangles (22,530 vs 19,394) to the primitive plane tessellation and use the same grid density in the bench source if that is the only difference.
  3. Acceptance: forest draws <= 40 in the camera plus cascade passes; no visual diff.
- **WP-10 Published-package benchmark (P3, P5 settle).** After 4.5.0 is published, run `tools/bench-vs-threejs/harness/run-candidate.sh` in published mode (registry install), with three cold loads and 60 steady frames; write `evidence/vs-threejs/RESULTS-4.5.0.md`; run `node tools/bench-vs-threejs/gate.mjs`.
- **WP-11 Copy (last).** Per passed target only: update the audit, boundaries, `CHANGELOG.md`, then README and site with Aura3D-side facts and method. For failed targets: record in `evidence/`, no claim.
- **OWNER-1 Real-GPU receipts (P7).** `REAL_GPU_HEADLESS=false tools/real-gpu/run.sh all` on the Mac (or a granted GPU quota); results feed the gate's real-GPU column. Never presented from software GL.
- **OWNER-2 Three-author batch.** `node tools/bench-vs-threejs/shared/authors/run-authors.mjs --dry-run` already validates; a paid run needs the owner's `--confirm-spend`.

---

## 5. Verification & Acceptance Checklist

Heavy and browser steps run on the remote runner; typecheck and unit tests may run locally.

### Static and unit
- [ ] `pnpm typecheck` shows no new errors against `main` (baseline: 58 existing errors).
- [ ] `npx tsc -p tsconfig.build.json` passes.
- [ ] `node_modules/.bin/vitest run tests/unit/math/three-compat-parity.test.ts tests/unit/aura3d-cli/migrate-three-fidelity.test.ts tests/unit/rendering/bloom-fusion-select.test.ts tests/unit/rendering/shadow-filter-tier.test.ts tests/unit/rendering/frame-submission-budget.test.ts tests/unit/rendering/exposure-cases.test.ts` passes.
- [ ] `node tools/receipts/check.mjs` exits 0 for the release minor.
- [ ] `node tools/docs-codeblocks`, `tools/marketing-truth`, `tools/marketing-link-audit` and `node marketing/scripts/check-site.mjs` pass.

### Browser (remote, software WebGL2)
- [ ] `SPECS="tests/browser/bloom-fusion-cost.spec.ts" tools/remote-acr/run.sh`: PBR viewer `auto` frame time <= `production`, draws <= 25.
- [ ] `SPECS="tests/browser/forest-10k.spec.ts" tools/remote-acr/run.sh` three times: median <= 2.5x three.js 4x MSAA.
- [ ] `SPECS="tests/browser/contact-shadow-mask.spec.ts" tools/remote-acr/run.sh`: receipt written.
- [ ] `SPECS="tests/browser/frame-cost.spec.ts" tools/remote-acr/run.sh`: cube CPU <= 0.5 ms, console empty.
- [ ] Visual-regression suites with the full context profile: no unexplained diffs.

### Benchmark gate
- [ ] `node tools/bench-vs-threejs/gate.mjs --results <results.json> --static <static-metrics.json>` prints PASS for each targeted row; T1 (three.js better <= 30) passes before any "beats three.js" wording ships.
- [ ] Rows still FAIL after this PRD have their measured value and cause in `evidence/`, and the next PRD is cut from them.
- [ ] Real-GPU rows are filled from owner-run receipts or every speed statement keeps the software-WebGL2 qualifier.

---

## 6. Out of Scope & Guardrails

- Bundle size, requests and first-load JS (companion PRD Track C), agent-first authoring, `aura3d verify`.
- Native WebGPU as default backend, XR on real headsets, porting every three.js addon, a hosted asset catalog.
- Any public claim before its gate; any "built on three.js" wording; three.js column on sales surfaces.
- No local Docker or Playwright; no unbounded `find`/`grep` from the home directory; no change to `quality: "production"` output; no change to game art to hide a regression.
- Real-GPU captures and paid LLM batches are owner steps. Protected tokens are never set or written; publishing goes through `tools/release/publish-all.mjs`.
