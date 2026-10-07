// PRD-07 P1-T5/P1-T8/P1-T9 — C-20 ParticleRenderHook implementation and the
// transparent-queue draw path. One instanced draw per batch; non-additive
// batches sorted back-to-front; additive batches appended last.

import type { RenderBuffer, RenderDevice, RenderShaderProgram } from "../RenderDevice";
import type { FrameContributorContext, TransparentQueueItem } from "../contracts/frameGraph";
import type { ParticleBatchDescriptor, ParticleBatchHandle } from "../contracts/particles";
import { TextureBinding } from "../TextureBinding";
import { ParticleInstanceRing, createParticleQuad, particleInstanceAttributes } from "./ParticleInstanceLayout";
import { consumeBlendFallbackReport, resolveVfxBlend } from "./BlendFallback";
import { LowResAutoBudget, LowResParticleTarget } from "./LowResParticles";
import { ParticleSort } from "./ParticleSort";
import { resolveOutputColorSpace, resolveSceneDepth } from "./SceneDepthAdapter";
import {
  PARTICLE_SHADER_MARKER,
  particleFragmentSource,
  particleProgramKey,
  particleVertexSource,
  type ParticleProgramDefines
} from "./shaders/particle.glsl";

const MAX_PARTICLE_PROGRAMS = 12;

export interface ParticlePassDiagnostics {
  drawCalls: number;
  instancesDrawn: number;
  readonly errors: { code: string; nodeId: string; message: string }[];
  /** P6-T4: half-res path state for this frame. */
  readonly lowRes?: { readonly active: boolean; readonly batches: number };
  /** C-28 device counters snapshot at report time (e.g. `readbacks` must stay 0). */
  readonly deviceCounters?: { readonly readbacks: number };
}

interface BatchState extends ParticleBatchHandle {
  desc: ParticleBatchDescriptor;
  ring: ParticleInstanceRing;
  buffer: RenderBuffer | null;
  liveCount: number;
  sortDepth: number;
  changed: boolean;
  centre: [number, number, number];
  removed: boolean;
}

export class ParticleBatchPass {
  private readonly batches = new Map<string, BatchState>();
  private readonly programs = new Map<string, RenderShaderProgram>();
  private readonly sorter = new ParticleSort();
  private programLimitWarned = false;
  private frameDiagnostics: ParticlePassDiagnostics = { drawCalls: 0, instancesDrawn: 0, errors: [] };
  private frameDepth: ReturnType<typeof resolveSceneDepth> | null = null;
  private frameOutputColorSpace: "linear" | "srgb" = "srgb";
  private honoursBlendMode: boolean | null = null;
  // P6-T4 half-res particle path: off by default; auto via noteGpuMs budget.
  private lowResManual: boolean | null = null;
  private lowResAuto = false;
  private readonly lowResBudget = new LowResAutoBudget();
  private lowRes: LowResParticleTarget | null = null;
  private lowResUnsupportedWarned = false;

  constructor(private readonly device: RenderDevice) {}

  /* ---------------- P6-T4 half-res path ---------------- */

  /** Force the half-res path on/off; `null` restores budget auto-control. */
  setLowResEnabled(on: boolean): void {
    this.lowResManual = on;
  }

  /** Measured particle-GPU-ms sample; auto-enables above the tier budget. */
  noteGpuMs(particleGpuMs: number, budgetMs: number): void {
    this.lowResAuto = this.lowResBudget.note(particleGpuMs, budgetMs, this.lowResAuto);
  }

  get lowResActive(): boolean {
    return (this.lowResManual ?? this.lowResAuto) && typeof this.device.getRenderTarget === "function";
  }

  /* ---------------- C-20 ParticleRenderHook ---------------- */

  upsertBatch(desc: ParticleBatchDescriptor): ParticleBatchHandle {
    let batch = this.batches.get(desc.key);
    if (!batch) {
      batch = {
        key: desc.key,
        desc,
        ring: new ParticleInstanceRing(this.device),
        buffer: null,
        liveCount: 0,
        sortDepth: 0,
        changed: true,
        centre: [0, 0, 0],
        removed: false
      };
      this.batches.set(desc.key, batch);
    } else {
      batch.desc = desc;
    }
    return batch;
  }

  writeInstances(h: ParticleBatchHandle, data: Float32Array, liveCount: number): void {
    const batch = this.batches.get(h.key);
    if (!batch || batch.removed) return;
    const live = Math.min(liveCount, Math.floor(data.length / 16));
    if (live <= 0) {
      batch.liveCount = 0;
      batch.buffer = null;
      return;
    }
    batch.buffer = batch.ring.write(data, live);
    batch.liveCount = live;
    batch.changed = true;
    // Track centre from the first particle (positions are world-space already).
    if (data.length >= 3) batch.centre = [data[0], data[1], data[2]];
  }

  removeBatch(h: ParticleBatchHandle): void {
    const batch = this.batches.get(h.key);
    if (!batch) return;
    batch.ring.dispose();
    batch.removed = true;
    batch.liveCount = 0;
    this.batches.delete(h.key);
  }

