// PRD-07 P1-T4 — particle instance layout (PRD-07 §6.2.1).
// 16 floats (64 bytes) per particle, four vec4 instance attributes:
//   a_posSize     xyz = world position,        w = size in world units
//   a_velStretch  xyz = velocity,              w = stretch factor (speed-scaled)
//   a_color       rgb = linear HDR colour,     a = alpha
//   a_rotFrameMisc x = rotation rad, y = frame, z = near-fade seed, w = normal-vs-view blend

import type { InstanceVertexAttribute, RenderBuffer, RenderDevice } from "../RenderDevice";
import { Geometry } from "../Geometry";
import { IndexBuffer } from "../IndexBuffer";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";

export const PARTICLE_INSTANCE_FLOATS = 16;
export const PARTICLE_INSTANCE_BYTES = PARTICLE_INSTANCE_FLOATS * 4;

export const PARTICLE_INSTANCE_STRIDE = PARTICLE_INSTANCE_BYTES;

/** Vec4 instance attributes at divisor 1, in §6.2.1 order. */
export function particleInstanceAttributes(buffer: RenderBuffer): readonly InstanceVertexAttribute[] {
  return [
    { buffer, shaderName: "a_posSize", components: 4, offset: 0, stride: PARTICLE_INSTANCE_STRIDE, divisor: 1 },
    { buffer, shaderName: "a_velStretch", components: 4, offset: 16, stride: PARTICLE_INSTANCE_STRIDE, divisor: 1 },
    { buffer, shaderName: "a_color", components: 4, offset: 32, stride: PARTICLE_INSTANCE_STRIDE, divisor: 1 },
    { buffer, shaderName: "a_rotFrameMisc", components: 4, offset: 48, stride: PARTICLE_INSTANCE_STRIDE, divisor: 1 }
  ];
}

export const PARTICLE_QUAD_FORMAT = new VertexFormat(
  [{ semantic: "position", components: 2, offset: 0, shaderName: "a_corner" }],
  8
);

let cachedQuad: Geometry | null = null;

/**
 * Shared two-triangle billboard quad: a_corner in (-1,-1)..(1,1), indexed.
 * Cached per process; `disposeParticleQuad` frees it (context-loss rebuilds
 * re-create through the same call).
 */
export function createParticleQuad(): Geometry {
  if (cachedQuad) return cachedQuad;
  const corners = new VertexBuffer(PARTICLE_QUAD_FORMAT, 4);
  corners.setAttribute(0, "position", [-1, -1]);
  corners.setAttribute(1, "position", [1, -1]);
  corners.setAttribute(2, "position", [1, 1]);
  corners.setAttribute(3, "position", [-1, 1]);
  cachedQuad = new Geometry(corners, new IndexBuffer([0, 1, 2, 0, 2, 3]), "triangles", {
    min: [-1, -1, 0],
    max: [1, 1, 0]
  });
  return cachedQuad;
}

export function disposeParticleQuad(): void {
  cachedQuad?.dispose();
  cachedQuad = null;
}

/**
 * Triple-buffered instance ring (§6.2.1): one write per frame per batch while
 * the draw of the previous frame may still be in flight. Capacity grows by
 * powers of two. `buffersCreated`/`writes` feed the `effects` diagnostics.
 */
export class ParticleInstanceRing {
  private buffers: RenderBuffer[] = [];
  private capacity = 0;
  private slot = -1;
  public buffersCreated = 0;
  public writes = 0;

  constructor(private readonly device: RenderDevice) {}

  get particleCapacity(): number {
    return this.capacity;
  }

  /** Buffer holding the most recent write (the one draws must source). */
  get current(): RenderBuffer | null {
    return this.slot >= 0 ? this.buffers[this.slot] : null;
  }

  /** Write `live` particles' instance data; returns the buffer the draw must source. */
  write(data: Float32Array, live: number): RenderBuffer {
    this.ensureCapacity(live);
    this.slot = (this.slot + 1) % this.buffers.length;
    const buffer = this.buffers[this.slot];
    const required = live * PARTICLE_INSTANCE_FLOATS;
    this.device.updateBuffer(buffer, 0, data.length > required ? data.subarray(0, required) : data);
    this.writes += 1;
    return buffer;
  }

  private ensureCapacity(live: number): void {
    if (live <= this.capacity && this.buffers.length === 3) return;
    const next = Math.max(64, 1 << Math.ceil(Math.log2(Math.max(1, live))));
    if (next === this.capacity && this.buffers.length === 3) return;
    for (const buffer of this.buffers) buffer.dispose();
    this.buffers = [
      this.device.createBuffer("vertex", next * PARTICLE_INSTANCE_BYTES),
      this.device.createBuffer("vertex", next * PARTICLE_INSTANCE_BYTES),
      this.device.createBuffer("vertex", next * PARTICLE_INSTANCE_BYTES)
    ];
    this.capacity = next;
    this.slot = 0;
    this.buffersCreated += 3;
  }

  dispose(): void {
    for (const buffer of this.buffers) buffer.dispose();
    this.buffers = [];
    this.capacity = 0;
    this.slot = -1;
  }
}
