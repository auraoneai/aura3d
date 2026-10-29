// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

// FIRST import: this leaf carries the lane-02 source-registration flag. It
// must stay ahead of every other import here — `lanes/prd02.ts`
// self-registers at module scope, and a cyclic import order can run that
// lane body while this module is still mid-initialisation; keeping the
// binding first means it is live before any later import can suspend us.
import { prd02SourcesState } from "./environmentSourcesState.js";
import type { AuraAssetRef, AuraColor, AuraEnvironmentNode, AuraLightNode, AuraSceneSnapshot } from "../nodes/types.js";
import type { AuraEnvironmentNodeV2, AuraEnvironmentPresetName } from "../nodes/environments.js";
import { registerEnvironmentSource, type AuraEnvironmentSourceResolution } from "../../contracts/environment.js";
import { colorToLinearRgb } from "../colorUtils.js";
import { nonNegativeFinite } from "../compiler/observations.js";
import { groups } from "../nodes/groups.js";
import { resolveRendererSceneCategory } from "../rendererDiagnostics.js";
import { createExternalParityEnvironmentLighting, linearToSrgbChannel, type EnvironmentLightingOptions } from "@aura3d/rendering";

/**
 * #1141 / 02-S2: the legacy scene-category environment of a scene with no
 * authored environment and no lights at all is registered in a process-global
 * WeakSet, so the
 * renderer's `collectEnvironmentLighting` can put the neutral room in their
 * place under A3D_QR_LIGHTING (renderer/Background.ts). A WeakSet keyed on
 * `Symbol.for` leaves the objects byte-identical (flag-off goldens) and works
 * across duplicated src/dist module instances.
 */
const PRD02_LEGACY_FALLBACK_ENVIRONMENTS = Symbol.for("aura3d.prd02.legacyFallbackEnvironments");
function markLegacyFallbackEnvironment<T extends object>(lighting: T): T {
  const store = globalThis as { [PRD02_LEGACY_FALLBACK_ENVIRONMENTS]?: WeakSet<object> };
  (store[PRD02_LEGACY_FALLBACK_ENVIRONMENTS] ??= new WeakSet()).add(lighting);
  return lighting;
}

/**
 * Exposure convention (beat-three.js PRD 3.2, Q1). A scene that authors its own
 * lights and no environment is lit by exactly those lights, the way three.js
 * r185 lights it: a directional light of intensity I on a Lambert surface of
 * albedo A gives A * I / PI, ambient gives A * I / PI, and a hemisphere light
 * gives A * mean(ground, sky) * I / PI (the horizontal-normal value). Before this the scene
 * category's implicit studio/daylight environment was added on top and lifted
 * the same nominal lights roughly 2x to 6x (skinned character mean luma
 * three 144 vs Aura3D 192.5). `implicitFill: true` restores the old fill.
 * Left false by direct callers so the flag-off legacy goldens stay byte-equal;
 * the renderer passes the default (explicit lights only) at mount.
 */
export interface ProductionRuntimeEnvironmentOptions {
  readonly implicitFill?: boolean;
}

function explicitLightFillFree(snapshot: AuraSceneSnapshot, nodes: ReturnType<typeof groups.flatten>): EnvironmentLightingOptions | null {
  const lightNodes = nodes.filter((node): node is AuraLightNode => node.kind === "light");
  const lit = lightNodes.filter((node) => node.light !== "probe" && (node.intensity ?? 1) >= 0);
  if (lit.length === 0 || lit.length !== lightNodes.length) return null;
  void snapshot;
  // Total uniform irradiance in linear light. A hemisphere light enters as the mean of its sky and ground
  // colours, which is three's value on a horizontal normal; up- and down-facing surfaces differ from three by
  // half the sky/ground gap (see the CHANGELOG note).
  const total: [number, number, number] = [0, 0, 0];
  for (const light of lit) {
    if (light.light === "ambient" && (light.intensity ?? 0) > 0) {
      const linear = colorToLinearRgb(light.color ?? "#ffffff");
      for (let i = 0; i < 3; i += 1) total[i]! += linear[i]! * (light.intensity ?? 0);
    } else if (light.light === "hemisphere" && (light.intensity ?? 1) > 0) {
      const intensity = light.intensity ?? 1;
      const sky = colorToLinearRgb(light.color ?? "#bcd7ff");
      const ground = colorToLinearRgb((light as { groundColor?: AuraColor }).groundColor ?? "#352f28");
      for (let i = 0; i < 3; i += 1) total[i]! += ((sky[i]! + ground[i]!) / 2) * intensity;
    }
  }
  // The renderer validates the environment colour into [0, 1]; the magnitude rides in the scalar.
  const peak = Math.max(1, ...total);
  return {
    color: [total[0] / peak, total[1] / peak, total[2] / peak],
    intensity: peak,
    environmentMapIntensity: 0,
    environmentMapSpecularIntensity: 0
  };
}

