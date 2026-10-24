export type V3 = [number, number, number];

export interface ImpactBoxCollider {
  readonly kind: "box";
  readonly id: string;
  readonly center: readonly [number, number, number];
  readonly half: readonly [number, number, number];
  /** Rotation about Y in radians. */
  readonly yaw?: number;
  readonly tag?: string;
  readonly restitution?: number;
  readonly friction?: number;
}

export interface ImpactSphereCollider {
  readonly kind: "sphere";
  readonly id: string;
  readonly center: readonly [number, number, number];
  readonly radius: number;
  readonly tag?: string;
  readonly restitution?: number;
  readonly friction?: number;
}

export type ImpactCollider = ImpactBoxCollider | ImpactSphereCollider;

export interface ImpactBody {
  position: V3;
  velocity: V3;
  radius: number;
}

export interface Impact {
  readonly colliderId: string;
  readonly tag: string | undefined;
  readonly point: V3;
  /** Unit normal pointing out of the collider, towards the body. */
  readonly normal: V3;
  /** Approach speed along the normal before the response, m/s. */
  readonly speed: number;
  readonly impulse: number;
}

export interface ImpactWorldOptions {
  readonly colliders: readonly ImpactCollider[];
  readonly restitution?: number;
  readonly friction?: number;
  /** Contacts slower than this resolve but do not emit an event (resting contact). Default 0.5 m/s. */
  readonly eventMinSpeed?: number;
  readonly onImpact?: (impact: Impact) => void;
}

export interface ImpactWorld {
  step(body: ImpactBody, dt: number): Impact[];
  add(collider: ImpactCollider): void;
  remove(id: string): void;
  reset(): void;
}

interface Hit {
  readonly t: number;
  readonly normal: V3;
  readonly collider: ImpactCollider;
}

const EPS = 1e-9;

function rotY(v: readonly [number, number, number], yaw: number): V3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
}

function sweepBox(p: V3, d: V3, radius: number, box: ImpactBoxCollider): Hit | undefined {
  const yaw = box.yaw ?? 0;
  const rel: V3 = [p[0] - box.center[0], p[1] - box.center[1], p[2] - box.center[2]];
  const lp = rotY(rel, -yaw);
  const ld = rotY(d, -yaw);
  const h: V3 = [box.half[0] + radius, box.half[1] + radius, box.half[2] + radius];
  const inside = Math.abs(lp[0]) < h[0] && Math.abs(lp[1]) < h[1] && Math.abs(lp[2]) < h[2];
  if (inside) {
    let axis = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 3; i += 1) {
      const pen = h[i]! - Math.abs(lp[i]!);
      if (pen < best) {
        best = pen;
        axis = i;
      }
    }
    const n: V3 = [0, 0, 0];
    n[axis] = lp[axis]! >= 0 ? 1 : -1;
    return { t: 0, normal: rotY(n, yaw), collider: box };
  }
  let tmin = 0;
  let tmax = 1;
  let axisHit = -1;
  let sign = 1;
  for (let i = 0; i < 3; i += 1) {
    const o = lp[i]!;
    const dir = ld[i]!;
    if (Math.abs(dir) < EPS) {
      if (Math.abs(o) >= h[i]!) return undefined;
      continue;
    }
    let t1 = (-h[i]! - o) / dir;
    let t2 = (h[i]! - o) / dir;
    let s = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axisHit = i;
      sign = s;
    }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return undefined;
  }
  if (axisHit < 0) return undefined;
  const n: V3 = [0, 0, 0];
  n[axisHit] = sign;
  return { t: tmin, normal: rotY(n, yaw), collider: box };
}

