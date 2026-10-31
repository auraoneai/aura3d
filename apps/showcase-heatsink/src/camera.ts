/**
 * Chase camera and screen projection.
 *
 * C23: the camera used to be fixed at [0, 4.2, 9.5]. It now lags the drone sideways, looks into the bend ahead, widens
 * its field of view while boosting and shakes on hits. Reduced motion turns the kick and the shake off.
 * C7: the lock bracket used an invented projection that ignored the camera; `projectToScreen` uses the real pose.
 * GU47 HS-17: fov 62 (portrait 84), rest height 3.2 m and distance 8.2 m; the camera banks up to 6 degrees with the
 *   drone's lateral speed; the countdown cuts through three shots (one per digit), the results screen orbits the drone
 *   and the title holds a front three-quarter pose more than 4 m from the chase pose. Reduced motion: no bank, no
 *   countdown shots (chase throughout), a still results pose instead of the orbit.
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
  /** HS-17 shot (default the chase). */
  readonly shot?: CameraShot;
}

/** HS-17 framing: the chase, a countdown shot per digit (3, 2, 1), the results orbit, the title pose. */
export type CameraShot =
  | { readonly kind: "chase" }
  | { readonly kind: "countdown"; readonly digit: number }
  | { readonly kind: "results"; readonly seconds: number }
  | { readonly kind: "title" };

/** Chase rest pose and field of view (HS-17). */
export const CHASE = { y: 3.2, z: 8.2, fov: 62, portraitFov: 84 } as const;
/** Bank: roll in radians per metre per second of lateral camera speed, capped at 6 degrees, and its smoothing time. */
export const BANK = { perMetrePerSecond: 0.02, max: (6 * Math.PI) / 180, seconds: 0.25 } as const;
/** Results orbit radius, height and speed (radians per second). */
export const RESULTS_ORBIT = { radius: 9, height: 2.6, speed: 0.3 } as const;
/**
 * Title: low rear three-quarter pose relative to the drone (more than 4 m from the chase pose), aimed down the track at
 * `TITLE_AIM`. GU47 phase 3: the old front three-quarter pose looked back along +Z, where the world has no skyline, arch
 * or rivals (the city is authored ahead of the drone), so the card frame showed an empty sky and a wall.
 */
export const TITLE_OFFSET: readonly [number, number, number] = [-3.4, 1.3, 5.2];
/** Title aim point relative to the drone: down the track past the drone, so the start gantry, arch and skyline frame it. */
export const TITLE_AIM: readonly [number, number, number] = [1.6, 0.9, -16];
/** Countdown shots relative to the drone, by digit: low front three-quarter, flank, high behind. */
export const COUNTDOWN_SHOTS: Readonly<Record<number, { readonly offset: readonly [number, number, number]; readonly fov: number }>> = {
  3: { offset: [-4.8, 0.6, -6.2], fov: 50 },
  2: { offset: [7.5, 1.8, 0.6], fov: 54 },
  1: { offset: [0, 6.5, 11.5], fov: 60 }
};

/**
 * Pose of a non-chase shot around the drone (pure; unit-tested). Returns null for the chase, for countdown digits
 * outside 1..3, and for the countdown on reduced motion.
 */
export function shotPose(shot: CameraShot, drone: readonly [number, number, number], reducedMotion: boolean): { position: Vec3; target: Vec3; fov: number } | null {
  const target: Vec3 = [drone[0], drone[1] + 0.2, drone[2]];
  switch (shot.kind) {
    case "countdown": {
      const s = COUNTDOWN_SHOTS[shot.digit];
      if (!s || reducedMotion) return null;
      return { position: [drone[0] + s.offset[0], drone[1] + s.offset[1], drone[2] + s.offset[2]], target, fov: s.fov };
    }
    case "results": {
      const a = reducedMotion ? 0.7 : 0.7 + shot.seconds * RESULTS_ORBIT.speed;
      return { position: [drone[0] + Math.sin(a) * RESULTS_ORBIT.radius, drone[1] + RESULTS_ORBIT.height, drone[2] + Math.cos(a) * RESULTS_ORBIT.radius], target, fov: 50 };
    }
    case "title":
      return { position: [drone[0] + TITLE_OFFSET[0], drone[1] + TITLE_OFFSET[1], drone[2] + TITLE_OFFSET[2]], target: [drone[0] + TITLE_AIM[0], drone[1] + TITLE_AIM[1], drone[2] + TITLE_AIM[2]], fov: 52 };
    default:
      return null;
  }
}

