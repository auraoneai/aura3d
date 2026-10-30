// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraLightNode, AuraSceneSnapshot, AuraVec3, ProductionRuntimeLightDescriptor } from "../nodes/types.js";
import type { AuraLightPatch, AuraLightTransitionOptions } from "../nodes/types/runtime.js";
import type { AuraDirectionalShadowOptions, AuraLightingModel, AuraLocalShadowOptions } from "../../contracts/lighting.js";
import { resolveQrFlags } from "../../contracts/flags.js";
import { parseHrefCached } from "../../contracts/urlCache.js";
import { colorToLinearRgb, multiplyRgb } from "../colorUtils.js";
import { parseAuraColor } from "../color.js";
import { clampNumber, normalizedDirection, productionRuntimeLightDirection, quaternionFromForwardDirection } from "../compiler/observations.js";
import { normalize3 } from "../sceneMath.js";
import { groups } from "../nodes/groups.js";
import type { CollectedLight } from "@aura3d/rendering";
import { DirectionalLight, PointLight, RectAreaLight, SpotLight, type Light } from "@aura3d/scene";
import type { AuraQualityTier } from "@aura3d/rendering/contracts";
// Deep import (lane-15 package export map untouched; FlagshipFoundation pattern).
import type { AuraLightData } from "../../../../rendering/src/LightUniforms.js";
// threejs-parity AD-16: LightProbe SH9 evaluation (same deep-import pattern).
import { evaluateSH9Radiance } from "../../../../rendering/src/environment/SphericalHarmonics.js";

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
  descriptor: ProductionRuntimeLightDescriptor & { readonly decay?: number },
  castsShadow: boolean
): CollectedLight {
  const rect = descriptor.kind === "rect-area";
  const source: Light = descriptor.kind === "directional"
    ? new DirectionalLight(descriptor.name)
    : descriptor.kind === "point"
      ? new PointLight(descriptor.name)
      : rect
        ? new RectAreaLight(descriptor.name)
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
  if (source instanceof RectAreaLight) {
    source.width = descriptor.authoredWidth ?? 1;
    source.height = descriptor.authoredHeight ?? 1;
    if (descriptor.range > 0) source.range = descriptor.range;
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
  // E3: rect-area descriptors (physical path) carry their basis + size into
  // the collected light so the legacy packer's rect slots stop defaulting.
  const basis = rect ? rectBasisFromDirection(descriptor.direction) : undefined;
  return {
    kind: descriptor.kind,
    color: descriptor.color,
    intensity: descriptor.intensity,
    position: descriptor.position,
    direction: normalize3(descriptor.direction),
    ...(basis ? { right: basis.right, up: basis.up } : {}),
    range: descriptor.range,
    ...(rect ? { width: descriptor.authoredWidth ?? 1, height: descriptor.authoredHeight ?? 1 } : {}),
    spotAngle: descriptor.spotAngle,
    penumbra: descriptor.penumbra,
    ...(descriptor.decay !== undefined ? { decay: descriptor.decay } : {}),
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
  // E3: node.color is an AuraColor (usually "#hex"), not a linear tuple —
  // the raw cast shipped strings into shader color slots.
  const color = colorToLinearRgb(node.color ?? "#ffffff");
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
  const params = parseHrefCached(href).searchParams;
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
  const raw = parseHrefCached(href).searchParams.get("a3dLighting");
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
  const href = typeof location !== "undefined" ? location.href : undefined;
  // With no `process` (a browser) the ambient resolution is a pure function of the page URL, and it ran on every frame.
  // With `process.env` present the environment can change between calls, so it is resolved each time.
  if (typeof process === "undefined") {
    if (ambientLightingMemo === undefined || ambientLightingMemo.href !== href) {
      ambientLightingMemo = { href, on: resolveQrFlags({ url: href, env: {} }).on("A3D_QR_LIGHTING") };
    }
    return ambientLightingMemo.on;
  }
  return resolveQrFlags({ url: href, env: process.env }).on("A3D_QR_LIGHTING");
}

let ambientLightingMemo: { readonly href: string | undefined; readonly on: boolean } | undefined;

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

/** GU47 E-B: the (flattened) authored node each `collectPrd02Lights` descriptor came from (`prd02DescriptorNode`). */
const prd02DescriptorNodes = new WeakMap<PhysicalLightDescriptor, AuraLightNode>();

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
    // threejs-parity AD-16: LightProbe — SH9 radiance evaluated ±direction
    // becomes the hemisphere irradiance pair; no `sh` = colour pair direct.
    if (node.light === "probe") {
      const direction = normalize3((node.position ?? [0, 1, 0]) as AuraVec3);
      let skyColor = colorToLinearRgb(node.color ?? "#ffffff");
      let groundColor = colorToLinearRgb((node as { groundColor?: AuraColor }).groundColor ?? "#352f28");
      const sh = node.sh;
      if (sh && sh.length === 27) {
        const coeffs = Float32Array.from(sh);
        skyColor = evaluateSH9Radiance(coeffs, direction[0], direction[1], direction[2]);
        groundColor = evaluateSH9Radiance(coeffs, -direction[0], -direction[1], -direction[2]);
      }
      hemisphere.push({
        ...(node.name !== undefined ? { name: node.name } : {}),
        skyColor,
        groundColor,
        intensity: node.intensity ?? 1,
        direction: direction as readonly [number, number, number]
      });
      return;
    }
    const descriptor = physicalLightDescriptor(node, node.name ?? `${node.light}-${index}`);
    if (descriptor) {
      prd02DescriptorNodes.set(descriptor, node);
      descriptors.push(descriptor);
    }
  });
  return { descriptors, hemisphere, ambientIntensity };
}