export function createProductionRuntimeEnvironment(
  snapshot: AuraSceneSnapshot,
  flags?: { on(name: string): boolean },
  options?: ProductionRuntimeEnvironmentOptions
): {
  readonly preset: string;
  readonly intensity: number;
  readonly evidence: string;
  readonly lighting: EnvironmentLightingOptions;
  readonly hdriUrl?: string;
  readonly hdriReflectionUrl?: string;
  readonly hdriRotation?: number;
} {
  const nodes = groups.flatten(snapshot.nodes);
  const authoredEnvironment = nodes.find((node): node is AuraEnvironmentNode => node.kind === "environment");
  if (authoredEnvironment) {
    const presetByEnvironment: Record<string, Parameters<typeof createExternalParityEnvironmentLighting>[0]> = {
      "studio": "studio",
      "material-lab": "inspection",
      "product-hero": "softbox",
      "night-cinematic": "evening",
      "metal-studio": "exhibit",
      "glass-studio": "softbox",
      // B3: HDRI first frames render the honest studio procedural fallback;
      // the post-mount upgrade swaps in the HDR chain (hdriUrl below).
      "hdri": "studio",
      // PRD-02 version-2 kinds with the flag OFF degrade to the closest legacy
      // preset (additive keys; previously they could not appear).
      "preset": "studio",
      "neutral": "studio",
      "capture": "studio"
    };
    if (authoredEnvironment.environment === "none" as AuraEnvironmentNode["environment"]) {
      // environments.none(): explicit zero-IBL opt-out (PRD-02 §7).
      return {
        preset: "none",
        intensity: 0,
        evidence: "production bridge binds no environment map (environments.none())",
        lighting: { color: [1, 1, 1], intensity: 0, environmentMapIntensity: 0, environmentMapSpecularIntensity: 0 }
      };
    }
    const preset = presetByEnvironment[authoredEnvironment.environment];
    const bundle = createExternalParityEnvironmentLighting(preset, flags);
    const intensity = nonNegativeFinite(authoredEnvironment.intensity);
    // E3 stage-2a (Live Fix): under A3D_QR_COMPILER the five stacked preset
    // scalars (ambient/procedural/sampled × diffuse/specular) collapse to
    // ONE authored knob — intensity = environmentMapIntensity =
    // environmentMapSpecularIntensity = authored intensity, procedural
    // contribution zeroed (Three.js scene.environmentIntensity shape).
    // Flag-off keeps the legacy scalar stack byte-identical. Authored
    // ambient is NOT part of the knob: it stays additive via
    // prd02AmbientTerm (F-02-01 / C-09 contract).
    const singleKnob = flags?.on("A3D_QR_COMPILER") === true;
    const proceduralMap = bundle.lighting.proceduralMap;
    const hdriUrl = authoredEnvironment.environment === "hdri"
      && typeof authoredEnvironment.texture === "object"
      && (authoredEnvironment.texture as { kind?: string }).kind === "aura-asset-ref"
      ? (authoredEnvironment.texture as AuraAssetRef<"texture">).url ?? undefined
      : undefined;
    const hdriReflectionUrl = authoredEnvironment.environment === "hdri"
      && typeof authoredEnvironment.reflectionTexture === "object"
      && (authoredEnvironment.reflectionTexture as { kind?: string }).kind === "aura-asset-ref"
      ? (authoredEnvironment.reflectionTexture as AuraAssetRef<"texture">).url ?? undefined
      : undefined;
    const hdriRotation = authoredEnvironment.environment === "hdri" && authoredEnvironment.rotation !== undefined
      ? authoredEnvironment.rotation
      : undefined;
    return {
      preset: authoredEnvironment.environment,
      intensity,
      evidence: hdriUrl
        ? `production bridge renders the studio procedural fallback until the authored HDRI ${hdriUrl}${hdriReflectionUrl ? ` (reflection ${hdriReflectionUrl})` : ""} resolves through the HDR chain`
        : `production bridge submitted the authored ${authoredEnvironment.environment} environment through generated HDR ${preset} lighting`,
      ...(hdriUrl ? { hdriUrl } : {}),
      ...(hdriReflectionUrl ? { hdriReflectionUrl } : {}),
      ...(hdriRotation !== undefined ? { hdriRotation } : {}),
      lighting: {
        ...bundle.lighting,
        color: authoredEnvironment.color ? colorToLinearRgb(authoredEnvironment.color) : bundle.lighting.color,
        intensity: singleKnob ? intensity : bundle.lighting.intensity * intensity,
        ...(proceduralMap ? {
          proceduralMap: {
            ...proceduralMap,
            intensity: singleKnob ? 0 : proceduralMap.intensity * intensity,
            specularIntensity: singleKnob ? 0 : proceduralMap.specularIntensity * intensity
          }
        } : {}),
        environmentMapIntensity: singleKnob ? intensity : (bundle.lighting.environmentMapIntensity ?? 0) * intensity,
        environmentMapSpecularIntensity: singleKnob ? intensity : (bundle.lighting.environmentMapSpecularIntensity ?? 0) * intensity
      }
    };
  }
  if (options?.implicitFill === false) {
    const explicit = explicitLightFillFree(snapshot, nodes);
    if (explicit) {
      return {
        preset: "authored-lights",
        intensity: explicit.intensity ?? 0,
        evidence: "production bridge lights the scene with its authored lights only (three.js r185 convention, no implicit environment); add an environments.* node to restore the studio fill",
        lighting: explicit
      };
    }
  }
  const ambientLights = nodes.filter((node): node is AuraLightNode => node.kind === "light" && node.light === "ambient" && node.intensity > 0);
  if (ambientLights.length > 0) {
    const intensity = ambientLights.reduce((total, light) => total + light.intensity, 0);
    const color = ambientLights.reduce<readonly [number, number, number]>((sum, light) => {
      const linear = colorToLinearRgb(light.color ?? "#ffffff");
      const weight = light.intensity / intensity;
      return [sum[0] + linear[0] * weight, sum[1] + linear[1] * weight, sum[2] + linear[2] * weight];
    }, [0, 0, 0]);
    return {
      preset: "authored-ambient",
      intensity,
      evidence: `production bridge submitted ${ambientLights.length} authored ambient light${ambientLights.length === 1 ? "" : "s"} without an implicit environment map`,
      lighting: { color, intensity, environmentMapIntensity: 0, environmentMapSpecularIntensity: 0 }
    };
  }
  const names = nodes.map((node) => "name" in node ? node.name?.toLowerCase() ?? "" : "");
  const category = resolveRendererSceneCategory(snapshot, names);
  const preset: Parameters<typeof createExternalParityEnvironmentLighting>[0] =
    category === "city-day" ? "daylight"
      : category === "city-night" ? "evening"
        : category === "game" ? "gameplay"
          : category === "material" ? "inspection"
            : "studio";
  const bundle = createExternalParityEnvironmentLighting(preset, flags);
  const knob = bundle.lighting.environmentMapIntensity ?? bundle.lighting.intensity;
  // E3 step 4: under the conjunction the category fallback collapses to the
  // same single knob as the authored branch (intensity =
  // environmentMapIntensity = environmentMapSpecularIntensity = knob,
  // procedural zeroed) instead of stacking the preset's five scalars. The
  // gate is the conjunction, not COMPILER alone: the stage-2a
  // COMPILER-only collapse above stays authored-only, so every
  // conjunction-off bundle (including COMPILER-only) is byte-identical.
  const conjunction = flags?.on("A3D_QR_COMPILER") === true && flags?.on("A3D_QR_LIGHTING") === true;
  const categoryLighting: EnvironmentLightingOptions = conjunction
    ? {
        ...bundle.lighting,
        intensity: knob,
        ...(bundle.lighting.proceduralMap
          ? { proceduralMap: { ...bundle.lighting.proceduralMap, intensity: 0, specularIntensity: 0 } }
          : {}),
        environmentMapIntensity: knob,
        environmentMapSpecularIntensity: knob
      }
    : bundle.lighting;
  return {
    preset,
    intensity: knob,
    evidence: `production bridge submitted generated HDR ${preset} environment lighting through RenderSource.environmentLighting`,
    // Only a scene with no environment *and no lights at all* is a fallback
    // the neutral room replaces under the flag (PRD-02 §6.2 / migration table:
    // "with no lights, the neutral environment lights the scene"). A scene
    // with authored lights keeps today's look; the three references for the
    // base scenes carry no environment either (GPU run 38150848623: 01/12
    // went 128 → 187 median with the neutral room added under authored lights).
    // The bundle object can be shared across scenes with the same preset, so
    // the marked value is a shallow copy (deep-equal: flag-off output unchanged).
    lighting: nodes.some((node) => node.kind === "light") ? categoryLighting : markLegacyFallbackEnvironment({ ...categoryLighting })
  };
}

