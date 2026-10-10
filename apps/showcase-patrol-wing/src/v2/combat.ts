import { game as engineGame } from "@aura3d/engine";
import type { Game } from "@aura3d/game";
import { FlightModel, type FlightOutcome } from "../gameplay/flight";
import { PATROL_COUNT, WAVES_PER_PATROL, WAVE_TRIGGERS, droneSpeed, gradePatrol, gradeRank, interceptSpawns, ringHalfExtent, waveSpawns, type PatrolGrade } from "../gameplay/patrol";
import { ORB_DAMAGE } from "../gameplay/drones";
import { encodeControlFrame } from "../gameplay/weapons";
import { GhostPlayer } from "../gameplay/ghost";
import { PAD_CENTER, PAD_HEADING_YAW, PAD_RADIUS, PAD_Y, RING_GATES, RING_COUNT, terrainSurface } from "../legacy/sky";
import { DRONE_NODE_COUNT, ORB_POOL_SIZE } from "./scene/world";
import type { PatrolCtx } from "./state";
import type { wirePatrolFx } from "./scene/fx";
import type { WingAudioCue } from "../legacy/wing-audio";

const PLAYER_SENSOR_RADIUS = 0.6;
const ORB_SENSOR_RADIUS = 0.4;
const ORB_SPEED = 16;
const ORB_LIFETIME = 4.5;

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
type CollisionWorld = ReturnType<typeof engineGame.collisionWorld>;

