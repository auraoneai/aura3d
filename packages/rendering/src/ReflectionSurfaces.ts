import { Geometry } from "./Geometry";
import { PBRMaterial } from "./PBRMaterial";
import { TexturedUnlitMaterial } from "./TexturedUnlitMaterial";
import type { RenderItem } from "./ForwardPass";
import type {
  GlassRefractionCaptureResult,
  PlanarReflectionCaptureResult
} from "./PlanarReflection";
import type { WaterReflectionRefractionResult } from "./OceanSurface";
import {
  createReflectionProbe,
  type CubeCameraReflectionCapture,
  type ReflectionProbe
} from "./ReflectionProbe";

export type ReflectionSurfaceKind =
  | "planar-reflector"
  | "reflective-floor"
  | "refractor-glass"
  | "water-refraction"
  | "cube-probe"
  | "screen-space-reflection";

export type ReflectionSurfaceSupportStatus = "implemented" | "helper" | "unsupported";

export interface ReflectionSurfaceOptions {
  readonly id: string;
  readonly kind: ReflectionSurfaceKind;
  readonly size?: readonly [number, number];
  readonly y?: number;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly intensity?: number;
  readonly probe?: ReflectionProbe;
  readonly capture?: CubeCameraReflectionCapture;
  /**
   * Live B4 renderer bindings. A status is promoted to `implemented` ONLY
   * when the matching binding is present: `mirror` backs planar-reflector
   * and reflective-floor, `glass` backs refractor-glass, `water` backs
   * water-refraction. Screen-space reflection has no binding by design.
   */
  readonly mirror?: PlanarReflectionCaptureResult;
  readonly glass?: GlassRefractionCaptureResult;
  readonly water?: WaterReflectionRefractionResult;
}

export interface ReflectionSurfaceReport {
  readonly id: string;
  readonly kind: ReflectionSurfaceKind;
  readonly status: ReflectionSurfaceSupportStatus;
  readonly helper: string;
  readonly trueReflection: boolean;
  readonly requiresRendererPath: readonly string[];
  readonly unsupportedRequests: readonly string[];
  readonly claimBoundary: string;
}

export interface ReflectionSurface {
  readonly id: string;
  readonly kind: ReflectionSurfaceKind;
  readonly item?: RenderItem;
  readonly probe?: ReflectionProbe;
  readonly capture?: CubeCameraReflectionCapture;
  readonly mirror?: PlanarReflectionCaptureResult;
  readonly glass?: GlassRefractionCaptureResult;
  readonly water?: WaterReflectionRefractionResult;
  readonly report: ReflectionSurfaceReport;
}

