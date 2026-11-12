// Aura FC 3D — world scene: pitch, goals, stadium bowl, venue dressing, venue look and weather.
//
// The scene is rebuilt per venue (main.ts calls app.setScene when the venue changes, FC-21), so every venue gets its
// own look row (look.ts, GU47 WP-19): look preset with the E-A overrides, night IBL or drawn sky, the main-stand flood
// as the one shadowed key on night venues, a light-pool batch for the other towers, haze shafts, weather and the
// venue's post nodes. applyVenue still re-tints and toggles the dressing handles (null-safe) after a rebuild.

import {
  camera, decals, effects, game, geometry, instances, lights, looks, material, primitives, scene, sky, surfaces as engineSurfaces,
  type AuraAssetRef, type AuraLookOverrides
} from "@aura3d/engine";
import { assets } from "../aura-assets-v2";
import { VENUES, type VenueSpec } from "./content";
import type { VenueId } from "./types";
import {
  PITCH_HX, PITCH_HZ, GOAL_HALF_W, GOAL_H, GOAL_DEPTH, BOX_DEPTH, BOX_HALF_W,
  PEN_X, CIRCLE_R, BALL_R, BALL_VIS_R, CAGE_GOAL_GAP
} from "./dims";
import { HYBRID_BLOB_OPACITY, KIT_FABRIC_RIM, athleteNodes } from "./rig";
import { refereePatrol } from "./locomotion";
import { HYBRID_LAYERS, MAIN_FLOOD_TOWER, ORIGINAL_LOOKS, VENUE_LOOKS, fcLookMode, type FcLookMode, type FcVenueLook } from "./look";
import { scoreboardTextNodes } from "./scoreboard3d";
import {
  FC_MAT,
  FOOTBALLER_CANONICAL_HEIGHT,
  buildArticulatedFootballerNode,
  buildArticulatedPitchFanNode,
  buildBallTrolleyNode,
  buildBroadcastCranesBatchedNode,
  buildChampionshipTrophyNode,
  buildCornerPennantGeometry,
  buildCornerPoleGeometry,
  buildFifaGoalFrameNode,
  buildFloodlightTowersBatchedNode,
  buildGlacierArchDomeNode,
  buildGoalNetBackGeometry,
  buildGoalNetRoofGeometry,
  buildGoalNetSideGeometry,
  buildHoardingCabinetGeometry,
  buildMatchBallNode,
  buildPlayerTunnelNode,
  buildScoreboardGantryNode,
  buildStadiumBowlUpperNode,
  buildStandTierGeometry,
  buildSupporterCrowdSlotGeometries,
  buildTechnicalDugoutsBatchedNode,
  buildTrophyPlinthCollarNode,
  buildVenueBackdropNodes,
  buildWaverSupporterGeometry,
  poseArticulatedFootballer,
  poseArticulatedPitchFan
} from "../art/proceduralModels";
import { labCameraOptions, readLabFlags } from "../../../showcase-port-shared/lab-flags";
import { createFlipbookAtlas } from "../../../showcase-port-shared/vfx-pack";
import { WGSL_CLIP, WGSL_INSTANCE_INPUTS, wgslStage } from "../../../showcase-port-shared/wgsl-twins";
import {
  flipbookCardShaderSpec,
  goalNetShaderSpec,
  hexToLinearRgb,
  hoardingLedShaderSpec,
  pitchTurfShaderSpec
} from "./shaders";

export { VENUE_LOOKS } from "./look";

/** Referee height (m); also the model scale for the foot-locked walk phase. */
export const REFEREE_TARGET_HEIGHT = 1.84;

/** Presentation options for one scene build (main.ts passes the page's accessibility and tier state). */
export interface FcSceneOptions {
  /** prefers-reduced-motion / ?reducedMotion: weather emission halves, no motion blur, no chromatic aberration. */
  readonly reducedMotion?: boolean;
  /** Engine-defect gates (default: read from the URL, see `fcEngineGates`). */
  readonly engineGates?: Partial<FcEngineGates>;
  /** Look path (default: `fcLookMode`, the venue default or `?look=`). */
  readonly lookMode?: FcLookMode;
}

/** PRD D11: true when the venue renders the 4.6.2 look path (`?look=original` or the venue default). */
export function usesOriginalLook(venue: VenueId, mode?: FcLookMode): boolean {
  return (mode ?? fcLookMode(venue)) === "original";
}

/**
 * GU47 phase-2 fallbacks for three engine defects found by the WP-38 receipts (software WebGL2, image
 * gu47-after-10301502). Each feature stays authored; it is mounted only when its gate is on, and every gate is off by
 * default until the owning engine lane lands its fix:
 * - `spotShadow`: the main-stand flood's PCSS spot shadow. Any bound local shadow uploads `u_localShadowTexelScale`
 *   as a Float32Array(8), which `MultiDraw.ts` rejects, so Munich, Kyoto, Favela and Glacier failed to mount
 *   (RENDERER_MOUNT_FAILED, nothing drawn). E-B. Opt in with `?spotShadow=on`.
 * - `stars`: Glacier's `sky.dayNight` star sky; a sky with no bands uploads a length-0 `u_bandParams` and throws.
 *   E-G. Opt in with `?stars=on`.
 * - `lut`: the per-venue display LUT (FC47-P2); the LUT stays pending, then unavailable, so every shot carried
 *   texPending 1 and the luma-band check rejects it. E-C. Opt in with `?lut=on`.
 */
export interface FcEngineGates {
  readonly spotShadow: boolean;
  readonly stars: boolean;
  readonly lut: boolean;
}

export function fcEngineGates(search: string = typeof location === "undefined" ? "" : location.search, override: Partial<FcEngineGates> = {}): FcEngineGates {
  const q = new URLSearchParams(search);
  const on = (k: string) => q.get(k) === "on";
  return { spotShadow: on("spotShadow"), stars: on("stars"), lut: on("lut"), ...override };
}

const HIDDEN = 0.0001;

/** `?dome=off` hides the Glacier dome on any look path (QA A/B). */
function domeOn(search: string = typeof location === "undefined" ? "" : location.search): boolean {
  return new URLSearchParams(search).get("dome") !== "off";
}

/** `?mirror=off` drops the Uyuni mirror (QA fallback, FC47-M3); always on outside a browser. */
/** Hybrid night venues cast the main-flood spot shadow unless `?spotShadow=off`. */
export function hybridSpotShadow(search: string = typeof location === "undefined" ? "" : location.search): boolean {
  return new URLSearchParams(search).get("spotShadow") !== "off";
}

export function mirrorEnabled(search: string = typeof location === "undefined" ? "" : location.search): boolean {
  return new URLSearchParams(search).get("mirror") !== "off";
}

/** Floodlight tower bases (corners of the bowl); index MAIN_FLOOD_TOWER is the main-stand flood. */
export const FLOOD_TOWERS: readonly (readonly [number, number])[] = [
  [-PITCH_HX - 6, -PITCH_HZ - 6], [PITCH_HX + 6, -PITCH_HZ - 6],
  [-PITCH_HX - 6, PITCH_HZ + 6.5], [PITCH_HX + 6, PITCH_HZ + 6.5]
];
/** Lamp-head height of the flood banks (m). */
const FLOOD_HEAD_Y = 12;
/** The main-stand flood's lamp position: its spot, its cone and the haze-shaft light position share it. */
export function mainFloodPosition(): [number, number, number] {
  const [x, z] = FLOOD_TOWERS[MAIN_FLOOD_TOWER];
  return [x * 0.94, FLOOD_HEAD_Y, z * 0.94];
}

/**
 * The venue's look node (FC47-L1/L2/L3, S1). The E-A `background` override carries the venue sky colour, so the look
 * HDRI (night IBL) lights the scene with `background: false` instead of painting itself as the sky (the old
 * interior-industrial studio-HDRI-as-sky defect); day venues with a drawn sky pass `background: "look"`. Night venues
 * turn the look key into a 0.4 unshadowed front fill (the main-stand flood is the one shadowed key); day venues keep a
 * cascaded sun.
 */
/** FC47-P2: display LUT asset per venue. */
export const VENUE_LUT_ASSETS: Readonly<Record<VenueId, AuraAssetRef<"lut">>> = {
  munich: assets.fcLutMunich, kyoto: assets.fcLutKyoto, favela: assets.fcLutFavela,
  lagos: assets.fcLutLagos, uyuni: assets.fcLutUyuni, glacier: assets.fcLutGlacier
};

function venueIdOf(vl: FcVenueLook): VenueId {
  return (Object.keys(VENUE_LOOKS) as VenueId[]).find((id) => VENUE_LOOKS[id] === vl) ?? "munich";
}

export function venueLookOverrides(vl: FcVenueLook, gates: FcEngineGates = fcEngineGates()): AuraLookOverrides {
  const drawSky = vl.skyHdri !== undefined || vl.look === "golden-hour";
  const ibl = vl.nightIbl;
  return {
    background: drawSky ? "look" : vl.background,
    exposureEv: vl.exposureEv,
    fogDensityScale: vl.fog,
    fog: {
      color: vl.fogColor,
      near: vl.fogRange.near,
      far: vl.fogRange.far,
      height: { mode: "linear", near: vl.fogRange.near, far: vl.fogRange.far, maxOpacity: 0.16, affectsBackground: false }
    } as any,
    sun: { elevationDeg: vl.sun.elevationDeg, azimuthDeg: vl.sun.azimuthDeg },
    key: {
      color: vl.key.color,
      intensity: vl.key.intensity,
      ...(vl.key.shadowed ? { shadow: { cascades: 3, mapSize: 2048, filter: "pcf" } } : {})
    },
    ...(vl.rim ? { rim: { color: vl.rim.color, intensity: vl.rim.intensity, azimuthDeg: vl.rim.azimuthDeg } } : {}),
    // FC47-P2: the venue's split-tone display LUT rides on the look grade (E-C binds it in the display grade)
    grade: { contrast: vl.grade.contrast, saturation: vl.grade.saturation, temperature: vl.grade.temperature, tint: vl.grade.tint, ...(gates.lut ? { lut: VENUE_LUT_ASSETS[venueIdOf(vl)] } : {}) },
    post: vl.post,
    ...(vl.skyHdri !== undefined ? { hdri: vl.skyHdri } : {}),
    ...(ibl ? {
      hdri: ibl.source === "night-2k" ? assets.fcNightIblHdri : ibl.source,
      environmentIntensity: ibl.intensity,
      environmentRotationDeg: ibl.rotationDeg
    } : {})
  };
}

