/**
 * T0-26 — real consumer for the PRD-02 shadow system (flag A3D_QR_LIGHTING).
 *
 * The `a3d_prd02_shadow_lookup` chunk has no forward program yet (it arrives
 * with the C-02 generator path), so binding `u_prd02*` uniforms alone produced
 * no visible shadow while the flag path also disabled the legacy shadow map.
 * Until then this bridge renders the prd02 sun cascades (stable-fit CSM from
 * `Prd02ShadowSystem`) and hands them to the legacy forward shader as
 * `ForwardShadowMapOptions` (`u_shadowMapTexture` + per-cascade light
 * matrices). Cascades are allocated only when a forward consumer exists:
 *   - a material declaring the lookup chunk (`u_prd02CascadeCompare0`) → the
 *     `prd02.shadows` contributor renders and binds (no bridge);
 *   - otherwise shadow-receiving forward items → the bridge renders here.
 *
 * Inputs come from the compiled RenderSource: `source.shadow.prd02Shadows`
 * (compiler/shadows.ts) for the config and `source.collectedLights` for the
 * sun, falling back to the scene graph only when the source carries neither.
 * Flag off never reaches this module (ShadowOrchestration legacy path).
 */

import type { Camera } from "@aura3d/scene";
import type { ForwardShadowMapOptions } from "../ForwardPass";
import type { CollectedLight } from "../LightCollector";
import type { RenderDevice } from "../RenderDevice";
import { Sampler } from "../Sampler";
import { createShadowFilterKernel } from "../ShadowMap";
import { isShadowPcfTapTier } from "./ShadowFilterTier";
import { TextureBinding } from "../TextureBinding";
import type { QrFlags } from "../contracts/core";
import type { AuraQualityTierSettings } from "../contracts/quality";
import { QUALITY_TIERS } from "../contracts/quality";
import type { RenderItem } from "../contracts/renderItem";
import type { RenderSource } from "../contracts/renderSource";
import { prd02SubFlagOff, readPrd02KillSwitches, SUB_FLAG_CSM } from "../passes/Prd02SubFlags";
import { sceneFromSource } from "../renderer/RenderShared";
import { Prd02ShadowSystem, type Prd02ShadowFrameUniforms, type ShadowSystemConfigInput } from "./ShadowSystem";
import { clipRangeFromViewProjection } from "./DirectionalCascadeFitter";

/** Uniform the `a3d_prd02_shadow_lookup` chunk declares (C-11); marks a lookup consumer. */
export const PRD02_SHADOW_LOOKUP_UNIFORM = "u_prd02CascadeCompare0";

const DEFAULT_NORMAL_BIAS_TEXELS = 1.5;
/** Constant depth bias for the legacy compare when the prd02 config says auto (0). */
const BRIDGE_AUTO_DEPTH_BIAS = 0.001;
// The receiver normal offset (C-11 normalBias) carries most of the acne
// protection, as three's shadow.normalBias does; a 1.5 slope term on top of it
// over-biased grazing receivers and dropped self-shadowing (prd02-15 S3).
const BRIDGE_SLOPE_BIAS = 0.5;

type SourceLike = RenderSource | Iterable<RenderItem> | unknown;

interface Prd02ShadowsConfigLike {
  readonly enabled?: boolean;
  readonly mapSize?: number;
  readonly cascades?: number;
  readonly maxDistance?: number;
  readonly splitLambda?: number;
  readonly filter?: string;
  readonly strength?: number;
  readonly bias?: number;
  readonly normalBias?: number;
  readonly pcfTapTier?: number;
}

interface ShadowOptionsLike {
  readonly enabled?: boolean;
  readonly size?: number;
  readonly cascadeCount?: number;
  readonly cascadeLambda?: number;
  readonly filter?: string;
  readonly strength?: number;
  readonly bias?: number;
  readonly prd02Shadows?: Prd02ShadowsConfigLike;
}

