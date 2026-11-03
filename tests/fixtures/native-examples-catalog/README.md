# Native example catalog expectations (partial)

`expectations.json` contains independently authored **numeric hypotheses**, not
screenshots or evidence that a candidate rendered. The entries are derived
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
scenario, the four classified starter examples and the discovered documented
examples (see the last section). The browser catalog fails closed on missing IDs. The separate source
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

## Documented examples (2026-11-02, 5.0 pre-source-pass)

Discovery now resolves a published game URL slug (`/apps/chroma-roll/`) to its
source folder through `tools/site/games.catalog.json` instead of reporting a
missing example; docs that named nonexistent paths (planned apps, a deleted
V2 variant, a three.js `examples/jsm` path, a placeholder) were corrected, a
stale `neon-corridor-strike` classification row was removed and
`showcase-port-shared` is classified support-only. The six capability cases'
`tools/agent-examples/index.ts` digest was refreshed for that discovery-only
change (scaffolding is untouched).

24 documented examples now have entries authored the same way as the
templates: the subject's authored world extents projected through the
authored camera and canvas layout, colour bands from authored hex values, GLB
factors or UV-addressed texels, and digests of every file the numbers rely on.
They are uncalibrated hypotheses. At that point 60 discovered documented
examples had no entry, deliberately (title/menu overlays at the bare route,
2D-canvas or readback-composite pages, labs that dispose or render only on a
driver call, fixture hosts and wrappers that could not build in isolation, and
subjects whose colour could not be grounded); the last section records how
they were closed.

