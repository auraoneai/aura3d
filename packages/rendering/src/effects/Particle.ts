export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface ColorLike {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Particle {
  id: number;
  age: number;
  lifetime: number;
  position: Vector3Like;
  previousPosition: Vector3Like;
  velocity: Vector3Like;
  acceleration: Vector3Like;
  color: ColorLike;
  size: number;
  rotation: number;
  angularVelocity: number;
  alive: boolean;
  userData: Record<string, unknown>;
}

export interface ParticleInitialState {
  id?: number;
  age?: number;
  lifetime?: number;
  position?: Partial<Vector3Like>;
  velocity?: Partial<Vector3Like>;
  acceleration?: Partial<Vector3Like>;
  color?: Partial<ColorLike>;
  size?: number;
  rotation?: number;
  angularVelocity?: number;
  alive?: boolean;
  userData?: Record<string, unknown>;
}

export function createVector3(value: Partial<Vector3Like> = {}): Vector3Like {
  return {
    x: value.x ?? 0,
    y: value.y ?? 0,
    z: value.z ?? 0,
  };
}

export function cloneVector3(value: Vector3Like): Vector3Like {
  return { x: value.x, y: value.y, z: value.z };
}

export function addScaledVector3(target: Vector3Like, source: Vector3Like, scale: number): void {
  target.x += source.x * scale;
  target.y += source.y * scale;
  target.z += source.z * scale;
}

export function setVector3(target: Vector3Like, source: Vector3Like): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
}

export function createColor(value: Partial<ColorLike> = {}): ColorLike {
  return {
    r: value.r ?? 1,
    g: value.g ?? 1,
    b: value.b ?? 1,
    a: value.a ?? 1,
  };
}

export function cloneColor(value: ColorLike): ColorLike {
  return { r: value.r, g: value.g, b: value.b, a: value.a };
}

export function createParticle(initial: ParticleInitialState = {}): Particle {
  if ((initial.lifetime ?? 1) <= 0) {
    throw new RangeError("Particle lifetime must be greater than zero.");
  }

  const position = createVector3(initial.position);

  return {
    id: initial.id ?? 0,
    age: initial.age ?? 0,
    lifetime: initial.lifetime ?? 1,
    position,
    previousPosition: cloneVector3(position),
    velocity: createVector3(initial.velocity),
    acceleration: createVector3(initial.acceleration),
    color: createColor(initial.color),
    size: initial.size ?? 1,
    rotation: initial.rotation ?? 0,
    angularVelocity: initial.angularVelocity ?? 0,
    alive: initial.alive ?? true,
    userData: { ...(initial.userData ?? {}) },
  };
}

export function normalizedParticleAge(particle: Particle): number {
  return particle.lifetime <= 0 ? 1 : Math.min(Math.max(particle.age / particle.lifetime, 0), 1);
}