function shadowOptionsOf(source: SourceLike): ShadowOptionsLike | undefined {
  if (!source || typeof source !== "object" || Symbol.iterator in (source as object)) return undefined;
  const shadow = (source as { shadow?: unknown }).shadow;
  if (shadow === true) return {};
  return shadow && typeof shadow === "object" ? (shadow as ShadowOptionsLike) : undefined;
}

function clampCascades(value: number): 1 | 2 | 3 | 4 {
  return Math.min(4, Math.max(1, Math.round(value))) as 1 | 2 | 3 | 4;
}

/**
 * PRD-02 §6.4 config: the compiler's `prd02Shadows` when present (T0-26),
 * else the legacy RendererShadowOptions mapped onto the tier defaults.
 */
export function prd02ShadowConfig(
  source: SourceLike,
  flags: QrFlags,
  tier: AuraQualityTierSettings,
  cameraFar: number | undefined
): ShadowSystemConfigInput {
  const options = shadowOptionsOf(source);
  const compiled = options?.prd02Shadows;
  const kill = readPrd02KillSwitches(source);
  const csmOn = kill.csm && !prd02SubFlagOff(flags, SUB_FLAG_CSM);
  const requestedFilter = compiled?.filter ?? (options?.filter === "none" ? "hard" : "pcf");
  // `shadowFilter=legacy-grid` keeps the unfiltered single tap (§6.5); every
  // soft filter maps to the filtered compare pipeline.
  const filter: ShadowSystemConfigInput["filter"] =
    kill.shadowFilter === "legacy-grid" || requestedFilter === "hard" ? "hard"
      : requestedFilter === "pcss" ? "pcss" : "pcf";
  const cascades = clampCascades(compiled?.cascades ?? options?.cascadeCount ?? tier.shadow.cascades);
  const far = cameraFar ?? 200;
  return {
    enabled: (compiled?.enabled ?? true) && options?.enabled !== false,
    mapSize: compiled?.mapSize ?? options?.size ?? tier.shadow.mapSize,
    cascades: csmOn ? cascades : 1,
    maxDistance: compiled?.maxDistance !== undefined ? Math.min(far, compiled.maxDistance) : far,
    splitLambda: compiled?.splitLambda ?? options?.cascadeLambda ?? 0.6,
    filter,
    strength: compiled?.strength ?? options?.strength ?? 1,
    bias: compiled?.bias ?? options?.bias ?? 0,
    normalBias: compiled?.normalBias ?? DEFAULT_NORMAL_BIAS_TEXELS,
    ...(isShadowPcfTapTier(compiled?.pcfTapTier) ? { pcfTapTier: compiled.pcfTapTier } : {})
  };
}

/** Normalized direction of the first visible shadow-casting sun. */
export function prd02SunDirection(source: SourceLike): readonly [number, number, number] | null {
  const collected = source && typeof source === "object" && !(Symbol.iterator in (source as object))
    ? (source as { collectedLights?: Iterable<CollectedLight> }).collectedLights
    : undefined;
  let direction: readonly [number, number, number] | null = null;
  if (collected !== undefined) {
    for (const light of collected) {
      if (light.kind !== "directional" || !light.castsShadow) continue;
      if (light.source && light.source.visible === false) continue;
      direction = light.direction;
      break;
    }
  } else {
    const scene = sceneFromSource(source as RenderSource);
    const sun = scene?.collectLights().find(
      (light) => light.visible && light.castsShadow && light.kind === "directional"
    ) as { getDirection?: () => readonly [number, number, number] } | undefined;
    direction = sun?.getDirection?.() ?? null;
  }
  if (!direction) return null;
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (!Number.isFinite(length) || length === 0) return null;
  return [direction[0] / length, direction[1] / length, direction[2] / length];
}