Release-prep digest refresh (same date): `arena-shooter`, both
`character-controller` copies and the animation-studio `scene-player.ts`
changed only their import specifiers from the removed 4.x subpaths
(`/production-runtime`, `/rendering`, `/contracts`) to `@aura3d/engine/renderer`
and `@aura3d/engine/game`, same symbols; `public/index.ts` only lost the
deprecated root names (the controls case's orbit binding exports remain);
`compiler/primitives.ts` gained an authored-only `alphaToCoverage` render-state
request, which no cataloged subject authors.

## Documented examples closed (2026-11-02, 5.0 catalog harness lane)

All discovered documented examples now have exactly one entry, authored the
same way as the first 24 (subject extents from authored camera/world data
projected at 1280 x 720 onto the page's own canvas layout; colour bands from
authored hex values, GLB factors, UV-addressed texels or a CPU evaluation of the
authored shader/post chain; digests of every file relied on). They remain
**uncalibrated, source-derived hypotheses**: lighting, grades, LUTs, bloom,
occlusion, animation and real browser layout were not exercised. Each case's
`provenance` carries its projection and colour reasoning; review notes below.

### Harness and route decisions

* **Per-case route start** (`tests/browser/native-examples-catalog.spec.ts`,
  validated by `catalogRouteErrors` and covered in the fixture unit test).
  Optional `query` (appended to the built HTML entry), `settle` (a `window`
  dot-path signal: `equals`, `atLeast` for a settled frame count or time, or
  truthy; bounded `timeoutMs`), `driver` (a documented page function awaited
  once after settle; it requires a settle) and `presentation`. Templates and
  capability scenarios may not use them. Every `query` is the route's own
  start parameter from its source; where a route had none, a small documented
  parameter was added that keeps the default behaviour: `?autostart=1`
  (`showcase-heatsink`), `?hold=1` (`showcase-aura-diamond-3d`),
  `?finish=` (`examples/product-configurator`) and `?material=`/`?lighting=`
  (`external-product-configurator`, `postprocess-lab`) and
  `?objects=`/`?materials=`/`?lights=` (`renderer-stress-lab`). Plain-value ready
  signals were added where a route only had a function:
  `__AURA_LAST_TRAIN_READY__`, `__AURA_SPLAT_RUSH__.booted`,
  `__AURA_DIAMOND_HOLD__.frames`.
* **Presentation kind.** The default (`gpu-canvas`) now also rejects a surface
  canvas that demonstrably requested only a 2D context (a worker-transferred
  canvas records none and is still accepted). `canvas2d` is for 2D-canvas and
  readback-composite pages: the surface canvas must have requested a `2d`
  context; any WebGL2/WebGPU contexts the page requests are recorded as its
  backend. The same bounded numeric regions apply. `parity-animation` and
  `parity-runtime-lab` dispose their apps after capture, so they now draw the
  captured frame into their presented 2D canvas (`#stage-frame`,
  `canvas[data-frame=...]`) before disposing; `custom-draw-probe` and
  `post-order-lab` use their documented drivers.
* **Fixture hosts.** `tests/fixtures/{external-*,foundation-editor-authored-app,asset-viewer}/index.html`
  load `/examples/<name>/...` root-absolutely (an isolated Vite build ignores
  `<base href>`); `tools/external-demo-export` strips that prefix when it
  resolves the entry. The editor runtimes fetch `project.json` through
  `new URL(..., import.meta.url)`; `asset-viewer` loads the engine's shipped
  `public/aura-decoders` Draco/meshopt pair instead of `/node_modules` paths.
* **Wrapper builds.** Every `apps/showcase-*-port` wrapper, `showcase-heatsink`
  and `showcase-aura-links-3d` build with `vite build` (typescript/vite
  devDependencies) like `showcase-aura-diamond-3d`; tsc-only builds moved to
  `typecheck`.
* **Dependency staging** (`stageExampleDependencies` in
  `tools/agent-examples/index.ts`, synthetic test in
  `native-example-retention.test.ts`). Relative imports that leave the project
  stage the sibling `apps/<name>` / `examples/<name>` directory or the single
  repo-root module (`src/aura-assets.ts`), transitively; `tsconfig` `extends`
  chains (`tsconfig.base.json`, `tsconfig.paths.generated.json`) are staged so
  shared compiler configs resolve, and their workspace `paths` fall back to the
  installed candidate. Package source, `node_modules` and build-tool configs
  (`vite.config` importing the root config) are never staged. Root-served files
  a staged source names by root-absolute URL (root `public/`, repo-root
  fixtures, a staged app's own `public/`) and the `/aura-assets/` files of the
  root asset-map keys an example reads are copied, with the stylesheets' fonts
  and glTF sidecars they reference, into a recorded harness public directory
  (standalone examples) or the project's `public/` (package apps). The
  capability cases' `tools/agent-examples/index.ts` digest was refreshed after
  review: capability scaffolding (`makeCapabilityProject`) is untouched.
* **Discovery.** A directory that holds only untracked build output (the
  removed `apps/showcase-red-zone-3d`, left with copied `public/aura-decoders`)
  is no longer treated as example source. `apps/asset-lookdev` is classified
  `internal diagnostic` (it needs `?glb=`, carries a three.js reference adapter
  and imports workspace package source).

### Review notes

* `showcase-top-tennis` and `examples/aura-slam` (a documented page-parity
  copy) share one region: a court-only region would exceed the 95% band cap,
  so it spans the far service boxes and the opaque `#faf8ee` net tape, whose
  band bounds the court share.
* `examples/aura-slam/main.ts` was re-pinned for both tennis cases after a
  concurrent lane removed one `eslint-disable` comment (no behaviour change).
* Port wrappers and their examples share one scene and region; each case pins
  its own page's `index.html` (wrappers add only a click-through credit).
* Starting-state windows, not settled poses: `kid-goku` / `cloud-runner`
  (runner hit at about 8 s), `roadster-rush` and `teleoperator` (an idle run
  can end and show a results card), `cinematic-architecture` (looping path,
  region valid at both ends).
* Weak bands, recorded in provenance: `where-the-wind-wanders` (a shaded meadow
  can share the hero's dark olive), `postprocess-lab` (the lab's own tone/bloom/
  FXAA chain desaturates the contrast red, so a light neutral grey also
  matches), `renderer-stress-lab` (a light warm grey matches the key-lit pink
  face; the ambient term is 0 or 0.18 depending on engine flags, both bounded), `showcase-smart-city-control` (small 48 x 44 ring region).
* Dark subjects were not banded: hull/glass/iron liveries that a blank canvas
  would satisfy were replaced by authored bright values on the same route
  (chevron, LED shards, tape, finishes).
* Two cases (`external-interior-scene`, `external-material-studio`) pin
  `packages/rendering/src/Renderer.ts` for the default auto-frame options and
  will need digest review if that file changes.
* Remaining harness risk outside this lane: apps whose `vite.config.ts` imports
  the repo-root config or sets `publicDir: ../../public` (for example
  `digital-twin-ops`, `aura-links-3d`, `bunker-zero`, `dot-dash-3d`,
  `iron-crown`, `cross-hop`) still do not build in the isolated harness; the
  root config aliases workspace source and is deliberately not staged.

| Example | Start query | Settle / driver | Subject |
| --- | --- | --- | --- |
| `apps/showcase-digital-twin-ops` | - | `__AURA3D_SHOWCASE_DIGITAL_TWIN_OPS__.frameCount` >= 30 | Cream controller cabinet (material_26) of the typed robotic welding workcell (showcaseRoboticWeldingWorkcell.cb604e0c.glb), front-centre of the cell |
| `apps/showcase-cinematic-architecture` | - | `__AURA3D_SHOWCASE_CINEMATIC_ARCHITECTURE__.status` = `"ready"` | Front meadow lawn (grass texel of texture.001 / texture_FINALE.001) of the typed skyline-city district (showcaseSkylineCity.2f6624cd.glb) |
| `apps/showcase-dot-dash-3d` | `?cinematics=0` | `__AURA3D_DOT_DASH__.frame` >= 30 | Row-13 corridor of cyan SMD LED data shards (board LED colour #5ff3ff, glowing instance pool) on the Relay Grid board, below the ghost house |
| `apps/showcase-bunker-zero` | `?floor=1` | `__AURA3D_ROUTE_READY__.ready` = `true` | First-person pistol viewmodel (typed bzPistol.ee15a8b3.glb): slate body texels and its cyan inlay strip on the grip |
| `apps/showcase-aura-links-3d` | `?flyover=0` | `__AURA3D_SHOWCASE_AURA_LINKS_3D__.framesRendered` >= 240 | Hero golfer (typed linksGolferAthleteClean.b56529b1.glb, targetHeight 1.84) at the St Auroras hole-1 tee: steel-blue shirt and skin texels |
| `apps/showcase-top-tennis` | `?intro=0&coach=0` | `__AURA_QA__.crops` | Far-half New York hard court: navy acrylic singles surface #2b678e (examples/aura-slam/view/venues.ts) between the net tape and the far service line |
| `apps/showcase-iron-crown` | - | `__AURA3D_SHOWCASE_IRON_CROWN__.frame` >= 120 | Crown Arena front combat-edge inlay: emissive accent #ff4d1f light strip at z +1.32 across the fight lane, between the two idle fighters |
| `apps/showcase-roadster-rush` | `?capture=1` | `__GAME__.game.mode` = `"playing"` | Player hero roadster (Meshy hero-cobalt.glb, cobalt retexture) centred in the chase frame |
| `apps/showcase-teleoperator` | `?intro=0` | `__AURA3D_SHOWCASE_TELEOPERATOR__.evidence.ready` = `true` | Player dispatch pod (route-local Meshy teleoperator_dispatchPodPearl.glb, pearl retexture) in the fixed chase frame |
| `apps/showcase-product-configurator` | - | `__AURA3D_SHOWCASE_PRODUCT_CONFIGURATOR__.status` = `"ready"` | Left earcup of the typed showcaseHeadphones GLB under the default Copper Limited gloss override (#f09363 clearcoat paint) |
| `apps/showcase-smart-city-control` | - | `__AURA3D_SHOWCASE_SMART_CITY_CONTROL__.status` = `"ready"` | Command-vehicle landing pad: cyan neon pad ring and docking beacon (#65d8e8, emissive 1.45) under the typed command vehicle at the vehicle-station region |
| `examples/heatsink-port` | `?autostart=1` | `__AURA_QA__.crops` | Player quad-rotor drone hull (drone2.glb copper accents) on its grid slot behind the settled chase camera |
| `apps/showcase-heatsink-port` | `?autostart=1` | `__AURA_QA__.crops` | Player quad-rotor drone hull (drone2.glb copper accents) on its grid slot behind the settled chase camera |
| `examples/drift-and-deliver-port` | `?autostart=1` | `__game.state.phase` = `"playing"` | Player courier car (courier.glb mint-teal paint) parked at its start, behind the shift-look chase camera |
| `apps/showcase-drift-and-deliver-port` | `?autostart=1` | `__game.state.phase` = `"playing"` | Player courier car (courier.glb mint-teal paint) parked at its start, behind the shift-look chase camera |
| `examples/last-train-port` | `?title=0` | `__AURA_LAST_TRAIN_READY__` = `true` | Docked cherry-enamel tram body (tram-enamel.glb) at the first station under the docked side camera |
| `apps/showcase-last-train-port` | `?title=0` | `__AURA_LAST_TRAIN_READY__` = `true` | Docked cherry-enamel tram body (tram-enamel.glb) at the first station under the docked side camera |
| `examples/kid-goku-beyond-the-clouds-port` | `?autostart=1` | `__AURA_CUMULUS_DASH__.ready` = `true` | Runner hero (hero.glb teal gi with gold accents) in lane 0 behind the playing chase camera |
| `apps/showcase-cloud-runner-port` | `?autostart=1` | `__AURA_CUMULUS_DASH__.ready` = `true` | Runner hero (hero.glb teal gi with gold accents) in lane 0 behind the playing chase camera |
| `examples/ninja-runner-port` | `?autostart=1&manual=1` | `__lanternhold.state.phase` = `"running"` | Hero runner (hero.glb, orange-and-navy baked texture) at the course start s 0, seen from the default chase camera |
| `apps/showcase-ninja-runner-port` | `?autostart=1&manual=1` | `__lanternhold.state.phase` = `"running"` | Hero runner (hero.glb, orange-and-navy baked texture) at the course start s 0 in the Shadowstep Gauntlet wrapper |
| `examples/roadster-hours-port` | `?autostart=1&manual=1` | `__AURA_ROADSTER_HOURS__.ready` = `true` | Player roadster (baked Meshy model, teal paint with orange trim) on the start line at s 8, seen from the GU47 chase camera |
| `apps/showcase-roadster-hours-port` | `?autostart=1&manual=1` | `__AURA_ROADSTER_HOURS__.ready` = `true` | Player roadster (baked Meshy model, teal paint with orange trim) on the start line at s 8 in the Saltwind Highway wrapper |
| `examples/silt-and-signal-port` | `?manual=1` | `__AURA_SILT__.ready` = `true` | Hoverboard (hoverboard.glb, near-white deck) and the courier's feet at the chapter-0 start, seen from the inked chase camera |
| `apps/showcase-silt-and-signal-port` | `?manual=1` | `__AURA_SILT__.ready` = `true` | Hoverboard (hoverboard.glb, near-white deck) and the courier's feet at the chapter-0 start in the Duneglide wrapper |
| `apps/showcase-serpentine-sky-run-port` | `?autostart=1&manual=1` | `__AURA_SERPENTINE_SKY_RUN__.ready` = `true`; driver `__AURA_SERPENTINE_SKY_RUN__.stepFrames(300)` | Rigged runner (runner-script.glb, maroon suit) 5 s into an idle run, seen from the colour-script chase camera |
| `examples/splat-rush-port` | `?autostart=1&manual=1&warmup=240` | `__AURA_SPLAT_RUSH__.booted` = `true`; driver `__AURA_SPLAT_RUSH__.begin()` | The player's red #f0433a paint ball on the cream deck at the first step of a run (frozen chase pose) |
| `apps/showcase-splat-rush-port` | `?autostart=1&manual=1&warmup=240` | `__AURA_SPLAT_RUSH__.booted` = `true`; driver `__AURA_SPLAT_RUSH__.begin()` | The player's red #f0433a paint ball on the cream deck at the first step of a run (frozen chase pose), through the showcase wrapper |
| `examples/strange-orbit-port` | `?autostart=1&manual=1` | `__orbit.state.phase` = `"countdown"` | The banded peach/terracotta gas giant in the countdown's opening planet shot |
| `apps/showcase-strange-orbit-port` | `?autostart=1&manual=1` | `__orbit.state.phase` = `"countdown"` | The banded peach/terracotta gas giant in the countdown's opening planet shot, through the showcase wrapper |
| `examples/where-the-wind-wanders-port` | `?start=1` | `__AURA_WIND__.daylight` | The Bellkeeper hero (typed hero.glb, dark-olive baked texture) standing at the start of the walk under the follow camera |
| `apps/showcase-where-the-wind-wanders-port` | `?start=1` | `__AURA_WIND__.daylight` | The Bellkeeper hero (typed hero.glb, dark-olive baked texture) standing at the start of the walk, through the showcase wrapper |
| `examples/10-particles` | - | `__AURA3D_EXAMPLE__.status` = `"ready"` | Young orange particles (ColorModule t=0 colour rgba(1,0.72,0.25,1)) of the seeded CPU fountain around its emitter box (canvas2d) |
| `examples/animated-character` | - | `__AURA3D_ANIMATED_CHARACTER_EXAMPLE__.status` = `"ready"` | Diagnostic rig head disc (#f5c84b, radius 34 canvas px) across its procedural-walk hip travel (canvas2d) |
| `examples/animation-state-machine` | - | `__AURA3D_ANIMATION_STATE_MACHINE_EXAMPLE__.status` = `"ready"` | The current-state 'walk' node: #ff8d63 rounded box (140x68 canvas px) at canvas (480, 226.8) (canvas2d) |
| `examples/raycast-ccd-lab` | - | `__AURA3D_RAYCAST_CCD_LAB__.status` = `"ready"` | Filtered corridor ray (cyan UnlitMaterial [0.2,0.9,1]) and spherecast contact line (orange [1,0.7,0.18]) where they run side by side |
| `examples/parity-animation` | - | `__AURA3D_PARITY_ANIMATION__.status` = `"ready"` | Clones 4 and 5 of the ten Run-posed soldier.glb clones (tan/orange areas of the Vanguard diffuse) in the presented app.capture() frame (canvas2d) |
| `examples/parity-runtime-lab` | - | `__AURA3D_PARITY_RUNTIME_LAB__.status` = `"ready"` | SR-02 fog-baseline frame: the left #2a6cff PBR box (size 1.4 at x -1.2), presented from its measured readback (canvas2d) |
| `examples/custom-draw-probe` | - | `__CDP_READY__` = `true`; driver `__CDP__.run("opaque-red")` | 'opaque-red' case: material.custom constant outColor vec4(1,0,0,1) on a 2.4x2.4 double-sided quad |
| `examples/external-asset-gallery` | - | `__AURA3D_ASSET_STUDIO__.status` = `"ready"` | Feature-coverage chip for the first corpus record's 'pbr' tag (#a86f2d), drawn by drawAssetPreview on the 2D coverage canvas (canvas2d) |
| `examples/external-interactive-showcase` | - | `__A3D_EXTERNAL_PARITY_INTERACTIVE_SHOWCASE__.status` = `"ready"` | Center interaction target (catalog variant #d86a35 rounded block) on the 2D interaction-state canvas (canvas2d) |
| `examples/external-editor-authored-app` | - | `__AURA3D_EXPORTED_PROJECT__.status` = `"ready"` | 'Imported Fox Hero' node (authored material baseColor #ff8844 in project.json) on the static-export Canvas2D runtime (canvas2d) |
| `examples/foundation-editor-authored-app` | - | `__AURA3D_EXPORTED_PROJECT__.status` = `"ready"` | 'Imported Fox GLB' node (authored material baseColor #ff8844 in project.json) on the static-export Canvas2D runtime (canvas2d) |
| `examples/external-interior-scene` | - | `__A3D_EXTERNAL_PARITY_INTERIOR_SCENE__.status` = `"ready"` | Blue art panel (PBRMaterial baseColor [0.05,0.2,0.85]) on the limestone back wall of the WebGL2 interior gallery |
| `examples/external-material-studio` | - | `__A3D_EXTERNAL_PARITY_MATERIAL_STUDIO__.status` = `"ready"` | Glossy Plastic sphere (matrix index 5, baseColor [0.02,0.28,0.9], metallic 0) at the top-right of the 12-material WebGL2 matrix |
| `examples/external-extension-lab` | - | `__AURA3D_EXTERNAL_EXTENSION_LAB__.status` = `"ready"` | Bright cyan telemetry junction at node c (links a-c, b-c, c-d, c-e) of the external ShaderModule pass, host-baseline state |
| `examples/external-character-viewer` | - | `__A3D_EXTERNAL_PARITY_CHARACTER_VIEWER__.status` = `"ready"` | Typed showcaseExpressiveRobot (Main material, linear base [0.59,0.29,0.038]) torso/head band under the authored perspective camera |
| `examples/asset-viewer` | - | `__AURA3D_ASSET_VIEWER__.status` = `"ready"` | Default speaker.gltf 'satin-cabinet' (baseColorFactor [0.42,0.25,0.13] x its 1x1 (255,255,0) texel) left side and front-left frame |
| `examples/post-order-lab` | - | `__AURA_POST_ORDER_LAB__.status` = `"ready"`; driver `__AURA_POST_ORDER_LAB_SET_SLOT__("after-bloom")` | Order-band HDR custom pass (constant vec4(8.0, 0.0, 8.0) over the left 12% of the 1120x490 canvas) at the after-bloom slot |
| `examples/custom-shader-webgpu-lab` | - | `__AURA_CUSTOM_SHADER_BACKEND_LAB__.status` = `"ready"` | material.custom sphere: authored tint #ff3a2a x sin band (0.55-1.0) x gain 1, unlit, on the default webgl2 backend |
| `examples/product-configurator` | `?finish=ceramic` | `__AURA3D_PRODUCT_DEMO__.activeVariant` = `"ceramic"` | Typed showcaseHeadphones left ear cup in the documented Ceramic finish (contrast mode red base [0.9, 0.16, 0.12]) |
| `examples/character-animation-viewer` | - | `__AURA3D_CHARACTER_ANIMATION_VIEWER__.status` = `"ready"` | Full-body typed showcaseExpressiveRobot torso: GLB 'Main' material baseColorFactor [0.590, 0.291, 0.038] |
| `examples/saiyan-snake-way-port` | `?autostart=1&manual=1` | `__AURA_SERPENTINE_SKY_RUN__.ready` = `true`; driver `__AURA_SERPENTINE_SKY_RUN__.stepFrames(300)` | Rigged runner (runner-script.glb, maroon suit) 5 s into an idle run, seen from the colour-script chase camera |
| `examples/aura-slam` | `?intro=0&coach=0` | `__AURA_QA__.crops` | Far-half New York hard court: navy acrylic singles surface #2b678e (examples/aura-slam/view/venues.ts) between the net tape and the far service line |
| `apps/showcase-heatsink` | `?autostart=1&qaManual=1` | `__AURA3D_GAME_EVIDENCE__.ready` = `true` | Molten-amber (#ff8a1f) wall chevron on the right wall behind the player drone, in the held countdown '3' shot |
| `apps/showcase-aura-diamond-3d` | `?hold=1` | `__AURA_DIAMOND_HOLD__.frames` >= 180 | Infield clay (#b86a42) edge against the mown foul-territory turf (#4b7d35) right of home plate, under the held batting camera |
| `examples/external-product-configurator` | `?material=contrast` | `__A3D_EXTERNAL_PARITY_PRODUCT_CONFIGURATOR__.materialMode` = `"contrast"` | Typed showcaseHeadphones left ear cup under the fixture's documented ?material=contrast mode (Product Studio contrast palette entry 0, base [0.9, 0.16, 0.12]) |
| `examples/postprocess-lab` | `?material=contrast` | `__AURA3D_POSTPROCESS_LAB__.realScene.materialMode` = `"contrast"` | Typed showcaseHeadphones left ear cup in the final postprocess composite, rendered with the lab's documented ?material=contrast flat red base [0.9, 0.16, 0.12] (canvas2d) |
| `examples/renderer-stress-lab` | `?lights=1` | `__AURA3D_RENDERER_STRESS_LAB__.lightCount` = `1` | Front face of grid object 15 (a Geometry.litCube, material 7: dielectric pink base [0.96,0.48,0.68], roughness 0.5, emissive [0.02,0.08,0.04]) lit only by the orange directional key light under the documented ?lights=1 start |
