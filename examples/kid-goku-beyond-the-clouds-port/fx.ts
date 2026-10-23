/**
 * Pooled particles for the Cloud Runner: additive sparkles / rings / ki trails and alpha dust / spray puffs, each one
 * `topology: "points"` mesh whose attributes are rewritten every frame (SG-05 partial uploads).
 */
import { geometry, material, type AuraApp } from "@aura3d/engine";
import { glowSpec, puffSpec } from "./materials";
import { hex } from "./mesh";
import type { V3 } from "./course";

interface P { life: number; max: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; g: number; drag: number; size: number; grow: number; r: number; gr: number; b: number; fade: number }

class Pool {
  readonly p: P[];
  head = 0;
  readonly pos: Float32Array; readonly tone: Float32Array; readonly size: Float32Array; readonly alpha: Float32Array;
  constructor(readonly cap: number) {
    this.p = Array.from({ length: cap }, () => ({ life: 0, max: 1, x: 0, y: -1e4, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, size: 0, grow: 0, r: 1, gr: 1, b: 1, fade: 1 }));
    this.pos = new Float32Array(cap * 3); this.tone = new Float32Array(cap * 3).fill(1); this.size = new Float32Array(cap); this.alpha = new Float32Array(cap);
    for (let i = 0; i < cap; i++) this.pos[i * 3 + 1] = -1e4;
  }
  spawn(): P { const q = this.p[this.head]!; this.head = (this.head + 1) % this.cap; return q; }
  step(dt: number): void {
    for (let i = 0; i < this.cap; i++) {
      const q = this.p[i]!;
      if (q.life > 0) {
        q.life -= dt;
        const k = Math.max(0, q.life / q.max);
        q.vy -= q.g * dt;
        const d = Math.max(0, 1 - q.drag * dt);
        q.vx *= d; q.vy *= d; q.vz *= d;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        q.size += q.grow * dt;
        this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
        this.tone[i * 3] = q.r; this.tone[i * 3 + 1] = q.gr; this.tone[i * 3 + 2] = q.b;
        this.size[i] = q.size;
        this.alpha[i] = q.fade * Math.min(1, k * 2.4) * Math.min(1, (1 - k) * 12);
      } else { this.pos[i * 3 + 1] = -1e4; this.alpha[i] = 0; }
    }
  }
}

export class Fx {
  private glow = new Pool(520);
  private puff = new Pool(260);
  private rnd = (() => { let s = 4242; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296); })();

  addTo(builder: { add(n: unknown): unknown }): void {
    for (const [id, pool, spec] of [["fx-glow", this.glow, glowSpec()], ["fx-puff", this.puff, puffSpec()]] as const) {
      builder.add(geometry.custom(geometry.dynamic({
        positions: pool.pos.slice(), topology: "points",
        attributes: { tone: { itemSize: 3, data: pool.tone.slice() }, aSize: { itemSize: 1, data: pool.size.slice() }, aAlpha: { itemSize: 1, data: pool.alpha.slice() } }
      }), { name: id, material: material.custom(spec) }).runtime({ id }));
    }
  }

  private emit(pool: Pool, pos: V3, dir: V3, spread: number, speed: number, size: number, grow: number, life: number, color: readonly [number, number, number], g: number, drag = 1.2, fade = 1): void {
    const q = pool.spawn(), r = this.rnd;
    const a = r() * Math.PI * 2, e = r() * 1.6 - 0.4, v = speed * (0.35 + r() * 0.65);
    q.x = pos[0]; q.y = pos[1]; q.z = pos[2];
    q.vx = dir[0] * v + Math.cos(a) * Math.cos(e) * spread * v; q.vy = dir[1] * v + Math.sin(e) * spread * v + 0.15 * speed; q.vz = dir[2] * v + Math.sin(a) * Math.cos(e) * spread * v;
    q.life = q.max = life * (0.65 + r() * 0.5); q.g = g; q.drag = drag; q.size = size * (0.7 + r() * 0.7); q.grow = grow;
    q.r = color[0]; q.gr = color[1]; q.b = color[2]; q.fade = fade;
  }

  /** Sparks / ki burst. `strength` ~ 0.4 (tiny) .. 2.4 (big). */
  burst(pos: V3, up: V3, colorHex: string, count: number, strength = 1): void {
    const c = hexSrgb(colorHex);
    for (let i = 0; i < count; i++) this.emit(this.glow, pos, up, 1, 3.4 * strength, 0.34 * strength + 0.1, -0.06, 0.55 + 0.25 * strength, c, 4.5, 1.6);
  }
  /** Expanding ring of glow in the plane perpendicular to `up`. */
  ring(pos: V3, up: V3, colorHex: string, size = 1): void {
    const c = hexSrgb(colorHex), n = 22;
    const ax: V3 = Math.abs(up[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const t1: V3 = norm(cross(up, ax)), t2: V3 = cross(up, t1);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const dir: V3 = [t1[0] * ca + t2[0] * sa, t1[1] * ca + t2[1] * sa, t1[2] * ca + t2[2] * sa];
      const q = this.glow.spawn();
      q.x = pos[0] + up[0] * 0.15; q.y = pos[1] + up[1] * 0.15; q.z = pos[2] + up[2] * 0.15;
      q.vx = dir[0] * 4.5 * size; q.vy = dir[1] * 4.5 * size; q.vz = dir[2] * 4.5 * size;
      q.life = q.max = 0.5; q.g = 0; q.drag = 3.2; q.size = 0.34 * size; q.grow = -0.2; q.r = c[0]; q.gr = c[1]; q.b = c[2]; q.fade = 0.9;
    }
  }
  /** Lumpy dust / spray puffs. */
  dust(pos: V3, up: V3, count: number, colorHex = "#e8d6b0", size = 1, rise = 1): void {
    const c = hexSrgb(colorHex);
    for (let i = 0; i < count; i++) this.emit(this.puff, pos, up, 1.2, 1.6 * rise, 0.9 * size, 1.5 * size, 0.7 + this.rnd() * 0.4, c, -0.4, 2.2, 0.55);
  }
  /** One streak point behind a moving body (ki trail / cloud wisps). */
  wisp(pos: V3, colorHex = "#fff3c0", size = 0.5): void {
    const c = hexSrgb(colorHex);
    const q = this.glow.spawn();
    q.x = pos[0] + (this.rnd() - 0.5) * 0.5; q.y = pos[1] + (this.rnd() - 0.5) * 0.4; q.z = pos[2] + (this.rnd() - 0.5) * 0.5;
    q.vx = q.vy = q.vz = 0; q.life = q.max = 0.5; q.g = 0; q.drag = 0; q.size = size; q.grow = -0.4; q.r = c[0]; q.gr = c[1]; q.b = c[2]; q.fade = 0.7;
  }

  update(dt: number, app: AuraApp): void {
    this.glow.step(dt); this.puff.step(dt);
    for (const [id, pool] of [["fx-glow", this.glow], ["fx-puff", this.puff]] as const) {
      const n = app.nodes.require(id);
      n.updateAttribute?.("position", { array: pool.pos, offset: 0 });
      n.updateAttribute?.("tone", { array: pool.tone, offset: 0 });
      n.updateAttribute?.("aSize", { array: pool.size, offset: 0 });
      n.updateAttribute?.("aAlpha", { array: pool.alpha, offset: 0 });
    }
  }
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** Shader colours are authored as linear-ish; use sRGB-decoded values so brights stay bright. */
function hexSrgb(h: string): [number, number, number] {
  const v = parseInt(h.replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
void hex;
