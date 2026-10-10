// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraLightNode, AuraSceneSnapshot, AuraVec3, ProductionRuntimeLightDescriptor } from "../nodes/types.js";
import type { AuraDirectionalShadowOptions, AuraLightingModel, AuraLocalShadowOptions } from "../../contracts/lighting.js";
import { resolveQrFlags } from "../../contracts/flags.js";
import { colorToLinearRgb, multiplyRgb } from "../colorUtils.js";
import { clampNumber, normalizedDirection, productionRuntimeLightDirection, quaternionFromForwardDirection } from "../compiler/observations.js";
import { normalize3 } from "../sceneMath.js";
import { groups } from "../nodes/groups.js";
import type { CollectedLight } from "@aura3d/rendering";
import { DirectionalLight, PointLight, SpotLight, type Light } from "@aura3d/scene";
import type { AuraQualityTier } from "@aura3d/rendering/contracts";
// Deep import (lane-15 package export map untouched; FlagshipFoundation pattern).
import type { AuraLightData } from "../../../../rendering/src/LightUniforms.js";

export function createProductionRuntimeFallbackLights(flags?: { on(name: string): boolean }): readonly CollectedLight[] {
  // PRD-02: under A3D_QR_LIGHTING the authored-defaults fallback light rig is
  // replaced by the C-09 `prd02.neutral-room` environment source plus authored
  // light collection — no implicit directionals (F-02-01).
  // T0-28: callers with an app-resolved QrFlags pass it; the ambient
  // URL/env resolution below stays the fallback for flag-less callers.
  if (prd02LightingOn(flags)) return [];
  if (cachedProductionRuntimeFallbackLights) return cachedProductionRuntimeFallbackLights;
  const descriptors: readonly ProductionRuntimeLightDescriptor[] = [
    {
      kind: "directional",
      name: "aura3d-root-production-fallback-key-shadow",
      color: [1, 0.94, 0.82],
      intensity: 2.6,
      position: [0, 0, 0],
      direction: [0.44, -0.64, -0.63],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      shadowPriority: 3,
      shadowRequested: false,
      authoredLight: "fallback"
    },
    {
      kind: "directional",
      name: "aura3d-root-production-fallback-fill",
      color: [0.52, 0.64, 0.9],
      intensity: 0.64,
      position: [0, 0, 0],
      direction: [-0.5, -0.28, -0.82],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      shadowPriority: 0,
      shadowRequested: false,
      authoredLight: "fallback"
    },
    {
      kind: "directional",
      name: "aura3d-root-production-fallback-rim",
      color: [0.88, 0.94, 1],
      intensity: 0.88,
      position: [0, 0, 0],
      direction: [-0.24, -0.36, 0.9],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      shadowPriority: 0,
      shadowRequested: false,
      authoredLight: "fallback"
    }
  ];
  cachedProductionRuntimeFallbackLights = descriptors.map((descriptor, index) =>
    createProductionRuntimeCollectedLight(descriptor, index === 0)
  );
  return cachedProductionRuntimeFallbackLights;
}

let cachedProductionRuntimeFallbackLights: readonly CollectedLight[] | undefined;

export function createProductionRuntimeStudioLightDescriptors(
  node: AuraLightNode,
  name: string,
  color: readonly [number, number, number],
  intensity: number,
  position: AuraVec3
): readonly ProductionRuntimeLightDescriptor[] {
  const target = node.lookAt ?? [0, 0.75, 0] as const;
  const fillPosition: AuraVec3 = [
    position[0] === 0 ? 3.2 : -position[0],
    Math.max(1, position[1] * 0.72),
    position[2] * 0.58
  ];
  const rimPosition: AuraVec3 = [
    position[0] * 0.2,
    Math.max(1, position[1] * 0.88),
    position[2] === 0 ? -3.6 : -Math.abs(position[2])
  ];
  return [
    {
      kind: "directional",
      name: `${name}-key`,
      color,
      intensity,
      position,
      direction: productionRuntimeLightDirection(node, position),
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      shadowPriority: 3,
      shadowRequested: false,
      authoredLight: node.light
    },
    {
      kind: "directional",
      name: `${name}-fill`,
      color: multiplyRgb(color, [0.62, 0.72, 1]),
      intensity: intensity * 0.32,
      position: fillPosition,
      direction: normalizedDirection(fillPosition, target),
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      shadowPriority: 0,
      shadowRequested: false,
      authoredLight: node.light
    },
    {
      kind: "directional",
      name: `${name}-rim`,
      color: multiplyRgb(color, [0.84, 0.92, 1]),
      intensity: intensity * 0.54,
      position: rimPosition,
      direction: normalizedDirection(rimPosition, target),
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      shadowPriority: 0,
      shadowRequested: false,
      authoredLight: node.light
    }
  ];
}

