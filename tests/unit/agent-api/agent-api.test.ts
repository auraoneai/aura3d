import { describe, expect, test } from "vitest";
import {
  type AuraModelNode,
  type AuraPrimitiveNode,
  camera,
  compilePromptPlan,
  defineAuraAssets,
  definePromptPlan,
  effects,
  lights,
  material,
  model,
  prefabs,
  primitives,
  promptPlanToScene,
  scene,
  timeline,
  ui,
  createAuraApp
} from "../../../packages/engine/src";

const assets = defineAuraAssets({
  robot: {
    type: "model",
    format: "glb",
    url: "/aura-assets/robot.12345678.glb",
    bounds: [1, 2, 1],
    hash: "sha256-test"
  },
  color: {
    type: "texture",
    format: "png",
    url: "/aura-assets/color.12345678.png",
    hash: "sha256-texture"
  }
} as const);

describe("agent API", () => {
  test("builds the five-line typed asset scene", () => {
    const snapshot = scene().add(model(assets.robot)).add(lights.studio()).toJSON();
    expect(snapshot.nodes.map((node) => node.kind)).toEqual(["model", "light"]);
    expect(snapshot.nodes[0]).toMatchObject({ kind: "model", asset: { id: "robot" } });
  });

  test("builds a compact cinematic scene", () => {
    const snapshot = scene()
      .background("#05070d")
      .add(model(assets.robot, { material: material.pbr({ texture: assets.color }) }).position(0, 0, -1).scale(1.1))
      .add(lights.point({ position: [-2, 2.4, 1], color: "#38d6ff", intensity: 2.4 }))
      .add(effects.rain({ intensity: 0.45 }))
      .add(effects.fog({ density: 0.18 }))
      .add(effects.bloom({ intensity: 0.4 }))
      .camera(camera.dolly({ from: [0, 1.4, 6], to: [0, 1.2, 2], seconds: 8 }))
      .timeline(timeline.loop({ seconds: 8 }))
      .toJSON();
    expect(snapshot.camera.mode).toBe("dolly");
    expect(snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "rain")).toBe(true);
  });

  test("supports primitives and interactions for mini games", () => {
    const snapshot = scene()
      .add(primitives.sphere({ name: "player" }).position(0, 0.5, 0))
      .add(lights.studio())
      .camera(camera.follow({ targetNode: "player" }))
      .toJSON();
    expect(snapshot.nodes[0]).toMatchObject({ kind: "primitive", primitive: "sphere" });
    expect(snapshot.camera.mode).toBe("follow");
  });

  test("exposes repair helpers for particles, city, materials, products, physics, charts, games, and characters", () => {
    const snapshot = scene()
      .addMany(prefabs.particleFountain({ count: 1400 }))
      .addMany(prefabs.cityBlock({ blocks: 4 }))
      .addMany(prefabs.materialSwatches())
      .addMany(prefabs.productStage())
      .addMany(prefabs.physicsRamp())
      .addMany(prefabs.physicsPlayground({ cubes: 50 }))
      .addMany(prefabs.solarSystem())
      .addMany(prefabs.dataBars3D({ grid: 6 }))
      .addMany(prefabs.neonTunnel({ rings: 10 }))
      .addMany(prefabs.miniGolfHole())
      .addMany(prefabs.primitiveHumanoid())
      .add(primitives.cylinder({ name: "typed cylinder plinth", material: material.glass() }).animate({ clip: "float", speed: 0.7 }))
      .add(effects.particles({ emitter: "swirl", particleCount: 1500 }))
      .camera(camera.orbit({ distance: 5.2 }))
      .timeline(timeline.loop({ seconds: 6 }))
      .toJSON();

    expect(snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "particles" && node.particleCount === 1400)).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "particles" && node.name === "multicolor particle cloud halo" && node.particleCount === 770)).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name?.includes("city tower"))).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.primitive === "cylinder")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.material?.transmission)).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.material?.clearcoat)).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "rigid physics ramp")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name?.includes("visible rigid body cube 50"))).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "bright collision contact patch")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "glowing labeled sun")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "Earth readable planet label")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "Saturn visible ring")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name?.includes("height-colored data bar 6-6"))).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name?.includes("neon tunnel top segment"))).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "white physics golf ball")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "score counter plinth")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "humanoid head")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "short humanoid neck connector")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "left humanoid eye")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "forward foot planted on path")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "white softbox reflection strip")).toBe(true);
    expect(snapshot.camera.position?.[0]).toBeGreaterThan(0);
  });

  test("particle fountain prefab exposes control, collision, and lifetime color evidence", () => {
    const nodes = prefabs.particleFountain({ count: 2400 });
    const primitiveNames = nodes.flatMap((node) => node.kind === "primitive" ? [node.name ?? ""] : []);
    const particleEffects = nodes.filter((node) => node.kind === "effect" && node.effect === "particles");

    expect(primitiveNames).toEqual(expect.arrayContaining([
      "wide particle collision ground plane",
      "painted particle collision splash ring",
      "visible particle emitter base",
      "emission rate control slider track",
      "emission rate control knob high",
      "hot young particle color swatch",
      "cool old particle color swatch"
    ]));
    expect(particleEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "lifetime colored gravity fountain arcs", emitter: "fountain", particleCount: 2400 }),
      expect.objectContaining({ name: "falling collision sparkle particles", emitter: "fountain", particleCount: 1008 }),
      expect.objectContaining({ name: "multicolor particle cloud halo", emitter: "swirl", particleCount: 1320 })
    ]));
  });

  test("mini golf prefab exposes shot control, contact, score, and follow evidence", () => {
    const nodes = prefabs.miniGolfHole();
    const names = nodes.flatMap((node) => node.kind === "primitive" ? [node.name ?? ""] : []);
    const ball = nodes.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === "white physics golf ball");

    expect(names).toEqual(expect.arrayContaining([
      "flat putting green",
      "single red obstacle",
      "white physics golf ball",
      "ball contact shadow on green",
      "transparent moving ball ghost 1",
      "shot power meter track",
      "click drag control marker",
      "orange obstacle contact flash",
      "rebound path preview after obstacle",
      "score counter stroke digit bar",
      "follow camera target beacon above ball"
    ]));
    expect(ball?.animation?.clip).toBe("roll");
    expect(ball?.interaction?.onClick).toContain("aim and shoot");
  });

  test("keeps primitive humanoid readable as a connected animated walk cycle", () => {
    const nodes = prefabs.primitiveHumanoid();
    const names = nodes.flatMap((node) => node.kind === "primitive" ? [node.name ?? ""] : []);
    const animatedWalkNodes = nodes.filter((node) => node.kind === "primitive" && node.animation?.clip === "walk");
    const primitiveByName = (name: string): AuraPrimitiveNode | undefined =>
      nodes.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === name);
    const head = primitiveByName("humanoid head");
    const neck = primitiveByName("short humanoid neck connector");
    const torso = primitiveByName("connected blue humanoid torso");

    expect(names).toEqual(expect.arrayContaining([
      "painted walking path",
      "humanoid contact shadow",
      "short humanoid neck connector",
      "left humanoid eye",
      "right humanoid eye",
      "humanoid mouth line",
      "left shoulder ball joint",
      "forward knee hinge",
      "translucent previous stride torso ghost",
      "cyan walk motion arrow shaft",
      "cyan walk motion arrow head",
      "forward foot planted on path",
      "back foot pushing off path"
    ]));
    expect(animatedWalkNodes.length).toBeGreaterThanOrEqual(14);
    expect(head?.position?.[1]).toBeLessThan(1.6);
    expect(neck?.position?.[1]).toBeGreaterThan(torso?.position?.[1] ?? 0);
    expect(head?.position?.[1] ?? 0).toBeGreaterThan(neck?.position?.[1] ?? 999);
    expect(nodes.filter((node) => node.kind === "primitive" && node.name?.includes("joint")).length).toBeGreaterThanOrEqual(4);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "cyan body motion trail ribbon")).toBe(true);
    expect(prefabs.primitiveHumanoid({ showJoints: false, motionTrail: false }).some((node) => node.kind === "primitive" && node.name === "left shoulder ball joint")).toBe(false);
    expect(prefabs.primitiveHumanoid({ showJoints: false, motionTrail: false }).some((node) => node.kind === "primitive" && node.name === "cyan body motion trail ribbon")).toBe(false);
  });

  test("builds a six-planet solar-system prefab with orbit paths and attached readable labels", () => {
    const nodes = prefabs.solarSystem();
    const planetNodes = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.includes("labeled orbiting planet") === true);
    const orbitSegments = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.includes("orbit path segment") === true);
    const labelPlinths = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.includes("visible label plinth") === true);
    const readableLabels = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.endsWith("readable planet label") === true);
    const leaderLines = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.includes("attached label leader line") === true);
    const bloom = nodes.find((node) => node.kind === "effect" && node.effect === "bloom");
    const pointLight = nodes.find((node) => node.kind === "light" && node.name === "warm solar key light");

    expect(planetNodes.map((node) => node.name)).toEqual([
      "Mercury labeled orbiting planet",
      "Venus labeled orbiting planet",
      "Earth labeled orbiting planet",
      "Mars labeled orbiting planet",
      "Jupiter labeled orbiting planet",
      "Saturn labeled orbiting planet"
    ]);
    expect(orbitSegments).toHaveLength(144);
    expect(labelPlinths).toHaveLength(6);
    expect(readableLabels.map((node) => node.name)).toEqual([
      "Mercury readable planet label",
      "Venus readable planet label",
      "Earth readable planet label",
      "Mars readable planet label",
      "Jupiter readable planet label",
      "Saturn readable planet label"
    ]);
    expect(leaderLines).toHaveLength(6);
    expect(bloom).toMatchObject({ kind: "effect", effect: "bloom", intensity: 0.72 });
    expect(pointLight).toMatchObject({ kind: "light", light: "point" });
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "transparent golden sun corona")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "Jupiter visible equator band")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "Earth small moon")).toBe(true);
    expect(prefabs.solarSystem({ labels: "none", orbitSegments: 16, starCount: 18 }).filter((node) => node.kind === "primitive" && node.name?.endsWith("readable planet label")).length).toBe(0);
  });

  test("shows physics playground contact and falling-state evidence", () => {
    const nodes = prefabs.physicsPlayground({ cubes: 50 });
    const fallingCubes = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("falling visible rigid body cube") === true);
    const settledCubes = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("settled visible rigid body cube") === true);
    const contactVectors = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("red contact normal vector") === true);

    expect(fallingCubes).toHaveLength(8);
    expect(settledCubes).toHaveLength(42);
    expect(contactVectors).toHaveLength(8);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "gravity direction arrow shaft")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "bright collision contact patch")).toBe(true);
  });

  test("keeps data visualization rich with axes, labels, caps, and trend evidence", () => {
    const nodes = prefabs.dataBars3D({ grid: 6 });
    const bars = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("height-colored data bar") === true);
    const caps = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("bright data bar top cap") === true);
    const footprints = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("soft data bar footprint") === true);
    const trendRibbon = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("floating trend ribbon segment") === true);
    const columnLabels = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("column label chip") === true);
    const rowLabels = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("row label chip") === true);

    expect(bars).toHaveLength(36);
    expect(caps).toHaveLength(36);
    expect(footprints).toHaveLength(36);
    expect(trendRibbon).toHaveLength(5);
    expect(columnLabels).toHaveLength(6);
    expect(rowLabels).toHaveLength(6);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "dark rear chart wall")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "selected metric callout slab")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "height tick 4 back wall line")).toBe(true);
    expect(nodes.some((node) => node.kind === "effect" && node.effect === "bloom")).toBe(true);
  });

  test("keeps neon tunnel cinematic with octagonal rings, reflections, and motion cues", () => {
    const nodes = prefabs.neonTunnel({ rings: 10 });
    const topSegments = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("neon tunnel top segment") === true);
    const diagonalBraces = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.includes("diagonal brace") === true);
    const floorReflections = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("floor reflection streak") === true);
    const speedDashes = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.includes("wall speed dash") === true);
    const sparks = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("floating tunnel spark") === true);

    expect(topSegments).toHaveLength(10);
    expect(diagonalBraces).toHaveLength(40);
    expect(floorReflections).toHaveLength(10);
    expect(speedDashes).toHaveLength(10);
    expect(sparks).toHaveLength(14);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "glossy black neon tunnel floor")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "left vanishing light rail")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "distant portal glow panel")).toBe(true);
    expect(nodes.some((node) => node.kind === "effect" && node.effect === "particles" && node.name === "ambient tunnel dust particles" && node.particleCount === 900)).toBe(true);
    expect(nodes.some((node) => node.kind === "effect" && node.effect === "bloom")).toBe(true);
  });

  test("shows mini-golf scoring, aiming, cup, and follow-camera target cues", () => {
    const nodes = prefabs.miniGolfHole();
    const ball = nodes.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === "white physics golf ball");
    const snapshot = scene()
      .addMany(nodes)
      .camera(camera.follow({ targetNode: "white physics golf ball", distance: 4.2 }))
      .toJSON();

    expect(ball?.animation?.clip).toBe("roll");
    expect(ball?.interaction).toMatchObject({ cursor: "crosshair", onClick: "aim and shoot ball" });
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "ball aim selection ring")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "cup capture ring")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "score counter plinth")).toBe(true);
    expect(snapshot.camera).toMatchObject({ mode: "follow", targetNode: "white physics golf ball" });
  });

  test("keeps material swatches framed in a compact inspection row", () => {
    const nodes = prefabs.materialSwatches();
    const primitiveByName = (name: string): AuraPrimitiveNode | undefined =>
      nodes.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === name);
    const positions = nodes.flatMap((node) =>
      node.kind === "primitive" && node.name?.includes("swatch") && node.primitive === "sphere"
        ? [node.position?.[0] ?? 0]
        : []
    );
    const primitiveBounds = nodes.flatMap((node) => node.kind === "primitive" ? [node.position ?? [0, 0, 0] as const] : []);
    const glass = primitiveByName("transparent cyan glass swatch");
    const clearcoat = primitiveByName("red automotive clearcoat swatch");
    const clearcoatLayer = primitiveByName("transparent clearcoat outer gloss layer");

    expect(positions).toHaveLength(5);
    expect(Math.min(...positions)).toBeGreaterThanOrEqual(-2.8);
    expect(Math.max(...positions)).toBeLessThanOrEqual(2.8);
    expect(Math.min(...primitiveBounds.map((position) => position[0]))).toBeGreaterThanOrEqual(-3.55);
    expect(Math.max(...primitiveBounds.map((position) => position[0]))).toBeLessThanOrEqual(3.55);
    expect(Math.max(...primitiveBounds.map((position) => position[1]))).toBeLessThanOrEqual(2.18);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "black reflection contrast strip")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "cool blue environment reflection panel")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "chrome bright reflection card")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "glass dark contrast card")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "glass refracted white stripe")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "rubber roughness sample strip")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "emissive magenta glow halo")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "red automotive clearcoat swatch")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "clearcoat white topcoat highlight")).toBe(true);
    expect(glass?.material).toMatchObject({ opacity: 0.22, transmission: 1, thickness: 0.9, ior: 1.48 });
    expect(clearcoat?.material).toMatchObject({ clearcoat: 1, roughness: 0.045, clearcoatRoughness: 0.018 });
    expect(clearcoatLayer?.material).toMatchObject({ opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.01 });
  });

  test("uses city-scale cues without per-floor window node explosions", () => {
    const nodes = prefabs.cityBlock({ blocks: 20, litWindows: true });
    const towers = nodes.filter((node) => node.kind === "primitive" && node.name?.startsWith("city tower"));
    const windowColumns = nodes.filter((node) => node.kind === "primitive" && node.name?.includes("window column"));
    const oldWindowBands = nodes.filter((node) => node.kind === "primitive" && node.name?.includes("lit window band"));
    const crosswalkStripes = nodes.filter((node) => node.kind === "primitive" && node.name?.includes("zebra crosswalk"));
    const sidewalks = nodes.filter((node) => node.kind === "primitive" && node.name?.includes("sidewalk slab"));
    const storefronts = nodes.filter((node) => node.kind === "primitive" && node.name?.startsWith("street-level lit storefront"));
    const awnings = nodes.filter((node) => node.kind === "primitive" && node.name?.startsWith("striped storefront awning"));
    const addressPlaques = nodes.filter((node) => node.kind === "primitive" && node.name?.startsWith("street address plaque"));
    const rooftopCaps = nodes.filter((node) => node.kind === "primitive" && node.name?.startsWith("rooftop mechanical cap"));
    const streetLamps = nodes.filter((node) => node.kind === "primitive" && node.name?.startsWith("warm street lamp"));
    const vehicles = nodes.filter((node) => node.kind === "primitive" && node.name?.includes(" car body"));

    expect(towers).toHaveLength(20);
    expect(windowColumns).toHaveLength(80);
    expect(oldWindowBands).toHaveLength(0);
    expect(crosswalkStripes.length).toBeGreaterThanOrEqual(20);
    expect(sidewalks).toHaveLength(4);
    expect(storefronts).toHaveLength(20);
    expect(awnings).toHaveLength(20);
    expect(addressPlaques).toHaveLength(20);
    expect(rooftopCaps).toHaveLength(20);
    expect(streetLamps).toHaveLength(12);
    expect(vehicles).toHaveLength(4);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "zebra crosswalk near stripe 1")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "front cross street")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "back cross street")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "active night state toggle knob")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "foreground day night state board")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "large day sun state marker")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "large night moon state marker")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "foreground active night state bar")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "night streetlight glow proof strip")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "red traffic signal over intersection")).toBe(true);
  });

  test("switches city-block scene markers for day state evidence", () => {
    const nodes = prefabs.cityBlock({ blocks: 20, litWindows: true, timeOfDay: "day" });

    expect(nodes.some((node) => node.kind === "primitive" && node.name === "active day state toggle knob")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "foreground active day state bar")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "large day sun state marker")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "large night moon state marker")).toBe(true);
  });

  test("keeps product stage tight for three-quarter product framing", () => {
    const nodes = prefabs.productStage();

    expect(nodes.some((node) => node.kind === "primitive" && node.name === "front low product highlight card")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "round white product inspection plinth" && Array.isArray(node.scale) && node.scale[0] === 3.7)).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "soft elliptical contact shadow" && node.position?.[1] === 0.535)).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "thin brushed turntable rotation ring" && node.position?.[1] === 0.526 && node.material?.opacity === 0.22)).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "cyan orbit control arc")).toBe(true);
    expect(nodes.filter((node) => node.kind === "primitive" && node.name?.includes("turntable rotation tick")).length).toBe(3);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "fit to bounds centerline guide")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "left normalized asset height bracket")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "right normalized asset height bracket")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "top normalized asset fit bracket")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "left vertical studio softbox")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "right warm rim softbox")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "overhead rectangular softbox reflection")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "rear cool reflection card")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "rear warm reflection card")).toBe(true);
  });

  test("compiles product viewer plans to normalized plinth placement with turntable evidence", () => {
    const plan = definePromptPlan({
      sceneType: "product-viewer",
      subject: { asset: assets.robot, label: "sneaker" },
      style: "premium sneaker product viewer",
      environment: "white turntable plinth and studio sweep",
      camera: { preset: "product-orbit" },
      lighting: { preset: "studio-softbox" },
      effects: ["bloom"],
      interaction: "orbit",
      acceptanceCriteria: [
        "sneaker sits on the plinth",
        "studio softboxes and contact shadow are visible",
        "turntable rotation evidence is visible"
      ]
    } as const);
    const snapshot = promptPlanToScene(plan).toJSON();
    const productModel = snapshot.nodes.find((node): node is AuraModelNode => node.kind === "model" && node.asset.id === "robot");

    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "round white product inspection plinth")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "soft elliptical contact shadow")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "thin brushed turntable rotation ring")).toBe(true);
    expect(productModel).toMatchObject({
      position: [0, 0.54, -0.65],
      rotation: [0, -0.38, 0],
      animation: { clip: "turntable", speed: 0.42 }
    });
    expect(productModel?.scale).toBeUndefined();
    expect(snapshot.camera).toMatchObject({
      mode: "perspective",
      position: [1.65, 1.18, 4.0],
      target: [0, 0.72, -0.65],
      fov: 38
    });
  });

  test("exposes typed UI helpers for benchmark HUDs", () => {
    expect(ui).toMatchObject({
      html: expect.any(Function),
      setText: expect.any(Function),
      setPressed: expect.any(Function),
      onClick: expect.any(Function)
    });
  });

  test("mounts UI markup inside the target by default", () => {
    const calls: Array<[InsertPosition, string]> = [];
    const element = {
      insertAdjacentHTML(position: InsertPosition, markup: string) {
        calls.push([position, markup]);
      }
    } as HTMLElement;

    ui.html(element, `<div id="scene"></div>`);

    expect(calls).toEqual([["beforeend", `<div id="scene"></div>`]]);
  });

  test("accepts nullable DOM query targets at the public type boundary", () => {
    expect(() => createAuraApp(null, { scene: scene() })).toThrow(/target was null or undefined/);
  });

  test("compiles prompt plans into approved visual recipes", () => {
    const plan = definePromptPlan({
      sceneType: "cinematic-scene",
      subject: { asset: assets.robot, label: "robot hero" },
      style: "rainy neon alley",
      camera: { preset: "cinematic-dolly" },
      lighting: { preset: "neon-practicals" },
      effects: ["rain", "fog", "bloom", "wet-reflection"],
      interaction: "orbit",
      acceptanceCriteria: ["hero asset visible", "rain visible", "wet floor visible"]
    } as const);
    const compiled = compilePromptPlan(plan);
    const snapshot = promptPlanToScene(plan).toJSON();

    expect(compiled.report).toMatchObject({
      schema: "aura3d-prompt-plan-report/1.0",
      sceneType: "cinematic-scene",
      subjectAssetId: "robot",
      cameraPreset: "cinematic-dolly",
      lightingPreset: "neon-practicals"
    });
    expect(compiled.report.visualSystems).toContain("cinematic-scene recipe");
    expect(compiled.report.repairHints.length).toBeGreaterThan(3);
    expect(compiled.report.repairHints.join(" ")).toContain("cinematic");
    expect(snapshot.camera.mode).toBe("dolly");
    expect(snapshot.nodes.some((node) => node.kind === "model" && node.asset.id === "robot")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "rain")).toBe(true);
    expect(snapshot.nodes.filter((node) => node.kind === "primitive").length).toBeGreaterThan(4);
  });

  test("warns when prompt plans omit minimum visual information", () => {
    const vaguePlan = definePromptPlan({
      sceneType: "product-viewer",
      subject: { asset: assets.robot },
      acceptanceCriteria: []
    } as const);
    const compiled = compilePromptPlan(vaguePlan);

    expect(compiled.report.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("subject is missing"),
      expect.stringContaining("style is missing"),
      expect.stringContaining("environment is missing"),
      expect.stringContaining("camera preset is missing"),
      expect.stringContaining("lighting preset is missing"),
      expect.stringContaining("effects are missing"),
      expect.stringContaining("interaction is missing"),
      expect.stringContaining("at least three concrete screenshot acceptance criteria"),
      expect.stringContaining("negative criteria are missing")
    ]));
    expect(compiled.report.cameraPreset).toBe("product-orbit");
    expect(compiled.report.lightingPreset).toBe("studio-softbox");
    expect(compiled.scene.toJSON().nodes.some((node) => node.kind === "model" && node.asset.id === "robot")).toBe(true);
  });
});

if (false) {
  // @ts-expect-error The safe API requires typed AuraAssetRef values.
  model("robot");
  // @ts-expect-error Prompt plans must use typed AuraAssetRef values for subject assets.
  definePromptPlan({ sceneType: "product-viewer", subject: { asset: "robot" }, acceptanceCriteria: [] });
  // @ts-expect-error Unknown generated asset ids fail at compile time.
  assets.madeUpRobot;
  // @ts-expect-error Invalid option shapes fail at compile time.
  camera.orbit({ distance: "near" });
}
