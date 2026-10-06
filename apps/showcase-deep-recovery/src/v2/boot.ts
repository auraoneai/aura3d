// apps/showcase-deep-recovery/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.14 "salvage dive from turquoise shallows into a dark wreck basin":
// the authored 6-DOF hydrodynamic sub model drives a chase rig past typed
// wreck/buoy/crate GLBs; sonar ping/tether/grapple run the legacy mechanics
// verbatim. One scene — mission progress re-poses runtime nodes, never
// swaps scenes (loading.sceneSwaps === 0). Gameplay modules (sub/oxygen/
// salvage/sonar/reef) are unchanged imports; audio plays through the legacy
// cue controller until C-25 lands.
import { game as engineGame, scene, type GameInputController, type AuraCameraPose } from "@aura3d/engine";
import { postPresets } from "@aura3d/engine/contracts";
import { createGame, type Game } from "@aura3d/game";
import { assets } from "../../../../src/aura-assets";
import { getDepthZone, BUOY_STATION, WRECK_OBSTACLES, type Vec3 } from "../gameplay/reef";
import { DEFAULT_SUB_CONFIG, initialSubmarineState, updateSubmarine, type SubmarineState } from "../gameplay/sub";
import {
  applyCollisionImpact,
  initialOxygenState,
  patchBreach,
  refuelAtSurface,
  updateOxygen,
  type OxygenState
} from "../gameplay/oxygen";
import {
  initialSonarState,
  triggerPing,
  updateSonar,
  type SonarContact,
  type SonarState,
  type SonarTarget
} from "../gameplay/sonar";
import {
  bankSecuredCrates,
  CONTRACTS,
  GRAPPLE_RANGE,
  initialCrateSpawns,
  releaseTethers,
  tryGrappleCrates,
  updateTetherPhysics,
  type SalvageCrate
} from "../gameplay/salvage";
import { DeepAudioController } from "../legacy/deep-audio";
import direction from "../../art/direction";
import { deepWorldNodes, SILT_MOTES, SNOW_COUNT, VENT_COUNT, type DeepWorld } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createDeepRig, fallbackCameraNode } from "./scene/camera";
import { wireDeepFx } from "./scene/fx";
import { WATER_BG } from "./scene/materials";
import { publishDeepEvidence, type DeepRunSnapshot } from "./evidence";
import { applyDeepScenario } from "./scenarios";

const ROUTE_FLAG = "A3D_QR_ROUTE_DEEP_RECOVERY" as const;
const GRAPPLE_LATCH_RANGE = GRAPPLE_RANGE * 0.94;

const target = document.getElementById("app") ?? document.body;
const routeParams = new URLSearchParams(window.location.search);
const autopilotRequested = routeParams.get("autorun") === "1";

// ------------------------------------------------------------ sim state -----

let phase: "playing" | "paused" | "blackout" | "won" = "playing";
let subState: SubmarineState = initialSubmarineState();
let oxygenState: OxygenState = initialOxygenState();
let sonarState: SonarState = initialSonarState();
let crates: SalvageCrate[] = initialCrateSpawns();
let bankedTotal = 0;
let bankedCountTotal = 0;
let grappleLatchCount = 0;
let sensorEventCount = 0;
let standardBanked = false;
let heavyBanked = false;
let breachCount = 0;
let repairCount = 0;
let lastTowDrag = 0;
let surfaceCuePlayed = false;
let oxygenWarningCuePlayed = false;
let frame = 0;
let missionTime = 0;
let thrustBubbleClock = 0;
const sceneSwaps = 0;
const bootedAtMs = performance.now();

const world: DeepWorld = deepWorldNodes();

function buildScene() {
  return scene()
    .background(WATER_BG)
    .camera(fallbackCameraNode())
    .addMany(world.nodes)
    .addMany(lightingNodes());
}

// ------------------------------------------------------------------ audio ---

