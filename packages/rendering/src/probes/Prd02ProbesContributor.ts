// PRD-02 §6.6 — `prd02.probes` frame contributor (phase `shadows`, flag
// `A3D_QR_LIGHTING`, sub-flag `A3D_QR_LIGHTING_PROBES`). Drives
// ReflectionProbeSystem captures and IrradianceVolume bakes from probe nodes
// compiled into the RenderSource (`prd02.probes.<name>` contributions), then
// publishes per-item probe assignments on the blackboard for the shading
// seam (`prd02.probeSelection`) plus `prd02.irradianceVolume`.
// The scene-side `renderFace` callback arrives through the blackboard —
// `prd02.probeRenderFace` (the frame host supplies the C-09 capture seam).

import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import type { FrameContributorContext, FrameContributor } from "../contracts/frameGraph";
import type { RenderDevice, RenderTarget } from "../RenderDevice";
import type { RenderItem } from "../contracts/renderItem";
import type { RenderSource } from "../contracts/renderSource";
import { Sampler } from "../Sampler";
import { TextureBinding } from "../TextureBinding";
import {
  ReflectionProbeSystem, type ReflectionProbeSpec, type ProbeAssignment,
  type ReflectionFaceRenderer
} from "./ReflectionProbeSystem";
import { IrradianceVolumeSystem, type IrradianceVolumeSpec } from "./IrradianceVolume";
import { prd02CaptureDirtyProbes, prd02ProbeBindings } from "./ProbeBoxProjection";
import { prd02SubFlagOff, readPrd02KillSwitches, SUB_FLAG_PROBES } from "../passes/Prd02SubFlags";

export const PROBES_SUB_FLAG = "A3D_QR_LIGHTING_PROBES";
export const PROBE_SELECTION_BLACKBOARD_KEY = "prd02.probeSelection";
export const IRRADIANCE_VOLUME_BLACKBOARD_KEY = "prd02.irradianceVolume";
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

interface ProbesState {
  reflections: ReflectionProbeSystem;
  irradiance: IrradianceVolumeSystem;
}

const systems = new WeakMap<RenderDevice, ProbesState>();
let pendingRenderer: ReflectionFaceRenderer | null = null;

/** The frame host (production runtime) installs the scene's face renderer —
 *  the same closure C-09 `EnvironmentCaptureRequest.renderFace` delegates to. */
export function installPrd02ProbeRenderer(fn: ReflectionFaceRenderer | null): void {
  pendingRenderer = fn;
  if (!fn) systemsResetAll();
}

function systemsResetAll(): void { /* WeakMap entries go stale naturally */ }

function stateFor(device: RenderDevice, renderer: ReflectionFaceRenderer): ProbesState {
  let state = systems.get(device);
  if (!state) {
    state = {
      reflections: new ReflectionProbeSystem(device, renderer),
      irradiance: new IrradianceVolumeSystem(device, renderer)
    };
    systems.set(device, state);
  }
  return state;
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
  const position = (o.position ?? [0, 0, 0]) as readonly [number, number, number];
  const half = (o.boxHalfExtents ?? o.extent ?? [2, 2, 2]) as readonly [number, number, number];
  const update = o.update === "on-demand" ? "on-demand"
    : o.update === "every-n-frames" ? "every-n-frames" : "once";
  const resolution = o.resolution === 256 ? 256 : 128;
  return {
    name: node.name,
    position,
    boxHalfExtents: half,
    blendDistance: typeof o.blendDistance === "number" ? o.blendDistance : 1,
    ...(typeof o.priority === "number" ? { priority: o.priority } : {}),
    ...(typeof o.intensity === "number" ? { intensity: o.intensity } : {}),
    update,
    resolution,
    ...(typeof o.near === "number" ? { near: o.near } : {}),
    ...(typeof o.far === "number" ? { far: o.far } : {})
  };
}

function irradianceSpecFromNode(node: AuraProbeNodeLike): IrradianceVolumeSpec {
  const o = node.options;
  const min = (o.min ?? [-2, -2, -2]) as readonly [number, number, number];
  const max = (o.max ?? [2, 2, 2]) as readonly [number, number, number];
  const res = Array.isArray(o.resolution) ? o.resolution : o.density;
  return {
    name: node.name,
    min,
    max,
    ...(Array.isArray(res) ? { resolution: res as [number, number, number] } : {}),
    ...(typeof o.intensity === "number" ? { intensity: o.intensity } : {}),
    update: o.update === "on-demand" ? "on-demand" : "once"
  };
}

/** Lane-01 Renderer surface the pre-frame capture uses (#1115 `renderProbeFace`). */
export interface Prd02ProbeCaptureRenderer {
  readonly device: RenderDevice;
  renderProbeFace(source: RenderSource, face: 0 | 1 | 2 | 3 | 4 | 5, target: RenderTarget, viewProjection: Float32Array): unknown;
}

