// apps/showcase-mech-hangar/src/v2/boot.ts — Mech Hangar v2 shell.
// Hangar builder (Digit1-4 slot select, arrows cycle, Enter locks) then the
// floodlit pit ctx.bout. One union scene: the hangar set sits at z=0 and the pit
// at z=-34; entering the arena only moves the camera anchor, mounts the rival
// family and flips loading.sceneId — loading.sceneSwaps stays 0.
import { game as engineGame, scene } from "@aura3d/engine";
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import { createGame, lookManifest, type Prd09Game } from "@aura3d/game";
import direction from "../../art/direction";
import type { BoutInputs, BoutSnapshot } from "../gameplay/arena/mech-fight";
import { RIVAL_LOADOUTS } from "../gameplay/stats";
import { createHangarAudio } from "../legacy/hangar-audio";
import { publishMechEvidence } from "./evidence";
import { applyMechScenario, mechScenarioLook, parseMechScenario, type MechScenario } from "./scenarios";
import { createMountSystem } from "./mount";
import { createMechBoutCtx, wireMechBout } from "./bout";
import { wireMechTouch } from "./touch";
import { createMechHud } from "./hud";
import { createMechRig, mechCameraSpec, mechPoseFor, MECH_CAMERA_FOV, MECH_CAMERA_DISTANCE } from "./scene/camera";
import { wireMechFx } from "./scene/fx";
import { mechLighting } from "./scene/lighting";
import { HANGAR_BG } from "./scene/materials";
import {
  ARENA_CENTER_Z,
  CAM_ANCHOR_ID,
  HANGAR_CENTER,
  mechWorldNodes
} from "./scene/world";

const ROUTE_FLAG = "A3D_QR_ROUTE_MECH_HANGAR";
const url = new URL(window.location.href);
const scenarioParam = url.searchParams.get("scenario");
const autorunRequested = url.searchParams.get("autorun") === "1" || scenarioParam === "autorun";
const scenario: MechScenario | null = parseMechScenario(scenarioParam) ?? (autorunRequested ? "autorun" : null);

const world = mechWorldNodes();

const buildScene = () =>
  scene()
    .background(HANGAR_BG)
    .camera(mechCameraSpec())
    .addMany(world.nodes)
    .addMany(mechLighting());

const target = document.getElementById("app") ?? document.body;

