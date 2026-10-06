// PRD-07 P1-T14 — per-app effect runtime (PRD-07 §6.3).
// Lowers every effect node in the scene to a CpuEmitter (or a pass-through
// record for non-particle kinds), steps sim on app.onFrame, feeds the C-20
// hook during the collect phase, and reports observed draws into
// EffectDiagnostics after the transparent phase.

import { Texture } from "@aura3d/rendering";
import type { ParticleBatchDescriptor, ParticleBatchHandle, ParticleRenderHook } from "@aura3d/rendering/contracts";
import type { ParticlePassDiagnostics } from "@aura3d/rendering/lanes";
import { createEmitter, stepEmitter, writeEmitterInstances, type EmitterState } from "./CpuEmitter";
import { lowerEffectNode, type LoweredEffect, type EffectNodeLike } from "./EffectNodeLowering";
import { EffectDiagnostics } from "./EffectDiagnostics";
import { LiveAtmosphere } from "./LiveAtmosphere";

let sharedSoftDot: Texture | null = null;

/** 1×1 white fallback atlas; the particle program detects it and draws the analytic soft-dot. */
export function softDotTexture(): Texture {
  if (!sharedSoftDot) {
    sharedSoftDot = new Texture({ width: 1, height: 1, label: "a3d-soft-dot", data: new Uint8Array([255, 255, 255, 255]) });
  }
  return sharedSoftDot;
}

interface EmitterBinding {
  readonly lowered: Extract<LoweredEffect, { type: "emitter" }>;
  readonly state: EmitterState;
  scratch: Float32Array;
}

export interface AppLike {
  readonly scene: { readonly nodes: readonly EffectNodeLike[] };
  onFrame(callback: (frame: { dt: number }) => void): () => void;
}

export class ProductionEffectSystem {
  readonly diagnostics = new EffectDiagnostics();
  readonly atmosphere = new LiveAtmosphere();
  private readonly emitters = new Map<string, EmitterBinding>();
  private readonly batchHandles = new Map<string, ParticleBatchHandle>();
  private readonly groupScratch = new Map<string, Float32Array>();
  private readonly frameBatchMembers = new Map<string, string[]>();
  private readonly frameLive = new Map<string, number>();
  private readonly offFrame: () => void;
  private drawFeedQueue: ParticlePassDiagnostics | null = null;
  private disposed = false;
  private time = 0;

  constructor(private readonly app: AppLike) {
    this.rebuildFromScene();
    this.offFrame = app.onFrame((frame) => this.frame(frame.dt));
  }

  private rebuildFromScene(): void {
    for (const node of this.app.scene.nodes) {
      if (node.kind !== "effect") continue;
      const lowered = lowerEffectNode(node);
      this.diagnostics.track({
        nodeId: lowered.nodeId,
        effect: lowered.effect,
        consumer: lowered.consumer,
        live: 0,
        sim: lowered.sim,
        softDepth: lowered.type === "emitter" ? lowered.batch.softDepth : false
      });
      if (lowered.type !== "emitter") continue;
      this.attachEmitter(lowered);
    }
  }

  private attachEmitter(lowered: Extract<LoweredEffect, { type: "emitter" }>): EmitterBinding {
    const state = createEmitter(lowered.emitter);
    const binding: EmitterBinding = {
      lowered,
      state,
      scratch: new Float32Array(Math.max(64, lowered.emitter.capacity) * 16)
    };
    this.emitters.set(lowered.nodeId, binding);
    return binding;
  }

  /** Add a transient effect-instance emitter (effects.burst/spawn). */
  addInstance(nodeId: string, node: EffectNodeLike): string {
    const lowered = lowerEffectNode(node);
    if (lowered.type !== "emitter") {
      this.diagnostics.note("VFX_KIND_UNLOWERED", nodeId, `effect "${node.effect}" has no emitter lowering yet`);
      return nodeId;
    }
    this.attachEmitter({ ...lowered, nodeId });
    this.diagnostics.track({
      nodeId,
      effect: lowered.effect,
      consumer: lowered.consumer,
      live: 0,
      sim: lowered.sim,
      softDepth: lowered.batch.softDepth
    });
    return nodeId;
  }

  setInstanceOrigin(nodeId: string, origin: readonly number[]): void {
    const binding = this.emitters.get(nodeId);
    if (!binding) return;
    binding.state.desc = { ...binding.state.desc, origin: [origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0] as never };
  }

  removeInstance(nodeId: string): void {
    const binding = this.emitters.get(nodeId);
    if (!binding) return;
    binding.state.live = 0;
    this.emitters.delete(nodeId);
    this.diagnostics.untrack(nodeId);
  }

