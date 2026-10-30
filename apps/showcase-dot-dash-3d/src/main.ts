/** Glint Courier — circuit-board chase (PRD: docs/prd/dot-dash-3d.md). */
import { game, installQaHooks } from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { buildScene, bindApp, syncVisuals, wx, wz, cameraPose, setMotionPrefs, tileToScreen } from "./game/world";
import { registerVfxPack, VFX_KINDS, type VfxPrefs } from "./game/vfx";
import { st, frame, startRun, bootToTitle, evidenceExtra, GHOST_LABEL } from "./game/sim";
import { mountUI, tickUI, isPaused, autoPause } from "./game/hud";
import { FRUIT_LABEL, type MazeId } from "./game/mazes";
import type { FruitKind } from "./game/grid";
import "../../showcase-port-shared/quickbar.css";
import "./styles.css";
import { installBlackFrameGuard } from "@aura3d/debug";

installBlackFrameGuard();

const params = new URLSearchParams(window.location.search);
const AUTOSTART = params.get("autostart") !== "0";
const PROBE = params.get("probe"); // capture-bisect: "dom" mounts the shell without the engine

if (PROBE === "dom") {
  document.addEventListener("DOMContentLoaded", () => {
    import("./game/hud").then(({ mountUI, tickUI }) => {
      mountUI();
      tickUI();
      (window as unknown as Record<string, unknown>).__AURA3D_DOT_DASH__ = { status: "probe-dom" };
    });
  });
} else {

const inputOptions = {
  actions: {
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    dash: ["Space"],
    camera: ["KeyV"],
    reset: ["KeyR"]
  },
  bufferMs: 140
} as const;

const g = createGame({
  id: "dot-dash-3d",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: buildScene,
  input: inputOptions,
  hud: { theme: "arcade-neon", widgets: [] },
  touch: {
    preset: "dpad-2btn",
    bindings: {
      "stick.up": "up", "stick.down": "down", "stick.left": "left", "stick.right": "right",
      left: "left", right: "right", jump: "dash", dash: "dash"
    }
  },
  sound: {
    cues: {
      dot: { id: "dot", asset: { url: sfxUrl("ui.score-tick.00") }, volume: 0.16 },
      orb: { id: "orb", asset: { url: sfxUrl("pickup.power-up.00") }, volume: 0.8 },
      ghost: { id: "ghost", asset: { url: sfxUrl("pickup.combo-up.00") }, volume: 0.85 },
      fruit: { id: "fruit", asset: { url: sfxUrl("pickup.gem.00") }, volume: 0.8 },
      fruitSpawn: { id: "fruitSpawn", asset: { url: sfxUrl("ui.unlock.00") }, volume: 0.55 },
      death: { id: "death", asset: { url: sfxUrl("stinger.lose.00") }, volume: 0.8 },
      clear: { id: "clear", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.8 },
      ready: { id: "ready", asset: { url: sfxUrl("stinger.level-start.00") }, volume: 0.6 },
      dash: { id: "dash", asset: { url: sfxUrl("whoosh.dash.00") }, volume: 0.6 },
      eyes: { id: "eyes", asset: { url: sfxUrl("whoosh.pass-by-small.00") }, volume: 0.45 },
      hum: { id: "hum", asset: { url: sfxUrl("ambience.space-hum") }, volume: 0.22, loop: true },
      ui: { id: "ui", asset: { url: sfxUrl("ui.click.00") }, volume: 0.5 }
    }
  },
  juice: {
    orb: { punch: { fovDeg: 2.4, ms: 300 }, flash: { color: "#45e8ff", peak: 0.22, ms: 320 }, rumble: { weak: 0.5, ms: 220 } },
    ghost: { punch: { fovDeg: 1.8, ms: 200 }, flash: { color: "#ffffff", peak: 0.16, ms: 200 }, rumble: { weak: 0.4, ms: 140 } },
    fruit: { punch: { fovDeg: 1.6, ms: 240 }, flash: { color: "#ffd23d", peak: 0.18, ms: 260 } },
    death: { hitStop: 0.09, shake: 0.6, flash: { color: "#ff4d5e", peak: 0.4, ms: 480 }, rumble: { strong: 0.9, ms: 400 } },
    clear: { punch: { fovDeg: 2.8, ms: 520 }, flash: { color: "#ffd23d", peak: 0.24, ms: 480 }, rumble: { weak: 0.6, ms: 380 } },
    dash: { punch: { fovDeg: 1.6, ms: 190 } },
    ready: { punch: { fovDeg: 1.4, ms: 240 }, flash: { color: "#ffffff", peak: 0.1, ms: 220 } }
  },
  qualityRebuild: { flags: ["game", "materials"] },
  evidence: {
    schema: 1,
    sections: {
      dotDash: () => (window as unknown as Record<string, unknown>).__AURA3D_DOT_DASH__ ?? { status: "unbound" }
    }
  }
});

const app = g.app;
let appReady = false;
st.autopilot = params.get("autoplay") === "1" || params.get("demo") === "1";
bindApp(app);
g.start();

// Remote-capture freeze: stop the production rAF after N ms so headless
// SwiftShader can composite a still frame (see tools/remote-capture.sh).
const FREEZE_MS = Number(params.get("freeze") ?? 0);
if (FREEZE_MS > 0) setTimeout(() => {
  try { g.session?.pause?.("user"); } catch { /* */ }
  try { app.pause(); } catch { /* */ }
}, FREEZE_MS);

const rawInput = g.input;
const keysHeld = new Set<string>();
const keysPressed = new Set<string>();
const ACTION_CODES: Record<string, readonly string[]> = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  dash: ["Space"],
  camera: ["KeyV"],
  reset: ["KeyR"]
};
const onCaptureKeyDown = (e: KeyboardEvent): void => {
  if ((document.activeElement as HTMLElement | null)?.tagName === "INPUT") return;
  if (/^(Key[WASDVR]|Arrow(Up|Down|Left|Right)|Space)$/.test(e.code)) {
    if (!keysHeld.has(e.code)) keysPressed.add(e.code);
    keysHeld.add(e.code);
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
  }
};
const onCaptureKeyUp = (e: KeyboardEvent): void => {
  keysHeld.delete(e.code);
};
window.addEventListener("keydown", onCaptureKeyDown, { capture: true });
document.addEventListener("keydown", onCaptureKeyDown, { capture: true });
window.addEventListener("keyup", onCaptureKeyUp, { capture: true });
document.addEventListener("keyup", onCaptureKeyUp, { capture: true });
window.addEventListener("blur", () => {
  keysHeld.clear();
  keysPressed.clear();
  autoPause();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") autoPause();
});