/** Frame-time smoothing for the camera; the simulation never reads it. */
export class ChaseCamera {
  private x = 0;
  private y: number = CHASE.y;
  private roll = 0;
  private lastShot = "chase";
  /** True on the frame a shot starts (main.ts passes `cut: true` so the controller does not blend across). */
  cut = false;
  private kick = 0;
  private trauma = 0;
  private time = 0;
  readonly pose = { position: [0, CHASE.y, CHASE.z] as Vec3, target: [0, 1.8, -18] as Vec3, up: [0, 1, 0] as Vec3, roll: 0, fov: CHASE.fov as number };

  /** Add shake (0..1); trauma decays at 1.6 per second and the offset grows with its square. */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  reset(): void {
    this.x = 0; this.y = CHASE.y; this.kick = 0; this.trauma = 0; this.roll = 0; this.lastShot = "chase";
  }

  update(dt: number, input: ChaseInputs): typeof this.pose {
    this.time += dt;
    const lag = 1 - Math.exp(-dt / 0.22);
    const prevX = this.x;
    this.x += (input.drone[0] * 0.6 - this.x) * lag;
    this.y += (CHASE.y + (input.drone[1] - 1.55) * 0.45 - this.y) * lag;
    // HS-17 bank: roll against the lateral camera speed, capped at 6 degrees, smoothed; none on reduced motion.
    const lateral = dt > 0 ? (this.x - prevX) / dt : 0;
    const wantRoll = input.reducedMotion ? 0 : Math.max(-BANK.max, Math.min(BANK.max, -lateral * BANK.perMetrePerSecond));
    this.roll += (wantRoll - this.roll) * (1 - Math.exp(-dt / BANK.seconds));
    const wantKick = input.reducedMotion ? 0 : (input.hyper ? 9 : input.boosting ? 6 : 0);
    this.kick += (wantKick - this.kick) * (1 - Math.exp(-dt / 0.3));
    this.trauma = Math.max(0, this.trauma - 1.6 * dt);
    const shake = input.reducedMotion ? 0 : this.trauma * this.trauma * 0.35;
    const sx = shake * (Math.sin(this.time * 37.1) + 0.5 * Math.sin(this.time * 61.7));
    const sy = shake * (Math.sin(this.time * 43.3 + 1.3) + 0.5 * Math.sin(this.time * 71.9));
    // Portrait phones get a wider vertical field of view so the road keeps its width on screen.
    const baseFov = input.aspect < 0.8 ? CHASE.portraitFov : CHASE.fov;
    const shot = input.shot ?? { kind: "chase" as const };
    const framed = shotPose(shot, input.drone, input.reducedMotion);
    const shotKey = framed ? (shot.kind === "countdown" ? `countdown-${shot.digit}` : shot.kind) : "chase";
    this.cut = shotKey !== this.lastShot;
    this.lastShot = shotKey;
    if (framed) {
      this.pose.position[0] = framed.position[0]; this.pose.position[1] = framed.position[1]; this.pose.position[2] = framed.position[2];
      this.pose.target[0] = framed.target[0]; this.pose.target[1] = framed.target[1]; this.pose.target[2] = framed.target[2];
      this.pose.fov = input.aspect < 0.8 ? framed.fov + (CHASE.portraitFov - CHASE.fov) : framed.fov;
      this.setRoll(0);
      return this.pose;
    }
    this.pose.position[0] = this.x + sx;
    this.pose.position[1] = this.y + sy;
    this.pose.position[2] = CHASE.z;
    this.pose.target[0] = input.lookAt[0] * 0.85 + sx * 0.5;
    this.pose.target[1] = input.lookAt[1];
    this.pose.target[2] = input.lookAt[2];
    this.pose.fov = baseFov + this.kick;
    this.setRoll(this.roll);
    return this.pose;
  }

  /** Roll about the view axis; `up` is the rolled up vector (approximate: the view axis is close to -Z). */
  private setRoll(roll: number): void {
    this.pose.roll = roll;
    this.pose.up[0] = Math.sin(roll);
    this.pose.up[1] = Math.cos(roll);
    this.pose.up[2] = 0;
  }
}