// ---------- PRD-02 Phase 2 — C-09 environment sources (flag path) ----------

/** Additive ambient term: ambient lights never replace IBL under the flag
 *  (F-02-01). Returns null when no ambient light contributes. Colors blend
 *  in linear space (same weighting as the legacy authored-ambient branch)
 *  and are emitted back as an sRGB hex `AuraColor`. */
export function prd02AmbientTerm(
  snapshot: AuraSceneSnapshot,
  options?: { readonly includeHemisphere?: boolean }
): { readonly color: AuraColor; readonly intensity: number } | null {
  const nodes = groups.flatten(snapshot.nodes);
  const ambientLights = nodes.filter(
    (node): node is AuraLightNode => node.kind === "light" && node.light === "ambient" && (node.intensity ?? 0) > 0
  );
  const hemispheres = options?.includeHemisphere === true
    ? nodes.filter((node): node is AuraLightNode => node.kind === "light" && node.light === "hemisphere" && (node.intensity ?? 1) > 0)
    : [];
  if (ambientLights.length === 0 && hemispheres.length === 0) return null;
  const hex = (v: number) => Math.round(linearToSrgbChannel(v) * 255).toString(16).padStart(2, "0");
  if (hemispheres.length === 0) {
    const intensity = ambientLights.reduce((total, light) => total + (light.intensity ?? 0), 0);
    const color = ambientLights.reduce<readonly [number, number, number]>((sum, light) => {
      const linear = colorToLinearRgb(light.color ?? "#ffffff");
      const weight = (light.intensity ?? 0) / intensity;
      return [sum[0] + linear[0] * weight, sum[1] + linear[1] * weight, sum[2] + linear[2] * weight];
    }, [0, 0, 0]);
    return { color: `#${hex(color[0])}${hex(color[1])}${hex(color[2])}`, intensity };
  }
  // A hemisphere light is uniform irradiance here: the mean of its sky and ground colours (three's value on a
  // horizontal normal). Summed with the ambient lights in linear light; the magnitude rides in the intensity.
  const total: [number, number, number] = [0, 0, 0];
  for (const light of ambientLights) {
    const linear = colorToLinearRgb(light.color ?? "#ffffff");
    for (let i = 0; i < 3; i += 1) total[i]! += linear[i]! * (light.intensity ?? 0);
  }
  for (const light of hemispheres) {
    const sky = colorToLinearRgb(light.color ?? "#bcd7ff");
    const ground = colorToLinearRgb((light as { groundColor?: AuraColor }).groundColor ?? "#352f28");
    for (let i = 0; i < 3; i += 1) total[i]! += ((sky[i]! + ground[i]!) / 2) * (light.intensity ?? 1);
  }
  const peak = Math.max(...total, 1e-9);
  return { color: `#${hex(total[0] / peak)}${hex(total[1] / peak)}${hex(total[2] / peak)}`, intensity: peak };
}