const audio = new DeepAudioController();
void audio.init();
const audioCueLog: string[] = [];
type DeepCue = Parameters<DeepAudioController["playCue"]>[0];
function pushCue(cue: DeepCue, volume = 0.9): void {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  audio.playCue(cue, volume);
}
const unlockAudio = () => void audio.startAmbience();
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });

const accessibilitySettings = engineGame.accessibility.settings([
  engineGame.accessibility.reducedMotion({
    enabled: typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })
]);
const reducedMotion: boolean = accessibilitySettings.reducedMotion;

// ------------------------------------------------------------------ game -----

const game = createGame({
  id: "showcase-deep-recovery",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "sci-fi-telemetry",
    maxScreenFraction: 0.16,
    widgets: [
      { id: "objective", kind: "label", anchor: "top", label: "OBJECTIVE" },
      { id: "depth", kind: "gauge", anchor: "top-left", label: "DEPTH" },
      { id: "oxygen", kind: "gauge", anchor: "top-right", label: "O2" },
      { id: "hull", kind: "gauge", anchor: "left", label: "HULL" },
      { id: "salvage", kind: "score", anchor: "bottom-left", label: "SALVAGE" },
      { id: "sonar", kind: "label", anchor: "bottom-right", label: "SONAR" },
      { id: "message", kind: "label", anchor: "bottom", label: "STATUS" }
    ]
  },
  touch: {
    preset: "twin-stick",
    bindings: {
      drive: "stick-left",
      heave: "stick-right",
      grapple: "btn-a",
      sonar: "btn-b",
      repair: "btn-x",
      sprint: "btn-y",
      pause: "menu"
    }
  },
  sound: {
    cues: {
      "sonar-ping": { asset: "deepRecoverySonarPingSfx" },
      "sonar-return": { asset: "deepRecoverySonarReturnSfx" },
      "hull-creak": { asset: "deepRecoveryHullCreakSfx" },
      "breach-alarm": { asset: "deepRecoveryBreachAlarmSfx" },
      "patch-seal": { asset: "deepRecoveryPatchSealSfx" },
      "grapple-latch": { asset: "deepRecoveryGrappleLatchSfx" },
      "crate-bank": { asset: "deepRecoveryCrateBankSfx" },
      "oxygen-warn": { asset: "deepRecoveryOxygenWarnSfx" },
      "blackout": { asset: "deepRecoveryBlackoutSfx" },
      "surface-break": { asset: "deepRecoverySurfaceBreakSfx" },
      "ambient-deep": { asset: "deepRecoveryAmbientDeepSfx" }
    }
  },
  juice: {
    "breach": { hitStopMs: 50, trauma: 0.3 },
    "grapple": { trauma: 0.1 },
    "bank": { trauma: 0.14 },
    "impact": { trauma: 0.2 }
  },
  qualityRebuild: { flags: [ROUTE_FLAG] }
});

const fx = wireDeepFx(game);

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handles = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, game.app.nodes.get(name));
  return handles.get(name);
}

// ------------------------------------------------------------- input ---------

const input: GameInputController = engineGame.input({
  actions: {
    thrust: ["KeyW", "ArrowUp"],
    reverse: ["KeyS", "ArrowDown"],
    turnLeft: ["KeyA", "ArrowLeft"],
    turnRight: ["KeyD", "ArrowRight"],
    surface: ["KeyE", "PageUp"],
    dive: ["KeyQ", "PageDown"],
    sprint: ["ShiftLeft", "ShiftRight"],
    ping: ["Space"],
    grapple: ["KeyF"],
    repair: ["KeyC"],
    pause: ["KeyP"],
    reset: ["KeyR"]
  },
  bufferMs: 90
});