export function createReflectionSurface(options: ReflectionSurfaceOptions): ReflectionSurface {
  if (!options.id.trim()) throw new Error("Reflection surface id is required.");
  const kind = options.kind;
  if (!isReflectionSurfaceKind(kind)) throw new Error(`Unsupported reflection surface kind: ${String(kind)}`);

  if (kind === "planar-reflector" && options.mirror) {
    const mirror = options.mirror;
    const size = validateSize(options.size ?? [12, 12]);
    const y = finite(options.y ?? mirror.planeY, "reflection surface y");
    requirePlaneMatch(y, mirror.planeY, options.id);
    return {
      id: options.id,
      kind,
      mirror,
      item: {
        geometry: Geometry.texturedCube(1),
        material: new TexturedUnlitMaterial({
          name: `${options.id} planar mirror`,
          texture: mirror.texture
        }),
        modelMatrix: scaleTranslate([0, y, 0], [size[0], 0.035, size[1]]),
        includeInAutoFrame: false,
        label: `${options.id} planar mirror sampling live mirror target r${mirror.revision}`
      },
      report: report(options.id, kind, "implemented", "live mirror render target with oblique near-plane clip binding", true, [], [])
    };
  }

  if (kind === "reflective-floor") {
    if (options.mirror) {
      const mirror = options.mirror;
      const size = validateSize(options.size ?? [12, 12]);
      const y = finite(options.y ?? mirror.planeY, "reflection surface y");
      requirePlaneMatch(y, mirror.planeY, options.id);
      return {
        id: options.id,
        kind,
        mirror,
        item: {
          geometry: Geometry.texturedCube(1),
          material: new TexturedUnlitMaterial({
            name: `${options.id} reflective floor mirror`,
            texture: mirror.texture
          }),
          modelMatrix: scaleTranslate([0, y, 0], [size[0], 0.035, size[1]]),
          includeInAutoFrame: false,
          label: `${options.id} reflective floor sampling live mirror target r${mirror.revision}`
        },
        report: report(options.id, kind, "implemented", "reflective floor sampling the live planar mirror target (first consumer)", true, [], [])
      };
    }
    const size = validateSize(options.size ?? [12, 12]);
    const y = finite(options.y ?? -0.02, "reflection surface y");
    const roughness = unit(options.roughness ?? 0.22, "reflection surface roughness");
    const metallic = unit(options.metallic ?? 0.08, "reflection surface metallic");
    const intensity = nonNegative(options.intensity ?? 0.42, "reflection surface intensity");
    return {
      id: options.id,
      kind,
      item: {
        geometry: Geometry.litCube(1),
        material: new PBRMaterial({
          name: `${options.id} staged reflective floor`,
          baseColor: [0.78, 0.84, 0.9, 1],
          roughness,
          metallic,
          environmentIntensity: intensity
        }),
        modelMatrix: scaleTranslate([0, y, 0], [size[0], 0.035, size[1]]),
        includeInAutoFrame: false,
        label: `${options.id} staged reflective floor`
      },
      report: report(options.id, kind, "helper", "PBR floor material with environment response", false, [
        "planar-reflector-render-target",
        "live-cube-probe-capture",
        "screen-space-reflection-pass"
      ], [
        "Reflective floor helper is not a planar reflector and does not render mirrored scene geometry."
      ])
    };
  }

  if (kind === "cube-probe") {
    const probe = createReflectionProbe(options.probe ?? {
      id: `${options.id}-probe`,
      position: [0, 1, 0],
      radius: 6,
      intensity: options.intensity ?? 1
    });
    const capture = options.capture;
    if (capture && capture.probe.id !== probe.id) {
      throw new Error(`Cube reflection capture probe ${capture.probe.id} does not match surface probe ${probe.id}.`);
    }
    return {
      id: options.id,
      kind,
      probe,
      ...(capture ? { capture } : {}),
      report: capture
        ? report(options.id, kind, "implemented", "live six-face cube capture with PBR environment binding", true, [], [])
        : report(options.id, kind, "helper", "probe descriptor awaiting a CubeCameraReflectionCapture", false, [
          "CubeCameraReflectionCapture instance"
        ], [
          "This cube-probe surface has no capture owner; provide CubeCameraReflectionCapture before claiming live reflections."
        ])
    };
  }

  if (kind === "refractor-glass" && options.glass) {
    const glass = options.glass;
    const size = validateSize(options.size ?? [3, 2]);
    const y = finite(options.y ?? 1, "reflection surface y");
    return {
      id: options.id,
      kind,
      glass,
      item: {
        geometry: Geometry.texturedCube(1),
        material: new TexturedUnlitMaterial({
          name: `${options.id} refractor glass`,
          texture: glass.texture
        }),
        modelMatrix: scaleTranslate([0, y, 0], [size[0], size[1], 0.05]),
        includeInAutoFrame: false,
        label: `${options.id} glass sampling live thickness-tinted refraction target r${glass.revision}`
      },
      report: report(options.id, kind, "implemented", "live scene-color target with thickness-tinted, roughness-blurred refraction binding", true, [], [])
    };
  }

  if (kind === "water-refraction" && options.water) {
    const water = options.water;
    const size = validateSize(options.size ?? [12, 12]);
    const y = finite(options.y ?? water.planeY, "reflection surface y");
    requirePlaneMatch(y, water.planeY, options.id);
    return {
      id: options.id,
      kind,
      water,
      item: {
        geometry: Geometry.texturedCube(1),
        material: new TexturedUnlitMaterial({
          name: `${options.id} water composite`,
          texture: water.texture
        }),
        modelMatrix: scaleTranslate([0, y, 0], [size[0], 0.02, size[1]]),
        includeInAutoFrame: false,
        label: `${options.id} water sampling live reflection/refraction composite r${water.revision}`
      },
      report: report(options.id, kind, "implemented", "live reflection + refraction targets with depth-tinted composite binding", true, [], [])
    };
  }

  return {
    id: options.id,
    kind,
    report: report(options.id, kind, "unsupported", "claim-boundary descriptor", false, rendererRequirements(kind), unsupportedReflectionRequests(kind))
  };
}

