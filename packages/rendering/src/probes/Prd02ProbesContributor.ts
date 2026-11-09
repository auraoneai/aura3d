// PRD-02 §6.6 — `prd02.probes` frame contributor (phase `shadows`, flag
// `A3D_QR_LIGHTING`, sub-flag `A3D_QR_LIGHTING_PROBES`). Drives
// ReflectionProbeSystem captures and IrradianceVolume bakes from probe nodes
// compiled into the RenderSource (`prd02.probes.<name>` contributions), then
// publishes per-item probe assignments on the blackboard for the shading
// seam (`prd02.probeSelection`) plus `prd02.irradianceVolume`.
// The scene-side `renderFace` callback arrives through the blackboard —
// `prd02.probeRenderFace` (the frame host supplies the C-09 capture seam).

import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import { captureFrameContributor, matchesFrameContributor, type FrameContributorFingerprint, type FrameContributorContext, type FrameContributor } from "../contracts/frameGraph";
import type { RenderDevice, RenderTarget } from "../RenderDevice";
import type { RenderItem } from "../contracts/renderItem";
import type { RenderSource } from "../contracts/renderSource";
import { Sampler } from "../Sampler";
import { TextureBinding } from "../TextureBinding";
import {
  ReflectionProbeSystem, type ReflectionProbeSpec, type ProbeAssignment,
  type ReflectionFaceRenderer
} from "./ReflectionProbeSystem";
import { IrradianceVolumeSystem, type IrradianceVolume, type IrradianceVolumeSpec } from "./IrradianceVolume";
import { PRD02_ITEM_IRRADIANCE_BINDINGS, PRD02_ITEM_PROBE_BINDINGS, prd02ProbeBindings,
  type Prd02ItemIrradianceBindings, type Prd02ItemProbeBindings } from "./ProbeBoxProjection";
import { prd02SubFlagOff, readPrd02KillSwitches, SUB_FLAG_PROBES } from "../passes/Prd02SubFlags";
import { probeSourceOwner, setProbeSourceOwner } from "./ProbeSourceOwner";

export { PRD02_LOCAL_PROBE_FEATURE, PRD02_IRRADIANCE_VOLUME_FEATURE, prd02ItemProbeBindings, prd02ItemIrradianceBindings,
  type Prd02ItemProbeBindings, type Prd02ItemIrradianceBindings } from "./ProbeBoxProjection";

export const PROBES_SUB_FLAG = "A3D_QR_LIGHTING_PROBES";
export const PROBE_SELECTION_BLACKBOARD_KEY = "prd02.probeSelection";
export const IRRADIANCE_VOLUME_BLACKBOARD_KEY = "prd02.irradianceVolume";
/** All currently captured volumes, in authored source order. */
export const IRRADIANCE_VOLUMES_BLACKBOARD_KEY = "prd02.irradianceVolumes";
export const PROBE_RENDER_FACE_KEY = "prd02.probeRenderFace";
/** PRD-03 SSR seam (§6.6 hand-off): dominant specular env for the frame. */
export const ENV_SPECULAR_BLACKBOARD_KEY = "prd02.envSpecular";
/** PRD-03 SSR seam: roughness → probe mip LOD. */
export const ROUGHNESS_TO_LOD_BLACKBOARD_KEY = "prd02.roughnessToLod";
/**
 * 02-S12: per-item `a3d_prd02_probe_box` uniforms (Map<RenderItem, bindings>)
 * for the forward consumer — lane 01's per-item env override reads this.
 */
export const PROBE_BINDINGS_BLACKBOARD_KEY = "prd02.probeBindings";
/** Generated-program feature bit used by forward consumers for a local probe draw. */
interface ProbesState {
  reflections: ReflectionProbeSystem;
  reflectionNames: Set<string>;
  irradiance: Map<string, IrradianceVolumeSystem>;
  renderer: { current: ReflectionFaceRenderer };
  nextIrradiance: number;
  capturedPreFrame: boolean;
  /** Identities of the environment the captures light the scene with (see `captureEnvironmentKey`). */
  environmentKey: readonly unknown[] | null;
}

const systems = new WeakMap<RenderDevice, Map<object, ProbesState>>();
const activeOwners = new WeakMap<RenderDevice, object>();
const deviceFrameTails = new WeakMap<RenderDevice, Promise<void>>();
let pendingRenderer: ReflectionFaceRenderer | null = null;

interface PendingProbeUpdates {
  readonly probes: Map<string, number>;
  readonly irradiance: Map<string, number>;
  allIrradiance: number | null;
  sequence: number;
}

