// PRD-07 P2-T6 — mesh particles (§6.2.11): instanced draw of one mesh with a
// CPU sim (gravity, drag, spin, ground bounce, sleep). Instance transforms are
// built here as a column-major mat4 per instance — never via
// `createProductionInstanceTransforms` (that path lost per-instance scale:
// E17 regression, index.ts:14747-14754).

export type AuraVec3 = readonly [number, number, number];
export type AuraVec4 = readonly [number, number, number, number];

export interface MeshParticleSpawn {
  readonly position: AuraVec3;
  readonly velocity?: AuraVec3;
  /** Axis-angle rotation axis + radians/second magnitude via `spin`. */
  readonly spinAxis?: AuraVec3;
  readonly spin?: number;
  /** Uniform per-instance scale — must survive into the instance mat4 (E17). */
  readonly scale?: number;
  readonly color?: AuraVec4;
  readonly emissive?: AuraVec3;
  readonly life?: number;
}

export interface MeshParticleBatchOptions {
  readonly capacity: number;
  readonly gravity?: number;
  readonly drag?: number;
  readonly spinRate?: number;
  /** Ground plane height; particles bounce here (default −Infinity = off). */
  readonly groundY?: number;
  readonly restitution?: number;
  readonly seed?: number;
}

interface MeshParticle {
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  qx: number; qy: number; qz: number; qw: number;
  ax: number; ay: number; az: number; // spin axis (unit)
  spin: number;
  scale: number;
  color: AuraVec4;
  emissive: AuraVec3;
  age: number;
  life: number;
  asleep: boolean;
  alive: boolean;
}

const SLEEP_SPEED2 = 0.02 * 0.02;
const SLEEP_SECONDS = 0.5;

