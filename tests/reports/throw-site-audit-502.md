# Throw-site audit, lane 5.0.2 renderer (branch `lane/502-renderer`)

Scope: `git diff v4.7.13..HEAD -- packages/rendering packages/engine`, `throw new RenderDeviceError`. The diff adds 1,623 such
sites (WebGPUDevice 559, ForwardPass 136, Renderer 135, TemporalHistory 109, DepthPass 77, WebGL2Device 68, ...). They are not
all reviewable one by one; the audit classifies by family and by whether a **default path of an existing (4.7.13) feature** can
reach them. Rule: invalid input or internal-consistency guard = KEEP; unsupported optional effect or device limit =
DEGRADE (one-time `*_DEGRADED`/`*_PARTIAL` warning, frame still draws); `A3D_QR_STRICT` keeps every throw. Method note: as the
5.0.1 census showed, reading is not proof; only the contact-shadow, masked-depth and clipping rows below were exercised
(unit tests and, for contact shadows, real-GPU captures). Rows marked UNVERIFIED were decided from code, not from a render.

## Decision table

| # | site (family) | code(s) | default-path reachable? | decision | evidence |
|---|---|---|---|---|---|
| 1 | Renderer contact guard (graph passes) | CONTACT_SHADOW_DEPTH_UNSUPPORTED `unverified-graph-passes` | yes, ~17/25 games at 5.0.1 | FIXED, not degraded: the attested producer is held back and inserted next to its forward receiver (`RendererFrameHooks.placeContactProducers`), so no contributor pass can interleave; strict still throws for an unattested/foreign mask writer | unit tests (native-contact-shadow-webgpu), real GPU: 5 games |
| 2 | Renderer contact guard (draw participants) | `unverified-draw-participants` | yes (second hidden blocker behind #1) | FIXED: providers that cannot change camera depth (fog, IBL, filters, rim...) no longer veto; deform/alpha features are asked per participant; strict keeps the full replay proof | same |
| 3 | Prd02ContactShadowsContributor.validateContactDepthItems | CONTACT_SHADOW_DEPTH_UNSUPPORTED (skinned, morph, blended, alpha-tested, custom shader, tangent-frame...) | yes | DEGRADE (partial): participant is left out of the mask depth, one-time `CONTACT_SHADOW_PARTIAL`; a per-draw `onBeforeRender` and draw hooks still refuse the whole mask (forward draws throw with a mask published); strict throws | unit tests, 5 games |
| 4 | ForwardPass.validateContactShadowReceiver | CONTACT_SHADOW_RECEIVER_DEPTH_UNSUPPORTED | yes (blended receiver, found by the real-GPU run: black frame) | DEGRADE: receiver whose depth state differs from the mask's does not receive it; strict throws | unit test (native-pbr-detail-shaders) + real GPU top-tennis (was SAFETY_BLACK_FRAME) |
| 5 | DepthPass masked-depth contract: specialized geometry, packed member, instance alpha, forward alpha providers, forward-mode and legacy-program mismatch | DEPTH_ALPHA_SPECIALIZED_GEOMETRY_UNSUPPORTED, DEPTH_PACKED_MEMBER_UNSUPPORTED, DEPTH_INSTANCE_ALPHA_UNSUPPORTED (selection), DEPTH_ALPHA_PROVIDER_UNSUPPORTED, DEPTH_ALPHA_FORWARD_MODE_UNSUPPORTED, DEPTH_ALPHA_FORWARD_PROGRAM_UNSUPPORTED | yes: any alpha-cutoff shadow/depth caster | DEGRADE (this lane): caster draws as an opaque caster, one-time `DEPTH_ALPHA_MASK_DEGRADED`; strict throws. The "changed during the draw" guards (DEPTH_INSTANCE_ALPHA_UNSUPPORTED in `depthAlphaUniformsForItem`, DEPTH_PREPARED_PLAN_STALE) stay: they are stale-state/consistency checks | native-clipping + native-depth-geometry-matrix tests |
| 6 | DepthPass alpha-hash, alpha-to-coverage | DEPTH_ALPHA_HASH_UNSUPPORTED, DEPTH_ALPHA_COVERAGE_UNSUPPORTED | yes | DEGRADE (5.0.1, unchanged) | 5.0.1 census |
| 7 | DepthPass invalid masked-alpha inputs | DEPTH_ALPHA_INPUT_INVALID (non-positive cutoff, bad uniform, missing/unavailable base map, non-finite rotation) | when authored wrongly | KEEP (invalid input) | - |
| 8 | DepthPass clipping/custom-depth/graph contracts | DEPTH_CLIPPING_*, DEPTH_CUSTOM_*, GRAPH_*_UNSUPPORTED, DEPTH_LEGACY_FALLBACK_UNSUPPORTED, DEPTH_MULTIDRAW/BATCH_* , WEBGPU_POINT_DEPTH_UNSUPPORTED | only with clipped shadows / graph or custom depth shaders | KEEP, UNVERIFIED: authored custom shaders or explicit clipping on packed/point/line geometry; no game reaches them (all 25 render at 5.0.1). Candidate for a later degrade (skip clipped shadow caster) if a template needs it | - |
| 9 | Renderer + FrameGraph scene clipping with contributor-owned geometry (C3-01) | SCENE_CLIPPING_CONTRIBUTOR_UNSUPPORTED (3 sites: `assertClippedShadowContributors`, post-collect check x2) | yes for clipped scenes with shadows and any active contributor | DEGRADE: scene geometry and shadows are clipped, contributor geometry is not; one-time `SCENE_CLIPPING_CONTRIBUTOR_DEGRADED`; strict throws. Untrusted flags keep the throw | clipping-contributor-degrade.test.ts; native-renderer-clipping now asserts the strict contract |
| 10 | Renderer direct transmission | TRANSMISSION_REPLAY_UNSUPPORTED, TRANSMISSION_VIEWPORT_UNSUPPORTED, TRANSMISSION_LINEAR_TARGET_REQUIRED, TRANSMISSION_HDR_TARGET_REQUIRED, TRANSMISSION_FLAGS_UNTRUSTED, TRANSMISSION_TARGET_PLANNING_REQUIRED | only transmission materials without postprocess/qrOutput | KEEP, UNVERIFIED, OPEN: HDR-target and replay-safety failures are real device/feature limits and should degrade to "draw without transmission" (ForwardPass already does that when its program lacks the lobe/capture, `TRANSMISSION_DEGRADED`), but the frame planner derives targets and graph reads from `transmissionRequested`; degrading needs that restructure and a real-GPU repro of a failing config. Not reached by any of the 25 games | - |
| 11 | forward/Transmission.ts capture | TRANSMISSION_SOURCE_*, TRANSMISSION_COPY_UNSUPPORTED, TRANSMISSION_MIP_* | after #10 chooses capture | KEEP (capture integrity; device limits surface in #10) | - |
| 12 | OutputPass / Renderer output alpha | OUTPUT_ALPHA_MODE_*, OUTPUT_INPUT_ALPHA_MODE_*, OUTPUT_COVERAGE_UNAVAILABLE, OUTPUT_COLOR_SPACE_* | only when the app requests alpha-preserving or encoded (P3) output | KEEP: explicit opt-in options with no 4.7.13 equivalent; rejecting an impossible request is the contract. Default (opaque sRGB) never reaches them | - |
| 13 | TemporalHistory | TEMPORAL_PLAN_UNSUPPORTED (plain-data planning), TEMPORAL_INVALID_*, TEMPORAL_*_STALE/BUSY/CONFLICT, TEMPORAL_RECONSTRUCTION_* | `assertPlanItems` etc. only through the staged raster-plan API; the frame path records unsupported motion in `v2.unsupportedMotion` | KEEP: hostile-input/lifecycle guards of the explicit planning API; the TAA frame path already degrades unsupported motion per item | - |
| 14 | Native depth of field and WebGPU post | WEBGPU_DOF_*, NATIVE_DOF_SCENE_UNSUPPORTED, WEBGPU_AUTO_EXPOSURE_*, WEBGPU_NATIVE_EFFECTS_UNAVAILABLE, WEBGPU_OUTPUT_POLICY_* | only WebGPU + `dof`/autoExposure/output-policy opt-in | KEEP, UNVERIFIED: new opt-in WebGPU effects (no 4.7.13 behavior to preserve). A scene-incompatible DOF (extra geometry, clipping, splats, transmission) could skip the effect with `NATIVE_DOF_DEGRADED`; not done: needs a WebGPU repro and a decision whether the legacy DOF applies instead | - |
| 15 | Gaussian splats | GAUSSIAN_SPLAT_* (color/depth/multisample/scratch/adapter/view state) | only scenes that use splats (new API) | KEEP: unsupported target formats and invalid state; the splat node is an explicit request, and clipping+splats is rejected by design (tested) | - |
| 16 | Scalar volumes | SCALAR_VOLUME_* | only scenes that use volumes (new API) | KEEP: route/combination validation of an explicit new node (needs depth copy, linear target, full viewport) | - |
| 17 | Scene depth copy | SCENE_DEPTH_COPY_*, MULTISAMPLE_DEPTH_RESOLVE_UNSUPPORTED | internal | KEEP (internal consistency of renderer-owned targets) | - |
| 18 | TextureUpload / texture formats | UNSUPPORTED_TEXTURE_FORMAT (ImageBitmap flipY) | yes | DEGRADE (5.0.1, unchanged) | 5.0.1 census |
| 19 | WebGPUDevice (559), WebGL2Device (68), NativePointQuads, MultiDraw, GeneratedPbrProgram, DeferredPipeline, VisibilityBuffer/Meshlet | device-level validation (binding layouts, buffer sizes, checked submission, attribute locations, pipeline state) | internal contracts; reached only through the passes above | KEEP: invalid or inconsistent device commands are bugs to surface, not optional effects. Not individually reviewed (see Method note) | - |
| 20 | Vertex/Index buffer, UniformBlock, RenderDevice, ProgramGenerator | INVALID_*, *_CONTRACT | on invalid input | KEEP (input validation) | - |

## Defects and notes found while auditing

- **Black frame behind a green mount (found only by the real-GPU run).** After #1/#2, top-tennis mounted and then drew black from
  the first frame (`SAFETY_BLACK_FRAME`, frame loop swallowed the render error): a blended receiver threw
  `CONTACT_SHADOW_RECEIVER_DEPTH_UNSUPPORTED` inside the forward draw. Fixed as row 4. This is the same class as the 5.0.0
  failure: a throw that unit tests with mock devices do not see. The page logs no error for a failed frame; a failed frame is
  visible only as a black canvas. Recommendation for the render gate (C2-03): fail on `SAFETY_BLACK_FRAME` and on a blank canvas, not
  only on console errors.
- **Concurrency note.** REA tool-result files land in a directory shared with other agents; pick the file named in the tool
  error, not "latest".
- **C3-07 `GL_INVALID_VALUE: glGetProgramiv: Program object expected`.** Not reproduced in any capture of this lane (top-tennis,
  roadster-rush, heatsink, cross-hop, teleoperator: no GL warnings). The 5.0.1 census already found it absent on the fixed build
  and tied it to the failed mount (poll of a program deleted by the disposed device). The parallel-compile poll
  (`WebGL2Device` ~L1840) already checks `host.disposed`, device loss and shader generation before `getProgramParameter`. No code
  change; recorded as not reproducible.
- **C2-01e `draw skipped ... Missing shader attribute a_position` (spiralorb-sparks, shadowstep-gauntlet).** Pre-existing: the same
  `[prd01] draw skipped` warning path and the `Missing shader attribute` diagnostic exist at `v4.7.13`
  (`ForwardPass.ts:1707`, `MaterialBinding.ts:50`), and `examples/ninja-runner-port/world.ts` (the `spiralorb-sparks` points
  geometry with a custom `sparksSpec()` material) is byte-identical between `v4.7.13` and HEAD. It is a game-data issue (custom
  material expects an attribute name the points geometry does not provide), not a renderer regression; left to the games lane.
