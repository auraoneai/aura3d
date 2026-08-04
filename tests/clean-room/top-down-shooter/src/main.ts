/**
 * Clean-room top-down shooter.
 *
 * WS-6.2, and the whole point of GameEngine-PRD: a genre Aura3D ships **no kit for**.
 * There is no `game.shooter()`. Every mechanic here is built on the general physics
 * runtime — `app.physics` — using the public `@aura3d/engine` surface only.
 *
 * If this file needed a kit, or a private import, or a hand-rolled integrator, the layering
 * would still be wrong and the library would still be four demos rather than an engine.
 */
import {
  camera,
  createAuraApp,
  createCollisionLayers,
  game,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

/**
 * Collision layers: bullets hit enemies and walls, but never each other.
 *
 * This is the requirement that was unexpressible before WS-1.4. Without it a burst of
 * bullets collides with itself and sprays sideways out of the muzzle.
 */
const layers = createCollisionLayers({
  player: ["wall", "pickup", "enemy"],
  bullet: ["enemy", "wall"],
  enemy: ["bullet", "wall", "player"],
  wall: ["player", "bullet", "enemy"],
  pickup: ["player"]
});

const ARENA = 6;
const ENEMIES = [
  { id: "e1", x: -2.2, z: -2.4 },
  { id: "e2", x: 2.6, z: -1.6 },
  { id: "e3", x: 1.4, z: 2.8 },
  { id: "e4", x: -2.8, z: 2.2 }
];
const PICKUPS = [
  { id: "am1", x: 2.2, z: 2.2 },
  { id: "am2", x: -2.4, z: -0.6 }
];

const input = game.input({
  actions: {
    up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"],
    fire: ["Space"], reset: ["KeyR"]
  },
  axes: { moveX: { negative: "left", positive: "right" }, moveZ: { negative: "up", positive: "down" } }
});

const app = createAuraApp("#stage", {
  diagnostics: { overlay: false },
  // Layers and gravity are app-level: a mask is only meaningful against the whole layer set,
  // and a top-down game wants no gravity pulling everything through the floor.
  physics: { layers, gravity: [0, 0, 0] },
  scene: scene()
    .background("#0b1018")
    .add(primitives.box({ name: "floor", material: material.pbr({ color: "#243447", roughness: 0.9 }) })
      .position(0, -0.1, 0).scale([ARENA * 2, 0.2, ARENA * 2]))
    .add(primitives.capsule({ name: "player", material: material.pbr({ color: "#4fd1c5", roughness: 0.4 }) })
      .position(0, 0.35, 3.4).scale(0.7).runtime(game.runtimeNode("player", { tags: ["player"] })))
    .addMany(ENEMIES.map((enemy) => primitives.box({
      name: `enemy-${enemy.id}`, material: material.emissive({ color: "#e2483a", emissive: "#e2483a", emissiveIntensity: 0.5 })
    }).position(enemy.x, 0.3, enemy.z).scale(0.5).runtime(game.runtimeNode(`enemy-${enemy.id}`, { tags: ["enemy"] }))))
    .addMany(PICKUPS.map((pickup) => primitives.sphere({
      name: `pickup-${pickup.id}`, material: material.emissive({ color: "#ffd166", emissive: "#ffd166", emissiveIntensity: 1 })
    }).position(pickup.x, 0.25, pickup.z).scale(0.2).runtime(game.runtimeNode(`pickup-${pickup.id}`, { tags: ["pickup"] }))))
    .add(lights.ambient({ intensity: 0.7, color: "#dceaff" }))
    .add(lights.directional({ position: [4, 9, 5], intensity: 1.5, color: "#fff3df" }))
    .camera(camera.perspective({ position: [0, 9.5, 6.2], target: [0, 0, 0], fov: 46 }))
});

const physics = app.physics;

const playerBody = physics.createBody({
  name: "player", shape: "capsule", radius: 0.28, halfHeight: 0.3,
  mass: 1, position: [0, 0.35, 3.4], layer: "player", linearDamping: 0.9
});
for (const wall of [
  { id: "n", x: 0, z: -ARENA, hx: ARENA, hz: 0.3 }, { id: "s", x: 0, z: ARENA, hx: ARENA, hz: 0.3 },
  { id: "w", x: -ARENA, z: 0, hx: 0.3, hz: ARENA }, { id: "e", x: ARENA, z: 0, hx: 0.3, hz: ARENA }
]) {
  physics.createBody({
    name: `wall-${wall.id}`, type: "static", shape: "box",
    position: [wall.x, 0.4, wall.z], halfExtents: [wall.hx, 0.5, wall.hz], layer: "wall"
  });
}
for (const enemy of ENEMIES) {
  physics.createBody({
    name: `enemy-${enemy.id}`, shape: "box", mass: 1.4,
    position: [enemy.x, 0.3, enemy.z], halfExtents: [0.25, 0.25, 0.25], layer: "enemy", linearDamping: 0.8
  });
}
for (const pickup of PICKUPS) {
  physics.createBody({
    name: `pickup-${pickup.id}`, type: "static", shape: "sphere", radius: 0.3,
    position: [pickup.x, 0.25, pickup.z], layer: "pickup", sensor: true
  });
}

const state = { score: 0, ammo: 12, killed: [] as string[], collected: [] as string[], shotsFired: 0, bulletOnBullet: 0 };
const bullets = new Map<string, { readonly body: ReturnType<typeof physics.createBody>; life: number }>();
let bulletSeq = 0;

/** Enemy hit events, from the engine rather than a distance check per frame. */
physics.onCollision((event) => {
  const names = [event.nodeA, event.nodeB];
  const bullet = names.find((name) => name?.startsWith("bullet-"));
  const enemy = names.find((name) => name?.startsWith("enemy-"));
  if (bullet && enemy) {
    if (!state.killed.includes(enemy)) { state.killed.push(enemy); state.score += 100; }
    physics.removeBody(enemy);
    bullets.delete(bullet);
    physics.removeBody(bullet);
    return;
  }
  // Recorded so the layer mask is *proven* rather than assumed: this must stay zero.
  if (names.every((name) => name?.startsWith("bullet-"))) state.bulletOnBullet += 1;
});

/** Ammo pickups, as sensor overlaps. */
physics.onTriggerEnter((event) => {
  const pickup = [event.nodeA, event.nodeB].find((name) => name?.startsWith("pickup-"));
  if (!pickup || state.collected.includes(pickup)) return;
  state.collected.push(pickup);
  state.ammo += 6;
  physics.removeBody(pickup);
});

function fire(dirX: number, dirZ: number) {
  if (state.ammo <= 0) return;
  state.ammo -= 1;
  state.shotsFired += 1;
  const id = `bullet-${(bulletSeq += 1)}`;
  const origin = playerBody.position();
  const body = physics.createBody({
    name: id, shape: "sphere", radius: 0.08, mass: 0.05,
    position: [origin[0] + dirX * 0.45, 0.32, origin[2] + dirZ * 0.45], layer: "bullet"
  });
  body.setVelocity([dirX * 9, 0, dirZ * 9]);
  bullets.set(id, { body, life: 1.6 });
}

const hud = document.querySelector("#hud");
let aimX = 0;
let aimZ = -1;

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  const snapshot = input.update(step);
  if (snapshot.actions.reset?.pressed === true) {
    for (const [id] of bullets) physics.removeBody(id);
    bullets.clear();
    playerBody.teleport([0, 0.35, 3.4]);
    state.score = 0; state.ammo = 12; state.killed = []; state.collected = []; state.shotsFired = 0;
  }

  const moveX = input.axis("moveX");
  const moveZ = input.axis("moveZ");
  if (moveX !== 0 || moveZ !== 0) {
    // Forces, not position writes: the walls stop the player because the solver says so.
    playerBody.applyForce([moveX * 26, 0, moveZ * 26]);
    const length = Math.hypot(moveX, moveZ) || 1;
    aimX = moveX / length;
    aimZ = moveZ / length;
  }
  if (snapshot.actions.fire?.pressed === true) fire(aimX, aimZ);

  physics.step(step);

  for (const [id, bullet] of [...bullets]) {
    bullet.life -= step;
    if (bullet.life <= 0) { bullets.delete(id); physics.removeBody(id); }
  }

  // Render follows simulation.
  const player = playerBody.position();
  app.nodes.require("player").setPosition(player[0], 0.35, player[2]);
  for (const enemy of ENEMIES) {
    const node = app.nodes.get(`enemy-${enemy.id}`);
    const body = physics.bodies.get(`enemy-${enemy.id}`);
    if (!node) continue;
    if (!body) { node.setVisible(false); continue; }
    const at = body.position();
    node.setPosition(at[0], at[1], at[2]);
  }
  for (const pickup of PICKUPS) {
    app.nodes.get(`pickup-${pickup.id}`)?.setVisible(!state.collected.includes(`pickup-${pickup.id}`));
  }

  const cleared = state.killed.length === ENEMIES.length;
  if (hud) hud.textContent = `${cleared ? "cleared" : "hunting"} · score ${state.score} · ammo ${state.ammo} · ${state.killed.length}/${ENEMIES.length}`;
  (window as unknown as Record<string, unknown>).__CLEAN_ROOM_SHOOTER__ = {
    appId: "clean-room-top-down-shooter",
    status: cleared ? "cleared" : "hunting",
    score: state.score, ammo: state.ammo,
    enemiesKilled: state.killed.length, pickupsCollected: state.collected.length,
    shotsFired: state.shotsFired, liveBullets: bullets.size,
    x: player[0], z: player[2],
    // The layer-mask proof. Anything above zero means bullets collided with each other.
    bulletOnBulletContacts: state.bulletOnBullet,
    usedKit: false
  };
});
