/**
 * Aura FC 3D — flagship 3D street-and-stadium soccer on Aura3D.
 *
 * Thin boot file: builds the scene graph, resolves runtime handles, wires
 * input + touch + juice + audio, then runs one per-frame loop that steps the
 * authoritative sim (game/sim.ts), poses the 16-node athlete rigs
 * (game/rig.ts), retints the venue (game/scene.ts), updates the DOM HUD
 * (game/hud.ts + game/modes.ts) and publishes runtime evidence on
 * window.__AURA3D_GAME_EVIDENCE__ / __AURA3D_GAME__ / __gameEvidence /
 * __auraEvidence for the remote capture harness.
 */

import {
  createAuraApp, createGameAudio, game, looks, material
} from "@aura3d/engine";
import {
  createJuice, createOverlayDriver, createRumbleDriver, createTweenEngine,
  createFxParticlePass, mountTouchControls, sfx, sfxUrl
} from "@aura3d/engine/game";
import { createSim, PITCH_HX, PITCH_HZ, PEN_X, BALL_R } from "./game/sim";
import { buildFcScene, resolveWorld, applyVenue, tickWorld, ATHLETE_IDS, LOOK_ID } from "./game/scene";
import { resolveAthlete, applyAthleteKit, poseAthlete, skinFor, type AthleteRig } from "./game/rig";
import { createHud, clubFor } from "./game/hud";
import { createModes } from "./game/modes";
import { CLUBS, VENUES, VENUE_ORDER } from "./game/content";
import type { UserInputFrame, PlayerState, SimEvent } from "./game/types";

type Vec3 = [number, number, number];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/* ------------------------------------------------------------------ */

