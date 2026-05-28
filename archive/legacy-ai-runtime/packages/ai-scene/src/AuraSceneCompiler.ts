import { Geometry, PBRMaterial, createLightingDefault, type EnvironmentLightingOptions, type RenderItem, type RendererPostProcessOptions } from "@aura3d/rendering";
import { composeMat4 } from "@aura3d/scene";
import { createDefaultAssetResolver, type AuraAssetResolver, type AuraResolvedAsset } from "./AuraAssetResolver.js";
import { createAuraSceneDiagnostics, type AuraSceneDiagnostics } from "./AuraSceneDiagnostics.js";
import { createValidationError, diagnostic, validateAuraSceneIR, type AuraSceneValidationIssue } from "./AuraSceneValidator.js";
import { buildAuraWorldPlan, type AuraWorldPlan } from "./AuraWorldBuilder.js";
import { AURA_SCENE_IR_SCHEMA_VERSION, type AuraMaterialPlan, type AuraSceneIR, type AuraSceneObject, type AuraSceneQualityTarget } from "./AuraSceneIR.js";

export type AuraRuntimeDiagnostics = readonly AuraSceneValidationIssue[] & AuraSceneDiagnostics;

export interface AuraCompiledSceneRuntime {
  readonly kind: "aura3d-compiled-scene";
  readonly sceneId: string;
  readonly ir: AuraSceneIR;
  readonly world: AuraWorldPlan;
  readonly renderItems: readonly RenderItem[];
  readonly environmentLighting: EnvironmentLightingOptions;
  readonly postprocess: RendererPostProcessOptions | false;
  readonly resolvedAssets: readonly AuraResolvedAsset[];
  readonly diagnostics: AuraRuntimeDiagnostics;
  readonly diagnosticSummary: AuraSceneDiagnostics;
  readonly networkUsed: false;
  readonly scene: {
    readonly sceneId: string;
    readonly environmentId: string;
    readonly diagnostics: readonly string[];
    readonly title: string;
    readonly backendPreference: string;
    readonly nodes: readonly { readonly id: string; readonly label: string; readonly kind: string; readonly semanticTags?: readonly string[] }[];
  };
  readonly assets: {
    readonly resolved: readonly { readonly requirementId: string; readonly assetId: string }[];
    readonly placeholders: readonly { readonly requirementId: string }[];
  };
  readonly timeline: unknown;
  dispose(): void;
}

export interface AuraSceneCompiler {
  compile(scene: unknown): Promise<AuraCompiledSceneRuntime>;
}

export interface AuraSceneCompilerOptions {
  readonly assetResolver?: AuraAssetResolver;
  readonly backend?: "webgl2" | "webgpu" | "auto";
}

export function createAuraSceneCompiler(options: AuraSceneCompilerOptions = {}): AuraSceneCompiler {
  const assetResolver = options.assetResolver ?? createDefaultAssetResolver();
  return {
    async compile(sceneInput) {
      const validation = validateAuraSceneIR(sceneInput);
      if (!validation.ok) throw createValidationError(validation.errors);
      const scene = normalizeSceneIR(sceneInput);
      const resolvedAssets = assetResolver.resolveAll(scene.assetRequirements);
      const world = buildAuraWorldPlan(scene, resolvedAssets);
      const materialMap = new Map(scene.materials.map((material) => [material.id, material]));
      const renderItems = scene.objects.map((object) => compileObject(object, materialMap.get(object.materialId ?? "")));
      const lighting = createLightingDefault(scene.environment.kind === "exterior" ? "outdoorDay" : scene.environment.kind === "interior" ? "interiorGallery" : "studioProduct");
      const approximations = [
        ...resolvedAssets.filter((asset) => asset.matched).map((asset) => `Asset '${asset.requirement.id}' resolved to '${asset.matched?.uri}' and is represented by compiled preview geometry until a route loader binds the GLB.`),
        ...scene.physics.filter((cue) => cue.kind !== "none").map((cue) => `Physics cue '${cue.id}' compiled as diagnostics for the current realtime preview.`),
        ...scene.vfx.filter((cue) => cue.kind !== "none").map((cue) => `VFX cue '${cue.id}' compiled as route-supported realtime approximation.`)
      ];
      const diagnosticSummary = createAuraSceneDiagnostics({
        scene,
        backend: options.backend ?? scene.backendPreference,
        resolvedAssets,
        approximations,
        warnings: world.diagnostics
      });
      const diagnostics = Object.assign([
        diagnostic("scene", "AURA_SCENE_COMPILED", "info", `Compiled ${scene.sceneId} into a deterministic Aura3D runtime plan.`, "Render the returned renderItems through Aura3D Renderer."),
        ...resolvedAssets.filter((asset) => asset.placeholder).map((asset) => diagnostic(`assetRequirements[${asset.requirement.id}]`, "AURA_ASSET_PLACEHOLDER_USED", "warning", `Used placeholder for ${asset.requirement.id}.`, "Add a matching local GLB asset."))
      ], diagnosticSummary) as AuraRuntimeDiagnostics;
      const compatScene = {
        ...world,
        title: scene.title,
        backendPreference: scene.backendPreference,
        nodes: [
          { id: scene.environment.id, label: scene.environment.label, kind: "environment", semanticTags: scene.environment.moodTags },
          ...world.nodes.map((node) => ({ id: node.id, label: node.label, kind: node.kind, semanticTags: node.semanticTags })),
          ...scene.cameras.map((camera) => ({ id: camera.id, label: camera.label, kind: "camera", semanticTags: ["camera"] })),
          { id: scene.lighting.id, label: scene.lighting.label, kind: "light", semanticTags: ["light"] }
        ]
      };
      return {
        kind: "aura3d-compiled-scene",
        sceneId: scene.sceneId,
        ir: scene,
        world,
        scene: compatScene,
        renderItems,
        environmentLighting: lighting.environmentLighting,
        postprocess: lighting.postprocess,
        resolvedAssets,
        assets: {
          resolved: resolvedAssets.filter((asset) => asset.matched).map((asset) => ({ requirementId: asset.requirement.id, assetId: asset.matched?.id ?? "" })),
          placeholders: resolvedAssets.filter((asset) => asset.placeholder).map((asset) => ({ requirementId: asset.requirement.id }))
        },
        timeline: legacyTimeline(sceneInput) ?? scene.timeline,
        diagnostics,
        diagnosticSummary,
        networkUsed: false,
        dispose() {
          for (const item of renderItems) {
            const maybeDisposable = item.material as { dispose?: () => void } | undefined;
            maybeDisposable?.dispose?.();
          }
        }
      };
    }
  };
}

