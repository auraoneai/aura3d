/**
 * Clean-room physics sandbox.
 *
 * WS-6.1: stack crates, push them with an impulse, hear about collisions, and raycast to
 * pick one. Public `@aura3d/engine` surface only, no kit.
 *
 * Every one of those four was unreachable before WS-1: the public API let you declare a
 * body and watch it fall, and gave you no handle to push it, no collision callback, and no
 * query. This file is the smallest honest demonstration that it is now a physics API.
 */
import { camera, createAuraApp, game, lights, material, primitives, scene } from "@aura3d/engine";

const CRATES = [
  { id: "c1", x: 0, y: 0.16, z: 0 },
  { id: "c2", x: 0, y: 0.48, z: 0 },
  { id: "c3", x: 0, y: 0.8, z: 0 },
  { id: "c4", x: 0.9, y: 0.16, z: -0.4 },
  { id: "c5", x: 0.9, y: 0.48, z: -0.4 }
];

const input = game.input({
  actions: { push: ["Space"], lift: ["KeyE"], pick: ["KeyQ"], reset: ["KeyR"] }
});

const app = createAuraApp("#stage", {
  diagnostics: { overlay: false },
  scene: scene()
    .background("#101722")
    .add(primitives.box({ name: "ground", material: material.pbr({ color: "#2b3a4f", roughness: 0.92 }) })
      .position(0, -0.1, 0).scale([8, 0.2, 8]))
    .addMany(CRATES.map((crate) => primitives.box({
      name: `crate-${crate.id}`, material: material.pbr({ color: "#c98b4b", roughness: 0.7 }), castShadow: true
    }).position(crate.x, crate.y, crate.z).scale(0.32).runtime(game.runtimeNode(`crate-${crate.id}`, { tags: ["crate"] }))))
    .add(lights.ambient({ intensity: 0.66, color: "#dfeaff" }))
    .add(lights.directional({ position: [3, 7, 4], intensity: 1.6, color: "#fff4e0" }))
    .camera(camera.perspective({ position: [2.6, 1.9, 3.2], target: [0.2, 0.4, 0], fov: 45 }))
});

const physics = app.physics;
physics.createBody({
  name: "ground", type: "static", shape: "box",
  position: [0, -0.1, 0], halfExtents: [4, 0.1, 4], friction: 0.8
});
for (const crate of CRATES) {
  physics.createBody({
    name: `crate-${crate.id}`, shape: "box", mass: 1,
    position: [crate.x, crate.y, crate.z], halfExtents: [0.16, 0.16, 0.16],
    friction: 0.6, restitution: 0.05, linearDamping: 0.02
  });
}

const state = { contacts: 0, hardestImpact: 0, pushes: 0, picked: "none", pickDistance: 0, lastPickHit: false };

physics.onCollision((event) => {
  state.contacts += 1;
  // `relativeSpeed` is what separates a settle from a slam. Without it a game has to cache
  // last-frame velocities itself to tell the difference.
  if (event.relativeSpeed > state.hardestImpact) state.hardestImpact = Number(event.relativeSpeed.toFixed(4));
});

const hud = document.querySelector("#hud");

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  const snapshot = input.update(step);

  if (snapshot.actions.push?.pressed === true) {
    state.pushes += 1;
    physics.bodies.require("crate-c1").applyImpulse([2.4, 0, 0]);
  }
  if (snapshot.actions.lift?.pressed === true) {
    physics.bodies.require("crate-c3").applyImpulse([0, 2.2, 0]);
  }
  if (snapshot.actions.pick?.pressed === true) {
    // Raycast to pick: fire along the camera's view direction and report what was hit.
    const hit = physics.queries.raycast([2.6, 1.9, 3.2], [-0.62, -0.36, -0.7], { maxDistance: 12 });
    state.lastPickHit = hit !== undefined;
    state.picked = hit?.nodeName ?? "none";
    state.pickDistance = hit ? Number(hit.distance.toFixed(4)) : 0;
    // Nudge whatever was picked, so picking is observable in the simulation and not just the HUD.
    hit?.body.applyImpulse([0, 1.1, 0]);
  }
  if (snapshot.actions.reset?.pressed === true) {
    for (const crate of CRATES) {
      const body = physics.bodies.require(`crate-${crate.id}`);
      body.teleport([crate.x, crate.y, crate.z]);
      body.setVelocity([0, 0, 0]);
    }
    state.contacts = 0; state.hardestImpact = 0; state.pushes = 0;
    state.picked = "none"; state.pickDistance = 0; state.lastPickHit = false;
  }

  physics.step(step);

  let stacked = 0;
  for (const crate of CRATES) {
    const body = physics.bodies.get(`crate-${crate.id}`);
    const node = app.nodes.get(`crate-${crate.id}`);
    if (!body || !node) continue;
    const at = body.position();
    node.setPosition(at[0], at[1], at[2]);
    if (at[1] > 0.3) stacked += 1;
  }

  // Bodies within a metre of the tower base, via an overlap query rather than a manual loop.
  const nearTower = physics.queries.overlapSphere([0, 0.5, 0], 1).length;

  if (hud) hud.textContent = `contacts ${state.contacts} · stacked ${stacked} · pushes ${state.pushes} · picked ${state.picked}`;
  (window as unknown as Record<string, unknown>).__CLEAN_ROOM_SANDBOX__ = {
    appId: "clean-room-physics-sandbox",
    status: state.contacts > 0 ? "simulating" : "settling",
    contacts: state.contacts, hardestImpact: state.hardestImpact,
    pushes: state.pushes, stackedCrates: stacked, bodiesNearTower: nearTower,
    pickedNode: state.picked, pickDistance: state.pickDistance, pickHit: state.lastPickHit,
    crateOneX: Number(physics.bodies.require("crate-c1").position()[0].toFixed(4)),
    usedKit: false
  };
});
