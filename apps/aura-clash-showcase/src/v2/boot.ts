// apps/aura-clash-showcase/src/v2/boot.ts — Aura Clash v2 shell (T2.1).
// §6.9.3 S-presentation: the fighting sim is the engine's
// createFightingGameKit (kinematic bodies + combat world + opponent AI +
// camera director); the route owns the arena, lighting, fighting rig, VFX
// glue, HUD and evidence. The kept src/gameplay/** modules (combat data,
// clip maps, secondary motion, replay) back the content wave; the shell
// keeps positions/facing on the UBC rigs until clip playback lands.
import { createGame, lookManifest } from "@aura3d/game";
import { camera, createFightingGameKit, scene } from "@aura3d/engine";
import type { FightingGameSnapshot } from "@aura3d/engine";
import { auraClashEnvironment, auraClashLights } from "./scene/lighting";
import { auraClashWorldNodes, P1_NODE, P2_NODE, HIT_FLASH_NODE } from "./scene/world";
import { createAuraClashFightingRig } from "./scene/camera";
import { auraClashFxFrame } from "./scene/fx";
import { publishAuraClashEvidence } from "./evidence";
import { applyAuraClashScenario } from "../scenarios";

const ROUTE_FLAG = "A3D_QR_ROUTE_AURA_CLASH" as const;
const EXPOSURE_EV = -0.3;
const ROUND_SECONDS = 60;
const audioCueLog: string[] = [];
const pushCue = (cue: string) => {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
};

const target = document.getElementById("app") ?? document.body;

// --- Fighting sim: kinematic bodies + combat world + AI opponent. --------
const kit = createFightingGameKit({
  playerId: "p1",
  opponentId: "p2",
  opponentAi: true,
  target: window,
  stage: { width: 6.8 }
});

const round = { number: 1, timeLeft: ROUND_SECONDS };
let latestSnapshot: FightingGameSnapshot = kit.snapshot();
let hitStopUntilMs = 0;
let koPlayed = false;

const game = createGame({
  id: "aura-clash-showcase",
  target,
  layout: "full-bleed",
  // FLAG-3: a bare {nodes:[...]} object is not an AuraSceneSnapshot — the real
  // impl normalizes via the scene() builder (schema/background/camera/…), so
  // build the snapshot the same way every other v2 route does.
  scene: () =>
    scene()
      .background("#070b12")
      .camera(
        // Static fallback only — the fighting rig drives the live camera;
        // keep the same 32° fov solve so the first frame matches the rig's.
        camera.orbit({ target: [0, 1, 0], distance: 6.3, fov: 32 })
      )
      .addMany(auraClashWorldNodes())
      .addMany(auraClashLights())
      .add(auraClashEnvironment()),
  hud: {
    theme: "fighting",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "health-p1", kind: "bar", anchor: "top-left", label: "MARA VOLT" },
      { id: "timer", kind: "text", anchor: "top" },
      { id: "health-p2", kind: "bar", anchor: "top-right", label: "ROOK ATLAS" },
      { id: "round", kind: "text", anchor: "bottom-left" },
      { id: "meter", kind: "text", anchor: "bottom-right" }
    ]
  },
  touch: {
    preset: "dpad-4btn",
    bindings: {
      move: "dpad", jump: "dpad-up", crouch: "dpad-down",
      light: "btn-x", heavy: "btn-y", guard: "btn-b", special: "btn-a",
      pause: "menu"
    }
  },
  sound: {
    cues: {
      hit: { asset: "auraClashHitSfx", variants: 6 },
      whoosh: { asset: "auraClashDashSfx", variants: 3 },
      blocked: { asset: "auraClashGuardSfx", variants: 2 },
      special: { asset: "auraClashSpecialSfx", variants: 2 },
      jump: { asset: "auraClashJumpSfx", variants: 2 },
      announcer: { asset: "auraClashKoSfx", variants: 2 },
      "round-start": { asset: "auraClashDrawSfx", variants: 1 },
      win: { asset: "auraClashWinSfx", variants: 1 }
    }
  },
  juice: {
    "hit-stop": { duration: 0.07, scope: "actors" },
    "ko-slow-mo": { scale: 0.35, ms: 1100 },
    "impact-shake": { trauma: 0.12 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_aura_clash` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-aura-clash`).
    flags: ["route_aura_clash", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

// Pause/resume with tab visibility (menu/user toggles from P + Esc).
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause("visibility");
  else game.session.resume();
});
window.addEventListener("keydown", (ev) => {
  if (ev.code === "Escape" || ev.code === "KeyP") {
    game.session.paused ? game.session.resume() : game.session.pause("user");
  }
});

