// Site flow + grading + sim tick + control edges — extracted from boot.ts for 14-LOC.
import { game as engineGame, createMeshSurfaceQuery, type GameInputController, type MeshSurfaceQuery, type SurfaceSample } from "@aura3d/engine";
import type { Game } from "@aura3d/game";
import { SITES, campaignScore, type LanderSite } from "../gameplay/sites";
import { createLanderState, gustTelegraphActive, hspeedOf, stepLander, type Controls, type LanderState } from "../gameplay/lander";
import { sampleGridHeight } from "../gameplay/terrain";
import {
  LANDER_MAX_HULL, gradeTouchdown, hullAfterTouchdown, scoreTouchdown,
  type LandingGrade
} from "../gameplay/touchdown";
import { predictLanding } from "../gameplay/prediction";
import {
  createGhostPlayback, exportBestRun, importBestRun, loadBestRunRaw, saveBestRun,
  trajectoryHash, type GhostSample
} from "../gameplay/ghost";
import type { LanderAudioCue } from "../legacy/lander-audio";
import type { createLanderAudio } from "../legacy/lander-audio";
import { EXTRACTION_INFRASTRUCTURE, siteGroupNames, type auroraWorldNodes } from "./scene/world";
import type { wireAuroraFx } from "./scene/fx";
import type { AuroraCtx } from "./state";

const FIXED_DT = 1 / 60;
const PLAYER_MAX_CATCHUP_SECONDS = 0.5;
const MAX_SUBSTEPS = 40;
const FOOT_DROP = 0.72;
const CONTACT_PROXY_RADIUS = 0.42;
const APPROACH_SCAFFOLD_MIN_AGL = 28;
const RECORDED_BINDINGS = new Set(["KeyW", "ArrowUp", "KeyA", "ArrowLeft", "KeyD", "ArrowRight", "thrust"]);

type NodeHandle = import("@aura3d/engine").AuraRuntimeNodeHandle | undefined;