// Requests are scoped to an app's runtime-node registry, never to a global
// active scene. A device can be used as the owner by direct renderer clients.
const pendingUpdates = new WeakMap<object, PendingProbeUpdates>();

/** Queue a recapture until the named node is registered and successfully updated. */
export function queuePrd02ProbeUpdate(owner: object, kind: "probe" | "irradiance", name?: string): void {
  if (!owner || (typeof owner !== "object" && typeof owner !== "function")) throw new TypeError("probe update owner must be an object");
  if (kind !== "probe" && kind !== "irradiance") throw new RangeError("unknown probe update kind");
  if (name !== undefined && (typeof name !== "string" || !name.trim())) throw new RangeError("probe update name must be nonempty");
  if (kind === "probe" && name === undefined) throw new RangeError("probe update requires a name");
  let queue = pendingUpdates.get(owner);
  if (!queue) {
    queue = { probes: new Map(), irradiance: new Map(), allIrradiance: null, sequence: 0 };
    pendingUpdates.set(owner, queue);
  }
  const sequence = ++queue.sequence;
  if (kind === "probe") queue.probes.set(name!, sequence);
  else if (name === undefined) queue.allIrradiance = sequence;
  else queue.irradiance.set(name, sequence);
}

/**
 * Serialize async capture and its following frame on a shared device. The host
 * must keep the actual render submission inside `action`, not just capture.
 */
export async function withPrd02ProbeFrameLock<T>(device: RenderDevice, action: () => Promise<T>): Promise<T> {
  const previous = deviceFrameTails.get(device) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>((resolve) => { release = resolve; });
  deviceFrameTails.set(device, tail);
  await previous;
  try {
    return await action();
  } finally {
    if (deviceFrameTails.get(device) === tail) deviceFrameTails.delete(device);
    release();
  }
}

/** The frame host (production runtime) installs the scene's face renderer —
 *  the same closure C-09 `EnvironmentCaptureRequest.renderFace` delegates to. */
export function installPrd02ProbeRenderer(fn: ReflectionFaceRenderer | null): void {
  pendingRenderer = fn;
  if (!fn) systemsResetAll();
}

function systemsResetAll(): void { /* WeakMap entries go stale naturally */ }

function stateAt(device: RenderDevice, owner: object = activeOwners.get(device) ?? device): ProbesState | undefined {
  return systems.get(device)?.get(owner);
}

function stateFor(device: RenderDevice, owner: object, renderer: ReflectionFaceRenderer): ProbesState {
  let byOwner = systems.get(device);
  if (!byOwner) { byOwner = new Map(); systems.set(device, byOwner); }
  let state = byOwner.get(owner);
  if (!state) {
    const slot = { current: renderer };
    state = {
      reflections: new ReflectionProbeSystem(device, (...args) => slot.current(...args)),
      reflectionNames: new Set(),
      irradiance: new Map(),
      renderer: slot,
      nextIrradiance: 0,
      capturedPreFrame: false,
      environmentKey: null
    };
    byOwner.set(owner, state);
  } else {
    state.renderer.current = renderer;
  }
  return state;
}

/** Release capture resources belonging to a disposed renderer. */
export function disposePrd02Probes(device: RenderDevice, owner?: object): void {
  const byOwner = systems.get(device);
  if (!byOwner) return;
  const owners = owner === undefined ? [...byOwner.keys()] : [owner];
  for (const key of owners) {
    const state = byOwner.get(key);
    if (!state) continue;
    state.reflections.dispose();
    for (const volume of state.irradiance.values()) volume.dispose();
    byOwner.delete(key);
    captureSources.get(device)?.delete(key);
  }
  if (byOwner.size === 0) {
    systems.delete(device);
    captureSources.delete(device);
    activeOwners.delete(device);
  } else if (owner === undefined || activeOwners.get(device) === owner) {
    activeOwners.set(device, byOwner.keys().next().value!);
  }
  if (owner === undefined || owner === device) pendingUpdates.delete(device);
}

/**
 * The scene the captures render changed (for example a new atmosphere snapshot). Completed captures stay published:
 * `update: "once"` probes and volumes capture once and re-capture only on explicit invalidation
 * (`queuePrd02ProbeUpdate` / `app.lighting.updateProbe`). Only captures in progress across frames (time-sliced
 * `everyNFrames` cubes, cell-budgeted irradiance bakes) restart, so no capture mixes two scene states.
 */
export function restartPrd02PartialProbeCaptures(device: RenderDevice, owner: object): void {
  const state = systems.get(device)?.get(owner);
  if (!state) return;
  state.reflections.restartPartialCaptures();
  for (const volume of state.irradiance.values()) volume.restartPartialCapture();
}

