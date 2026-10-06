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
import type { RenderDevice } from "../RenderDevice";
import {
  ReflectionProbeSystem, type ReflectionProbeSpec, type ProbeAssignment,
  type ReflectionFaceRenderer
} from "./ReflectionProbeSystem";
import { IrradianceVolumeSystem, type IrradianceVolumeSpec } from "./IrradianceVolume";

export const PROBES_SUB_FLAG = "A3D_QR_LIGHTING_PROBES";
export const PROBE_SELECTION_BLACKBOARD_KEY = "prd02.probeSelection";
export const IRRADIANCE_VOLUME_BLACKBOARD_KEY = "prd02.irradianceVolume";
export const PROBE_RENDER_FACE_KEY = "prd02.probeRenderFace";
/** PRD-03 SSR seam (§6.6 hand-off): dominant specular env for the frame. */
export const ENV_SPECULAR_BLACKBOARD_KEY = "prd02.envSpecular";
/** PRD-03 SSR seam: roughness → probe mip LOD. */
export const ROUGHNESS_TO_LOD_BLACKBOARD_KEY = "prd02.roughnessToLod";

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
export function probeNodesFromSource(ctx: FrameContributorContext): readonly AuraProbeNodeLike[] {
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

class Prd02ProbesRenderPass extends BaseRenderPass {
  constructor(private readonly ctx: FrameContributorContext) {
    super("prd02.probes", [], []);
  }

  execute(_context: RenderPassContext): void {
    const ctx = this.ctx;
    const renderer = (ctx.blackboard.get(PROBE_RENDER_FACE_KEY) ?? pendingRenderer) as ReflectionFaceRenderer | null;
    if (!renderer) return;
    const state = stateFor(ctx.device, renderer);
    for (const node of probeNodesFromSource(ctx)) {
      if (node.probe === "reflection") {
        const spec = specFromNode(node);
        if (spec) state.reflections.register(spec);
      } else {
        state.irradiance.configure(irradianceSpecFromNode(node));
      }
    }
    state.reflections.update();
    state.irradiance.update();
    const assignments = new Map<unknown, ProbeAssignment>();
    for (const item of ctx.items) assignments.set(item, state.reflections.assign(item));
    ctx.blackboard.set(PROBE_SELECTION_BLACKBOARD_KEY, assignments);
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
    phases: ["shadows"],
    order: -1, // capture before the shadow pass consumes probe-relevant state
    passes: (phase, ctx) =>
      phase === "shadows" && probeNodesFromSource(ctx).length > 0
        ? [new Prd02ProbesRenderPass(ctx)]
        : []
  };
}
