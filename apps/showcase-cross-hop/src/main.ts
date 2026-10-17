/** Cross Hop — endless lane-hopper showcase (PRD: docs/prd/cross-hop.md). */
import { game } from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { buildScene, probeScene, bindApp, frame, st, startRun, evidenceExtra } from "./game/core";
import { mountUI, tickUI } from "./game/ui";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
if (!params.has("a3d-qr")) {
  params.set("a3d-qr", "-compiler");
  try {
    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, "", newUrl);
  } catch {
    // ignore history errors
  }
}
const AUTOPLAY = params.get("autoplay") !== "0";
const AUTOSTART = params.get("autostart") !== "0";

// Sanitize the engine's __AURA3D_GAME__ beacon — it embeds the live `app`
// object (circular via app.post) which breaks remote capture serialization.
let beaconStore: Record<string, unknown> = {};
Object.defineProperty(window, "__AURA3D_GAME__", {
  configurable: true,
  get: () => beaconStore,
  set: (v: unknown) => {
    if (v && typeof v === "object") {
      const src = v as Record<string, unknown>;
      beaconStore = {
        route: src.route,
        state: src.state,
        frame: src.frame,
        firstFrameAt: src.firstFrameAt,
        sessionStartedAt: src.sessionStartedAt
      };
    } else beaconStore = {};
  }
});

const inputOptions = {
  actions: {
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    reset: ["KeyR"]
  },
  bufferMs: 140
} as const;

const PROBE = params.get("probe") ? parseInt(params.get("probe")!, 10) : 0;

const g = createGame({
  id: "cross-hop",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: PROBE > 0 ? () => probeScene(PROBE) : buildScene,
  input: inputOptions,
  hud: { theme: "arcade-neon", widgets: [] },
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
      ui: { id: "ui", asset: { url: sfxUrl("ui.button-click.00") }, volume: 0.5 }
    }
  },
  juice: {
    hop: { punch: { fovDeg: 1.4, ms: 130 } },
    coin: { punch: { fovDeg: 1.6, ms: 160 }, flash: { color: "#ffd94a", peak: 0.12, ms: 160 }, rumble: { weak: 0.3, ms: 90 } },
    splat: { hitStop: 0.07, shake: 0.5, flash: { color: "#ff4757", peak: 0.3, ms: 300 }, rumble: { strong: 0.8, ms: 320 } },
    splash: { shake: 0.25, flash: { color: "#4a9fe8", peak: 0.28, ms: 340 }, rumble: { weak: 0.5, ms: 200 } },
    burn: { shake: 0.3, flash: { color: "#ff6a1f", peak: 0.32, ms: 360 }, rumble: { strong: 0.7, ms: 280 } },
    hawk: { shake: 0.4, punch: { fovDeg: 3.4, ms: 380 }, flash: { color: "#1a1a2e", peak: 0.3, ms: 320 }, rumble: { strong: 0.8, ms: 340 } },
    rescue: { punch: { fovDeg: 2.6, ms: 320 }, flash: { color: "#ff9ed2", peak: 0.22, ms: 300 }, rumble: { strong: 0.6, ms: 300 } },
    theme: { punch: { fovDeg: 2, ms: 280 }, flash: { color: "#ffffff", peak: 0.14, ms: 240 } }
  },
  qualityRebuild: { flags: ["game", "-compiler"] },
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
  buffered: (d: string, _w: number) => (rawInput ? rawInput.buffered(d) : false)
};

const eventLog = game.eventLog({ label: "cross hop events", maxEvents: 40 });

mountUI(document.getElementById("hud") ?? document.body);

if (AUTOSTART) {
  st.autopilot = AUTOPLAY;
  const themeParam = params.get("theme");
  startRun(
    params.get("mode") === "tour" ? "tour" : "quick",
    null,
    params.get("seed") ? parseInt(params.get("seed")!, 10) : undefined,
    themeParam !== null ? parseInt(themeParam, 10) : undefined
  );
  tickUI();
}

let frames = 0;
let prevDead = false, prevHop = false, prevCoins = 0, prevTheme = 0;

app.onFrame(({ dt }) => {
  const d = Math.min(Math.max(dt, 1 / 240), 0.05);
  frames++;

  frame(d, input);
  // fire juice/audio on state transitions
  if (st.hop.active && !prevHop) { g.sound?.cue("hop"); g.juice.fire("hop"); }
  if (!st.hop.active && prevHop) g.sound?.cue("land");
  prevHop = st.hop.active;
  if (st.coins !== prevCoins) { g.sound?.cue("coin"); g.juice.fire("coin"); prevCoins = st.coins; }
  if (st.themeIdx !== prevTheme) { g.sound?.cue("theme"); g.juice.fire("theme"); prevTheme = st.themeIdx; }
  if (!prevDead && st.dead) {
    const cueMap = { squashed: "splat", flattened: "splat", drowned: "splash", burned: "burn", snatched: "hawk" } as const;
    const c = cueMap[st.dead.kind];
    g.sound?.cue(c);
    g.juice.fire(st.dead.kind === "squashed" || st.dead.kind === "flattened" ? "splat" : st.dead.kind === "drowned" ? "splash" : st.dead.kind === "burned" ? "burn" : "hawk");
    app.effects?.burst("debris", [st.playerCol, 0.6, -st.playerRow * 1.15], { count: 26, speed: 4, scale: 0.7 });
    eventLog.push({ type: "death", label: `${st.dead.label} @${st.score}` });
  }
  prevDead = !!st.dead;

  tickUI();

  const extra = evidenceExtra();
  (window as unknown as Record<string, unknown>).__AURA3D_CROSS_HOP__ = {
    status: "live",
    frame: frames,
    ...extra,
    input: { actions: Object.keys(inputOptions.actions), buffered: true },
    look: { id: extra.state ? (extra.state as Record<string, unknown>).theme : "title" }
  };
  (window as unknown as Record<string, unknown>).__gameEvidence = (window as unknown as Record<string, unknown>).__AURA3D_CROSS_HOP__;
});

