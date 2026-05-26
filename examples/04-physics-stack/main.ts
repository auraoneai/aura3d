import { PhysicsWorld, Shape } from "@aura3d/physics";
import { createExample, drawCube2D, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

const metadata: ExampleMetadata = {
  id: "04-physics-stack",
  title: "04 Physics Stack",
  purpose: "Step a deterministic public physics world with a ground plane and dynamic boxes.",
  acceptance: "A stepped cube stack is visible and physics stats report bodies, colliders, and steps.",
};

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, () => {
    const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, solverIterations: 2 });
    const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
    world.createCollider(ground, { shape: Shape.plane([0, 1, 0], 0) });
    for (let index = 0; index < 5; index += 1) {
      const body = world.createRigidBody({ position: [0, 1 + index * 1.05, 0], restitution: 0.05 });
      world.createCollider(body, { shape: Shape.box(0.45, 0.45, 0.45) });
    }
    for (let step = 0; step < 120; step += 1) {
      world.step();
    }

    return {
      metrics: world.snapshot().stats,
      draw(context, canvas) {
        context.fillStyle = "#56636d";
        context.fillRect(canvas.width * 0.28, canvas.height * 0.76, canvas.width * 0.44, 12);
        const bodies = world.snapshot().bodies.filter((body) => body.type === "dynamic");
        bodies.forEach((body, index) => {
          drawCube2D(context, canvas.width * 0.5 - 35 + body.position[0] * 30, canvas.height * 0.72 - index * 54, 70, "#58b581", 10);
        });
      },
    };
  });
}