export function prd02DescriptorNode(descriptor: PhysicalLightDescriptor): AuraLightNode | undefined {
  return prd02DescriptorNodes.get(descriptor);
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

// ---------- GU47 E-B: per-app frame light registry (lighting diagnostics) ----------

/**
 * The collected lights each app submitted on its last frame, keyed by the app's runtime node registry
 * (`app.nodes`, the object the mounted scene's per-frame update receives as `ctx.runtimeNodes`). The PRD-02
 * light handler's per-frame update records them; `app.lighting.diagnostics()` counts them.
 */
const frameLightsByOwner = new WeakMap<object, readonly CollectedLight[]>();

export function recordRuntimeFrameLights(owner: object, lights: readonly CollectedLight[]): void {
  frameLightsByOwner.set(owner, lights);
}

const PUNCTUAL_LIGHT_KINDS: ReadonlySet<string> = new Set(["directional", "point", "spot", "rect-area"]);

/**
 * `punctualLights`: visible authored punctual lights (directional, point, spot, rect/softbox) of the last frame.
 * `localShadowLights`: the visible spot/point lights among them that carry a shadow caster slot.
 * A light hidden with `setVisible(false)` is in neither count.
 */
export function runtimeLightStats(owner: object | null | undefined): { readonly punctualLights: number; readonly localShadowLights: number } {
  const lights = owner ? frameLightsByOwner.get(owner) : undefined;
  if (!lights) return { punctualLights: 0, localShadowLights: 0 };
  let punctualLights = 0;
  let localShadowLights = 0;
  for (const light of lights) {
    if (light.source?.visible === false || !PUNCTUAL_LIGHT_KINDS.has(light.kind)) continue;
    punctualLights += 1;
    if (light.castsShadow && (light.kind === "spot" || light.kind === "point")) localShadowLights += 1;
  }
  return { punctualLights, localShadowLights };
}

// ---------- GU47 E-B: runtime light control (handle.setLight, per-frame position / visibility) ----------

type Rgb = readonly [number, number, number];

/**
 * Where a mount-time collected light came from. Recorded by `createProductionRuntimeCollectedLights` so the PRD-02
 * light handler's per-frame update can drive the light from its runtime handle (position, visibility, setLight).
 */
export interface RuntimeLightBinding {
  /** Runtime id of the authored light node (only top-level nodes with `.runtime({ id })` have handles). */
  readonly runtimeId: string | undefined;
  /** The authored light kind (`directional`, `spot`, `studio`, ...). */
  readonly authoredLight: AuraLightNode["light"];
  /** 0 for the light the node maps to; 1, 2 for the fill / rim a legacy `studio` node expands into. */
  readonly part: number;
  /** Mount-time values, which hold until the handle changes something. */
  readonly base: {
    readonly color: Rgb;
    readonly intensity: number;
    readonly range: number;
    readonly position: AuraVec3;
    readonly direction: AuraVec3;
    readonly width: number;
    readonly height: number;
  };
  /** The mount path's aim rule: the light's direction for a world position (re-aims a moved directional / spot). */
  readonly aim: (position: AuraVec3) => AuraVec3;
}

const runtimeLightBindings = new WeakMap<CollectedLight, RuntimeLightBinding>();

export function bindRuntimeLight(light: CollectedLight, binding: RuntimeLightBinding): CollectedLight {
  runtimeLightBindings.set(light, binding);
  return light;
}

export function runtimeLightBinding(light: CollectedLight): RuntimeLightBinding | undefined {
  return runtimeLightBindings.get(light);
}

/** Bind a mount-time collected light to the authored node it came from (base values = the light as created). */
export function bindAuthoredLight(
  light: CollectedLight,
  node: AuraLightNode,
  part: number,
  aim: (position: AuraVec3) => AuraVec3
): CollectedLight {
  return bindRuntimeLight(light, {
    runtimeId: (node as { readonly runtime?: { readonly id?: string } }).runtime?.id,
    authoredLight: node.light,
    part,
    base: {
      color: light.color,
      intensity: light.intensity,
      range: light.range,
      position: light.position as AuraVec3,
      direction: light.direction as AuraVec3,
      width: node.width ?? light.width ?? 1,
      height: node.height ?? light.height ?? 1
    },
    aim
  });
}

interface LightChannel<T> {
  from: T | undefined;
  readonly to: T;
  readonly seconds: number;
  t0: number | undefined;
  /** Set once an evaluation reached the target (the channel then holds `to`). */
  done?: boolean;
}

interface LightTargets {
  color?: Rgb;
  intensity?: number;
  range?: number;
  direction?: AuraVec3;
  position?: AuraVec3;
}

/** Per-handle runtime light state: queued patches, running blends and the values shown last frame. */
interface RuntimeLightControl {
  pending: { readonly patch: AuraLightPatch; readonly seconds: number }[];
  color?: LightChannel<Rgb>;
  intensity?: LightChannel<number>;
  range?: LightChannel<number>;
  direction?: LightChannel<AuraVec3>;
  position?: LightChannel<AuraVec3>;
  /** Last value written through `setPosition` by a position blend (a different handle position cancels the blend). */
  lastWrittenPosition?: AuraVec3;
  /** Values shown on the last frame (the `from` of the next blend). */
  shown: LightTargets;
  /** Handle position minus authored world position at first sight (a parent group's offset; 0 for top-level). */
  offset?: AuraVec3;
  /** Signature of the values last written into each collected light (skips no-op writes). */
  readonly written: WeakMap<CollectedLight, string>;
  /** Node fields of an ambient / hemisphere / probe light before the first write (restored values). */
  nodeBase?: { readonly intensity: number; readonly color: string };
  /** `handle.version` after the last applied frame (steady-state skip). */
  lastVersion?: number;
}

/** True until an evaluation of the channel has reached its target. */
function channelRunning(channel: LightChannel<unknown> | undefined): boolean {
  return channel !== undefined && channel.done !== true;
}

function lightChannelsRunning(control: RuntimeLightControl): boolean {
  return channelRunning(control.color) || channelRunning(control.intensity) || channelRunning(control.range)
    || channelRunning(control.direction) || channelRunning(control.position);
}

const runtimeLightControls = new WeakMap<object, RuntimeLightControl>();

function lightControlFor(handle: object): RuntimeLightControl {
  let control = runtimeLightControls.get(handle);
  if (!control) {
    control = { pending: [], shown: {}, written: new WeakMap() };
    runtimeLightControls.set(handle, control);
  }
  return control;
}

function assertFiniteVec3(value: unknown, field: string): AuraVec3 {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((v) => typeof v === "number" && Number.isFinite(v))) {
    throw new RangeError(`setLight ${field} expects three finite numbers, got ${JSON.stringify(value)}.`);
  }
  return [value[0], value[1], value[2]] as AuraVec3;
}

function assertNonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`setLight ${field} expects a finite number >= 0, got ${String(value)}.`);
  }
  return value;
}

/**
 * Queue a `handle.setLight(patch, opts)` call. Input is validated here (errors surface at the call site); the patch
 * starts on the next frame's update, blending from the value shown then.
 */
export function queueRuntimeLightPatch(handle: object, patch: AuraLightPatch, opts?: AuraLightTransitionOptions): void {
  if (patch === null || typeof patch !== "object") throw new TypeError("setLight expects a patch object.");
  const seconds = opts?.transitionSeconds === undefined ? 0 : assertNonNegative(opts.transitionSeconds, "transitionSeconds");
  const checked: { -readonly [K in keyof AuraLightPatch]: AuraLightPatch[K] } = {};
  if (patch.color !== undefined) {
    parseAuraColor(patch.color); // throws AuraColorParseError on an unparseable colour
    checked.color = patch.color;
  }
  if (patch.intensity !== undefined) checked.intensity = assertNonNegative(patch.intensity, "intensity");
  if (patch.power !== undefined) checked.power = assertNonNegative(patch.power, "power");
  if (patch.distance !== undefined) checked.distance = assertNonNegative(patch.distance, "distance");
  if (patch.direction !== undefined) {
    const direction = assertFiniteVec3(patch.direction, "direction");
    if (Math.hypot(direction[0], direction[1], direction[2]) < 1e-9) throw new RangeError("setLight direction must be a non-zero vector.");
    checked.direction = normalize3(direction) as AuraVec3;
  }
  if (patch.position !== undefined) checked.position = assertFiniteVec3(patch.position, "position");
  lightControlFor(handle).pending.push({ patch: checked, seconds });
}

