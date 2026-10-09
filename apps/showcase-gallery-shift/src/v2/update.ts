// Per-frame frame loop — extracted from boot.ts for 14-LOC.
import type { Game } from "@aura3d/game";
import type { GameInputController } from "@aura3d/engine";
import { GUARD_CLIPS, guardHearsNoise, type GuardFootstep } from "../gameplay/guard";
import { THIEF_CLIPS } from "../gameplay/thief";
import { exhibitNodeId } from "./scene/world";
import { LASER_ALERT_SECONDS } from "../gameplay/floor";
import {
  ALERT_THRESHOLD, CAUGHT_THRESHOLD, SUSPICIOUS_THRESHOLD,
  advanceDetection, brightnessAt, cameraYawAt, sampleVision, worldRaycast,
  type WatcherPose
} from "../gameplay/vision";
import type { HeistAudioCue } from "../legacy/heist-audio";
import type { wireGalleryFx } from "./scene/fx";
import type { createGalleryAnim } from "./anim";
import type { wireGalleryFloors } from "./floors";
import type { wireGallerySync } from "./sync";
import type { GalleryCtx } from "./state";

const MAX_NOISE_LOG = 48;
const GUARD_EYE_HEIGHT = 1.55;
const THIEF_EYE_HEIGHT = 1.1;

type CtxDeps = {
  game: Game;
  handle(id: string): import("@aura3d/engine").AuraRuntimeNodeHandle | null;
  input: GameInputController;
  fx: ReturnType<typeof wireGalleryFx>;
  pushCue(cue: HeistAudioCue): void;
  cueReady(name: string, gapFrames: number): boolean;
  autorunInputs(): { moveX: number; moveZ: number; gait: "walk" | "sneak" | "sprint"; liftHeld: boolean };
  floors: ReturnType<typeof wireGalleryFloors>;
  sync: ReturnType<typeof wireGallerySync>;
  anim: ReturnType<typeof createGalleryAnim>;
  syncHud: () => void;
  onSensorEvent?: () => void;
};

