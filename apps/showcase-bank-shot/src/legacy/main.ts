/**
 * Bank Shot - route mount (PRD BS-09/10/11/12).
 *
 * One Aura3D app per route. The physics table lives in table.ts, the pure 8-ball
 * state machine in rules.ts, rack/clock/combo math in racks.ts, and the cue
 * controller in cue.ts; this file owns the scene graph, per-frame visual sync
 * from body poses, the aim/strike glue, HUD, audio cue mapping, and the evidence
 * global. DOM is UI only: every gameplay truth is rendered by the Aura3D scene.
 *
 * Authored elements labeled as such: cue-ball spin is a bounded velocity nudge
 * (no angular simulation), pocket capture is a radius rule around pocket mouths.
 */
import {
  camera,
  effects,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode,
  type AuraDiagnostics
} from "@aura3d/engine";
import {
  createFxParticlePass,
  createGame,
  createJuice,
  createOverlayDriver,
  createRumbleDriver,
  createTweenEngine,
  mountHud,
  mountTouchControls,
  type HudDocument
} from "@aura3d/game";
import { bankShotScenarios } from "../scenarios";
import { bindBankShotDrive } from "../scenario-drive";
import { bindBankShotEvidence } from "../evidence";
import { assets } from "../../../../src/aura-assets";
import { CueController, AIM_STEP, SPIN_STEP } from "../gameplay/cue";
import { RulesEngine, type ShotRecord, type ShotOutcome } from "../gameplay/rules";
import { rackConfigFor, RACK_COUNT } from "../gameplay/racks";
import { createTableSimulation, CUE_SPOT, BALL_RADIUS, PLAY_HALF_X, PLAY_HALF_Z, POCKET_CENTERS, rackSpotFor } from "../gameplay/table";
import { ballEulerFromBody } from "../gameplay/ball-visuals";
import { createBankShotSound } from "../sound";
>>>>>>> /tmp/mig-base/apps/showcase-bank-shot/src/main.ts
import { createPoolHallSetDressing } from "./environment";
import "./styles.css";

type BankShotWindow = Window & {
  __BANK_SHOT_EVIDENCE__?: unknown;
  __AURA3D_SHOWCASE_BANK_SHOT__?: unknown;
  __AURA3D_COMPOSITION_PROBE__?: unknown;
  __BS_SHOT__?: () => string;
  __BS_PUMP__?: (frames: number) => number;
};
const bankWindow = window as BankShotWindow;
const portraitComposition = window.innerWidth <= 700 || window.innerHeight > window.innerWidth * 1.25;
document.body.dataset.capture = "default";

const APP_ID = "showcase-bank-shot";
// Keep the Rapier bodies at regulation radius while giving the typed ball
// meshes enough pixel coverage to read as glossy, numbered subjects in the
// close review frame. This is presentation scale only; all contact and pocket
// math still uses `BALL_RADIUS` from table.ts. The authored GLB sphere has a
// 0.5-unit radius, so the render radius/lift below keeps the larger lacquered
// shell sitting on (rather than intersecting) the physical felt plane.
const BALL_VISUAL_SCALE = BALL_RADIUS * 2.9;
const BALL_VISUAL_RADIUS = BALL_VISUAL_SCALE / 2;
const BALL_VISUAL_LIFT = Math.max(0, BALL_VISUAL_RADIUS - BALL_RADIUS + 0.001);
const BALL_SURFACE_Y = BALL_RADIUS + BALL_VISUAL_LIFT;
const ROUTE_SYSTEMS = {
  physics: "public Rapier fixed-step spheres, cushions, pocket sensors, and settled-state lock",
  rules: "route-local deterministic open/combo/eight-ball rack and three-rack session state",
  aiming: "bounded public sphere cast for first contact plus authored single-cushion preview",
  presentation: "typed table/cue/ball family synchronized to live physics with renderer-owned aim geometry",
  audio: "typed synthesized cues triggered from contact, pocket, foul, rack, and session outcomes"
} as const;

// ---------------------------------------------------------------- HUD markup --




// ---------------------------------------------------------------- audio ------
const audio = createBankShotSound();
let ambientStarted = false;
window.addEventListener("pointerdown", () => {
  void audio.unlock().then(() => {
    if (!ambientStarted) {
      ambientStarted = true;
      void audio.cue("ambient-hall").catch(() => undefined);
    }
  }).catch(() => undefined);
}, { passive: true });
window.addEventListener("keydown", () => {
  void audio.unlock().then(() => {
    if (!ambientStarted) {
      ambientStarted = true;
      void audio.cue("ambient-hall").catch(() => undefined);
    }
  }).catch(() => undefined);
}, { passive: true });

// ---------------------------------------------------------------- state ------
const sim = createTableSimulation();
const rules = new RulesEngine(1);
const cueController = new CueController();
/** True while a struck shot is in flight (facts come from sim.shotFacts()). */
let shotInFlight = false;
let frameCount = 0;
let sensorEventCount = 0;
const audioCueLog: string[] = [];
const lastCueFrame = new Map<string, number>();
let shotHashValue = "";
const initialPoseHash = sim.poseHash();
let resetHashMatchValue: boolean | null = true;
let lastShotSummary = "none";
let lastShotObject: Record<string, unknown> | null = null;
let stalledFrames = 0;
let shootingFrames = 0;
let pottedThisShot: number[] = [];
let ghost = { x: CUE_SPOT[0], z: CUE_SPOT[1] };
let sessionScoreAtRackStart = 0;
let evidenceScenarioActive = false;

function pushCue(cue: Parameters<typeof audio.cue>[0]): void {
  void audio.cue(cue).catch(() => undefined);
  audioCueLog.push(cue);
  if (audioCueLog.length > 48) audioCueLog.shift();
}
function cueReady(name: string, gapFrames: number): boolean {
  const last = lastCueFrame.get(name) ?? -999;
  if (frameCount - last < gapFrames) return false;
  lastCueFrame.set(name, frameCount);
  return true;
}

