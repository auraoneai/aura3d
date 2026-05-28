export type AuraSceneStatus = "idle" | "generating" | "ready" | "patching" | "error";

export interface AuraScenePromptRequest {
  readonly prompt: string;
  readonly qualityTarget?: "L1" | "L2" | "L3";
}

export interface AuraScenePatchRequest {
  readonly prompt: string;
  readonly scene: AuraSceneIR;
}

export interface AuraSceneProviderInfo {
  readonly id: string;
  readonly label: string;
  readonly model: string;
  readonly requiresApiKey: boolean;
}

export interface AuraSceneProvider {
  readonly info: AuraSceneProviderInfo;
  generateScene(request: AuraScenePromptRequest): Promise<AuraSceneIR>;
  generatePatch(request: AuraScenePatchRequest): Promise<AuraScenePatch>;
}

export interface AuraSceneIR {
  readonly schemaVersion: "aura-scene-ir/0.1";
  readonly sceneId: string;
  readonly title: string;
  readonly brief: string;
  readonly mood: readonly string[];
  readonly environment: {
    readonly id: string;
    readonly label: string;
    readonly palette: readonly string[];
    readonly fogDensity: number;
    readonly ground: string;
  };
  readonly objects: readonly AuraSceneObject[];
  readonly lighting: {
    readonly key: string;
    readonly rim: string;
    readonly practicals: number;
  };
  readonly cameras: readonly {
    readonly id: string;
    readonly label: string;
    readonly position: readonly [number, number, number];
    readonly movement: string;
  }[];
  readonly timeline: {
    readonly durationSeconds: number;
    readonly beats: readonly string[];
  };
  readonly vfx: readonly {
    readonly id: string;
    readonly kind: "fog" | "rain" | "glow" | "particles";
    readonly intensity: number;
  }[];
  readonly assetRequirements: readonly string[];
  readonly unresolved: readonly string[];
  readonly provenance: {
    readonly provider: string;
    readonly model: string;
    readonly promptHash: string;
    readonly generatedAt: string;
    readonly patchCount: number;
  };
}

export interface AuraSceneObject {
  readonly id: string;
  readonly label: string;
  readonly kind: "character" | "prop" | "environment" | "light";
  readonly shape: "robot" | "flower" | "tower" | "box" | "sphere" | "plane";
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly material: {
    readonly color: string;
    readonly emissive?: string;
    readonly metallic: number;
    readonly roughness: number;
  };
  readonly placeholder: boolean;
}

export interface AuraScenePatch {
  readonly id: string;
  readonly prompt: string;
  readonly summary: string;
  readonly operations: readonly AuraScenePatchOperation[];
}

export type AuraScenePatchOperation =
  | { readonly type: "set-object-scale"; readonly objectId: string; readonly scale: readonly [number, number, number] }
  | { readonly type: "set-object-position"; readonly objectId: string; readonly position: readonly [number, number, number] }
  | { readonly type: "set-fog-density"; readonly fogDensity: number }
  | { readonly type: "set-camera-position"; readonly cameraId: string; readonly position: readonly [number, number, number] }
  | { readonly type: "set-lighting"; readonly key?: string; readonly rim?: string; readonly practicals?: number };

export interface AuraSceneDiagnostics {
  readonly provider: AuraSceneProviderInfo;
  readonly selectedBackend: "canvas2d-previs";
  readonly qualityTarget: "L1" | "L2" | "L3";
  readonly renderSize: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly resolvedAssets: readonly string[];
  readonly placeholders: readonly string[];
  readonly warnings: readonly string[];
  readonly exportReady: boolean;
  readonly screenshotCaptured: boolean;
  readonly patchCount: number;
}

export class MockProvider implements AuraSceneProvider {
  readonly info: AuraSceneProviderInfo = {
    id: "mock-provider",
    label: "MockProvider",
    model: "aura-scene-mock-0.1",
    requiresApiKey: false
  };

