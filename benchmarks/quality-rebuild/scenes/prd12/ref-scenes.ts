/**
 * §9.3 showcase reference scenes prd12-ref-01..06 (T2.3). Three side renders
 * through `three/lib/showcase.ts` (runThreeShowcase); Aura side uses engine
 * defaults plus the scene's high-level intent only (§8.4). All HDRIs are the
 * tracked 1k stand-ins — assetTier "stand-in" until lane 05 lands the 2k
 * admissions (Q-05-1).
 */
import { RESOLUTION, type SceneSpec } from "../../shared/types";

const SHOWCASE_BASE = {
  owner: "prd12" as const,
  referenceProfile: "showcase" as const,
  masks: ["object-id", "shadow-receiver", "metal", "silhouette-edge"] as const,
  brokenControls: ["no-shadows", "no-ibl", "dpr-half", "no-aa", "no-tonemap", "flat-sky", "albedo-only"] as const,
  resolution: RESOLUTION,
  pixelRatioScale: 0.5,
  dprs: [1, 2] as const,
  settleFrames: 6,
  time: 0
};

export const ref01AutomotiveStudio: SceneSpec = {
  ...SHOWCASE_BASE,
  id: "prd12-ref-01-automotive-studio",
  index: 1261,
  title: "Automotive studio turntable",
  purpose: "Car on turntable floor under studio HDRI — clearcoat/flake paint, glass transmission, grounded contact",
  camera: { position: [2.8, 1.1, 3.4], target: [0, 0.55, 0], fov: 38, near: 0.05, far: 80 },
  background: { kind: "hdri", hdri: "studioSmall08", intensity: 1, fallbackColor: "#101216" },
  environment: { hdri: "studioSmall08", intensity: 0, rotation: 0 },
  toneMapping: "agx",
  exposure: 1,
  lights: [
    { kind: "directional", name: "key", color: "#ffffff", intensity: 1.5, position: [3, 4, 2], target: [0, 0.4, 0], castShadow: true },
    { kind: "directional", name: "rim", color: "#cfe4ff", intensity: 1.6, position: [-3, 2.5, -2.5], target: [0, 0.4, 0], castShadow: false }
  ],
  objects: [
    { kind: "primitive", name: "turntable floor", shape: "cylinder", size: [3.4, 0.06, 3.4], position: [0, -0.03, 0], material: { color: "#141518", roughness: 0.35, metalness: 0.6 }, castShadow: false, receiveShadow: true },
    { kind: "model", name: "car", asset: "carConcept", position: [0, 0, 0], rotation: [0, -0.5, 0], scale: [1.15, 1.15, 1.15], castShadow: true, receiveShadow: false }
  ],
  shadows: { mapSize: 4096, type: "pcf-soft", directionalExtent: 4, bias: -0.0002, normalBias: 0.02 },
  showcase: {
    ao: { radius: 0.35, distanceExponent: 1 },
    aa: "msaa4+smaa",
    contactShadows: { size: 3, blur: 2, darkness: 0.65 },
    background: "hdri",
    backgroundBlurriness: 0.4,
    anisotropy: "max",
    shadowRadius: 3,
    assetTier: "stand-in"
  },
  primaryCriterion: "Clearcoat/flake paint reads as lacquer; glass transmits; grounded contact",
  primaryRegion: "frame"
};

export const ref02Diorama: SceneSpec = {
  ...SHOWCASE_BASE,
  id: "prd12-ref-02-diorama",
  index: 1262,
  title: "Littlest Tokyo diorama",
  purpose: "Animated diorama with warm key and interior bounce — detail readable at 1280×720, AO in crevices",
  camera: { position: [-5.5, 4.2, 7.5], target: [0.5, 1.2, 0], fov: 45, near: 0.05, far: 200 },
  background: { kind: "color", color: "#1a1613" },
  // Interior: RoomEnvironment stand-in (§9.3) instead of an HDRI while the 2k admission is pending.
  environment: { hdri: "studioSmall08", intensity: 0.7, rotation: 0 },
  toneMapping: "neutral",
  exposure: 1,
  lights: [
    { kind: "directional", name: "warm key", color: "#ffd9a8", intensity: 2.2, position: [4, 8, 3], target: [0, 0.5, 0], castShadow: true }
  ],
  objects: [
    { kind: "model", name: "littlest-tokyo", asset: "littlestTokyo", position: [0, 0, 0], scale: 0.008, castShadow: true, receiveShadow: true, animation: { clip: "Take 001", time: 0 } }
  ],
  shadows: { mapSize: 2048, type: "pcf-soft", directionalExtent: 6, bias: -0.0003, normalBias: 0.02 },
  bloom: { strength: 0.4, radius: 0.4, threshold: 1.0 },
  showcase: {
    ao: { radius: 0.25, distanceExponent: 1 },
    aa: "msaa4+smaa",
    environmentStandIn: "room-environment",
    anisotropy: "max",
    assetTier: "stand-in"
  },
  primaryCriterion: "Readable detail at 1280x720; AO in crevices; no aliasing on thin geometry",
  primaryRegion: "frame"
};

