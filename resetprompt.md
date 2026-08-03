You are working in:

/Users/gurbakshchahal/platforms/aura3d

Your assignment is to fix the underlying Aura3D architecture, asset pipeline, renderer, tooling, and reusable game-authoring layers exposed by the recent Turbo Drift Circuit, Skyline Runner, Aura Clash, and Blockfall Reactor work.

This is not a request to cosmetically patch two showcase routes.

The central problem is that Aura3D currently requires far too much route-local visual authoring:

* Route-local game code across the four showcase games: approximately 30,141 lines
* Reusable engine game layer: approximately 3,072 lines
* Current ratio: approximately 9.8× more route-local code than reusable engine code
* Aura Clash alone is approximately 23,375 route-local lines

The showcase games prove that gameplay kits, deterministic runtime behavior, camera rigs, topology binding, render presets, and evidence plumbing exist. However, visual quality, asset fitness, composition, normalization, grounding, materials, environment population, and art direction are still largely hand-authored per route.

Your job is to change that.

Operating rules

Follow these rules strictly:

1. Stay on the current branch. Do not create, switch, or open another branch unless explicitly instructed.
2. Do not commit, push, publish, deploy, change npm authentication, or modify external accounts.
3. Do not stash, reset, clean, restore, delete, move, rename, or otherwise alter unrelated tracked or untracked work.
4. Treat the repository as having valuable pre-existing pending changes.
5. Inspect the current working tree before editing and maintain an explicit list of files you modify.
6. Work only inside the Aura3D repository and only on files necessary for this assignment.
7. Do not solve failures by weakening gates, deleting assertions, changing expected failures into passes, or editing evidence to match broken behavior.
8. Do not replace real validation with mocks, snapshots of hardcoded results, static JSON, fake screenshots, or route-name exceptions.
9. Do not add route-specific conditionals to reusable engine code unless the condition represents a documented public capability applicable to arbitrary future projects.
10. Do not declare a visual defect fixed based on source inspection, asset thumbnails, mesh names, geometry statistics, or a passing typecheck. Render and inspect the actual result.
11. Never claim a wheel, character, platform, road, environment, or other visual element is visible unless the retained rendered screenshot proves it.
12. Never claim an asset is suitable merely because it loads successfully.
13. All retained evidence must be generated from the current implementation and must be hash-bound or freshness-bound where the repository’s evidence model supports it.
14. A generated report must never be older than the implementation, asset, route configuration, or renderer code it validates.
15. Diagnose one issue at a time. Do not use bulk search-and-replace or automated “fix all” scripts across unrelated files.
16. Follow the sequence: explore → reproduce → measure → implement reusable fix → verify in isolation → verify in showcase route → run regression gates → document.
17. Preserve honest blockers. A route with unresolved visual problems must remain needs-work, prototype-blocked, or the equivalent truthful status.
18. Do not ask the user to choose between implementation steps. Make the safest technically justified decision and continue.
19. Do not provide speculative time estimates.
20. Continue until the reusable fixes, tests, retained evidence, and documentation are complete, or until a genuine external blocker prevents further work.

Known findings that must be treated as established evidence

Do not restart these investigations from zero or contradict them without stronger measured evidence.

Vehicle asset failures

Three hero-car assets exhibited three distinct failure modes:

Asset	Parts	Triangles	Wheel finding	Actual failure
showcaseTexturedSportsCar	7	33,700	No valid four-corner wheel parts	Apparent tyres attached through detached stalk-like geometry
showcaseCityVehicle	1	792	No separate wheel geometry	A distant low-poly traffic/body-shell prop with no modeled wheels
turboHeroCar	483	71,426	16 wheel candidates at four corners	Closed-wheel Le Mans-style body encloses the wheels; they are not visibly readable

The current geometry auditor can distinguish at least:

* no wheels
* wheel-like geometry present
* wheels located at four corners
* wheels enclosed within the body silhouette
* wheels likely visible outside the body silhouette

Relevant current tool:

tools/asset-geometry-audit/wheel-detect.mjs

