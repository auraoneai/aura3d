# Native example catalog expectations (partial)

`expectations.json` contains independently authored **numeric hypotheses**, not
screenshots or evidence that a candidate rendered. The 23 entries are derived
from the checked-in scene sources and their recorded SHA-256 digests. The
typed-asset starter also uses the material factors in its existing hashed robot
GLB; its current asset metadata does not specify a license. No captured frame
or third-party engine implementation was used to author these expectations.

The regions assume the catalog spec's 1280 × 720 viewport and an unobscured
full-page canvas. Their centers come from perspective projection of the authored
world positions and camera; their color bands start with the authored material
or constant fragment colors and allow for output processing. Fraction bounds
are intended to reject missing subjects and uniformly filled regions, but
similar-colored unrelated geometry can still be a false positive. Because lighting,
occlusion, output processing, and real browser layout were not exercised, these
are source-derived acceptance inputs, **not calibrated or passing results**.
The dedicated unit tests check the source digests, camera projections, bounded
bands, and failure on synthetic wrong/absent subjects without launching a browser.

This manifest is deliberately **incomplete**: it contains nine of the 20
templates, all 10 currently enumerated capability scenarios, and
the four classified starter examples. Dynamically discovered
documented examples are not covered. The browser catalog fails
closed on missing IDs. The separate source inventory tests also require every
current catalog ID and will fail until independently grounded expectations are
added; do not fill the remainder with generic background/color checks or mark
the inventory tests skipped. The catalog can change, so these counts are not a
substitute for re-running discovery.
A pre-reconciliation discovery run reported 88 missing documented examples;
discovery has since changed, so the current count must be recomputed on the
source runner. The eleven missing templates are listed below.

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

Eleven current template IDs remain without a defensible fixture:

* `template:architecture-interior` and `template:custom-scene`: the typed hero
  GLBs (Kenney Modular Dungeon Kit, Kenney Pirate Kit) refer to an absent
  `Textures/colormap.png`; no byte-verified copy of either kit's colormap exists
  in the repository or its history. A generic floor, pedestal, or scale cube
  would not establish the typed subject. Asset ownership needs to resolve the
  texture.
* `template:asset-inspector`, `template:character-viewer`, and
  `template:large-scene`: the typed GLBs' `Textures/colormap.png` is now
  admitted with a dependency digest (Car Kit and Mini Forest colormaps,
  byte-identical to textures embedded in provenance-recorded derivatives of the
  same kits). No source-derived subject expectation has been written yet.
* `template:animation-studio`: the default live route intentionally mounts an
  empty neutral placeholder with no characters or props. A floor-color check
  would not establish a scene; the example document is not the default route.
* `template:animation-channel`: the canvas is moved into the framed preview and
  its `#app` has `pointer-events: none`. The catalog's current canvas
  `elementFromPoint` exposure check cannot identify that canvas. The layout and
  exposure contract need reconciliation before an honest region is admitted.
* `template:mini-game`: the hero texture is embedded, and the key and stars
  now ship the Kenney Platformer Kit `public/aura-assets/Textures/colormap.png`
  with a typed dependency digest. An in-memory-only source test confirms the
  typed loader admits both with that digest and still rejects them without it.
  No source-derived subject expectation has been written for the default scene
  yet.
* `template:character-controller`: its player GLB has embedded textures, but
  the default-on shoulder rig uses collision. A historical unscoped probe hit
  the hero itself and placed over 90% of sampled skinned vertices in front of
  the near plane. The current app controller excludes the subject, and the
  existing `native-camera-character-subject-regression.test.ts` reconstruction
  with the real GLB, frozen `Walk_Loop`, owner-scoped matrices and scene boxes
  passes: less than 10% of sampled vertices are in front of the near plane.
  This does not mount the template or prove browser output. The right-half look
  pad still intercepts canvas exposure, and subject colors and occlusion remain
  uncalibrated; resolve those before authoring a region.
* `template:fighting-game`: the live fighting rig, autonomous rival, runtime
  transforms and animated typed subjects need independent projection and
  texture analysis; fixed fallback camera coordinates alone are not a
  reliable region.
* `template:premium-product-viewer`: the old extra scale made the ToyCar
  subpixel after model normalization. The template now fits the asset and
  frames the car using bounds measured from its transformed GLB nodes. A
  source test projects unoccluded car vertices across roughly 46% of the
  frame height, but texture colors, occlusion and rendered appearance have
  not been independently established. The manifest's untransformed bounds
  also remain stale. Those facts do not yet justify a subject-color region;
  the plinth would be a false substitute.

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
