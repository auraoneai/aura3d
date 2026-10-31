/**
 * GU47 PRD D11: the 4.6.2 Thermal Drift presentation (night-city look), restored as the default after the blind panel
 * judged the foundry look worse than 4.6.2 in all three circuits. Source of truth: 9310097a4 (v4.6.2), imports rebased.
 * The GU47 foundry look stays opt-in via `?look=foundry` (src/entry.ts).
 */
import "../../../showcase-port-shared/quickbar.css";
import { createAuraApp, createFixedStepLoop, type AuraRuntimeNodeHandle } from "@aura3d/engine";
import { installBlackFrameGuard } from "@aura3d/debug";
import { createFixedStepPresenter, installGameBeacon } from "@aura3d/engine/game";
import { createThermalDriftAudio } from "../audio";
import { ChaseCamera, projectToScreen, type ScreenPoint } from "./camera";
import { CIRCUITS, DRONE_ORDER, DRONE_SPECS, SCENERY_ANCHORS, TOTAL_LAPS, type CircuitId, type DroneId, type ModeId } from "../data";
import { createInputs } from "../input";
import { createHud } from "../hud";
import { circuitFromParam } from "../look";
import { applyCircuitLook, InstanceWriter, slotRivals } from "./view";
import {
  buildThermalDriftScene,
  IDS,
  INSTANCE_COUNTS,
  MODEL_NODE_COUNT,
  RAIN_STREAK_COUNT,
  ROAD_TILE_COUNT,
  ROAD_TILE_SPACING,
  WALL_SEGMENT_COUNT,
  WALL_SPACING
} from "./scene";
import {
  autopilot,
  collectedPass,
  createRace,
  ghostDelta,
  rollAngle,
  STEP,
  stepRace,
  type Action,
  type GhostTrace,
  type RaceState,
  type SimEvent,
  type SimInput
} from "../sim";
import { createShown, blendShown, writeShown, type Shown } from "../shown";
import { loadRecord, saveRecord } from "../records";
import { TrackView, sectorNameAt, type TrackPose } from "../track";

installBlackFrameGuard();

const params = new URLSearchParams(window.location.search);
const qaManual = params.get("qaManual") === "1";
const qaEvRaw = Number(params.get("qaEv"));
const qaEv = params.has("qaEv") && Number.isFinite(qaEvRaw) ? Math.min(2, Math.max(-2, qaEvRaw)) : undefined;
const qaAoOff = params.get("qaAo") === "off";
const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

const hud = createHud(document);
const audio = createThermalDriftAudio((muted) => hud.setMuted(muted));

let selectedDrone: DroneId = "orion";
// GU47 D11: `?circuit=grand|dustfall|vesper` boots that circuit in the 4.6.2 look too (the capture variants).
let selectedCircuit: CircuitId = circuitFromParam(params.get("circuit")) ?? "grand";
let selectedMode: ModeId = "race";
let autopilotOn = params.get("autoplay") === "1" || params.get("demo") === "1";
let started = autopilotOn;
let ready = false;

const newRace = (): RaceState => {
  const record = loadRecord(selectedCircuit, selectedDrone);
  return createRace({ circuit: selectedCircuit, mode: selectedMode, drone: selectedDrone, bestLap: record?.bestLap ?? null, ghost: record?.ghost ?? null });
};
let race = newRace();

let gameBeacon: ReturnType<typeof installGameBeacon> | undefined;