/** §11 alias → preset name: every legacy environment kind except
 *  night-cinematic resolves to the "studio" preset (§11 table); the
 *  categories keep their semantic name only in the legacy path. */
const LEGACY_ENVIRONMENT_PRESET: Record<string, AuraEnvironmentPresetName> = {
  "studio": "studio",
  "material-lab": "studio",
  "product-hero": "studio",
  "night-cinematic": "night",
  "metal-studio": "studio",
  "glass-studio": "studio"
};

function resolveBackgroundOption(
  node: AuraEnvironmentNodeV2,
  defaultVisible: boolean
): AuraEnvironmentSourceResolution["background"] {
  const opt = node.background;
  if (opt === false) return false;
  if (opt === true || opt === undefined) {
    return { visible: opt === undefined ? defaultVisible : true, blurriness: 0, intensity: 1, rotation: 0 };
  }
  return {
    visible: opt.visible ?? defaultVisible,
    blurriness: opt.blurriness ?? 0,
    intensity: opt.intensity ?? 1,
    rotation: opt.rotation ?? 0
  };
}

export function explicitEnvironmentResolution(
  node: AuraEnvironmentNodeV2,
  ambient: AuraEnvironmentSourceResolution["ambient"]
): AuraEnvironmentSourceResolution | undefined {
  const intensity = nonNegativeFinite(node.intensity);
  const diffuseIntensity = nonNegativeFinite(node.diffuseIntensity ?? intensity);
  const specularIntensity = nonNegativeFinite(node.specularIntensity ?? intensity);
  const rotation = node.rotation ?? 0;
  const base = { kind: "explicit" as const, intensity, diffuseIntensity, specularIntensity, rotation, ambient };
  switch (node.environment) {
    case "none":
      // Explicit zero-IBL opt-out: the neutral probe is still bound so the
      // renderer path stays uniform, but both IBL intensities are zeroed.
      return { ...base, probe: "neutral", diffuseIntensity: 0, specularIntensity: 0, intensity: 0, background: false };
    case "neutral":
      return { ...base, probe: "neutral", background: resolveBackgroundOption(node, false) };
    case "preset":
      return { ...base, probe: { preset: node.preset ?? "studio" }, background: resolveBackgroundOption(node, true) };
    case "capture":
      return {
        ...base,
        probe: {
          capture: {
            include: node.capture?.include ?? "sky-only",
            ...(node.capture?.position ? { position: node.capture.position } : {}),
            ...(node.capture?.resolution ? { resolution: node.capture.resolution } : {}),
            ...(node.capture?.update ? { update: node.capture.update as "once" | "on-demand" | { readonly everyNFrames: number } } : {})
          }
        },
        background: resolveBackgroundOption(node, true)
      };
    case "hdri": {
      const url = typeof node.texture === "object" && node.texture !== null && node.texture.kind === "aura-asset-ref"
        ? node.texture.url
        : undefined;
      const reflection = typeof node.reflectionTexture === "object" && node.reflectionTexture !== null && node.reflectionTexture.kind === "aura-asset-ref"
        ? node.reflectionTexture.url
        : undefined;
      if (!url) return undefined; // malformed hdri node: fall through to neutral-room
      return { ...base, probe: { hdri: url, ...(reflection ? { reflection } : {}) }, background: resolveBackgroundOption(node, true) };
    }
    default: {
      // Legacy alias kinds (§11): resolve to presets with background off.
      const preset = LEGACY_ENVIRONMENT_PRESET[node.environment];
      if (!preset) return undefined;
      return { ...base, probe: { preset }, background: resolveBackgroundOption(node, false) };
    }
  }
}

