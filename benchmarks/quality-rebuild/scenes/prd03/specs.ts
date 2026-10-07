/**
 * Lane prd03 scene specs (PRD-03 §16.1). Each id is `<owner>-<slug>`; specs use
 * the shared SceneSpec shape plus lane fields the adapters in
 * `aura3d/scenes/prd03/` and `three/scenes/prd03/` consume.
 *
 * Post effects not expressible in SceneSpec (dof, motion-blur, taa, ao, god
 * rays, exposure) are lane extensions under `postExtras` — the lane adapters
 * apply them on top of the shared translation so both engines see identical
 * geometry/lights.
 */
import type { LightSpec, MaterialSpec, PrimitiveObjectSpec, SceneSpec, Vec3 } from "../../shared/types";
import { RESOLUTION } from "../../shared/types";

const CAPTURE_TIME = 1.25;
const SETTLE_FRAMES = 4;

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

function base(id: string, index: number, title: string, purpose: string, primaryCriterion: string): Pick<SceneSpec, "id" | "index" | "title" | "purpose" | "resolution" | "toneMapping" | "exposure" | "time" | "settleFrames" | "owner" | "qrFlags" | "primaryCriterion"> {
  return {
    id,
    index,
    title,
    purpose,
    resolution: RESOLUTION,
    toneMapping: "aces-filmic",
    exposure: 1,
    time: CAPTURE_TIME,
    settleFrames: SETTLE_FRAMES,
    owner: "prd03",
    qrFlags: ["post"],
    primaryCriterion
  };
}

const defaultShadows = (extent: number) => ({ mapSize: 2048, type: "pcf-soft" as const, directionalExtent: extent, bias: -0.0005, normalBias: 0.02 });

const sun = (intensity: number, position: Vec3, castShadow: boolean, color = "#fff4e5"): LightSpec =>
  ({ kind: "directional", name: "sun", color, intensity, position, target: [0, 0, 0], castShadow });

/* ------------------------------------------------------------------------ */
/* prd03-hdr-bloom (§16.1 row 19)                                            */
/* ------------------------------------------------------------------------ */

const bloomSpheres = [0.5, 1, 2, 4, 8].map((strength, i) =>
  primitive(
    `emissive sphere s${strength}`,
    "sphere",
    [0.5, 0.5, 0.5],
    [-2 + i, 1, 0],
    { color: "#000000", roughness: 1, metalness: 0, emissive: "#ffffff", emissiveIntensity: strength },
    { castShadow: false, receiveShadow: false }
  )
);

const hdrBloom: SceneSpec = {
  ...base("prd03-hdr-bloom", 19, "HDR bloom calibration", "Emissive luma ladder above/below the bloom knee; measures halo energy proportional to excess", "bloom-halo-energy"),
  camera: { position: [0, 1.4, 6], target: [0, 1, 0], fov: 45, near: 0.1, far: 60 },
  background: { kind: "color", color: "#050608" },
  lights: [sun(0.4, [4, 6, 4], false, "#dfe8f5")],
  objects: [
    ...bloomSpheres,
    primitive("white wall", "box", [6, 3, 0.2], [0, 1.5, -3], { color: "#9a9a9a", roughness: 0.9, metalness: 0 }, { castShadow: false })
  ],
  bloom: { strength: 0.6, radius: 0.4, threshold: 1.0 }
};

/* ------------------------------------------------------------------------ */
/* prd03-thin-aa (§16.1 row 20)                                              */
/* ------------------------------------------------------------------------ */

const thinWires = [
  primitive("wire h1", "box", [8, 0.012, 0.012], [0, 1.2, -0.5], { color: "#e8e8e8", roughness: 0.6, metalness: 0.4 }),
  primitive("wire h2", "box", [8, 0.012, 0.012], [0, 1.6, 0.3], { color: "#d0d8e0", roughness: 0.6, metalness: 0.4 }),
  primitive("wire v1", "box", [0.012, 2.4, 0.012], [-1.6, 1.4, 0], { color: "#e8e8e8", roughness: 0.6, metalness: 0.4 }),
  primitive("wire v2", "box", [0.012, 2.4, 0.012], [1.7, 1.4, -0.4], { color: "#d0d8e0", roughness: 0.6, metalness: 0.4 }),
  primitive("lane marker", "box", [0.02, 0.02, 6], [0.6, 0.01, -1], { color: "#ffd24a", roughness: 0.8, metalness: 0 }, { castShadow: false }),
  primitive("rail a", "box", [6, 0.04, 0.06], [0, 0.6, -2.4], { color: "#b8bcc4", roughness: 0.5, metalness: 0.7 }),
  primitive("rail b", "box", [6, 0.04, 0.06], [0, 0.75, -2.4], { color: "#9aa0aa", roughness: 0.5, metalness: 0.7 })
];