/** Hybrid look overrides: crisp far-pushed stadium fog (`near >= 180, maxOpacity <= 0.16`), exposure, night sky colour, grade & rim. */
export function hybridLookOverrides(venue: VenueId, gates: FcEngineGates = fcEngineGates()): AuraLookOverrides {
  const ol = ORIGINAL_LOOKS[venue];
  const hl = HYBRID_LAYERS[venue];
  const vl = VENUE_LOOKS[venue];
  const k = hl.key;
  return {
    fogDensityScale: hl.fogScale ?? ol.fog,
    fog: {
      color: vl.fogColor,
      near: hl.fogRange.near,
      far: hl.fogRange.far,
      height: { mode: "linear", near: hl.fogRange.near, far: hl.fogRange.far, maxOpacity: 0.16, affectsBackground: false }
    } as any,
    exposureEv: hl.exposureEv,
    ...(hl.background !== undefined ? { background: hl.background } : {}),
    grade: { ...hl.grade, ...(gates.lut ? { lut: VENUE_LUT_ASSETS[venue] } : {}) },
    ...(hl.rim ? { rim: { ...hl.rim } } : {}),
    ...(hl.environmentIntensity !== undefined ? { environmentIntensity: hl.environmentIntensity } : {}),
    // phase 4: a shadowed key that reads, its cascades fitted to the bowl so every player and goal frame is covered
    ...(k ? {
      ...(k.elevationDeg !== undefined || k.azimuthDeg !== undefined
        ? { sun: { ...(k.elevationDeg !== undefined ? { elevationDeg: k.elevationDeg } : {}), ...(k.azimuthDeg !== undefined ? { azimuthDeg: k.azimuthDeg } : {}) } }
        : {}),
      key: { intensity: k.intensity, shadow: { mapSize: 2048, filter: "pcf", softness: k.softness, intensity: 1, normalBias: 0.02, fit: { center: [0, 0, 0], extent: HYBRID_SHADOW_EXTENT } } }
    } : {})
  };
}

/** Phase 4: half-size (m) of the hybrid key's fitted shadow box: the pitch, the goals and the first stand rows. */
export const HYBRID_SHADOW_EXTENT = 34;

function stripLookDof(lookGroup: any): any {
  return {
    ...lookGroup,
    children: (lookGroup.children ?? []).filter((n: any) => n?.effect !== "depth-of-field")
  };
}

export function venueLookNode(venue: VenueId, gates: FcEngineGates = fcEngineGates()): any {
  const vl = VENUE_LOOKS[venue];
  const group = stripLookDof(looks.preset(vl.look, venueLookOverrides(vl, gates)).toJSON() as any);
  if (vl.key.shadowed) return group;
  // The look key always requests a shadow; on night venues it is the unshadowed front fill (FC47-L2).
  return {
    ...group,
    children: (group.children ?? []).map((n: any) => (n?.name === "look key light" ? { ...n, shadow: false } : n))
  };
}

/* ------------------------------------------------------------------ */
/*  Floodlights (FC47-L2, S2)                                          */
/* ------------------------------------------------------------------ */

/**
 * Soft additive light pool on an instanced plane: the three towers that hold no light (one shadowed flood is the
 * art-direction key, and the Low tier caps lights per pixel) leave a radial pool on the turf instead. One draw for
 * all three. The vertex stage reads `instanceMatrix` / `instanceColor` (identity / white on a plain draw).
 */
export const LIGHT_POOL_VERTEX_GLSL = `out vec2 vPoolUv;
out vec3 vPoolTint;
void main() {
  vPoolUv = uv;
  vPoolTint = instanceColor.rgb;
  gl_Position = projectionMatrix * viewMatrix * (modelMatrix * instanceMatrix * vec4(position, 1.0));
}`;
export const LIGHT_POOL_FRAGMENT_GLSL = `in vec2 vPoolUv;
in vec3 vPoolTint;
out vec4 outColor;
void main() {
  vec2 d = vPoolUv * 2.0 - 1.0;
  float r2 = dot(d, d);
  float glow = poolStrength * exp(-3.0 * r2) * (1.0 - smoothstep(0.55, 1.0, r2));
  outColor = vec4(vPoolTint * glow, glow);
}`;

/** A3/W6: WGSL twin of the light pool for the WebGPU backend; WebGL2 keeps drawing the GLSL above (same pixels). */
export const LIGHT_POOL_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct PoolVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) poolUv: vec2<f32>,
  @location(1) poolTint: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>, ${WGSL_INSTANCE_INPUTS},
  @location(12) a_instanceColor: vec4<f32>) -> PoolVarying {
  var out: PoolVarying;
  out.poolUv = a_uv;
  out.poolTint = a_instanceColor.rgb;
  let instanceMatrix = mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * (aura.u_modelMatrix * instanceMatrix * vec4<f32>(a_position, 1.0)));
  return out;
}`);
export const LIGHT_POOL_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vPoolUv: vec2<f32>, @location(1) vPoolTint: vec3<f32>) -> @location(0) vec4<f32> {
  let d = vPoolUv * 2.0 - vec2<f32>(1.0);
  let r2 = dot(d, d);
  let glow = aura.u_poolStrength * exp(-3.0 * r2) * (1.0 - smoothstep(0.55, 1.0, r2));
  return vec4<f32>(vPoolTint * glow, glow);
}`);

/** The pool's `material.custom` spec (GLSL for WebGL2, WGSL twin for WebGPU). */
export function lightPoolSpec(strength: number): Parameters<typeof material.custom>[0] {
  return {
    glsl: { vertex: LIGHT_POOL_VERTEX_GLSL, fragment: LIGHT_POOL_FRAGMENT_GLSL },
    wgsl: { vertex: LIGHT_POOL_VERTEX_WGSL, fragment: LIGHT_POOL_FRAGMENT_WGSL },
    uniforms: { poolStrength: { type: "f32", value: strength } },
    transparent: true,
    depthWrite: false,
    blending: "additive",
    side: "double"
  };
}

function lightPoolMaterial(strength: number) {
  return material.custom(lightPoolSpec(strength));
}

/** Pool transform for tower i: centred 45% of the way from the tower base to the centre spot, stretched along the aim. */
export function lightPoolTransform(i: number): { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] } {
  const [x, z] = FLOOD_TOWERS[i];
  return { position: [x * 0.55, 0.025, z * 0.55], rotation: [0, Math.atan2(-x, -z), 0], scale: [18, 1, 28] };
}

/** FC47-P3: the two far banks the broadcast camera faces (the main-stand flood and its partner across the halfway line). */
export const FLARE_TOWERS: readonly number[] = [MAIN_FLOOD_TOWER, 0];
/**
 * FC47-P3 lens flares on the two main banks at night (lights.lensFlare, frustum occlusion: no on-screen occluder test,
 * so a flare also shows through a stand roof; edge fade 0.2). Three elements each (glow on the lamp head, two small
 * ghosts) in the venue's flood colour; day venues get none. Expected cost: 6 additive sprites on the sprite path.
 */
export function floodFlareNodes(venue: VenueId, mode?: FcLookMode): any[] {
  const vl = VENUE_LOOKS[venue];
  const m = mode ?? fcLookMode(venue);
  if (m === "original") return [];
  if (m === "hybrid" ? !HYBRID_LAYERS[venue].flares : !vl.floodShadow) return [];
  const flareColor = m === "hybrid" ? VENUES[venue].floodColor : vl.floodColor;
  return FLARE_TOWERS.map((i) => {
    const [x, z] = FLOOD_TOWERS[i]!;
    return lights.lensFlare({
      name: `fc-flood-flare-${i}`,
      position: [x * 0.94, FLOOD_HEAD_Y, z * 0.94],
      elements: [
        { size: 260, distance: 0, color: flareColor },
        { size: 46, distance: 0.55, color: flareColor },
        { size: 90, distance: 0.9, color: flareColor }
      ],
      occlusion: "frustum", edgeFade: 0.2, intensity: i === MAIN_FLOOD_TOWER ? 0.9 : 0.6
    });
  });
}

/** Night venues: intensity of the three secondary tower spots relative to the main-stand flood. */
export const SECONDARY_FLOOD_SCALE = 0.6;

/** The 4.6.2 floods: one batched 4-corner floodlight tower assembly, four spots and cones (hybrid: spots x `scale`). */
function originalFloodNodes(v: VenueSpec, scale = 1, coneIntensity = 0.3, pools = 0, shadowTower = -1): any[] {
  const nodes: any[] = [buildFloodlightTowersBatchedNode(FLOOD_TOWERS, v.floodColor, FLOOD_HEAD_Y)];
  FLOOD_TOWERS.forEach(([x, z], i) => {
    nodes.push(
      lights.spot({ name: `flood-spot-${i}`, position: [x * 0.94, FLOOD_HEAD_Y, z * 0.94], target: [0, 0, 0], angle: 0.52, penumbra: 0.5, intensity: ORIGINAL_LOOKS[v.id].flood * scale, color: v.floodColor, distance: 90,
        ...(i === shadowTower ? { shadow: { filter: "pcss", mapSize: 2048, softness: 1.2 } } : {}) } as any),
      effects.lightCone({ name: `flood-cone-${i}`, position: [x * 0.94, FLOOD_HEAD_Y - 0.4, z * 0.94], direction: [-x * 0.05, -1, -z * 0.05], color: v.floodColor, intensity: coneIntensity, length: 13, coneAngle: 0.4, softness: 0.6 } as any)
        .runtime(gameRuntime(`flood-cone-${i}`))
    );
  });
  if (pools > 0) {
    // phase 3 hybrid: a soft additive pool on the turf under each tower (one draw), so the night pitch falls off
    // from the floods toward the centre instead of reading evenly lit
    nodes.push((instances as any).plane({
      name: "fc-flood-pools", size: [1, 1, 1],
      transforms: FLOOD_TOWERS.map((_, i) => lightPoolTransform(i)),
      colors: FLOOD_TOWERS.map(() => v.floodColor),
      material: lightPoolMaterial(pools)
    }).runtime(gameRuntime("fc-flood-pools")));
  }
  return nodes;
}

function floodNodes(v: VenueSpec, gates: FcEngineGates, mode?: FcLookMode): any[] {
  const m = mode ?? fcLookMode(v.id);
  if (m === "original") return originalFloodNodes(v);
  if (m === "hybrid") {
    const hl = HYBRID_LAYERS[v.id];
    // phase 3: at night the main-stand spot casts the players' shadows (PCSS 2048), so the flood reads as the key. The
    // engine defect behind the `spotShadow` gate is fixed in 90bbc7c2e, so the hybrid path opts in by default
    // (`?spotShadow=off` keeps the 4.6.2 shadowless spots).
    return originalFloodNodes(v, hl.floodScale, hl.coneIntensity, v.night ? hl.pools : 0, v.night && hybridSpotShadow() ? MAIN_FLOOD_TOWER : -1);
  }
  const vl = VENUE_LOOKS[v.id];
  const nodes: any[] = [buildFloodlightTowersBatchedNode(FLOOD_TOWERS, vl.floodColor, FLOOD_HEAD_Y)];
  FLOOD_TOWERS.forEach(([x, z], i) => {
    if (vl.cones > 0) {
      nodes.push(
        effects.lightCone({ name: `flood-cone-${i}`, position: [x * 0.94, FLOOD_HEAD_Y - 0.4, z * 0.94], direction: [-x * 0.05, -1, -z * 0.05], color: vl.floodColor, intensity: vl.cones, length: 13, coneAngle: 0.4, softness: 0.6 } as any)
          .runtime(gameRuntime(`flood-cone-${i}`))
      );
    }
  });
  if (vl.flood > 0) {
    // The main-stand flood: the night key (PCSS 2048, the scene's one production shadow), aimed past the centre spot so
    // the far half of the pitch still reads; on the sunset venue an unshadowed bank under the cascaded sun.
    nodes.push(
      lights.spot({
        name: "fc-main-flood", position: mainFloodPosition(), target: [-6, 0, 4], angle: 0.62, penumbra: 0.55,
        intensity: vl.flood, color: vl.floodColor, distance: 120,
        ...(vl.floodShadow && gates.spotShadow ? { shadow: { filter: "pcss", mapSize: 2048, softness: 1.2 } } : {})
      } as any)
    );
  }
  if (vl.floodShadow) {
    const others = FLOOD_TOWERS.map((_, i) => i).filter((i) => i !== MAIN_FLOOD_TOWER);
    nodes.push(
      (instances as any).plane({
        name: "fc-flood-pools", size: [1, 1, 1],
        transforms: others.map(lightPoolTransform),
        colors: others.map(() => vl.floodColor),
        material: lightPoolMaterial(Math.min(0.32, vl.flood * 0.05))
      }).runtime(gameRuntime("fc-flood-pools"))
    );
    // Phase 2: the pools alone left the night pitch far darker than 4.6.2 (four 2.3 tower spots); the other three
    // banks are real unshadowed spots again at SECONDARY_FLOOD_SCALE of the main flood (the main flood keeps the shadow).
    for (const i of others) {
      const [x, z] = FLOOD_TOWERS[i]!;
      nodes.push(lights.spot({
        name: `fc-flood-${i}`, position: [x * 0.94, FLOOD_HEAD_Y, z * 0.94], target: [0, 0, 0], angle: 0.56, penumbra: 0.55,
        intensity: vl.flood * SECONDARY_FLOOD_SCALE, color: vl.floodColor, distance: 100
      } as any));
    }
  }
  return nodes;
}