  async generateScene(request: AuraScenePromptRequest): Promise<AuraSceneIR> {
    const prompt = request.prompt.trim() || DEFAULT_PROMPT;
    const promptHash = stableHash(prompt);
    const wet = /rain|wet|storm|puddle/i.test(prompt);
    const neon = /neon|cyber|blue|pink|glow/i.test(prompt);
    const robot = /robot|android|machine/i.test(prompt);
    const flower = /flower|plant|bloom/i.test(prompt);
    const cinematic = /cinematic|dolly|camera|shot|film/i.test(prompt);
    const palette = neon
      ? ["#38d6ff", "#ff4fd8", "#f6fbff", "#07111d"]
      : ["#7dd3fc", "#f8d98a", "#ecfdf5", "#0c1118"];

    return {
      schemaVersion: "aura-scene-ir/0.1",
      sceneId: `mock-scene-${promptHash.slice(0, 8)}`,
      title: neon ? "Rainy Neon Alley" : "AI Scene Previs",
      brief: prompt,
      mood: [
        wet ? "rain-soaked" : "atmospheric",
        neon ? "neon-lit" : "studio-lit",
        cinematic ? "cinematic" : "previs"
      ],
      environment: {
        id: "env_alley_01",
        label: wet ? "wet alley" : "abstract stage",
        palette,
        fogDensity: wet ? 0.34 : 0.18,
        ground: wet ? "reflective pavement" : "matte floor"
      },
      objects: [
        {
          id: "robot_01",
          label: robot ? "lonely robot" : "hero placeholder",
          kind: "character",
          shape: "robot",
          position: [-0.7, 0.08, 0],
          scale: [1, 1, 1],
          material: { color: "#c9d3df", emissive: "#38d6ff", metallic: 0.72, roughness: 0.28 },
          placeholder: true
        },
        {
          id: "flower_01",
          label: flower ? "glowing flower" : "glowing prop",
          kind: "prop",
          shape: "flower",
          position: [0.74, 0.08, 0.05],
          scale: [1, 1, 1],
          material: { color: "#8dffab", emissive: "#c7ff66", metallic: 0.05, roughness: 0.22 },
          placeholder: true
        },
        {
          id: "alley_wall_left",
          label: "left alley wall",
          kind: "environment",
          shape: "tower",
          position: [-1.85, 0.2, -0.15],
          scale: [1.1, 2.5, 1],
          material: { color: "#182235", metallic: 0.1, roughness: 0.7 },
          placeholder: true
        },
        {
          id: "alley_wall_right",
          label: "right alley wall",
          kind: "environment",
          shape: "tower",
          position: [1.85, 0.2, -0.1],
          scale: [1.1, 2.3, 1],
          material: { color: "#17192b", metallic: 0.08, roughness: 0.74 },
          placeholder: true
        }
      ],
      lighting: {
        key: palette[0] ?? "#38d6ff",
        rim: palette[1] ?? "#ff4fd8",
        practicals: neon ? 7 : 3
      },
      cameras: [{
        id: "shot_camera_01",
        label: cinematic ? "slow dolly close-up" : "default previs camera",
        position: [0, 0.88, 4.2],
        movement: cinematic ? "slow dolly in" : "locked orbit"
      }],
      timeline: {
        durationSeconds: cinematic ? 12 : 8,
        beats: [
          "establish wet reflective ground",
          "robot enters pool of rim light",
          "flower glow becomes the visual anchor"
        ]
      },
      vfx: [
        { id: "fog_01", kind: "fog", intensity: wet ? 0.62 : 0.34 },
        { id: "rain_01", kind: "rain", intensity: wet ? 0.7 : 0.18 },
        { id: "flower_glow_01", kind: "glow", intensity: flower ? 0.88 : 0.55 }
      ],
      assetRequirements: ["robot character", "flower prop", "wet pavement material", "neon practical lights"],
      unresolved: ["production robot rig", "authored alley GLB", "volumetric fog shader"],
      provenance: {
        provider: this.info.id,
        model: this.info.model,
        promptHash,
        generatedAt: new Date(0).toISOString(),
        patchCount: 0
      }
    };
  }