/** Source the capture renders (updated every frame before captures run). */
const captureSources = new WeakMap<RenderDevice, { source: RenderSource | null }>();
/** Devices whose probes were captured pre-frame this frame (the pass then only publishes). */
const capturedPreFrame = new WeakSet<RenderDevice>();

/**
 * 02-S12 pre-frame driver: call BEFORE `Renderer.render` (frame host hook,
 * #1113). Registers the source's reflection/irradiance probe nodes and
 * advances dirty captures through lane 01's `renderProbeFace`, which owns its
 * own device frame and private graph (so this must not run inside a frame).
 */
export function prd02BeforeFrame(renderer: Prd02ProbeCaptureRenderer, source: RenderSource, flags: FrameContributorContext["flags"]): readonly string[] {
  if (prd02SubFlagOff(flags, SUB_FLAG_PROBES) || !readPrd02KillSwitches(source).probes) return [];
  const nodes = probeNodesFromSource({ source });
  if (nodes.length === 0) return [];
  let slot = captureSources.get(renderer.device);
  if (!slot) {
    slot = { source: null };
    captureSources.set(renderer.device, slot);
  }
  slot.source = source;
  const holder = slot;
  const state = stateFor(renderer.device, (face, target, viewProjection) => {
    if (holder.source) renderer.renderProbeFace(holder.source, face, target, viewProjection);
  });
  registerProbeNodes(state, nodes);
  const changed = prd02CaptureDirtyProbes(state.reflections);
  state.irradiance.update();
  capturedPreFrame.add(renderer.device);
  return changed;
}

function registerProbeNodes(state: ProbesState, nodes: readonly AuraProbeNodeLike[]): void {
  for (const node of nodes) {
    if (node.probe === "reflection") {
      const spec = specFromNode(node);
      if (spec) state.reflections.register(spec);
    } else {
      state.irradiance.configure(irradianceSpecFromNode(node));
    }
  }
}

const PROBE_CUBE_SAMPLER = new Sampler({
  minFilter: "linear-mipmap-linear",
  magFilter: "linear",
  addressU: "clamp-to-edge",
  addressV: "clamp-to-edge"
});

/**
 * Collect phase: each item inside a captured probe's influence gets that
 * probe's specular cube as its per-draw `environmentCube` (lane 01 #1115
 * legacy override). The legacy shader binds one cube without parallax
 * correction, so the dominant probe wins; box projection + 2-probe blending
 * come with the `a3d_prd02_probe_box` chunk on the generator path.
 */
export function applyProbeEnvironmentCubes(items: readonly RenderItem[], device: RenderDevice): RenderItem[] {
  const state = systems.get(device);
  if (!state || state.reflections.probes().length === 0) return [...items];
  return items.map((item) => {
    const assignment = state.reflections.assign(item);
    const dominant = assignment.a;
    if (!dominant || dominant.weight < assignment.globalWeight) return item;
    return {
      ...item,
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
    let state: ProbesState | undefined;
    if (capturedPreFrame.has(ctx.device)) {
      // 02-S12: prd02BeforeFrame already captured outside the frame.
      capturedPreFrame.delete(ctx.device);
      state = systems.get(ctx.device);
    } else {
      const renderer = (ctx.blackboard.get(PROBE_RENDER_FACE_KEY) ?? pendingRenderer) as ReflectionFaceRenderer | null;
      if (!renderer) return;
      state = stateFor(ctx.device, renderer);
      registerProbeNodes(state, probeNodesFromSource(ctx));
      state.reflections.update();
      state.irradiance.update();
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
    if (state.irradiance.get()) ctx.blackboard.set(IRRADIANCE_VOLUME_BLACKBOARD_KEY, state.irradiance.get());
    // §6.6 hand-off for PRD-03 SSR: the dominant captured env (first probe,
    // else null) + the roughness→LOD map against its mip chain.
    const dominant = state.reflections.probes()[0] ?? null;
    ctx.blackboard.set(ENV_SPECULAR_BLACKBOARD_KEY, dominant ? dominant.specularCube : null);
    const mips = dominant ? dominant.mipCount : 1;
    ctx.blackboard.set(ROUGHNESS_TO_LOD_BLACKBOARD_KEY,
        (roughness: number) => Math.min(Math.max(roughness, 0), 1) * (mips - 1));
  }
}

export function createPrd02ProbesContributor(): FrameContributor {
  return {
    id: "prd02.probes",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    phases: ["collect", "shadows"],
    order: -1, // capture before the shadow pass consumes probe-relevant state
    collect: (items, ctx) =>
      !prd02SubFlagOff(ctx.flags, SUB_FLAG_PROBES) && readPrd02KillSwitches(ctx.source).probes
        ? applyProbeEnvironmentCubes(items, ctx.device)
        : items,
    passes: (phase, ctx) =>
      phase === "shadows"
        && !prd02SubFlagOff(ctx.flags, SUB_FLAG_PROBES)
        && readPrd02KillSwitches(ctx.source).probes
        && probeNodesFromSource(ctx).length > 0
        ? [new Prd02ProbesRenderPass(ctx)]
        : []
  };
}