/** Captures currently owned by this device; callers do not own their textures. */
export function prd02IrradianceVolumes(device: RenderDevice, owner?: object): readonly IrradianceVolume[] {
  const state = stateAt(device, owner);
  return state ? [...state.irradiance.values()].flatMap((volume) => {
    const current = volume.get();
    return current ? [current] : [];
  }) : [];
}

interface AuraProbeNodeLike {
  readonly kind: "probe";
  readonly probe: "reflection" | "irradiance-volume";
  readonly name: string;
  readonly options: Record<string, unknown>;
}

/** Probe nodes compiled by the lane's C-36 handler land on the source as
 *  `prd02.probes.<name>`. */
export function probeNodesFromSource(ctx: Pick<FrameContributorContext, "source">): readonly AuraProbeNodeLike[] {
  const source = ctx.source as unknown as Record<string, unknown>;
  const out: AuraProbeNodeLike[] = [];
  for (const key of Object.keys(source)) {
    if (!key.startsWith("prd02.probes.")) continue;
    const node = source[key];
    if (node && typeof node === "object" && (node as { kind?: string }).kind === "probe") {
      out.push(node as AuraProbeNodeLike);
    }
  }
  return out;
}

function specFromNode(node: AuraProbeNodeLike): ReflectionProbeSpec | null {
  const o = node.options;
  const rawPosition = o.position ?? [0, 0, 0];
  if (!Array.isArray(rawPosition) || rawPosition.length !== 3 || !rawPosition.every(Number.isFinite)) throw new RangeError("reflection probe position must contain three finite values");
  const position: [number, number, number] = [rawPosition[0], rawPosition[1], rawPosition[2]];
  const rawBox = o.box as { readonly min?: unknown; readonly max?: unknown } | undefined;
  let box: ReflectionProbeSpec["box"];
  let half = (o.boxHalfExtents ?? o.extent ?? [2, 2, 2]) as readonly [number, number, number];
  if (rawBox !== undefined) {
    if (!rawBox || typeof rawBox !== "object" || !Array.isArray(rawBox.min) || !Array.isArray(rawBox.max)) {
      throw new RangeError("reflection probe box must contain finite bounds with positive extents");
    }
    const min = rawBox.min, max = rawBox.max;
    if (min.length !== 3 || max.length !== 3 || min.some((v, i) =>
      !Number.isFinite(v) || !Number.isFinite(max[i]) || max[i] <= v || !Number.isFinite(max[i] - v))) {
      throw new RangeError("reflection probe box must contain finite bounds with positive extents");
    }
    box = { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] };
    half = [(box.max[0] - box.min[0]) / 2, (box.max[1] - box.min[1]) / 2, (box.max[2] - box.min[2]) / 2];
  }
  const rawUpdate = o.update ?? "once";
  const periodic = rawUpdate && typeof rawUpdate === "object" && "everyNFrames" in rawUpdate
    ? (rawUpdate as { readonly everyNFrames: number }).everyNFrames : undefined;
  const update = periodic !== undefined ? "every-n-frames" : rawUpdate;
  if (update !== "once" && update !== "on-demand" && update !== "every-n-frames") throw new RangeError("unsupported reflection probe update mode");
  const resolution = o.resolution ?? 128;
  if (resolution !== 64 && resolution !== 128 && resolution !== 256) throw new RangeError("reflection probe resolution must be 64, 128 or 256");
  return {
    name: node.name,
    position,
    boxHalfExtents: half,
    ...(box ? { box } : {}),
    ...(!box && o.boxHalfExtents === undefined && o.extent === undefined ? { infinite: true } : {}),
    blendDistance: typeof o.blendDistance === "number" ? o.blendDistance : 1,
    ...(typeof o.priority === "number" ? { priority: o.priority } : {}),
    ...(typeof o.intensity === "number" ? { intensity: o.intensity } : {}),
    update,
    resolution,
    ...(periodic !== undefined ? { everyNFrames: periodic } : {}),
    ...(typeof o.near === "number" ? { near: o.near } : {}),
    ...(typeof o.far === "number" ? { far: o.far } : {})
  };
}

