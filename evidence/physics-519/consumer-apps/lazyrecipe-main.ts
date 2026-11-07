import { camera, createAuraApp, lights, material, primitives, scene, type AuraNodeBuilder, type AuraPrimitiveNode } from "@aura3d/engine";

// Rigid bodies on scene nodes: a static ground, a stacked wall of crates, a ball on a ball-socket rope that swings
// into the wall (the wrecking ball), collision events, and a deterministic fixed step. Needs the Rapier backend
// (`npm install @dimforge/rapier3d-compat@0.20.0`); without it the app reports PHYSICS_BACKEND_MISSING in
// diagnostics().errors and on the canvas. ?steps=N freezes the simulation after N fixed steps for a capture.
const STEP = 1 / 60; // fixed step: the result depends on the step count, never on the display rate
const MAX_CATCH_UP = 5;
const freezeAt = new URLSearchParams(location.search).get("steps");

const CRATE = 0.5;
const COLORS = ["#c98b4b", "#b8763a", "#d9a066", "#a86a32"];
const crates: AuraNodeBuilder<AuraPrimitiveNode>[] = [];
for (let row = 0; row < 5; row += 1) {
  for (let col = 0; col < 4; col += 1) {
    crates.push(
      primitives.box({ name: `crate-${row}-${col}`, size: CRATE, material: material.pbr({ color: COLORS[(row + col) % COLORS.length]!, roughness: 0.8 }) })
        .position(0.2 + (row % 2) * 0.02, CRATE / 2 + row * CRATE, (col - 1.5) * CRATE)
        .runtime({ id: `crate-${row}-${col}` })
        .physics({ type: "dynamic", shape: "box", halfExtents: [CRATE / 2, CRATE / 2, CRATE / 2], mass: 1, friction: 0.7, restitution: 0.05 })
    );
  }
}

const PIVOT: [number, number, number] = [-1.2, 6.2, 0]; // rope anchor; the ball starts 5 m away on the arc and falls into the wall
const BALL_START: [number, number, number] = [-4.2, 2.2, 0];

const app = createAuraApp("#app", {
  physics: { gravity: [0, -9.81, 0], bindNodes: true, seed: 7 },
  scene: scene({ background: "#8fb4d8" })
    .add(lights.hemisphere({ skyColor: "#cfe2f6", groundColor: "#4a5a3a", intensity: 1.2 }))
    .add(lights.directional({ name: "sun", position: [6, 9, 5], target: [0, 0.5, 0], intensity: 4, color: "#fff0d8", shadow: true }))
    .add(
      primitives.box({ name: "ground", size: [30, 0.5, 14], material: material.pbr({ color: "#6f8a50", roughness: 1 }) })
        .position(0, -0.25, 0)
        .runtime({ id: "ground" })
        .physics({ type: "static", shape: "box", halfExtents: [15, 0.25, 7], friction: 0.9 })
    )
    .add(primitives.box({ name: "gantry", size: [8, 0.25, 0.4], material: material.pbr({ color: "#394457", metallic: 0.6, roughness: 0.4 }) }).position(PIVOT[0], PIVOT[1] + 0.125, 0))
    .add(primitives.box({ name: "post-left", size: [0.3, PIVOT[1], 0.4], material: material.pbr({ color: "#394457", metallic: 0.6, roughness: 0.4 }) }).position(PIVOT[0] - 3.85, PIVOT[1] / 2, 0))
    .add(primitives.box({ name: "post-right", size: [0.3, PIVOT[1], 0.4], material: material.pbr({ color: "#394457", metallic: 0.6, roughness: 0.4 }) }).position(PIVOT[0] + 3.85, PIVOT[1] / 2, 0))
    .addMany(crates)
    .add(
      primitives.sphere({ name: "ball", size: 1.1, material: material.pbr({ color: "#d94b3d", metallic: 0.4, roughness: 0.35 }) })
        .position(...BALL_START)
        .runtime({ id: "ball" })
        .physics({ type: "dynamic", shape: "sphere", radius: 0.55, mass: 6, restitution: 0.1, friction: 0.5 })
    )
    .camera(camera.perspective({ position: [4, 3.6, 13], target: [-0.8, 2.7, 0], fov: 46, near: 0.1, far: 200 }))
});

// On-demand physics (aura3d({ physics: "lazy" })): the declared bodies are created when Rapier has loaded.
await app.physics.ready();

// The anchor is a body-less pivot: a static body with no node, and the rope is a ball-socket joint through the
// world-space anchor point above the ball (anchors are world space, bodies keep their local frames).
app.physics.createBody({ name: "pivot", type: "static", shape: "sphere", radius: 0.05, position: PIVOT, sensor: true });
app.physics.createJoint({ kind: "ball-socket", bodyA: "pivot", bodyB: "ball", anchor: PIVOT });

// Collision events: count solid hits and remember the hardest one. The page object is what the render gate reads.
const stats = { steps: 0, solidHits: 0, hardestHit: 0, firstCrateHitStep: -1 };
app.physics.onCollision((event) => {
  if (event.phase !== "begin" || event.sensor) return;
  stats.solidHits += 1;
  stats.hardestHit = Math.max(stats.hardestHit, event.relativeSpeed);
  const names = [event.nodeA, event.nodeB];
  if (stats.firstCrateHitStep < 0 && names.includes("ball") && names.some((name) => name?.startsWith("crate-"))) stats.firstCrateHitStep = stats.steps;
});

const frozen = freezeAt === null ? undefined : Math.max(0, Math.floor(Number(freezeAt)));
let accumulator = 0;
const stepOnce = (): void => { app.physics.step(STEP); stats.steps += 1; };
if (frozen !== undefined) for (let i = 0; i < frozen; i += 1) stepOnce();
app.onFrame((frame) => {
  if (frozen !== undefined) return;
  accumulator = Math.min(accumulator + frame.dt, STEP * MAX_CATCH_UP);
  while (accumulator >= STEP) { stepOnce(); accumulator -= STEP; }
});

const positions = (): Record<string, readonly number[]> =>
  Object.fromEntries(["ball", "crate-0-0", "crate-4-2"].map((name) => [name, app.physics.bodies.require(name).position().map((value) => Math.round(value * 1e4) / 1e4)]));
(window as unknown as { __PHYSICS_RECIPE__: unknown }).__PHYSICS_RECIPE__ = { stats, positions, diagnostics: () => app.diagnostics().errors };
await app.ready();