Do not collapse “wheel geometry exists” and “wheels are visibly readable” into the same claim.

CLI selection gap

Previously, assets resolve always selected the top search result. Multiple attempts to pull different candidates returned byte-identical assets.

Candidate selection work has reportedly begun or landed through options such as:

* --index
* --candidate-id or equivalent explicit candidate selection

Inspect the current implementation and tests. Complete it properly rather than assuming the partial changes are correct.

The required reusable flow is:

search → enumerate candidates → select exact candidate → pull → register → type-generate → geometry-screen → render-screen → score → accept/reject

A future developer or agent must be able to run this deterministically without manually modifying query strings and hoping the resolver returns a different object.

Turbo’s new candidate and renderer discrepancy

A selected vehicle candidate, currently named or previously named turboRaceCar, reportedly has:

* 5 mesh parts
* 4 wheel meshes
* four-corner placement
* named wheel meshes
* approximately 11,344 triangles
* CC-BY-4.0 attribution
* texture/material data
* a geometry verdict indicating wheels should be visible

However, in actual Aura3D rendering, the isolated asset probe and Turbo route reportedly failed to visibly draw the wheels.

Static investigation reportedly established:

* The four wheel mesh nodes are reachable from the active glTF scene.
* Their transforms appear valid.
* Their index ranges are valid.
* Their position accessors appear valid.
* The body renders while wheel meshes do not.
* The asset reports as loaded/ready.
* There are no obvious renderer warnings.
* Brightening the screenshot did not reveal merely dark wheels; the relevant regions appeared empty.
* Various hypotheses involving camera height, car grounding, body enclosure, z-fighting, raw-vs-world bounds, and index type were investigated and did not reliably explain the isolated probe result.

Treat this as a minimal reusable renderer reproduction. Do not “solve” it by swapping to yet another car before determining whether Aura3D drops valid secondary glTF mesh primitives.

Stale evidence failure

Aura Clash’s:

apps/aura-clash-showcase/launch-evidence/first-frame.png

was regenerated by one producer into an old-looking visual while another current visual-regression producer rendered the correct textured arena.

Re-running the intended current producer corrected it, but the incident proves that Aura3D currently permits:

* multiple producers to write semantically overlapping evidence
* stale or mismatched output to appear current
* evidence freshness to be inferred from modification time instead of being bound to implementation/configuration inputs

This must be fixed at the evidence-system level.

Route-local hardcoded constant failure

Turbo’s CAR_SCENE_HEIGHT survived multiple asset swaps because it was hardcoded to the bounds of an earlier car asset. It caused an approximately 8.2% seating/composition error after replacement.

It has reportedly been changed to derive from typed manifest bounds.

Audit the other showcase routes and reusable kits for the same class of defect:

* asset-specific dimensions copied into literals
* camera heights derived from one asset
* manual grounding offsets
* hardcoded framing constants
* environment scale constants that do not derive from typed asset metadata
* stale constants left after asset swaps

Do not simply replace hardcoded numbers with different hardcoded numbers.

Skyline Runner weakness

Skyline Runner currently reads as a clean prototype but not a polished public game:

* excessive empty sky
* stock low-poly Kenney appearance
* weak visual hierarchy
* limited environmental density
* insufficient authored atmosphere
* not enough differentiation between foreground, play space, middle distance, and background
* insufficient art direction

This is not only a route-specific art problem. Aura3D needs reusable environment-composition capability that helps future developers create a coherent platformer scene from typed asset sets and style intent.

Existing healthy showcase observations

Preserve what already works:

* Aura Clash currently reads like a real game with a textured brick arena, lit windows, neon signage, street lamps, sidewalks, and urban set dressing.
* Blockfall Reactor reads like a coherent arcade cabinet/game environment.
* Turbo improved significantly in track readability, car body quality, road perspective, barriers, stands, and opponent placement, but the primary hero vehicle still has an unresolved wheel-rendering/fitness issue.
* Skyline Runner remains the weakest visual route.

Do not regress Aura Clash or Blockfall while extracting reusable capability.