/** Physical intensity for a `power` patch (three.js r185 conventions; a directional light has no power unit). */
export function lightPowerToIntensity(authoredLight: string, power: number, width = 1, height = 1): number {
  if (authoredLight === "point") return power / FOUR_PI;
  if (authoredLight === "spot") return power / Math.PI;
  if (authoredLight === "rect" || authoredLight === "softbox") return power / (Math.PI * Math.max(1e-6, width * height));
  return power;
}

const lerpNumber = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpVec3 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] =>
  [lerpNumber(a[0]!, b[0]!, t), lerpNumber(a[1]!, b[1]!, t), lerpNumber(a[2]!, b[2]!, t)];

/** Normalised lerp (directions); falls back to the target when the two are opposite. */
function nlerpDirection(a: AuraVec3, b: AuraVec3, t: number): AuraVec3 {
  const mixed = lerpVec3(a, b, t);
  return Math.hypot(mixed[0], mixed[1], mixed[2]) < 1e-6 ? b : normalize3(mixed) as AuraVec3;
}

/** Linear blend of one channel at `now`; a channel starts (from = the shown value) on its first evaluation. */
export function evaluateLightChannel<T>(
  channel: LightChannel<T>,
  now: number,
  shown: T,
  mix: (a: T, b: T, t: number) => T
): T {
  if (channel.t0 === undefined) {
    channel.t0 = now;
    channel.from = shown;
  }
  const t = channel.seconds <= 0 ? 1 : Math.min(1, Math.max(0, (now - channel.t0) / channel.seconds));
  if (t >= 1) {
    channel.done = true;
    return channel.to;
  }
  return mix(channel.from as T, channel.to, t);
}

