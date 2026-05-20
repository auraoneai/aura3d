export type DemoId =
  | "water-lab"
  | "ocean-observatory"
  | "reactor-post"
  | "smart-city"
  | "data-galaxy"
  | "product-configurator"
  | "robotics-lab"
  | "physics-playground"
  | "fog-cathedral"
  | "digital-twin";

export interface DemoControlDefinition {
  readonly key: string;
  readonly label: string;
  readonly kind: "range" | "toggle" | "select" | "button";
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly value?: number | boolean | string;
  readonly options?: readonly string[];
}

export type VisualReviewEvidence =
  | {
      readonly status: "failed" | "candidate";
      readonly screenshot: string;
      readonly screenshotSha256?: string;
      readonly reviewedBy?: string;
      readonly reviewedAt?: string;
      readonly notes: string;
    }
  | {
      readonly status: "accepted";
      readonly screenshot: string;
      readonly screenshotSha256: string;
      readonly reviewedBy: string;
      readonly reviewedAt: string;
      readonly notes: string;
    };

export interface DemoDefinition {
  readonly id: DemoId;
  readonly title: string;
  readonly shortTitle: string;
  readonly difficulty: "Advanced" | "Expert" | "Flagship";
  readonly visualReview: VisualReviewEvidence;
  readonly subtitle: string;
  readonly threeCategory: string;
  readonly reference: string;
  readonly features: readonly string[];
  readonly systems: readonly string[];
  readonly interactions: readonly string[];
  readonly proves: readonly string[];
  readonly knownGaps: readonly string[];
  readonly acceptance: readonly string[];
  readonly controls: readonly DemoControlDefinition[];
}

