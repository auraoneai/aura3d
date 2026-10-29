/**
 * Slingshot Siege — destruction simulation over the public `physics.world`
 * (AuraPhysicsWorldController, Rapier-backed) surface, the same route pattern
 * Vault Breakers uses: a standalone world stepped by the game loop, poses
 * hand-synced to runtime visual nodes.
 *
 *  - pieces      fortress blocks; break when contact impulse > material breakImpulse
 *  - joints      authored fixed bonds between touching pieces + windmill
 *                motorised-hinges; snap above material jointStrength
 *  - gulls       targets; squash on projectile contact, heavy crush from
 *                above, or a hard landing
 *  - projectiles ammo balls; one mid-air ability per shot
 *  - debris      splinters/crumble/shards spawned on breaks — real bodies that
 *                bounce, settle, and retire to a spaced graveyard slot
 *  - windmills   motorised-hinge rotors that swat shots and can be smashed off
 *
 * Broken bodies can't be removed mid-level through the public controller, so
 * they teleport to a spaced graveyard below the stage and sleep — Rapier then
 * skips them in every later step. Level loads construct a fresh world, which
 * also gives Moon Roost its per-level gravity.
 */
import { physics } from "@aura3d/engine";
import { AMMO, type AmmoId } from "./ammo";
import { MATERIALS, type SiegeMaterial } from "./materials";
import type { LevelSpec, PieceSpec } from "./levels";

export type Vec3 = readonly [number, number, number];
export type SimWorld = ReturnType<typeof physics.world>;
export type SimBody = ReturnType<SimWorld["createBody"]>;
export type SimJoint = ReturnType<SimWorld["createConstraint"]>;

// ----------------------------------------------------------------- events --

export type SimEvent =
  | { readonly kind: "piece-broke"; readonly piece: number; readonly material: string; readonly at: Vec3; readonly points: number }
  | { readonly kind: "joint-snapped"; readonly at: Vec3; readonly points: number }
  | { readonly kind: "gull-squashed"; readonly gull: number; readonly at: Vec3; readonly points: number; readonly lastGull: boolean }
  | { readonly kind: "gull-scare"; readonly gull: number; readonly at: Vec3 }
  | { readonly kind: "shot-fired"; readonly ammo: AmmoId }
  | { readonly kind: "ability"; readonly ammo: AmmoId; readonly at: Vec3 }
  | { readonly kind: "windmill-smashed"; readonly at: Vec3; readonly points: number }
  | { readonly kind: "shot-settled"; readonly settledMs: number }
  | { readonly kind: "slowmo"; readonly at: Vec3 };

// ----------------------------------------------------------------- records --

export interface PieceRec {
  readonly index: number;
  readonly body: SimBody;
  readonly spec: PieceSpec;
  readonly material: SiegeMaterial;
  alive: boolean;
  joints: SimJoint[];
}

export interface GullRec {
  readonly index: number;
  readonly body: SimBody;
  alive: boolean;
  squashed: boolean;
  hopTimer: number;
  /** Seconds since squash — drives the flatten tween. */
  squashAge: number;
  /** World position where the squash happened — the body retires to the
   *  graveyard instantly, so the visual tween plays from this spot. */
  squashAt: Vec3;
}

export interface ProjectileRec {
  readonly body: SimBody;
  readonly ammo: AmmoId;
  abilityUsed: boolean;
  launchedAt: number;
  armed: boolean;
  anchorUntil: number;
  yankDone: boolean;
  dead: boolean;
  splashOnContact: boolean;
  /** Marks the egg-bomb payload (radial-pop on contact) vs the shell. */
  isBomb: boolean;
}

export interface DebrisRec {
  readonly body: SimBody;
  readonly slot: number;
  life: number;
  active: boolean;
  sx: number;
  sy: number;
  sz: number;
  matId: string;
}

export interface Puff {
  readonly slot: number;
  t: number;
  dur: number;
  at: Vec3;
  scale: number;
  kind: "dust" | "glass" | "fire" | "poof";
  active: boolean;
}

export interface WindmillRec {
  readonly rotor: SimBody;
  readonly joint: SimJoint;
  readonly anchor: Vec3;
  readonly bladeLength: number;
  broken: boolean;
}

export interface SimOptions {
  readonly level: LevelSpec;
  readonly seed?: number;
}

const GRAVITY_DEFAULT: Vec3 = [0, -9.81, 0];
const GULL_RADIUS = 0.26;
const GULL_MASS = 0.45;
const GULL_CRUSH_IMPULSE = 7;
const DEBRIS_SLOTS = 30;
const PUFF_SLOTS = 14;
const SETTLE_SPEED_SQ = 0.09;
const SETTLE_FRAMES = 46;
const SHOT_MAX_SECONDS = 6.5;
const IDENT: readonly [number, number, number, number] = [0, 0, 0, 1];
const HIDDEN: Vec3 = [0, -120, 0];