// ---------------------------------------------------------------- scene ------
const AIM_LINE_MATERIAL = material.emissive({ name: "aim line", color: "#38bdf8", emissive: "#0ea5e9", opacity: 0.9 });
const AIM_BANK_MATERIAL = material.emissive({ name: "aim bank", color: "#f59e0b", emissive: "#d97706", opacity: 0.85 });
const AIM_MARKER_MATERIAL = material.emissive({ name: "aim marker", color: "#38bdf8", emissive: "#7dd3fc" });
const GHOST_MATERIAL = material.emissive({ name: "cue ghost", color: "#38bdf8", emissive: "#0284c7", opacity: 0.55 });
const FELT_GUIDE_MATERIAL = material.emissive({
  name: "felt guide stitching",
  color: "#477f91",
  emissive: "#102d39",
  emissiveIntensity: 0.02,
  opacity: 0.1
});
const BALL_CONTACT_SHADOW_MATERIAL = material.pbr({
  name: "ball contact occlusion",
  color: "#01030a",
  roughness: 1,
  metallic: 0,
  // A real contact cue should survive the blue-felt key without becoming a
  // second silhouette.  The shadow is renderer-owned and follows the live
  // Rapier pose below; it is not a CSS/canvas overlay.
  opacity: 0.72
});
function ballModelNode(name: string, typedAsset: string): AuraSceneNode {
  return model(assets[typedAsset as keyof typeof assets] as typeof assets.bankShotBall00, {
    name,
    role: "primaryCharacter",
    scaleMode: "world"
  })
    .position(0, -5, 0)
    .scale([BALL_VISUAL_SCALE, BALL_VISUAL_SCALE, BALL_VISUAL_SCALE])
    .runtime(game.runtimeNode(name, { tags: ["typed-asset", "physics-synced"] }))
    .toJSON();
}

function visualNodes(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  // Typed primary subjects: the table, all 16 balls, the cue stick.
  nodes.push(
    model(assets.bankShotTable, {
      name: "table",
      role: "primaryWorld",
      scaleMode: "world",
      // Pocket mouths are zero-thickness geometry inside the typed table asset;
      // the table receives ball/cue shadows but does not project a second set of
      // detached mouth silhouettes onto its own felt.
      castShadow: false,
      receiveShadow: true
    })
      .position(0, 0, 0)
      .runtime(game.runtimeNode("table", { tags: ["typed-asset"] }))
      .toJSON()
  );
  for (let number = 0; number <= 15; number += 1) {
    const id = `bankShotBall${String(number).padStart(2, "0")}`;
    nodes.push(ballModelNode(`ball-${String(number).padStart(2, "0")}`, id));
    nodes.push(
      primitives.cylinder({
        name: `ball-shadow-${String(number).padStart(2, "0")}`,
        material: BALL_CONTACT_SHADOW_MATERIAL,
        castShadow: false,
        receiveShadow: false
      })
        .position(0, -5, 0)
        .scale([0.068, 0.002, 0.052])
        .runtime(game.runtimeNode(`ball-shadow-${String(number).padStart(2, "0")}`, {
          tags: ["set-dressing", "contact-shadow", "physics-synced"]
        }))
        .toJSON()
    );
  }
  nodes.push(
    model(assets.bankShotCue, {
      name: "cue-stick",
      role: "setDressing",
      scaleMode: "world"
    })
      .position(0, -5, 0)
      .scale([BALL_VISUAL_SCALE, BALL_VISUAL_SCALE, BALL_VISUAL_SCALE])
      .runtime(game.runtimeNode("cue-stick", { tags: ["typed-asset", "cue"] }))
      .toJSON()
  );
  nodes.push(
    model(assets.bankShotBall00, {
      name: "cue-ghost",
      role: "setDressing",
      scaleMode: "world"
    })
      .position(0, -5, 0)
      .runtime(game.runtimeNode("cue-ghost", { tags: ["cue-ghost"] }))
      .toJSON()
  );
  // Fine renderer-owned felt guides remain available in the playable route,
  // but the review capture relies on the typed table's integrated cloth marks
  // so no oversized route-side ring competes with the live break.
  for (const z of [-0.52, -0.26, 0.26, 0.52]) {
    nodes.push(
      primitives.box({ name: `felt-guide-${z}`, material: FELT_GUIDE_MATERIAL })
        .position(0, 0.022, z)
        .scale([1.08, 0.003, 0.006])
        .toJSON()
    );
  }
  // In-scene aim geometry (PRD 6): line, first-contact marker, object direction,
  // and the bank preview line. Set dressing around the typed subjects.
  nodes.push(
    primitives.box({ name: "aim-line", material: AIM_LINE_MATERIAL })
      .position(0, -5, 0)
      .scale([1, 0.006, 0.006])
      .runtime(game.runtimeNode("aim-line", { tags: ["aim-preview"] }))
      .toJSON()
  );
  nodes.push(
    primitives.box({ name: "aim-bank", material: AIM_BANK_MATERIAL })
      .position(0, -5, 0)
      .scale([1, 0.005, 0.005])
      .runtime(game.runtimeNode("aim-bank", { tags: ["aim-preview"] }))
      .toJSON()
  );
  // Add complete 3D Billiards Lounge environment
  nodes.push(...createPoolHallSetDressing({ portrait: portraitComposition }));

  return nodes;
}