Primary objective

Build a reusable Aura3D pipeline in which a new developer can provide:

* a genre or game template
* a typed asset intent
* a style/art-direction intent
* gameplay parameters
* composition constraints

…and receive a structurally valid, visually coherent starting game without writing thousands of lines of route-local art-direction code.

This pass does not need to eliminate all route-local code. It must materially move repeated visual logic into reusable packages and prove that the same capabilities work across more than one route or through generic fixtures.

Execute as six isolated workstreams

Use six logical workstreams. They may be investigated in parallel where safe, but do not allow overlapping uncontrolled edits.

Maintain a shared evidence ledger in the existing final PRD or the repository’s authoritative remaining-work document.

Suggested workstreams:

Workstream 1 — Renderer correctness for multi-part glTF assets

Own the isolated turboRaceCar-style reproduction.

Goals:

1. Reproduce the missing-wheel behavior with the smallest possible retained fixture.
2. Prove whether the renderer submits all five primitives.
3. Instrument the renderer in a test-safe way to capture, per primitive:
    * asset ID
    * mesh index
    * primitive index
    * node name
    * material index
    * vertex count
    * index count
    * draw mode
    * index type
    * world/model transform
    * computed world bounds
    * frustum result
    * culling state
    * material alpha mode
    * alpha cutoff
    * effective opacity
    * texture readiness
    * GL error immediately after buffer upload and draw
4. Determine exactly where the wheel primitives disappear:
    * parsing
    * scene traversal
    * primitive construction
    * buffer upload
    * material setup
    * culling
    * transform
    * render queue
    * draw dispatch
    * depth state
    * shader output
5. Fix the generic renderer path.
6. Add a focused unit/integration/browser regression test with a multi-part glTF fixture where:
    * one body mesh and four wheel meshes must all be submitted
    * the wheels use a distinct material
    * child-node transforms are present
    * accessor offsets differ
    * the rendered screenshot proves all expected parts are present
7. Confirm that the fix also works in the real isolated vehicle probe.
8. Confirm that it does not regress other multi-material/multi-mesh assets.

A passing “asset ready” state is not sufficient. Require primitive-count and rendered-visibility evidence.

Do not add a vehicle-specific renderer exception.

Workstream 2 — Asset discovery, deterministic candidate selection, and scoring

Complete the CLI candidate-selection capability as a production-quality public workflow.

Required commands or equivalent behavior:

* aura3d assets search "<query>" --json
* aura3d assets resolve "<query>" --index <n> ...
* aura3d assets resolve "<query>" --candidate-id <provider:id> ...
* explicit failure when index is out of range
* explicit failure when candidate ID is not part of the current search result unless a direct provider pull is intentionally supported
* output showing exactly which candidate was selected
* output preserving provider, source ID, license, author, source page, download URL, and any authentication limitations
* no silent fallback to candidate zero when explicit selection fails

Add unit and integration tests proving:

1. Index 0 and index 3 select different candidates.
2. --candidate-id selects the exact candidate independent of rank.
3. Repeated resolution of the same candidate is deterministic.
4. Out-of-range selection fails loudly.
5. Authentication-gated candidates are skipped only when fallback is allowed and the skip is reported.
6. Explicit candidate selection does not silently substitute another candidate.
7. The registered manifest retains stable provenance instead of a deleted temporary directory.
8. The source asset is staged into a durable repository or cache path according to current project policy.
9. Type generation remains deterministic.
10. Candidate resolution is testable without relying on a mutable live provider response. Use retained provider fixtures where appropriate, while separately retaining a non-blocking live-contract test if the project already supports that pattern.

Add a reusable candidate evaluation output that can record structural and rendered screening verdicts.

Workstream 3 — Asset admission and role-aware fitness certification

Promote the geometry auditor from a one-off script into a reusable Aura3D asset-admission system.

Create or extend a public/internal API such as:

* assets inspect
* assets audit-geometry
* assets certify-role
* assets rank-candidates
* or an equivalent coherent command set

The system must support role-aware checks, beginning with vehicle, and be extensible to:

* playable character
* environment/world
* road/track
* platform
* building
* prop
* collectible
* weapon
* animation set
* UI-facing hero object

For vehicle admission, record distinct checks:

* mesh/part count
* triangle count
* materials
* textures
* wheel-like geometry detected
* wheel candidates at four corners
* wheel/body silhouette relationship
* wheels visibly outside or readable from expected hero angles
* body-shell-only detection
* suspicious detached geometry
* world bounds
* normalization requirement
* grounding confidence
* orientation evidence
* front/rear inference
* origin/pivot sanity
* material completeness
* rendered isolated-probe status
* rendered wheel visibility
* license/provenance completeness
* suitability for distant background, opponent, traffic prop, or hero use

Important:

* A low-poly body shell may be acceptable as a background vehicle while failing hero admission.
* A closed-wheel prototype may be structurally valid as a vehicle but fail a requirement that exposed tyres be visually readable.
* Asset fitness must be expressed against the requested role and visual requirement, not as one global pass/fail boolean.

Wire these checks into certify-game-geometry or its successor.

Certification must not pass a hero vehicle solely because circular geometry exists.

Add tests covering all known failure modes represented by the three rejected assets and the newer candidate.

Workstream 4 — Typed asset normalization, grounding, orientation, and camera framing

Remove asset-specific route constants from common game setup.

Build reusable typed helpers that derive:

* fitted scale
* normalized scene dimensions
* world-space ground contact
* visual center
* center of mass approximation where useful
* subject framing bounds
* camera target
* camera height
* camera distance
* near/far plane suggestions
* front/rear orientation
* lane/track alignment
* expected screen occupancy
* wheel/contact-point visibility region for vehicles
* character-foot/platform contact for platformers

The reusable API should be declarative. For example, a route should be able to express intent similar to:

* fit hero vehicle to target longitudinal size
* ground lowest contact points on track surface
* frame rear chase view with 25–40% vertical screen occupancy
* preserve visible lower silhouette
* look ahead along movement direction
* avoid clipping subject bounds
* derive orientation from manifest evidence
* reject if required orientation evidence is absent

Do not require route code to know raw asset dimensions.

Audit at minimum:

* Turbo Drift Circuit
* Skyline Runner
* Aura Clash
* Blockfall Reactor

Find constants that encode assumptions about specific assets and classify them:

1. Legitimate game-design constants
2. Reusable genre defaults
3. Asset-derived values that should be computed
4. Temporary visual patches that should be removed
5. Public API gaps

Move category 2 and 3 behavior into reusable engine or game-kit modules.

Add tests that swap two materially different assets and prove:

* grounding remains correct
* camera fit remains within occupancy bounds
* no stale dimension literal is required
* route code remains unchanged except the typed asset reference

Workstream 5 — Reusable environment composition and Skyline remediation

Do not treat Skyline as a bespoke scene-decoration exercise.

Build a reusable platformer environment-composition layer that accepts a style/scene specification and produces a coherent baseline composition.

The system should support declarative concepts such as:

* foreground gameplay plane
* active platform layer
* middle-distance environmental silhouettes
* far-background silhouettes
* sky gradient or sky asset
* horizon placement
* depth-separated prop distribution
* density targets by layer
* landmark placement
* collectible readability zones
* hazard readability zones
* atmospheric perspective
* fog/haze
* lighting direction
* color/value separation
* repeated-prop variation
* deterministic seeded placement
* no-overlap or minimum-spacing constraints
* safe camera framing
* mobile-density reduction
* genre-specific composition presets

Create a typed platformer art-direction preset or scene recipe that is generic enough for future games.

Use Skyline Runner as the first consumer, but prove reusability through at least one of:

* a second fixture route
* a generated test scene
* a second platformer configuration
* a deterministic before/after composition test using different asset sets

Skyline acceptance requirements:

