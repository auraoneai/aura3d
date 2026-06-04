import type { AuraSceneBackendPreference, AuraSceneQualityTarget } from "./AuraSceneIR.js";
import type { AuraAssetIntent } from "./AuraAssetIntent.js";
import type { AuraLookSpec } from "./AuraLookSpec.js";
import type { AuraMaterialIntent } from "./AuraMaterialIntent.js";
import type { AuraShotSpec } from "./AuraShotSpec.js";
import type { AuraVFXIntent } from "./AuraVFXIntent.js";

export type AuraCinematicSceneType = "character-moment" | "product-reveal" | "environment-establishing" | "architectural-previs" | "abstract-mood";

export interface AuraCinematicTimelineBeat {
  readonly id: string;
  readonly atSeconds: number;
  readonly kind: "camera" | "character" | "prop" | "lighting" | "vfx";
  readonly targetId: string;
  readonly action: string;
}

export interface AuraCinematicSceneIntent {
  readonly schema: "aura3d.cinematic-scene-intent/1.0";
  readonly sceneType: AuraCinematicSceneType;
  readonly title: string;
  readonly mood: readonly string[];
  readonly environment: {
    readonly id: string;
    readonly label: string;
    readonly semanticTags: readonly string[];
    readonly timeOfDay: "dawn" | "day" | "golden-hour" | "night" | "stage";
    readonly weather?: "clear" | "rain" | "fog" | "snow" | "dust";
  };
  readonly heroSubject: {
    readonly id: string;
    readonly label: string;
    readonly semanticTags: readonly string[];
    readonly materialDescriptors: readonly string[];
    readonly action: string;
  };
  readonly supportingProps: readonly {
    readonly id: string;
    readonly label: string;
    readonly semanticTags: readonly string[];
    readonly materialDescriptors: readonly string[];
  }[];
  readonly look: AuraLookSpec;
  readonly shots: readonly AuraShotSpec[];
  readonly materials: readonly AuraMaterialIntent[];
  readonly vfx: readonly AuraVFXIntent[];
  readonly timeline: {
    readonly durationSeconds: number;
    readonly beats: readonly AuraCinematicTimelineBeat[];
  };
  readonly assetRequirements: readonly AuraAssetIntent[];
  readonly backendPreference: AuraSceneBackendPreference;
  readonly qualityTarget: AuraSceneQualityTarget;
  readonly negativeConstraints: readonly string[];
}