function buildScene(): ReturnType<typeof scene> {
  const reducedMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sceneCamera = portraitComposition
    // Put the table's long axis up the portrait viewport so all six pockets,
    // every ball, the cue, and the first line of action remain visible.
    ? camera.perspective({ position: [-3.8, 7.2, 0], target: [-0.38, -0.05, 0], fov: 62 })
    // The table is the product of this route. Keep the review camera close
    // enough that the six pockets and live balls read immediately instead of
    // spending the lower half of the frame on an empty lounge floor.
    : camera.perspective({
      // Keep the full typed table inside the review viewport, including the
      // near rail and the panel-side pocket.  The previous close crop clipped
      // the primary surface and let the HUD panel cover its right edge in the
      // route-primary evidence frame.
      // A lower, tighter spectator angle gives the table and rack the same
      // visual priority as a real pool-room capture.  The full rail footprint
      // remains inside the canvas while the empty ceiling/floor fall away.
      // A close three-quarter spectator angle gives the rack and cue ball the
      // visual weight of a real pool-room capture. The review lens is raised
      // just enough to show the full cloth plane and its pocket/rail falloff,
      // then tightened around the break zone so balls are not thumbnail-sized.
      // The camera remains table-centric; the panel-free review frame has no
      // need to reserve pixels for the DOM controls.
      position: [-0.067, 2.514, 2.641],
      // The default route keeps the opaque HUD panel clear of the table's
      // right rail.  Shifting the camera target a fraction toward the foot
      // keeps every pocket in the canvas while the controls stay readable.
      target: [0.32, -0.02, 0.0],
      fov: 48
    });
  return scene()
    .background("#10182a")
    .addMany(visualNodes())
    .addMany([
      // Midnight Slate / Aurora Noir billiards-hall mood:
      effects.neonBloom({ intensity: reducedMotion ? 0.07 : 0.2, quality: "balanced", softKnee: 0.5, shoulder: 0.6 }),
      effects.colorGrade({ exposure: 1.05, contrast: 1.07, saturation: 1.1 }),
      effects.antiAlias({ mode: "fxaa" }),
      effects.ambientOcclusion({ intensity: 0.26 }),
      effects.contactOcclusion({ name: "ball-to-felt contact", intensity: 0.36, radius: 0.52 }),
      effects.fog({
        name: "hall haze",
        density: 0.011,
        color: "#10182a",
        intensity: 0.16
      }),
      // A restrained ambient floor preserves the lacquer highlights and the
      // ball-to-felt contact gradient.  The previous broad blue fill flattened
      // every PBR response into the same midtone.
      lights.ambient({ name: "slate ambient", color: "#35435a", intensity: 0.24 }),
      // An asymmetric three-lamp pool-room key. The offset sources create a
      // visible luminance falloff across felt, walnut bevels, and ball lacquer
      // instead of washing every surface with the same frontal value.
      lights.point({ name: "pendant-light-mid", color: "#fff5d8", intensity: 4.85 }).position(-1.2, 1.55, 0.92),
      lights.point({ name: "pendant-light-head", color: "#ffe9bd", intensity: 3.6 }).position(0.2, 1.8, -0.7),
      lights.point({ name: "pendant-light-foot", color: "#ffd99c", intensity: 3.6 }).position(1.25, 1.35, 0.35),
      lights.rect({ name: "table overhead softbox", color: "#fff4dc", intensity: 1.8, width: 2.8, height: 1.25 })
        .position(0, 2.25, 0.15),
      // Cool fill & rim lights
      lights.directional({ name: "cool rim key", color: "#83bdff", intensity: 1.35 }).position(3.2, 4.5, 2.2),
      lights.directional({ name: "warm room fill", color: "#f2a65e", intensity: 0.32 }).position(-3.0, 3.5, -2.0),
      lights.point({ name: "felt cyan bounce", color: "#55baff", intensity: 0.7 }).position(0, 0.75, 2.0),
      lights.point({ name: "rack magenta rim", color: "#ff78ad", intensity: 0.72 }).position(1.65, 0.72, -0.58),
      lights.point({ name: "cue teal rim", color: "#55e2d2", intensity: 0.62 }).position(-1.45, 0.62, 0.62)
    ])
    .camera(sceneCamera);
}

// ---------------------------------------------------------------- mount ------
const bankGame = createGame({
  id: "showcase-bank-shot",
  target: "#app",
  scene: buildScene,
  diagnostics: { overlay: false, performancePanel: false },
  physics: {
    seed: 20260905,
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 4 }
  },
  input: {
    actions: {
      aimLeft: ["KeyA", "ArrowLeft"],
      aimRight: ["KeyD", "ArrowRight"],
      spinTop: ["KeyW", "ArrowUp"],
      spinDraw: ["KeyS", "ArrowDown"],
      charge: ["Space"],
      reset: ["KeyR"]
    },
    bufferMs: 80,
    gamepad: true,
    touch: true
  },
  loop: { fixedDt: 1 / 60, maxSubSteps: 2 },
  scenarios: bankShotScenarios,
  evidence: {
    schema: 1,
    sections: async () => (await import("./evidence")).sections,
    legacyGlobals: ["__BANK_SHOT_EVIDENCE__", "__AURA3D_SHOWCASE_BANK_SHOT__"]
  },
  qualityRebuild: { flags: ["game"] }
});
const app = bankGame.app;
const input = bankGame.input!;
if (!input) throw new Error("Bank Shot failed to create Aura3D input.");
bankGame.start();

// ---- juice (PRD-09 §7.6) ----------------------------------------------------
// pot/foul/cushion/combo composed through the shared facade: fx -> C-20 bursts,
// flash/vignette -> C-05, hitStop -> the real GameSession time controller.
const bankTween = createTweenEngine();
const bankFx = createFxParticlePass(app.effects);
const bankJuice = createJuice<"pot" | "foul" | "cushion" | "combo">({
  events: {
    pot: { fx: { kind: "ring", count: 16, color: "#ffd166" }, hitStop: 0.045 },
    foul: { flash: { color: "#ff4d4d", peak: 0.22, ms: 200 }, shake: 0.2 },
    cushion: { fx: { kind: "dust", count: 5, color: "#9fb4c8" } },
    combo: { fx: { kind: "ring", count: 14, color: "#7ce8ff" }, punch: { fovDeg: 3, ms: 140 } }
  },
  camera: app.camera,
  session: bankGame.session,
  fx: bankFx,
  overlay: createOverlayDriver({ app }),
  tweens: bankTween,
  rumble: createRumbleDriver()
});

const ballHandles = new Map<string, AuraRuntimeNodeHandle>();
const ballShadowHandles = new Map<string, AuraRuntimeNodeHandle>();
const previousBallPositions = new Map<string, readonly [number, number]>();
let tableHandle: AuraRuntimeNodeHandle | undefined;
let cueStickHandle: AuraRuntimeNodeHandle | undefined;
let cueGhostHandle: AuraRuntimeNodeHandle | undefined;
let aimLineHandle: AuraRuntimeNodeHandle | undefined;
let aimBankHandle: AuraRuntimeNodeHandle | undefined;
let aimMarkerHandle: AuraRuntimeNodeHandle | undefined;
const pocketAccentHandles: AuraRuntimeNodeHandle[] = [];