export const ref03CharacterHero: SceneSpec = {
  ...SHOWCASE_BASE,
  id: "prd12-ref-03-character-hero",
  index: 1263,
  title: "Character hero on procedural ground",
  purpose: "Soldier idle→walk strip on textured ground under outdoor HDRI — skinned shadow follows pose",
  camera: { position: [1.6, 1.3, 3.1], target: [0, 0.9, 0], fov: 42, near: 0.05, far: 120 },
  background: { kind: "hdri", hdri: "autumnFieldPuresky", intensity: 1, fallbackColor: "#25344a" },
  environment: { hdri: "autumnFieldPuresky", intensity: 0.9, rotation: 0 },
  toneMapping: "agx",
  exposure: 1,
  lights: [
    { kind: "directional", name: "sun", color: "#fff4dd", intensity: 3.2, position: [4, 6, 2], target: [0, 0.8, 0], castShadow: true }
  ],
  objects: [
    // §9.3 stand-in ground: checker + noise normal handled by the three showcase pipeline note;
    // spec keeps a procedural-textured plane so both engines draw the same intent.
    { kind: "primitive", name: "procedural ground", shape: "plane", size: [40, 1, 40], position: [0, 0, 0], material: { color: "#5d6b4a", roughness: 0.95, metalness: 0 }, castShadow: false, receiveShadow: true },
    { kind: "model", name: "soldier", asset: "soldier", position: [0, 0, 0], castShadow: true, receiveShadow: true, animation: { clip: "Walk", time: 0.8 } }
  ],
  csm: { cascades: 3, maxFar: 40, mode: "practical" },
  shadows: { mapSize: 2048, type: "pcf-soft", directionalExtent: 5, bias: -0.0004, normalBias: 0.03 },
  strip: { frames: 8, intervalMs: 120, orbitDegrees: 45 },
  showcase: {
    ao: { radius: 0.3, distanceExponent: 1 },
    aa: "msaa4+smaa",
    background: "grounded-skybox",
    anisotropy: "max",
    assetTier: "stand-in"
  },
  primaryCriterion: "Skinned shadow matches pose; rim/key separation; ground detail with anisotropy",
  primaryRegion: "shadow-receiver"
};