// Swipe on the board (touch): a flick of 24 px or more queues that direction like a key press (buffered turn).
let swipeFrom: { x: number; y: number; id: number } | null = null;
const SWIPE_CODES = { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown" } as const;
const appEl = document.getElementById("app");
appEl?.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  swipeFrom = { x: e.clientX, y: e.clientY, id: e.pointerId };
});
appEl?.addEventListener("pointerup", (e) => {
  const from = swipeFrom;
  swipeFrom = null;
  if (!from || from.id !== e.pointerId) return;
  const dx = e.clientX - from.x, dy = e.clientY - from.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  keysPressed.add(SWIPE_CODES[dir]);
});
appEl?.addEventListener("pointercancel", () => { swipeFrom = null; });

const hasCode = (set: Set<string>, action: string): boolean => {
  const codes = ACTION_CODES[action];
  if (!codes) return false;
  for (const c of codes) if (set.has(c)) return true;
  return false;
};
const consumeCode = (action: string): boolean => {
  const codes = ACTION_CODES[action];
  if (!codes) return false;
  let found = false;
  for (const c of codes) {
    if (keysPressed.has(c)) {
      keysPressed.delete(c);
      found = true;
    }
  }
  return found;
};

const input = {
  held: (a: string) => (rawInput ? rawInput.held(a) : false) || hasCode(keysHeld, a),
  consume: (a: string) => (rawInput ? rawInput.consume(a) : false) || consumeCode(a),
  pressed: (a: string) => (rawInput ? rawInput.pressed(a) : false) || hasCode(keysPressed, a)
};

const eventLog = game.eventLog({ label: "glint courier events", maxEvents: 40 });
mountUI();