export interface VisualUpdate {
  readonly id: string;
  readonly position: Vec3;
  readonly rotation: readonly [number, number, number, number];
  readonly visible: boolean;
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function yawToQuat(yaw: number): readonly [number, number, number, number] {
  const s = Math.sin(yaw / 2);
  return [0, s, 0, Math.cos(yaw / 2)];
}

export class SiegeSim {
  world!: SimWorld;
  level!: LevelSpec;
  readonly seed: number;
  private pieces: PieceRec[] = [];
  private gulls: GullRec[] = [];
  private projectiles: ProjectileRec[] = [];
  private debris: DebrisRec[] = [];
  private puffs: Puff[] = [];
  private windmills: WindmillRec[] = [];
  private joints: { readonly handle: SimJoint; readonly a: number; readonly b: number; readonly strength: number; readonly at: Vec3 }[] = [];
  private events: SimEvent[] = [];
  private bodyToPiece = new Map<number, number>();
  private bodyToGull = new Map<number, number>();
  private bodyToDebris = new Map<number, number>();
  private bodyToWindmill = new Map<number, number>();
  private bodyToProjectile = new Map<number, number>();
  private allGameBodies: SimBody[] = [];
  private groundId = -1;
  private time = 0;
  private settleFrames = 0;
  private shotInFlight = false;
  private shotAge = 0;
  private rngState: number;
  private destructionScore = 0;
  private gullScore = 0;
  private slowmoFired = false;
  private retired = 0;
  /** Ambient time-scale (Moon Roost slow-mo chapter). */
  timeScaleAmbient = 1;
  /** Last-gull slow-mo finish; off for reduced-motion players. */
  slowmoEnabled = true;
  private slowmoScale = 1;
  private slowmoUntil = -1;
  /** Wall-clock age of the current shot (slow-mo must not stretch settle). */
  private shotAgeReal = 0;
  /** Wall-clock seconds the last-gull slow-mo has left. */
  private slowmoRealLeft = 0;

  constructor(options: SimOptions) {
    this.seed = (options.seed ?? 0x9e3779b9) >>> 0;
    this.rngState = this.seed;
    this.loadLevel(options.level);
  }

  // ------------------------------------------------------------- lifecycle --

  /** Build a fresh world for `level` — also resets gravity for Moon Roost. */
  loadLevel(level: LevelSpec): void {
    this.level = level;
    this.rngState = (this.seed + level.id * 7919) >>> 0;
    this.world = physics.world({
      gravity: [...(level.gravity ?? GRAVITY_DEFAULT)] as [number, number, number],
      fixedDelta: 1 / 60,
      solverIterations: 12,
      enableSleeping: true,
      seed: this.seed + level.id,
      continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 512, motionThreshold: 0.22, onSubstepLimit: "clamp" }
    });
    this.pieces = [];
    this.gulls = [];
    this.projectiles = [];
    this.debris = [];
    this.puffs = [];
    this.windmills = [];
    this.joints = [];
    this.events = [];
    this.bodyToPiece.clear();
    this.bodyToGull.clear();
    this.bodyToDebris.clear();
    this.bodyToWindmill.clear();
    this.bodyToProjectile.clear();
    this.allGameBodies = [];
    this.time = 0;
    this.settleFrames = 0;
    this.shotInFlight = false;
    this.destructionScore = 0;
    this.gullScore = 0;
    this.slowmoFired = false;
    this.slowmoScale = 1;
    this.slowmoUntil = -1;
    this.slowmoRealLeft = 0;
    this.shotAgeReal = 0;
    this.retired = 0;
    this.timeScaleAmbient = level.timeScale ?? 1;

    // Static stage: ground slab + four boundary walls + the launch knoll.
    this.groundId = this.staticBox("__ground", [60, 0.5, 44], [0, -0.5, 0], { friction: 0.95, restitution: 0.1 }).id;
    this.staticBox("__wall-back", [60, 7, 0.5], [0, 6.5, -10], { friction: 0.6, restitution: 0.2 });
    this.staticBox("__wall-front", [60, 7, 0.5], [0, 6.5, 10], { friction: 0.6, restitution: 0.2 });
    this.staticBox("__wall-left", [0.5, 7, 44], [-18, 6.5, 0], { friction: 0.6, restitution: 0.2 });
    this.staticBox("__wall-right", [0.5, 7, 44], [20, 6.5, 0], { friction: 0.6, restitution: 0.2 });
    this.staticBox("__knoll", [1.7, 0.3, 1.7], [-7.4, 0.3, 0], { friction: 0.9, restitution: 0.05 });

    // Fortress pieces.
    level.pieces.forEach((spec, index) => {
      const material = MATERIALS[spec.material];
      const body = this.world.createBody({
        type: "dynamic",
        position: [spec.x, spec.y, spec.z],
        ...(spec.yaw ? { rotation: yawToQuat(spec.yaw) as [number, number, number, number] } : {}),
        mass: material.mass * Math.max(0.45, spec.hx * spec.hy * spec.hz * 7),
        friction: material.friction,
        restitution: material.restitution,
        linearDamping: 0.015,
        angularDamping: 0.04,
        shape: physics.box(spec.hx, spec.hy, spec.hz),
        material: { friction: material.friction, restitution: material.restitution }
      });
      this.bodyToPiece.set(body.id, index);
      this.allGameBodies.push(body);
      this.pieces.push({ index, body, spec, material, alive: true, joints: [] });
    });