/* ------------------------------------------------------------------ */
/*  Sky, weather, haze shafts and venue post (FC47-S1/S2/S3, P1)       */
/* ------------------------------------------------------------------ */

/** Particle counts of the weather volumes (reduced motion halves emission, PRD 6.3). */
export function weatherParticleCount(weather: FcVenueLook["weather"], reducedMotion = false): number {
  const base = weather === "rain" ? 3200 : weather === "drizzle" ? 1600 : weather === "snow" ? 2400 : weather === "dust" ? 900 : 0;
  return reducedMotion ? Math.round(base / 2) : base;
}

function weatherNodes(weather: FcVenueLook["weather"], reducedMotion: boolean, splashes = true): any[] {
  const particleCount = weatherParticleCount(weather, reducedMotion);
  switch (weather) {
    case "rain":
      // storm rain slanting across the main-stand flood (wind pushes it toward the camera-left)
      return [effects.rain({ name: "fc-rain", intensity: 0.75, density: 0.85, color: "#c8d8ec", speed: 1.15, wind: [-1.2, -6.5, 0.45], particleCount, splashes, mist: true })];
    case "drizzle":
      return [effects.rain({ name: "fc-drizzle", intensity: 0.3, density: 0.45, color: "#ecd2de", speed: 0.7, wind: [0.5, -4, -0.3], particleCount, splashes: false, mist: true })];
    case "snow":
      return [effects.snow({ name: "fc-snow", intensity: 0.55, density: 0.7, color: "#eef6ff", speed: 0.8, wind: [-0.9, -1.0, -0.3], particleCount })];
    case "dust":
      // dust motes: the snow volume at a crawl, warm and small (FC47-S3)
      return [effects.snow({ name: "fc-dust-motes", intensity: 0.2, density: 0.3, color: "#d9a066", speed: 0.08, wind: [0.35, 0.05, 0.1], size: 0.03, particleCount, mist: false } as any)];
    default:
      return [];
  }
}

/**
 * FC47-V2: three animated aurora curtains over the far stand (effects.auroraRibbon, beam pass) replace the three flat
 * emissive planes. Reduced motion keeps the curtains but cuts sway and shimmer to 30% (PRD 6.3).
 */
export function auroraNodes(reducedMotion = false): any[] {
  const motion = reducedMotion ? 0.3 : 1;
  const bands = [
    { x: -20, y: 21, z: -(PITCH_HZ + 26), color: "#54f0a8", top: "#3fd0c8", width: 46 },
    { x: 4, y: 24, z: -(PITCH_HZ + 32), color: "#7fe8c9", top: "#7a5cff", width: 54 },
    { x: 26, y: 20, z: -(PITCH_HZ + 24), color: "#5ef0b0", top: "#b06cff", width: 40 }
  ];
  return bands.map((b, i) =>
    effects.auroraRibbon({
      name: `fc-aurora-ribbon-${i}`, position: [b.x, b.y, b.z], color: b.color, colorTop: b.top,
      intensity: 1.2, width: b.width, height: 11, segments: 96, sway: 0.9 * motion, shimmer: 0.6 * motion
    } as any).runtime(gameRuntime(`fc-aurora-ribbon-${i}`))
  );
}

export function atmosphereNodes(venue: VenueId, opts: FcSceneOptions = {}): any[] {
  const vl = VENUE_LOOKS[venue];
  const reducedMotion = opts.reducedMotion === true;
  const nodes: any[] = [];
  // PRD D11 original path: 4.6.2 drew no weather, haze or venue post; only the Glacier aurora stays
  const mode = opts.lookMode ?? fcLookMode(venue);
  if (mode === "original") return VENUES[venue].aurora ? auroraNodes(reducedMotion) : [];
  if (mode === "hybrid") {
    // hybrid: weather (no splash decals), aurora, and venue vignette / grain / CA; linear look fog (near >= 95, far >= 380)
    // keeps the emerald pitch, crisp white touchlines, and floodlit stands vivid without near-field exp2 haze washout.
    const hl = HYBRID_LAYERS[venue];
    nodes.push(...weatherNodes(hl.weather, reducedMotion, false));
    if (VENUES[venue].aurora) nodes.push(...auroraNodes(reducedMotion));
    nodes.push(effects.vignette({ name: "fc-vignette", intensity: hl.vignette }));
    if (hl.grain > 0) nodes.push(effects.filmGrain({ name: "fc-grain", intensity: hl.grain }));
    if (hl.chromaticAberration > 0 && !reducedMotion) nodes.push(effects.chromaticAberration({ name: "fc-ca", intensity: hl.chromaticAberration }));
    return nodes;
  }
  if (vl.starSky && fcEngineGates(undefined, opts.engineGates).stars) {
    // FC47-S1: the polar-night star sky (sky node only; dayNight's legacy spheres and its extra moon light stay out)
    const night = sky.dayNight({ hour: vl.starSky.hour, starLimit: vl.starSky.starLimit });
    const skyNode = night.nodes.find((n: any) => n.kind === "sky");
    if (skyNode) nodes.push({ ...skyNode, name: "fc-polar-sky" });
  }
  nodes.push(...weatherNodes(vl.weather, reducedMotion));
  if (VENUES[venue].aurora) nodes.push(...auroraNodes(reducedMotion));
  if (vl.shafts > 0) {
    // FC47-S2: haze shafts from the main-stand flood (S4 god rays; off below Medium, the cones are the Low cue)
    nodes.push(effects.volumetricFog({
      name: "fc-flood-haze", density: 0.12, color: vl.floodColor, intensity: 0.6,
      lightPosition: mainFloodPosition(), godRayDensity: vl.shafts, heightFalloff: 0.08, heightReference: 0
    } as any));
  }
  // FC47-P1: the venue's display post on top of its output preset
  nodes.push(effects.vignette({ name: "fc-vignette", intensity: vl.vignette }));
  if (vl.grain > 0) nodes.push(effects.filmGrain({ name: "fc-grain", intensity: vl.grain }));
  if (vl.chromaticAberration > 0 && !reducedMotion) nodes.push(effects.chromaticAberration({ name: "fc-ca", intensity: vl.chromaticAberration }));
  return nodes;
}

