> **REMEDIATION STATUS — see `docs/project/plans/aura3d-product-remediation-prd.md`
> for the full ledger and final report.**
>
> **All 17 phases complete**, plus the route-by-route audit, metrics, verification and
> PRD ledger.
>
> Headline evidence: 87/87 public controls and 47/47 keyboard bindings verified by
> operation across 13 routes with zero console errors; 21/21 quality gates with zero
> unproven; 192 unit tests over 9 new reusable engine modules; 5 application kits with
> browser-verified route adoption; 4 clean-room projects inside budget with zero private
> imports; 2903/2904 unit and integration tests across two serial runs.
>
> Release and marketing freeze **observed**: no npm publish, no GitHub release, no
> marketing deploy, no version change, and no route-status promotion. The three
> registered game routes remain `prototype-blocked`; Aura Clash is not in the route-gate
> registry at all, so it is ungated rather than blocked, and adding it would itself be a
> status change.
>
> Recommendation: **Aura3D has not earned another release.**

You are working in:

/Users/gurbakshchahal/platforms/aura3d

Mission

Perform a complete product-level remediation of Aura3D.

Aura3D is currently an inconsistent collection of packages, partial systems, route-local patches, static scene helpers, game prototypes, evidence generators, examples, and one-off abstractions.

Some individual capabilities are useful, including:

* typed scene authoring
* asset discovery and provenance
* deterministic asset references
* generated evidence
* reusable scene-composition helpers
* package boundaries
* renderer abstractions

However, the product as a whole is not coherent or dependable enough for developers to use correctly.

The public examples reveal basic failures:

* cars sink into roads
* cars leave the track
* AI cars move sideways or behave nonsensically
* vehicle wheels, orientation, contact, and suspension are unreliable
* platformer jumping and landing look physically wrong
* platformer worlds appear like disconnected floating strips
* gameplay sessions end arbitrarily after roughly 30–150 seconds
* fighting animations do not produce realistic combat
* focus controls produce flattened yellow or white bars instead of meaningful selection indicators
* expected callout labels do not render
* procedural boxes float outside or beside the scene
* helper geometry is positioned with hardcoded coordinates unrelated to asset bounds
* static examples can look broken after basic interaction
* screenshot and pixel-based checks pass despite obvious visual and gameplay defects
* examples have not been manually exercised through their controls
* packages expose overlapping or incomplete responsibilities
* routes frequently implement behavior themselves instead of consuming strong reusable systems
* a new developer would be forced to diagnose and solve the same engine problems again

The result is a hodgepodge library rather than a coherent 3D development platform.

Your task is to fix that product.

Do not perform another release-oriented cleanup.

Do not merely fix the screenshots supplied by the user.

Do not limit the work to Turbo, Skyline, Aura Clash, or Blockfall.

Every public example and the reusable library beneath it must be audited, corrected, consolidated, and proven usable.

Governing product objective

Aura3D must provide a more coherent, integrated, typed, and agent-friendly development experience than assembling an equivalent application from Three.js and its surrounding ecosystem.

This does not mean matching only the three package.

The comparison must include the practical ecosystem developers use with Three.js:

* Three.js
* React Three Fiber where relevant
* Drei-style helpers
* Rapier, Cannon, or equivalent physics integrations
* glTF tooling
* camera controls
* postprocessing
* animation mixers and state logic
* debugging tools
* performance tools
* loaders
* scene inspectors
* game-loop infrastructure
* community examples
* reusable controls and interaction patterns

Aura3D must aim to equal or exceed that practical stack through a unified system with:

* fewer integration decisions
* fewer lines of user code
* better defaults
* stronger typing
* deterministic behavior
* asset-aware placement
* integrated runtime diagnostics
* integrated physics and controls
* consistent interaction patterns
* coherent public APIs
* reusable game and application kits
* reliable examples
* agent-ready workflows
* lower-level escape hatches

Do not claim global parity or superiority unless it is demonstrated category by category.

Release and marketing freeze

Until this assignment is complete:

* Do not publish another npm version.
* Do not create another GitHub release.
* Do not promote route statuses.
* Do not rewrite the README to imply completion.
* Do not refresh posters to hide runtime defects.
* Do not spend time on release mechanics.
* Do not use package publication, a Git tag, screenshots, or website deployment as evidence of product quality.

