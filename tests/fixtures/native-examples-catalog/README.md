# Native example catalog expectations (partial)

`expectations.json` contains independently authored **numeric hypotheses**, not
screenshots or evidence that a candidate rendered. The 36 entries are derived
from the checked-in scene sources and their recorded SHA-256 digests. The
typed-asset starter also uses the material factors in its existing hashed robot
GLB; its current asset metadata does not specify a license. No captured frame
or third-party engine implementation was used to author these expectations.

The regions assume the catalog spec's 1280 × 720 viewport and, except for the
framed animation-channel and animation-studio canvases noted below, an
unobscured full-page canvas. Their centers come from perspective projection of the authored
world positions and camera; their color bands start with the authored material
or constant fragment colors and allow for output processing. Fraction bounds
are intended to reject missing subjects and uniformly filled regions, but
similar-colored unrelated geometry can still be a false positive. Because lighting,
occlusion, output processing, and real browser layout were not exercised, these
are source-derived acceptance inputs, **not calibrated or passing results**.
The dedicated unit tests check the source digests, camera projections, bounded
bands, and failure on synthetic wrong/absent subjects without launching a browser.

This manifest covers all 20 templates, every currently enumerated capability
scenario and the four classified starter examples. Dynamically discovered
documented examples are **not** covered (their inventory test still fails, by
design). The browser catalog fails closed on missing IDs. The separate source
inventory tests also require every current catalog ID; do not fill the
remainder with generic background/color checks or mark the inventory tests
skipped. The catalog can change, so these counts are not a substitute for
re-running discovery.
A pre-reconciliation discovery run reported 88 missing documented examples;
discovery has since changed, so the current count must be recomputed on the
source runner.

The cinematic template entry identifies the recipe's **tilted cyan neon sign**
at its initial, WebDriver-paused dolly pose. It does not establish that the
typed helmet, rain, dolly motion, or wet reflections rendered. The separate
postprocess template entry targets the authored Miko model: the blue and
skin-tone samples come from actual mesh UVs and the embedded atlas, not from
the backdrop. It does not establish that Luma or bloom rendered. The numeric
bands, subject coverage, and framing of both are uncalibrated hypotheses.

The racing entry targets the **typed sports car**, not its checkpoint or
finish marker. At the no-input start, the closed scaled route's 4% point is
approximately `[1.096, 1.206, -1.454]` with yaw `1.799` radians. With the
default-on chase rig settled, its camera is approximately
`[-2.800, 3.006, -0.550]`, looking at `[1.096, 2.406, -1.454]`, at 60°.
The car GLB's root rotates its meshes by -90° about X; the safe renderer then
fits its loaded bounds to a 1.55-unit maximum dimension before the authored
scale of 1. The tested region contains projected body and rear-lamp triangles
of the actual GLB. The body material's linear base factor is
`[1, 0.5122415946564827, 0]`; the lamp has red base and emissive factors
`[1, 0, 0]`. Neither material uses a texture. The color bands allow output
processing and require both colors, not a generic orange area.

The source test projects selected triangle vertices and checks each centroid
and three interior samples against the other car triangles and the authored
marker boxes. It also projects the fitted circuit's bounding box outside the
region at that pose: this matters
because the circuit contains an orange material very close to the car's. These
geometric checks are not a renderer, a complete visibility proof, or evidence
that the thresholds will pass. Camera startup is transient, the template
auto-starts, and the observation is a **settled no-input starting-state
hypothesis**, not a frozen first-frame claim. The checkpoint can overlap other
parts of the car; browser exposure, actual occlusion, lighting, grading, bloom
and red-lamp pixel coverage remain unverified and require later calibration.

The runtime-owner change was rechecked rather than merely rehashed. The route's
`["game"]` option leaves core, camera and compiler default-on. The app registers
its matrix cache and color policy with its runtime owner, and the compiled and
legacy frame paths pass that owner through. A source-only test reconstructs the
relevant root nodes at the settled pose and feeds the real car and circuit GLB
bytes through an **in-memory-only fetch stub**, the typed actor loader, runtime
handles and owner-scoped frame-input builder. The resulting car and track
matrices match the independently calculated normalized placements; the marker
matrices match the boxes used in the occlusion test. The loaded body/lamp
material factors are unchanged, and scoped versus legacy parsing agrees for
the authored hex colors. The camera produced from the post-query handle agrees
with the original chase calculation, and the frame-input view-projection agrees
with its projected points. The chase has neither a framing nor collision option,
so published query bounds do not drive that settled arm. The dependency digests
include these registration, flag, cache and input seams.