const WAVERS = 26;
function waverTransforms(t: number, cheer: boolean): any[] {
  const out: any[] = [];
  for (let i = 0; i < WAVERS; i++) {
    const bounce = cheer ? Math.abs(Math.sin(t * 9 + i * 1.31)) * 0.26 : Math.sin(t * 2.1 + i) * 0.025;
    out.push({ position: [-PITCH_HX - 1 + i * ((PITCH_HX * 2 + 2) / (WAVERS - 1)), 0.68 + bounce, -(PITCH_HZ + 3.9)], scale: 0.92 });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Node builders                                                      */
/* ------------------------------------------------------------------ */

/** Pitch markings as one instanced box batch: [widthX, lengthZ, x, z] per line (was 25 separate boxes, FC-E1). */
function pitchLines(): [number, number, number, number][] {
  const out: [number, number, number, number][] = [
    [PITCH_HX * 2, 0.12, 0, -PITCH_HZ], [PITCH_HX * 2, 0.12, 0, PITCH_HZ],
    [0.12, PITCH_HZ * 2, -PITCH_HX, 0], [0.12, PITCH_HZ * 2, PITCH_HX, 0], [0.1, PITCH_HZ * 2, 0, 0]
  ];
  for (const sx of [-1, 1] as const) {
    const gx = sx * PITCH_HX;
    out.push(
      [0.1, BOX_HALF_W * 2, sx * (PITCH_HX - BOX_DEPTH), 0],
      [BOX_DEPTH, 0.1, gx - sx * BOX_DEPTH / 2, -BOX_HALF_W],
      [BOX_DEPTH, 0.1, gx - sx * BOX_DEPTH / 2, BOX_HALF_W],
      [0.1, 4.6 * 2, sx * (PITCH_HX - 3.2), 0],
      [3.2, 0.1, gx - sx * 1.6, -4.6],
      [3.2, 0.1, gx - sx * 1.6, 4.6]
    );
  }
  return out;
}

const STRIPES = 10;
/** Mow stripes as one instanced plane batch (was 10 planes, FC-E1). Colours alternate pitch / pitchAlt. */
export function stripeInstances(v: VenueSpec): { transforms: any[]; colors: string[] } {
  const w = (PITCH_HX * 2) / STRIPES;
  const transforms: any[] = [];
  const colors: string[] = [];
  for (let i = 0; i < STRIPES; i++) {
    transforms.push({ position: [-PITCH_HX + w / 2 + i * w, 0.005, 0], scale: [w - 0.02, 1, PITCH_HZ * 2 - 0.02] });
    colors.push(i % 2 ? v.pitchAlt : v.pitch);
  }
  return { transforms, colors };
}

/**
 * Ground, apron and pitch materials of a venue (shared by the scene build and applyVenue, so a re-tint never undoes
 * the venue's turf). FC47-M1: the pitch roughness comes from the look row (0.35 wet on Munich and Kyoto).
 */
export function surfaceMaterials(v: VenueSpec, mode?: FcLookMode) {
  const vl = VENUE_LOOKS[v.id];
  const m = mode ?? fcLookMode(v.id);
  if (m === "hybrid") {
    const hl = HYBRID_LAYERS[v.id];
    return {
      ground: material.pbr({ color: v.ground, roughness: 0.96 }),
      apron: material.pbr({ color: v.apron, roughness: 0.88 }),
      pitch: hl.surface === "grass"
        ? material.custom(pitchTurfShaderSpec({
          pitchHex: v.pitch,
          pitchAltHex: v.pitchAlt,
          floodHex: v.floodColor,
          wetness: v.id === "munich" ? 0.46 : 0.36
        }))
        : hl.surface === "plain"
          ? material.pbr({ color: hl.pitchColor ?? v.pitch, roughness: hl.turfRoughness })
          : hl.surface === "dirt"
            ? dirtPitchMaterial(hl.pitchColor ?? v.pitch, hl.turfRoughness)
            : pitchMaterial(hl.pitchColor !== undefined ? { ...v, pitch: hl.pitchColor } : v, hl.surface, hl.turfRoughness)
    };
  }
  if (m === "original") {
    return {
      ground: material.pbr({ color: v.ground, roughness: 0.96 }),
      apron: material.pbr({ color: v.apron, roughness: 0.9 }),
      pitch: material.pbr({ color: v.pitch, roughness: 0.85 })
    };
  }
  return {
    ground: material.pbr({ color: v.ground, roughness: 0.96 }),
    apron: material.pbr({ color: v.apron, roughness: Math.min(0.9, vl.turfRoughness + 0.1) }),
    pitch: pitchMaterial(v)
  };
}

/** Turf tiling over the pitch plane (FC47-M1: 24 x 16 tiles, about 2.5 x 2.25 m each). */
export const TURF_TILES: readonly [number, number] = [24, 16];

/** Mix a hex colour toward white (0 = unchanged, 1 = white): the texture already carries the grass colour. */
export function lightenHex(hex: string, t: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * t);
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * FC47-M1 pitch surface per venue: real turf (acg-grass005 colour, normal and roughness, tiled 24x16; the venue colour
 * is a light tint over the texture) on the grass venues with the wet roughness of the look row; clearcoat ice on
 * Glacier; flat colour on the dirt, sand and salt venues (Uyuni's mirror is FC47-M3).
 */
export function pitchMaterial(v: VenueSpec, surface: FcVenueLook["surface"] = VENUE_LOOKS[v.id].surface, roughness = VENUE_LOOKS[v.id].turfRoughness) {
  if (surface === "grass") {
    const tile = { scale: TURF_TILES };
    return material.pbr({
      color: lightenHex(v.pitch, 0.5), roughness,
      texture: assets.fcTurfColor, normal: assets.fcTurfNormal, roughnessMap: assets.fcTurfRough, normalScale: 0.8,
      texTransforms: { baseColor: tile, normal: tile, metallicRoughness: tile }
    });
  }
  if (surface === "ice") {
    return material.pbr({ color: v.pitch, roughness, clearcoat: 1, clearcoatRoughness: 0.08 });
  }
  return material.pbr({ color: v.pitch, roughness });
}

/** Phase 3 hybrid Favela: the packed-dirt pitch takes the acg-concrete034 grain (tiled 16x10) under the venue colour. */
export const DIRT_TILES: readonly [number, number] = [16, 10];
export function dirtPitchMaterial(color: string, roughness: number) {
  const tile = { scale: DIRT_TILES };
  return material.pbr({
    color: lightenHex(color, 0.1), roughness,
    texture: assets.fcConcreteColor, normal: assets.fcConcreteNormal, roughnessMap: assets.fcConcreteRough, normalScale: 0.6,
    texTransforms: { baseColor: tile, normal: tile, metallicRoughness: tile }
  });
}

/** Mow stripes over textured turf: a 30% tint on GU47; 10% subtle sheen over the custom mowed turf shader on hybrid. */
export const STRIPE_OPACITY = 0.3;
export function stripeMaterial(v: VenueSpec, mode?: FcLookMode) {
  const m = mode ?? fcLookMode(v.id);
  const surface = m === "hybrid" ? HYBRID_LAYERS[v.id].surface : VENUE_LOOKS[v.id].surface;
  const roughness = m === "hybrid" ? HYBRID_LAYERS[v.id].turfRoughness : VENUE_LOOKS[v.id].turfRoughness;
  if (m === "hybrid" && surface === "grass") {
    return material.pbr({ color: "#ffffff", roughness, opacity: 0.1, depthWrite: false });
  }
  return surface === "grass" && m !== "original"
    ? material.pbr({ color: "#ffffff", roughness, opacity: STRIPE_OPACITY, depthWrite: false })
    : material.pbr({ color: "#ffffff", roughness: 0.85 });
}

/** Favela cage walls: the acg-concrete034 set (FC47-M1), tinted with the venue wall colour. */
export function cageWallMaterial(v: VenueSpec) {
  return material.pbr({
    color: lightenHex(v.wallColor, 0.35), roughness: 0.9,
    texture: assets.fcConcreteColor, normal: assets.fcConcreteNormal, roughnessMap: assets.fcConcreteRough, normalScale: 0.7
  });
}

/** Pitch-line paint: lit by the floods, a faint self-glow only (<= 0.1, the art-direction emissive-fill limit). */
export function lineMaterial(v: VenueSpec) {
  return material.pbr({ color: v.line, roughness: 0.6, emissive: v.line, emissiveIntensity: 0.08 });
}

/** Centre circle as chords: radius CIRCLE_R, 0.12 m paint, each chord tangent to the ring at its midpoint. */
export const CIRCLE_SEGMENTS = 48;
export function centreCircleTransforms(): { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] {
  const out: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const chord = 2 * CIRCLE_R * Math.sin(Math.PI / CIRCLE_SEGMENTS) * 1.04;
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    const a = ((i + 0.5) / CIRCLE_SEGMENTS) * Math.PI * 2;
    out.push({ position: [Math.cos(a) * CIRCLE_R, 0.014, Math.sin(a) * CIRCLE_R], rotation: [0, -a, 0], scale: [0.12, 0.018, chord] });
  }
  return out;
}

function pitchNodes(v: VenueSpec, mode?: FcLookMode): any[] {
  const lineMat = lineMaterial(v);
  const surfaces = surfaceMaterials(v, mode);
  const m = mode ?? fcLookMode(v.id);
  // FC47-PF1: ground-flush paint and planes receive shadows but do not need
  // to be redrawn into every shadow cascade. Keep the original look intact.
  const groundShadow = m === "original" ? {} : { castShadow: false };

  // Horizontal XZ planes use size: [widthX, 1, depthZ]
  const nodes: any[] = [
    primitives.plane({ name: "fc-ground", size: [110, 1, 90], material: surfaces.ground, ...groundShadow })
      .position(0, -0.03, 0).runtime(gameRuntime("fc-ground")),
    primitives.plane({ name: "fc-apron", size: [PITCH_HX * 2 + 7, 1, PITCH_HZ * 2 + 7], material: surfaces.apron, ...groundShadow })
      .position(0, -0.012, 0).runtime(gameRuntime("fc-apron")),
    primitives.plane({ name: "fc-pitch", size: [PITCH_HX * 2, 1, PITCH_HZ * 2], material: surfaces.pitch, ...groundShadow })
      .position(0, 0.002, 0).runtime(gameRuntime("fc-pitch"))
  ];
  // FC47-M3: Uyuni's mirror flat: a planar reflection over the pitch (thin water film tint), under the lines (y 0.014)
  // and above the pitch plane. Doubles the scene draws in its capture: `?mirror=off` is the QA fallback (phase 2
  // measures it against the 480-draw Uyuni budget and picks the probe fallback if it is over).
  const mirror = m === "hybrid" ? HYBRID_LAYERS[v.id].mirror : m === "gu47" ? VENUE_LOOKS[v.id].mirror : null;
  if (mirror && mirrorEnabled()) {
    nodes.push(engineSurfaces.mirror({ name: "fc-mirror", size: [PITCH_HX * 2, PITCH_HZ * 2], resolution: mirror.resolution, tint: mirror.tint, position: [0, 0.006, 0] }));
  }

  // 10 mow stripes across the length of the pitch (one instanced batch; hidden on venues without stripes)
  if (v.stripes) {
    const st = stripeInstances(v);
    nodes.push((instances as any).plane({ name: "fc-stripes", size: [1, 1, 1], transforms: st.transforms, colors: st.colors, material: stripeMaterial(v, mode), ...groundShadow })
      .runtime(gameRuntime("fc-stripes")));
  }

  // touchlines, goal lines, centre line, boxes and six-yard boxes: one instanced batch
  nodes.push((instances as any).box({
    name: "fc-lines", size: [1, 1, 1], material: lineMat, ...groundShadow,
    transforms: pitchLines().map(([w, l, x, z]) => ({ position: [x, 0.014, z], scale: [w, 0.018, l] }))
  }));
  // centre circle + spot. The unit torus scaled [R, 0.05, 0.05] drew a flat 9 m dash, not a ring (4.6.2); the hybrid
  // path draws the circle as CIRCLE_SEGMENTS thin chords in one instanced batch.
  nodes.push(
    m === "hybrid"
      ? (instances as any).box({ name: "line-circle", size: [1, 1, 1], material: lineMat, transforms: centreCircleTransforms(), ...groundShadow })
      : primitives.torus({ name: "line-circle", size: [CIRCLE_R, 0.05, 0.05], material: lineMat, ...groundShadow })
        .position(0, 0.02, 0).rotate(Math.PI / 2, 0, 0),
    primitives.cylinder({ name: "line-spot-c", size: [0.22, 0.016, 0.22], material: lineMat, ...groundShadow }).position(0, 0.015, 0)
  );

  // penalty spots both ends
  for (const sx of [-1, 1] as const) {
    nodes.push(
      primitives.cylinder({ name: `pen-spot-${sx}`, size: [0.2, 0.016, 0.2], material: lineMat, ...groundShadow }).position(sx * PEN_X, 0.015, 0)
    );
  }

  // corner flags + arc quarter-marks
  const flagMat = material.emissive({ color: v.accent, emissive: v.accent, emissiveIntensity: 0.9, practical: true });
  if (m === "original") {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      nodes.push(
        primitives.cylinder({ name: `flag-${sx}-${sz}`, size: [0.03, 1.3, 0.03], material: material.pbr({ color: "#f2f0e2", roughness: 0.6 }) })
          .position(sx * (PITCH_HX - 0.15), 0.65, sz * (PITCH_HZ - 0.15)),
        primitives.box({ name: `flagtip-${sx}-${sz}`, size: [0.22, 0.16, 0.02], material: flagMat })
          .position(sx * (PITCH_HX - 0.15), 1.28, sz * (PITCH_HZ - 0.15))
      );
    }
  } else {
    const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx * (PITCH_HX - 0.15), sz * (PITCH_HZ - 0.15)] as const));
    nodes.push(
      instances.custom(buildCornerPoleGeometry(), {
        name: "fc-corner-poles",
        material: material.pbr({ color: "#f2f0e2", roughness: 0.36, metalness: 0.08, clearcoat: 0, sheen: 0 }),
        transforms: corners.map(([x, z]) => ({ position: [x, 0.65, z] }))
      }),
      instances.custom(buildCornerPennantGeometry(), {
        name: "fc-corner-flags",
        material: flagMat,
        transforms: corners.map(([x, z]) => ({ position: [x, 1.22, z], rotation: [0, x > 0 ? Math.PI : 0, 0] }))
      })
    );
  }
  return nodes;
}

let turfDustAtlasCache: ReturnType<typeof createFlipbookAtlas> | null = null;
let goalSparksAtlasCache: ReturnType<typeof createFlipbookAtlas> | null = null;
function turfDustAtlas() {
  turfDustAtlasCache ??= createFlipbookAtlas("dust", [208, 228, 236]);
  return turfDustAtlasCache;
}
function goalSparksAtlas() {
  goalSparksAtlasCache ??= createFlipbookAtlas("sparks", [222, 255, 92]);
  return goalSparksAtlasCache;
}