export const ref04NightStreet: SceneSpec = {
  ...SHOWCASE_BASE,
  id: "prd12-ref-04-night-street",
  index: 1264,
  title: "Night street, wet asphalt",
  purpose: "Wet street with emissive signs and practical point lights in fog — stand-in primitives until the street kit lands",
  camera: { position: [0, 1.7, 6.5], target: [0, 1.6, -6], fov: 50, near: 0.05, far: 120 },
  background: { kind: "hdri", hdri: "kloppenheim06Puresky", intensity: 0.15, fallbackColor: "#06080c" },
  environment: { hdri: "kloppenheim06Puresky", intensity: 0.15, rotation: 0 },
  toneMapping: "aces-filmic",
  exposure: 0.9,
  fog: { color: "#0a0d12", density: 0.015 },
  lights: [
    { kind: "point", name: "streetlamp-l", color: "#ffd28a", intensity: 24, position: [-3.2, 3.4, -2], range: 14 },
    { kind: "point", name: "streetlamp-r", color: "#ffd28a", intensity: 24, position: [3.2, 3.4, -6], range: 14 },
    { kind: "point", name: "neon-blue", color: "#4fb8ff", intensity: 18, position: [-2.4, 2.2, -9], range: 10 }
  ],
  objects: [
    { kind: "primitive", name: "wet asphalt", shape: "plane", size: [10, 1, 30], position: [0, 0, -8], material: { color: "#0c0e11", roughness: 0.18, metalness: 0.9, envMapIntensity: 1.4 }, castShadow: false, receiveShadow: true },
    { kind: "primitive", name: "block l1", shape: "box", size: [2.2, 4.5, 2.2], position: [-3.4, 2.25, -5], material: { color: "#1c2026", roughness: 0.8, metalness: 0.1 }, castShadow: true, receiveShadow: true },
    { kind: "primitive", name: "block l2", shape: "box", size: [2.6, 6, 2.4], position: [-3.8, 3, -9.5], material: { color: "#22262c", roughness: 0.85, metalness: 0.05 }, castShadow: true, receiveShadow: true },
    { kind: "primitive", name: "block r1", shape: "box", size: [2.4, 5, 2.2], position: [3.5, 2.5, -7.5], material: { color: "#1d2127", roughness: 0.82, metalness: 0.08 }, castShadow: true, receiveShadow: true },
    { kind: "primitive", name: "sign amber", shape: "plane", size: [1.4, 0.5, 1], position: [-2.2, 2.4, -3.99], material: { color: "#201408", roughness: 0.6, metalness: 0, emissive: "#ff9a1f", emissiveIntensity: 3.5 }, castShadow: false, receiveShadow: false },
    { kind: "primitive", name: "sign cyan", shape: "plane", size: [1.1, 0.4, 1], position: [2.3, 3.1, -6.49], rotation: [0, Math.PI, 0], material: { color: "#081a20", roughness: 0.6, metalness: 0, emissive: "#37d6ff", emissiveIntensity: 4 }, castShadow: false, receiveShadow: false }
  ],
  bloom: { strength: 0.55, radius: 0.5, threshold: 1.0 },
  showcase: {
    ao: { radius: 0.4, distanceExponent: 1 },
    aa: "msaa4+smaa",
    anisotropy: "max",
    assetTier: "stand-in"
  },
  primaryCriterion: "Emissives glow without blooming mid-tones; floor reflects; fog separates depth",
  primaryRegion: "frame"
};

export const ref05ArenaGame: SceneSpec = {
  ...SHOWCASE_BASE,
  id: "prd12-ref-05-arena-game",
  index: 1265,
  title: "Third-person arena with props and particles",
  purpose: "20+ props, pickups, particles, CSM, fog at gameplay distance — grounding, lit particles, readability",
  camera: { position: [0, 2.1, 5.2], target: [0, 0.9, -1.5], fov: 55, near: 0.05, far: 160 },
  background: { kind: "hdri", hdri: "kloppenheim06Puresky", intensity: 0.5, fallbackColor: "#10141c" },
  environment: { hdri: "kloppenheim06Puresky", intensity: 0.55, rotation: 0.6 },
  toneMapping: "agx",
  exposure: 1,
  fog: { color: "#11151d", density: 0.012 },
  lights: [
    { kind: "directional", name: "sun", color: "#ffe9c4", intensity: 3, position: [6, 9, 4], target: [0, 0, -4], castShadow: true },
    { kind: "ambient", name: "bounce", color: "#33404f", intensity: 0.6 }
  ],
  objects: [
    { kind: "primitive", name: "arena floor", shape: "plane", size: [36, 1, 36], position: [0, 0, -6], material: { color: "#3a3f47", roughness: 0.85, metalness: 0.1 }, castShadow: false, receiveShadow: true },
    { kind: "model", name: "hero", asset: "soldier", position: [0, 0, 0], castShadow: true, receiveShadow: true, animation: { clip: "Idle", time: 0.6 } },
    { kind: "model", name: "rock a", asset: "rockA", position: [-4.5, 0, -4], rotation: [0, 0.7, 0], scale: 1.4, castShadow: true, receiveShadow: true },
    { kind: "model", name: "rock b", asset: "rockB", position: [4.2, 0, -6.5], rotation: [0, -0.4, 0], scale: 1.8, castShadow: true, receiveShadow: true },
    { kind: "model", name: "crate stack a", asset: "crate", position: [-2.2, 0, -7.5], castShadow: true, receiveShadow: true },
    { kind: "model", name: "crate stack b", asset: "crate", position: [-2.2, 1.0, -7.5], rotation: [0, 0.5, 0], castShadow: true, receiveShadow: true },
    { kind: "model", name: "crate stack c", asset: "crate", position: [3.4, 0, -3.2], rotation: [0, -0.3, 0], castShadow: true, receiveShadow: true },
    { kind: "instanced", name: "arena props", shape: "box", size: [0.35, 0.35, 0.35], material: { color: "#8a5a2b", roughness: 0.6, metalness: 0.2, emissive: "#c77012", emissiveIntensity: 1.6 }, castShadow: true, receiveShadow: true,
      transforms: [
        { position: [-6, 0.2, -2] }, { position: [-5.4, 0.2, -5.4] }, { position: [-3.6, 0.2, -9] }, { position: [-1.4, 0.2, -4.6] },
        { position: [0.8, 0.2, -8.4] }, { position: [2.6, 0.2, -5.8] }, { position: [5.6, 0.2, -8.8] }, { position: [6.4, 0.2, -3.6] },
        { position: [-7, 0.2, -7] }, { position: [7, 0.2, -6] }, { position: [-1, 0.2, -11] }, { position: [3.4, 0.2, -11.4] },
        { position: [-4.8, 0.2, -11] }, { position: [5.2, 0.2, -1.8] }, { position: [-6.4, 0.2, -10] }, { position: [1.8, 0.2, -3] }
      ] },
    { kind: "particles", name: "ambient motes", count: 700, seed: 4242, center: [0, 2.4, -5], radius: 9, height: 3.2, size: 0.05, color: "#ffd9a0", blending: "additive" }
  ],
  csm: { cascades: 4, maxFar: 60, mode: "practical" },
  shadows: { mapSize: 2048, type: "pcf-soft", directionalExtent: 14, bias: -0.0004, normalBias: 0.03 },
  bloom: { strength: 0.35, radius: 0.5, threshold: 1.0 },
  showcase: {
    ao: { radius: 0.5, distanceExponent: 1 },
    aa: "msaa4+smaa",
    anisotropy: "max",
    assetTier: "stand-in"
  },
  primaryCriterion: "Grounding at gameplay distance; particles present and lit; contrast and readability",
  primaryRegion: "frame"
};