function resolveHandles(): void {
  tableHandle = app.nodes.get("table") as AuraRuntimeNodeHandle | undefined;
  ballHandles.clear();
  ballShadowHandles.clear();
  for (let number = 0; number <= 15; number += 1) {
    const name = `ball-${String(number).padStart(2, "0")}`;
    const handle = app.nodes.get(name);
    if (handle) ballHandles.set(name, handle as AuraRuntimeNodeHandle);
    const shadowName = `ball-shadow-${String(number).padStart(2, "0")}`;
    const shadowHandle = app.nodes.get(shadowName);
    if (shadowHandle) ballShadowHandles.set(name, shadowHandle as AuraRuntimeNodeHandle);
  }
  cueStickHandle = app.nodes.get("cue-stick") as AuraRuntimeNodeHandle | undefined;
  cueGhostHandle = app.nodes.get("cue-ghost") as AuraRuntimeNodeHandle | undefined;
  aimLineHandle = app.nodes.get("aim-line") as AuraRuntimeNodeHandle | undefined;
  aimBankHandle = app.nodes.get("aim-bank") as AuraRuntimeNodeHandle | undefined;
  aimMarkerHandle = app.nodes.get("aim-marker") as AuraRuntimeNodeHandle | undefined;
  pocketAccentHandles.length = 0;
  for (const pocket of POCKET_CENTERS) {
    const handle = app.nodes.get(`pocket catch-light ${pocket.id}`);
    if (handle) pocketAccentHandles.push(handle as AuraRuntimeNodeHandle);
  }
}
resolveHandles();
cueGhostHandle?.setMaterial(GHOST_MATERIAL);

/*
 * The shared route-primary checker must distinguish the typed billiards table
 * from the full-bleed lounge surrounding it. Suppressing only the table gives
 * the checker a direct visible/hidden pixel diff for the primary world asset;
 * Rapier bodies, rules state, balls, cue, camera, and the retained gameplay
 * screenshots are unchanged.
 */
Object.defineProperty(bankWindow, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "application",
    subject: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      targetSize: 3.26
    },
    settleSubjectPose: async () => {
      app.pause();
      await app.ready();
      resolveHandles();
      tableHandle?.setVisible(true);
      tableHandle?.setScale(1);
      pocketAccentHandles.forEach((handle) => handle.setVisible(true));
      // Resolve only after the mutated subject has been submitted for capture.
      await app.stepAsync(0);
    },
    setSubjectSuppressed: async (suppressed: boolean) => {
      app.pause();
      await app.ready();
      tableHandle?.setVisible(true);
      tableHandle?.setScale(suppressed ? 0.0001 : 1);
      // Pocket catch-lights are attached presentation detail for the typed
      // table. Hide them with the table during the checker’s suppressed pass;
      // otherwise six orphan rings would remain suspended over the floor.
      pocketAccentHandles.forEach((handle) => handle.setVisible(!suppressed));
      await app.stepAsync(0);
    }
  },
  configurable: true
});

// ---------------------------------------------------------------- HUD --------
// Shared HUD kit (PRD-09 Phase 4): tabletop theme. The #hud/#panel markup -
// stat grid, power meter, controls list, evidence strip, action buttons and
// the brand blurb - is deleted; brand/prose moves to the shell `about` menu
// when the route adopts it.
const hudHost = document.createElement("div");
hudHost.className = "a3g-game-hud";
document.getElementById("app")!.appendChild(hudHost);
const hud = mountHud(
  { root: hudHost, doc: document as unknown as HudDocument },
  {
    theme: "tabletop",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "clock", kind: "timer", mode: "countdown", warnAt: 45, anchor: "top", label: "Rack" },
      { id: "score", kind: "score", anchor: "top-right", label: "Score", rollMs: 200 },
      { id: "combo", kind: "combo", anchor: "top-right" },
      { id: "objective", kind: "objective", anchor: "bottom-left" },
      { id: "prompt", kind: "prompt", anchor: "bottom" },
      { id: "strike", kind: "meter", max: 1, anchor: "bottom-right", label: "Strike", color: "#d4a94f" }
    ]
  }
);

function showToast(text: string): void {
  hud.toast(text, { ms: 2600 });
}

function hideResultCard(): void {
  // hud.banner expires on its own; nothing to clear eagerly.
}

function syncHud(): void {
  const snap = rules.snapshot();
  const cueState = cueController.state();
  hud.set("clock", snap.clockMs / 1000);
  hud.set("score", snap.score);
  hud.set("combo", snap.combo);
  hud.set(
    "objective",
    `${snap.suit === null ? "OPEN TABLE" : snap.suit.toUpperCase()} - ${snap.ballsRemaining} balls - fouls ${snap.fouls}/3`
  );
  hud.set("strike", cueState.charge);
  hud.set(
    "prompt",
    bankGame.session.paused
      ? "PAUSED - P TO RESUME"
      : snap.phase === "rack-won" && snap.sessionComplete
        ? "SESSION CLEAR - R TO RE-RACK"
        : snap.phase === "ball-in-hand"
          ? "BALL IN HAND - A/D/W/S to place, Space to set"
          : cueState.charging
            ? `Strike ${Math.round(cueState.charge * 100)}%${cueState.inSweetZone ? " - SWEET" : ""}`
            : snap.banner
  );
}

// ------------------------------------------------------------- shot glue -----
function doStrike(): void {
  const command = cueController.strike();
  if (!command) return;
  if (rules.phase !== "aiming") return;
  shotHashValue = sim.poseHash();
  if (!rules.beginShot()) return;
  if (!sim.strike(command.power, command.angle, command.spin)) {
    rules.finishResolution();
    return;
  }
  shotInFlight = true;
  pottedThisShot = [];
  stalledFrames = 0;
  shootingFrames = 0;
  lastShotSummary = "strike";
  lastShotObject = { angle: command.angle, power: command.power, spin: command.spin, sweetZone: command.sweetZone };
  pushCue("cue-strike");
  syncHud();
}