// Touch: left half = drive stick (x → turn, -y → throttle); right half taps
// fire sonar (upper) / grapple (lower); right-edge hold surfaces the sub.
const touchDrive = new Map<number, { startX: number; startY: number; x: number; y: number }>();
const touchHeave = new Set<number>();
function touchInputs(): { throttle: number; turn: number; heave: number } {
  let throttle = 0;
  let turn = 0;
  for (const t of touchDrive.values()) {
    throttle += Math.max(-1, Math.min(1, (t.startY - t.y) / 90));
    turn += Math.max(-1, Math.min(1, (t.x - t.startX) / 90));
  }
  const heave = touchHeave.size > 0 ? 1 : 0;
  return { throttle, turn, heave };
}

target.addEventListener("pointerdown", (e) => {
  const rect = target.getBoundingClientRect();
  const fx = (e.clientX - rect.left) / Math.max(1, rect.width);
  const fy = (e.clientY - rect.top) / Math.max(1, rect.height);
  if (fx < 0.5) {
    touchDrive.set(e.pointerId, { startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY });
  } else if (fy < 0.34) {
    handlePing();
  } else if (fy < 0.67) {
    handleGrappleToggle();
  } else {
    touchHeave.add(e.pointerId);
  }
});
target.addEventListener("pointermove", (e) => {
  const held = touchDrive.get(e.pointerId);
  if (held) { held.x = e.clientX; held.y = e.clientY; }
});
const touchEnd = (e: PointerEvent) => { touchDrive.delete(e.pointerId); touchHeave.delete(e.pointerId); };
target.addEventListener("pointerup", touchEnd);
target.addEventListener("pointercancel", touchEnd);

// T2.6: hidden tab auto-pauses the session.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause("visibility");
  else game.session.resume();
});

// ------------------------------------------------------------- actions -------

function sonarTargets(): SonarTarget[] {
  return [
    { id: "buoy", kind: "buoy", position: { x: BUOY_STATION.x, y: BUOY_STATION.y, z: BUOY_STATION.z }, value: 0 },
    ...WRECK_OBSTACLES.map((w) => ({ id: w.id, kind: "wreck" as const, position: { x: w.x, y: w.y, z: w.z }, value: 0 })),
    ...crates.filter((c) => !c.banked).map((c) => ({ id: c.id, kind: c.kind, position: { x: c.x, y: c.y, z: c.z }, value: c.baseValue }))
  ];
}

function handlePing(): void {
  if (phase !== "playing" || game.session.paused) return;
  const result = triggerPing(
    sonarState,
    { x: subState.x, y: subState.y, z: subState.z },
    sonarTargets(),
    missionTime,
    WRECK_OBSTACLES.map((w) => ({ id: w.id, position: w, radius: w.radius }))
  );
  if (result.nextState.pingCount > sonarState.pingCount) {
    sonarState = result.nextState;
    pushCue("sonar-ping", 0.9);
    fx.sonarPing(subState.x, subState.y, subState.z);
    if (result.newContacts.length > 0) {
      setTimeout(() => pushCue("sonar-return", 0.75), 250);
    }
  }
}

function handleGrappleToggle(): void {
  if (phase !== "playing" || game.session.paused) return;
  const tetheredCount = crates.filter((c) => c.tethered).length;
  if (tetheredCount > 0) {
    releaseTethers(crates);
    return;
  }
  const res = tryGrappleCrates({ x: subState.x, y: subState.y, z: subState.z }, crates);
  if (res.latchedCrate) {
    grappleLatchCount += 1;
    sensorEventCount += 1;
    pushCue("grapple-latch", 0.85);
    fx.grappleLatch(res.latchedCrate.x, res.latchedCrate.y, res.latchedCrate.z);
  }
}

function atBuoyServiceZone(): boolean {
  return Math.hypot(subState.x - BUOY_STATION.x, subState.z - BUOY_STATION.z) <= BUOY_STATION.dockRadius
    && subState.y >= -4;
}

function handleRepair(): boolean {
  if (phase !== "playing" || game.session.paused || !oxygenState.breached || !atBuoyServiceZone()) return false;
  oxygenState = patchBreach(oxygenState);
  repairCount += 1;
  sensorEventCount += 1;
  pushCue("patch-seal", 0.85);
  return true;
}