This test reconstructs the input; it does not mount the full template, run its
look/post chain, draw a frame, or observe pixels. **TODO:** after the global
code gate, calibrate the region and both color/coverage thresholds against the
actual unobscured browser output, including startup, occlusion, and overlays.
Until then the existing numbers remain hypotheses, not validated results.

The racing input-replay and runtime-node changes were rechecked with the real
typed GLB bytes, starting game state, owner-scoped registry and frame-input
matrices; the source-derived projection test still passes. Their dependency
digests were updated. Camera, app-core and compiler-renderer dependencies
remain in active integration and some digests are still stale. The fixture
digest test correctly fails until those changes are reviewed and reconciled.

The eleven templates that previously had no defensible fixture now have
source-derived entries, grounded by `tests/unit/tools/native-examples-catalog-templates.test.ts`
(helpers in `native-examples-catalog-template-support.ts`). Each test pins the
authored builder values in the template source, feeds the real hashed GLB bytes
(and digest-pinned `Textures/colormap.png` dependencies) through the production
typed-actor loader and frame-input builder behind an in-memory fetch stub, and
projects the resulting vertices with the frame's own view-projection (or, for
game templates, the pose produced by the real camera controller and rig after
runtime bounds are published). Color bands are checked against an area-weighted
histogram of the base colors the GLB's own UVs address, never a decoded GPU
texture or capture:

* `architecture-interior`, `custom-scene`, `asset-inspector`,
  `character-viewer`, `large-scene`, `premium-product-viewer`: the templates'
  own mounted scenes (only `createAuraApp` is stubbed). The Dungeon and Pirate
  kit colormaps are now admitted with dependency digests. The asset-inspector
  region avoids the bottom-right diagnostics overlay; the large-scene region
  requires at least six instanced trees and a canopy band that excludes the
  meadow color; the ToyCar bands exclude the dark-red Fabric below it.
* `mini-game`: the hero rebuilt with the template's builder values, posed by
  `follow2d` with its `subjectHeightFraction`; the region sits below the
  pointer-transparent HUD panel.
* `character-controller`: **template fix.** The right-half `#look-pad` bound an
  orbit rig that was never presented through a `bindPointer` method that does
  not exist, so it did nothing except swallow canvas pointer input. It was
  removed from both template copies. The subject is posed by the real camera
  controller's subject-scoped shoulder rig.
* `fighting-game`: both fighters rebuilt through the template's own
  `createFighterNode` and framed by the real `rigs.fighting` pose; the region
  spans both torsos above the bottom HUD. The rival is autonomous and moves after
  start; the region is a starting-state hypothesis.
* `animation-channel`: **template fix.** `#app` set `pointer-events: none`,
  which the canvas inherited, so it was never the hit target. The property was
  removed (the template has no pointer interaction it was protecting). The
  region is the authored moon-portal core inside the framed 1232 x 693 preview
  canvas at (24, 13.5).
* `animation-studio`: its README and route intentionally play the empty
  placeholder on first run, so the entry records that state. The placeholder
  previously rendered a near-uniform grey void that no region could tell apart
  from a blank canvas; it now carries a self-lit neutral stage mark (a set
  piece, not cast, props or set dressing) and the region is that mark under the
  establishing preset on the 960 x 540 canvas. It is not evidence that an
  episode renders.

All of these remain uncalibrated, source-derived hypotheses: lighting, grades,
bloom, occlusion by stage geometry, animation and startup transients, and real
browser layout were not exercised.

These are source-inspection findings and limitations, not claims that any
template passed or failed in a browser. The controller reconstruction does not
mount the app or draw pixels; its startup transients and final browser behavior
remain unverified.

The physics entry checks the presence of the colored ball only. A still image
does not establish that a body falls, makes contact, or drives a node; those
behaviors need separately controlled time/state assertions after the gate.
The camera-path entry checks the camera subject's appearance; it does not
establish the dolly animation or the timings in the authored path.
The instancing entry checks the visible color gradient; it does not establish
the instance count, a single draw call, dynamic updates or performance.

Each capability project is an untouched `mini-game` create-aura3d scaffold
(its manifest, configs, `index.html` with a full-page `#app`, and typed assets)
plus only `src/scenario.ts` and the replaced `src/main.ts` scene module; the
`tools/agent-examples/index.ts` digest was updated for that change, which keeps
the full-page canvas these regions assume.