  /* ---------------- transparent-phase draw ---------------- */

  transparentItems(ctx: FrameContributorContext): TransparentQueueItem[] {
    this.frameDiagnostics = { drawCalls: 0, instancesDrawn: 0, errors: [] };
    this.frameDepth = resolveSceneDepth(ctx);
    this.frameOutputColorSpace = resolveOutputColorSpace(ctx);
    if (this.frameDepth.pendingNote) this.note("SOFT_DEPTH_PENDING", null, "scene depth is the C-01 stub; soft particles are off");

    const live: BatchState[] = [];
    for (const batch of this.batches.values()) {
      if (batch.removed || batch.liveCount === 0 || batch.buffer === null) continue;
      const res = resolveVfxBlend(batch.desc.blend, this.deviceHonoursBlendMode());
      if (res.degraded) {
        const id = consumeBlendFallbackReport(batch.key, res.degraded);
        if (id) this.note(res.degraded, null, `batch "${batch.key}" blend "${String(batch.desc.blend)}" emulated under the C-04 stub`);
      }
      if (res.skipped) continue;
      live.push(batch);
    }
    if (live.length === 0) return [];

    // View depth from the camera basis; additive batches draw last.
    const basis = cameraBasis(ctx);
    const additive: BatchState[] = [];
    const rest: BatchState[] = [];
    for (const b of live) {
      b.sortDepth = viewDepth(b.centre, basis);
      (b.desc.blend === "additive" ? additive : rest).push(b);
    }
    const order = this.sorter.sort(rest, basis);
    const items: TransparentQueueItem[] = [];

    // P6-T4: eligible batches divert into the half-res target when active.
    const lowResBatches = this.lowResEligible() ? [...Array.from(order, (i) => rest[i]), ...additive].filter((b) => b.desc.lowRes === true) : [];
    const lowResKeys = new Set(lowResBatches.map((b) => b.key));
    if (lowResBatches.length > 0) {
      const offscreen = this.lowResOffscreenItem(lowResBatches, ctx);
      if (offscreen) items.push(offscreen);
      this.frameDiagnostics = { ...this.frameDiagnostics, lowRes: { active: true, batches: lowResBatches.length } };
    }
    for (const i of order) if (!lowResKeys.has(rest[i].key)) items.push(this.queueItem(rest[i], ctx));
    for (const b of additive) if (!lowResKeys.has(b.key)) items.push(this.queueItem(b, ctx));
    if (lowResBatches.length > 0) {
      // Composite last: the low-res buffer already contains every diverted
      // batch merged in draw order, so it lands over the other transparents.
      items.push({
        sortDepth: Math.max(...lowResBatches.map((b) => b.sortDepth)),
        draw: () => this.lowResComposite(ctx)
      });
    }
    return items;
  }

  /** Half-res path engages only when the pass is enabled AND the device can
   *  report the bound target (needed to restore after the divert). */
  private lowResEligible(): boolean {
    const enabled = this.lowResManual ?? this.lowResAuto;
    if (!enabled) return false;
    if (typeof this.device.getRenderTarget !== "function") {
      if (!this.lowResUnsupportedWarned) {
        this.lowResUnsupportedWarned = true;
        this.note("LOWRES_UNSUPPORTED", null, "half-res particles need device.getRenderTarget(); staying at full res");
      }
      return false;
    }
    return true;
  }

  private lowResOffscreenItem(batches: readonly BatchState[], ctx: FrameContributorContext): TransparentQueueItem | null {
    if (this.lowRes === null) this.lowRes = new LowResParticleTarget(this.device);
    const lowRes = this.lowRes;
    return {
      sortDepth: Number.POSITIVE_INFINITY,
      draw: () => {
        const previous = this.device.getRenderTarget?.() ?? null;
        const target = lowRes.acquire(ctx.width, ctx.height);
        this.device.setRenderTarget(target);
        this.device.clear([0, 0, 0, 0]);
        for (const batch of batches) this.drawBatch(batch, ctx);
        this.device.setRenderTarget(previous);
      }
    };
  }

  private lowResComposite(ctx: FrameContributorContext): void {
    this.lowRes?.composite(this.frameDepth);
    this.frameDiagnostics.drawCalls += 1;
  }

  private queueItem(batch: BatchState, ctx: FrameContributorContext): TransparentQueueItem {
    return {
      sortDepth: batch.sortDepth,
      draw: () => this.drawBatch(batch, ctx)
    };
  }