    // Authored masonry joints between pieces whose volumes touch — towers behave
    // like bonded masonry until a hit exceeding jointStrength snaps the bond.
    for (let i = 0; i < this.pieces.length; i += 1) {
      const a = this.pieces[i]!;
      for (let j = i + 1; j < this.pieces.length; j += 1) {
        const b = this.pieces[j]!;
        // Touching iff the AABBs overlap on every axis (small epsilon) —
        // a radial test over-bonds distant blocks into one rigid blob.
        const dx = Math.abs(a.spec.x - b.spec.x);
        const dy = Math.abs(a.spec.y - b.spec.y);
        const dz = Math.abs(a.spec.z - b.spec.z);
        const touch =
          dx < a.spec.hx + b.spec.hx + 0.05 &&
          dy < a.spec.hy + b.spec.hy + 0.05 &&
          dz < a.spec.hz + b.spec.hz + 0.05;
        if (!touch) continue;
        const strength = Math.min(a.material.jointStrength, b.material.jointStrength) * 1.4;
        try {
          const handle = this.world.createConstraint({
            type: "fixed",
            bodyA: a.body,
            bodyB: b.body,
            localAnchorA: [(b.spec.x - a.spec.x) / 2, (b.spec.y - a.spec.y) / 2, (b.spec.z - a.spec.z) / 2],
            localAnchorB: [(a.spec.x - b.spec.x) / 2, (a.spec.y - b.spec.y) / 2, (a.spec.z - b.spec.z) / 2]
          });
          this.joints.push({ handle, a: i, b: j, strength, at: [(a.spec.x + b.spec.x) / 2, (a.spec.y + b.spec.y) / 2, (a.spec.z + b.spec.z) / 2] });
          a.joints.push(handle);
          b.joints.push(handle);
        } catch {
          // joints unsupported — the stack still stands on friction
        }
      }
    }

    // Gulls: light, bouncy squash-targets.
    level.gulls.forEach((spec, index) => {
      const body = this.world.createBody({
        type: "dynamic",
        position: [spec.x, spec.y, spec.z],
        mass: GULL_MASS,
        friction: 0.55,
        restitution: 0.5,
        linearDamping: 0.06,
        angularDamping: 0.4,
        shape: physics.sphere(GULL_RADIUS),
        material: { friction: 0.55, restitution: 0.5 }
      });
      this.bodyToGull.set(body.id, index);
      this.allGameBodies.push(body);
      this.gulls.push({ index, body, alive: true, squashed: false, hopTimer: 0, squashAge: -1, squashAt: [spec.x, spec.y, spec.z] });
    });

    // Windmills: static stud + dynamic rotor on a motorised-hinge.
    level.windmills.forEach((w, wi) => {
      const stud = this.world.createBody({
        type: "static",
        position: [w.x, w.y, w.z],
        shape: physics.sphere(0.16),
        material: { friction: 0.5, restitution: 0.2 }
      });
      this.allGameBodies.push(stud);
      const rotor = this.world.createBody({
        type: "dynamic",
        position: [w.x, w.y, w.z],
        mass: 14,
        friction: 0.5,
        restitution: 0.3,
        shape: physics.box(0.1, 0.1, 0.1),
        material: { friction: 0.5, restitution: 0.3 }
      });
      this.allGameBodies.push(rotor);
      try {
        const joint = this.world.createConstraint({
          type: "motorised-hinge",
          bodyA: stud,
          bodyB: rotor,
          localAnchorA: [0, 0, 0],
          localAnchorB: [0, 0, 0],
          axis: [0, 0, 1],
          motorSpeed: w.motorSpeed,
          maxMotorTorque: 320
        });
        this.bodyToWindmill.set(rotor.id, wi);
        this.windmills.push({ rotor, joint, anchor: [w.x, w.y, w.z], bladeLength: w.bladeLength, broken: false });
      } catch {
        this.retire(rotor);
      }
    });

    // Debris pool — parked and asleep until a break spawns a chip.
    for (let slot = 0; slot < DEBRIS_SLOTS; slot += 1) {
      const body = this.world.createBody({
        type: "dynamic",
        position: [0, -60 - slot * 2, 0],
        mass: 0.12,
        friction: 0.6,
        restitution: 0.35,
        shape: physics.box(0.09, 0.09, 0.09),
        material: { friction: 0.6, restitution: 0.35 }
      });
      body.sleep();
      this.allGameBodies.push(body);
      this.bodyToDebris.set(body.id, slot);
      this.debris.push({ body, slot, life: 0, active: false, sx: 0.1, sy: 0.1, sz: 0.1, matId: "wood" });
    }
    for (let slot = 0; slot < PUFF_SLOTS; slot += 1) {
      this.puffs.push({ slot, t: 0, dur: 0.5, at: [0, -120, 0], scale: 1, kind: "dust", active: false });
    }
  }