function goalNodes(sx: -1 | 1, hybrid = false, accentHex = "#d8ff3e"): any[] {
  const gx = sx * PITCH_HX;
  const netMat = hybrid
    ? material.custom(goalNetShaderSpec(accentHex))
    : material.pbr({ color: "#ffffff", emissive: "#e2e8f0", emissiveIntensity: 0.08, roughness: 0.85, opacity: 0.42 });
  const backX = gx + sx * GOAL_DEPTH;
  return [
    // WP-09 / FC-05: procedural multi-material FIFA goalframe built directly at exact [2.6, 2.85, 7.6] m bounds (scale 1x).
    buildFifaGoalFrameNode(sx, accentHex).runtime(gameRuntime(`fc-goal-mesh-${sx}`)),
    // Contoured subdivided 3D goal-net enclosure panels driven by `goalNetShaderSpec` + `goalRipple`
    geometry.custom(buildGoalNetBackGeometry(sx), {
      name: `net-back-${sx}`,
      material: netMat,
      position: [backX, GOAL_H / 2, 0],
      castShadow: false
    }).runtime(gameRuntime(`net-back-${sx}`)),
    geometry.custom(buildGoalNetRoofGeometry(sx), {
      name: `net-roof-${sx}`,
      material: netMat,
      position: [gx + sx * GOAL_DEPTH / 2, GOAL_H - 0.02, 0],
      castShadow: false
    }).runtime(gameRuntime(`net-roof-${sx}`)),
    geometry.custom(buildGoalNetSideGeometry(sx, -1), {
      name: `net-n-${sx}`,
      material: netMat,
      position: [gx + sx * GOAL_DEPTH / 2, GOAL_H / 2, -GOAL_HALF_W + 0.06],
      castShadow: false
    }).runtime(gameRuntime(`net-n-${sx}`)),
    geometry.custom(buildGoalNetSideGeometry(sx, 1), {
      name: `net-s-${sx}`,
      material: netMat,
      position: [gx + sx * GOAL_DEPTH / 2, GOAL_H / 2, GOAL_HALF_W - 0.06],
      castShadow: false
    }).runtime(gameRuntime(`net-s-${sx}`))
  ];
}

/** Half-width of the opening left in each Favela end wall for the goal mouth (m). Shared with sim.ts via dims. */
const CAGE_GAP_HALF = CAGE_GOAL_GAP;
/** Largest side of the goal-net GLB (manifest bounds [1.897, 1.282, 0.8]). */
export const GOAL_NET_GLB_MAX = 1.897;
const CAGE_TAGS = ["w-n", "w-s", "e-n", "e-s", "n", "s"] as const;

/** Sponsor hoarding ring transforms (FC47-PF1 batch). */
export function hoardingTransforms(): { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] {
  const hz = PITCH_HZ + 2.4;
  const hx = PITCH_HX + 2.4;
  return ([
    [0, -hz, hx * 2, 0], [0, hz, hx * 2, 0],
    [-hx, 0, hz * 2, Math.PI / 2], [hx, 0, hz * 2, Math.PI / 2]
  ] as const).map(([x, z, w, rot]) => ({ position: [x, 0.4, z], rotation: [0, rot, 0], scale: [w, 0.8, 0.16] }));
}

/** Bleacher tier transforms for a venue: far and both end stands per tier < standCount, near stand tiers 0-1 at 3+. */
export function standTransforms(v: VenueSpec): { position: [number, number, number]; scale: [number, number, number] }[] {
  const out: { position: [number, number, number]; scale: [number, number, number] }[] = [];
  for (let tier = 0; tier < 4; tier++) {
    if (v.standCount <= tier) continue;
    const y = 0.9 + tier * 1.3;
    const wFar = PITCH_HX * 2 + 8 + tier * 3.4;
    const lEnd = PITCH_HZ * 2 + 6 + tier * 2;
    out.push(
      { position: [0, y, -(PITCH_HZ + 4.6 + tier * 2.2)], scale: [wFar, 0.55, 2.0] },
      { position: [-(PITCH_HX + 4.6 + tier * 2.2), y, 0], scale: [2.0, 0.55, lEnd] },
      { position: [PITCH_HX + 4.6 + tier * 2.2, y, 0], scale: [2.0, 0.55, lEnd] }
    );
  }
  if (v.standCount >= 3) {
    for (let tier = 0; tier < 2; tier++) {
      const y = 0.9 + tier * 1.3;
      out.push({ position: [0, y * 0.85, PITCH_HZ + 5.2 + tier * 2.0], scale: [PITCH_HX * 2 + 8 + tier * 3.4, 0.55, 1.8] });
    }
  }
  return out;
}

/** WP-36 stand module (GLB 1.903 x 0.832 x 0.543 m, centred, seats facing +Z): scale and the four far-deck slots. */
export const STAND_MODULE_SCALE = 10.5;
/** Wave-2 players' tunnel (GLB 1.674 x 0.795 x 1.901 m, mouth toward +Z): fitted depth and far-side x. */
const PLAYER_TUNNEL_DEPTH = 5.1;
const PLAYER_TUNNEL_X = -13;
/**
 * Meshy-07 (FC47-AN1): six rigged fans (three Meshy models, two each, 5k triangles, one skinned draw apiece) standing
 * at the far rail just behind the sponsor hoardings, where the broadcast frame sees them over the boards. They idle
 * and, while the crowd cheers (goal phase, won final), alternate the cheer and fist-pump clips along the row. They are
 * mounted visible at full scale and never hidden (a skinned model created hidden may never draw once shown); venues
 * without a bowl simply do not mount them. Presentation only: nothing collides with them.
 */
export const PITCH_FANS: readonly { readonly x: number; readonly yaw: number; readonly model: 0 | 1 | 2 }[] = [
  { x: -8.2, yaw: 0.22, model: 0 }, { x: -5.0, yaw: 0.08, model: 1 }, { x: -1.7, yaw: -0.12, model: 2 },
  { x: 2.2, yaw: 0.15, model: 0 }, { x: 5.3, yaw: -0.06, model: 2 }, { x: 8.7, yaw: -0.2, model: 1 }
];
/** Fan stand line: 0.6 m behind the far hoarding (z = -(PITCH_HZ + 2.4)), in front of the first stand tier. */
export const PITCH_FAN_Z = -(PITCH_HZ + 3.0);
/** Fitted fan height: between the capsule crowd and the 2.22 m athletes, so the row reads as people at the rail. */
export const PITCH_FAN_HEIGHT = 2.0;
export function pitchFanNodes(): any[] {
  return PITCH_FANS.map((f, i) =>
    buildArticulatedPitchFanNode(i, f.model, PITCH_FAN_HEIGHT, gameRuntime)
      .position(f.x, 0, PITCH_FAN_Z)
      .rotate(0, f.yaw, 0)
  );
}
/** The clip fan `i` plays: idle, or cheer / fist pump alternating along the row while the crowd cheers. */
export function pitchFanClip(i: number, cheering: boolean): "idle" | "cheer" | "pump" {
  return cheering ? (i % 2 === 0 ? "cheer" : "pump") : "idle";
}

export function standModuleTransforms(v: VenueSpec): { position: [number, number, number]; scale: [number, number, number] }[] {
  const s = STAND_MODULE_SCALE;
  const topTier = Math.max(0, v.standCount - 1);
  // behind the venue's top far tier (no bowl: behind the hoardings), base just under that tier's top
  const z = v.standCount > 0 ? -(PITCH_HZ + 4.6 + topTier * 2.2 + 1 + 0.272 * s) : -(PITCH_HZ + 6 + 0.272 * s);
  const baseY = v.standCount > 0 ? 0.9 + topTier * 1.3 - 1.2 : -0.5;
  const w = 1.9 * s;
  return [-1.5, -0.5, 0.5, 1.5].map((i) => ({ position: [i * w, baseY + 0.42 * s, z], scale: [s, s, s] }));
}

/** Structural steel column + fascia transforms grounding `fc-stadium-bowl` to `y = 0` so upper canopies never float. */
function roofTrussTransforms(v: VenueSpec): { position: [number, number, number]; scale: [number, number, number] }[] {
  const s = STAND_MODULE_SCALE;
  const topTier = Math.max(0, v.standCount - 1);
  const z = v.standCount > 0 ? -(PITCH_HZ + 4.6 + topTier * 2.2 + 1 + 0.272 * s) : -(PITCH_HZ + 6 + 0.272 * s);
  const deckY = Math.max(2.6, (v.standCount > 0 ? 0.9 + topTier * 1.3 - 1.2 : -0.5) + 0.42 * s);
  const w = 1.9 * s;
  const totalSpan = w * 4 + 1.2;
  const out: { position: [number, number, number]; scale: [number, number, number] }[] = [];
  // Vertical I-beam support columns from ground y = 0 up into the upper stand canopy
  for (const idx of [-2, -1, 0, 1, 2]) {
    out.push(
      { position: [idx * w, deckY * 0.52, z - 1.6], scale: [0.55, deckY * 1.04, 0.55] },
      { position: [idx * w, deckY * 0.44, z + 1.4], scale: [0.42, deckY * 0.88, 0.42] }
    );
  }
  // Continuous horizontal concourse fascia beams uniting all four upper stand modules
  out.push(
    { position: [0, Math.max(1.1, deckY - 2.3), z + 1.5], scale: [totalSpan, 0.65, 0.7] },
    { position: [0, deckY + 2.85, z - 0.3], scale: [totalSpan + 0.8, 0.42, 3.6] },
    { position: [0, Math.max(0.7, deckY * 0.5), z - 2.0], scale: [totalSpan, deckY, 0.35] }
  );
  return out;
}