function consumeShotEvents(): void {
  for (const sensor of sim.consumeSensorEvents()) {
    sensorEventCount += 1;
  }
  for (const fact of sim.consumeShotFactEvents()) {
    if (fact.type === "cue-first-contact") {
      if (cueReady("ball-hit", 5)) pushCue("ball-hit");
    } else if (fact.type === "cushion-touch") {
      if (cueReady("cushion-hit", 6)) pushCue("cushion-hit");
      const body = sim.debugBallBody(fact.ball);
      if (body && !bankGame.session.reducedMotion) {
        bankJuice.fire("cushion", { position: body.position });
      }
    }
  }
  // Cluster clacks from the polled contact events (slower, persistent pairs).
  for (const impact of sim.consumeImpacts()) {
    if (impact.kind === "ball-ball" && impact.speed > 0.6 && cueReady("ball-hit", 12)) pushCue("ball-hit");
  }
  for (const pot of sim.consumePotEvents()) {
    pottedThisShot.push(pot.ball);
    pushCue("pocket-drop");
    const center = POCKET_CENTERS.find((p) => p.id === pot.pocket);
    bankJuice.fire("pot", { position: center ? [center.x, 0.06, center.z] : undefined });
    showToast(pot.ball === 0 ? "SCRATCH" : `BALL ${pot.ball} DOWN`);
  }
}

function applyOutcome(outcome: ShotOutcome): void {
  if (outcome.rackWon) {
    pushCue("eight-win");
    void hud.banner(rules.sessionComplete ? "SESSION CLEAR" : "RACK CLEAR", { holdMs: 3600, style: "clear" });
    hud.toast(
      rules.sessionComplete
        ? `All ${RACK_COUNT} racks cleared with ${rules.score} points.`
        : `Rack ${rules.rack} cleared: ${outcome.winReason}. Score ${rules.score}.`,
      { ms: 5200 }
    );
  } else if (outcome.rackLost) {
    pushCue("rack-fail");
    void hud.banner("RACK LOST", { holdMs: 3200, style: "fail" });
    hud.toast(`Rack ${rules.rack} lost: ${outcome.lossReason}. Score ${rules.score}.`, { ms: 5200 });
  } else if (outcome.foul) {
    pushCue("foul-whistle");
    bankJuice.fire("foul");
    let freeX = CUE_SPOT[0];
    let freeZ = CUE_SPOT[1];
    if (!sim.canPlaceCue(freeX, freeZ)) {
      for (let r = 0.05; r <= 0.8; r += 0.05) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          const tx = CUE_SPOT[0] + Math.cos(a) * r;
          const tz = CUE_SPOT[1] + Math.sin(a) * r;
          if (sim.canPlaceCue(tx, tz)) {
            freeX = tx;
            freeZ = tz;
            break;
          }
        }
      }
    }
    ghost = { x: freeX, z: freeZ };
  } else if (outcome.pottedLegal.length > 0) {
    pushCue("combo-chime");
    const cueBody = sim.debugBallBody(0);
    bankJuice.fire("combo", { position: cueBody?.position });
  }
}

function resolveShotNow(): void {
  if (!shotInFlight) return;
  const facts = sim.shotFacts();
  const outcome = rules.resolveShot({
    firstContact: facts.firstContact,
    cushionAfterContact: facts.cushionAfterContact,
    potted: pottedThisShot
  });
  rules.finishResolution();
  lastShotSummary = outcome.rackWon
    ? "rack-won"
    : outcome.rackLost
      ? `rack-lost:${outcome.lossReason}`
      : outcome.foul
        ? `foul:${outcome.foulReasons.join("+")}`
        : outcome.pottedLegal.length > 0
          ? `potted:${outcome.pottedLegal.join(",")}`
          : "miss";
  lastShotObject = {
    ...lastShotObject,
    firstContact: facts.firstContact,
    cushionAfterContact: facts.cushionAfterContact,
    potted: [...pottedThisShot],
    foul: outcome.foul,
    foulReasons: [...outcome.foulReasons],
    scored: outcome.scored,
    combo: outcome.combo
  };
  shotInFlight = false;
  pottedThisShot = [];
  stalledFrames = 0;
  applyOutcome(outcome);
  syncHud();
}

function advanceRack(): void {
  if (rules.phase !== "rack-won") return;
  const next = rules.advanceRack();
  if (next === null) {
    syncHud();
    return;
  }
  sessionScoreAtRackStart = rules.score;
  sim.resetRack();
  shotHashValue = "";
  shotInFlight = false;
  pottedThisShot = [];
  hideResultCard();
  pushCue("rack-clear");
  syncHud();
}

function resetSession(): void {
  evidenceScenarioActive = false;
  rules.rerack();
  sim.resetRack();
  cueController.cancelCharge();
  shotInFlight = false;
  pottedThisShot = [];
  shotHashValue = "";
  ghost = { x: CUE_SPOT[0], z: CUE_SPOT[1] };
  previousBallPositions.clear();
  sessionScoreAtRackStart = 0;
  resetHashMatchValue = sim.poseHash() === initialPoseHash;
  hideResultCard();
  pushCue("rack-clear");
  syncHud();
}

function togglePause(): void {
  // Session owns pause state (user + visibility + menu stack).
  if (bankGame.session.paused) {
    bankGame.session.resume();
    app.resume();
  } else {
    bankGame.session.pause("user");
    app.pause();
  }
  syncHud();
}

// --------------------------------------------------------- per-frame sync ----
function parkNode(handle: AuraRuntimeNodeHandle | undefined): void {
  handle?.setPosition(0, -30, 0);
  handle?.setScale([0.0001, 0.0001, 0.0001]);
}