  private staticBox(name: string, half: Vec3, at: Vec3, opts: { friction: number; restitution: number }): SimBody {
    const body = this.world.createBody({
      type: "static",
      position: [...at] as [number, number, number],
      friction: opts.friction,
      restitution: opts.restitution,
      shape: physics.box(half[0], half[1], half[2]),
      material: { friction: opts.friction, restitution: opts.restitution }
    });
    void name;
    this.allGameBodies.push(body);
    return body;
  }

  private rand(): number {
    let s = this.rngState;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.rngState = s >>> 0;
    return (this.rngState & 0xffffff) / 0x1000000;
  }

  /** Park a body in a spaced graveyard cell and put it to sleep — the public
   *  controller exposes no mid-level removal, and a sleeping body at y ≈ -60
   *  costs the solver nothing. Each slot is spaced so retired bodies never
   *  touch and re-wake each other. */
  private retire(body: SimBody): void {
    this.retired += 1;
    const col = this.retired % 16;
    const row = Math.floor(this.retired / 16);
    body.setPosition([col * 1.4 - 11, -55 - row * 1.6 - this.retired * 0.01, 24]);
    body.sleep();
  }

  // ----------------------------------------------------------------- state --

  activeProjectile(): ProjectileRec | undefined { return this.projectiles.find((p) => !p.dead); }
  gullsAlive(): number { return this.gulls.filter((g) => g.alive).length; }
  piecesAlive(): number { return this.pieces.filter((p) => p.alive).length; }
  scoreParts(): { destruction: number; gulls: number; breaks: number; gullCount: number } {
    return {
      destruction: this.destructionScore,
      gulls: this.gullScore,
      breaks: this.pieces.filter((p) => !p.alive).length,
      gullCount: this.gulls.filter((g) => !g.alive).length
    };
  }
  pieceList(): readonly PieceRec[] { return this.pieces; }
  gullList(): readonly GullRec[] { return this.gulls; }
  windmillList(): readonly WindmillRec[] { return this.windmills; }
  puffList(): readonly Puff[] { return this.puffs; }
  debrisList(): readonly DebrisRec[] { return this.debris; }

  /** Percent of live (non-graveyard) dynamic bodies currently asleep. */
  sleepingPct(): number {
    const live = this.allGameBodies.filter((b) => b.type === "dynamic" && b.position[1] > -20);
    if (live.length === 0) return 100;
    return Math.round((live.filter((b) => b.sleeping).length / live.length) * 100);
  }
  isShotActive(): boolean { return this.shotInFlight; }
  totalBodyCount(): number { return this.allGameBodies.length; }
  jointCount(): number { return this.joints.length; }

  // --------------------------------------------------------------- firing --

  launch(ammo: AmmoId, origin: Vec3, velocity: Vec3): boolean {
    if (this.shotInFlight) return false;
    const def = AMMO[ammo];
    const body = this.world.createBody({
      type: "dynamic",
      position: [...origin] as [number, number, number],
      mass: def.mass,
      friction: 0.5,
      restitution: def.restitution,
      linearDamping: 0.015,
      angularDamping: 0.02,
      shape: physics.sphere(def.radius),
      material: { friction: 0.5, restitution: def.restitution }
    });
    body.setVelocity([...velocity] as [number, number, number]);
    const rec: ProjectileRec = {
      body, ammo,
      abilityUsed: false, launchedAt: this.time,
      armed: false, anchorUntil: -1, yankDone: false, dead: false,
      splashOnContact: ammo === "ember", isBomb: false
    };
    const index = this.projectiles.length;
    this.projectiles.push(rec);
    this.bodyToProjectile.set(body.id, index);
    this.allGameBodies.push(body);
    this.shotInFlight = true;
    this.shotAge = 0;
    this.shotAgeReal = 0;
    this.settleFrames = 0;
    this.push({ kind: "shot-fired", ammo });
    return true;
  }