const thinAa: SceneSpec = {
  ...base("prd03-thin-aa", 20, "Thin-geometry AA", "Wires, rails and 1-px markers; edge-crawl metric vs three per AA mode", "edge-crawl"),
  dprs: [1, 2],
  camera: { position: [0, 1.5, 5], target: [0, 1.1, -1], fov: 40, near: 0.1, far: 80 },
  background: { kind: "color", color: "#10141a" },
  lights: [sun(2, [3, 6, 4], false, "#f4f6ff"), { kind: "ambient", name: "ambient", color: "#4a5568", intensity: 0.5 }],
  objects: [
    primitive("ground", "plane", [20, 1, 20], [0, 0, 0], { color: "#20262e", roughness: 0.9, metalness: 0 }, { castShadow: false }),
    ...thinWires,
    primitive("text stand-in", "box", [1.2, 0.6, 0.02], [-2.2, 1.4, -1.8], { color: "#f0f2f6", roughness: 0.9, metalness: 0 })
  ]
};

/* ------------------------------------------------------------------------ */
/* prd03-tone-ramp (§16.1 row 21)                                            */
/* ------------------------------------------------------------------------ */

const rampStops = [0, 0.05, 0.18, 0.5, 1, 2, 4, 8, 16];
const rampRows: { readonly color: string; readonly y: number }[] = [
  { color: "#ffffff", y: 0 },
  { color: "#38d6ff", y: 1.1 },
  { color: "#ff42c8", y: 2.2 }
];
const rampObjects = rampRows.flatMap(({ color, y }, row) =>
  rampStops.map((stop, i) =>
    primitive(`ramp ${row}-${i} e${stop}`, "box", [0.55, 0.55, 0.55], [-4.4 + i * 1.1, 0.6 + y, 0], { color: "#000000", roughness: 1, metalness: 0, emissive: color, emissiveIntensity: stop }, { castShadow: false, receiveShadow: false })
  )
);

const toneRamp: SceneSpec = {
  ...base("prd03-tone-ramp", 21, "Tone ramp", "Achromatic + saturated 0..16 linear ramps per operator; ΔE2000 vs three per operator", "tonemap-delta-e"),
  camera: { position: [0, 1.7, 7.5], target: [0, 1.4, 0], fov: 42, near: 0.1, far: 60 },
  background: { kind: "color", color: "#0a0b0d" },
  lights: [{ kind: "ambient", name: "ambient", color: "#404040", intensity: 0.3 }],
  objects: [
    primitive("backdrop", "box", [12, 4.4, 0.2], [0, 1.8, -1.2], { color: "#15171b", roughness: 1, metalness: 0 }, { castShadow: false }),
    ...rampObjects
  ]
};

/* ------------------------------------------------------------------------ */
/* prd03-ao-grounding (§16.1 row 22)                                         */
/* ------------------------------------------------------------------------ */