function boot(): void {
  const mount = document.getElementById("app");
  const shell = document.querySelector<HTMLElement>(".game-shell") ?? document.body;
  const errEl = document.getElementById("render-error");
  if (!mount) { if (errEl) errEl.hidden = false; return; }

  let app: ReturnType<typeof createAuraApp>;
  try {
    app = createAuraApp("#app", {
      scene: buildFcScene(),
      ...looks.appOptions(LOOK_ID)
    } as any);
  } catch (e) {
    console.error("[fc3d] createAuraApp failed", e);
    if (errEl) errEl.hidden = false;
    return;
  }
  const canvas = app.canvas;

  /* -------------------------- handles -------------------------- */
  const world = resolveWorld(app);
  const rigs = new Map<string, AthleteRig>();
  for (const id of ATHLETE_IDS) rigs.set(id, resolveAthlete(app, id));

  const sim = createSim();
  const hud = createHud(shell);
  const modes = createModes({
    sim,
    host: shell,
    banner: (text, ms, cls) => hud.banner(text, ms, cls),
    ticker: (label, severity) => hud.ticker({ type: "whistle", label, severity }),
    celebrate: () => {
      world.confetti?.setVisible(true);
      window.setTimeout(() => world.confetti?.setVisible(false), 5600);
    }
  });

  /* -------------------------- input -------------------------- */
  const input = app.input({
    actions: {
      up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"],
      left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"],
      sprint: ["ShiftLeft", "ShiftRight"],
      pass: ["KeyE"], driven: ["KeyR"],
      shoot: ["Space"],
      skillA: ["KeyJ"], skillB: ["KeyK"],
      switch: ["KeyQ"],
      pause: ["KeyP", "Escape"]
    },
    axes: {
      moveX: { negative: "left", positive: "right" },
      moveZ: { negative: "up", positive: "down" }
    },
    bufferMs: 130,
    gamepad: true
  });

  window.addEventListener("keydown", (e) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  }, { passive: false });

  /* -------------------------- juice + audio -------------------------- */
  const params = new URLSearchParams(window.location.search);
  const reducedMotion = params.has("reducedMotion") || (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
  const reducedFlash = params.has("reducedFlash") || (window.matchMedia?.("(prefers-reduced-flash: reduce)")?.matches ?? false);
  const a11y = (game as any).accessibility?.settings?.([], { reducedMotion, reducedFlash, highContrast: params.has("highContrast") });

  let fxLayer = document.getElementById("fc-fx-layer");
  if (!fxLayer) {
    fxLayer = document.createElement("div");
    fxLayer.id = "fc-fx-layer";
    fxLayer.setAttribute("aria-hidden", "true");
    fxLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:26;";
    shell.appendChild(fxLayer);
  }

  const fxCtl = (game as any).effects?.({ app, reducedMotion, reducedFlash });
  const FX_KIND: Record<string, string> = {
    spark: "hit-spark", dust: "ground-dust", ring: "ring-shockwave",
    streak: "dash-trail", burst: "aura-burst", flash: "impact-flash", splash: "ground-dust"
  };
  const fx = createFxParticlePass({
    burst: (kind: string, position: any, o: any) => {
      try { fxCtl?.spawn(FX_KIND[kind] ?? "hit-spark", position, { radius: Math.max(0.2, (o?.count ?? 10) / 24), color: o?.color, intensity: 1 }); } catch { /* best effort */ }
    },
    trail: () => {},
    liveCount: () => 0
  } as any);

  let hitStopUntil = 0;
  const audio = createGameAudio({
    browserContext: true,
    cues: {
      kick:    { id: "kick", asset: { url: sfxUrl(sfx.sports.ballBounceHard[0]) }, volume: 0.5 },
      pass:    { id: "pass", asset: { url: sfxUrl(sfx.sports.ballBounceCourt[0]) }, volume: 0.42 },
      goal:    { id: "goal", asset: { url: sfxUrl(sfx.stinger.win[0]) }, volume: 0.85 },
      save:    { id: "save", asset: { url: sfxUrl(sfx.stinger.checkpoint[1]) }, volume: 0.55 },
      post:    { id: "post", asset: { url: sfxUrl(sfx.sports.netSwish[0]) }, volume: 0.5 },
      whistle: { id: "whistle", asset: { url: sfxUrl(sfx.stinger.checkpoint[0]) }, volume: 0.55 },
      fulltime:{ id: "fulltime", asset: { url: sfxUrl(sfx.stinger.win[1]) }, volume: 0.9 },
      lose:    { id: "lose", asset: { url: sfxUrl(sfx.stinger.lose[0]) }, volume: 0.4 },
      crowd:   { id: "crowd", asset: { url: sfxUrl(sfx.ambience.crowdSports[0]) }, volume: 0.3, loop: true }
    },
    buses: [{ id: "sfx" } as any]
  } as any);
  const unlock = () => { void audio?.unlock(); };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  const JUICE_EVENTS: Record<string, any> = {
    kick:    { fx: { kind: "spark", count: 12, color: "#d8ff3e", speed: 3.6 }, cue: "kick", rumble: { ms: 22, weak: 0.3 }, punch: { fovDeg: 0.5, ms: 90 } },
    shot:    { fx: { kind: "streak", count: 14, color: "#ffd76a", speed: 5.2 }, cue: "kick", rumble: { ms: 30, weak: 0.45 }, punch: { fovDeg: 1.2, ms: 130 } },
    goal:    { fx: { kind: "ring", count: 26, color: "#d8ff3e", speed: 6.0 }, cue: "goal", hitStop: 0.09, shake: 0.55, punch: { fovDeg: 3.6, dolly: -0.5, ms: 320 }, flash: { color: "#d8ff3e", peak: 0.24, ms: 220 }, rumble: { ms: 90, strong: 0.7, weak: 0.9 } },
    save:    { fx: { kind: "burst", count: 16, color: "#7dfcff", speed: 4.4 }, cue: "save", punch: { fovDeg: 1.6, ms: 180 }, flash: { color: "#7dfcff", peak: 0.14, ms: 130 } },
    post:    { cue: "post", shake: 0.3, flash: { color: "#ffb3ac", peak: 0.12, ms: 110 } },
    tackle:  { fx: { kind: "dust", count: 10, color: "#cfc8a8", speed: 2.6 }, hitStop: 0.05, shake: 0.3, rumble: { ms: 50, strong: 0.5 } },
    skill:   { fx: { kind: "spark", count: 8, color: "#7dfcff", speed: 3.0 }, punch: { fovDeg: 0.8, ms: 110 } },
    wall:    { fx: { kind: "dust", count: 6, color: "#ff9a3d", speed: 2.0 } },
    whistle: { cue: "whistle" },
    fulltime:{ cue: "fulltime", shake: 0.4, punch: { fovDeg: 2.4, ms: 300 }, flash: { color: "#ffd76a", peak: 0.2, ms: 240 } }
  };

  const juice = createJuice({
    events: JUICE_EVENTS as any,
    camera: (app as any)?.camera,
    session: {
      reducedMotion, reducedFlash,
      hitStop: (seconds: number) => { hitStopUntil = performance.now() / 1000 + seconds; },
      slowMo: () => {}
    } as any,
    fx,
    overlay: createOverlayDriver({ domElement: fxLayer }),
    tweens: createTweenEngine(),
    rumble: createRumbleDriver(),
    sound: { cue: (cue: string) => { void audio?.cue(cue); } }
  } as any);
  const juiceFire = (ev: string, at?: Record<string, unknown>) => {
    try { juice?.fire(ev as never, at as never); } catch { /* best-effort */ }
  };

  /* -------------------------- touch -------------------------- */
  let touchControls: any = null;
  try {
    touchControls = mountTouchControls(input as any, {
      preset: "dpad-4btn",
      bindings: {
        "stick.left": "left", "stick.right": "right", "stick.up": "up", "stick.down": "down",
        left: "left", right: "right", up: "up", down: "down",
        light: "pass", heavy: "shoot", special: "driven", jump: "skillA", block: "skillB"
      },
      haptics: { ms: 12 }
    } as any, {
      doc: document as any,
      root: shell as any,
      coarsePointer: () => window.matchMedia?.("(pointer: coarse)")?.matches ?? false
    } as any);
  } catch (e) {
    console.warn("[fc3d] touch controls unavailable", e);
  }

  /* -------------------------- event log -------------------------- */
  const eventLog = game.eventLog({ label: "aura-fc-3d events", maxEvents: 48 });

  /* -------------------------- camera director -------------------------- */
  type CamMode = "menu" | "intro" | "broadcast" | "goal" | "penalty" | "lab" | "celebrate";
  const cam = {
    mode: "menu" as CamMode,
    eye: [0, 24, 38] as Vec3,
    target: [0, 0.4, 0] as Vec3,
    fov: 16,
    modeT: 0,
    orbitA: 0,
    followX: 0,
    fovKick: 0
  };
  let prevModeTag = "";

  function updateCamera(dt: number): void {
    const s = sim.state;
    cam.modeT += dt;
    cam.orbitA += dt;

    const tag = `${modes.mode}:${s.phase}`;
    if (tag !== prevModeTag) {
      prevModeTag = tag;
      cam.modeT = 0;
      if (s.phase === "kickoff" || s.phase === "live") cam.mode = "broadcast";
      if (s.phase === "shootout") cam.mode = "penalty";
      if (modes.mode === "menu" || modes.mode === "studio" || modes.mode === "circuit") cam.mode = "menu";
      if (modes.mode === "touch") cam.mode = "lab";
    }
    if (s.phase === "goal") cam.mode = "goal";
    if (s.phase === "ended" && (modes.mode === "quick" || modes.mode === "circuit" || modes.mode === "demo")) cam.mode = "celebrate";
    if (modes.mode === "demo" && s.phase === "live" && cam.mode === "menu") cam.mode = "broadcast";

    const b = s.ball;
    const bSpeed = Math.hypot(b.vx, b.vz) * (b.mode === "flight" ? 1 : 0.2);
    cam.fovKick = lerp(cam.fovKick, clamp(bSpeed / 26, 0, 1) * 2.4, 1 - Math.pow(0.02, dt));
    cam.followX = lerp(cam.followX, clamp(b.x * 0.3, -9, 9), 1 - Math.pow(0.06, dt));

    if (cam.mode === "menu") {
      const r = 34;
      cam.eye = [Math.sin(cam.orbitA * 0.11) * r, 15 + Math.sin(cam.orbitA * 0.07) * 2.4, Math.cos(cam.orbitA * 0.11) * r];
      cam.target = [0, 1.1, 0];
      cam.fov = 26;
    } else if (cam.mode === "intro") {
      const t = smooth(clamp(cam.modeT / 2.2, 0, 1));
      cam.eye = mix3([-30, 18, -36], [0, 24, 38], t);
      cam.target = mix3([0, 4, -8], [0, 0.4, 0], t);
      cam.fov = lerp(24, 16, t);
      if (cam.modeT > 2.2) cam.mode = "broadcast";
    } else if (cam.mode === "goal") {
      // push toward the celebrating scorer / the net that billowed
      const scorer = s.players.find((p) => p.id === s.lastScorer);
      const gx = Math.sign(b.x || 1) * (PITCH_HX + 0.8);
      const px = scorer ? scorer.x : gx, pz = scorer ? scorer.z : b.z;
      const t = clamp(cam.modeT / 2.6, 0, 1);
      cam.eye = [lerp(px * 0.4, px - 5.5, t), lerp(7, 2.6, t), lerp(pz * 0.5, pz + 7.5, t)];
      cam.target = [px, 1.1, pz];
      cam.fov = lerp(20, 26, t);
      if (cam.modeT > 2.8) cam.mode = "broadcast";
    } else if (cam.mode === "penalty") {
      // behind the taker, tight on the mouth
      const aim = s.shootout?.aim ?? [0, 0.8];
      cam.eye = [PEN_X - 6.5, 3.6, aim[0] * 0.35];
      cam.target = [PITCH_HX - 0.4, 1.0 + aim[1] * 0.4, aim[0]];
      cam.fov = 24;
    } else if (cam.mode === "lab") {
      const me = s.players.find((p) => p.id === s.controlledId) ?? s.players[0];
      if (me) {
        cam.eye = [lerp(cam.eye[0], me.x - 7, 1 - Math.pow(0.03, dt)), 7.5, lerp(cam.eye[2], me.z + 12, 1 - Math.pow(0.03, dt))];
        cam.target = [me.x + 1.2, 0.6, me.z];
      }
      cam.fov = 30;
    } else if (cam.mode === "celebrate") {
      const scorer = s.players.find((p) => p.id === s.lastScorer) ?? s.players[0];
      const cx = scorer?.x ?? 0, cz = scorer?.z ?? 0;
      cam.eye = [cx + Math.sin(cam.orbitA * 0.4) * 8.5, 3.4, cz + Math.cos(cam.orbitA * 0.4) * 8.5];
      cam.target = [cx, 1.2, cz];
      cam.fov = 26;
    } else {
      // broadcast: long-lens side view, pans and subtly zooms with the ball
      const attacking = Math.abs(b.x) > PITCH_HX * 0.66;
      const push = attacking ? -2.4 : 0;
      cam.eye = [cam.followX, 23.5 + push * -0.4, 37.5 + push];
      cam.target = [cam.followX * 0.5 + b.x * 0.12, 0.4, b.z * 0.22];
      cam.fov = 15.5 + cam.fovKick + (attacking ? -1.4 : 0);
    }
    (app as any).camera?.setPose?.({ position: cam.eye, target: cam.target, fov: cam.fov });
  }

  /* -------------------------- kits -------------------------- */

  function kitsNow(): { home: AthleteKitLike; away: AthleteKitLike } {
    const c = modes.cfg;
    const homeId = c?.homeClub ?? modes.studio.club;
    const awayId = c?.awayClub ?? "iron";
    return { home: kitFor(homeId, false), away: kitFor(awayId, true) };
  }

  interface AthleteKitLike { jersey: string; shorts: string; socks: string; boots: string; skin: string; trim: string; keeper: boolean }
  function kitFor(clubId: string, isAway: boolean): AthleteKitLike {
    const club = clubFor(clubId);
    // studio edits only ever apply to the user's club; studio overrides land on "home" when it's the user's pick
    const isStudioClub = clubId === modes.studio.club;
    const jersey = club.primary;
    const shorts = club.secondary;
    const socks = club.socks;
    const boots = isStudioClub ? modes.studio.boots : "#22262e";
    const trim = club.keeper;
    void isAway;
    return { jersey, shorts, socks, boots, skin: "#c68a5a", trim, keeper: false };
  }
  function keeperKitFor(clubId: string): AthleteKitLike {
    const club = clubFor(clubId);
    return { jersey: club.keeper, shorts: club.secondary, socks: club.keeper, boots: "#1a1d24", skin: "#8a5f42", trim: club.trim, keeper: true };
  }

  function refreshKits(): void {
    const { home, away } = kitsNow();
    for (const p of sim.state.players as PlayerState[]) {
      const rig = rigs.get(p.id);
      if (!rig) continue;
      const base = p.team === 0 ? home : away;
      const kit = p.isKeeper ? keeperKitFor(p.team === 0 ? (modes.cfg?.homeClub ?? modes.studio.club) : (modes.cfg?.awayClub ?? "iron")) : base;
      applyAthleteKit(rig, { ...kit, skin: skinFor(p.id) });
    }
  }
  modes.onKitsChanged = refreshKits;

  /* -------------------------- frame loop -------------------------- */

  let framesRendered = 0;
  let lastVenue = "";
  const inputFrame: UserInputFrame = {
    move: [0, 0], sprint: false, passShort: false, passDriven: false,
    shootHeld: false, shootReleased: false,
    skillStepover: false, skillChop: false, switchPlayer: false, pause: false
  };

  function consumeEvents(events: SimEvent[]): void {
    for (const ev of events) {
      eventLog.push({ type: ev.type, label: ev.label, severity: ev.severity === "warn" ? "warning" : ev.severity ?? "info", value: ev.value, time: performance.now() / 1000, frame: framesRendered });
      hud.ticker(ev);
      const pos = ev.position ?? [sim.state.ball.x, 0.4, sim.state.ball.z];
      switch (ev.type) {
        case "shot": juiceFire("shot", { position: pos }); break;
        case "pass": juiceFire("kick", { position: pos }); break;
        case "goal": juiceFire("goal", { position: pos }); hud.banner("GOAL!", 2400, "goal"); void audio?.cue("crowd"); break;
        case "pen-goal": juiceFire("goal", { position: pos }); hud.banner("SCORES!", 1800, "goal"); break;
        case "save": juiceFire("save", { position: pos }); break;
        case "pen-save": juiceFire("save", { position: pos }); hud.banner("SAVED!", 1600, "warn"); break;
        case "pen-miss": hud.banner("OFF TARGET", 1600, "warn"); break;
        case "post": case "crossbar": juiceFire("post", { position: pos }); break;
        case "tackle": juiceFire("tackle", { position: pos }); break;
        case "skill": juiceFire("skill", { position: pos }); break;
        case "wall": juiceFire("wall", { position: pos }); break;
        case "halftime": hud.banner("HALF TIME", 2400); juiceFire("whistle"); break;
        case "extratime": hud.banner("GOLDEN GOAL — NEXT GOAL WINS", 2800, "gold"); juiceFire("whistle"); break;
        case "shootout-start": hud.banner("PENALTY SHOOTOUT", 2400, "warn"); juiceFire("whistle"); break;
        case "fulltime": juiceFire("fulltime"); if (sim.state.winner !== null) world.confetti?.setVisible(true), window.setTimeout(() => world.confetti?.setVisible(false), 5600); break;
        case "kickoff": case "throwin": case "corner": case "goalkick": case "penalty": default: break;
      }
    }
  }

  const TRAIL_MAX = 18;

  function frame() {
    const f = (frame: { dt: number }) => {
      const dt = clamp(frame.dt || 1 / 60, 0.001, 0.05);
      framesRendered++;

      input.update(dt);
      const now = performance.now() / 1000;
      const frozen = hitStopUntil > now;

      inputFrame.move = [input.axis("moveX"), input.axis("moveZ")];
      inputFrame.sprint = input.held("sprint");
      inputFrame.passShort = input.pressed("pass");
      inputFrame.passDriven = input.pressed("driven");
      inputFrame.shootHeld = input.held("shoot");
      inputFrame.shootReleased = input.released("shoot");
      inputFrame.skillStepover = input.pressed("skillA");
      inputFrame.skillChop = input.pressed("skillB");
      inputFrame.switchPlayer = input.pressed("switch");
      if (input.pressed("pause")) {
        const paused = sim.togglePause();
        hud.banner(paused ? "PAUSED" : "PLAY ON", 1400);
      }

      const events = frozen ? [] : sim.step(frozen ? 0.0001 : dt, inputFrame);
      consumeEvents(events);

      const s = sim.state;
      const ctx = modes.frame(dt, inputFrame);

      // venue retint when it changes
      if (s.venue !== lastVenue) {
        lastVenue = s.venue;
        applyVenue(world, VENUES[s.venue]);
        refreshKits();
        hud.banner(VENUES[s.venue].label, 2400);
      }

      /* ---- render athletes ---- */
      const t = now;
      const seen = new Set<string>();
      for (const p of s.players as PlayerState[]) {
        const rig = rigs.get(p.id);
        if (!rig) continue;
        seen.add(p.id);
        poseAthlete(rig, p, t, { ballX: s.ball.x, ballZ: s.ball.z, hasBall: s.ball.ownerId === p.id });
        // keeper gloves hint: brighter hands
        if (p.isKeeper) { /* kit applied already */ }
      }
      for (const [id, rig] of rigs) {
        if (!seen.has(id)) {
          // athlete not in this mode (touch lab solo) — hide
          for (const h of Object.values(rig)) (h as any)?.setVisible?.(false);
        } else {
          for (const h of Object.values(rig)) (h as any)?.setVisible?.(true);
          rigs.get(id)!.ring.setVisible(s.players.find((p) => p.id === id)?.controlled ?? false);
        }
      }

      /* ---- ball ---- */
      const b = s.ball;
      world.ball?.setPosition(b.x, Math.max(BALL_R * 1.05, b.y), b.z).setRotation(t * 2.4, t * 3.1, 0);
      world.ballGlow?.setPosition(b.x, Math.max(BALL_R * 1.05, b.y), b.z).setScale([1, 1, 1]);
      const shScale = clamp(1 - b.y * 0.12, 0.3, 1.05);
      world.ballShadow?.setPosition(b.x, 0.015, b.z).setScale([shScale, 1, shScale]);

      /* ---- aim ring (shootout) + lab ring (touch lab) ---- */
      if (s.phase === "shootout" && s.shootout && s.shootout.takerTeam === s.userTeam && s.shootout.stage === "aim") {
        world.aimRing?.setPosition(PITCH_HX - 0.15, s.shootout.aim[1] + 0.1, s.shootout.aim[0])
          .setRotation(0, Math.PI / 2, 0)
          .setScale([1 + s.shootout.power * 0.8, 1 + s.shootout.power * 0.8, 1 + s.shootout.power * 0.8])
          .setVisible(true);
      } else {
        world.aimRing?.setVisible(false);
      }
      if (modes.labRing) {
        world.labRing?.setPosition(modes.labRing[0], 0.035, modes.labRing[1]).setScale([1, 1, 1]).setVisible(true);
      } else {
        world.labRing?.setVisible(false);
      }

      /* ---- ambient world tick ---- */
      tickWorld(world, t, {
        cheering: s.phase === "goal" || s.phase === "ended" && s.winner !== null,
        ripple: s.goalFlashT
      });

      /* ---- camera ---- */
      updateCamera(dt);

      touchControls?.update?.();

      /* ---- HUD ---- */
      const home = clubFor(modes.cfg?.homeClub ?? modes.studio.club);
      const away = clubFor(modes.cfg?.awayClub ?? "iron");
      hud.update(s, {
        home, away,
        tag: ctx.tag ?? modes.cfg?.circuitTag,
        labLabel: ctx.labLabel, labScore: ctx.labScore, labBest: ctx.labBest,
        charge: sim.chargeLevel > 0 ? sim.chargeLevel : null
      });

      /* ---- evidence ---- */
      const evidence = {
        route: "showcase-aura-fc-3d",
        engine: "@aura3d/engine",
        ready: true,
        framesRendered,
        look: LOOK_ID,
        mode: modes.mode,
        phase: s.phase,
        half: s.half,
        clock: Math.round(s.clock * 10) / 10,
        venue: s.venue,
        score: [...s.score],
        ball: { position: [b.x, b.y, b.z], mode: b.mode, lastShot: b.lastShot, freeT: Math.round(b.freeT * 100) / 100 },
        possessionTeam: s.possessionTeam,
        possession: [Math.round(s.possession[0] * 10) / 10, Math.round(s.possession[1] * 10) / 10],
        controlledId: s.controlledId,
        userTeam: s.userTeam,
        kicks: s.kicks,
        shotsOn: [...s.shotsOn],
        saves: [...s.saves],
        corners: [...s.corners],
        shootout: s.shootout ? { stage: s.shootout.stage, scores: [...s.shootout.scores], taken: [...s.shootout.taken], round: s.shootout.round } : null,
        winner: s.winner,
        cameraMode: cam.mode,
        camera: { position: [...cam.eye], target: [...cam.target], fov: cam.fov },
        paused: s.paused,
        athleteCount: s.players.length,
        juice: (juice as any)?.snapshot?.() ?? null,
        accessibility: a11y ? { reducedMotion: a11y.reducedMotion, reducedFlash: a11y.reducedFlash, highContrast: a11y.highContrast } : null,
        touch: touchControls?.evidence?.() ?? null,
        audio: (audio as any)?.evidence ?? null,
        eventLog: eventLog.snapshot(),
        meshyAssets: [
          "fcMatchBallMeshy", "fcFloodlightPylonMeshy", "fcScoreboardGantryMeshy",
          "fcGlacierDomeMeshy", "fcHeroTrophyMeshy"
        ],
        modes: ["quick", "demo", "shootout", "touch", "circuit", "studio"],
        venues: VENUE_ORDER,
        clubs: ["aurora", "kings", "iron", "waves", "kites", "stars", "giants", "storm"],
        hud: (game as any).hud?.snapshot?.({
          appState: {
            score: `${s.score[0]}-${s.score[1]}`,
            venue: s.venue,
            mode: modes.mode,
            phase: s.phase
          }
        }) ?? null,
        deterministic: { ik: "solveArmElbow", ballSim: "sim.ts", seed: "lcg:0xf0a7ba11" }
      };
      (window as any).__AURA3D_GAME_EVIDENCE__ = evidence;
      (window as any).__AURA3D_GAME__ = evidence;
      (window as any).__gameEvidence = evidence;
      (window as any).__auraEvidence = evidence;
    };
    return f;
  }

  const frameFn = frame();
  app.onFrame((f) => frameFn(f));

  /* -------------------------- toolbar -------------------------- */

  function bindToolbar(): void {
    const playBtn = document.getElementById("fc-btn-play");
    const labBtn = document.getElementById("fc-btn-lab");
    const menuBtn = document.getElementById("fc-btn-menu");
    const demoBtn = document.getElementById("fc-btn-demo");
    const venueBtns = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-fc-venue]"));

    playBtn?.addEventListener("click", () => modes.startQuick());
    labBtn?.addEventListener("click", () => modes.startShootoutLab());
    menuBtn?.addEventListener("click", () => modes.enterMenu());
    demoBtn?.addEventListener("click", () => modes.startDemo());
    for (const btn of venueBtns) {
      btn.addEventListener("click", () => {
        const v = btn.dataset.fcVenue as keyof typeof VENUES;
        modes.venue = v;
        for (const b of venueBtns) b.classList.toggle("active", b === btn);
        if (sim.state.mode === "menu" || modes.mode === "menu") {
          sim.state.venue = v;
        }
        hud.banner(VENUES[v].label, 1800);
      });
    }
    const req = params.get("venue");
    if (req && (VENUES as Record<string, unknown>)[req]) {
      venueBtns.find((b) => b.dataset.fcVenue === req)?.click();
    }
  }

  bindToolbar();

  /* -------------------------- boot mode -------------------------- */

  hud.setVisible(true);
  document.body.dataset.aura3dReady = "true";
  if (canvas) canvas.dataset.ready = "true";

  if (params.has("demo") || params.has("auto")) {
    // CPU-vs-CPU immediately — remote captures see live play
    modes.startDemo();
  } else if (params.get("mode") === "quick") {
    modes.startQuick();
  } else if (params.get("mode") === "shootout") {
    modes.startShootoutLab();
  } else if (params.get("mode") === "touch") {
    modes.startTouchLab();
  } else {
    modes.enterMenu();
  }
}

boot();