function irradianceSpecFromNode(node: AuraProbeNodeLike): IrradianceVolumeSpec {
  const o = node.options;
  const bounds = o.bounds;
  if (bounds !== undefined && (!bounds || typeof bounds !== "object")) throw new RangeError("irradiance volume bounds must contain min and max");
  const authored = bounds as { readonly min?: unknown; readonly max?: unknown } | undefined;
  const min = authored ? authored.min : o.min ?? [-2, -2, -2];
  const max = authored ? authored.max : o.max ?? [2, 2, 2];
  if (!Array.isArray(min) || !Array.isArray(max) || min.length !== 3 || max.length !== 3
    || min.some((n, axis) => !Number.isFinite(n) || !Number.isFinite(max[axis]) || max[axis] <= n || !Number.isFinite(max[axis] - n))) {
    throw new RangeError("irradiance volume bounds must contain finite min/max vectors with positive extents");
  }
  const res = Array.isArray(o.resolution) ? o.resolution : o.density;
  return {
    name: node.name,
    min: [min[0], min[1], min[2]],
    max: [max[0], max[1], max[2]],
    ...(Array.isArray(res) ? { resolution: res as [number, number, number] } : {}),
    ...(typeof o.intensity === "number" ? { intensity: o.intensity } : {}),
    ...(o.maxUpdatesPerFrame !== undefined ? { maxUpdatesPerFrame: o.maxUpdatesPerFrame as number } : {}),
    update: o.update === "on-demand" ? "on-demand" : "once"
  };
}

/** Lane-01 Renderer surface the pre-frame capture uses (#1115 `renderProbeFace`). */
export interface Prd02ProbeCaptureRenderer {
  readonly device: RenderDevice;
  renderProbeFace(source: RenderSource, face: 0 | 1 | 2 | 3 | 4 | 5, target: RenderTarget, viewProjection: Float32Array): unknown;
}

/** Source the capture renders (updated every frame before captures run). */
const captureSources = new WeakMap<RenderDevice, Map<object, { source: RenderSource | null }>>();

/**
 * 02-S12 pre-frame driver: call BEFORE `Renderer.render` (frame host hook,
 * #1113). Registers the source's reflection/irradiance probe nodes and
 * advances dirty captures through lane 01's `renderProbeFace`, which owns its
 * own device frame and private graph (so this must not run inside a frame).
 */
function prepareProbeFrame(renderer: Prd02ProbeCaptureRenderer, source: RenderSource, flags: FrameContributorContext["flags"], owner: object):
  { readonly state: ProbesState; readonly finishRequests: () => void } | null {
  if (!flags.on("A3D_QR_LIGHTING") || prd02SubFlagOff(flags, SUB_FLAG_PROBES) || !readPrd02KillSwitches(source).probes) return null;
  activeOwners.set(renderer.device, owner);
  setProbeSourceOwner(source as object, owner);
  const nodes = probeNodesFromSource({ source });
  if (nodes.length === 0) {
    const existing = stateAt(renderer.device, owner);
    if (existing) registerProbeNodes(existing, nodes, renderer.device);
    if (existing) existing.capturedPreFrame = false;
    return null;
  }
  let slots = captureSources.get(renderer.device);
  if (!slots) { slots = new Map(); captureSources.set(renderer.device, slots); }
  let slot = slots.get(owner);
  if (!slot) {
    slot = { source: null };
    slots.set(owner, slot);
  }
  slot.source = source;
  const holder = slot;
  const state = stateFor(renderer.device, owner, (face, target, viewProjection) => {
    if (holder.source) renderer.renderProbeFace(holder.source, face, target, viewProjection);
  });
  registerProbeNodes(state, nodes, renderer.device);
  trackCaptureEnvironment(state, source);
  const finishRequests = applyPendingUpdates(state, nodes, owner);
  return { state, finishRequests };
}

/**
 * The environment a capture lights the scene with, by identity: the bound C-09 probe and the legacy environment
 * textures. Identities, not values, so per-frame lighting objects rebuilt around the same textures do not count.
 */
function captureEnvironmentKey(source: RenderSource): readonly unknown[] {
  const s = source as RenderSource & { readonly environmentProbe?: unknown };
  const lighting = s.environmentLighting;
  if (lighting === false) return [false];
  return [s.environmentProbe ?? null, lighting?.environmentProbe ?? null, lighting?.environmentMapTexture?.texture ?? null,
    lighting?.environmentCubeMapTexture?.texture ?? null, lighting?.proceduralMap ? true : null];
}

/** `once` captures re-capture when their environment changes (an HDRI that loads after mount); see `ONCE_ENVIRONMENT_RECAPTURES`. */
function trackCaptureEnvironment(state: ProbesState, source: RenderSource): void {
  const key = captureEnvironmentKey(source);
  const previous = state.environmentKey;
  state.environmentKey = key;
  if (!previous || (previous.length === key.length && previous.every((value, i) => value === key[i]))) return;
  state.reflections.environmentChanged();
  for (const volume of state.irradiance.values()) volume.environmentChanged();
}