function togglePause(): void {
  if (phase === "blackout" || phase === "won") return;
  if (phase === "playing") {
    phase = "paused";
    audio.stopAmbience();
    game.session.pause("user");
  } else {
    phase = "playing";
    game.session.resume();
    audio.startAmbience();
  }
}

function resetGame(): void {
  subState = initialSubmarineState();
  oxygenState = initialOxygenState();
  sonarState = initialSonarState();
  crates = initialCrateSpawns();
  bankedTotal = 0;
  bankedCountTotal = 0;
  grappleLatchCount = 0;
  sensorEventCount = 0;
  standardBanked = false;
  heavyBanked = false;
  breachCount = 0;
  repairCount = 0;
  lastTowDrag = 0;
  surfaceCuePlayed = false;
  oxygenWarningCuePlayed = false;
  missionTime = 0;
  phase = "playing";
  game.session.resume();
  syncVisualNodes(0);
}

// ------------------------------------------------------- autopilot -----------
// ?autorun=1 runs a scripted salvage leg: steer to crate-s1, latch it, then
// hold. Deterministic — the §7.2.1 salvage.grappled>=1 condition rides on it.
const AUTO_TARGET_CRATE = "crate-s1";
let autopilotEnabled = autopilotRequested;
let autopilotGrappleTried = false;

function autopilotControls(): { throttle: number; heave: number; turn: number; pitch: number; sprint: boolean } {
  const crate = crates.find((c) => c.id === AUTO_TARGET_CRATE)!;
  const dx = crate.x - subState.x;
  const dy = crate.y - subState.y;
  const dz = crate.z - subState.z;
  const dist = Math.hypot(dx, dy, dz);
  const bearing = Math.atan2(dx, dz);
  let err = bearing - subState.yaw;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  if (dist < GRAPPLE_LATCH_RANGE) {
    if (!autopilotGrappleTried) {
      autopilotGrappleTried = true;
      handleGrappleToggle();
    }
    return { throttle: 0, heave: 0, turn: 0, pitch: 0, sprint: false };
  }
  return {
    throttle: Math.abs(err) < 0.5 ? 0.9 : 0.25,
    heave: Math.max(-1, Math.min(1, dy * 0.5)),
    turn: Math.max(-1, Math.min(1, err * 2.2)),
    pitch: Math.max(-0.4, Math.min(0.4, dy * 0.08)),
    sprint: false
  };
}

// ------------------------------------------------------------ sim tick -------