export function createNorthStarCinematicSceneIntent(): AuraCinematicSceneIntent {
  return {
    schema: "aura3d.cinematic-scene-intent/1.0",
    sceneType: "character-moment",
    title: "Rainy Neon Alley Flower Reveal",
    mood: ["lonely", "hopeful", "rainy", "neon", "cinematic"],
    environment: {
      id: "env-rainy-neon-alley",
      label: "Rainy neon alley",
      semanticTags: ["rainy-neon-alley", "urban", "alley", "wet-pavement"],
      timeOfDay: "night",
      weather: "rain"
    },
    heroSubject: {
      id: "robot-hero",
      label: "Expressive robot",
      semanticTags: ["robot", "character", "expressive"],
      materialDescriptors: ["wet brushed metal", "subtle scratches", "blue rim highlights"],
      action: "kneels and looks toward the glowing flower"
    },
    supportingProps: [
      {
        id: "flower-hero",
        label: "Glowing flower",
        semanticTags: ["flower", "glowing-flower", "emissive", "hero-prop"],
        materialDescriptors: ["translucent petals", "cyan emissive core", "wet stem"]
      }
    ],
    look: {
      id: "look-blue-rim-neon",
      moodTags: ["rainy", "neon", "hopeful"],
      colorPalette: [[0.08, 0.14, 0.24], [0.1, 0.8, 1], [1, 0.25, 0.65]],
      contrast: "high",
      saturation: "rich",
      lighting: {
        mood: "blue rim neon with magenta practicals",
        key: { color: [0.45, 0.65, 1], intensity: 1.3, direction: [-0.4, -0.8, -0.3] },
        rim: { color: [0.1, 0.85, 1], intensity: 2.1, direction: [0.3, -0.2, 0.9] },
        practicals: [
          { id: "neon-practical-left", label: "Neon practical light", color: [1, 0.22, 0.78], intensity: 3.6, semanticTags: ["neon-practical-light", "emissive-neon-panel"] }
        ]
      },
      postProcess: { bloom: 0.45, vignette: 0.18, filmGrain: 0.08, depthHaze: 0.35 }
    },
    shots: [
      {
        id: "shot-slow-dolly-reveal",
        label: "Slow dolly reveal",
        durationSeconds: 12,
        movement: "dolly",
        camera: {
          id: "camera-hero",
          lens: "wide",
          focalLengthMm: 35,
          startPosition: [0, 0.9, 4.2],
          endPosition: [-0.15, 0.85, 2.2],
          target: [-0.15, 0.55, -0.75],
          framing: "medium-hero"
        },
        emotionalBeat: "The robot discovers the flower as rain catches the neon backlight.",
        blockingNotes: "Robot left foreground, flower low center, alley depth and practical lights behind."
      }
    ],
    materials: [
      {
        id: "mat-robot-wet-metal",
        label: "Wet brushed robot metal",
        target: "hero-subject",
        descriptors: ["wet", "brushed metal", "scratched", "blue rim"],
        baseColor: [0.72, 0.68, 0.55, 1],
        metallic: 0.8,
        roughness: 0.28,
        wetness: 0.6,
        requiresRendererMaterial: true
      },
      {
        id: "mat-wet-pavement",
        label: "Wet black pavement",
        target: "ground",
        descriptors: ["wet-pavement", "asphalt", "reflective puddles"],
        baseColor: [0.03, 0.04, 0.05, 1],
        metallic: 0,
        roughness: 0.18,
        wetness: 1,
        clearcoat: 0.75,
        requiresRendererMaterial: true
      }
    ],
    vfx: [
      { id: "vfx-rain", kind: "rain", descriptors: ["slanted rain particles", "visible in neon backlight"], intensity: 0.7, density: 0.65, color: [0.65, 0.82, 1], rendererOwned: true },
      { id: "vfx-fog", kind: "fog", descriptors: ["low alley haze", "depth separation"], intensity: 0.45, density: 0.28, color: [0.16, 0.25, 0.38], rendererOwned: true },
      { id: "vfx-flower-glow", kind: "glow", targetId: "flower-hero", descriptors: ["cyan bloom", "soft emissive pulse"], intensity: 0.8, color: [0.2, 0.85, 1], rendererOwned: true }
    ],
    timeline: {
      durationSeconds: 12,
      beats: [
        { id: "beat-camera-dolly", atSeconds: 0, kind: "camera", targetId: "camera-hero", action: "dolly forward" },
        { id: "beat-robot-look", atSeconds: 3.2, kind: "character", targetId: "robot-hero", action: "look at flower" },
        { id: "beat-flower-pulse", atSeconds: 6.5, kind: "prop", targetId: "flower-hero", action: "emissive pulse" }
      ]
    },
    assetRequirements: [
      {
        id: "asset-robot-expressive",
        label: "Expressive robot character",
        category: "character-robot",
        role: "hero",
        semanticTags: ["robot", "character", "expressive"],
        moodTags: ["lonely", "hopeful", "cinematic"],
        materialDescriptors: ["wet metal", "riggable"],
        required: true,
        fallbackPriority: ["local-asset", "diagnostic-only"],
        blocking: { position: [-0.7, 0, 0.35], rotation: [0, 0.25, 0], scale: [1, 1, 1], lookAtId: "flower-hero" },
        disallowedSubstitutes: ["dom-css-only", "flat-overlay", "text-label"]
      },
      {
        id: "asset-glowing-flower",
        label: "Glowing flower",
        category: "prop",
        role: "supporting",
        semanticTags: ["glowing-flower", "flower", "emissive"],
        moodTags: ["hopeful", "neon"],
        materialDescriptors: ["translucent petals", "cyan emissive"],
        required: true,
        fallbackPriority: ["local-asset", "procedural-mesh", "diagnostic-only"],
        blocking: { position: [0.2, 0.02, -1.2], scale: [0.35, 0.35, 0.35] },
        disallowedSubstitutes: ["dom-css-only", "flat-overlay", "text-label"]
      },
      {
        id: "asset-rainy-neon-alley",
        label: "Rainy neon alley",
        category: "urban-environment",
        role: "environment",
        semanticTags: ["rainy-neon-alley", "urban", "alley", "street"],
        moodTags: ["rainy", "neon", "night"],
        materialDescriptors: ["wet walls", "depth", "occlusion"],
        required: true,
        fallbackPriority: ["local-asset", "procedural-set", "diagnostic-only"],
        blocking: { position: [0, 0, -1.5], scale: [1, 1, 1] },
        disallowedSubstitutes: ["dom-css-only", "flat-overlay", "text-label"]
      },
      {
        id: "asset-wet-pavement",
        label: "Wet pavement",
        category: "ground-stage-surface",
        role: "ground",
        semanticTags: ["wet-pavement", "asphalt", "ground", "reflective"],
        moodTags: ["rainy", "night"],
        materialDescriptors: ["wet", "puddles", "reflective"],
        required: true,
        fallbackPriority: ["local-asset", "procedural-mesh", "diagnostic-only"],
        blocking: { position: [0, -0.01, -0.8], scale: [6, 1, 10] },
        disallowedSubstitutes: ["dom-css-only", "flat-overlay"]
      },
      {
        id: "asset-neon-practical-light",
        label: "Neon practical light",
        category: "emissive-neon-panel",
        role: "practical-light",
        semanticTags: ["neon-practical-light", "emissive", "practical-light"],
        moodTags: ["neon", "night"],
        materialDescriptors: ["emissive panel", "renderer light metadata"],
        required: true,
        fallbackPriority: ["local-asset", "procedural-mesh", "diagnostic-only"],
        blocking: { position: [1.7, 1.9, -1.8], rotation: [0, -0.45, 0], scale: [1.2, 0.25, 0.08] },
        disallowedSubstitutes: ["dom-css-only", "flat-overlay", "text-label"]
      }
    ],
    backendPreference: "webgl2",
    qualityTarget: "L3-cinematic-realtime",
    negativeConstraints: [
      "Do not claim final-film or offline-render quality.",
      "Do not satisfy hero props, environments, rain, fog, glow, or practical lights with DOM/CSS overlays.",
      "Do not present unresolved placeholders as the first visual impression."
    ]
  };
}
