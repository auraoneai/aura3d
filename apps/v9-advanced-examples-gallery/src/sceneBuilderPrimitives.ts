import {
  Geometry,
  InstancedPBRMaterial,
  Material,
  PBRMaterial,
  UnlitMaterial,
  type Bounds3,
  type CollectedLight,
  type RenderItem,
  type RendererPostProcessOptions
} from "@galileo3d/rendering";
import { DirectionalLight, PointLight } from "@galileo3d/scene";
import type { RendererEnvironmentFogEvidence } from "./rendererEnvironmentFogEvidence";
import type { RendererEnvironmentBackgroundEvidence } from "./rendererEnvironmentBackgroundEvidence";
import type { DataGalaxyRuntimeEvidence } from "./dataGalaxyEvidence";
import type { GalleryWaterTelemetry } from "./waterSystems";
import { modelMatrix, type Vec3 } from "./math";

export type ControlValues = Record<string, number | boolean | string>;

export interface Ripple {
  readonly x: number;
  readonly z: number;
  readonly startedAt: number;
  readonly strength: number;
}

export interface GalleryState {
  readonly controls: ControlValues;
  readonly ripples: Ripple[];
  readonly selected: string;
  readonly cameraPreset: string;
  readonly pointer: { readonly x: number; readonly y: number };
  readonly pulse: number;
}

export interface SceneFrame {
  readonly items: readonly RenderItem[];
  readonly bounds: Bounds3;
  readonly lights: readonly CollectedLight[];
  readonly environment: {
    readonly color: readonly [number, number, number];
    readonly intensity: number;
    readonly proceduralMap: {
      readonly skyColor: readonly [number, number, number];
      readonly horizonColor: readonly [number, number, number];
      readonly groundColor: readonly [number, number, number];
      readonly specularColor: readonly [number, number, number];
      readonly intensity: number;
      readonly specularIntensity: number;
    };
  };
  readonly postprocess: RendererPostProcessOptions | false;
  readonly environmentBackground?: RendererEnvironmentBackgroundEvidence;
  readonly environmentFog?: RendererEnvironmentFogEvidence;
  readonly objectCount: number;
  readonly instanceCount: number;
  readonly animatedSystems: readonly string[];
  readonly approximations: readonly string[];
  readonly labels: readonly string[];
  readonly waterTelemetry?: GalleryWaterTelemetry;
  readonly dataGalaxyEvidence?: DataGalaxyRuntimeEvidence;
}

export interface Resources {
  readonly geometry: {
    readonly cube: Geometry;
    readonly sphere: Geometry;
    readonly cylinder: Geometry;
    readonly capsule: Geometry;
    readonly lineX: Geometry;
  };
  readonly material: Record<string, Material | PBRMaterial | UnlitMaterial | InstancedPBRMaterial>;
  readonly pointClouds: Map<string, Geometry>;
}

export function item(
  r: Resources,
  geometry: keyof Resources["geometry"],
  material: string,
  position: Vec3,
  scale: Vec3,
  rotation: Vec3,
  label: string
): RenderItem {
  return { geometry: r.geometry[geometry], material: mat(r, material), modelMatrix: modelMatrix(position, scale, rotation), label };
}

export function instancedItem(r: Resources, geometry: keyof Resources["geometry"], material: string, transforms: Float32Array, label: string): RenderItem {
  return { geometry: r.geometry[geometry], material: mat(r, material), instanceTransforms: transforms, label };
}

export function mat(r: Resources, key: string): Material | PBRMaterial | UnlitMaterial | InstancedPBRMaterial {
  return r.material[key] ?? r.material.matte!;
}

export function frame(
  items: readonly RenderItem[],
  frameBounds: Bounds3,
  frameLights: readonly CollectedLight[],
  environment: SceneFrame["environment"],
  postprocess: RendererPostProcessOptions | false,
  animatedSystems: readonly string[],
  approximations: readonly string[],
  labels: readonly string[],
  explicitInstances = 0,
  waterTelemetry?: GalleryWaterTelemetry
): SceneFrame {
  const instanceCount = explicitInstances || items.reduce((sum, current) => sum + (current.instanceTransforms ? current.instanceTransforms.length / 16 : 0), 0);
  return {
    items,
    bounds: frameBounds,
    lights: frameLights,
    environment,
    postprocess,
    objectCount: items.length + instanceCount,
    instanceCount,
    animatedSystems,
    approximations,
    labels,
    ...(waterTelemetry ? { waterTelemetry } : {})
  };
}