/** 23 floats per instance: mat4(16) + color(4) + emissive(3). */
export const MESH_INSTANCE_FLOATS = 23;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MeshParticleBatch {
  readonly capacity: number;
  private readonly particles: MeshParticle[] = [];
  private readonly gravity: number;
  private readonly drag: number;
  private readonly spinRate: number;
  private readonly groundY: number;
  private readonly restitution: number;
  private readonly rng: () => number;
  private readonly scratch = new Float32Array(0);

  constructor(options: MeshParticleBatchOptions) {
    this.capacity = Math.max(1, options.capacity);
    this.gravity = options.gravity ?? -9.8;
    this.drag = options.drag ?? 0.1;
    this.spinRate = options.spinRate ?? 1;
    this.groundY = options.groundY ?? Number.NEGATIVE_INFINITY;
    this.restitution = options.restitution ?? 0.35;
    this.rng = mulberry32(options.seed ?? 0x9e3779b9);
  }

  get liveCount(): number {
    let n = 0;
    for (const p of this.particles) if (p.alive) n++;
    return n;
  }

  spawn(options: MeshParticleSpawn): boolean {
    let p = this.particles.find((q) => !q.alive);
    if (!p) {
      if (this.particles.length >= this.capacity) return false;
      p = {
        px: 0, py: 0, pz: 0,
        vx: 0, vy: 0, vz: 0,
        qx: 0, qy: 0, qz: 0, qw: 1,
        ax: 0, ay: 1, az: 0,
        spin: 0, scale: 1,
        color: [1, 1, 1, 1],
        emissive: [0, 0, 0],
        age: 0, life: 1, asleep: false, alive: false
      };
      this.particles.push(p);
    }
    p.px = options.position[0]; p.py = options.position[1]; p.pz = options.position[2];
    const v = options.velocity ?? [0, 0, 0];
    p.vx = v[0]; p.vy = v[1]; p.vz = v[2];
    const axis = options.spinAxis ?? [0, 1, 0];
    const al = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    p.ax = axis[0] / al; p.ay = axis[1] / al; p.az = axis[2] / al;
    p.spin = options.spin ?? this.spinRate;
    p.scale = options.scale ?? 1;
    p.color = options.color ?? [1, 1, 1, 1];
    p.emissive = options.emissive ?? [0, 0, 0];
    p.age = 0;
    p.life = options.life ?? Number.POSITIVE_INFINITY;
    p.asleep = false;
    p.alive = true;
    p.qx = 0; p.qy = 0; p.qz = 0; p.qw = 1;
    return true;
  }

  step(dt: number): void {
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      if (p.asleep) continue;
      const dragF = Math.max(0, 1 - this.drag * dt);
      p.vx *= dragF;
      p.vz *= dragF;
      p.vy = p.vy * dragF + this.gravity * dt;
      p.px += p.vx * dt;
      p.py += p.vy * dt;
      p.pz += p.vz * dt;
      // Ground bounce + friction
      if (p.py <= this.groundY) {
        p.py = this.groundY;
        if (p.vy < 0) p.vy = -p.vy * this.restitution;
        p.vx *= 0.7;
        p.vz *= 0.7;
        p.spin *= 0.8;
      }
      // Sleep when slow on the ground.
      const speed2 = p.vx * p.vx + p.vy * p.vy + p.vz * p.vz;
      if (p.py <= this.groundY + 1e-3 && speed2 < SLEEP_SPEED2) {
        p.asleep = true;
      }
      // Spin: quaternion multiply by axis-angle(p.spin·dt).
      const half = (p.spin * dt) / 2;
      const s = Math.sin(half);
      const wx = p.ax * s, wy = p.ay * s, wz = p.az * s, ww = Math.cos(half);
      const qx = p.qw * wx + p.qx * ww + p.qy * wz - p.qz * wy;
      const qy = p.qw * wy - p.qx * wz + p.qy * ww + p.qz * wx;
      const qz = p.qw * wz + p.qx * wy - p.qy * wx + p.qz * ww;
      const qw = p.qw * ww - p.qx * wx - p.qy * wy - p.qz * wz;
      const ql = Math.hypot(qx, qy, qz, qw) || 1;
      p.qx = qx / ql; p.qy = qy / ql; p.qz = qz / ql; p.qw = qw / ql;
    }
  }

  /**
   * Column-major mat4 per live instance (rotation·scale + translation) then
   * rgba colour + rgb emissive. THIS is the only transform source — the mesh
   * pass never calls `createProductionInstanceTransforms` (E17).
   */
  instanceData(out: Float32Array): number {
    let i = 0;
    for (const p of this.particles) {
      if (!p.alive) continue;
      const o = i * MESH_INSTANCE_FLOATS;
      const { qx, qy, qz, qw } = p;
      const s = p.scale;
      // quaternion → rotation matrix (column-major), pre-scaled
      const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
      const xx = qx * x2, xy = qx * y2, xz = qx * z2;
      const yy = qy * y2, yz = qy * z2, zz = qz * z2;
      const wx = qw * x2, wy = qw * y2, wz = qw * z2;
      out[o + 0] = (1 - (yy + zz)) * s;
      out[o + 1] = (xy + wz) * s;
      out[o + 2] = (xz - wy) * s;
      out[o + 3] = 0;
      out[o + 4] = (xy - wz) * s;
      out[o + 5] = (1 - (xx + zz)) * s;
      out[o + 6] = (yz + wx) * s;
      out[o + 7] = 0;
      out[o + 8] = (xz + wy) * s;
      out[o + 9] = (yz - wx) * s;
      out[o + 10] = (1 - (xx + yy)) * s;
      out[o + 11] = 0;
      out[o + 12] = p.px;
      out[o + 13] = p.py;
      out[o + 14] = p.pz;
      out[o + 15] = 1;
      out[o + 16] = p.color[0];
      out[o + 17] = p.color[1];
      out[o + 18] = p.color[2];
      out[o + 19] = p.color[3];
      out[o + 20] = p.emissive[0];
      out[o + 21] = p.emissive[1];
      out[o + 22] = p.emissive[2];
      i++;
    }
    return i;
  }

  clear(): void {
    this.particles.length = 0;
  }
}
