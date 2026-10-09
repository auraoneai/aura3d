import type { Game } from "@aura3d/game";
import type { GameInputController } from "@aura3d/engine";
import { ORB_DAMAGE } from "../gameplay/drones";
import { encodeControlFrame } from "../gameplay/weapons";
import { GhostPlayer } from "../gameplay/ghost";
import { PAD_CENTER, PAD_HEADING_YAW, PAD_RADIUS, PAD_Y, RING_GATES, RING_COUNT, terrainSurface } from "../legacy/sky";
import { DRONE_NODE_COUNT } from "./scene/world";
import { pointInRigFrame } from "./scene/camera";
import { PATROL_COUNT, WAVES_PER_PATROL, WAVE_TRIGGERS, droneSpeed } from "../gameplay/patrol";
import type { PatrolCtx } from "./state";
import type { wirePatrolCombat } from "./combat";
import type { wirePatrolSync } from "./sync";
import { readFlightInput } from "./input";
import type { wirePatrolFx } from "./scene/fx";

export function wirePatrolUpdate(ctx: PatrolCtx, deps: {
  game: Game;
  input: GameInputController;
  combat: ReturnType<typeof wirePatrolCombat>;
  sync: ReturnType<typeof wirePatrolSync>;
  hud: { syncHud: () => void };
  audio: { setEngineIntensity: (throttle: number, active: boolean) => void; proof: () => { unlocked: boolean } };
  pushCue: (cue: import("../legacy/wing-audio").WingAudioCue) => void;
  cueReady: (name: string, gapFrames: number) => boolean;
  handle: (name: string) => ReturnType<Game["app"]["nodes"]["get"]>;
  fx: ReturnType<typeof wirePatrolFx>;
}) {
  const { game, input, combat, sync, hud, audio, pushCue, cueReady, handle, fx } = deps;
  const { buildCollisions, applyRingState, spawnWave, spawnInterceptLeg, spawnOrb, stepOrbs, applyHullDamage, handleFlightOutcome, resetToPad } = combat;
  const { syncPlaneVisual, syncGhostVisual, syncDroneVisuals, syncOrbVisuals } = sync;
  const { syncHud } = hud;
  const collisionWorld = combat.collisionWorld;
  const AUTORUN_RING_TRIGGER = 1;
// ------------------------------------------------------------- ctx.frame loop ---

function updateGameplay(dt: number): void {
  ctx.frame += 1;
  input.update(dt);

  if (input.pressed("pause")) {
    if (game.session.paused) game.session.resume();
    else game.session.pause();
  }
  if (input.pressed("reset")) resetToPad();
  ctx.paused = game.session.paused;
  if (ctx.paused) {
    syncHud();
    return;
  }

  // Fail / grade timers run even while the plane is parked post-outcome.
  if (ctx.failTimer > 0) {
    ctx.failTimer -= dt;
    if (ctx.failTimer <= 0) resetToPad();
  }
  if (ctx.stateValue === "graded") {
    ctx.gradeTimer -= dt;
    if (ctx.gradeTimer <= 0) {
      if (ctx.patrolValue >= PATROL_COUNT) {
        ctx.stateValue = "campaign-complete";
      } else {
        resetToPad(ctx.patrolValue + 1);
      }
    }
  }

  const flightInput = readFlightInput(ctx, input);
  const fireHeld = input.held("fire") || ctx.touchFire || (ctx.autopilotEnabled && ctx.swarm.liveCount > 0 && (ctx.swarm.nearestDistance(ctx.flight.position) ?? 99) < 34);

  if (ctx.stateValue === "preflight" || ctx.stateValue === "patrol") {
    const frameResult = ctx.flight.step(flightInput, dt, terrainSurface, {
      padCenter: PAD_CENTER,
      padY: PAD_Y,
      padRadius: PAD_RADIUS
    });
    if (ctx.stateValue === "preflight" && ctx.flight.grounded === "airborne") {
      ctx.stateValue = "patrol";
      ctx.timeInPatrol = 0;
      applyRingState();
      ctx.ghostRecorder.begin();
      if (ctx.bestRun && ctx.bestRun.script.length > 0 && ctx.patrolValue > 1) {
        ctx.ghostPlayer = new GhostPlayer(ctx.bestRun.script, {
          position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]],
          headingYaw: PAD_HEADING_YAW
        });
        ctx.ghostPlayer.start();
      }
    }
    if (ctx.stateValue === "patrol") {
      ctx.timeInPatrol += dt;
      ctx.ghostRecorder.record(encodeControlFrame(flightInput, fireHeld));
      handleFlightOutcome(frameResult.outcome, ctx.flight.position);
    }
  }

  // Sensor layer: park the player proxy on the authored position then step.
  collisionWorld.require(ctx.playerProxyId).setPosition([...ctx.flight.position] as [number, number, number]);
  stepOrbs(dt);
  for (const event of collisionWorld.step(dt)) {
    if (event.type !== "begin") continue;
    const a = event.a;
    const b = event.b;
    const sensor = a.id === ctx.playerProxyId ? b : b.id === ctx.playerProxyId ? a : null;
    if (!sensor) continue;
    ctx.sensorEventTotal += 1;
    if (sensor.id.startsWith("ring:") && ctx.stateValue === "patrol") {
      const index = Number(sensor.id.slice(5));
      const result = ctx.rings.registerEntry(index);
      if (result === "advanced") {
        pushCue("ring-chime");
        const gate = RING_GATES[index]!;
        fx.ringClear(gate.position[0], gate.position[1], gate.position[2]);
      }
      applyRingState();
    } else if (sensor.id === "pad:pad") {
      ctx.padSensorEntries += 1;
      if (ctx.stateValue === "patrol" && ctx.flight.grounded === "airborne" && !ctx.padSensorLatched) {
        ctx.padSensorLatched = true;
      }
    } else if (sensor.id.startsWith("orb-") && ctx.stateValue === "patrol") {
      const orb = ctx.orbs.find((candidate) => candidate.id === sensor.id);
      if (orb?.active) {
        orb.active = false;
        collisionWorld.require(orb.bodyId).setPosition([0, -40, 0]);
        applyHullDamage(ORB_DAMAGE);
        fx.orbImpact(ctx.flight.position[0], ctx.flight.position[1], ctx.flight.position[2]);
      }
    }
  }

  // Wave triggers off ordered ring progress (autorun/spawn also allowed via
  // the same spawnWave path for deterministic evidence legs).
  if (ctx.stateValue === "patrol") {
    for (let wave = 0; wave < WAVES_PER_PATROL; wave += 1) {
      if (!ctx.spawnedWaves.has(wave) && ctx.rings.passedCount >= (WAVE_TRIGGERS[wave] ?? 99)) {
        spawnWave(wave);
      }
    }
    if (ctx.autopilotEnabled && ctx.spawnedWaves.size === 0
      && (ctx.rings.passedCount >= AUTORUN_RING_TRIGGER || ctx.timeInPatrol > 12)) {
      spawnInterceptLeg();
    }
  }

  // Drone pursuit + combat resolution.
  let dronesMoving = false;
  if (ctx.stateValue === "patrol" && ctx.swarm.liveCount > 0) {
    dronesMoving = true;
    const positions = new Map(ctx.swarm.liveDrones().map((drone) => [drone.id, drone.position]));
    for (const event of ctx.swarm.update(dt, ctx.flight.position, droneSpeed(ctx.patrolValue))) {
      ctx.combatEventTotal += 1;
      if (event.type === "orb-fired") {
        spawnOrb(event.from, event.toward);
      } else if (event.type === "drone-down") {
        pushCue("drone-down");
        const slot = ctx.droneSlotById.get(event.id);
        const dronePosition = positions.get(event.id);
        if (dronePosition) fx.droneDown(dronePosition[0], dronePosition[1], dronePosition[2]);
        if (slot !== undefined) {
          handle(`drone-${slot}`)?.setPosition(0, -60 - slot, 0).setVisible(false);
          handle(`drone-wake-${slot}`)?.setVisible(false);
          ctx.droneSlotById.delete(event.id);
          ctx.freeDroneSlots.push(slot);
        }
      } else if (event.type === "cannon-hit") {
        ctx.hitsThisSortie += 1;
        if (cueReady("drone-hit", 8)) pushCue("drone-hit");
        ctx.cannon.registerHit();
        const target = positions.get(event.targetId);
        if (target) {
          fx.cannonHit(target[0], target[1], target[2]);
          const impact = handle("combat-impact-flash");
          impact?.setPosition(target[0], target[1], target[2]).setVisible(true);
          handle("combat-impact-ring")?.setPosition(target[0], target[1], target[2]).setVisible(true);
        }
      }
    }
  }

  // Cannon: fire edge + cooldown; hitbox sits ahead of the nose.
  if (ctx.stateValue === "patrol" && ctx.cannon.tryFire(fireHeld || ctx.scenarioFireOnce, dt)) {
    ctx.scenarioFireOnce = false;
    const forward = ctx.flight.forward;
    ctx.swarm.beginCannonAttack([forward[0] * 3.2, forward[1] * 3.2, forward[2] * 3.2]);
    if (cueReady("cannon-fire", 12)) pushCue("cannon-fire");
    const nose: [number, number, number] = [
      ctx.flight.position[0] + forward[0] * 2.4,
      ctx.flight.position[1] + forward[1] * 2.4,
      ctx.flight.position[2] + forward[2] * 3.2 - forward[2] * 0.8
    ];
    fx.cannonFire(nose[0], nose[1], nose[2]);
    handle("combat-muzzle-flash")?.setPosition(nose[0], nose[1], nose[2]).setVisible(true);
    handle("combat-cannon-tracer")?.setPosition(
      ctx.flight.position[0] + forward[0] * 4.4,
      ctx.flight.position[1] + forward[1] * 4.4,
      ctx.flight.position[2] + forward[2] * 4.4
    ).setRotation(ctx.flight.euler.x, ctx.flight.euler.y, 0).setVisible(true);
  } else {
    // Staged fx nodes expire by re-hiding (the stub fx layer tracks bursts).
    handle("combat-muzzle-flash")?.setVisible(false);
    handle("combat-cannon-tracer")?.setVisible(false);
    handle("combat-impact-flash")?.setVisible(false);
    handle("combat-impact-ring")?.setVisible(false);
  }

  // Hull regen out of combat (no live drone within 35 m for ~4 s).
  if (ctx.stateValue === "patrol") {
    const nearest = ctx.swarm.nearestDistance(ctx.flight.position);
    if (dronesMoving && nearest !== null && nearest < 35) ctx.outOfCombatFrames = 0;
    else ctx.outOfCombatFrames += 1;
    if (ctx.outOfCombatFrames > 240 && ctx.hullValue < 100) {
      ctx.hullValue = Math.min(100, ctx.hullValue + 4 * dt);
    }
  }

  // Ghost playback steps alongside live ctx.flight.
  if (ctx.ghostPlayer?.playing) ctx.ghostPlayer.step(terrainSurface);

  // Engine bed intensity follows the authored throttle.
  audio.setEngineIntensity(ctx.flight.throttle, ctx.stateValue === "patrol" || ctx.flight.grounded === "airborne");
  if (!ctx.audioBedsStarted && audio.proof().unlocked) {
    ctx.audioBedsStarted = true;
    pushCue("ambient-wind");
    pushCue("engine-loop");
  }

  // §7.2.1 ctx.rings.inFrame: gates inside the rig's forward cone this ctx.frame.
  if (ctx.lastPose) {
    const pose = ctx.lastPose;
    ctx.ringsInFrameNow = RING_GATES.reduce(
      (count, gate) => count + (pointInRigFrame(pose, gate.position) ? 1 : 0),
      0
    );
  }

  if (ctx.scenarioTakeoff && ctx.flight.grounded === "airborne") ctx.scenarioTakeoff = false;

  syncPlaneVisual();
  syncGhostVisual();
  syncDroneVisuals();
  syncOrbVisuals();
  syncHud();
}

  return { updateGameplay };
}