const aoRoom: SceneSpec = {
  ...base("prd03-ao-grounding", 22, "AO grounding", "Furniture/clutter contact darkening; open floor must not change", "ao-contact-darkening"),
  camera: { position: [6, 3.4, 7.5], target: [0, 0.6, 0], fov: 48, near: 0.1, far: 60 },
  background: { kind: "color", color: "#262a30" },
  lights: [
    sun(1.4, [5, 8, 3], true, "#f2ead9"),
    { kind: "ambient", name: "ambient", color: "#8a94a8", intensity: 0.7 }
  ],
  objects: [
    primitive("floor", "plane", [16, 1, 16], [0, 0, 0], { color: "#8d8578", roughness: 0.92, metalness: 0 }, { castShadow: false }),
    primitive("table top", "box", [2.4, 0.12, 1.2], [-1.2, 0.9, -0.6], { color: "#6b5136", roughness: 0.8, metalness: 0 }),
    primitive("table leg nw", "box", [0.1, 0.9, 0.1], [-2.3, 0.45, -1.15], { color: "#5a4328", roughness: 0.8, metalness: 0 }),
    primitive("table leg ne", "box", [0.1, 0.9, 0.1], [-0.1, 0.45, -1.15], { color: "#5a4328", roughness: 0.8, metalness: 0 }),
    primitive("table leg sw", "box", [0.1, 0.9, 0.1], [-2.3, 0.45, -0.05], { color: "#5a4328", roughness: 0.8, metalness: 0 }),
    primitive("table leg se", "box", [0.1, 0.9, 0.1], [-0.1, 0.45, -0.05], { color: "#5a4328", roughness: 0.8, metalness: 0 }),
    primitive("crate a", "box", [0.8, 0.8, 0.8], [1.8, 0.4, 0.6], { color: "#7a6a4e", roughness: 0.85, metalness: 0 }),
    primitive("crate b", "box", [0.6, 0.6, 0.6], [1.9, 1.1, 0.7], { color: "#8a7a5c", roughness: 0.85, metalness: 0 }, { rotation: [0, 0.4, 0] }),
    primitive("floor clutter", "cylinder", [0.5, 0.06, 0.5], [0.6, 0.03, 1.8], { color: "#4a5560", roughness: 0.95, metalness: 0 }),
    primitive("wall unit", "box", [0.4, 2.2, 2.4], [3.4, 1.1, -1.4], { color: "#5f6a72", roughness: 0.8, metalness: 0 }),
    primitive("books pile", "box", [0.5, 0.18, 0.35], [-1.4, 1.05, -0.6], { color: "#8a3a3a", roughness: 0.9, metalness: 0 }, { rotation: [0, 0.2, 0] })
  ],
  shadows: defaultShadows(12)
};

/* ------------------------------------------------------------------------ */
/* prd03-dof-bokeh (§16.1 row 23)                                            */
/* ------------------------------------------------------------------------ */

const bokehLights = [0, 1, 2, 3, 4].map((i) =>
  primitive(
    `bokeh light ${i}`,
    "sphere",
    [0.3, 0.3, 0.3],
    [-4 + i * 2, 1.4 + (i % 2) * 0.9, -27 - (i % 3) * 4],
    { color: "#000000", roughness: 1, metalness: 0, emissive: i % 2 === 0 ? "#ffd9a0" : "#a0c4ff", emissiveIntensity: 5 },
    { castShadow: false, receiveShadow: false }
  )
);

const dofBokeh: SceneSpec = {
  ...base("prd03-dof-bokeh", 23, "DOF bokeh", "Hero at 3 m in focus; background point lights at ~30 m must bleed as round bokeh", "dof-bokeh-shape"),
  camera: { position: [0, 1.6, 3], target: [0, 1.2, 0], fov: 45, near: 0.1, far: 90 },
  background: { kind: "color", color: "#0c0e12" },
  lights: [sun(1.1, [4, 7, 5], true, "#f6ecdd"), { kind: "ambient", name: "ambient", color: "#30363f", intensity: 0.5 }],
  objects: [
    primitive("ground", "plane", [30, 1, 40], [0, 0, -10], { color: "#1e232a", roughness: 0.9, metalness: 0 }, { castShadow: false }),
    primitive("hero", "sphere", [1, 1, 1], [0, 1.2, 0], { color: "#c8503f", roughness: 0.55, metalness: 0.1 }),
    ...bokehLights
  ],
  shadows: defaultShadows(20)
};

/* ------------------------------------------------------------------------ */
/* prd03-taa-motion (§16.1 row 24)                                           */
/* ------------------------------------------------------------------------ */