function startChannel<T>(to: T, seconds: number): LightChannel<T> {
  return { from: undefined, to, seconds, t0: undefined };
}

/** Turn queued patches into channels (power converted with the light's kind). */
function consumePendingPatches(control: RuntimeLightControl, binding: RuntimeLightBinding | undefined, authoredLight: string): void {
  if (control.pending.length === 0) return;
  for (const { patch, seconds } of control.pending) {
    if (patch.color !== undefined) control.color = startChannel(colorToLinearRgb(patch.color), seconds);
    const intensity = patch.intensity ?? (patch.power !== undefined
      ? lightPowerToIntensity(authoredLight, patch.power, binding?.base.width, binding?.base.height)
      : undefined);
    if (intensity !== undefined) control.intensity = startChannel(intensity, seconds);
    if (patch.distance !== undefined) control.range = startChannel(patch.distance, seconds);
    if (patch.direction !== undefined) control.direction = startChannel(patch.direction, seconds);
    if (patch.position !== undefined) {
      control.position = startChannel(patch.position, seconds);
      control.lastWrittenPosition = undefined;
    }
  }
  control.pending = [];
}

function sameVec3(a: readonly number[] | undefined, b: readonly number[] | undefined, epsilon = 1e-9): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a[0]! - b[0]!) <= epsilon && Math.abs(a[1]! - b[1]!) <= epsilon && Math.abs(a[2]! - b[2]!) <= epsilon;
}

/** The live values of one bound collected light for this frame. */
export interface RuntimeLightFrameValues {
  readonly visible: boolean;
  readonly color: Rgb;
  readonly intensity: number;
  readonly range: number;
  readonly position: AuraVec3;
  readonly direction: AuraVec3;
}

/** Mutable view of a collected light: the per-frame update writes the live values into the mount-time objects. */
type WritableCollectedLight = { -readonly [K in keyof CollectedLight]: CollectedLight[K] };

/**
 * Write the frame values into a collected light and its scene `Light` (the shadow passes read `position`,
 * `direction`, `range` and `source.visible`; the legacy shadow path reads the source transform). A hidden light
 * shades with intensity 0 and `source.visible = false`, so no shadow pass selects it.
 */
export function writeRuntimeLight(light: CollectedLight, values: RuntimeLightFrameValues): void {
  const target = light as WritableCollectedLight;
  target.color = values.color;
  target.intensity = values.visible ? values.intensity : 0;
  target.position = values.position;
  target.direction = values.direction;
  target.range = values.range;
  if (light.kind === "rect-area") {
    const basis = rectBasisFromDirection(values.direction);
    target.right = basis.right;
    target.up = basis.up;
  }
  const source = light.source;
  if (!source) return;
  source.visible = values.visible;
  source.color = [values.color[0], values.color[1], values.color[2]];
  source.intensity = target.intensity;
  source.transform.setPosition(values.position[0], values.position[1], values.position[2]);
  if (source instanceof PointLight || source instanceof SpotLight) source.range = Math.max(0.001, values.range);
  if (!(source instanceof PointLight)) {
    const rotation = quaternionFromForwardDirection(values.direction);
    source.transform.setRotation(rotation[0], rotation[1], rotation[2], rotation[3]);
  }
  source.updateWorldTransform(true);
}

function frameSignature(values: RuntimeLightFrameValues): string {
  return `${values.visible ? 1 : 0}|${values.color.join(",")}|${values.intensity}|${values.range}|${values.position.join(",")}|${values.direction.join(",")}`;
}

/** Collected lights bound to each runtime id, per mount-time light list. */
const lightsByRuntimeId = new WeakMap<readonly CollectedLight[], Map<string, CollectedLight[]>>();

function boundLightsFor(lights: readonly CollectedLight[], runtimeId: string): readonly CollectedLight[] {
  let index = lightsByRuntimeId.get(lights);
  if (!index) {
    index = new Map();
    for (const light of lights) {
      const id = runtimeLightBindings.get(light)?.runtimeId;
      if (id === undefined) continue;
      const list = index.get(id);
      if (list) list.push(light);
      else index.set(id, [light]);
    }
    lightsByRuntimeId.set(lights, index);
  }
  return index.get(runtimeId) ?? [];
}

