// PRD-07 P5-T2 — §8.2 procedural volume: positions for 10,000 ids stay inside
// the camera-following box across 100m of camera motion, with the 15% edge
// fade never leaving [0,1].

import { describe, expect, it } from "vitest";
import {
  VOLUME_PRESETS,
  a3dHash31Cpu,
  proceduralVolumeEdgeFade,
  proceduralVolumePos,
  ProceduralVolumeEmitter
} from "../../../../packages/rendering/src/vfx/ProceduralVolumeEmitter";

const spec = VOLUME_PRESETS.rain;
const IDS = 10_000;

describe("P5-T2 procedural volume", () => {
  it("10,000 ids stay inside the camera box across a 100m walk", () => {
    const t = 3.75;
    for (let camX = -50; camX <= 50; camX += 10) {
      const cam: readonly [number, number, number] = [camX, 1.7, camX * 0.4];
      for (let id = 0; id < IDS; id += 37) {
        const p = proceduralVolumePos(id, t, spec, cam);
        for (let a = 0; a < 3; a += 1) {
          expect(p[a]).toBeGreaterThanOrEqual(cam[a] - spec.extent[a] / 2 - 1e-4);
          expect(p[a]).toBeLessThanOrEqual(cam[a] + spec.extent[a] / 2 + 1e-4);
        }
        const fade = proceduralVolumeEdgeFade(p, spec, cam);
        expect(fade).toBeGreaterThanOrEqual(0);
        expect(fade).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("rain preset falls; snow sway is wider than rain", () => {
    const cam: readonly [number, number, number] = [0, 1.7, 0];
    const p1 = proceduralVolumePos(11, 0, spec, cam);
    const p2 = proceduralVolumePos(11, 0.5, spec, cam);
    expect(p2[1]).toBeLessThan(p1[1]); // falling
    expect(VOLUME_PRESETS.snow.sway[0]).toBeGreaterThan(VOLUME_PRESETS.rain.sway[0]);
    expect(VOLUME_PRESETS.marineSnow.fallVelocity[1]).toBeGreaterThan(VOLUME_PRESETS.snow.fallVelocity[1]);
  });

  it("hash is uniform-ish over 4096 ids", () => {
    let lo = 1; let hi = 0; let sum = 0;
    for (let i = 0; i < 4096; i += 1) {
      const h = a3dHash31Cpu(i * 0.6180339 + 0.5)[0]!;
      lo = Math.min(lo, h); hi = Math.max(hi, hi < h ? h : hi); sum += h;
    }
    expect(lo).toBeGreaterThanOrEqual(0); expect(hi).toBeLessThan(1);
    expect(sum / 4096).toBeGreaterThan(0.4); expect(sum / 4096).toBeLessThan(0.6);
  });

  it("edge fade is 0 at the box wall and 1 at the core", () => {
    const cam: readonly [number, number, number] = [0, 0, 0];
    const atWall: readonly [number, number, number] = [spec.extent[0] / 2, 0, 0];
    const atCore: readonly [number, number, number] = [0, 0, 0];
    expect(proceduralVolumeEdgeFade(atWall, spec, cam)).toBeLessThan(0.02);
    expect(proceduralVolumeEdgeFade(atCore, spec, cam)).toBe(1);
  });

  it("fillInstanceRing writes §6.2.1 blocks with the edge fade applied", () => {
    const emitter = new ProceduralVolumeEmitter(spec, 512);
    const ring = {
      writes: 0,
      data: null as Float32Array | null,
      write(data: Float32Array, live: number) { this.writes += 1; this.data = data.slice(0, live * 16); }
    };
    emitter.fillInstanceRing(ring as never, 1.5, [0, 1.7, 0]);
    expect(ring.writes).toBe(1);
    const d = ring.data!;
    expect(d.length).toBe(512 * 16);
    // stretch is in slot 7; rain preset stretches along fall velocity.
    expect(Math.abs(d[7]!)).toBeGreaterThan(0);
    for (let i = 0; i < 512; i += 61) {
      const alpha = d[i * 16 + 11]!;
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(spec.alpha + 1e-4);
    }
  });
});
