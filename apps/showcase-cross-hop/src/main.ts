/** Cross Hop — endless lane-hopper showcase (PRD: docs/prd/cross-hop.md). */
import { game, createFixedStepLoop } from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { buildScene, probeScene, bindApp, step, syncVisuals, st, startRun, evidenceExtra, setPaused, setReducedMotion, setLookMode, getLookMode, deathEffect, dioramaView, mountSpectators, SIM_STEP } from "./game/core";
import { qaCrops } from "./game/qa";
import { defaultLookFor } from "./game/look";
import { mountUI, tickUI, setUiSound } from "./game/ui";
import "../../showcase-port-shared/quickbar.css";
import "./styles.css";
import { installBlackFrameGuard } from "@aura3d/debug";

installBlackFrameGuard();

const params = new URLSearchParams(window.location.search);
const AUTOPLAY = params.get("autoplay") === "1" || params.get("demo") === "1";
const AUTOSTART = params.get("autostart") !== "0";

const inputOptions = {
  actions: {
    up: ["KeyW", "ArrowUp", "Space", "Enter"],
    down: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    reset: ["KeyR"]
  },
  bufferMs: 140
} as const;

const PROBE = params.get("probe") ? parseInt(params.get("probe")!, 10) : 0;

/** CH-15: honour `prefers-reduced-motion` (or `?reducedMotion=1`): no camera shake, FOV punch or screen flash. */
const REDUCED_MOTION = params.get("reducedMotion") === "1" ||
  (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
setReducedMotion(REDUCED_MOTION);
/**
 * GU47 phase 2 (blind panel): the 4.6 look is the default again. A three-judge blind panel preferred the 4.6.2 frames
 * over the tabletop diorama for all seven variants (steep top-down camera, no horizon, haze band, muddy palettes), so
 * the diorama is opt-in through `?look=diorama`; `?look=original` still names the 4.6 look explicitly.
 */
/**
 * GU47 phase 3 (4.7.1): the vivid look (the 4.6 chase camera with a shadowed sun, gradient sky, flat floor and
 * per-theme grade) is the default for the views a blind panel picked over 4.6.2 (`VIVID_DEFAULT_THEMES`, by starting
 * theme); the rest boot the 4.6 look. `?look=vivid`, `?look=original` and `?look=diorama` force a look.
 */
const THEME_PARAM = params.get("theme");
setLookMode(defaultLookFor(params.get("look"), THEME_PARAM !== null ? parseInt(THEME_PARAM, 10) : null));
const DIORAMA = getLookMode() === "diorama";
if (DIORAMA) document.body.classList.add("ch-diorama");

type JuiceSpec = { hitStop?: number; shake?: number; punch?: unknown; flash?: unknown; rumble?: unknown };
const JUICE: Record<string, JuiceSpec> = {
  hop: { punch: { fovDeg: 1.4, ms: 130 } },
  coin: { punch: { fovDeg: 1.6, ms: 160 }, flash: { color: "#ffd94a", peak: 0.12, ms: 160 }, rumble: { weak: 0.3, ms: 90 } },
  splat: { hitStop: 0.07, shake: 0.5, flash: { color: "#ff4757", peak: 0.3, ms: 300 }, rumble: { strong: 0.8, ms: 320 } },
  splash: { shake: 0.25, flash: { color: "#4a9fe8", peak: 0.28, ms: 340 }, rumble: { weak: 0.5, ms: 200 } },
  burn: { shake: 0.3, flash: { color: "#ff6a1f", peak: 0.32, ms: 360 }, rumble: { strong: 0.7, ms: 280 } },
  hawk: { shake: 0.4, punch: { fovDeg: 3.4, ms: 380 }, flash: { color: "#1a1a2e", peak: 0.3, ms: 320 }, rumble: { strong: 0.8, ms: 340 } },
  rescue: { punch: { fovDeg: 2.6, ms: 320 }, flash: { color: "#ff9ed2", peak: 0.22, ms: 300 }, rumble: { strong: 0.6, ms: 300 } },
  theme: { punch: { fovDeg: 2, ms: 280 }, flash: { color: "#ffffff", peak: 0.14, ms: 240 } }
};
/** Reduced motion keeps rumble and hit-stop and drops shake, FOV punch and flash. */
function tameJuice(j: Record<string, JuiceSpec>): Record<string, JuiceSpec> {
  const out: Record<string, JuiceSpec> = {};
  for (const [k, v] of Object.entries(j)) {
    const { shake: _s, punch: _p, flash: _f, ...rest } = v;
    out[k] = rest;
  }
  return out;
}

const g = createGame({
  id: "cross-hop",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: PROBE > 0 ? () => probeScene(PROBE) : buildScene,
  input: inputOptions,
  // CH47-17: the tabletop HUD theme (Suisse Works, E-J) in the diorama look.
  hud: { theme: DIORAMA ? "tabletop" : "arcade-neon", widgets: [] },
  touch: {
    preset: "lane-swipe",
    bindings: { "swipe-up": "up", "swipe-down": "down", "swipe-left": "left", "swipe-right": "right", tap: "up" }
  },
  sound: {
    cues: {
      hop: { id: "hop", asset: { url: sfxUrl("whoosh.swing-light.00") }, volume: 0.5 },
      land: { id: "land", asset: { url: sfxUrl("footsteps.grass.00") }, volume: 0.4 },
      coin: { id: "coin", asset: { url: sfxUrl("pickup.coin.00") }, volume: 0.7 },
      splat: { id: "splat", asset: { url: sfxUrl("impact.plastic.medium.00") }, volume: 0.8 },
      splash: { id: "splash", asset: { url: sfxUrl("footsteps.water.00") }, volume: 0.75 },
      burn: { id: "burn", asset: { url: sfxUrl("explosion.small.00") }, volume: 0.7 },
      hawk: { id: "hawk", asset: { url: sfxUrl("whoosh.pass-by-large.00") }, volume: 0.8 },
      horn: { id: "horn", asset: { url: sfxUrl("stinger.alarm.00") }, volume: 0.6 },
      rescue: { id: "rescue", asset: { url: sfxUrl("pickup.extra-life.00") }, volume: 0.85 },
      theme: { id: "theme", asset: { url: sfxUrl("stinger.level-start.00") }, volume: 0.6 },
      ui: { id: "ui", asset: { url: sfxUrl("ui.click.00") }, volume: 0.5 }
    }
  },
  juice: (REDUCED_MOTION ? tameJuice(JUICE) : JUICE) as never,
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: {
      crossHop: () => (window as unknown as Record<string, unknown>).__AURA3D_CROSS_HOP__ ?? { status: "unbound" }
    }
  }
});