export function wirePatrolCombat(ctx: PatrolCtx, deps: {
  game: Game;
  handle: (name: string) => NodeHandle;
  fx: ReturnType<typeof wirePatrolFx>;
  pushCue: (cue: WingAudioCue) => void;
  cueReady: (name: string, gapFrames: number) => boolean;
  autopilotRequested: boolean;
}) {
  const { game, handle, fx, pushCue, cueReady } = deps;
// ------------------------------------------------------------- physics ------
// Rapier sensor layer: a kinematic player proxy (r 0.6) driven by the
// authored FlightModel position, six ordered ring sensors, the pad sensor,
// and an 8-orb return-fire pool. Nothing simulates the ctx.flight — sensors only
// report overlap events that the sortie rules consume.
const collisionWorld = engineGame.collisionWorld({ backend: "rapier", gravity: [0, 0, 0] });
const PLAYER_PROXY_ID = "player-proxy";

interface OrbRuntime {
  readonly id: string;
  readonly bodyId: string;
  active: boolean;
  direction: [number, number, number];
  age: number;
}

function buildCollisions(): void {
  collisionWorld.clear();
  ctx.sensorCountValue = 0;
  ctx.orbs.length = 0;
  const half = ringHalfExtent(ctx.patrolValue);

  const proxy = collisionWorld.add({
    id: PLAYER_PROXY_ID,
    type: "dynamic",
    position: [...ctx.flight.position] as [number, number, number],
    shape: { kind: "sphere", radius: PLAYER_SENSOR_RADIUS }
  });
  ctx.playerProxyId = proxy.id;

  for (const gate of RING_GATES) {
    collisionWorld.add({
      id: `ring:${gate.index}`,
      type: "static",
      position: [gate.position[0], gate.position[1], gate.position[2]],
      shape: { kind: "box", halfExtents: [half, half, half * 0.9] },
      sensor: true
    });
    ctx.sensorCountValue += 1;
  }
  collisionWorld.add({
    id: "pad:pad",
    type: "static",
    position: [PAD_CENTER[0], PAD_Y + 0.6, PAD_CENTER[2]],
    shape: { kind: "box", halfExtents: [PAD_RADIUS + 0.6, 0.7, PAD_RADIUS + 0.6] },
    sensor: true
  });
  ctx.sensorCountValue += 1;

  for (let index = 0; index < ORB_POOL_SIZE; index += 1) {
    const body = collisionWorld.add({
      id: `orb-${index}`,
      type: "dynamic",
      position: [0, -40 - index, 0],
      shape: { kind: "sphere", radius: ORB_SENSOR_RADIUS },
      sensor: true
    });
    ctx.orbs.push({ id: `orb-${index}`, bodyId: body.id, active: false, direction: [0, 1, 0], age: 0 });
  }
}
// --------------------------------------------------------- ring visuals -----

function applyRingState(): void {
  for (const gate of RING_GATES) {
    const gateHandle = handle(`ring-${gate.index}`);
    const passedHandle = handle(`ring-${gate.index}-passed`);
    if (!gateHandle || !passedHandle) continue;
    const passed = gate.index < ctx.rings.nextRing;
    const isNext = gate.index === ctx.rings.nextRing && ctx.stateValue !== "preflight";
    passedHandle.setVisible(passed);
    const s = isNext ? 1.25 : 1;
    gateHandle
      .setScale([gate.radius * 2 * s, gate.radius * 2 * s, gate.radius * 0.9])
      .setVisible(!passed);
  }
  const nextGate = ctx.stateValue === "preflight" ? undefined : RING_GATES[ctx.rings.nextRing];
  const beacon = handle("next-ring-beacon");
  if (beacon) {
    if (nextGate) {
      beacon.setPosition(nextGate.position[0], nextGate.position[1] + 5, nextGate.position[2]);
      beacon.setVisible(true);
    } else {
      beacon.setVisible(false);
    }
  }
}

// ------------------------------------------------------------- waves --------
for (let slot = DRONE_NODE_COUNT - 1; slot >= 0; slot -= 1) ctx.freeDroneSlots.push(slot);

function spawnWave(wave: number): void {
  ctx.currentWave = wave;
  ctx.spawnedWaves.add(wave);
  const spawns = waveSpawns(ctx.patrolValue, wave);
  for (const spawn of spawns) {
    const slot = ctx.freeDroneSlots.pop();
    if (slot === undefined) break;
    ctx.droneSlotById.set(spawn.id, slot);
  }
  ctx.swarm.spawnWave(spawns.filter((spawn) => ctx.droneSlotById.has(spawn.id)));
}

/** Intercept wedge used by `?autorun`/`?scenario=` only — same spawn path. */
function spawnInterceptLeg(): void {
  if (ctx.spawnedWaves.has(0)) return;
  ctx.currentWave = 0;
  ctx.spawnedWaves.add(0);
  const spawns = interceptSpawns(ctx.patrolValue, 0, ctx.flight.position, ctx.flight.forward);
  for (const spawn of spawns) {
    const slot = ctx.freeDroneSlots.pop();
    if (slot === undefined) break;
    ctx.droneSlotById.set(spawn.id, slot);
  }
  ctx.swarm.spawnWave(spawns.filter((spawn) => ctx.droneSlotById.has(spawn.id)));
}

// ------------------------------------------------------------ orb pool ------

function spawnOrb(from: readonly [number, number, number], toward: readonly [number, number, number]): void {
  const orb = ctx.orbs.find((candidate) => !candidate.active);
  if (!orb) return;
  const dx = toward[0] - from[0];
  const dy = toward[1] - from[1];
  const dz = toward[2] - from[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  orb.direction = [dx / len, dy / len, dz / len];
  orb.age = 0;
  orb.active = true;
  collisionWorld.require(orb.bodyId).setPosition([from[0], from[1], from[2]]);
}

function stepOrbs(dt: number): void {
  for (const orb of ctx.orbs) {
    if (!orb.active) continue;
    orb.age += dt;
    const body = collisionWorld.require(orb.bodyId);
    const p = body.position;
    if (orb.age > ORB_LIFETIME) {
      orb.active = false;
      body.setPosition([0, -40, 0]);
      continue;
    }
    body.setPosition([
      p[0] + orb.direction[0] * ORB_SPEED * dt,
      p[1] + orb.direction[1] * ORB_SPEED * dt,
      p[2] + orb.direction[2] * ORB_SPEED * dt
    ]);
  }
}

// ------------------------------------------------------------ outcomes ------

function objectiveComplete(): boolean {
  return ctx.rings.complete && ctx.spawnedWaves.size >= WAVES_PER_PATROL && ctx.swarm.allCleared;
}

function applyHullDamage(amount: number): number {
  ctx.hullValue = Math.max(0, ctx.hullValue - Math.max(0, amount));
  if (ctx.hullValue <= 0 && (ctx.stateValue === "patrol" || ctx.stateValue === "preflight")) beginFail("shot-down");
  else if (amount > 0 && cueReady("hull-alarm", 70)) pushCue("hull-alarm");
  return ctx.hullValue;
}

function beginFail(reason: "shot-down"): void {
  pushCue("shot-down");
  ctx.ghostRecorder.end();
  ctx.stateValue = reason;
  ctx.failTimer = 2.5;
}

function handleFlightOutcome(outcome: FlightOutcome, position: readonly [number, number, number]): void {
  if (outcome === "none") return;
  if (outcome === "pad-bounce") {
    fx.bounce(position[0], position[1], position[2]);
    applyHullDamage(6);
    return;
  }
  if (outcome === "pad-touchdown") {
    if (objectiveComplete() && ctx.padSensorLatched) {
      const breakdown = gradePatrol(ctx.timeInPatrol, ctx.cannon.accuracy, ctx.hullValue / 100);
      ctx.lastGrade = breakdown.grade;
      fx.touchdown(position[0], position[1], position[2]);
      pushCue("touchdown");
      pushCue("patrol-clear");
      const script = ctx.ghostRecorder.end();
      if (!ctx.bestRun || gradeRank(breakdown.grade) > gradeRank(ctx.bestRun.grade)) {
        ctx.bestRun = { grade: breakdown.grade, script };
      }
      ctx.stateValue = "graded";
      ctx.gradeTimer = 6;
    } else {
      ctx.ghostRecorder.end();
      pushCue("hull-alarm");
      ctx.stateValue = "incomplete";
      ctx.failTimer = 2.5;
    }
    return;
  }
  fx.crash(position[0], position[1], position[2]);
  pushCue("crash-thud");
  ctx.ghostRecorder.end();
  ctx.stateValue = "crashed";
  ctx.failTimer = 2;
}

function resetToPad(nextPatrol?: number): void {
  if (nextPatrol !== undefined) ctx.patrolValue = nextPatrol;
  ctx.flight = new FlightModel({
    position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]],
    headingYaw: PAD_HEADING_YAW,
    grounded: "preflight"
  });
  ctx.rings.reset();
  ctx.cannon.resetCounters();
  ctx.swarm.reset();
  for (const [id, slot] of ctx.droneSlotById) {
    void id;
    handle(`drone-${slot}`)?.setPosition(0, -60 - slot, 0);
    handle(`drone-wake-${slot}`)?.setVisible(false);
  }
  ctx.droneSlotById.clear();
  ctx.freeDroneSlots.length = 0;
  for (let slot = DRONE_NODE_COUNT - 1; slot >= 0; slot -= 1) ctx.freeDroneSlots.push(slot);
  for (const orb of ctx.orbs) {
    orb.active = false;
    collisionWorld.require(orb.bodyId).setPosition([0, -40, 0]);
  }
  for (const id of ["combat-muzzle-flash", "combat-cannon-tracer", "combat-impact-flash", "combat-impact-ring", "contrail-left", "contrail-right", "engine-glow", "ring-clear-pulse", "lead-drone-lock"]) {
    handle(id)?.setPosition(0, -70, 0).setVisible(false);
  }
  ctx.hullValue = 100;
  ctx.hitsThisSortie = 0;
  ctx.timeInPatrol = 0;
  ctx.padSensorLatched = false;
  ctx.outOfCombatFrames = 0;
  ctx.currentWave = -1;
  ctx.spawnedWaves.clear();
  ctx.failTimer = 0;
  ctx.gradeTimer = 0;
  ctx.lastCueAt = new Map();
  ctx.stateValue = "preflight";
  ctx.autopilotEnabled = deps.autopilotRequested;
  buildCollisions();
  applyRingState();
  ctx.ghostPlayer?.stop();
  handle("ghost-plane")?.setPosition(0, -60, 0).setVisible(false);
}

  return { collisionWorld, buildCollisions, applyRingState, spawnWave, spawnInterceptLeg, spawnOrb, stepOrbs, objectiveComplete, applyHullDamage, beginFail, handleFlightOutcome, resetToPad };
}