/**
 * E3 stage-2b (step 3): intensities the C-09 probe bind carries to the
 * renderer. Under the conjunction with an explicit (authored-environment)
 * resolution, the stage-2a knob object is the single source — both terms
 * equal the knob, even when a version-2 node authored separate diffuse/specular
 * intensities into the resolution. Neutral-room resolutions and every
 * conjunction-off bind keep the resolution intensities verbatim (the
 * pre-stage-2b behavior compileScene had when it discarded the knob).
 */
export function prd02ProbeBindIntensities(
  knobLighting: EnvironmentLightingOptions | false | undefined,
  resolution: Pick<AuraEnvironmentSourceResolution, "kind" | "diffuseIntensity" | "specularIntensity">,
  conjunction: boolean
): { readonly diffuseIntensity: number; readonly specularIntensity: number } {
  if (conjunction && knobLighting) {
    if (resolution.kind === "explicit") {
      const knob = knobLighting.environmentMapIntensity ?? knobLighting.intensity;
      if (Number.isFinite(knob) && knob >= 0) {
        return { diffuseIntensity: knob, specularIntensity: knob };
      }
    }
    if (
      resolution.kind === "neutral-room" &&
      knobLighting.environmentMapIntensity === 0 &&
      knobLighting.environmentMapSpecularIntensity === 0
    ) {
      return { diffuseIntensity: 0, specularIntensity: 0 };
    }
  }
  return { diffuseIntensity: resolution.diffuseIntensity, specularIntensity: resolution.specularIntensity };
}