function baseMaterialOf(item: RenderItem): { readonly requiredUniforms?: readonly string[] } | undefined {
  const material = item.material as { baseMaterial?: unknown; requiredUniforms?: readonly string[] } | undefined;
  if (!material) return undefined;
  return (material.baseMaterial ?? material) as { readonly requiredUniforms?: readonly string[] };
}

/** True when a forward program samples the prd02 lookup chunk (C-02 generator path). */
export function prd02LookupConsumerExists(items: readonly RenderItem[]): boolean {
  return items.some((item) => baseMaterialOf(item)?.requiredUniforms?.includes(PRD02_SHADOW_LOOKUP_UNIFORM) === true);
}

/**
 * One `Prd02ShadowSystem` per device, shared by the bridge and the contributor;
 * recreated when the resolved config changes (map size / cascades / filter).
 */
const shadowSystems = new WeakMap<RenderDevice, { config: ShadowSystemConfigInput; system: Prd02ShadowSystem }>();

export function shadowSystemForDevice(device: RenderDevice, config: ShadowSystemConfigInput): Prd02ShadowSystem {
  const existing = shadowSystems.get(device);
  if (existing && JSON.stringify(existing.config) === JSON.stringify(config)) return existing.system;
  existing?.system.dispose();
  const system = new Prd02ShadowSystem(device, config);
  shadowSystems.set(device, { config, system });
  return system;
}

/** A frame the bridge already rendered; the contributor publishes it instead of re-rendering. */
export interface Prd02BridgedShadowFrame {
  readonly uniforms: Prd02ShadowFrameUniforms;
  readonly config: ShadowSystemConfigInput;
  readonly system: Prd02ShadowSystem;
}

const bridgedFrames = new WeakMap<RenderDevice, Prd02BridgedShadowFrame>();
/** Last bridge outcome per device ("rendered" or the bail-out reason) — lane-page GPU evidence. */
const bridgeReasons = new WeakMap<RenderDevice, string>();

/** Device the bridge last ran on (lane pages cannot always reach the renderer). */
let lastBridgeDevice: RenderDevice | null = null;

/** The device the bridge last ran on (lane-page GPU evidence probes). */
export function prd02LastBridgeDevice(): RenderDevice | null {
  return lastBridgeDevice;
}

/** Last bridge outcome for `device` (default: the last bridged device): "rendered", a bail-out reason, or "never-ran". */
export function prd02ShadowBridgeReason(device: RenderDevice | null = lastBridgeDevice): string {
  return device ? bridgeReasons.get(device) ?? "never-ran" : "never-ran";
}

/**
 * GPU evidence probe for the lane page: cascade depth statistics of the
 * bridge's shadow system on `device` (empty before the bridge first runs).
 */
export function prd02ShadowDepthProbe(device: RenderDevice | null = lastBridgeDevice): ReturnType<Prd02ShadowSystem["readCascadeDepthStats"]> {
  return device ? shadowSystems.get(device)?.system.readCascadeDepthStats() ?? [] : [];
}



/** Consume (and clear) the bridged frame for `device`, if the bridge ran this frame. */
export function takePrd02BridgedShadowFrame(device: RenderDevice): Prd02BridgedShadowFrame | null {
  const frame = bridgedFrames.get(device) ?? null;
  bridgedFrames.delete(device);
  return frame;
}

/**
 * The renderer hands `executeRendererShadowMap` only a concrete `Camera`;
 * compiled sources render through a structural CameraLike and frame items
 * reach the shadow step pre-filtered to casters. The `prd02.shadows`
 * contributor's collect phase (which runs first, with the C-01 frame context)
 * records the frame camera and whether ANY frame item — casters or not —
 * declares the lookup chunk.
 */
interface Prd02FrameObservation {
  readonly camera: { readonly viewProjectionMatrix: Float32Array | readonly number[]; readonly near?: number; readonly far?: number } | null;
  readonly lookupConsumer: boolean;
}

const frameObservations = new WeakMap<RenderDevice, Prd02FrameObservation>();