/** Sync capture is available for devices with synchronous readback. */
export function prd02BeforeFrame(renderer: Prd02ProbeCaptureRenderer, source: RenderSource, flags: FrameContributorContext["flags"], owner: object = renderer.device): readonly string[] {
  if (deviceFrameTails.has(renderer.device)) throw new Error("PROBE_ASYNC_FRAME_IN_PROGRESS: use asynchronous submission on this shared device");
  if (renderer.device.kind === "webgpu" && flags.on("A3D_QR_LIGHTING") && !prd02SubFlagOff(flags, SUB_FLAG_PROBES)
    && readPrd02KillSwitches(source).probes && probeNodesFromSource({ source }).length > 0) {
    throw new Error("WEBGPU_PROBE_CAPTURE_ASYNC_REQUIRED: configure frameMode as async for probe capture");
  }
  const prepared = prepareProbeFrame(renderer, source, flags, owner);
  if (!prepared) return [];
  const { state, finishRequests } = prepared;
  // Requests now live in the systems' dirty state; failed captures keep that
  // state and their partially captured jobs for the next frame.
  finishRequests();
  const changed = state.reflections.update(1);
  advanceIrradiance(state);
  state.capturedPreFrame = true;
  return changed;
}

/** Async capture uses device readback without blocking the render thread. */
export async function prd02BeforeFrameAsync(renderer: Prd02ProbeCaptureRenderer, source: RenderSource, flags: FrameContributorContext["flags"], owner: object = renderer.device): Promise<readonly string[]> {
  const prepared = prepareProbeFrame(renderer, source, flags, owner);
  if (!prepared) return [];
  const { state, finishRequests } = prepared;
  finishRequests();
  const changed = await state.reflections.updateAsync(1);
  if (stateAt(renderer.device, owner) !== state) return [];
  await advanceIrradianceAsync(state, renderer.device, owner);
  if (stateAt(renderer.device, owner) !== state) return [];
  state.capturedPreFrame = true;
  return changed;
}

function registerProbeNodes(state: ProbesState, nodes: readonly AuraProbeNodeLike[], device: RenderDevice): void {
  if (nodes.filter((node) => node.probe === "irradiance-volume").length > 8 || nodes.filter((node) => node.probe === "reflection").length > 8) {
    throw new RangeError("a scene supports at most 8 reflection probes and 8 irradiance volumes");
  }
  const reflectionNames = new Set<string>();
  const volumeNames = new Set<string>();
  for (const node of nodes) {
    if (node.probe === "reflection") {
      const spec = specFromNode(node);
      if (spec) {
        reflectionNames.add(node.name);
        state.reflections.register(spec);
      }
    } else if (node.probe === "irradiance-volume") {
      volumeNames.add(node.name);
      let volume = state.irradiance.get(node.name);
      if (!volume) {
        volume = new IrradianceVolumeSystem(device, (...args) => state.renderer.current(...args));
        state.irradiance.set(node.name, volume);
      }
      volume.configure(irradianceSpecFromNode(node));
    }
  }
  for (const name of state.reflectionNames) if (!reflectionNames.has(name)) state.reflections.unregister(name);
  state.reflectionNames = reflectionNames;
  for (const [name, volume] of state.irradiance) if (!volumeNames.has(name)) {
    volume.dispose();
    state.irradiance.delete(name);
  }
  // Reinsert in source order so the compatibility volume follows authored order.
  state.irradiance = new Map([...volumeNames].map((name) => [name, state.irradiance.get(name)!]));
}

/** Four cells (24 faces) total per frame, shared fairly among volumes. */
const IRRADIANCE_FRAME_CELL_BUDGET = 4;

function advanceIrradiance(state: ProbesState): void {
  const volumes = [...state.irradiance.values()];
  if (volumes.length === 0) return;
  const used = new Map<IrradianceVolumeSystem, number>();
  let remaining = IRRADIANCE_FRAME_CELL_BUDGET, idle = 0;
  while (remaining > 0 && idle < volumes.length) {
    const volume = volumes[state.nextIrradiance++ % volumes.length];
    const count = used.get(volume) ?? 0;
    if (count >= volume.maxUpdatesPerFrame) { idle += 1; continue; }
    const result = volume.step(1);
    used.set(volume, count + result.work);
    remaining -= result.work;
    idle = result.work ? 0 : idle + 1;
  }
}

async function advanceIrradianceAsync(state: ProbesState, device: RenderDevice, owner: object): Promise<void> {
  const volumes = [...state.irradiance.values()];
  if (volumes.length === 0) return;
  const used = new Map<IrradianceVolumeSystem, number>();
  let remaining = IRRADIANCE_FRAME_CELL_BUDGET, idle = 0;
  while (remaining > 0 && idle < volumes.length && stateAt(device, owner) === state) {
    const volume = volumes[state.nextIrradiance++ % volumes.length];
    const count = used.get(volume) ?? 0;
    if (count >= volume.maxUpdatesPerFrame) { idle += 1; continue; }
    const result = await volume.stepAsync(1);
    used.set(volume, count + result.work);
    remaining -= result.work;
    idle = result.work ? 0 : idle + 1;
  }
}