The bounds-query harness invokes `queryNativeScenarioBounds` after mounting and
publishes a validated subject hit as `window.__AURA_EXAMPLE_BOUNDS_HIT__`
before readiness. Missing, non-finite, wrong-target, and off-ray results fail
closed and dispose the app. Focused source tests cover this wiring without
starting a browser; the numeric subject expectation remains uncalibrated.

The postprocess, animation, and controls entries identify the same admitted
barbarian subject as the scenario source, not the backdrop. Their static
expectations do **not** establish the features. The gated browser runner also:

* compares the authored `contrast: 1.12, saturation: 0.8` grade with a
  neutral grade and a restored grade on the same paused app and post chain.
  It requires a submitted grade stage, clean drawn frames, unchanged camera
  and clock, skin-tone subject-region color change and reduced chroma, and a stable
  restored frame;
* inspects `Idle` animation/skin diagnostics and compares the same subject at
  a cycle boundary and half a cycle later with a stable camera and a repeated
  unchanged-time control. The admitted GLB's 33-key hips translation and
  32/30-second `Idle` duration ground the chosen pair in actual asset bytes;
* sends a real pointer drag to the candidate canvas, then requires both a
  changed presented camera and changed subject-region pixels, with a stable
  no-input control. It does not install a rig or fabricate camera movement.

The comparisons mask the independently inspected skin-tone band, not the
blue-gray band shared with the floor. The pixel thresholds, texture bands, and chroma direction are independent
source-based hypotheses, **not calibrated browser outcomes**. Missing camera,
animation, post diagnostics, subject pixels, or actual response fails closed.
The controls scenario binds the public orbit rig to its canvas and named model,
and releases that binding when the app is disposed. Focused source tests cover
the pointer-to-camera path; actual browser interaction remains unverified.

After the global `CODE_COMPLETE_GO` gate, the authorized remote acceptance run
must evaluate the actual candidate. Correct genuinely inaccurate expectations
with documented independent reasoning and retain failures; do not bless a
candidate's screenshot automatically or label source-only tests as browser
evidence.

## Dependency digest review (2026-11-02, 5.0 lanes)

The digests of `sceneMath.ts` and 19 engine/asset/game files changed by 5.0
lanes since `26eae82e2` were re-reviewed against the behavior each case relies
on before refreshing, not rehashed blindly:

* `sceneMath.ts`: `createCameraMatrices` gained a depth-convention argument;
  the public query view-projection now always uses standard depth. x/y
  projection is identical in every depth mode, so projected regions are
  unchanged. `public/index.ts`: additive `bindPointerInteractions` exports only.
* `nodes/camera.ts`: builders now forward `up`, view offset, film/focal and
  depth options only when authored and pass the projection mode to clipping
  validation; defaults (near 0.05, far 100, positions, fov) are unchanged and
  no cataloged template authors the new options.
* `camera/rigs/orbit.ts`, `chase.ts`, `rigUtils.ts`, `camera/extension.ts`:
  subject-scoped collision probes and pointer-capture leases. The catalog's
  orbit cameras use the default pose and the racing chase rig has no
  collision, so settled poses are unchanged (the racing reconstruction still
  matches its recorded pose).
* `sceneGraph.ts`, `compiler/sceneGraph.ts`, `compiler/primitives.ts`,
  `compiler/renderInput.ts`, `app/runtimeNodes.ts`: own-node pivot + lookAt
  composition, scene-graph quaternion/rotationOrder routing, primitive
  blend/depthWrite/alphaCutoff/specular options, forwarded primitive
  `receiveShadow`, selective-bloom weights and pivoted physics collider
  rebuilds. None of the cataloged subjects use lookAt, pivots, quaternions or
  those material options, so their matrices and default render state are
  unchanged.
* `compiler/actors.ts`, `production-runtime/TypedGLBActor.ts`,
  `assets/src/GLTFRenderResources.ts`: live runtime material for bloom, opt-in
  deformed-bounds evidence (tagged nodes only), custom-shader slot maps, and
  external-texture reads through the request contract. The racing GLBs have no
  external images and the car's material factors are unchanged.
* `compiler/renderer.ts`, `compiler/compileScene.ts`,
  `app/createAuraAppCore.ts`, `GameRuntimeCore.ts`, `game/src/createGameCore.ts`:
  diagnostics (depth convention, frame timing, texture stages), GPU splat sort,
  in-place primitive bookkeeping, cleanup aggregation and pivot physics
  syncing. The owner-scoped matrix cache, color policy and frame-input wiring
  the racing test pins are unchanged, and that reconstruction passes after the
  refresh.