function stadiumNodes(v: VenueSpec, gates: FcEngineGates = fcEngineGates(), mode?: FcLookMode): any[] {
  const m = mode ?? fcLookMode(v.id);
  const isHybrid = m === "hybrid";
  const nodes: any[] = [];

  /* ---- Favela cage walls (ball bounces off these) ---- */
  const wallMat = cageWallMaterial(v);
  const railMat = material.emissive({ color: v.accent, emissive: v.accent, emissiveIntensity: 0.5, practical: true });
  // End walls stop at the posts (FC-10): each goal line has two wall pieces, from the corner to GOAL_HALF_W + 0.2,
  // so the goal mouth stays open; sim.ts exempts the same gap from the cage bounce.
  const endLen = PITCH_HZ + 0.3 - CAGE_GAP_HALF;
  const endZ = CAGE_GAP_HALF + endLen / 2;
  const wallDefs: [string, number, number, number, number][] = [
    ["w-n", -PITCH_HX - 0.35, -endZ, 0.3, endLen],
    ["w-s", -PITCH_HX - 0.35, endZ, 0.3, endLen],
    ["e-n", PITCH_HX + 0.35, -endZ, 0.3, endLen],
    ["e-s", PITCH_HX + 0.35, endZ, 0.3, endLen],
    ["n", 0, -PITCH_HZ - 0.35, PITCH_HX * 2 + 1, 0.3],
    ["s", 0, PITCH_HZ + 0.35, PITCH_HX * 2 + 1, 0.3]
  ];
  for (const [tag, x, z, w, l] of wallDefs) {
    nodes.push(
      primitives.box({ name: `cage-${tag}`, size: [w, 1.5, l], material: wallMat })
        .position(x, 0.75, z).runtime(gameRuntime(`cage-${tag}`)),
      primitives.box({ name: `cage-rail-${tag}`, size: [w, 0.08, l], material: railMat })
        .position(x, 1.55, z).runtime(gameRuntime(`cage-rail-${tag}`))
    );
  }

  /* ---- Perimeter LED hoarding ribbon: one instanced sculpted cabinet batch (4 perimeter boards in 1 draw call) ---- */
  const hoardingMat = isHybrid
    ? material.custom(hoardingLedShaderSpec(v.hoarding, v.accent))
    : material.emissive({ color: v.hoarding, emissive: v.accent, emissiveIntensity: 0.38, practical: true });
  nodes.push(
    instances.custom(buildHoardingCabinetGeometry(), { name: "fc-hoardings", transforms: hoardingTransforms(), material: hoardingMat })
      .runtime(gameRuntime("fc-hoardings"))
  );

  /* ---- Bleacher bowl: the venue's stepped tiers as one instanced batch (preserves exact venue tier counts) ---- */
  const MAX_TIERS = 4;
  const standT = standTransforms(v);
  if (standT.length > 0) {
    nodes.push(
      instances.custom(buildStandTierGeometry(), {
        name: "fc-stands",
        transforms: standT,
        material: isHybrid
          ? material.pbr({ color: "#151d28", roughness: 0.78, metalness: 0.14, clearcoat: 0, sheen: 0 })
          : material.pbr({ color: "#18202c", roughness: 0.9, clearcoat: 0, sheen: 0 })
      }).runtime(gameRuntime("fc-stands"))
    );
  }

  /* ---- Crowd — articulated 5-slot supporter batches (`articulatedFolkSlots` + `instances.custom`, <= 6 crowd draws) ---- */
  const crowdT: any[] = [];
  const coatColors: string[] = [];
  const scarfColors: string[] = [];
  const skinColors: string[] = [];
  const hairColors: string[] = [];
  const warm = ["#b2352f", "#1e293b", "#2a374b", "#c56b3d", "#9f312c", "#35465c", "#d9e8f7"];
  const cool = ["#1e2b3c", "#2b3d54", "#b2352f", "#3a5373", "#182230", "#d9e8f7", "#537895"];
  const skinCols = ["#c68a5a", "#8a5f42", "#e0b48a", "#6e4a30", "#d09a6a"];
  const scarfCols = ["#b2352f", "#d9e8f7", v.accent, "#f2f0e2"];
  const hairCols = ["#1c1917", "#3b281c", "#6b442a", "#b2352f", "#16233e", v.accent];
  const cols = v.crowdWarm ? warm : cool;
  const crowdRng = (() => {
    let s = 0xa1f3c9;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
  })();
  const pushSupporter = (px: number, py: number, pz: number, yaw: number, idx: number, tier: number) => {
    const s = 0.88 + crowdRng() * 0.12;
    crowdT.push({ position: [px, py, pz], rotation: [0, yaw, 0], scale: s });
    coatColors.push(cols[(crowdRng() * cols.length) | 0]);
    scarfColors.push(scarfCols[(idx + tier * 2) % scarfCols.length]);
    skinColors.push(skinCols[(idx + tier * 3) % skinCols.length]);
    hairColors.push(hairCols[(idx * 5 + tier) % hairCols.length]);
  };
  const tiers = v.standCount > 0 ? Math.min(MAX_TIERS, v.standCount) : 0;
  for (let tier = 0; tier < tiers; tier++) {
    const footY = 0.96 + tier * 1.3;
    const zFar = -(PITCH_HZ + 4.55 + tier * 2.2);
    const xSide = PITCH_HX + 4.55 + tier * 2.2;
    const n = isHybrid ? 56 + tier * 8 : 30 + tier * 4;
    for (let i = 0; i < n; i++) {
      if (crowdRng() < (isHybrid ? 0.08 : 0.12)) continue;
      const fx = -(PITCH_HX + 3.4) + ((PITCH_HX + 3.4) * 2 / n) * i + (crowdRng() - 0.5) * 0.28;
      const fz = zFar + (crowdRng() - 0.5) * 0.36;
      pushSupporter(fx, footY, fz, (crowdRng() - 0.5) * 0.2, i, tier);
      if (i % 2 === 0 && i * 0.58 < PITCH_HZ * 2) {
        const szPos = -PITCH_HZ + i * 0.58;
        pushSupporter(-xSide + (crowdRng() - 0.5) * 0.32, footY, szPos, Math.PI * 0.5, i + 11, tier);
        pushSupporter(xSide + (crowdRng() - 0.5) * 0.32, footY, szPos, -Math.PI * 0.5, i + 23, tier);
      }
      if (tier < 2 && v.standCount >= 3) {
        const nzPos = PITCH_HZ + 5.2 + tier * 2.0 + (crowdRng() - 0.5) * 0.36;
        pushSupporter(fx, footY * 0.85, nzPos, Math.PI + (crowdRng() - 0.5) * 0.2, i + 37, tier);
      }
    }
  }
  if (v.standCount > 0 && crowdT.length > 0) {
    const folk = buildSupporterCrowdSlotGeometries();
    nodes.push(
      instances.custom(folk.coat, {
        name: "fc-crowd",
        transforms: crowdT,
        colors: coatColors,
        material: FC_MAT.supporterKitCloth,
        castShadow: false
      }).runtime(gameRuntime("fc-crowd")),
      instances.custom(folk.scarfTrim, {
        name: "fc-crowd-scarves",
        transforms: crowdT,
        colors: scarfColors,
        material: FC_MAT.supporterScarfCloth,
        castShadow: false
      }).runtime(gameRuntime("fc-crowd-scarves")),
      instances.custom(folk.skin, {
        name: "fc-crowd-heads",
        transforms: crowdT,
        colors: skinColors,
        material: material.pbr({ color: "#ffffff", roughness: 0.62, clearcoat: 0, sheen: 0 }),
        castShadow: false
      }).runtime(gameRuntime("fc-crowd-heads")),
      instances.custom(folk.hairHat, {
        name: "fc-crowd-hair",
        transforms: crowdT,
        colors: hairColors,
        material: material.pbr({ color: "#ffffff", roughness: 0.76, clearcoat: 0, sheen: 0 }),
        castShadow: false
      }).runtime(gameRuntime("fc-crowd-hair")),
      instances.custom(folk.lower, {
        name: "fc-crowd-legs",
        transforms: crowdT,
        material: FC_MAT.supporterDenim,
        castShadow: false
      }).runtime(gameRuntime("fc-crowd-legs"))
    );
  }

  /* ---- Front-row wavers (animated): one instanced articulated cheering supporter batch (6th crowd draw) ---- */
  if (v.standCount > 0) {
    nodes.push(
      instances.custom(buildWaverSupporterGeometry(), {
        name: "fc-wavers",
        material: FC_MAT.supporterKitCloth,
        transforms: waverTransforms(0, false),
        colors: Array.from({ length: WAVERS }, (_, i) => cols[i % cols.length]),
        castShadow: false
      }).runtime(gameRuntime("fc-wavers"))
    );
  }

  /* ---- Meshy-07 (FC47-AN1): rigged front-row fans at the far rail (bowl venues; the original look keeps 4.6.2) ---- */
  if (v.standCount > 0 && (mode ?? fcLookMode(v.id)) !== "original") nodes.push(...pitchFanNodes());

  /* ---- Floodlight towers: one real flood, a light-pool batch for the rest, cones (FC47-L2, S2) ---- */
  nodes.push(...floodNodes(v, gates, mode));
  nodes.push(...floodFlareNodes(v.id, mode));

  /* ---- Scoreboard lattice gantry + emissive screen ---- */
  nodes.push(
    buildScoreboardGantryNode([0, 5.4, -(PITCH_HZ + 9.5)], v.accent),
    primitives.box({
      name: "fc-scoreboard-screen",
      size: [9.5, 3.1, 0.3],
      material: material.emissive({ color: "#0d2436", emissive: v.accent, emissiveIntensity: 0.35, practical: true })
    })
      .position(0, 7.2, -(PITCH_HZ + 9.2))
      .runtime(gameRuntime("fc-scoreboard-screen"))
  );
  // FC47-H1: SDF in-world score on the screen (a digit reel toggled by main.ts; text3D has no runtime setText)
  nodes.push(...scoreboardTextNodes("#f3f0dc"));

  /* ---- Glacier timber-and-steel arch dome + aurora ribbons (lowered to y=-6.5 when active) ---- */
  nodes.push(buildGlacierArchDomeNode(HIDDEN).runtime(gameRuntime("fc-dome")));

  /* ---- Technical-area dugouts, broadcast camera cranes, stadium bowl (integrated roof columns), tunnel, trophy & referee ---- */
  nodes.push(
    buildTechnicalDugoutsBatchedNode([
      { pos: [-35.5, 0, -8], rotY: Math.PI / 2 },
      { pos: [35.5, 0, -8], rotY: -Math.PI / 2 }
    ], v.accent),
    buildBallTrolleyNode([34.5, 0, -14.5], v.accent),
    buildBroadcastCranesBatchedNode([
      { pos: [-PITCH_HX - 5.2, 0, 7.8], yaw: Math.PI * 0.42 },
      { pos: [PITCH_HX + 5.2, 0, -7.8], yaw: -Math.PI * 0.58 }
    ]),
    ...(v.standCount > 0 ? [
      buildStadiumBowlUpperNode(v.standCount, v.accent).runtime(gameRuntime("fc-stadium-bowl"))
    ] : []),
    buildPlayerTunnelNode([PLAYER_TUNNEL_X, 0, -(PITCH_HZ + 1.9 + PLAYER_TUNNEL_DEPTH / 2)], v.accent),
    buildArticulatedFootballerNode(
      "fc-referee",
      {
        shirt: "#e6d02e",
        shorts: "#15171c",
        socks: "#15171c",
        skin: "#b98462",
        trim: "#15171c",
        boots: "#161920",
        targetHeight: REFEREE_TARGET_HEIGHT,
        isReferee: true,
        fabricRim: KIT_FABRIC_RIM
      },
      { rawRootName: true, runtimeFactory: gameRuntime }
    ).position(0, 0, -(PITCH_HZ + 1.1)),
    // FC-19: ceremonial trophy plinth + stepped granite/brass collar + sculpted silver championship cup (minY = 0 -> y = 0.9)
    primitives.box({ name: "fc-trophy-plinth", size: [1.3, 0.9, 1.3], material: material.pbr({ color: "#1c232b", roughness: 0.45, metalness: 0.32 }) })
      .position(-PITCH_HX - 4.5, 0.45, -(PITCH_HZ + 3.5))
      .rotate(0, 0.8, 0),
    buildTrophyPlinthCollarNode([-PITCH_HX - 4.5, 0, -(PITCH_HZ + 3.5)], 0.8),
    buildChampionshipTrophyNode([-PITCH_HX - 4.5, 0.9, -(PITCH_HZ + 3.5)], 0.8, v.accent),
    // spare match ball, tucked behind the away dugout, resting tangent on the grass (`position[1] === 0`)
    buildMatchBallNode("fc-spare-ball", [34.0, 0, -15.5]),
    // Bespoke multi-material architectural backdrop per venue (Munich ETFE, Glacier ski-jump/peaks, Kyoto kawara/pagoda, Lagos louvres/palms, Favela hillside/Corcovado, Uyuni cordillera)
    ...buildVenueBackdropNodes(v.id, v.accent)
  );

  /* ---- Pitch scuff decals (4.6.2 and GU47 paths; the hybrid frame read them as stray dark rectangles) ---- */
  if ((mode ?? fcLookMode(v.id)) !== "hybrid") for (const [x, z, s] of [[-19, -3, 1.8], [19.2, 2.4, 1.6], [-0.5, 0.4, 2.2], [8, -6, 1.3], [-9, 5.4, 1.4], [23, -5, 1.2]] as const) {
    nodes.push(decals.project({ name: `fc-scuff-${x}-${z}`, color: "#000000", size: [s, s * 0.7], opacity: 0.13, position: [x, 0.014, z], normal: [0, 1, 0] }));
  }

  /* ---- Confetti cannon (full-time / champion) ---- */
  nodes.push(
    effects.particles({ name: "fc-confetti", position: [0, 4.2, 0], color: "#ffd76a", intensity: 1, visible: false, rate: 70, speed: 4.6, size: 0.07, lifetime: 3.0, spread: 1.0, gravity: -1.6 } as any)
      .runtime(gameRuntime("fc-confetti"))
  );

  return nodes;
}