export function createProductionRuntimeCollectedLight(
  descriptor: ProductionRuntimeLightDescriptor,
  castsShadow: boolean
): CollectedLight {
  const source: Light = descriptor.kind === "directional"
    ? new DirectionalLight(descriptor.name)
    : descriptor.kind === "point"
      ? new PointLight(descriptor.name)
      : new SpotLight(descriptor.name);
  source.color = [...descriptor.color];
  source.intensity = descriptor.intensity;
  source.castsShadow = castsShadow;
  source.layerMask = 0xffffffff;
  source.userData.aura3dAuthoredLight = descriptor.authoredLight;
  if (descriptor.authoredWidth !== undefined) source.userData.aura3dAuthoredWidth = descriptor.authoredWidth;
  if (descriptor.authoredHeight !== undefined) source.userData.aura3dAuthoredHeight = descriptor.authoredHeight;
  source.transform.setPosition(...descriptor.position);
  if (source instanceof PointLight || source instanceof SpotLight) {
    source.range = Math.max(0.001, descriptor.range);
  }
  if (source instanceof SpotLight) {
    source.angle = clampNumber(descriptor.spotAngle, 0.001, Math.PI / 2 - 0.001);
    source.penumbra = clampNumber(descriptor.penumbra, 0, 1);
  }
  if (!(source instanceof PointLight)) {
    const rotation = quaternionFromForwardDirection(descriptor.direction);
    source.transform.setRotation(rotation[0], rotation[1], rotation[2], rotation[3]);
  }
  source.updateWorldTransform(true);
  return {
    kind: descriptor.kind,
    color: descriptor.color,
    intensity: descriptor.intensity,
    position: descriptor.position,
    direction: normalize3(descriptor.direction),
    range: descriptor.range,
    spotAngle: descriptor.spotAngle,
    penumbra: descriptor.penumbra,
    castsShadow,
    layerMask: 0xffffffff,
    source
  };
}

// ---------- PRD-02 §6.3 / §6.4 — physical units + caster selection (flag path) ----------

/**
 * Physical-light descriptor: what an authored `lights.*` node means in
 * three-r185 units (PRD-02 §6.3). Ambient/hemisphere are non-punctual and
 * resolve through the environment path, so they return `null`.
 */
export interface PhysicalLightDescriptor extends ProductionRuntimeLightDescriptor {
  /** Inverse-power exponent (PRD-02 §6.3); 0 = no falloff (directional/ambient). */
  readonly decay: number;
  readonly shadowOptions?: AuraDirectionalShadowOptions | AuraLocalShadowOptions;
}

const FOUR_PI = 4 * Math.PI;