export function recordPrd02FrameObservation(device: RenderDevice, observation: Prd02FrameObservation): void {
  frameObservations.set(device, observation);
}

function takeFrameObservation(device: RenderDevice): Prd02FrameObservation | undefined {
  const observation = frameObservations.get(device);
  frameObservations.delete(device);
  return observation;
}

const NEAREST_CLAMP = new Sampler({
  minFilter: "nearest",
  magFilter: "nearest",
  addressU: "clamp-to-edge",
  addressV: "clamp-to-edge"
});

export interface Prd02BridgeInput {
  readonly device: RenderDevice;
  readonly source: SourceLike;
  /** Shadow casters (items with `castShadow !== false`). */
  readonly items: readonly RenderItem[];
  readonly camera: Camera | undefined;
  /**
   * #1141: the renderer's resolved frame camera (VP + eye). Production-runtime
   * frames render through a structural CameraLike, so `camera` is undefined
   * and the contributor observation may be absent; without this the bridge
   * skipped and the flag path rendered no sun shadow map at all.
   */
  readonly frameCamera?: Prd02BridgeFrameCamera;
  /**
   * Every visible item of the frame. With `device.skipUnusedShadowCascades` (set for `quality: "auto"` and `"cinematic"`, never `"production"`)
   * a cascade that none of them can select is not redrawn.
   */
  readonly receivers?: readonly RenderItem[];
  readonly flags: QrFlags;
  readonly tier?: AuraQualityTierSettings;
}

/** Structural frame camera handed to the bridge by the renderer (#1141). */
export interface Prd02BridgeFrameCamera {
  readonly viewProjectionMatrix: Float32Array | readonly number[];
  readonly near?: number;
  readonly far?: number;
  /** World-space eye, when the renderer knows it (lets the bridge skip cascades no receiver selects). */
  readonly eye?: readonly [number, number, number];
}

/**
 * Renderer VP + eye → bridge camera, recovering near/far from the matrix
 * (the cascade fitter lerps the VP's frustum corners by view distance).
 */
export function shadowFrameCamera(
  viewProjection: Float32Array | readonly number[] | undefined,
  eye: readonly [number, number, number] | undefined
): Prd02BridgeFrameCamera | undefined {
  if (!viewProjection || viewProjection.length < 16) return undefined;
  const range = eye ? clipRangeFromViewProjection(viewProjection, eye) : null;
  const withEye = eye ? { eye } : {};
  return range ? { viewProjectionMatrix: viewProjection, near: range.near, far: range.far, ...withEye } : { viewProjectionMatrix: viewProjection, ...withEye };
}

/**
 * Renders the prd02 sun cascades now and returns them as legacy
 * `ForwardShadowMapOptions` (T0-26 bridge). Returns undefined — and allocates
 * nothing — when shadows are off/killed, a lookup-chunk consumer exists (the
 * contributor owns that path), or there is no sun, caster, camera or depth
 * texture support.
 */
