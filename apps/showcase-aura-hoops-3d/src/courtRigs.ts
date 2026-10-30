/**
 * Aura Hoops 3D: the per-court look table (GU47 WP-17 "Blacktop World Tour", PRD §3.2 item 2).
 *
 * One row per court (the `?court=` variants): time of day, HDRI (E-A catalogue id), sun elevation / azimuth / colour /
 * intensity of the one shadowed key, environment fill, fog to the HDRI horizon, post preset, grade, bloom, explicit AO,
 * the practical lights (sodium spots, tungsten bulb clusters, sign and rib rect lights), weather, lens flare, sky,
 * water, the court surface and the spray-tag signature parameters. Pure data plus node builders: no DOM, no app, so the
 * unit tests and the art-direction audit read exactly what the scene mounts.
 *
 * Rows: H47-L1 (rig), H47-L2 (floods, bulbs), H47-L3 (rect lights), H47-L4 (lens flare), H47-E1 (fog, backdrops),
 * H47-E2 (rain, wet ground, lightning), H47-E3 (water), H47-E4 (preetham sky), H47-P1 (post and grade), H47-M1
 * (court surfaces), H47-V3 (spray tag).
 */
import {
  effects,
  instances,
  lights,
  looks,
  material,
  sky,
  weather,
  type AuraColor,
  type AuraHdriId,
  type AuraLookId,
  type AuraLookOverrides,
  type AuraNodeBuilder,
  type AuraPostPresetId,
  type AuraSceneNode,
  type AuraVec3
} from "@aura3d/engine";

export type CourtId = "rucker" | "venice" | "athens" | "manila" | "shanghai" | "orbit";
export const COURT_IDS: readonly CourtId[] = ["rucker", "venice", "athens", "manila", "shanghai", "orbit"];

/** Palette of the identity sheet (art/direction.ts): charcoal asphalt, sodium flood, chain-link steel. */
export const HOOPS_PALETTE = { charcoal: "#23262b", sodium: "#ffb347", chainLink: "#8a9199" } as const;

export interface CourtPracticalSpot {
  readonly kind: "spot";
  readonly name: string;
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly color: AuraColor;
  readonly intensity: number;
  readonly angle: number;
  readonly penumbra: number;
  readonly distance: number;
  /**
   * H47-L2: an explicit local shadow request (E-B multi-caster: the tier grants low 0, medium 1, high 2, ultra 4).
   * Every row is false today: the C-35 audit (`auditArtDirection`) allows one shadowed light for the basketball genre,
   * which is the court's PCSS key (handoff in the lane report; flip the two Rucker rows once the audit admits it).
   */
  readonly shadow: boolean;
}
export interface CourtPracticalPoint {
  readonly kind: "point";
  readonly name: string;
  readonly position: AuraVec3;
  readonly color: AuraColor;
  readonly intensity: number;
  readonly distance: number;
}
export interface CourtPracticalRect {
  readonly kind: "rect";
  readonly name: string;
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly color: AuraColor;
  readonly intensity: number;
  readonly width: number;
  readonly height: number;
}
export type CourtPractical = CourtPracticalSpot | CourtPracticalPoint | CourtPracticalRect;

/** H47-M1: one painted court per venue (lines and wear in the albedo once the WP-36 PBR sets land). */
export interface CourtSurface {
  /** Short name of the surface in the identity sheet. */
  readonly name: string;
  readonly floor: AuraColor;
  readonly paint: AuraColor;
  readonly line: AuraColor;
  readonly apron: AuraColor;
  readonly roughness: number;
  /** Puddle mask strength 0..1 (wet courts only; WP-36 mask texture). */
  readonly puddles: number;
  /** WP-36 texture-set key this court will take (asset need; today's flat colours stay until it is admitted). */
  readonly pbrSet: string;
}

export interface CourtWeather {
  /** "court": rain falls on the court (camera volume, streaks capped at 160); "outside": rain curtains beyond the canopy only. */
  readonly rain: "none" | "court" | "outside";
  /** Rain streak limit for `weather.precipitation` (PRD: <= 160). */
  readonly streaks: number;
  readonly wetGround: boolean;
  /** Seconds between lightning flashes (0 = none); reduced flash skips or caps them (PRD §6.3). */
  readonly lightningEverySeconds: number;
}

