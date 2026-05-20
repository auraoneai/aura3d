# G3D Advanced Examples Gallery

Advanced G3D examples gallery scaffold for scene composition, authored GLB integration, runtime controls, interaction, instrumentation, and screenshot verification.

Run it locally:

```bash
pnpm exec vite --host 127.0.0.1 --port 5180 --strictPort
```

Open:

```text
http://127.0.0.1:5180/apps/v9-advanced-examples-gallery/
```

Direct demo routes:

- `#water-lab` - Interactive GPGPU-style water lab.
- `#ocean-observatory` - WebGL ocean surface showcase.
- `#reactor-post` - Cinematic post-processing command center.
- `#smart-city` - Massive instancing smart city stress test.
- `#data-galaxy` - Particle simulation / AI data galaxy.
- `#product-configurator` - PBR product configurator.
- `#robotics-lab` - Animated robotics training lab.
- `#physics-playground` - Robotics manipulation physics-style testbed.
- `#fog-cathedral` - Volumetric fog / light shaft cinematic scene.
- `#digital-twin` - CAD / robotics digital twin control room.

Verification:

```bash
pnpm typecheck
pnpm v9:advanced-gallery
pnpm v9:advanced-gallery:review
```

`pnpm v9:advanced-gallery` is intentionally a release gate, not just a smoke test. The current screenshots do not pass human visual review against the requested Three.js-style showcase bar, so the gate must stay red until every demo is art-directed, screenshot-reviewed, and explicitly marked `accepted` in `src/metadata.ts`.

`accepted` is not a visual opinion flag. It requires a current browser screenshot, a recorded screenshot hash, non-empty reviewer metadata, and human review notes tied to that exact artifact. Browser metrics can prove that a route runs, animates, and captures pixels; they do not by themselves prove Three.js showcase quality.

`pnpm v9:advanced-gallery:review` writes a machine-readable release evidence report that joins the metadata status, screenshot artifacts, screenshot hashes, runtime JSON, authored GLB telemetry, motion samples, and PNG detail metrics. Its `pass` field must remain `false` until every demo has explicit accepted visual review evidence.

Screenshot and metric artifacts are written to:

```text
tests/reports/v9/advanced-examples-gallery/
```

Primary visual review artifacts:

- `current-contact-sheet.png` - current screenshot contact sheet for human review.
- `visual-review-report.json` - generated evidence report; this is the anti-regression record that keeps smoke pass separate from showcase acceptance.
- `ACCEPTANCE_PLAN.md` - the 10/10 execution contract: gates, capability boundaries, per-route blockers, promotion rules, and evidence commands.

## Current Visual Review State

| Demo | Status | Implementation mode | Acceptance blocker |
| --- | --- | --- | --- |
| Water Lab | Failed | Denser local Blender-authored cinematic marina fixture plus CPU/procedural water and ripple visuals | The new fixture adds docks, boats, lights, props, reeds, trees, and shoreline depth, but the scene is still stylized and the water is not a true GPGPU/WebGL water showcase. |
| Ocean Observatory | Failed | Denser local Blender-authored ocean observatory fixture plus WebGL2 procedural ocean and drone overlays | The deck/platform composition is stronger, but the ocean is still WebGL2 procedural geometry, not a premium shader/reflection/refraction water scene. |
| Reactor Post | Failed | Denser local Blender-authored reactor command-center GLB with a segmented floor pit, darker containment cage, thinner core rings, restored side telemetry panes, rear console ribs, restrained cyan/amber/violet materials, and the native WebGL2 LDR postprocess path for tone mapping, color grading, vignette, sharpen, and FXAA | Stronger focal hierarchy and less toy-like asset staging, but it remains failed until fresh screenshots prove the composition and post stack read as a premium Three.js bloom/effects-composer class postprocessing demo rather than a debug reactor mockup. |
| Smart City | Candidate | Local Littlest Tokyo animated GLB plus live G3D traffic/data overlays and route instrumentation | Stronger authored city candidate, but not accepted until fresh screenshot review, load-time validation, and separate high-instance stress evidence pass. |
| Data Galaxy | Candidate | Dense CPU point-cloud system plus a local Blender-authored AI data core, orbital rings, cluster frames, analytics panels, attractor pylons, and animated data modules | Stronger authored composition, but still not accepted because it is not a native GPU-compute particle system and needs human review against premium particle references. |
| Product Configurator | Candidate | Refreshed local Blender-authored product-configurator studio GLB with tighter rig bounds, low-profile rear accent/readout tiles, closer UI/swatch panels, front material tray, stronger lens/grip/sensor detail, plinth, softboxes, imported hotspot markers, glass, metal, rubber, emissive details, turntable motion, and named exploded components | The old car/watch/shoe/sunglasses collage was removed because it produced cockpit voids, white artifacts, and fake route-side hotspots. A later full-height rear wall was also removed after it occluded the product in the browser capture. The route remains candidate until current screenshots prove the imported scene reads as a premium Three.js-class configurator and true imported-node picking/material switching are implemented. |
| Robotics Lab | Candidate | Animated Soldier plus two Robot Expressive actors foregrounded inside a purpose-built local Blender-authored training-stage fixture plus route-level controls; obstructing overhead rail nodes are excluded from the screenshot route | Motion and subject framing are cleaner, and the route now has better frame cadence, but it still needs stronger character grounding, clip-state polish, and material review before human visual acceptance. |
| Physics Testbed | Candidate | Local Blender-authored robotics manipulation testbed plus route-level G3D PhysicsWorld rigid bodies | Stronger conveyors, bins, ramps, robot tooling, sensors, target zones, and overlays, but still not accepted because collider coverage is primitive/proxy based and articulated robot dynamics are not connected. |
| Fog Cathedral | Failed | Curated Khronos Sponza interior crop plus G3D translucent fog/light-shaft staging | Architectural/material detail is stronger than the local generated fixture, but crop edges remain visible, load time is high, and the route still uses geometric haze rather than a true volumetric/fog lighting pass. |
| Digital Twin | Candidate | Expanded local Blender-authored cutaway factory fixture with gantry pickers, inspection portals, cabling, labels, truck/robot props, and deterministic factory overlays | Stronger industrial-scene candidate, but still requires screenshot review before it can be treated as a credible robotics factory digital twin. |