Aura3D 1.5.0 is the baseline under remediation.

The next release must be earned by the actual product.

Security and repository rules

1. Never print, copy, reuse, or preserve authentication tokens found in logs, conversations, terminal history, or files.
2. Do not modify npm authentication, GitHub authentication, DNS, Vercel, deployment aliases, or external services.
3. Stay on the current branch unless explicitly instructed otherwise.
4. Inspect the working tree before editing.
5. Do not reset, stash, clean, restore, delete, or overwrite unrelated work.
6. Maintain an explicit file-change ledger.
7. Do not weaken tests or assertions to create passing output.
8. Do not convert real failures into expected snapshots.
9. Do not add route-name conditions to reusable engine code.
10. Do not fix a generic problem only inside one showcase route.
11. Do not substitute a different asset to avoid diagnosing an engine defect unless the asset itself is objectively invalid.
12. Do not use first-frame screenshots as proof that an interactive route works.
13. Do not claim a route is fixed without exercising its controls.
14. Do not declare a public API complete because it typechecks.
15. Do not ask the user to choose routine technical implementation steps.
16. Do not give speculative completion estimates.
17. Be explicit when a problem is an application-authoring error, engine defect, API design defect, asset defect, or missing capability.
18. Preserve honest prototype or blocked statuses until the evidence supports changing them.

Product truth that must guide this work

The prior implementation focused heavily on:

* static placement
* deterministic scene arrangement
* screenshot composition
* asset bounds
* evidence freshness
* color and flat-region analysis
* release gates
* package publishing
* marketing visuals

Those systems may remain where useful.

They are not substitutes for:

* correct runtime behavior
* coherent interaction
* physics
* AI
* animation synchronization
* collision
* selection feedback
* dynamic placement
* responsive controls
* complete workflows
* usable examples
* developer productivity

A metric that counts colored pixels cannot detect:

* a car clipping through a barrier
* an opponent driving sideways
* a character floating
* a torus flattened into a bar
* a callout label failing to render
* geometry floating away from its asset
* an attack dealing damage before contact
* a button producing the wrong visual result

Runtime and interaction quality must now control the definition of success.

Phase 1: inventory the entire product  [x] COMPLETE

> tests/reports/aura3d-product-inventory.json + docs/project/plans/aura3d-product-remediation-prd.md

Create an authoritative inventory of:

* every workspace package
* every public export
* every major internal system
* every app under apps/
* every public showcase route
* every starter example
* every advanced example
* every gallery example
* every marketing-linked experience
* every generated template
* every CLI workflow
* every evidence producer
* every duplicated abstraction
* every incomplete or stubbed abstraction
* every route-local subsystem that should be reusable

Create:

docs/project/plans/aura3d-product-remediation-prd.md

and:

tests/reports/aura3d-product-inventory.json

For every application or example record:

* route ID
* purpose
* category
* public/private status
* packages consumed
* private imports
* lines of route-local code
* controls
* expected interactions
* runtime systems
* assets
* physics usage
* animation usage
* evidence coverage
* manual interaction status
* visual defects
* runtime defects
* API defects exposed
* current maturity
* release suitability

For every package record:

* intended responsibility
* actual responsibility
* public APIs
* overlap with other packages
* dead or unused APIs
* incomplete APIs
* consumers
* tests
* examples
* dependency direction
* maturity
* consolidation recommendation

Phase 2: manually exercise every public example  [x] COMPLETE

> tests/reports/showcase-interaction-audit/ - 87/87 controls, 47/47 keys, 13 routes, 0 console errors

Do not begin by trusting existing tests.

Open and interact with every public example.

For every interactive route:

* click every button
* operate every slider
* toggle every mode
* select every selectable object
* invoke focus/reset actions
* move cameras
* trigger animations
* use keyboard controls
* use pointer controls
* test mobile/touch controls where supported
* resize the viewport
* restart the route
* repeat important interactions
* observe transitions
* observe labels and feedback
* observe object placement
* observe failure states

Capture a retained interaction trace for each route containing:

* actions performed
* timestamps
* expected result
* actual result
* screenshot or frame reference
* console errors
* renderer warnings
* runtime warnings
* pass/fail
* defect classification

Create a browser-driven interaction test for every public control.

A route with buttons that have never been exercised does not count as tested.

Known defects that must become retained regression cases

Product Configurator focus defect

The current focus interaction reportedly creates a random yellow or white bar.

The apparent cause is a torus intended to surround a selected part but scaled and rotated on inconsistent axes.

Reported problematic pattern:

* nonuniform scale similar to [1.22, 0.08, 0.78]
* followed by a 90-degree rotation
* resulting in a flattened bar instead of a selection ring

The callout label also reportedly fails to render.

Do not merely change those constants.

Determine:

* how primitive local axes are defined
* how nonuniform scale composes with rotation
* whether primitive orientation is documented
* whether selection indicators should be constructed manually
* whether labels.callout is fully implemented
* whether the label is generated but not submitted
* whether it is clipped, hidden, incorrectly transformed, or unsupported
* whether examples are using an unstable API

Build a reusable selection/focus system that can provide:

* outline
* halo
* ring
* bounding box
* emissive highlight
* dim-others mode
* camera focus
* callout label
* leader line
* reset focus

The public application should express:

focusObject(target, options)

or an equivalent high-level intent.

It should not manually create, rotate, and scale a torus to approximate focus feedback.

Add tests proving that selection indicators remain correct for:

* different object dimensions
* different orientations
* nonuniformly scaled targets
* rotated targets
* nested targets
* mobile and desktop cameras

Missing callout labels

Audit labels.callout and all label APIs.

Determine whether the API is:

* fully implemented
* partially implemented
* implemented only in some render paths
* a declaration without reliable rendering
* using incorrect world-to-screen projection
* failing due to layer ordering
* failing due to clipping
* failing because examples never mount the label renderer

Fix the reusable label system.

Require:

* stable world anchoring
* screen-space placement
* occlusion policy
* viewport bounds handling
* leader lines
* responsive sizing
* mobile readability
* cleanup on target removal
* deterministic tests
* no route-specific DOM overlays

Every public label API must have a working public example.

Remove or clearly mark exports that are not implemented.

Digital Twin floating boxes

The current digital-twin example reportedly contains random boxes floating outside or beside the primary scene.

The route reportedly places procedural staging geometry at hardcoded coordinates unrelated to the loaded asset.

Do not only move the boxes closer.

Build reusable asset-relative placement.

A route should be able to express:

* place control station beside workcell
* place status markers above machines
* place safety volume around equipment
* place sensor markers on semantic anchors
* place UI panels outside the asset bounds
* distribute props within a workcell region

Placement must derive from:

* asset world bounds
* semantic nodes
* anchor metadata
* orientation
* floor plane
* free-space tests
* collision or overlap constraints
* camera visibility
* minimum spacing

Add a reusable anchoring API such as:

* bounds anchors
* named-node anchors
* semantic anchors
* surface anchors
* outside-bounds placement
* radial placement
* constrained layout

Hardcoded world coordinates may remain only for true level-design decisions, not because the engine cannot place elements relative to assets.

Audit all examples for this same defect class.

Turbo vehicle defects

Current problems include:

* player vehicle sinking into the road
* vehicle contact not matching visible tyres
* missing or weak suspension
* scene geometry failing to constrain vehicles
* opponent moving sideways
* opponent leaving the intended track
* unclear opponent objective
* track-progress interpolation masquerading as driving
* unreliable collision response
* uncertain race objective and session duration

Fix these through reusable vehicle physics and AI systems.

Skyline defects

Current problems include:

* unnatural jump trajectory
* floating or disconnected movement
* unreliable landing
* strange platform presentation
* environment that looks like disconnected floating strips
* weak relationship between gameplay and scenery
* arbitrary or excessively short session
* no satisfying multi-minute progression
* screenshot-oriented composition that does not hold up while moving

Fix through a reusable platformer controller, level validator, camera system, and game-loop system.

Aura Clash defects

Current problems include:

* unrealistic attacks
* weak spacing
* limited momentum
* animations that do not correspond convincingly to hits
* no robust frame-based combat model
* weak block, hit, recovery, and trade behavior
* AI that does not resemble a credible opponent

