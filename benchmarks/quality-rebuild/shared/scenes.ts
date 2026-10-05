/**
 * The single source of truth for every benchmark scene.
 *
 * Both engine implementations (`../aura3d/*.ts`, `../three/*.ts`) translate the
 * same SceneSpec object; neither side may add objects, lights, or tuning that
 * is not described here. Where an engine cannot express a field, it renders
 * without it and records the gap in its capability log.
 */
import { cityBuildings, instancingGrid } from "./procedural";
import {
  RESOLUTION,
  type LightSpec,
  type MaterialSpec,
  type ObjectSpec,
  type PrimitiveObjectSpec,
  type SceneSpec,
  type ShadowSpec,
  type Vec3
} from "./types";

const CAPTURE_TIME = 1.25;
const SETTLE_FRAMES = 4;

const groundMaterial: MaterialSpec = { color: "#7a7d80", roughness: 0.9, metalness: 0 };

function primitive(
  name: string,
  shape: PrimitiveObjectSpec["shape"],
  size: Vec3,
  position: Vec3,
  material: MaterialSpec,
  extra: Partial<Pick<PrimitiveObjectSpec, "rotation" | "scale" | "castShadow" | "receiveShadow">> = {}
): PrimitiveObjectSpec {
  return {
    kind: "primitive",
    name,
    shape,
    size,
    position,
    material,
    castShadow: extra.castShadow ?? shape !== "plane",
    receiveShadow: extra.receiveShadow ?? true,
    ...(extra.rotation ? { rotation: extra.rotation } : {}),
    ...(extra.scale !== undefined ? { scale: extra.scale } : {})
  };
}

function ground(size: number, material: MaterialSpec = groundMaterial, y = 0): PrimitiveObjectSpec {
  return primitive("ground plane", "plane", [size, 1, size], [0, y, 0], material, { castShadow: false });
}

const defaultShadows = (extent: number): ShadowSpec => ({
  mapSize: 2048,
  type: "pcf-soft",
  directionalExtent: extent,
  bias: -0.0005,
  normalBias: 0.02
});

function sun(intensity: number, position: Vec3, castShadow: boolean, color = "#fff4e5"): LightSpec {
  return { kind: "directional", name: "sun", color, intensity, position, target: [0, 0, 0], castShadow };
}

function base(id: string, index: number, title: string, purpose: string): Pick<SceneSpec, "id" | "index" | "title" | "purpose" | "resolution" | "toneMapping" | "exposure" | "time" | "settleFrames"> {
  return { id, index, title, purpose, resolution: RESOLUTION, toneMapping: "aces-filmic", exposure: 1, time: CAPTURE_TIME, settleFrames: SETTLE_FRAMES };
}

// --- 06: roughness sweep -----------------------------------------------------
const sweepObjects: ObjectSpec[] = [];
for (let column = 0; column < 6; column += 1) {
  const roughness = column / 5;
  const x = -2.5 + column;
  sweepObjects.push(primitive(`metal sphere r${roughness.toFixed(1)}`, "sphere", [0.8, 0.8, 0.8], [x, 1.5, 0], { color: "#d9d9d9", roughness, metalness: 1 }));
  sweepObjects.push(primitive(`dielectric sphere r${roughness.toFixed(1)}`, "sphere", [0.8, 0.8, 0.8], [x, 0.5, 0], { color: "#b03a2e", roughness, metalness: 0 }));
}

// --- 11: colored point lights ------------------------------------------------
const ringLights: LightSpec[] = [];
const ringMarkers: ObjectSpec[] = [];
const ringColors = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be", "#30b0ff", "#5856d6", "#af52de", "#ff2d55", "#ffffff"];
for (const [index, color] of ringColors.entries()) {
  const angle = (index / ringColors.length) * Math.PI * 2;
  const position: Vec3 = [Math.cos(angle) * 3, 0.8, Math.sin(angle) * 3];
  ringLights.push({ kind: "point", name: `ring light ${index}`, color, intensity: 6, position, range: 0 });
  ringMarkers.push(primitive(`light marker ${index}`, "sphere", [0.12, 0.12, 0.12], position, { color: "#000000", roughness: 1, metalness: 0, emissive: color, emissiveIntensity: 3 }, { castShadow: false, receiveShadow: false }));
}