  /** Sim advance — runs inside app.onFrame, before the renderer submits. */
  private frame(dt: number): void {
    if (this.disposed) return;
    this.time += dt;
    // Close the previous rendered frame's draw accounting first. The visible
    // set is the scene's effect nodes that aren't hidden — headless apps have
    // no frustum, so scene-visible == in-frustum here; the contributor's
    // frustum cull narrows it further inside the renderer.
    const visible = new Set<string>();
    for (const node of this.app.scene.nodes) {
      const n = node as EffectNodeLike & { visible?: boolean };
      if (n.visible !== false) visible.add(n.id ?? n.name ?? "");
    }
    this.diagnostics.endFrame(visible);
    for (const binding of this.emitters.values()) {
      stepEmitter(binding.state, dt);
      this.diagnostics.track({
        nodeId: binding.lowered.nodeId,
        effect: binding.lowered.effect,
        consumer: binding.lowered.consumer,
        live: binding.state.live,
        sim: binding.lowered.sim,
        softDepth: binding.lowered.batch.softDepth
      });
    }
    this.diagnostics.setFrameStats(this.emitters.size, this.liveCount());
  }

  /**
   * RenderSource feed — invoked by the prd07.particles contributor (collect).
   * Emitters are coalesced into one batch per §6.2.2 material key (blend,
   * atlas, stretch, frameBlend, softDepth): two additive emitters on the same
   * atlas submit a single instanced draw.
   */
  feed(hook: ParticleRenderHook): void {
    this.frameBatchMembers.clear();
    const groups = new Map<string, { first: EmitterBinding; parts: { binding: EmitterBinding; live: number }[] }>();
    for (const binding of this.emitters.values()) {
      const live = writeEmitterInstances(binding.state, binding.scratch);
      this.frameLive.set(binding.lowered.nodeId, live);
      const key = binding.lowered.emitter.key;
      let group = groups.get(key);
      if (!group) groups.set(key, (group = { first: binding, parts: [] }));
      group.parts.push({ binding, live });
    }
    const seenKeys = new Set<string>();
    for (const [key, group] of groups) {
      seenKeys.add(key);
      const totalLive = group.parts.reduce((s, p) => s + p.live, 0);
      const desc: ParticleBatchDescriptor = {
        key,
        capacity: group.parts.reduce((s, p) => s + p.binding.lowered.emitter.capacity, 0),
        source: "cpu",
        atlas: softDotTexture(),
        blend: group.first.lowered.batch.blend,
        shading: group.first.lowered.batch.shading,
        softDepth: group.first.lowered.batch.softDepth,
        ...(group.first.lowered.batch.softDistance !== undefined ? { softDistance: group.first.lowered.batch.softDistance } : {}),
        ...(group.first.lowered.batch.nearFade !== undefined ? { nearFade: group.first.lowered.batch.nearFade } : {}),
        stretch: group.first.lowered.batch.stretch,
        frameBlend: group.first.lowered.batch.frameBlend
      };
      let handle = this.batchHandles.get(key) ?? null;
      handle = hook.upsertBatch(desc);
      this.batchHandles.set(key, handle);
      if (totalLive === 0) {
        // Keep the batch alive but empty so a revive doesn't thrash capacity.
        hook.writeInstances(handle, group.first.scratch, 0);
        continue;
      }
      let data: Float32Array;
      if (group.parts.length === 1) {
        const part = group.parts[0];
        data = part.binding.scratch.subarray(0, part.live * 16);
      } else {
        data = this.concatScratch(key, totalLive * 16, group.parts);
      }
      hook.writeInstances(handle, data, totalLive);
      this.frameBatchMembers.set(key, group.parts.filter((p) => p.live > 0).map((p) => p.binding.lowered.nodeId));
    }
    // Retire batches whose key no emitter fed this frame.
    for (const [key, handle] of this.batchHandles) {
      if (!seenKeys.has(key)) {
        hook.removeBatch(handle);
        this.batchHandles.delete(key);
      }
    }
  }

  private concatScratch(key: string, floats: number, parts: { binding: EmitterBinding; live: number }[]): Float32Array {
    let buf = this.groupScratch.get(key);
    if (!buf || buf.length < floats) {
      buf = new Float32Array(Math.max(64, floats));
      this.groupScratch.set(key, buf);
    }
    let off = 0;
    for (const part of parts) {
      if (part.live === 0) continue;
      buf.set(part.binding.scratch.subarray(0, part.live * 16), off);
      off += part.live * 16;
    }
    return buf.subarray(0, floats);
  }

  /** Observed draws — invoked by the contributor after queue collection. */
  afterDraw(diag: ParticlePassDiagnostics): void {
    this.drawFeedQueue = diag;
    // Attribute the frame's draws per emitter: a merged batch's draw counts
    // once for every member node (each node's pixels went through that call),
    // so zero-pixel accounting stays per-node honest.
    for (const nodeIds of this.frameBatchMembers.values()) {
      for (const nodeId of nodeIds) {
        this.diagnostics.trackDraw(nodeId, 1, this.frameLive.get(nodeId) ?? 0);
      }
    }
    for (const error of diag.errors) {
      this.diagnostics.note(error.code, error.nodeId, error.message);
    }
    if (diag.deviceCounters !== undefined) {
      this.diagnostics.noteDeviceReadbacks(diag.deviceCounters.readbacks);
    }
  }

  liveCount(): number {
    let total = 0;
    for (const binding of this.emitters.values()) total += binding.state.live;
    return total;
  }

  emitterIds(): readonly string[] {
    return [...this.emitters.keys()];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.offFrame();
    this.emitters.clear();
  }
}
