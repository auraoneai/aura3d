# Lane E-E (WP-5): outline targets and depth-aware toon ink

- Branch: `gu47/ee` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/ee`)
- Base commit: `f797808be`; `gu47/integration` merged in at `8edb88438` (brings E-D's `registerForwardDrawHook` and E-F's outline `targets` field).
- Wave: 1 (phase 1, code). No browsers, no remote runs, no captures.
- Resume: the predecessor left `effects.toon.ts` uncommitted (inkSource / fadeDistance / inkColor, `TOON_INK_FRAGMENT`, CPU mirror). Reviewed and kept; one fix before committing (`71f304b50`): the depth texel lookup scales `v_uv` by the linear-depth size instead of `gl_FragCoord`, so a render-scaled depth surface still lines up.

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| EE-1 outline targets (renderer) | M | done | fe14c8e9a | `packages/rendering/src/renderer/OutlineTargets.ts` (NEW): mask of ONLY the target items through `DepthPass` with the PRD-02 caster-variant resolver (skinned, instanced and `castShadow` custom-vertex targets keep their real silhouette) into a private depth texture; fullscreen ink ring (`width` px, 8 directions per step, max 6) blended (`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`) onto the chain's output. With scene depth, target pixels behind other geometry do not count (visible silhouette only); without it x-ray. `PostprocessExecution.ts`: a targeted outline runs the chain without the luma outline, then the ink; `postprocessRequiresDepthTexture` asks for a sampleable depth only for a targeted outline; WebGPU records `OUTLINE_TARGETS_WEBGL2_ONLY`, a frame without camera/items records `OUTLINE_TARGETS_FRAME_CONTEXT_MISSING`. No `ForwardPass.ts` edit (E-D's hook was not needed). `tests/unit/gu47/ee/outline-targets.test.ts` (10 tests). |
| EE-1 outline targets (engine) | M | done-interim (E-C H0, E-G H1) | 4f66f7a38, 01d06a0a5 | `packages/engine/src/agent-api/nodes/outlineTargets.ts` (NEW): `outlineTargetsField(node, nodes)` turns `outline({ targets })` names into the renderer's label keys (node name; for model nodes the model id = runtime id, else asset id). The one compiler line that spreads it into `createProductionRuntimePostprocess`'s `outline` object is E-G's file: handoff H1; the v2 field allowlist that must admit `targets` is E-C's: handoff H0 (blocking: without it an authored `targets` throws `POST_FIELD_UNSUPPORTED` at compile on the default chain). Until both land, game lanes keep `outline()` without `targets` behind their adapter. The sync and async presents both split a targeted outline. `tests/unit/gu47/ee/outline-targets-engine.test.ts` (8 tests, incl. the chain wiring and the ink step from the frame context). |
| EE-2 toon ink | M | done | 71f304b50 | `toon({ inkSource, fadeDistance, inkColor })`: `"color"` (default) = today's luma Sobel; `"depth"` = relative inverse-depth Laplacian (zero on any plane, so grazing ground and box creases stay clean); `"both"` = max of the two. `fadeDistance` = full ink to half, zero at the distance (`u_fade`), so the far field and the sky lose ink. `inkColor` "#rgb"/"#rrggbb" wins over `ink` (display sRGB at `after-tonemap`, linearised at earlier slots). Absent fields: `TOON_FRAGMENT` and the original uniforms byte-identical. Depth is read from the C-13 `u_depthLinear`; at the HDR anchors (`before-tonemap`, ...) it is bound today; at `after-tonemap` the v2 LDR tail binds no depth yet (handoff H2), and the pass falls back to colour ink (no fade) there. |
| EE-3 unit tests | M | done | 1e194dc5c, fe14c8e9a, 4f66f7a38 | Mask holds only target ids (draw records on `MockRenderDevice`: only target items reach the mask, then one blended ink draw); perimeter fully inked and no sky ink in the CPU mirror; occluded target pixels not covered; ink fades past `fadeDistance`; each `inkSource` selects its edge source; defaults reproduce today's uniforms and fragment; both new GLSL programs compile with `glslangValidator` (toon behind the real C-13 prelude `customPassFragmentSource`). `tests/unit/gu47/ee/toon-ink.test.ts` (14 tests). |
| EE-3 receipt spec | M | phase 2 | 0ab8a960c | `tests/browser/gu47/outline-targets.spec.ts` + `outline-targets-harness.ts` + `outline-targets.html` (not run). |

## Decisions

- Mask design: a separate cheap mask pass after the chain instead of an ID attachment in the forward pass. It needs no `ForwardPass.ts` edit, costs nothing for scenes without targets, and draws only the target items (usually 1-5 draws). The PRD's "ID/stencil mask in the forward pass" wording is met by a target-only depth mask rendered with the forward camera matrix.
- One mask for all targets (binary coverage), not per-target ids: the ink is the outer silhouette of the target set. Two touching targets share one outline.
- The ink is drawn after the whole post chain (after FXAA / vignette / grain in the LDR tail) by alpha blending, so it needs no colour read and works on every route (v2 seam, fused LDR present, per-pass CPU chain).
- `targets: []` is a targeted outline with nothing to ink (a game that clears its selection gets no outline).
- Visibility: a mask pixel counts only when its depth is <= the resolved scene depth + 2e-4 (window space). The forward target is MSAA-resolved first (`resolveMultisampleTarget`, a no-op when already resolved).
- Label matching (renderer): `primitive-<i>:<resource>:<name>` ends with `:<target>`; `actor-<i>:mesh-<j>:<id>:...` has `<id>` = target; any other item matches only its exact label. `outlineTargetKeys` adds model ids for model nodes named by a target, so games can target models by name.
- Toon depth at `after-tonemap`: kept the default slot (no default change) and documented the colour fallback rather than moving depth toons to an HDR slot behind the author's back.

## Handoffs

| to lane | file:symbol | change | why |
|---|---|---|---|
| E-C (H0, blocking) | `packages/engine/src/agent-api/postBridge.ts`: `POST_EFFECT_FIELDS.outline` | `["color", "width", "threshold"]` -> `["color", "width", "threshold", "targets"]` | Verified on this branch: `validatePostEffectNode(effects.outline({ targets: ["rider"] }))` returns `POST_FIELD_UNSUPPORTED` for `targets`; with `A3D_QR_POST` (default-on) and no `compat.post "3.0"`, `createProductionRuntimePostprocess` throws it, so `app.ready()` rejects for any scene that authors `targets`. Game lanes must not author `targets` until H0 lands. |
| E-G (H1) | `packages/engine/src/agent-api/compiler/postprocess.ts`: `createProductionRuntimePostprocess`, the `outline: { ... }` object (~line 218) | add `...outlineTargetsField(authoredOutline, nodes)` as the last field, importing `outlineTargetsField` from `../nodes/outlineTargets.js` | carries `effects.outline({ targets })` to the renderer; without it `targets` is inert. An outline without `targets` gets `{}` (byte-identical). |
| E-C (H2) | `packages/rendering/src/post/v2Stages.ts`: `runV2LdrTail`, the `after-tonemap` loop (`runCustomPass(host, state, pass, current, {}, null, frameContext)`) | when a display custom declares `inputs` "depth" and `frameContext.sceneDepth.available`, linearise `frameContext.sceneDepth.texture` with `DEPTH_LINEARIZE_GLSL` (near/far/ortho from `frameContext.sceneDepth.linearize`) into a pooled rgba32f target once per tail and pass it as `aux.linZ` (release after the loop) | `toon({ inkSource: "depth" \| "both", fadeDistance })` at the default `after-tonemap` slot (and G24's DG-P1 ink pass) gets depth; today the tail binds the 1x1 blank and the pass falls back to colour ink. |
| E-G (H3, optional) | `packages/engine/src/public/index.ts` | export types `AuraToonOptions`, `AuraToonInkSource` from `agent-api/nodes/effects.toon.js` | game lanes can type their toon options (they can use `Parameters<typeof effects.toon>[0]` meanwhile). |
| E-C (H4, optional) | `packages/engine/src/agent-api/postBridge.ts`: `POST_RUNTIME_EFFECTS` | add `outline: "outline"` (with H0, `targets` becomes a `setEffect` field) | lets a game retarget at runtime (`app.post.setEffect("outline", { targets: [id] })`, e.g. hover or the current rider) without rebuilding the scene; the compiled value flows through H1. |
| WP-38 (H5) | `docs/api/toon.md` (and the outline section of the effects API page) | document `inkSource`, `fadeDistance`, `inkColor`, the depth-slot note, and `outline({ targets })` | the API pages are unowned in PRD §4; lane text is in "CHANGELOG text" and "API as shipped" below. |

Handoffs addressed to E-E (read ea ... ej reports, 2026 run): E-D ED-8 offers `registerForwardDrawHook` "only if needed": declined (the mask pass draws target items itself; no rendering-barrel export needed). E-F EF-0 added `outline({ targets })` on the node: consumed by `outlineTargetsOfNode`. No other report names E-E.

## API as shipped

Engine, `packages/engine/src/agent-api/nodes/effects.toon.ts` (reached through `effects.toon`):

- `type AuraToonInkSource = "color" | "depth" | "both"`
- `interface AuraToonOptions` adds `readonly inkSource?: AuraToonInkSource; readonly fadeDistance?: number; readonly inkColor?: string` (fadeDistance in metres, (0.001, 1e7]; inkColor `"#rgb"` or `"#rrggbb"`)
- `const TOON_INK_FRAGMENT: string`; `const TOON_DEPTH_EDGE_DEFAULT: readonly [number, number]` (= [0.04, 0.12])
- `function toonInkMix(inkSource: AuraToonInkSource): [number, number]`
- `function toonFadeRange(fadeDistance: number | undefined): [number, number]`
- `function toonInkColor(inkColor: string, linear?: boolean): [number, number, number]`
- `interface ResolvedToonPass { glsl; uniforms; usesDepth; order }`; `function resolveToonPass(options?: AuraToonOptions): ResolvedToonPass`
- `interface ToonInkFrame { width; height; luma; viewZ? }`; `function toonInkWeights(frame: ToonInkFrame, options?: AuraToonOptions): Float32Array`
- New uniforms of the depth fragment: `u_ink_mix` (colour, depth weights), `u_depth_edge` (start, end), `u_fade` (start, end metres; 0 = off). Inputs `["color", "depth"]` only when depth is used.

Engine, `packages/engine/src/agent-api/nodes/outlineTargets.ts` (NEW):

- `function outlineTargetsOfNode(node: AuraEffectNode | undefined): readonly string[] | undefined`
- `function outlineTargetKeys(targets: readonly string[], nodes?: Iterable<unknown>): string[]`
- `function outlineTargetsField(node: AuraEffectNode | undefined, nodes?: Iterable<unknown>): { readonly targets?: readonly string[] }`

Rendering, `packages/rendering/src/renderer/OutlineTargets.ts` (NEW, internal; not in the rendering barrel):

- `interface OutlineTargetOptions { targets?; color?; width?; opacity? }` (the renderer's `postprocess.outline` with the GU47 field)
- `function outlineTargetsOf(outline: unknown): readonly string[] | null`
- `function outlineTargetLabelMatches(label: string | undefined, targets: ReadonlySet<string>): boolean`
- `function selectOutlineTargetItems(items: Iterable<RenderItem>, targets: readonly string[]): RenderItem[]`
- `function outlineTargetInkMask(covered, width, height, radius): Uint8Array`; `function outlineTargetCoverage(maskDepth, sceneDepth?): Uint8Array` (CPU mirrors)
- `class OutlineTargetPass { constructor(device); execute(input: OutlineTargetPassInput): OutlineTargetRecord; dispose() }`; `function outlineTargetPassFor(device): OutlineTargetPass`
- `function lastOutlineTargetRecord(): OutlineTargetRecord | null`; `resetOutlineTargetRecord()`
- Constants `OUTLINE_TARGET_SHADER_MARKER`, `OUTLINE_TARGET_MASK_LABEL`, `OUTLINE_TARGET_MAX_RADIUS` (6), `OUTLINE_TARGET_DEPTH_BIAS` (2e-4), `OUTLINE_TARGET_EMPTY_DEPTH`, `OUTLINE_TARGET_DIRECTIONS`, `OUTLINE_TARGET_SHADER_SOURCES`
- Post-skip reasons: `OUTLINE_TARGETS_WEBGL2_ONLY`, `OUTLINE_TARGETS_FRAME_CONTEXT_MISSING`

Game usage: `effects.outline({ color: "#1b2236", width: 2, targets: ["rider"] })` (node names; for `model(...)` nodes the name or its `.runtime({ id })`); `app.post.addPostPass(effects.toon({ inkSource: "both", fadeDistance: 600, inkColor: "#5a3a22", order: "before-tonemap" }))` until H2 lands, then the default slot.

## CHANGELOG text (for WP-38)

- `effects.outline({ targets })`: only the named nodes get an outline. The engine draws a mask of just those nodes and inks a ring around their visible silhouette (`width` 1-6 px, `color`, `intensity`); hidden parts get no ink. Outlines without `targets` are unchanged.
- `effects.toon({ inkSource, fadeDistance, inkColor })`: the cel pass can ink depth silhouettes (`"depth"`, or `"both"` with colour edges), fade the ink out with distance (`fadeDistance` in metres), and take a hex ink colour. Without these options the pass is unchanged. Measured on software WebGL2.

## Phase-2 plan

- Run `tests/browser/gu47/outline-targets.spec.ts` on the remote runner (software WebGL2), after H0 (the field validates) and H1 (targets reach the renderer); for the default-slot depth toon, also H2.
- Outline: frames `mask`, `plain`, `targets`, `full` at 480x270. Acceptance: rider outer ring (1-2 px outside the mask) moved toward the ink on >= 60%; sky pixels (top quarter, no geometry) changed < 0.5%; crate ring <= 5% under `targets` and higher under the full outline; no `OUTLINE_TARGETS_*` post-skip.
- Toon: frames `toon-color`, `toon-depth` (inkSource depth, fadeDistance 40, inkColor, before-tonemap). Acceptance: rider perimeter inked >= 60%, sky edges < 0.5%, bottom quarter changed more than the top.
- Receipt `evidence/receipts/outline-targets/<version>/` (frames plain / targets / full + checks).
- Game rows that consume it: G16 CR-P2 (plum ink on per-object targets; edge pixels 3-8% bottom rows, < 0.5% top row), G20 NR-09 (indigo #1b2236 width 1, per target), G24 DG-P1 (>= 60% rider perimeter, sky edges < 0.5%, bottom-row edges >= 3x top).

## Verification

- Before the first edit: `tests/unit/toon/toon.test.ts`, `tests/unit/silt-and-signal-port/shaders-compile.test.ts`: 9/9 pass (with the predecessor's uncommitted file in place; its default path is byte-identical).
- New suites: `tests/unit/gu47/ee/outline-targets.test.ts` 10/10, `outline-targets-engine.test.ts` 6/6, `toon-ink.test.ts` 14/14.
- Typecheck delta and the final touched-suite run: see below (updated at the end of the run).
