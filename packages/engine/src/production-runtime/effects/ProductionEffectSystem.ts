// PRD-07 P1-T14 — per-app effect runtime (PRD-07 §6.3).
// Lowers every effect node in the scene to a CpuEmitter (or a pass-through
// record for non-particle kinds), steps sim on app.onFrame, feeds the C-20
// hook during the collect phase, and reports observed draws into
// EffectDiagnostics after the transparent phase.

import { Texture } from "@aura3d/rendering";
import type { ParticleBatchDescriptor, ParticleBatchHandle, ParticleRenderHook } from "@aura3d/rendering/contracts";
import { QUALITY_TIERS, type AuraQualityTier } from "@aura3d/rendering/contracts";
import type { ParticlePassDiagnostics } from "@aura3d/rendering/lanes";
import { MeshParticleBatch, RibbonBatch, RibbonTrail, type BeamDrawSpec, type MeshParticleFeed } from "@aura3d/rendering/lanes";
import { createEmitter, stepEmitter, writeEmitterInstances, type EmitterState } from "./CpuEmitter";
import { lowerEffectNode, type LoweredEffect, type EffectNodeLike } from "./EffectNodeLowering";
import { EffectDiagnostics } from "./EffectDiagnostics";
import { LiveAtmosphere } from "./LiveAtmosphere";
import { TransientLightPool, type TransientLightFlash } from "./TransientLightPool";
import type { CollectedLight } from "@aura3d/rendering";

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

interface TrailBinding {
  readonly trail: RibbonTrail;
  readonly node: EffectNodeLike;
}