function rgbToHex(rgb: Rgb): string {
  const channel = (v: number) => Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255).toString(16).padStart(2, "0");
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}

function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** The handle surface the per-frame light update reads and writes. */
export interface RuntimeLightHandleLike {
  readonly id: string;
  /** C-37 per-node version (bumped by every handle mutator); lets an unchanged light skip the frame. */
  readonly version?: number;
  readonly visible: boolean;
  readonly position: AuraVec3;
  setPosition(x: number, y: number, z: number): unknown;
}

/**
 * GU47 E-B per-frame light update (PRD-02 light handler `update`): drives the collected light(s) of one authored light
 * node from its runtime handle. Position follows `handle.position` every frame (plus the node's parent offset),
 * `setVisible(false)` zeroes the light and drops it from every shadow pass, and `setLight` patches blend linearly over
 * their `transitionSeconds`. Lights without a handle are untouched (their mount values stand). Ambient / hemisphere /
 * probe lights have no collected light: their `color` / `intensity` are written onto the flattened node, which the
 * environment resolution reads every frame.
 */
export function updateRuntimeLight(
  node: AuraLightNode,
  handle: RuntimeLightHandleLike | undefined,
  lights: readonly CollectedLight[],
  timeSeconds: number
): void {
  if (!handle) return;
  const bound = boundLightsFor(lights, handle.id);
  if (bound.length === 0) {
    if (node.light === "ambient" || node.light === "hemisphere" || node.light === "probe") updateEnvironmentLightNode(node, handle, runtimeLightControls.get(handle), timeSeconds);
    return;
  }
  const state = lightControlFor(handle);
  // Steady state: nothing queued, no blend running and the handle unchanged since the last frame.
  if (state.pending.length === 0 && typeof handle.version === "number" && handle.version === state.lastVersion && !lightChannelsRunning(state)) return;
  const primary = bound.find((light) => runtimeLightBindings.get(light)?.part === 0) ?? bound[0]!;
  const binding = runtimeLightBindings.get(primary)!;
  const base = binding.base;
  consumePendingPatches(state, binding, binding.authoredLight);
  // Parent-group offset, captured at the first update (mount, before any handle write); 0 for top-level nodes.
  state.offset ??= [base.position[0] - handle.position[0], base.position[1] - handle.position[1], base.position[2] - handle.position[2]];

  // Position: a running position blend writes through setPosition; any other handle position cancels it.
  if (state.position) {
    if (state.lastWrittenPosition && !sameVec3(state.lastWrittenPosition, handle.position)) {
      state.position = undefined;
    } else {
      const next = evaluateLightChannel(state.position, timeSeconds, [...handle.position] as AuraVec3, (a, b, t) => lerpVec3(a, b, t) as AuraVec3);
      if (!sameVec3(next, handle.position)) handle.setPosition(next[0], next[1], next[2]);
      state.lastWrittenPosition = [...handle.position] as AuraVec3;
      if (!channelRunning(state.position)) state.position = undefined;
    }
  }
  const offset = state.offset;
  const position: AuraVec3 = [handle.position[0] + offset[0], handle.position[1] + offset[1], handle.position[2] + offset[2]];
  const moved = !sameVec3(position, base.position);

  const shown = state.shown;
  const color = state.color ? evaluateLightChannel(state.color, timeSeconds, shown.color ?? base.color, (a, b, t) => lerpVec3(a, b, t) as Rgb) : base.color;
  const intensity = state.intensity ? evaluateLightChannel(state.intensity, timeSeconds, shown.intensity ?? base.intensity, lerpNumber) : base.intensity;
  const range = state.range ? evaluateLightChannel(state.range, timeSeconds, shown.range ?? base.range, lerpNumber) : base.range;
  // Direction: an explicit setLight direction stays fixed while the light moves (a carried torch); without one, a moved
  // directional / spot re-aims at its authored target by the mount path's own rule.
  const aimed = moved ? binding.aim(position) : base.direction;
  const direction = state.direction
    ? evaluateLightChannel(state.direction, timeSeconds, shown.direction ?? aimed, nlerpDirection)
    : aimed;
  state.shown = { color, intensity, range, direction, position };
  state.lastVersion = handle.version;

  const visible = handle.visible !== false;
  for (const light of bound) {
    const lightBinding = runtimeLightBindings.get(light)!;
    const values: RuntimeLightFrameValues = light === primary
      ? { visible, color, intensity, range, position, direction }
      : secondaryLightValues(lightBinding, base, visible, color, intensity, position);
    const signature = frameSignature(values);
    if (state.written.get(light) === signature) continue;
    // Untouched lights keep their exact mount objects (no write while the values equal the base).
    if (!state.written.has(light) && sameAsBase(values, lightBinding.base)) {
      state.written.set(light, signature);
      continue;
    }
    writeRuntimeLight(light, values);
    state.written.set(light, signature);
  }
}