function updateGameplay(dt: number): void {
  frame += 1;
  if (phase !== "playing" || game.session.paused) {
    syncVisualNodes(dt);
    syncHud();
    return;
  }
  missionTime += dt;

  const touch = touchInputs();
  const controls = autopilotEnabled
    ? autopilotControls()
    : {
        throttle: (input.held("thrust") ? 1 : 0) - (input.held("reverse") ? 1 : 0) + touch.throttle,
        heave: (input.held("surface") ? 1 : 0) - (input.held("dive") ? 1 : 0) + touch.heave,
        turn: (input.held("turnRight") ? 1 : 0) - (input.held("turnLeft") ? 1 : 0) + touch.turn,
        pitch: 0,
        sprint: input.held("sprint")
      };
  controls.pitch = controls.throttle * 0.2 + controls.heave * 0.3;

  const tetherResult = updateTetherPhysics(
    { x: subState.x, y: subState.y, z: subState.z },
    crates,
    dt
  );
  lastTowDrag = tetherResult.towDragForce;

  subState = updateSubmarine(
    subState,
    {
      throttle: Math.max(-1, Math.min(1, controls.throttle)),
      heave: Math.max(-1, Math.min(1, controls.heave)),
      turn: Math.max(-1, Math.min(1, controls.turn)),
      pitch: controls.pitch,
      sprint: controls.sprint
    },
    lastTowDrag,
    dt,
    DEFAULT_SUB_CONFIG
  );

  // Collision impact → hull damage + possible breach.
  if (subState.impactSpeedLastFrame > 3.5) {
    const impact = applyCollisionImpact(oxygenState, subState.impactSpeedLastFrame);
    oxygenState = impact.nextState;
    sensorEventCount += 1;
    fx.siltKick(subState.x, subState.y, subState.z);
    if (impact.breachedJustNow) {
      breachCount += 1;
      pushCue("breach-alarm", 0.9);
      pushCue("hull-creak", 0.8);
      fx.breachStrobe(subState.x, subState.y, subState.z);
    }
  }

  // Oxygen/hull.
  const tetheredCount = crates.filter((c) => c.tethered).length;
  oxygenState = updateOxygen(oxygenState, subState.y, controls.sprint, tetheredCount, dt);
  if (oxygenState.warningActive && !oxygenWarningCuePlayed) {
    oxygenWarningCuePlayed = true;
    pushCue("oxygen-warn", 0.9);
  }
  if (oxygenState.blackout && phase === "playing") {
    phase = "blackout";
    pushCue("blackout", 1.0);
    audio.stopAmbience();
    void game.hud.banner("SUBMARINE BLACKOUT — LIFE SUPPORT DEPLETED — R TO RESET", { holdMs: 4000 });
  }
  if (subState.y >= -1.0 && oxygenState.oxygen < 99) {
    oxygenState = refuelAtSurface(oxygenState);
    if (!surfaceCuePlayed) {
      surfaceCuePlayed = true;
      pushCue("surface-break", 0.7);
      fx.surfaceBreak(subState.x, subState.y, subState.z);
    }
  }

  // Thrust bubbles while driving.
  thrustBubbleClock += dt;
  if (Math.abs(controls.throttle) > 0.3 && thrustBubbleClock > 0.24) {
    thrustBubbleClock = 0;
    fx.thrustBubbles(subState.x, subState.y, subState.z);
  }

  sonarState = updateSonar(sonarState, dt);

  // Bank secured crates at the buoy.
  const bankRes = bankSecuredCrates(
    { x: subState.x, y: subState.y, z: subState.z },
    crates,
    BUOY_STATION.dockRadius
  );
  if (bankRes.bankedCount > 0) {
    bankedTotal += bankRes.bankedValue;
    bankedCountTotal += bankRes.bankedCount;
    sensorEventCount += 1;
    standardBanked ||= bankRes.bankedKinds.includes("crate-standard");
    heavyBanked ||= bankRes.bankedKinds.includes("crate-heavy");
    pushCue("crate-bank", 0.9);
    fx.crateBank(subState.x, subState.y, subState.z);
  }

  if (
    standardBanked && heavyBanked && breachCount > 0 && repairCount > 0
      && !oxygenState.breached && subState.y >= -1 && phase === "playing"
  ) {
    phase = "won";
    pushCue("surface-break", 1);
    audio.stopAmbience();
    void game.hud.banner(`RECOVERY COMPLETE — ${bankedTotal} CR SECURED`, { holdMs: 5000 });
  }

  syncVisualNodes(dt);
  syncHud();
}

// ------------------------------------------------------------ visuals --------

