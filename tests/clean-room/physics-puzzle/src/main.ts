/**
 * Clean-room physics puzzle: a hinged door, a sliding block, a spring platform.
 *
 * WS-6.3: joints only, no kit. This is the file that proves joints are *usable* rather than
 * merely present.
 *
 * Worth stating plainly, because it is why `joints / constraints` sat at "unproven, 0
 * consumers" for so long: until this release joints did not work at all on the default
 * `cannon-es` backend. `PhysicsWorld.stepCannon` never called `constraint.solve()`, so a
 * body on a `fixed` joint free-fell instead of hanging. Nothing built here was buildable
 * before that fix.
 */
import { camera, createAuraApp, game, lights, material, primitives, scene } from "@aura3d/engine";

const input = game.input({
  actions: { open: ["KeyE"], slide: ["KeyF"], bounce: ["Space"], reset: ["KeyR"] }
});

const app = createAuraApp("#stage", {
  diagnostics: { overlay: false },
  scene: scene()
    .background("#141c26")
    .add(primitives.box({ name: "ground", material: material.pbr({ color: "#2a3646", roughness: 0.9 }) })
      .position(0, -0.1, 0).scale([9, 0.2, 9]))
    .add(primitives.box({ name: "frame", material: material.pbr({ color: "#6b7686", roughness: 0.6 }) })
      .position(-1.4, 0.6, 0).scale([0.12, 1.2, 0.12]))
    .add(primitives.box({ name: "door", material: material.pbr({ color: "#b5763c", roughness: 0.65 }) })
      .position(-0.85, 0.6, 0).scale([1, 1.1, 0.08]).runtime(game.runtimeNode("door", { tags: ["door"] })))
    .add(primitives.box({ name: "rail", material: material.pbr({ color: "#6b7686", roughness: 0.6 }) })
      .position(1.2, 0.42, -1.1).scale([0.14, 0.14, 0.14]))
    .add(primitives.box({ name: "block", material: material.pbr({ color: "#4c8fd0", roughness: 0.5 }) })
      .position(2.2, 0.42, -1.1).scale(0.3).runtime(game.runtimeNode("block", { tags: ["block"] })))
    .add(primitives.box({ name: "mount", material: material.pbr({ color: "#6b7686", roughness: 0.6 }) })
      .position(1.2, 0.06, 1.5).scale([0.2, 0.12, 0.2]))
    .add(primitives.box({ name: "platform", material: material.emissive({ color: "#6ee7a8", emissive: "#6ee7a8", emissiveIntensity: 0.35 }) })
      .position(1.2, 0.75, 1.5).scale([0.6, 0.08, 0.6]).runtime(game.runtimeNode("platform", { tags: ["platform"] })))
    .add(lights.ambient({ intensity: 0.68, color: "#e2edff" }))
    .add(lights.directional({ position: [4, 8, 5], intensity: 1.5, color: "#fff5e6" }))
    .camera(camera.perspective({ position: [3.4, 2.6, 4.2], target: [0.4, 0.6, 0], fov: 48 }))
});

const physics = app.physics;
physics.createBody({ name: "ground", type: "static", shape: "box", position: [0, -0.1, 0], halfExtents: [4.5, 0.1, 4.5], friction: 0.7 });

/** A hinged door, driven by a motor so it can be opened on demand. */
physics.createBody({ name: "frame", type: "static", shape: "box", position: [-1.4, 0.6, 0], halfExtents: [0.06, 0.6, 0.06] });
physics.createBody({ name: "door", shape: "box", mass: 2.4, position: [-0.85, 0.6, 0], halfExtents: [0.5, 0.55, 0.04], linearDamping: 0.4, angularDamping: 0.5 });
const doorHinge = physics.createJoint({
  kind: "motorised-hinge", bodyA: "frame", bodyB: "door",
  anchor: [-1.4, 0.6, 0], axis: [0, 1, 0], motorSpeed: 0, maxMotorTorque: 6
});

/** A block on a slider: it may travel along the rail axis and nothing else. */
physics.createBody({ name: "rail", type: "static", shape: "box", position: [1.2, 0.42, -1.1], halfExtents: [0.07, 0.07, 0.07] });
physics.createBody({ name: "block", shape: "box", mass: 1.6, position: [2.2, 0.42, -1.1], halfExtents: [0.15, 0.15, 0.15], linearDamping: 0.5 });
physics.createJoint({ kind: "slider", bodyA: "rail", bodyB: "block", anchor: [1.2, 0.42, -1.1], axis: [1, 0, 0] });