export interface CourtRig {
  readonly id: CourtId;
  readonly label: string;
  readonly timeOfDay: string;
  /** Base look the overrides apply to (keeps its key/fog/grade defaults where this row is silent). */
  readonly look: AuraLookId;
  readonly hdri: AuraHdriId;
  /** H47-L1 budget note: one 2k HDRI per court once E-A ships the 2k copy (handoff); the 1k file loads today. */
  readonly hdri2k: boolean;
  readonly environmentIntensity: number;
  readonly environmentRotationDeg: number;
  readonly sun: { readonly elevationDeg: number; readonly azimuthDeg: number };
  readonly key: { readonly color: AuraColor; readonly intensity: number };
  readonly exposureEv: number;
  /** H47-E1: fog to the HDRI horizon (near/far in metres; the skyline sits at 60-120 m inside it). */
  readonly fog: { readonly color: AuraColor; readonly near: number; readonly far: number };
  readonly post: AuraPostPresetId;
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number };
  /** H47-P1: bloom 0.85 day / 0.6 night (intensity), with a lower threshold at night so lamps and signs glow. */
  readonly bloom: { readonly intensity: number; readonly threshold: number };
  readonly night: boolean;
  /** H47-P1: film grain only on the two film-stock courts (Rucker, Manila). */
  readonly grain: boolean;
  readonly practicals: readonly CourtPractical[];
  readonly weather: CourtWeather;
  /** H47-L4: where the lens flare sits (the Venice sun, the camera-facing Rucker floods). */
  readonly lensFlare: readonly { readonly name: string; readonly position: AuraVec3; readonly intensity: number }[];
  /** H47-E4 (C): Preetham sky for the two daylight courts (E-G sky flag, default-on). */
  readonly preethamSky: boolean;
  /** H47-E3: real water (Venice surf, Shanghai river). */
  readonly water: "none" | "ocean" | "river";
  /** H47-E1: skyline distance in metres (60-120) and the court backdrop set (WP-36 backdrop kit; today's models stay). */
  readonly skylineDistance: number;
  readonly backdrop: string;
  readonly surface: CourtSurface;
  /** H47-V3: spray-tag paint colour on this court (the tag textures are WP-36 assets). */
  readonly sprayTag: { readonly color: AuraColor; readonly opacity: number; readonly size: number };
}

const SODIUM = HOOPS_PALETTE.sodium;
const TUNGSTEN = "#ffb46b";
const COURT_CENTRE: AuraVec3 = [0, 0, 4];

/** Rucker floods stand at (±11, -7) and (±11, 13); the lamp heads sit 9 m up, slightly inboard. */
const ruckerSpot = (x: number, z: number, shadow: boolean): CourtPracticalSpot => ({
  kind: "spot",
  name: `rucker-sodium-${x < 0 ? "w" : "e"}${z < 0 ? "n" : "s"}`,
  position: [x * 0.92, 9.0, z * 0.92],
  target: COURT_CENTRE,
  color: SODIUM,
  intensity: 2.6,
  angle: 0.62,
  penumbra: 0.55,
  distance: 60,
  shadow
});

/**
 * Manila's 12 tungsten bulbs hang on two strings along the long sides under the roof (MANILA_BULBS). Six point lights,
 * one per bulb pair, light the floor: the art direction caps practicals at 6 per court, and twelve 12 m point lights
 * over one court read the same as six brighter ones (decision in the lane report).
 */
export const MANILA_BULBS: readonly AuraVec3[] = [-9, -4.5, 0, 4.5, 9, 13.5].flatMap((z): AuraVec3[] => [[-6.4, 5.6, z], [6.4, 5.6, z]]);
const manilaBulbLight = (i: number): CourtPracticalPoint => {
  const a = MANILA_BULBS[i * 2]!;
  return { kind: "point", name: `manila-bulbs-${i}`, position: [a[0] * 0.85, a[1] - 0.2, a[2] + 2.25], color: TUNGSTEN, intensity: 3.2, distance: 13 };
};