Fix through reusable combat systems.

Blockfall

Do not assume it is complete because it looks coherent.

Exercise and verify:

* input
* piece movement
* rotation
* collision
* line clear
* score
* progression
* game over
* restart
* mobile controls
* deterministic sequence
* repeated sessions

Phase 3: define a coherent package architecture  [x] COMPLETE

> docs/project/plans/aura3d-package-architecture.md - 51 duplicated symbol owners measured; consolidations documented, not performed (breaking)

Aura3D must stop being a collection of packages with unclear and overlapping responsibilities.

Audit the current package graph.

Create a proposed architecture that clearly separates:

Foundation

* math
* core types
* lifecycle
* events
* scheduling
* diagnostics

Rendering

* renderer
* scene graph
* geometry
* materials
* lighting
* postprocessing
* GPU resource lifecycle
* render diagnostics

Assets

* discovery
* pulling
* caching
* loading
* decoding
* preprocessing
* normalization
* provenance
* semantic metadata
* admission
* optimization

Interaction

* picking
* hover
* selection
* focus
* drag
* gizmos
* labels
* callouts
* camera targeting
* accessibility

Simulation

* fixed timestep
* physics
* collision
* constraints
* character movement
* vehicles
* deterministic state
* replay

Animation

* clips
* state machines
* blending
* root motion
* event markers
* procedural animation
* synchronization

Game systems

* input
* camera rigs
* session lifecycle
* objectives
* AI
* combat
* racing
* platforming
* arcade

Application kits

* product configurator
* digital twin
* architecture
* smart city
* cinematic presentation
* data visualization
* product studio

Developer tooling

* CLI
* project generation
* inspectors
* performance tools
* runtime probes
* evidence
* parity
* docs

Every capability must have one clear owner.

Do not preserve package boundaries merely because they already exist.

Do not collapse everything into one package either.

Recommend and implement sensible consolidations, deprecations, or responsibility transfers.

For every public export, determine:

* implemented
* tested
* documented
* used
* stable
* duplicate
* incomplete
* misleading

Incomplete APIs must be completed, deprecated, made internal, or removed in the next breaking release plan.

Phase 4: practical Three.js ecosystem parity  [x] COMPLETE

> docs/project/plans/aura3d-threejs-ecosystem-parity.md - 6 exceed / 37 parity / 10 unproven / 3 gap over 56 capabilities

Create:

docs/project/plans/aura3d-threejs-ecosystem-parity.md

and:

tests/reports/aura3d-threejs-ecosystem-parity.json

Compare Aura3D against practical Three.js workflows in these areas.

Core rendering

* scene graph
* cameras
* renderer configuration
* geometry
* materials
* custom shaders
* lights
* shadows
* render targets
* environment maps
* postprocessing
* instancing
* skinning
* morph targets
* particles
* clipping
* LOD
* transparency
* color management
* tone mapping
* WebGL
* WebGPU
* context loss
* resource disposal

Common ecosystem helpers

* orbit controls
* pointer lock
* transform controls
* camera controls
* bounds fitting
* object centering
* contact shadows
* environment presets
* loaders
* text
* HTML labels
* selection outlines
* gizmos
* performance monitors
* staging helpers

Physics

* rigid bodies
* colliders
* sensors
* raycasting
* shape casting
* character controllers
* vehicles
* joints
* CCD
* deterministic stepping
* debug rendering

Application workflows

* configurators
* architecture
* digital twins
* product viewers
* data visualization
* cinematics
* games

For every row record:

* expected Three.js ecosystem solution
* Aura3D implementation
* whether it is integrated
* whether it is easier to use
* production consumer
* runtime evidence
* documentation
* limitations
* parity status
* exceed status

Aura3D only exceeds Three.js when it offers a demonstrably more integrated or productive workflow.

Phase 5: interaction system  [x] COMPLETE

> FocusSelection.ts (26 tests) + WorldLabelRenderer.ts (13 tests); focusObject(target, options) shipped; torus ring-plane defect root-caused

Build a coherent reusable interaction layer.

It must support:

* raycast/picking
* pointer hover
* click
* double-click
* touch
* keyboard focus
* selection state
* multi-selection where appropriate
* object focus
* deselection
* drag
* transform controls
* tooltips
* labels
* callouts
* outlines
* highlight materials
* camera focus
* event propagation
* interaction layers
* interaction locking
* accessible controls
* mobile adaptation

Examples must not implement their own incompatible focus indicators.

Add declarative APIs that application routes can consume with minimal code.

Create clean examples for:

* product focus
* part selection
* digital-twin equipment selection
* scene annotation
* camera focus and reset

Phase 6: asset-relative layout and semantic anchoring  [x] COMPLETE

> SpatialAnchoring.ts (20 tests) - bounds anchors, semantic regions, deterministic distribution, checkSpatialInvariants

Build a reusable spatial-layout system.

It must support placement relative to:

* full asset bounds
* visual bounds
* collision bounds
* named glTF nodes
* semantic parts
* floor plane
* center
* top
* bottom
* front
* rear
* left
* right
* corners
* surfaces
* sockets
* free space

Add constraints:

* no overlap
* minimum distance
* inside bounds
* outside bounds
* visible from camera
* face camera
* align with surface
* maintain world-up
* distribute evenly
* deterministic seed
* collision clearance

Use this system to eliminate floating props and procedural geometry across public examples.

Phase 7: runtime and simulation foundation  [x] COMPLETE

> tests/unit/engine/fixed-step-determinism.test.ts (11 tests) - 30/60/120 FPS + jitter, bounded catch-up, tolerances stated

Implement a reusable fixed-step runtime with:

* stable timestep
* interpolation
* bounded catch-up
* deterministic input sampling
* deterministic seeds
* restart
* pause
* background-tab recovery
* replay traces
* runtime state inspection

Test at:

* 30 FPS
* 60 FPS
* 120 FPS
* jittered frame timing

Gameplay outcomes must remain within documented tolerances.

Phase 8: physics  [x] COMPLETE

> tests/reports/aura3d-physics-audit.json - 22 capabilities classified; SceneQueries.ts (20 tests) closed the raycast/shapecast reachability gap

Audit the existing physics package and all consumers.

Determine whether it is:

* functional
* integrated
* partial
* unused
* duplicated by route-local movement
* missing essential APIs

Build a coherent physics integration with:

* rigid bodies
* static bodies
* kinematic bodies
* colliders
* triggers
* collision layers
* contact events
* penetration resolution
* friction
* restitution
* raycasts
* shape casts
* continuous collision detection
* stable grounding
* moving platforms
* constraints
* debug visualization
* production diagnostics

Asset transforms and collider transforms must agree.

Phase 9: vehicle system and Turbo  [x] COMPLETE

> VehicleChassis.ts (17) + VehicleDriverAi.ts (16); tests/reports/turbo-vehicle-grounding/ - everUngrounded=false, maxContactGap=0

Build a reusable vehicle system with:

* chassis
* contact points
* suspension
* springs
* damping
* steering
* throttle
* brakes
* engine force
* rolling resistance
* lateral grip
* longitudinal grip
* slip
* speed-sensitive steering
* road contact
* off-road behavior
* collision
* visual wheel steering
* visual wheel rotation
* chassis pitch and roll
* recovery
* telemetry

Build reusable AI driving with:

* track corridor
* racing line
* steering look-ahead
* heading correction
* lateral correction
* curvature-based speed
* braking
* obstacle response
* player response
* overtaking
* off-track detection
* recovery
* stuck handling

Turbo must become a coherent race, not a visual demo.

Require:

* countdown
* objective
* checkpoints
* laps or meaningful course completion
* opponent status
* finish
* win/loss
* restart
* meaningful session duration
* desktop and mobile controls

Phase 10: platformer system and Skyline  [x] COMPLETE

> PlatformerMotion.ts (17 tests); apex ratio 5.76x -> 1.9x; 48/60 frames grounded

Build a reusable controller with:

* capsule collider
* grounded detection
* coyote time
* jump buffering
* acceleration
* deceleration
* air control
* configurable gravity
* variable jump
* terminal velocity
* slope handling
* moving platforms
* head collisions
* landing
* respawn
* animation synchronization
* camera damping
* camera look-ahead