const taaMotion: SceneSpec = {
  ...base("prd03-taa-motion", 24, "TAA motion", "Camera pan over static geometry (standalone); ghost ≤ 2 px", "taa-ghost"),
  camera: { position: [-4, 1.8, 5], target: [0, 1, -2], fov: 50, near: 0.1, far: 80 },
  background: { kind: "color", color: "#14181f" },
  lights: [sun(1.6, [4, 8, 4], true, "#eef2ff"), { kind: "ambient", name: "ambient", color: "#4a5568", intensity: 0.4 }],
  objects: [
    primitive("ground", "plane", [30, 1, 30], [0, 0, 0], { color: "#2a3038", roughness: 0.9, metalness: 0 }, { castShadow: false }),
    ...Array.from({ length: 9 }, (_, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      return primitive(`column ${i}`, "box", [0.4, 1.6 + (i % 4) * 0.4, 0.4], [col * 1.6 - 1.6, 0.8 + (i % 4) * 0.2, row * 1.8 - 4], { color: i % 2 ? "#7a8494" : "#5f6875", roughness: 0.7, metalness: 0.15 });
    })
  ],
  shadows: defaultShadows(18)
};

/* ------------------------------------------------------------------------ */
/* prd03-night-fog-banding (§16.1 row 25)                                    */
/* ------------------------------------------------------------------------ */

const nightFog: SceneSpec = {
  ...base("prd03-night-fog-banding", 25, "Night fog banding", "Near-black exp² fog + dim lights; exposes 8-bit banding on the present path", "banding-contours"),
  camera: { position: [0, 1.6, 8], target: [0, 1, -6], fov: 50, near: 0.1, far: 120 },
  background: { kind: "color", color: "#030711" },
  lights: [
    { kind: "point", name: "lantern", color: "#ffb45e", intensity: 6, position: [1.2, 1.8, -4], range: 9 },
    { kind: "ambient", name: "moon ambient", color: "#1a2233", intensity: 0.35 }
  ],
  objects: [
    primitive("ground", "plane", [40, 1, 40], [0, 0, -8], { color: "#10151d", roughness: 0.95, metalness: 0 }, { castShadow: false }),
    primitive("pillar l", "cylinder", [0.5, 3.4, 0.5], [-1.8, 1.7, -7], { color: "#1d2530", roughness: 0.9, metalness: 0 }),
    primitive("pillar r", "cylinder", [0.5, 3.4, 0.5], [2.2, 1.7, -9], { color: "#1d2530", roughness: 0.9, metalness: 0 }),
    primitive("crate", "box", [0.7, 0.7, 0.7], [0.4, 0.35, -5], { color: "#232c38", roughness: 0.9, metalness: 0 })
  ],
  fog: { color: "#0a1220", density: 0.045 }
};

/* ------------------------------------------------------------------------ */
/* prd03-scene18-bloom — lane copy of `18-game-scene` (held out from tuning)  */
/* ------------------------------------------------------------------------ */

const scene18Bloom: SceneSpec = {
  ...base("prd03-scene18-bloom", 26, "Scene-18 bloom holdout", "Identical inputs to base scene 18; bloom halo measured here so calibration never touches it", "bloom-halo-energy"),
  camera: { position: [1.2, 2.4, 4.2], target: [0, 1.2, -3], fov: 55, near: 0.1, far: 200 },
  background: { kind: "color", color: "#8fa3b8" },
  environment: { hdri: "autumnFieldPuresky", intensity: 0.7, rotation: 0 },
  lights: [sun(3, [-6, 10, 4], true, "#fff1d6")],
  objects: [
    primitive("ground plane", "plane", [60, 1, 60], [0, 0, 0], { color: "#5d6b45", roughness: 0.95, metalness: 0 }, { castShadow: false }),
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
};

export const PRD03_SCENE_SPECS = {
  "prd03-hdr-bloom": hdrBloom,
  "prd03-thin-aa": thinAa,
  "prd03-tone-ramp": toneRamp,
  "prd03-ao-grounding": aoRoom,
  "prd03-dof-bokeh": dofBokeh,
  "prd03-taa-motion": taaMotion,
  "prd03-night-fog-banding": nightFog,
  "prd03-scene18-bloom": scene18Bloom
} as const;

export type Prd03SceneId = keyof typeof PRD03_SCENE_SPECS;