  private drawBatch(batch: BatchState, ctx: FrameContributorContext): void {
    if (!batch.buffer || batch.liveCount === 0) return;
    const res = resolveVfxBlend(batch.desc.blend, this.deviceHonoursBlendMode());
    const quad = createParticleQuad();
    const vertexBuffer = quad.vertexBuffer.upload(this.device);
    const indexBuffer = quad.indexBuffer?.upload(this.device);
    const camera = ctx.camera;
    const depth = this.frameDepth;
    const softParticles = depth?.available === true && batch.desc.softDepth && depth.source.texture !== null;
    const defines: ParticleProgramDefines = {
      stretch: batch.desc.stretch,
      frameBlend: batch.desc.frameBlend,
      softParticles,
      blendAdditive: batch.desc.blend === "additive" && !res.additiveFallback,
      blendAdditiveFallback: res.additiveFallback,
      unpremultiplyOutput: res.unpremultiplyOutput,
      proceduralSoftDot: batch.desc.atlas.width <= 1,
      fogAnalytic: false
    };
    const shader = this.program(defines);
    const uniforms = new Map<string, import("../RenderDevice").UniformValue>([
      ["u_view", camera?.viewMatrix ?? IDENTITY],
      ["u_projection", camera?.projectionMatrix ?? IDENTITY],
      ["u_atlasRect", [0, 0, 1, 1]],
      ["u_grid", [1, 1]],
      ["u_atlas", new TextureBinding({ name: "u_atlas", texture: batch.desc.atlas })],
      ["u_nearFade", batch.desc.nearFade ?? 0.5],
      ["u_cameraNear", camera?.near ?? 0.1],
      ["u_softDistance", batch.desc.softDistance ?? 1],
      ["u_outputColorSpace", this.frameOutputColorSpace === "srgb" ? 1 : 0],
      ["u_fogColor", [0, 0, 0]],
      ["u_fogDensity", 0]
    ]);
    if (softParticles && depth) {
      uniforms.set("u_sceneDepth", new TextureBinding({ name: "u_sceneDepth", texture: depth.source.texture! }));
      uniforms.set("u_depthLinearize", [depth.source.linearize.near, depth.source.linearize.far, depth.source.linearize.orthographic ? 1 : 0, 0]);
    }
    this.device.draw({
      label: `prd07.particles.${batch.key}`,
      topology: "triangles",
      vertexBuffer,
      vertexFormat: quad.vertexBuffer.format,
      vertexCount: 4,
      indexBuffer: indexBuffer ?? undefined,
      indexType: indexBuffer ? quad.indexBuffer?.type : undefined,
      indexCount: indexBuffer ? 6 : undefined,
      instanceCount: batch.liveCount,
      instanceAttributes: particleInstanceAttributes(batch.buffer),
      shader,
      uniforms,
      renderState: res.renderState
    });
    this.frameDiagnostics.drawCalls += 1;
    this.frameDiagnostics.instancesDrawn += batch.liveCount;
  }

  private program(defines: ParticleProgramDefines): RenderShaderProgram {
    const key = particleProgramKey(defines);
    let shader = this.programs.get(key);
    if (!shader) {
      if (this.programs.size >= MAX_PARTICLE_PROGRAMS && !this.programLimitWarned) {
        this.programLimitWarned = true;
        this.note("VFX_PROGRAM_LIMIT", null, `particle program cache exceeds ${MAX_PARTICLE_PROGRAMS} define combinations`);
      }
      shader = this.device.createShaderProgram({
        label: key,
        vertex: particleVertexSource(defines),
        fragment: particleFragmentSource(defines),
        marker: PARTICLE_SHADER_MARKER
      });
      this.programs.set(key, shader);
    }
    return shader;
  }

  private deviceHonoursBlendMode(): boolean {
    if (this.honoursBlendMode === null) {
      // C-04 is still a stub on every shipping backend: `blendMode` is ignored
      // and `blend: true` lowers to alpha-over. "native-render-pipeline" is the
      // probe for a backend where named blends are real — extend it when C-04
      // lands an explicit capability. Until then the §6.2.7 fallback table
      // applies everywhere (honest degradation, reported once per key).
      this.honoursBlendMode = this.device.info.capabilities?.includes("native-render-pipeline") === true;
    }
    return this.honoursBlendMode;
  }

  private note(code: string, nodeId: string | null, message: string): void {
    this.frameDiagnostics.errors.push({ code, nodeId: nodeId ?? "", message });
  }

  get diagnostics(): ParticlePassDiagnostics {
    const counters = this.device.counters?.();
    return counters === undefined
      ? this.frameDiagnostics
      : { ...this.frameDiagnostics, deviceCounters: { readbacks: counters.readbacks } };
  }

  get batchCount(): number {
    return this.batches.size;
  }

  dispose(): void {
    for (const batch of this.batches.values()) batch.ring.dispose();
    this.batches.clear();
    for (const program of this.programs.values()) program.dispose?.();
    this.programs.clear();
    this.lowRes?.dispose();
    this.lowRes = null;
  }
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** 12 floats of the view matrix (3x4 basis) for sort/skip checks. */
function cameraBasis(ctx: FrameContributorContext): Float32Array {
  const m = ctx.camera?.viewMatrix;
  if (!m || m.length < 16) return new Float32Array(12);
  return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10], m[12], m[13], m[14]]);
}

/** View-space depth of a world point (positive = in front of the camera). */
function viewDepth(p: readonly [number, number, number], basis: Float32Array): number {
  // view-space z = row3·p + tz of the *view* matrix (column-major m[8..10], m[14]).
  const z = basis[6] * p[0] + basis[7] * p[1] + basis[8] * p[2] + basis[11];
  return -z;
}