export function executePrd02BridgedShadowMap(input: Prd02BridgeInput): ForwardShadowMapOptions | undefined {
  bridgedFrames.delete(input.device);
  const observed = takeFrameObservation(input.device);
  lastBridgeDevice = input.device;
  const bail = (reason: string): undefined => {
    bridgeReasons.set(input.device, reason);
    return undefined;
  };
  if (!readPrd02KillSwitches(input.source).shadows) return bail("kill-switch");
  if (input.items.length === 0) return bail("no-caster-items");
  if (observed?.lookupConsumer === true || prd02LookupConsumerExists(input.items)) return bail("lookup-consumer");
  const capabilities = input.device.info.capabilities;
  if (!capabilities?.includes("render-targets") || !capabilities.includes("depth-textures")) return bail("capabilities");
  const concrete = input.camera as (Camera & { near?: number; far?: number }) | undefined;
  const camera = concrete?.viewProjectionMatrix ? concrete : observed?.camera ?? input.frameCamera;
  if (!camera?.viewProjectionMatrix) return bail("no-camera");
  const sun = prd02SunDirection(input.source);
  if (!sun) return bail("no-sun");
  const tier = input.tier ?? QUALITY_TIERS.high;
  const config = prd02ShadowConfig(input.source, input.flags, tier, camera.far);
  if (!config.enabled) return bail("config-disabled");
  bridgeReasons.set(input.device, "rendered");
  const system = shadowSystemForDevice(input.device, config);
  const near = camera.near ?? 0.1;
  // Only the legacy per-item cascade selection is known to skip safely: a receiver on the lookup chunk picks per fragment.
  const eye = input.frameCamera?.eye;
  const cascadeUse = (input.device as { skipUnusedShadowCascades?: boolean }).skipUnusedShadowCascades === true
    && eye !== undefined && input.receivers !== undefined && !prd02LookupConsumerExists(input.receivers)
    ? { receivers: input.receivers, eye }
    : undefined;
  // The fitter lerps between the VP's near/far corners, so it gets the
  // camera's real clip range; `config.maxDistance` caps the cascade splits.
  const uniforms = system.update({
    camera: { viewProjectionMatrix: camera.viewProjectionMatrix, near, far: camera.far ?? 200 },
    sun: { direction: sun },
    casters: input.items,
    // Local (spot/point) prd02 tiles need the lookup chunk; the bridge is sun-only.
    localLights: [],
    flags: input.flags,
    tier,
    ...(cascadeUse ? { cascadeUse } : {})
  });
  const fits = system.cascadeFits();
  const maps = fits.map((fit) => {
    const texture = uniforms.cascadeTextures[fit.index] ?? null;
    return texture ? { fit, map: bridgeShadowMap(texture, fit.drawViewProjection, config, fit.texelWorld) } : null;
  });
  if (maps.length === 0 || maps.some((entry) => entry === null)) return bail(maps.length === 0 ? "no-cascade-fits" : "missing-cascade-texture");
  bridgedFrames.set(input.device, { uniforms, config, system });
  const resolved = maps as { fit: (typeof fits)[number]; map: Omit<ForwardShadowMapOptions, "cascades"> }[];
  const first = resolved[0]!.map;
  if (resolved.length === 1) return first;
  let previousFar = 0;
  return {
    ...first,
    cascades: resolved.map(({ fit, map }) => {
      const cascade = { index: fit.index, near: previousFar, far: fit.splitFar, shadowMap: map };
      previousFar = fit.splitFar;
      return cascade;
    })
  };
}

function bridgeShadowMap(
  texture: NonNullable<Prd02ShadowFrameUniforms["cascadeTexture"]>,
  lightMatrix: Float32Array,
  config: ShadowSystemConfigInput,
  texelWorld: number
): Omit<ForwardShadowMapOptions, "cascades"> {
  const texel = 1 / Math.max(1, config.mapSize);
  return {
    // Unbiased draw VP: the legacy shader maps NDC → [0,1] itself.
    texture: new TextureBinding({ name: "u_shadowMapTexture", texture, sampler: NEAREST_CLAMP, required: true }),
    lightMatrix,
    strength: config.strength,
    bias: config.bias > 0 ? config.bias : BRIDGE_AUTO_DEPTH_BIAS,
    slopeBias: BRIDGE_SLOPE_BIAS,
    // C-11: `normalBias` is in shadow texels (1.5 × texel world size).
    normalBias: Math.max(0, config.normalBias) * texelWorld,
    texelSize: [texel, texel],
    filterKernel: config.filter === "hard"
      ? createShadowFilterKernel({ filter: "none" })
      : createShadowFilterKernel({ filter: "pcf", pcfRadius: 1, pcfSamples: 9 }),
    ...(config.pcfTapTier === undefined ? {} : { pcfTapTier: config.pcfTapTier })
  };
}