function syncVisualNodes(dt: number): void {
  const subNode = handle("sub-root");
  subNode?.setPosition(subState.x, subState.y, subState.z);
  subNode?.setRotation(subState.pitch, subState.yaw, subState.roll);

  const lightsOn = phase !== "blackout";
  const lampNode = handle("sub-lamp-volume");
  lampNode?.setPosition(
    subState.x + Math.sin(subState.yaw) * 3.4,
    subState.y - 0.1,
    subState.z + Math.cos(subState.yaw) * 3.4
  );
  lampNode?.setRotation(subState.pitch, subState.yaw, 0);
  lampNode?.setVisible(lightsOn);
  for (const [index, side] of [-0.52, 0.52].entries()) {
    const beam = handle(index === 0 ? "sub-lamp-port" : "sub-lamp-starboard");
    const sideX = Math.cos(subState.yaw) * side;
    const sideZ = -Math.sin(subState.yaw) * side;
    beam?.setPosition(
      subState.x + sideX + Math.sin(subState.yaw) * 3.1,
      subState.y - 0.2,
      subState.z + sideZ + Math.cos(subState.yaw) * 3.1
    );
    beam?.setRotation(Math.PI / 2 + subState.pitch, subState.yaw, 0);
    beam?.setVisible(lightsOn);
  }

  const breachNode = handle("breach-beacon");
  breachNode?.setPosition(subState.x, subState.y + 0.9, subState.z);
  breachNode?.setVisible(oxygenState.breached);

  // Bioluminescent silt + marine snow drift (killed under reduced motion).
  for (let i = 0; i < SILT_MOTES; i += 1) {
    const drift = reducedMotion ? 0 : Math.sin(missionTime * 0.7 + i * 1.3) * 0.22;
    const a = i * 1.71;
    const mote = handle(`silt-mote-${i}`);
    mote?.setPosition(
      subState.x + Math.cos(a) * (2.2 + (i % 4) * 0.8),
      subState.y - 0.6 + (i % 5) * 0.45 + drift,
      subState.z + Math.sin(a) * (2.4 + (i % 3) * 0.9)
    );
  }
  for (let i = 0; i < SNOW_COUNT; i += 1) {
    const snow = handle(`marine-snow-${i}`);
    const a = i * 2.39996;
    const r = 4.0 + (i % 7) * 1.6;
    const fall = reducedMotion ? 0 : ((missionTime * (0.12 + (i % 5) * 0.03) + i * 1.7) % 14);
    snow?.setPosition(
      subState.x + Math.cos(a) * r,
      subState.y + 6 - fall,
      subState.z + Math.sin(a) * r
    );
  }

  // Crates follow tether/settle physics.
  for (const c of crates) {
    const node = handle(`crate-node-${c.id}`);
    node?.setPosition(c.x, c.y, c.z);
    node?.setVisible(!c.banked);
    handle(`sonar-marker-${c.id}`)?.setPosition(c.x, c.y + 0.6, c.z);
  }

  // Sonar markers: visible only while their contact is live.
  const liveContacts = new Map<string, SonarContact>(sonarState.contacts.map((c) => [c.id, c]));
  for (const markerId of world.sonarMarkerIds) {
    const targetId = markerId.slice("sonar-marker-".length);
    const contact = liveContacts.get(targetId);
    const marker = handle(markerId);
    marker?.setVisible(contact !== undefined);
    if (contact && !reducedMotion) {
      const pulse = 0.92 + Math.sin(missionTime * 7 + contact.distance) * 0.18;
      marker?.setScale([pulse, pulse, 0.08]);
    }
  }

  // Sonar pulse wave expanding from the hull.
  const ring = handle("sonar-pulse-ring");
  if (sonarState.pulseWaveRadius > 0 && sonarState.pulseWaveRadius < 40) {
    ring?.setPosition(subState.x, subState.y, subState.z);
    ring?.setScale([sonarState.pulseWaveRadius, 0.05, sonarState.pulseWaveRadius]);
    ring?.setVisible(true);
  } else {
    ring?.setVisible(false);
  }

  // Grapple tether: the amber cable spans sub↔latched crate.
  const tethered = crates.find((c) => c.tethered && !c.banked);
  const tetherNode = handle("grapple-line");
  if (tetherNode && tethered) {
    const dx = tethered.x - subState.x;
    const dy = tethered.y - subState.y;
    const dz = tethered.z - subState.z;
    const dist = Math.max(0.01, Math.hypot(dx, dy, dz));
    tetherNode.setPosition(subState.x + dx / 2, subState.y + dy / 2, subState.z + dz / 2);
    tetherNode.setRotation(-Math.asin(dy / dist), Math.atan2(dx, dz), 0);
    tetherNode.setScale([0.045, 0.045, dist]);
    tetherNode.setVisible(true);
  } else {
    tetherNode?.setVisible(false);
  }

  // Buoy beacon + vent glow breathe (state-light rhythms, reduced-motion safe).
  const buoyPulse = reducedMotion ? 1 : 1 + Math.sin(missionTime * 2.2) * 0.16;
  handle("buoy-beacon")?.setScale([0.45 * buoyPulse, 0.45 * buoyPulse, 0.45 * buoyPulse]);
  for (let i = 0; i < VENT_COUNT; i += 1) {
    const glow = reducedMotion ? 1 : 1 + Math.sin(missionTime * 1.4 + i * 2.1) * 0.22;
    handle(`vent-glow-${i}`)?.setScale([0.7 * glow, 0.4 * glow, 0.7 * glow]);
  }
}

