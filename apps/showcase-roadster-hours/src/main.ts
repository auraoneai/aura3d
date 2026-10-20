import { createAuraApp, type AuraRuntimeNodeHandle } from "@aura3d/engine";
import {
  CANYON_FLOOR,
  HALF_WIDTH,
  LANE_OFFSET,
  LEDGES,
  ROUTES,
  ROUTE_ORDER,
  SEA_LEVEL,
  TRAFFIC_PLAN,
  VEHICLES,
  buildRoadsterHoursScene,
  checkpointProgress,
  checkpointsAndFinish,
  roadPose,
  type RouteId,
  type Vec3,
  type VehicleKind
} from "./routes";

type Mode = "menu" | "playing" | "paused" | "wrecked" | "complete";
type UpgradeId = "engine" | "thrust" | "nitro" | "grip";

interface BestRun {
  score: number;
  timeMs: number;
  completed: boolean;
}

interface Career {
  version: 1;
  credits: number;
  runs: number;
  upgrades: Record<UpgradeId, number>;
  best: Record<RouteId, BestRun>;
  lastRoute: RouteId;
}

interface UpgradeDef {
  readonly id: UpgradeId;
  readonly name: string;
  readonly description: string;
}

interface TrafficSlot {
  readonly route: RouteId;
  readonly kind: VehicleKind;
  readonly handle: AuraRuntimeNodeHandle;
  progress: number;
  lane: -1 | 0 | 1;
  speed: number;
  x: number;
  y: number;
  z: number;
  topY: number;
  passed: boolean;
  roofAwarded: boolean;
}

interface Surface {
  readonly y: number;
  readonly kind: "road" | "ledge" | "vehicle" | "floor";
  readonly vehicle: TrafficSlot | null;
}

interface PlayerState {
  route: RouteId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  vy: number;
  grounded: boolean;
  onVehicle: TrafficSlot | null;
  heat: number;
  nitro: number;
  overheated: boolean;
  airTime: number;
  spin: number;
  rollSpin: number;
  flips: number;
  flipTimer: number;
  flipDir: 1 | -1;
  flipAngle: number;
  roll: number;
  boosting: boolean;
  thrusting: boolean;
  shake: number;
  combo: number;
  score: number;
  checkpointIndex: number;
  lastCheckpointP: number;
  elapsed: number;
}