* materially reduce empty-sky dominance
* improve foreground/midground/background separation
* improve world density without blocking gameplay
* preserve hero and collectible readability
* avoid debug-looking primitives
* avoid obvious repeated clone patterns
* remain deterministic
* work at desktop and mobile viewports
* use typed assets and reusable composition APIs
* route-local visual code should decrease or remain small
* no hardcoded screenshot-specific placements

The goal is not to imitate Aura Clash’s urban art. The goal is a polished, coherent platformer scene from the available visual language.

If the current Kenney asset set cannot meet the visual bar, use the improved deterministic candidate-selection and asset-admission pipeline to find better compatible assets. Do not claim the catalog is insufficient until the unrestricted catalog has been searched and candidates have been screened.

Workstream 6 — Evidence freshness, concurrency safety, release gates, and architectural metrics

Fix the evidence system that allowed Aura Clash’s stale first-frame.png to appear current.

Inventory every producer and consumer of:

* route-primary screenshots
* first-frame screenshots
* visual-regression screenshots
* composition reports
* route-health reports
* asset probes
* geometry reports
* launch-evidence reports
* gameplay proofs
* asset-pair reports
* showcase library screenshots

For each artifact, establish:

* one authoritative producer, or clearly differentiated output names
* schema/version
* route ID
* asset IDs
* asset hashes
* renderer/build hash or source fingerprint
* route-config hash
* producer identity/version
* viewport
* timestamp
* screenshot SHA-256
* dependencies
* evidence status
* stale reason if rejected

Prevent multiple unrelated producers from writing the same path.

Make writes atomic.

Eliminate full-suite races caused by tests mutating shared retained reports.

Tests must write to isolated temporary directories unless the test is explicitly the authoritative retained-evidence generator.

The full unit/integration suite must be repeatable under parallel load.

Add freshness validation that rejects evidence when any of these change:

* route source
* route gate config
* primary asset hash
* relevant renderer code fingerprint
* camera/composition config
* evidence producer version
* viewport contract

Do not rely only on filesystem modification times.

Add a command that explains why an artifact is stale.

Architectural deliverables

Beyond fixing current defects, deliver the following reusable capabilities.

1. Asset-intent contract

Create a typed contract that lets a route request an asset by intent, for example:

* role: hero vehicle
* style: modern road/race car
* required visible features: four readable wheels
* material requirement: textured
* license policy: commercial-compatible attribution allowed
* geometry budget
* expected hero camera angles
* orientation requirement
* normalization policy
* fallback policy

The exact API can differ, but it must be declarative and reusable.

2. Candidate screening pipeline

Create an orchestrated pipeline that can:

1. Search
2. Select exact candidates
3. Pull into a temporary screening area
4. Inspect geometry
5. Render isolated probes
6. Score role fitness
7. Reject with machine-readable reasons
8. Rank accepted candidates
9. Register the selected asset durably
10. Generate typed bindings
11. Bind provenance and evidence
12. Certify it for a requested role

The pipeline must preserve all candidates’ rejection reasons.

3. Game visual recipe layer

Create a reusable visual recipe/configuration abstraction above raw route authoring.

At minimum, cover:

* racing hero framing and track presentation
* platformer depth composition
* environment density
* lighting/render preset
* subject/background contrast
* deterministic prop distribution
* mobile adaptation

The route should describe intent; reusable code should perform common visual construction.

4. Replicability metrics

Add a lightweight repository report that measures:

* route-local source lines
* reusable game/visual layer lines
* repeated code clusters where practical
* number of route-local magic constants
* number of asset-derived values
* number of reusable visual recipes
* generated versus hand-authored scene setup
* asset-admission pass/fail counts
* average candidate screening attempts
* evidence freshness failures
* route-specific exceptions in engine code

Record a baseline and the post-pass result.

Do not game the metric by moving route-specific code into a shared file without making it genuinely parameterized and reusable.

Specific tests to add

At minimum, add or extend tests for the following.

CLI candidate selection

* selects candidate by zero-based or clearly documented index
* selects exact provider candidate ID
* rejects invalid index
* rejects unknown explicit ID
* never silently falls back for explicit selection
* preserves provenance
* stages durable source path
* produces deterministic manifest/typegen output

