# Three.js Parity Execution Plan

Status: active execution contract for broad Three.js parity, which remains genuinely open.

> **Scope note (2026-07-29).** Broad Three.js parity is *not* in scope for
> `docs/project/plans/final-remaining-work-prd.md`. 45 of the 54 declared examples still have no
> mounted Aura3D route, so `threejs-parity:same-scene-render`, `threejs-parity:visual-review`, and
> the terminal `threejs-parity:completion-audit` all fail correctly. Nine of eleven parity reports
> pass and the inventory reports 9 matched rows. The specific parity items that final-remaining-work
> PRD *did* close are FS-401 (data-texture skinning and eight influences), FS-402 (screen-space fat
> lines), FS-403 (interactive TransformControls), FS-404 (route-local migration), FS-502 (inventory
> truth, now with enforced named-test evidence for every matched row), and FS-601 (comparative
> performance inputs). Everything else here stays open.

This document is the prompt and the goal. It is not a claim artifact. Nothing here counts as
evidence. Each work item is closed only by public package code plus a passing test that fails
if the code is reverted.

## Goal

Close the five remaining construction items on the Three.js parity backlog by moving behavior
into public package code, proving each with executable evidence, and reducing the documented
claim surface to exactly what the evidence supports.

## Non-Negotiable Rules

1. Route-local code is not parity. Behavior must live in `packages/*` and be exported.
2. A test that passes when the implementation is deleted is not evidence. Every item needs a
   negative control or an assertion tied to the new code path.
3. Browser claims need browser evidence: real WebGL2 context, real draw calls, real pixels.
4. CPU-vs-GPU parity claims must state their exactness class explicitly. "Byte-exact" means
   every byte of every channel of every pixel matches, and the test asserts a zero-mismatch
   count over a stated corpus.
5. Docs may only claim what a named, passing test proves. Any gap goes in the claim boundary
   as an open limit, not as a soft-pedaled success.
6. No scratch files, no absolute local paths, and no untracked fixtures in the final tree.

## Work Items

### 1. Native WebGL2 bloom and outline

Today `Renderer.renderPostprocess` implements `bloom` and `outline` by reading the render
target back to the CPU (`readRenderTargetPixelsAsync`), running `bloomPixels` /
`outlinePixels`, and writing the result back. That is a correctness path, not a GPU path.

Build real fragment-shader passes in `WebGL2Device` and route the renderer through them,
keeping the CPU kernels as the reference oracle.

The exactness design is already derived and verified numerically:

- Bright extract: `luma = (0.2126r + 0.7152g + 0.0722b)/255 >= threshold`. Float32 GPU math
  disagrees with the CPU float64 comparison on exact ties (up to 17 colors per threshold, and
  up to 18 colors share a single exact luma sum). A `2048x256` RGBA8 bitset LUT keyed by
  `(r,g,b)` encodes the CPU decision for all 16,777,216 colors and reproduces it with zero
  mismatches. That LUT is the only form proven exact; do not ship an inline float compare.
- Blur: `clampByte(sum / kernelSize)` matches integer `(2*sum + kernelSize) / (2*kernelSize)`
  with zero failures. All magnitudes stay under 2^24 so float32 holds them exactly.
- Composite: `clampByte(src + blurred*intensity)` is a function of `(src, blurred)` only, so a
  `256x256` LUT is exact by construction. An inline float32 form fails at exact rounding ties
  for non-dyadic intensities such as 0.35.
- Outline gradient: Sobel on integer luma numerators. Compare `Gx^2 + Gy^2` against
  `(threshold*SCALE)^2` using base-4096 uint limbs, where the threshold is decomposed to its
  exact float64 dyadic value. Verified against the CPU float64 `Math.hypot` predicate with
  zero disagreements over 855,360 samples spanning 10 thresholds, random RGB stencils, and all
  65,536 grayscale vertical-edge pairs.
  Known divergence class: if the threshold is set exactly equal to an attainable gradient
  magnitude, the predicates disagree (26,049 of 65,280 adversarially constructed cases). This
  requires deliberately choosing the threshold to equal a representable gradient value and does
  not occur for ordinary fixed thresholds. Docs must state this boundary-coincidence limit
  rather than claiming unconditional equivalence.
- Outline blend: `clampByte(before*(1-alpha) + color*alpha)` per channel is a `256`-entry
  function per channel given fixed alpha and color; exact by construction.

Deliverables:
- Native bloom bright/blur/blur/composite and outline passes in `packages/rendering`.
- Renderer routes LDR `bloom` and `outline` through the native path, with the readback path
  retained as an explicit fallback and reported in diagnostics.
- A browser spec that renders both native and CPU-reference results over the same source
  pixels and asserts a zero-byte mismatch count, printing the corpus size.
- Claim boundary states the exactness class and the LUT dependency honestly.

### 2. Data-texture skinning and extra influences

Historical retained goal: remove the old uniform-array cap by uploading the
matrix palette as a float data texture and support `JOINTS_1` / `WEIGHTS_1` as
real extra influences. This construction track is removed from the active
release by `scope-decisions.md`; the current bounded contract is 96 joints and
four influences.

Deliverables:
- Palette upload path selects uniform arrays or a data texture, with the choice in diagnostics.
- A skin above the old cap renders correctly instead of reporting
  `skinning-palette-limit-fallback`.
- Eight-influence skinning in loader, render resources, shader variants, and validation.
- Tests covering over-cap palettes and eight-influence weighted transforms.
- `skinning-palette-limit-fallback` and the extra-influence diagnostic language updated.

### 3. Fat-line parity

Implement screen-space wide lines as public geometry plus a material/shader path, and gate it
against Three.js `Line2` / `LineMaterial` output on the same scene.

Deliverables:
- Public fat-line geometry and material in `packages/rendering`.
- A route or harness that renders it through `A3DRenderer`.
- A browser parity spec with a bounded pixel delta against real Three.js `Line2`.
- Claim boundary moves fat lines from scoped-out to bounded-parity with the measured delta.

### 4. Migrate remaining route-local behavior into packages

Walk, morph, loader, and material routes still hold behavior that belongs in package APIs.

Deliverables:
- Identify each route-local helper that implements engine behavior rather than scene setup.
- Move it into the owning package with an export and a unit test.
- Route reduces to scene construction plus public API calls.

### 5. Reconcile docs to proven evidence and commit in groups

Deliverables:
- `docs/project/parity/threejs/status.md`,
  `docs/project/parity/threejs/claim-boundary.md`, and
  `docs/project/parity/threejs/parity-matrix.md` reference only named passing
  tests.
- Remove the scratch files.
- Commit in separate logical groups: native postprocess, skinning, fat lines, route migration,
  docs.

## Definition Of Done

- `pnpm build` and `pnpm lint` clean.
- Targeted unit and browser specs pass for every item above.
- Every new claim in docs names the test that proves it.
- Working tree contains no scratch or untracked helper files.
