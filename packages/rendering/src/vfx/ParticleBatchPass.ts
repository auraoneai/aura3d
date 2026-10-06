// PRD-07 P1-T5/P1-T8/P1-T9 — C-20 ParticleRenderHook implementation and the
// transparent-queue draw path. One instanced draw per batch; non-additive
// batches sorted back-to-front; additive batches appended last.

import type { RenderBuffer, RenderDevice, RenderShaderProgram } from "../RenderDevice";
import type { FrameContributorContext, TransparentQueueItem } from "../contracts/frameGraph";
import type { ParticleBatchDescriptor, ParticleBatchHandle } from "../contracts/particles";
import { TextureBinding } from "../TextureBinding";
import { ParticleInstanceRing, createParticleQuad, particleInstanceAttributes } from "./ParticleInstanceLayout";
import { consumeBlendFallbackReport, resolveVfxBlend } from "./BlendFallback";
import { ParticleSort } from "./ParticleSort";
import { resolveSceneDepth } from "./SceneDepthAdapter";
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
  private honoursBlendMode: boolean | null = null;

  constructor(private readonly device: RenderDevice) {}

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
    const depth = resolveSceneDepth(ctx);
    if (depth.pendingNote) this.note("SOFT_DEPTH_PENDING", null, "scene depth is the C-01 stub; soft particles are off");

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
    for (const i of order) items.push(this.queueItem(rest[i], ctx));
    for (const b of additive) items.push(this.queueItem(b, ctx));
    return items;
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
    const defines: ParticleProgramDefines = {
      stretch: batch.desc.stretch,
      frameBlend: batch.desc.frameBlend,
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
      ["u_nearFade", 0.5],
      ["u_cameraNear", camera?.near ?? 0.1],
      ["u_fogColor", [0, 0, 0]],
      ["u_fogDensity", 0]
    ]);
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
      // There is no named-blend-mode capability in the device capability list;
      // C-04's stub maps everything to alpha, so treat non-mock backends as
      // honoring the resolved BlendMode while the mock device (which cannot
      // blend) drives the additive fallback.
      this.honoursBlendMode = this.device.info.backend !== "mock";
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