export const COURT_RIGS: Readonly<Record<CourtId, CourtRig>> = {
  rucker: {
    id: "rucker",
    label: "RUCKER PARK · HARLEM",
    timeOfDay: "blue hour under sodium floods",
    look: "golden-hour",
    hdri: "belfast_sunset_puresky",
    hdri2k: true,
    environmentIntensity: 0.55,
    environmentRotationDeg: 250,
    sun: { elevationDeg: 7, azimuthDeg: 250 },
    key: { color: "#ff9e64", intensity: 1.5 },
    exposureEv: 0.1,
    fog: { color: "#46506a", near: 28, far: 210 },
    post: "cinematic-film",
    grade: { contrast: 1.12, saturation: 0.92, temperature: -0.08, tint: 0.02 },
    bloom: { intensity: 0.6, threshold: 0.8 },
    night: true,
    grain: true,
    // H47-L2: four sodium spots. The PRD casts the two behind the hoop (sun + local-0 + local-1 = 3 shadow rows on
    // High); the C-35 audit caps basketball at one shadowed light, so they stay unshadowed until that rule moves.
    practicals: [ruckerSpot(-11, -7, false), ruckerSpot(11, -7, false), ruckerSpot(-11, 13, false), ruckerSpot(11, 13, false)],
    weather: { rain: "none", streaks: 0, wetGround: false, lightningEverySeconds: 0 },
    lensFlare: [
      { name: "rucker-flood-flare-w", position: [-10.1, 9.0, 12.0], intensity: 0.55 },
      { name: "rucker-flood-flare-e", position: [10.1, 9.0, 12.0], intensity: 0.55 }
    ],
    preethamSky: false,
    water: "none",
    skylineDistance: 92,
    backdrop: "brick walk-ups behind a 4 m chain-link fence",
    surface: { name: "cracked asphalt", floor: "#2b2e33", paint: "#8e3f1c", line: "#ece4cf", apron: "#1f2227", roughness: 0.9, puddles: 0, pbrSet: "hoopsCourtAsphaltCracked" },
    sprayTag: { color: SODIUM, opacity: 0.86, size: 2.4 }
  },
  venice: {
    id: "venice",
    label: "VENICE BEACH · LA",
    timeOfDay: "sun behind the backboard",
    look: "golden-hour",
    hdri: "venice_sunset",
    hdri2k: true,
    environmentIntensity: 0.95,
    environmentRotationDeg: 185,
    // Behind the hoop: the court attacks -Z, so azimuth 185 puts the low sun over the backboard, facing the camera.
    sun: { elevationDeg: 5, azimuthDeg: 185 },
    key: { color: "#ffad66", intensity: 2.6 },
    exposureEv: 0.05,
    fog: { color: "#d8a47c", near: 40, far: 260 },
    post: "daylight-outdoor",
    grade: { contrast: 1.06, saturation: 1.1, temperature: 0.18, tint: 0.01 },
    bloom: { intensity: 0.85, threshold: 1.1 },
    night: false,
    grain: false,
    practicals: [],
    weather: { rain: "none", streaks: 0, wetGround: false, lightningEverySeconds: 0 },
    lensFlare: [{ name: "venice-sun-flare", position: [-17.4, 17.4, -199.2], intensity: 0.9 }],
    preethamSky: true,
    water: "ocean",
    skylineDistance: 110,
    backdrop: "boardwalk, lifeguard tower and the ocean",
    surface: { name: "bleached teal acrylic", floor: "#4f8a93", paint: "#e6dcc2", line: "#fbf3df", apron: "#cdb07a", roughness: 0.72, puddles: 0, pbrSet: "hoopsCourtAcrylicTeal" },
    sprayTag: { color: "#ff5d8f", opacity: 0.82, size: 2.2 }
  },
  athens: {
    id: "athens",
    label: "ATHENS ROOFTOP",
    timeOfDay: "hard white noon",
    look: "outdoor-day",
    hdri: "outdoor-midday",
    hdri2k: true,
    environmentIntensity: 1.0,
    environmentRotationDeg: 150,
    sun: { elevationDeg: 64, azimuthDeg: 150 },
    key: { color: "#fff6ea", intensity: 4.2 },
    exposureEv: -0.12,
    fog: { color: "#cbd8e2", near: 60, far: 320 },
    post: "daylight-outdoor",
    grade: { contrast: 1.16, saturation: 0.86, temperature: 0.02, tint: 0 },
    bloom: { intensity: 0.85, threshold: 1.2 },
    night: false,
    grain: false,
    practicals: [],
    weather: { rain: "none", streaks: 0, wetGround: false, lightningEverySeconds: 0 },
    lensFlare: [],
    preethamSky: true,
    water: "none",
    skylineDistance: 100,
    backdrop: "whitewashed hillside and rooftop parapets",
    surface: { name: "blue-white acrylic", floor: "#3c5f8f", paint: "#e9eef3", line: "#f7f5ee", apron: "#d9d4c8", roughness: 0.68, puddles: 0, pbrSet: "hoopsCourtAcrylicBlue" },
    sprayTag: { color: "#1f6fd1", opacity: 0.8, size: 2.2 }
  },
  manila: {
    id: "manila",
    label: "MANILA COVERED",
    timeOfDay: "tungsten under a corrugated roof, rain outside",
    look: "interior-warm",
    hdri: "indoor-workshop",
    hdri2k: true,
    environmentIntensity: 0.7,
    environmentRotationDeg: 20,
    // Cool daylight through the roof gap (the god-ray source of H47-V2); the bulbs carry the warm side.
    sun: { elevationDeg: 62, azimuthDeg: 20 },
    key: { color: "#c9d5e6", intensity: 1.4 },
    exposureEv: 0.25,
    fog: { color: "#2b2620", near: 24, far: 140 },
    post: "cinematic-film",
    grade: { contrast: 1.08, saturation: 0.95, temperature: 0.22, tint: 0.01 },
    bloom: { intensity: 0.6, threshold: 0.8 },
    night: true,
    grain: true,
    practicals: [0, 1, 2, 3, 4, 5].map(manilaBulbLight),
    weather: { rain: "outside", streaks: 0, wetGround: false, lightningEverySeconds: 0 },
    lensFlare: [],
    preethamSky: false,
    water: "none",
    skylineDistance: 70,
    backdrop: "corrugated walls and open sides onto the rain",
    surface: { name: "painted concrete", floor: "#6a5a43", paint: "#8f3c2a", line: "#f3e8cf", apron: "#3e352b", roughness: 0.8, puddles: 0, pbrSet: "hoopsCourtConcretePainted" },
    sprayTag: { color: "#ffe14d", opacity: 0.84, size: 2.2 }
  },
  shanghai: {
    id: "shanghai",
    label: "SHANGHAI RIVERSIDE",
    timeOfDay: "wet neon night in rain",
    look: "night-city",
    hdri: "rooftop_night",
    hdri2k: true,
    environmentIntensity: 0.6,
    environmentRotationDeg: 300,
    sun: { elevationDeg: 48, azimuthDeg: 220 },
    key: { color: "#9db4ff", intensity: 0.8 },
    exposureEv: 0.35,
    fog: { color: "#151b2b", near: 18, far: 150 },
    post: "neon-night",
    grade: { contrast: 1.18, saturation: 1.15, temperature: -0.15, tint: 0.05 },
    bloom: { intensity: 0.6, threshold: 0.7 },
    night: true,
    grain: false,
    // H47-L3: sign rect lights replace the two neon point fills; left cyan and right magenta keep the columns apart.
    practicals: [
      { kind: "rect", name: "shanghai-sign-cyan", position: [-12.5, 4.2, 1.5], target: [0, 0.8, 4], color: "#39d7ff", intensity: 5.5, width: 4.2, height: 1.4 },
      { kind: "rect", name: "shanghai-sign-magenta", position: [12.5, 4.6, 6.5], target: [0, 0.8, 4], color: "#e26bff", intensity: 5.0, width: 3.6, height: 1.6 },
      { kind: "rect", name: "shanghai-shopfront", position: [0, 3.2, -9.5], target: [0, 0.5, 4], color: "#ffcf8a", intensity: 2.4, width: 6, height: 1.2 }
    ],
    weather: { rain: "court", streaks: 120, wetGround: true, lightningEverySeconds: 40 },
    lensFlare: [],
    preethamSky: false,
    water: "river",
    skylineDistance: 120,
    backdrop: "riverside towers across the water",
    surface: { name: "wet asphalt", floor: "#1d222c", paint: "#1b5a86", line: "#9fdcff", apron: "#12161f", roughness: 0.12, puddles: 0.7, pbrSet: "hoopsCourtAsphaltWet" },
    sprayTag: { color: "#39d7ff", opacity: 0.8, size: 2.2 }
  },
  orbit: {
    id: "orbit",
    label: "ORBIT COURT · LEO",
    timeOfDay: "starlit deck lit by Earth-shine",
    look: "neon-arcade",
    hdri: "deep_space_starfield",
    hdri2k: true,
    environmentIntensity: 0.4,
    environmentRotationDeg: 0,
    // Earth-shine from where the planet hangs ((-60, 130, -300) -> elevation 24, azimuth 191).
    sun: { elevationDeg: 24, azimuthDeg: 191 },
    key: { color: "#9fc8ff", intensity: 1.3 },
    exposureEv: 0.3,
    fog: { color: "#0b1120", near: 70, far: 420 },
    post: "space",
    grade: { contrast: 1.1, saturation: 0.9, temperature: -0.12, tint: 0 },
    bloom: { intensity: 0.6, threshold: 0.8 },
    night: true,
    grain: false,
    // H47-L3: station rib rect lights replace the orbit point fill.
    practicals: [
      { kind: "rect", name: "orbit-rib-nw", position: [-14, 7.5, -6], target: [0, 0, 4], color: "#7dfcff", intensity: 3.2, width: 0.6, height: 7 },
      { kind: "rect", name: "orbit-rib-ne", position: [14, 7.5, -6], target: [0, 0, 4], color: "#7dfcff", intensity: 3.2, width: 0.6, height: 7 },
      { kind: "rect", name: "orbit-rib-sw", position: [-14, 7.5, 14], target: [0, 0, 4], color: "#b9a6ff", intensity: 2.6, width: 0.6, height: 7 },
      { kind: "rect", name: "orbit-rib-se", position: [14, 7.5, 14], target: [0, 0, 4], color: "#b9a6ff", intensity: 2.6, width: 0.6, height: 7 }
    ],
    weather: { rain: "none", streaks: 0, wetGround: false, lightningEverySeconds: 0 },
    lensFlare: [],
    preethamSky: false,
    water: "none",
    skylineDistance: 120,
    backdrop: "station viewport ribs and the Earth",
    surface: { name: "polished composite", floor: "#151b2e", paint: "#243b66", line: "#7dfcff", apron: "#0b0e1a", roughness: 0.3, puddles: 0, pbrSet: "hoopsCourtCompositeDeck" },
    sprayTag: { color: "#7dfcff", opacity: 0.78, size: 2.2 }
  }
};

