/**
 * Lane prd02 scene specs (PRD-02 §16.1). The `prd02-NN-*` entries are copies of
 * the base scenes named in the PRD, derived by spreading the shared specs and
 * overriding only the C-30 fields — so flag-off pixels match the base scenes.
 * The `prd02-*` fixture entries are PRD 02-authored scenes for features the
 * shared spec base cannot express (caster variants, CSM shimmer, probes,
 * contact shadows, area lights, SSR). Every spec is rendered by the shared
 * translators (`aura3d/common.ts`, `three/common.ts`); neither side tunes.
 */
import { createRng } from "../../shared/procedural";
import { sceneSpecs } from "../../shared/scenes";
import {
  RESOLUTION,
  type LightSpec,
  type ObjectSpec,
  type PrimitiveObjectSpec,
  type SceneSpec,
  type ShadowSpec,
  type Vec3
} from "../../shared/types";

const CAPTURE_TIME = 1.25;
const SETTLE_FRAMES = 4;

const groundMaterial = { color: "#7a7d80", roughness: 0.9, metalness: 0 } as const;

function primitive(
  name: string,
  shape: PrimitiveObjectSpec["shape"],
  size: Vec3,
  position: Vec3,
  material: PrimitiveObjectSpec["material"],
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

function ground(size: number, material: PrimitiveObjectSpec["material"] = groundMaterial, y = 0): PrimitiveObjectSpec {
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

function laneSpec(
  base: SceneSpec,
  id: string,
  extras: Pick<SceneSpec, "primaryCriterion" | "primaryRegion" | "masks"> &
    Partial<Pick<SceneSpec, "brokenControls" | "strip" | "dprs" | "purpose" | "objects" | "lights" | "shadows" | "csm">>
): SceneSpec {
  return {
    ...base,
    id,
    owner: "prd02",
    referenceProfile: "contract",
    qrFlags: ["lighting"],
    dprs: [1],
    ...(extras.purpose !== undefined ? { purpose: extras.purpose } : {}),
    ...(extras.objects !== undefined ? { objects: extras.objects } : {}),
    ...(extras.lights !== undefined ? { lights: extras.lights } : {}),
    ...(extras.shadows !== undefined ? { shadows: extras.shadows } : {}),
    ...(extras.csm !== undefined ? { csm: extras.csm } : {}),
    masks: extras.masks,
    brokenControls: extras.brokenControls ?? [],
    ...(extras.strip !== undefined ? { strip: extras.strip } : {}),
    primaryCriterion: extras.primaryCriterion,
    primaryRegion: extras.primaryRegion
  };
}

// --- fixture geometry --------------------------------------------------------

const batchGrid3x3: ObjectSpec = {
  kind: "instanced",
  name: "batched box grid",
  shape: "box",
  size: [0.4, 0.4, 0.4],
  material: { color: "#c7d1dc", roughness: 0.55, metalness: 0.1 },
  transforms: (() => {
    const rng = createRng(9021);
    const transforms: { position: Vec3; rotation: Vec3 }[] = [];
    for (let ix = 0; ix < 3; ix += 1) {
      for (let iz = 0; iz < 3; iz += 1) {
        transforms.push({ position: [-2.4 + ix * 0.6, 0.2, -1.8 + iz * 0.6], rotation: [0, rng() * Math.PI, 0] });
      }
    }
    return transforms;
  })(),
  castShadow: true,
  receiveShadow: true
};

const fixtureInstances16: ObjectSpec = {
  kind: "instanced",
  name: "sixteen instances",
  shape: "box",
  size: [0.3, 0.6, 0.3],
  material: { color: "#b8a26a", roughness: 0.6, metalness: 0 },
  transforms: (() => {
    const rng = createRng(7070);
    const transforms: { position: Vec3; rotation: Vec3 }[] = [];
    for (let index = 0; index < 16; index += 1) {
      transforms.push({ position: [0.6 + (index % 4) * 0.5, 0.3, -2 + Math.floor(index / 4) * 0.5], rotation: [0, rng() * Math.PI, 0] });
    }
    return transforms;
  })(),
  castShadow: true,
  receiveShadow: true
};

const csmPoles: ObjectSpec[] = [];
for (let index = 0; index < 24; index += 1) {
  const z = -index * 5 - 4;
  csmPoles.push(primitive(`pole ${index}`, "cylinder", [0.3, 6, 0.3], [(index % 2 === 0 ? -1 : 1) * 2.5, 3, z], { color: "#8d949c", roughness: 0.7, metalness: 0.2 }));
}

const emissiveProps: ObjectSpec[] = [
  primitive("emissive pillar a", "box", [0.3, 2.2, 0.3], [-2.4, 1.1, -4], { color: "#101418", roughness: 0.4, metalness: 0.1, emissive: "#36e0ff", emissiveIntensity: 4 }),
  primitive("emissive pillar b", "box", [0.3, 1.6, 0.3], [1.8, 0.8, -5.5], { color: "#141010", roughness: 0.4, metalness: 0.1, emissive: "#ff8a3c", emissiveIntensity: 5 }),
  primitive("emissive slab", "box", [2.4, 0.12, 0.12], [0, 2.6, -7], { color: "#101418", roughness: 0.4, metalness: 0, emissive: "#b7f04a", emissiveIntensity: 3 })
];

export const prd02Specs = {
  // --- copies of base scenes (PRD-02 §16.1 scene list) ------------------------
  "prd02-06-metal-roughness-sweep": laneSpec(sceneSpecs["06-metal-roughness-sweep"], "prd02-06-metal-roughness-sweep", {
    masks: ["metal"],
    brokenControls: ["no-ibl"],
    primaryCriterion: "specular-hf-energy-monotonic",
    primaryRegion: "metal"
  }),
  "prd02-09-outdoor-environment": laneSpec(sceneSpecs["09-outdoor-environment"], "prd02-09-outdoor-environment", {
    masks: ["sky", "shadow-receiver"],
    brokenControls: ["no-ibl", "no-shadows"],
    primaryCriterion: "sky-band-luma-std",
    primaryRegion: "sky"
  }),
  "prd02-10-indoor-environment": laneSpec(sceneSpecs["10-indoor-environment"], "prd02-10-indoor-environment", {
    masks: ["shadow-receiver", "object-id"],
    brokenControls: ["no-shadows"],
    primaryCriterion: "clipping-near-practicals",
    primaryRegion: "subject"
  }),
  "prd02-11-multiple-lights": laneSpec(sceneSpecs["11-multiple-lights"], "prd02-11-multiple-lights", {
    masks: ["shadow-receiver"],
    brokenControls: ["no-shadows"],
    primaryCriterion: "unrequested-shadow-pixels",
    primaryRegion: "frame"
  }),
  "prd02-12-shadows": laneSpec(sceneSpecs["12-shadows"], "prd02-12-shadows", {
    masks: ["shadow-receiver"],
    brokenControls: ["no-shadows"],
    primaryCriterion: "second-caster-coverage",
    primaryRegion: "shadow-receiver"
  }),
  "prd02-13-ibl-only": laneSpec(sceneSpecs["13-ibl-only"], "prd02-13-ibl-only", {
    masks: ["sky", "object-id"],
    brokenControls: ["no-ibl", "no-shadows"],
    primaryCriterion: "diffuse-sky-tint",
    primaryRegion: "subject"
  }),
  "prd02-15-animation-skinning": laneSpec(sceneSpecs["15-animation-skinning"], "prd02-15-animation-skinning", {
    masks: ["shadow-receiver", "object-id"],
    brokenControls: ["no-shadows"],
    primaryCriterion: "shadow-drop-and-skinned-iou",
    primaryRegion: "shadow-receiver"
  }),
  "prd02-17-large-environment": laneSpec(sceneSpecs["17-large-environment"], "prd02-17-large-environment", {
    masks: ["sky", "shadow-receiver", "silhouette-edge"],
    brokenControls: ["no-shadows", "no-ibl"],
    strip: { frames: 60, intervalMs: 33, orbitDegrees: 8 },
    primaryCriterion: "csm-edge-density-and-temporal",
    primaryRegion: "shadow-receiver"
  }),
  "prd02-18-game-scene": laneSpec(sceneSpecs["18-game-scene"], "prd02-18-game-scene", {
    masks: ["shadow-receiver", "object-id"],
    brokenControls: ["no-shadows", "no-ibl"],
    primaryCriterion: "game-shadow-drop",
    primaryRegion: "shadow-receiver"
  }),

  // --- PRD 02 fixtures ---------------------------------------------------------
  "prd02-16b-instancing-shadowed": laneSpec(sceneSpecs["16-instancing"], "prd02-16b-instancing-shadowed", {
    purpose: "10k instanced boxes WITH castShadow — E19 batch/instance caster coverage",
    lights: [
      { kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.3 },
      sun(2.5, [10, 20, 8], true)
    ],
    objects: [
      ground(50, { color: "#2c3036", roughness: 0.9, metalness: 0 }),
      { ...sceneSpecs["16-instancing"].objects[1]!, castShadow: true } as ObjectSpec
    ],
    shadows: defaultShadows(25),
    masks: ["shadow-receiver"],
    brokenControls: ["no-shadows"],
    primaryCriterion: "instanced-caster-coverage",
    primaryRegion: "shadow-receiver"
  }),
  "prd02-no-lights": {
    id: "prd02-no-lights",
    index: 102,
    title: "No lights (neutral environment)",
    purpose: "No lights at all — under the flag the neutral-room environment must still light the scene (fallback rig deleted)",
    resolution: RESOLUTION,
    toneMapping: "aces-filmic",
    exposure: 1,
    time: CAPTURE_TIME,
    settleFrames: SETTLE_FRAMES,
    camera: { position: [0, 2.2, 5.5], target: [0, 0.6, 0], fov: 45, near: 0.1, far: 60 },
    background: { kind: "color", color: "#181b21" },
    lights: [],
    objects: [
      ground(12),
      primitive("red box", "box", [1, 1, 1], [-1.2, 0.5, 0], { color: "#c0392b", roughness: 0.5, metalness: 0 }),
      primitive("white sphere", "sphere", [1, 1, 1], [0.8, 0.5, -0.4], { color: "#e8e8e8", roughness: 0.4, metalness: 0 })
    ],
    owner: "prd02",
    referenceProfile: "contract",
    qrFlags: ["lighting"],
    dprs: [1],
    masks: ["object-id"],
    brokenControls: ["no-ibl"],
    primaryCriterion: "neutral-env-fallback",
    primaryRegion: "subject"
  },
  "prd02-reflection-probe": {
    id: "prd02-reflection-probe",
    index: 103,
    title: "Reflection probe room",
    purpose: "Glossy sphere + colored props in a closed room — reflection probes (Phase 5) box-project; day-0 renders the base room",
    resolution: RESOLUTION,
    toneMapping: "aces-filmic",
    exposure: 1,
    time: CAPTURE_TIME,
    settleFrames: SETTLE_FRAMES,
    camera: { position: [0, 1.7, 4.2], target: [0, 1.0, -1], fov: 55, near: 0.05, far: 40 },
    background: { kind: "color", color: "#05070a" },
    lights: [
      { kind: "point", name: "warm lamp", color: "#ffb46b", intensity: 12, position: [-2.2, 2.4, 0.5], range: 0 },
      { kind: "point", name: "cool lamp", color: "#7ab8ff", intensity: 10, position: [2.4, 2.2, -1.5], range: 0 }
    ],
    objects: [
      ground(10, { color: "#3d4148", roughness: 0.75, metalness: 0 }),
      primitive("back wall", "box", [10, 3, 0.2], [0, 1.5, -4], { color: "#4a4f58", roughness: 0.85, metalness: 0 }, { castShadow: false }),
      primitive("mirror sphere", "sphere", [1.4, 1.4, 1.4], [0, 0.7, -0.6], { color: "#ffffff", roughness: 0.05, metalness: 1 }),
      primitive("red prop", "box", [0.5, 1.2, 0.5], [-1.6, 0.6, -1.2], { color: "#c03a2e", roughness: 0.55, metalness: 0 }),
      primitive("green prop", "box", [0.5, 0.9, 0.5], [1.7, 0.45, -1.8], { color: "#2e8b57", roughness: 0.6, metalness: 0 })
    ],
    shadows: defaultShadows(4),
    owner: "prd02",
    referenceProfile: "contract",
    qrFlags: ["lighting"],
    dprs: [1],
    masks: ["metal", "object-id"],
    brokenControls: ["no-ibl"],
    primaryCriterion: "probe-reflection",
    primaryRegion: "metal"
  },
  "prd02-red-wall-bounce": {
    id: "prd02-red-wall-bounce",
    index: 104,
    title: "Red wall bounce",
    purpose: "White room with one saturated red wall — irradiance-volume bounce tint (Phase 5); day-0 baseline has no bounce",
    resolution: RESOLUTION,
    toneMapping: "aces-filmic",
    exposure: 1,
    time: CAPTURE_TIME,
    settleFrames: SETTLE_FRAMES,
    camera: { position: [0, 1.5, 4.6], target: [0, 1.0, -1], fov: 50, near: 0.05, far: 40 },
    background: { kind: "color", color: "#101216" },
    lights: [
      { kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.05 },
      sun(2.5, [4, 6, 5], true, "#fff2e2")
    ],
    objects: [
      ground(8, { color: "#e8e8e8", roughness: 0.9, metalness: 0 }),
      primitive("red wall", "box", [0.2, 3.2, 6], [-3.1, 1.6, -1], { color: "#d91e18", roughness: 0.85, metalness: 0 }, { castShadow: false }),
      primitive("back wall", "box", [8, 3.2, 0.2], [0, 1.6, -4], { color: "#e8e8e8", roughness: 0.9, metalness: 0 }, { castShadow: false }),
      primitive("white cube a", "box", [0.8, 0.8, 0.8], [-1.6, 0.4, -1.2], { color: "#f0f0f0", roughness: 0.85, metalness: 0 }),
      primitive("white cube b", "box", [0.8, 1.4, 0.8], [0.6, 0.7, -2.0], { color: "#f0f0f0", roughness: 0.85, metalness: 0 })
    ],
    shadows: defaultShadows(5),
    owner: "prd02",
    referenceProfile: "contract",
    qrFlags: ["lighting"],
    dprs: [1],
    masks: ["object-id"],
    brokenControls: ["no-ibl"],
    primaryCriterion: "bounce-tint",
    primaryRegion: "subject"
  },
  "prd02-contact-cube": {
    id: "prd02-contact-cube",
    index: 105,
    title: "Contact cube",
    purpose: "One cube on a plane under a low sun — contact shadows (Phase 5) tighten the ground seam",
    resolution: RESOLUTION,
    toneMapping: "aces-filmic",
    exposure: 1,
    time: CAPTURE_TIME,
    settleFrames: SETTLE_FRAMES,
    camera: { position: [0, 1.4, 4.4], target: [0, 0.4, 0], fov: 45, near: 0.05, far: 60 },
    background: { kind: "color", color: "#20242b" },
    lights: [
      { kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.12 },
      sun(3, [6, 3.2, 2], true, "#ffffff")
    ],
    objects: [
      ground(14, { color: "#aeb4bc", roughness: 0.85, metalness: 0 }),
      primitive("cube", "box", [1, 1, 1], [0, 0.5, 0], { color: "#7d8ea3", roughness: 0.6, metalness: 0 }),
      primitive("cube low", "box", [0.6, 0.6, 0.6], [1.8, 0.3, -0.8], { color: "#8a7d6a", roughness: 0.7, metalness: 0 })
    ],
    shadows: defaultShadows(6),
    owner: "prd02",
    referenceProfile: "contract",
    qrFlags: ["lighting"],
    dprs: [1],
    masks: ["shadow-receiver"],
    brokenControls: ["no-shadows"],
    primaryCriterion: "contact-shadow-seam",
    primaryRegion: "shadow-receiver"
  },
  "prd02-caster-fixtures": {
    id: "prd02-caster-fixtures",
    index: 106,
    title: "Shadow caster fixtures",
    purpose: "Skinned Soldier + 3x3 batch + 16 instances + alpha leaf card, one sun — every C-11 depth variant in one scene",
    resolution: RESOLUTION,
    toneMapping: "aces-filmic",
    exposure: 1,
    time: CAPTURE_TIME,
    settleFrames: SETTLE_FRAMES,
    camera: { position: [0.4, 3.4, 7.8], target: [0, 0.6, -0.6], fov: 45, near: 0.05, far: 60 },
    background: { kind: "color", color: "#1c2026" },
    lights: [
      { kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.12 },
      sun(3, [4, 7, 3], true, "#fff4e5")
    ],
    objects: [
      ground(16, { color: "#8f959c", roughness: 0.85, metalness: 0 }),
      { kind: "model", name: "skinned soldier", asset: "soldier", position: [-3.4, 0, 1.2], castShadow: true, receiveShadow: true, animation: { clip: "Walk", time: CAPTURE_TIME } },
      batchGrid3x3,
      fixtureInstances16,
      primitive("alpha leaf card", "plane", [1.6, 1.6, 1.6], [2.8, 0.9, 1.4], { color: "#3e7d3a", roughness: 0.9, metalness: 0, opacity: 0.55 }, { rotation: [0, 0.5, 0] })
    ],
    shadows: defaultShadows(8),
    owner: "prd02",
    referenceProfile: "contract",
    qrFlags: ["lighting"],
    dprs: [1],
    masks: ["shadow-receiver", "object-id"],
    brokenControls: ["no-shadows"],
    primaryCriterion: "caster-variant-coverage",
    primaryRegion: "shadow-receiver"
  },
  "prd02-csm-poles": {
    id: "prd02-csm-poles",
    index: 107,
    title: "CSM poles",
    purpose: "24 thin poles along an 120 m path — cascade split stability + shimmer strip (Phase 4)",
    resolution: RESOLUTION,
    toneMapping: "aces-filmic",
    exposure: 1,
    time: CAPTURE_TIME,
    settleFrames: SETTLE_FRAMES,
    camera: { position: [0, 2.4, 8], target: [0, 1.4, -20], fov: 50, near: 0.1, far: 250 },
    background: { kind: "color", color: "#9fb0c2" },
    lights: [
      { kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.15 },
      sun(3.2, [-30, 18, 6], true)
    ],
    objects: [ground(200, { color: "#7b8288", roughness: 0.92, metalness: 0 }), ...csmPoles],
    shadows: defaultShadows(60),
    csm: { cascades: 4, maxFar: 150, mode: "practical" },
    owner: "prd02",
    referenceProfile: "contract",
    qrFlags: ["lighting"],
    dprs: [1],
    masks: ["shadow-receiver", "sky"],
    brokenControls: ["no-shadows"],
    strip: { frames: 60, intervalMs: 33, orbitDegrees: 6 },
    primaryCriterion: "cascade-boundary-and-shimmer",
    primaryRegion: "shadow-receiver"
  },
  "prd02-softbox": {
    id: "prd02-softbox",
    index: 108,
    title: "Softbox",
    purpose: "Emissive panel + product subject — area/rect lights (Phase 5) replace the spot proxy; day-0 uses a wide spot",
    resolution: RESOLUTION,
    toneMapping: "aces-filmic",
    exposure: 1,
    time: CAPTURE_TIME,
    settleFrames: SETTLE_FRAMES,
    camera: { position: [0, 1.6, 4.0], target: [0, 0.9, -0.6], fov: 45, near: 0.05, far: 40 },
    background: { kind: "color", color: "#0c0d10" },
    lights: [
      { kind: "spot", name: "softbox proxy", color: "#ffffff", intensity: 45, position: [0, 3.2, 1.4], target: [0, 0.7, -0.6], angle: 0.9, penumbra: 1, range: 20, castShadow: true }
    ],
    objects: [
      ground(10, { color: "#23262c", roughness: 0.6, metalness: 0 }),
      primitive("panel card", "box", [2.2, 1.6, 0.05], [0, 2.6, -1.8], { color: "#f5f2ea", roughness: 1, metalness: 0, emissive: "#fff4e0", emissiveIntensity: 0.4 }, { castShadow: false }),
      primitive("subject vase", "cylinder", [0.5, 1.1, 0.5], [0, 0.55, -0.6], { color: "#d9d2c8", roughness: 0.25, metalness: 0.05 }),
      primitive("dark pedestal", "box", [1.6, 0.3, 1.6], [0, 0.15, -0.6], { color: "#1c1e22", roughness: 0.5, metalness: 0.4 })
    ],
    shadows: defaultShadows(4),
    owner: "prd02",
    referenceProfile: "contract",
    qrFlags: ["lighting"],
    dprs: [1],
    masks: ["object-id"],
    brokenControls: ["no-ibl"],
    primaryCriterion: "area-light-penumbra",
    primaryRegion: "subject"
  },
  "prd02-wet-floor": {
    id: "prd02-wet-floor",
    index: 109,
    title: "Wet floor",
    purpose: "Dark glossy floor + emissive props — SSR-in-HDR reflections (PRD 03 composite target)",
    resolution: RESOLUTION,
    toneMapping: "aces-filmic",
    exposure: 1,
    time: CAPTURE_TIME,
    settleFrames: SETTLE_FRAMES,
    camera: { position: [0, 1.5, 5.4], target: [0, 0.8, -4], fov: 55, near: 0.05, far: 80 },
    background: { kind: "color", color: "#07080c" },
    lights: [
      { kind: "ambient", name: "ambient", color: "#8899bb", intensity: 0.06 },
      { kind: "directional", name: "rim", color: "#a8c0e8", intensity: 1.2, position: [-4, 6, -8], target: [0, 0, -4], castShadow: false }
    ],
    objects: [
      ground(24, { color: "#14181f", roughness: 0.08, metalness: 0 }),
      ...emissiveProps,
      primitive("dark block", "box", [1, 1.8, 1], [-0.6, 0.9, -3], { color: "#1e2228", roughness: 0.5, metalness: 0.2 })
    ],
    fog: { color: "#07080c", density: 0.03 },
    owner: "prd02",
    referenceProfile: "contract",
    qrFlags: ["lighting"],
    dprs: [1],
    masks: ["object-id"],
    brokenControls: ["no-ibl"],
    primaryCriterion: "ssr-hdr-reflections",
    primaryRegion: "subject"
  }
} as const satisfies Record<string, SceneSpec>;

export type Prd02SceneId = keyof typeof prd02Specs;
export const prd02SceneIds = Object.keys(prd02Specs) as Prd02SceneId[];

export function getPrd02Spec(id: string): SceneSpec {
  const spec = (prd02Specs as Record<string, SceneSpec>)[id];
  if (!spec) throw new Error(`Unknown prd02 scene "${id}". Known: ${prd02SceneIds.join(", ")}`);
  return spec;
}