  async generatePatch(request: AuraScenePatchRequest): Promise<AuraScenePatch> {
    const prompt = request.prompt.trim() || "increase fog";
    const lowerCamera = /camera.*lower|lower.*camera|low angle/i.test(prompt);
    const smallerRobot = /robot.*small|smaller.*robot|tiny robot/i.test(prompt);
    const moreFog = /more fog|foggier|mist/i.test(prompt);
    const warmer = /warm|gold|sunset/i.test(prompt);
    const operations: AuraScenePatchOperation[] = [];
    if (smallerRobot) operations.push({ type: "set-object-scale", objectId: "robot_01", scale: [0.68, 0.68, 0.68] });
    if (moreFog) operations.push({ type: "set-fog-density", fogDensity: 0.48 });
    if (lowerCamera) operations.push({ type: "set-camera-position", cameraId: "shot_camera_01", position: [0, 0.42, 4.6] });
    if (warmer) operations.push({ type: "set-lighting", key: "#ffd166", rim: "#ff7a59", practicals: 9 });
    if (operations.length === 0) {
      operations.push({ type: "set-fog-density", fogDensity: Math.min(0.62, request.scene.environment.fogDensity + 0.08) });
    }
    return {
      id: `patch-${stableHash(`${request.scene.sceneId}:${prompt}`).slice(0, 8)}`,
      prompt,
      summary: summarizePatch(operations),
      operations
    };
  }
}

export const DEFAULT_PROMPT = "Create a rainy neon alley at night. A lonely robot finds a glowing flower. Make it emotional, cinematic, with wet pavement, fog, blue rim light, a slow dolly camera move, and a 12-second shot.";

export function applyAuraScenePatch(scene: AuraSceneIR, patch: AuraScenePatch): AuraSceneIR {
  let objects = scene.objects;
  let environment = scene.environment;
  let cameras = scene.cameras;
  let lighting = scene.lighting;

  for (const operation of patch.operations) {
    if (operation.type === "set-object-scale") {
      objects = objects.map((object) => object.id === operation.objectId ? { ...object, scale: operation.scale } : object);
    } else if (operation.type === "set-object-position") {
      objects = objects.map((object) => object.id === operation.objectId ? { ...object, position: operation.position } : object);
    } else if (operation.type === "set-fog-density") {
      environment = { ...environment, fogDensity: operation.fogDensity };
    } else if (operation.type === "set-camera-position") {
      cameras = cameras.map((camera) => camera.id === operation.cameraId ? { ...camera, position: operation.position } : camera);
    } else if (operation.type === "set-lighting") {
      lighting = {
        key: operation.key ?? lighting.key,
        rim: operation.rim ?? lighting.rim,
        practicals: operation.practicals ?? lighting.practicals
      };
    }
  }

  return {
    ...scene,
    objects,
    environment,
    cameras,
    lighting,
    provenance: {
      ...scene.provenance,
      patchCount: scene.provenance.patchCount + 1
    }
  };
}

export function createAuraSceneDiagnostics(options: {
  readonly provider: AuraSceneProviderInfo;
  readonly scene: AuraSceneIR | null;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly screenshotCaptured: boolean;
  readonly exportReady: boolean;
}): AuraSceneDiagnostics {
  const placeholders = options.scene?.objects.filter((object) => object.placeholder).map((object) => object.label) ?? [];
  const resolvedAssets = options.scene?.assetRequirements.filter((asset) => !/robot|alley/i.test(asset)) ?? [];
  const warnings = [
    ...(options.scene?.unresolved ?? []),
    ...(placeholders.length > 0 ? [`${placeholders.length} placeholder objects used`] : [])
  ];
  return {
    provider: options.provider,
    selectedBackend: "canvas2d-previs",
    qualityTarget: "L1",
    renderSize: `${options.renderWidth}x${options.renderHeight}`,
    frameCount: options.frameCount,
    drawCalls: options.drawCalls,
    resolvedAssets,
    placeholders,
    warnings,
    exportReady: options.exportReady,
    screenshotCaptured: options.screenshotCaptured,
    patchCount: options.scene?.provenance.patchCount ?? 0
  };
}

export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function summarizePatch(operations: readonly AuraScenePatchOperation[]): string {
  return operations.map((operation) => {
    if (operation.type === "set-object-scale") return `scale ${operation.objectId}`;
    if (operation.type === "set-object-position") return `move ${operation.objectId}`;
    if (operation.type === "set-fog-density") return "adjust fog";
    if (operation.type === "set-camera-position") return "move camera";
    return "adjust lighting";
  }).join(", ");
}