export const courtRig = (id: CourtId): CourtRig => COURT_RIGS[id];

/** H47-L1 key shadow: PCSS, three cascades on High (the tier caps cascades and filter on Low: 1 cascade, PCF). */
export const COURT_KEY_SHADOW = { cascades: 3, filter: "pcss", lightSize: 1.6, mapSize: 2048 } as const;

/** The look overrides of one court (E-A): catalogue HDRI, key, fog to the horizon, grade, post preset and bloom. */
export function courtLookOverrides(rig: CourtRig): AuraLookOverrides {
  return {
    hdri: rig.hdri,
    background: "look",
    environmentIntensity: rig.environmentIntensity,
    environmentRotationDeg: rig.environmentRotationDeg,
    exposureEv: rig.exposureEv,
    sun: rig.sun,
    key: { color: rig.key.color, intensity: rig.key.intensity, shadow: COURT_KEY_SHADOW },
    rim: false,
    fog: { color: rig.fog.color, near: rig.fog.near, far: rig.fog.far },
    grade: rig.grade,
    post: rig.post
  };
}

/** Name of the look's default AO node; the court authors its own explicit AO instead (H47-L1). */
export const LOOK_AO_NODE = "look ambient occlusion";
/** Name of the look's bloom node, replaced by the court's day/night bloom (H47-P1). */
export const LOOK_BLOOM_NODE = "look bloom";