export function wireAuroraRuntime(ctx: AuroraCtx, deps: {
  game: Game;
  world: ReturnType<typeof auroraWorldNodes>;
  handle(name: string): NodeHandle;
  collisionWorld: ReturnType<typeof engineGame.collisionWorld>;
  rebuildCollisions: () => void;
  siteQueries: MeshSurfaceQuery[];
  input: GameInputController;
  pushCue(cue: LanderAudioCue): void;
  audio: ReturnType<typeof createLanderAudio>;
  fx: ReturnType<typeof wireAuroraFx>;
  reducedMotion: boolean;
  rigState: Record<string, unknown>;
  consumeTimedFlightControl: (control: import("./input").TimedFlightControl) => number;
  touchHeld: Map<number, "thrust" | "left" | "right">;
  timedControlSeconds: Map<import("./input").TimedFlightControl, number>;
}) {
  const { game, world, handle, collisionWorld, rebuildCollisions, siteQueries,
          input, pushCue, audio, fx, reducedMotion, rigState,
          consumeTimedFlightControl, touchHeld, timedControlSeconds } = deps;
  const ghostPlayback = createGhostPlayback();
  
  function spawnStateFor(site: LanderSite): LanderState {
    if (!ctx.autopilotEnabled && !ctx.approachSpawnEnabled) return createLanderState(site.spawn, site.fuelBudget);
    const pad = site.pads[0]!;
    const padHeight = ctx.field?.padHeights[0] ?? 0;
    return createLanderState({ x: pad.x, y: padHeight + 26, z: pad.z }, site.fuelBudget);
  }
  
  function setSiteGroupVisible(index: number, visible: boolean): void {
    for (const name of siteGroupNames(SITES[index]!.id)) {
      handle(name)?.setVisible(visible);
    }
  }
  
  function resetAttempt(recordGhostStart = true): void {
    ctx.phase = "flying";
    ctx.paused = false;
    ctx.lastGrade = null;
    ctx.crashReason = "";
    ctx.state = spawnStateFor(ctx.currentSite);
    ctx.previousControls = { thrust: 0, rotate: 0 };
    ctx.accumulator = 0;
    ctx.simSeconds = 0;
    ctx.latestPrediction = null;
    ctx.attemptSamples = [];
    ctx.advanceTimer = -1;
    ctx.fuelLowCueFired = false;
    ctx.crashDebris = [];
    ctx.shockwaveAge = -1;
    input.clearReplay();
    timedControlSeconds.clear();
    touchHeld.clear();
    if (recordGhostStart) beginGhostFromBest();
    rebuildCollisions();
    for (const node of ["impact-shockwave", "landing-prediction", "extraction-lander", "extraction-title", "extraction-halo", "extraction-bay-backdrop"]) {
      handle(node)?.setPosition(0, -50, 0).setVisible(false);
    }
    for (let i = 0; i < 10; i += 1) handle(`debris-${i + 1}`)?.setPosition(0, -50, 0).setScale(0.001);
    EXTRACTION_INFRASTRUCTURE.forEach((part) => handle(`extraction-${part.id}`)?.setVisible(false));
  }
  
  function loadSite(index: number): void {
    setSiteGroupVisible(ctx.siteIndex, false);
    ctx.siteIndex = index;
    ctx.bestScoreThisSite = 0;
    ctx.currentSite = SITES[index]!;
    ctx.field = world.fields[index]!;
    ctx.surfaceQuery = siteQueries[index];
    setSiteGroupVisible(index, true);
    rigState.padX = ctx.currentSite.pads[0]!.x;
    rigState.padY = ctx.field.padHeights[0] ?? 0;
    rigState.padZ = ctx.currentSite.pads[0]!.z;
    resetAttempt();
  }
  
  /** Begin ghost playback from the stored best run for this site, if one exists. */
  function beginGhostFromBest(): void {
    ctx.ghostActive = false;
    ctx.ghostReplayHash = null;
    const ghostNode = handle("lander-ghost");
    const raw = loadBestRunRaw(ctx.currentSite.id);
    if (!raw) {
      ghostPlayback.stop();
      ghostNode?.setVisible(false);
      return;
    }
    try {
      const imported = importBestRun(raw);
      ghostPlayback.begin(imported.replay, spawnStateFor(ctx.currentSite), ctx.currentSite.gust);
      ctx.ghostReplayHash = raw.trajectoryHash ?? null;
      ctx.ghostActive = true;
      if (ctx.ghostVisible) ghostNode?.setVisible(true);
    } catch {
      ctx.ghostActive = false;
    }
  }
  
  /** Persist a graded landing as the site's best run when it beats the score. */
  function maybeRecordBestRun(samples: GhostSample[], grade: LandingGrade, score: number): void {
    if (grade === "crash" || score <= ctx.bestScoreThisSite) return;
    ctx.bestScoreThisSite = score;
    const events = input
      .recorded()
      .filter((eventItem) => RECORDED_BINDINGS.has(eventItem.binding))
      .map((eventItem) => ({ ...eventItem }));
    const replay = engineGame.inputReplay(events, { fps: 60, seed: 0x5e_ed, label: `aurora-lander-site-${ctx.currentSite.id}-best` });
    const attempt = { siteId: ctx.currentSite.id, events, samples };
    saveBestRun(ctx.currentSite.id, exportBestRun(attempt, replay, grade, score));
  }
  
  // ---------------------------------------------------------------- grading ---
  
  interface GradingContext {
    readonly vspeed: number;
    readonly hspeed: number;
    readonly attitudeDeg: number;
    readonly slopeDeg: number;
    readonly insidePadZone: boolean;
    readonly contactX: number;
    readonly contactY: number;
    readonly contactZ: number;
  }
  
  function gradeFromContact(context: GradingContext): void {
    const graded = gradeTouchdown({
      vspeed: context.vspeed,
      hspeed: context.hspeed,
      attitudeDeg: context.attitudeDeg,
      insidePadZone: context.insidePadZone,
      slopeDeg: context.slopeDeg
    });
    ctx.lastGrade = graded.grade;
    ctx.crashReason = graded.crashReason;
    ctx.campaignHull = hullAfterTouchdown(ctx.campaignHull, graded.grade);
  
    if (graded.grade === "crash") {
      ctx.phase = "crashed";
      pushCue("crash");
      fx.crash(context.contactX, context.contactY, context.contactZ);
      spawnCrashDebris();
      return;
    }
  
    const breakdown = scoreTouchdown({
      grade: graded.grade,
      basePoints: graded.basePoints,
      fuelFraction: ctx.state.fuel / ctx.currentSite.fuelBudget,
      siteMultiplier: ctx.currentSite.multiplier
    });
    ctx.siteScores[ctx.siteIndex] = Math.max(ctx.siteScores[ctx.siteIndex] ?? 0, breakdown.total);
    pushCue(graded.grade === "soft" ? "touch-soft" : "touch-hard");
    pushCue("site-clear");
    fx.touchdown(context.contactX, context.contactY, context.contactZ, graded.grade === "soft");
    fx.siteClear(context.contactX, context.contactY, context.contactZ);
    maybeRecordBestRun(ctx.attemptSamples, graded.grade, breakdown.total);
  
    const isLastSite = ctx.siteIndex >= SITES.length - 1;
    ctx.phase = isLastSite ? "campaign-clear" : "landed";
    ctx.advanceTimer = isLastSite ? -1 : 1.8;
  }
  
  function spawnCrashDebris(): void {
    if (!ctx.field) return;
    const ground = sampleGridHeight(ctx.field, ctx.state.x, ctx.state.z);
    ctx.crashDebris = Array.from({ length: 10 }, (_, index) => ({
      x: ctx.state.x,
      y: ground + 0.3,
      z: ctx.state.z,
      vx: Math.cos((index / 10) * Math.PI * 2) * (2 + (index % 3)),
      vy: 3 + (index % 4),
      vz: Math.sin((index / 10) * Math.PI * 2) * (2 + (index % 3)),
      life: 1
    }));
    ctx.shockwaveAge = reducedMotion ? -1 : 0;
    if (!reducedMotion) handle("impact-shockwave")?.setPosition(ctx.state.x, ground + 0.25, ctx.state.z);
  }
  
  // ------------------------------------------------------------- sim tick -----
  
  function readControls(): Controls {
    const touch = [...touchHeld.values()];
    const thrust = Math.max(
      consumeTimedFlightControl("thrust"),
      touch.includes("thrust") ? 0.8 : 0
    );
    const rotate = consumeTimedFlightControl("right") - consumeTimedFlightControl("left")
      + (touch.includes("right") ? 1 : 0) - (touch.includes("left") ? 1 : 0);
    return { thrust: Math.min(1, thrust), rotate: Math.max(-1, Math.min(1, rotate)) };
  }
  
  /** Deterministic descent autopilot (autorun/touchdown scenario): tracks a
   * sinking-rate schedule so the scripted approach grades a real touchdown. */
  function autopilotControls(): Controls {
    if (!ctx.field) return { thrust: 0, rotate: 0 };
    const ground = sampleGridHeight(ctx.field, ctx.state.x, ctx.state.z);
    const agl = ctx.state.y - FOOT_DROP - ground;
    const pad = ctx.currentSite.pads[0]!;
    const lateralCorrection = Math.max(-1, Math.min(1, (pad.x - ctx.state.x) * 0.12 - ctx.state.vx * 0.5));
    if (agl >= 22) return { thrust: 0, rotate: lateralCorrection };
    const desiredVy = -Math.max(0.6, Math.min(2.2, agl * 0.16));
    const vyError = desiredVy - ctx.state.vy;
    return {
      thrust: Math.min(1, Math.max(0, 0.52 + vyError * 0.32)),
      rotate: agl < 1.5 ? 0 : lateralCorrection
    };
  }
  
  function tick(dtFixed: number): void {
    if (ctx.paused || ctx.phase !== "flying") return;
    ctx.simSeconds += dtFixed;
  
    const controls = readControls();
    const effectiveControls = ctx.autopilotEnabled ? autopilotControls() : controls;
    ctx.previousControls = effectiveControls;
    ctx.state = stepLander(ctx.state, effectiveControls, dtFixed, ctx.currentSite.gust);
  
    if (controls.thrust > 0 && !ctx.thrustLoopActive) {
      ctx.thrustLoopActive = true;
      pushCue("thrust-loop");
    } else if (controls.thrust === 0 && ctx.thrustLoopActive) {
      ctx.thrustLoopActive = false;
    }
    const rotating = Math.abs(controls.rotate) > 0.05;
    if (rotating && ctx.rcsPuffArmed) {
      ctx.rcsPuffArmed = false;
      pushCue("rcs-puff");
    } else if (!rotating) {
      ctx.rcsPuffArmed = true;
    }
    const fuelFraction = ctx.state.fuel / ctx.currentSite.fuelBudget;
    if (!ctx.fuelLowCueFired && fuelFraction <= 0.2 && fuelFraction > 0) {
      ctx.fuelLowCueFired = true;
      pushCue("fuel-low");
    }
    if (gustTelegraphActive(ctx.currentSite.gust, ctx.simSeconds)) {
      if (!ctx.gustWarnCueFiredForCycle) {
        ctx.gustWarnCueFiredForCycle = true;
        pushCue("gust-warn");
        fx.gustWarn(ctx.state.x, ctx.state.y - 2, ctx.state.z);
      }
    } else {
      ctx.gustWarnCueFiredForCycle = false;
    }
  
    ctx.attemptSamples.push({ frame: ctx.attemptSamples.length, x: ctx.state.x, y: ctx.state.y, z: ctx.state.z });
  
    // Drive the contact proxy from the authored pose so Rapier witnesses real
    // contacts against the static heightfield while motion stays authored.
    if (ctx.collisions) {
      const proxy = collisionWorld.require(ctx.collisions.proxyId);
      proxy.setPosition([ctx.state.x, ctx.state.y - FOOT_DROP, ctx.state.z]);
      proxy.setVelocity([ctx.state.vx, ctx.state.vy, ctx.state.vz]);
    }
    const events = collisionWorld.step(dtFixed);
  
    let sample: SurfaceSample | undefined;
    if (ctx.surfaceQuery) {
      sample = ctx.surfaceQuery.sample(ctx.state.x, ctx.state.z);
    }
  
    for (const eventItem of events) {
      const involvesProxy = eventItem.a.id === ctx.collisions?.proxyId || eventItem.b.id === ctx.collisions?.proxyId;
      if (!involvesProxy || eventItem.type !== "begin") continue;
      ctx.contactEventsSeen += 1;
      const other = eventItem.a.id === ctx.collisions?.proxyId ? eventItem.b : eventItem.a;
      const partnerIsSensor = other.sensor || (ctx.collisions?.sensorIds.includes(other.id) ?? false);
      if (partnerIsSensor) {
        if (!ctx.padSensorArmed) {
          ctx.padSensorArmed = true;
          pushCue("pad-lock");
          fx.padLock(ctx.state.x, ctx.state.y - FOOT_DROP, ctx.state.z);
        }
        continue;
      }
      if (ctx.phase !== "flying" || !ctx.field || !ctx.surfaceQuery || !sample) continue;
  
      const queryNormal = ctx.surfaceQuery.sampleNormal(ctx.state.x, ctx.state.z);
      const normalAlignment = Math.abs(
        queryNormal[0] * eventItem.normal[0]
        + queryNormal[1] * eventItem.normal[1]
        + queryNormal[2] * eventItem.normal[2]
      );
      ctx.contactQueryAgreement = normalAlignment >= 0.9;
  
      const tiltRad = (ctx.state.tiltDeg * Math.PI) / 180;
      const yawRad = ctx.state.yaw;
      const upX = Math.sin(tiltRad) * -Math.sin(yawRad);
      const upY = Math.cos(tiltRad);
      const upZ = Math.sin(tiltRad) * -Math.cos(yawRad);
      const dot = upX * queryNormal[0] + upY * queryNormal[1] + upZ * queryNormal[2];
      const attitudeDeg = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
      const slopeDeg = (Math.acos(Math.max(-1, Math.min(1, queryNormal[1]))) * 180) / Math.PI;
  
      const feetY = ctx.state.y - FOOT_DROP;
      const insidePadZone = ctx.currentSite.pads.some((pad, index) => {
        const padHeight = ctx.field!.padHeights[index] ?? 0;
        const within = Math.hypot(ctx.state.x - pad.x, ctx.state.z - pad.z) <= pad.radius;
        return within && Math.abs(feetY - padHeight) < 1.5;
      }) || partnerIsSensor && Math.abs(ctx.state.vy) < 10;
  
      gradeFromContact({
        vspeed: Math.abs(ctx.state.vy),
        hspeed: hspeedOf(ctx.state),
        attitudeDeg,
        slopeDeg,
        insidePadZone,
        contactX: ctx.state.x,
        contactY: feetY,
        contactZ: ctx.state.z
      });
    }
  
    // Ghost playback follows the SAME deterministic integrator.
    if (ctx.ghostActive) {
      const playback = ghostPlayback.step(dtFixed);
      handle("lander-ghost")
        ?.setPosition(playback.state.x, playback.state.y, playback.state.z)
        .setRotation(0, playback.state.yaw, (playback.state.tiltDeg * Math.PI) / 180);
      if (playback.complete) {
        ghostPlayback.stop();
        ctx.ghostActive = false;
        handle("lander-ghost")?.setVisible(false);
      }
    }
  }
  
  // --------------------------------------------------------- control edges ----
  
  function toggleGhost(): void {
    ctx.ghostVisible = !ctx.ghostVisible;
    handle("lander-ghost")?.setVisible(ctx.ghostVisible && ctx.ghostActive);
  }
  
  function togglePause(): void {
    ctx.paused = !ctx.paused;
    if (ctx.paused) game.session.pause("user");
    else game.session.resume();
  }
  
  function handleControlEdges(): void {
    if (input.pressed("restart") || input.pressed("quickRestart")) {
      if (ctx.phase === "campaign-clear" || ctx.phase === "crashed") {
        ctx.siteScores = [];
        ctx.campaignHull = LANDER_MAX_HULL;
        loadSite(0);
      } else {
        resetAttempt();
      }
      return;
    }
    if (input.pressed("ghostToggle")) toggleGhost();
    if (input.pressed("pause")) togglePause();
  }

  return { spawnStateFor, setSiteGroupVisible, resetAttempt, loadSite, beginGhostFromBest,
           maybeRecordBestRun, gradeFromContact, spawnCrashDebris, readControls,
           autopilotControls, tick, toggleGhost, togglePause, handleControlEdges };
}