function ballNodes(hybrid = false): any[] {
  // Procedural thermally-bonded match ball centered at local `[0, BALL_VIS_R, 0]` (`minY = 0`).
  const nodes: any[] = [
    buildMatchBallNode("fc-ball-mesh", [0, BALL_VIS_R, 0], "fc-ball-mesh")
      .runtime(gameRuntime("fc-ball-mesh")),
    primitives.cylinder({ name: "fc-ball-shadow", size: [BALL_VIS_R * 2.3, 0.01, BALL_VIS_R * 2.3], material: material.pbr({ color: "#000000", opacity: 0.32, roughness: 1 }) })
      .runtime(gameRuntime("fc-ball-shadow")),
    effects.trail({ name: "fc-ball-trail", target: "fc-ball-mesh", color: "#d8ff3e", width: 0.08, maxPoints: 40, intensity: 0.85 } as any),
    primitives.torus({ name: "fc-aim-ring", size: [0.34, 0.035, 0.035], material: material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 1.3, practical: true }) })
      .scale(HIDDEN).runtime(gameRuntime("fc-aim-ring")),
    // authored goal feedback (FC-E2): a ring that sweeps out of the goal mouth after a goal
    primitives.torus({ name: "fc-goal-ring", size: [1, 0.06, 0.06], material: material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 1.6, opacity: 0.85, practical: true }) })
      .scale(HIDDEN).runtime(gameRuntime("fc-goal-ring")),
    primitives.torus({ name: "fc-lab-ring", size: [1.15, 0.09, 0.09], material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff", emissiveIntensity: 1.15, practical: true }) })
      .rotate(Math.PI / 2, 0, 0).scale(HIDDEN).runtime(gameRuntime("fc-lab-ring"))
  ];
  if (hybrid) {
    // WP-04 procedural 8x4 sprite-sheet flipbooks (`createFlipbookAtlas("dust")` turf spray & `"sparks"` goal bursts)
    nodes.push(
      primitives.plane({
        name: "fc-turf-spray-card",
        size: [1.35, 1, 1.35],
        material: material.custom(flipbookCardShaderSpec(turfDustAtlas(), false)),
        castShadow: false
      }).position(0, -20, 0).rotate(-0.62, 0, 0).scale(HIDDEN).runtime(gameRuntime("fc-turf-spray-card")),
      primitives.plane({
        name: "fc-goal-sparks-l",
        size: [2.4, 1, 2.4],
        material: material.custom(flipbookCardShaderSpec(goalSparksAtlas(), true)),
        castShadow: false
      }).position(0, -20, 0).rotate(Math.PI / 2, 0, 0).scale(HIDDEN).runtime(gameRuntime("fc-goal-sparks-l")),
      primitives.plane({
        name: "fc-goal-sparks-r",
        size: [2.4, 1, 2.4],
        material: material.custom(flipbookCardShaderSpec(goalSparksAtlas(), true)),
        castShadow: false
      }).position(0, -20, 0).rotate(Math.PI / 2, 0, 0).scale(HIDDEN).runtime(gameRuntime("fc-goal-sparks-r"))
    );
  }
  return nodes;
}

function gameRuntime(name: string) {
  return game.runtimeNode(name);
}

/* ------------------------------------------------------------------ */
/*  Public                                                             */
/* ------------------------------------------------------------------ */

export const ATHLETE_IDS = [
  "h-gk", "h-df0", "h-df1", "h-mf", "h-fw",
  "a-gk", "a-df0", "a-df1", "a-mf", "a-fw"
] as const;

/** Full scene graph — the venue look first (per look-recipes), then world, atmosphere and post. */
export function buildFcScene(venue: VenueId = "munich", opts: FcSceneOptions = {}) {
  const v = VENUES[venue];
  const vl = VENUE_LOOKS[venue];
  const mode = opts.lookMode ?? fcLookMode(venue);
  const original = mode === "original";
  const hybrid = mode === "hybrid";
  const ol = ORIGINAL_LOOKS[venue];
  const hl = HYBRID_LAYERS[venue];
  const bloom = original ? ol.bloom : hybrid ? hl.bloom : vl.bloom;
  const s = scene()
    // The night venues show their storm / lantern / dust / polar sky colour; Lagos and Uyuni draw their sky HDRI.
    // PRD D11 original path: the 4.6.2 background and preset with only its fog scale and exposure overridden.
    // Hybrid: the 4.6.2 preset with the night sky colour, venue grade and rim layered on (look.ts HYBRID_LAYERS).
    .background(original ? ol.background : hybrid ? (hl.background ?? ol.background) : vl.background)
    .add(original
      ? stripLookDof(looks.preset(ol.look, {
          fogDensityScale: ol.fog,
          fog: {
            color: vl.fogColor,
            near: ol.fogRange.near,
            far: ol.fogRange.far,
            height: { mode: "linear", near: ol.fogRange.near, far: ol.fogRange.far, maxOpacity: 0.16, affectsBackground: false }
          } as any,
          exposureEv: ol.exposureEv
        }).toJSON() as any)
      : hybrid
        ? stripLookDof(looks.preset(ol.look, hybridLookOverrides(venue, fcEngineGates(undefined, opts.engineGates))).toJSON() as any)
        : venueLookNode(venue, fcEngineGates(undefined, opts.engineGates)))
    .addMany(pitchNodes(v, mode))
    .addMany(goalNodes(-1, hybrid, v.accent))
    .addMany(goalNodes(1, hybrid, v.accent))
    .addMany(stadiumNodes(v, fcEngineGates(undefined, opts.engineGates), mode))
    .addMany(ballNodes(hybrid));
  // phase 4 hybrid: the fitted key casts the players' shadows, so the blob discs fade to a soft contact darkening
  for (const id of ATHLETE_IDS) {
    s.addMany(original ? athleteNodes(id) : athleteNodes(id, hybrid ? HYBRID_BLOB_OPACITY : undefined, false));
  }
  s.addMany(atmosphereNodes(venue, opts))
    // WP-04 hybrid: crisp contact shadows + SSAO grounding under boots, ball, goalposts and perimeter boards
    .add(effects.contactShadows(hybrid ? { intensity: 0.92, length: 0.44, thickness: 0.08, steps: 16 } as any : { intensity: 0.85, length: 0.32 }));
  if (hybrid) {
    s.add(effects.ambientOcclusion({ name: "fc-ao", intensity: 0.48, radius: 0.65, density: 0.6 }));
  }
  // phase 4 hybrid: the wet / glazed / ice pitch reflects the floods, hoardings and stands at grazing angles (S3, High+)
  const ssr = hybrid ? hl.ssr : null;
  if (ssr) s.add(effects.screenSpaceReflections({ name: "fc-pitch-ssr", intensity: ssr.intensity, roughness: ssr.roughness, maxDistance: ssr.maxDistance } as any));
  // PRD 6.3 & WP-09: keep default hybrid gameplay free of motionBlur smear; gu47 contract retains reducedMotion toggle
  if (!hybrid && opts.reducedMotion !== true) s.add(effects.motionBlur({ intensity: 0.1 }));
  return s
    .add(hybrid
      ? effects.cinematicBloom({ intensity: bloom.intensity, threshold: bloom.threshold, color: v.accent, antiBlowout: true })
      : effects.bloom({ intensity: bloom.intensity, threshold: bloom.threshold }))
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), position: [0, 11.5, 23.5], target: [0, 0.9, -1], fov: 40 }));
}

/** The slice of `app.post` (E-C runtime post) the venue switches use. */
export interface FcPostSwitches {
  readonly post?: { setEffectEnabled?(name: string, enabled: boolean): void };
}

/**
 * Runtime post switches for the page (FC47-P1/P3, PRD 6.3): the depth-of-field stage the cinematic-film preset
 * contributes stays off during play (the goal-replay DOF turns it on and off again); reduced motion also drops the
 * presets' chromatic aberration and motion blur. Returns the switches applied, for the evidence and the unit test.
 */
export function applyPostAccessibility(app: FcPostSwitches, reducedMotion: boolean): readonly string[] {
  const off = ["depthOfField", ...(reducedMotion ? ["chromaticAberration", "motionBlur"] : [])];
  for (const name of off) {
    try { app.post?.setEffectEnabled?.(name, false); } catch { /* stub post surface */ }
  }
  return off;
}

/**
 * QA A/B only (`?ao=0`, LIGHT-06 capture pair): the scene snapshot without the look's ambient-occlusion node, so a
 * capture can measure what the 4.5.0 real-depth AO changes. Normal loads never call this.
 */
export function withoutLookAo(scene: { toJSON(): any }): any {
  const snap = scene.toJSON();
  const strip = (nodes: any[]): any[] => nodes
    .filter((n) => n?.name !== "look ambient occlusion" && n?.name !== "fc-ao")
    .map((n) => (Array.isArray(n?.children) ? { ...n, children: strip(n.children) } : n));
  return { ...snap, nodes: strip(snap.nodes ?? []) };
}

export interface WorldHandles {
  ground: any; apron: any; pitch: any;
  stripes: any;
  cages: any[]; cageRails: any[];
  hoardings: any[];
  /** FC47-PF1: the venue's stand tiers as one instanced batch (null when the venue has no bowl). */
  stands: any;
  roofTrusses: any;
  crowd: any;
  crowdHeads: any;
  crowdScarves: any;
  crowdHair: any;
  crowdLegs: any;
  scoreboard: any;
  nets: any[];
  dome: any;
  referee: any;
  /** Articulated front-row fans (empty on venues without a bowl) and the clip each one is playing. */
  fans: any[];
  fanClips: string[];
  lookup?: (id: string) => any;
  auroras: any[];
  wavers: any;
  confetti: any;
  goalMeshes: any[];
  netBacks: any[];
  goalRing: any;
  turfSprayCard: any;
  goalSparks: any[];
  ballMesh: any; ballShadow: any;
  aimRing: any; labRing: any;
}

const tryReq = (app: any, id: string) => { try { return app.nodes.require(id); } catch { return null; } };