export async function compileSceneIRToRuntime(scene: unknown, options: AuraSceneCompilerOptions = {}): Promise<AuraCompiledSceneRuntime> {
  return await createAuraSceneCompiler(options).compile(scene);
}

function compileObject(object: AuraSceneObject, materialPlan?: AuraMaterialPlan): RenderItem {
  return {
    label: object.label,
    geometry: geometryFor(object),
    material: materialFor(materialPlan, object),
    modelMatrix: composeMat4([...object.transform.position] as [number, number, number], eulerToQuatY(object.transform.rotation[1]), [...object.transform.scale] as [number, number, number])
  };
}

function normalizeSceneIR(input: unknown): AuraSceneIR {
  if (!isRecord(input)) throw createValidationError([diagnostic("", "AURA_SCENE_NOT_OBJECT", "error", "AuraSceneIR must be an object.", "Return structured JSON.")]);
  const objects = normalizeObjects([...(Array.isArray(input.objects) ? input.objects : []), ...(Array.isArray(input.characters) ? input.characters : [])]);
  const materials = normalizeMaterials(Array.isArray(input.materials) ? input.materials : []);
  const cameras = normalizeCameras(Array.isArray(input.cameras) ? input.cameras : []);
  const shots = normalizeShots(Array.isArray(input.shots) ? input.shots : [], cameras[0]?.id ?? "camera_default");
  const timeline = normalizeTimeline(input.timeline);
  return {
    schemaVersion: AURA_SCENE_IR_SCHEMA_VERSION,
    sceneId: String(input.sceneId),
    title: String(input.title ?? input.sceneId),
    brief: String(input.brief ?? ""),
    mood: Array.isArray(input.mood) ? input.mood.map(String) : [],
    environment: normalizeEnvironment(input.environment),
    objects,
    characters: [],
    materials,
    lighting: normalizeLighting(input.lighting),
    cameras,
    shots,
    timeline,
    vfx: normalizeVfx(input.vfx),
    physics: Array.isArray(input.physics) ? input.physics as never : [],
    audio: Array.isArray(input.audio) ? input.audio as never : [],
    assetRequirements: normalizeAssetRequirements(input.assetRequirements),
    backendPreference: input.backendPreference === "webgl2" || input.backendPreference === "webgpu" ? input.backendPreference : "auto",
    qualityTarget: normalizeQuality(input.qualityTarget),
    unresolved: Array.isArray(input.unresolved) ? input.unresolved as never : [],
    provenance: isRecord(input.provenance) ? {
      provider: String(input.provenance.provider ?? "mock"),
      model: String(input.provenance.model ?? "aura-mock-scene-v1"),
      promptHash: String(input.provenance.promptHash ?? "sha256:unknown"),
      generatedAt: String(input.provenance.generatedAt ?? new Date(0).toISOString()),
      networkUsed: Boolean(input.provenance.networkUsed ?? false),
      promptPreview: String(input.provenance.promptPreview ?? ""),
      patches: Array.isArray(input.provenance.patches) ? input.provenance.patches as never : []
    } : {
      provider: "mock",
      model: "aura-mock-scene-v1",
      promptHash: "sha256:unknown",
      generatedAt: new Date(0).toISOString(),
      networkUsed: false,
      promptPreview: "",
      patches: []
    }
  };
}