// --- 16: instancing ------------------------------------------------------------
const grid = instancingGrid(10_000, 1616);

// --- 17: city -----------------------------------------------------------------
const city = cityBuildings(8, 3, 1717).map((building, index) =>
  primitive(`city building ${index}`, "box", building.size, building.position, { color: building.color, roughness: 0.82, metalness: 0.05 })
);

// --- 09: trees -----------------------------------------------------------------
const treeSpots: readonly Vec3[] = [[-7, 0, -6], [-4, 0, -12], [5, 0, -9], [8, 0, -3], [-9, 0, 1], [2, 0, -16]];
const trees: ObjectSpec[] = treeSpots.flatMap(([x, , z], index) => [
  primitive(`tree trunk ${index}`, "cylinder", [0.35, 2.2, 0.35], [x, 1.1, z], { color: "#6b4a2f", roughness: 0.9, metalness: 0 }),
  primitive(`tree canopy ${index}`, "sphere", [2.2, 2.4, 2.2], [x, 3.1, z], { color: "#3f6b2e", roughness: 0.85, metalness: 0 })
]);

export const sceneSpecs = {
  "01-simple-geometry": {
    ...base("01-simple-geometry", 1, "Simple geometry", "Primitives, one directional + ambient, shadow"),
    camera: { position: [0, 2.4, 6], target: [0, 0.5, 0], fov: 45, near: 0.1, far: 100 },
    background: { kind: "color", color: "#1d2129" },
    lights: [
      { kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.4 },
      sun(3, [4, 7, 3], true)
    ],
    objects: [
      ground(12),
      primitive("red box", "box", [1, 1, 1], [-1.6, 0.5, 0], { color: "#c0392b", roughness: 0.45, metalness: 0 }, { rotation: [0, 0.6, 0] }),
      primitive("green sphere", "sphere", [1, 1, 1], [0, 0.5, 0], { color: "#27ae60", roughness: 0.3, metalness: 0 }),
      primitive("blue cylinder", "cylinder", [0.8, 1.2, 0.8], [1.6, 0.6, 0], { color: "#2e86de", roughness: 0.5, metalness: 0 })
    ],
    shadows: defaultShadows(6)
  },
  "02-pbr-product": {
    ...base("02-pbr-product", 2, "PBR product model", "Textured metal/rough GLB on a plinth, studio HDRI + key light"),
    camera: { position: [2.2, 1.6, 3.0], target: [0, 0.9, 0], fov: 35, near: 0.05, far: 50 },
    background: { kind: "color", color: "#2a2d33" },
    environment: { hdri: "studioSmall08", intensity: 1, rotation: 0 },
    lights: [sun(2, [3, 5, 2], true, "#ffffff")],
    objects: [
      ground(8, { color: "#55585e", roughness: 0.85, metalness: 0 }, -0.1),
      primitive("plinth", "cylinder", [1.6, 0.1, 1.6], [0, -0.05, 0], { color: "#d9d9d6", roughness: 0.4, metalness: 0 }),
      { kind: "model", name: "antique camera", asset: "antiqueCamera", position: [0, 0, 0], rotation: [0, -0.5, 0], scale: 0.25, castShadow: true, receiveShadow: true }
    ],
    shadows: defaultShadows(3)
  },
  "03-damaged-helmet": {
    ...base("03-damaged-helmet", 3, "DamagedHelmet", "Complex PBR (normal/ORM/emissive) lit only by HDRI"),
    camera: { position: [-1.8, 0.6, 2.7], target: [0, 0, 0], fov: 45, near: 0.05, far: 50 },
    background: { kind: "color", color: "#1a1d22" },
    environment: { hdri: "studioSmall08", intensity: 1, rotation: 0 },
    lights: [],
    objects: [{ kind: "model", name: "damaged helmet", asset: "damagedHelmet", position: [0, 0, 0], castShadow: false, receiveShadow: false }]
  },
  "04-clearcoat": {
    ...base("04-clearcoat", 4, "Clearcoat", "KHR_materials_clearcoat test grid"),
    camera: { position: [-2.13, 0.3, 17], target: [-2.13, 0.3, 0], fov: 45, near: 0.1, far: 100 },
    background: { kind: "color", color: "#303338" },
    environment: { hdri: "studioSmall08", intensity: 1, rotation: 0 },
    lights: [{ kind: "directional", name: "key", color: "#ffffff", intensity: 1.5, position: [5, 8, 10], target: [-2.13, 0.3, 0], castShadow: false }],
    objects: [{ kind: "model", name: "clearcoat test", asset: "clearCoatTest", position: [0, 0, 0], castShadow: false, receiveShadow: false }]
  },
  "05-transmission": {
    ...base("05-transmission", 5, "Transmission / glass", "KHR_materials_transmission spheres over a checker"),
    camera: { position: [0, 0.4, 3.4], target: [0, 0, -0.15], fov: 40, near: 0.05, far: 50 },
    background: { kind: "color", color: "#3a3f47" },
    environment: { hdri: "studioSmall08", intensity: 1, rotation: 0 },
    lights: [{ kind: "directional", name: "key", color: "#ffffff", intensity: 1.5, position: [2, 4, 3], target: [0, 0, 0], castShadow: false }],
    objects: [{ kind: "model", name: "compare transmission", asset: "compareTransmission", position: [0, 0, 0], castShadow: false, receiveShadow: false }]
  },
  "06-metal-roughness-sweep": {
    ...base("06-metal-roughness-sweep", 6, "Metallic roughness sweep", "Metal (top) and dielectric (bottom) spheres, roughness 0..1"),
    camera: { position: [0, 1, 6.2], target: [0, 1, 0], fov: 40, near: 0.1, far: 50 },
    background: { kind: "color", color: "#24272d" },
    environment: { hdri: "studioSmall08", intensity: 1, rotation: 0 },
    lights: [{ kind: "directional", name: "key", color: "#ffffff", intensity: 1, position: [3, 4, 5], target: [0, 1, 0], castShadow: false }],
    objects: sweepObjects
  },
  "07-sheen-fabric": {
    ...base("07-sheen-fabric", 7, "Fabric / sheen", "KHR_materials_sheen color x roughness grid"),
    camera: { position: [-0.18, 0, 1.25], target: [-0.18, 0, 0], fov: 40, near: 0.01, far: 20 },
    background: { kind: "color", color: "#2b2e33" },
    environment: { hdri: "studioSmall08", intensity: 1, rotation: 0 },
    lights: [{ kind: "directional", name: "key", color: "#ffffff", intensity: 1.5, position: [1, 2, 3], target: [-0.18, 0, 0], castShadow: false }],
    objects: [{ kind: "model", name: "sheen test grid", asset: "sheenTestGrid", position: [0, 0, 0], castShadow: false, receiveShadow: false }]
  },
  "08-skinned-character": {
    ...base("08-skinned-character", 8, "Skin / character", "Skinned humanoid in bind pose, key light + HDRI fill, shadow"),
    camera: { position: [0.6, 1.0, 2.6], target: [0, 0.8, 0], fov: 40, near: 0.05, far: 50 },
    background: { kind: "color", color: "#202329" },
    environment: { hdri: "studioSmall08", intensity: 0.6, rotation: 0 },
    lights: [sun(2.5, [2, 4, 3], true, "#fff2e0")],
    objects: [
      ground(6, { color: "#6d7076", roughness: 0.9, metalness: 0 }),
      { kind: "model", name: "cesium man", asset: "cesiumMan", position: [0, 0, 0], castShadow: true, receiveShadow: true }
    ],
    shadows: defaultShadows(2.5)
  },
  "09-outdoor-environment": {
    ...base("09-outdoor-environment", 9, "Outdoor environment", "Ground, rocks, crates, trees, sun shadow, sky HDRI background + IBL, fog"),
    camera: { position: [0, 2.2, 14], target: [0, 1.2, 0], fov: 50, near: 0.1, far: 200 },
    background: { kind: "hdri", hdri: "autumnFieldPuresky", intensity: 1, fallbackColor: "#9fb8d0" },
    environment: { hdri: "autumnFieldPuresky", intensity: 1, rotation: 0 },
    lights: [sun(4, [-12, 18, 8], true, "#fff1d6")],
    objects: [
      ground(80, { color: "#6b7a4a", roughness: 0.95, metalness: 0 }),
      { kind: "model", name: "rock large", asset: "rockB", position: [-3, 0.5, -2], rotation: [0, 0.4, 0], scale: 0.5, castShadow: true, receiveShadow: true },
      { kind: "model", name: "rock small", asset: "rockA", position: [3.5, 0, 1], rotation: [0, 1.2, 0], scale: 6, castShadow: true, receiveShadow: true },
      { kind: "model", name: "crate a", asset: "crate", position: [1.2, 0, 3], rotation: [0, 0.3, 0], castShadow: true, receiveShadow: true },
      { kind: "model", name: "crate b", asset: "crate", position: [2.3, 0, 3.4], rotation: [0, -0.2, 0], castShadow: true, receiveShadow: true },
      { kind: "model", name: "crate c", asset: "crate", position: [1.7, 1, 3.2], rotation: [0, 0.9, 0], castShadow: true, receiveShadow: true },
      ...trees
    ],
    shadows: defaultShadows(20),
    fog: { color: "#b8c6d4", density: 0.02 }
  },
  "10-indoor-environment": {
    ...base("10-indoor-environment", 10, "Indoor environment", "Closed room, 3 ceiling point lights + 2 spot lights, spot shadow"),
    camera: { position: [0, 1.6, 3.8], target: [0, 1.1, -2], fov: 60, near: 0.05, far: 50 },
    background: { kind: "color", color: "#000000" },
    lights: [
      { kind: "ambient", name: "ambient bounce", color: "#ffe9d0", intensity: 0.08 },
      { kind: "point", name: "ceiling left", color: "#ffd2a1", intensity: 8, position: [-3, 2.7, -1], range: 0 },
      { kind: "point", name: "ceiling center", color: "#ffd2a1", intensity: 8, position: [0, 2.7, -1], range: 0 },
      { kind: "point", name: "ceiling right", color: "#ffd2a1", intensity: 8, position: [3, 2.7, -1], range: 0 },
      { kind: "spot", name: "spot art", color: "#ffffff", intensity: 30, position: [-2, 2.9, 1], target: [-2, 1.2, -3.9], angle: 0.5, penumbra: 0.4, range: 0, castShadow: false },
      { kind: "spot", name: "spot table", color: "#fff4e0", intensity: 30, position: [2, 2.9, 1], target: [2, 0.75, -1], angle: 0.5, penumbra: 0.4, range: 0, castShadow: true }
    ],
    objects: [
      primitive("floor", "box", [10, 0.2, 8], [0, -0.1, 0], { color: "#8a6a4a", roughness: 0.6, metalness: 0 }, { castShadow: false }),
      primitive("ceiling", "box", [10, 0.2, 8], [0, 3.1, 0], { color: "#e8e4dc", roughness: 0.9, metalness: 0 }, { castShadow: false }),
      primitive("back wall", "box", [10, 3, 0.2], [0, 1.5, -4.1], { color: "#cfc7b8", roughness: 0.9, metalness: 0 }, { castShadow: false }),
      primitive("left wall", "box", [0.2, 3, 8], [-5.1, 1.5, 0], { color: "#b9c4c9", roughness: 0.9, metalness: 0 }, { castShadow: false }),
      primitive("right wall", "box", [0.2, 3, 8], [5.1, 1.5, 0], { color: "#b9c4c9", roughness: 0.9, metalness: 0 }, { castShadow: false }),
      primitive("art panel", "box", [1.6, 1.0, 0.05], [-2, 1.6, -3.97], { color: "#2d5f8b", roughness: 0.5, metalness: 0 }),
      primitive("table top", "box", [2, 0.08, 1], [2, 0.75, -1], { color: "#5a3b22", roughness: 0.45, metalness: 0 }),
      primitive("table leg 0", "cylinder", [0.08, 0.71, 0.08], [1.1, 0.355, -1.4], { color: "#2b2b2b", roughness: 0.4, metalness: 0.8 }),
      primitive("table leg 1", "cylinder", [0.08, 0.71, 0.08], [2.9, 0.355, -1.4], { color: "#2b2b2b", roughness: 0.4, metalness: 0.8 }),
      primitive("table leg 2", "cylinder", [0.08, 0.71, 0.08], [1.1, 0.355, -0.6], { color: "#2b2b2b", roughness: 0.4, metalness: 0.8 }),
      primitive("table leg 3", "cylinder", [0.08, 0.71, 0.08], [2.9, 0.355, -0.6], { color: "#2b2b2b", roughness: 0.4, metalness: 0.8 }),
      primitive("vase", "cylinder", [0.25, 0.4, 0.25], [2.3, 0.99, -1.1], { color: "#e9e4d8", roughness: 0.2, metalness: 0 }),
      primitive("sofa base", "box", [2.4, 0.45, 0.9], [-2.4, 0.225, -2.6], { color: "#7b3f3f", roughness: 0.95, metalness: 0, sheen: 0.6, sheenColor: "#ffd0d0", sheenRoughness: 0.6 }),
      primitive("sofa back", "box", [2.4, 0.6, 0.2], [-2.4, 0.75, -3.0], { color: "#7b3f3f", roughness: 0.95, metalness: 0, sheen: 0.6, sheenColor: "#ffd0d0", sheenRoughness: 0.6 }),
      primitive("rug", "box", [3, 0.01, 2], [0, 0.005, -1.5], { color: "#3b4a6b", roughness: 1, metalness: 0 }, { castShadow: false }),
      primitive("ball", "sphere", [0.4, 0.4, 0.4], [0.3, 0.2, -0.5], { color: "#f2f2f2", roughness: 0.2, metalness: 0 })
    ],
    shadows: defaultShadows(5)
  },
  "11-multiple-lights": {
    ...base("11-multiple-lights", 11, "Multiple lights", "10 colored point lights around glossy subjects"),
    camera: { position: [0, 4.5, 7.5], target: [0, 0.4, 0], fov: 45, near: 0.1, far: 100 },
    background: { kind: "color", color: "#08090c" },
    lights: [{ kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.03 }, ...ringLights],
    objects: [
      ground(16, { color: "#3a3a3a", roughness: 0.35, metalness: 0 }),
      primitive("center sphere", "sphere", [1.2, 1.2, 1.2], [0, 0.6, 0], { color: "#ffffff", roughness: 0.4, metalness: 0 }),
      primitive("metal box", "box", [0.8, 0.8, 0.8], [-1.4, 0.4, 0.6], { color: "#c8c8c8", roughness: 0.25, metalness: 1 }, { rotation: [0, 0.7, 0] }),
      primitive("matte cylinder", "cylinder", [0.7, 1.4, 0.7], [1.3, 0.7, -0.6], { color: "#d8d8d8", roughness: 0.8, metalness: 0 }),
      ...ringMarkers
    ]
  },
  "12-shadows": {
    ...base("12-shadows", 12, "Shadows", "Directional + spot shadow casters, contact and detached shadows"),
    camera: { position: [0, 4.2, 7.2], target: [0, 0.4, 0], fov: 45, near: 0.1, far: 100 },
    background: { kind: "color", color: "#1b1e24" },
    lights: [
      { kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.15 },
      sun(3, [5, 8, 4], true, "#ffffff"),
      { kind: "spot", name: "spot", color: "#ffe0b0", intensity: 60, position: [-4, 5, 3], target: [0, 0, 0], angle: 0.5, penumbra: 0.3, range: 20, castShadow: true }
    ],
    objects: [
      ground(14, { color: "#c8c8c8", roughness: 0.8, metalness: 0 }),
      primitive("tall box", "box", [0.8, 2, 0.8], [-1.5, 1, 0], { color: "#9aa5b1", roughness: 0.6, metalness: 0 }),
      primitive("contact sphere", "sphere", [1, 1, 1], [0, 0.5, 0.8], { color: "#e0e0e0", roughness: 0.5, metalness: 0 }),
      primitive("cylinder", "cylinder", [0.7, 1.2, 0.7], [1.6, 0.6, -0.4], { color: "#b58b5a", roughness: 0.6, metalness: 0 }),
      primitive("small cube", "box", [0.5, 0.5, 0.5], [0.9, 0.25, 1.6], { color: "#6c8f6c", roughness: 0.6, metalness: 0 }, { rotation: [0, 0.8, 0] }),
      primitive("floating shelf", "box", [1.2, 0.1, 1.2], [-0.2, 1.6, -1.4], { color: "#7a6a8a", roughness: 0.6, metalness: 0 })
    ],
    shadows: defaultShadows(7)
  },
  "13-ibl-only": {
    ...base("13-ibl-only", 13, "IBL only", "No punctual lights; sky HDRI background + IBL on chrome, gold, plastic"),
    camera: { position: [0, 1.2, 4.5], target: [0, 0.6, 0], fov: 45, near: 0.1, far: 100 },
    background: { kind: "hdri", hdri: "kloppenheim06Puresky", intensity: 1, fallbackColor: "#8fb3d9" },
    environment: { hdri: "kloppenheim06Puresky", intensity: 1, rotation: 0 },
    lights: [],
    objects: [
      ground(10, { color: "#8a8a8a", roughness: 0.7, metalness: 0 }),
      primitive("chrome sphere", "sphere", [1, 1, 1], [-1.3, 0.5, 0], { color: "#ffffff", roughness: 0.05, metalness: 1 }),
      primitive("gold sphere", "sphere", [1, 1, 1], [0, 0.5, 0], { color: "#e1b45a", roughness: 0.45, metalness: 1 }),
      primitive("plastic sphere", "sphere", [1, 1, 1], [1.3, 0.5, 0], { color: "#f2f2f2", roughness: 0.35, metalness: 0 })
    ]
  },
  "14-particles": {
    ...base("14-particles", 14, "Particles", "2000 additive sprites in a fountain-shaped volume"),
    camera: { position: [0, 1.4, 4.6], target: [0, 1.1, 0], fov: 45, near: 0.05, far: 50 },
    background: { kind: "color", color: "#05060a" },
    lights: [{ kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.05 }],
    objects: [
      ground(8, { color: "#15171c", roughness: 0.9, metalness: 0 }),
      { kind: "particles", name: "fountain particles", count: 2000, seed: 1414, center: [0, 0, 0], radius: 1.2, height: 2.4, color: "#ff9a3c", size: 0.06, blending: "additive" }
    ]
  },
  "15-animation-skinning": {
    ...base("15-animation-skinning", 15, "Animation / skinning", "Soldier Walk + Fox Walk sampled at t=1.25s"),
    camera: { position: [3.8, 1.2, -0.4], target: [0, 0.75, -0.4], fov: 40, near: 0.05, far: 50 },
    background: { kind: "color", color: "#22262d" },
    environment: { hdri: "studioSmall08", intensity: 0.6, rotation: 0 },
    lights: [sun(2.5, [3, 5, 2], true, "#fff2e0")],
    objects: [
      ground(10, { color: "#6d7076", roughness: 0.9, metalness: 0 }),
      { kind: "model", name: "soldier walking", asset: "soldier", position: [0, 0, 1.0], castShadow: true, receiveShadow: true, animation: { clip: "Walk", time: CAPTURE_TIME } },
      { kind: "model", name: "fox walking", asset: "fox", position: [0, 0, -1.5], scale: 0.01, castShadow: true, receiveShadow: true, animation: { clip: "Walk", time: CAPTURE_TIME } }
    ],
    shadows: defaultShadows(4)
  },
  "16-instancing": {
    ...base("16-instancing", 16, "Instancing", "10,000 instanced boxes with per-instance color"),
    camera: { position: [0, 14, 26], target: [0, 0, 0], fov: 45, near: 0.1, far: 200 },
    background: { kind: "color", color: "#1a1e24" },
    lights: [
      { kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.3 },
      sun(2.5, [10, 20, 8], false)
    ],
    objects: [
      ground(50, { color: "#2c3036", roughness: 0.9, metalness: 0 }),
      {
        kind: "instanced",
        name: "instanced boxes",
        shape: "box",
        size: [0.3, 0.3, 0.3],
        material: { color: "#ffffff", roughness: 0.5, metalness: 0 },
        transforms: grid.transforms,
        colors: grid.colors,
        castShadow: false,
        receiveShadow: true
      }
    ]
  },
  "17-large-environment": {
    ...base("17-large-environment", 17, "Large environment", "576 separate building meshes, CSM sun shadows, fog"),
    camera: { position: [-38, 22, 38], target: [0, 2, 0], fov: 50, near: 0.5, far: 400 },
    background: { kind: "color", color: "#9fb6cc" },
    environment: { hdri: "autumnFieldPuresky", intensity: 0.6, rotation: 0 },
    lights: [sun(3.5, [-40, 60, 30], true)],
    objects: [ground(90, { color: "#3d4043", roughness: 0.92, metalness: 0 }), ...city],
    shadows: defaultShadows(50),
    csm: { cascades: 4, maxFar: 120, mode: "practical" },
    fog: { color: "#a8bccf", density: 0.008 }
  },
  "18-game-scene": {
    ...base("18-game-scene", 18, "Game scene", "Third-person character, props, pickups, shadows, bloom, fog"),
    camera: { position: [1.2, 2.4, 4.2], target: [0, 1.2, -3], fov: 55, near: 0.1, far: 200 },
    background: { kind: "color", color: "#8fa3b8" },
    environment: { hdri: "autumnFieldPuresky", intensity: 0.7, rotation: 0 },
    lights: [sun(3, [-6, 10, 4], true, "#fff1d6")],
    objects: [
      ground(60, { color: "#5d6b45", roughness: 0.95, metalness: 0 }),
      { kind: "model", name: "player soldier", asset: "soldier", position: [0, 0, 0], castShadow: true, receiveShadow: true, animation: { clip: "Idle", time: CAPTURE_TIME } },
      { kind: "model", name: "crate left", asset: "crate", position: [-1.8, 0, -3], castShadow: true, receiveShadow: true },
      { kind: "model", name: "crate left stacked", asset: "crate", position: [-1.8, 1, -3], rotation: [0, 0.5, 0], castShadow: true, receiveShadow: true },
      { kind: "model", name: "crate right", asset: "crate", position: [2.2, 0, -5], rotation: [0, -0.3, 0], castShadow: true, receiveShadow: true },
      { kind: "model", name: "boulder near", asset: "rockB", position: [3, 0.4, -9], scale: 0.4, castShadow: true, receiveShadow: true },
      { kind: "model", name: "boulder far", asset: "rockB", position: [-4, 0.4, -12], rotation: [0, 2, 0], scale: 0.5, castShadow: true, receiveShadow: true },
      { kind: "model", name: "rock small", asset: "rockA", position: [1.5, 0, -2.5], scale: 4, castShadow: true, receiveShadow: true },
      primitive("pillar left", "cylinder", [0.6, 3, 0.6], [-3, 1.5, -7], { color: "#9c9a92", roughness: 0.8, metalness: 0 }),
      primitive("pillar right", "cylinder", [0.6, 3, 0.6], [3.2, 1.5, -13], { color: "#9c9a92", roughness: 0.8, metalness: 0 }),
      primitive("pickup 0", "sphere", [0.35, 0.35, 0.35], [0.6, 0.6, -4], { color: "#062a33", roughness: 0.3, metalness: 0, emissive: "#36e0ff", emissiveIntensity: 4 }, { castShadow: false }),
      primitive("pickup 1", "sphere", [0.35, 0.35, 0.35], [-0.8, 0.6, -7], { color: "#062a33", roughness: 0.3, metalness: 0, emissive: "#36e0ff", emissiveIntensity: 4 }, { castShadow: false }),
      primitive("pickup 2", "sphere", [0.35, 0.35, 0.35], [1.4, 0.6, -10], { color: "#062a33", roughness: 0.3, metalness: 0, emissive: "#36e0ff", emissiveIntensity: 4 }, { castShadow: false })
    ],
    shadows: defaultShadows(14),
    bloom: { strength: 0.7, radius: 0.4, threshold: 0.85 },
    fog: { color: "#8fa3b8", density: 0.03 }
  }
} as const satisfies Record<string, SceneSpec>;

export type SceneId = keyof typeof sceneSpecs;

export const sceneIds = Object.keys(sceneSpecs) as SceneId[];

export function getSceneSpec(id: string): SceneSpec {
  const spec = (sceneSpecs as Record<string, SceneSpec>)[id];
  if (!spec) throw new Error(`Unknown quality-rebuild scene "${id}". Known: ${sceneIds.join(", ")}`);
  return spec;
}
