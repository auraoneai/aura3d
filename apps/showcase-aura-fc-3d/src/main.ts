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
  createAuraApp, createGameAudio, game, installQaHooks, looks, material
} from "@aura3d/engine";
import {
  createJuice, createOverlayDriver, createRumbleDriver, createTweenEngine,
  createFxParticlePass,
  installGameBeacon
} from "@aura3d/engine/game";
import "../../showcase-port-shared/quickbar.css";
import { assets } from "./aura-assets-v2";
import { createSim, PITCH_HX, PITCH_HZ, PEN_X, BALL_R, BALL_VIS_R, SIM_DT } from "./game/sim";
import { buildFcScene, resolveWorld, applyVenue, tickWorld, ATHLETE_IDS, VENUE_LOOKS, withoutLookAo, applyPostAccessibility } from "./game/scene";
import { ORIGINAL_LOOKS, fcLookMode, usesOriginalBase } from "./game/look";
import { mountFcTouch } from "./game/touch";
import { fireFcVfx, registerFcVfxPack, type FcVfxEvent } from "./game/vfx";
import { fcQaCrops } from "./game/qaCrops";
import { fitCameraToAspect, broadcastPose, originalBroadcastPose, hybridBroadcastPose, introRailPose, replayPose, fullTimeOrbitPose, INTRO_RAIL_S } from "./game/camera";
import { createReplayBuffer, type ReplayFrame, type ReplayPlayback } from "./game/replay";
import { bindScoreboardText, shownScore } from "./game/scoreboard3d";
import { loadSave } from "./game/save";
import { resolveAthlete, applyAthleteKit, poseAthlete, skinFor, teamKitForId, type AthleteRig } from "./game/rig";
import { createHud, clubFor } from "./game/hud";
import { createModes } from "./game/modes";
import { VENUES, VENUE_ORDER } from "./game/content";
import type { UserInputFrame, PlayerState, SimEvent, VenueId } from "./game/types";
import { installBlackFrameGuard } from "@aura3d/debug";

let gameBeacon: ReturnType<typeof installGameBeacon> | undefined;
const publishBeacon = (evidence: object): void => {
  gameBeacon ??= installGameBeacon({ route: "showcase-aura-fc-3d", evidenceGlobals: ["__AURA3D_GAME_EVIDENCE__", "__gameEvidence", "__auraEvidence"] });
  gameBeacon.publishEvidence(evidence);
};

installBlackFrameGuard();

type Vec3 = [number, number, number];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** FC-23: the values published in `__AURA3D_GAME_EVIDENCE__.hud` (read from the appState passed each frame). */
const hudBinding = (binding: string, id: string, label: string, valuePath: string, format: string, extra: Record<string, unknown> = {}) => ({
  kind: "aura-game-hud-binding", binding, id, label, owner: "app", source: "app-state", valuePath, format,
  a11yLabel: label, debugOnly: false, interactive: false, ...extra
});
const HUD_BINDINGS = [
  hudBinding("score", "score", "Score", "appState.score", "text"),
  hudBinding("timer", "clock", "Match clock", "appState.clock", "clock", { maxPath: "appState.clockMax" }),
  hudBinding("value", "half", "Half", "appState.half", "number"),
  hudBinding("meter", "stamina", "Sprint stamina", "appState.stamina", "percent", { maxPath: "appState.unit" }),
  hudBinding("meter", "possession", "Home possession", "appState.possessionHome", "percent", { maxPath: "appState.unit" }),
  hudBinding("value", "shootout", "Shootout", "appState.shootout", "text"),
  hudBinding("value", "phase", "Phase", "appState.phase", "text"),
  hudBinding("value", "paused", "Paused", "appState.paused", "boolean")
];

/* ------------------------------------------------------------------ */