const app = g.app;
bindApp(app);
g.start();

const rawInput = g.input;
const input = {
  buffered: (d: string, _w: number) => (rawInput ? rawInput.buffered(d) : false),
  consume: (d: string) => (rawInput ? rawInput.consume(d) : false)
};

const eventLog = game.eventLog({ label: "cross hop events", maxEvents: 40 });

mountUI(document.getElementById("hud") ?? document.body);
setUiSound(() => g.sound?.cue("ui"));

let appReady = false;

if (AUTOSTART) {
  st.autopilot = AUTOPLAY;
  const themeParam = params.get("theme");
  startRun(
    params.get("mode") === "tour" ? "tour" : "quick",
    null,
    params.get("seed") ? parseInt(params.get("seed")!, 10) : undefined,
    themeParam !== null ? parseInt(themeParam, 10) : undefined
  );
  syncVisuals(1);
  tickUI();
} else {
  // `?autostart=0` opens on the title menu instead of a run that was never started.
  st.mode = "title";
  tickUI();
}

void g.ready().then(() => {
  appReady = true;
  mountSpectators();
  syncVisuals(1);
  document.body.dataset.aura3dReady = "true";
});

// CH-E7: hold the run while the tab is hidden or the window loses focus.
document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });
window.addEventListener("blur", () => setPaused(true));

let frames = 0;
let prevDead = false, prevHop = false, prevCoins = 0, prevTheme = 0, prevRescues = 0, prevRailAlert = false;

function fireTransitions(): void {
  if (st.hop.active && !prevHop) { g.sound?.cue("hop"); g.juice.fire("hop"); }
  if (!st.hop.active && prevHop) g.sound?.cue("land");
  prevHop = st.hop.active;
  if (st.coins !== prevCoins) { if (st.coins > prevCoins) { g.sound?.cue("coin"); g.juice.fire("coin"); } prevCoins = st.coins; }
  if (st.themeIdx !== prevTheme) { g.sound?.cue("theme"); g.juice.fire("theme"); prevTheme = st.themeIdx; }
  // CH-14: rescue pod pickup and the rail horn as a crossing ahead starts its warning.
  if (st.rescues !== prevRescues) { g.sound?.cue("rescue"); g.juice.fire("rescue"); prevRescues = st.rescues; }
  if (st.railAlert && !prevRailAlert) g.sound?.cue("horn");
  prevRailAlert = st.railAlert;
  if (!prevDead && st.dead) {
    const cueMap = { squashed: "splat", flattened: "splat", drowned: "splash", burned: "burn", snatched: "hawk" } as const;
    const c = cueMap[st.dead.kind];
    g.sound?.cue(c);
    g.juice.fire(c);
    deathEffect(st.dead.kind, [st.playerCol, 0.6, -st.playerRow * 1.15]);
    eventLog.push({ type: "death", label: `${st.dead.label} @${st.score}` });
  }
  prevDead = !!st.dead;
}

// CH-E1: the run advances in fixed 60 Hz steps (collision is tested every step, whatever the display rate) and is
// drawn between the last two steps (`loop.alpha`). The engine frame callback drives the loop clock.
const loop = createFixedStepLoop({
  stepSeconds: SIM_STEP,
  step: (dt) => { step(dt, input); fireTransitions(); },
  isActive: () => appReady && !st.paused,
  schedule: () => 0,
  cancel: () => undefined
});

let lastBeacon = -Infinity;
app.onFrame(() => {
  if (!appReady) return;
  frames++;
  loop.tick(performance.now());
  syncVisuals(loop.alpha);
  tickUI();

  // CH-E3: the evidence beacon is rebuilt at most every 250 ms instead of every frame.
  const now = performance.now();
  if (now - lastBeacon < 250) return;
  lastBeacon = now;
  const extra = evidenceExtra();
  (window as unknown as Record<string, unknown>).__AURA3D_CROSS_HOP__ = {
    status: "live",
    frame: frames,
    ...extra,
    input: { actions: Object.keys(inputOptions.actions), buffered: true },
    look: { id: extra.state ? (extra.state as Record<string, unknown>).theme : "title" }
  };
  (window as unknown as Record<string, unknown>).__gameEvidence = (window as unknown as Record<string, unknown>).__AURA3D_CROSS_HOP__;
  // GU47 QA crops for E-I's capture (normalised 0..1, follow the camera): player, river, sky band, bottom band.
  const qa = ((window as unknown as Record<string, unknown>).__AURA_QA__ ??= {}) as Record<string, unknown>;
  qa.crops = qaCrops(DIORAMA ? dioramaView.bandCenter : 0.62, DIORAMA);
});