/**
 * The court's look as flat nodes: the look expansion with the default AO and bloom swapped for the court's explicit AO
 * (`ao: false` drops it, the ?qaAo=0 measurement path) and day/night bloom, plus film grain on the film-stock courts
 * and the post preset as its `output.preset` child (E-A).
 */
export function courtLookNodes(rig: CourtRig, options: { readonly ao?: boolean } = {}): AuraNodeBuilder<AuraSceneNode>[] {
  const nodes = looks.nodes(rig.look, courtLookOverrides(rig)).filter((node) => {
    const name = (node.toJSON() as { name?: string }).name;
    return name !== LOOK_AO_NODE && name !== LOOK_BLOOM_NODE;
  }) as AuraNodeBuilder<AuraSceneNode>[];
  if (options.ao !== false) nodes.push(effects.ambientOcclusion({ name: "court ambient occlusion", intensity: 0.85, radius: 0.55 }) as AuraNodeBuilder<AuraSceneNode>);
  nodes.push(effects.bloom({ name: "court bloom", intensity: rig.bloom.intensity, threshold: rig.bloom.threshold }) as AuraNodeBuilder<AuraSceneNode>);
  if (rig.grain) nodes.push(effects.filmGrain({ name: "court film grain", intensity: 0.08 } as Parameters<typeof effects.filmGrain>[0]) as AuraNodeBuilder<AuraSceneNode>);
  return nodes;
}