Vehicle geometry admission

Fixtures or retained assets representing:

* body shell with no wheels
* detached/stalk-like wheel geometry
* four wheels enclosed inside body silhouette
* four wheels visibly outside body silhouette
* single-mesh vehicle whose wheel visibility cannot be structurally proven
* transformed child wheel nodes
* multi-material wheel meshes
* valid hero vehicle
* background-only vehicle

Renderer

* all scene-reachable mesh nodes produce expected primitives
* child-node transforms are applied
* nonzero accessor byte offsets work
* multiple primitives/materials draw
* body and wheels both appear in retained render
* transparent/alpha materials do not accidentally discard opaque tyre meshes
* frustum/culling diagnostics are correct
* no GL errors
* primitive submission count matches expected count

Typed fit and grounding

* two different vehicle aspect ratios
* nonzero source min-Y
* transformed child meshes
* manifest bounds versus raw accessor bounds
* orientation override
* subject occupancy
* camera lower-silhouette visibility
* no route-specific height literal

Platformer composition

* deterministic output for a fixed seed
* different seeds create controlled variation
* minimum foreground/midground/background occupancy
* no prop overlap with protected gameplay zones
* mobile density adaptation
* hero readability
* collectible readability
* no debug guides in public render
* no excessive empty-sky ratio beyond a documented threshold

Evidence system

* stale asset hash rejected
* stale route hash rejected
* stale renderer fingerprint rejected
* stale camera config rejected
* mismatched screenshot SHA rejected
* two producers cannot write the same authoritative artifact
* parallel tests cannot race shared artifacts
* explain-staleness output lists exact dependency mismatch

Turbo Drift Circuit final requirements

Turbo must not be considered visually fixed until all of the following are true:

1. The selected hero asset passes role-aware hero-vehicle admission.
2. The renderer draws every expected primitive.
3. Four wheels are visible in the isolated retained probe when the requested vehicle style requires readable wheels.
4. Wheels are visible in the current route-primary screenshot.
5. The car is grounded correctly.
6. The car orientation is correct.
7. Camera framing is derived from reusable typed helpers.
8. No prior-car dimension literals remain.
9. Track, car, opponent, barriers, and horizon remain readable.
10. The route’s evidence chain references the current asset hash, route hash, camera config, renderer fingerprint, and screenshot hash.
11. Tests do not merely inspect source strings for asset IDs.
12. No visual-review status is changed to pass without current retained screenshot evidence.

If the selected vehicle is intentionally a closed-wheel prototype, then do not claim exposed wheel visibility. Either update the requested visual requirement honestly or select an asset that satisfies it. The user explicitly wants a primary car with basic visible tyres/wheels.

Skyline Runner final requirements

Skyline must not be considered improved merely because more props were added.

Require:

1. Reusable platformer composition recipe.
2. Clear foreground, gameplay, midground, and background layers.
3. Reduced empty-sky ratio.
4. Stronger environmental density and hierarchy.
5. Hero remains proportionate and readable.
6. Platforms and hazards remain readable.
7. Collectibles remain readable.
8. No debug primitives or diagnostic guides.
9. Deterministic placement.
10. Desktop and mobile evidence.
11. No screenshot-specific hardcoded coordinates.
12. Route-local visual setup is materially simplified or converted to declarative configuration.
13. Current retained screenshots are inspected before any quality claim.
14. Honest needs-work status remains if the actual image still reads as a prototype.

Full verification gates

Run the narrowest relevant tests during implementation, then execute the complete repository gates.

At minimum:

1. pnpm typecheck:raw
2. Relevant unit tests for every modified package
3. Relevant renderer integration tests
4. Relevant CLI tests
5. Relevant browser asset probes
6. Turbo route-primary probe
7. Skyline desktop and mobile probes
8. Aura Clash regression screenshot
9. Blockfall Reactor regression screenshot
10. npx vitest run tests/unit tests/integration
11. pnpm verify:claims
12. pnpm verify:boundaries
13. pnpm verify:exports
14. documentation/version verification gates currently used by the repository
15. pnpm check:examples
16. showcase library build/check
17. production build or equivalent build gate
18. any existing browser smoke, no-overflow, route-health, and release-gate suites relevant to changed files