function sweepSphere(p: V3, d: V3, radius: number, s: ImpactSphereCollider): Hit | undefined {
  const R = radius + s.radius;
  const m: V3 = [p[0] - s.center[0], p[1] - s.center[1], p[2] - s.center[2]];
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const c = m[0] * m[0] + m[1] * m[1] + m[2] * m[2] - R * R;
  if (c < 0) {
    const len = Math.hypot(m[0], m[1], m[2]) || 1;
    return { t: 0, normal: [m[0] / len, m[1] / len, m[2] / len], collider: s };
  }
  if (a < EPS) return undefined;
  const b = m[0] * d[0] + m[1] * d[1] + m[2] * d[2];
  if (b >= 0) return undefined;
  const disc = b * b - a * c;
  if (disc < 0) return undefined;
  const t = (-b - Math.sqrt(disc)) / a;
  if (t < 0 || t > 1) return undefined;
  const hit: V3 = [m[0] + d[0] * t, m[1] + d[1] * t, m[2] + d[2] * t];
  const len = Math.hypot(hit[0], hit[1], hit[2]) || 1;
  return { t, normal: [hit[0] / len, hit[1] / len, hit[2] / len], collider: s };
}

/**
 * Swept-sphere collision against static boxes (optionally yawed) and spheres. A body moving fast cannot
 * tunnel through a wall or gate; each new contact emits one `Impact` (continuous sliding does not repeat).
 * Box corners are treated as sharp expanded boxes (slightly conservative at corners).
 */
export function createImpactWorld(options: ImpactWorldOptions): ImpactWorld {
  const colliders = new Map<string, ImpactCollider>();
  for (const c of options.colliders) colliders.set(c.id, c);
  const baseRestitution = options.restitution ?? 0.2;
  const baseFriction = options.friction ?? 0.1;
  const eventMin = options.eventMinSpeed ?? 0.5;
  let touching = new Set<string>();

  return {
    add(c) {
      colliders.set(c.id, c);
    },
    remove(id) {
      colliders.delete(id);
      touching.delete(id);
    },
    reset() {
      touching = new Set();
    },
    step(body, dt) {
      const impacts: Impact[] = [];
      const now = new Set<string>();
      let remaining = dt;
      for (let iter = 0; iter < 4 && remaining > 0; iter += 1) {
        const d: V3 = [body.velocity[0] * remaining, body.velocity[1] * remaining, body.velocity[2] * remaining];
        let best: Hit | undefined;
        for (const c of colliders.values()) {
          const hit = c.kind === "box" ? sweepBox(body.position, d, body.radius, c) : sweepSphere(body.position, d, body.radius, c);
          if (hit !== undefined && (best === undefined || hit.t < best.t)) best = hit;
        }
        if (best === undefined) {
          body.position[0] += d[0];
          body.position[1] += d[1];
          body.position[2] += d[2];
          remaining = 0;
          break;
        }
        const skin = 1e-4;
        const tt = Math.max(0, best.t);
        body.position[0] += d[0] * tt + best.normal[0] * skin;
        body.position[1] += d[1] * tt + best.normal[1] * skin;
        body.position[2] += d[2] * tt + best.normal[2] * skin;
        const n = best.normal;
        const vn = body.velocity[0] * n[0] + body.velocity[1] * n[1] + body.velocity[2] * n[2];
        const approach = Math.max(0, -vn);
        const e = best.collider.restitution ?? baseRestitution;
        const mu = best.collider.friction ?? baseFriction;
        if (vn < 0) {
          const tx = body.velocity[0] - vn * n[0];
          const ty = body.velocity[1] - vn * n[1];
          const tz = body.velocity[2] - vn * n[2];
          const keep = Math.max(0, 1 - mu);
          body.velocity[0] = tx * keep - e * vn * n[0];
          body.velocity[1] = ty * keep - e * vn * n[1];
          body.velocity[2] = tz * keep - e * vn * n[2];
        }
        const id = best.collider.id;
        now.add(id);
        if (!touching.has(id) && approach >= eventMin) {
          const point: V3 = [body.position[0] - n[0] * body.radius, body.position[1] - n[1] * body.radius, body.position[2] - n[2] * body.radius];
          const impact: Impact = { colliderId: id, tag: best.collider.tag, point, normal: [n[0], n[1], n[2]], speed: approach, impulse: approach * (1 + e) };
          impacts.push(impact);
          options.onImpact?.(impact);
        }
        remaining *= 1 - tt;
        if (tt >= 1) break;
      }
      touching = now;
      return impacts;
    }
  };
}

export interface HitStop {
  trigger(ms: number): void;
  update(realDtSeconds: number): void;
  /** Multiply the simulation time step by this; 1 normally, near 0 during a hit-stop. */
  timeScale(): number;
  readonly active: boolean;
}