export function physicalLightDescriptor(node: AuraLightNode, name: string): PhysicalLightDescriptor | null {
  const color = (node.color ?? [1, 1, 1]) as readonly [number, number, number];
  const position = (node.position ?? [0, 0, 0]) as AuraVec3;
  const direction = productionRuntimeLightDirection(node, position);
  const shadowRequested = node.shadow === true || (typeof node.shadow === "object" && node.shadow !== null);
  const shadowDisabled = node.shadow === false;
  const shadowOptions = typeof node.shadow === "object" && node.shadow !== null ? node.shadow : undefined;
  switch (node.light) {
    case "directional":
    case "studio":
      return {
        kind: "directional",
        name,
        color,
        intensity: node.intensity ?? 3,
        position,
        direction,
        range: 0,
        spotAngle: 0,
        penumbra: 0,
        decay: 0,
        shadowPriority: 3,
        shadowRequested,
        shadowDisabled,
        shadowOptions,
        authoredLight: node.light
      };
    case "point": {
      const cd = node.power !== undefined ? node.power / FOUR_PI : (node.intensity ?? 8);
      return {
        kind: "point",
        name,
        color,
        intensity: cd,
        position,
        direction,
        range: node.distance ?? 0,
        spotAngle: 0,
        penumbra: 0,
        decay: node.decay ?? 2,
        shadowPriority: 1,
        shadowRequested,
        shadowDisabled,
        shadowOptions,
        authoredLight: "point"
      };
    }
    case "spot": {
      const cd = node.power !== undefined ? node.power / Math.PI : (node.intensity ?? 30);
      return {
        kind: "spot",
        name,
        color,
        intensity: cd,
        position,
        direction,
        range: node.distance ?? 0,
        spotAngle: node.angle ?? Math.PI / 6,
        penumbra: node.penumbra ?? 0,
        decay: node.decay ?? 2,
        shadowPriority: 2,
        shadowRequested,
        shadowDisabled,
        shadowOptions,
        authoredLight: "spot"
      };
    }
    case "rect":
    case "softbox": {
      return {
        kind: "rect-area",
        name,
        color,
        intensity: node.intensity ?? 1.4,
        position,
        direction,
        range: 0,
        spotAngle: 0,
        penumbra: 0,
        decay: 0,
        shadowPriority: 1,
        shadowRequested,
        shadowDisabled,
        shadowOptions,
        authoredLight: node.light,
        authoredWidth: node.width ?? 1,
        authoredHeight: node.height ?? 1
      };
    }
    default:
      return null; // ambient / hemisphere resolve through the environment path
  }
}

export interface ShadowedLightSelection {
  /** Descriptors that get shadow maps this frame, in atlas order. */
  readonly casters: readonly PhysicalLightDescriptor[];
  /** Names of shadow-requesting lights dropped by the tier cap (diagnostic). */
  readonly droppedNames: readonly string[];
}

/**
 * Caster selection (PRD-02 §6.4): explicit `shadow: true` first (priority,
 * then authored order), then `autoSunShadow` promotes the brightest
 * directional **only when no directional carries an explicit shadow
 * setting** (requested or disabled). Point/spot/rect never cast implicitly.
 */
export function selectShadowedLights(
  descriptors: readonly PhysicalLightDescriptor[],
  options: { readonly autoSunShadow?: boolean; readonly max?: number } = {}
): ShadowedLightSelection {
  const max = options.max ?? 4;
  const autoSun = options.autoSunShadow ?? true;
  const requested = descriptors.filter((d) => d.shadowRequested && !d.shadowDisabled);
  const casters: PhysicalLightDescriptor[] = [...requested].sort((a, b) =>
    b.shadowPriority - a.shadowPriority || a.name.localeCompare(b.name)
  );
  const anyDirectionalExplicit = descriptors.some((d) => d.kind === "directional" && (d.shadowRequested || d.shadowDisabled));
  if (autoSun && !anyDirectionalExplicit && casters.length < max) {
    const sun = descriptors
      .filter((d) => d.kind === "directional" && !d.shadowDisabled)
      .sort((a, b) => b.intensity - a.intensity || a.name.localeCompare(b.name))[0];
    if (sun) casters.push({ ...sun, shadowRequested: true });
  }
  const kept = casters.slice(0, Math.max(0, max));
  const dropped = casters.slice(Math.max(0, max)).map((d) => d.name);
  return { casters: kept, droppedNames: dropped };
}

/** lighting.quality "auto" → the C-27-resolved tier from the compile context (PRD-02 §6.8). */
export function resolveLightingTier(
  requested: AuraQualityTier | "auto" | undefined,
  ctx: { readonly quality: { readonly tier: AuraQualityTier } }
): AuraQualityTier {
  return !requested || requested === "auto" ? ctx.quality.tier : requested;
}

// ---------- PRD-02 Phase 2 — lighting model / flag resolution ----------

/**
 * `?aura-lighting=` URL override (C-10): "physical" | "legacy-3.0" | null.
 * `?a3dLighting=0|off|false` is the kill switch — it wins over every flag
 * source and forces the legacy path.
 */
export function readLightingModelFromUrl(url?: URL | string): { readonly model: AuraLightingModel | null; readonly disabled: boolean } {
  const href = url !== undefined
    ? (typeof url === "string" ? url : url.href)
    : (typeof location !== "undefined" ? location.href : undefined);
  if (!href) return { model: null, disabled: false };
  const params = new URL(href, "http://localhost/").searchParams;
  const kill = params.get("a3dLighting");
  if (kill !== null && (kill === "0" || kill === "off" || kill === "false" || kill === "")) {
    return { model: null, disabled: true };
  }
  const model = params.get("aura-lighting");
  if (model === "physical" || model === "legacy-3.0") return { model, disabled: false };
  return { model: null, disabled: false };
}