// ---------- PRD-02 Phase 3 — probe binding (neutral floor + async upgrade) ----------

import type { EnvironmentProbe } from "@aura3d/rendering/contracts";
import { environmentProbeFactorySlot, isEnvironmentProbeFactoryPending, type AuraQualityTier, type QrFlags } from "@aura3d/rendering/contracts";
// Deep imports: @aura3d/rendering has no "./environment" subpath and contracts
// don't re-export RenderDevice (lane-15/-01 files); same pattern as
// FlagshipFoundation's rendering/src deep imports.
import type { RenderDevice } from "../../../../rendering/src/RenderDevice.js";
import { EnvironmentCache, defaultProbeLoader } from "../../../../rendering/src/environment/EnvironmentCache.js";
import type { EnvironmentCaptureRequest } from "@aura3d/rendering/contracts";
import { readLightingKillSwitches } from "./lights.js";
import { markTiming } from "../platform.js";

export interface Prd02EnvironmentBindOptions {
  readonly device: RenderDevice;
  readonly tier: AuraQualityTier;
  readonly flags: QrFlags;
  /**
   * Hooks the device into `AuraLightingDiagnostics` counters (C-28): callers
   * with a lighting runtime pass `app.lighting.attachDevice`.
   */
  readonly attachDevice?: (device: RenderDevice) => void;
  /** Shared cache; a fresh one is created when omitted. */
  readonly cache?: EnvironmentCache;
  /** Live-scene capture hook; required only for `{ capture }` probes. */
  readonly captureRequest?: EnvironmentCaptureRequest;
  /** Called once when the async-acquired (hdri/preset) probe replaces the neutral floor. */
  readonly onUpgrade?: (probe: EnvironmentProbe) => void;
  /**
   * Called when the upgrade fails; the neutral floor stays bound. `retryable`
   * is true while the C-09 factory is still the pending stub, so the caller can
   * bind again on a later frame once the provider lands.
   */
  readonly onUpgradeFailed?: (error: unknown, retryable: boolean) => void;
}

const warnedEnvironmentUpgradeFailures = new Set<string>();

/** One console warning per distinct failure; never an error or unhandled rejection. */
function warnEnvironmentUpgradeFailureOnce(message: string): void {
  if (warnedEnvironmentUpgradeFailures.has(message) || warnedEnvironmentUpgradeFailures.size >= 32) return;
  warnedEnvironmentUpgradeFailures.add(message);
  if (typeof console !== "undefined") {
    console.warn(`[aura3d] environment probe not ready; rendering with the neutral floor (${message})`);
  }
}

/** True for the stub's `ENVIRONMENT_PROBE_PENDING:*` rejection. */
export function isEnvironmentProbePendingError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("ENVIRONMENT_PROBE_PENDING");
}

export interface Prd02EnvironmentBinding {
  /** Probe to bind this frame — the neutral floor until `pending` resolves. */
  readonly probe: EnvironmentProbe;
  /** Non-null while a higher-quality probe is being acquired. */
  readonly pending: Promise<EnvironmentProbe> | null;
  readonly resolution: AuraEnvironmentSourceResolution;
  /** §6.5 `?a3dLighting=pmrem=cpu` kill switch, echoed for diagnostics. */
  readonly pmremMode: "cpu" | "auto";
}

/**
 * Binds an `AuraEnvironmentSourceResolution` to a real C-09 probe:
 * neutral probes resolve synchronously through the cache (never evicted);
 * preset/hdri probes go through `EnvironmentCache.acquire` asynchronously
 * with the neutral probe bound until they land (`onUpgrade`). `capture`
 * probes build via `factory.fromScene` when a `captureRequest` is supplied,
 * else fall back to the neutral floor.
 */