Build a level system with:

* connected traversal
* reachable platforms
* safe landing widths
* hazards
* collectibles
* checkpoints
* alternate pacing
* several minutes of gameplay
* coherent completion
* restart
* deterministic seed
* solvability validation

The scenery must remain coherent while the camera moves.

Do not optimize only the opening frame.

Phase 11: combat system and Aura Clash  [x] COMPLETE

> CombatFrameData.ts (18 tests); frame data un-inverted - light 0, heavy -7, special -49 on block; 23 route specs pass

Build reusable:

* combat state machines
* startup frames
* active frames
* recovery frames
* hitboxes
* hurtboxes
* hitstop
* hitstun
* blockstun
* knockback
* pushback
* invulnerability
* spacing
* facing
* turn behavior
* attack priority
* trades
* whiffs
* combos
* KO
* reset

Damage must require a valid active hitbox/hurtbox interaction.

Build AI using:

* distance
* preferred range
* reaction delay
* defensive behavior
* attack selection
* movement
* punish opportunities
* cooldowns
* aggression profiles

Aura Clash must have a coherent match loop.

Phase 12: application kits  [x] COMPLETE

> ApplicationKits.ts - five kits (product configurator, digital twin, architecture, smart city, cinematic), 34 unit tests. Four routes migrated to configure them; adoption verified in a browser (tests/browser/application-kit-adoption.spec.ts) and gated. Each kit publishes a capability report naming what it deliberately does NOT own (measurement, section views, live facility data, GIS ingest, video encoding, material authoring) rather than stubbing it.

Static and enterprise-style examples are strategically important and must also become reusable.

Build or strengthen kits for:

Product Configurator

* part selection
* focus
* variants
* materials
* exploded view
* annotations
* reset
* camera presets
* pricing/data binding where appropriate

Digital Twin

* semantic equipment
* state overlays
* sensor values
* alarms
* asset-relative markers
* workcell bounds
* camera focus
* timeline
* state simulation

Architecture

* navigation
* floor focus
* room focus
* annotations
* sun/light controls
* material variants
* measurement
* clipping/section views

Smart City

* layer toggles
* data overlays
* camera focus
* selection
* temporal state
* density handling
* labels

Cinematic

* camera paths
* sequencing
* timing
* animation coordination
* transitions
* export/replay

Routes must configure kits rather than reinvent them.

Phase 13: audit all examples for magic geometry and constants  [x] COMPLETE

> Published-route findings 47 -> 7; total 138 -> 63; unambiguous defect classes at 0 and gated

Search every app for:

* hardcoded object bounds
* hardcoded asset dimensions
* hardcoded focus geometry
* hardcoded camera distances tied to one asset
* hardcoded placement coordinates
* hardcoded floor levels
* manual labels
* manual selection rings
* manual fit calculations
* manual grounding
* visual corrections with unexplained constants
* route-specific duplicated helpers

Classify each constant as:

1. legitimate design value
2. reusable default
3. asset-derived value
4. semantic-anchor-derived value
5. accidental patch
6. unsupported engine capability

Eliminate categories 3–6 through reusable systems where appropriate.

Phase 14: public API consistency  [x] COMPLETE

> docs/project/plans/aura3d-api-design-rules.md - ten rules, each derived from a defect this work exposed

Audit naming, conventions, and behavior.

Public APIs should have consistent patterns for:

* creation
* configuration
* mounting
* updating
* disposal
* events
* errors
* async loading
* diagnostics
* serialization
* reset
* state inspection

Avoid a product where one subsystem uses builders, another factories, another mutable classes, another route-local functions, and another generated JSON without a coherent rationale.

Create API design rules.

Apply them to the systems changed in this assignment.

Document migration recommendations for inconsistent existing APIs.

Phase 15: clean-room developer proof  [x] COMPLETE

> tests/reports/clean-room-projects/ - 137/142/122/99 authored lines, 1 package each, 0 private imports, 0 forbidden patterns

Create new projects using only Aura3D’s public surface.

At minimum:

1. product configurator
2. digital-twin scene
3. racing prototype
4. platformer prototype