export function resolveWorld(app: any): WorldHandles {
  const req = (id: string) => app.nodes.require(id);
  const lookup = (id: string) => {
    try { return app.nodes?.get?.(id) ?? app.nodes?.require?.(id) ?? null; } catch { return null; }
  };
  return {
    ground: req("fc-ground"), apron: req("fc-apron"), pitch: req("fc-pitch"),
    stripes: tryReq(app, "fc-stripes"),
    cages: CAGE_TAGS.map((t) => tryReq(app, `cage-${t}`)),
    cageRails: CAGE_TAGS.map((t) => tryReq(app, `cage-rail-${t}`)),
    hoardings: [tryReq(app, "fc-hoardings")],
    stands: tryReq(app, "fc-stands"),
    roofTrusses: tryReq(app, "fc-roof-trusses"),
    crowd: tryReq(app, "fc-crowd"),
    crowdHeads: tryReq(app, "fc-crowd-heads"),
    crowdScarves: tryReq(app, "fc-crowd-scarves"),
    crowdHair: tryReq(app, "fc-crowd-hair"),
    crowdLegs: tryReq(app, "fc-crowd-legs"),
    scoreboard: tryReq(app, "fc-scoreboard-screen"),
    nets: ["net-back--1", "net-roof--1", "net-n--1", "net-s--1", "net-back-1", "net-roof-1", "net-n-1", "net-s-1"].map((n) => tryReq(app, n)),
    dome: tryReq(app, "fc-dome"),
    referee: tryReq(app, "fc-referee"),
    fans: PITCH_FANS.map((_, i) => tryReq(app, `fc-fan-${i}`)).filter((n) => n !== null),
    fanClips: [],
    lookup,
    auroras: [0, 1, 2].map((i) => tryReq(app, `fc-aurora-ribbon-${i}`)),
    wavers: tryReq(app, "fc-wavers"),
    confetti: tryReq(app, "fc-confetti"),
    goalMeshes: [tryReq(app, "fc-goal-mesh--1"), tryReq(app, "fc-goal-mesh-1")],
    netBacks: [tryReq(app, "net-back--1"), tryReq(app, "net-back-1")],
    goalRing: tryReq(app, "fc-goal-ring"),
    turfSprayCard: tryReq(app, "fc-turf-spray-card"),
    goalSparks: [tryReq(app, "fc-goal-sparks-l"), tryReq(app, "fc-goal-sparks-r")],
    ballMesh: tryReq(app, "fc-ball-mesh"),
    ballShadow: tryReq(app, "fc-ball-shadow"),
    aimRing: tryReq(app, "fc-aim-ring"), labRing: tryReq(app, "fc-lab-ring")
  };
}

/** Re-tint every venue-dependent surface. Called when state.venue changes. */
export function applyVenue(h: WorldHandles, v: VenueSpec, mode: FcLookMode = fcLookMode(v.id)): void {
  const surfaces = surfaceMaterials(v, mode);
  h.ground?.setMaterial(surfaces.ground);
  h.apron?.setMaterial(surfaces.apron);
  h.pitch?.setMaterial(surfaces.pitch);
  h.scoreboard?.setMaterial(material.emissive({ color: v.hoarding, emissive: v.accent, emissiveIntensity: 0.4 }));
  for (const hd of h.hoardings) {
    if (!hd) continue;
    if (mode === "hybrid") {
      try {
        hd.setUniform?.("baseColor", hexToLinearRgb(v.hoarding));
        hd.setUniform?.("accentColor", hexToLinearRgb(v.accent));
      } catch {
        hd.setMaterial(material.custom(hoardingLedShaderSpec(v.hoarding, v.accent)));
      }
    } else {
      hd.setMaterial(material.emissive({ color: v.hoarding, emissive: v.accent, emissiveIntensity: 0.38 }));
    }
  }
  if (h.stripes) {
    const st = stripeInstances(v);
    h.stripes.setInstances?.(st.transforms, st.colors);
    h.stripes.setVisible(v.stripes);
  }
  for (const c of h.cages) c?.setMaterial(cageWallMaterial(v)).setScale(v.walled ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN]).setVisible(v.walled);
  for (const c of h.cageRails) c?.setMaterial(material.emissive({ color: v.accent, emissive: v.accent, emissiveIntensity: 0.5 })).setScale(v.walled ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN]).setVisible(v.walled);
  if (h.stands) {
    const st = standTransforms(v);
    if (st.length > 0) h.stands.setInstances?.(st);
    h.stands.setVisible(st.length > 0);
  }
  if (h.roofTrusses) {
    h.roofTrusses.setInstances?.(roofTrussTransforms(v));
    h.roofTrusses.setVisible(true);
  }
  h.crowd?.setVisible(v.standCount > 0);
  h.crowdHeads?.setVisible(v.standCount > 0);
  h.crowdScarves?.setVisible(v.standCount > 0);
  h.crowdHair?.setVisible(v.standCount > 0);
  h.crowdLegs?.setVisible(v.standCount > 0);
  h.wavers?.setVisible(v.standCount > 0);
  // Lower dome floor to y=-6.5 when active so its bottom never occludes the turf
  // hybrid Glacier drops the dome (look.ts hideDome); `?dome=off` hides it on any path
  const hideDome = mode === "hybrid" && HYBRID_LAYERS[v.id].hideDome === true;
  if (v.dome && domeOn() && !hideDome) {
    h.dome?.setPosition(0, -6.5, 0).setScale([1.22, 1, 1.22]).setVisible(true);
  } else {
    h.dome?.setPosition(0, -90, 0).setScale([HIDDEN, HIDDEN, HIDDEN]).setVisible(false);
  }
  for (const a of h.auroras) a?.setVisible(v.aurora);
}

export interface TurfBurstState {
  readonly x: number;
  readonly z: number;
  readonly age: number;
}

/** Per-frame ambient motion: wavers bounce on goals, referee patrols touchline, LED ribbons & hexagonal net ripple. */
export function tickWorld(
  h: WorldHandles,
  t: number,
  opts: {
    cheering: boolean;
    ripple: number;
    goalSide?: -1 | 0 | 1;
    hitY?: number;
    hitZ?: number;
    accent?: string;
    hoarding?: string;
    turfBurst?: TurfBurstState | null;
  }
): void {
  const cheer = opts.cheering;
  // Touchline referee patrols along the north touchline
  // at walking pace, Walk_Loop phase driven by distance walked so the feet do not slide.
  const ref = refereePatrol(t, REFEREE_TARGET_HEIGHT / FOOTBALLER_CANONICAL_HEIGHT);
  h.referee?.setPosition(ref.x, 0, -(PITCH_HZ + 1.1)).setRotation(0, ref.yaw, 0).setScale([1, 1, 1]);
  h.referee?.setAnimation?.({ clip: ref.clip, loop: true, duration: ref.duration, startTime: t - ref.phase, crossFade: false });
  poseArticulatedFootballer(h.lookup, "fc-referee", { clip: ref.clip, phase: ref.phase, duration: ref.duration });

  h.wavers?.setInstances?.(waverTransforms(t, cheer));
  // Front-row articulated fans switch clip only on a change and pose their joints statelessly every frame
  for (let i = 0; i < (h.fans?.length ?? 0); i++) {
    const clip = pitchFanClip(i, cheer);
    poseArticulatedPitchFan(h.lookup, i, clip, t);
    if (h.fanClips[i] === clip) continue;
    h.fanClips[i] = clip;
    h.fans[i]?.setAnimation?.({ clip, loop: true, startTime: t - i * 0.41, crossFade: 0.25 });
  }
  const g = opts.goalSide ?? 0;
  const k = Math.max(0, Math.min(1, opts.ripple / 2.8));
  const hitY = opts.hitY ?? 1.4;
  const hitZ = opts.hitZ ?? 0;

  // Drive hexagonal net shader ripple + subtle enclosure scale
  for (let i = 0; i < h.nets.length; i++) {
    const n = h.nets[i];
    if (!n) continue;
    const netSide = i < 4 ? -1 : 1;
    const activeAmp = g === netSide ? k : 0;
    const sc = activeAmp > 0 ? 1 + Math.sin(opts.ripple * 22) * 0.045 * activeAmp : 1;
    n.setScale([sc, 1, 1]);
    try { n.setUniform?.("goalRipple", [hitY, hitZ, activeAmp, t]); } catch { /* PBR fallback on non-hybrid */ }
  }

  // Drive animated LED perimeter hoarding surge on goals
  const ledFlash = g !== 0 && k > 0 ? k : 0;
  if (Math.abs(ledFlash - ((h as any)._ledFlash ?? -1)) > 0.02 || (ledFlash === 0 && (h as any)._ledFlash !== 0)) {
    (h as any)._ledFlash = ledFlash;
    for (const hd of h.hoardings ?? []) {
      try { hd?.setUniform?.("goalFlash", ledFlash); } catch { /* PBR/emissive fallback on non-hybrid */ }
    }
  }

  for (const sx of [-1, 1] as const) {
    const idx = sx < 0 ? 0 : 1;
    const bulge = g === sx ? Math.sin(Math.min(1, (1 - k) * 4) * Math.PI) * 0.42 * k : 0;
    h.netBacks[idx]?.setPosition(sx * (PITCH_HX + GOAL_DEPTH + bulge), GOAL_H / 2, 0);
  }
  if (g !== 0 && k > 0) {
    const r = 1 + (1 - k) * 7;
    h.goalRing?.setPosition(g * (PITCH_HX - 0.2), 1.2, 0).setRotation(0, Math.PI / 2, 0).setScale([r, r, r]).setVisible(true);
    // Goal corner celebration flipbook sparks (`createFlipbookAtlas("sparks")`)
    const sparkAge = (1 - k) * 2.8;
    if (sparkAge < 1.35) {
      const frameIdx = Math.min(31, Math.floor((sparkAge / 1.35) * 32));
      const sparkAlpha = Math.max(0, 1 - sparkAge / 1.35);
      const gx = g * (PITCH_HX + 0.5);
      h.goalSparks?.[0]?.setPosition(gx, 1.9, -(GOAL_HALF_W + 0.8)).setRotation(Math.PI / 2, 0, 0).setScale([1 + sparkAge * 0.65, 1, 1 + sparkAge * 0.65]).setVisible(true);
      h.goalSparks?.[1]?.setPosition(gx, 1.9, GOAL_HALF_W + 0.8).setRotation(Math.PI / 2, 0, 0).setScale([1 + sparkAge * 0.65, 1, 1 + sparkAge * 0.65]).setVisible(true);
      try {
        h.goalSparks?.[0]?.setUniform?.("burstState", [frameIdx, sparkAlpha, 1.8, 0]);
        h.goalSparks?.[1]?.setUniform?.("burstState", [frameIdx, sparkAlpha, 1.8, 0]);
      } catch { /* best-effort */ }
    } else {
      for (const sp of h.goalSparks ?? []) sp?.setScale([HIDDEN, HIDDEN, HIDDEN]).setVisible(false);
    }
  } else {
    h.goalRing?.setScale([HIDDEN, HIDDEN, HIDDEN]).setVisible(false);
    for (const sp of h.goalSparks ?? []) sp?.setScale([HIDDEN, HIDDEN, HIDDEN]).setVisible(false);
  }

  // Turf spray flipbook burst (`createFlipbookAtlas("dust")`) on power strikes & slide tackles
  if (h.turfSprayCard) {
    const tb = opts.turfBurst;
    if (tb && tb.age >= 0 && tb.age < 0.55) {
      const u = tb.age / 0.55;
      const frameIdx = Math.min(31, Math.floor(u * 32));
      const alpha = (1 - u) * 0.82;
      const sc = 0.72 + u * 1.15;
      h.turfSprayCard.setPosition(tb.x, 0.34 + u * 0.24, tb.z).setRotation(-0.95, 0, 0).setScale([sc, 1, sc]).setVisible(true);
      try { h.turfSprayCard.setUniform?.("burstState", [frameIdx, alpha, 1.25, 0]); } catch { /* best-effort */ }
    } else {
      h.turfSprayCard.setScale([HIDDEN, HIDDEN, HIDDEN]).setVisible(false);
    }
  }

  if (h.scoreboard && opts.accent) {
    const flash = g !== 0 && k > 0 ? 0.4 + Math.abs(Math.sin((1 - k) * 18)) * 1.4 * k : 0.4;
    if (Math.abs(flash - (h as any)._flash) > 0.04 || (flash === 0.4 && (h as any)._flash !== 0.4)) {
      (h as any)._flash = flash;
      h.scoreboard.setMaterial(material.emissive({ color: opts.hoarding ?? "#0d2436", emissive: opts.accent, emissiveIntensity: flash }));
    }
  }
}