export function bindPrd02EnvironmentProbe(
  resolution: AuraEnvironmentSourceResolution,
  options: Prd02EnvironmentBindOptions
): Prd02EnvironmentBinding {
  options.attachDevice?.(options.device);
  const resolveFactory = () => environmentProbeFactorySlot.get(options.flags)(options.device);
  const factory = resolveFactory();
  const cache = options.cache ?? new EnvironmentCache(options.device, factory, defaultProbeLoader(resolveFactory));
  // three.js PMREM-style async upgrade: the floor draws until the probe lands.
  // A failure (including the C-09 stub still pending) keeps the floor and is
  // handled here, so no frame ever sees an unhandled rejection.
  const upgrade = (acquired: Promise<EnvironmentProbe>): Promise<EnvironmentProbe> => {
    markTiming("a3d:env:upgrade:start");
    const pending = acquired.then((probe) => {
      markTiming("a3d:env:upgrade:ready");
      options.onUpgrade?.(probe);
      return probe;
    });
    pending.catch((error: unknown) => {
      const retryable = isEnvironmentProbePendingError(error);
      warnEnvironmentUpgradeFailureOnce(error instanceof Error ? error.message : String(error));
      options.onUpgradeFailed?.(error, retryable);
    });
    return pending;
  };
  const tier = options.tier;
  const request = resolution.probe;
  // §6.5 `pmrem=cpu`: the CPU prefilter is the lane's sole impl today — the
  // mode is echoed so the capture report can label it (toggle-delta reads it).
  const pmremMode: "cpu" | "auto" = readLightingKillSwitches().pmrem === "cpu" ? "cpu" : "auto";
  if (request === "neutral") {
    // T0-25: `cache.neutral` is now the analytic constant floor (no main-thread
    // GGX prefilter); the baked `neutral` preset upgrades it through
    // `cache.acquire` so specular detail lands without the ~33M-iter pass. A
    // failed load degrades to the floor instead of an unhandled rejection.
    const pending = upgrade(cache.acquire({ preset: "neutral", tier }));
    return { probe: cache.neutral(tier), pending, resolution, pmremMode };
  }
  const floor = cache.neutral(tier);
  if (typeof request === "object" && "capture" in request) {
    const req = options.captureRequest;
    if (!req || isEnvironmentProbeFactoryPending(factory)) return { probe: floor, pending: null, resolution, pmremMode };
    return { probe: factory.fromScene(req, { faceSize: Math.max(128, req.resolution ?? 128) as 128 | 256 | 512 | 1024 }), pending: null, resolution, pmremMode };
  }
  if (typeof request === "object" && "hdri" in request) {
    return { probe: floor, pending: upgrade(cache.acquire({ url: request.hdri, tier })), resolution, pmremMode };
  }
  if (typeof request === "object" && "preset" in request) {
    return { probe: floor, pending: upgrade(cache.acquire({ preset: request.preset, tier })), resolution, pmremMode };
  }
  // spaceBake and any future request kinds: neutral floor, no upgrade.
  return { probe: floor, pending: null, resolution, pmremMode };
}

/**
 * Registers the lane's two C-09 sources (idempotent):
 *  - `prd02.explicit` (400): an authored `environments.*`/`environment` node
 *    supplies the probe request; ambient stays additive.
 *  - `prd02.neutral-room` (0): no explicit source resolved → the
 *    code-generated RoomEnvironment probe, still additive-ambient.
 * The legacy category/ambient branches in createProductionRuntimeEnvironment
 * are untouched — they only run under the flag-off "legacy" source.
 */
export function registerPrd02EnvironmentSources(): void {
  if (prd02SourcesState.registered) return;
  prd02SourcesState.registered = true;
  registerEnvironmentSource({
    id: "prd02.explicit",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    priority: 400,
    resolve(snapshot) {
      const node = groups.flatten(snapshot.nodes).find(
        (n): n is AuraEnvironmentNode => n.kind === "environment"
      ) as AuraEnvironmentNodeV2 | undefined;
      if (!node) return undefined;
      return explicitEnvironmentResolution(node, prd02AmbientTerm(snapshot));
    }
  });
  registerEnvironmentSource({
    id: "prd02.neutral-room",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    priority: 0,
    resolve(snapshot) {
      // Same rule as the compiler-off bridge (createProductionRuntimeEnvironment
      // marks only light-less scenes as neutral-room fallbacks): a scene with
      // authored lights and no environment gets no implicit IBL, as in three.js.
      // Resolving the room under authored lights over-lit every promote scene
      // (L4 promote 38212153613: mean LPIPS vs three 0.043 -> 0.259, 19/19
      // regressed; 11-multiple-lights 0.002 -> 0.330).
      if (groups.flatten(snapshot.nodes).some((node) => node.kind === "light")) return undefined;
      return {
        kind: "neutral-room",
        probe: "neutral",
        intensity: 1,
        diffuseIntensity: 1,
        specularIntensity: 1,
        rotation: 0,
        background: false,
        ambient: prd02AmbientTerm(snapshot, { includeHemisphere: true })
      };
    }
  });
}