// ---------------------------------------------------------------- HUD --------

let lastHudKey = "";
function missionStage(): string {
  if (phase === "blackout") return "blackout";
  if (phase === "won") return "surface-complete";
  if (heavyBanked) return "ascent";
  if (oxygenState.breached || (standardBanked && repairCount === 0)) return "breach-repair";
  if (repairCount > 0) return "heavy-salvage";
  if (standardBanked) return "breach-repair";
  if (sonarState.pingCount > 0 && Math.abs(subState.y) >= 15) return "standard-salvage";
  if (sonarState.pingCount > 0 || Math.abs(subState.y) >= 12) return "wreck-approach";
  return "descent";
}

const OBJECTIVES: Record<string, string> = {
  descent: "DESCEND TO 15 M · PULSE SONAR",
  "wreck-approach": "FOLLOW CYAN RETURNS TO THE WRECK",
  "standard-salvage": "GRAPPLE A BLUE STANDARD POD · BANK AT BUOY",
  "breach-repair": "REPAIR HULL AT BUOY (C)",
  "heavy-salvage": "RECOVER AN AMBER HEAVY POD · EXPECT DRAG",
  ascent: "ASCEND TO THE BUOY · SURFACE",
  "surface-complete": "RECOVERY COMPLETE",
  blackout: "LIFE SUPPORT DEPLETED"
};

function syncHud(): void {
  const depth = Math.max(0, Math.round(-subState.y));
  const zone = getDepthZone(subState.y);
  const key = [
    phase, missionStage(), depth,
    Math.round(oxygenState.oxygen), Math.round(oxygenState.hull),
    bankedTotal, sonarState.contacts.length,
    oxygenState.breached ? 1 : 0, crates.filter((c) => c.tethered).length
  ].join("|");
  if (key === lastHudKey) return;
  lastHudKey = key;
  game.hud.set("objective", OBJECTIVES[missionStage()]);
  game.hud.set("depth", `${depth}m ${zone.name}`);
  game.hud.set("oxygen", Math.round(oxygenState.oxygen));
  game.hud.set("hull", Math.round(oxygenState.hull));
  game.hud.set("salvage", bankedTotal);
  game.hud.set("sonar", `${sonarState.contacts.length} RETURNS · ${Math.max(0, sonarState.pingCooldownRemaining).toFixed(1)}s`);
  const tethered = crates.filter((c) => c.tethered).length;
  game.hud.set(
    "message",
    phase === "blackout" ? "BLACKOUT — R TO RESET"
      : phase === "won" ? `RECOVERY COMPLETE — ${bankedTotal} CR`
      : phase === "paused" ? "PAUSED — P TO RESUME"
      : tethered > 0 ? `TETHERED ×${tethered} — F TO RELEASE · BANK AT BUOY`
      : oxygenState.breached ? "HULL BREACH — REPAIR AT BUOY (C)"
      : "W/S THRUST · A/D TURN · Q/E DEPTH · SPACE SONAR · F GRAPPLE"
  );
}

// ------------------------------------------------------------- evidence ------

const appliedLook: Record<string, unknown> = {
  id: direction.id,
  genre: direction.genre,
  rig: "deep-recovery.chase",
  fov: 62,
  background: WATER_BG,
  palette: direction.palette,
  signatureEffect: direction.signatureEffect
};