export function wireGalleryUpdate(ctx: GalleryCtx, deps: CtxDeps) {
  const { game, handle, input, fx, pushCue, cueReady, autorunInputs, syncHud } = deps;
  const { restartFloor, resetMission, floorClearAdvance, syncFloorVisuals, syncAlarmVisuals } = deps.floors;
  const { syncCharacterVisuals, syncThreatFeedback, syncObjective, syncCameraCones } = deps.sync;
  const { thiefAnimation, guardAnimations, playThiefClip, playGuardClip } = deps.anim;
  function consumeFootsteps(footsteps: readonly GuardFootstep[]): void {
    for (const step of footsteps) {
      ctx.footstepEvents += 1;
      if (cueReady(`guard-step-${step.id}`, 14)) {
        pushCue("walk-step");
        fx.footDust([step.x, 0.05, step.z]);
      }
    }
  }
  
  function updateGameplay(dt: number): void {
    const stepDt = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
    const dtFixed = 1 / 60;
    ctx.frameCount += 1;
    if (ctx.firstFrameAt === null) ctx.firstFrameAt = performance.now();
    input.update(stepDt);
  
    if (input.pressed("pause") && ctx.phase === "playing") {
      game.session.paused ? game.session.resume() : game.session.pause();
      return;
    }
    if (ctx.paused) {
      syncHud();
      return;
    }
    if (input.pressed("restart")) {
      ctx.phase === "won" ? resetMission() : restartFloor();
      syncHud();
      return;
    }
    if (ctx.phase !== "playing") {
      syncHud();
      return;
    }
  
    ctx.runtime.timeInFloor += dtFixed;
  
    // Thief input: keyboard axes, touch stick, or the autorun script.
    let moveX = input.axis("moveX") + ctx.touchMoveX;
    let moveZ = input.axis("moveZ") + ctx.touchMoveZ;
    let gait: "walk" | "sneak" | "sprint" = input.held("sprint") || ctx.touchSprint ? "sprint" : input.held("sneak") || ctx.touchSneak ? "sneak" : "walk";
    let liftHeld = input.held("lift") || ctx.touchLiftHeld;
    if (ctx.autorunActive) {
      const scripted = autorunInputs();
      moveX = scripted.moveX;
      moveZ = scripted.moveZ;
      gait = scripted.gait;
      liftHeld = scripted.liftHeld;
    }
  
    const unlifted = ctx.runtime.layout.pedestals.filter((pedestal) => !ctx.runtime.liftedIds.includes(pedestal.id));
    const noises = ctx.runtime.thief.update(dtFixed, { moveX, moveZ, gait, liftHeld }, unlifted);
    for (const noise of noises) {
      ctx.noiseEvents.push({ ...noise });
      if (ctx.noiseEvents.length > MAX_NOISE_LOG) ctx.noiseEvents.shift();
      for (const guard of ctx.runtime.guards) {
        if (guardHearsNoise(guard, noise)) guard.hearNoise({ x: noise.x, z: noise.z });
      }
    }
  
    // Physics step: exit/laser sensors fire through engine sensor events.
    const sensors = ctx.runtime.world.stepFixed(1);
    for (const sensor of sensors) {
      ctx.sensorEventCount += 1;
      if (sensor.kind === "laser") {
        ctx.runtime.laserAlertRemaining = LASER_ALERT_SECONDS;
        const laser = ctx.runtime.layout.lasers.find((entry) => entry.id === sensor.id);
        ctx.runtime.laserAlertPoint = laser ? { x: laser.x, z: laser.z } : ctx.runtime.laserAlertPoint;
        pushCue("laser-trip");
        fx.laserTrip(laser ? [laser.x, 0.9, laser.z] : [ctx.runtime.thief.x, 0.4, ctx.runtime.thief.z]);
      } else if (sensor.kind === "exit" && ctx.runtime.liftedIds.length >= ctx.runtime.layout.pedestals.length) {
        floorClearAdvance();
        return;
      }
    }
  
    // Vision: FOV cones + LOS raycasts through the public physics query.
    const thiefSnap = ctx.runtime.thief.snapshot();
    const brightness = brightnessAt(ctx.runtime.layout.lightPools, thiefSnap.x, thiefSnap.z);
    const watchers: WatcherPose[] = ctx.runtime.guards.map((guard) => ({
      kind: "guard" as const,
      id: guard.id,
      x: guard.x,
      z: guard.z,
      eyeY: GUARD_EYE_HEIGHT,
      yaw: guard.yaw,
      halfFov: Math.PI / 4,
      range: 12
    }));
    for (const cam of ctx.runtime.layout.cameras) {
      watchers.push({
        kind: "camera" as const,
        id: cam.id,
        x: cam.x,
        z: cam.z,
        eyeY: cam.height,
        yaw: cameraYawAt(cam, ctx.runtime.timeInFloor),
        halfFov: Math.PI / 6,
        range: 10
      });
    }
    const vision = sampleVision(
      worldRaycast(ctx.runtime.world.world),
      watchers,
      thiefSnap.x,
      thiefSnap.z,
      THIEF_EYE_HEIGHT,
      brightness,
      [ctx.runtime.world.thiefBodyId],
      ctx.visionCounters,
      ctx.runtime.laserAlertRemaining > 0
    );
    ctx.losRayCountTotal += vision.losRayCount;
    ctx.occlusionCountTotal += vision.occlusionCount;
    ctx.lastCameraSamples = vision.watchers
      .filter((sample) => sample.kind === "camera")
      .map((sample) => ({ id: sample.id, yaw: sample.yaw, seesThief: sample.seesThief, occluded: sample.occluded }));
    ctx.lastThreatSamples = vision.watchers
      .filter((sample) => sample.kind === "guard")
      .map((sample) => ({ id: sample.id, x: sample.x, z: sample.z, yaw: sample.yaw, seesThief: sample.seesThief }));
    const seenGuard = vision.watchers.find((sample) => sample.kind === "guard" && sample.seesThief);
  
    const previousValue = ctx.runtime.detection.value;
    const effectiveVisionFill = ctx.alarmGraceRemaining > 0 ? 0 : vision.totalFillPerSecond;
    ctx.runtime.detection = advanceDetection(ctx.runtime.detection, effectiveVisionFill, dtFixed);
    if (ctx.alarmGraceRemaining > 0) ctx.alarmGraceRemaining = Math.max(0, ctx.alarmGraceRemaining - dtFixed);
    if (ctx.runtime.detection.value > SUSPICIOUS_THRESHOLD) ctx.runtime.ghostRun = false;
    ctx.runtime.lastSeen = vision.thiefSeen ? { x: thiefSnap.x, z: thiefSnap.z } : ctx.runtime.lastSeen;
    if (vision.thiefSeen && seenGuard) {
      const seen = { x: thiefSnap.x, z: thiefSnap.z };
      const seeingGuard = ctx.runtime.guards.find((guard) => guard.id === seenGuard.id);
      if (ctx.runtime.detection.value >= ALERT_THRESHOLD || ctx.runtime.laserAlertRemaining > 0) {
        if (seeingGuard && seeingGuard.state !== "alert" && cueReady("guard-alert", 30)) pushCue("guard-alert");
        for (const guard of ctx.runtime.guards) {
          if (guard.id === seenGuard.id) guard.reportAlert(seen);
        }
      } else if (ctx.runtime.detection.value >= SUSPICIOUS_THRESHOLD || previousValue < SUSPICIOUS_THRESHOLD) {
        if (cueReady("alert-rise", 45)) pushCue("alert-rise");
        for (const guard of ctx.runtime.guards) {
          if (guard.id === seenGuard.id) guard.reportSuspicious(seen);
        }
      }
    }
    if (ctx.runtime.detection.value >= CAUGHT_THRESHOLD) {
      ctx.phase = "caught";
      pushCue("caught-sting");
      fx.caughtPulse([thiefSnap.x, 0.6, thiefSnap.z]);
      return;
    }
  
    // Guards advance (authored deterministic patrols).
    for (const guard of ctx.runtime.guards) {
      const footsteps = guard.update({
        dt: dtFixed,
        detection: ctx.runtime.detection.value,
        suspiciousThreshold: SUSPICIOUS_THRESHOLD,
        alertThreshold: ALERT_THRESHOLD,
        lastSeen: ctx.runtime.lastSeen,
        laserAlertPoint: ctx.runtime.laserAlertRemaining > 0 ? ctx.runtime.laserAlertPoint : null
      });
      consumeFootsteps(footsteps);
    }
  
    // Completed lifts: score, escalation, exhibit visuals, audio + sparkle.
    const lifted = ctx.runtime.thief.takeCompletedLift();
    if (lifted) {
      ctx.runtime.liftedIds.push(lifted.id);
      ctx.runtime.floorScore += lifted.value;
      pushCue("exhibit-lift");
      fx.liftSparkle([lifted.x, 1.4, lifted.z]);
      for (const guard of ctx.runtime.guards) guard.registerLift(ctx.runtime.liftedIds);
      if (ctx.completedBeforeFloor + ctx.runtime.liftedIds.length >= 3) {
        ctx.alarmActive = true;
        ctx.alarmGraceRemaining = 2;
        ctx.runtime.detection = { value: 0, secondsSinceSeen: 0 };
        ctx.runtime.laserAlertRemaining = 999;
        ctx.runtime.laserAlertPoint = { x: ctx.runtime.thief.x, z: ctx.runtime.thief.z };
        pushCue("alert-rise");
        pushCue("guard-alert");
        fx.alarmStrobe([0, 3.2, -5.8]);
        for (const guard of ctx.runtime.guards) guard.reportAlert(ctx.runtime.laserAlertPoint);
        syncAlarmVisuals();
      }
      ctx.runtime.layout.pedestals.forEach((pedestal, slot) => {
        if (pedestal.id !== lifted.id) return;
        for (const variant of ["A", "B", "C"] as const) {
          handle(exhibitNodeId(slot, variant))?.setVisible(false);
        }
      });
    }
  
    if (ctx.runtime.laserAlertRemaining > 0) {
      ctx.runtime.laserAlertRemaining = Math.max(0, ctx.runtime.laserAlertRemaining - dtFixed);
    } else if (ctx.runtime.layout.cameras.length > 0 && cueReady("camera-whir", 240)) {
      const nearCam = ctx.runtime.layout.cameras.some((cam) => Math.hypot(cam.x - thiefSnap.x, cam.z - thiefSnap.z) < 6);
      if (nearCam) pushCue("camera-whir");
    }
  
    // Animation controllers: real embedded clips switched by gameplay state.
    thiefAnimation.update(dtFixed);
    playThiefClip(THIEF_CLIPS[thiefSnap.clip]);
    guardAnimations.forEach((controller) => controller?.update(dtFixed));
    ctx.runtime.guards.forEach((guard, index) => {
      const clip = guard.snapshot().state === "alert" ? GUARD_CLIPS.run : GUARD_CLIPS.walk;
      playGuardClip(guard.id, index, clip);
    });
  
    syncCharacterVisuals();
    syncThreatFeedback();
    syncObjective();
    syncCameraCones();
    syncHud();
  }

  return { consumeFootsteps, updateGameplay };
}