export const ref06ProductTurntable: SceneSpec = {
  ...SHOWCASE_BASE,
  id: "prd12-ref-06-product-turntable-motion",
  index: 1266,
  title: "Product turntable orbit strip",
  purpose: "DamagedHelmet + AntiqueCamera slow 8-frame orbit — temporal stability, specular aliasing in motion",
  camera: { position: [0, 1.15, 3.2], target: [0, 0.75, 0], fov: 36, near: 0.05, far: 60 },
  background: { kind: "hdri", hdri: "studioSmall08", intensity: 0.9, fallbackColor: "#0f1114" },
  environment: { hdri: "studioSmall08", intensity: 0, rotation: 0 },
  toneMapping: "neutral",
  exposure: 1,
  lights: [
    { kind: "directional", name: "key", color: "#ffffff", intensity: 2.6, position: [2.5, 3.5, 2.5], target: [0, 0.7, 0], castShadow: true },
    { kind: "directional", name: "fill", color: "#bcd2ff", intensity: 1.1, position: [-2.5, 2, 1.5], target: [0, 0.7, 0], castShadow: false }
  ],
  objects: [
    { kind: "primitive", name: "plinth", shape: "cylinder", size: [1.7, 0.12, 1.7], position: [0, 0.06, 0], material: { color: "#d7d7db", roughness: 0.5, metalness: 0.05 }, castShadow: false, receiveShadow: true },
    { kind: "model", name: "helmet", asset: "damagedHelmet", position: [-0.42, 0.14, 0], rotation: [0, 0.5, 0], scale: 0.55, castShadow: true, receiveShadow: false },
    { kind: "model", name: "camera", asset: "antiqueCamera", position: [0.55, 0.12, -0.1], rotation: [0, -0.6, 0], scale: 0.32, castShadow: true, receiveShadow: false }
  ],
  shadows: { mapSize: 2048, type: "pcf-soft", directionalExtent: 3, bias: -0.0002, normalBias: 0.015 },
  strip: { frames: 8, intervalMs: 125, orbitDegrees: 90 },
  showcase: {
    ao: { radius: 0.3, distanceExponent: 1 },
    aa: "msaa4+smaa",
    contactShadows: { size: 2, blur: 2, darkness: 0.6 },
    anisotropy: "max",
    assetTier: "stand-in"
  },
  primaryCriterion: "Temporal stability (temporalFlicker); specular aliasing in motion",
  primaryRegion: "frame"
};

export const REF_SCENES: readonly SceneSpec[] = [
  ref01AutomotiveStudio, ref02Diorama, ref03CharacterHero, ref04NightStreet, ref05ArenaGame, ref06ProductTurntable
];
