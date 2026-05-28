export const AURA_SCENE_IR_SCHEMA_VERSION = "aura-scene-ir/1.0";

export type AuraSceneBackendPreference = "auto" | "webgl2" | "webgpu";
export type AuraSceneQualityTarget =
  | "L0"
  | "L1"
  | "L2"
  | "L3"
  | "L4"
  | "L5"
  | "L0-schema-proof"
  | "L1-primitive-previs"
  | "L2-asset-backed-previs"
  | "L3-cinematic-realtime"
  | "L4-production-assisted"
  | "L5-offline-final";

export type AuraVec3 = readonly [number, number, number];
export type AuraColor = readonly [number, number, number];
export type AuraColorAlpha = readonly [number, number, number, number];

export interface AuraSceneTransform {
  readonly position: AuraVec3;
  readonly rotation: AuraVec3;
  readonly scale: AuraVec3;
}

export interface AuraSceneEnvironment {
  readonly id: string;
  readonly label: string;
  readonly kind: "studio" | "interior" | "exterior" | "city" | "forest" | "abstract" | "custom";
  readonly timeOfDay?: "dawn" | "day" | "golden-hour" | "night" | "stage";
  readonly moodTags: readonly string[];
  readonly backgroundColor?: AuraColor;
  readonly ground?: {
    readonly enabled: boolean;
    readonly sizeMeters: number;
    readonly materialId?: string;
  };
}

export interface AuraMaterialPlan {
  readonly id: string;
  readonly label: string;
  readonly baseColor: AuraColorAlpha;
  readonly metallic: number;
  readonly roughness: number;
  readonly clearcoat?: number;
  readonly transmission?: number;
  readonly emissive?: AuraColor;
  readonly emissiveStrength?: number;
  readonly source: "prompt" | "asset" | "default" | "patch";
}

export interface AuraSceneObject {
  readonly id: string;
  readonly label: string;
  readonly role: "hero" | "support" | "background" | "set" | "prop" | "vfx";
  readonly kind: "asset" | "primitive" | "placeholder";
  readonly assetRequirementId?: string;
  readonly primitive?: "cube" | "sphere" | "plane" | "capsule" | "points";
  readonly materialId?: string;
  readonly transform: AuraSceneTransform;
  readonly semanticTags: readonly string[];
  readonly animation?: {
    readonly id: string;
    readonly kind: "orbit" | "turntable" | "idle" | "camera-relative" | "none";
    readonly durationSeconds: number;
  };
}

export interface AuraSceneCharacter extends AuraSceneObject {
  readonly rigIntent?: "static" | "simple-loop" | "facial-expression" | "full-body";
  readonly dialogueIntent?: string;
}

export interface AuraLightingPlan {
  readonly id: string;
  readonly label: string;
  readonly mood: string;
  readonly exposure: number;
  readonly keyLight: {
    readonly direction: AuraVec3;
    readonly color: AuraColor;
    readonly intensity: number;
  };
  readonly fillLight?: {
    readonly direction: AuraVec3;
    readonly color: AuraColor;
    readonly intensity: number;
  };
  readonly rimLight?: {
    readonly direction: AuraVec3;
    readonly color: AuraColor;
    readonly intensity: number;
  };
}

export interface AuraCameraPlan {
  readonly id: string;
  readonly label: string;
  readonly kind: "perspective";
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly focalLengthMm: number;
  readonly fovDegrees: number;
  readonly stableId: string;
}

export interface AuraShotPlan {
  readonly id: string;
  readonly label: string;
  readonly cameraId: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly movement: "static" | "push-in" | "orbit" | "truck" | "crane" | "handheld";
  readonly notes: string;
}

export interface AuraTimelineCue {
  readonly id: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly kind: "camera" | "object" | "lighting" | "vfx" | "audio";
  readonly targetId: string;
  readonly action: string;
}

export interface AuraVFXCue {
  readonly id: string;
  readonly kind: "particles" | "fog" | "glow" | "rain" | "dust" | "none";
  readonly targetId?: string;
  readonly intensity: number;
  readonly notes: string;
}