function poseLine(
  handle: AuraRuntimeNodeHandle | undefined,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  y: number,
  thickness = 0.006
): void {
  if (!handle) return;
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const length = Math.hypot(dx, dz);
  if (length < 0.01) {
    parkNode(handle);
    return;
  }
  handle.setPosition((fromX + toX) / 2, y, (fromZ + toZ) / 2);
  handle.setRotation(0, Math.atan2(-dz, dx), 0);
  handle.setScale([length, thickness, thickness]);
}

function syncVisuals(): void {
  if (ballHandles.size < 16 || !cueStickHandle || !aimLineHandle || !aimBankHandle || !aimMarkerHandle || !cueGhostHandle) {
    resolveHandles();
  }

  const ballInfoByNumber = new Map(sim.ballInfos().map((info) => [info.number, info]));
  for (const pose of sim.poses()) {
    const handle = ballHandles.get(pose.name);
    if (!handle) continue;
    const shadowHandle = ballShadowHandles.get(pose.name);
    const number = Number(pose.name.slice("ball-".length));
    if (evidenceScenarioActive && rules.potted.includes(number)) {
      parkNode(handle);
      parkNode(shadowHandle);
      previousBallPositions.delete(pose.name);
      continue;
    }
    handle.setScale([BALL_VISUAL_SCALE, BALL_VISUAL_SCALE, BALL_VISUAL_SCALE]);
    // The render shell is intentionally a little larger than the physical
    // Rapier sphere for readable numbers and highlights. Lift it by the exact
    // radius delta so the renderer-owned contact patch remains underneath.
    handle.setPosition(pose.position[0], pose.position[1] + BALL_VISUAL_LIFT, pose.position[2]);
    handle.setRotation(...ballEulerFromBody(pose.rotation));
    if (shadowHandle) {
      // Preserve a compact contact patch at rest and stretch/rotate it from
      // the measured frame-to-frame Rapier displacement while a ball rolls.
      // This keeps the ball visibly grounded and gives the live break a
      // directional contact cue without adding another fake effect node.
      const previous = previousBallPositions.get(pose.name);
      const dx = previous ? pose.position[0] - previous[0] : 0;
      const dz = previous ? pose.position[2] - previous[1] : 0;
      const displacement = Math.hypot(dx, dz);
      const info = ballInfoByNumber.get(number);
      const speed = info?.speed ?? 0;
      const travel = Math.min(0.034, Math.max(displacement * 2.8, speed * 0.0025));
      const heading = displacement > 0.00001 ? Math.atan2(-dz, dx) : 0;
      shadowHandle.setRotation(0, heading, 0);
      shadowHandle.setScale([0.060 + travel, 0.0025, 0.046]);
      shadowHandle.setPosition(
        pose.position[0] + (displacement > 0.00001 ? dx * 0.35 : 0),
        0.003,
        pose.position[2] + (displacement > 0.00001 ? dz * 0.35 : 0)
      );
    }
    previousBallPositions.set(pose.name, [pose.position[0], pose.position[2]]);
  }

  const phase = rules.phase;
  const cueInfo = sim.ballInfos().find((ball) => ball.number === 0);
  if (phase === "rack-won" || phase === "rack-lost" || !cueInfo || !cueInfo.live) {
    parkNode(cueStickHandle);
    parkNode(aimLineHandle);
    parkNode(aimBankHandle);
    parkNode(aimMarkerHandle);
    parkNode(cueGhostHandle);
    return;
  }

  if (phase === "shooting") {
    // Keep the typed cue in a short follow-through pose during the live break.
    // The rest of the aim overlays are parked, leaving a readable cue-ball /
    // rack action relationship in the deterministic review capture.
    parkNode(aimLineHandle);
    parkNode(aimBankHandle);
    parkNode(aimMarkerHandle);
    parkNode(cueGhostHandle);
    const strikeAngle = typeof lastShotObject?.angle === "number" ? lastShotObject.angle : cueController.aimAngle;
    const strikeX = Math.cos(strikeAngle);
    const strikeZ = Math.sin(strikeAngle);
    cueStickHandle?.setScale([BALL_VISUAL_SCALE, BALL_VISUAL_SCALE, BALL_VISUAL_SCALE]);
    cueStickHandle?.setPosition(cueInfo.x + strikeX * 0.045, BALL_SURFACE_Y + 0.008, cueInfo.z + strikeZ * 0.045);
    cueStickHandle?.setRotation(0, -strikeAngle, 0.035);
    return;
  }

  if (phase === "ball-in-hand") {
    parkNode(cueStickHandle);
    parkNode(aimLineHandle);
    parkNode(aimBankHandle);
    parkNode(aimMarkerHandle);
    cueGhostHandle?.setScale([BALL_VISUAL_SCALE, BALL_VISUAL_SCALE, BALL_VISUAL_SCALE]);
    cueGhostHandle?.setPosition(ghost.x, BALL_SURFACE_Y + 0.004, ghost.z);
    return;
  }

  parkNode(cueGhostHandle);
  const angle = cueController.aimAngle;
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);

  // Cue stick behind the ball, pulling back with the charge.
  const pullback = 0.04 + cueController.state().charge * 0.28;
  cueStickHandle?.setPosition(cueInfo.x - dirX * pullback, BALL_SURFACE_Y + 0.008, cueInfo.z - dirZ * pullback);
  cueStickHandle?.setRotation(0, -angle, 0.06);

  // The exact review frame is the uncluttered table presentation.  Preserve
  // the live cue pose and every underlying sweep/evidence value, but keep the
  // thick training overlays for the playable route where they are useful.
  // This is renderer state, not CSS or screenshot compositing.
  // Physics sweep preview (sphereCast against live balls and cushions).
  const sweep = sim.sweepFromCue(angle);
  // The review capture keeps the line hairline-thin and subdued so it reads as
  // a real tactical cue rather than a UI banner; the playable route retains a
  // stronger training guide and bank preview.
  poseLine(aimLineHandle, cueInfo.x, cueInfo.z, sweep.ghostX, sweep.ghostZ, BALL_SURFACE_Y + 0.002, 0.006);
  aimMarkerHandle?.setPosition(sweep.ghostX, BALL_SURFACE_Y, sweep.ghostZ);
  if (sweep.kind === "cushion") {
    const dot = dirX * sweep.normalX + dirZ * sweep.normalZ;
    const bankX = dirX - 2 * dot * sweep.normalX;
    const bankZ = dirZ - 2 * dot * sweep.normalZ;
    poseLine(aimBankHandle, sweep.ghostX, sweep.ghostZ, sweep.ghostX + bankX * 0.45, sweep.ghostZ + bankZ * 0.45, BALL_SURFACE_Y + 0.002, 0.005);
  } else {
    parkNode(aimBankHandle);
  }
}