const game: Prd09Game<string, string> = createGame({
  id: "showcase-mech-hangar",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "fighting",
    widgets: [
      { id: "ctx.mode", kind: "label", anchor: "top", label: "MODE" },
      { id: "hp", kind: "gauge", anchor: "top-left", label: "HULL" },
      { id: "rival", kind: "gauge", anchor: "top-right", label: "RIVAL" },
      { id: "guard", kind: "gauge", anchor: "bottom-left", label: "GUARD" },
      { id: "power", kind: "gauge", anchor: "bottom", label: "POWER" },
      { id: "phase", kind: "label", anchor: "bottom-right", label: "BOUT" }
    ]
  },
  touch: {
    preset: "lane-swipe",
    bindings: { stick: "moveX", tap: "light", swipeUp: "jump", swipeDown: "guard", swipeRight: "heavy", pause: "menu" }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_mech_hangar` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-mech-hangar`).
    flags: ["route_mech_hangar", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

const fx = wireMechFx(game.fx);

// ---- runtime handles --------------------------------------------------------
type NodeMap = Map<string, AuraRuntimeNodeHandle | null>;
const nodeMap: NodeMap = new Map();
function handle(id: string): AuraRuntimeNodeHandle | null {
  if (!nodeMap.has(id)) nodeMap.set(id, game.app.nodes.get(id) ?? null);
  return nodeMap.get(id) ?? null;
}
const anchorHandle = handle(CAM_ANCHOR_ID);

// ---- accessibility + audio --------------------------------------------------
const reducedMotion = engineGame.accessibility
  .settings([engineGame.accessibility.reducedMotion({ enabled: matchMedia("(prefers-reduced-motion: reduce)").matches })])
  .reducedMotion;
const audio = createHangarAudio();
const unlockAudio = () => {
  window.removeEventListener("pointerdown", unlockAudio);
  window.removeEventListener("keydown", unlockAudio);
  void audio.unlock();
};
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

// ---- ctx.mode state -------------------------------------------------------------
const ctx = createMechBoutCtx();
const RIVAL_FIXED_LOADOUT = RIVAL_LOADOUTS[1]!;
let elapsed = 0;
let lastAmbientAt = -30;
const AMBIENT_LOOP_SECONDS = 26;
let walkCueCooldown = 0;
let touchEngaged = false;


// ---- hangar controller ------------------------------------------------------
const mountSys = createMountSystem({
  handle, audio, reducedMotion,
  host: document.getElementById("app") ?? document.body,
  getMode: () => ctx.mode,
  onLockIn: () => boutFns.enterArena(),
});
const { hangar, hangarKeys, mountSide, hideSide, remountPreview } = mountSys;

// ---- bout lifecycle ---------------------------------------------------------
const boutFns = wireMechBout(ctx, { hangar, mountSide, hideSide, remountPreview, audio, fx });
const { enterArena, startBout, leaveToHangar, rematchBout, handleBoutEvent, autorunInputs, startAutorun } = boutFns;

// ---- input ------------------------------------------------------------------
const input = engineGame.input({
  actions: {
    left: ["KeyA"],
    right: ["KeyD"],
    jump: ["Space"],
    light: ["KeyJ"],
    heavy: ["KeyK"],
    special: ["KeyL"],
    guard: ["ShiftLeft", "ShiftRight"],
    pause: ["KeyP"]
  },
  bufferMs: 90
});

function playerInputsFromActions(): BoutInputs {
  return {
    moveX: (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0),
    jump: input.buffered("jump"),
    light: input.buffered("light"),
    heavy: input.buffered("heavy"),
    special: input.buffered("special"),
    guard: input.held("guard")
  };
}

// ---- touch zones ------------------------------------------------------------
wireMechTouch({
  input,
  getMode: () => ctx.mode,
  hangarEnter: () => hangar.handleKeyDown("Enter"),
  onTouchEngaged: () => { touchEngaged = true; },
});

// ---- hangar / meta keys -----------------------------------------------------
window.addEventListener("keydown", (event) => {
  if (ctx.mode === "hangar") {
    if (hangarKeys(event.code)) hangar.handleKeyDown(event.code);
    return;
  }
  if (event.code === "KeyR" && ctx.bout && (ctx.bout.snapshot().phase === "ko" || ctx.bout.snapshot().phase === "lost")) {
    rematchBout();
    return;
  }
  if (event.code === "Escape") {
    leaveToHangar();
  }
});

// ---- HUD --------------------------------------------------------------------
const syncHud = createMechHud({
  game, hangar,
  getMode: () => ctx.mode,
  getBout: () => ctx.bout,
  getBoutIndex: () => ctx.boutIndex,
});

// ---- evidence ---------------------------------------------------------------
// T2.2-post: appliedLook derives from the C-31 runtime manifest (scenario
// fields kept — mech-hangar varies the scene per scenario).
const appliedLook = () => ({
  ...lookManifest(game.lookSource()),
  ...mechScenarioLook(scenario),
  paletteSignature: direction.palette.primary.join("/") + "|" + direction.palette.accent + "|" + direction.palette.reservedObjective,
  rigId: "mech-hangar.fighting",
  fov: MECH_CAMERA_FOV,
  distance: MECH_CAMERA_DISTANCE
});

let lastSnap: BoutSnapshot | null = null;
const evidence = publishMechEvidence({
  sceneId: () => (ctx.mode === "arena" ? "pit" : "hangar"),
  combat: () => {
    const stats = ctx.bout?.stats();
    const snap = lastSnap;
    return {
      phase: snap?.phase ?? "none",
      boutIndex: ctx.boutIndex,
      preset: ctx.bout?.preset().id ?? "none",
      lastHit: ctx.lastHit,
      playerX: snap?.player.x ?? -1.9,
      rivalX: snap?.rival.x ?? 1.9,
      playerHp: snap && stats ? snap.player.hp / stats.player.hpMax : 1,
      rivalHp: snap && stats ? snap.rival.hp / stats.rival.hpMax : 1,
      playerGuard: snap && stats ? snap.player.guard / stats.player.guardMax : 1,
      playerPower: snap && stats ? snap.player.power / stats.player.powerMax : 0.5
    };
  },
  hangar: () => {
    const s = hangar.snapshot();
    return { locked: s.locked, activeSlot: s.activeSlot, selection: { ...s.selection }, orbitYaw: s.orbitYaw };
  },
  fx: () => ({ liveCount: game.fx.liveCount, backend: game.fx.backend }),
  audio: () => {
    const proof = audio.proof();
    return { lastCue: proof.lastCue ?? null, cueLog: proof.recentCues.slice(-8) };
  },
  run: () => ({ paused: ctx.paused, touchEngaged, replayActive: ctx.autorunActive }),
  appliedLook,
  rig: () => ({ id: "mech-hangar.fighting", fov: MECH_CAMERA_FOV, distance: MECH_CAMERA_DISTANCE }),
  scenario: () => scenario,
  render: () => ({ frame: renderFrame, firstFrameAt: firstFrameAt })
});

// ---- frame loop -------------------------------------------------------------
let renderFrame = 0;
let firstFrameAt: number | null = null;
let anchorState: [number, number, number] = [HANGAR_CENTER[0], 0.95, HANGAR_CENTER[2]];
let anchorYaw = 0.62;

remountPreview();
syncHud(null);

game.app.onFrame(({ dt }) => {
  const stepDt = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  renderFrame += 1;
  if (firstFrameAt === null) firstFrameAt = performance.now();
  elapsed += stepDt;
  input.update(stepDt);

  if (ctx.mode === "hangar") {
    hangar.update(stepDt);
    remountPreview();
    const orbit = hangar.snapshot();
    anchorState = [HANGAR_CENTER[0], 0.95, HANGAR_CENTER[2]];
    anchorYaw = orbit.orbitYaw;
    anchorHandle?.setPosition(anchorState[0], anchorState[1], anchorState[2]);
    anchorHandle?.setRotation(0, anchorYaw, 0);
    if (elapsed - lastAmbientAt > AMBIENT_LOOP_SECONDS) {
      lastAmbientAt = elapsed;
      void audio.cue("mechAmbientHangarSfx");
    }
    if (ctx.autorunActive && ctx.autorunPhase === "lock") {
      ctx.autorunClock += stepDt;
      if (ctx.autorunClock > 0.4) {
        ctx.autorunPhase = "advance";
        hangar.requestLock();
      }
    }
    syncHud(null);
    return;
  }

  if (!ctx.bout) {
    syncHud(null);
    return;
  }

  if (input.pressed("pause")) {
    ctx.paused = !ctx.paused;
    syncHud(lastSnap);
    return;
  }
  if (ctx.paused) {
    syncHud(lastSnap);
    return;
  }

  let snap = ctx.bout.snapshot();
  const inputs = ctx.autorunActive ? autorunInputs(snap) : playerInputsFromActions();
  if (inputs) ctx.bout.pushInputs(inputs);
  snap = ctx.bout.step(stepDt);
  for (const event of ctx.bout.consumeEvents()) handleBoutEvent(event);

  const midX = (snap.player.x + snap.rival.x) / 2;
  anchorState = [midX, 1.02, ARENA_CENTER_Z];
  anchorYaw = 0;
  anchorHandle?.setPosition(anchorState[0], anchorState[1], anchorState[2]);
  anchorHandle?.setRotation(0, 0, 0);

  mountSide("player", hangar.selection, [snap.player.x, snap.player.y, ARENA_CENTER_Z], Math.PI / 2);
  mountSide("rival", RIVAL_FIXED_LOADOUT.selection, [snap.rival.x, snap.rival.y, ARENA_CENTER_Z], -Math.PI / 2);

  walkCueCooldown -= stepDt;
  const heldMove = ctx.autorunActive ? (inputs?.moveX ?? 0) !== 0 : input.held("left") || input.held("right");
  const moving = heldMove && !snap.player.airborne && snap.phase === "fighting";
  if (moving && walkCueCooldown <= 0) {
    walkCueCooldown = 0.42;
    void audio.cue("mechWalkHeavySfx");
  }

  lastSnap = snap;
  syncHud(snap);
});

// ---- pause plumbing ---------------------------------------------------------
// Engine pause (visibility, menu, context loss) flips the ctx.bout's ctx.paused flag
// through the session events; visibility routes through the session too.
game.session.on("pause", () => {
  if (ctx.mode === "arena") ctx.paused = true;
});
game.session.on("resume", () => {
  if (ctx.mode === "arena") ctx.paused = false;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause();
  else game.session.resume();
});

// ---- scenario ---------------------------------------------------------------
if (scenario) {
  applyMechScenario(scenario, {
    lockIn: () => hangar.requestLock(),
    startAutorun,
    rematch: rematchBout
  });
}
if (autorunRequested && !scenario) startAutorun();

// ---- camera rig + exposure + beacon ------------------------------------------
const bootedAtMs = performance.now();
game.start();
void game.ready().then(() => {
  const rig = createMechRig({
    anchor: () => anchorState,
    anchorYaw: () => anchorYaw,
    mode: () => ctx.mode
  });
  game.app.camera?.use?.(rig as never, { blend: 0.12 });
  game.app.setOutput?.({ preset: "cinematic-film", exposure: Math.pow(2, direction.lighting.exposureEV) });
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return renderFrame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});
void evidence;

export {};