export interface AuraPhysicsCue {
  readonly id: string;
  readonly kind: "static-collider" | "rigid-body" | "trigger" | "none";
  readonly targetId?: string;
  readonly approximation?: string;
}

export interface AuraAudioCue {
  readonly id: string;
  readonly kind: "ambient" | "dialogue" | "foley" | "music" | "none";
  readonly prompt: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export interface AuraAssetRequirement {
  readonly id: string;
  readonly label: string;
  readonly type: "gltf" | "texture" | "environment" | "audio" | "generated" | "unknown";
  readonly semanticTags: readonly string[];
  readonly styleTags: readonly string[];
  readonly required: boolean;
  readonly preferredUri?: string;
  readonly license?: string;
  readonly source?: string;
}

export interface AuraSceneUnresolvedItem {
  readonly id: string;
  readonly path: string;
  readonly reason: string;
  readonly fallback: string;
}

export interface AuraPromptProvenanceRecord {
  readonly provider: string;
  readonly model: string;
  readonly promptHash: string;
  readonly generatedAt: string;
  readonly networkUsed?: boolean;
  readonly promptPreview: string;
  readonly requestId?: string;
  readonly sceneId?: string;
  readonly patchId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly patches: readonly AuraPatchProvenanceRecord[];
}

export interface AuraPatchProvenanceRecord {
  readonly patchId: string;
  readonly changeCount?: number;
  readonly promptHash: string;
  readonly provider: string;
  readonly generatedAt: string;
}

export interface AuraSceneIR {
  readonly schemaVersion: typeof AURA_SCENE_IR_SCHEMA_VERSION;
  readonly sceneId: string;
  readonly title: string;
  readonly brief: string;
  readonly mood: readonly string[];
  readonly environment: AuraSceneEnvironment;
  readonly objects: readonly AuraSceneObject[];
  readonly characters: readonly AuraSceneCharacter[];
  readonly materials: readonly AuraMaterialPlan[];
  readonly lighting: AuraLightingPlan;
  readonly cameras: readonly AuraCameraPlan[];
  readonly shots: readonly AuraShotPlan[];
  readonly timeline: readonly AuraTimelineCue[];
  readonly vfx: readonly AuraVFXCue[];
  readonly physics: readonly AuraPhysicsCue[];
  readonly audio: readonly AuraAudioCue[];
  readonly assetRequirements: readonly AuraAssetRequirement[];
  readonly backendPreference: AuraSceneBackendPreference;
  readonly qualityTarget: AuraSceneQualityTarget;
  readonly unresolved: readonly AuraSceneUnresolvedItem[];
  readonly provenance: AuraPromptProvenanceRecord;
}

export function createDefaultTransform(overrides: Partial<AuraSceneTransform> = {}): AuraSceneTransform {
  return {
    position: overrides.position ?? [0, 0, 0],
    rotation: overrides.rotation ?? [0, 0, 0],
    scale: overrides.scale ?? [1, 1, 1]
  };
}

export function createAuraSceneIRExamples(generatedAt = "2026-01-01T00:00:00.000Z"): Record<string, AuraSceneIR> {
  const base = createTinyRobotGreenhouseSceneIR({ generatedAt });
  return {
    cinematic: base,
    product: createTinyProductSceneIR({ generatedAt }),
    game: {
      ...base,
      sceneId: "example-game-arena",
      title: "Mini Game Arena",
      brief: "Small playable arena with glowing pickups and a controllable hero placeholder.",
      qualityTarget: "L2-asset-backed-previs",
      mood: ["playable", "arcade", "clear"]
    },
    architecture: {
      ...base,
      sceneId: "example-architecture-gallery",
      title: "Soft Gallery Interior",
      brief: "Architecture previs scene with neutral walls, product plinths, and camera walkthrough cues.",
      environment: { ...base.environment, id: "gallery-env", label: "Soft Gallery", kind: "interior", moodTags: ["quiet", "gallery"] }
    },
    abstract: {
      ...base,
      sceneId: "example-abstract-vortex",
      title: "Abstract Light Vortex",
      brief: "Abstract particle and primitive study with emissive dots and orbiting camera.",
      objects: base.objects.map((object) => ({ ...object, primitive: "sphere" as const, semanticTags: ["abstract", "light", "placeholder"] })),
      vfx: [{ id: "vfx-orbit-points", kind: "particles", intensity: 0.65, notes: "Approximated as point sprites in browser route." }]
    }
  };
}

export function createTinyRobotGreenhouseSceneIR(options: { readonly generatedAt?: string; readonly promptHash?: string } = {}): AuraSceneIR {
  const generatedAt = options.generatedAt ?? new Date(0).toISOString();
  return {
    schemaVersion: AURA_SCENE_IR_SCHEMA_VERSION,
    sceneId: "mock-tiny-robot-greenhouse",
    title: "Tiny Robot Greenhouse",
    brief: "A small robot tends luminous plants inside a warm greenhouse, rendered as real-time previs.",
    mood: ["warm", "hopeful", "cinematic"],
    environment: {
      id: "env-greenhouse",
      label: "Warm Greenhouse Stage",
      kind: "interior",
      timeOfDay: "golden-hour",
      moodTags: ["warm", "organic", "previs"],
      backgroundColor: [0.07, 0.09, 0.1],
      ground: { enabled: true, sizeMeters: 8, materialId: "mat-warm-concrete" }
    },
    objects: [
      {
        id: "obj-robot-helper",
        label: "Robot helper",
        role: "hero",
        kind: "asset",
        assetRequirementId: "asset-robot",
        materialId: "mat-brushed-saffron",
        transform: createDefaultTransform({ position: [0, 0.6, 0], scale: [1.1, 1.1, 1.1] }),
        semanticTags: ["robot", "character", "hero"],
        animation: { id: "anim-robot-idle", kind: "idle", durationSeconds: 6 }
      },
      {
        id: "obj-glow-planter",
        label: "Luminous planter",
        role: "support",
        kind: "primitive",
        primitive: "sphere",
        materialId: "mat-leaf-glow",
        transform: createDefaultTransform({ position: [-1.2, 0.35, -0.5], scale: [0.7, 0.7, 0.7] }),
        semanticTags: ["plant", "light", "prop"]
      },
      {
        id: "obj-glass-wall",
        label: "Greenhouse glass wall",
        role: "set",
        kind: "primitive",
        primitive: "cube",
        materialId: "mat-glass-panel",
        transform: createDefaultTransform({ position: [0, 1.25, -1.6], scale: [3.5, 2.5, 0.08] }),
        semanticTags: ["architecture", "glass", "set"]
      }
    ],
    characters: [],
    materials: [
      { id: "mat-brushed-saffron", label: "Brushed saffron metal", baseColor: [0.92, 0.72, 0.28, 1], metallic: 0.55, roughness: 0.34, source: "prompt" },
      { id: "mat-leaf-glow", label: "Soft leaf glow", baseColor: [0.3, 0.95, 0.48, 1], metallic: 0.02, roughness: 0.52, emissive: [0.08, 0.45, 0.18], emissiveStrength: 1.4, source: "prompt" },
      { id: "mat-glass-panel", label: "Greenhouse glass", baseColor: [0.62, 0.86, 0.92, 0.42], metallic: 0, roughness: 0.08, transmission: 0.55, source: "prompt" },
      { id: "mat-warm-concrete", label: "Warm concrete", baseColor: [0.52, 0.5, 0.45, 1], metallic: 0, roughness: 0.68, source: "default" }
    ],
    lighting: {
      id: "light-golden-stage",
      label: "Golden greenhouse lighting",
      mood: "warm cinematic key with soft fill",
      exposure: 1.12,
      keyLight: { direction: [-0.5, -0.9, -0.4], color: [1, 0.82, 0.56], intensity: 1.45 },
      fillLight: { direction: [0.6, -0.5, 0.2], color: [0.45, 0.7, 1], intensity: 0.32 },
      rimLight: { direction: [0.1, -0.4, 0.95], color: [0.75, 1, 0.8], intensity: 0.42 }
    },
    cameras: [
      { id: "cam-hero-push", stableId: "cam-hero-push", label: "Hero push-in", kind: "perspective", position: [2.9, 1.6, 3.4], target: [0, 0.7, 0], focalLengthMm: 45, fovDegrees: 42 }
    ],
    shots: [
      { id: "shot-opening", label: "Opening push", cameraId: "cam-hero-push", startSeconds: 0, endSeconds: 5, movement: "push-in", notes: "Slow push toward the robot and glowing planter." }
    ],
    timeline: [
      { id: "cue-camera-opening", startSeconds: 0, endSeconds: 5, kind: "camera", targetId: "cam-hero-push", action: "push-in" },
      { id: "cue-plant-glow", startSeconds: 1, endSeconds: 5, kind: "vfx", targetId: "obj-glow-planter", action: "pulse glow" }
    ],
    vfx: [{ id: "vfx-dust-motes", kind: "dust", intensity: 0.4, notes: "Floating greenhouse dust motes approximated with particles." }],
    physics: [{ id: "phys-ground", kind: "static-collider", targetId: "env-greenhouse", approximation: "single ground plane" }],
    audio: [{ id: "aud-greenhouse-ambience", kind: "ambient", prompt: "quiet greenhouse hum", startSeconds: 0, endSeconds: 5 }],
    assetRequirements: [
      { id: "asset-robot", label: "Friendly compact robot", type: "gltf", semanticTags: ["robot", "character"], styleTags: ["friendly", "previs"], required: false, preferredUri: "fixtures/threejs-parity/assets/character/robot-expressive.glb", source: "fixture", license: "repository fixture" }
    ],
    backendPreference: "auto",
    qualityTarget: "L3-cinematic-realtime",
    unresolved: [],
    provenance: {
      provider: "mock",
      model: "mock-deterministic-aura-scene-1",
      promptHash: options.promptHash ?? "mock-prompt-hash",
      generatedAt,
      networkUsed: false,
      promptPreview: "A small robot tends luminous plants inside a warm greenhouse.",
      patches: []
    }
  };
}

export function createTinyProductSceneIR(options: { readonly generatedAt?: string; readonly promptHash?: string } = {}): AuraSceneIR {
  const scene = createTinyRobotGreenhouseSceneIR(options);
  return {
    ...scene,
    sceneId: "mock-product-shot",
    title: "AI Product Shot",
    brief: "A compact product-stage draft with a hero prop, studio lighting, material notes, and orbit-ready camera.",
    mood: ["clean", "studio", "product"],
    objects: [
      {
        id: "obj-hero-product",
        label: "Hero product",
        role: "hero",
        kind: "asset",
        assetRequirementId: "asset-duck",
        materialId: "mat-product-yellow",
        transform: createDefaultTransform({ position: [0, 0.55, 0], scale: [1.4, 1.4, 1.4] }),
        semanticTags: ["product", "prop", "hero"],
        animation: { id: "anim-turntable", kind: "turntable", durationSeconds: 8 }
      }
    ],
    materials: [
      { id: "mat-product-yellow", label: "Gloss yellow product", baseColor: [1, 0.86, 0.05, 1], metallic: 0, roughness: 0.22, clearcoat: 0.65, source: "prompt" },
      { id: "mat-warm-concrete", label: "Neutral studio floor", baseColor: [0.48, 0.49, 0.52, 1], metallic: 0, roughness: 0.62, source: "default" }
    ],
    assetRequirements: [
      { id: "asset-duck", label: "Product prop", type: "gltf", semanticTags: ["product", "prop", "duck"], styleTags: ["studio"], required: false, preferredUri: "fixtures/asset-corpus/duck.glb", source: "fixture", license: "repository fixture" }
    ],
    environment: { ...scene.environment, id: "env-product-stage", label: "Product Studio", kind: "studio", moodTags: ["product", "clean", "studio"] },
    shots: [{ id: "shot-product-orbit", label: "Product orbit", cameraId: "cam-hero-push", startSeconds: 0, endSeconds: 6, movement: "orbit", notes: "Clean orbit around hero product." }],
    timeline: [{ id: "cue-product-orbit", startSeconds: 0, endSeconds: 6, kind: "camera", targetId: "cam-hero-push", action: "orbit" }]
  };
}
