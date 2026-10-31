/**
 * Chase camera and screen projection.
 *
 * C23: the camera used to be fixed at [0, 4.2, 9.5]. It now lags the drone sideways, looks into the bend ahead, widens
 * its field of view while boosting and shakes on hits. Reduced motion turns the kick and the shake off.
 * C7: the lock bracket used an invented projection that ignored the camera; `projectToScreen` uses the real pose.
 */
export type Vec3 = [number, number, number];

export interface CameraPose {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up?: readonly [number, number, number];
  /** Vertical field of view in degrees. */
  readonly fov: number;
}

export interface ScreenPoint {
  /** 0..1 across the canvas from the left edge. */
  x: number;
  /** 0..1 down the canvas from the top edge. */
  y: number;
  /** Distance along the view axis; <= 0 means behind the camera. */
  depth: number;
}

/** Perspective projection of a world point through `pose` for a canvas of aspect `width / height`. */
export function projectToScreen(pose: CameraPose, aspect: number, point: readonly [number, number, number], out: ScreenPoint): ScreenPoint {
  const [px, py, pz] = pose.position;
  const up = pose.up ?? [0, 1, 0];
  let fx = pose.target[0] - px, fy = pose.target[1] - py, fz = pose.target[2] - pz;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  // right = f × up, true up = right × f
  let rx = fy * up[2] - fz * up[1], ry = fz * up[0] - fx * up[2], rz = fx * up[1] - fy * up[0];
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  const vx = point[0] - px, vy = point[1] - py, vz = point[2] - pz;
  const depth = vx * fx + vy * fy + vz * fz;
  const t = Math.tan((pose.fov * Math.PI) / 360);
  const safe = depth > 1e-4 ? depth : 1e-4;
  out.x = ((vx * rx + vy * ry + vz * rz) / (safe * t * aspect) + 1) / 2;
  out.y = (1 - (vx * ux + vy * uy + vz * uz) / (safe * t)) / 2;
  out.depth = depth;
  return out;
}

export interface ChaseInputs {
  /** Drone position in the view frame. */
  readonly drone: readonly [number, number, number];
  /** Road point the camera looks at (about 18 m ahead, already placed on the bend). */
  readonly lookAt: readonly [number, number, number];
  readonly boosting: boolean;
  readonly hyper: boolean;
  readonly aspect: number;
  readonly reducedMotion: boolean;
}

/** Frame-time smoothing for the camera; the simulation never reads it. */
export class ChaseCamera {
  private x = 0;
  private y = 4.2;
  private kick = 0;
  private trauma = 0;
  private time = 0;
  readonly pose = { position: [0, 4.2, 9.5] as Vec3, target: [0, 1.8, -18] as Vec3, up: [0, 1, 0] as Vec3, fov: 68 };

  /** Add shake (0..1); trauma decays at 1.6 per second and the offset grows with its square. */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  reset(): void {
    this.x = 0; this.y = 4.2; this.kick = 0; this.trauma = 0;
  }

  update(dt: number, input: ChaseInputs): typeof this.pose {
    this.time += dt;
    const lag = 1 - Math.exp(-dt / 0.22);
    this.x += (input.drone[0] * 0.6 - this.x) * lag;
    this.y += (4.2 + (input.drone[1] - 1.55) * 0.45 - this.y) * lag;
    const wantKick = input.reducedMotion ? 0 : (input.hyper ? 9 : input.boosting ? 6 : 0);
    this.kick += (wantKick - this.kick) * (1 - Math.exp(-dt / 0.3));
    this.trauma = Math.max(0, this.trauma - 1.6 * dt);
    const shake = input.reducedMotion ? 0 : this.trauma * this.trauma * 0.35;
    const sx = shake * (Math.sin(this.time * 37.1) + 0.5 * Math.sin(this.time * 61.7));
    const sy = shake * (Math.sin(this.time * 43.3 + 1.3) + 0.5 * Math.sin(this.time * 71.9));
    // Portrait phones get a wider vertical field of view so the road keeps its width on screen.
    const baseFov = input.aspect < 0.8 ? 84 : 68;
    this.pose.position[0] = this.x + sx;
    this.pose.position[1] = this.y + sy;
    this.pose.position[2] = 9.5;
    this.pose.target[0] = input.lookAt[0] * 0.85 + sx * 0.5;
    this.pose.target[1] = input.lookAt[1];
    this.pose.target[2] = input.lookAt[2];
    this.pose.fov = baseFov + this.kick;
    return this.pose;
  }
}