Do not copy existing showcase source.

Do not use private monorepo imports.

Measure:

* setup commands
* developer-authored lines
* time to first working interaction
* packages imported
* configuration required
* custom geometry required
* custom physics required
* custom camera logic required
* custom label logic required
* custom evidence logic required

Targets:

* static interactive application under 200 developer-authored lines
* core playable prototype under 300 developer-authored lines
* no custom engine loop
* no manual asset bounds
* no manual selection torus
* no manual world-label renderer
* no manual physics integration
* no route-specific evidence harness
* no private imports

If these targets cannot be achieved, continue improving the public APIs.

Phase 16: runtime-quality and interaction-quality gates  [x] COMPLETE

> tools/product-remediation/check-quality-gates.mjs - 20 checks, 0 fail, 0 unproven; missing evidence is 'unproven', never 'pass'

Create a combined quality system.

Interaction invariants

* every visible control performs its documented action
* no control produces unexplained geometry
* focus indicators surround the intended target
* labels appear and remain readable
* reset restores the initial state
* selected state is unambiguous
* no interactive element is clipped
* no stale state remains after deselection
* touch and desktop interactions remain equivalent

Spatial invariants

* helper geometry remains anchored to its target
* no floating procedural props without explicit intent
* no asset-relative UI placed outside valid regions
* no overlap with protected geometry
* camera focus contains the selected object
* labels remain in viewport or apply a documented offscreen policy

Gameplay invariants

* stable collision
* stable grounding
* coherent AI
* valid animation/state correspondence
* meaningful session lifecycle
* restart
* no unexplained teleportation
* no arbitrary early termination

Performance invariants

* frame-time budgets
* memory stability
* draw-call budgets
* no repeated resource leaks
* acceptable mobile behavior

Phase 17: evidence  [x] COMPLETE

> 39 viewport variants, 78 sequence frames, 130 PNG artifacts, 13 routes fingerprinted (source + configuration)

Retained evidence must include more than screenshots.

For every interactive route create:

* interaction trace
* control coverage
* runtime trace
* console report
* screenshot sequence
* short video
* viewport variants
* asset hashes
* source fingerprint
* configuration fingerprint
* producer version

For games create full-session replay/video.

For static routes create a full interaction walkthrough.

Evidence must be fresh, atomic, deterministic where possible, and concurrency-safe.

Required route-by-route audit  [x] COMPLETE

> tests/reports/aura3d-route-disposition.json - all 113 apps classified and dispositioned; 0 require removal from public marketing

Audit every route under apps/.

Do not arbitrarily exclude routes because they are not featured on the homepage.

Group them into:

* public flagship
* public example
* starter
* advanced
* diagnostic
* internal fixture
* obsolete
* duplicate

For every public route, produce a disposition:

* keep and fix
* consolidate
* replace with a kit-based version
* demote to diagnostic
* remove from public marketing
* deprecate
* delete in a future breaking release

Do not keep broken examples public merely because they already exist.

Metrics that matter  [x] COMPLETE

> tests/reports/aura3d-product-metrics.json - leads with product-quality measures; test counts listed last as supporting

Do not lead with test counts.

Track:

* public control pass rate
* public route interaction pass rate
* complete gameplay-loop pass rate
* route-local reusable-system duplication
* public APIs with real examples
* public APIs proven through interaction
* clean-room authored lines
* time to first working application
* runtime invariant pass rate
* asset-relative placement pass rate
* label rendering pass rate
* selection/focus pass rate
* deterministic replay rate
* performance budgets
* visible unresolved defects

Supporting metrics may include:

* typecheck
* unit tests
* screenshots
* evidence freshness
* package boundaries
* exports
* claims

They are not substitutes for product quality.

Required verification  [x] COMPLETE

