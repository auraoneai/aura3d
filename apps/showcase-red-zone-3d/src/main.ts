/**
 * Red Zone 3D — app wiring.
 *
 * Fresh self-contained TypeScript route (no legacy JS bridge):
 *   sim (src/game/sim.ts) drives rules/AI → this file renders the sim via
 *   14 primitive-built articulated athletes, the field/stadium nodes, a
 *   broadcast camera director, DOM HUD, juice/audio layers, and the four
 *   window evidence globals every showcase route publishes.
 */
import {
  camera,
  createAuraApp,
  createGameAudio,
  effects,
  game,
  looks,
  material,
  scene
} from "@aura3d/engine";
import {
  createJuice,
  createOverlayDriver,
  createRumbleDriver,
  createTweenEngine,
  createFxParticlePass,
  mountTouchControls
} from "@aura3d/engine/game";
import { assets } from "./aura-assets-v2";

import { FIELD, type Club, type GameMode, type GameState, type SimCommand, type Stadium, type StudioState } from "./game/types";
import { CLUBS, clubById } from "./game/teams";
import { STADIUMS, stadiumById } from "./game/stadiums";
import { buildFieldNodes, buildPlayNodes, buildStadiumNodes } from "./game/field";
import { buildAthleteNodes, hideRig, resolveRig, retintRig, updateFootballRig, type RigHandles } from "./game/rig";
import { createSim, type Sim } from "./game/sim";
import { createAutopilot } from "./game/ai";
import { createDirector } from "./game/director";
import { createHud, renderPlayCards, showHud, updateHud, updateVenueBanner, banner, bigCall, ticker } from "./game/hud";
import { publishEvidence } from "./game/evidence";
import * as series from "./game/series";
import "../../showcase-port-shared/quickbar.css";
import { installBlackFrameGuard } from "../../showcase-port-shared/blackframe";

installBlackFrameGuard();

type Vec3 = [number, number, number];
type JuiceCamera = { readonly shake: { add(n: number): void }; readonly punch: { trigger(o: Record<string, unknown>): void }; evidence(): unknown };
type JuiceSession = { readonly reducedMotion: boolean; readonly reducedFlash: boolean; hitStop(s: number, o?: unknown): void; slowMo(s: number, ms: number, o?: unknown): void };

const LOOK_ID = "interior-industrial" as const;
const ATHLETE_IDS = [
  "off-qb", "off-c", "off-rb", "off-wl", "off-sl", "off-sr", "off-wr",
  "def-dl1", "def-dl2", "def-lb1", "def-lb2", "def-cb1", "def-cb2", "def-s"
] as const;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

const params = new URLSearchParams(location.search);
let autopilotMode = params.get("autoplay") === "1" || params.get("demo") === "1";
let appReady = false;
const LITE = params.has("lite");