// Reduced motion / reduced flash: the session settings, or the OS preference when the session has none.
const motionQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
let vfxPrefs: VfxPrefs = { reducedMotion: false, reducedFlash: false };
const syncMotionPrefs = (): void => {
  const session = g.session as unknown as { reducedMotion?: boolean; reducedFlash?: boolean } | undefined;
  const osReduce = motionQuery?.matches === true;
  const next = { reducedMotion: session?.reducedMotion === true || osReduce, reducedFlash: session?.reducedFlash === true || osReduce };
  setMotionPrefs(next);
  // DD47-V1: the preset pack follows the settings (halved counts on reduced motion, no flicker on reduced flash)
  if (next.reducedMotion !== vfxPrefs.reducedMotion || next.reducedFlash !== vfxPrefs.reducedFlash || !vfxRegistered) {
    vfxPrefs = next;
    vfxRegistered = safeRegister(next);
  }
};
let vfxRegistered = false;
function safeRegister(prefs: VfxPrefs): boolean {
  try { return registerVfxPack(app.effects, prefs); } catch { return false; }
}
/** Fires one pack preset at a tile (effects are optional: a missing runtime never breaks the game). */
function fx(kind: string, x: number, y: number, h = 0.4): void {
  if (!vfxRegistered) return;
  try { app.effects?.burst(kind, [wx(x), h, wz(y)]); } catch { /* effects optional */ }
}
syncMotionPrefs();
motionQuery?.addEventListener?.("change", syncMotionPrefs);
try { (g.session as unknown as { on?(e: "settings", cb: () => void): void }).on?.("settings", syncMotionPrefs); } catch { /* optional */ }

