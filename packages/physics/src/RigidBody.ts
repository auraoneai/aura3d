import { addVec3, cloneVec3, scaleVec3, validateFiniteVec3, type Vec3, vec3 } from "./Shape.js";

export type RigidBodyType = "dynamic" | "static" | "kinematic";
export type Quat = readonly [number, number, number, number];

export type RigidBodyDescriptor = {
  readonly type?: RigidBodyType;
  readonly position?: Vec3;
  readonly rotation?: Quat;
  readonly velocity?: Vec3;
  readonly angularVelocity?: Vec3;
  readonly mass?: number;
  readonly inertia?: Vec3;
  readonly linearDamping?: number;
  readonly angularDamping?: number;
  readonly restitution?: number;
  readonly friction?: number;
  readonly sleeping?: boolean;
};

export type RigidBodySnapshot = {
  readonly id: number;
  readonly type: RigidBodyType;
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly velocity: Vec3;
  readonly angularVelocity: Vec3;
  readonly mass: number;
  readonly inverseMass: number;
  readonly inverseInertia: Vec3;
  readonly sleeping: boolean;
};

export class RigidBody {
  readonly id: number;
  readonly type: RigidBodyType;
  readonly mass: number;
  readonly inverseMass: number;
  readonly restitution: number;
  readonly friction: number;
  position: [number, number, number];
  previousPosition: [number, number, number];
  rotation: [number, number, number, number];
  previousRotation: [number, number, number, number];
  velocity: [number, number, number];
  angularVelocity: [number, number, number];
  linearDamping: number;
  angularDamping: number;
  inverseInertia: [number, number, number];
  sleeping: boolean;
  private accumulatedForce: [number, number, number];
  private accumulatedTorque: [number, number, number];
  private sleepTimer = 0;

  constructor(id: number, descriptor: RigidBodyDescriptor = {}) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("RigidBody id must be a positive integer.");
    }
    this.id = id;
    this.type = descriptor.type ?? "dynamic";
    this.position = cloneVec3(descriptor.position ?? vec3());
    this.previousPosition = cloneVec3(this.position);
    this.rotation = normalizeQuat(descriptor.rotation ?? [0, 0, 0, 1]);
    this.previousRotation = cloneQuat(this.rotation);
    this.velocity = cloneVec3(descriptor.velocity ?? vec3());
    this.angularVelocity = cloneVec3(descriptor.angularVelocity ?? vec3());
    this.linearDamping = descriptor.linearDamping ?? 0;
    this.angularDamping = descriptor.angularDamping ?? 0;
    this.restitution = descriptor.restitution ?? 0;
    this.friction = descriptor.friction ?? 0.5;
    this.sleeping = descriptor.sleeping ?? false;
    validateFiniteVec3(this.position, "body position");
    validateFiniteVec3(this.velocity, "body velocity");
    validateFiniteVec3(this.angularVelocity, "body angularVelocity");
    if (!Number.isFinite(this.linearDamping) || this.linearDamping < 0) {
      throw new Error("linearDamping must be finite and non-negative.");
    }
    if (!Number.isFinite(this.angularDamping) || this.angularDamping < 0) {
      throw new Error("angularDamping must be finite and non-negative.");
    }
    const mass = descriptor.mass ?? 1;
    if (this.type === "dynamic") {
      if (!Number.isFinite(mass) || mass <= 0) {
        throw new Error("dynamic body mass must be a finite positive number.");
      }
      this.mass = mass;
      this.inverseMass = 1 / mass;
      this.inverseInertia = inverseInertia(descriptor.inertia ?? [mass, mass, mass]);
    } else {
      this.mass = Number.POSITIVE_INFINITY;
      this.inverseMass = 0;
      this.inverseInertia = vec3();
    }
    this.accumulatedForce = vec3();
    this.accumulatedTorque = vec3();
  }

  setPosition(position: Vec3): void {
    validateFiniteVec3(position, "body position");
    this.previousPosition = cloneVec3(this.position);
    this.position = cloneVec3(position);
    this.wake();
  }

  setVelocity(velocity: Vec3): void {
    validateFiniteVec3(velocity, "body velocity");
    this.velocity = cloneVec3(velocity);
    this.wake();
  }

  setRotation(rotation: Quat): void {
    this.previousRotation = cloneQuat(this.rotation);
    this.rotation = normalizeQuat(rotation);
    this.wake();
  }

  setAngularVelocity(angularVelocity: Vec3): void {
    validateFiniteVec3(angularVelocity, "body angularVelocity");
    this.angularVelocity = cloneVec3(angularVelocity);
    this.wake();
  }

  applyForce(force: Vec3): void {
    validateFiniteVec3(force, "force");
    if (this.type !== "dynamic") {
      return;
    }
    this.accumulatedForce = addVec3(this.accumulatedForce, force);
    this.wake();
  }

  applyTorque(torque: Vec3): void {
    validateFiniteVec3(torque, "torque");
    if (this.type !== "dynamic") {
      return;
    }
    this.accumulatedTorque = addVec3(this.accumulatedTorque, torque);
    this.wake();
  }

  applyImpulse(impulse: Vec3): void {
    validateFiniteVec3(impulse, "impulse");
    if (this.type !== "dynamic") {
      return;
    }
    this.velocity = addVec3(this.velocity, scaleVec3(impulse, this.inverseMass));
    this.wake();
  }

  applyAngularImpulse(impulse: Vec3): void {
    validateFiniteVec3(impulse, "angular impulse");
    if (this.type !== "dynamic") {
      return;
    }
    this.angularVelocity = addVec3(this.angularVelocity, multiplyVec3(impulse, this.inverseInertia));
    this.wake();
  }

  applyImpulseAtPoint(impulse: Vec3, worldPoint: Vec3): void {
    validateFiniteVec3(impulse, "impulse");
    validateFiniteVec3(worldPoint, "impulse point");
    if (this.type !== "dynamic") {
      return;
    }
    this.applyImpulse(impulse);
    this.applyAngularImpulse(crossVec3(subVec3(worldPoint, this.position), impulse));
  }

  integrate(dt: number, gravity: Vec3): void {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new Error("dt must be a finite positive number.");
    }
    if (this.type !== "dynamic" || this.sleeping) {
      this.clearForces();
      this.previousPosition = cloneVec3(this.position);
      this.previousRotation = cloneQuat(this.rotation);
      return;
    }
    this.previousPosition = cloneVec3(this.position);
    this.previousRotation = cloneQuat(this.rotation);
    const acceleration = addVec3(gravity, scaleVec3(this.accumulatedForce, this.inverseMass));
    this.velocity = addVec3(this.velocity, scaleVec3(acceleration, dt));
    this.angularVelocity = addVec3(this.angularVelocity, scaleVec3(multiplyVec3(this.accumulatedTorque, this.inverseInertia), dt));
    const dampingFactor = Math.max(0, 1 - this.linearDamping * dt);
    const angularDampingFactor = Math.max(0, 1 - this.angularDamping * dt);
    this.velocity = scaleVec3(this.velocity, dampingFactor);
    this.angularVelocity = scaleVec3(this.angularVelocity, angularDampingFactor);
    this.position = addVec3(this.position, scaleVec3(this.velocity, dt));
    this.rotation = integrateRotation(this.rotation, this.angularVelocity, dt);
    this.clearForces();
  }

  clearForces(): void {
    this.accumulatedForce = vec3();
    this.accumulatedTorque = vec3();
  }

  speedSquared(): number {
    return this.velocity[0] * this.velocity[0] + this.velocity[1] * this.velocity[1] + this.velocity[2] * this.velocity[2] +
      this.angularVelocity[0] * this.angularVelocity[0] + this.angularVelocity[1] * this.angularVelocity[1] + this.angularVelocity[2] * this.angularVelocity[2];
  }

  wake(): void {
    if (this.type !== "dynamic") {
      return;
    }
    this.sleeping = false;
    this.sleepTimer = 0;
  }

  sleep(): void {
    if (this.type !== "dynamic") {
      return;
    }
    this.velocity = vec3();
    this.angularVelocity = vec3();
    this.clearForces();
    this.sleeping = true;
  }

  resetSleepTimer(): void {
    this.sleepTimer = 0;
  }

  accumulateSleepTime(dt: number): number {
    if (!Number.isFinite(dt) || dt < 0) {
      throw new Error("sleep dt must be finite and non-negative.");
    }
    this.sleepTimer += dt;
    return this.sleepTimer;
  }

  snapshot(): RigidBodySnapshot {
    return {
      id: this.id,
      type: this.type,
      position: cloneVec3(this.position),
      rotation: cloneQuat(this.rotation),
      velocity: cloneVec3(this.velocity),
      angularVelocity: cloneVec3(this.angularVelocity),
      mass: this.mass,
      inverseMass: this.inverseMass,
      inverseInertia: cloneVec3(this.inverseInertia),
      sleeping: this.sleeping
    };
  }
}

