import { expect } from "vitest";

export interface TestAuraSceneIR {
  readonly schemaVersion: "aura-scene-ir/1.0";
  readonly sceneId: string;
  readonly title: string;
  readonly brief: string;
  readonly mood: readonly string[];
  readonly environment: {
    readonly id: string;
    readonly kind: string;
    readonly timeOfDay: string;
    readonly weather: string;
  };
  readonly objects: readonly TestSceneObject[];
  readonly characters: readonly TestSceneObject[];
  readonly materials: readonly TestSceneMaterial[];
  readonly lighting: {
    readonly mood: string;
    readonly key: TestSceneLight;
    readonly rim?: TestSceneLight;
  };
  readonly cameras: readonly TestSceneCamera[];
  readonly shots: readonly TestSceneShot[];
  readonly timeline: {
    readonly durationSeconds: number;
    readonly cues: readonly TestTimelineCue[];
  };
  readonly vfx: readonly TestVfxCue[];
  readonly physics: {
    readonly enabled: boolean;
    readonly cues: readonly unknown[];
  };
  readonly audio: {
    readonly hooks: readonly unknown[];
  };
  readonly assetRequirements: readonly TestAssetRequirement[];
  readonly backendPreference: "webgl2" | "webgpu" | "auto";
  readonly qualityTarget: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  readonly unresolved: readonly unknown[];
  readonly provenance: {
    readonly provider: string;
    readonly model: string;
    readonly promptHash: string;
    readonly generatedAt: string;
    readonly patches: readonly unknown[];
  };
}

export interface TestSceneObject {
  readonly id: string;
  readonly label: string;
  readonly kind: "prop" | "character" | "environment";
  readonly assetHint?: string;
  readonly transform: {
    readonly position: readonly [number, number, number];
    readonly rotation: readonly [number, number, number];
    readonly scale: readonly [number, number, number];
  };
  readonly materialId?: string;
}

export interface TestSceneMaterial {
  readonly id: string;
  readonly baseColor: readonly [number, number, number, number];
  readonly roughness: number;
  readonly metallic: number;
  readonly emissive?: readonly [number, number, number];
}

export interface TestSceneLight {
  readonly id: string;
  readonly type: "directional" | "point" | "spot" | "ambient";
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly position?: readonly [number, number, number];
}

export interface TestSceneCamera {
  readonly id: string;
  readonly lens: "wide" | "normal" | "telephoto";
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

export interface TestSceneShot {
  readonly id: string;
  readonly cameraId: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly movement: "locked" | "dolly" | "orbit" | "pan" | "crane";
}

export interface TestTimelineCue {
  readonly id: string;
  readonly atSeconds: number;
  readonly kind: string;
  readonly targetId: string;
}

export interface TestVfxCue {
  readonly id: string;
  readonly kind: "fog" | "particles" | "glow";
  readonly density?: number;
  readonly color?: readonly [number, number, number];
}

export interface TestAssetRequirement {
  readonly id: string;
  readonly semantic: string;
  readonly tags: readonly string[];
  readonly required: boolean;
}

export function createNeonAlleyIR(): TestAuraSceneIR {
  return {
    schemaVersion: "aura-scene-ir/1.0",
    sceneId: "scene-neon-alley-001",
    title: "Rainy Neon Alley",
    brief: "A lonely robot finds a glowing flower in a rainy neon alley.",
    mood: ["rainy", "neon", "lonely", "hopeful"],
    environment: {
      id: "env_alley_01",
      kind: "urban-alley",
      timeOfDay: "night",
      weather: "rain"
    },
    objects: [
      {
        id: "flower_01",
        label: "Glowing flower",
        kind: "prop",
        assetHint: "glowing flower",
        transform: {
          position: [0.2, 0, -1.2],
          rotation: [0, 0, 0],
          scale: [0.35, 0.35, 0.35]
        },
        materialId: "mat_flower_glow"
      }
    ],
    characters: [
      {
        id: "robot_01",
        label: "Lonely robot",
        kind: "character",
        assetHint: "robot",
        transform: {
          position: [-0.7, 0, 0.35],
          rotation: [0, 0.25, 0],
          scale: [1, 1, 1]
        },
        materialId: "mat_robot_wet"
      }
    ],
    materials: [
      {
        id: "mat_robot_wet",
        baseColor: [0.75, 0.68, 0.46, 1],
        roughness: 0.28,
        metallic: 0.75
      },
      {
        id: "mat_flower_glow",
        baseColor: [0.28, 0.9, 1, 1],
        roughness: 0.12,
        metallic: 0,
        emissive: [0.2, 0.75, 1]
      }
    ],
    lighting: {
      mood: "blue-rim-neon",
      key: {
        id: "light_key_01",
        type: "directional",
        color: [0.55, 0.72, 1],
        intensity: 1.4,
        position: [-2, 5, 4]
      },
      rim: {
        id: "light_rim_01",
        type: "point",
        color: [0.2, 0.85, 1],
        intensity: 2.2,
        position: [1.4, 1.2, -1.2]
      }
    },
    cameras: [
      {
        id: "camera_hero",
        lens: "wide",
        position: [0, 0.85, 4.2],
        target: [-0.1, 0.55, -0.5]
      }
    ],
    shots: [
      {
        id: "shot_001",
        cameraId: "camera_hero",
        startSeconds: 0,
        endSeconds: 12,
        movement: "dolly"
      }
    ],
    timeline: {
      durationSeconds: 12,
      cues: [
        { id: "cue_robot_look", atSeconds: 3.2, kind: "look-at", targetId: "robot_01" },
        { id: "cue_flower_glow", atSeconds: 6.5, kind: "emissive-pulse", targetId: "flower_01" }
      ]
    },
    vfx: [
      {
        id: "fog_01",
        kind: "fog",
        density: 0.28,
        color: [0.22, 0.34, 0.52]
      },
      {
        id: "rain_01",
        kind: "particles",
        density: 0.55,
        color: [0.6, 0.8, 1]
      }
    ],
    physics: {
      enabled: false,
      cues: []
    },
    audio: {
      hooks: []
    },
    assetRequirements: [
      {
        id: "asset_robot",
        semantic: "robot",
        tags: ["character", "robot", "expressive"],
        required: true
      },
      {
        id: "asset_flower",
        semantic: "glowing flower",
        tags: ["prop", "flower", "emissive"],
        required: false
      }
    ],
    backendPreference: "auto",
    qualityTarget: "L3",
    unresolved: [],
    provenance: {
      provider: "mock",
      model: "aura-mock-scene-v1",
      promptHash: "sha256:fixture-neon-alley",
      generatedAt: "2026-05-26T00:00:00.000Z",
      patches: []
    }
  };
}

export function expectDiagnosticShape(diagnostic: unknown): void {
  expectObject(diagnostic);
  expect(typeof diagnostic.code).toBe("string");
  expect(["info", "warning", "error"]).toContain(diagnostic.severity);
  expect(typeof diagnostic.path).toBe("string");
  expect(typeof diagnostic.message).toBe("string");
  expect(typeof diagnostic.fixSuggestion).toBe("string");
}

function expectObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object, received ${String(value)}`);
  }
}
