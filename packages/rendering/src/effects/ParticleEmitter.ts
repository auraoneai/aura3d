import { createParticle, type Particle, type ParticleInitialState, type Vector3Like } from "./Particle.js";

export interface ParticleBurst {
  time: number;
  count: number;
  interval?: number;
  cycles?: number;
}

export type ParticleEmitterShape =
  | { type: "point"; position?: Partial<Vector3Like> }
  | { type: "box"; center?: Partial<Vector3Like>; size: Partial<Vector3Like> }
  | { type: "sphere"; center?: Partial<Vector3Like>; radius: number; shell?: boolean }
  | { type: "circle"; center?: Partial<Vector3Like>; radius: number; arc?: number; filled?: boolean }
  | { type: "cone"; origin?: Partial<Vector3Like>; radius: number; length: number; angle?: number; emitFromVolume?: boolean };

export interface ParticleEmitterOptions {
  seed?: number;
  emissionRate?: number;
  maxParticles?: number;
  duration?: number;
  looping?: boolean;
  lifetime?: number | { min: number; max: number };
  speed?: number | { min: number; max: number };
  shape?: ParticleEmitterShape;
  bursts?: readonly ParticleBurst[];
  initial?: Omit<ParticleInitialState, "id" | "age" | "lifetime" | "position" | "velocity">;
}