function cloneQuat(value: Quat): [number, number, number, number] {
  return [value[0], value[1], value[2], value[3]];
}

function normalizeQuat(value: Quat): [number, number, number, number] {
  if (value.length !== 4 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || !Number.isFinite(value[2]) || !Number.isFinite(value[3])) {
    throw new Error("body rotation must be a finite quaternion.");
  }
  const length = Math.hypot(value[0], value[1], value[2], value[3]);
  if (length <= 1e-9) {
    throw new Error("body rotation quaternion cannot be zero.");
  }
  return [value[0] / length, value[1] / length, value[2] / length, value[3] / length];
}

function inverseInertia(inertia: Vec3): [number, number, number] {
  validateFiniteVec3(inertia, "body inertia");
  if (inertia[0] <= 0 || inertia[1] <= 0 || inertia[2] <= 0) {
    throw new Error("dynamic body inertia must contain finite positive principal moments.");
  }
  return [1 / inertia[0], 1 / inertia[1], 1 / inertia[2]];
}

function multiplyVec3(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

function subVec3(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function crossVec3(a: Vec3, b: Vec3): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function integrateRotation(rotation: Quat, angularVelocity: Vec3, dt: number): [number, number, number, number] {
  const speed = Math.hypot(angularVelocity[0], angularVelocity[1], angularVelocity[2]);
  if (speed <= 1e-12) {
    return cloneQuat(rotation);
  }
  const halfAngle = speed * dt * 0.5;
  const sinHalf = Math.sin(halfAngle);
  const delta: Quat = [
    angularVelocity[0] / speed * sinHalf,
    angularVelocity[1] / speed * sinHalf,
    angularVelocity[2] / speed * sinHalf,
    Math.cos(halfAngle)
  ];
  return normalizeQuat(multiplyQuat(delta, rotation));
}

function multiplyQuat(a: Quat, b: Quat): [number, number, number, number] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}