const rigState = { x: subState.x, y: subState.y, z: subState.z, yaw: subState.yaw };

const runSnapshot = (): DeepRunSnapshot => {
  const tethered = crates.filter((c) => c.tethered);
  return {
    phase,
    missionStage: missionStage(),
    sub: {
      x: subState.x,
      y: subState.y,
      z: subState.z,
      yaw: subState.yaw,
      speed: subState.speed,
      throttle: subState.throttle,
      depth: Math.max(0, -subState.y),
      sprint: subState.sprint
    },
    oxygen: {
      oxygen: oxygenState.oxygen,
      hull: oxygenState.hull,
      breached: oxygenState.breached,
      warningActive: oxygenState.warningActive,
      blackout: oxygenState.blackout,
      breachCount,
      repairCount
    },
    salvage: {
      grappled: grappleLatchCount,
      tethered: tethered.length,
      banked: bankedCountTotal,
      bankedValue: bankedTotal,
      cratesTotal: crates.length,
      towMassKg: Math.round(tethered.reduce((sum, c) => sum + c.mass, 0)),
      standardBanked,
      heavyBanked
    },
    sonar: {
      pings: sonarState.pingCount,
      returns: sonarState.returnCount,
      liveContacts: sonarState.contacts.length,
      cooldown: sonarState.pingCooldownRemaining
    },
    contracts: {
      active: phase === "won" ? 3 : heavyBanked ? 2 : standardBanked || repairCount > 0 ? 1 : 0,
      title: CONTRACTS[Math.min(2, standardBanked || repairCount > 0 ? (heavyBanked ? 2 : 1) : 0)]!.title,
      quotaValue: CONTRACTS[Math.min(2, standardBanked || repairCount > 0 ? (heavyBanked ? 2 : 1) : 0)]!.quotaValue,
      complete: phase === "won"
    },
    sensorEventCount,
    grappleLineLive: tethered.length > 0
  };
};

publishDeepEvidence({
  game,
  snapshot: runSnapshot,
  appliedLook: () => appliedLook,
  audioCueLog: () => audioCueLog,
  bootedAtMs: () => bootedAtMs,
  frameCount: () => frame
});

const scenarioParam = routeParams.get("scenario");
if (scenarioParam) {
  applyDeepScenario(scenarioParam, {
    poseSub: (x, y, z, yaw) => {
      subState = { ...subState, x, y, z, yaw, vx: 0, vy: 0, vz: 0 };
      rigState.x = x;
      rigState.y = y;
      rigState.z = z;
      rigState.yaw = yaw;
      syncVisualNodes(0);
    },
    setOxygen: (v) => { oxygenState = { ...oxygenState, oxygen: v }; },
    setHull: (v) => { oxygenState = { ...oxygenState, hull: v }; },
    firePing: () => handlePing(),
    reset: () => resetGame()
  });
}

// ------------------------------------------------------------------- boot ----

game.app.onFrame?.(({ dt: rawDt }) => {
  const frameDt = game.session.scaledDt(rawDt) || rawDt;
  const dt = Math.min(0.05, Math.max(0.001, frameDt));
  input.update(dt);
  if (input.pressed("ping")) handlePing();
  if (input.pressed("grapple")) handleGrappleToggle();
  if (input.pressed("repair")) handleRepair();
  if (input.pressed("pause")) togglePause();
  if (input.pressed("reset")) resetGame();
  rigState.x = subState.x;
  rigState.y = subState.y;
  rigState.z = subState.z;
  rigState.yaw = subState.yaw;
  updateGameplay(dt);
});

game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(createDeepRig(rigState), { blend: 0.4 });
  // C-05 output: underwater grade; post presets stub {} until the registry
  // ships real output profiles.
  void postPresets["underwater"];
  game.app.setOutput?.({ exposure: Math.pow(2, direction.lighting.exposureEV) });
  const firstFrameAt = performance.now();
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});