export interface EmissionResult {
  particles: Particle[];
  requested: number;
  emitted: number;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function validateRange(name: string, value: number | { min: number; max: number }): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a finite non-negative number.`);
    }
    return;
  }

  if (!Number.isFinite(value.min) || !Number.isFinite(value.max) || value.min < 0 || value.max < value.min) {
    throw new RangeError(`${name} range must be finite and ordered.`);
  }
}

function sampleRange(value: number | { min: number; max: number }, random: () => number): number {
  return typeof value === "number" ? value : value.min + (value.max - value.min) * random();
}

function vector(value: Partial<Vector3Like> = {}): Vector3Like {
  return { x: value.x ?? 0, y: value.y ?? 0, z: value.z ?? 0 };
}

function randomUnitVector(random: () => number): Vector3Like {
  const z = random() * 2 - 1;
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(Math.max(0, 1 - z * z));

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z,
  };
}

function sampleShape(shape: ParticleEmitterShape, random: () => number): { readonly position: Vector3Like; readonly direction?: Vector3Like } {
  if (shape.type === "point") {
    return { position: vector(shape.position) };
  }

  if (shape.type === "box") {
    const center = vector(shape.center);
    return {
      position: {
        x: center.x + (random() - 0.5) * (shape.size.x ?? 0),
        y: center.y + (random() - 0.5) * (shape.size.y ?? 0),
        z: center.z + (random() - 0.5) * (shape.size.z ?? 0),
      }
    };
  }

  if (shape.type === "circle") {
    const center = vector(shape.center);
    const arc = shape.arc ?? Math.PI * 2;
    const angle = random() * arc;
    const radius = shape.radius * (shape.filled ? Math.sqrt(random()) : 1);
    return {
      position: {
        x: center.x + Math.cos(angle) * radius,
        y: center.y,
        z: center.z + Math.sin(angle) * radius,
      },
      direction: { x: Math.cos(angle), y: 0, z: Math.sin(angle) }
    };
  }

  if (shape.type === "cone") {
    const origin = vector(shape.origin);
    const axial = shape.length * (shape.emitFromVolume ? random() : 1);
    const radiusAtAxial = shape.radius * (shape.emitFromVolume ? axial / shape.length : 1);
    const angle = random() * Math.PI * 2;
    const radial = radiusAtAxial * (shape.emitFromVolume ? Math.sqrt(random()) : 1);
    const direction = sampleConeDirection(shape, random);
    return {
      position: {
        x: origin.x + Math.cos(angle) * radial,
        y: origin.y + axial,
        z: origin.z + Math.sin(angle) * radial,
      },
      direction
    };
  }

  const center = vector(shape.center);
  const direction = randomUnitVector(random);
  const radius = shape.radius * (shape.shell ? 1 : Math.cbrt(random()));

  return {
    position: {
      x: center.x + direction.x * radius,
      y: center.y + direction.y * radius,
      z: center.z + direction.z * radius,
    },
    direction
  };
}

function sampleConeDirection(shape: Extract<ParticleEmitterShape, { type: "cone" }>, random: () => number): Vector3Like {
  const maxAngle = shape.angle ?? Math.atan2(shape.radius, shape.length);
  const theta = random() * Math.PI * 2;
  const spread = Math.tan(maxAngle) * Math.sqrt(random());
  return normalize({
    x: Math.cos(theta) * spread,
    y: 1,
    z: Math.sin(theta) * spread
  });
}

function normalize(value: Vector3Like): Vector3Like {
  const length = Math.hypot(value.x, value.y, value.z) || 1;
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function validateShape(shape: ParticleEmitterShape): void {
  if (shape.type === "sphere" && (!Number.isFinite(shape.radius) || shape.radius < 0)) {
    throw new RangeError("Particle sphere radius must be a finite non-negative number.");
  }
  if (shape.type === "circle") {
    if (!Number.isFinite(shape.radius) || shape.radius < 0) throw new RangeError("Particle circle radius must be a finite non-negative number.");
    if (shape.arc !== undefined && (!Number.isFinite(shape.arc) || shape.arc <= 0 || shape.arc > Math.PI * 2)) {
      throw new RangeError("Particle circle arc must be in the range (0, 2pi].");
    }
  }
  if (shape.type === "cone") {
    if (!Number.isFinite(shape.radius) || shape.radius < 0) throw new RangeError("Particle cone radius must be a finite non-negative number.");
    if (!Number.isFinite(shape.length) || shape.length <= 0) throw new RangeError("Particle cone length must be a finite positive number.");
    if (shape.angle !== undefined && (!Number.isFinite(shape.angle) || shape.angle <= 0 || shape.angle >= Math.PI / 2)) {
      throw new RangeError("Particle cone angle must be in the range (0, pi/2).");
    }
  }
}

export class ParticleEmitter {
  readonly random: () => number;
  readonly maxParticles: number;
  readonly bursts: readonly ParticleBurst[];

  emissionRate: number;
  duration: number;
  looping: boolean;
  lifetime: number | { min: number; max: number };
  speed: number | { min: number; max: number };
  shape: ParticleEmitterShape;
  initial: Omit<ParticleInitialState, "id" | "age" | "lifetime" | "position" | "velocity">;
  elapsedTime = 0;
  paused = false;

  private emissionCarry = 0;
  private nextParticleId = 1;
  private burstExecutions: number[];

  constructor(options: ParticleEmitterOptions = {}) {
    this.random = seededRandom(options.seed ?? 1);
    this.emissionRate = options.emissionRate ?? 10;
    this.maxParticles = options.maxParticles ?? Number.POSITIVE_INFINITY;
    this.duration = options.duration ?? Number.POSITIVE_INFINITY;
    this.looping = options.looping ?? false;
    this.lifetime = options.lifetime ?? 1;
    this.speed = options.speed ?? 0;
    this.shape = options.shape ?? { type: "point" };
    this.bursts = options.bursts ?? [];
    this.initial = options.initial ?? {};
    this.burstExecutions = this.bursts.map(() => 0);
    validateShape(this.shape);

    if (!Number.isFinite(this.emissionRate) || this.emissionRate < 0) {
      throw new RangeError("Particle emissionRate must be a finite non-negative number.");
    }
    if (!Number.isFinite(this.duration) && this.duration !== Number.POSITIVE_INFINITY) {
      throw new RangeError("Particle duration must be finite or positive infinity.");
    }
    if (this.duration <= 0) {
      throw new RangeError("Particle duration must be greater than zero.");
    }

    validateRange("Particle lifetime", this.lifetime);
    validateRange("Particle speed", this.speed);
  }

  reset(): void {
    this.elapsedTime = 0;
    this.emissionCarry = 0;
    this.nextParticleId = 1;
    this.burstExecutions = this.bursts.map(() => 0);
    this.paused = false;
  }

  emit(deltaTime: number, capacity = Number.POSITIVE_INFINITY): EmissionResult {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) {
      throw new RangeError("ParticleEmitter.emit deltaTime must be a finite non-negative number.");
    }

    if (this.paused || capacity <= 0) {
      return { particles: [], requested: 0, emitted: 0 };
    }

    const previousTime = this.elapsedTime;
    this.elapsedTime = this.advanceTime(deltaTime);
    const requested = this.countContinuous(deltaTime, previousTime) + this.countBursts(previousTime, this.elapsedTime);
    const capped = Math.max(0, Math.min(requested, capacity, this.maxParticles));
    const particles: Particle[] = [];

    for (let index = 0; index < capped; index += 1) {
      particles.push(this.createParticle());
    }

    return { particles, requested, emitted: particles.length };
  }

  createParticle(): Particle {
    const emitted = sampleShape(this.shape, this.random);
    const position = emitted.position;
    const direction = emitted.direction ?? randomUnitVector(this.random);
    const speed = sampleRange(this.speed, this.random);

    return createParticle({
      ...this.initial,
      id: this.nextParticleId++,
      age: 0,
      lifetime: sampleRange(this.lifetime, this.random),
      position,
      velocity: {
        x: direction.x * speed,
        y: direction.y * speed,
        z: direction.z * speed,
      },
    });
  }

  private advanceTime(deltaTime: number): number {
    if (!Number.isFinite(this.duration)) {
      return this.elapsedTime + deltaTime;
    }

    const next = this.elapsedTime + deltaTime;
    return this.looping ? next % this.duration : Math.min(next, this.duration);
  }

  private countContinuous(deltaTime: number, previousTime: number): number {
    if (previousTime >= this.duration && !this.looping) {
      return 0;
    }

    const activeDelta = Number.isFinite(this.duration) && !this.looping ? Math.min(deltaTime, this.duration - previousTime) : deltaTime;
    this.emissionCarry += this.emissionRate * Math.max(0, activeDelta);
    const count = Math.floor(this.emissionCarry);
    this.emissionCarry -= count;
    return count;
  }

  private countBursts(previousTime: number, currentTime: number): number {
    let count = 0;

    for (let index = 0; index < this.bursts.length; index += 1) {
      const burst = this.bursts[index];
      if (burst.count < 0 || burst.time < 0) {
        throw new RangeError("Particle burst time and count must be non-negative.");
      }

      const cycles = burst.cycles ?? 1;
      const interval = burst.interval ?? 0;
      let executions = this.burstExecutions[index] ?? 0;

      while (executions < cycles) {
        const triggerTime = burst.time + interval * executions;
        const crossed = (triggerTime === 0 && previousTime === 0) || (triggerTime > previousTime && triggerTime <= currentTime);

        if (!crossed) {
          break;
        }

        count += burst.count;
        executions += 1;
      }

      this.burstExecutions[index] = executions;
    }

    return count;
  }
}