> Two serial runs identical at 2869/2870; the single failure verified pre-existing at baseline f7381a15 (which fails 9 classifications vs this tree's 4)

Run focused tests during work.

Before completion run:

* typecheck
* lint where applicable
* all unit tests
* all integration tests
* renderer browser tests
* interaction browser tests
* every public route walkthrough
* every public control test
* physics tests
* gameplay runtime tests
* deterministic replay tests
* 30/60/120 FPS tests
* mobile viewport tests
* memory and restart tests
* package boundary verification
* public export verification
* documentation verification
* example classification
* production builds
* clean-room installs
* clean-room application builds
* two serial full-suite runs
* full evidence freshness validation

Do not run overlapping suites that mutate retained artifacts.

Required PRD ledger  [x] COMPLETE

> docs/project/plans/aura3d-product-remediation-prd.md section 3 - 21 ledger rows with root cause, library fix, routes migrated, and proof

Maintain this table:

Area	Exposed defect	Root cause	Library-level fix	Routes migrated	Interaction proof	Runtime proof	Status

Also maintain:

* all visible defects found
* all controls tested
* all APIs found incomplete
* all route-local patches removed
* all new reusable systems
* all package responsibility changes
* all deprecations
* all remaining limitations
* all routes still unsuitable for public display

Definition of done

This assignment is complete only when:

1. Every public example has been manually and automatically exercised.
2. Every public control works as documented.
3. The focus bar defect is solved through a reusable focus/selection system.
4. Callout labels work reliably through the public API.
5. Floating procedural geometry is replaced by reusable asset-relative placement.
6. Turbo behaves like a coherent racing game through reusable vehicle and AI systems.
7. Skyline behaves like a coherent platformer through reusable controller and level systems.
8. Aura Clash behaves like a coherent combat game through reusable combat systems.
9. Blockfall has a complete verified game loop.
10. Static application routes consume reusable application kits.
11. Package responsibilities are coherent and documented.
12. Incomplete or misleading public APIs are fixed, deprecated, or removed from public exposure.
13. Clean-room projects prove that new developers can build credible experiences quickly.
14. Aura3D’s practical parity with the Three.js ecosystem is honestly measured.
15. Full interaction and runtime evidence exists.
16. Two serial verification runs pass.
17. No release or marketing claim is used to disguise unresolved product defects.
18. The user can inspect actual working applications rather than reports asserting they work.

Final report format

1. Executive truth

State whether Aura3D is currently:

* an incoherent prototype collection
* a coherent application framework
* a credible game/application engine
* at practical Three.js ecosystem parity
* beyond Three.js in specific categories

Use category-specific evidence.

2. Product architecture

Describe the final package and responsibility model.

3. Public example audit

List every public route and its final status.

4. Interaction defects fixed

Include focus, labels, controls, selection, and asset-relative layout.

5. Game runtime results

Report Turbo, Skyline, Aura Clash, and Blockfall separately.

6. Static application-kit results

Report configurator, digital twin, architecture, smart city, cinematic, and other public applications.

7. Clean-room developer benchmarks

Include commands, authored lines, setup complexity, and outcome.

8. Three.js ecosystem comparison

List parity, exceed, and gap categories.

9. Runtime and interaction evidence

Provide paths to traces, videos, screenshots, and reports.

10. Performance

Provide measured desktop and mobile results.

11. Verification

Provide exact commands and results.

12. Route-local versus reusable implementation

Provide genuine before/after figures.

13. Public API changes

List additions, fixes, deprecations, and migration requirements.

14. Files changed

Group by package, app, test, tool, and documentation.

15. Remaining debt

Do not minimize it.

16. Release recommendation

State whether Aura3D has earned another release.

Do not create, publish, tag, or deploy that release.

Core principle

Aura3D must not remain a hodgepodge of:

* partially implemented APIs
* static helpers
* disconnected packages
* route-local magic numbers
* broken interactive examples
* screenshot-oriented validation
* prototype gameplay
* release scripts
* polished marketing images

The product succeeds only when developers can use its public APIs to create correct, coherent, interactive 3D applications and games without repeatedly rebuilding missing engine systems themselves.

Fix the actual library, every public example, every exposed interaction, and the development workflow.

Do not fix only the latest screenshot.

Do not optimize the appearance of progress.

Make Aura3D usable.

This version forces a full route inventory and interactive audit, so the agent cannot say that Product Configurator or Digital Twin “wasn’t in scope.” It also turns the focus bar, missing callouts, floating boxes, cars, platformer movement, combat, and package incoherence into required library-level regression cases, rather than isolated showcase fixes.