async function boot(): Promise<void> {
  const auraApp = createAuraApp("#app", {
    scene: buildThermalDriftScene({ circuit: CIRCUITS[selectedCircuit], ...(qaEv !== undefined ? { exposureEv: qaEv } : {}), ...(qaAoOff ? { ambientOcclusion: false } : {}) }),
    // "auto" mounts at the "high" tier today (the same as the old "high" string) and lets the tier follow the device once the
    // quality-tier lane is on; a fixed "high" would keep phones on the desktop tier and logs RENDERER_QUALITY_STRING.
    renderer: { quality: { tier: "auto" } },
    qualityRebuild: { flags: ["game"] },
    diagnostics: false
  });
  const req = (id: string): AuraRuntimeNodeHandle => auraApp.nodes.require(id);

  const droneHandles = Object.fromEntries(DRONE_ORDER.map((id) => [id, req(DRONE_SPECS[id].nodeId)])) as Record<DroneId, AuraRuntimeNodeHandle>;
  const writers = {
    deckEven: new InstanceWriter(req(IDS.deckEven), INSTANCE_COUNTS.deckEven),
    deckOdd: new InstanceWriter(req(IDS.deckOdd), INSTANCE_COUNTS.deckOdd),
    spineA: new InstanceWriter(req(IDS.spineA), INSTANCE_COUNTS.spineA),
    spineB: new InstanceWriter(req(IDS.spineB), INSTANCE_COUNTS.spineB),
    lanes: new InstanceWriter(req(IDS.lanes), INSTANCE_COUNTS.lanes),
    walls: new InstanceWriter(req(IDS.walls), INSTANCE_COUNTS.walls),
    chevA: new InstanceWriter(req(IDS.chevA), INSTANCE_COUNTS.chevA),
    chevB: new InstanceWriter(req(IDS.chevB), INSTANCE_COUNTS.chevB),
    rain: new InstanceWriter(req(IDS.rain), INSTANCE_COUNTS.rain),
    bolts: new InstanceWriter(req(IDS.bolts), INSTANCE_COUNTS.bolts)
  };
  const ringHandle = req(IDS.ring);
  const missileHandle = req(IDS.missile);
  const incomingHandle = req(IDS.incoming);
  const mineHandle = req(IDS.mine);
  const sceneryHandles = SCENERY_ANCHORS.map((anchor) => ({ anchor, handle: req(anchor.id) }));
  const lookHandles = { backdrop: req(IDS.backdrop), floor: req(IDS.floor), bandA: req(IDS.bandA), bandB: req(IDS.bandB), spineA: req(IDS.spineA), spineB: req(IDS.spineB), chevA: req(IDS.chevA), chevB: req(IDS.chevB) };

  const track = new TrackView();
  const chase = new ChaseCamera();
  const pose: TrackPose = { x: 0, y: 0, z: 0, heading: 0 };
  const pose2: TrackPose = { x: 0, y: 0, z: 0, heading: 0 };
  const screen: ScreenPoint = { x: 0, y: 0, depth: 0 };
  const rivalSlots = new Map<number, DroneId>();
  const slotOut = new Map<DroneId, number>();
  const rivalModelsFor = Object.fromEntries(DRONE_ORDER.map((d) => [d, DRONE_ORDER.filter((o) => o !== d)])) as unknown as Record<DroneId, readonly DroneId[]>;
  const SIDES = [-1, 1] as const;
  let shownCircuit: CircuitId = selectedCircuit;

  // ------------------------------------------------------------------------------------------ input
  const pendingActions: Action[] = [];
  const inputs = createInputs({
    stage: document.getElementById("app"),
    touchRoot: document.getElementById("touch"),
    onAction: (action) => { if (race.phase === "racing") pendingActions.push(action); },
    onStart: () => startRace(),
    onConfirm: () => { if (race.phase === "results") restart(); else startRace(); },
    onRestart: () => restart(),
    onToggleAutopilot: () => setAutopilot(!autopilotOn),
    onToggleMute: () => audio.toggleMute(),
    onDrone: (id) => selectDrone(id),
    onGesture: () => audio.unlock()
  });
  audio.install();
  document.getElementById("start")?.addEventListener("pointerdown", (ev) => { ev.preventDefault(); audio.unlock(); startRace(); });

  // ------------------------------------------------------------------------------------------ race control
  const presenter = createFixedStepPresenter<Shown>({ snapshot: () => writeShown(race, createShown(race.rivals.length)), blend: blendShown });
  const loop = createFixedStepLoop({ step: simStep, stepSeconds: STEP, manual: qaManual, isActive: () => ready && started });

  function resetView(): void {
    presenter.reset();
    loop.resetAccumulator();
    chase.reset();
    rivalSlots.clear();
    pendingActions.length = 0;
    hud.resetRace(race);
  }

  /** The one full reset (C16): every value comes from createRace, the boot path included. */
  function restart(): void {
    race = newRace();
    hud.hideResults();
    resetView();
    publish(true);
  }

  function startRace(): void {
    if (started) return;
    started = true;
    hud.hideStart();
    audio.unlock();
  }

  function setAutopilot(on: boolean): void {
    autopilotOn = on;
    hud.setAutopilot(on);
  }

  function selectDrone(id: DroneId): void {
    if (!DRONE_SPECS[id]) return;
    selectedDrone = id;
    hud.selectDrone(id);
    restart();
    hud.banner(`DRONE · ${DRONE_SPECS[id].name}`);
    audio.play("chime", 580);
  }

  function selectCircuit(id: CircuitId): void {
    if (!CIRCUITS[id]) return;
    selectedCircuit = id;
    hud.selectCircuit(id);
    restart();
    audio.play("chime", 640);
  }

  function selectMode(id: ModeId): void {
    selectedMode = id;
    hud.selectMode(id);
    restart();
    hud.banner(`MODE · ${id === "race" ? "RACE" : id === "trial" ? "TIME TRIAL" : "ELIMINATION"}`);
    audio.play("chime", 520);
  }

  hud.bindBars({ onDrone: selectDrone, onCircuit: selectCircuit, onMode: selectMode, onRestart: restart, onAutopilot: () => setAutopilot(!autopilotOn), onResultsRestart: restart });

  // ------------------------------------------------------------------------------------------ events
  function handleEvents(events: readonly SimEvent[]): void {
    audio.events(events);
    for (const e of events) {
      switch (e.type) {
        case "countdown": hud.countdown(String(e.value)); break;
        case "go": hud.countdown("GO"); break;
        case "lap":
          if (e.best || e.trace) saveRecord(race.circuit, race.drone, { bestLap: race.bestLap, ghost: race.ghost as GhostTrace | null });
          if (race.lapsDone < TOTAL_LAPS || race.mode === "elim") hud.centerMessage(race.mode === "elim" ? `LAP ${race.lapsDone + 1}` : `LAP ${race.lapsDone + 1}/${TOTAL_LAPS}`, e.best ? "NEW BEST LAP" : CIRCUITS[race.circuit].name, 1.8);
          break;
        case "finish": hud.showResults(e.result, race); break;
        case "takedown": hud.banner(`${e.by === "missile" ? "MISSILE " : e.by === "shock" ? "EMP " : e.by === "mine" ? "MINE " : ""}TAKEDOWN · ${e.name.toUpperCase()}`); break;
        case "incoming": hud.banner(`${e.name.toUpperCase()} FIRED`); break;
        case "evaded": hud.banner("MISSILE EVADED"); break;
        case "damage": chase.addTrauma(e.source === "missile" ? 0.6 : e.source === "barrel" ? 0.5 : 0.3); hud.flashDamage(); break;
        case "scrape": chase.addTrauma(0.25); hud.banner("WALL SCRAPE"); break;
        case "bump": chase.addTrauma(0.3); hud.banner(`CONTACT · ${e.name.toUpperCase()}`); break;
        case "pickup":
          hud.banner(e.kind === "boost" ? "BOOST PAD" : e.kind === "coolant" ? "COOLANT" : e.kind === "shield" ? "SHIELD CELL" : "SHOCK RECHARGED");
          if (e.item) hud.banner(`ITEM · ${e.item}`);
          break;
        case "barrel": hud.banner("BARREL HIT"); break;
        case "destroyed": chase.addTrauma(0.9); hud.centerMessage("DRONE DOWN", "RESPAWNING", 1.8); break;
        case "respawn": hud.banner("BACK IN THE RACE"); break;
        case "eliminated": if (!e.player) hud.banner(`ELIMINATED · ${e.name.toUpperCase()}`); break;
        case "overheat": hud.banner("THERMAL OVERLOAD · VENTING"); break;
        case "shock": if (e.hits === 0) hud.banner("SHOCKWAVE PULSE"); break;
        case "roll": hud.banner("BARREL ROLL"); break;
        case "mine": hud.banner("PROXIMITY MINE DEPLOYED"); break;
        case "item": hud.banner(e.item); break;
        default: break;
      }
    }
  }

  // ------------------------------------------------------------------------------------------ loop
  const manualInput: SimInput = { steer: 0, pitch: 0, boost: false, fire: false };
  function simStep(): void {
    let input: SimInput = manualInput;
    let actions: readonly Action[] = pendingActions;
    if (autopilotOn) {
      const auto = autopilot(race);
      input = auto.input;
      actions = pendingActions.length ? [...auto.actions, ...pendingActions] : auto.actions;
    } else {
      inputs.read(manualInput);
    }
    stepRace(race, input, actions, STEP);
    pendingActions.length = 0;
    handleEvents(race.events);
    presenter.afterStep();
  }

  // ------------------------------------------------------------------------------------------ draw
  function droneRotation(handle: AuraRuntimeNodeHandle, heading: number, pitch: number, yaw: number, roll: number): void {
    handle.setRotation(pitch, -heading + yaw, roll);
  }

  /** HUD timers (banners, messages, countdown digits) run on wall-clock time, so they clear on time even when the
   *  page draws a frame every few seconds; the camera smoothing keeps the clamped frame time. */
  let lastHudAt = performance.now();
  function draw(frameSeconds: number): void {
    const now = performance.now();
    const hudSeconds = Math.min(1, Math.max(0, (now - lastHudAt) / 1000));
    lastHudAt = now;
    const circuit = CIRCUITS[race.circuit];
    if (shownCircuit !== race.circuit) {
      applyCircuitLook(lookHandles, circuit);
      auraApp.setClearColor?.(circuit.skyColor);
      shownCircuit = race.circuit;
    }
    const reduced = reducedMotionQuery?.matches ?? false;
    const shown = presenter.present(loop, !qaManual && race.phase === "racing");
    const p = race.player;
    track.update(circuit, shown.player[0]!);

    // Player
    const playerHandle = droneHandles[race.drone];
    track.place(0.4, shown.player[1]!, shown.player[2]!, pose);
    const blink = p.respawn <= 0 && race.time - p.lastHitTime < 0.6 && Math.floor(race.time * 20) % 2 === 0;
    playerHandle.setPosition(pose.x, pose.y, pose.z).setVisible(p.respawn <= 0 && !blink);
    droneRotation(playerHandle, pose.heading, shown.player[4]!, shown.player[5]!, shown.player[3]! + (reduced ? 0 : rollAngle(race)));
    const dronePos: [number, number, number] = [pose.x, pose.y, pose.z];

    // Rivals: drawn set onto the six other drone models; a rival keeps its model while it stays drawn.
    const slots = slotRivals(race.drawn, rivalSlots, rivalModelsFor[race.drone], slotOut);
    for (const id of DRONE_ORDER) {
      if (id === race.drone) continue;
      const h = droneHandles[id];
      const rivalIndex = slots.get(id);
      if (rivalIndex === undefined) { h.setVisible(false); continue; }
      const r = race.rivals[rivalIndex]!;
      const base = rivalIndex * 3;
      const d = shown.rivals[base]! - shown.player[0]!;
      track.place(d + 0.4, shown.rivals[base + 1]!, shown.rivals[base + 2]!, pose2);
      h.setPosition(pose2.x, pose2.y, pose2.z).setVisible(true);
      droneRotation(h, pose2.heading, -0.04, 0, Math.max(-0.45, Math.min(0.45, (r.x - r.targetX) * 0.22)));
    }

    // Road tiles: fixed world positions every 12 m; colour by absolute tile index so nothing flips while scrolling.
    const progress = shown.player[0]!;
    const firstTile = Math.floor((progress - 20) / ROAD_TILE_SPACING);
    writers.deckEven.begin(); writers.deckOdd.begin(); writers.spineA.begin(); writers.spineB.begin(); writers.lanes.begin();
    for (let i = 0; i < ROAD_TILE_COUNT; i += 1) {
      const n = firstTile + i;
      const d = n * ROAD_TILE_SPACING + ROAD_TILE_SPACING / 2 - progress;
      track.place(d, 0, 0, pose2);
      const yaw = -pose2.heading;
      ((n & 1) === 0 ? writers.deckEven : writers.deckOdd).push(pose2.x, pose2.y - ((n & 1) === 0 ? 0.18 : 0.186), pose2.z, yaw, 1);
      ((((n % 3) + 3) % 3) === 0 ? writers.spineA : writers.spineB).push(pose2.x, pose2.y + 0.03, pose2.z, yaw, 1);
      track.place(d, -5.2, 0.025, pose); writers.lanes.push(pose.x, pose.y, pose.z, yaw, 1);
      track.place(d, 5.2, 0.025, pose); writers.lanes.push(pose.x, pose.y, pose.z, yaw, 1);
    }
    writers.deckEven.end(); writers.deckOdd.end(); writers.spineA.end(); writers.spineB.end(); writers.lanes.end();

    // Walls and chevrons every 13.5 m.
    const firstWall = Math.floor((progress - 20) / WALL_SPACING);
    writers.walls.begin(); writers.chevA.begin(); writers.chevB.begin();
    for (let i = 0; i < WALL_SEGMENT_COUNT; i += 1) {
      const n = firstWall + i;
      const d = n * WALL_SPACING + WALL_SPACING / 2 - progress;
      const chev = (n & 1) === 0 ? writers.chevA : writers.chevB;
      for (const side of SIDES) {
        track.place(d, side * 11.3, 0.55, pose2); writers.walls.push(pose2.x, pose2.y, pose2.z, -pose2.heading, 1);
        track.place(d, side * 10.72, 0.72, pose2); chev.push(pose2.x, pose2.y, pose2.z, -pose2.heading, 1);
      }
    }
    writers.walls.end(); writers.chevA.end(); writers.chevB.end();

    // Scenery: the copy in the window [-(10 + maxDim/2), period - (10 + maxDim/2)) metres around the player. A copy is
    // hidden only once it is behind the camera (C4), or after its pickup was collected on this pass (C14).
    for (const { anchor, handle } of sceneryHandles) {
      const behind = 10 + anchor.maxDim / 2;
      const k = Math.ceil((progress - behind - anchor.s) / anchor.period);
      const d = anchor.s + k * anchor.period - progress;
      track.place(d, anchor.lateralX, anchor.baseY, pose2);
      const collected = anchor.kind !== "decor" && collectedPass(race, anchor.id) === k;
      handle.setPosition(pose2.x, pose2.y, pose2.z).setVisible(!collected);
      handle.setRotation(0, -pose2.heading + anchor.yaw + (anchor.spinSpeed && !reduced ? race.time * anchor.spinSpeed : 0), 0);
    }

    // Mine: drawn at its track position while deployed, hidden otherwise (C8).
    const mine = race.mine;
    const mineD = mine.progress - progress;
    if (mine.active && mineD > -24 && mineD < 220) {
      track.place(mineD, mine.x, 0.35, pose2);
      mineHandle.setPosition(pose2.x, pose2.y, pose2.z).setVisible(true);
    } else mineHandle.setVisible(false);

    // Lasers
    writers.bolts.begin();
    for (const b of race.bolts) {
      if (!b.active) { writers.bolts.park(); continue; }
      track.place(b.progress - progress, b.x, b.y, pose2);
      writers.bolts.push(pose2.x, pose2.y, pose2.z, -pose2.heading, 1);
    }
    writers.bolts.end();

    // Player missile
    const m = race.missile;
    if (m.active) {
      track.place(m.progress - progress, m.x, m.y, pose2);
      missileHandle.setPosition(pose2.x, pose2.y, pose2.z).setRotation(Math.PI * 0.5, -pose2.heading, 0).setVisible(true);
    } else missileHandle.setVisible(false);

    // Incoming missile: flies from the shooter to the player over the warning time.
    const inc = race.incoming;
    if (inc.active && inc.from >= 0) {
      const shooter = race.rivals[inc.from]!;
      const t = 1 - inc.eta / Math.max(0.01, inc.total);
      const d = (shooter.progress - progress) * (1 - t) + 0.4 * t;
      track.place(d, shooter.x + (p.x - shooter.x) * t, shooter.y + (p.y - shooter.y) * t + Math.sin(t * Math.PI) * 1.2, pose2);
      incomingHandle.setPosition(pose2.x, pose2.y, pose2.z).setRotation(Math.PI * 0.5, -pose2.heading, 0).setVisible(true);
    } else incomingHandle.setVisible(false);

    // Shockwave ring
    if (p.shockActive > 0) {
      const s = 1 + (1 - p.shockActive / 0.65) * 8.5;
      ringHandle.setPosition(dronePos[0], dronePos[1], dronePos[2]).setScale([s, s, 1]).setVisible(true);
    } else ringHandle.setVisible(false);

    // Rain (off with reduced motion)
    writers.rain.begin();
    for (let i = 0; i < RAIN_STREAK_COUNT; i += 1) {
      if (reduced) { writers.rain.park(); continue; }
      const rx = ((i * 7.3) % 26) - 13 + dronePos[0] * 0.35;
      const ry = (((12 - race.time * 26 - i * 1.9) % 12) + 12) % 12 + 0.5;
      const rz = -3 - ((((race.time * 88 + i * 6.7) % 65) + 65) % 65);
      writers.rain.push(rx, ry, rz, 0, 1);
    }
    writers.rain.end();

    // Camera
    track.place(18, shown.player[1]! * 0.4, 1.8, pose2);
    const aspect = (auraApp.canvas?.clientWidth || innerWidth) / Math.max(1, auraApp.canvas?.clientHeight || innerHeight);
    const cam = chase.update(frameSeconds, {
      drone: dronePos,
      lookAt: [pose2.x, pose2.y, pose2.z],
      boosting: race.phase === "racing" && p.boosting,
      hyper: p.hyper > 0,
      aspect,
      reducedMotion: reduced
    });
    auraApp.camera?.setPose({ position: [...cam.position], target: [...cam.target], fov: cam.fov });

    // Lock bracket through the real camera (C7).
    const presented = auraApp.camera?.presented?.();
    const camPose = presented && presented.position ? presented : cam;
    let lock: { x: number; y: number; offscreen: boolean; name: string; dist: number } | null = null;
    if (race.locked >= 0) {
      const lr = race.rivals[race.locked]!;
      const base = race.locked * 3;
      track.place(shown.rivals[base]! - progress + 0.4, shown.rivals[base + 1]!, shown.rivals[base + 2]! + 0.5, pose2);
      projectToScreen(camPose, aspect, [pose2.x, pose2.y, pose2.z], screen);
      const off = screen.depth <= 0 || screen.x < 0.04 || screen.x > 0.96 || screen.y < 0.08 || screen.y > 0.92;
      lock = { x: Math.min(0.96, Math.max(0.04, screen.x)), y: Math.min(0.92, Math.max(0.08, screen.y)), offscreen: off, name: lr.name, dist: Math.round(lr.progress - p.progress) };
    }

    hud.frame(race, {
      sector: sectorNameAt(circuit, Math.max(0, p.progress)),
      ghost: ghostDelta(race),
      lock,
      autopilot: autopilotOn,
      reducedMotion: reduced,
      boosting: race.phase === "racing" && p.boosting
    }, hudSeconds);
    audio.update({ racing: race.phase === "racing" && p.respawn <= 0, speedKmh: p.speedKmh, boosting: race.phase === "racing" && p.boosting });
    publish(false);
  }

  // ------------------------------------------------------------------------------------------ beacon + QA
  let lastPublish = 0;
  const evidence = () => ({
    route: "showcase-heatsink",
    engine: "@aura3d/engine",
    ready: true,
    phase: race.phase,
    autopilot: autopilotOn,
    drone: race.drone,
    circuit: race.circuit,
    mode: race.mode,
    lap: Math.min(TOTAL_LAPS, race.lapsDone + 1),
    lapsDone: race.lapsDone,
    position: race.position,
    field: race.field,
    speedKmh: Math.round(race.player.speedKmh),
    hull: Math.round(race.player.hull),
    shield: Math.round(race.player.shield),
    heat: Math.round(race.player.heat),
    takedowns: race.takedowns,
    result: race.result,
    modelNodeCount: MODEL_NODE_COUNT,
    admittedAssetKeyCount: 26
  });
  function publish(force: boolean): void {
    const now = performance.now();
    if (!force && now - lastPublish < 250) return;
    lastPublish = now;
    gameBeacon ??= installGameBeacon({
      route: "showcase-heatsink",
      evidenceGlobals: ["__AURA3D_GAME_EVIDENCE__"],
      getState: () => (!started ? "title" : race.phase === "results" ? "results" : "playing"),
      getApp: () => auraApp as never
    });
    gameBeacon.publishEvidence(evidence());
  }

  const getState = () => ({
    ...evidence(),
    started,
    countdown: race.countdown,
    time: race.time,
    progress: race.player.progress,
    x: race.player.x,
    item: race.player.item,
    drawn: race.drawn.slice(),
    locked: race.locked,
    incoming: race.incoming.active,
    reducedMotion: reducedMotionQuery?.matches ?? false,
    input: autopilotOn ? null : { ...manualInput }
  });

  (window as unknown as Record<string, unknown>).__AURA3D_SHOWCASE_HEATSINK__ = {
    app: auraApp,
    selectDrone,
    selectCircuit,
    selectMode,
    restart,
    resetRace: restart,
    getState,
    qa: {
      /** Run the fixed-step sim for `seconds` now (starts the race if needed), then draw once. */
      advance(seconds: number): void {
        startRace();
        loop.advance(Math.max(0, Math.round(seconds / STEP)));
        draw(STEP);
      },
      setAutopilot,
      race: () => race
    }
  };

  await auraApp.ready();
  ready = true;
  hud.resetRace(race);
  hud.setAutopilot(autopilotOn);
  if (!started) hud.showStart(inputs.touch);
  auraApp.onFrame(({ dt }) => {
    loop.tick(performance.now());
    draw(Math.min(0.1, Math.max(0, dt)));
  });
  draw(STEP);
  auraApp.step(1 / 60);
  hud.bootDone();
  document.body.dataset.aura3dReady = "true";
  auraApp.resume();
  publish(true);
}

boot().catch((error: unknown) => {
  console.error("thermal-drift: boot failed", error);
  hud.bootFailed(String(error));
});