function sameAsBase(values: RuntimeLightFrameValues, base: RuntimeLightBinding["base"]): boolean {
  return values.visible && values.intensity === base.intensity && values.range === base.range
    && sameVec3(values.color, base.color, 0) && sameVec3(values.position, base.position, 0) && sameVec3(values.direction, base.direction, 0);
}

/** A legacy `studio` node's fill / rim follow the key: same visibility, intensity and colour ratios, same move. */
function secondaryLightValues(
  binding: RuntimeLightBinding,
  primaryBase: RuntimeLightBinding["base"],
  visible: boolean,
  color: Rgb,
  intensity: number,
  position: AuraVec3
): RuntimeLightFrameValues {
  const ratio = (value: number, baseValue: number) => (baseValue > 0 ? value / baseValue : 1);
  const delta: AuraVec3 = [position[0] - primaryBase.position[0], position[1] - primaryBase.position[1], position[2] - primaryBase.position[2]];
  const moved: AuraVec3 = [binding.base.position[0] + delta[0], binding.base.position[1] + delta[1], binding.base.position[2] + delta[2]];
  return {
    visible,
    color: [
      binding.base.color[0] * ratio(color[0], primaryBase.color[0]),
      binding.base.color[1] * ratio(color[1], primaryBase.color[1]),
      binding.base.color[2] * ratio(color[2], primaryBase.color[2])
    ],
    intensity: binding.base.intensity * ratio(intensity, primaryBase.intensity),
    range: binding.base.range,
    position: moved,
    direction: sameVec3(delta, [0, 0, 0]) ? binding.base.direction : binding.aim(moved)
  };
}

/** Ambient / hemisphere / probe: `color` / `intensity` (and visibility) written onto the flattened node. */
function updateEnvironmentLightNode(
  node: AuraLightNode,
  handle: RuntimeLightHandleLike,
  control: RuntimeLightControl | undefined,
  timeSeconds: number
): void {
  if (!control && handle.visible !== false) return;
  const state = control ?? lightControlFor(handle);
  consumePendingPatches(state, undefined, node.light);
  const mutable = node as { -readonly [K in keyof AuraLightNode]: AuraLightNode[K] };
  state.nodeBase ??= { intensity: node.intensity ?? 0, color: node.color ?? "#ffffff" };
  const baseColor = colorToLinearRgb(state.nodeBase.color);
  const color = state.color ? evaluateLightChannel(state.color, timeSeconds, state.shown.color ?? baseColor, (a, b, t) => lerpVec3(a, b, t) as Rgb) : baseColor;
  const intensity = state.intensity ? evaluateLightChannel(state.intensity, timeSeconds, state.shown.intensity ?? state.nodeBase.intensity, lerpNumber) : state.nodeBase.intensity;
  state.shown = { ...state.shown, color, intensity };
  mutable.intensity = handle.visible === false ? 0 : intensity;
  mutable.color = state.color ? rgbToHex(color) : state.nodeBase.color;
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