  /** Mid-air tap — fires the loaded ammo's power once per projectile. */
  ability(): boolean {
    const p = this.activeProjectile();
    if (!p || p.abilityUsed || !this.shotInFlight) return false;
    p.abilityUsed = true;
    const at: Vec3 = [...p.body.position];
    this.push({ kind: "ability", ammo: p.ammo, at });

    switch (p.ammo) {
      case "pebble": {
        // Yolk Drop: shed a dense bomb straight down; the shell keeps flying.
        const bomb = this.world.createBody({
          type: "dynamic",
          position: [at[0], Math.max(0.4, at[1] - 0.35), at[2]],
          mass: 2.6,
          friction: 0.4,
          restitution: 0.05,
          shape: physics.sphere(0.2),
          material: { friction: 0.4, restitution: 0.05 }
        });
        bomb.setVelocity([p.body.velocity[0] * 0.3, Math.min(-7, p.body.velocity[1] - 6), p.body.velocity[2] * 0.3]);
        const rec: ProjectileRec = { body: bomb, ammo: "pebble", abilityUsed: true, launchedAt: this.time, armed: false, anchorUntil: -1, yankDone: false, dead: false, splashOnContact: false, isBomb: true };
        this.projectiles.push(rec);
        this.bodyToProjectile.set(bomb.id, this.projectiles.length - 1);
        this.allGameBodies.push(bomb);
        this.spawnPuff(at, "poof", 0.8);
        break;
      }
      case "stone": {
        // Slate Slam: slam downward with crushing authority.
        p.body.setVelocity([p.body.velocity[0] * 0.7, Math.min(-17, p.body.velocity[1] - 15), p.body.velocity[2] * 0.7]);
        p.body.applyAngularImpulse([0, 0, -6]);
        this.spawnPuff(at, "dust", 1.1);
        break;
      }
      case "triple": {
        // Tri-Split: two bonus chicks fan out ±14° in the flight plane.
        const v = p.body.velocity;
        for (const s of [-1, 1]) {
          const angle = s * 0.24;
          const ca = Math.cos(angle);
          const sa = Math.sin(angle);
          const nb = this.world.createBody({
            type: "dynamic",
            position: [at[0], at[1], at[2] + s * 0.3],
            mass: 0.5,
            friction: 0.5,
            restitution: 0.42,
            shape: physics.sphere(0.17),
            material: { friction: 0.5, restitution: 0.42 }
          });
          nb.setVelocity([v[0] * ca - v[1] * sa, v[0] * sa + v[1] * ca, v[2]]);
          const rec: ProjectileRec = { body: nb, ammo: "triple", abilityUsed: true, launchedAt: this.time, armed: false, anchorUntil: -1, yankDone: false, dead: false, splashOnContact: false, isBomb: false };
          this.projectiles.push(rec);
          this.bodyToProjectile.set(nb.id, this.projectiles.length - 1);
          this.allGameBodies.push(nb);
        }
        this.spawnPuff(at, "poof", 0.9);
        break;
      }
      case "squid": {
        // Pierce & Yank: armed — smashes through the next piece, then yanks.
        p.armed = true;
        p.anchorUntil = this.time + 1.3;
        break;
      }
      case "ember": {
        this.flareBurst(at, 4.1, 36);
        p.dead = true;
        this.retire(p.body);
        break;
      }
    }
    return true;
  }