export function createHitStop(frozenScale = 0.02): HitStop {
  let remaining = 0;
  return {
    trigger(ms) {
      remaining = Math.max(remaining, Math.max(0, ms) / 1000);
    },
    update(dt) {
      remaining = Math.max(0, remaining - Math.max(0, dt));
    },
    timeScale() {
      return remaining > 0 ? frozenScale : 1;
    },
    get active() {
      return remaining > 0;
    }
  };
}

export interface CameraShake {
  add(trauma: number): void;
  update(dt: number): { readonly x: number; readonly y: number; readonly roll: number };
  readonly trauma: number;
}

/** Trauma-based shake: offset scales with trauma squared, decays linearly, deterministic (no Math.random). */
export function createCameraShake(options: { readonly decayPerSecond?: number; readonly maxOffset?: number; readonly maxRoll?: number } = {}): CameraShake {
  const decay = options.decayPerSecond ?? 1.6;
  const maxOffset = options.maxOffset ?? 0.12;
  const maxRoll = options.maxRoll ?? 0.04;
  let trauma = 0;
  let t = 0;
  return {
    add(amount) {
      trauma = Math.min(1, trauma + Math.max(0, amount));
    },
    update(dt) {
      t += Math.max(0, dt);
      trauma = Math.max(0, trauma - decay * Math.max(0, dt));
      const s = trauma * trauma;
      return {
        x: s * maxOffset * Math.sin(t * 61.3 + 1.7),
        y: s * maxOffset * Math.sin(t * 47.9 + 4.1),
        roll: s * maxRoll * Math.sin(t * 39.1 + 2.9)
      };
    },
    get trauma() {
      return trauma;
    }
  };
}

export interface ParticleBurst {
  readonly point: V3;
  readonly normal: V3;
  readonly count: number;
  readonly speed: number;
}

export interface ImpactFeedbackOptions {
  readonly hitStop?: HitStop;
  readonly shake?: CameraShake;
  /** Play a cue by name at a gain 0..1 (wire to a cue bank). */
  readonly cue?: (name: string, gain: number) => void;
  readonly cueName?: string;
  readonly particles?: (burst: ParticleBurst) => void;
  readonly onDamage?: (amount: number, impact: Impact) => void;
  /** Impact speed (m/s) that maps to full strength. Default 12. */
  readonly fullSpeed?: number;
  /** Hit-stop duration range in ms. Defaults 30 to 80. */
  readonly hitStopMs?: readonly [number, number];
  readonly damagePerSpeed?: number;
  readonly minSpeed?: number;
}

export interface ImpactFeedbackResult {
  readonly strength: number;
  readonly hitStopMs: number;
  readonly trauma: number;
  readonly damage: number;
  readonly particleCount: number;
}

/** The standard feedback bundle for a solid hit: hit-stop, camera shake, sound, particles and damage, scaled by speed. */
export function createImpactFeedback(options: ImpactFeedbackOptions): { handle(impact: Impact): ImpactFeedbackResult } {
  const full = options.fullSpeed ?? 12;
  const [msLo, msHi] = options.hitStopMs ?? [30, 80];
  const minSpeed = options.minSpeed ?? 0.5;
  return {
    handle(impact) {
      const strength = Math.max(0, Math.min(1, impact.speed / full));
      if (impact.speed < minSpeed) return { strength, hitStopMs: 0, trauma: 0, damage: 0, particleCount: 0 };
      const hitStopMs = msLo + (msHi - msLo) * strength;
      const trauma = 0.2 + 0.8 * strength;
      const damage = (options.damagePerSpeed ?? 0) * impact.speed;
      const particleCount = Math.round(4 + 28 * strength);
      options.hitStop?.trigger(hitStopMs);
      options.shake?.add(trauma);
      if (options.cue !== undefined) options.cue(options.cueName ?? "impact", 0.25 + 0.75 * strength);
      options.particles?.({ point: impact.point, normal: impact.normal, count: particleCount, speed: 1 + 5 * strength });
      if (damage > 0) options.onDamage?.(damage, impact);
      return { strength, hitStopMs, trauma, damage, particleCount };
    }
  };
}
