// apps/aura-clash-showcase/src/main.ts — Aura Clash single-path shell.
// §6.9.3 S-presentation: the fighting sim is the engine's
// createFightingGameKit (kinematic bodies + combat world + opponent AI +
// camera director); the route owns the arena, lighting, fighting rig, VFX
// glue, HUD and evidence. Positions/facing sync from kit bodies each frame
// and embedded GLB clips are driven from kit actor states via
// scene/fighter-animation.ts (kept src/gameplay clip maps, exact clip names).
import { createGame, lookManifest } from "@aura3d/game";
import { camera, createFightingGameKit, scene } from "@aura3d/engine";
import type { FightingGameSnapshot } from "@aura3d/engine";
import { auraClashEnvironment, auraClashLights } from "./scene/lighting";
import { auraClashWorldNodes, P1_NODE, P2_NODE, HIT_FLASH_NODE } from "./scene/world";
import {
  createAuraClashFightingRig, solveAuraClashFightingDistance,
  AURA_CLASH_FIGHTING_FOV_DEG
} from "./scene/camera";
import { auraClashFxFrame } from "./scene/fx";
import { createAuraClashFighterAnimations, fighterYawForFacing } from "./scene/fighter-animation";
import { publishAuraClashEvidence } from "./evidence";
import { applyAuraClashScenario } from "./scenarios";
import { assets } from "./aura-assets";