/** The court's practical lights (H47-L2, H47-L3): sodium spots, tungsten bulb clusters, sign and rib rect lights. */
export function courtPracticalNodes(rig: CourtRig): AuraNodeBuilder<AuraSceneNode>[] {
  return rig.practicals.map((p) => {
    if (p.kind === "spot") {
      return lights.spot({ name: p.name, position: p.position, target: p.target, angle: p.angle, penumbra: p.penumbra, intensity: p.intensity, color: p.color, distance: p.distance, ...(p.shadow ? { shadow: { filter: "pcf" as const, mapSize: 1024 as const } } : {}) }) as AuraNodeBuilder<AuraSceneNode>;
    }
    if (p.kind === "point") {
      return lights.point({ name: p.name, position: p.position, intensity: p.intensity, color: p.color, distance: p.distance }) as AuraNodeBuilder<AuraSceneNode>;
    }
    return lights.rect({ name: p.name, position: p.position, target: p.target, intensity: p.intensity, color: p.color, width: p.width, height: p.height }) as AuraNodeBuilder<AuraSceneNode>;
  });
}

/** Emissive intensity of the lamp heads, flood panels and bulbs (H47-L2: >= 6). */
export const LAMP_EMISSIVE = 6.5;

/**
 * Lamp-head geometry for the practicals (H47-L2): one instanced draw of emissive sodium panels under the Rucker flood
 * heads, or one draw of tungsten bulbs plus one of the two bulb strings at Manila. WP-36 replaces them with the flood
 * head and bulb-string models.
 */
export function courtLampNodes(rig: CourtRig): AuraNodeBuilder<AuraSceneNode>[] {
  if (rig.id === "rucker") {
    const panels = rig.practicals.filter((p): p is CourtPracticalSpot => p.kind === "spot").map((p) => ({
      position: [p.position[0], p.position[1] + 0.05, p.position[2]] as AuraVec3,
      rotation: [0, Math.atan2(-p.position[0], COURT_CENTRE[2] - p.position[2]), 0] as AuraVec3,
      scale: [1.5, 0.22, 0.5] as AuraVec3
    }));
    return [instances.box({ name: "rucker-flood-heads", transforms: panels, castShadow: false, material: material.emissive({ color: "#3a2a12", emissive: SODIUM, emissiveIntensity: LAMP_EMISSIVE, bloom: 2 }) }) as AuraNodeBuilder<AuraSceneNode>];
  }
  if (rig.id === "manila") {
    const bulbs = MANILA_BULBS.map((p) => ({ position: p, scale: [0.16, 0.2, 0.16] as AuraVec3 }));
    const strings = [-6.4, 6.4].map((x) => ({ position: [x, 5.82, 2.25] as AuraVec3, rotation: [Math.PI / 2, 0, 0] as AuraVec3, scale: [0.025, 23.5, 0.025] as AuraVec3 }));
    return [
      instances.sphere({ name: "manila-bulbs", transforms: bulbs, castShadow: false, material: material.emissive({ color: "#5a3a18", emissive: TUNGSTEN, emissiveIntensity: LAMP_EMISSIVE, bloom: 2 }) }) as AuraNodeBuilder<AuraSceneNode>,
      instances.cylinder({ name: "manila-bulb-strings", transforms: strings, castShadow: false, material: material.pbr({ color: "#1b1a18", roughness: 0.7 }) }) as AuraNodeBuilder<AuraSceneNode>
    ];
  }
  return [];
}