const rig = createAuraClashFightingRig();

game.app.onFrame?.(({ dt }) => {
  const sdt = game.session.scaledDt(dt);
  if (sdt <= 0 || game.session.paused) return;
  latestSnapshot = kit.update(sdt);

  // Fighter pose sync: kit bodies → runtime nodes (UBC rigs stay at their
  // authored facing until clip playback lands in the content wave).
  const p1 = game.app.nodes.get(P1_NODE);
  if (p1) {
    const pos = latestSnapshot.player.position;
    p1.setPosition(pos[0], pos[1], pos[2]);
    p1.setRotation(0, (latestSnapshot.player.facing ?? 1) * Math.PI / 2, 0);
  }
  const p2 = game.app.nodes.get(P2_NODE);
  if (p2) {
    const pos = latestSnapshot.opponent.position;
    p2.setPosition(pos[0], pos[1], pos[2]);
    p2.setRotation(0, (latestSnapshot.opponent.facing ?? -1) * -Math.PI / 2, 0);
  }

  // Combat events → fx + juice + audio intents. The frame call runs even
  // with no events so the hit-flash window expires on schedule.
  const events = kit.combat.consumeEvents();
  auraClashFxFrame({
    game: { fx: game.fx, session: game.session },
    app: game.app,
    hitFlash: game.app.nodes.get(HIT_FLASH_NODE)
  }, events);
  if (events.length > 0) {
    for (const ev of events) {
      if (ev.type === "hit") {
        pushCue("hit");
        hitStopUntilMs = performance.now() + 95;
      } else if (ev.type === "whiff") {
        pushCue("whoosh");
      } else if (ev.type === "blocked") {
        pushCue("blocked");
      } else if (ev.type === "knockout" && !koPlayed) {
        koPlayed = true;
        pushCue("announcer");
        pushCue("win");
      } else if (ev.type === "round-reset") {
        koPlayed = false;
        round.number += 1;
        round.timeLeft = ROUND_SECONDS;
      }
    }
  }
  round.timeLeft = Math.max(0, round.timeLeft - sdt);
  if (koPlayed && round.timeLeft <= 0) { /* next round handled by round-reset */ }

  // HUD (fight theme: slanted bars read health; meter reads stock).
  const snap = latestSnapshot;
  const a1 = snap.combat.actors.find((a) => a.id === "p1");
  const a2 = snap.combat.actors.find((a) => a.id === "p2");
  game.hud.set("health-p1", `${Math.max(0, Math.round(a1?.health ?? 100))}`);
  game.hud.set("health-p2", `${Math.max(0, Math.round(a2?.health ?? 100))}`);
  game.hud.set("timer", `${Math.ceil(round.timeLeft)}`);
  game.hud.set("round", `ROUND ${round.number}`);
  game.hud.set("meter", `${Math.round((a1?.meter ?? 0) * 100)}%`);
});

let frame = 0;
game.app.onRender?.(() => { frame += 1; });
game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(rig, { blend: 0.4 });
    game.app.setOutput?.({ preset: "arena-fight",  toneMapping: "aces", exposure: 2 ** EXPOSURE_EV });

  const scenario = new URL(location.href).searchParams.get("scenario");
  if (scenario) {
    applyAuraClashScenario(scenario, {
      setActor: (id, patch) => kit.combat.setActor(id, patch),
      placeFighter: (id, x) => {
        const body = id === "p1" ? kit.bodies.player : kit.bodies.opponent;
        body.position = [x, 0, 0];
      },
      setRound: (n, t) => { round.number = n; round.timeLeft = t; }
    });
  }

  publishAuraClashEvidence({
    game,
    app: () => game.app,
    snapshot: () => latestSnapshot,
    // T2.2-post: appliedLook derives from the C-31 runtime manifest, not literals.
    appliedLook: { preset: "arena-fight", ...lookManifest(game.lookSource()) },
    audioCueLog: () => audioCueLog,
    hitStopActive: () => performance.now() < hitStopUntilMs,
    roundInfo: () => ({ round: round.number, timeLeft: round.timeLeft }),
    bootedAtMs: performance.now(),
    frameCount: () => frame
  });

  // C-24 beacon: live getters so audits/specs read the mounted app + session.
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return frame; },
    firstFrameAt: performance.now(),
    sessionStartedAt: performance.now()
  };
});