Run the full unit/integration suite more than once if shared-artifact contention was previously observed.

A test that passes alone but fails under the full suite is not green.

Do not dismiss load-only failures as flaky without diagnosing shared state, file collisions, process lifecycle, port contention, mutable fixtures, or retained-artifact races.

Existing unrelated blockers

The repository reportedly has unrelated public-release failures involving routes such as:

* showcase-product-configurator
* showcase-smart-city-control
* showcase-cinematic-architecture
* showcase-digital-twin-ops

Do not modify those routes merely to make a global gate green unless your reusable infrastructure change legitimately affects them.

Clearly separate:

* failures introduced by this work
* failures resolved by this work
* pre-existing unrelated failures
* external blockers such as npm authentication
* user-only visual approval gates

Do not weaken global checks to hide unrelated failures.

Documentation requirements

Update the existing authoritative PRD/evidence ledger, likely:

docs/project/plans/final-remaining-work-prd.md

Use the repository’s actual authoritative document if it has changed.

Document:

1. Initial measured state
2. Root causes
3. Rejected hypotheses where useful
4. Renderer reproduction and final cause
5. CLI selection capability
6. Asset-admission architecture
7. Role-aware fitness semantics
8. Typed normalization/framing architecture
9. Platformer composition recipe
10. Evidence freshness architecture
11. Tests added
12. Screenshots generated
13. Before/after metrics
14. Remaining limitations
15. Honest release blockers
16. Exact commands and results
17. Files changed
18. Claims that are now supportable
19. Claims that remain prohibited

Do not write “production ready,” “release ready,” “fixed,” “visible,” or “certified” without citing the corresponding current evidence inside the repository.

Completion report format

When the work is complete, provide one final report containing:

1. Executive result

State whether the work primarily improved:

* the reusable Aura3D layer
* individual routes
* or both

State the post-pass route-local/reusable ratio and explain what moved.

2. Root causes fixed

List the actual causes, not symptoms.

3. Reusable capabilities delivered

List public/internal APIs, CLI commands, typed contracts, renderer fixes, composition recipes, and evidence-system changes.

4. Turbo status

Include:

* selected asset
* admission result
* renderer primitive result
* wheel visibility result
* current screenshot paths
* route status
* remaining blockers

5. Skyline status

Include:

* reusable composition changes
* route-local code reduction
* desktop/mobile screenshot paths
* honest visual assessment
* remaining blockers

6. Regression status

Include Aura Clash and Blockfall screenshots and whether they regressed.

7. Verification

Provide exact pass/fail counts and commands.

8. Pre-existing unrelated failures

List separately.

9. Files changed

Group by package/tool/route/docs/tests.

10. Remaining architectural debt

Be explicit. Do not hide unresolved route-local authoring behind green tests.

Definition of done

This assignment is complete only when:

* deterministic asset candidate selection works
* role-aware asset admission works
* actual rendered visibility is part of admission
* the multi-part glTF wheel-rendering defect has a measured root cause and generic fix
* Turbo uses a hero vehicle whose expected wheels visibly render
* reusable typed fitting/framing replaces asset-specific visual constants
* Skyline consumes a reusable platformer composition system
* evidence artifacts are freshness-bound and concurrency-safe
* the full regression suite is stable
* Aura Clash and Blockfall do not regress
* the architectural metrics show a real improvement
* documentation truthfully records what remains incomplete

The purpose of this work is not to get four showcase screenshots over a subjective line through days of manual iteration.

The purpose is to make Aura3D capable of producing the next four games with dramatically less route-local code, fewer asset-selection mistakes, deterministic visual validation, and reusable engine-level art-direction support.

This prompt deliberately makes the missing wheel meshes, asset admission, deterministic selection, camera/normalization logic, Skyline composition, and stale evidence system part of one architectural remediation rather than separate cosmetic tasks.