export const DEMOS: readonly DemoDefinition[] = [
  {
    id: "water-lab",
    title: "Interactive GPGPU-Style Water Lab",
    shortTitle: "Water Lab",
    difficulty: "Expert",
    visualReview: {
      status: "candidate",
      screenshot: "tests/reports/v9/advanced-examples-gallery/water-lab.png",
      notes: "Now uses a denser local Blender-authored cinematic marina fixture with boardwalks, docks, lanterns, boats, reeds, rocks, pines, and visible procedural ripple water. The current screenshot and runtime metrics clear the automated image/performance gates, but the route remains candidate because the water system is still a CPU/procedural approximation rather than a native GPGPU water, reflection/refraction, or caustics platform."
    },
    subtitle: "Cinematic marina lake with ripple interaction, floating props, docks, lights, and debug wave modes.",
    threeCategory: "GPGPU water / WebGL water",
    reference: "Reference target: Three.js GPGPU water demos. Current state: CPU/procedural wave field plus authored prop detail, not visual parity.",
    features: ["animated water tiles", "PBR materials", "interaction ripples", "camera presets", "performance HUD"],
    systems: ["water simulation", "floating props", "shoreline/dock set", "lighting presets", "debug wire overlay"],
    interactions: ["click/drag water ripples", "wave strength", "wire/debug view", "lighting preset", "reset simulation"],
    proves: ["G3D can present shader-like interactive environments with real-time user disturbance and cinematic composition."],
    knownGaps: ["No native GPGPU water solver is exposed; this route uses a CPU procedural height/ripple approximation rendered with G3D geometry."],
    acceptance: ["Water visibly animates", "pointer input creates visible ripples", "scene includes environment context and more than 20 visible props"],
    controls: [
      { key: "intensity", label: "Wave strength", kind: "range", min: 0, max: 2, step: 0.01, value: 1 },
      { key: "radius", label: "Ripple radius", kind: "range", min: 0.4, max: 2.4, step: 0.05, value: 1.1 },
      { key: "roughness", label: "Water roughness", kind: "range", min: 0.05, max: 0.8, step: 0.01, value: 0.22 },
      { key: "debug", label: "Wave debug", kind: "toggle", value: false },
      { key: "lighting", label: "Lighting preset", kind: "select", value: "sunset", options: ["sunset", "night", "clear"] }
    ]
  },
  {
    id: "ocean-observatory",
    title: "WebGPU/WebGL Ocean Surface Showcase",
    shortTitle: "Ocean Observatory",
    difficulty: "Expert",
    visualReview: {
      status: "candidate",
      screenshot: "tests/reports/v9/advanced-examples-gallery/ocean-observatory.png",
      notes: "Now uses a denser local Blender-authored ocean observatory fixture with deck layers, railings, glass, masts, equipment, lights, distant platform silhouettes, and visible procedural ocean motion. The current screenshot and runtime metrics clear the automated image/performance gates, but the route remains candidate because it is still WebGL2 procedural wave geometry and material cues rather than a production WebGPU/FFT ocean with real reflection/refraction."
    },
    subtitle: "Futuristic coastal deck with layered ocean motion, horizon, drones, glass rails, beacon lights, and wind modes.",
    threeCategory: "WebGPU water / advanced shader scene",
    reference: "Reference target: Three.js ocean surfaces. Current state: WebGL2 procedural ocean scene with an authored deck and visible wave motion, still failed for human visual parity.",
    features: ["layered waves", "animated sun reflection", "large prop set", "moving drones", "mode switching"],
    systems: ["ocean tiles", "deck architecture", "drone paths", "weather modes", "horizon haze"],
    interactions: ["mode switch", "wind speed", "wave scale", "path animation", "camera presets"],
    proves: ["G3D can compose large animated environments with multiple moving subsystems and runtime render controls."],
    knownGaps: ["WebGPU water, screen-space reflection/refraction, foam shaders, and HDR sky/water integration are not production complete in this repo; this route uses WebGL2 procedural geometry/material animation."],
    acceptance: ["Ocean has layered motion", "at least two moving objects cross the scene", "environment differs from the marina water lab"],
    controls: [
      { key: "mode", label: "Ocean mode", kind: "select", value: "cinematic", options: ["calm", "storm", "cinematic"] },
      { key: "wind", label: "Wind speed", kind: "range", min: 0, max: 3, step: 0.05, value: 1.2 },
      { key: "scale", label: "Wave scale", kind: "range", min: 0.5, max: 2.5, step: 0.05, value: 1.1 },
      { key: "paths", label: "Object paths", kind: "toggle", value: true },
      { key: "lighting", label: "Lighting", kind: "select", value: "dusk", options: ["dusk", "moon", "noon"] }
    ]
  },
  {
    id: "reactor-post",
    title: "Cinematic Post-Processing Pipeline",
    shortTitle: "Reactor Post",
    difficulty: "Expert",
    visualReview: {
      status: "candidate",
      screenshot: "tests/reports/v9/advanced-examples-gallery/reactor-post.png",
      notes: "The focused reactor pass reduced visual clutter, lowered glass/telemetry noise, tightened the reactor silhouette, and made the measured default post stack explicit: tone mapping, color grading, vignette, and FXAA with Bloom kept as an opt-in control. It is now a credible postprocess candidate with fresh screenshot evidence, but it is not accepted because the objective image-quality gate still reports below-threshold edge/detail density and the route does not prove DOF or motion-blur parity."
    },
    subtitle: "AI command center with emissive reactor core, holographic panels, particles, scan rings, and effect toggles.",
    threeCategory: "Postprocessing / bloom / effects-composer",
    reference: "Reference target: Three.js bloom/effects composer demos. Current state: bounded postprocess proof scene with authored material prop, not full cinematic parity.",
    features: ["bloom", "color grade", "vignette overlay", "FXAA", "cinematic camera shots"],
    systems: ["reactor core", "holographic panels", "particle motes", "energy rings", "raw/graded split view"],
    interactions: ["toggle effect stack", "grade preset", "camera shots", "pause animation", "debug lighting"],
    proves: ["G3D can load an authored reactor scene and combine it with runtime motion, lighting, and configurable postprocess-style controls, but accepted visual parity remains blocked."],
    knownGaps: ["Default capture uses tone mapping, color grade, vignette, and FXAA, while Bloom is opt-in until the route can prove a clean high-cadence bloom capture.", "Depth of field and motion blur remain bounded renderer features and the scene is still not accepted as a full effects-composer parity demo.", "Fresh image-quality evidence still shows below-threshold edge/detail density for accepted status."],
    acceptance: ["Raw/post difference is visible", "scene includes enough emissive content to justify bloom", "multiple depth layers are visible"],
    controls: [
      { key: "bloom", label: "Bloom", kind: "toggle", value: false },
      { key: "grade", label: "Color grade", kind: "select", value: "teal", options: ["teal", "warm", "mono"] },
      { key: "vignette", label: "Vignette", kind: "range", min: 0, max: 1, step: 0.01, value: 0.28 },
      { key: "paused", label: "Pause", kind: "toggle", value: false },
      { key: "debug", label: "Debug", kind: "toggle", value: false }
    ]
  },
  {
    id: "smart-city",
    title: "Massive Instancing / Smart City Stress Test",
    shortTitle: "Smart City",
    difficulty: "Flagship",
    visualReview: {
      status: "candidate",
      screenshot: "tests/reports/v9/advanced-examples-gallery/smart-city.png",
      notes: "Now uses the local Littlest Tokyo authored animated GLB as the hero district with two local authored smart-city district fixtures staged around it, plus route-level G3D traffic/data overlays and explicit instrumentation. It is a stronger Three.js-style city/keyframe candidate with better urban context, but remains unaccepted because frame cadence is still poor in the screenshot run and separate high-instance stress evidence still needs to pass."
    },
    subtitle: "Authored animated Tokyo district with traffic/data overlays, flythrough controls, and explicit load/frame telemetry.",
    threeCategory: "Instancing / large-scene performance",
    reference: "Reference target: Three.js Littlest Tokyo/keyframe scene plus instancing and large-scene stress examples. Current state: authored animated city GLB plus authored smart-city district fixtures and live G3D traffic/data overlays; not accepted until screenshot review and frame cadence pass.",
    features: ["authored city GLTF", "traffic/data overlays", "flythrough", "debug bounds", "performance telemetry"],
    systems: ["authored animated city district", "traffic overlays", "data pulses", "district styling", "camera flythrough", "performance telemetry"],
    interactions: ["overlay count", "select district overlay", "traffic toggle", "wire/debug bounds", "flythrough/reset"],
    proves: ["G3D can load an authored animated city scene and layer route-level simulation overlays, camera movement, and performance telemetry around it."],
    knownGaps: ["This is now a stronger authored-scene visual candidate, not an accepted proof of full GPU instancing parity with every Three.js benchmark.", "The route now has more authored city context, but the screenshot run still shows poor frame cadence and cannot be accepted as a production stress showcase.", "The Littlest Tokyo Draco path and animation cadence must stay under review because cold-load and frame pacing can regress."],
    acceptance: ["Authored animated city scene dominates the screenshot", "Authored smart-city district context is visible around the hero asset", "G3D traffic/data overlays remain visible but secondary", "route-level traffic/flythrough motion and frame/load metrics stay explicit", "separate high-instance stress evidence is still required before this can claim large-scale instancing parity"],
    controls: [
      { key: "count", label: "Object count", kind: "select", value: "medium", options: ["low", "medium", "high", "extreme"] },
      { key: "traffic", label: "Traffic", kind: "toggle", value: true },
      { key: "wire", label: "Debug bounds", kind: "toggle", value: false },
      { key: "fly", label: "Flythrough", kind: "toggle", value: false },
      { key: "district", label: "District", kind: "select", value: "all", options: ["all", "north", "harbor", "core", "industrial"] }
    ]
  },
  {
    id: "data-galaxy",
    title: "Particle Simulation / AI Data Galaxy",
    shortTitle: "Data Galaxy",
    difficulty: "Expert",
    visualReview: {
      status: "failed",
      screenshot: "tests/reports/v9/advanced-examples-gallery/data-galaxy.png",
      notes: "Still failed, but the reusable environment-stage floor/catch plane and the authored data-core platform mesh are removed from the default route, and the default particle control uses a route-owned 6k curated showcase density while 4k remains a selectable interactive mode and 24k/50k remain stress/evidence modes. The route remains useful evidence for CPU particle generation, authored GLB loading, and honest GPU-compute limits, but it is not accepted until the image itself has a strong focal subject, texture-backed or higher-fidelity authored content, readable foreground/contrast, healthy capture cadence, and screenshot proof against premium Three.js particle references."
    },
    subtitle: "Dense data-particle visualization with formations, attractors, trails, connection hints, and camera flight.",
    threeCategory: "Particles / GPGPU particles / galaxy generators",
    reference: "Reference target: Three.js particle demos. Current state: G3D point cloud scaffold with animated transforms, not GPU particle parity.",
    features: ["point cloud geometry", "formation switching", "animated attractors", "connection lines", "performance scaling"],
    systems: ["particle clusters", "central core", "attractors", "connection graph", "deep-space backdrop"],
    interactions: ["formation", "particle count", "speed", "turbulence", "trails/connections"],
    proves: ["G3D can support animated data visualization evidence with explicit CPU/GPU tradeoff reporting, but the current route is rejected as a visual showcase until the subject composition, material/content quality, and capture cadence improve."],
    knownGaps: ["No public GPGPU particle update API exists; stable counts are generated on CPU and animated through transform/form updates.", "The generated authored data-core GLB now has limited embedded generated data-glyph texture evidence, but it remains support-only and cannot be used as premium Three.js-class focal hero proof until visual review accepts it."],
    acceptance: ["Dense dynamic particle volume", "multiple formations", "performance impact visible when count changes", "default screenshots must not read as full-frame noisy clutter", "visible background must be art-directed for data/space rather than a terrestrial HDRI"],
    controls: [
      { key: "formation", label: "Formation", kind: "select", value: "galaxy", options: ["galaxy", "sphere", "wave", "network", "vortex"] },
      { key: "particles", label: "Particles", kind: "select", value: "6000", options: ["4000", "6000", "24000", "50000"] },
      { key: "speed", label: "Speed", kind: "range", min: 0.1, max: 3, step: 0.05, value: 1 },
      { key: "turbulence", label: "Turbulence", kind: "range", min: 0, max: 2, step: 0.05, value: 0.7 },
      { key: "connections", label: "Connections", kind: "toggle", value: true }
    ]
  },
  {
    id: "product-configurator",
    title: "Physically Based Product Configurator",
    shortTitle: "Configurator",
    difficulty: "Advanced",
    visualReview: {
      status: "failed",
      screenshot: "tests/reports/v9/advanced-examples-gallery/product-configurator.png",
      notes: "Still failed. The generated no-texture product-studio GLB is no longer allowed to carry the default visual path; the route now stages the original texture-backed concept vehicle, chronograph watch, material-variant shoe, and transparent sunglasses assets inside the reusable indoor-studio environment helper. Promotion still requires regenerated screenshots proving visual quality, frame cadence, and honest interaction boundaries."
    },
    subtitle: "Multi-asset texture-backed product studio with real imported variant controls, transparent eyewear, chronograph detail, vehicle turntable, exploded view, and controlled reusable studio staging.",
    threeCategory: "PBR product viewer / configurator",
    reference: "Reference target: Three.js glTF product configurators. Current state: texture-backed multi-product G3D candidate with imported material variants and reusable studio staging, not accepted visual or full interaction parity.",
    features: ["PBR product assets", "imported material variants", "transparent product material", "exploded view", "studio lighting", "turntable"],
    systems: ["hero product", "support products", "reusable studio lighting", "imported variants", "exploded controls", "turntable"],
    interactions: ["car variant", "watch variant", "shoe variant", "explode product", "camera preset", "lighting preset", "turntable toggle"],
    proves: ["G3D can load and stage multiple texture-backed glTF product assets with imported material-variant controls, transparent product materials, turntable motion, route-side exploded offsets, reusable indoor-studio staging, material diagnostics, and performance instrumentation; it does not yet prove premium product visual quality."],
    knownGaps: ["The current hero restores the original texture-backed concept-car, chronograph watch, material-variant shoe, and transparent sunglasses GLBs, but it is still not a single authored product-configurator model with a unified part graph or exploded animation timeline.", "The car, watch, and shoe consume real imported KHR_materials_variants metadata through the shared authored-layer pipeline where the source assets expose variants; sunglasses remain a transparent material asset without variant metadata.", "The available @galileo3d/controls Picking helper does not expose triangle/bounds raycasting for authored GLB renderables, so hotspot-style part picking remains unsupported in this route.", "Exploded behavior remains route-side name-pattern offsets rather than an authored exploded animation timeline.", "The route remains failed until human review accepts the current multi-product composition, material clarity, frame cadence, and unsupported-feature disclosures."],
    acceptance: ["Texture-backed product assets are visibly framed with no no-texture scaffold geometry dominating the shot", "material and transparent product details remain legible", "car/watch/shoe material variant controls visibly affect imported GLB materials", "explode and turntable controls visibly affect imported GLB state", "default screenshots pass human visual review and frame cadence before route promotion", "route is not accepted until visual review and frame cadence pass"],
    controls: [
      { key: "explode", label: "Exploded view", kind: "toggle", value: false },
      { key: "carVariant", label: "Car variant", kind: "select", value: "Carmine Candy", options: ["Carmine Candy", "Pearly Swirly", "Torched Graphite"] },
      { key: "watchVariant", label: "Watch variant", kind: "select", value: "Midnight Gold", options: ["Surgical White", "Midnight Gold", "Commerce Green", "Khronos Red"] },
      { key: "shoeVariant", label: "Shoe variant", kind: "select", value: "beach", options: ["midnight", "beach", "street"] },
      { key: "focusPart", label: "Hotspot", kind: "select", value: "overview", options: ["overview", "lens", "body", "sensor", "battery", "grip", "controls"] },
      { key: "lighting", label: "Lighting", kind: "select", value: "studio", options: ["studio", "environment", "inspection"] },
      { key: "turntable", label: "Turntable", kind: "toggle", value: true }
    ]
  },
  {
    id: "robotics-lab",
    title: "Animated glTF / Character / Robot Scene",
    shortTitle: "Robotics Lab",
    difficulty: "Expert",
    visualReview: {
      status: "candidate",
      screenshot: "tests/reports/v9/advanced-examples-gallery/robotics-lab.png",
      notes: "Authored Soldier plus two Robot Expressive actors animate as the foreground subject inside a purpose-built local Blender-authored training-stage fixture. It remains candidate because the route still needs stronger character grounding, clip-state polish, and human screenshot review before it can compare to advanced Three.js character/IK showcases."
    },
    subtitle: "Robot training lab with animated armatures, task zones, monitors, safety lanes, crates, and timeline controls.",
    threeCategory: "Animated glTF / skeletal animation scenes",
    reference: "Reference target: Three.js keyframe/skinning examples. Current state: authored Soldier and Robot Expressive animation candidates plus procedural lab context, not accepted visual parity.",
    features: ["multi-part robot animation", "state machine", "path debug", "labels", "timeline"],
    systems: ["robots", "workstations", "monitors", "safety zones", "moving equipment"],
    interactions: ["play/pause", "animation state", "scrub timeline", "entity select", "follow camera"],
    proves: ["G3D can combine animated entities, scene composition, lights, labels, and simulation playback controls."],
    knownGaps: ["Imported skinned-character playback works in this route, but clip-state UI, material quality, and lab art direction remain below the official Three.js character-demo bar.", "The authored training-stage fixture improves composition, but it is still not an IK solver or a full character state-machine demo.", "XBot remains available as a fixture but is not active here because its current render quality failed the visual bar."],
    acceptance: ["At least three animated entities", "lab context around the assets", "meaningful timeline and debug controls"],
    controls: [
      { key: "playing", label: "Play", kind: "toggle", value: true },
      { key: "state", label: "Animation", kind: "select", value: "training", options: ["idle", "training", "inspect", "handoff"] },
      { key: "timeline", label: "Timeline", kind: "range", min: 0, max: 1, step: 0.01, value: 0 },
      { key: "skeleton", label: "Skeleton paths", kind: "toggle", value: false },
      { key: "follow", label: "Follow mode", kind: "toggle", value: false }
    ]
  },
  {
    id: "physics-playground",
    title: "Physics Playground / Robotics Manipulation Test",
    shortTitle: "Physics Testbed",
    difficulty: "Advanced",
    visualReview: {
      status: "candidate",
      screenshot: "tests/reports/v9/advanced-examples-gallery/physics-playground.png",
      notes: "Now uses a local Blender-authored robotics manipulation testbed with conveyors, bins, ramps, robot tooling, sensors, target zones, debug overlays, and runtime objects driven by the real G3D PhysicsWorld rigid-body/contact APIs. It remains candidate because collider coverage is still primitive/proxy based and articulated robotics dynamics are not connected."
    },
    subtitle: "Robotics manipulation testbed with bins, ramps, conveyors, stacked objects, gripper/pusher, scores, and debug overlays.",
    threeCategory: "Physics / collision playgrounds",
    reference: "Reference target: Three.js Rapier/Ammo physics playgrounds. Current state: bounded G3D PhysicsWorld integration with primitive/proxy colliders, deterministic rigid bodies, conveyor friction, and a kinematic pusher.",
    features: ["rigid-body objects", "conveyor friction", "kinematic pusher", "collision zones", "scenario reset"],
    systems: ["crates", "spheres", "ramps", "conveyors", "bins", "gripper"],
    interactions: ["spawn objects", "drop pile", "gravity", "conveyor speed", "slow motion/debug"],
    proves: ["G3D can drive the gallery testbed from its PhysicsWorld rigid-body/contact APIs while keeping deterministic browser-stable instrumentation."],
    knownGaps: ["Physics is wired through primitive/proxy colliders rather than mesh-derived colliders.", "The pusher is a kinematic collider, not a full articulated robot dynamics stack.", "The route is still candidate until screenshot review proves the real physics state reads clearly."],
    acceptance: ["Objects visibly move", "scene is more than falling blocks", "robotics context and metrics are visible"],
    controls: [
      { key: "spawn", label: "Spawn pile", kind: "button" },
      { key: "gravity", label: "Gravity", kind: "range", min: 0, max: 2, step: 0.05, value: 1 },
      { key: "conveyor", label: "Conveyor speed", kind: "range", min: -2, max: 3, step: 0.05, value: 1.2 },
      { key: "pusher", label: "Pusher", kind: "toggle", value: true },
      { key: "debug", label: "Collision debug", kind: "toggle", value: false }
    ]
  },
  {
    id: "fog-cathedral",
    title: "Volumetric Fog / Light Shaft Cinematic Scene",
    shortTitle: "Fog Cathedral",
    difficulty: "Expert",
    visualReview: {
      status: "candidate",
      screenshot: "tests/reports/v9/advanced-examples-gallery/fog-cathedral.png",
      notes: "Uses the curated Khronos Sponza interior crop as the authored architectural base with a quieter local atmospheric helper for depth haze, narrow aperture-local transparent light-shaft cards, batched dust, and line-batched tracery detail. The current screenshot and runtime metrics clear the automated image/performance gates, but the route remains candidate because G3D still lacks native volumetric raymarching, shadowed participating media, or a true volumetric lighting pass."
    },
    subtitle: "Sponza-based authored interior with atmospheric depth, light shaft approximations, dust, arches, and camera choreography.",
    threeCategory: "Volumetric fog / god rays / cinematic lighting",
    reference: "Reference target: Three.js fog/light demos. Current state: local authored cathedral plus layered translucent geometry and particles because true volumetric lighting is not native.",
    features: ["authored fog cathedral GLB", "depth haze layers", "soft shaft cards", "batched dust particles", "cinematic camera"],
    systems: ["authored nave", "arched silhouettes", "batched dust", "transparent shaft cards", "fog staging"],
    interactions: ["fog density", "beam toggle", "sun angle", "camera shots", "cinematic pause"],
    proves: ["G3D can support atmospheric composition controls, but this route is not accepted as a cinematic volumetric showcase yet."],
    knownGaps: ["No true volumetric raymarch pass is exposed; light shafts and haze remain local transparent-geometry approximations.", "The active route uses a curated Sponza crop for authored architectural detail, but crop boundaries, transparent-card silhouettes, and load time still block visual acceptance."],
    acceptance: ["Cathedral interior architecture is visible", "clear foreground/midground/background", "fog creates depth", "lighting is central to the scene"],
    controls: [
      { key: "fog", label: "Fog density", kind: "range", min: 0, max: 1, step: 0.01, value: 0.62 },
      { key: "beams", label: "Light beams", kind: "toggle", value: true },
      { key: "sun", label: "Sun angle", kind: "range", min: -1, max: 1, step: 0.01, value: 0.1 },
      { key: "cinematic", label: "Cinematic", kind: "toggle", value: true },
      { key: "debug", label: "Lighting debug", kind: "toggle", value: false }
    ]
  },
  {
    id: "digital-twin",
    title: "CAD / Robotics Digital Twin Control Room",
    shortTitle: "Digital Twin",
    difficulty: "Flagship",
    visualReview: {
      status: "candidate",
      screenshot: "tests/reports/v9/advanced-examples-gallery/digital-twin.png",
      notes: "Now uses a dedicated local Blender-authored robotics factory fixture with a cutaway industrial shell, gantry pickers, inspection portals, overhead cabling, conveyors, workcells, racks, robot arms, mobile robots, subtler sensor cones, heatmap plates, operator stations, and authored robot/truck props. It remains candidate until screenshot review proves it reads as a credible enterprise digital twin rather than a staged simulation board."
    },
    subtitle: "Enterprise robotics factory twin with work cells, robots, conveyors, lidar cones, status overlays, heatmap, and timeline.",
    threeCategory: "CAD viewers / robotics dashboards / digital twins",
    reference: "Reference target: advanced Three.js industrial dashboards and CAD/simulation viewers. Current state: deterministic digital-twin scaffold with a dedicated authored factory fixture, not full CAD/telemetry parity.",
    features: ["factory floor", "robot arms", "mobile robots", "sensor overlays", "timeline simulation"],
    systems: ["conveyors", "robot arms", "mobile robot paths", "package flow", "sensor sweeps", "heatmap"],
    interactions: ["inspect robot", "sensor overlay", "safety zones", "heatmap", "simulation speed/camera/zone"],
    proves: ["G3D can power enterprise robotics, CAD, simulation, and operational visualization products."],
    knownGaps: ["CAD import, real robot telemetry, and physics-grade collision are not connected; the route uses deterministic live simulation data."],
    acceptance: ["At least 200 visible objects", "five independent animated systems", "credible digital twin layout with data overlays"],
    controls: [
      { key: "running", label: "Simulation", kind: "toggle", value: true },
      { key: "speed", label: "Sim speed", kind: "range", min: 0.1, max: 3, step: 0.05, value: 1 },
      { key: "sensors", label: "Sensors", kind: "toggle", value: true },
      { key: "safety", label: "Safety zones", kind: "toggle", value: true },
      { key: "heatmap", label: "Heatmap", kind: "toggle", value: true },
      { key: "zone", label: "Factory zone", kind: "select", value: "all", options: ["all", "inbound", "assembly", "qa", "outbound"] }
    ]
  }
];

export function getDemo(id: string | null | undefined): DemoDefinition {
  return DEMOS.find((demo) => demo.id === id) ?? DEMOS[0]!;
}