function applyPendingUpdates(state: ProbesState, nodes: readonly AuraProbeNodeLike[], owner: object): () => void {
  const queue = pendingUpdates.get(owner);
  if (!queue) return () => {};
  const processedProbes = new Map<string, number>();
  const processedIrradiance = new Map<string, number>();
  let processedAll: number | null = null;
  for (const node of nodes) {
    if (node.probe === "reflection" && queue.probes.has(node.name)) {
      state.reflections.updateProbe(node.name);
      processedProbes.set(node.name, queue.probes.get(node.name)!);
    } else if (node.probe === "irradiance-volume"
      && (queue.probes.has(node.name) || queue.irradiance.has(node.name) || queue.allIrradiance !== null)) {
      state.irradiance.get(node.name)?.updateProbe();
      if (queue.probes.has(node.name)) processedProbes.set(node.name, queue.probes.get(node.name)!);
      if (queue.irradiance.has(node.name)) processedIrradiance.set(node.name, queue.irradiance.get(node.name)!);
      if (queue.allIrradiance !== null) processedAll = queue.allIrradiance;
    }
  }
  // Once delivered, dirty state retains work across capture errors. Sequence
  // checks preserve a request queued again while this batch was being applied.
  return () => {
    for (const [name, sequence] of processedProbes) if (queue.probes.get(name) === sequence) queue.probes.delete(name);
    for (const [name, sequence] of processedIrradiance) if (queue.irradiance.get(name) === sequence) queue.irradiance.delete(name);
    if (processedAll !== null && queue.allIrradiance === processedAll) queue.allIrradiance = null;
    if (queue.probes.size === 0 && queue.irradiance.size === 0 && queue.allIrradiance === null) pendingUpdates.delete(owner);
  };
}

const PROBE_CUBE_SAMPLER = new Sampler({
  minFilter: "linear-mipmap-linear",
  magFilter: "linear",
  addressU: "clamp-to-edge",
  addressV: "clamp-to-edge"
});

const IRRADIANCE_SAMPLER = new Sampler({
  minFilter: "nearest",
  magFilter: "nearest",
  addressU: "clamp-to-edge",
  addressV: "clamp-to-edge",
  addressW: "clamp-to-edge"
});

function irradianceBindings(volume: IrradianceVolume, device: RenderDevice, owner: object): Prd02ItemIrradianceBindings {
  const { min, max, resolution, intensity } = volume.spec;
  const gpuMin = new Float32Array([...min, 0]);
  const gpuMax = new Float32Array([...max, 0]);
  const gpuGrid = new Float32Array([...resolution, intensity]);
  if (!Array.from(gpuGrid).every(Number.isFinite) || gpuGrid[3] < 0) {
    throw new RangeError("irradiance volume grid and intensity must be finite in GPU float32");
  }
  for (let axis = 0; axis < 3; axis += 1) {
    const extent = Math.fround(gpuMax[axis] - gpuMin[axis]);
    const cell = Math.fround(extent / gpuGrid[axis]);
    const halfCell = Math.fround(cell * 0.5);
    if (!Number.isFinite(gpuMin[axis]) || !Number.isFinite(gpuMax[axis])
      || !Number.isFinite(extent) || !Number.isFinite(cell) || halfCell < 2 ** -126
      || !Number.isFinite(Math.fround(gpuMin[axis] - halfCell))
      || !Number.isFinite(Math.fround(gpuMax[axis] + halfCell))) {
      throw new RangeError("irradiance volume bounds and cell widths must remain finite and positive in GPU float32");
    }
  }
  const texture = (name: string, index: number) => new TextureBinding({
    name, texture: volume.textures[index], sampler: IRRADIANCE_SAMPLER,
    required: true, expectedDimension: "2d-array", expectedColorSpace: "linear"
  });
  return { device, owner, volume, uniforms: {
    u_prd02IrradianceR: texture("u_prd02IrradianceR", 0),
    u_prd02IrradianceG: texture("u_prd02IrradianceG", 1),
    u_prd02IrradianceB: texture("u_prd02IrradianceB", 2),
    u_prd02IrradianceMin: gpuMin,
    u_prd02IrradianceMax: gpuMax,
    u_prd02IrradianceGrid: gpuGrid
  } };
}