const EXPOSURE_EV = -0.3;
const ROUND_SECONDS = 60;
const audioCueLog: string[] = [];
const pushCue = (cue: string) => {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  void game?.sound?.cue(cue as never);
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

const fighterAnimations = createAuraClashFighterAnimations();

const round = { number: 1, timeLeft: ROUND_SECONDS };
let latestSnapshot: FightingGameSnapshot = kit.snapshot();
let hitStopUntilMs = 0;
let koPlayed = false;

const HUD_STYLE_ID = "aura-clash-hud-style";
if (typeof document !== "undefined" && !document.getElementById(HUD_STYLE_ID)) {
  const styleEl = document.createElement("style");
  styleEl.id = HUD_STYLE_ID;
  styleEl.textContent = `
    .a3g-hud { position: absolute; inset: 0; pointer-events: none; z-index: 40; font-family: var(--a3g-font, "Russo One", system-ui, sans-serif); color: var(--a3g-fg, #fff6e8); }
    .a3g-hud.a3g-theme-fighting { --a3g-fg: #fff6e8; --a3g-fg-dim: #9ad9e6; --a3g-bg: rgba(11, 16, 32, 0.84); --a3g-edge: rgba(57, 214, 255, 0.55); --a3g-glow: 0 4px 14px rgba(0, 0, 0, 0.6); --a3g-radius: 4px; }
    .a3g-hud.a3g-hidden, .a3g-w.a3g-hidden, .a3g-banner.a3g-hidden { display: none !important; }
    .a3g-hud-slot { position: absolute; display: flex; flex-direction: column; gap: 6px; min-width: 0; min-height: 0; }
    .a3g-a-top-left { top: 14px; left: 16px; align-items: flex-start; }
    .a3g-a-top { top: 14px; left: 50%; transform: translateX(-50%); align-items: center; }
    .a3g-a-top-right { top: 14px; right: 16px; align-items: flex-end; }
    .a3g-w { background: var(--a3g-bg, rgba(11, 16, 32, 0.84)); border: 1px solid var(--a3g-edge, rgba(57, 214, 255, 0.55)); border-radius: var(--a3g-radius, 4px); padding: 5px 12px; box-shadow: var(--a3g-glow, 0 4px 14px rgba(0, 0, 0, 0.6)); font-size: 14px; line-height: 1.25; white-space: nowrap; }
    .a3g-a-top-left .a3g-w { border-left: 3px solid #ff2d78; }
    .a3g-a-top-right .a3g-w { border-right: 3px solid #39d6ff; text-align: right; }
    .a3g-w-label { display: block; font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--a3g-fg-dim, #9ad9e6); }
    .a3g-w-value { display: block; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--a3g-fg, #fff6e8); }
  `;
  document.head.appendChild(styleEl);
}

const game = createGame({
  id: "aura-clash-showcase",
  target,
  layout: "full-bleed",
  diagnostics: { overlay: false, performancePanel: false },
  // FLAG-3: a bare {nodes:[...]} object is not an AuraSceneSnapshot — the real
  // impl normalizes via the scene() builder (schema/background/camera/…), so
  // build the snapshot the same way every other v2 route does.
  scene: () =>
    scene()
      .background("#070b12")
      .camera(
        // Static fallback only — the fighting rig drives the live camera.
        // Distance comes from the rig's own aspect-aware solve at the
        // opening separation (fighters at x ±1.45) and a 16:9 reference
        // aspect, so the first frame already matches the rig framing
        // (recipe: fov 45, fighters at 25% of frame height) at every
        // viewport — the rig re-solves for the real aspect on its first
        // update before `ready()`.
        camera.orbit({
          target: [0, 1, 0],
          distance: solveAuraClashFightingDistance({
            aspect: 16 / 9,
            separation: 2.9
          }).distance,
          fov: AURA_CLASH_FIGHTING_FOV_DEG
        })
      )
      .addMany(auraClashWorldNodes())
      .addMany(auraClashLights())
      .add(auraClashEnvironment()),
  hud: {
    theme: "fighting",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "health-p1", kind: "prompt", anchor: "top-left", label: "P1 HEALTH" },
      { id: "health-p2", kind: "prompt", anchor: "top-right", label: "P2 HEALTH" },
      { id: "timer", kind: "prompt", anchor: "top-right", label: "ROUND TIMER" }
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
      hit: { asset: assets.auraClashHitSfx, variants: 6 },
      whoosh: { asset: assets.auraClashDashSfx, variants: 3 },
      blocked: { asset: assets.auraClashGuardSfx, variants: 2 },
      special: { asset: assets.auraClashSpecialSfx, variants: 2 },
      jump: { asset: assets.auraClashJumpSfx, variants: 2 },
      announcer: { asset: assets.auraClashKoSfx, variants: 2 },
      "round-start": { asset: assets.auraClashDrawSfx, variants: 1 },
      win: { asset: assets.auraClashWinSfx, variants: 1 }
    }
  },
  juice: {
    "hit-stop": { duration: 0.07, scope: "actors" },
    "ko-slow-mo": { scale: 0.35, ms: 1100 },
    "impact-shake": { trauma: 0.12 }
  },
  qualityRebuild: {
    // T0-29 (#1232): single-path route arms only `game` (the real C-24
    // shell: beacon/evidence/HUD/touch). Engine lane flags come from
    // URL/env/defaults like every other route, so `none` and `-<flag>`
    // arms actually turn them off.
    flags: ["game"]
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

let frame = 0;

game.app.onFrame?.(({ dt }) => {
  frame += 1;
  const sdt = game.session.scaledDt(dt);
  if (sdt <= 0 || game.session.paused) return;
  latestSnapshot = kit.update(sdt);

  // Fighter pose sync: kit bodies → runtime nodes; clip selection below.
  const p1 = game.app.nodes.get(P1_NODE);
  if (p1) {
    const pos = latestSnapshot.player.position;
    p1.setPosition(pos[0], pos[1], pos[2]);
    p1.setRotation(0, fighterYawForFacing(latestSnapshot.player.facing ?? 1), 0);
  }
  const p2 = game.app.nodes.get(P2_NODE);
  if (p2) {
    const pos = latestSnapshot.opponent.position;
    p2.setPosition(pos[0], pos[1], pos[2]);
    p2.setRotation(0, fighterYawForFacing(latestSnapshot.opponent.facing ?? -1), 0);
  }

  // Combat events → fx + juice + audio intents. The frame call runs even
  // with no events so the hit-flash window expires on schedule.
  const events = kit.combat.consumeEvents();
  auraClashFxFrame({
    game: { fx: game.fx, session: game.session },
    app: game.app,
    hitFlash: game.app.nodes.get(HIT_FLASH_NODE)
  }, events);
  // Frame-local reaction signals (consume-on-use): hit/blocked events and
  // the stun they cause land in the same kit update, so damage/blocked are
  // built fresh per frame and can never leak stale severity into a later hit.
  const frameHitDamage: Partial<Record<"p1" | "p2", number>> = {};
  const frameBlocked: Partial<Record<"p1" | "p2", boolean>> = {};
  if (events.length > 0) {
    for (const ev of events) {
      if (ev.type === "hit") {
        pushCue("hit");
        if (ev.targetId === "p1" || ev.targetId === "p2") {
          frameHitDamage[ev.targetId] = ev.damage ?? 0;
        }
        hitStopUntilMs = performance.now() + 650;
      } else if (ev.type === "whiff") {
        pushCue("whoosh");
      } else if (ev.type === "blocked") {
        pushCue("blocked");
        if (ev.targetId === "p1" || ev.targetId === "p2") {
          frameBlocked[ev.targetId] = true;
        }
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
  // Clip drive: kit actor states + health → embedded GLB clips on both rigs.
  fighterAnimations.update(sdt, latestSnapshot, {
    playerCrouch: kit.input.held("crouch"),
    lastHitDamage: frameHitDamage,
    blocked: frameBlocked
  });

  round.timeLeft = Math.max(0, round.timeLeft - sdt);
  if (koPlayed && round.timeLeft <= 0) { /* next round handled by round-reset */ }

  // HUD (compact top-left P1 health and top-right P2 health / round timer).
  syncHud();
});

function syncHud(): void {
  const snap = latestSnapshot;
  const a1 = snap.combat.actors.find((a) => a.id === "p1");
  const a2 = snap.combat.actors.find((a) => a.id === "p2");
  const p1Hp = Math.max(0, Math.round(a1?.health ?? 100));
  const p2Hp = Math.max(0, Math.round(a2?.health ?? 100));
  const p1Meter = Math.round((a1?.meter ?? 0) * 100);
  const p2Meter = Math.round((a2?.meter ?? 0) * 100);
  game.hud.set("health-p1", `${p1Hp} HP · ${p1Meter}% EX`);
  game.hud.set("health-p2", `${p2Hp} HP · ${p2Meter}% EX`);
  game.hud.set("timer", `R${round.number} · ${Math.ceil(round.timeLeft)}s`);
}

syncHud();

game.app.camera?.use?.(rig, { blend: 0.4 });
game.app.setOutput?.({ preset: "arena-fight", toneMapping: "aces", exposure: 2 ** EXPOSURE_EV });

publishAuraClashEvidence({
  game,
  app: () => game.app,
  snapshot: () => latestSnapshot,
  // T2.2-post: appliedLook derives from the C-31 runtime manifest, not literals.
  appliedLook: { preset: "arena-fight", ...lookManifest(game.lookSource()) },
  animation: () => fighterAnimations.snapshot(),
  audioCueLog: () => audioCueLog,
  hitStopActive: () => performance.now() < hitStopUntilMs,
  roundInfo: () => ({ round: round.number, timeLeft: round.timeLeft }),
  bootedAtMs: performance.now(),
  frameCount: () => frame
});

game.start();
void game.ready().then(() => {
  fighterAnimations.bindNodes(game.app.nodes.get(P1_NODE), game.app.nodes.get(P2_NODE));

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
    latestSnapshot = kit.update(0);
    syncHud();
  }

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
