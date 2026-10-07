// PRD-07 P1-T4 — ParticleInstanceRing: after warm-up, repeated writes create
// no buffers (triple-buffered pow2 ring) and rotate across 3 slots.

import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { PARTICLE_INSTANCE_FLOATS, ParticleInstanceRing, particleInstanceAttributes } from "../../../../packages/rendering/src/vfx/ParticleInstanceLayout";

describe("P1-T4 instance ring", () => {
  it("creates exactly 3 buffers and reuses them for 1,000 writes", () => {
    const device = new MockRenderDevice();
    const ring = new ParticleInstanceRing(device);
    const data = new Float32Array(64 * PARTICLE_INSTANCE_FLOATS);
    ring.write(data, 64);
    ring.write(data, 64);
    ring.write(data, 64);
    expect(ring.buffersCreated).toBe(3);
    for (let i = 0; i < 1000; i++) ring.write(data, 64);
    expect(ring.buffersCreated).toBe(3);
    expect(ring.writes).toBe(1003);
  });

  it("grows by power of two when live exceeds capacity", () => {
    const ring = new ParticleInstanceRing(new MockRenderDevice());
    const data = new Float32Array(4096 * PARTICLE_INSTANCE_FLOATS);
    ring.write(data.subarray(0, 100 * 16), 100);
    expect(ring.particleCapacity).toBe(128);
    ring.write(data.subarray(0, 1000 * 16), 1000);
    expect(ring.particleCapacity).toBe(1024);
  });

  it("instance attributes describe the §6.2.1 layout (64-byte stride, divisor 1)", () => {
    const device = new MockRenderDevice();
    const buffer = device.createBuffer("vertex", 640);
    const attrs = particleInstanceAttributes(buffer);
    expect(attrs.map((a) => a.shaderName)).toEqual(["a_posSize", "a_velStretch", "a_color", "a_rotFrameMisc"]);
    expect(attrs.every((a) => a.stride === 64 && (a.divisor ?? 1) === 1 && a.components === 4)).toBe(true);
    expect(attrs.map((a) => a.offset)).toEqual([0, 16, 32, 48]);
  });
});