function normalizeEnvironment(value: unknown): AuraSceneIR["environment"] {
  const record = isRecord(value) ? value : {};
  return {
    id: String(record.id ?? "env_default"),
    label: String(record.label ?? record.kind ?? "Generated Environment"),
    kind: record.kind === "interior" || record.kind === "exterior" || record.kind === "city" || record.kind === "forest" || record.kind === "abstract" || record.kind === "studio" ? record.kind : "custom",
    timeOfDay: record.timeOfDay === "night" ? "night" : "stage",
    moodTags: [String(record.kind ?? "environment"), String(record.weather ?? "")]
  };
}

function normalizeObjects(values: readonly unknown[]): AuraSceneObject[] {
  return values.filter(isRecord).map((entry) => ({
    id: String(entry.id),
    label: String(entry.label ?? entry.id),
    role: entry.kind === "character" ? "hero" : entry.kind === "environment" ? "set" : "prop",
    kind: entry.assetHint ? "asset" : "primitive",
    assetRequirementId: entry.assetHint === "robot" ? "asset_robot" : entry.assetHint === "glowing flower" ? "asset_flower" : undefined,
    primitive: entry.kind === "character" || entry.kind === "prop" ? "sphere" : "cube",
    materialId: typeof entry.materialId === "string" ? entry.materialId : undefined,
    transform: isRecord(entry.transform) ? {
      position: asVec3(entry.transform.position, [0, 0, 0]),
      rotation: asVec3(entry.transform.rotation, [0, 0, 0]),
      scale: asVec3(entry.transform.scale, [1, 1, 1])
    } : { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    semanticTags: [String(entry.kind ?? "object"), String(entry.assetHint ?? "")]
  }));
}

function normalizeMaterials(values: readonly unknown[]): AuraMaterialPlan[] {
  return values.filter(isRecord).map((entry) => ({
    id: String(entry.id),
    label: String(entry.label ?? entry.id),
    baseColor: asColor4(entry.baseColor),
    metallic: numberOr(entry.metallic, 0),
    roughness: numberOr(entry.roughness, 0.5),
    emissive: Array.isArray(entry.emissive) && entry.emissive.length === 3 ? entry.emissive as [number, number, number] : undefined,
    emissiveStrength: Array.isArray(entry.emissive) ? 1.2 : undefined,
    source: "prompt"
  }));
}

function normalizeLighting(value: unknown): AuraSceneIR["lighting"] {
  const record = isRecord(value) ? value : {};
  const key = isRecord(record.key) ? record.key : {};
  const rim = isRecord(record.rim) ? record.rim : undefined;
  return {
    id: String(key.id ?? "light_key_01"),
    label: String(record.mood ?? "Generated lighting"),
    mood: String(record.mood ?? "neutral"),
    exposure: 1.1,
    keyLight: { direction: [-0.4, -0.9, -0.3], color: asColor3(key.color), intensity: numberOr(key.intensity, 1.1) },
    ...(rim ? { rimLight: { direction: [0.1, -0.4, 0.9], color: asColor3(rim.color), intensity: numberOr(rim.intensity, 0.5) } } : {})
  };
}

function normalizeCameras(values: readonly unknown[]): AuraSceneIR["cameras"] {
  if (values.length === 0) return [{ id: "camera_default", stableId: "camera_default", label: "Default generated camera", kind: "perspective", position: [0, 1.1, 4], target: [0, 0.5, 0], focalLengthMm: 35, fovDegrees: 50 }];
  return values.filter(isRecord).map((entry) => ({
    id: String(entry.id),
    stableId: String(entry.id),
    label: String(entry.id),
    kind: "perspective",
    position: asVec3(entry.position, [0, 1, 4]),
    target: asVec3(entry.target, [0, 0.5, 0]),
    focalLengthMm: entry.lens === "wide" ? 28 : entry.lens === "telephoto" ? 85 : 45,
    fovDegrees: entry.lens === "wide" ? 55 : entry.lens === "telephoto" ? 24 : 42
  }));
}

function normalizeShots(values: readonly unknown[], defaultCameraId: string): AuraSceneIR["shots"] {
  if (values.length === 0) return [{ id: "shot_default", label: "Default locked shot", cameraId: defaultCameraId, startSeconds: 0, endSeconds: 6, movement: "static", notes: "Generated default shot." }];
  return values.filter(isRecord).map((entry) => ({
    id: String(entry.id),
    label: String(entry.id),
    cameraId: String(entry.cameraId ?? defaultCameraId),
    startSeconds: numberOr(entry.startSeconds, 0),
    endSeconds: numberOr(entry.endSeconds, 6),
    movement: entry.movement === "orbit" ? "orbit" : entry.movement === "crane" ? "crane" : entry.movement === "dolly" ? "push-in" : "static",
    notes: "Imported from prompt IR."
  }));
}

function normalizeTimeline(value: unknown): AuraSceneIR["timeline"] {
  if (Array.isArray(value)) return value as never;
  if (isRecord(value) && Array.isArray(value.cues)) {
    return value.cues.filter(isRecord).map((cue) => ({
      id: String(cue.id),
      startSeconds: numberOr(cue.atSeconds, 0),
      endSeconds: numberOr(cue.atSeconds, 0) + 1,
      kind: "object",
      targetId: String(cue.targetId),
      action: String(cue.kind)
    }));
  }
  return [];
}

function normalizeVfx(value: unknown): AuraSceneIR["vfx"] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((entry) => ({
    id: String(entry.id),
    kind: entry.kind === "fog" || entry.kind === "particles" || entry.kind === "glow" ? entry.kind : "none",
    intensity: numberOr(entry.density, 0.25),
    notes: "Imported VFX cue."
  }));
}