const CAREER_KEY = "aura3d.roadster-hours.career.v1";
const UPGRADE_COSTS: readonly number[] = [250, 500, 900, 1400, 2000];
const UPGRADES: readonly UpgradeDef[] = [
  {
    id: "engine",
    name: "Engine",
    description: "+5 m/s top speed per level on every horizon."
  },
  {
    id: "thrust",
    name: "Rocket",
    description: "+3.0 m/s2 of climb under Space per level."
  },
  {
    id: "nitro",
    name: "Nitro",
    description: "+14 nitro capacity per level for longer burns."
  },
  {
    id: "grip",
    name: "Grip",
    description: "+0.15 rad/s of steering authority per level."
  }
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

function isRouteId(value: unknown): value is RouteId {
  return value === "coast" || value === "canyon" || value === "skyway";
}

function clampLevel(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(Math.floor(value), 0, 5) : 0;
}

function formatScore(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

function defaultCareer(): Career {
  return {
    version: 1,
    credits: 600,
    runs: 0,
    upgrades: { engine: 0, thrust: 0, nitro: 0, grip: 0 },
    best: {
      coast: { score: 0, timeMs: 0, completed: false },
      canyon: { score: 0, timeMs: 0, completed: false },
      skyway: { score: 0, timeMs: 0, completed: false }
    },
    lastRoute: "coast"
  };
}

function loadCareer(): Career {
  const fallback = defaultCareer();
  try {
    const raw = window.localStorage.getItem(CAREER_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as {
      credits?: unknown;
      runs?: unknown;
      upgrades?: Partial<Record<UpgradeId, unknown>>;
      best?: Partial<Record<RouteId, Partial<BestRun>>>;
      lastRoute?: unknown;
    };
    const upgrades: Record<UpgradeId, number> = {
      engine: clampLevel(parsed.upgrades?.engine),
      thrust: clampLevel(parsed.upgrades?.thrust),
      nitro: clampLevel(parsed.upgrades?.nitro),
      grip: clampLevel(parsed.upgrades?.grip)
    };
    const best = { ...fallback.best };
    for (const id of ROUTE_ORDER) {
      const entry = parsed.best?.[id];
      best[id] = {
        score: typeof entry?.score === "number" && Number.isFinite(entry.score) ? Math.max(0, entry.score) : 0,
        timeMs:
          typeof entry?.timeMs === "number" && Number.isFinite(entry.timeMs) ? Math.max(0, entry.timeMs) : 0,
        completed: entry?.completed === true
      };
    }
    return {
      version: 1,
      credits:
        typeof parsed.credits === "number" && Number.isFinite(parsed.credits)
          ? Math.max(0, Math.floor(parsed.credits))
          : fallback.credits,
      runs:
        typeof parsed.runs === "number" && Number.isFinite(parsed.runs)
          ? Math.max(0, Math.floor(parsed.runs))
          : 0,
      upgrades,
      best,
      lastRoute: isRouteId(parsed.lastRoute) ? parsed.lastRoute : "coast"
    };
  } catch {
    return fallback;
  }
}

function rotateLocal(root: Vec3, pitch: number, yaw: number, roll: number, local: Vec3): Vec3 {
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const x1 = local[0] * cr - local[1] * sr;
  const y1 = local[0] * sr + local[1] * cr;
  const z1 = local[2];

  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x2 = x1;
  const y2 = y1 * cp - z1 * sp;
  const z2 = y1 * sp + z1 * cp;

  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x3 = x2 * cy + z2 * sy;
  const y3 = y2;
  const z3 = -x2 * sy + z2 * cy;

  return [root[0] + x3, root[1] + y3, root[2] + z3];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function bootRoadsterHours(): Promise<void> {
  const canvas = byId<HTMLCanvasElement>("game");
  const builtScene = buildRoadsterHoursScene();
  const app = createAuraApp(canvas, {
    scene: builtScene,
    renderer: { quality: "high" },
    qualityRebuild: { flags: ["game", "-compiler", "-post", "-vfxFog"] },
    diagnostics: false
  });

  const req = (id: string): AuraRuntimeNodeHandle => app.nodes.require(id);

  const playerCar = req("player-roadster");
  const lightbar = req("player-lightbar");
  const headlightL = req("player-headlight-l");
  const headlightR = req("player-headlight-r");
  const plumeRearL = req("player-plume-rear-l");
  const plumeRearR = req("player-plume-rear-r");
  const plumesDown = Array.from({ length: 4 }, (_, i) => req(`player-plume-down-${i}`));
  const contactShadow = req("player-contact-shadow");
  const markerRing = req("checkpoint-marker-ring");
  const markerBeam = req("checkpoint-marker-beam");

  const traffic: Record<RouteId, TrafficSlot[]> = { coast: [], canyon: [], skyway: [] };
  for (const routeId of ROUTE_ORDER) {
    TRAFFIC_PLAN.forEach((kind, index) => {
      const lane: -1 | 0 | 1 = ((index % 3) - 1) as -1 | 0 | 1;
      traffic[routeId].push({
        route: routeId,
        kind,
        handle: req(`traffic-${routeId}-${index}`),
        progress: 170 + index * 235,
        lane,
        speed: 16 + (index % 5) * 2,
        x: 0,
        y: 0,
        z: -(170 + index * 235),
        topY: 0,
        passed: false,
        roofAwarded: false
      });
    });
  }

  const career = loadCareer();
  let mode: Mode = "menu";
  let selectedRoute: RouteId = career.lastRoute;
  let currentRoute: RouteId = selectedRoute;
  let framesRendered = 0;
  let cameraSnap = true;
  let menuAngle = 0;
  let wreckTimer = 0;
  let bannerTimer = 0;
  let toastTimer = 0;
  let hudAccumulator = 0;
  let evidenceAccumulator = 0;

  const startPose = roadPose(ROUTES[selectedRoute], 34);
  const P: PlayerState = {
    route: selectedRoute,
    x: startPose.x,
    y: startPose.y + 0.05,
    z: -34,
    yaw: startPose.yaw,
    speed: 0,
    vy: 0,
    grounded: true,
    onVehicle: null,
    heat: 100,
    nitro: 100,
    overheated: false,
    airTime: 0,
    spin: 0,
    rollSpin: 0,
    flips: 0,
    flipTimer: 0,
    flipDir: 1,
    flipAngle: 0,
    roll: 0,
    boosting: false,
    thrusting: false,
    shake: 0,
    combo: 1,
    score: 0,
    checkpointIndex: 0,
    lastCheckpointP: 34,
    elapsed: 0
  };

  const hud = byId<HTMLDivElement>("hud");
  const startScreen = byId<HTMLDivElement>("start-screen");
  const pauseScreen = byId<HTMLDivElement>("pause-screen");
  const resultsScreen = byId<HTMLDivElement>("results-screen");
  const boot = byId<HTMLDivElement>("boot");
  const routeGrid = byId<HTMLDivElement>("route-grid");
  const startCredits = byId<HTMLSpanElement>("start-credits");
  const startRuns = byId<HTMLSpanElement>("start-runs");
  const startTuning = byId<HTMLSpanElement>("start-tuning");
  const startButton = byId<HTMLButtonElement>("start-btn");
  const resumeButton = byId<HTMLButtonElement>("resume-btn");
  const restartButton = byId<HTMLButtonElement>("restart-btn");
  const routeSelectButton = byId<HTMLButtonElement>("route-select-btn");
  const pauseRouteName = byId<HTMLSpanElement>("pause-route-name");
  const garageCredits = byId<HTMLSpanElement>("garage-credits");
  const upgradeList = byId<HTMLDivElement>("upgrade-list");
  const resultsRouteName = byId<HTMLSpanElement>("results-route-name");
  const resultsHeadline = byId<HTMLHeadingElement>("results-headline");
  const resultsSubline = byId<HTMLParagraphElement>("results-subline");
  const resultsScore = byId<HTMLElement>("results-score");
  const resultsTime = byId<HTMLElement>("results-time");
  const resultsCredits = byId<HTMLElement>("results-credits");
  const recordNote = byId<HTMLParagraphElement>("record-note");
  const resultsSelect = byId<HTMLButtonElement>("results-select-btn");
  const resultsReplay = byId<HTMLButtonElement>("results-replay-btn");
  const resultsNext = byId<HTMLButtonElement>("results-next-btn");

  const hudRouteName = byId<HTMLElement>("hud-route-name");
  const hudRouteSub = byId<HTMLElement>("hud-route-sub");
  const scoreEl = byId<HTMLElement>("score");
  const comboEl = byId<HTMLElement>("combo");
  const speedEl = byId<HTMLElement>("speed");
  const heatFill = byId<HTMLElement>("heat-fill");
  const heatBar = byId<HTMLDivElement>("heat-bar");
  const heatPct = byId<HTMLElement>("heat-pct");
  const nitroFill = byId<HTMLElement>("nitro-fill");
  const nitroPct = byId<HTMLElement>("nitro-pct");
  const progressFill = byId<HTMLElement>("progress-fill");
  const cpLabel = byId<HTMLElement>("cp-label");
  const timeEl = byId<HTMLElement>("time");
  const creditsEl = byId<HTMLElement>("credits");
  const bannerEl = byId<HTMLDivElement>("banner");
  const toastEl = byId<HTMLDivElement>("toast");
  const cpDots = Array.from(document.querySelectorAll<HTMLSpanElement>(".cp-dot"));

  const routeCards = Array.from(routeGrid.querySelectorAll<HTMLButtonElement>(".route-card"));
  const upgradeControls = new Map<UpgradeId, { pips: HTMLSpanElement; button: HTMLButtonElement }>();

  const keys = new Set<string>();
  const pressed = new Set<string>();

  const cameraRig = app as unknown as {
    camera?: {
      setPose?: (pose: { position: Vec3; target: Vec3; fov: number }) => void;
    };
  };

  let camEye: Vec3 = [P.x, P.y + 7, P.z + 14];
  let camTarget: Vec3 = [P.x, P.y + 1.5, P.z - 20];
  let camFov = 62;

  function saveCareer(): void {
    try {
      window.localStorage.setItem(CAREER_KEY, JSON.stringify(career));
    } catch {
      // Storage can be unavailable in private or embedded contexts.
    }
  }

  function nitroCapacity(): number {
    return 100 + career.upgrades.nitro * 14;
  }

  function maxSpeed(): number {
    return 57 + career.upgrades.engine * 5;
  }

  function thrustPower(): number {
    return 30 + career.upgrades.thrust * 3;
  }

  function steerPower(): number {
    return 1.35 + career.upgrades.grip * 0.15;
  }

  function setBanner(text: string, seconds: number): void {
    if (!text) {
      bannerEl.classList.remove("on");
      bannerTimer = 0;
      return;
    }
    bannerEl.textContent = text;
    bannerEl.classList.add("on");
    bannerTimer = seconds;
  }

  function toast(text: string, seconds = 1.4): void {
    toastEl.textContent = text;
    toastEl.classList.add("on");
    toastTimer = seconds;
  }

  function award(base: number, label: string): void {
    const points = Math.round(base * P.combo);
    P.score += points;
    toast(`${label} +${formatScore(points)}`);
  }

  function refreshStartScreen(): void {
    for (const card of routeCards) {
      const id = card.dataset.route;
      card.classList.toggle("selected", id === selectedRoute);
      if (!isRouteId(id)) continue;
      const target = card.querySelector<HTMLElement>(`[data-best="${id}"]`);
      if (!target) continue;
      const best = career.best[id];
      target.textContent = best.completed ? formatScore(best.score) : "No runs yet";
    }
    startCredits.textContent = formatScore(career.credits);
    startRuns.textContent = String(career.runs);
    const totalLevel = UPGRADES.reduce((sum, upgradeDef) => sum + career.upgrades[upgradeDef.id], 0);
    startTuning.textContent = totalLevel === 0 ? "Stock" : `${totalLevel} / 20`;
    garageCredits.textContent = formatScore(career.credits);
  }

  function upgradeCost(level: number): number {
    return UPGRADE_COSTS[level] ?? 0;
  }

  function renderGarage(): void {
    for (const upgradeDef of UPGRADES) {
      const controls = upgradeControls.get(upgradeDef.id);
      if (!controls) continue;
      const level = career.upgrades[upgradeDef.id];
      Array.from(controls.pips.children).forEach((pip, index) => {
        pip.classList.toggle("on", index < level);
      });
      if (level >= 5) {
        controls.button.textContent = "MAX";
        controls.button.disabled = true;
        controls.button.classList.add("maxed");
      } else {
        const cost = upgradeCost(level);
        controls.button.textContent = `BUY ${formatScore(cost)}`;
        controls.button.disabled = career.credits < cost;
        controls.button.classList.remove("maxed");
      }
    }
    garageCredits.textContent = formatScore(career.credits);
  }

  function buildGarage(): void {
    for (const upgradeDef of UPGRADES) {
      const row = document.createElement("div");
      row.className = "upgrade-row";

      const name = document.createElement("div");
      name.className = "upgrade-name";
      const label = document.createElement("span");
      label.textContent = upgradeDef.name;
      const pips = document.createElement("span");
      pips.className = "pips";
      for (let i = 0; i < 5; i++) pips.appendChild(document.createElement("i"));
      name.append(label, pips);

      const description = document.createElement("div");
      description.className = "upgrade-desc";
      description.textContent = upgradeDef.description;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "upgrade-buy";
      button.addEventListener("click", () => buyUpgrade(upgradeDef.id));

      row.append(name, description, button);
      upgradeList.appendChild(row);
      upgradeControls.set(upgradeDef.id, { pips, button });
    }
  }

  function buyUpgrade(id: UpgradeId): void {
    const level = career.upgrades[id];
    if (level >= 5) return;
    const cost = upgradeCost(level);
    if (career.credits < cost) {
      toast("Not enough credits");
      return;
    }
    career.credits -= cost;
    career.upgrades[id] = level + 1;
    if (id === "nitro") P.nitro = nitroCapacity();
    saveCareer();
    renderGarage();
    refreshStartScreen();
    const def = UPGRADES.find((entry) => entry.id === id);
    toast(`${def?.name ?? "Tuning"} level ${level + 1}`);
  }

  function refreshTrafficVisibility(): void {
    for (const routeId of ROUTE_ORDER) {
      for (const slot of traffic[routeId]) {
        slot.handle.setVisible(routeId === currentRoute);
      }
    }
  }

  function parkAt(routeId: RouteId, progress = 34): void {
    currentRoute = routeId;
    P.route = routeId;
    const pose = roadPose(ROUTES[routeId], progress);
    P.x = pose.x;
    P.y = pose.y + 0.05;
    P.z = -progress;
    P.yaw = pose.yaw;
    P.speed = 0;
    P.vy = 0;
    P.grounded = true;
    P.onVehicle = null;
    P.heat = 100;
    P.nitro = nitroCapacity();
    P.overheated = false;
    P.airTime = 0;
    P.spin = 0;
    P.rollSpin = 0;
    P.flips = 0;
    P.flipTimer = 0;
    P.flipAngle = 0;
    P.roll = 0;
    P.boosting = false;
    P.thrusting = false;
    P.shake = 0;
    P.combo = 1;
    P.score = 0;
    P.checkpointIndex = 0;
    P.lastCheckpointP = progress;
    P.elapsed = 0;
    refreshTrafficVisibility();
    cameraSnap = true;
  }

  function selectRoute(routeId: RouteId): void {
    selectedRoute = routeId;
    career.lastRoute = routeId;
    saveCareer();
    parkAt(routeId);
    refreshStartScreen();
    refreshHud();
    publishEvidence();
  }

  function hideScreens(): void {
    startScreen.classList.add("hidden");
    pauseScreen.classList.add("hidden");
    resultsScreen.classList.add("hidden");
  }

  function startRoute(routeId: RouteId): void {
    selectedRoute = routeId;
    parkAt(routeId);
    mode = "playing";
    hideScreens();
    hud.classList.remove("hidden");
    refreshHud();
    setBanner(ROUTES[routeId].name.toUpperCase(), 1.8);
    toast("W to roll - Space to fly");
    publishEvidence();
  }

  function showMenu(): void {
    mode = "menu";
    selectedRoute = currentRoute;
    parkAt(selectedRoute);
    hideScreens();
    startScreen.classList.remove("hidden");
    hud.classList.add("hidden");
    refreshStartScreen();
    publishEvidence();
  }

  function pauseGame(): void {
    if (mode !== "playing") return;
    mode = "paused";
    pauseRouteName.textContent = ROUTES[currentRoute].name;
    pauseScreen.classList.remove("hidden");
    hud.classList.add("hidden");
    refreshStartScreen();
    renderGarage();
    publishEvidence();
  }

  function resumeGame(): void {
    if (mode !== "paused") return;
    mode = "playing";
    pauseScreen.classList.add("hidden");
    hud.classList.remove("hidden");
    publishEvidence();
  }

  function togglePause(): void {
    if (mode === "playing") pauseGame();
    else if (mode === "paused") resumeGame();
  }

  function nextRouteId(): RouteId {
    const index = ROUTE_ORDER.indexOf(currentRoute);
    return ROUTE_ORDER[(index + 1) % ROUTE_ORDER.length]!;
  }

  function completeRun(): void {
    if (mode !== "playing") return;
    mode = "complete";
    const finishBonus = 1500;
    const timeBonus = Math.max(0, Math.round((300 - P.elapsed) * 4));
    P.score += finishBonus + timeBonus;
    const earned = Math.max(200, Math.round(P.score / 16));
    const previous = career.best[currentRoute];
    const isScoreBest = P.score > previous.score;
    const isTimeBest = previous.timeMs === 0 || P.elapsed * 1000 < previous.timeMs;
    career.credits += earned;
    career.runs += 1;
    career.best[currentRoute] = {
      score: Math.max(previous.score, Math.round(P.score)),
      timeMs: isTimeBest ? Math.round(P.elapsed * 1000) : previous.timeMs,
      completed: true
    };
    saveCareer();

    hud.classList.add("hidden");
    hideScreens();
    resultsScreen.classList.remove("hidden");
    resultsRouteName.textContent = ROUTES[currentRoute].name;
    resultsHeadline.textContent = currentRoute === "skyway" ? "Halo Crossed" : "Horizon Reached";
    resultsSubline.textContent =
      currentRoute === "coast"
        ? "The coast drops away behind you. Redline Canyon is waiting inland."
        : currentRoute === "canyon"
          ? "The rock walls fall silent. The Halo Skyway is lit above the clouds."
          : "Three horizons, one Roadster. The career board is yours to tune.";
    resultsScore.textContent = formatScore(P.score);
    resultsTime.textContent = formatTime(P.elapsed);
    resultsCredits.textContent = `+${formatScore(earned)}`;
    recordNote.classList.toggle("hidden", !isScoreBest && !isTimeBest);
    resultsNext.textContent =
      currentRoute === "skyway" ? "Back to Sunbreak Coast" : `Ride ${ROUTES[nextRouteId()].name}`;
    setBanner("", 0);
    toast("", 0.01);
    refreshStartScreen();
    renderGarage();
    publishEvidence();
  }

  function wreck(reason: string): void {
    if (mode !== "playing") return;
    mode = "wrecked";
    wreckTimer = 1.35;
    P.shake = 1.2;
    P.speed = 0;
    P.vy = 0;
    P.onVehicle = null;
    P.combo = 1;
    setBanner(reason, 1.25);
    publishEvidence();
  }

  function respawn(): void {
    const route = ROUTES[currentRoute];
    const progress = Math.max(34, P.lastCheckpointP);
    const pose = roadPose(route, progress);
    P.x = pose.x;
    P.y = pose.y + 0.1;
    P.z = -progress;
    P.yaw = pose.yaw;
    P.speed = 0;
    P.vy = 0;
    P.grounded = true;
    P.onVehicle = null;
    P.heat = Math.max(P.heat, 55);
    P.overheated = false;
    P.airTime = 0;
    P.spin = 0;
    P.rollSpin = 0;
    P.flips = 0;
    P.flipTimer = 0;
    P.flipAngle = 0;
    P.roll = 0;
    P.boosting = false;
    P.thrusting = false;
    P.shake = 0;
    mode = "playing";
    cameraSnap = true;
    setBanner("Back on the road", 1.1);
    publishEvidence();
  }

  function findSurface(): Surface | null {
    const route = ROUTES[P.route];
    const progress = -P.z;
    const pose = roadPose(route, progress);
    const candidates: Surface[] = [];

    if (progress > -30 && progress < route.length + 180 && Math.abs(P.x - pose.x) < HALF_WIDTH + 0.6) {
      candidates.push({ y: pose.y, kind: "road", vehicle: null });
    }
    for (const ledge of LEDGES[P.route]) {
      if (Math.abs(P.x - ledge.x) < ledge.halfW && Math.abs(P.z - ledge.z) < ledge.halfD) {
        candidates.push({ y: ledge.y, kind: "ledge", vehicle: null });
      }
    }
    for (const slot of traffic[P.route]) {
      if (P.grounded && P.onVehicle !== slot) continue;
      const spec = VEHICLES[slot.kind];
      if (
        Math.abs(P.z - slot.z) < spec.length / 2 + 1.2 &&
        Math.abs(P.x - slot.x) < spec.width / 2 + 0.9
      ) {
        candidates.push({ y: slot.topY, kind: "vehicle", vehicle: slot });
      }
    }
    if (P.route === "canyon") {
      candidates.push({ y: CANYON_FLOOR, kind: "floor", vehicle: null });
    }

    let best: Surface | null = null;
    for (const candidate of candidates) {
      if (candidate.y > P.y + 1.8) continue;
      if (!best || candidate.y > best.y) best = candidate;
    }
    return best;
  }

  function recycle(slot: TrafficSlot, playerProgress: number): void {
    const route = ROUTES[currentRoute];
    let next = playerProgress + 190 + Math.random() * 260;
    if (next > route.length - 80) next = Math.max(120, playerProgress + 90);
    slot.progress = next;
    slot.lane = (Math.floor(Math.random() * 3) - 1) as -1 | 0 | 1;
    slot.speed = 15 + Math.random() * 13;
    slot.passed = false;
    slot.roofAwarded = false;
  }

  function updateTraffic(dt: number, move: boolean): void {
    const route = ROUTES[currentRoute];
    const playerProgress = -P.z;
    for (const slot of traffic[currentRoute]) {
      if (move) {
        slot.progress += slot.speed * dt;
        if (slot.progress < playerProgress - 280 || slot.progress > route.length + 140) {
          recycle(slot, playerProgress);
        }
      }
      const pose = roadPose(route, slot.progress);
      const spec = VEHICLES[slot.kind];
      const laneOffset = slot.lane * LANE_OFFSET;
      slot.x = pose.x + laneOffset * Math.cos(pose.yaw);
      slot.z = -slot.progress + laneOffset * Math.sin(pose.yaw);
      slot.y = pose.y;
      slot.topY = pose.y + spec.height;
      slot.handle
        .setPosition(slot.x, slot.y + 0.03, slot.z)
        .setRotation(0, -pose.yaw, 0)
        .setVisible(slot.progress > -20 && slot.progress < route.length + 130);
    }
  }

  function resolveTraffic(progress: number): void {
    for (const slot of traffic[P.route]) {
      if (!slot.handle) continue;
      const spec = VEHICLES[slot.kind];
      const pose = roadPose(ROUTES[P.route], slot.progress);
      const along = progress - slot.progress;
      const lateral =
        (P.x - slot.x) * Math.cos(pose.yaw) + (P.z - slot.z) * Math.sin(pose.yaw);
      if (
        Math.abs(along) < spec.length / 2 + 2.4 &&
        Math.abs(lateral) < spec.width / 2 + 1.0
      ) {
        const roof = slot.topY;
        if (!P.grounded && P.vy <= 1.5 && P.y >= roof - 0.5 && P.y <= roof + 3.2) {
          P.y = roof;
          P.vy = 0;
          P.grounded = true;
          P.onVehicle = slot;
          P.speed = Math.max(P.speed, slot.speed);
          if (!slot.roofAwarded) {
            slot.roofAwarded = true;
            award(90, "TRAILER ROOF");
          }
        } else if (P.y < roof - 0.35 && Math.abs(P.speed - slot.speed) > 9) {
          wreck("Traffic hit");
          return;
        } else if (P.y < roof - 0.35) {
          P.speed *= 0.5;
          P.combo = 1;
          P.x += lateral > 0 ? 1.7 : -1.7;
          P.shake = Math.max(P.shake, 0.55);
          toast("Bump - combo lost");
        }
      }
      if (!slot.passed && progress > slot.progress + spec.length / 2 + 2) {
        slot.passed = true;
        if (Math.abs(lateral) < 8) {
          const points = Math.round(45 * P.combo);
          P.score += points;
          P.combo = Math.min(9, P.combo + 1);
          toast(`Clean pass +${formatScore(points)}`);
        }
      }
    }
  }

  function landOn(surface: Surface): void {
    const impact = -P.vy;
    const rotations = Math.abs(P.spin) + Math.abs(P.rollSpin) + P.flips * Math.PI * 2;
    const airTime = P.airTime;
    P.y = surface.y;
    P.vy = 0;
    P.grounded = true;
    P.onVehicle = surface.kind === "vehicle" ? surface.vehicle : null;

    if (impact > 30) {
      wreck("Hard landing");
      return;
    }
    if (airTime > 0.35 && rotations > Math.PI * 0.7) {
      const base = Math.round((rotations / (Math.PI * 2)) * 320 + airTime * 40);
      const label =
        P.flips > 0
          ? P.flips > 1
            ? "Double flip"
            : P.flipDir > 0
              ? "Front flip"
              : "Backflip"
          : Math.abs(P.rollSpin) > Math.PI
            ? "Barrel roll"
            : "Air spin";
      award(base, label);
      P.combo = Math.min(9, P.combo + 1);
    }
    if (airTime > 1.2) toast("Big air");
    if (impact > 6) P.shake = Math.max(P.shake, clamp(impact / 40, 0.15, 0.8));
    P.airTime = 0;
    P.spin = 0;
    P.rollSpin = 0;
    P.flips = 0;
    P.flipTimer = 0;
    P.flipAngle = 0;
    P.roll = 0;
  }

  function stepPlayer(dt: number): void {
    const route = ROUTES[P.route];
    const throttle = keys.has("KeyW") || keys.has("ArrowUp");
    const brake = keys.has("KeyS") || keys.has("ArrowDown");
    const steer =
      (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
      (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
    const thrustKey = keys.has("Space");
    const nitroKey = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const rollInput = (keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") ? 1 : 0);
    const cap = nitroCapacity();

    if (P.nitro > cap) P.nitro = cap;

    if (!P.grounded) {
      if (pressed.has("KeyW") && P.flipTimer <= 0) {
        P.flipTimer = 0.62;
        P.flipDir = 1;
        P.flips += 1;
      }
      if (pressed.has("KeyS") && P.flipTimer <= 0) {
        P.flipTimer = 0.62;
        P.flipDir = -1;
        P.flips += 1;
      }
    }

    P.boosting = false;
    P.thrusting = false;

    if (P.onVehicle && P.grounded) {
      const vehicle = P.onVehicle;
      const spec = VEHICLES[vehicle.kind];
      P.speed = Math.max(P.speed, vehicle.speed * 0.94);
      P.y = vehicle.topY;
      if (throttle) P.speed += 9 * dt;
      P.x += steer * 3.2 * dt;
      if (
        Math.abs(P.x - vehicle.x) > spec.width / 2 + 0.7 ||
        Math.abs(-P.z - vehicle.progress) > spec.length / 2 + 1.4
      ) {
        P.onVehicle = null;
        P.grounded = false;
        P.vy = 1.1;
      } else if (pressed.has("Space") && !P.overheated) {
        P.onVehicle = null;
        P.grounded = false;
        P.vy = 9.2;
        P.heat = Math.max(0, P.heat - 8);
        P.y += 0.12;
      }
    } else if (P.grounded) {
      const pose = roadPose(route, -P.z);
      const offRoad = Math.abs(P.x - pose.x) > HALF_WIDTH - 0.6;
      const accel = 24 * (offRoad ? 0.55 : 1);
      if (throttle) P.speed += accel * dt;
      else if (brake) P.speed -= 34 * dt;
      else P.speed *= Math.max(0, 1 - 0.55 * dt);
      if (brake && P.speed < 0) P.speed = Math.max(P.speed, -14);
      const top = maxSpeed() * (offRoad ? 0.45 : 1);
      if (P.speed > top) P.speed -= 26 * dt;
      P.speed = clamp(P.speed, -14, top + 4);

      if (Math.abs(P.speed) > 1) {
        const speedFactor = clamp(0.4 + Math.abs(P.speed) / 42, 0.4, 1.25);
        P.yaw += steer * steerPower() * speedFactor * dt * Math.sign(P.speed);
      }
      if (pressed.has("Space") && !P.overheated) {
        P.grounded = false;
        P.vy = 9.2;
        P.heat = Math.max(0, P.heat - 8);
        P.y += 0.12;
      }
    } else {
      P.speed *= Math.max(0, 1 - 0.08 * dt);
      if (throttle) P.speed += 7 * dt;
      if (brake) P.speed -= 6 * dt;
      P.speed = clamp(P.speed, -6, maxSpeed() + 30);
      P.yaw += steer * 1.15 * dt;
      P.spin += steer * 1.15 * dt;
    }

    if (nitroKey && P.nitro > 0.5) {
      P.nitro = Math.max(0, P.nitro - 32 * dt);
      P.boosting = true;
      P.speed += (P.grounded ? 30 : 26) * dt;
      P.speed = Math.min(P.speed, maxSpeed() + 36);
    } else {
      P.nitro = Math.min(cap, P.nitro + 9 * dt);
    }

    if (!P.grounded && thrustKey && !P.overheated && P.heat > 0) {
      P.thrusting = true;
      P.vy += thrustPower() * dt;
      P.speed += 4.5 * dt;
      P.heat = Math.max(0, P.heat - 30 * dt);
      if (P.heat <= 0) P.overheated = true;
    } else {
      P.heat = Math.min(100, P.heat + (P.grounded ? 26 : 15) * dt);
      if (P.overheated && P.heat > 42) P.overheated = false;
    }

    if (!P.grounded && rollInput !== 0) {
      P.roll += rollInput * 5.2 * dt;
      P.rollSpin += rollInput * 5.2 * dt;
    } else if (P.grounded) {
      P.roll *= Math.max(0, 1 - 7 * dt);
    }

    if (!P.grounded && P.flipTimer > 0) {
      P.flipTimer = Math.max(0, P.flipTimer - dt);
      P.flipAngle = P.flipDir * Math.PI * 2 * (1 - P.flipTimer / 0.62);
    }

    const forwardX = Math.sin(P.yaw);
    const forwardZ = -Math.cos(P.yaw);
    P.x += forwardX * P.speed * dt;
    P.z += forwardZ * P.speed * dt;

    const progress = -P.z;
    resolveTraffic(progress);

    if (P.grounded) {
      const surface = findSurface();
      if (!surface) {
        P.grounded = false;
        P.vy = 0;
      } else if (surface.y > P.y + 1.8) {
        P.x -= forwardX * P.speed * dt * 1.1;
        P.z -= forwardZ * P.speed * dt * 1.1;
        P.speed *= 0.25;
        P.shake = Math.max(P.shake, 0.35);
      } else if (surface.y < P.y - 1.5) {
        P.grounded = false;
        P.vy = -1;
        P.onVehicle = null;
      } else {
        P.y = surface.y;
        P.onVehicle = surface.kind === "vehicle" ? surface.vehicle : null;
      }
    }

    if (!P.grounded) {
      const beforeY = P.y;
      P.vy -= 27 * dt;
      P.vy = Math.max(P.vy, -46);
      P.y += P.vy * dt;
      P.airTime += dt;
      const surface = findSurface();
      if (surface && P.vy <= 0 && P.y <= surface.y && beforeY >= surface.y - 3.5) {
        landOn(surface);
      }
    }

    if (mode === "playing") {
      if (P.route === "coast" && P.y < SEA_LEVEL + 0.5) {
        wreck("Splashed");
      } else if (P.route === "canyon" && P.y < route.killY) {
        wreck("Lost in the gully");
      } else if (P.route === "skyway" && P.y < route.killY) {
        wreck("Lost to the void");
      }
    }

    if (mode === "playing") {
      const gates = checkpointsAndFinish(route);
      while (P.checkpointIndex < gates.length && progress >= gates[P.checkpointIndex]!) {
        const isFinish = P.checkpointIndex === gates.length - 1;
        if (isFinish) {
          completeRun();
          break;
        }
        P.checkpointIndex += 1;
        P.lastCheckpointP = gates[P.checkpointIndex - 1]!;
        const points = Math.round(420 * P.combo);
        P.score += points;
        P.combo = Math.min(9, P.combo + 1);
        setBanner(`Checkpoint ${P.checkpointIndex} / ${gates.length - 1}`, 1.5);
        toast(`Checkpoint +${formatScore(points)}`);
        break;
      }
    }

    P.elapsed += dt;
    if (P.shake > 0) P.shake = Math.max(0, P.shake - dt * 2.2);
  }

  function syncPlayerVisual(now: number): void {
    const route = ROUTES[P.route];
    const roadNow = roadPose(route, clamp(-P.z, 0, route.length));
    const grounded = P.grounded;
    const pitch = grounded
      ? roadNow.pitch
      : clamp(P.vy * 0.022, -0.55, 0.55) + P.flipAngle;
    const visualYaw = -P.yaw;
    const roll = P.roll;
    const root: Vec3 = [P.x, P.y + 0.02, P.z];

    playerCar.setPosition(root[0], root[1], root[2]).setRotation(pitch, visualYaw, roll).setVisible(true);

    const lightWorld = rotateLocal(root, pitch, visualYaw, roll, [0, 0.7, 2.1]);
    lightbar.setPosition(lightWorld[0], lightWorld[1], lightWorld[2]).setRotation(pitch, visualYaw, roll);
    const hlLeft = rotateLocal(root, pitch, visualYaw, roll, [-0.72, 0.55, -2.06]);
    const hlRight = rotateLocal(root, pitch, visualYaw, roll, [0.72, 0.55, -2.06]);
    headlightL.setPosition(hlLeft[0], hlLeft[1], hlLeft[2]).setRotation(pitch, visualYaw, roll);
    headlightR.setPosition(hlRight[0], hlRight[1], hlRight[2]).setRotation(pitch, visualYaw, roll);

    const flameOn = P.thrusting || P.boosting;
    const flicker = 0.86 + (Math.sin(now * 0.04) + 1) * 0.18;
    const rearOffsets: readonly Vec3[] = [
      [-0.55, 0.4, 2.32],
      [0.55, 0.4, 2.32]
    ];
    [plumeRearL, plumeRearR].forEach((plume, index) => {
      const offset = rearOffsets[index]!;
      const world = rotateLocal(root, pitch, visualYaw, roll, offset);
      plume
        .setPosition(world[0], world[1], world[2])
        .setRotation(pitch + Math.PI / 2, visualYaw, roll)
        .setScale([1, flameOn ? flicker * 1.25 : 0.0001, 1])
        .setVisible(flameOn);
    });

    const downOffsets: readonly Vec3[] = [
      [-0.68, 0.16, -0.55],
      [0.68, 0.16, -0.55],
      [-0.68, 0.16, 0.72],
      [0.68, 0.16, 0.72]
    ];
    plumesDown.forEach((plume, index) => {
      const offset = downOffsets[index]!;
      const world = rotateLocal(root, pitch, visualYaw, roll, offset);
      plume
        .setPosition(world[0], world[1], world[2])
        .setRotation(pitch, visualYaw, roll)
        .setScale([1, P.thrusting ? flicker * 1.1 : 0.0001, 1])
        .setVisible(P.thrusting);
    });

    const surface = findSurface();
    if (surface && P.y - surface.y < 48) {
      const scale = clamp(1 - (P.y - surface.y) / 64, 0.22, 1);
      contactShadow
        .setPosition(P.x, surface.y + 0.05, P.z)
        .setRotation(0, visualYaw, 0)
        .setScale([scale, 1, scale])
        .setVisible(true);
    } else {
      contactShadow.setVisible(false);
    }
  }

  function updateMarker(now: number): void {
    const gates = checkpointsAndFinish(ROUTES[currentRoute]);
    const show = mode !== "menu" && mode !== "complete" && P.checkpointIndex < gates.length;
    if (!show) {
      markerRing.setVisible(false);
      markerBeam.setVisible(false);
      return;
    }
    const progress = gates[P.checkpointIndex]!;
    const pose = roadPose(ROUTES[currentRoute], progress);
    markerRing
      .setPosition(pose.x, pose.y + 6.4, -progress)
      .setRotation(0, 0, now * 0.0008)
      .setVisible(true);
    const pulse = 0.8 + (Math.sin(now * 0.004) + 1) * 0.2;
    markerBeam
      .setPosition(pose.x, pose.y + 8.4, -progress)
      .setScale([pulse, 1, pulse])
      .setVisible(true);
  }

  function blendCamera(eye: Vec3, target: Vec3, fov: number, dt: number, snap: boolean): void {
    const k = snap ? 1 : 1 - Math.exp(-dt * (mode === "menu" || mode === "complete" ? 2.4 : 7));
    camEye = [
      camEye[0] + (eye[0] - camEye[0]) * k,
      camEye[1] + (eye[1] - camEye[1]) * k,
      camEye[2] + (eye[2] - camEye[2]) * k
    ];
    camTarget = [
      camTarget[0] + (target[0] - camTarget[0]) * k,
      camTarget[1] + (target[1] - camTarget[1]) * k,
      camTarget[2] + (target[2] - camTarget[2]) * k
    ];
    camFov += (fov - camFov) * k;
    cameraRig.camera?.setPose?.({ position: camEye, target: camTarget, fov: camFov });
  }

  function updateCamera(dt: number): void {
    const snap = cameraSnap;
    cameraSnap = false;
    const route = ROUTES[P.route];

    if (mode === "menu" || mode === "complete") {
      menuAngle += dt * 0.18;
      const anchorProgress = mode === "menu" ? 34 : clamp(-P.z, 0, route.length);
      const anchor = roadPose(route, anchorProgress);
      const anchorY = mode === "menu" ? anchor.y : Math.max(P.y, anchor.y);
      const eye: Vec3 = [
        anchor.x + Math.sin(menuAngle) * 17,
        anchorY + 8.5 + Math.sin(menuAngle * 0.7) * 1.6,
        -anchorProgress + 13 + Math.cos(menuAngle) * 11
      ];
      const target: Vec3 = [
        anchor.x + Math.sin(menuAngle * 0.4) * 2,
        anchorY + 1.6,
        -anchorProgress - 24
      ];
      blendCamera(eye, target, 55, dt, snap);
      return;
    }

    const forwardX = Math.sin(P.yaw);
    const forwardZ = -Math.cos(P.yaw);
    const speed = Math.abs(P.speed);
    const fov = clamp(58 + speed * 0.22 + (P.boosting ? 7 : 0), 58, 90);
    const behind = 10.5 + speed * 0.035;
    const roadNow = roadPose(route, clamp(-P.z, 0, route.length));
    const eye: Vec3 = [
      P.x - forwardX * behind,
      Math.max(P.y + 4.6, roadNow.y + 2.2),
      P.z - forwardZ * behind
    ];
    if (P.shake > 0) {
      eye[0] += (Math.random() - 0.5) * P.shake * 2.6;
      eye[1] += (Math.random() - 0.5) * P.shake * 1.8;
    }
    const target: Vec3 = [P.x + forwardX * 10, P.y + 1.6, P.z + forwardZ * 10];
    blendCamera(eye, target, fov, dt, snap);
  }

  function refreshHud(): void {
    const route = ROUTES[P.route];
    hudRouteName.textContent = route.name;
    hudRouteSub.textContent = route.tagline;
    speedEl.textContent = String(Math.round(Math.abs(P.speed) * 3.6));
    scoreEl.textContent = formatScore(P.score);
    comboEl.classList.toggle("on", P.combo > 1);
    comboEl.textContent = `x${P.combo}`;
    const cap = nitroCapacity();
    heatFill.style.width = `${clamp(P.heat, 0, 100)}%`;
    heatBar.classList.toggle("overheated", P.overheated);
    heatPct.textContent = `${Math.round(P.heat)}%`;
    nitroFill.style.width = `${clamp((P.nitro / cap) * 100, 0, 100)}%`;
    nitroPct.textContent = `${Math.round((P.nitro / cap) * 100)}%`;
    const progress = clamp(-P.z / route.length, 0, 1);
    progressFill.style.width = `${progress * 100}%`;
    timeEl.textContent = formatTime(P.elapsed);
    creditsEl.textContent = formatScore(career.credits);
    const checkpointsPassed = Math.min(P.checkpointIndex, checkpointProgress(route).length);
    cpLabel.textContent =
      checkpointsPassed >= checkpointProgress(route).length
        ? "Finish ahead"
        : `Checkpoint ${checkpointsPassed + 1} / ${checkpointProgress(route).length}`;
    cpDots.forEach((dot, index) => {
      dot.classList.toggle("done", index < checkpointsPassed);
      dot.classList.toggle(
        "next",
        index === checkpointsPassed && checkpointsPassed < checkpointProgress(route).length
      );
    });
  }

  function publishEvidence(): void {
    const route = ROUTES[currentRoute];
    const evidence = {
      route: currentRoute,
      engine: "@aura3d/engine@4.0.2",
      ready: true,
      mode,
      paused: mode === "paused",
      score: Math.round(P.score),
      distance: Math.round(-P.z),
      progressPercent: Math.round((clamp(-P.z / route.length, 0, 1) * 1000)) / 10,
      checkpointsPassed: Math.min(P.checkpointIndex, 3),
      checkpointsTotal: 3,
      speedKmh: Math.round(Math.abs(P.speed) * 3.6),
      credits: career.credits,
      upgrades: { ...career.upgrades },
      player: {
        position: [round2(P.x), round2(P.y), round2(P.z)] as Vec3,
        grounded: P.grounded,
        onVehicle: P.onVehicle?.kind ?? null,
        heat: Math.round(P.heat),
        nitro: Math.round(P.nitro),
        boosting: P.boosting,
        thrusting: P.thrusting
      },
      routes: ROUTE_ORDER.map((id) => ({
        id,
        name: ROUTES[id].name,
        length: ROUTES[id].length,
        completed: career.best[id].completed,
        bestScore: career.best[id].score
      })),
      trafficSlots: TRAFFIC_PLAN.length,
      ledgesOnRoute: LEDGES[currentRoute].length,
      framesRendered
    };
    const evidenceWindow = window as Window & {
      __AURA3D_GAME_EVIDENCE__?: unknown;
      __AURA3D_ROADSTER_HOURS__?: unknown;
    };
    evidenceWindow.__AURA3D_GAME_EVIDENCE__ = evidence;
    evidenceWindow.__AURA3D_ROADSTER_HOURS__ = {
      app,
      evidence,
      startRoute,
      selectRoute,
      getState: () => evidence
    };
  }

  function teleport(progress: number): void {
    const route = ROUTES[currentRoute];
    const target = clamp(progress, 0, route.length - 40);
    const pose = roadPose(route, target);
    P.x = pose.x;
    P.y = pose.y + 0.05;
    P.z = -target;
    P.yaw = pose.yaw;
    P.speed = 0;
    P.vy = 0;
    P.grounded = true;
    P.onVehicle = null;
    P.lastCheckpointP = target;
    P.checkpointIndex = checkpointsAndFinish(route).filter((gate) => gate <= target).length;
    cameraSnap = true;
  }

  function frame(rawDt: number): void {
    const dt = clamp(rawDt, 0.001, 0.05);
    framesRendered += 1;

    if (mode === "playing") {
      stepPlayer(dt);
    } else if (mode === "wrecked") {
      wreckTimer -= dt;
      P.roll += dt * 2.4;
      if (wreckTimer <= 0) respawn();
    }

    updateTraffic(dt, mode === "playing");
    syncPlayerVisual(performance.now());
    updateMarker(performance.now());
    updateCamera(dt);

    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) bannerEl.classList.remove("on");
    }
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toastEl.classList.remove("on");
    }

    hudAccumulator += dt;
    if (hudAccumulator >= 0.08) {
      hudAccumulator = 0;
      if (mode !== "menu" && mode !== "complete") refreshHud();
    }
    evidenceAccumulator += dt;
    if (evidenceAccumulator >= 0.5) {
      evidenceAccumulator = 0;
      publishEvidence();
    }

    pressed.clear();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.code === "Escape" || event.code === "KeyP") {
      event.preventDefault();
      if (!event.repeat) togglePause();
      return;
    }
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "KeyQ",
        "KeyE",
        "Space",
        "ShiftLeft",
        "ShiftRight",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight"
      ].includes(event.code)
    ) {
      event.preventDefault();
    }
    if (!event.repeat) pressed.add(event.code);
    keys.add(event.code);
  }

  function onKeyUp(event: KeyboardEvent): void {
    keys.delete(event.code);
  }

  function bindTouchControls(): void {
    for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".touch-btn"))) {
      const code = button.dataset.key;
      if (!code) continue;
      const press = (event: PointerEvent): void => {
        event.preventDefault();
        keys.add(code);
        pressed.add(code);
        button.classList.add("active");
        button.setPointerCapture(event.pointerId);
      };
      const release = (): void => {
        keys.delete(code);
        button.classList.remove("active");
      };
      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("pointerleave", release);
    }
  }

  for (const card of routeCards) {
    card.addEventListener("click", () => {
      const id = card.dataset.route;
      if (!isRouteId(id)) return;
      selectRoute(id);
    });
  }
  startButton.addEventListener("click", () => startRoute(selectedRoute));
  resumeButton.addEventListener("click", resumeGame);
  restartButton.addEventListener("click", () => startRoute(currentRoute));
  routeSelectButton.addEventListener("click", showMenu);
  resultsSelect.addEventListener("click", showMenu);
  resultsReplay.addEventListener("click", () => startRoute(currentRoute));
  resultsNext.addEventListener("click", () => startRoute(nextRouteId()));

  buildGarage();
  refreshStartScreen();
  refreshHud();
  refreshTrafficVisibility();
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  bindTouchControls();

  const params = new URLSearchParams(window.location.search);
  const requestedRoute = params.get("route");
  if (isRouteId(requestedRoute)) {
    selectedRoute = requestedRoute;
    parkAt(requestedRoute);
    refreshStartScreen();
  }
  const autostart = params.get("autostart") === "1";
  const requestedProgress = Number(params.get("progress"));

  await app.ready();
  boot.classList.add("done");
  window.setTimeout(() => boot.remove(), 650);
  document.body.dataset.aura3dReady = "true";
  canvas.dataset.ready = "true";

  app.onFrame(({ dt }) => frame(dt));
  if (autostart) {
    startRoute(selectedRoute);
    if (Number.isFinite(requestedProgress) && requestedProgress > 0) {
      teleport(requestedProgress);
    }
  }
  app.resume();
  publishEvidence();
}

void bootRoadsterHours();