// Score pop-ups: "+200" floats up from the tile that scored (sentry disabled, cache gem).
const popHost = document.getElementById("dd-popups");
function popScore(x: number, y: number, points: number): void {
  if (!popHost) return;
  const at = tileToScreen(x, y);
  if (!at) return;
  const el = document.createElement("div");
  el.className = "dd-pop";
  el.textContent = `+${points}`;
  el.style.left = `${at.x}px`;
  el.style.top = `${at.y}px`;
  popHost.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

// QA hooks (window.__AURA_DOT_DASH_3D__): state for specs and capture tools; `sim()` is the live simulation object.
installQaHooks("dot-dash-3d", {
  ready: () => appReady,
  state: () => evidenceExtra(),
  app: () => app,
  begin: () => startRun("quick", "classic"),
  extras: { sim: () => st, pose: () => cameraPose(), sync: () => syncVisuals(0) }
});

// ambient hum loop — start on first user gesture (audio unlock)
let humStarted = false;
const tryHum = (): void => {
  if (humStarted) return;
  try { g.sound?.cue("hum"); humStarted = true; } catch { /* audio locked */ }
};
document.addEventListener("pointerdown", tryHum, { once: false });
document.addEventListener("keydown", tryHum, { once: false });

// Boot directly into live gameplay by default (autopilot off unless ?autoplay=1 or ?demo=1)
if (AUTOSTART) {
  const mode = params.get("mode");
  const maze = (params.get("maze") ?? "classic") as MazeId;
  startRun(mode === "school" ? "school" : mode === "circuit" ? "circuit" : "quick", maze);
  syncVisuals(0);
  tickUI();
} else {
  // ?autostart=0 opens the title menu (the sim starts in "play" with an empty board otherwise)
  bootToTitle();
  tickUI();
}

void g.ready().then(() => {
  appReady = true;
  if (!vfxRegistered) vfxRegistered = safeRegister(vfxPrefs);
  document.body.dataset.aura3dReady = "true";
  syncVisuals(0);
  tickUI();
}).catch(() => { /* mount error handled by engine */ });

// trail effect handle
let trail: { stop(o?: { immediate?: boolean }): void } | null = null;
function ensureTrail(): void {
  if (trail || st.mode !== "play") return;
  try {
    trail = app.effects?.spawn("streak", { node: "byte" }, { color: st.profile.trailColor, scale: 1.22 }) ?? null;
  } catch { trail = null; }
}
function killTrail(): void {
  try { trail?.stop({ immediate: true }); } catch { /* */ }
  trail = null;
}

let frames = 0;
let lastMode = st.mode;
let humDucked = false;

app.onFrame(({ dt }) => {
  if (!appReady) return;
  const d = Math.min(Math.max(dt, 1 / 240), 0.05);
  frames++;

  if (!isPaused()) {
    frame(d, input);
    keysPressed.clear();
    const ev = st.events;
    // ---- sfx + juice on discrete events
    if (ev.dot) g.sound?.cue("dot");
    if (ev.orb) { g.sound?.cue("orb"); g.juice?.fire("orb"); fx(VFX_KINDS.surgeRing, st.player.px, st.player.py, 0.3); }
    if (ev.ghostEat) {
      g.sound?.cue("ghost"); g.juice?.fire("ghost");
      const eaten = st.ghosts.find((gh) => gh.id === ev.ghostEat!.ghost);
      if (eaten) fx(VFX_KINDS.shortCircuit, eaten.px, eaten.py, 0.45);
      eventLog.push({ type: "ghost-eat", label: `${GHOST_LABEL[ev.ghostEat.ghost]} +${ev.ghostEat.points}` });
    }
    if (ev.fruit) { fx(VFX_KINDS.solderSpark, st.player.px, st.player.py); g.sound?.cue("fruit"); g.juice?.fire("fruit"); eventLog.push({ type: "fruit", label: `${FRUIT_LABEL[ev.fruit.kind as FruitKind]} +${ev.fruit.points}` }); }
    if (ev.fruitSpawn) g.sound?.cue("fruitSpawn");
    if (ev.dash) { g.sound?.cue("dash"); g.juice?.fire("dash"); fx(VFX_KINDS.solderSpark, st.player.px, st.player.py, 0.3); }
    if (ev.ready) g.sound?.cue("ready");
    if (ev.eyesHome) g.sound?.cue("eyes");
    if (ev.death) {
      g.sound?.cue("death"); g.juice?.fire("death");
      killTrail();
      if (vfxRegistered) fx(VFX_KINDS.blownFuse, st.player.px, st.player.py, 0.5);
      else {
        try {
          app.effects?.burst("debris", [wx(st.player.px), 0.5, wz(st.player.py)], { count: 44, speed: 6.2, scale: 0.95, color: "#ff5a6e" });
        } catch { /* effects optional */ }
      }
      eventLog.push({ type: "death", label: `caught @${st.score}` });
    }
    if (ev.clear) { g.sound?.cue("clear"); g.juice?.fire("clear"); }
    if (ev.extraLife) { g.sound?.cue("orb"); eventLog.push({ type: "extra-life", label: `extra life @${st.score}` }); }
    for (const p of ev.points) popScore(p.x, p.y, p.points);

    // player trail — attach during play, drop on death/title
    if (st.mode === "play") ensureTrail();
    else if (st.mode !== lastMode && trail) killTrail();
    if (trail && st.mode === "dying") killTrail();

    syncVisuals(d);
  }
  lastMode = st.mode;

  // duck the looped hum while the board is paused
  const pausedNow = isPaused();
  if (pausedNow !== humDucked && humStarted) {
    humDucked = pausedNow;
    try { (g.sound as unknown as { setCueLevel?(c: string, l: { volume: number }, ms?: number): void } | undefined)?.setCueLevel?.("hum", { volume: pausedNow ? 0.2 : 1 }, 220); } catch { /* audio optional */ }
  }

  tickUI();

  const w = window as unknown as Record<string, unknown>;
  const payload = {
    status: "live",
    frame: frames,
    paused: isPaused(),
    ...evidenceExtra(),
    input: { actions: Object.keys(inputOptions.actions), buffered: true }
  };
  w.__AURA3D_DOT_DASH__ = payload;
  w.__gameEvidence = payload;
  const prevEv = (w.__AURA3D_GAME_EVIDENCE__ && typeof w.__AURA3D_GAME_EVIDENCE__ === "object")
    ? (w.__AURA3D_GAME_EVIDENCE__ as Record<string, unknown>)
    : {};
  w.__AURA3D_GAME_EVIDENCE__ = {
    ...prevEv,
    ...payload
  };
});
}