/** A spring platform that returns to rest after being pushed down. */
physics.createBody({ name: "mount", type: "static", shape: "box", position: [1.2, 0.06, 1.5], halfExtents: [0.1, 0.06, 0.1] });
physics.createBody({ name: "platform", shape: "box", mass: 1.1, position: [1.2, 0.75, 1.5], halfExtents: [0.3, 0.04, 0.3], linearDamping: 0.25 });
physics.createJoint({
  kind: "spring", bodyA: "mount", bodyB: "platform",
  anchor: [1.2, 0.06, 1.5], restLength: 0.69, stiffness: 0.5, damping: 0.25
});

const REST = { door: [-0.85, 0.6, 0], block: [2.2, 0.42, -1.1], platform: [1.2, 0.75, 1.5] } as const;
const state = { opened: false, doorTravel: 0, blockTravel: 0, springDip: 0, solved: false };
const hud = document.querySelector("#hud");

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  const snapshot = input.update(step);

  if (snapshot.actions.open?.pressed === true) {
    state.opened = !state.opened;
    doorHinge.setMotorSpeed(state.opened ? 1.8 : -1.8);
  }
  if (snapshot.actions.slide?.pressed === true) physics.bodies.require("block").applyImpulse([-2.2, 0, 0]);
  if (snapshot.actions.bounce?.pressed === true) physics.bodies.require("platform").applyImpulse([0, -1.4, 0]);
  if (snapshot.actions.reset?.pressed === true) {
    for (const [name, at] of Object.entries(REST)) {
      const body = physics.bodies.require(name);
      body.teleport([...at] as [number, number, number]);
      body.setVelocity([0, 0, 0]);
      body.setAngularVelocity([0, 0, 0]);
    }
    doorHinge.setMotorSpeed(0);
    state.opened = false; state.doorTravel = 0; state.blockTravel = 0; state.springDip = 0; state.solved = false;
  }

  physics.step(step);

  for (const name of ["door", "block", "platform"]) {
    const body = physics.bodies.get(name);
    const node = app.nodes.get(name);
    if (!body || !node) continue;
    const at = body.position();
    node.setPosition(at[0], at[1], at[2]);
  }

  const door = physics.bodies.require("door").position();
  const block = physics.bodies.require("block").position();
  const platform = physics.bodies.require("platform").position();
  state.doorTravel = Math.max(state.doorTravel, Math.hypot(door[0] - REST.door[0], door[2] - REST.door[2]));
  state.blockTravel = Math.max(state.blockTravel, Math.abs(block[0] - REST.block[0]));
  state.springDip = Math.max(state.springDip, Math.max(0, REST.platform[1] - platform[1]));
  // The puzzle is "solved" when all three joints have demonstrably done their job.
  state.solved = state.doorTravel > 0.08 && state.blockTravel > 0.08 && state.springDip > 0.02;

  if (hud) {
    hud.textContent = `${state.solved ? "solved" : "solving"} · door ${state.doorTravel.toFixed(2)} · block ${state.blockTravel.toFixed(2)} · spring ${state.springDip.toFixed(2)}`;
  }
  (window as unknown as Record<string, unknown>).__CLEAN_ROOM_PUZZLE__ = {
    appId: "clean-room-physics-puzzle",
    status: state.solved ? "solved" : "solving",
    doorOpen: state.opened,
    doorTravel: Number(state.doorTravel.toFixed(4)),
    blockTravel: Number(state.blockTravel.toFixed(4)),
    springDip: Number(state.springDip.toFixed(4)),
    // Live height as well as the peak: a peak-only value stops changing once the spring has
    // been compressed once, which makes a second bounce look inert to an observer.
    platformY: Number(platform[1].toFixed(4)),
    blockX: Number(block[0].toFixed(4)),
    doorAngleProxy: Number(door[2].toFixed(4)),
    // The slider constraint's whole job: the block must not wander off its axis.
    blockOffAxisDrift: Number(Math.abs(block[2] - REST.block[2]).toFixed(4)),
    jointKinds: ["motorised-hinge", "slider", "spring"],
    usedKit: false
  };
});