// ---------- PRD-02 §6.5 — `?a3dLighting=` surgical kill switches ----------

/** Internal kill switches (PRD-02 §6.5, parsed here — not QrFlags):
 *  `pmrem=cpu`, `atlas=off`, `shadowFilter=legacy-grid`, `shadows=off`,
 *  `background=off` — plus `csm=off`/`probes=off`/`contact=off` URL aliases
 *  for the real `A3D_QR_LIGHTING_*` sub-flags. */
export interface Prd02LightingKillSwitches {
  readonly pmrem: "cpu" | null;
  readonly atlas: boolean;          // false = sun-only shadows
  readonly shadowFilter: "legacy-grid" | null;
  readonly shadows: boolean;        // false = no shadow passes at all
  readonly background: boolean;     // false = prd02 background contributor off
  readonly csm: boolean;            // false = single fitted map
  readonly probes: boolean;
  readonly contact: boolean;
}

const KILL_SWITCH_DEFAULT: Prd02LightingKillSwitches = {
  pmrem: null, atlas: true, shadowFilter: null,
  shadows: true, background: true, csm: true, probes: true, contact: true
};

/** Parse `?a3dLighting=` (comma-separated `k=v` pairs; `a3dLighting=0|off`
 *  is the lane kill handled by `readLightingModelFromUrl`, not here). */
export function readLightingKillSwitches(url?: URL | string): Prd02LightingKillSwitches {
  const href = url !== undefined
    ? (typeof url === "string" ? url : url.href)
    : (typeof location !== "undefined" ? location.href : undefined);
  if (!href) return KILL_SWITCH_DEFAULT;
  const raw = new URL(href, "http://localhost/").searchParams.get("a3dLighting");
  if (!raw || raw === "0" || raw === "off" || raw === "false") return KILL_SWITCH_DEFAULT;
  const out = { ...KILL_SWITCH_DEFAULT } as Record<keyof Prd02LightingKillSwitches, unknown>;
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const off = value === "0" || value === "off" || value === "false";
    switch (key) {
      case "pmrem": out.pmrem = value === "cpu" ? "cpu" : null; break;
      case "atlas": out.atlas = !off; break;
      case "shadowFilter": out.shadowFilter = value === "legacy-grid" ? "legacy-grid" : null; break;
      case "shadows": out.shadows = !off; break;
      case "background": out.background = !off; break;
      case "csm": out.csm = !off; break;
      case "probes": out.probes = !off; break;
      case "contact": out.contact = !off; break;
      default: break;
    }
  }
  return out as Prd02LightingKillSwitches;
}

/**
 * True when A3D_QR_LIGHTING applies for this compile: `ctx.flags` when the
 * C-36 context is available, else the ambient `?a3d-qr=` URL / `A3D_QR=`
 * env resolution — and never when `?a3dLighting=` kills it.
 */
export function prd02LightingOn(flags?: { on(name: string): boolean }, url?: URL | string): boolean {
  if (readLightingModelFromUrl(url).disabled) return false;
  if (flags) return flags.on("A3D_QR_LIGHTING");
  return resolveQrFlags({
    url: typeof location !== "undefined" ? location.href : undefined,
    env: typeof process !== "undefined" ? process.env : {}
  }).on("A3D_QR_LIGHTING");
}

/** C-10: model defaults "physical" under the flag, "legacy-3.0" otherwise;
 *  `?aura-lighting=legacy-3.0` and `options.lighting.model` override. */
export function resolveLightingModel(
  options?: { readonly model?: AuraLightingModel },
  flags?: { on(name: string): boolean },
  url?: URL | string
): AuraLightingModel {
  const fromUrl = readLightingModelFromUrl(url);
  if (fromUrl.disabled) return "legacy-3.0";
  if (options?.model) return options.model;
  if (fromUrl.model) return fromUrl.model;
  return prd02LightingOn(flags, url) ? "physical" : "legacy-3.0";
}