function hexToRgb(c: string): readonly [number, number, number] {
  if (c.startsWith("#") && c.length === 7) {
    return [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
  }
  return [1, 1, 1];
}

function effectColor4(node: EffectNodeLike): readonly [number, number, number, number] {
  const c = node.color;
  if (Array.isArray(c) && c.length >= 3) return [Number(c[0]), Number(c[1]), Number(c[2]), Number(c[3] ?? 1)];
  if (typeof c === "string") { const [r, g, b] = hexToRgb(c); return [r, g, b, 1]; }
  return [1, 1, 1, 1];
}

/** Convert a lowered beam-family node into the pass's draw spec. */
function beamSpec(node: EffectNodeLike, nodeId: string): BeamDrawSpec {
  const color = effectColor4(node);
  const top = node.colorTop !== undefined
    ? (typeof node.colorTop === "string"
        ? ([...hexToRgb(node.colorTop), 1] as readonly [number, number, number, number])
        : ([Number(node.colorTop[0]), Number(node.colorTop[1]), Number(node.colorTop[2]), Number(node.colorTop[3] ?? 1)] as readonly [number, number, number, number]))
    : undefined;
  return {
    nodeId,
    kind: node.effect ?? "light-beam",
    color,
    intensity: node.intensity ?? 1,
    ...(node.position !== undefined ? { position: node.position } : {}),
    ...(node.from !== undefined ? { from: node.from } : {}),
    ...(node.to !== undefined ? { to: node.to } : {}),
    ...(node.widthWorld !== undefined ? { widthWorld: node.widthWorld } : {}),
    ...(node.segmentCount !== undefined ? { segmentCount: node.segmentCount } : {}),
    ...(node.direction !== undefined ? { direction: node.direction } : {}),
    ...(node.length !== undefined ? { length: node.length } : {}),
    ...(node.coneAngle !== undefined ? { coneAngle: node.coneAngle } : {}),
    ...(node.softness !== undefined ? { softness: node.softness } : {}),
    ...(node.width !== undefined ? { width: node.width } : {}),
    ...(node.height !== undefined ? { height: node.height } : {}),
    ...(node.segments !== undefined ? { segments: node.segments } : {}),
    ...(node.sway !== undefined ? { sway: node.sway } : {}),
    ...(node.shimmer !== undefined ? { shimmer: node.shimmer } : {}),
    ...(top !== undefined ? { colorTop: top as readonly [number, number, number, number] } : {})
  };
}

/** Deterministic spawn for a meshParticles node at attach time. */
function seedMeshBatch(node: EffectNodeLike): MeshParticleBatch {
  const batch = new MeshParticleBatch({
    capacity: Math.max(1, Math.round(node.particleCount ?? 32)),
    ...(node.gravity !== undefined && typeof node.gravity === "number" ? { gravity: node.gravity } : {}),
    ...(node.drag !== undefined ? { drag: node.drag } : {}),
    ...(node.spin !== undefined ? { spinRate: node.spin } : {}),
    groundY: 0,
    restitution: node.groundBounce ?? 0.35,
    seed: typeof node.seed === "number" ? node.seed : 0x9e3779b9
  });
  const origin = node.position ?? [0, 0, 0];
  const color = effectColor4(node);
  const count = batch.capacity;
  const rng = mulberry32(typeof node.seed === "number" ? node.seed : 7);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const speed = 1.5 + rng() * 3;
    batch.spawn({
      position: [origin[0] + (rng() - 0.5) * 0.4, origin[1], origin[2] + (rng() - 0.5) * 0.4],
      velocity: [Math.cos(a) * speed, 2.5 + rng() * 3, Math.sin(a) * speed],
      scale: 0.08 + rng() * 0.15,
      color,
      spinAxis: [rng() - 0.5, rng() - 0.5, rng() - 0.5],
      spin: (node.spin ?? 1) * (0.5 + rng()),
      life: 3 + rng() * 2
    });
  }
  return batch;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface AppLike {
  readonly scene: { readonly nodes: readonly EffectNodeLike[] };
  onFrame(callback: (frame: { dt: number }) => void): () => void;
  /** Runtime-node registry — the legacy-sky hiding pass (§6.5) uses it. */
  readonly nodes?: {
    get(id: string): { setVisible?(visible: boolean): void; visible?: boolean } | undefined;
  };
}

export class ProductionEffectSystem {
  readonly diagnostics = new EffectDiagnostics();
  readonly atmosphere = new LiveAtmosphere();
  /** C-27 tier the system budgets against (resolved by the C-38 factory). */
  readonly tier: AuraQualityTier;
  private readonly budgetCap: number;
  private culledTotal = 0;
  private readonly emitters = new Map<string, EmitterBinding>();
  private readonly batchHandles = new Map<string, ParticleBatchHandle>();
  private readonly groupScratch = new Map<string, Float32Array>();
  private readonly frameBatchMembers = new Map<string, string[]>();
  private readonly frameLive = new Map<string, number>();
  private readonly offFrame: () => void;
  /** P2-T7 transient light pool — tier-capped flashes for the burst presets. */
  readonly transientLights: TransientLightPool;
  /** §6.2.9 ribbon state — trails own the ring; the RibbonPass draws it. */
  readonly ribbons = new RibbonBatch();
  private readonly trails = new Map<string, TrailBinding>();
  private readonly beams = new Map<string, EffectNodeLike>();
  private readonly meshBatches = new Map<string, MeshParticleBatch>();
  private drawFeedQueue: ParticlePassDiagnostics | null = null;
  private disposed = false;
  private time = 0;
  private skyFlagOn = false;

  constructor(private readonly app: AppLike, options: { readonly tier?: AuraQualityTier } = {}) {
    this.tier = options.tier ?? "high";
    this.budgetCap = QUALITY_TIERS[this.tier].particleBudget;
    this.transientLights = new TransientLightPool(this.tier);
    this.rebuildFromScene();
    this.offFrame = app.onFrame((frame) => this.frame(frame.dt));
  }

  /** P3-T4 — sky nodes land on LiveAtmosphere (consumed by prd07.sky flag-on). */
  private rebuildSkyFromScene(): void {
    for (const node of this.app.scene.nodes) {
      if ((node as { kind?: string }).kind !== "sky") continue;
      const spec = (node as { spec?: unknown }).spec;
      if (spec && typeof spec === "object") this.atmosphere.setSky(spec as Parameters<LiveAtmosphere["setSky"]>[0]);
    }
    this.applyLegacySkyVisibility();
  }

  /**
   * §6.5 — `sky.dayNight` legacy primitives are runtime-tagged
   * `prd07.legacySky.<n>`. With `A3D_QR_VFX_SKY` on they hide through their
   * runtime handles; flag-off the setter is never called and the frame is
   * unchanged.
   */
  private applyLegacySkyVisibility(): void {
    if (!this.skyFlagOn || !this.app.nodes) return;
    for (const node of this.app.scene.nodes) {
      const runtimeId = (node as { runtime?: { id?: string } }).runtime?.id;
      if (typeof runtimeId === "string" && runtimeId.startsWith("prd07.legacySky.")) {
        this.app.nodes.get(runtimeId)?.setVisible?.(false);
      }
    }
  }

  /** Bound by the C-38 extension factory with the app's resolved flag state. */
  setSkyFlagOn(on: boolean): void {
    this.skyFlagOn = on;
    this.applyLegacySkyVisibility();
  }

  private rebuildFromScene(): void {
    this.rebuildSkyFromScene();
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
      if (lowered.type === "emitter") {
        this.attachEmitter(lowered);
      } else {
        this.attachNonEmitter(node, lowered);
      }
    }
  }

  /**
   * Attach a lowered non-emitter node to its consumer's lane state:
   * beam-pass kinds become draw specs, ribbon-pass trails join the
   * RibbonBatch ring (preseeded from `path`, live points via trailPush),
   * mesh-pass kinds own a MeshParticleBatch.
   */
  private attachNonEmitter(node: EffectNodeLike, lowered: LoweredEffect): void {
    if (lowered.consumer === "beam-pass") {
      this.beams.set(lowered.nodeId, node);
    } else if (lowered.consumer === "ribbon-pass") {
      const color = effectColor4(node);
      const trail = this.ribbons.upsertTrail({
        id: lowered.nodeId,
        maxPoints: node.maxPoints,
        minVertexDistance: node.minVertexDistance,
        width: node.width,
        color,
        orientation: node.orientation === "surface" ? "surface" : "camera",
        ...(node.surfaceNormal !== undefined ? { surfaceNormal: node.surfaceNormal } : {})
      });
      if (Array.isArray(node.path)) {
        const points = node.path.filter((p): p is readonly number[] => Array.isArray(p) && p.length >= 3);
        const step = points.length > 1 ? 0.02 : 0;
        points.forEach((p, i) => trail.push([p[0] ?? 0, p[1] ?? 0, p[2] ?? 0], i * step));
      }
      this.trails.set(lowered.nodeId, { trail, node });
    } else if (lowered.consumer === "mesh-pass") {
      this.meshBatches.set(lowered.nodeId, seedMeshBatch(node));
    }
    // "post"/"scene-fog"/"none" consumers have no lane state (P3/P4).
  }

  /** Per-frame feed: the RibbonBatch the prd07.ribbons contributor draws. */
  ribbonFeed(): RibbonBatch {
    return this.ribbons;
  }

  /** Per-frame feed: beam-family draw specs for the prd07.beams contributor. */
  beamFeed(): BeamDrawSpec[] {
    return [...this.beams.entries()].map(([nodeId, node]) => beamSpec(node, nodeId));
  }

  /** Per-frame feed: mesh batches for the prd07.mesh contributor. */
  meshFeed(): MeshParticleFeed[] {
    return [...this.meshBatches.entries()].map(([nodeId, batch]) => ({ nodeId, batch }));
  }

  /** Append a live trail point (target-follow / scripted motion callers). */
  trailPush(nodeId: string, position: readonly [number, number, number], width?: number, color?: readonly [number, number, number, number]): boolean {
    const binding = this.trails.get(nodeId);
    if (!binding) return false;
    return binding.trail.push(position, this.time, width, color);
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
    this.diagnostics.track({
      nodeId,
      effect: lowered.effect,
      consumer: lowered.consumer,
      live: 0,
      sim: lowered.sim,
      softDepth: lowered.type === "emitter" ? lowered.batch.softDepth : false
    });
    if (lowered.type === "emitter") {
      this.attachEmitter({ ...lowered, nodeId });
    } else {
      this.attachNonEmitter(node, lowered);
    }
    return nodeId;
  }

  setInstanceOrigin(nodeId: string, origin: readonly number[]): void {
    const binding = this.emitters.get(nodeId);
    if (!binding) return;
    binding.state.desc = { ...binding.state.desc, origin: [origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0] as never };
  }

  removeInstance(nodeId: string): void {
    const binding = this.emitters.get(nodeId);
    if (!binding) {
      this.beams.delete(nodeId);
      const trail = this.trails.get(nodeId);
      if (trail) { trail.trail.clear(); this.ribbons.removeTrail(nodeId); this.trails.delete(nodeId); }
      this.meshBatches.delete(nodeId);
      return;
    }
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
    // C-27 budget cap: when total live exceeds the tier's particleBudget,
    // shrink every emitter proportionally and report the refused count as
    // `budget.culled` (PRD-07 §7.4 "pooled per spec").
    const live = this.liveCount();
    if (live > this.budgetCap) {
      const scale = this.budgetCap / live;
      let kept = 0;
      for (const binding of this.emitters.values()) {
        binding.state.live = Math.floor(binding.state.live * scale);
        kept += binding.state.live;
      }
      this.culledTotal += live - kept;
    }
    for (const batch of this.meshBatches.values()) batch.step(dt);
    this.transientLights.step(dt);
    this.diagnostics.setFrameStats(this.emitters.size, this.liveCount());
    this.diagnostics.setBudget({ tier: this.tier, cap: this.budgetCap, culled: this.culledTotal });
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

  culled(): number {
    return this.culledTotal;
  }

  /** P2-T7 — transient flash for burst presets (impact/explosion/super-flash). */
  flashLight(flash: TransientLightFlash): boolean {
    return this.transientLights.flash(flash);
  }

  /** CollectedLights published to the RenderSource each frame (C-01 collect). */
  collectedLights(): readonly CollectedLight[] {
    return this.transientLights.collect();
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
