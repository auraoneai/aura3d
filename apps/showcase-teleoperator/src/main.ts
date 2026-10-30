import { camera, createAuraApp, createFixedStepLoop, installQaHooks, material, type AuraModelMaterialHandle, type AuraRuntimeNodeHandle, type AuraTransformSpec, type AuraVec3 } from "@aura3d/engine";
import { installBlackFrameGuard, installSafetyNet } from "@aura3d/debug";
import { createCameraShake, createFixedStepPresenter, createHitStop, installGameBeacon, warmPrograms } from "@aura3d/engine/game";
import { createGridAudio } from "./audio";
import { createTrafficContacts } from "./collision";
import { createHud, drawMinimap, formatClock } from "./hud";
import {
  ASSIST,
  CAR_DRAW_Z,
  CURB_BEACON_X,
  INTERSECTION_STRIDE_Z,
  KERB_STOP_X,
  PLAYABLE_FLEET,
  PLAYABLE_IDS,
  SCENE_CAM_FOV_DEG,
  SCENE_CAM_POS,
  SCENE_CAM_TARGET,
  cameraClearance,
  cameraOffsets,
  clamp,
  fittedSize,
  gmodeLabel,
  isAutonomous,
  isTextEntryTarget,
  kerbHint,
  lerp,
  loadCareer,
  nearestIndices,
  nextAssist,
  saveCareer,
  viewX,
  viewFollowFor,
  DRIVING_CODES,
  type AutopilotLevel,
  type CameraMode,
  type PlayableCarId,
  type Vec3,
  type WeatherPreset
} from "./rules";
import {
  BUILDING_PAIRS,
  BUILDING_STRIDE_Z,
  DASH_LINES_X,
  DASH_ROWS,
  DASH_STRIDE_Z,
  GRID_DISPATCH_FLAGS,
  GRID_DISPATCH_RENDERER,
  HIDDEN_POS,
  HIDDEN_SCALE,
  INTERSECTION_COUNT,
  LAMP_PAIRS,
  LAMP_STRIDE_Z,
  PATH_RIBBON_COUNT,
  HEADLIGHT_IDS,
  ROAD_STRIPS,
  TAIL_LAMP,
  WEATHER,
  buildGridDispatchScene,
  buildingLayoutLeft,
  buildingLayoutRight,
  headlightPose,
  nearestLamps,
  PLAYER_ASSET,
  carMaterialOverrides,
  probeBuildingModels,
  roadTileLayout,
  sodiumPointIds,
  tailLampMaterial,
  windowGlowOverride,
  skyOutput
} from "./scene";
import { NO_INPUT, RIVALS, ROAD_USER_COUNT, TRAFFIC_COUNT, TRAFFIC_SPECS, createSim, fareOf, roadUserFootprints, type DriveInput, type SimEvent } from "./sim";
import { BOOT_SKY, SKY_LOOKS, nextSky, skyFromParam } from "./look";
import { installSensorPass, scanPulseAt } from "./scanPulse";
import { createGridVfxQueue, headlightMotesSpec, installGridVfx, manholeLayout, motesAnchor, type GridVfxShot } from "./vfx";
import { mountTouchPads } from "./touch";
import { bezelState } from "./bezel";
import { INTRO_SHOT_S, introEnabled, introShots, resultsDof } from "./intro";
import { CATENARY, DISTRICTS, PARKED, SIGN, SIGN_SLOTS, districtAt, parkedLayout, signAssignments, signNodeId } from "./dressing";
import { STATIC_CROPS, carCrop, type QaCrop } from "./qaCrops";
import { FOV_KICK_HALFLIFE_S, FOV_KICK_MAX_DEG, ROLL_HALFLIFE_S, cameraFeel } from "./cameraFeel";

export type { AutopilotLevel, PlayableCarId, WeatherPreset } from "./rules";

installBlackFrameGuard();

let gameBeacon: ReturnType<typeof installGameBeacon> | undefined;
const publishBeacon = (evidence: object): void => {
  gameBeacon ??= installGameBeacon({ route: "showcase-teleoperator", evidenceGlobals: ["__AURA3D_GAME_EVIDENCE__"] });
  gameBeacon.publishEvidence(evidence);
};

const STEP = 1 / 60;
const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

/** Project a view-space point to viewport pixels (the scene camera is fixed; see rules.ts). */
function projectViewPointToScreen(pt: Vec3, vw: number, vh: number, fovDeg = SCENE_CAM_FOV_DEG): { x: number; y: number; visible: boolean } {
  const f = [SCENE_CAM_TARGET[0] - SCENE_CAM_POS[0], SCENE_CAM_TARGET[1] - SCENE_CAM_POS[1], SCENE_CAM_TARGET[2] - SCENE_CAM_POS[2]];
  const fl = Math.hypot(f[0]!, f[1]!, f[2]!) || 1;
  const fwd = [f[0]! / fl, f[1]! / fl, f[2]! / fl];
  const rl = Math.hypot(fwd[2]!, fwd[0]!) || 1;
  const right = [-fwd[2]! / rl, 0, fwd[0]! / rl];
  const up = [right[1]! * fwd[2]! - right[2]! * fwd[1]!, right[2]! * fwd[0]! - right[0]! * fwd[2]!, right[0]! * fwd[1]! - right[1]! * fwd[0]!];
  const d = [pt[0] - SCENE_CAM_POS[0], pt[1] - SCENE_CAM_POS[1], pt[2] - SCENE_CAM_POS[2]];
  const cx = d[0]! * right[0]! + d[2]! * right[2]!;
  const cy = d[0]! * up[0]! + d[1]! * up[1]! + d[2]! * up[2]!;
  const cz = d[0]! * fwd[0]! + d[1]! * fwd[1]! + d[2]! * fwd[2]!;
  if (cz <= 1.2 || cz > 240) return { x: -999, y: -999, visible: false };
  const t = Math.tan((fovDeg * 0.5 * Math.PI) / 180);
  const ndcX = cx / (cz * t * (Math.max(1, vw) / Math.max(1, vh)));
  const ndcY = cy / (cz * t);
  if (Math.abs(ndcX) > 1.12 || Math.abs(ndcY) > 1.12) return { x: -999, y: -999, visible: false };
  return { x: (ndcX * 0.5 + 0.5) * vw, y: (-ndcY * 0.5 + 0.5) * vh, visible: true };
}

function initSpeedometerDial(isIce: boolean): void {
  const startDeg = -135;
  const endDeg = 135;
  const polar = (r: number, deg: number): [string, string] => {
    const rad = (deg * Math.PI) / 180;
    return [(120 + r * Math.sin(rad)).toFixed(2), (120 - r * Math.cos(rad)).toFixed(2)];
  };
  const arcPath = (r: number, a0: number, a1: number): string => {
    const p0 = polar(r, a0);
    const p1 = polar(r, a1);
    return `M${p0[0]} ${p0[1]}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p1[0]} ${p1[1]}`;
  };
  $("rpmT")?.setAttribute("d", arcPath(86, startDeg, endDeg));
  $("rpm")?.setAttribute("d", arcPath(86, startDeg, endDeg));
  $("red")?.setAttribute("d", arcPath(86, startDeg + ((endDeg - startDeg) * 8) / 9, endDeg));
  $("nosT")?.setAttribute("d", arcPath(110, -160, -95));
  $("nos")?.setAttribute("d", arcPath(110, -160, -95));
  const ticksEl = $("ticks");
  if (!ticksEl) return;
  let svg = "";
  const max = isIce ? 9000 : 100;
  const stepV = isIce ? 500 : 5;
  for (let v = 0; v <= max; v += stepV) {
    const deg = startDeg + ((endDeg - startDeg) * v) / max;
    const major = isIce ? v % 1000 === 0 : v % 25 === 0;
    const pInner = polar(major ? 74 : isIce ? 77 : 78, deg);
    const pOuter = polar(81, deg);
    svg += `<line class="tick${major ? "" : " min"}" x1="${pInner[0]}" y1="${pInner[1]}" x2="${pOuter[0]}" y2="${pOuter[1]}"/>`;
    if (major) {
      const pNum = polar(isIce ? 64 : 63, deg);
      svg += `<text class="num${isIce && v >= 8000 ? " r" : ""}" x="${pNum[0]}" y="${pNum[1]}">${isIce ? v / 1000 : v}</text>`;
    }
  }
  const nosDot = polar(110, -165);
  svg += `<circle class="nosI" cx="${nosDot[0]}" cy="${nosDot[1]}" r="3.2"/>`;
  ticksEl.innerHTML = svg;
  document.body.classList.toggle("ice", isIce);
}