/** Hemisphere contribution: non-punctual irradiance (sky/ground pair). */
export interface HemisphereIrradiance {
  readonly name?: string;
  readonly skyColor: readonly [number, number, number];
  readonly groundColor: readonly [number, number, number];
  readonly intensity: number;
  /** Sky direction (node position normalised; default +Y). */
  readonly direction: readonly [number, number, number];
}

/** C-36 light-handler output under A3D_QR_LIGHTING. */
export interface Prd02CollectedLights {
  readonly descriptors: readonly PhysicalLightDescriptor[];
  readonly hemisphere: readonly HemisphereIrradiance[];
  readonly ambientIntensity: number;
}

/**
 * Collects authored lights under the flag: physical units via
 * `physicalLightDescriptor`, ambient summed additively (F-02-01), hemisphere
 * as an irradiance term. No fallback three-light rig — a no-light scene
 * returns zero descriptors and the neutral env supplies IBL (S-items).
 */
export function collectPrd02Lights(snapshot: AuraSceneSnapshot): Prd02CollectedLights {
  const lightNodes = groups.flatten(snapshot.nodes).filter((node): node is AuraLightNode => node.kind === "light");
  const descriptors: PhysicalLightDescriptor[] = [];
  const hemisphere: HemisphereIrradiance[] = [];
  let ambientIntensity = 0;
  lightNodes.forEach((node, index) => {
    if (node.light === "ambient") {
      ambientIntensity += node.intensity ?? 0;
      return;
    }
    if (node.light === "hemisphere") {
      const direction = normalize3((node.position ?? [0, 1, 0]) as AuraVec3);
      hemisphere.push({
        ...(node.name !== undefined ? { name: node.name } : {}),
        skyColor: colorToLinearRgb(node.color ?? "#bcd7ff"),
        groundColor: colorToLinearRgb((node as { groundColor?: AuraColor }).groundColor ?? "#352f28"),
        intensity: node.intensity ?? 1,
        direction: direction as readonly [number, number, number]
      });
      return;
    }
    const descriptor = physicalLightDescriptor(node, node.name ?? `${node.light}-${index}`);
    if (descriptor) descriptors.push(descriptor);
  });
  return { descriptors, hemisphere, ambientIntensity };
}

/**
 * Descriptor → `AuraLightData` for the std140 AuraLights packer
 * (`packAuraLightsStd140`, u_lightData in the a3d_prd02_lighting_punctual
 * chunk). rect/softbox nodes carry `kind:"rect-area"` with the authored
 * width/height; right/up derive an orthonormal basis from `direction` when
 * the scene transform's basis isn't threaded through the descriptor.
 */
export function descriptorToAuraLightData(
  descriptor: PhysicalLightDescriptor,
  shadowIndex?: number
): AuraLightData {
  const rect = descriptor.kind === "rect-area";
  const basis = rect ? rectBasisFromDirection(descriptor.direction) : undefined;
  return {
    kind: descriptor.kind as AuraLightData["kind"],
    color: descriptor.color,
    intensity: descriptor.intensity,
    position: descriptor.position,
    direction: descriptor.direction,
    range: descriptor.range,
    spotAngle: descriptor.spotAngle,
    penumbra: descriptor.penumbra,
    decay: descriptor.decay,
    ...(shadowIndex !== undefined ? { shadowIndex } : {}),
    ...(rect
      ? {
          right: basis!.right,
          up: basis!.up,
          width: descriptor.authoredWidth ?? 1,
          height: descriptor.authoredHeight ?? 1
        }
      : {}),
    name: descriptor.name
  };
}

/** Orthonormal (right, up) spanning the plane ⊥ direction (default up +Y). */
function rectBasisFromDirection(direction: readonly [number, number, number]): {
  readonly right: readonly [number, number, number];
  readonly up: readonly [number, number, number];
} {
  const [dx, dy, dz] = normalize3(direction);
  const refY: readonly [number, number, number] = Math.abs(dy) > 0.999 ? [1, 0, 0] : [0, 1, 0];
  const right = normalize3([
    refY[1] * dz - refY[2] * dy,
    refY[2] * dx - refY[0] * dz,
    refY[0] * dy - refY[1] * dx
  ]);
  const up = normalize3([
    dy * right[2] - dz * right[1],
    dz * right[0] - dx * right[2],
    dx * right[1] - dy * right[0]
  ]);
  return { right, up };
}
