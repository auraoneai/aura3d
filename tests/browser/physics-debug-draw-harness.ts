import { createPhysicsRuntime } from "@aura3d/engine";
import { PhysicsWorld } from "@aura3d/physics";

/**
 * H2 debug-draw route browser proof: a world with resting contacts and a
 * joint, drawn as collider wireframes + contact crosses + normals + joint
 * links — every line from the real simulation via the `@aura3d/engine` root.
 * Also proves the overlay toggle (off = zero lines) and the line budget
 * (capped output with requested/emitted/dropped telemetry).
 */
interface DebugDrawResult {
  readonly status: "ready" | "error";
  readonly categories?: readonly string[];
  readonly hasCollider?: boolean;
  readonly hasContact?: boolean;
  readonly hasNormal?: boolean;
  readonly hasJoint?: boolean;
  readonly toggledOff?: number;
  readonly lineCount?: number;
  readonly fullRequested?: number;
  readonly budget?: { readonly requested: number; readonly emitted: number; readonly dropped: number; readonly budgeted: boolean };
  readonly colliderPixel?: readonly number[];
  readonly contactPixel?: readonly number[];
  readonly normalPixel?: readonly number[];
  readonly jointPixel?: readonly number[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_PHYSICS_DEBUG_DRAW__?: DebugDrawResult;
  }
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>("#debug-surface");
  const context = canvas?.getContext("2d");
  if (!canvas || !context) throw new Error("Debug-draw canvas is unavailable.");

  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, seed: 77 });
  const physics = createPhysicsRuntime(world);
  physics.createBody({ name: "floor", type: "static", shape: "plane", position: [0, 0, 0] });
  const lower = physics.createBody({ name: "lower", shape: "box", halfExtents: [0.4, 0.4, 0.4], mass: 1, position: [0, 2, 0] });
  const upper = physics.createBody({ name: "upper", shape: "box", halfExtents: [0.4, 0.4, 0.4], mass: 1, position: [0, 3.2, 0] });
  const anchorA = physics.createBody({ name: "anchor-a", shape: "box", mass: 1, position: [-2.5, 1.5, 0] });
  const anchorB = physics.createBody({ name: "anchor-b", shape: "box", mass: 1, position: [-1, 1.5, 0] });
  physics.createJoint({ kind: "fixed", bodyA: anchorA.id, bodyB: anchorB.id });
  for (let step = 0; step < 150; step += 1) physics.step(1 / 60);

  const lines = physics.debugLines({ contacts: true, joints: true });
  const categories = [...new Set(lines.map((line) => line.category ?? "uncategorized"))].sort();
  const byCategory = (name: string) => lines.filter((line) => line.category === name);

  const toggledOff = physics.debugLines({ contacts: true, joints: true, enabled: false }).length;
  const fullBudget = physics.debugBudget({ contacts: true, joints: true });
  const cappedBudget = physics.debugBudget({ contacts: true, joints: true, maxLines: 8 });

  // Visible proof: project world -> canvas and stroke each category in its color.
  context.fillStyle = "rgb(9, 13, 19)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const px = (x: number) => Math.round(150 + x * 46);
  const py = (y: number) => Math.round(178 - y * 52);
  const stroke = (from: readonly [number, number, number], to: readonly [number, number, number]) => {
    context.beginPath();
    context.moveTo(px(from[0]), py(from[1]));
    context.lineTo(px(to[0]), py(to[1]));
    context.stroke();
  };
  context.lineWidth = 3;
  context.lineCap = "round";
  context.strokeStyle = "rgb(26, 204, 255)";
  for (const line of byCategory("collider")) stroke(line.from, line.to);
  context.strokeStyle = "rgb(230, 102, 255)";
  for (const line of byCategory("joint")) stroke(line.from, line.to);
  const contacts = byCategory("contact");
  const normals = byCategory("normal");
  context.strokeStyle = "rgb(51, 255, 102)";
  for (const line of contacts) stroke(line.from, line.to);
  context.strokeStyle = "rgb(255, 255, 77)";
  for (const line of normals) stroke(line.from, line.to);

  const midProbe = (from: readonly [number, number, number], to: readonly [number, number, number]): readonly number[] => {
    const x = Math.round((px(from[0]) + px(to[0])) / 2);
    const y = Math.round((py(from[1]) + py(to[1])) / 2);
    return [...context.getImageData(Math.max(0, Math.min(canvas.width - 1, x)), Math.max(0, Math.min(canvas.height - 1, y)), 1, 1).data];
  };
  const firstOf = (name: string) => byCategory(name)[0];

  void lower;
  void upper;
  window.__AURA3D_PHYSICS_DEBUG_DRAW__ = {
    status: "ready",
    categories,
    hasCollider: byCategory("collider").length > 0,
    hasContact: contacts.length > 0,
    hasNormal: normals.length > 0,
    hasJoint: byCategory("joint").length > 0,
    toggledOff,
    lineCount: lines.length,
    fullRequested: fullBudget.requested,
    budget: {
      requested: cappedBudget.requested,
      emitted: cappedBudget.emitted,
      dropped: cappedBudget.dropped,
      budgeted: cappedBudget.budgeted
    },
    colliderPixel: firstOf("collider") ? midProbe(firstOf("collider")!.from, firstOf("collider")!.to) : undefined,
    contactPixel: firstOf("contact") ? midProbe(firstOf("contact")!.from, firstOf("contact")!.to) : undefined,
    normalPixel: firstOf("normal") ? midProbe(firstOf("normal")!.from, firstOf("normal")!.to) : undefined,
    jointPixel: firstOf("joint") ? midProbe(firstOf("joint")!.from, firstOf("joint")!.to) : undefined
  };
} catch (error) {
  window.__AURA3D_PHYSICS_DEBUG_DRAW__ = {
    status: "error",
    error: error instanceof Error ? (error.stack ?? error.message) : String(error)
  };
}