// capture probe: log every fetch so remote captures reveal missing files
if (autopilotMode || params.has("probe")) {
  const of = window.fetch.bind(window);
  window.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    try {
      const res = await of(input, init);
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok) console.warn(`[rz3d:fetch] ${res.status} ${url}`);
      else if (/\.(json|glb|hdr|ktx2|f32|wasm|bin)(\?|$)/i.test(url) && /html/i.test(ct)) console.warn(`[rz3d:fetch] HTML-FALLBACK ${url} ct=${ct}`);
      else if (/\.(json|glb|hdr|ktx2|f32|wasm|bin)(\?|$)/i.test(url)) console.log(`[rz3d:fetch] ok ${res.status} ${url}`);
      return res;
    } catch (e) { console.warn(`[rz3d:fetch] FAIL ${url} ${e}`); throw e; }
  }) as typeof fetch;
}
const reducedMotion = params.has("reducedMotion") || (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
const reducedFlash = params.has("reducedFlash") || (window.matchMedia?.("(prefers-reduced-flash: reduce)")?.matches ?? false);
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

let currentVenue: Stadium = stadiumById(params.get("venue") ?? "friday");
let userClub: Club = clubById(params.get("club") ?? "forge");
let cpuClub: Club = clubById("steel");
let studio: StudioState = { clubId: userClub.id, jersey: userClub.colors.primary, pants: userClub.colors.pants, helmet: userClub.colors.helmet, visor: userClub.colors.visor };
let currentMode: GameMode = "idle";
let inMenu = params.get("mode") === "menu";
let currentSeries: series.Series | null = null;
let seriesRound = 0;
let framesRendered = 0;
let hitStopUntil = 0;

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderError = document.getElementById("render-error") as HTMLElement | null;

function buildScene(): any {
  const s = scene()
    // Interior-industrial's default backdrop is near-black; a pulled-back
    // broadcast camera now sees above the far stand, so give that band a cold
    // night-sky tone and a breath of haze for depth.
    .background("#0e2030")
    .add(looks.preset(LOOK_ID, { fogDensityScale: 0, exposureEv: 0.0 }))
    .addMany(buildFieldNodes(userClub.colors.primary, cpuClub.colors.primary))
    .addMany(buildStadiumNodes(currentVenue, LITE))
    .addMany(buildPlayNodes());
  for (const id of ATHLETE_IDS) s.addMany(buildAthleteNodes(id, { jersey: "#888", pants: "#333", helmet: "#222", visor: "#aaa", skin: "#8a5f42", ring: "#ffb224" }));
  if (!LITE) {
    s.add(effects.contactShadows({ intensity: 0.85, length: 0.32 } as any))
      .add(effects.motionBlur({ intensity: 0.08 } as any))
      .add(effects.fog({ density: 0.0019, color: "#0e1c26", intensity: 0.06 } as any))
      .add(effects.vignette({ intensity: 0.14, smoothness: 0.7 } as any));
  }
  s.add(effects.bloom({ intensity: 0.18, threshold: 0.85 }))
    .camera(camera.perspective({ position: [0, 21, -38], target: [0, 0.8, 44], fov: 43 }));
  return s;
}

let auraApp: ReturnType<typeof createAuraApp> | null = null;
try {
  auraApp = createAuraApp(canvas, {
    scene: buildScene(),
    ...looks.appOptions(LOOK_ID),
    qualityRebuild: { flags: ["game"] },
    ...(LITE ? { pixelRatio: 1 } : {})
  } as any);
} catch (e) {
  console.error("[rz3d] createAuraApp failed", e);
  renderError?.removeAttribute("hidden");
}

if (!auraApp) throw new Error("Aura app failed to mount");

const req = (id: string) => (auraApp as any).nodes.require(id);
const tryReq = (id: string) => { try { return req(id); } catch { return null; } };

const ballHandle = tryReq("football");
const ballLacesHandle = tryReq("football-laces");
const ballShadowHandle = tryReq("football-shadow");
const losMarkerHandle = tryReq("los-marker");
const fdMarkerHandle = tryReq("fd-marker");
const aimRingHandle = tryReq("aim-ring");
const landRingHandle = tryReq("land-ring");
const snowHandle = tryReq("weather-snow");
const rainHandle = tryReq("weather-rain");
const breathFogHandle = tryReq("breath-fog");
const confettiHandle = tryReq("confetti-cannon");
const pyroL = tryReq("pyro-l");
const pyroR = tryReq("pyro-r");
const domeHandle = tryReq("dome-shell");
const refereeHandle = tryReq("rz-referee");
const scoreboardHandle = tryReq("scoreboard-screen");
const ezHomeHandle = tryReq("ez-home");
const ezAwayHandle = tryReq("ez-away");
const turfHandle = tryReq("field-turf");
const labConeA = tryReq("lab-cone-a");
const labConeB = tryReq("lab-cone-b");
const waverHandles = Array.from({ length: 14 }, (_, i) => tryReq(`waver-${i}`));
const hoardingHandles = ["hoard-near-l", "hoard-near-r", "hoard-far-l", "hoard-far-r"].map((n) => tryReq(n));
const ribbonHandles = [tryReq("ribbon-l"), tryReq("ribbon-r")];

const rigHandles: Record<string, RigHandles> = {};
for (const id of ATHLETE_IDS) {
  try { rigHandles[id] = resolveRig(auraApp, id); } catch (e) { console.warn(`[rz3d] rig ${id} missing`, e); }
}

const ik = (game as any).racketSports(0x5eed);

/* ------------------------------------------------------------------ */
/* Systems: event log, audio, juice, touch                             */
/* ------------------------------------------------------------------ */

const hud = createHud();
const eventLog = (game as any).eventLog({ label: "red-zone-3d events", maxEvents: 48 });
const touchBindings = { up: "up", down: "down", left: "left", right: "right" };
let touchControls: any = null;

let audio: any = null;
let juice: ReturnType<typeof createJuice> | null = null;

const JUICE_EVENTS: Record<string, any> = {
  snap:      { fx: { kind: "dust", count: 6, color: "#cfd6c8", speed: 1.6 }, cue: "snap" },
  throw:     { fx: { kind: "streak", count: 8, color: "#ffd76a", speed: 4.0 }, cue: "throw" },
  catch:     { fx: { kind: "spark", count: 12, color: "#7dfcff", speed: 3.4 }, cue: "catch", punch: { fovDeg: 1.4, ms: 160 } },
  incomplete:{ cue: "whistle", flash: { color: "#ff9a3d", peak: 0.08, ms: 110 } },
  interception:{ fx: { kind: "ring", count: 20, color: "#ff3b30", speed: 5.0 }, cue: "turnover", shake: 0.4, punch: { fovDeg: 2.6, ms: 260 }, flash: { color: "#ff3b30", peak: 0.16, ms: 160 } },
  tip:       { cue: "tip" },
  tackle:    { fx: { kind: "dust", count: 10, color: "#9fb08a", speed: 2.6 }, cue: "hit", rumble: { ms: 40, weak: 0.5 } },
  truckHit:  { fx: { kind: "spark", count: 14, color: "#ffb224", speed: 4.2 }, cue: "bigHit", shake: 0.35, rumble: { ms: 70, strong: 0.7 } },
  hitstick:  { fx: { kind: "spark", count: 18, color: "#ff7a1a", speed: 5.0 }, cue: "bigHit", shake: 0.5, rumble: { ms: 90, strong: 0.9, weak: 0.5 }, punch: { fovDeg: 2.0, ms: 200 } },
  whiff:     { cue: "whiff" },
  juke:      { fx: { kind: "dust", count: 8, color: "#d8ff3e", speed: 2.8 }, cue: "juke" },
  truck:     { cue: "truck" },
  dive:      { cue: "dive" },
  touchdown: { fx: { kind: "ring", count: 26, color: "#ffb224", speed: 6.0 }, cue: "td", shake: 0.5, punch: { fovDeg: 3.4, dolly: -0.5, ms: 380 }, flash: { color: "#ffb224", peak: 0.22, ms: 240 }, hitStop: 0.06 },
  pat:       { cue: "pat" },
  firstdown: { cue: "firstdown", punch: { fovDeg: 1.2, ms: 160 } },
  whistle:   { cue: "whistle" },
  sack:      { fx: { kind: "dust", count: 14, color: "#ff9a3d", speed: 3.2 }, cue: "sack", shake: 0.3 },
  turnover:  { cue: "turnover", shake: 0.35 },
  gameWin:   { cue: "win", shake: 0.4, punch: { fovDeg: 2.4, ms: 320 } },
  matchWin:  { cue: "win", shake: 0.55, punch: { fovDeg: 3.6, ms: 420 }, flash: { color: "#ffd76a", peak: 0.24, ms: 260 } },
  quarter:   { cue: "quarter" },
  ot:        { cue: "ot", flash: { color: "#7dfcff", peak: 0.16, ms: 200 } },
  audible:   { cue: "audible" },
  confirm:   { cue: "confirm" },
  win:       { cue: "win" },
  lose:      { cue: "lose" },
  safety:    { cue: "safety", shake: 0.4 }
};

function juiceFire(ev: string, at?: Record<string, unknown>) {
  try { juice?.fire(ev as never, at as never); } catch { /* best-effort */ }
}

function pushEvent(type: string, label: string, severity: "info" | "success" | "warn" = "info", value?: number) {
  eventLog.push({ type, label, severity, value, time: performance.now() / 1000, frame: framesRendered });
  ticker(hud, label, severity);
}

const simEvents = {
  call: (type: string, label: string, severity?: "info" | "success" | "warn", value?: number) => {
    pushEvent(type, label, severity ?? "info", value);
    sim.state.lastCall = label;
  },
  juice: (event: string, at?: { position?: Vec3; strength?: number }) => {
    juiceFire(event, at as any);
    if (event === "touchdown") fireScoreFx(at?.position);
    if (event === "matchWin" || event === "gameWin") fireConfetti();
  },
  bigCall: (text: string) => bigCall(hud, text),
  cue: (name: string) => { void audio?.cue(cueMap(name)); }
};

const cueMap = (n: string) => ({
  snap: "snap", throw: "throw", catch: "catch", incomplete: "whistle", whistle: "whistle",
  hit: "hit", bigHit: "bigHit", td: "td", pat: "pat", firstdown: "firstdown", sack: "sack",
  turnover: "turnover", quarter: "quarter", ot: "ot", audible: "audible", confirm: "confirm",
  win: "win", lose: "lose", tip: "tip", whiff: "whiff", juke: "juke", truck: "truck", dive: "dive", safety: "safety"
} as Record<string, string>)[n] ?? "hit";

let confettiUntil = 0;
function fireConfetti() {
  const now = performance.now() / 1000;
  if (now < confettiUntil) return;
  confettiUntil = now + 5;
  confettiHandle?.setVisible(true).setPosition(0, 4.2, 50);
  window.setTimeout(() => confettiHandle?.setVisible(false), 5000);
}
function fireScoreFx(at?: Vec3) {
  fireConfetti();
  pyroL?.setVisible(true); pyroR?.setVisible(true);
  if (at) { pyroL?.setPosition(-FIELD.HALF_WIDTH - 1, 0.6, at[2]); pyroR?.setPosition(FIELD.HALF_WIDTH + 1, 0.6, at[2]); }
  window.setTimeout(() => { pyroL?.setVisible(false); pyroR?.setVisible(false); }, 1400);
  void audio?.cue("crowd");
}

/* ------------------------------------------------------------------ */
/* Sim                                                                 */
/* ------------------------------------------------------------------ */

const sim: Sim = createSim({ events: simEvents, seed: 0x7ed2f00d });
const autopilot = createAutopilot(sim.rng);
const director = createDirector();

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

const keys = new Set<string>();
const pendingPressed = new Set<string>();
let lastKeys = new Set<string>();
const pressed = (code: string) => pendingPressed.has(code) || (keys.has(code) && !lastKeys.has(code));
const activeKey = (code: string) => keys.has(code) || pendingPressed.has(code);

window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT") return;
  keys.add(e.code);
  pendingPressed.add(e.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => { keys.clear(); pendingPressed.clear(); });

const touchInput = { moveX: 0, moveZ: 0, throwHeld: false, juke: false, truck: false, dive: false, tackle: false, ballHawk: false };
let userIdleT = 99;

function readCommand(state: GameState): SimCommand {
  if (autopilotMode) return autopilot.command(state, 1 / 60);
  const hasInput =
    keys.size > 0 ||
    pendingPressed.size > 0 ||
    touchInput.moveX !== 0 ||
    touchInput.moveZ !== 0 ||
    touchInput.throwHeld ||
    touchInput.tackle ||
    touchInput.juke ||
    touchInput.truck ||
    touchInput.dive ||
    touchInput.ballHawk;
  userIdleT = hasInput ? 0 : userIdleT + 1 / 60;

  const cmd: SimCommand = {};
  const mvX = (activeKey("KeyD") || activeKey("ArrowRight") ? 1 : 0) - (activeKey("KeyA") || activeKey("ArrowLeft") ? 1 : 0) + touchInput.moveX;
  const mvZ = (activeKey("KeyW") || activeKey("ArrowUp") ? 1 : 0) - (activeKey("KeyS") || activeKey("ArrowDown") ? 1 : 0) + touchInput.moveZ;
  cmd.moveX = clampN(mvX, -1, 1);
  cmd.moveZ = clampN(mvZ, -1, 1);
  const space = activeKey("Space") || touchInput.throwHeld || touchInput.tackle;

  if (state.phase === "preSnap") {
    if (pressed("Digit1") || pressed("Numpad1")) cmd.pickCard = 0;
    else if (pressed("Digit2") || pressed("Numpad2")) cmd.pickCard = 1;
    else if (pressed("Digit3") || pressed("Numpad3")) cmd.pickCard = 2;
    if (pressed("KeyQ")) cmd.audible = true;
    if (pressed("Space") || activeKey("Space") || pressed("Enter") || Math.hypot(cmd.moveX, cmd.moveZ) > 0.05) cmd.snap = true;
  } else if (state.phase === "patChoice") {
    if (pressed("Digit1") || pressed("Numpad1") || pressed("KeyK")) cmd.patKick = true;
    if (pressed("Digit2") || pressed("Numpad2") || pressed("KeyJ")) cmd.patGo = true;
  } else if (state.phase === "live") {
    const onOffense = state.possession === "user";
    if (onOffense) {
      const holding = state.ball.kind === "held" && state.ball.holder === state.userControlled;
      if (holding) {
        cmd.throwHeld = space;
        cmd.throwPressed = (pressed("Space") || pressed("KeyE")) && state.snapT > 0.1;
        cmd.throwReleased = !space && lastKeys.has("Space");
        if (pressed("Digit1") || pressed("Numpad1")) { cmd.throwReceiverIndex = 0; cmd.throwPressed = true; }
        else if (pressed("Digit2") || pressed("Numpad2")) { cmd.throwReceiverIndex = 1; cmd.throwPressed = true; }
        else if (pressed("Digit3") || pressed("Numpad3")) { cmd.throwReceiverIndex = 2; cmd.throwPressed = true; }
        else if (pressed("Digit4") || pressed("Numpad4")) { cmd.throwReceiverIndex = 3; cmd.throwPressed = true; }
      } else {
        if (pressed("Space")) cmd.dive = true;
        if (pressed("KeyJ") || touchInput.juke) cmd.juke = true;
        if (pressed("KeyK") || touchInput.truck) cmd.truck = true;
        if (pressed("KeyL") || touchInput.dive) cmd.dive = true;
      }
      if (pressed("KeyJ") || touchInput.juke) cmd.juke = true;
      if (pressed("KeyK") || touchInput.truck) cmd.truck = true;
      if (pressed("KeyL") || touchInput.dive) cmd.dive = true;
    } else {
      cmd.tackle = space;
      cmd.hitStick = space && keys.has("ShiftLeft") || space && keys.has("ShiftRight");
      if (cmd.hitStick) cmd.tackle = false;
      if (pressed("KeyE") || touchInput.ballHawk) cmd.ballHawk = true;
    }
  }
  if (pressed("KeyP") || pressed("Escape")) cmd.pause = true;
  return cmd;
}

document.addEventListener("rz-pick-card", ((e: CustomEvent) => {
  userIdleT = 0;
  if (sim.state.phase === "preSnap" && sim.state.possession === "user") {
    sim.selectCard(e.detail);
    sim.snapNow();
  }
}) as EventListener);

/* ------------------------------------------------------------------ */
/* Venue / team visual application                                     */
/* ------------------------------------------------------------------ */

function applyVenue() {
  const v = currentVenue;
  sim.setVenue(v.id);
  snowHandle?.setVisible(v.weather === "snow");
  rainHandle?.setVisible(v.weather === "rain");
  breathFogHandle?.setVisible(false);
  // Lower dome floor to y=-6.5 when active so its bottom never occludes the turf
  if (v.dome) {
    domeHandle?.setPosition(0, -6.5, 50).setScale([1.3, 1, 1.3]).setVisible(true);
  } else {
    domeHandle?.setPosition(0, -90, 50).setScale([0.0001, 0.0001, 0.0001]).setVisible(false);
  }
  turfHandle?.setMaterial(material.pbr({ color: v.turf, roughness: 0.88, metalness: 0.02 }));
  scoreboardHandle?.setMaterial(material.emissive({ color: "#0d2436", emissive: v.accent, emissiveIntensity: 0.72 }));
  for (const h of [...hoardingHandles, ...ribbonHandles]) {
    h?.setMaterial(material.emissive({ color: "#0e2b46", emissive: v.accent, emissiveIntensity: 0.55 }));
  }
  updateVenueBanner(hud, v);
  document.querySelectorAll<HTMLElement>("[data-aura-venue]").forEach((b) => b.classList.toggle("active", b.dataset.auraVenue === v.id));
}

const rigKitCache: Record<string, string> = {};
function applyRigKits(state: GameState) {
  if (!state.userTeam || !state.cpuTeam) return;
  for (const a of state.athletes) {
    const rig = rigHandles[a.id];
    if (!rig) continue;
    const club = a.unit === "offense"
      ? (state.possession === "user" ? state.userTeam : state.cpuTeam)
      : (state.possession === "user" ? state.cpuTeam : state.userTeam);
    const isUserTeam = club.id === state.userTeam.id;
    const kitKey = `${club.id}:${isUserTeam ? studio.jersey + studio.pants + studio.helmet + studio.visor : ""}`;
    if (rigKitCache[a.id] !== kitKey) {
      rigKitCache[a.id] = kitKey;
      retintRig(rig, {
        jersey: isUserTeam ? studio.jersey : club.colors.primary,
        pants: isUserTeam ? studio.pants : club.colors.pants,
        helmet: isUserTeam ? studio.helmet : club.colors.helmet,
        visor: isUserTeam ? studio.visor : club.colors.visor,
        skin: "#8a5f42",
        ring: club.colors.accent
      });
    }
  }
}

function applyEzColors(state: GameState) {
  if (!state.userTeam || !state.cpuTeam) return;
  ezHomeHandle?.setMaterial(material.pbr({ color: state.userTeam.colors.primary, roughness: 0.88, metalness: 0.02, opacity: 0.88 }));
  ezAwayHandle?.setMaterial(material.pbr({ color: state.cpuTeam.colors.primary, roughness: 0.88, metalness: 0.02, opacity: 0.88 }));
}

/* ------------------------------------------------------------------ */
/* Per-frame render updates                                            */
/* ------------------------------------------------------------------ */

const ballSpin = { t: 0 };

function updateBall(state: GameState, dt: number) {
  const b = state.ball;
  ballHandle?.setPosition(b.x, Math.max(0.21, b.y), b.z).setScale([1, 1, 1]).setVisible(true);
  if (b.kind === "air") {
    ballSpin.t += dt * 16;
    const yaw = Math.atan2(b.vx, b.vz);
    const pitch = Math.atan2(-b.vy, Math.hypot(b.vx, b.vz));
    ballHandle?.setRotation(pitch, yaw, ballSpin.t % (Math.PI * 2));
    ballLacesHandle?.setPosition(b.x, b.y, b.z).setRotation(Math.PI / 2 + pitch, yaw, 0).setScale([1, 1, 1]).setVisible(true);
  } else {
    ballLacesHandle?.setScale([0.0001, 0.0001, 0.0001]).setVisible(false);
  }
  const shScale = clampN(1 - b.y * 0.1, 0.35, 1.1);
  ballShadowHandle?.setPosition(b.x, 0.014, b.z).setScale([shScale, 1, shScale]).setVisible(true);
}

function updateMarkers(state: GameState) {
  const inGame = state.mode === "quickplay" || state.mode === "series";
  if (inGame && state.phase !== "idle" && state.phase !== "gameOver") {
    losMarkerHandle?.setPosition(0, 0.018, state.los).setScale([1, 1, 1]).setVisible(true);
    fdMarkerHandle?.setPosition(0, 0.02, state.firstDownLine).setScale([1, 1, 1]).setVisible(true);
  } else {
    losMarkerHandle?.setScale([0.0001, 0.0001, 0.0001]).setVisible(false);
    fdMarkerHandle?.setScale([0.0001, 0.0001, 0.0001]).setVisible(false);
  }
  const aiming = state.phase === "live" && state.possession === "user" && state.ball.kind === "held" && !state.carrier;
  if (aiming) {
    const pulse = 1 + Math.sin(state.gameT * 9) * 0.1;
    aimRingHandle?.setPosition(state.aim.x, 0.05, state.aim.z).setRotation(Math.PI / 2, 0, 0).setScale([pulse, pulse, pulse]).setVisible(true);
  } else aimRingHandle?.setScale([0.0001, 0.0001, 0.0001]).setVisible(false);
  if (state.ball.kind === "air") {
    landRingHandle?.setPosition(state.ball.aimX, 0.05, state.ball.aimZ).setRotation(Math.PI / 2, 0, 0).setScale([1, 1, 1]).setVisible(true);
  } else landRingHandle?.setScale([0.0001, 0.0001, 0.0001]).setVisible(false);
  const lab = state.mode === "tacklelab";
  labConeA?.setVisible(lab); labConeB?.setVisible(lab);
  if (lab) {
    labConeA?.setPosition(-8, 0.4, 96).setScale([1, 1, 1]);
    labConeB?.setPosition(8, 0.4, 96).setScale([1, 1, 1]);
  }
}

function updateRigs(state: GameState, dt: number) {
  const seen = new Set<string>();
  for (const a of state.athletes) {
    const rig = rigHandles[a.id];
    if (!rig) continue;
    seen.add(a.id);
    updateFootballRig(ik, rig, a, {
      active: a.id === state.userControlled,
      carrier: a.id === state.carrier || a.id === state.ball.holder
    });
  }
  for (const id of ATHLETE_IDS) {
    if (!seen.has(id) && rigHandles[id]) hideRig(rigHandles[id]);
  }
  void dt;
}

function updateWavers(state: GameState) {
  const t = state.gameT;
  const cheering = state.phase === "patChoice" || state.phase === "gameOver" || (state.lastGain > 12 && state.phase === "playOver");
  for (let i = 0; i < waverHandles.length; i++) {
    const h = waverHandles[i];
    if (!h) continue;
    const side = i % 2 ? -1 : 1;
    const z = 12 + i * 5.6;
    const bounce = cheering ? Math.abs(Math.sin(t * 8.5 + i * 1.3)) * 0.2 : Math.sin(t * 2 + i) * 0.025;
    h.setPosition(side * (FIELD.HALF_WIDTH + 5.8), 1.15 + bounce, z);
  }
  // Position the 3D Meshy backfield/sideline Referee behind the offense facing the play
  const refZ = clampN(state.los - state.dir * 8.5, -6, 106);
  const refX = -11.5 + Math.sin(t * 0.6) * 0.8;
  const refYaw = Math.atan2(state.ball.x - refX, state.ball.z - refZ);
  refereeHandle?.setPosition(refX, 0, refZ).setRotation(0, refYaw, 0).setScale([1, 1, 1]).setVisible(true);
}

/* ------------------------------------------------------------------ */
/* Game start helpers                                                  */
/* ------------------------------------------------------------------ */

function startMode(mode: GameMode, opts?: { cpu?: Club; seriesCtx?: { s: series.Series; round: number; oppSeed: number } }) {
  currentMode = mode;
  inMenu = false;
  closeMenu();
  const opp = opts?.cpu ?? cpuClub;
  cpuClub = opp;
  sim.startGame(mode, userClub, opp, {
    venue: currentVenue.id,
    quarterLen: mode === "series" ? 45 : 60,
    difficulty: mode === "series" ? 0.92 + seriesRound * 0.06 : 1.0
  });
  if (opts?.seriesCtx) {
    currentSeries = opts.seriesCtx.s;
    sim.state.series = {
      active: true, round: opts.seriesCtx.round, bracket: [], seed: [], userSeedSlot: opts.seriesCtx.s.userSeed,
      eliminated: false, champion: false
    };
  }
  applyVenue();
  applyEzColors(sim.state);
  showHud(hud, true);
  director.kickIntro();
  banner(hud, mode === "routelab" ? "ROUTE LAB" : mode === "tacklelab" ? "TACKLE LAB" : `${userClub.name} vs ${opp.name}`, 2.4);
}

function endToMenu() {
  currentMode = "idle";
  sim.stopGame();
  showHud(hud, false);
  director.setMenu();
  openMenu();
}

/* ------------------------------------------------------------------ */
/* Menu system                                                         */
/* ------------------------------------------------------------------ */

const menuRoot = document.getElementById("rz-menu") as HTMLElement;
const menuCard = document.getElementById("rz-menu-card") as HTMLElement;

function closeMenu() {
  menuRoot.classList.add("hidden");
}

function openMenu() {
  inMenu = true;
  menuRoot.classList.remove("hidden");
  renderMenu("main");
}

type MenuView = "main" | "clubs" | "venue" | "series" | "studio";
let menuView: MenuView = "main";
let pendingMode: GameMode = "quickplay";

function renderMenu(view: MenuView) {
  menuView = view;
  if (view === "main") return renderMainMenu();
  if (view === "clubs") return renderClubSelect();
  if (view === "venue") return renderVenueSelect();
  if (view === "series") return renderSeriesMenu();
  if (view === "studio") return renderStudio();
}

function renderMainMenu() {
  const seriesSaved = series.loadSeries();
  menuCard.innerHTML = `
    <div class="rz-kicker">RED ZONE 3D · AURA SLAM SPORTS</div>
    <h1>PRIME-TIME <em>FOOTBALL</em></h1>
    <div class="rz-kicker" style="margin-top:2px">${userClub.name} · ${currentVenue.label}</div>
    <div class="rz-menu-grid">
      <button class="rz-mode-btn" data-act="quick"><span class="rz-mode-no">01</span><strong>Quick Play</strong><span>Four 60-second quarters of 7v7 arcade football against the CPU.</span></button>
      <button class="rz-mode-btn" data-act="routelab"><span class="rz-mode-no">02</span><strong>Route Lab</strong><span>Eight timing throws against rotating coverage — thread the windows.</span></button>
      <button class="rz-mode-btn" data-act="tacklelab"><span class="rz-mode-no">03</span><strong>Tackle Lab</strong><span>Six open-field pursuit reps. Run the carrier down before the pylon.</span></button>
      <button class="rz-mode-btn" data-act="series"><span class="rz-mode-no">04</span><strong>Gridiron Series</strong><span>${seriesSaved && series.userAlive(seriesSaved) ? "Continue your 32-team bracket run." : "New 32-team playoff bracket — five games to the title."}</span></button>
      <button class="rz-mode-btn" data-act="studio"><span class="rz-mode-no">05</span><strong>Player Studio</strong><span>Dial in your club — jersey, pants, helmet, and visor colors.</span></button>
      <button class="rz-mode-btn" data-act="venue"><span class="rz-mode-no">06</span><strong>Venues</strong><span>Six stadiums — snow, rain, domes, and the thin-air Altitude Bowl.</span></button>
    </div>
    <div class="rz-menu-actions">
      <button class="rz-primary-btn" data-act="quick">Kick Off</button>
      ${currentMode !== "idle" ? `<button class="rz-ghost-btn" data-act="resume">Resume</button>` : ""}
    </div>`;
  bindMenuActions();
}

function renderClubSelect() {
  menuCard.innerHTML = `
    <div class="rz-kicker">CHOOSE YOUR CLUB — ${pendingMode === "series" ? "GRIDIRON SERIES" : pendingMode.toUpperCase()}</div>
    <h1>EIGHT <em>CLUBS</em></h1>
    <div class="rz-section"><div class="rz-chip-row">
      ${CLUBS.map((c) => `
        <button class="rz-chip ${c.id === userClub.id ? "active" : ""}" data-club="${c.id}">
          <span class="rz-chip-dot" style="background:${c.colors.primary}"></span>
          ${c.name} · ${c.identity.toUpperCase()} · OVR ${Math.round(c.rating * 99)}
        </button>`).join("")}
    </div></div>
    <div class="rz-menu-actions">
      <button class="rz-primary-btn" data-act="confirm-club">Run It</button>
      <button class="rz-ghost-btn" data-act="back">Back</button>
    </div>`;
  menuCard.querySelectorAll<HTMLElement>("[data-club]").forEach((b) => {
    b.onclick = () => {
      userClub = clubById(b.dataset.club!);
      studio.clubId = userClub.id;
      studio = { clubId: userClub.id, jersey: userClub.colors.primary, pants: userClub.colors.pants, helmet: userClub.colors.helmet, visor: userClub.colors.visor };
      sim.state.studio = { ...studio };
      menuCard.querySelectorAll(".rz-chip").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    };
  });
  bindMenuActions();
}

function renderVenueSelect() {
  menuCard.innerHTML = `
    <div class="rz-kicker">PICK A VENUE</div>
    <h1>SIX <em>STADIUMS</em></h1>
    <div class="rz-section"><div class="rz-chip-row">
      ${STADIUMS.map((v) => `
        <button class="rz-chip ${v.id === currentVenue.id ? "active" : ""}" data-venue="${v.id}" title="${v.blurb}">
          <span class="rz-chip-dot" style="background:${v.accent}"></span>
          ${v.label}${v.weather === "snow" ? " ❄" : v.weather === "rain" ? " ☂" : ""}${v.thinAir ? " ▲" : ""}
        </button>`).join("")}
    </div></div>
    <div class="rz-menu-actions"><button class="rz-ghost-btn" data-act="back">Back</button></div>`;
  menuCard.querySelectorAll<HTMLElement>("[data-venue]").forEach((b) => {
    b.onclick = () => {
      currentVenue = stadiumById(b.dataset.venue!);
      applyVenue();
      menuCard.querySelectorAll(".rz-chip").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    };
  });
  bindMenuActions();
}

function renderSeriesMenu() {
  const s = series.loadSeries();
  const alive = s && series.userAlive(s);
  const pending = s && alive ? series.userGamePending(s) : null;
  const pendingClub = s && pending ? series.clubOfSeed(s, pending.opponentSeedIdx) : null;
  let bracketHtml = "";
  if (s) {
    bracketHtml = `<div class="rz-bracket">` + s.rounds.map((rd, ri) => `
      <div class="rz-bracket-col"><h3>${series.roundName(ri)}</h3>
        ${rd.length === 0 ? `<div class="rz-bracket-game" style="opacity:.4">TBD</div>` : rd.map((g) => {
          const a = s.teams[g.a], b = s.teams[g.b];
          const cls = (w?: number) => `${g.winner === w ? "winner " : ""}${w === s.userSeed ? "user" : ""}`.trim();
          return `<div class="rz-bracket-game ${g.winner === undefined && (g.a === s.userSeed || g.b === s.userSeed) ? "next" : ""}">
            <div class="rz-bteam ${cls(g.a)}"><span>${clubById(a.clubId).abbr}${a.user ? " •YOU" : ""}</span><span>${g.aScore ?? "–"}</span></div>
            <div class="rz-bteam ${cls(g.b)}"><span>${clubById(b.clubId).abbr}${b.user ? " •YOU" : ""}</span><span>${g.bScore ?? "–"}</span></div>
          </div>`;
        }).join("")}
      </div>`).join("") + `</div>`;
  }
  menuCard.innerHTML = `
    <div class="rz-kicker">GRIDIRON SERIES — 32-TEAM BRACKET</div>
    <h1>ROAD TO THE <em>GRIDIRON BOWL</em></h1>
    ${s?.champion !== undefined ? `<div class="rz-kicker" style="color:#ffd76a;margin-top:6px">CHAMPION: ${clubById(s.teams[s.champion]!.clubId).name}${s.champion === s.userSeed ? " — YOU!" : ""}</div>` : ""}
    ${!alive && s ? `<div class="rz-kicker" style="color:#ff9a8a;margin-top:6px">ELIMINATED — START A NEW RUN</div>` : ""}
    ${pending && pendingClub ? `<div class="rz-kicker" style="color:var(--rz-accent);margin-top:6px">NEXT: ${series.roundName(pending.round)} vs ${pendingClub.name}</div>` : ""}
    ${bracketHtml}
    <div class="rz-menu-actions">
      ${pending && pendingClub ? `<button class="rz-primary-btn" data-act="series-play">Play ${series.roundName(pending.round)}</button>` : ""}
      <button class="rz-ghost-btn" data-act="series-new">${s ? "New Bracket" : "Start Bracket"}</button>
      <button class="rz-ghost-btn" data-act="back">Back</button>
    </div>`;
  bindMenuActions();
}

const SWATCHES = ["#f2a71b", "#38bdf8", "#dc2626", "#94a3b8", "#2dd4bf", "#c084fc", "#ea580c", "#e2e8f0", "#1c2430", "#f0fdfa"];

function renderStudio() {
  const field = (key: keyof StudioState, label: string) => `
    <div class="rz-studio-field"><label>${label}</label><div class="rz-swatch-row">
      ${SWATCHES.map((c) => `<button class="rz-swatch ${studio[key] === c ? "active" : ""}" data-part="${key}" data-color="${c}" style="background:${c}"></button>`).join("")}
    </div></div>`;
  menuCard.innerHTML = `
    <div class="rz-kicker">PLAYER STUDIO</div>
    <h1>BUILD YOUR <em>CLUB</em></h1>
    <div class="rz-kicker" style="margin-top:4px">${userClub.name} kit — live on the field</div>
    ${field("jersey", "Jersey")}
    ${field("pants", "Pants")}
    ${field("helmet", "Helmet")}
    ${field("visor", "Visor")}
    <div class="rz-menu-actions">
      <button class="rz-primary-btn" data-act="confirm-studio">Done</button>
      <button class="rz-ghost-btn" data-act="back">Back</button>
    </div>`;
  menuCard.querySelectorAll<HTMLElement>(".rz-swatch").forEach((b) => {
    b.onclick = () => {
      const part = b.dataset.part as keyof StudioState;
      studio[part] = b.dataset.color!;
      sim.state.studio = { ...studio };
      rigKitCacheClear();
      menuCard.querySelectorAll<HTMLElement>(`.rz-swatch[data-part="${part}"]`).forEach((x) => x.classList.toggle("active", x.dataset.color === studio[part]));
    };
  });
  bindMenuActions();
}

function rigKitCacheClear() { for (const k of Object.keys(rigKitCache)) delete rigKitCache[k]; }

function bindMenuActions() {
  menuCard.querySelectorAll<HTMLElement>("[data-act]").forEach((b) => {
    b.onclick = () => {
      const act = b.dataset.act!;
      if (act === "quick") { pendingMode = "quickplay"; renderMenu("clubs"); }
      else if (act === "routelab") startMode("routelab");
      else if (act === "tacklelab") startMode("tacklelab");
      else if (act === "series") renderMenu("series");
      else if (act === "studio") renderMenu("studio");
      else if (act === "venue") renderMenu("venue");
      else if (act === "clubs") renderMenu("clubs");
      else if (act === "back") renderMenu("main");
      else if (act === "resume") closeMenu();
      else if (act === "confirm-club") {
        cpuClub = CLUBS.filter((c) => c.id !== userClub.id)[Math.floor(sim.rng() * 7)]!;
        startMode(pendingMode);
      }
      else if (act === "confirm-studio") renderMenu("main");
      else if (act === "series-play") {
        const s = series.loadSeries();
        if (!s) return;
        const pending = series.userGamePending(s);
        if (!pending) { renderMenu("series"); return; }
        const oppClub = series.clubOfSeed(s, pending.opponentSeedIdx);
        seriesRound = pending.round;
        startMode("series", { cpu: oppClub, seriesCtx: { s, round: pending.round, oppSeed: pending.opponentSeedIdx } });
      }
      else if (act === "series-new") {
        series.clearSeries();
        const s = series.newSeries(userClub.id);
        series.saveSeries(s);
        // auto-sim all other round-1 games right away
        series.advanceRound(s, null);
        series.saveSeries(s);
        renderMenu("series");
      }
    };
  });
}

/* ------------------------------------------------------------------ */
/* Top bar wiring                                                      */
/* ------------------------------------------------------------------ */

document.getElementById("aura-btn-play")?.addEventListener("click", () => { pendingMode = "quickplay"; openMenu(); renderMenu("clubs"); });
document.getElementById("aura-btn-routelab")?.addEventListener("click", () => startMode("routelab"));
document.getElementById("aura-btn-tacklelab")?.addEventListener("click", () => startMode("tacklelab"));
document.getElementById("aura-btn-menu")?.addEventListener("click", () => { if (inMenu) closeMenu(); else openMenu(); });
const autoBtn = document.getElementById("aura-btn-auto");
autoBtn?.classList.toggle("active", autopilotMode);
autoBtn?.addEventListener("click", () => {
  autopilotMode = !autopilotMode;
  autoBtn.classList.toggle("active", autopilotMode);
  banner(hud, autopilotMode ? "AI AUTOPILOT ON" : "MANUAL CONTROL", 1.8);
});
document.querySelectorAll<HTMLElement>("[data-aura-venue]").forEach((b) => {
  b.addEventListener("click", () => {
    currentVenue = stadiumById(b.dataset.auraVenue!);
    applyVenue();
  });
});

/* ------------------------------------------------------------------ */
/* Systems init                                                        */
/* ------------------------------------------------------------------ */

function setupSystems() {
  const fxLayer = document.getElementById("rz-fx-layer") as HTMLElement;
  const a11y = (game as any).accessibility.settings([], { reducedMotion, reducedFlash, highContrast: params.has("highContrast") });
  const fxCtl = (game as any).effects({ app: auraApp, reducedMotion, reducedFlash });
  const FX_KIND_MAP: Record<string, string> = {
    spark: "hit-spark", dust: "ground-dust", debris: "hit-spark", ring: "ring-shockwave",
    streak: "dash-trail", pickup: "aura-burst"
  };
  const fx = createFxParticlePass({
    burst: (kind: string, position: any, o: any) => {
      try {
        fxCtl.spawn(FX_KIND_MAP[kind] ?? "hit-spark", position, { radius: Math.max(0.2, (o?.count ?? 10) / 24), color: o?.color, intensity: 1 });
      } catch { /* best-effort */ }
    },
    trail: () => { /* no persistent trails needed */ },
    liveCount: () => 0
  } as any);

  const sessionShim: JuiceSession = {
    reducedMotion,
    reducedFlash,
    hitStop: (seconds: number) => { hitStopUntil = performance.now() / 1000 + seconds; },
    slowMo: () => { /* not needed — hit-stop handles it */ }
  };

  let userInteracted = false;
  audio = createGameAudio({
    browserContext: false,
    cues: {
      snap:      { id: "snap", asset: assets.hoopsCheckSfx, volume: 0.4 },
      throw:     { id: "throw", asset: assets.hoopsSwishSfx, volume: 0.5 },
      catch:     { id: "catch", asset: assets.diamondConfirmSfx, volume: 0.55 },
      hit:       { id: "hit", asset: assets.hoopsBoardThudSfx, volume: 0.55 },
      bigHit:    { id: "bigHit", asset: assets.hoopsBlockSfx, volume: 0.7 },
      td:        { id: "td", asset: assets.hoopsFanfareSfx, volume: 0.85 },
      pat:       { id: "pat", asset: assets.diamondConfirmSfx, volume: 0.6 },
      firstdown: { id: "firstdown", asset: assets.diamondConfirmSfx, volume: 0.45 },
      sack:      { id: "sack", asset: assets.hoopsBlockSfx, volume: 0.6 },
      turnover:  { id: "turnover", asset: assets.hoopsBuzzerSfx, volume: 0.6 },
      whistle:   { id: "whistle", asset: assets.hoopsBuzzerSfx, volume: 0.4 },
      quarter:   { id: "quarter", asset: assets.hoopsBuzzerSfx, volume: 0.5 },
      ot:        { id: "ot", asset: assets.hoopsFanfareSfx, volume: 0.6 },
      audible:   { id: "audible", asset: assets.diamondClickSfx, volume: 0.4 },
      confirm:   { id: "confirm", asset: assets.diamondConfirmSfx, volume: 0.45 },
      win:       { id: "win", asset: assets.diamondHomerBigSfx, volume: 0.9 },
      lose:      { id: "lose", asset: assets.hoopsBuzzerSfx, volume: 0.7 },
      safety:    { id: "safety", asset: assets.hoopsBuzzerSfx, volume: 0.6 },
      tip:       { id: "tip", asset: assets.hoopsRimClankSfx, volume: 0.4 },
      whiff:     { id: "whiff", asset: assets.hoopsSwishSfx, volume: 0.35 },
      juke:      { id: "juke", asset: assets.hoopsSwishSfx, volume: 0.4 },
      truck:     { id: "truck", asset: assets.hoopsBoardThudSfx, volume: 0.5 },
      dive:      { id: "dive", asset: assets.hoopsCheckSfx, volume: 0.45 },
      crowd:     { id: "crowd", asset: assets.hoopsCrowdSfx, volume: 0.3, loop: true }
    },
    buses: [{ id: "sfx" } as any]
  } as any);
  const unlock = () => {
    userInteracted = true;
    void audio?.unlock();
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  const baseRumble = createRumbleDriver();
  const safeRumble = (opts: any) => {
    if (userInteracted) return baseRumble(opts);
  };

  juice = createJuice({
    events: JUICE_EVENTS as any,
    camera: (auraApp as any)?.camera as JuiceCamera,
    session: sessionShim,
    fx,
    overlay: createOverlayDriver({ domElement: fxLayer }),
    tweens: createTweenEngine(),
    rumble: safeRumble as any,
    sound: { cue: (cue: string) => { void audio?.cue(cue); } }
  } as any);

  // touch controls — dpad-4btn
  try {
    const keyFor = (binding: string): string =>
      ({ left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS", light: "Space", heavy: "KeyK", special: "KeyJ", jump: "Space", block: "KeyE" } as Record<string, string>)[binding] ?? binding;
    const sink = {
      press: (b: string) => window.dispatchEvent(new KeyboardEvent("keydown", { code: keyFor(b) })),
      release: (b: string) => window.dispatchEvent(new KeyboardEvent("keyup", { code: keyFor(b) })),
      setAction: (a: string, held: boolean) => {
        if (a === "light") touchInput.throwHeld = held;
        else window.dispatchEvent(new KeyboardEvent(held ? "keydown" : "keyup", { code: keyFor(a) }));
      }
    };
    touchControls = mountTouchControls(sink as any, {
      preset: "dpad-4btn",
      bindings: { "stick.left": "left", "stick.right": "right", "stick.up": "up", "stick.down": "down", left: "left", right: "right", light: "light", heavy: "heavy", special: "special", jump: "jump", block: "block" },
      haptics: { ms: 12 }
    } as any, {
      doc: document as any,
      root: document.querySelector(".game-shell") as any,
      coarsePointer: () => window.matchMedia?.("(pointer: coarse)")?.matches ?? false
    } as any);
  } catch (e) {
    console.warn("[rz3d] touch controls unavailable", e);
  }
  void touchBindings;
  void a11y;
}

setupSystems();
applyVenue();

/* ------------------------------------------------------------------ */
/* Series end-of-game bookkeeping                                       */
/* ------------------------------------------------------------------ */

let lastPhase = "";
function watchSeriesEnd(state: GameState) {
  if (currentMode !== "series" || !currentSeries || state.phase !== "gameOver" || lastPhase === "gameOver") return;
  const userWon = state.score.home > state.score.away;
  const pending = series.userGamePending(currentSeries);
  if (pending) {
    series.reportUserResult(currentSeries, pending.round, state.score.home, state.score.away);
    const next = series.advanceRound(currentSeries, userWon);
    series.saveSeries(currentSeries);
    if (!userWon) {
      pushEvent("series", "eliminated from the gridiron series", "warn");
    } else if (next) {
      pushEvent("series", `advance to ${series.roundName(next.round)}!`, "success");
    } else {
      const s = series.loadSeries();
      if (s && s.champion === s.userSeed) {
        pushEvent("series", "GRIDIRON BOWL CHAMPIONS!", "success");
        bigCall(hud, "GRIDIRON BOWL CHAMPIONS!");
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Frame loop                                                          */
/* ------------------------------------------------------------------ */

let prevNow = performance.now() / 1000;
let lastPhaseHud = "";

const MESHY_ASSETS_LIST = [
  "rzFootballMeshy", "rzQuarterbackMeshy", "rzDefenderLinemanMeshy", "rzFieldGoalPostMeshy",
  "rzFloodlightPylonMeshy", "rzScoreboardGantryMeshy",
  "rzChampionCupMeshy", "rzAltitudeDomeMeshy", "gallerySecurityGuardMeshy",
  "diamondDugout", "diamondStadium", "hoopsBallCart"
];

let frameErrorLogged = false;
function onFrame() {
  try { onFrameInner(); } catch (e) {
    if (!frameErrorLogged) { frameErrorLogged = true; console.error("[rz3d] frame error", e); }
  }
}
function onFrameInner() {
  const now = performance.now() / 1000;
  const dt = clampN(now - prevNow, 0.001, 0.05);
  prevNow = now;
  framesRendered += 1;

  const state = sim.state;
  const frozen = hitStopUntil > now && !reducedMotion;

  if (appReady && !frozen) {
    const cmd = readCommand(state);
    sim.step(dt, cmd);
  }
  lastKeys = new Set(keys);
  pendingPressed.clear();

  // visual updates
  applyRigKits(state);
  updateRigs(state, dt);
  updateBall(state, dt);
  updateMarkers(state);
  updateWavers(state);
  applyEzColors(state);

  // play-card sheet visibility
  const sheet = sim.getSheet();
  const showCards = appReady && state.phase === "preSnap" && state.possession === "user" && !inMenu && (state.mode === "quickplay" || state.mode === "series" || state.mode === "routelab");
  renderPlayCards(hud, sheet ? [...sheet] : [], sim.getSelectedCard(), Boolean(showCards && sheet));

  // camera + HUD
  const pose = director.update(appReady ? dt : 0, state, inMenu);
  try { (auraApp as any)?.camera?.setPose?.(pose); } catch { /* camera layer best-effort */ }
  updateHud(hud, state);
  if (!appReady) {
    banner(hud, "Loading 3D Stadium & Athletes...", 5);
  }

  // series bookkeeping on game end
  watchSeriesEnd(state);
  lastPhase = state.phase;

  // phase-change announcements for a11y
  if (state.phase !== lastPhaseHud) {
    lastPhaseHud = state.phase;
  }

  const athleteClips: Record<string, string> = {};
  for (const id of ATHLETE_IDS) {
    const r = rigHandles[id] as any;
    const clip = r?.activeClip || r?.lastClip;
    if (clip) athleteClips[id] = clip;
  }

  // evidence — every frame, all four globals
  publishEvidence(state, director, {
    framesRendered,
    ready: appReady,
    demo: autopilotMode,
    juice: (juice as any)?.snapshot?.() ?? null,
    audio: audio?.evidence ? { unlocked: audio.evidence.unlocked, cueCount: audio.evidence.cueCount, playedCueCount: audio.evidence.playedCueCount } : null,
    eventLog: eventLog.snapshot(),
    hud: (game as any).hud.snapshot({
      bindings: [],
      appState: {
        score: `${state.score.away}-${state.score.home}`,
        down: `${state.down}&${Math.ceil(state.toGo)}`,
        quarter: state.ot ? "OT" : `Q${state.quarter}`,
        venue: state.venue
      }
    }),
    accessibility: (game as any).accessibility.settings([], { reducedMotion, reducedFlash, highContrast: params.has("highContrast") }),
    touch: touchControls?.evidence?.() ?? null,
    meshyAssets: MESHY_ASSETS_LIST,
    athleteClips
  });
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

if (params.get("mode") === "menu") {
  openMenu();
} else if (params.get("mode") === "routelab") {
  startMode("routelab");
} else if (params.get("mode") === "tacklelab") {
  startMode("tacklelab");
} else {
  cpuClub = clubById("steel");
  startMode("quickplay", { cpu: cpuClub });
  pushEvent("system", "live drive — press WASD or Space to snap & drive, or 1/2/3 to call play", "info");
}

banner(hud, "Loading 3D Stadium & Athletes...", 60);

const bootPublish = () => {
  try {
    const diag = (auraApp as any)?.diagnostics?.() ?? null;
    const athleteClips: Record<string, string> = {};
    for (const id of ATHLETE_IDS) {
      const r = rigHandles[id] as any;
      const clip = r?.activeClip || r?.lastClip;
      if (clip) athleteClips[id] = clip;
    }
    publishEvidence(sim.state, director, {
      framesRendered,
      ready: appReady,
      demo: autopilotMode,
      eventLog: eventLog.snapshot(),
      diagnostics: diag,
      meshyAssets: MESHY_ASSETS_LIST,
      athleteClips
    } as any);
  } catch (e) { console.error("[rz3d] evidence boot publish failed", e); }
};
bootPublish();

(auraApp as any).onFrame(onFrame);

void Promise.resolve((auraApp as any).ready?.()).finally(() => {
  appReady = true;
  document.body.dataset.aura3dReady = "true";
  canvas.dataset.ready = "true";
  banner(hud, currentMode === "routelab" ? "ROUTE LAB" : currentMode === "tacklelab" ? "TACKLE LAB" : `${userClub.name} vs ${cpuClub.name}`, 2.0);
  bootPublish();
  console.log("[rz3d] boot ok — ready=true demo=" + autopilotMode);
});