function requirePlaneMatch(y: number, planeY: number, id: string): void {
  if (Math.abs(y - planeY) > 1e-6) {
    throw new Error(`Reflection surface ${id} plane y=${y} does not match the bound capture plane y=${planeY}.`);
  }
}

export function createReflectiveFloorSurface(
  id: string,
  options: Omit<ReflectionSurfaceOptions, "id" | "kind"> = {}
): ReflectionSurface {
  return createReflectionSurface({ ...options, id, kind: "reflective-floor" });
}

export function listReflectionSurfaceKinds(): readonly ReflectionSurfaceKind[] {
  return ["planar-reflector", "reflective-floor", "refractor-glass", "water-refraction", "cube-probe", "screen-space-reflection"];
}

function report(
  id: string,
  kind: ReflectionSurfaceKind,
  status: ReflectionSurfaceSupportStatus,
  helper: string,
  trueReflection: boolean,
  requiresRendererPath: readonly string[],
  unsupportedRequests: readonly string[]
): ReflectionSurfaceReport {
  return {
    id,
    kind,
    status,
    helper,
    trueReflection,
    requiresRendererPath,
    unsupportedRequests,
    claimBoundary: trueReflection
      ? "True reflection support must be backed by renderer-owned render targets and route pixel evidence."
      : "Reusable reflection surface contract only; staged materials, alpha, dark floors, or environment highlights are not proof of planar reflection, SSR, live probes, or scene-space refraction."
  };
}

function rendererRequirements(kind: ReflectionSurfaceKind): readonly string[] {
  switch (kind) {
    case "planar-reflector":
      return ["mirror-camera-render-target", "clip-plane-support", "reflector-material-binding"];
    case "refractor-glass":
      return ["scene-color-refraction-source", "depth-aware-thickness", "transmission-material-binding"];
    case "water-refraction":
      return ["water-reflection-target", "water-refraction-target", "caustic-or-absorption-model"];
    case "screen-space-reflection":
      return ["depth-normal-history-inputs", "ssr-ray-march-pass", "temporal-denoise"];
    case "cube-probe":
      return ["six-face-cube-camera-capture", "probe-refresh-scheduling"];
    case "reflective-floor":
      return ["planar-reflector-render-target"];
  }
}

function unsupportedReflectionRequests(kind: ReflectionSurfaceKind): readonly string[] {
  switch (kind) {
    case "planar-reflector":
      return ["Planar reflector helper is not implemented; no mirror render target or clip-plane path exists in this contract."];
    case "refractor-glass":
      return ["Glass/refractor helper is not implemented; material alpha/transmission must not be claimed as scene-space refraction."];
    case "water-refraction":
      return ["Water reflection/refraction helper is not implemented; procedural water remains separate and must disclose no true refraction."];
    case "screen-space-reflection":
      return ["SSR is unsupported; no depth/normal ray-march pass is created."];
    case "cube-probe":
      return ["Cube-probe descriptors require a CubeCameraReflectionCapture before claiming live reflections."];
    case "reflective-floor":
      return ["Reflective floor is staged PBR material only, not true mirror/reflection rendering."];
  }
}

function isReflectionSurfaceKind(value: string): value is ReflectionSurfaceKind {
  return (listReflectionSurfaceKinds() as readonly string[]).includes(value);
}

function validateSize(value: readonly [number, number]): readonly [number, number] {
  const width = positive(value[0], "reflection surface width");
  const depth = positive(value[1], "reflection surface depth");
  return [width, depth];
}

function scaleTranslate(
  translation: readonly [number, number, number],
  scale: readonly [number, number, number]
): Float32Array {
  return new Float32Array([
    scale[0], 0, 0, 0,
    0, scale[1], 0, 0,
    0, 0, scale[2], 0,
    translation[0], translation[1], translation[2], 1
  ]);
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and positive.`);
  return value;
}

function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and non-negative.`);
  return value;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function unit(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${label} must be in [0, 1].`);
  return value;
}
