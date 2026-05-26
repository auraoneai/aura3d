import { PhysicsDebugDraw, PhysicsWorld, Shape } from "@aura3d/physics";

interface PhysicsBrowserResult {
  readonly status: "ready" | "error";
  readonly initialHeights?: readonly number[];
  readonly finalHeights?: readonly number[];
  readonly steps?: number;
  readonly contacts?: number;
  readonly debugLineCount?: number;
  readonly cubePixel?: readonly number[];
  readonly debugPixel?: readonly number[];
  readonly groundPixel?: readonly number[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_PHYSICS_BROWSER_TEST__?: PhysicsBrowserResult;
  }
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>("#physics-surface");
  const context = canvas?.getContext("2d");
  if (!canvas || !context) throw new Error("Physics browser canvas is unavailable.");

  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, solverIterations: 3 });
  const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(ground, { shape: Shape.plane([0, 1, 0], 0) });

  const dynamicBodies = [0, 1, 2].map((index) => {
    const body = world.createRigidBody({
      position: [index * 0.85 - 0.85, 3.5 + index * 1.15, 0],
      restitution: 0.05,
      linearDamping: 0.01
    });
    world.createCollider(body, { shape: Shape.box(0.35, 0.35, 0.35) });
    return body;
  });
  const initialHeights = dynamicBodies.map((body) => body.position[1]);

  let maxContacts = 0;
  let totalEvents = 0;
  for (let step = 0; step < 150; step += 1) {
    world.step();
    const stepSnapshot = world.snapshot();
    maxContacts = Math.max(maxContacts, stepSnapshot.stats.contacts);
    totalEvents += stepSnapshot.stats.events;
  }

  const snapshot = world.snapshot();
  const finalHeights = dynamicBodies.map((body) => Number(body.position[1].toFixed(3)));
  const debugLines = new PhysicsDebugDraw().buildLines(world);

  context.fillStyle = "rgb(9, 13, 19)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgb(88, 100, 112)";
  context.fillRect(34, worldToCanvasY(-0.5) - 6, 190, 12);

  for (const body of dynamicBodies) {
    drawCube(context, body.position[0], body.position[1]);
  }

  context.strokeStyle = "rgb(30, 205, 255)";
  context.lineWidth = 2;
  for (const line of debugLines) {
    context.beginPath();
    context.moveTo(worldToCanvasX(line.from[0]), worldToCanvasY(line.from[1]));
    context.lineTo(worldToCanvasX(line.to[0]), worldToCanvasY(line.to[1]));
    context.stroke();
  }

  const first = dynamicBodies[0]!;
  window.__AURA3D_PHYSICS_BROWSER_TEST__ = {
    status: "ready",
    initialHeights,
    finalHeights,
    steps: snapshot.stats.steps,
    contacts: maxContacts,
    events: totalEvents,
    debugLineCount: debugLines.length,
    cubePixel: readPixel(context, worldToCanvasX(first.position[0]), worldToCanvasY(first.position[1])),
    debugPixel: readPixel(context, worldToCanvasX(first.position[0] - 0.35), worldToCanvasY(first.position[1])),
    groundPixel: readPixel(context, 80, worldToCanvasY(-0.5))
  };
} catch (error) {
  window.__AURA3D_PHYSICS_BROWSER_TEST__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
}

function drawCube(context: CanvasRenderingContext2D, x: number, y: number): void {
  const centerX = worldToCanvasX(x);
  const centerY = worldToCanvasY(y);
  context.fillStyle = "rgb(82, 184, 129)";
  context.fillRect(centerX - 14, centerY - 14, 28, 28);
}

function worldToCanvasX(x: number): number {
  return Math.round(130 + x * 42);
}

function worldToCanvasY(y: number): number {
  return Math.round(162 - y * 32);
}

function readPixel(context: CanvasRenderingContext2D, x: number, y: number): readonly number[] {
  return [...context.getImageData(x, y, 1, 1).data];
}