/** Use the transformed geometry centre to choose one completed volume per draw. */
function nearestIrradianceVolume(item: RenderItem, volumes: readonly IrradianceVolume[]): IrradianceVolume | null {
  const bounds = item.geometry.bounds;
  let point: readonly number[] = item.boundingBoxCenter ?? (bounds
    ? [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2]
    : [0, 0, 0]);
  for (const matrix of [item.geometryMatrix, item.modelMatrix]) {
    if (!matrix || matrix.length < 16) continue;
    const [x, y, z] = point;
    point = [matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
      matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]];
  }
  let nearest: IrradianceVolume | null = null;
  let nearestDistance = Infinity;
  for (const volume of volumes) {
    const { min, max } = volume.spec;
    const distance = Math.hypot(...point.map((value, axis) => Math.max(min[axis] - value, value - max[axis], 0)));
    if (nearest === null || distance < nearestDistance) { nearest = volume; nearestDistance = distance; }
  }
  return nearest;
}

/** A render item can be reused by another app sharing the same device. */
function clearItemProbeBindings(item: RenderItem): RenderItem {
  const previous = (item as RenderItem & { readonly [PRD02_ITEM_PROBE_BINDINGS]?: Prd02ItemProbeBindings })[PRD02_ITEM_PROBE_BINDINGS];
  if (!previous && !(PRD02_ITEM_IRRADIANCE_BINDINGS in item)) return item;
  const clean: Record<PropertyKey, unknown> = { ...item };
  delete clean[PRD02_ITEM_PROBE_BINDINGS];
  delete clean[PRD02_ITEM_IRRADIANCE_BINDINGS];
  if (previous) {
    if (previous.originalEnvironmentCube) clean.environmentCube = previous.originalEnvironmentCube;
    else delete clean.environmentCube;
    if (previous.originalEnvironmentCubeMip !== undefined) clean.environmentCubeMip = previous.originalEnvironmentCubeMip;
    else delete clean.environmentCubeMip;
  }
  return clean as unknown as RenderItem;
}

/**
 * Collect phase: each item inside a captured probe's influence gets that
 * probe's specular cube as its per-draw `environmentCube` (lane 01 #1115
 * legacy override). The legacy shader binds one cube without parallax
 * correction, so the dominant probe wins; box projection + 2-probe blending
 * come with the `a3d_prd02_probe_box` chunk on the generator path.
 */
export function applyProbeEnvironmentCubes(items: readonly RenderItem[], device: RenderDevice, owner?: object): RenderItem[] {
  const cleanItems = items.map(clearItemProbeBindings);
  const state = stateAt(device, owner);
  if (!state) return cleanItems;
  const hasReflections = state.reflections.probes().length > 0;
  const volumes = prd02IrradianceVolumes(device, owner);
  if (!hasReflections && volumes.length === 0) return cleanItems;
  const scope = owner ?? activeOwners.get(device) ?? device;
  const volumeBindings = new Map<IrradianceVolume, Prd02ItemIrradianceBindings>();
  return cleanItems.map((item) => {
    let tagged: RenderItem & { [PRD02_ITEM_IRRADIANCE_BINDINGS]?: Prd02ItemIrradianceBindings } = item;
    const volume = nearestIrradianceVolume(item, volumes);
    if (volume) {
      let bindings = volumeBindings.get(volume);
      if (!bindings) { bindings = irradianceBindings(volume, device, scope); volumeBindings.set(volume, bindings); }
      tagged = { ...tagged, [PRD02_ITEM_IRRADIANCE_BINDINGS]: bindings };
    }
    if (!hasReflections) return tagged;
    const assignment = state.reflections.assign(item);
    const dominant = assignment.a;
    if (!dominant) return tagged;
    const raw = prd02ProbeBindings(assignment);
    const uniforms: Record<string, TextureBinding | Float32Array> = {};
    for (const [name, value] of Object.entries(raw)) {
      if (name === "u_prd02ProbeCubeA" || name === "u_prd02ProbeCubeB") {
        uniforms[name] = new TextureBinding({ name, texture: value && typeof value === "object" && "texture" in value ? value.texture as TextureBinding["texture"] : null,
          sampler: PROBE_CUBE_SAMPLER, required: false, expectedDimension: "cube" });
      } else if (value instanceof Float32Array) uniforms[name] = value;
    }
    const bindings: Prd02ItemProbeBindings = { device, owner: scope, assignment, uniforms,
      ...(item.environmentCube ? { originalEnvironmentCube: item.environmentCube } : {}),
      ...(item.environmentCubeMip !== undefined ? { originalEnvironmentCubeMip: item.environmentCubeMip } : {}) };
    const reflected = { ...tagged, [PRD02_ITEM_PROBE_BINDINGS]: bindings };
    if (dominant.weight < assignment.globalWeight) return reflected;
    return {
      ...reflected,
      environmentCube: new TextureBinding({
        name: "u_environmentCubeMapTexture",
        texture: dominant.probe.specularCube,
        required: false,
        sampler: PROBE_CUBE_SAMPLER
      }),
      environmentCubeMip: dominant.probe.mipCount
    };
  });
}