function boot(): void {
  const mount = document.getElementById("app");
  const shell = document.querySelector<HTMLElement>(".game-shell") ?? document.body;
  const errEl = document.getElementById("render-error");
  if (!mount) { if (errEl) errEl.hidden = false; return; }

  // build the first scene for the venue the page will show, so a ?venue= or saved venue does not remount at once
  const bootParams = new URLSearchParams(window.location.search);
  const bootVenue: VenueId = ((): VenueId => {
    const req = bootParams.get("venue");
    if (req && (VENUES as Record<string, unknown>)[req]) return req as VenueId;
    return loadSave().venue;
  })();
  let sceneVenue: VenueId = bootVenue;
  // PRD D11: the venue's look path (`?look=original` = the 4.6.2 look; the default is per venue, look.ts). The hybrid
  // path keeps the 4.6.2 base (app look options, no output preset, camera, no rail) under its GU47 layers.
  const bootOriginal = usesOriginalBase(fcLookMode(bootVenue));
  const noAo = bootParams.get("ao") === "0";
  // PRD 6.3: read before the first scene build (weather emission, motion blur and chromatic aberration follow it)
  const reducedMotion = bootParams.has("reducedMotion") || (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
  const reducedFlash = bootParams.has("reducedFlash") || (window.matchMedia?.("(prefers-reduced-flash: reduce)")?.matches ?? false);
  const sceneFor = (venue: VenueId) => {
    const built = buildFcScene(venue, { reducedMotion });
    return noAo ? withoutLookAo(built) : built;
  };

  let app: ReturnType<typeof createAuraApp>;
  try {
    app = createAuraApp("#app", {
      scene: sceneFor(bootVenue),
      ...looks.appOptions(bootOriginal ? ORIGINAL_LOOKS[bootVenue].look : VENUE_LOOKS[bootVenue].look),
      // FC47-P1: the boot venue's output preset (the look carries the same id as its output.preset child). A venue
      // switched to at runtime keeps this operator: GU47(E-C) applying the look's output.preset child makes it per scene.
      // PRD D11: the 4.6.2 look path set no output preset; `?outputPreset=off` is the QA A/B for the GU47 path.
      ...(bootOriginal || bootParams.get("outputPreset") === "off" ? {} : { output: { preset: VENUE_LOOKS[bootVenue].post } }),
      qualityRebuild: { flags: ["game"] }
    } as any);
  } catch (e) {
    console.error("[fc3d] createAuraApp failed", e);
    if (errEl) errEl.hidden = false;
    return;
  }
  // FC47-V1: runtime VFX are back on (E-F fixed the floating-dot cause in the engine); `?vfx=off` turns them off for
  // diagnosis.
  if (bootParams.get("vfx") === "off") (app as any).effects.runtime = "off";
  // The cinematic-film preset contributes a depth-of-field stage; the broadcast frame stays sharp (goal DOF: FC47-P3).
  // Reduced motion also drops the presets' chromatic aberration and motion blur (PRD 6.3).
  applyPostAccessibility(app, reducedMotion);
  // FC47-V1: the venue's runtime VFX pack (registerPreset), re-registered on every venue rebuild
  const vfxOpts = { reducedMotion, reducedFlash };
  registerFcVfxPack((app as any).effects, bootVenue, vfxOpts);
  let vfxFired = 0;
  const packFx = (event: FcVfxEvent, at: readonly [number, number, number]): void => {
    vfxFired += fireFcVfx((app as any).effects, event, at, sceneVenue, vfxOpts).length;
  };
  const canvas = app.canvas;

  /* -------------------------- handles -------------------------- */
  let world = resolveWorld(app);
  // FC47-H1: the gantry screen's SDF score reel (re-bound after each venue rebuild)
  let scoreReel = bindScoreboardText(app);
  let reelShown: ReadonlySet<string> = new Set();
  const rigs = new Map<string, AthleteRig>();
  for (const id of ATHLETE_IDS) rigs.set(id, resolveAthlete(app, id));
  /** FC-21: the look is part of the scene graph, so a venue change rebuilds the scene and re-resolves every handle. */
  const rebuildForVenue = (venue: VenueId): void => {
    if (venue === sceneVenue) return;
    sceneVenue = venue;
    try {
      (app as any).setScene(sceneFor(venue));
      applyPostAccessibility(app, reducedMotion);
      registerFcVfxPack((app as any).effects, venue, vfxOpts);
      world = resolveWorld(app);
      scoreReel = bindScoreboardText(app);
      for (const id of ATHLETE_IDS) rigs.set(id, resolveAthlete(app, id));
    } catch (e) {
      console.warn("[fc3d] venue rebuild failed", e);
    }
  };

  const sim = createSim();
  const hud = createHud(shell);  const modes = createModes({
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
      sprint: ["ShiftLeft", "ShiftRight", "TouchSprint"],
      pass: ["KeyE", "TouchPass"], driven: ["KeyR", "TouchDriven"],
      shoot: ["Space", "TouchShoot"],
      skillA: ["KeyJ", "TouchSkillA"], skillB: ["KeyK", "TouchSkillB"],
      switch: ["KeyQ", "TouchSwitch"],
      pause: ["KeyP", "Escape", "TouchPause"]
    },
    axes: {
      moveX: { negative: "left", positive: "right" },
      moveZ: { negative: "up", positive: "down" }
    },
    bufferMs: 130,
    gamepad: true
  });

  // FC-E4: every key, button and touch control reads through `app.input` (one action map, remappable in one place).
  // This listener only stops Space and the arrows from scrolling the page.
  window.addEventListener("keydown", (e) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  }, { passive: false });

  /* -------------------------- juice + audio -------------------------- */
  const params = bootParams;
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
      // dust is kicked up from the turf at the contact point: keep it on the ground and faint
      const pos = kind === "dust" || kind === "splash" ? [position?.[0] ?? 0, 0.08, position?.[2] ?? 0] : position;
      try { fxCtl?.spawn(FX_KIND[kind] ?? "hit-spark", pos, { radius: Math.max(0.2, (o?.count ?? 10) / 24), color: o?.color, intensity: kind === "dust" || kind === "splash" ? 0.6 : 1 }); } catch { /* best effort */ }
    },
    trail: () => {},
    liveCount: () => 0
  } as any);

  let hitStopUntil = 0;
  // QA: freeze the sim at a chosen fraction of the next kick swing and look at the kicker (see installQaHooks below)
  let qaFrozen = false;
  let qaTargetFrac: number | null = null;
  let qaKickerId: string | null = null;
  let qaFocus = false;
  let userInteracted = false;
  const audio = createGameAudio({
    browserContext: false,
    cues: {
      // FC-16: a referee whistle replaces the buzzer; kick, net and post are football sounds made by
      // tools/aura-fc/synth-sfx.mjs; a stadium crowd bed loops from kickoff (ducked in menus and pause) and swells on goals.
      kick:    { id: "kick", asset: assets.fcKickSfx, volume: 0.55 },
      pass:    { id: "pass", asset: assets.fcKickSfx, volume: 0.3 },
      goal:    { id: "goal", asset: assets.diamondCrowdSwelSfx, volume: 0.85 },
      net:     { id: "net", asset: assets.fcNetSfx, volume: 0.6 },
      save:    { id: "save", asset: assets.hoopsBlockSfx, volume: 0.5 },
      post:    { id: "post", asset: assets.fcPostSfx, volume: 0.42 },
      whistle: { id: "whistle", asset: assets.bankShotFoulWhistleSfx, volume: 0.55 },
      fulltime:{ id: "fulltime", asset: assets.bankShotFoulWhistleSfx, volume: 0.75 },
      lose:    { id: "lose", asset: assets.hoopsBlockSfx, volume: 0.4 },
      crowd:   { id: "crowd", asset: assets.diamondCrowdSfx, volume: 0.32, loop: true }
    },
    buses: [{ id: "sfx" } as any]
  } as any);
  const unlock = () => {
    userInteracted = true;
    void Promise.resolve(audio?.unlock()).then(() => syncCrowd());
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  // Camera feel: trauma-based shake kept small and brief. Rotation never exceeds ~0.5 degrees, translation a couple of
  // centimetres, trauma decays in well under half a second and stacked events cannot sum past MAX_TRAUMA. Only real
  // events shake (a goal, a tackle, off the woodwork); passes and shots punch the FOV at most, never shake.
  const MAX_TRAUMA = 0.7;
  const shakeOff = params.get("shake") === "0" || reducedMotion;
  (app as any)?.camera?.shake?.configure?.({ maxAngleDeg: 0.5, maxOffset: 0.02, frequency: 14, decayPerSecond: 2.8, maxTrauma: MAX_TRAUMA });
  const JUICE_EVENTS: Record<string, any> = {
    kick:    { fx: { kind: "spark", count: 6, color: "#d8ff3e", speed: 3.0 }, cue: "kick", rumble: { ms: 22, weak: 0.3 } },
    shot:    { fx: { kind: "streak", count: 8, color: "#ffd76a", speed: 5.2 }, cue: "kick", rumble: { ms: 30, weak: 0.45 }, punch: { fovDeg: 0.6, ms: 120 } },
    goal:    { fx: { kind: "ring", count: 16, color: "#d8ff3e", speed: 4.0 }, cue: "goal", hitStop: 0.09, shake: shakeOff ? 0 : 0.6, punch: { fovDeg: 2.0, dolly: -0.3, ms: 320 }, flash: { color: "#d8ff3e", peak: 0.2, ms: 220 }, rumble: { ms: 90, strong: 0.7, weak: 0.9 } },
    save:    { fx: { kind: "burst", count: 10, color: "#7dfcff", speed: 3.6 }, cue: "save", punch: { fovDeg: 1.0, ms: 180 }, flash: { color: "#7dfcff", peak: 0.12, ms: 130 } },
    post:    { cue: "post", shake: shakeOff ? 0 : 0.25, flash: { color: "#ffb3ac", peak: 0.1, ms: 110 } },
    tackle:  { fx: { kind: "dust", count: 6, color: "#cfc8a8", speed: 1.6 }, hitStop: 0.05, shake: shakeOff ? 0 : 0.35, rumble: { ms: 50, strong: 0.5 } },
    skill:   { fx: { kind: "spark", count: 5, color: "#7dfcff", speed: 2.4 }, punch: { fovDeg: 0.5, ms: 110 } },
    wall:    { fx: { kind: "dust", count: 4, color: "#ff9a3d", speed: 1.4 } },
    whistle: { cue: "whistle" },
    net:     { cue: "net" },
    fulltime:{ cue: "fulltime", punch: { fovDeg: 1.6, ms: 300 }, flash: { color: "#ffd76a", peak: 0.18, ms: 240 } }
  };

  const baseRumble = createRumbleDriver();
  const safeRumble = (opts: any) => {
    if (userInteracted) return baseRumble(opts);
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
    rumble: safeRumble as any,
    sound: { cue: (cue: string) => { void audio?.cue(cue); } }
  } as any);
  const juiceFire = (ev: string, at?: Record<string, unknown>) => {
    try { juice?.fire(ev as never, at as never); } catch { /* best-effort */ }
  };

  /* -------------------------- touch -------------------------- */
  // FC-06: an analog movement stick plus shoot, pass, long pass, sprint, skill, slide, switch and pause buttons
  const touchControls = mountFcTouch(input as any, shell, {
    coarse: () => window.matchMedia?.("(pointer: coarse)")?.matches ?? false
  });

  /* -------------------------- event log -------------------------- */
  const eventLog = game.eventLog({ label: "aura-fc-3d events", maxEvents: 48 });

  /* -------------------------- camera director -------------------------- */
  type CamMode = "menu" | "intro" | "broadcast" | "goal" | "replay" | "penalty" | "lab" | "celebrate";
  const cam = {
    mode: "menu" as CamMode,
    eye: [0, 22.5, 38.5] as Vec3,
    target: [0, 0.8, -1.5] as Vec3,
    fov: 54,
    modeT: 0,
    orbitA: 0,
    followX: 0,
    fovKick: 0,
    shownEye: [0, 22.5, 38.5] as Vec3,
    shownFov: 54
  };
  let prevModeTag = "";
  // FC47-C1 broadcast package: tunnel-to-gantry intro once per match (`?intro=off`; reduced motion cuts straight to the
  // gantry), goal replay from the render-side ring buffer (`?replay=off`), full-time orbit, a hard cut on shot changes.
  // PRD D11: the original look path keeps the 4.6.2 camera too (no rail, the 9.5 m side-follow broadcast rig).
  const introOff = bootParams.get("intro") === "off" || reducedMotion || bootOriginal;
  const replayOff = bootParams.get("replay") === "off";
  let introPlayed = false;
  // Phase 2: the rail runs on wall-clock time as well as frame time. Frame dt is clamped to 0.1 s, so on a slow
  // device (software WebGL2 draws about one frame a second) the 4 s rail took minutes and the camera sat at the tunnel
  // mouth, inside the weather and fog (the near-black / blank night captures).
  let introStartMs = 0;
  let shownMode: CamMode = cam.mode;
  let camCuts = 0;
  const replayBuf = createReplayBuffer();
  let replay: { plan: ReplayPlayback; elapsed: number; side: number; frame: ReplayFrame | null } | null = null;

  function updateCamera(dt: number): void {
    const s = sim.state;
    cam.modeT += dt;
    cam.orbitA += dt;

    const tag = `${modes.mode}:${s.phase}`;
    if (tag !== prevModeTag) {
      prevModeTag = tag;
      cam.modeT = 0;
      if (s.phase === "kickoff" || s.phase === "live") cam.mode = "broadcast";
      // FC47-C1: the first kickoff of a match opens on the 4 s tunnel-to-gantry rail
      if (s.phase === "kickoff" && s.half === 1 && s.clock === 0 && !introPlayed && !introOff
        && (modes.mode === "quick" || modes.mode === "circuit" || modes.mode === "demo")) { cam.mode = "intro"; introPlayed = true; introStartMs = performance.now(); }
      if (s.phase === "shootout") cam.mode = "penalty";
      if (modes.mode === "menu" || modes.mode === "studio" || modes.mode === "circuit") { cam.mode = "menu"; if (modes.mode !== "circuit") introPlayed = false; }
      if (modes.mode === "touch") cam.mode = "lab";
    }
    if (cam.mode === "intro" && hasUserInput()) cam.mode = "broadcast";   // any input skips the rail
    if (s.phase === "goal") cam.mode = replay ? "replay" : "goal";
    if (s.phase === "ended" && (modes.mode === "quick" || modes.mode === "circuit" || modes.mode === "demo")) cam.mode = "celebrate";
    if (modes.mode === "demo" && s.phase === "live" && cam.mode === "menu") cam.mode = "broadcast";

    const b = s.ball;
    const bSpeed = Math.hypot(b.vx, b.vz) * (b.mode === "flight" ? 1 : 0.2);
    cam.fovKick = lerp(cam.fovKick, clamp(bSpeed / 26, 0, 1) * 1.4, 1 - Math.pow(0.02, dt));
    cam.followX = lerp(cam.followX, clamp(b.x * 0.6, -13, 13), 1 - Math.pow(0.06, dt));

    if (cam.mode === "menu") {
      const r = 38;
      cam.eye = [Math.sin(cam.orbitA * 0.11) * r, 18 + Math.sin(cam.orbitA * 0.07) * 2.4, Math.cos(cam.orbitA * 0.11) * r];
      cam.target = [0, 1.1, 0];
      cam.fov = 46;
    } else if (cam.mode === "intro") {
      const railT = Math.max(cam.modeT, (performance.now() - introStartMs) / 1000);
      const shot = introRailPose(railT);
      cam.eye = shot.eye; cam.target = shot.target; cam.fov = shot.fov;
      if (railT >= INTRO_RAIL_S) { cam.mode = "broadcast"; cam.modeT = Math.max(cam.modeT, INTRO_RAIL_S); }
    } else if (cam.mode === "replay" && replay) {
      const rb = replay.frame?.ball ?? b;
      const shot = replayPose(replay.side, rb.x, rb.z, reducedMotion, PITCH_HX);
      cam.eye = shot.eye; cam.target = shot.target; cam.fov = shot.fov;
    } else if (cam.mode === "goal") {
      // push toward the celebrating scorer / the net that billowed
      const scorer = s.players.find((p) => p.id === s.lastScorer);
      const gx = Math.sign(b.x || 1) * (PITCH_HX + 0.8);
      const px = scorer ? scorer.x : gx, pz = scorer ? scorer.z : b.z;
      const t = clamp(cam.modeT / 2.6, 0, 1);
      cam.eye = [lerp(px * 0.4, px - 5.5, t), lerp(10, 3.6, t), lerp(pz * 0.5, pz + 9.5, t)];
      cam.target = [px, 1.1, pz];
      cam.fov = lerp(42, 36, t);
      if (cam.modeT > 2.8) cam.mode = "broadcast";
    } else if (cam.mode === "penalty") {
      // behind the taker, tight on the mouth
      const aim = s.shootout?.aim ?? [0, 0.8];
      cam.eye = [PEN_X - 6.5, 3.6, aim[0] * 0.35];
      cam.target = [PITCH_HX - 0.4, 1.0 + aim[1] * 0.4, aim[0]];
      cam.fov = 34;
    } else if (cam.mode === "lab") {
      const me = s.players.find((p) => p.id === s.controlledId) ?? s.players[0];
      if (me) {
        cam.eye = [lerp(cam.eye[0], me.x - 7, 1 - Math.pow(0.03, dt)), 7.5, lerp(cam.eye[2], me.z + 12, 1 - Math.pow(0.03, dt))];
        cam.target = [me.x + 1.2, 0.6, me.z];
      }
      cam.fov = 38;
    } else if (cam.mode === "celebrate" && cam.modeT > 3) {
      // FC47-C1 full-time orbit: after 3 s on the scorer, a slow rising orbit of the bowl
      const shot = fullTimeOrbitPose(cam.modeT - 3, reducedMotion);
      cam.eye = shot.eye; cam.target = shot.target; cam.fov = shot.fov;
    } else if (cam.mode === "celebrate") {
      const scorer = s.players.find((p) => p.id === s.lastScorer) ?? s.players[0];
      const cx = scorer?.x ?? 0, cz = scorer?.z ?? 0;
      cam.eye = [cx + Math.sin(cam.orbitA * 0.4) * 8.5, 3.4, cz + Math.cos(cam.orbitA * 0.4) * 8.5];
      cam.target = [cx, 1.2, cz];
      cam.fov = 34;
    } else {
      // broadcast: tighter side-follow rig. The old wide framing showed the
      // whole stadium but left players ~20px tall; now the camera rides the
      // ball so dribbles, tackles and shots read at gameplay scale. The eye
      // also eases toward the ball across the touchline so near-side play
      // stays inside the frame instead of falling off the bottom edge.
      // FC47-C1: the main cam is the gantry, 14 m up looking down 30 degrees (was 9.5 m, about 22 degrees).
      const lookMode = fcLookMode(sceneVenue);
      const shot = lookMode === "hybrid" ? hybridBroadcastPose(cam.followX, b.x, b.z)
        : usesOriginalBase(lookMode) ? originalBroadcastPose(cam.followX, b.x, b.z) : broadcastPose(cam.followX, b.x, b.z);
      cam.eye = shot.eye; cam.target = shot.target; cam.fov = shot.fov;
    }
    const qaP = qaFocus && qaKickerId ? (s.players as PlayerState[]).find((p) => p.id === qaKickerId) : undefined;
    if (qaP) {
      // kicking-side view: the right boot is on (-sin yaw, cos yaw); stand 4.2 m out on that side
      cam.eye = [qaP.x - Math.sin(qaP.yaw) * 4.2, 1.35, qaP.z + Math.cos(qaP.yaw) * 4.2];
      cam.target = [qaP.x, 0.95, qaP.z];
      cam.fov = 36;
    }
    // FC-09: portrait phones keep the landscape shot's horizontal coverage (about 20 m of pitch on the broadcast rig)
    const aspect = canvas && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : window.innerWidth / Math.max(1, window.innerHeight);
    const fit = fitCameraToAspect(cam.eye, cam.target, cam.fov, aspect);
    cam.shownEye = fit.eye; cam.shownFov = fit.fov;
    // FC47-C1: a shot change is a hard cut (the camera evidence reports cutThisFrame; temporal history resets), except
    // the rail's own landing on the gantry, which is continuous.
    const cut = cam.mode !== shownMode && !(shownMode === "intro" && cam.mode === "broadcast" && cam.modeT >= INTRO_RAIL_S);
    if (cam.mode !== shownMode) { if (cut) camCuts++; shownMode = cam.mode; hud.bars(cam.mode === "intro"); hud.replayTag(cam.mode === "replay"); }
    (app as any).camera?.setPose?.({ position: fit.eye, target: cam.target, fov: fit.fov }, cut ? { cut: true } : undefined);
  }
  function hasUserInput(): boolean {
    return inputFrame.move[0] !== 0 || inputFrame.move[1] !== 0 || inputFrame.passShort || inputFrame.passDriven || inputFrame.shootHeld || inputFrame.switchPlayer;
  }

  /* -------------------------- kits -------------------------- */
  //
  // Team identity is FIXED per side (rig.ts TEAM_KITS): the GLB body carries a
  // baked whole-mesh team colour; only the turf rings are retinted per athlete
  // here. Both teams are always strongly contrasted
  // (hue + value) with distinct keeper kits, whatever the fixture names.

  function refreshKits(): void {
    for (const p of sim.state.players as PlayerState[]) {
      const rig = rigs.get(p.id);
      if (!rig) continue;
      const kit = teamKitForId(p.id);
      applyAthleteKit(rig, {
        jersey: kit.shirt, shorts: kit.shorts, socks: kit.socks,
        boots: "#22262e", skin: skinFor(p.id), trim: kit.shirt, keeper: kit.keeper
      });
    }
  }
  modes.onKitsChanged = refreshKits;
  refreshKits();   // rings carry team colours from the first frame

  /* -------------------------- frame loop -------------------------- */

  let framesRendered = 0;
  let goalSide: -1 | 0 | 1 = 0;
  let lastEvidenceAt = -1;
  let lastVenue = "";
  let lastPhaseForCrowd = "";
  let appReady = false;
  let autopilot = params.get("autoplay") === "1" || params.get("demo") === "1";
  sim.setAutopilot(autopilot);
  sim.setAssist(params.get("assist") === "1");

  const inputFrame: UserInputFrame = {
    move: [0, 0], sprint: false, passShort: false, passDriven: false,
    shootHeld: false, shootReleased: false,
    skillStepover: false, skillChop: false, switchPlayer: false, pause: false
  };
  let stepAcc = 0;
  const clearEdges = () => {
    inputFrame.passShort = false; inputFrame.passDriven = false; inputFrame.shootReleased = false;
    inputFrame.skillStepover = false; inputFrame.skillChop = false; inputFrame.switchPlayer = false;
  };

  /* ---- FC-15: pause holds the sim and the lab clocks, shows a panel until play resumes, and auto-pauses on tab hide ---- */
  const pausable = () => sim.state.phase !== "idle" && sim.state.phase !== "ended" && modes.mode !== "menu" && modes.mode !== "studio" && modes.mode !== "circuit";
  function setPaused(on: boolean): void {
    if (on && !pausable()) return;
    if (sim.state.paused !== on) sim.togglePause();
    hud.setPaused(sim.state.paused);
    syncCrowd();
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden && appReady) setPaused(true); });

  /* ---- FC-16 crowd bed: starts with the first match, ducked in menus and pause, swells on goals ---- */
  let crowdOn = false;
  function syncCrowd(): void {
    if (!userInteracted) return;
    if (!crowdOn) { crowdOn = true; void audio?.cue("crowd"); }
    const inMatch = modes.mode !== "menu" && modes.mode !== "studio" && modes.mode !== "circuit";
    const level = sim.state.paused || !inMatch ? 0.25 : sim.state.phase === "goal" ? 1.6 : 1;
    try { (audio as any)?.setCueLevel?.("crowd", { volume: level }, 400); } catch { /* best effort */ }
  }

  function consumeEvents(events: SimEvent[]): void {
    for (const ev of events) {
      eventLog.push({ type: ev.type, label: ev.label, severity: ev.severity === "warn" ? "warning" : ev.severity ?? "info", value: ev.value, time: performance.now() / 1000, frame: framesRendered });
      hud.ticker(ev);
      const pos = ev.position ?? [sim.state.ball.x, 0.4, sim.state.ball.z];
      switch (ev.type) {
        case "shot": case "pass": case "tackle": case "goal": case "save": case "post": packFx(ev.type, pos as [number, number, number]); break;
        case "pen-goal": packFx("goal", pos as [number, number, number]); break;
        case "pen-save": packFx("save", pos as [number, number, number]); break;
        case "crossbar": packFx("post", pos as [number, number, number]); break;
        default: break;
      }
      switch (ev.type) {
        case "shot": juiceFire("shot", { position: pos }); break;
        case "pass": juiceFire("kick", { position: pos }); break;
        case "goal":
          juiceFire("goal", { position: pos }); juiceFire("net"); hud.banner("GOAL!", 2400, "goal");
          // FC47-H1 TV package: the goal lower third (scoring club, minute, score)
          if (ev.team !== undefined) hud.goalLowerThird(ev.team, sim.state);
          // FC-E2 authored goal feedback: confetti over the net that was scored, plus the net bulge, ring and scoreboard
          // flash driven from tickWorld
          goalSide = sim.state.ball.x >= 0 ? 1 : -1;
          // FC47-C1: replay the run-up and strike while the sim holds its 3 s goal phase
          if (!replayOff && sim.state.phase === "goal") {
            const plan = replayBuf.plan();
            if (plan) replay = { plan, elapsed: 0, side: goalSide, frame: replayBuf.sample(plan, 0) };
          }
          world.confetti?.setPosition(goalSide * (PITCH_HX - 2), 4.2, 0).setVisible(true);
          window.setTimeout(() => world.confetti?.setVisible(false), 2600);
          syncCrowd();
          break;
        case "pen-goal": juiceFire("goal", { position: pos }); juiceFire("net"); hud.banner("SCORES!", 1800, "goal"); break;
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
        case "kickoff": syncCrowd(); break;
        case "throwin": case "corner": case "goalkick": case "penalty": default: break;
      }
    }
  }

  function frame() {
    const f = (frame: { dt: number }) => {
      const dt = clamp(frame.dt || 1 / 60, 0.001, 0.1);
      framesRendered++;

      input.update(dt);
      const now = performance.now() / 1000;
      const frozen = hitStopUntil > now || qaFrozen;

      // all input through app.input (keys, gamepad, touch buttons); the touch stick adds an analog vector
      const stick = touchControls.stick();
      const axX = input.axis("moveX");
      const axZ = input.axis("moveZ");
      inputFrame.move = [
        Math.abs(stick[0]) > Math.abs(axX) ? stick[0] : axX,
        Math.abs(stick[1]) > Math.abs(axZ) ? stick[1] : axZ
      ];
      inputFrame.sprint = input.held("sprint");
      inputFrame.shootHeld = input.held("shoot");
      // edges latch until a sim step consumes them (a frame shorter than one step must not drop a tap)
      inputFrame.passShort ||= input.pressed("pass");
      inputFrame.passDriven ||= input.pressed("driven");
      inputFrame.shootReleased ||= input.released("shoot");
      inputFrame.skillStepover ||= input.pressed("skillA");
      inputFrame.skillChop ||= input.pressed("skillB");
      inputFrame.switchPlayer ||= input.pressed("switch");
      if (appReady && input.pressed("pause")) setPaused(!sim.state.paused);

      // FC-18: fixed 1/60 s sim steps from an accumulator (at most 6 per frame; a long stall drops the rest), so a
      // 24 m/s strike moves 0.4 m per step at any frame rate and every match replays from (seed, inputs)
      const events: SimEvent[] = [];
      if (appReady && !frozen) {
        stepAcc = Math.min(stepAcc + dt, SIM_DT * 6);
        while (stepAcc >= SIM_DT - 1e-9) {
          stepAcc -= SIM_DT;
          for (const ev of sim.step(SIM_DT, inputFrame)) events.push(ev);
          clearEdges();
        }
      }
      // FC47-C1 replay buffer (render side, read-only): record open play and the goal frame itself; a kickoff empties it
      {
        const st = sim.state;
        if (st.phase === "live" || st.phase === "restart" || events.some((e) => e.type === "goal")) replayBuf.record(st);
        else if (st.phase === "kickoff") replayBuf.clear();
      }
      consumeEvents(events);

      const s = sim.state;
      if (replay) {
        if (!frozen) replay.elapsed += dt;
        if (s.phase !== "goal" || replay.elapsed >= replay.plan.duration) replay = null;
        else replay.frame = replayBuf.sample(replay.plan, replay.elapsed);
      }
      // what the renderer shows: the replayed snapshot during a goal replay, the live sim otherwise
      const shownPlayers = (replay?.frame?.players ?? s.players) as PlayerState[];
      const shownBall = replay?.frame?.ball ?? s.ball;
      if (qaTargetFrac !== null && !qaFrozen) {
        const kicker = (s.players as PlayerState[]).find((p) => p.kickT > 0.02 && p.kickDur > 0.05);
        if (kicker && 1 - kicker.kickT / kicker.kickDur >= qaTargetFrac) { qaFrozen = true; qaTargetFrac = null; qaKickerId = kicker.id; }
      }
      const ctx = appReady ? modes.frame(dt, inputFrame) : {};

      // venue retint when it changes
      if (s.venue !== lastVenue) {
        lastVenue = s.venue;
        rebuildForVenue(s.venue);
        applyVenue(world, VENUES[s.venue]);
        refreshKits();
        if (appReady) { hud.banner(VENUES[s.venue].label, 2400); hud.ident(VENUES[s.venue].label, VENUE_LOOKS[s.venue].timeOfDay); }
      }

      /* ---- render athletes ---- */
      const t = now;
      const seen = new Set<string>();
      for (const p of shownPlayers) {
        const rig = rigs.get(p.id);
        if (!rig) continue;
        seen.add(p.id);
        poseAthlete(rig, p, t);
      }
      for (const [id, rig] of rigs) {
        if (!seen.has(id)) {
          // athlete not in this mode (touch lab solo) — hide
          for (const h of Object.values(rig)) (h as any)?.setVisible?.(false);
        } else {
          for (const h of Object.values(rig)) (h as any)?.setVisible?.(true);
          // team rings stay on for every athlete — poseAthlete scales/pulses them
        }
      }

      /* ---- ball: one admitted GLB at regulation size ---- */
      // evidence below reads the sim ball `b`; the node shows `vb` (the replayed ball during a goal replay)
      const b = s.ball, vb = shownBall;
      const by = Math.max(BALL_VIS_R, vb.y + (BALL_VIS_R - BALL_R));
      const rx = vb.rotX ?? 0;
      const ry = vb.rotY ?? 0;
      const rz = vb.rotZ ?? 0;
      // The ball GLB is fitted (origin = its lowest point, rotation pivots there): place the node so the CENTRE lands on (b.x, by, b.z).
      const cxr = Math.cos(rx), sxr = Math.sin(rx), cyr = Math.cos(ry), syr = Math.sin(ry), czr = Math.cos(rz), szr = Math.sin(rz);
      const ux = syr * sxr, uy = cxr, uz = cyr * sxr;
      world.ballMesh
        ?.setPosition(vb.x - (czr * ux - szr * uy) * BALL_VIS_R, by - (szr * ux + czr * uy) * BALL_VIS_R, vb.z - uz * BALL_VIS_R)
        .setRotation(rx, ry, rz).setScale([1, 1, 1]).setVisible(true);
      const shScale = clamp(1 - (by - BALL_VIS_R) * 0.12, 0.35, 1.08);
      world.ballShadow?.setPosition(vb.x, 0.015, vb.z).setScale([shScale, 1, shScale]).setVisible(true);

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
      if (appReady) {
        if (s.goalFlashT <= 0) goalSide = 0;
        tickWorld(world, t, {
          cheering: s.phase === "goal" || s.phase === "ended" && s.winner !== null,
          ripple: s.goalFlashT,
          goalSide,
          accent: VENUES[s.venue].accent,
          hoarding: VENUES[s.venue].hoarding
        });
        if (s.phase !== lastPhaseForCrowd) { lastPhaseForCrowd = s.phase; syncCrowd(); }
      }

      /* ---- camera ---- */
      updateCamera(dt);
      reelShown = scoreReel(s.score);


      /* ---- HUD ---- */
      const home = clubFor(modes.cfg?.homeClub ?? modes.studio.club);
      const away = clubFor(modes.cfg?.awayClub ?? "iron");
      hud.update(s, {
        home, away,
        tag: !appReady ? "Loading 3D Stadium & Athletes..." : (ctx.tag ?? modes.cfg?.circuitTag),
        labLabel: ctx.labLabel, labScore: ctx.labScore, labBest: ctx.labBest,
        charge: sim.chargeLevel > 0 ? sim.chargeLevel : null,
        kickoffPrompt: appReady && s.phase === "kickoff" && !autopilot && s.userTeam !== null && s.kickoffTeam === s.userTeam && !s.paused
      });
      hud.setPaused(s.paused);

      /* ---- evidence ---- */
      // FC-E1: the evidence object (athletes, event log, HUD and juice snapshots) is rebuilt at most every 200 ms, or
      // at once when the sim emitted events, instead of every frame
      if (events.length === 0 && now - lastEvidenceAt < 0.2) return;
      lastEvidenceAt = now;
      const athleteClips: Record<string, string> = {};
      for (const p of s.players as PlayerState[]) {
        athleteClips[p.id] = rigs.get(p.id)?.activeClip ?? "Idle_Loop";
      }
      // ball physics state machine, numeric for capture verification
      const hvLen = Math.hypot(b.vx, b.vz);
      const bpState: string =
        b.mode === "held" ? "held"
        : b.mode === "dead" ? "dead"
        : b.mode === "flight" ? "kicked"
        : b.mode === "loose" ? (hvLen > 0.13 ? "rolling" : "dead")
        : "attached"; // dribble / controlled — glued to the kicking-side foot
      const spinAxis: Vec3 | null = Math.hypot(b.vx, b.vz) > 0.15
        ? [b.vz / (hvLen || 1), 0, -b.vx / (hvLen || 1)]   // normalize(cross(up, velocity))
        : null;
      const kickAge = b.lastKickT >= 0 ? s.simT - b.lastKickT : -1;
      const ballPhysics = {
        state: bpState,
        position: [Math.round(b.x * 1000) / 1000, Math.round(b.y * 1000) / 1000, Math.round(b.z * 1000) / 1000] as Vec3,
        velocity: [Math.round(b.vx * 100) / 100, Math.round(b.vy * 100) / 100, Math.round(b.vz * 100) / 100] as Vec3,
        speed: Math.round(Math.hypot(b.vx, b.vy, b.vz) * 100) / 100,
        spinAxis,
        rolling: b.rolling,
        onGrass: b.y <= BALL_R + 1e-3,               // centre = grass + radius, never sunk
        radius: BALL_VIS_R,                            // fixed — never rescaled
        lastKick: kickAge >= 0 && kickAge < 60 ? {
          power: Math.round(b.lastKickPower * 100) / 100,
          kind: b.lastShot,
          footBallDistAtContact: Math.round(b.lastKickFootDist * 1000) / 1000,
          t: Math.round(kickAge * 100) / 100
        } : null
      };
      const evidence = {
        route: "showcase-aura-fc-3d",
        engine: "@aura3d/engine",
        ready: appReady,
        framesRendered,
        look: VENUE_LOOKS[sceneVenue].look,
        lookMode: fcLookMode(sceneVenue),
        vfxPackBursts: vfxFired,
        mode: modes.mode,
        phase: s.phase,
        half: s.half,
        clock: Math.round(s.clock * 10) / 10,
        venue: s.venue,
        score: [...s.score],
        ball: { position: [vb.x, by, vb.z], radius: BALL_VIS_R, rotX: rx, rotY: ry, rotZ: rz, mode: b.mode, lastShot: b.lastShot, freeT: Math.round(b.freeT * 100) / 100 },
        ballPhysics,
        possessionTeam: s.possessionTeam,
        possession: [Math.round(s.possession[0] * 10) / 10, Math.round(s.possession[1] * 10) / 10],
        controlledId: s.controlledId,
        userTeam: s.userTeam,
        autopilot,
        kicks: s.kicks,
        shotsOn: [...s.shotsOn],
        saves: [...s.saves],
        corners: [...s.corners],
        shootout: s.shootout ? { stage: s.shootout.stage, scores: [...s.shootout.scores], taken: [...s.shootout.taken], round: s.shootout.round } : null,
        winner: s.winner,
        cameraMode: cam.mode,
        inWorldScore: shownScore(reelShown),
        broadcast: { introPlayed, cuts: camCuts, replay: replay ? { from: replay.plan.from, to: replay.plan.to, duration: replay.plan.duration, elapsed: replay.elapsed } : null, replayBufferSpan: replayBuf.span() },
        camera: { position: [...cam.shownEye], target: [...cam.target], fov: cam.shownFov, authoredFov: cam.fov },
        goalpostsInView: {
          leftGoalWorld: [-PITCH_HX, 0, 0],
          rightGoalWorld: [PITCH_HX, 0, 0]
        },
        paused: s.paused,
        athleteCount: s.players.length,
        athleteClips,
        athletes: s.players.map((p) => {
          const kit = teamKitForId(p.id);
          return {
            id: p.id,
            team: p.team,
            role: p.role,
            kit: {
              team: p.team,
              role: p.isKeeper ? "gk" as const : "outfield" as const,
              body: kit.shirt,
              shorts: kit.shorts,
              socks: kit.socks
            },
            x: Math.round(p.x * 100) / 100,
            z: Math.round(p.z * 100) / 100,
            speed: Math.round(p.speed * 100) / 100,
            clip: athleteClips[p.id]
          };
        }),
        juice: (juice as any)?.snapshot?.() ?? null,
        accessibility: a11y ? { reducedMotion: a11y.reducedMotion, reducedFlash: a11y.reducedFlash, highContrast: a11y.highContrast } : null,
        touch: touchControls?.evidence?.() ?? null,
        audio: (audio as any)?.evidence ?? null,
        eventLog: eventLog.snapshot(),
        meshyAssets: [
          "fcMatchBallMeshy", "fcSoccerStrikerMeshy", "fcGoalkeeperMeshy", "fcSoccerGoalNetMeshy",
          "fcFloodlightPylonMeshy", "fcScoreboardGantryMeshy",
          "fcGlacierDomeMeshy", "fcHeroTrophyMeshy",
          "diamondDugout", "diamondStadium", "hoopsBallCart"
        ],
        modes: ["quick", "demo", "shootout", "touch", "circuit", "studio"],
        venues: VENUE_ORDER,
        clubs: ["aurora", "kings", "iron", "waves", "kites", "stars", "giants", "storm"],
        // FC-23: real HUD bindings, so capture tooling reads the score bug, clock, stamina and possession
        hud: (game as any).hud?.snapshot?.({
          bindings: HUD_BINDINGS,
          appState: {
            score: `${s.score[0]}-${s.score[1]}`,
            homeGoals: s.score[0],
            awayGoals: s.score[1],
            clock: Math.floor(s.clock),
            clockMax: s.half === 3 ? 45 : 90,
            half: s.half,
            stamina: (s.players.find((p) => p.id === s.controlledId)?.stamina ?? 0),
            possessionHome: (() => { const tot = s.possession[0] + s.possession[1]; return tot > 0 ? s.possession[0] / tot : 0.5; })(),
            shootout: s.shootout ? `${s.shootout.scores[0]}-${s.shootout.scores[1]}` : "",
            venue: s.venue,
            mode: modes.mode,
            phase: s.phase,
            paused: s.paused,
            unit: 1
          }
        }) ?? null,
        deterministic: { kickClips: "baked offline by tools/aura-fc/bake-kick.mjs; clip phase = swing progress from sim.ts", ballSim: "sim.ts, fixed 1/60 s steps", seed: `lcg:0x${sim.seed.toString(16)}` }
      };
      publishBeacon(evidence);
    };
    return f;
  }

  const frameFn = frame();
  app.onFrame((f) => frameFn(f));

  // GU47 E-I crop contract: named crops, projected through the shown camera whenever the capture reads them
  {
    const g = window as unknown as { __AURA_QA__?: Record<string, unknown> };
    g.__AURA_QA__ = {
      ...(g.__AURA_QA__ ?? {}),
      crops: () => {
        const s = sim.state;
        const me = (s.players as PlayerState[]).find((p) => p.id === s.controlledId) ?? null;
        const aspect = canvas && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 16 / 9;
        return fcQaCrops({ eye: cam.shownEye, target: cam.target, fovDeg: cam.shownFov, aspect }, me, [s.ball.x, s.ball.y, s.ball.z]);
      }
    };
  }
  installQaHooks("aura-fc-3d", {
    ready: () => appReady,
    app: () => app,
    state: () => ({
      phase: sim.state.phase,
      clock: sim.state.clock,
      score: [...sim.state.score],
      kicks: sim.state.kicks,
      frozen: qaFrozen,
      kickerId: qaKickerId,
      ball: { x: sim.state.ball.x, y: sim.state.ball.y, z: sim.state.ball.z, vx: sim.state.ball.vx, vy: sim.state.ball.vy, vz: sim.state.ball.vz, mode: sim.state.ball.mode, owner: sim.state.ball.ownerId },
      players: (sim.state.players as PlayerState[]).map((p) => {
        const rig = rigs.get(p.id);
        return { id: p.id, x: p.x, z: p.z, yaw: p.yaw, speed: p.speed, kickT: p.kickT, kickDur: p.kickDur, kickPower: p.kickPower, stunT: p.stunT, slideT: p.slideT, pend: (p as unknown as { pendKick: unknown }).pendKick !== null, clip: rig?.activeClip, phase: rig?.activePhase };
      })
    }),
    extras: {
      /** Freeze the sim when the next kick swing reaches `frac` (0..1) of its length; optionally frame the kicker. */
      freezeAtKick(frac: number, focus = true) { qaFrozen = false; qaTargetFrac = frac; qaKickerId = null; qaFocus = focus; },
      /** Let the sim run again and return the camera to the broadcast framing. */
      resume() { qaFrozen = false; qaTargetFrac = null; qaFocus = false; },
      /** Freeze the sim now and frame the fastest-moving athlete (a run-cycle filmstrip). */
      focusFastest() {
        const fastest = (sim.state.players as PlayerState[]).reduce((a, b) => (b.speed > a.speed ? b : a));
        qaKickerId = fastest.id; qaFocus = true; qaTargetFrac = null; qaFrozen = true;
      },
      /** Advance the (frozen) sim `n` fixed steps; the next rendered frame shows the result. */
      step(n: number) { for (let i = 0; i < n; i++) consumeEvents(sim.step(1 / 60, inputFrame)); },
      /** Freeze or release the sim without touching the camera (stepping with step() still works while frozen). */
      freeze(on: boolean) { qaFrozen = on; if (!on) { qaTargetFrac = null; qaFocus = false; } },
      /** Fire one juice event (fx, shake, punch) at a world position, as the sim would. */
      fireJuice(ev: string, at?: Vec3) { juiceFire(ev, { position: at ?? [sim.state.ball.x, 0.4, sim.state.ball.z] }); },
      /** Advance the whole app (effects, camera layers) `steps` fixed steps of `dt` seconds; samples particles and trauma per step. */
      advance(steps: number, dt = 1 / 30) {
        const out: Array<{ live: number; trauma: number }> = [];
        for (let i = 0; i < steps; i++) {
          (app as any).step(dt);
          out.push({ live: (app as any).effects?.liveCount ?? 0, trauma: +(((app as any).camera?.shake?.energy?.() ?? 0)).toFixed(4) });
        }
        return out;
      },
    }
  });

  /* -------------------------- toolbar -------------------------- */

  function bindToolbar(): void {
    const playBtn = document.getElementById("fc-btn-play");
    const labBtn = document.getElementById("fc-btn-lab");
    const menuBtn = document.getElementById("fc-btn-menu");
    const demoBtn = document.getElementById("fc-btn-demo");
    const venueBtns = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-fc-venue]"));

    playBtn?.addEventListener("click", () => {
      autopilot = false;
      sim.setAutopilot(false);
      demoBtn?.classList.remove("active");
      playBtn?.classList.add("active");
      modes.startQuick();
    });
    labBtn?.addEventListener("click", () => {
      autopilot = false;
      sim.setAutopilot(false);
      modes.startShootoutLab();
    });
    menuBtn?.addEventListener("click", () => modes.enterMenu());
    demoBtn?.addEventListener("click", () => {
      autopilot = true;
      sim.setAutopilot(true);
      demoBtn.classList.add("active");
      playBtn?.classList.remove("active");
      modes.startDemo();
    });
    for (const btn of venueBtns) {
      btn.addEventListener("click", () => {
        const v = btn.dataset.fcVenue as keyof typeof VENUES;
        modes.venue = v;
        for (const b of venueBtns) b.classList.toggle("active", b === btn);
        sim.state.venue = v;
        hud.banner(VENUES[v].label, 1800);
      });
    }
    // phone venue picker (FC-E3) drives the same buttons
    const venueSelect = document.getElementById("fc-venue-select") as HTMLSelectElement | null;
    venueSelect?.addEventListener("change", () => venueBtns.find((b) => b.dataset.fcVenue === venueSelect.value)?.click());
    for (const btn of venueBtns) btn.addEventListener("click", () => { if (venueSelect) venueSelect.value = btn.dataset.fcVenue ?? "munich"; });
    const req = params.get("venue") ?? modes.venue;
    if (req && (VENUES as Record<string, unknown>)[req]) {
      venueBtns.find((b) => b.dataset.fcVenue === req)?.click();
    }
  }

  bindToolbar();

  /* -------------------------- boot mode -------------------------- */

  hud.setVisible(true);

  if (autopilot) {
    modes.startDemo();
  } else if (params.get("mode") === "menu") {
    modes.enterMenu();
  } else if (params.get("mode") === "shootout") {
    modes.startShootoutLab();
  } else if (params.get("mode") === "touch") {
    modes.startTouchLab();
  } else {
    modes.startQuick();
  }
  hud.banner("Loading 3D Stadium & Athletes...", 60000);

  Promise.resolve((app as any).ready?.())
    .catch((err) => console.warn("[fc3d] app.ready warning", err))
    .finally(() => {
      appReady = true;
      document.body.dataset.aura3dReady = "true";
      // QA settle flag for the screens spec (readyGlobals): on software WebGL2 the turf texture lands 25-60 s after
      // ready, and the card frame taken 10 s after ready showed the untextured mint tint. Set once 40 s and 30 frames
      // have passed since ready; gameplay never reads it.
      {
        const readyAt = performance.now(), readyFrame = framesRendered;
        const settle = window.setInterval(() => {
          if (performance.now() - readyAt >= 40_000 && framesRendered - readyFrame >= 30) {
            (window as unknown as Record<string, unknown>).__AURA_FC_SETTLED__ = true;
            window.clearInterval(settle);
          }
        }, 1000);
      }
      if (canvas) canvas.dataset.ready = "true";
      const home = clubFor(modes.cfg?.homeClub ?? modes.studio.club);
      const away = clubFor(modes.cfg?.awayClub ?? "iron");
      hud.banner(`${home.name} vs ${away.name}`, 2400, "gold");
    });
}

boot();