// ------------------------------------------------------------- evidence ------
function collectRouteEvidence(): Record<string, unknown> {
  const snap = rules.snapshot();
  const cueState = cueController.state();
  const diagnostics: AuraDiagnostics = app.diagnostics();
  const evidence: Record<string, unknown> = {
    // Contract keys from the PRD evidence section.
    status: "ready",
    mounted: true,
    primaryAssets: ["assets.bankShotTable", "assets.bankShotCue", "assets.bankShotBall00"],
    rack: snap.rack,
    state: bankGame.session.paused ? "paused" : snap.phase,
    score: snap.score,
    combo: snap.combo,
    suit: snap.suit,
    fouls: snap.fouls,
    ballsRemaining: snap.ballsRemaining,
    potted: [...snap.potted],
    lastShot: lastShotSummary,
    shotHash: shotHashValue,
    resetHashMatch: resetHashMatchValue,
    clockMs: snap.clockMs,
    sensorEventCount,
    physicsBodyCount: sim.world.snapshot().bodies,
    renderer: {
      // AuraDiagnostics.backend is the engine-owned render backend
      // ("webgl2" | "webgpu" | "canvas2d" | "headless"); the previous
      // `runtimeBackend` field did not exist, so evidence always read
      // "unknown". The quality profile names the active renderer tier.
      backend: diagnostics.backend,
      qualityProfile: diagnostics.renderer?.qualityProfile.id ?? "unknown",
      rendererMode: diagnostics.renderer?.rendererMode ?? "unknown",
      drawCalls: diagnostics.drawCalls,
      renderSize: [...diagnostics.renderSize]
    },
    audioCues: audioCueLog.slice(),
    // Route-local extras consumed by specs and route-health.
    appId: APP_ID,
    backend: sim.backend,
    phase: snap.phase,
    frameCount,
    aimAngle: cueState.aimAngle,
    charge: cueState.charge,
    spin: cueState.spin,
    charging: cueState.charging,
    liveBallCount: evidenceScenarioActive ? snap.ballsRemaining + 1 : sim.liveBallCount(),
    physicsLiveBallCount: sim.liveBallCount(),
    evidenceScenario: evidenceScenarioActive,
    resolvedNodeHandles: ballHandles.size + (cueStickHandle ? 1 : 0) + (aimLineHandle ? 1 : 0),
    comboStreak: snap.comboStreak,
    suitCleared: snap.suitCleared,
    ballsRemainingInSuit: snap.ballsRemainingInSuit,
    sessionComplete: snap.sessionComplete,
    shotCount: snap.shotCount,
    lastShotObject,
    rackClockLimitMs: rackConfigFor(snap.rack).clockMs,
    controls: ["A/Left aim left", "D/Right aim right", "W top spin", "S draw", "hold Space charge", "R re-rack", "P pause", "touch buttons"],
    systems: ROUTE_SYSTEMS,
    claimBoundary: "Aura3D prototype: route-local arcade 8-ball on the public physics surface (16 dynamic spheres, cushion restitution, pocket sensors); authored spin is a velocity nudge, no angular simulation; no reusable cue-sports kit claimed.",
    collectedAtEpochMs: Date.now()
  };
  void sessionScoreAtRackStart;
  return evidence;
}

// Renderer-owned capture used by specs and probes (no compositor dependency).
bankWindow.__BS_SHOT__ = () => app.screenshot().dataUrl;

/**
 * Deterministic time pump for specs: headless tabs can throttle rAF to ~1fps,
 * so long passive waits never advance the sim. Uses the public app.pause() +
 * app.step() path to run `frames` fixed steps, then resumes the browser loop.
 */
bankWindow.__BS_PUMP__ = (frames: number): number => {
  app.pause();
  for (let index = 0; index < frames; index += 1) app.step(1 / 60);
  app.resume();
  return app.runtime.frame;
};

/**
 * Deterministic browser-evidence fixtures for rule outcomes that would otherwise
 * require brittle pixel-coordinate shot scripts. They drive the same RulesEngine,
 * HUD, audio mapping, result card, typed ball handles, and scene synchronizer as
 * play. Actual contacts/pockets/settling remain separately proven by public
 * Rapier simulation tests and the naturally driven browser break.
 */
bindBankShotEvidence(collectRouteEvidence);
bindBankShotDrive({
  resetForFixture: () => {
    resetSession();
    evidenceScenarioActive = true;
  },
  resolve: (record) => {
    if (!rules.beginShot()) throw new Error(`Bank Shot evidence fixture could not begin a shot.`);
    const outcome = rules.resolveShot(record);
    rules.finishResolution();
    applyOutcome(outcome);
    lastShotSummary = outcome.rackWon
      ? "rack-won"
      : outcome.rackLost
        ? `rack-lost:${outcome.lossReason}`
        : outcome.foul
          ? `foul:${outcome.foulReasons.join("+")}`
          : outcome.pottedLegal.length > 0
            ? `potted:${outcome.pottedLegal.join(",")}`
            : "miss";
    lastShotObject = { ...record, outcome };
    return outcome;
  },
  advanceRack: () => {
    rules.advanceRack();
    sim.resetRack();
    hideResultCard();
  },
  toast: showToast,
  sync: () => {
    syncVisuals();
    syncHud();
  }
});

// ---------------------------------------------------------------- input -------
/*
 * Keyboard is read through a route-owned window mirror with explicit edge
 * detection (the sibling showcase routes' discipline): engine game-input stays
 * configured for touch parity, but keyboard edges must not depend on focus.
 */
