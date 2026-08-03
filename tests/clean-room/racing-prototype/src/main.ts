/**
 * Clean-room racing prototype.
 *
 * Public surface only, no showcase source consulted. Measures what a developer must
 * author for a drivable car with real grounding and suspension, an AI opponent, lap
 * progression and a chase camera.
 */
import {
  camera,
  createAuraApp,
  createVehicleChassis,
  createVehicleDriverAi,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  vehicleChassisSpecFromBounds,
  type DriverRoute,
  type VehicleSurface
} from "@aura3d/engine";
import { assets } from "./assets";

/** An oval circuit. The only authored level data in the project. */
const RADIUS_X = 14;
const RADIUS_Z = 9;
const ROAD_HALF_WIDTH = 1.6;
const TRACK_Y = 0;
const POINTS = Array.from({ length: 32 }, (_, index) => {
  const angle = (index / 32) * Math.PI * 2;
  return { x: Math.cos(angle) * RADIUS_X, y: Math.sin(angle) * RADIUS_Z };
});

const routeLength = POINTS.reduce((total, point, index) => {
  const next = POINTS[(index + 1) % POINTS.length]!;
  return total + Math.hypot(next.x - point.x, next.y - point.y);
}, 0);

const line = (progress: number) => {
  const wrapped = ((progress % 1) + 1) % 1;
  const scaled = wrapped * POINTS.length;
  const index = Math.floor(scaled) % POINTS.length;
  const a = POINTS[index]!;
  const b = POINTS[(index + 1) % POINTS.length]!;
  const t = scaled - Math.floor(scaled);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
};
const heading = (progress: number) => {
  const here = line(progress);
  const ahead = line(progress + 1 / POINTS.length);
  return Math.atan2(ahead.y - here.y, ahead.x - here.x);
};

const driverRoute: DriverRoute = { length: routeLength, halfWidth: () => ROAD_HALF_WIDTH, sample: (p) => ({ ...line(p), heading: heading(p) }) };

const player = game.racing({ route: { id: "oval", points: POINTS, checkpoints: [0.25, 0.5, 0.75, 0.98] }, maxSpeed: 22, acceleration: 18, lapsToWin: 3 });
const rival = game.racing({ route: { id: "oval", points: POINTS, checkpoints: [0.25, 0.5, 0.75, 0.98] }, maxSpeed: 22, acceleration: 18, lapsToWin: 3, startProgress: 0.1 });
const rivalDriver = createVehicleDriverAi(driverRoute, { maxSpeed: 22, corneringAcceleration: 26, seed: 7 });

/** Surface: tarmac on the road, a graded shoulder outside it. */
const surface: VehicleSurface = {
  sample: (x, z) => {
    const contact = player.surfaceQuery.query({ x, y: z });
    const beyond = Math.max(0, contact.trackOffset - contact.roadHalfWidth);
    const fraction = Math.min(1, beyond / (ROAD_HALF_WIDTH * 0.6));
    return { height: TRACK_Y - 0.06 * fraction, normal: [0, 1, 0], grip: 1 - 0.4 * fraction };
  }
};

const carSpec = vehicleChassisSpecFromBounds([4.2, 1.2, 1.9]);
const playerChassis = createVehicleChassis(carSpec, surface);
const rivalChassis = createVehicleChassis(carSpec, surface);

const input = game.input({
  actions: { throttle: ["KeyW", "ArrowUp"], brake: ["KeyS", "ArrowDown"], left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], reset: ["KeyR"] },
  axes: { steer: { negative: "left", positive: "right" } }
});

const carNode = (id: string, color: string) => model(assets.turboRaceCar, {
  name: id, scaleMode: "fit", targetMaxDimension: 4.2, castShadow: true,
  material: material.clearcoatPaint({ color, roughness: 0.15, metallic: 0.2, clearcoat: 0.85 })
}).position(0, 0, 0).runtime(game.runtimeNode(id, { tags: ["vehicle"] }));

const app = createAuraApp("#stage", {
  diagnostics: { overlay: false },
  scene: scene()
    .background("#6fa8c9")
    .add(primitives.plane({ name: "ground", material: material.pbr({ color: "#4f7a4a", roughness: 0.9 }) }).position(0, -0.08, 0).scale([60, 1, 60]))
    .addMany(POINTS.map((point, index) => primitives.box({
      name: `road segment ${index + 1}`, material: material.pbr({ color: "#2f3336", roughness: 0.72 })
    }).position(point.x, TRACK_Y - 0.03, point.y).rotate(0, -heading(index / POINTS.length), 0).scale([routeLength / POINTS.length * 1.15, 0.05, ROAD_HALF_WIDTH * 2])))
    .add(carNode("player-car", "#e0533a"))
    .add(carNode("rival-car", "#3a7ce0"))
    .add(lights.ambient({ intensity: 0.7, color: "#cfe6f2" }))
    .add(lights.directional({ position: [-20, 26, 14], intensity: 2, color: "#fff2dc" }))
    .camera(camera.perspective({ position: [RADIUS_X, 8, RADIUS_Z + 14], target: [0, 0, 0], fov: 52 }))
});

const playerCar = app.nodes.require("player-car");
const rivalCar = app.nodes.require("rival-car");
const hud = document.querySelector("#hud");

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  const snapshot = input.update(step);
  if (snapshot.actions.reset?.pressed) {
    player.reset(0);
    rival.reset(0.1);
    rivalDriver.reset();
  }
  const playerState = player.step(step, {
    throttle: input.held("throttle"), brake: input.held("brake"), steer: input.axis("steer")
  });
  const decision = rivalDriver.decide(step, {
    progress: rival.snapshot().progress, speed: rival.snapshot().speed, heading: rival.snapshot().heading,
    signedTrackOffset: rival.snapshot().signedTrackOffset, position: rival.snapshot().position, offTrack: rival.snapshot().offTrack
  });
  const rivalState = rival.step(step, { throttle: decision.throttle > 0.08, brake: decision.brake > 0.08, steer: decision.steer });

  for (const [node, chassis, snap] of [[playerCar, playerChassis, playerState], [rivalCar, rivalChassis, rivalState]] as const) {
    const pose = chassis.step(step, {
      x: snap.position.x, z: snap.position.y, heading: -snap.heading + Math.PI / 2,
      speed: snap.speed, steer: 0, throttle: 1, brake: 0, slip: snap.drift
    });
    // `groundedPosition`: the car model is `scaleMode: "fit"`, so its node position is
    // its contact plane, not its body centre.
    node.setPosition(pose.groundedPosition[0], pose.groundedPosition[1], pose.groundedPosition[2]);
    node.setRotation(pose.rotation[0], pose.rotation[1], pose.rotation[2]);
  }

  if (hud) hud.textContent = `Lap ${playerState.lap}/3 · gate ${playerState.checkpoint} · ${Math.round(playerState.speed * 3.6)} km/h · ${playerState.status}`;
  (window as unknown as Record<string, unknown>).__CLEAN_ROOM_RACING__ = {
    appId: "clean-room-racing", status: playerState.status, lap: playerState.lap,
    checkpoint: playerState.checkpoint, speed: playerState.speed,
    grounded: playerChassis.pose().grounded, groundedWheels: playerChassis.telemetry().groundedWheels,
    maxContactGap: playerChassis.telemetry().maxContactGap,
    rivalProgress: rivalState.progress, rivalController: "aura-vehicle-driver-ai"
  };
});
