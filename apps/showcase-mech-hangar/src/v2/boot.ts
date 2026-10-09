// apps/showcase-mech-hangar/src/v2/boot.ts — Mech Hangar v2 shell.
// Hangar builder (Digit1-4 slot select, arrows cycle, Enter locks) then the
// floodlit pit bout. One union scene: the hangar set sits at z=0 and the pit
// at z=-34; entering the arena only moves the camera anchor, mounts the rival
// family and flips loading.sceneId — loading.sceneSwaps stays 0.
import { game as engineGame, scene } from "@aura3d/engine";
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import { createGame, lookManifest, type Prd09Game } from "@aura3d/game";
import direction from "../../art/direction";
import { createMechBout, type BoutEvent, type BoutInputs, type BoutSnapshot } from "../gameplay/arena/mech-fight";
import { RIVAL_LOADOUTS } from "../gameplay/stats";
import { MECH_SLOTS, PART_OPTIONS, selectedParts, type BuildSelection, type PartDef } from "../gameplay/parts-catalog";
import { mountTransformForPart } from "../gameplay/assembly";
import { createHangarController } from "../legacy/hangar";
import { createHangarAudio } from "../legacy/hangar-audio";
import { publishMechEvidence } from "./evidence";
import { applyMechScenario, mechScenarioLook, parseMechScenario, type MechScenario } from "./scenarios";
import { createMechRig, mechCameraSpec, mechPoseFor, MECH_CAMERA_FOV, MECH_CAMERA_DISTANCE } from "./scene/camera";
import { wireMechFx } from "./scene/fx";
import { mechLighting } from "./scene/lighting";
import { HANGAR_BG } from "./scene/materials";
import {
  ARENA_CENTER_Z,
  CAM_ANCHOR_ID,
  HANGAR_CENTER,
  heroNodeId,
  markerNodeIds,
  mechWorldNodes,
  partNodeId
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
      { id: "mode", kind: "label", anchor: "top", label: "MODE" },
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
const partHandles = { player: new Map<string, AuraRuntimeNodeHandle | null>(), rival: new Map<string, AuraRuntimeNodeHandle | null>() };
for (const side of ["player", "rival"] as const) {
  for (const slot of MECH_SLOTS) {
    for (const def of PART_OPTIONS[slot]) {
      partHandles[side].set(def.assetKey, handle(partNodeId(side, def.assetKey)));
    }
  }
}
const heroHandles = {
  player: handle(heroNodeId("player")),
  rival: handle(heroNodeId("rival"))
};
const markerHandles = {
  player: Object.fromEntries(Object.entries(markerNodeIds("player")).map(([k, id]) => [k, handle(id)])) as Record<
    "ring" | "chevron" | "collar" | "lock",
    AuraRuntimeNodeHandle | null
  >,
  rival: Object.fromEntries(Object.entries(markerNodeIds("rival")).map(([k, id]) => [k, handle(id)])) as Record<
    "ring" | "chevron" | "collar" | "lock",
    AuraRuntimeNodeHandle | null
  >
};
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

// ---- mode state -------------------------------------------------------------
let mode: "hangar" | "arena" = "hangar";
let bout: ReturnType<typeof createMechBout> | null = null;
let boutIndex = 0;
let paused = false;
let elapsed = 0;
let lastAmbientAt = -30;
const AMBIENT_LOOP_SECONDS = 26;
let walkCueCooldown = 0;
let lastHit: "none" | "light" | "heavy" = "none";
let touchEngaged = false;
let autorunActive = false;
let autorunClock = 0;

const RIVAL_FIXED_LOADOUT = RIVAL_LOADOUTS[1]!;
const HERO_FEET_LIFT = 0.953;
const HERO_FORWARD = 0.32;

// ---- mech mounting ----------------------------------------------------------
function mountSide(
  side: "player" | "rival",
  selection: BuildSelection,
  rootPosition: readonly [number, number, number],
  yaw: number,
  familyBack = 0
): void {
  const parts = selectedParts(selection);
  const familyBackX = Math.sin(yaw) * familyBack;
  const familyBackZ = Math.cos(yaw) * familyBack;
  for (const slot of MECH_SLOTS) {
    for (const def of PART_OPTIONS[slot]) {
      const h = partHandles[side].get(def.assetKey);
      if (!h) continue;
      const mounted = parts.some((entry: PartDef) => entry.assetKey === def.assetKey);
      if (!mounted) {
        h.setVisible(false);
        continue;
      }
      const t = mountTransformForPart(def, parts, rootPosition, yaw);
      h.setVisible(true);
      h.setPosition(t.position[0] - familyBackX, t.position[1], t.position[2] - familyBackZ);
      h.setRotation(0, t.yaw, 0);
    }
  }
  const marker = markerHandles[side];
  marker.ring?.setVisible(true);
  marker.ring?.setPosition(rootPosition[0], 0.21, rootPosition[2]);
  marker.ring?.setRotation(Math.PI / 2, 0, 0);
  marker.ring?.setScale([side === "player" ? 0.84 : 0.78, side === "player" ? 0.84 : 0.78, 0.032]);
  marker.chevron?.setVisible(true);
  const chevronFront = 0.76;
  marker.chevron?.setPosition(
    rootPosition[0] + Math.sin(yaw) * chevronFront,
    rootPosition[1] + 1.56,
    rootPosition[2] + Math.cos(yaw) * chevronFront
  );
  marker.chevron?.setRotation(0, yaw, Math.PI / 4);
  marker.chevron?.setScale([0.115, 0.115, 0.032]);

  const hero = heroHandles[side];
  if (hero) {
    hero.setVisible(true);
    hero.setPosition(
      rootPosition[0] + Math.sin(yaw) * HERO_FORWARD,
      rootPosition[1] + HERO_FEET_LIFT,
      rootPosition[2] + Math.cos(yaw) * HERO_FORWARD
    );
    hero.setRotation(0, yaw, 0);
  }

  const selectedWeapon = parts.find((part: PartDef) => part.slot === "weapon");
  const weaponTransform = selectedWeapon
    ? mountTransformForPart(selectedWeapon, parts, [rootPosition[0] - familyBackX, rootPosition[1], rootPosition[2] - familyBackZ], yaw)
    : undefined;
  const visible = Boolean(weaponTransform);
  marker.collar?.setVisible(visible);
  marker.lock?.setVisible(visible);
  if (weaponTransform) {
    const forwardX = Math.sin(weaponTransform.yaw);
    const forwardZ = Math.cos(weaponTransform.yaw);
    marker.collar?.setPosition(
      weaponTransform.position[0] + forwardX * -0.18,
      weaponTransform.position[1],
      weaponTransform.position[2] + forwardZ * -0.18
    );
    marker.collar?.setRotation(0, weaponTransform.yaw, 0);
    marker.collar?.setScale([0.14, 0.14, 0.055]);
    marker.lock?.setPosition(
      weaponTransform.position[0] + forwardX * 0.19,
      weaponTransform.position[1] + 0.01,
      weaponTransform.position[2] + forwardZ * 0.19
    );
    marker.lock?.setRotation(0, weaponTransform.yaw, 0);
    marker.lock?.setScale([0.1, 0.1, 0.024]);
  }
}

function hideSide(side: "player" | "rival") {
  for (const h of partHandles[side].values()) h?.setVisible(false);
  heroHandles[side]?.setVisible(false);
  const marker = markerHandles[side];
  marker.ring?.setVisible(false);
  marker.chevron?.setVisible(false);
  marker.collar?.setVisible(false);
  marker.lock?.setVisible(false);
}

function remountPreview() {
  mountSide("player", hangar.selection, HANGAR_CENTER, hangar.snapshot().turntableYaw, 0.28);
}

// ---- hangar controller ------------------------------------------------------
const hangar = createHangarController(
  audio,
  {
    onSelectionChanged: () => {
      if (mode === "hangar") remountPreview();
    },
    onLockIn: () => {
      enterArena();
    }
  },
  { reducedMotion }
);
const hangarKeys = (code: string) =>
  code === "Enter" || code === "Digit1" || code === "Digit2" || code === "Digit3" || code === "Digit4" || code === "ArrowLeft" || code === "ArrowRight";
// Turntable orbit drag on the canvas (hangar mode only).
{
  const host = document.getElementById("app") ?? document.body;
  hangar.attachPointer(host, () => mode === "hangar");
}

// ---- bout lifecycle ---------------------------------------------------------
function enterArena(): void {
  if (hangar.snapshot().locked === false) return;
  mode = "arena";
  paused = false;
  startBout();
}

function startBout(): void {
  bout = createMechBout({
    playerSelection: hangar.selection,
    rivalSelection: RIVAL_FIXED_LOADOUT.selection,
    presetIndex: boutIndex % 4,
    seed: 20260821 + boutIndex * 7919
  });
  lastHit = "none";
  mountSide("player", hangar.selection, [-1.9, 0, ARENA_CENTER_Z], Math.PI / 2);
  mountSide("rival", RIVAL_FIXED_LOADOUT.selection, [1.9, 0, ARENA_CENTER_Z], -Math.PI / 2);
}

function leaveToHangar(): void {
  mode = "hangar";
  paused = false;
  bout = null;
  hideSide("rival");
  hangar.unlockForRematchEdit();
  remountPreview();
}

function rematchBout(): void {
  boutIndex += 1;
  startBout();
}

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
function wireTouch() {
  const canvas = document.querySelector("canvas");
  if (!canvas) return;
  let heldAction: string | null = null;
  const release = () => {
    if (heldAction) input.setAction(heldAction, false);
    heldAction = null;
  };
  canvas.addEventListener("pointerdown", (event) => {
    touchEngaged = true;
    if (mode === "hangar") {
      // Tap locks the build and drops into the pit.
      hangar.handleKeyDown("Enter");
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    if (nx < 0.4) {
      heldAction = nx < 0.15 ? "left" : nx < 0.27 ? "guard" : "right";
      input.setAction(heldAction, true);
    } else {
      const col = nx < 0.7 ? 0 : 1;
      const row = ny < 0.5 ? 0 : 1;
      const tap = row === 0 ? (col === 0 ? "light" : "heavy") : col === 0 ? "special" : "jump";
      input.setAction(tap, true);
      heldAction = tap;
    }
  });
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointerleave", release);
}
wireTouch();

// ---- hangar / meta keys -----------------------------------------------------
window.addEventListener("keydown", (event) => {
  if (mode === "hangar") {
    if (hangarKeys(event.code)) hangar.handleKeyDown(event.code);
    return;
  }
  if (event.code === "KeyR" && bout && (bout.snapshot().phase === "ko" || bout.snapshot().phase === "lost")) {
    rematchBout();
    return;
  }
  if (event.code === "Escape") {
    leaveToHangar();
  }
});

// ---- bout event dispatch ----------------------------------------------------
function handleBoutEvent(event: BoutEvent): void {
  if (!bout) return;
  const at: [number, number, number] = [event.x, event.y + 0.95, ARENA_CENTER_Z];
  if (event.type === "hit") {
    lastHit = event.heavy ? "heavy" : "light";
    void audio.cue(event.heavy ? "mechHeavyHitSfx" : "mechLightHitSfx");
    if (event.heavy) fx.heavyHit(at);
    else fx.lightHit(at);
  } else if (event.type === "blocked") {
    void audio.cue("mechGuardBlockSfx");
    fx.blocked(at);
  } else if (event.type === "guardBreak") {
    void audio.cue("mechGuardBreakSfx");
    fx.guardBreak(at);
  } else if (event.type === "specialFire") {
    void audio.cue("mechSpecialFireSfx");
    fx.specialFire(at);
  } else if (event.type === "jump") {
    fx.jump([event.x, 0.1, ARENA_CENTER_Z]);
  } else if (event.type === "land") {
    fx.land([event.x, 0.1, ARENA_CENTER_Z]);
  } else if (event.type === "ko") {
    void audio.cue("mechKoStingSfx");
    fx.ko(at);
  }
}

// ---- autorun ----------------------------------------------------------------
let autorunPhase: "lock" | "advance" | "strike" | "done" = "lock";
function autorunInputs(snap: BoutSnapshot): BoutInputs | null {
  if (mode === "hangar") return null;
  if (snap.phase !== "fighting") return { moveX: 0, jump: false, light: false, heavy: false, special: false, guard: false };
  const gap = snap.rival.x - snap.player.x;
  if (gap > 2.1) {
    autorunPhase = "advance";
    return { moveX: 1, jump: false, light: false, heavy: false, special: false, guard: false };
  }
  autorunPhase = "strike";
  // Alternate light/heavy with a special once power is high; guard between.
  const frame = snap.frame % 90;
  const strike: Partial<BoutInputs> =
    frame < 12 ? { heavy: true }
    : frame < 24 ? { light: true }
    : frame < 30 && snap.player.power > 0.8 ? { special: true }
    : {};
  return { moveX: gap > 1.2 ? 0.4 : 0, jump: frame === 60, light: !!strike.light, heavy: !!strike.heavy, special: !!strike.special, guard: frame > 66 };
}

// ---- HUD --------------------------------------------------------------------
let hudCache = "";
function syncHud(snap: BoutSnapshot | null) {
  const stats = bout?.stats();
  const key = JSON.stringify({
    m: mode,
    p: snap?.phase,
    ph: snap ? Math.round((snap.player.hp / (stats?.player.hpMax ?? 1)) * 100) : 0,
    rh: snap ? Math.round((snap.rival.hp / (stats?.rival.hpMax ?? 1)) * 100) : 0,
    g: snap ? Math.round((snap.player.guard / (stats?.player.guardMax ?? 1)) * 100) : 0,
    w: snap ? Math.round((snap.player.power / (stats?.player.powerMax ?? 1)) * 100) : 0,
    l: hangar.snapshot().locked
  });
  if (key === hudCache) return;
  hudCache = key;
  game.hud.set("mode", mode === "hangar" ? `HANGAR ${hangar.snapshot().activeSlot.toUpperCase()}` : "PIT");
  game.hud.set("hp", snap && stats ? snap.player.hp / stats.player.hpMax : 0);
  game.hud.set("rival", snap && stats ? snap.rival.hp / stats.rival.hpMax : 0);
  game.hud.set("guard", snap && stats ? snap.player.guard / stats.player.guardMax : 0);
  game.hud.set("power", snap && stats ? snap.player.power / stats.player.powerMax : 0);
  game.hud.set(
    "phase",
    snap ? `${snap.phase.toUpperCase()} ${boutIndex + 1}` : mode === "hangar" ? "ASSEMBLY" : "—"
  );
}

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
  sceneId: () => (mode === "arena" ? "pit" : "hangar"),
  combat: () => {
    const stats = bout?.stats();
    const snap = lastSnap;
    return {
      phase: snap?.phase ?? "none",
      boutIndex,
      preset: bout?.preset().id ?? "none",
      lastHit,
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
  run: () => ({ paused, touchEngaged, replayActive: autorunActive }),
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

  if (mode === "hangar") {
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
    if (autorunActive && autorunPhase === "lock") {
      autorunClock += stepDt;
      if (autorunClock > 0.4) {
        autorunPhase = "advance";
        hangar.requestLock();
      }
    }
    syncHud(null);
    return;
  }

  if (!bout) {
    syncHud(null);
    return;
  }

  if (input.pressed("pause")) {
    paused = !paused;
    syncHud(lastSnap);
    return;
  }
  if (paused) {
    syncHud(lastSnap);
    return;
  }

  let snap = bout.snapshot();
  const inputs = autorunActive ? autorunInputs(snap) : playerInputsFromActions();
  if (inputs) bout.pushInputs(inputs);
  snap = bout.step(stepDt);
  for (const event of bout.consumeEvents()) handleBoutEvent(event);

  const midX = (snap.player.x + snap.rival.x) / 2;
  anchorState = [midX, 1.02, ARENA_CENTER_Z];
  anchorYaw = 0;
  anchorHandle?.setPosition(anchorState[0], anchorState[1], anchorState[2]);
  anchorHandle?.setRotation(0, 0, 0);

  mountSide("player", hangar.selection, [snap.player.x, snap.player.y, ARENA_CENTER_Z], Math.PI / 2);
  mountSide("rival", RIVAL_FIXED_LOADOUT.selection, [snap.rival.x, snap.rival.y, ARENA_CENTER_Z], -Math.PI / 2);

  walkCueCooldown -= stepDt;
  const heldMove = autorunActive ? (inputs?.moveX ?? 0) !== 0 : input.held("left") || input.held("right");
  const moving = heldMove && !snap.player.airborne && snap.phase === "fighting";
  if (moving && walkCueCooldown <= 0) {
    walkCueCooldown = 0.42;
    void audio.cue("mechWalkHeavySfx");
  }

  lastSnap = snap;
  syncHud(snap);
});

// ---- pause plumbing ---------------------------------------------------------
// Engine pause (visibility, menu, context loss) flips the bout's paused flag
// through the session events; visibility routes through the session too.
game.session.on("pause", () => {
  if (mode === "arena") paused = true;
});
game.session.on("resume", () => {
  if (mode === "arena") paused = false;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause();
  else game.session.resume();
});

// ---- scenario ---------------------------------------------------------------
function startAutorun() {
  autorunActive = true;
  autorunPhase = "lock";
  autorunClock = 0;
}
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
    mode: () => mode
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
