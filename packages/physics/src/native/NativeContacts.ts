import type { RigidBody } from "../RigidBody.js";
import { validateFiniteVec3, type Vec3 } from "../Shape.js";
import { nativeApplyImpulseAtPoint, nativeCenterOfMass, nativeInverseInertia } from "./NativeMassProperties.js";

/** A world-space contact; its normal points from body A toward body B. */
export interface NativeContactRow {
  readonly bodyA: RigidBody;
  readonly bodyB: RigidBody;
  readonly normal: Vec3;
  readonly point: Vec3;
  readonly penetration: number;
  readonly friction: number;
  readonly restitution: number;
  readonly sensor?: boolean;
}

interface RowState {
  readonly row: NativeContactRow;
  readonly normal: Vec3;
  readonly bounceSpeed: number;
  readonly correctionSpeed: number;
  normalImpulse: number;
  tangentImpulse: Vec3;
}

/** One substep's contact constraints, including accumulated friction budgets. */
export class NativeContactSolver {
  private readonly states: RowState[];

  constructor(rows: readonly NativeContactRow[], dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) throw new Error("native contact step dt must be finite and positive.");
    // Validate every row before applying impulses, including non-solid sensors.
    this.states = rows.map((row) => {
      validateFiniteVec3(row.normal, "native contact normal");
      validateFiniteVec3(row.point, "native contact point");
      const length = Math.hypot(...row.normal);
      if (!Number.isFinite(length) || length <= 1e-9) throw new Error("native contact normal must have finite non-zero length.");
      if (!Number.isFinite(row.penetration) || row.penetration < 0) throw new Error("native contact penetration must be finite and non-negative.");
      if (!Number.isFinite(row.friction) || row.friction < 0) throw new Error("native contact friction must be finite and non-negative.");
      if (!Number.isFinite(row.restitution) || row.restitution < 0) throw new Error("native contact restitution must be finite and non-negative.");
      const normal: Vec3 = [row.normal[0] / length, row.normal[1] / length, row.normal[2] / length];
      const initialApproach = dot(relativeVelocity(row), normal);
      return {
        row,
        normal,
        bounceSpeed: initialApproach < -0.5 ? -initialApproach * row.restitution : 0,
        correctionSpeed: Math.min(2, Math.max(0, row.penetration - 0.001) * 0.2 / dt),
        normalImpulse: 0,
        tangentImpulse: [0, 0, 0]
      };
    });
  }

  /** Solve one iteration; joint constraints may be solved between iterations. */
  solve(): void {
    for (const state of this.states) {
      const { row, normal } = state;
      if (row.sensor) continue;
      const normalMass = impulseDenominator(row, normal);
      if (normalMass <= 1e-12) continue;
      const normalSpeed = dot(relativeVelocity(row), normal);
      const desired = (state.bounceSpeed + state.correctionSpeed - normalSpeed) / normalMass;
      const next = Math.max(0, state.normalImpulse + desired);
      applyPair(row, scale(normal, next - state.normalImpulse));
      state.normalImpulse = next;

      const relative = relativeVelocity(row);
      const tangentVelocity = subtract(relative, scale(normal, dot(relative, normal)));
      const speed = Math.hypot(...tangentVelocity);
      let candidate = state.tangentImpulse;
      if (speed > 1e-12 && row.friction > 0) {
        const tangent = scale(tangentVelocity, 1 / speed);
        const tangentMass = impulseDenominator(row, tangent);
        if (tangentMass > 1e-12) candidate = subtract(candidate, scale(tangent, speed / tangentMass));
      }
      const maximum = row.friction * state.normalImpulse;
      const magnitude = Math.hypot(...candidate);
      const limited = magnitude > maximum && magnitude > 0 ? scale(candidate, maximum / magnitude) : candidate;
      applyPair(row, subtract(limited, state.tangentImpulse));
      state.tangentImpulse = limited;
    }
  }
}

/** Convenience for a contact-only substep. */
export function solveNativeContacts(rows: readonly NativeContactRow[], dt: number, iterations: number): void {
  if (!Number.isInteger(iterations) || iterations <= 0) throw new Error("native contact iterations must be a positive integer.");
  const solver = new NativeContactSolver(rows, dt);
  for (let iteration = 0; iteration < iterations; iteration += 1) solver.solve();
}

function velocityAt(body: RigidBody, point: Vec3): Vec3 {
  if (body.type === "static") return [0, 0, 0];
  const angular = cross(body.angularVelocity, subtract(point, nativeCenterOfMass(body)));
  return [body.velocity[0] + angular[0], body.velocity[1] + angular[1], body.velocity[2] + angular[2]];
}

function relativeVelocity(row: NativeContactRow): Vec3 {
  return subtract(velocityAt(row.bodyB, row.point), velocityAt(row.bodyA, row.point));
}

function impulseDenominator(row: NativeContactRow, axis: Vec3): number {
  const ra = subtract(row.point, nativeCenterOfMass(row.bodyA)), rb = subtract(row.point, nativeCenterOfMass(row.bodyB));
  const angularA = cross(nativeInverseInertia(row.bodyA, cross(ra, axis)), ra);
  const angularB = cross(nativeInverseInertia(row.bodyB, cross(rb, axis)), rb);
  return row.bodyA.inverseMass + row.bodyB.inverseMass + dot(axis, add(angularA, angularB));
}

function applyPair(row: NativeContactRow, impulse: Vec3): void {
  if (Math.hypot(...impulse) <= 1e-15) return;
  nativeApplyImpulseAtPoint(row.bodyA, scale(impulse, -1), row.point);
  nativeApplyImpulseAtPoint(row.bodyB, impulse, row.point);
}

function add(a: Vec3, b: Vec3): Vec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function subtract(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a: Vec3, value: number): Vec3 { return [a[0] * value, a[1] * value, a[2] * value]; }
function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