class Prd02ProbesRenderPass extends BaseRenderPass {
  constructor(private readonly ctx: FrameContributorContext) {
    super("prd02.probes", [], []);
  }

  execute(_context: RenderPassContext): void {
    const ctx = this.ctx;
    const owner = probeSourceOwner(ctx.source as object) ?? ctx.device;
    let state: ProbesState | undefined;
    const previous = stateAt(ctx.device, owner);
    if (previous?.capturedPreFrame) {
      // 02-S12: prd02BeforeFrame already captured outside the frame.
      previous.capturedPreFrame = false;
      state = previous;
    } else {
      const renderer = (ctx.blackboard.get(PROBE_RENDER_FACE_KEY) ?? pendingRenderer) as ReflectionFaceRenderer | null;
      if (!renderer) return;
      state = stateFor(ctx.device, owner, renderer);
      const nodes = probeNodesFromSource(ctx);
      registerProbeNodes(state, nodes, ctx.device);
      const finishRequests = applyPendingUpdates(state, nodes, owner);
      finishRequests();
      state.reflections.update(1);
      advanceIrradiance(state);
    }
    if (!state) return;
    const assignments = new Map<unknown, ProbeAssignment>();
    const bindings = new Map<unknown, ReturnType<typeof prd02ProbeBindings>>();
    for (const item of ctx.items) {
      const assignment = state.reflections.assign(item);
      assignments.set(item, assignment);
      if (assignment.a || assignment.b) bindings.set(item, prd02ProbeBindings(assignment));
    }
    ctx.blackboard.set(PROBE_SELECTION_BLACKBOARD_KEY, assignments);
    ctx.blackboard.set(PROBE_BINDINGS_BLACKBOARD_KEY, bindings);
    const volumes = prd02IrradianceVolumes(ctx.device, owner);
    ctx.blackboard.set(IRRADIANCE_VOLUMES_BLACKBOARD_KEY, volumes);
    if (volumes.length > 0) ctx.blackboard.set(IRRADIANCE_VOLUME_BLACKBOARD_KEY, volumes[0]);
    // §6.6 hand-off for PRD-03 SSR: the dominant captured env (first probe,
    // else null) + the roughness→LOD map against its mip chain.
    const dominant = state.reflections.probes()[0] ?? null;
    ctx.blackboard.set(ENV_SPECULAR_BLACKBOARD_KEY, dominant ? dominant.specularCube : null);
    const mips = dominant ? dominant.mipCount : 1;
    ctx.blackboard.set(ROUGHNESS_TO_LOD_BLACKBOARD_KEY,
        (roughness: number) => Math.min(Math.max(roughness, 0), 1) * (mips - 1));
  }
}

const selectiveContributors = new WeakMap<FrameContributor, FrameContributorFingerprint>();

export function isStockPrd02ProbesContributor(contributor: FrameContributor, device: RenderDevice): boolean {
  const fingerprint = selectiveContributors.get(contributor);
  // A cached probe system can retain a scene-owned face renderer and probe
  // objects from an earlier frame. Empty/default scenes have no such state.
  return !systems.has(device) && fingerprint !== undefined && matchesFrameContributor(contributor, fingerprint);
}

export function createPrd02ProbesContributor(): FrameContributor {
  const contributor: FrameContributor = {
    id: "prd02.probes",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    phases: ["collect", "shadows"],
    order: -1, // capture before the shadow pass consumes probe-relevant state
    collect: (items, ctx) =>
      !prd02SubFlagOff(ctx.flags, SUB_FLAG_PROBES) && readPrd02KillSwitches(ctx.source).probes
        ? applyProbeEnvironmentCubes(items, ctx.device, probeSourceOwner(ctx.source as object) ?? ctx.device)
        : items.map(clearItemProbeBindings),
    passes: (phase, ctx) =>
      phase === "shadows"
        && !prd02SubFlagOff(ctx.flags, SUB_FLAG_PROBES)
        && readPrd02KillSwitches(ctx.source).probes
        && probeNodesFromSource(ctx).length > 0
        ? [new Prd02ProbesRenderPass(ctx)]
        : []
  };
  selectiveContributors.set(contributor, captureFrameContributor(contributor));
  return contributor;
}