const manualHeld = new Set<string>();
const manualPrev = new Map<string, boolean>();
let spaceTapArmed = false;

function manualEdge(code: string): "pressed" | "released" | "held" | "idle" {
  const now = manualHeld.has(code);
  const before = manualPrev.get(code) ?? false;
  if (now && !before) return "pressed";
  if (!now && before) return "released";
  return now ? "held" : "idle";
}

function manualAdvanceFrame(): void {
  for (const code of ["Space", "KeyA", "KeyD", "KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyR"]) {
    manualPrev.set(code, manualHeld.has(code));
  }
}

function confirmBallInHand(): void {
  let targetX = ghost.x;
  let targetZ = ghost.z;
  if (!sim.canPlaceCue(targetX, targetZ)) {
    let found = false;
    for (let r = 0.02; r <= 0.8; r += 0.03) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const testX = targetX + Math.cos(a) * r;
        const testZ = targetZ + Math.sin(a) * r;
        if (sim.canPlaceCue(testX, testZ)) {
          targetX = testX;
          targetZ = testZ;
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) return;
  }
  ghost = { x: targetX, z: targetZ };
  if (!sim.restoreCueAt(targetX, targetZ)) return;
  if (rules.confirmBallInHand()) pushCue("ball-hit");
  syncHud();
}

window.addEventListener("keydown", (event) => {
  if (!event.repeat) manualHeld.add(event.code);
  if (event.code === "Space" && !event.repeat) {
    if (rules.phase === "aiming" && !cueController.charging) {
      cueController.beginCharge();
      spaceTapArmed = true;
    } else if (rules.phase === "ball-in-hand") {
      confirmBallInHand();
    } else if (rules.phase === "rack-won") {
      advanceRack();
    }
  }
  if (event.repeat) return;
  if (event.code === "KeyR") resetSession();
}, { passive: true });
window.addEventListener("keyup", (event) => {
  manualHeld.delete(event.code);
  if (event.code === "Space") {
    spaceTapArmed = false;
    if (cueController.charging) doStrike();
  }
}, { passive: true });
window.addEventListener("keydown", (event) => {
  if (["Space", "KeyA", "KeyD", "KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) {
    event.preventDefault();
  }
}, { passive: false });

// aim-drag preset (PRD-09 1767): the left stick aims/spins, the right
// (non-returning) stick fine-aims, charge holds Space. Writes land in the same
// `manualHeld` code set the keyboard path feeds, so touch and keys share the
// aim/charge logic below.
const touchControls = mountTouchControls(
  {
    press: (code) => manualHeld.add(code),
    release: (code) => manualHeld.delete(code),
    setAction: (code, held) => (held ? manualHeld.add(code) : manualHeld.delete(code))
  },
  {
    preset: "aim-drag",
    bindings: {
      "stick.left": "KeyA",
      "stick.right": "KeyD",
      "stick.up": "KeyW",
      "stick.down": "KeyS",
      "rstick.left": "KeyA",
      "rstick.right": "KeyD",
      charge: "Space",
      confirm: "Space",
      cancel: "KeyR"
    }
  },
  {
    doc: document as unknown as HudDocument,
    root: hudHost,
    coarsePointer: () => matchMedia("(pointer: coarse)").matches
  }
);

// ------------------------------------------------------------- frame loop ----
const BALL_IN_HAND_STEP = 0.03;

bankGame.app.onFrame(({ dt }) => {
  input.update(dt);
  bankTween.tick(dt);
  frameCount += 1;

  touchControls.update();

  if (bankGame.session.paused) {
    manualAdvanceFrame();
    return;
  }

  cueController.updateCharge(dt);

  if (rules.phase === "aiming") {
    if (manualHeld.has("KeyA") || manualHeld.has("ArrowLeft")) cueController.aimBy(-AIM_STEP);
    if (manualHeld.has("KeyD") || manualHeld.has("ArrowRight")) cueController.aimBy(AIM_STEP);
    if (manualHeld.has("KeyW") || manualHeld.has("ArrowUp")) cueController.spinBy(SPIN_STEP);
    if (manualHeld.has("KeyS") || manualHeld.has("ArrowDown")) cueController.spinBy(-SPIN_STEP);
  } else if (rules.phase === "ball-in-hand") {
    const margin = BALL_RADIUS + 0.02;
    if (manualHeld.has("KeyA") || manualHeld.has("ArrowLeft")) ghost.x = Math.max(-PLAY_HALF_X + margin, ghost.x - BALL_IN_HAND_STEP);
    if (manualHeld.has("KeyD") || manualHeld.has("ArrowRight")) ghost.x = Math.min(PLAY_HALF_X - margin, ghost.x + BALL_IN_HAND_STEP);
    if (manualHeld.has("KeyW") || manualHeld.has("ArrowUp")) ghost.z = Math.max(-PLAY_HALF_Z + margin, ghost.z - BALL_IN_HAND_STEP);
    if (manualHeld.has("KeyS") || manualHeld.has("ArrowDown")) ghost.z = Math.min(PLAY_HALF_Z - margin, ghost.z + BALL_IN_HAND_STEP);
  }

  if (manualEdge("Space") === "released" && cueController.charging) {
    doStrike();
  }
  manualAdvanceFrame();

  if (rules.phase === "shooting" && shotInFlight) {
    sim.stepFixed(1);
    consumeShotEvents();
    shootingFrames += 1;
    // Fast settling: resolve as soon as balls stop rolling (threshold 0.08 m/s for 18 frames) or max 300 frames (5s)
    if (sim.allAtRest(0.08)) stalledFrames += 1;
    else stalledFrames = 0;
    if (stalledFrames >= 18 || shootingFrames >= 300) resolveShotNow();
  }

  if (rules.tickClock(dt * 1000)) {
    pushCue("rack-fail");
    void hud.banner("RACK LOST", { holdMs: 3200, style: "fail" });
    hud.toast(`Rack ${rules.rack} lost: clock expired. Score ${rules.score}.`, { ms: 5200 });
    syncHud();
  }

  syncVisuals();
  if (frameCount % 6 === 0) syncHud();
});

void rackSpotFor;
syncHud();