  private flareBurst(at: Vec3, radius: number, impulse: number): void {
    for (const body of this.allGameBodies) {
      if (body.type !== "dynamic" || body.position[1] < -10) continue;
      const d = body.position;
      const dir: Vec3 = [d[0] - at[0], d[1] - at[1] + 0.7, d[2] - at[2]];
      const dist = Math.max(0.3, Math.hypot(dir[0], dir[1], dir[2]));
      if (dist > radius) continue;
      const fall = 1 - (dist / radius) * 0.72;
      body.applyImpulse([(dir[0] / dist) * impulse * fall, (dir[1] / dist) * impulse * fall, (dir[2] / dist) * impulse * fall]);
      body.wake();
    }
    // Fragile pieces inside the blast core shatter outright — the burst should
    // read as an explosion, not a shove.
    const core = radius * 0.45;
    for (const piece of this.pieces) {
      if (!piece.alive || piece.material.id === "obsidian" || piece.material.id === "stone") continue;
      const p = piece.body.position;
      const dist = Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]);
      if (dist < core) this.breakPiece(piece, [...piece.body.position] as Vec3);
    }
    for (const gull of this.gulls) {
      if (!gull.alive) continue;
      const p = gull.body.position;
      const dist = Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]);
      if (dist < core * 0.9) this.squashGull(gull, [...gull.body.position] as Vec3);
    }
    this.spawnPuff(at, "fire", 2.5);
    this.scareGulls(at, 5);
  }

  private yankPile(p: ProjectileRec): void {
    p.yankDone = true;
    p.armed = false;
    const at = p.body.position;
    for (const body of this.allGameBodies) {
      if (body.type !== "dynamic" || body.id === p.body.id || body.position[1] < -10) continue;
      const pos = body.position;
      const dir: Vec3 = [at[0] - pos[0], at[1] - pos[1] + 0.9, at[2] - pos[2]];
      const dist = Math.max(0.4, Math.hypot(dir[0], dir[1], dir[2]));
      if (dist > 6.5) continue;
      const fall = 1 - (dist / 6.5) * 0.7;
      const pull = (20 * fall * Math.min(2.2, body.mass)) / Math.max(0.6, body.mass * 0.4);
      body.applyImpulse([(dir[0] / dist) * pull, (dir[1] / dist) * pull * 0.75, (dir[2] / dist) * pull]);
      body.wake();
    }
    this.spawnPuff(at, "poof", 2.3);
  }

  // --------------------------------------------------------------- damage --

  private breakPiece(piece: PieceRec, at: Vec3): void {
    if (!piece.alive) return;
    piece.alive = false;
    for (const joint of piece.joints) { try { joint.setEnabled(false); } catch { /* already off */ } }
    this.retire(piece.body);
    const points = piece.material.scoreValue;
    this.destructionScore += points;
    this.spawnDebris(at, piece.material, piece.spec);
    this.spawnPuff(at, piece.material.id === "glass" || piece.material.id === "ice" ? "glass" : "dust", Math.max(piece.spec.hx, piece.spec.hy, piece.spec.hz) * 2 + 0.55);
    this.push({ kind: "piece-broke", piece: piece.index, material: piece.material.id, at, points });
  }

  private spawnDebris(at: Vec3, material: SiegeMaterial, spec: PieceSpec): void {
    for (let i = 0; i < material.debris.count; i += 1) {
      const rec = this.debris.find((d) => !d.active);
      if (!rec) return;
      rec.active = true;
      rec.life = 0;
      const kind = material.debris.kind;
      rec.sx = kind === "splinter" ? 0.34 : kind === "shard" ? 0.2 : 0.17;
      rec.sy = kind === "splinter" ? 0.05 : kind === "shard" ? 0.025 : 0.15;
      rec.sz = kind === "splinter" ? 0.1 : kind === "shard" ? 0.17 : 0.17;
      rec.matId = material.id;
      const rx = (this.rand() - 0.5) * spec.hx * 1.5;
      const ry = this.rand() * spec.hy * 1.2;
      const rz = (this.rand() - 0.5) * spec.hz * 1.5;
      rec.body.setPosition([at[0] + rx, at[1] + 0.12 + ry, at[2] + rz]);
      rec.body.setVelocity([(this.rand() - 0.5) * 7, 2.5 + this.rand() * 5, (this.rand() - 0.5) * 7]);
      rec.body.setAngularVelocity([(this.rand() - 0.5) * 16, (this.rand() - 0.5) * 16, (this.rand() - 0.5) * 16]);
      rec.body.wake();
    }
  }

  private spawnPuff(at: Vec3, kind: Puff["kind"], scale: number): void {
    const puff = this.puffs.find((p) => !p.active);
    if (!puff) return;
    puff.active = true;
    puff.t = 0;
    puff.dur = kind === "fire" ? 0.7 : 0.55;
    puff.at = [...at] as Vec3;
    puff.scale = scale;
    puff.kind = kind;
  }

  private squashGull(gull: GullRec, at: Vec3): void {
    if (!gull.alive) return;
    gull.alive = false;
    gull.squashed = true;
    gull.squashAge = 0;
    gull.squashAt = [...gull.body.position] as Vec3;
    this.retire(gull.body);
    const last = this.gullsAlive() === 0;
    this.gullScore += 1000;
    this.spawnPuff(at, "poof", 1.7);
    this.push({ kind: "gull-squashed", gull: gull.index, at, points: 1000, lastGull: last });
    if (last && !this.slowmoFired && this.slowmoEnabled) {
      this.slowmoFired = true;
      this.slowmoScale = 0.24;
      this.slowmoUntil = this.time + 0.55;
      this.slowmoRealLeft = 1.25;
      this.push({ kind: "slowmo", at });
    }
  }

  private scareGulls(at: Vec3, radius: number): void {
    for (const g of this.gulls) {
      if (!g.alive || g.hopTimer > 0) continue;
      const p = g.body.position;
      const d = Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]);
      if (d < radius) {
        g.hopTimer = 0.8 + this.rand() * 0.6;
        g.body.applyImpulse([(this.rand() - 0.5) * 0.9, 1.5 + this.rand() * 0.9, (this.rand() - 0.5) * 0.9]);
        this.push({ kind: "gull-scare", gull: g.index, at: [...p] as Vec3 });
      }
    }
  }

  // ---------------------------------------------------------------- update --

  private push(event: SimEvent): void { this.events.push(event); }
  drainEvents(): readonly SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Time-scaled dt (ambient slow-mo + last-gull slow-mo). */
  effectiveDt(dt: number): number {
    let scale = this.timeScaleAmbient;
    if (this.slowmoRealLeft > 0) scale *= this.slowmoScale;
    return dt * scale;
  }
  inSlowmo(): boolean { return this.slowmoRealLeft > 0; }
  simTime(): number { return this.time; }

  update(rawDt: number): void {
    const clampedRaw = Math.min(1 / 30, Math.max(0.0001, rawDt));
    if (this.slowmoRealLeft > 0) this.slowmoRealLeft -= clampedRaw;
    const dt = this.effectiveDt(clampedRaw);
    this.time += dt;

    const contacts = this.world.step(dt);
    const bodyById = this.allGameBodies;
    for (const ev of contacts) {
      if (ev.type !== "begin") continue;
      const a = bodyById.find((b) => b.id === ev.contact.bodyA);
      const b = bodyById.find((b) => b.id === ev.contact.bodyB);
      if (!a || !b) continue;
      this.processContact(a, b, ev.contact.normal, ev.contact.point ?? undefined, ev.contact.sensor);
    }

    // Authored joints snap when the pieces they bond diverge hard.
    for (const j of [...this.joints]) {
      const a = this.pieces[j.a];
      const b = this.pieces[j.b];
      if (!a?.alive || !b?.alive) continue;
      const va = a.body.velocity;
      const vb = b.body.velocity;
      const rel = Math.hypot(va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]);
      if (rel * Math.min(a.body.mass, b.body.mass) > j.strength) {
        try { j.handle.setEnabled(false); } catch { /* off */ }
        a.joints = a.joints.filter((x) => x !== j.handle);
        b.joints = b.joints.filter((x) => x !== j.handle);
        this.joints.splice(this.joints.indexOf(j), 1);
        this.destructionScore += 15;
        this.push({ kind: "joint-snapped", at: j.at, points: 15 });
      }
    }

    for (const p of this.projectiles) {
      if (p.dead) continue;
      if (p.armed && this.time > p.anchorUntil && !p.yankDone) this.yankPile(p);
      const pos = p.body.position;
      const speed2 = p.body.speedSquared();
      const tooSlow = this.time - p.launchedAt > 1.4 && speed2 < 0.14 && (p.body.sleeping || pos[1] < 0.7);
      const oob = pos[1] < -4 || pos[0] < -20 || pos[0] > 24 || Math.abs(pos[2]) > 14;
      if (oob || tooSlow) {
        p.dead = true;
        this.retire(p.body);
      }
    }

    for (const d of this.debris) {
      if (!d.active) continue;
      d.life += dt;
      const pos = d.body.position;
      const still = d.body.sleeping || d.body.speedSquared() < 0.05;
      if (d.life > 3.4 || (d.life > 1.3 && still) || pos[1] < -3) {
        d.active = false;
        d.body.setPosition([d.slot * 0.5 - 7, -60 - d.slot * 1.4, -24]);
        d.body.sleep();
      }
    }
    for (const puff of this.puffs) {
      if (!puff.active) continue;
      puff.t += dt;
      if (puff.t >= puff.dur) puff.active = false;
    }
    for (const g of this.gulls) {
      if (!g.alive && g.squashAge >= 0) g.squashAge += dt;
      g.hopTimer -= dt;
    }

    // Shot lifecycle: wall-clock so last-gull slow-mo can't stretch it.
    if (this.shotInFlight) {
      this.shotAge += dt;
      this.shotAgeReal += clampedRaw;
      const liveProjectiles = this.projectiles.some((p) => !p.dead);
      const moving = this.anythingMoving();
      if ((!liveProjectiles && !moving) || this.shotAgeReal > 4.5) {
        this.settleFrames += 1;
      } else {
        this.settleFrames = 0;
      }
      if (this.shotAgeReal > SHOT_MAX_SECONDS) this.settleFrames = SETTLE_FRAMES;
      if (this.settleFrames >= SETTLE_FRAMES) {
        this.shotInFlight = false;
        this.settleFrames = 0;
        this.push({ kind: "shot-settled", settledMs: Math.round(this.shotAgeReal * 1000) });
      }
    }
  }

  private anythingMoving(): boolean {
    for (const b of this.allGameBodies) {
      if (b.type !== "dynamic" || b.sleeping || b.position[1] < -20) continue;
      if (b.speedSquared() > SETTLE_SPEED_SQ) return true;
    }
    return false;
  }

  private processContact(
    bodyA: SimBody, bodyB: SimBody,
    normal: Vec3, point: Vec3 | undefined, sensor: boolean
  ): void {
    if (sensor) return;
    const at = point ?? midpoint(bodyA.position, bodyB.position);
    const va = bodyA.velocity;
    const vb = bodyB.velocity;
    const relativeSpeed = Math.hypot(va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]);
    const lighter = Math.min(bodyA.mass, bodyB.mass);
    const heavier = Math.max(bodyA.mass, bodyB.mass);
    const impact = relativeSpeed * Math.min(heavier, lighter * 4);

    const pieceA = this.bodyToPiece.get(bodyA.id);
    const pieceB = this.bodyToPiece.get(bodyB.id);
    const gullA = this.bodyToGull.get(bodyA.id);
    const gullB = this.bodyToGull.get(bodyB.id);
    const wmA = this.bodyToWindmill.get(bodyA.id);
    const wmB = this.bodyToWindmill.get(bodyB.id);

    // --- gull squash ----------------------------------------------------------
    for (const [gi, other] of [[gullA, bodyB], [gullB, bodyA]] as const) {
      if (gi === undefined) continue;
      const gull = this.gulls[gi];
      if (!gull?.alive) continue;
      const isProjectile = this.bodyToProjectile.has(other.id);
      const crushFromAbove = normal[1] < -0.5 && other.mass > 0.7 && relativeSpeed > 1.3;
      const slam = impact > GULL_CRUSH_IMPULSE;
      const groundSlam = other.id === this.groundId && relativeSpeed > 6.2;
      if (isProjectile || slam || crushFromAbove || groundSlam) {
        this.squashGull(gull, [...gull.body.position] as Vec3);
      } else if (impact > 2.2) {
        this.scareGulls([...gull.body.position] as Vec3, 1.7);
      }
    }

    // --- windmill smash ---------------------------------------------------------
    for (const [wi, other] of [[wmA, bodyB], [wmB, bodyA]] as const) {
      if (wi === undefined) continue;
      const wm = this.windmills[wi];
      if (!wm || wm.broken) continue;
      if (this.bodyToProjectile.has(other.id) || impact > 30) {
        wm.broken = true;
        try { wm.joint.setEnabled(false); } catch { /* already gone */ }
        wm.rotor.setAngularVelocity([wm.rotor.angularVelocity[0] * 2, wm.rotor.angularVelocity[1] * 2, wm.rotor.angularVelocity[2] * 3]);
        this.destructionScore += 150;
        this.spawnPuff([...wm.anchor] as Vec3, "dust", 2);
        this.push({ kind: "windmill-smashed", at: [...wm.anchor] as Vec3, points: 150 });
      }
    }

    // --- projectile specials -----------------------------------------------------
    for (const body of [bodyA, bodyB]) {
      const pi = this.bodyToProjectile.get(body.id);
      if (pi === undefined) continue;
      const proj = this.projectiles[pi];
      if (!proj || proj.dead) continue;
      const other = body === bodyA ? bodyB : bodyA;

      // Squid pierce: armed → smash straight through the first piece it meets.
      if (proj.armed && this.bodyToPiece.has(other.id)) {
        const piece = this.pieces[this.bodyToPiece.get(other.id)!];
        if (piece?.alive) {
          this.breakPiece(piece, at);
          proj.anchorUntil = this.time + 0.5;
        }
        continue;
      }
      // Egg-bomb payload pops on contact.
      if (proj.isBomb && (this.bodyToPiece.has(other.id) || this.bodyToGull.has(other.id) || other.id === this.groundId)) {
        this.flareBurst(at, 2.5, 20);
        proj.dead = true;
        this.retire(proj.body);
        continue;
      }
      // Fire-egg auto-splash on contact if never tapped.
      if (proj.splashOnContact && !proj.abilityUsed && (this.bodyToPiece.has(other.id) || other.id === this.groundId)) {
        proj.abilityUsed = true;
        this.flareBurst(at, 3.1, 26);
        proj.dead = true;
        this.retire(proj.body);
        this.push({ kind: "ability", ammo: "ember", at });
        continue;
      }
    }

    // --- piece breaking ----------------------------------------------------------
    for (const idx of [pieceA, pieceB]) {
      if (idx === undefined) continue;
      const piece = this.pieces[idx];
      if (!piece?.alive) continue;
      const other = pieceA === idx ? bodyB : bodyA;
      const isProjectile = this.bodyToProjectile.has(other.id);
      const threshold = piece.material.breakImpulse * (isProjectile ? 0.5 : 1);
      if (impact > threshold) {
        this.breakPiece(piece, at);
        this.scareGulls(at, 3.4);
      } else if (impact > piece.material.breakImpulse * 0.4) {
        this.scareGulls(at, 2.5);
      }
    }
  }

  // ---------------------------------------------------------------- visuals --

  /** Every live body → one visual binding for the caller to apply to runtime nodes. */
  *forEachVisual(): Generator<VisualUpdate> {
    for (const p of this.pieces) {
      yield { id: `piece-visual-${p.index}`, position: p.alive ? p.body.position : HIDDEN, rotation: p.alive ? p.body.rotation : IDENT, visible: p.alive };
    }
    for (const g of this.gulls) {
      yield { id: `gull-${g.index}`, position: g.alive ? g.body.position : HIDDEN, rotation: g.alive ? g.body.rotation : IDENT, visible: g.alive };
    }
    for (const p of this.projectiles) {
      yield { id: `projectile-${this.bodyToProjectile.get(p.body.id) ?? 0}`, position: p.dead ? HIDDEN : p.body.position, rotation: p.dead ? IDENT : p.body.rotation, visible: !p.dead };
    }
    for (const d of this.debris) {
      yield { id: `debris-${d.slot}`, position: d.active ? d.body.position : HIDDEN, rotation: d.active ? d.body.rotation : IDENT, visible: d.active };
    }
    let wmi = 0;
    for (const wm of this.windmills) {
      yield { id: `windmill-rotor-${wmi}`, position: wm.rotor.position, rotation: wm.rotor.rotation, visible: true };
      wmi += 1;
    }
  }

  puffState(slot: number): { scale: number; fade: number; kind: Puff["kind"] } | undefined {
    const p = this.puffs[slot];
    if (!p?.active) return undefined;
    const t = p.t / p.dur;
    const grow = t < 0.35 ? t / 0.35 : 1;
    return { scale: p.scale * (0.35 + grow * 0.9), fade: 1 - t, kind: p.kind };
  }
}