export function lights(kind: string): readonly CollectedLight[] {
  const key = new DirectionalLight(`${kind}-key`);
  const fill = new DirectionalLight(`${kind}-fill`);
  const point = new PointLight(`${kind}-point`);
  if (kind.startsWith("product-")) {
    const inspection = kind === "product-inspection";
    const environment = kind === "product-environment";
    key.color = inspection ? [0.82, 0.9, 1] : [1, 0.86, 0.68];
    key.intensity = inspection ? 0.74 : environment ? 0.82 : 0.68;
    fill.color = [0.34, 0.46, 0.66];
    fill.intensity = inspection ? 0.22 : 0.14;
    point.color = environment ? [0.5, 0.76, 1] : [1, 0.64, 0.36];
    point.intensity = inspection ? 1.08 : environment ? 1.2 : 0.95;
    return [
      { kind: "directional", color: key.color, intensity: key.intensity, position: [4.8, 5.4, 4.2], direction: [-0.42, -0.72, -0.36], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
      { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-4.8, 3.2, -3.8], direction: [0.48, -0.42, 0.52], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill },
      { kind: "point", color: point.color, intensity: point.intensity, position: [0, 2.2, 0.8], direction: [0, -1, 0], range: 5.4, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: point }
    ];
  }
  if (kind === "reactor") {
    key.color = [0.58, 0.76, 1];
    key.intensity = 1.85;
    fill.color = [0.3, 0.55, 0.9];
    fill.intensity = 0.74;
    point.color = [0.22, 0.82, 1];
    point.intensity = 16;
    return [
      { kind: "directional", color: key.color, intensity: key.intensity, position: [5, 7, 5], direction: [-0.45, -0.72, -0.42], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
      { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-5, 4, -4], direction: [0.5, -0.34, 0.5], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill },
      { kind: "point", color: point.color, intensity: point.intensity, position: [0, 2.15, 0.16], direction: [0, -1, 0], range: 6.5, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: point }
    ];
  }
  const hot = kind === "night" || kind === "city" || kind === "reactor";
  key.color = hot ? [0.6, 0.78, 1] : [1, 0.88, 0.68];
  key.intensity = kind === "storm" ? 3.6 : hot ? 2.4 : 3.1;
  fill.color = hot ? [0.35, 0.55, 1] : [0.55, 0.7, 1];
  fill.intensity = hot ? 1.2 : 0.9;
  point.color = kind === "reactor" ? [0.25, 0.9, 1] : [1, 0.55, 0.2];
  point.intensity = kind === "reactor" ? 42 : 18;
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [5, 7, 5], direction: [-0.45, -0.72, -0.42], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-5, 4, -4], direction: [0.5, -0.34, 0.5], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill },
    { kind: "point", color: point.color, intensity: point.intensity, position: [0, 2.4, 0], direction: [0, -1, 0], range: 8, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: point }
  ];
}

export function env(kind: string): SceneFrame["environment"] {
  const presets: Record<string, SceneFrame["environment"]> = {
    sunset: envPreset([0.84, 0.62, 0.38], [0.12, 0.18, 0.32], [0.9, 0.43, 0.22]),
    clear: envPreset([0.78, 0.86, 1], [0.45, 0.72, 1], [0.9, 0.82, 0.62]),
    night: envPreset([0.25, 0.36, 0.62], [0.03, 0.06, 0.14], [0.1, 0.18, 0.35]),
    dusk: envPreset([0.5, 0.6, 0.82], [0.08, 0.14, 0.26], [0.62, 0.32, 0.22]),
    moon: envPreset([0.3, 0.42, 0.75], [0.02, 0.04, 0.1], [0.12, 0.18, 0.32]),
    noon: envPreset([0.82, 0.9, 1], [0.52, 0.75, 1], [0.75, 0.86, 1]),
    storm: envPreset([0.28, 0.36, 0.46], [0.05, 0.07, 0.09], [0.18, 0.22, 0.28]),
    reactor: envPreset([0.2, 0.45, 0.65], [0.02, 0.06, 0.12], [0.02, 0.5, 0.8]),
    city: envPreset([0.22, 0.32, 0.48], [0.02, 0.04, 0.08], [0.08, 0.16, 0.3]),
    studio: envPreset([0.78, 0.82, 0.88], [0.1, 0.11, 0.14], [0.84, 0.88, 1]),
    "product-studio": envPreset([0.42, 0.46, 0.54], [0.032, 0.04, 0.056], [0.22, 0.28, 0.36], 0.22, 0.24),
    "product-environment": envPreset([0.42, 0.5, 0.6], [0.034, 0.052, 0.088], [0.2, 0.34, 0.52], 0.28, 0.3),
    "product-inspection": envPreset([0.5, 0.54, 0.62], [0.04, 0.046, 0.062], [0.3, 0.34, 0.42], 0.24, 0.22),
    lab: envPreset([0.58, 0.66, 0.78], [0.07, 0.09, 0.12], [0.24, 0.36, 0.52]),
    space: envPreset([0.08, 0.16, 0.3], [0.0, 0.0, 0.02], [0.08, 0.18, 0.38]),
    fog: envPreset([0.48, 0.58, 0.62], [0.08, 0.1, 0.1], [0.28, 0.36, 0.32]),
    factory: envPreset([0.48, 0.56, 0.64], [0.06, 0.07, 0.08], [0.2, 0.32, 0.42])
  };
  return presets[kind] ?? presets.sunset!;
}

function envPreset(
  color: readonly [number, number, number],
  sky: readonly [number, number, number],
  horizon: readonly [number, number, number],
  intensity = 0.48,
  specularIntensity = 0.82
): SceneFrame["environment"] {
  return {
    color,
    intensity,
    proceduralMap: {
      skyColor: sky,
      horizonColor: horizon,
      groundColor: [0.035, 0.04, 0.05],
      specularColor: [0.92, 0.95, 1],
      intensity: 0.55,
      specularIntensity
    }
  };
}

export function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function pushSegment(target: Vec3[], start: Vec3, end: Vec3): void {
  target.push(start, end);
}

export function pushLineGroup(r: Resources, items: RenderItem[], positions: readonly Vec3[], material: string, label: string): void {
  if (positions.length < 2) return;
  items.push({ geometry: Geometry.lineSegments(positions), material: mat(r, material), label });
}