## Capability Boundaries

The gallery uses real G3D WebGL2 rendering, G3D geometry/material APIs, render items, instancing, points, postprocess options, authored GLB render pipelines, animation mixers, and browser runtime instrumentation. It does not claim unsupported systems as native, and the current scenes should be treated as technical scaffolds rather than advanced Three.js visual parity. A demo is not accepted until both automated browser screenshots and human visual review pass.

The current authored-asset layer loads GLB content for water-lab, ocean-observatory, reactor-post, smart-city, data-galaxy, product-configurator, robotics-lab, physics-playground, fog-cathedral, and digital-twin. The browser gate now verifies authored readiness for those routes and samples the WebGL canvas over time to prove visible motion. Those checks are necessary but not sufficient for acceptance.

Additional Khronos `glTF-Sample-Assets` fixtures used during this pass are documented under `fixtures/v9/assets/khronos-showcase/README.md`. Assets that hurt screenshot quality remain documented but are not treated as accepted route evidence.

| Capability area | Native G3D / repo capability used here | Gallery helper approximation | Not claimed as native | Primary risk |
| --- | --- | --- | --- | --- |
| Rendering | WebGL2 render path, render items, geometry, materials, lights, depth, transparency, diagnostics, screenshot readback. | Route-specific camera presets, scene composition helpers, dashboard overlays. | Film-quality renderer parity from smoke tests alone. | All routes. |
| WebGPU / compute | WebGPU proof routes exist elsewhere in the repo. | V9 gallery currently uses WebGL2-oriented showcase routes. | WebGPU water, WebGPU ocean, and GPU compute particles. | Water, ocean, data galaxy. |
| Materials | PBR-style material properties, emissive, metallic/roughness, clearcoat/transmission where loader/material path supports them. | Route-side material correction for assets that render poorly in the current path. | Perfect glass/transmission sorting or premium configurator material response. | Product, reactor, fog, ocean. |
| glTF / GLB assets | Browser GLB loading, authored fixture layering, material variants where supported by the imported asset path. | Asset exclusions, route-side material overrides, camera framing, local Blender fixtures. | Any imported asset as accepted evidence until screenshot-reviewed. | Product, robotics, smart city, fog. |
| Animation | Animation mixer/clip playback is used by animated GLB candidates and route motion systems. | Deterministic prop, camera, overlay, timeline, and simulation motion. | Full IK parity, root-motion production state machines, or character controller parity in this gallery. | Robotics, smart city. |
| Instancing / scale | Instancing and batching exist in the codebase and are represented by route stress concepts. | District/traffic overlays and procedural scene systems. | Accepted high-scale city parity without a separate stress proof and screenshot review. | Smart city, digital twin. |
| Particles | G3D point geometry and CPU-updated particle fields. | Formations, attractors, trails, connections, and count controls. | Public native GPU-compute particle simulation. | Data galaxy. |
| Postprocess | Bloom/postprocess-style controls, FXAA/color/vignette-style passes where supported. | CSS/canvas overlays and tuned route effect stacks. | Effects-composer-class bloom, DOF, SMAA, or motion blur parity until visual/perf review passes. | Reactor. |
| Fog / light shafts | Transparent haze cards, dust particles, lighting choreography. | Geometric god-ray and atmospheric-depth approximations. | True volumetric raymarch fog/light scattering. | Fog cathedral. |
| Water | Procedural mesh waves, CPU ripple fields, pointer disturbance. | Foam/color/normal-style visual approximations and authored environment staging. | Native GPGPU water, SSR/refraction ocean stack. | Water lab, ocean observatory. |
| Physics | `@galileo3d/physics` exists in the repo and the physics playground now uses its route-level rigid-body/contact path. | Primitive/proxy colliders and a kinematic pusher keep the gallery route deterministic. | Mesh-derived colliders, full articulated robot dynamics, and accepted Rapier/Ammo parity. | Physics playground, digital twin. |
| UI / interaction | Route controls, reset, capture, camera presets, status HUD, runtime stats. | Route-specific panels, labels, overlays, and event logs. | Visual acceptance from UI presence alone. | All routes. |
| Review evidence | Playwright screenshots, runtime JSON, contact sheet, visual review report. | Human review metadata and screenshot-hash promotion rules. | Smoke/runtime pass as showcase acceptance. | All routes. |

