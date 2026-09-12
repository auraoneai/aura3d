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
    title: "Interactive Procedural Water Lab",
    shortTitle: "Water Lab",
    difficulty: "Expert",
    visualReview: {
      status: "candidate",
      screenshot: "tests/reports/advanced-examples-gallery/water-lab.png",
      notes: "Candidate source route. Generate the exact-source screenshot and runtime report, then record an independent human decision for that artifact before promoting this route to accepted."
    },
    subtitle: "Cinematic marina lake with ripple interaction, floating props, docks, lights, and debug wave modes.",
    threeCategory: "GPGPU water / WebGL water",
    reference: "Reference target: Three.js GPGPU water demos. Current state: CPU/procedural wave field plus authored prop detail, not visual parity.",
    features: ["animated water tiles", "PBR materials", "interaction ripples", "camera presets", "performance HUD"],
    systems: ["water simulation", "floating props", "shoreline/dock set", "lighting presets", "debug wire overlay"],
    interactions: ["click/drag water ripples", "wave strength", "wire/debug view", "lighting preset", "reset simulation"],
    proves: ["A3D can present shader-like interactive environments with real-time user disturbance and cinematic composition."],
    knownGaps: ["No native GPGPU water solver is exposed; this route uses a CPU procedural height/ripple approximation rendered with A3D geometry."],
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
    title: "WebGL2 Procedural Ocean Surface Showcase",
    shortTitle: "Ocean Observatory",
    difficulty: "Expert",
    visualReview: {
      status: "candidate",
      screenshot: "tests/reports/advanced-examples-gallery/ocean-observatory.png",
      notes: "Candidate source route. Generate the exact-source screenshot and runtime report, then record an independent human decision for that artifact before promoting this route to accepted."
    },
    subtitle: "Futuristic coastal deck with layered ocean motion, horizon, drones, glass rails, beacon lights, and wind modes.",
    threeCategory: "WebGPU water / advanced shader scene",
    reference: "Reference target: Three.js ocean surfaces. Current state: WebGL2 procedural ocean scene with an authored deck and visible wave motion, accepted through current screenshot review, hash verification, and bounded approximation disclosure.",
    features: ["layered waves", "animated sun reflection", "large prop set", "moving drones", "mode switching"],
    systems: ["ocean tiles", "deck architecture", "drone paths", "weather modes", "horizon haze"],
    interactions: ["mode switch", "wind speed", "wave scale", "path animation", "camera presets"],
    proves: ["A3D can compose large animated environments with multiple moving subsystems and runtime render controls."],
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
      screenshot: "tests/reports/advanced-examples-gallery/reactor-post.png",
      notes: "Candidate source route. Generate the exact-source screenshot and runtime report, then record an independent human decision for that artifact before promoting this route to accepted."
    },
    subtitle: "AI command center with emissive reactor core, holographic panels, particles, scan rings, and effect toggles.",
    threeCategory: "Postprocessing / bloom / effects-composer",
    reference: "Reference target: Three.js bloom/effects composer demos. Current state: bounded postprocess proof scene with authored material prop, not full cinematic parity.",
    features: ["bloom", "color grade", "vignette overlay", "FXAA", "cinematic camera shots"],
    systems: ["reactor core", "holographic panels", "particle motes", "energy rings", "raw/graded split view"],
    interactions: ["toggle effect stack", "grade preset", "camera shots", "pause animation", "debug lighting"],
    proves: ["A3D can load an authored reactor scene and combine it with runtime motion, lighting, and configurable postprocess-style controls, but accepted visual parity remains blocked."],
    knownGaps: ["Bloom remains opt-in evidence until the route can prove a separate high-cadence bloom capture.", "Depth of field and motion blur are bounded renderer features and are not claimed as full effects-composer parity in this route."],
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
    title: "Authored Smart City / Bounded Instancing",
    shortTitle: "Smart City",
    difficulty: "Flagship",
    visualReview: {
      status: "candidate",
      screenshot: "tests/reports/advanced-examples-gallery/smart-city.png",
      notes: "Candidate source route. Generate the exact-source screenshot and runtime report, then record an independent human decision for that artifact before promoting this route to accepted."
    },
    subtitle: "Authored street grid with visible roads, districts, logistics yards, and anchored traffic/sensor telemetry. Raise Object count to Extreme to stress instancing.",
    threeCategory: "Instancing / large-scene performance",
    reference: "Reference target: authored smart-city street grid plus instancing and large-scene stress examples. Current state: a locally authored district GLTF with route-owned traffic, logistics-yard cargo, street sensors, and frame telemetry.",
    features: ["authored street grid", "street traffic + yard cargo", "anchored sensor data", "flythrough", "performance telemetry"],
    systems: ["authored city street grid", "instanced street traffic", "instanced logistics yards", "instanced intersection sensors", "district/facade data routes", "camera flythrough", "performance telemetry"],
    interactions: ["raise object-count load", "select district overlay", "traffic toggle", "wire/debug bounds", "flythrough/reset"],
    proves: ["A3D can keep an authored smart-city street grid readable while driving batched vehicles on roads, cargo in logistics yards, sensors at intersections, district routes, and live frame telemetry."],
    knownGaps: ["This route is an authored street-grid showcase with bounded instancing overlays, not a full large-scale instancing stress benchmark.", "Cold-load and frame-pacing behavior for the dense authored district remains a known performance limit."],
    acceptance: ["Authored roads and districts dominate the screenshot", "traffic stays on visible street coordinates", "cargo stays inside marked logistics yards", "sensor markers stay at intersections", "route-level motion and frame/load metrics stay explicit", "separate high-instance stress evidence is still required before this can claim large-scale instancing parity"],
    controls: [
      { key: "count", label: "Object count", kind: "select", value: "high", options: ["low", "medium", "high", "extreme"] },
      { key: "traffic", label: "Traffic", kind: "toggle", value: true },
      { key: "wire", label: "Debug bounds", kind: "toggle", value: false },
      { key: "fly", label: "Flythrough", kind: "toggle", value: false },
      { key: "district", label: "District", kind: "select", value: "all", options: ["all", "north", "harbor", "core", "industrial"] }
    ]
  },
  {
    id: "data-galaxy",
    title: "CPU Point-Buffer / AI Data Galaxy",
    shortTitle: "Data Galaxy",
    difficulty: "Expert",
    visualReview: {
      status: "candidate",
      screenshot: "tests/reports/advanced-examples-gallery/data-galaxy.png",
      notes: "Candidate source route. Generate the exact-source screenshot and runtime report, then record an independent human decision for that artifact before promoting this route to accepted."
    },
    subtitle: "Dense data-particle visualization with formations, attractors, trails, connection hints, and camera flight.",
    threeCategory: "Particles / CPU point-buffer galaxy visualization",
    reference: "Reference target: Three.js particle and galaxy composition demos. Current state: A3D point-buffer visualization with animated transforms and explicit compute-solver limits.",
    features: ["point cloud geometry", "formation switching", "animated attractors", "connection lines", "performance scaling"],
    systems: ["particle clusters", "central core", "attractors", "connection graph", "deep-space backdrop"],
    interactions: ["formation", "particle count", "speed", "turbulence", "trails/connections"],
    proves: ["A3D can support animated data visualization evidence with explicit CPU/static point-buffer tradeoff reporting and a route-owned focal composition."],
    knownGaps: ["No public particle update API is exposed for this route; stable counts are generated on CPU and animated through transform/form updates.", "The generated support GLB is cataloged but inactive in hero mode; the visible focal subject comes from route-owned data visualization geometry."],
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
      status: "candidate",
      screenshot: "tests/reports/advanced-examples-gallery/product-configurator.png",
      notes: "Candidate source route. Generate the exact-source screenshot and runtime report, then record an independent human decision for that artifact before promoting this route to accepted."
    },
    subtitle: "Original texture-backed concept-car configurator with imported car variant controls, turntable, exploded view, and controlled reusable studio staging.",
    threeCategory: "PBR product viewer / configurator",
    reference: "Reference target: Three.js glTF product configurators. Current state: accepted texture-backed single-car A3D product route with imported car material variants, reusable studio staging, and explicit interaction/rendering boundaries.",
    features: ["PBR car product asset", "imported car material variants", "exploded view", "studio lighting", "turntable"],
    systems: ["car hero product", "reusable studio lighting", "imported car variants", "exploded controls", "turntable"],
    interactions: ["car variant", "explode product", "camera preset", "lighting preset", "turntable toggle"],
    proves: ["A3D can load and stage the original texture-backed car-concept GLB with imported material-variant controls, turntable motion, route-side exploded offsets, reusable indoor-studio staging, material diagnostics, and performance instrumentation inside an accepted smooth product-render scope."],
    knownGaps: ["The current hero is the original texture-backed concept-car only; unrelated product props and generated derivative fixtures are outside hero proof.", "The car consumes real imported KHR_materials_variants metadata through the shared authored-layer pipeline where the source asset exposes variants.", "The available @aura3d/controls Picking helper does not expose triangle spatial raycasting for authored GLB renderables, so hotspot-style part picking remains unsupported in this route.", "Exploded behavior remains route-side name-pattern offsets rather than an authored exploded animation timeline."],
    acceptance: ["The original texture-backed car-concept asset is visibly framed as the sole hero product with no no-texture scaffold geometry, watch, shoe, or sunglasses cluttering the shot", "paint, glass, roof/panels, wheels, tires, chrome, interior, dashboard, and emissive details remain legible where present in the source GLB", "car material variant controls visibly affect imported GLB materials", "explode and turntable controls visibly affect imported GLB state", "default screenshots pass direct visual review and measured loop/render work evidence"],
    controls: [
      { key: "explode", label: "Exploded view", kind: "toggle", value: false },
      { key: "carVariant", label: "Car variant", kind: "select", value: "Carmine Candy", options: ["Carmine Candy", "Pearly Swirly", "Torched Graphite"] },
      { key: "focusPart", label: "Hotspot", kind: "select", value: "overview", options: ["overview", "body", "wheels", "interior", "lights"] },
      { key: "lighting", label: "Lighting", kind: "select", value: "studio", options: ["studio", "environment", "inspection"] },
      { key: "turntable", label: "Turntable", kind: "toggle", value: false }
    ]
  },
  {
    id: "robotics-lab",
    title: "Animated glTF / Character / Robot Scene",
    shortTitle: "Robotics Lab",
    difficulty: "Expert",
    visualReview: {
      status: "candidate",
      screenshot: "tests/reports/advanced-examples-gallery/robotics-lab.png",
      notes: "Candidate source route. Generate the exact-source screenshot and runtime report, then record an independent human decision for that artifact before promoting this route to accepted."
    },
    subtitle: "Robot training lab with animated armatures, task zones, monitors, safety lanes, crates, and timeline controls.",
    threeCategory: "Animated glTF / skeletal animation scenes",
    reference: "Reference target: Three.js keyframe/skinning examples. Current state: authored Soldier and Robot Expressive animation candidates plus procedural lab context, accepted through the current visual review and route evidence gates.",
    features: ["multi-part robot animation", "state machine", "path debug", "labels", "timeline"],
    systems: ["robots", "workstations", "monitors", "safety zones", "moving equipment"],
    interactions: ["play/pause", "animation state", "scrub timeline", "entity select", "follow camera"],
    proves: ["A3D can combine animated entities, scene composition, lights, labels, and simulation playback controls."],
    knownGaps: ["Imported skinned-character playback works in this route, while IK solving, retargeting constraints, and full character state-machine parity remain bounded scope.", "The authored training-stage fixture improves composition, but it is not an IK solver or physics-grade robot controller.", "XBot remains available as a fixture but is not active here because Soldier and Robot Expressive carry the reviewed route composition."],
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
      screenshot: "tests/reports/advanced-examples-gallery/physics-playground.png",
      notes: "Candidate source route. Generate the exact-source screenshot and runtime report, then record an independent human decision for that artifact before promoting this route to accepted."
    },
    subtitle: "Robotics manipulation testbed with bins, ramps, conveyors, stacked objects, gripper/pusher, scores, and debug overlays.",
    threeCategory: "Physics / collision playgrounds",
    reference: "Reference target: Three.js Rapier/Ammo physics playgrounds. Current state: bounded A3D PhysicsWorld integration with primitive/proxy colliders, deterministic rigid bodies, conveyor friction, and a kinematic pusher.",
    features: ["rigid-body objects", "conveyor friction", "kinematic pusher", "collision zones", "scenario reset"],
    systems: ["crates", "spheres", "ramps", "conveyors", "bins", "gripper"],
    interactions: ["spawn objects", "drop pile", "gravity", "conveyor speed", "slow motion/debug"],
    proves: ["A3D can drive the gallery testbed from its PhysicsWorld rigid-body/contact APIs while keeping deterministic browser-stable instrumentation."],
    knownGaps: ["Physics is wired through primitive/proxy colliders rather than mesh-derived colliders.", "The pusher is a kinematic collider, not a full articulated robot dynamics stack."],
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
    title: "Atmospheric Fog / Light-Shaft Cinematic Scene",
    shortTitle: "Fog Cathedral",
    difficulty: "Expert",
    visualReview: {
      status: "candidate",
      screenshot: "tests/reports/advanced-examples-gallery/fog-cathedral.png",
      notes: "Candidate source route. Generate the exact-source screenshot and runtime report, then record an independent human decision for that artifact before promoting this route to accepted."
    },
    subtitle: "Sponza-based authored interior with atmospheric depth, light shaft approximations, dust, arches, and camera choreography.",
    threeCategory: "Volumetric fog / god rays / cinematic lighting",
    reference: "Reference target: Three.js fog/light demos. Current state: local authored cathedral plus layered translucent geometry and particles because true volumetric lighting is not native.",
    features: ["authored fog cathedral GLB", "depth haze layers", "soft shaft cards", "batched dust particles", "cinematic camera"],
    systems: ["authored nave", "arched silhouettes", "batched dust", "transparent shaft cards", "fog staging"],
    interactions: ["fog density", "beam toggle", "sun angle", "camera shots", "cinematic pause"],
    proves: ["A3D can support accepted atmospheric composition controls with explicitly bounded volumetric approximations."],
    knownGaps: ["No true volumetric raymarch pass is exposed; light shafts and haze remain local transparent-geometry approximations.", "The active route uses a curated Sponza interior with bounded atmospheric helpers rather than shadowed participating media."],
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
      screenshot: "tests/reports/advanced-examples-gallery/digital-twin.png",
      notes: "Candidate source route. Generate the exact-source screenshot and runtime report, then record an independent human decision for that artifact before promoting this route to accepted."
    },
    subtitle: "Enterprise robotics factory twin with work cells, robots, conveyors, lidar cones, status overlays, heatmap, and timeline.",
    threeCategory: "CAD viewers / robotics dashboards / digital twins",
    reference: "Reference target: advanced Three.js industrial dashboards and CAD/simulation viewers. Current state: deterministic digital-twin scaffold with a dedicated authored factory fixture, not full CAD/telemetry parity.",
    features: ["factory floor", "robot arms", "mobile robots", "sensor overlays", "timeline simulation"],
    systems: ["conveyors", "robot arms", "mobile robot paths", "package flow", "sensor sweeps", "heatmap"],
    interactions: ["inspect robot", "sensor overlay", "safety zones", "heatmap", "simulation speed/camera/zone"],
    proves: ["A3D can power enterprise robotics, CAD, simulation, and operational visualization products."],
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
