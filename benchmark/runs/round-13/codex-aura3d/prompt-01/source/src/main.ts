import {
  camera,
  createAuraApp,
  interactions,
  lights,
  PhysicsDebugAdapter,
  PhysicsWorld,
  prefabs,
  scene,
  Shape,
  ui
} from "@aura3d/engine";
import "./style.css";

const cubeCount = 50;
const contactDebug = new PhysicsDebugAdapter();

ui.html(
  "#app",
  `
    <div class="hud" aria-label="physics playground controls">
      <button id="reset" class="reset" type="button">Reset</button>
      <div class="readout">
        <span class="label">Live contacts</span>
        <span id="contacts" class="count">0</span>
      </div>
      <div class="evidence">50 cubes, tilted ramp, contact patches, normals, gravity cue</div>
    </div>
  `
);

let app = createPlaygroundApp();
let world = createContactWorld();
let animationFrame = 0;

function createPlaygroundApp() {
  return createAuraApp("#app", {
    scene: scene()
      .background("#070b12")
      .addMany(prefabs.physicsPlayground({ cubes: cubeCount }))
      .add(lights.studio({ intensity: 1.15 }))
      .add(interactions.orbit())
      .camera(camera.orbit({ distance: 5.2, target: [0, 0.45, -0.75] }))
  });
}

function createContactWorld() {
  const nextWorld = new PhysicsWorld({
    gravity: [0, -9.8, 0],
    fixedDelta: 1 / 60,
    solverIterations: 8
  });

  const floor = nextWorld.createRigidBody({ type: "static", position: [0.35, 0, -0.68] });
  nextWorld.createCollider(floor, {
    shape: Shape.plane([0, 1, 0], 0),
    material: { restitution: 0.24, friction: 0.72 }
  });

  const ramp = nextWorld.createRigidBody({ type: "static", position: [-0.35, 0.28, -0.8] });
  nextWorld.createCollider(ramp, {
    shape: Shape.plane([0.34, 0.94, 0], -0.13),
    material: { restitution: 0.18, friction: 0.86 }
  });

  for (let index = 0; index < cubeCount; index += 1) {
    const col = index % 10;
    const row = Math.floor(index / 10);
    const cube = nextWorld.createRigidBody({
      type: "dynamic",
      position: [-1.45 + col * 0.32 + (row % 2) * 0.08, 1.2 + row * 0.26, -1.2 + (index % 5) * 0.22],
      velocity: [0.7 + (col % 3) * 0.15, -0.3 - row * 0.06, 0.04 * ((index % 2) * 2 - 1)],
      angularVelocity: [0.2 + index * 0.01, 0.08, -0.14],
      mass: 1,
      linearDamping: 0.02,
      angularDamping: 0.08
    });
    nextWorld.createCollider(cube, {
      shape: Shape.box(0.09, 0.09, 0.09),
      material: { restitution: 0.28, friction: 0.58 }
    });
  }

  return nextWorld;
}

function updateContactReadout() {
  for (let step = 0; step < 2; step += 1) {
    world.step(1 / 60);
  }

  const snapshot = contactDebug.snapshot(world);
  ui.setText("#contacts", String(snapshot.contactCount));
  animationFrame = window.requestAnimationFrame(updateContactReadout);
}

ui.onClick("#reset", (button) => {
  window.cancelAnimationFrame(animationFrame);
  app.dispose();
  app = createPlaygroundApp();
  world = createContactWorld();
  ui.setText("#contacts", "0");
  ui.setText(button, "Reset");
  updateContactReadout();
});

updateContactReadout();