- Water and ocean demos use CPU/procedural wave geometry. G3D does not currently expose a complete native GPGPU water solver.
- Particle demos use G3D point geometry and animated transforms. G3D does not currently expose a public GPU-compute particle update API.
- Fog and light shafts are translucent geometry and particle approximations. A true volumetric raymarch pass is not exposed; the active fog-cathedral route uses a curated Sponza crop and remains failed until crop edges, load time, and cinematic visual quality improve.
- The robotics character demo now layers imported Soldier and Robot Expressive GLBs over authored lab context; XBot remains available as a fixture but is not active in this route because its current screenshot quality failed review.
- The physics playground now uses `@galileo3d/physics` rigid bodies and contacts for runtime objects; mesh-derived colliders and full articulated robotics dynamics remain out of scope for this candidate route.

Each demo page includes a "What this proves" section, known gaps, acceptance criteria, controls, reset, capture, camera presets, and runtime stats.

## Reference And Art-Direction Lock

These are the visual targets and failure boundaries for the next rebuild pass. A route can improve from `failed` to `candidate` when it materially moves toward this target; it can move to `accepted` only when the screenshot and review gate prove it.

| Demo | Three.js-style reference | Hero screenshot intent | Must not ship as |
| --- | --- | --- | --- |
| Water Lab | GPGPU/WebGL water demos | Sunset marina or mountain lake with readable water interaction, shoreline depth, dock/boat/lights/props, and visible ripple response. | Blue plane, flat terrain, unlit prop scatter, or invisible pointer disturbance. |
| Ocean Observatory | WebGPU/WebGL ocean demos | Futuristic observatory/yacht deck overlooking layered animated ocean, horizon atmosphere, drones/markers, glass rails, and moving reflection cues. | Same composition as Water Lab, one sine-wave plane, or low-detail deck. |
| Reactor Post | Bloom/effects-composer demos | AI command center with reactor focal point, clean emissive hierarchy, holographic UI layers, particles, and obvious before/after effect value. | Noisy bloom, washed-out scene, arbitrary glowing shapes, or postprocess that hurts clarity. |
| Smart City | Littlest Tokyo, instancing, performance scenes | Aerial city simulation with authored urban detail, district hierarchy, traffic/data pulses, flythrough motion, and separate scale evidence. | Single imported scene with weak overlays or a raw grid benchmark. |
| Data Galaxy | GPGPU particles / galaxy generators | Dense AI infrastructure particle volume with formations, attractors, trails/connections, central data core, labels, and visible count/perf tradeoff. | Static starfield, sparse dots, or CPU limit hidden as GPU compute. |
| Product Configurator | PBR glTF product configurators | Premium studio product layout with named parts, legible lens/glass/metal/rubber materials, close material swatches, hotspots, close-up cameras, variants, and exploded behavior. | One rotating prop, white strap/glass halos, noisy panels, excess empty studio space, or controls that do not affect imported parts. |
| Robotics Lab | Animated glTF / skinning / IK demos | Robotics training lab with multiple animated entities, grounded set dressing, timeline controls, selected entity status, and readable motion. | One character on a blank floor, white/default materials, no state changes, or hidden animation. |
| Physics Playground | Rapier/Ammo/Jolt physics demos | Robotics manipulation cell with conveyors, bins, ramps, stacked objects, pusher/gripper motion, metrics, and honest bounded-physics labeling. | Three falling blocks, debug-only shapes, or fake collision claims. |
| Fog Cathedral | Fog/light shaft/cinematic shader demos | Architectural space with foreground/midground/background depth, dust, moving beams, atmospheric haze, and no visible crop edge. | Gray fog box, visible Sponza crop seams, or volumetric claims without volumetric implementation. |
| Digital Twin | CAD/robotics dashboards / industrial twins | Enterprise factory floor with zones, robots, conveyors, sensor cones, heatmap, labels, timeline, event log, and inspection interaction. | Random industrial props, board-game scale, or dashboard UI disconnected from the 3D scene. |