/** Every runtime handle the presentation writes, looked up once per scene mount (weather changes remount the scene). */
function bindNodes(app: ReturnType<typeof createAuraApp>, sky: WeatherPreset) {
  const req = (id: string): AuraRuntimeNodeHandle => app.nodes.require(id);
  const nodes = {
    cars: Object.fromEntries(PLAYABLE_IDS.map((id) => [id, req(`player-car-${id}`)])) as Record<PlayableCarId, AuraRuntimeNodeHandle>,
    strips: ROAD_STRIPS.map((strip) => ({ ...strip, h: req(strip.id) })),
    dashes: req("sf-dashes"),
    roadPatches: req("sf-road-patches"),
    roadJoints: req("sf-road-joints"),
    crossRoads: req("sf-cross-roads"),
    crosswalks: req("sf-crosswalks"),
    manholes: req("sf-manholes"),
    wires: req("sf-catenary-wires"),
    spans: req("sf-catenary-spans"),
    parked: PARKED.map((_, k) => req(`sf-parked-${k}`)),
    signPlates: req("sf-sign-plates"),
    signs: new Map(DISTRICTS.flatMap((_, d) => Array.from({ length: SIGN_SLOTS }, (_, slot) => [signNodeId(d, slot), req(signNodeId(d, slot))] as const))),
    signalPoles: req("sf-signal-poles"),
    signalArms: req("sf-signal-arms"),
    signalLights: req("sf-signal-lights"),
    lampPoles: req("sf-lamp-poles"),
    lampGlobes: req("sf-lamp-globes"),
    trunks: req("sf-tree-trunks"),
    crowns: req("sf-tree-crowns"),
    ribbons: req("route-ribbons"),
    tailLamps: req("player-tail-lamps"),
    sodium: sodiumPointIds(SKY_LOOKS[sky]).map((id) => app.nodes.require(id)),
    headlights: HEADLIGHT_IDS.map((id) => (app.nodes.has(id) ? app.nodes.require(id) : null)),
    buildings: Array.from({ length: BUILDING_PAIRS }, (_, i) => {
      const left = req(`sf-bldg-l-${i}`).setRotation(0, Math.PI / 2, 0);
      const right = req(`sf-bldg-r-${i}`).setRotation(0, -Math.PI / 2, 0);
      return { left, right, xL: buildingLayoutLeft(i).centerX, xR: buildingLayoutRight(i).centerX };
    }),
    beaconRing: req("taxi-beacon-ring"),
    beaconDisc: req("taxi-beacon-disc"),
    beaconBeam: req("taxi-beacon-beam"),
    beaconCore: req("taxi-beacon-core"),
    passengerBody: req("taxi-passenger-body"),
    passengerHead: req("taxi-passenger-head"),
    passengerArm: req("taxi-passenger-arm"),
    users: [...Array.from({ length: TRAFFIC_COUNT }, (_, i) => req(`traffic-${i}`)), ...RIVALS.map((_, k) => req(`rival-car-${k}`))]
  };
  return nodes;
}