function normalizeAssetRequirements(value: unknown): AuraSceneIR["assetRequirements"] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((entry) => ({
    id: String(entry.id),
    label: String(entry.semantic ?? entry.label ?? entry.id),
    type: "gltf",
    semanticTags: Array.isArray(entry.tags) ? entry.tags.map(String) : Array.isArray(entry.semanticTags) ? entry.semanticTags.map(String) : [],
    styleTags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
    required: Boolean(entry.required)
  }));
}

function legacyTimeline(input: unknown): unknown {
  return isRecord(input) ? input.timeline : undefined;
}

function normalizeQuality(value: unknown): AuraSceneQualityTarget {
  if (value === "L0" || value === "L1" || value === "L2" || value === "L3" || value === "L4" || value === "L5") return value;
  if (typeof value === "string" && value.includes("L3")) return "L3";
  return "L2";
}

function asVec3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry)) ? [value[0], value[1], value[2]] : fallback;
}

function asColor3(value: unknown): [number, number, number] {
  return Array.isArray(value) && value.length === 3 ? [numberOr(value[0], 1), numberOr(value[1], 1), numberOr(value[2], 1)] : [1, 1, 1];
}

function asColor4(value: unknown): [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 ? [numberOr(value[0], 1), numberOr(value[1], 1), numberOr(value[2], 1), numberOr(value[3], 1)] : [1, 1, 1, 1];
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function geometryFor(object: AuraSceneObject): Geometry {
  const primitive = object.primitive ?? (object.semanticTags.includes("product") || object.semanticTags.includes("character") ? "sphere" : "cube");
  if (primitive === "sphere") return Geometry.uvSphere(0.5, 48, 24);
  if (primitive === "plane") return Geometry.litCube(1);
  if (primitive === "points") return Geometry.uvSphere(0.08, 16, 8);
  return Geometry.litCube(1);
}

function materialFor(plan: AuraMaterialPlan | undefined, object: AuraSceneObject): PBRMaterial {
  const baseColor = plan?.baseColor ?? colorForTags(object.semanticTags);
  return new PBRMaterial({
    name: plan?.label ?? object.label,
    baseColor,
    metallic: plan?.metallic ?? 0.08,
    roughness: plan?.roughness ?? 0.46,
    clearcoatFactor: plan?.clearcoat ?? 0,
    transmissionFactor: plan?.transmission ?? 0,
    emissiveColor: plan?.emissive ?? [0, 0, 0],
    emissiveStrength: plan?.emissiveStrength ?? 1
  });
}

function colorForTags(tags: readonly string[]): readonly [number, number, number, number] {
  if (tags.includes("robot")) return [0.9, 0.72, 0.28, 1];
  if (tags.includes("plant")) return [0.2, 0.8, 0.35, 1];
  if (tags.includes("glass")) return [0.62, 0.86, 0.92, 0.55];
  return [0.78, 0.8, 0.84, 1];
}

function eulerToQuatY(yaw: number): [number, number, number, number] {
  const half = yaw / 2;
  return [0, Math.sin(half), 0, Math.cos(half)];
}