/** H47-L4: lens flares on the Venice sun and the camera-facing Rucker floods (frustum occlusion; fades at the edge). */
export function courtLensFlareNodes(rig: CourtRig): AuraNodeBuilder<AuraSceneNode>[] {
  return rig.lensFlare.map((f) => lights.lensFlare({ name: f.name, position: f.position, intensity: f.intensity, occlusion: "frustum", edgeFade: 0.2 }) as unknown as AuraNodeBuilder<AuraSceneNode>);
}

/** H47-E4 (C): Preetham sky on the two daylight courts, sun matched to the key; the HDRI keeps lighting the scene. */
export function courtSkyNodes(rig: CourtRig): AuraNodeBuilder<AuraSceneNode>[] {
  if (!rig.preethamSky) return [];
  return [sky.preetham({ name: `${rig.id}-preetham-sky`, sun: { elevationDeg: rig.sun.elevationDeg, azimuthDeg: rig.sun.azimuthDeg }, turbidity: rig.id === "venice" ? 6 : 2.4, rayleigh: rig.id === "venice" ? 2.2 : 1.1, captureEnvironment: false, affectsFog: true }) as unknown as AuraNodeBuilder<AuraSceneNode>];
}

/** Lightning cadence on the storm court: one flash every `lightningEverySeconds`, 0.18 s long, skipped under reduced flash. */
export function lightningFlash(rig: CourtRig, timeSeconds: number, reducedFlash: boolean): number {
  const every = rig.weather.lightningEverySeconds;
  if (every <= 0 || reducedFlash) return 0;
  const t = timeSeconds % every;
  // a double strike: 0.0-0.08 s and 0.12-0.18 s into the cycle
  if (t < 0.08) return 1;
  if (t >= 0.12 && t < 0.18) return 0.6;
  return 0;
}

/**
 * H47-E2: rain and wet ground. Shanghai: the camera rain volume with streaks capped by the row (<= 160) and a wetness
 * node; Manila: two rain curtains beyond the open sides of the canopy (box emitters at |x| >= 17), none over the court.
 */
export function courtWeatherNodes(rig: CourtRig, reducedMotion: boolean): AuraSceneNode[] {
  const out: AuraSceneNode[] = [];
  if (rig.weather.rain === "court") {
    const streaks = Math.min(160, reducedMotion ? Math.round(rig.weather.streaks / 2) : rig.weather.streaks);
    out.push(...weather.precipitation({ type: "rain", streakLimit: streaks, seed: 0x5a1e }).nodes);
  } else if (rig.weather.rain === "outside") {
    for (const side of [-1, 1] as const) {
      // A tall box spanning the open side from the gutter to the ground: streaks spawn through it and fall fast.
      out.push(effects.particles({
        name: `${rig.id}-rain-curtain-${side < 0 ? "w" : "e"}`,
        position: [side * 19, 4.5, 3],
        shape: "box",
        shapeSize: [3, 9, 30],
        rate: reducedMotion ? 160 : 320,
        maxParticles: reducedMotion ? 200 : 400,
        lifetime: [0.45, 0.6],
        speed: 0.4,
        gravity: -28,
        size: [0.02, 0.03],
        color: "#b9c7da",
        sprite: "rain-streak",
        stretch: { mode: "velocity", factor: 0.06 },
        alphaOverLife: [0.6, 0.6, 0],
        loop: true,
        seed: 0x3a11 + side
      }).toJSON());
    }
  }
  if (rig.weather.wetGround) {
    out.push(...weather.wetGround({ type: "rain", dryColor: rig.surface.floor, dryRoughness: 0.9, size: 14, seed: 0x5a1e }).nodes);
  }
  return out;
}

/** H47-L1 / H47-E1 summary per court for the identity sheet and the tests. */
export function courtIdentityRow(rig: CourtRig): { readonly court: CourtId; readonly timeOfDay: string; readonly hdri: AuraHdriId; readonly post: AuraPostPresetId; readonly sun: string; readonly practicals: number; readonly shadowedPracticals: number } {
  return {
    court: rig.id,
    timeOfDay: rig.timeOfDay,
    hdri: rig.hdri,
    post: rig.post,
    sun: `${rig.sun.elevationDeg}/${rig.sun.azimuthDeg}`,
    practicals: rig.practicals.length,
    shadowedPracticals: rig.practicals.filter((p) => p.kind === "spot" && p.shadow).length
  };
}