async function bootGridDispatch(): Promise<void> {
  const canvas = $<HTMLCanvasElement>("c");
  if (!canvas) throw new Error("Missing #c canvas element for Grid Dispatch.");
  const params = new URLSearchParams(window.location.search);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const motionOk = (): boolean => !(reducedMotion?.matches ?? false);
  // GD-21: Marine dusk is the boot sky; `?sky=noon|dusk|golden|fog|night` boots another row (captures, deep links).
  let weather: WeatherPreset = skyFromParam(params.get("sky"));

  await probeBuildingModels();
  // GU47(E-D): `qualityRebuild.flags` is typed `readonly string[]` but createAuraApp hands it to resolveQrFlags, which
  // takes the record form (QrFlagInput); drop the cast once the option type is widened (lane report handoff).
  const auraApp = createAuraApp(canvas, { scene: buildGridDispatchScene(weather, { motionOk: motionOk() }), renderer: GRID_DISPATCH_RENDERER, qualityRebuild: { flags: GRID_DISPATCH_FLAGS as unknown as readonly string[] } });
  installSafetyNet({ safety: { selfHeal: false, panel: "query" }, app: auraApp });
  let N = bindNodes(auraApp, weather);
  // GD-05/GD-09: the sensor pass (marine deck aloft + LiDAR scan pulse); registered once, it survives sky remounts.
  const sensor = installSensorPass(auraApp, SKY_LOOKS[weather]);
  /** Low post tier (phones, E-G post-only tier): the scan ring runs at half strength. Read once the renderer is up. */
  let lowTier = false;
  let presentClock = 0;
  /**
   * GD-08: tone mapping and exposure per sky, set after every setScene (AgX on Marine dusk). AgX is in the renderer's
   * operator set; where setOutput cannot reach the output pass (direct render path) the default ACES applies: that is
   * the fallback. The engine's A/B query (`?aura3d-tonemap=` / `?tm=`) keeps its operator: only the exposure is set then.
   */
  const tonemapQuery = params.has("aura3d-tonemap") || params.has("tm");
  const applySkyOutput = (): void => {
    const out = skyOutput(SKY_LOOKS[weather]);
    auraApp.setOutput?.(tonemapQuery ? { exposure: out.exposure } : out);
  };
  applySkyOutput();

  // ---------------------------------------------------------------- simulation
  const hitStop = createHitStop();
  const cameraShake = createCameraShake({ maxOffset: 0.4 });
  // GD-14: runtime VFX pack (E-F registerPreset). Sim callbacks queue world-space shots; present() fires them in view
  // space, so a burst lands where the street is drawn this frame.
  installGridVfx(auraApp.effects);
  const vfx = createGridVfxQueue();
  /** GD-15 looping headlight motes (one handle; `sky` and `lowTier` say which spec it was spawned with). */
  /** GD-17: the boot intro owns the camera; rival tags (projected with the scene camera) hide meanwhile. */
  let introPlaying = false;
  const motes: { handle: { stop(o?: { immediate?: boolean }): void; setPosition(p: AuraVec3): void } | null; sky: WeatherPreset | null; lowTier: boolean; motionOk: boolean } = { handle: null, sky: null, lowTier: false, motionOk: true };
  let audio: ReturnType<typeof createGridAudio> | null = null;
  const contacts = createTrafficContacts(
    ROAD_USER_COUNT,
    {
      hitStop,
      // Reduced motion: the shake still runs but its offset is never applied (see present()).
      shake: cameraShake,
      cue: (_name, gain) => audio?.play("collision", gain),
      cueName: "collision",
      particles: (burst) => vfx.impact(burst),
      fullSpeed: 20
    },
    { footprints: roadUserFootprints() }
  );
  const storage = (() => { try { return window.localStorage; } catch { return null; } })();
  const autoplay = params.get("autoplay") === "1" || params.get("demo") === "1";
  const sim = createSim(contacts, { level: autoplay ? "L5" : "MAN", career: loadCareer(storage) });
  sim.onCareer = (c) => saveCareer(storage, c);
  const S = sim.state;
  // Portrait phones start in the far chase camera so the car does not fill the screen.
  let camMode: CameraMode = window.innerWidth < window.innerHeight * 0.8 ? 1 : 0;
  let useMph = true;
  let ready = false;
  let remounting = false;
  let framesRendered = 0;

  // ---------------------------------------------------------------- input (C3, C9)
  const keysHeld = new Set<string>();
  const touch = mountTouchPads(document, { coarsePointer: window.matchMedia?.("(pointer: coarse)")?.matches ?? false });
  const currentInput = (): DriveInput => ({
    throttle: keysHeld.has("KeyW") || keysHeld.has("ArrowUp") || touch.held("throttle"),
    brake: keysHeld.has("KeyS") || keysHeld.has("ArrowDown") || keysHeld.has("Space") || touch.held("brake"),
    left: keysHeld.has("KeyA") || keysHeld.has("ArrowLeft") || touch.held("left"),
    right: keysHeld.has("KeyD") || keysHeld.has("ArrowRight") || touch.held("right"),
    boost: keysHeld.has("ShiftLeft") || keysHeld.has("ShiftRight")
  });
  let qaInput: DriveInput | null = null;
  window.addEventListener("keydown", (ev) => {
    if (isTextEntryTarget(ev.target as HTMLElement | null)) return;
    if (DRIVING_CODES.has(ev.code)) {
      // A focused dock button must not be "clicked" by Space or the arrows while driving.
      ev.preventDefault();
      keysHeld.add(ev.code);
      return;
    }
    if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const carKeys: Record<string, PlayableCarId> = { Digit1: "cruiser", Digit2: "coupe", Digit3: "truck", Digit4: "gt", Digit5: "interceptor" };
    if (ev.code === "KeyI") setAutopilotLevel(nextAssist(S.level));
    else if (ev.code === "KeyC") setCameraMode(((camMode + 1) % 4) as CameraMode);
    else if (ev.code === "KeyT") void setWeather(nextSky(weather));
    else if (ev.code === "KeyU") toggleUnits();
    else if (ev.code === "KeyF") applyEvents(sim.skipFare());
    else if (ev.code === "KeyR" && S.phase === "results") retry();
    else if (ev.code === "Escape") $("mpPanel")?.classList.remove("on");
    else if (carKeys[ev.code]) selectPlayableVehicle(carKeys[ev.code]!);
  });
  window.addEventListener("keyup", (ev) => {
    if (DRIVING_CODES.has(ev.code)) ev.preventDefault();
    keysHeld.delete(ev.code);
  });
  const releaseAll = (): void => keysHeld.clear();
  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });

  audio = createGridAudio(window, (muted) => {
    const btn = $("muteBtn");
    if (btn) {
      btn.setAttribute("aria-pressed", muted ? "true" : "false");
      btn.textContent = muted ? "Sound off" : "Sound on";
    }
  });

  // ---------------------------------------------------------------- HUD
  const formatDist = (meters: number): string => {
    const d = Math.max(0, meters);
    if (useMph) {
      const feet = d * 3.28084;
      return feet >= 528 ? `${(d / 1609.34).toFixed(1)} mi` : `${Math.max(10, Math.round(feet / 10) * 10)} ft`;
    }
    return d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(d / 10) * 10)} m`;
  };
  const hud = createHud({
    formatDist,
    onToggleStyle: () => {
      if (S.ride.state !== "offer") return;
      S.style = S.style === "comfort" ? "street" : "comfort";
      hud.popup(S.style === "street" ? "Street bounty" : "Comfort ride", S.style === "street" ? "Tip grows with the multiplier: near misses raise it, hits lower it" : "Tip grows with comfort: drive smoothly, no hits", S.style === "street" ? "nfs" : "good");
    },
    onRetry: () => retry()
  });

  function applyEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.kind === "popup") hud.popup(e.title, e.detail, e.tone);
      else if (e.kind === "cue") {
        audio?.play(e.name, e.gain);
        if (e.name === "pickup" || e.name === "dropoff") vfx.objective(CURB_BEACON_X, S.ride.beaconZ);
      }
      else if (e.kind === "fare") {
        hud.showSummary(S.ride.fareIndex, e.style, e.outcome, S.ride.comfort, S.ride.multiplier);
        saveCareer(storage, S.career);
      } else if (e.kind === "shiftOver") {
        hud.showResults(S.shift, e.score, e.best, e.newBest);
        setResultsDof(true);
      }
    }
  }

  /** GD-17: depth of field on the results screen (focus on the car); off on reduced motion and when the shift restarts. */
  function setResultsDof(on: boolean): void {
    try {
      if (on && motionOk()) {
        auraApp.post?.setEffect("depthOfField", resultsDof(Math.hypot(SCENE_CAM_POS[0] - carView.x, SCENE_CAM_POS[1] - carView.y, SCENE_CAM_POS[2] - carView.z)));
        auraApp.post?.setEffectEnabled("depthOfField", true);
      } else auraApp.post?.setEffectEnabled("depthOfField", false);
    } catch {
      /* no runtime post control on this path: the results screen stays sharp */
    }
  }

  function retry(): void {
    setResultsDof(false);
    sim.restart();
    presenter.reset();
    hud.hideResults();
    hud.toast("New shift", `${5} fares · ${formatClock(420)} on the clock`);
  }

  function toggleUnits(): void {
    useMph = !useMph;
    const unitEl = $("unit");
    if (unitEl) unitEl.textContent = useMph ? "MPH" : "KM/H";
  }

  /** Material handle of a model node once its GLB has loaded (a read before that is dropped and rebuilt). */
  function modelMaterials(id: string): AuraModelMaterialHandle | undefined {
    let h = auraApp.nodes.get(id) as unknown as { materials?: AuraModelMaterialHandle } | undefined;
    if (h?.materials && h.materials.inspectMaterials().length === 0) {
      delete h.materials;
      h = auraApp.nodes.get(id) as unknown as { materials?: AuraModelMaterialHandle } | undefined;
    }
    const m = h?.materials;
    return m && m.inspectMaterials().length > 0 ? m : undefined;
  }

  /**
   * GD-11: per-material overrides on every car (pearl clearcoat pod, dark glass, black trim; muted clearcoat traffic;
   * steel truck, champagne coupe), replacing the old whole-model setMaterial. Run after ready(), after every remount.
   */
  function applyMaterialOverrides(): void {
    const set = (id: string, o: ReturnType<typeof carMaterialOverrides>): void => { if (o) modelMaterials(id)?.setMaterialOverrides(o); };
    for (const id of PLAYABLE_IDS) set(`player-car-${id}`, carMaterialOverrides(PLAYER_ASSET[id], "player"));
    RIVALS.forEach((r, k) => set(`rival-car-${k}`, carMaterialOverrides(r.asset, "rival", k)));
    TRAFFIC_SPECS.forEach((t, i) => set(`traffic-${i}`, carMaterialOverrides(t.asset, "traffic")));
  }

  /**
   * GD-02: warm facade glow per sky (interim for window maps, see scene.ts windowGlowOverride). Run after ready(): the
   * material handle binds its actor on first read, so a read before the GLB loaded is dropped and rebuilt (the
   * slingshot-siege pattern). Box fallbacks have no materials and are skipped.
   */
  function applyWindowGlow(): void {
    const glow = windowGlowOverride(SKY_LOOKS[weather]);
    for (let i = 0; i < BUILDING_PAIRS; i++) {
      for (const id of [`sf-bldg-l-${i}`, `sf-bldg-r-${i}`]) modelMaterials(id)?.setMaterialOverrides(glow.emissiveIntensity > 0 ? [glow] : []);
    }
  }

  let appliedCar: PlayableCarId | null = null;
  function applyCarVisibility(): void {
    for (const id of PLAYABLE_IDS) {
      if (id !== S.car) N.cars[id].setPosition(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2]).setScale(HIDDEN_SCALE).setVisible(false);
    }
    N.cars[S.car].setScale([1, 1, 1]).setVisible(true);
    appliedCar = S.car;
  }

  function selectPlayableVehicle(carId: PlayableCarId): void {
    sim.setCar(carId);
    const spec = PLAYABLE_FLEET[carId];
    initSpeedometerDial(spec.isIce);
    applyCarVisibility();
    updateModeLabels();
    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-car]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.car === carId);
      btn.setAttribute("aria-pressed", btn.dataset.car === carId ? "true" : "false");
    });
    hud.toast(`Vehicle: ${spec.name}`, `${spec.maker} · ${spec.drive}`);
  }

  function updateModeLabels(): void {
    const level = S.level;
    const label = $("aDAl");
    if (label) label.textContent = level;
    const chip = $("aDA");
    chip?.classList.toggle("drive", isAutonomous(level));
    chip?.classList.toggle("boost", level === "L5 MAX");
    chip?.classList.toggle("take", level === "MAN");
    chip?.setAttribute("aria-label", `Driver assist ${ASSIST[level].dock}. Press to change.`);
    const dockBtn = $("dockAutopilotBtn");
    if (dockBtn) {
      dockBtn.textContent = ASSIST[level].dock;
      dockBtn.classList.toggle("active", level !== "MAN");
    }
    const gmode = $("gmode");
    if (gmode) gmode.textContent = gmodeLabel(level, S.car);
  }

  function setAutopilotLevel(level: AutopilotLevel): void {
    S.level = level;
    S.player.holdLane = S.player.x > 5.4 ? 7.4 : 3.4;
    updateModeLabels();
    hud.toast(`Driver assist: ${ASSIST[level].dock}`, ASSIST[level].hint);
  }

  function setCameraMode(mode: CameraMode): void {
    camMode = mode;
    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-cam]").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.cam) === mode);
      btn.setAttribute("aria-pressed", Number(btn.dataset.cam) === mode ? "true" : "false");
    });
    hud.toast(["Chase camera", "Far chase camera", "Roof sensor camera", "Front bumper camera"][mode]!, "Press C to cycle cameras");
  }

  function syncSkyDock(active: WeatherPreset): void {
    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-tod]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tod === active);
      btn.setAttribute("aria-pressed", btn.dataset.tod === active ? "true" : "false");
    });
  }

  /** A sky preset brings its own look, lights and fog, so changing it remounts the scene (C8). */
  async function setWeather(next: WeatherPreset): Promise<void> {
    if (next === weather || remounting) return;
    weather = next;
    remounting = true;
    syncSkyDock(next);
    $("skyChange")?.classList.add("on");
    auraApp.setScene(buildGridDispatchScene(next, { motionOk: motionOk() }));
    applySkyOutput();
    N = bindNodes(auraApp, next);
    appliedCar = null;
    lastSignalPhase = -1;
    lastBeaconMode = null;
    lastBrakeLamp = null;
    lastHeadlightX = Number.NaN;
    try {
      await Promise.race([auraApp.ready().then(() => { applyWindowGlow(); applyMaterialOverrides(); return warmPrograms(auraApp); }), new Promise((resolve) => setTimeout(resolve, 60_000))]);
    } catch (error) {
      console.error("[grid-dispatch] sky change remount failed; continuing with what rendered", error);
    }
    remounting = false;
    $("skyChange")?.classList.remove("on");
    hud.toast(WEATHER[next].label, "Lights, fog and sky changed together");
  }

  function teleportToRival(k: number): void {
    const u = S.users[TRAFFIC_COUNT + k];
    if (!u) return;
    u.z = S.player.z - 18;
    if (u.direction === 1) S.player.x = u.laneX;
    presenter.reset();
    hud.toast(`Driving with ${RIVALS[k]!.handle}`, `${RIVALS[k]!.carLabel} · AI rival`);
  }

  function renderRivalList(): void {
    const listEl = $("mpPeerList");
    if (!listEl) return;
    const p = S.player;
    listEl.innerHTML = RIVALS.map((r, k) => {
      const u = S.users[TRAFFIC_COUNT + k]!;
      const d = Math.round(Math.hypot(u.laneX - p.x, u.z - p.z));
      return `<li><b style="color:${r.accent}">${r.handle}</b><small>${r.carLabel} · ${d} m</small><button type="button" data-goto-rival="${k}">Drive here</button></li>`;
    }).join("");
  }

  // Dock, panel and HUD buttons
  document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-car]").forEach((btn) =>
    btn.addEventListener("click", () => selectPlayableVehicle((btn.dataset.car as PlayableCarId) || "cruiser"))
  );
  document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-cam]").forEach((btn) =>
    btn.addEventListener("click", () => setCameraMode(clamp(Number(btn.dataset.cam ?? 0), 0, 3) as CameraMode))
  );
  document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-tod]").forEach((btn) =>
    btn.addEventListener("click", () => void setWeather((btn.dataset.tod as WeatherPreset) || BOOT_SKY))
  );
  $("dockAutopilotBtn")?.addEventListener("click", () => setAutopilotLevel(nextAssist(S.level)));
  $("aDA")?.addEventListener("click", () => setAutopilotLevel(nextAssist(S.level)));
  $("bNextFare")?.addEventListener("click", () => applyEvents(sim.skipFare()));
  $("unit")?.addEventListener("click", toggleUnits);
  $("muteBtn")?.addEventListener("click", () => audio?.toggleMute());
  const mpPanel = $("mpPanel");
  $("mpChip")?.addEventListener("click", () => {
    renderRivalList();
    mpPanel?.classList.toggle("on");
  });
  $("mpCloseBtn")?.addEventListener("click", () => mpPanel?.classList.remove("on"));
  $("mpPeerList")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-goto-rival]");
    if (btn) teleportToRival(Number(btn.dataset.gotoRival ?? 0));
  });
  const shareUrl = `${window.location.origin}${window.location.pathname}`;
  const shareInput = $<HTMLInputElement>("mpInviteInput");
  if (shareInput) shareInput.value = shareUrl;
  $("mpCopyBtn")?.addEventListener("click", async () => {
    let copied = false;
    try {
      await navigator.clipboard?.writeText(shareUrl);
      copied = Boolean(navigator.clipboard);
    } catch { /* clipboard blocked */ }
    if (!copied) shareInput?.select();
    hud.toast(copied ? "Game link copied" : "Copy the selected link", shareUrl);
  });
  // Floating rival tags: click drives next to that rival
  const tagsContainer = $("mpTags");
  const tagEls = RIVALS.map((r, k) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "mpTag";
    el.style.borderColor = r.accent;
    el.style.color = r.accent;
    el.innerHTML = `<b>${r.handle}</b><small>${r.carLabel} · <span>${r.piClass}</span></small><i></i>`;
    el.setAttribute("aria-label", `AI rival ${r.handle}, ${r.carLabel}. Drive next to it.`);
    el.addEventListener("click", () => teleportToRival(k));
    tagsContainer?.appendChild(el);
    return { el, dist: el.querySelector("i") as HTMLElement, chip: false, w: 0, h: 0, shown: false };
  });

  // ---------------------------------------------------------------- presentation
  interface Pose { px: number; pz: number; yaw: number; roll: number; pitch: number; uz: number[]; ux: number[] }
  const snapshot = (): Pose => ({ px: S.player.x, pz: S.player.z, yaw: S.player.yaw, roll: S.player.roll, pitch: S.player.pitch, uz: S.users.map((u) => u.z), ux: S.users.map((u) => u.laneX) });
  const presenter = createFixedStepPresenter<Pose>({
    snapshot,
    blend: (a, b, t) => ({
      px: lerp(a.px, b.px, t),
      pz: lerp(a.pz, b.pz, t),
      yaw: lerp(a.yaw, b.yaw, t),
      roll: lerp(a.roll, b.roll, t),
      pitch: lerp(a.pitch, b.pitch, t),
      // a respawn jumps tens of metres: show the new place instead of sliding through the street
      uz: b.uz.map((z, i) => (Math.abs(z - (a.uz[i] ?? z)) > 30 ? z : lerp(a.uz[i] ?? z, z, t))),
      ux: b.ux
    })
  });

  const loop = createFixedStepLoop({
    stepSeconds: STEP,
    maxFrameSeconds: 0.1,
    isActive: () => ready,
    step: () => {
      // While a sky change remounts the scene the world holds still, but frames keep presenting so warmPrograms sees the street.
      if (remounting) return;
      // QA runs advance many steps between two presented frames: run the hit-stop clock per step so a contact cannot freeze them
      if (qaInput) hitStop.update(STEP);
      const events = sim.step(STEP * hitStop.timeScale(), qaInput ?? currentInput());
      applyEvents(events);
      presenter.afterStep();
    },
    render: (frameSeconds) => present(frameSeconds)
  });

  let lastSignalPhase = -1;
  /** GD-03: last brake-lamp state written to the lamp material (it changes only when the sim flag flips). */
  let lastBrakeLamp: boolean | null = null;
  /** GD-03: view x the headlight spots were last aimed at (setLight only when the car moved across lanes). */
  let lastHeadlightX = Number.NaN;
  let lastBeaconMode: "pickup" | "dropoff" | null = null;
  let hudClock = 0;
  let avoidRects: Array<{ l: number; r: number; t: number; b: number }> = [];
  const spdEl = $("spd");
  const gearEl = $("gear");
  const rpmPath = $("rpm");
  const nosPath = $("nos");
  const brakeCueEl = $("brakeCue");
  const wrongWayEl = $("wrongWay");
  const miniCanvas = $<HTMLCanvasElement>("miniC");
  const miniCtx = miniCanvas?.getContext("2d") ?? null;
  const rivalAccents = RIVALS.map((r) => r.accent);
  const carSizes = Object.fromEntries(PLAYABLE_IDS.map((id) => [id, fittedSize(PLAYABLE_FLEET[id].bounds, PLAYABLE_FLEET[id].maxDim)])) as Record<PlayableCarId, ReturnType<typeof fittedSize>>;
  let shakeNow = { x: 0, y: 0 };
  /** GD-17: last FOV kick and roll handed to the camera controller (re-set only on change); presented FOV for projections. */
  let lastFovKick = 0;
  let lastRoll = 0;
  let presentedFov = SCENE_CAM_FOV_DEG;
  /** View-space box of the player car this frame, for the QA car crop. */
  let carView = { x: 0, y: 0, z: CAR_DRAW_Z, width: 2, height: 1.5, length: 4.6 };
  /** QA review only: extra yaw on the player car and every road user so each side of a model can be framed. */
  let qaYawAdd = 0;

  function beaconMaterials(mode: "pickup" | "dropoff"): void {
    if (mode === lastBeaconMode) return;
    lastBeaconMode = mode;
    const col = mode === "pickup" ? "#3fd6c6" : "#ffb347";
    const coreCol = mode === "pickup" ? "#a5f3fc" : "#fde68a";
    N.beaconRing.setMaterial(material.emissive({ color: col, emissive: col, emissiveIntensity: 2.2 }));
    N.beaconDisc.setMaterial(material.emissive({ color: col, emissive: col, emissiveIntensity: 1.45 }));
    N.beaconBeam.setMaterial(material.emissive({ color: col, emissive: col, emissiveIntensity: 1.35 }));
    N.beaconCore.setMaterial(material.emissive({ color: "#ffffff", emissive: coreCol, emissiveIntensity: 2.4 }));
    N.ribbons.setMaterial(material.emissive({ color: col, emissive: col, emissiveIntensity: 1.9 }));
  }

  /** Read phase of the nameplate layout: panel rectangles, refreshed with the 10 Hz HUD tick (no reads in the write loop). */
  function readAvoidRects(): void {
    avoidRects = [];
    for (const id of ["taxiCard", "taxiTrip", "taxiPen", "taxiHint", "topRightCluster", "where", "taxiSum", "wrongWay", "bzStrip"]) {
      const el = $(id);
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width >= 4 && r.height >= 4) avoidRects.push({ l: r.left, r: r.right, t: r.top, b: r.bottom });
    }
    for (const t of tagEls) {
      if (!t.shown) continue;
      t.w = t.el.offsetWidth || t.w;
      t.h = t.el.offsetHeight || t.h;
    }
  }

  function present(frameSeconds: number): void {
    framesRendered += 1;
    hitStop.update(frameSeconds);
    if (appliedCar !== S.car) applyCarVisibility();
    const live = S.phase === "driving" && !loop.manual;
    const pose = presenter.present(loop, live);
    const shake = motionOk() ? cameraShake.update(frameSeconds) : { x: 0, y: 0 };
    shakeNow = shake;
    const size = carSizes[S.car];
    const camOff = cameraOffsets(size)[camMode];
    // Roof and bumper cameras ride on the car, so they follow it fully across lanes.
    const follow = camMode >= 2 ? 1 : viewFollowFor((window.innerWidth || 1280) / Math.max(1, window.innerHeight || 720));
    const rx = (wx: number) => viewX(wx, pose.px, shake.x, follow);
    const ry = (wy: number) => wy + camOff.y + shake.y;
    const rz = (wz: number) => wz - pose.pz + camOff.z;
    const pos = (x: number, y: number, z: number): AuraTransformSpec => ({ position: [x, y, z] });

    N.cars[S.car].setPosition(rx(pose.px), ry(0), CAR_DRAW_Z + camOff.z).setRotation(pose.pitch, pose.yaw + qaYawAdd, pose.roll);
    // GD-17: speed FOV kick and lane roll on the fixed scene camera; off on reduced motion.
    const feel = cameraFeel({ speed: S.player.speed, maxSpeed: PLAYABLE_FLEET[S.car].maxSpeedMps, steer: S.player.steer, motionOk: motionOk() });
    try {
      if (feel.fovKickDeg !== lastFovKick) { lastFovKick = feel.fovKickDeg; auraApp.camera?.fovKick.set("speed", feel.fovKickDeg, FOV_KICK_HALFLIFE_S); }
      if (feel.roll !== lastRoll) { lastRoll = feel.roll; auraApp.camera?.setRoll(feel.roll, { halflife: ROLL_HALFLIFE_S }); }
      // An unarmed controller presents its default pose; trust only a FOV inside the kick range.
      const fov = auraApp.camera?.presented().fov ?? SCENE_CAM_FOV_DEG;
      presentedFov = fov >= SCENE_CAM_FOV_DEG - 0.5 && fov <= SCENE_CAM_FOV_DEG + FOV_KICK_MAX_DEG + 0.5 ? fov : SCENE_CAM_FOV_DEG;
    } catch {
      /* camera controller not mounted: the scene camera stays at 56 deg */
      presentedFov = SCENE_CAM_FOV_DEG;
    }
    // Sensor pass: the deck follows the eye height (roof and bumper cameras), the ring leaves the car (presentation clock).
    presentClock += frameSeconds;
    const skyLook = SKY_LOOKS[weather];
    sensor.update({
      look: skyLook,
      pulse: scanPulseAt({ t: presentClock, motionOk: motionOk(), roofCam: camMode === 2, lowTier, skyStrength: skyLook.scanStrength }),
      eyeHeight: SCENE_CAM_POS[1] - ry(0),
      fovDeg: presentedFov,
      carX: rx(pose.px),
      carZ: CAR_DRAW_Z + camOff.z
    });
    // Road strips follow the same lateral shift as everything else, so the car stays in its lane (C2).
    for (const strip of N.strips) strip.h.setPosition(rx(strip.x), ry(strip.y), -160 + camOff.z);

    const dashBaseZ = Math.floor(pose.pz / DASH_STRIDE_Z) * DASH_STRIDE_Z + DASH_STRIDE_Z;
    N.dashes.setInstances(DASH_LINES_X.flatMap((lx) => Array.from({ length: DASH_ROWS }, (_, i) => pos(rx(lx), ry(0.018), rz(dashBaseZ - i * DASH_STRIDE_Z)))));
    // GD-13: road bays recycle on the same stride (patches on alternating bays, a sealed joint at each bay).
    const tiles = roadTileLayout(dashBaseZ);
    N.roadPatches.setInstances(tiles.patches.map(([x, z]) => pos(rx(x), ry(0.004), rz(z))));
    N.roadJoints.setInstances(tiles.joints.map((z) => pos(rx(0), ry(0.005), rz(z))));

    if (S.signal !== lastSignalPhase) {
      lastSignalPhase = S.signal;
      const c = S.signal === 0 ? "#43d17a" : S.signal === 1 ? "#ffb347" : "#ff4a3d";
      N.signalLights.setMaterial(material.emissive({ color: c, emissive: c, emissiveIntensity: 2.2 }));
    }
    const interBaseZ = Math.floor(pose.pz / INTERSECTION_STRIDE_Z) * INTERSECTION_STRIDE_Z;
    const iz = Array.from({ length: INTERSECTION_COUNT }, (_, i) => rz(interBaseZ - i * INTERSECTION_STRIDE_Z));
    N.crossRoads.setInstances(iz.map((z) => pos(rx(0), ry(0.01), z)));
    N.crosswalks.setInstances(iz.flatMap((z) => [pos(rx(0), ry(0.022), z - 8.2), pos(rx(0), ry(0.022), z + 8.2)]));
    // GD-15: manhole covers past each crossing; steam puffs only while the car is nearly stopped (see MANHOLES).
    const manholes = manholeLayout(Array.from({ length: INTERSECTION_COUNT }, (_, i) => interBaseZ - i * INTERSECTION_STRIDE_Z));
    N.manholes.setInstances(manholes.map(([x, z]) => pos(rx(x), ry(0.012), rz(z))));
    // GD-19: parked cars on the cross streets and the street-name sign at each crossing (text = the HUD cross street).
    const interZs = Array.from({ length: INTERSECTION_COUNT }, (_, i) => interBaseZ - i * INTERSECTION_STRIDE_Z);
    N.parked.forEach((h, k) => h.setInstances(parkedLayout(k, interZs).map((c) => ({ position: [rx(c.x), ry(0), rz(c.z)], rotation: [0, c.yaw, 0] }) as AuraTransformSpec)));
    const signs = signAssignments(interZs);
    N.signPlates.setInstances(signs.map(([, z]) => pos(rx(SIGN.x), ry(SIGN.y), rz(z + SIGN.dz) - 0.04)));
    const shown = new Set<string>();
    for (const [id, z] of signs) {
      shown.add(id);
      N.signs.get(id)?.setPosition(rx(SIGN.x), ry(SIGN.y - SIGN.size * 0.35), rz(z + SIGN.dz)).setVisible(true);
    }
    for (const [id, h] of N.signs) if (!shown.has(id)) h.setVisible(false);
    vfx.steam({ dt: frameSeconds, speed: S.phase === "driving" ? S.player.speed : 0, z: pose.pz, manholes });
    N.signalPoles.setInstances(iz.flatMap((z) => [pos(rx(11.4), ry(3.4), z - 9.2), pos(rx(-11.4), ry(3.4), z - 9.2)]));
    N.signalArms.setInstances(iz.flatMap((z) => [pos(rx(8.6), ry(6.5), z - 9.2), pos(rx(-8.6), ry(6.5), z - 9.2)]));
    N.signalLights.setInstances(iz.flatMap((z) => [pos(rx(6.4), ry(6.25), z - 9.1), pos(rx(-6.4), ry(6.25), z - 9.1)]));

    const bldgBaseZ = Math.floor(pose.pz / BUILDING_STRIDE_Z) * BUILDING_STRIDE_Z + BUILDING_STRIDE_Z;
    N.buildings.forEach((b, i) => {
      const bz = rz(bldgBaseZ - i * BUILDING_STRIDE_Z);
      b.left.setPosition(rx(-b.xL), ry(0), bz);
      b.right.setPosition(rx(b.xR), ry(0), bz);
    });
    const lampBaseZ = Math.floor(pose.pz / LAMP_STRIDE_Z) * LAMP_STRIDE_Z + LAMP_STRIDE_Z;
    const lz = Array.from({ length: LAMP_PAIRS }, (_, i) => rz(lampBaseZ - i * LAMP_STRIDE_Z));
    N.lampPoles.setInstances(lz.flatMap((z) => [pos(rx(-11.2), ry(3.1), z), pos(rx(11.2), ry(3.1), z)]));
    N.lampGlobes.setInstances(lz.flatMap((z) => [pos(rx(-10.8), ry(6.25), z), pos(rx(10.8), ry(6.25), z)]));
    // GD-02: sodium points ride on the nearest lamp globes in front of the camera.
    if (N.sodium.length) nearestLamps(lz, N.sodium.length).forEach(([x, z], i) => N.sodium[i]!.setLight?.({ position: [rx(x), ry(6.1), z] }));
    // GD-19: trolley catenary: wires along the avenue (like the road strips) and a span at every lamp pair.
    N.wires.setInstances(CATENARY.wiresX.map((x) => pos(rx(x), ry(CATENARY.wireY), -160 + camOff.z)));
    N.spans.setInstances(lz.map((z) => pos(rx(0), ry(CATENARY.spanY), z)));
    N.trunks.setInstances(lz.map((z) => pos(rx(12.2), ry(1.6), z - 14)));
    N.crowns.setInstances(lz.map((z) => pos(rx(12.2), ry(4.1), z - 14)));

    // Beacon, passenger and route ribbon
    const r = S.ride;
    beaconMaterials(r.state === "offer" || r.state === "boarding" ? "pickup" : "dropoff");
    const t = S.time;
    const pulse = motionOk() ? 0.5 + 0.5 * Math.sin(t * 3.8) : 0.5;
    const bx = rx(CURB_BEACON_X);
    const bz = rz(r.beaconZ);
    const beaconOn = r.state !== "summary" && S.phase === "driving";
    const ringScale = beaconOn ? 1 + 0.08 * pulse : 0.0001;
    N.beaconRing.setPosition(bx, ry(0.08), bz).setRotation(Math.PI * 0.5, motionOk() ? t * 1.4 : 0, 0).setScale([ringScale, ringScale, 1]).setVisible(beaconOn);
    N.beaconDisc.setPosition(bx, ry(0.04), bz).setVisible(beaconOn);
    N.beaconBeam.setPosition(bx, ry(17), bz).setScale([0.92 + pulse * 0.14, 1, 0.92 + pulse * 0.14]).setVisible(beaconOn);
    N.beaconCore.setPosition(bx, ry(18), bz).setVisible(beaconOn);
    const showPassenger = r.state === "offer" || r.state === "boarding" || r.state === "alighting";
    if (showPassenger) {
      const walk = r.state === "boarding" ? clamp(r.timer / 1.5, 0, 1) : 0;
      const pvX = rx(lerp(11.35, CURB_BEACON_X + 0.85, walk));
      const wave = motionOk() ? Math.sin(t * 8.5) * 0.45 : 0;
      N.passengerBody.setPosition(pvX, ry(0.88), bz).setScale([1, 1, 1]).setVisible(true);
      N.passengerHead.setPosition(pvX, ry(1.76), bz).setScale([1, 1, 1]).setVisible(true);
      N.passengerArm.setPosition(pvX - 0.28, ry(1.55), bz).setRotation(0, 0, 0.55 + wave).setScale([1, 1, 1]).setVisible(true);
    } else {
      N.passengerBody.setScale(HIDDEN_SCALE).setVisible(false);
      N.passengerHead.setScale(HIDDEN_SCALE).setVisible(false);
      N.passengerArm.setScale(HIDDEN_SCALE).setVisible(false);
    }
    const dzBeacon = pose.pz - r.beaconZ;
    const targetX = r.state === "ride" || r.state === "offer" ? (dzBeacon < 58 ? KERB_STOP_X : S.player.holdLane) : S.player.holdLane;
    N.ribbons.setInstances(
      Array.from({ length: PATH_RIBBON_COUNT }, (_, i) => {
        const frac = (i + 1) / PATH_RIBBON_COUNT;
        // on-car cameras sit at the nose: start the ribbon ahead of it so the first slab does not fill the view
        const segZ = pose.pz - 5.5 - i * 5.4 - (camMode >= 2 ? size.length / 2 + 6 : 0);
        const segX = lerp(pose.px, targetX, frac * 0.85);
        const nextX = lerp(pose.px, targetX, Math.min(1, (i + 2) / PATH_RIBBON_COUNT));
        const shimmer = motionOk() ? 0.82 + 0.24 * Math.sin(t * 7 - i * 0.7) : 1;
        return { position: [rx(segX), ry(0.032), rz(segZ)], rotation: [0, Math.atan2(-(nextX - segX), 5.4), 0], scale: [shimmer, 1, 1] } as AuraTransformSpec;
      })
    );

    // Traffic and rivals
    S.users.forEach((u, i) => {
      const vz = rz(pose.uz[i] ?? u.z);
      const visible = vz < 18 && vz > -220;
      N.users[i]!.setPosition(rx(u.laneX), ry(0), vz).setRotation(0, (u.direction === 1 ? 0 : Math.PI) + qaYawAdd, 0).setScale(visible ? [1, 1, 1] : HIDDEN_SCALE).setVisible(visible);
    });

    // GD-03: tail and brake lamps at the rear corners; headlight spots follow the car across lanes.
    const carX = rx(pose.px);
    const carZ = CAR_DRAW_Z + camOff.z;
    carView = { x: carX, y: ry(0), z: carZ, width: size.width, height: size.height, length: size.length };
    const lampY = ry(size.height * TAIL_LAMP.heightFrac);
    const rearZ = carZ + size.length / 2;
    N.tailLamps.setInstances([pos(carX - size.width * TAIL_LAMP.spreadFrac, lampY, rearZ), pos(carX + size.width * TAIL_LAMP.spreadFrac, lampY, rearZ)]);
    if (S.brakeLamp !== lastBrakeLamp) {
      lastBrakeLamp = S.brakeLamp;
      N.tailLamps.setMaterial(tailLampMaterial(skyLook, S.brakeLamp));
    }
    if (Math.abs(carX - lastHeadlightX) > 0.08) {
      lastHeadlightX = carX;
      N.headlights.forEach((h, i) => {
        const hp = headlightPose(i === 0 ? -1 : 1, carX, carZ - size.length / 2, ry(0));
        const d = [hp.target[0] - hp.position[0], hp.target[1] - hp.position[1], hp.target[2] - hp.position[2]] as const;
        const l = Math.hypot(d[0], d[1], d[2]) || 1;
        h?.setLight?.({ position: hp.position, direction: [d[0] / l, d[1] / l, d[2] / l] });
      });
    }

    // GD-15: headlight-cone motes ride ahead of the nose (dusk, fog, night); respawned after a sky, tier or reduced-motion change.
    if (motes.sky !== weather || motes.lowTier !== lowTier || motes.motionOk !== motionOk()) {
      motes.handle?.stop({ immediate: true });
      const spec = headlightMotesSpec({ headlights: skyLook.street.headlights, motionOk: motionOk(), lowTier });
      motes.handle = spec ? auraApp.effects?.spawn(spec, motesAnchor(carX, carZ - size.length / 2, ry(0))) ?? null : null;
      motes.sky = weather;
      motes.lowTier = lowTier;
      motes.motionOk = motionOk();
    }
    motes.handle?.setPosition(motesAnchor(carX, carZ - size.length / 2, ry(0)));

    // GD-14 runtime VFX: queued impact and objective shots, plus the night tyre spray behind the rear wheels.
    vfx.tyres({ dt: frameSeconds, wet: skyLook.street.drizzle && S.phase === "driving", speed: S.player.speed, x: pose.px, z: pose.pz, width: size.width, length: size.length });
    const fire = (shot: GridVfxShot): void => {
      auraApp.effects?.burst(shot.kind, [rx(shot.at[0]), ry(shot.at[1]), rz(shot.at[2])], shot.options);
    };
    vfx.drain({ motionOk: motionOk(), lowTier }, fire);

    // Rival tags (C15): the two nearest rivals get a full tag, the rest a small chip; layout reads happen at 10 Hz only (C11).
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const rivalUsers = S.users.slice(TRAFFIC_COUNT);
    const dists = rivalUsers.map((u) => Math.hypot(u.laneX - S.player.x, u.z - S.player.z));
    const nearest = new Set(nearestIndices(dists, 2));
    const placed: Array<{ l: number; r: number; t: number; b: number }> = [];
    rivalUsers.forEach((u, k) => {
      const tag = tagEls[k]!;
      const vz = rz(pose.uz[TRAFFIC_COUNT + k] ?? u.z);
      const proj = projectViewPointToScreen([rx(u.laneX), ry(RIVALS[k]!.isCableCar ? 3.9 : 2.3), vz], vw, vh, presentedFov);
      if (!proj.visible || S.phase !== "driving" || introPlaying) {
        if (tag.shown) { tag.el.style.display = "none"; tag.shown = false; }
        return;
      }
      const chip = !nearest.has(k);
      if (!tag.shown) { tag.el.style.display = "flex"; tag.shown = true; }
      if (chip !== tag.chip) { tag.el.classList.toggle("chip", chip); tag.chip = chip; tag.w = 0; }
      const w = tag.w || (chip ? 64 : 120);
      const h = tag.h || (chip ? 22 : 44);
      const x = clamp(proj.x, w / 2 + 6, vw - w / 2 - 6);
      let y = clamp(proj.y, h + 6, vh - 6);
      let leader = 0;
      for (let pass = 0; pass < 3; pass++) {
        const hit = [...avoidRects, ...placed].find((q) => x + w / 2 > q.l - 4 && x - w / 2 < q.r + 4 && y > q.t - 4 && y - h < q.b + 4);
        if (!hit) break;
        const ny = Math.min(hit.b + 8 + h, vh - 6);
        if (ny === y) break;
        leader += Math.abs(ny - y);
        y = ny;
      }
      placed.push({ l: x - w / 2, r: x + w / 2, t: y - h, b: y });
      tag.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      if (leader > 2) {
        tag.el.dataset.leader = y > proj.y ? "up" : "down";
        tag.el.style.setProperty("--leader-h", `${Math.min(leader, 160).toFixed(0)}px`);
      } else delete tag.el.dataset.leader;
    });

    // Dial, every frame
    const p = S.player;
    const spec = PLAYABLE_FLEET[S.car];
    const displaySpeed = Math.round(p.speed * (useMph ? 2.23694 : 3.6));
    if (spdEl) spdEl.textContent = String(displaySpeed).padStart(3, "0");
    if (gearEl) gearEl.textContent = spec.isIce ? (p.speed < 0.3 ? "N" : String(clamp(Math.ceil(displaySpeed / 18), 1, 8))) : p.speed < 0.3 ? "P" : "D";
    if (rpmPath) rpmPath.style.strokeDashoffset = (100 - clamp(p.power * 100, 3, 98)).toFixed(1);
    if (nosPath) nosPath.style.strokeDashoffset = (100 - clamp(p.regen * 100, 6, 98)).toFixed(1);
    brakeCueEl?.classList.toggle("on", S.brakeCue && S.phase === "driving" && !isAutonomous(S.level));
    wrongWayEl?.classList.toggle("on", S.wrongWay && S.phase === "driving");
    audio?.update(p.speed, spec.maxSpeedMps, S.phase === "driving");

    // HUD text and the evidence beacon at 10 Hz
    hudClock += frameSeconds;
    if (hudClock >= 0.1 || framesRendered < 3) {
      hudClock = 0;
      const drives = !isAutonomous(S.level);
      const dz = p.z - r.beaconZ;
      let hint: string | null = null;
      if ((r.state === "offer" || r.state === "ride") && dz > -6 && dz < 40) {
        if (!drives) hint = `${ASSIST[S.level].dock}: pulling up to the kerb · ${formatDist(dz)}`;
        else {
          const k = kerbHint({ playerX: p.x, dz, speed: p.speed });
          hint = k === "move-to-kerb" ? `Move right to the glowing kerb · ${formatDist(Math.max(0, dz))}` : k === "slow-down" ? "Slow down: stop at the beacon (S or Brake)" : `Stop at the beacon · ${formatDist(Math.max(0, dz))}`;
        }
      } else if (r.state === "boarding") hint = `Boarding ${fareOf(S).passenger}…`;
      else if (r.state === "alighting") hint = `Dropping off ${fareOf(S).passenger}…`;
      hud.update(S, drives, hint);
      // GD-18: operator-console bezel (camera label, feed clock, link bars, REC dot).
      const bz = bezelState({ camMode, sky: weather, simSeconds: S.time, motionOk: motionOk() });
      setText("bzCam", bz.cam);
      setText("bzClock", bz.clock);
      $("bzRec")?.classList.toggle("off", !bz.rec);
      const bars = $("bzBars");
      if (bars && bars.dataset.bars !== String(bz.bars)) bars.dataset.bars = String(bz.bars);
      readAvoidRects();
      const distIdx = districtAt(p.z);
      const di = DISTRICTS[distIdx]!;
      setText("wHood", di[0]);
      setText("wSt", di[1]);
      setText("wX", di[2]);
      setText("wCoords", di[3]);
      if (miniCtx && miniCanvas) drawMinimap(miniCtx, miniCanvas.width, miniCanvas.height, S, rivalAccents);
      publishBeacon(evidence());
    }
  }

  const textCache = new Map<string, string>();
  function setText(id: string, text: string): void {
    if (textCache.get(id) === text) return;
    textCache.set(id, text);
    const el = $(id);
    if (el) el.textContent = text;
  }

  function evidence() {
    const p = S.player;
    return {
      route: "showcase-teleoperator",
      engine: "@aura3d/engine",
      ready,
      framesRendered,
      steps: loop.steps,
      phase: S.phase,
      vehicle: S.car,
      autopilotLevel: S.level,
      weatherPreset: weather,
      remounting,
      cameraMode: camMode,
      rideState: S.ride.state,
      rideStyle: S.style,
      fareIndex: S.ride.fareIndex,
      totalEarningsUsd: S.career.earningsUsd,
      completedRides: S.career.rides,
      ratingAvg: S.career.rides > 0 ? Math.round((S.career.starsSum / S.career.rides) * 100) / 100 : null,
      comfortScore: Math.round(S.ride.comfort * 10) / 10,
      streetBounty: S.ride.bounty,
      streetMultiplier: S.ride.multiplier,
      shift: { ...S.shift, score: S.lastScore },
      collisions: { count: S.collisionCount },
      signal: S.signal,
      wrongWay: S.wrongWay,
      touchControls: touch.visible,
      muted: audio?.muted ?? false,
      player: { position: [Number(p.x.toFixed(2)), 0, Number(p.z.toFixed(2))], speedMps: Number(p.speed.toFixed(2)), speedMph: Math.round(p.speed * 2.23694) },
      peers: RIVALS.map((rv, k) => {
        const u = S.users[TRAFFIC_COUNT + k]!;
        return { handle: rv.handle, car: rv.carLabel, ai: true, distanceMeters: Math.round(Math.hypot(u.laneX - p.x, u.z - p.z)) };
      })
    };
  }

  // ---------------------------------------------------------------- QA hooks (C20)
  const simulate = (seconds: number, input: Partial<DriveInput> = {}): ReturnType<typeof evidence> => {
    const steps = Math.max(0, Math.round(seconds / STEP));
    qaInput = { ...NO_INPUT, ...input };
    loop.advance(steps);
    qaInput = null;
    presenter.reset();
    return evidence();
  };
  const checks: Record<string, () => unknown> = {
    // C1: with no input in manual mode the car rolls past the beacon; the fare must not complete.
    "manual-idle": () => {
      retry();
      setAutopilotLevel("MAN");
      const before = S.career.rides;
      const e = simulate(40);
      return { pass: S.career.rides === before && S.shift.faresDone === 0 && S.shift.missed >= 1, ridesAdded: S.career.rides - before, missed: S.shift.missed, rideState: e.rideState };
    },
    // C1: stopped in the kerb lane at the beacon, the passenger boards.
    "kerb-stop": () => {
      retry();
      setAutopilotLevel("MAN");
      S.player.x = KERB_STOP_X;
      S.player.z = S.ride.beaconZ + 1;
      for (const u of S.users) if (Math.abs(u.z - S.player.z) < 30) u.z = S.player.z - 120 - u.slot * 9;
      S.player.speed = 0;
      const e = simulate(2.5, { brake: true });
      return { pass: e.rideState === "ride", rideState: e.rideState };
    },
    // C7: a skipped fare pays nothing.
    "skip-pays-nothing": () => {
      const before = { usd: S.shift.earnedUsd, rides: S.career.rides };
      applyEvents(sim.skipFare());
      return { pass: S.shift.earnedUsd === before.usd && S.career.rides === before.rides, skipped: S.shift.skipped };
    },
    // C7: an L5 shift reaches the results screen.
    "shift-results": () => {
      retry();
      setAutopilotLevel("L5");
      let guard = 0;
      while (S.phase !== "results" && guard++ < 60) simulate(10);
      setAutopilotLevel("MAN");
      return { pass: S.phase === "results", shift: S.shift, score: S.lastScore, best: S.career.bestShiftScore, resultsVisible: $("results")?.classList.contains("on") ?? false };
    }
  };
  const extras = {
    simulate,
    check: (name: string) => checks[name]?.() ?? { pass: false, error: `unknown check ${name}` },
    selectPlayableVehicle,
    setAutopilotLevel,
    setCameraMode,
    setWeatherPreset: (w: WeatherPreset) => setWeather(w),
    skipFare: () => applyEvents(sim.skipFare()),
    teleportToPeer: teleportToRival,
    retry,
    cameraView: () => {
      const size = carSizes[S.car];
      const off = cameraOffsets(size)[camMode];
      return { position: [SCENE_CAM_POS[0] + shakeNow.x * 0, SCENE_CAM_POS[1], SCENE_CAM_POS[2]], mode: camMode, car: S.car, offset: off, clearance: cameraClearance(size, off, viewX(S.player.x, S.player.x)) };
    },
    settle: () => warmPrograms(auraApp),
    /** Deterministic still frame for A/B captures: a fresh shift, the sim stopped, the street placed once. */
    freeze: () => {
      retry();
      loop.manual = true;
      present(0);
      return evidence();
    },
    evidence,
    /** GU47 QA crops (E-I capture contract), read after every screenshot. */
    crops: (): QaCrop[] => {
      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 720;
      const car = carCrop((p) => projectViewPointToScreen([p[0], p[1], p[2]], vw, vh, presentedFov), vw, vh, carView);
      return car ? [car, ...STATIC_CROPS] : [...STATIC_CROPS];
    }
  };
  const qa = installQaHooks("grid-dispatch", {
    ready: () => ready,
    state: () => evidence(),
    app: () => auraApp,
    stepFrames: (n: number, input?: Partial<DriveInput>) => {
      qaInput = { ...NO_INPUT, ...(input ?? {}) };
      loop.advance(n);
      qaInput = null;
    },
    reset: () => retry(),
    begin: () => retry(),
    extras
  });
  // Legacy global kept for older specs and route-health tooling; built once (C11).
  const legacy = {
    app: auraApp,
    get evidence() { return evidence(); },
    selectPlayableVehicle,
    setAutopilotLevel,
    setCameraMode,
    setWeatherPreset: extras.setWeatherPreset,
    advanceApexFareStage: extras.skipFare,
    teleportToPeer: teleportToRival,
    qaPlaceTrafficCar(slot: number, state: { laneX: number; zAhead: number; speed: number; direction: 1 | -1 }) {
      const u = S.users[slot];
      if (!u) return false;
      u.laneX = state.laneX;
      u.z = S.player.z - state.zAhead;
      u.speed = state.speed;
      u.cruise = state.speed;
      u.direction = state.direction;
      return true;
    },
    qaSetYaw(yaw: number) {
      qaYawAdd = yaw;
    },
    qaSetPlayer(state: { x?: number; speed?: number }) {
      if (state.x !== undefined) S.player.x = state.x;
      if (state.speed !== undefined) S.player.speed = state.speed;
    },
    qaCollisions: () => ({ count: S.collisionCount, player: { x: S.player.x, z: S.player.z, speed: S.player.speed }, cars: S.users.map((c) => ({ laneX: c.laneX, z: c.z, speed: c.speed, direction: c.direction })) })
  };
  (window as unknown as Record<string, unknown>).__AURA3D_SHOWCASE_TELEOPERATOR__ = legacy;
  (window as unknown as { __AURA_QA__?: Record<string, unknown> }).__AURA_QA__ = { ...((window as unknown as { __AURA_QA__?: Record<string, unknown> }).__AURA_QA__ ?? {}), crops: extras.crops };

  // ---------------------------------------------------------------- start
  initSpeedometerDial(false);
  updateModeLabels();
  syncSkyDock(weather);
  document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-cam]").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.cam) === camMode);
    btn.setAttribute("aria-pressed", Number(btn.dataset.cam) === camMode ? "true" : "false");
  });
  hud.update(S, true, null);
  const careerEl = $("careerLine");
  if (careerEl) careerEl.textContent = hud.career(S.career);
  if (S.career.rides > 0) hud.toast("Welcome back", hud.career(S.career));

  try {
    await auraApp.ready();
  } catch (error) {
    qa.reportError(error);
    console.error("[grid-dispatch] scene assets failed to load; continuing with what rendered", error);
  }
  applyWindowGlow();
  applyMaterialOverrides();
  lowTier = (auraApp.diagnostics() as unknown as { post?: { tier?: string } }).post?.tier === "low";
  // Settle every shader program before the boot screen goes (a draw whose program is still compiling is skipped).
  // Place the street first so the settle pass draws what the first game frame shows.
  present(0);
  try {
    await warmPrograms(auraApp);
  } catch (error) {
    console.error("[grid-dispatch] warmPrograms failed", error);
  }
  auraApp.onFrame(() => {
    loop.tick(performance.now());
  });
  ready = true;
  presenter.reset();
  $("boot")?.classList.add("done");
  document.body.dataset.aura3dReady = "true";
  canvas.dataset.ready = "true";
  auraApp.resume();
  if (autoplay) setAutopilotLevel("L5");
  // GD-17: skippable 3-shot intro over the live first seconds (the sim is untouched); any key or tap skips it.
  if (introEnabled({ motionOk: motionOk(), params }) && auraApp.camera) {
    const playback = auraApp.camera.play({
      id: "grid-intro",
      shots: introShots(carView.x, carView.z).map((pose) => ({ rig: camera.rigs.static(pose), duration: INTRO_SHOT_S })),
      onEnd: "return"
    });
    introPlaying = true;
    const skip = (): void => {
      if (introPlaying) playback.skip();
    };
    window.addEventListener("keydown", skip, { capture: true, once: true });
    window.addEventListener("pointerdown", skip, { capture: true, once: true });
    void playback.done.then(() => {
      introPlaying = false;
      window.removeEventListener("keydown", skip, { capture: true });
      window.removeEventListener("pointerdown", skip, { capture: true });
    });
  }
}

void bootGridDispatch();
