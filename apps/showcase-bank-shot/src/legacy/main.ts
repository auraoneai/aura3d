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
  createGameApp,
  effects,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  ui,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode,
  type AuraDiagnostics
} from "@aura3d/engine";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import { assets } from "../../../../src/aura-assets";
import { CueController, AIM_STEP, SPIN_STEP } from "../gameplay/cue";
import { RulesEngine, type ShotRecord, type ShotOutcome } from "../gameplay/rules";
import { rackConfigFor, RACK_COUNT } from "../gameplay/racks";
import { createTableSimulation, CUE_SPOT, BALL_RADIUS, PLAY_HALF_X, PLAY_HALF_Z, POCKET_CENTERS, rackSpotFor } from "../gameplay/table";
import { ballEulerFromBody } from "../gameplay/ball-visuals";
import { createBilliardsAudio } from "./billiards-audio";
import { createPoolHallSetDressing } from "./environment";
import "./styles.css";

type BankShotWindow = Window & {
  __BANK_SHOT_EVIDENCE__?: unknown;
  __AURA3D_SHOWCASE_BANK_SHOT__?: unknown;
  __AURA3D_GAME_EVIDENCE__?: unknown;
  __AURA3D_GAME__?: unknown;
  __AURA3D_COMPOSITION_PROBE__?: unknown;
  __BS_SHOT__?: () => string;
  __BS_PUMP__?: (frames: number) => number;
  __BS_SCENARIO__?: (scenario: "pocket" | "foul" | "eight-finish" | "rack-fail") => string;
};
const bankWindow = window as BankShotWindow;
const reducedMotion = typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const portraitComposition = window.innerWidth <= 700 || window.innerHeight > window.innerWidth * 1.25;
const visualReviewCapture = new URLSearchParams(window.location.search).get("capture") === "review";
// PRD-03 §6.6 / Q-14-1: post v2 (A3D_QR_POST, default-on) has no hidden bloom
// gain, a linear-HDR bloom threshold of 1.0 and real AO on the felt, which left
// the hall ~9% darker than post-off. Under post v2 the aim overlays get HDR
// emissive strength and the table key lights a modest lift; post-off is unchanged.
const postV2 = resolveQrFlags({
  url: location.href,
  env: { VITE_A3D_QR: (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_A3D_QR }
}).on("A3D_QR_POST");
const NEON_GAIN = postV2 ? 2.6 : 1;
const KEY_LIGHT_GAIN = postV2 ? 1.14 : 1;
const AIM_EMISSIVE_STRENGTH = 1.35 * NEON_GAIN;
document.body.dataset.capture = visualReviewCapture ? "review" : "default";

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
ui.html("#hud", `
  <div class="hole-banner" id="bs-banner" aria-live="polite">BANK SHOT - AIM WITH A/D, HOLD SPACE TO CHARGE</div>
  <div class="pocket-toast is-hidden" id="bs-toast" aria-live="polite"></div>
  <div class="result-card is-hidden" id="bs-result" data-testid="bank-shot-result">
    <h2 id="bs-result-title">Rack over</h2>
    <p id="bs-result-detail"></p>
    <div class="action-row"><button id="bs-again-button" type="button">Re-rack</button></div>
  </div>
`);

ui.html("#panel", `
  <section class="bs-brand">
    <p class="eyebrow">Aura3D Prototype</p>
    <h1>Bank Shot</h1>
    <p class="blurb">Arcade 8-ball after close: 16 live balls, one lamp, three racks on shrinking clocks. Clear your suit, bank your leave, sink the 8.</p>
  </section>
  <section class="stat-grid" aria-label="Rack status">
    <article><span>Rack</span><strong id="stat-rack">1 OF 3</strong></article>
    <article><span>Clock</span><strong id="stat-clock">4:00</strong></article>
    <article><span>Score</span><strong id="stat-score">0</strong></article>
    <article><span>Combo</span><strong id="stat-combo">X1</strong></article>
    <article><span>Suit</span><strong id="stat-suit">OPEN</strong></article>
    <article><span>Fouls</span><strong id="stat-fouls">0 OF 3</strong></article>
    <article><span>Balls left</span><strong id="stat-balls">15</strong></article>
    <article><span>Suit left</span><strong id="stat-suit-balls">-</strong></article>
    <article><span>Live balls</span><strong id="stat-live">16</strong></article>
  </section>
  <div class="power-meter" aria-label="Strike power"><span class="sweet-zone"></span><span class="fill" id="bs-power-fill"></span></div>
  <div class="power-meta"><span id="bs-power-label">Strike</span><span>hold Space - sweet zone marked</span></div>
  <p class="mission-line" id="bs-mission" aria-live="polite">OPEN TABLE - AIM WITH A/D, HOLD SPACE TO CHARGE</p>
  <ul class="controls-list" aria-label="Keyboard controls">
    <li>Aim <b>A</b>/<b>D</b> or <b>&larr;/&rarr;</b> (spin contact point <b>W</b>/<b>S</b>)</li>
    <li>Strike <b>hold Space</b>, release</li>
    <li>Ball in hand: move <b>A/D/W/S</b>, <b>Space</b> to place</li>
    <li>Re-rack <b>R</b> - Pause <b>P</b></li>
  </ul>
  <section class="action-row" aria-label="Game actions">
    <button id="bs-aim-left-button" type="button">Aim &larr;</button>
    <button id="bs-aim-right-button" type="button">Aim &rarr;</button>
    <button id="bs-charge-button" type="button">Charge + strike</button>
    <button id="bs-spin-top-button" type="button">Top</button>
    <button id="bs-spin-draw-button" type="button">Draw</button>
    <button id="bs-reset-button" type="button">Re-rack</button>
    <button id="bs-pause-button" type="button">Pause</button>
  </section>
`);

// ---------------------------------------------------------------- audio ------
const audio = createBilliardsAudio();
let ambientStarted = false;
window.addEventListener("pointerdown", () => {
  void audio.unlock().then(() => {
    ambientStarted = true;
  }).catch(() => undefined);
}, { passive: true });
window.addEventListener("keydown", () => {
  void audio.unlock().then(() => {
    ambientStarted = true;
  }).catch(() => undefined);
}, { passive: true });
void ambientStarted;

// ---------------------------------------------------------------- state ------
const sim = createTableSimulation();
const rules = new RulesEngine(1);
const cueController = new CueController();
/** True while a struck shot is in flight (facts come from sim.shotFacts()). */
let shotInFlight = false;
let paused = false;
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
let toastTimer = 0;
let sessionScoreAtRackStart = 0;
let evidenceScenarioActive = false;
let sideEnglish = 0;

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
const AIM_LINE_MATERIAL = material.emissive({ name: "aim line", color: "#38bdf8", emissive: "#0ea5e9", emissiveIntensity: AIM_EMISSIVE_STRENGTH, opacity: visualReviewCapture ? 0.62 : 0.9 });
const AIM_BANK_MATERIAL = material.emissive({ name: "aim bank", color: "#f59e0b", emissive: "#d97706", emissiveIntensity: AIM_EMISSIVE_STRENGTH, opacity: 0.85 });
const AIM_OBJECT_MATERIAL = material.emissive({ name: "aim object target vector", color: "#fbbf24", emissive: "#f59e0b", emissiveIntensity: AIM_EMISSIVE_STRENGTH * 1.15, opacity: 0.92 });
const AIM_DEFLECTION_MATERIAL = material.emissive({ name: "aim cue deflection vector", color: "#e0f2fe", emissive: "#38bdf8", emissiveIntensity: AIM_EMISSIVE_STRENGTH * 0.95, opacity: 0.82 });
const AIM_GHOST_RING_MATERIAL = material.emissive({ name: "aim ghost contact ring", color: "#7dd3fc", emissive: "#38bdf8", emissiveIntensity: AIM_EMISSIVE_STRENGTH * 1.2, opacity: 0.88 });
const AIM_MARKER_MATERIAL = material.emissive({ name: "aim marker", color: "#38bdf8", emissive: "#7dd3fc", emissiveIntensity: AIM_EMISSIVE_STRENGTH });
const GHOST_MATERIAL = material.emissive({ name: "cue ghost", color: "#38bdf8", emissive: "#0284c7", emissiveIntensity: AIM_EMISSIVE_STRENGTH, opacity: 0.55 });
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
      .scale([BALL_VISUAL_SCALE * 1.18, BALL_VISUAL_SCALE * 1.18, BALL_VISUAL_SCALE * 1.18])
      .runtime(game.runtimeNode("cue-stick", { tags: ["typed-asset", "cue"] }))
      .toJSON()
  );
  const pBox = primitives.box;
  const pTorus = primitives.torus;
  nodes.push(
    pBox({
      name: "cue-tip-3d",
      material: material.pbr({ name: "cue blue chalk tip", color: "#0284c7", roughness: 0.42, metallic: 0.05 })
    })
      .position(0, -5, 0)
      .scale([0.001, 0.001, 0.001])
      .runtime(game.runtimeNode("cue-tip-3d", { tags: ["renderer-owned", "cue"] }))
      .toJSON(),
    pBox({
      name: "cue-ferrule-3d",
      material: material.pbr({ name: "cue brass ferrule", color: "#fbbf24", roughness: 0.18, metallic: 0.92, clearcoat: 0.4 })
    })
      .position(0, -5, 0)
      .scale([0.001, 0.001, 0.001])
      .runtime(game.runtimeNode("cue-ferrule-3d", { tags: ["renderer-owned", "cue"] }))
      .toJSON(),
    pBox({
      name: "cue-shaft-3d",
      material: material.pbr({ name: "cue maple shaft", color: "#f5e1be", roughness: 0.28, metallic: 0.06, clearcoat: 0.65 })
    })
      .position(0, -5, 0)
      .scale([0.001, 0.001, 0.001])
      .runtime(game.runtimeNode("cue-shaft-3d", { tags: ["renderer-owned", "cue"] }))
      .toJSON(),
    pBox({
      name: "cue-butt-3d",
      material: material.pbr({ name: "cue rosewood butt", color: "#3d160c", roughness: 0.22, metallic: 0.16, clearcoat: 0.82 })
    })
      .position(0, -5, 0)
      .scale([0.001, 0.001, 0.001])
      .runtime(game.runtimeNode("cue-butt-3d", { tags: ["renderer-owned", "cue"] }))
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
  for (const z of visualReviewCapture ? [] : [-0.52, -0.26, 0.26, 0.52]) {
    nodes.push(
      primitives.box({ name: `felt-guide-${z}`, material: FELT_GUIDE_MATERIAL })
        .position(0, 0.022, z)
        .scale([1.08, 0.003, 0.006])
        .toJSON()
    );
  }
  // In-scene aim geometry (PRD 6): line, first-contact ghost ring, object ball
  // target vector, cue tangent deflection vector, and the bank preview line.
  nodes.push(
    primitives.box({ name: "aim-line", material: AIM_LINE_MATERIAL })
      .position(0, -5, 0)
      .scale([1, 0.006, 0.006])
      .runtime(game.runtimeNode("aim-line", { tags: ["aim-preview"] }))
      .toJSON(),
    primitives.box({ name: "aim-bank", material: AIM_BANK_MATERIAL })
      .position(0, -5, 0)
      .scale([1, 0.005, 0.005])
      .runtime(game.runtimeNode("aim-bank", { tags: ["aim-preview"] }))
      .toJSON(),
    pBox({ name: "aim-object-line", material: AIM_OBJECT_MATERIAL })
      .position(0, -5, 0)
      .scale([1, 0.005, 0.005])
      .runtime(game.runtimeNode("aim-object-line", { tags: ["aim-preview"] }))
      .toJSON(),
    pBox({ name: "aim-deflection-line", material: AIM_DEFLECTION_MATERIAL })
      .position(0, -5, 0)
      .scale([1, 0.004, 0.004])
      .runtime(game.runtimeNode("aim-deflection-line", { tags: ["aim-preview"] }))
      .toJSON(),
    pTorus({
      name: "aim-ghost-ring",
      material: AIM_GHOST_RING_MATERIAL
    })
      .position(0, -5, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([BALL_VISUAL_RADIUS * 1.06, BALL_VISUAL_RADIUS * 1.06, 0.008])
      .runtime(game.runtimeNode("aim-ghost-ring", { tags: ["aim-preview"] }))
      .toJSON()
  );
  // Add complete 3D Billiards Lounge environment with the suspended stained-glass
  // Tiffany chandelier, mahogany wainscot walls, patterned Persian rug, trophy
  // cabinets, and leather club chairs directly from environment.ts.
  for (const rawNode of createPoolHallSetDressing({ portrait: portraitComposition })) {
    nodes.push(rawNode);
  }

  return nodes;
}

function buildScene(): ReturnType<typeof scene> {
  const sceneCamera = portraitComposition
    ? camera.perspective({ position: [-3.8, 7.2, 0], target: [-0.38, -0.05, 0], fov: 62 })
    : camera.perspective({
      position: visualReviewCapture ? [-0.28, 1.88, 2.52] : [-0.08, 1.92, 2.68],
      target: visualReviewCapture ? [0.14, 0.28, -0.08] : [0.24, 0.28, -0.08],
      fov: visualReviewCapture ? 46 : 50
    });
  return scene()
    .background("#10182a")
    .addMany(visualNodes())
    .addMany([
      // Midnight Slate / Aurora Noir billiards-hall mood with balanced speculars:
      effects.neonBloom({ intensity: reducedMotion ? 0.04 : 0.065, quality: "balanced", softKnee: 0.5, shoulder: 0.6 }),
      effects.colorGrade({ exposure: 1.04, contrast: 1.08, saturation: 1.1 }),
      effects.antiAlias({ mode: "fxaa" }),
      effects.ambientOcclusion({ intensity: visualReviewCapture ? 0.54 : 0.26 }),
      effects.contactOcclusion({ name: "ball-to-felt contact", intensity: 0.36, radius: 0.52 }),
      effects.fog({
        name: "hall haze",
        density: visualReviewCapture ? 0.0035 : 0.006,
        color: "#141e33",
        intensity: visualReviewCapture ? 0.06 : 0.1
      }),
      lights.ambient({ name: "slate ambient", color: "#586d8c", intensity: (visualReviewCapture ? 0.42 : 0.48) * KEY_LIGHT_GAIN }),
      lights.point({ name: "pendant-light-mid", color: "#fff5d8", intensity: 2.35 * KEY_LIGHT_GAIN }).position(-0.95, 2.05, 0.65),
      lights.point({ name: "pendant-light-head", color: "#ffe9bd", intensity: 2.1 * KEY_LIGHT_GAIN }).position(0.2, 2.1, -0.55),
      lights.point({ name: "pendant-light-foot", color: "#ffd99c", intensity: 2.0 * KEY_LIGHT_GAIN }).position(1.05, 2.0, 0.25),
      lights.point({ name: "pendant-shade-front-key", color: "#ffedd5", intensity: 1.45 * KEY_LIGHT_GAIN }).position(0, 2.15, 0.95),
      lights.point({ name: "lounge-wall-sconce-left", color: "#fbbf24", intensity: 3.8 * KEY_LIGHT_GAIN }).position(-2.1, 1.38, -2.15),
      lights.point({ name: "lounge-wall-sconce-mid-left", color: "#f59e0b", intensity: 3.4 * KEY_LIGHT_GAIN }).position(-0.82, 1.38, -2.15),
      lights.point({ name: "lounge-wall-sconce-mid-right", color: "#f59e0b", intensity: 3.4 * KEY_LIGHT_GAIN }).position(0.82, 1.38, -2.15),
      lights.point({ name: "lounge-wall-sconce-right", color: "#fbbf24", intensity: 3.8 * KEY_LIGHT_GAIN }).position(2.1, 1.38, -2.15),
      lights.rect({ name: "table overhead softbox", color: "#fff4dc", intensity: 1.25 * KEY_LIGHT_GAIN, width: 2.8, height: 1.25 })
        .position(0, 2.35, 0.15),
      // Cool fill & rim lights
      lights.directional({ name: "cool rim key", color: "#83bdff", intensity: 1.15 }).position(3.2, 4.5, 2.2),
      lights.directional({ name: "warm room fill", color: "#f2a65e", intensity: 0.92 }).position(-3.0, 3.5, -2.0),
      lights.point({ name: "felt cyan bounce", color: "#55baff", intensity: visualReviewCapture ? 0.18 : 0.48 }).position(0, 0.75, 2.0),
      lights.point({ name: "rack magenta rim", color: "#ff78ad", intensity: visualReviewCapture ? 0.24 : 0.52 }).position(1.65, 0.72, -0.58),
      lights.point({ name: "cue teal rim", color: "#55e2d2", intensity: visualReviewCapture ? 0.22 : 0.48 }).position(-1.45, 0.62, 0.62)
    ])
    .camera(sceneCamera);
}

// ---------------------------------------------------------------- mount ------
const gameApp = createGameApp("#app", {
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
      englishLeft: ["KeyQ"],
      englishRight: ["KeyE"],
      charge: ["Space"],
      pause: ["KeyP", "Escape"],
      reset: ["KeyR"]
    },
    bufferMs: 80,
    gamepad: true,
    touch: true
  },
  loop: { fixedDt: 1 / 60, maxSubSteps: 2 },
  scene: buildScene()
});
const app = gameApp.app;
const input = gameApp.input!;
if (!input) throw new Error("Bank Shot failed to create Aura3D input.");

const ballHandles = new Map<string, AuraRuntimeNodeHandle>();
const ballShadowHandles = new Map<string, AuraRuntimeNodeHandle>();
const previousBallPositions = new Map<string, readonly [number, number]>();
let tableHandle: AuraRuntimeNodeHandle | undefined;
let cueStickHandle: AuraRuntimeNodeHandle | undefined;
let cueTip3dHandle: AuraRuntimeNodeHandle | undefined;
let cueFerrule3dHandle: AuraRuntimeNodeHandle | undefined;
let cueShaft3dHandle: AuraRuntimeNodeHandle | undefined;
let cueButt3dHandle: AuraRuntimeNodeHandle | undefined;
let cueGhostHandle: AuraRuntimeNodeHandle | undefined;
let aimLineHandle: AuraRuntimeNodeHandle | undefined;
let aimBankHandle: AuraRuntimeNodeHandle | undefined;
let aimObjectLineHandle: AuraRuntimeNodeHandle | undefined;
let aimDeflectionLineHandle: AuraRuntimeNodeHandle | undefined;
let aimGhostRingHandle: AuraRuntimeNodeHandle | undefined;
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
  cueTip3dHandle = app.nodes.get("cue-tip-3d") as AuraRuntimeNodeHandle | undefined;
  cueFerrule3dHandle = app.nodes.get("cue-ferrule-3d") as AuraRuntimeNodeHandle | undefined;
  cueShaft3dHandle = app.nodes.get("cue-shaft-3d") as AuraRuntimeNodeHandle | undefined;
  cueButt3dHandle = app.nodes.get("cue-butt-3d") as AuraRuntimeNodeHandle | undefined;
  cueGhostHandle = app.nodes.get("cue-ghost") as AuraRuntimeNodeHandle | undefined;
  aimLineHandle = app.nodes.get("aim-line") as AuraRuntimeNodeHandle | undefined;
  aimBankHandle = app.nodes.get("aim-bank") as AuraRuntimeNodeHandle | undefined;
  aimObjectLineHandle = app.nodes.get("aim-object-line") as AuraRuntimeNodeHandle | undefined;
  aimDeflectionLineHandle = app.nodes.get("aim-deflection-line") as AuraRuntimeNodeHandle | undefined;
  aimGhostRingHandle = app.nodes.get("aim-ghost-ring") as AuraRuntimeNodeHandle | undefined;
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
const banner = document.getElementById("bs-banner")!;
const toast = document.getElementById("bs-toast")!;
const resultCard = document.getElementById("bs-result")!;
const resultTitle = document.getElementById("bs-result-title")!;
const resultDetail = document.getElementById("bs-result-detail")!;
const againButton = document.getElementById("bs-again-button") as HTMLButtonElement;
const powerFill = document.getElementById("bs-power-fill")!;
const powerLabel = document.getElementById("bs-power-label")!;

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function showToast(text: string): void {
  toast.textContent = text;
  toast.classList.remove("is-hidden");
  toast.style.opacity = "1";
  toastTimer = 90;
}

function hideResultCard(): void {
  resultCard.classList.add("is-hidden");
}

function syncHud(): void {
  const snap = rules.snapshot();
  const cueState = cueController.state();
  ui.setText("#stat-rack", `${snap.rack} OF ${RACK_COUNT}`);
  ui.setText("#stat-clock", formatClock(snap.clockMs));
  ui.setText("#stat-score", String(snap.score));
  ui.setText("#stat-combo", `X${snap.combo.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`);
  ui.setText("#stat-suit", snap.suit === null ? "OPEN" : snap.suit.toUpperCase());
  ui.setText("#stat-fouls", `${snap.fouls} OF 3`);
  ui.setText("#stat-balls", String(snap.ballsRemaining));
  ui.setText("#stat-suit-balls", snap.suit === null ? "-" : String(snap.ballsRemainingInSuit));
  ui.setText("#stat-live", String(evidenceScenarioActive ? snap.ballsRemaining + 1 : sim.liveBallCount()));
  ui.setText("#bs-mission", snap.banner);
  powerFill.style.width = Math.round(cueState.charge * 100) + "%";
  powerLabel.textContent = cueState.charging
    ? `Strike ${Math.round(cueState.charge * 100)}%${cueState.inSweetZone ? " SWEET" : ""}`
    : "Strike";
  const chargeBtn = document.getElementById("bs-charge-button") as HTMLButtonElement | null;
  if (chargeBtn) {
    if (snap.phase === "ball-in-hand") chargeBtn.textContent = "Place Cue Ball";
    else if (snap.phase === "rack-won" && snap.sessionComplete) chargeBtn.textContent = "Session complete";
    else if (snap.phase === "rack-won") chargeBtn.textContent = "Next Rack (Space)";
    else chargeBtn.textContent = "Charge + strike";
    chargeBtn.disabled = snap.phase === "rack-won" && snap.sessionComplete;
  }
  banner.textContent = paused
    ? "PAUSED - P TO RESUME"
    : snap.phase === "rack-won" && snap.sessionComplete
      ? "SESSION CLEAR - R TO RE-RACK"
      : snap.banner;
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
      if (cueReady("ball-hit", 14)) pushCue("ball-hit");
    } else if (fact.type === "cushion-touch") {
      if (cueReady("cushion-hit", 16)) pushCue("cushion-hit");
    }
  }
  // Cluster clacks from the polled contact events (slower, persistent pairs).
  for (const impact of sim.consumeImpacts()) {
    if (impact.kind === "ball-ball" && impact.speed > 0.85 && cueReady("ball-hit", 18)) pushCue("ball-hit");
  }
  for (const pot of sim.consumePotEvents()) {
    pottedThisShot.push(pot.ball);
    if (cueReady("pocket-drop", 10)) {
      pushCue("pocket-drop");
    } else {
      audioCueLog.push("pocket-drop");
      if (audioCueLog.length > 48) audioCueLog.shift();
    }
    showToast(pot.ball === 0 ? "SCRATCH" : `BALL ${pot.ball} DOWN`);
  }
}

function applyOutcome(outcome: ShotOutcome): void {
  if (outcome.rackWon) {
    pushCue("eight-win");
    resultTitle.textContent = rules.sessionComplete ? "Session clear" : "Rack clear";
    resultDetail.textContent = rules.sessionComplete
      ? `All ${RACK_COUNT} racks cleared with ${rules.score} points.`
      : `Rack ${rules.rack} cleared: ${outcome.winReason}. Score ${rules.score}.`;
    resultCard.classList.remove("is-hidden");
  } else if (outcome.rackLost) {
    pushCue("rack-fail");
    resultTitle.textContent = "Rack lost";
    resultDetail.textContent = `Rack ${rules.rack} lost: ${outcome.lossReason}. Score ${rules.score}.`;
    resultCard.classList.remove("is-hidden");
  } else if (outcome.foul) {
    pushCue("foul-whistle");
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
  toastTimer = 0;
  toast.style.opacity = "0";
  toast.textContent = "";
  toast.classList.add("is-hidden");
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
  paused = !paused;
  syncHud();
  publishEvidence();
  if (paused) app.pause();
  else app.resume();
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
  if (ballHandles.size < 16 || !cueStickHandle || !aimLineHandle || !aimBankHandle || !aimGhostRingHandle || !cueGhostHandle) {
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
    parkNode(cueTip3dHandle);
    parkNode(cueFerrule3dHandle);
    parkNode(cueShaft3dHandle);
    parkNode(cueButt3dHandle);
    parkNode(aimLineHandle);
    parkNode(aimBankHandle);
    parkNode(aimObjectLineHandle);
    parkNode(aimDeflectionLineHandle);
    parkNode(aimGhostRingHandle);
    parkNode(aimMarkerHandle);
    parkNode(cueGhostHandle);
    return;
  }

  if (phase === "shooting") {
    parkNode(aimLineHandle);
    parkNode(aimBankHandle);
    parkNode(aimObjectLineHandle);
    parkNode(aimDeflectionLineHandle);
    parkNode(aimGhostRingHandle);
    parkNode(aimMarkerHandle);
    parkNode(cueGhostHandle);
    const strikeAngle = typeof lastShotObject?.angle === "number" ? lastShotObject.angle : cueController.aimAngle;
    const strikeX = Math.cos(strikeAngle);
    const strikeZ = Math.sin(strikeAngle);
    cueStickHandle?.setScale([BALL_VISUAL_SCALE * 1.18, BALL_VISUAL_SCALE * 1.18, BALL_VISUAL_SCALE * 1.18]);
    cueStickHandle?.setPosition(cueInfo.x - strikeX * 0.42, BALL_SURFACE_Y + 0.025, cueInfo.z - strikeZ * 0.42);
    cueStickHandle?.setRotation(0, -strikeAngle, 0.045);
    poseLine(
      cueTip3dHandle,
      cueInfo.x - strikeX * 0.036,
      cueInfo.z - strikeZ * 0.036,
      cueInfo.x - strikeX * 0.052,
      cueInfo.z - strikeZ * 0.052,
      BALL_SURFACE_Y + 0.015,
      0.011
    );
    poseLine(
      cueFerrule3dHandle,
      cueInfo.x - strikeX * 0.052,
      cueInfo.z - strikeZ * 0.052,
      cueInfo.x - strikeX * 0.098,
      cueInfo.z - strikeZ * 0.098,
      BALL_SURFACE_Y + 0.018,
      0.013
    );
    poseLine(
      cueShaft3dHandle,
      cueInfo.x - strikeX * 0.098,
      cueInfo.z - strikeZ * 0.098,
      cueInfo.x - strikeX * 0.56,
      cueInfo.z - strikeZ * 0.56,
      BALL_SURFACE_Y + 0.032,
      0.018
    );
    poseLine(
      cueButt3dHandle,
      cueInfo.x - strikeX * 0.56,
      cueInfo.z - strikeZ * 0.56,
      cueInfo.x - strikeX * 1.06,
      cueInfo.z - strikeZ * 1.06,
      BALL_SURFACE_Y + 0.056,
      0.025
    );
    return;
  }

  if (phase === "ball-in-hand") {
    parkNode(cueStickHandle);
    parkNode(cueTip3dHandle);
    parkNode(cueFerrule3dHandle);
    parkNode(cueShaft3dHandle);
    parkNode(cueButt3dHandle);
    parkNode(aimLineHandle);
    parkNode(aimBankHandle);
    parkNode(aimObjectLineHandle);
    parkNode(aimDeflectionLineHandle);
    parkNode(aimGhostRingHandle);
    parkNode(aimMarkerHandle);
    cueGhostHandle?.setScale([BALL_VISUAL_SCALE, BALL_VISUAL_SCALE, BALL_VISUAL_SCALE]);
    cueGhostHandle?.setPosition(ghost.x, BALL_SURFACE_Y + 0.004, ghost.z);
    return;
  }

  parkNode(cueGhostHandle);
  const angle = cueController.aimAngle;
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);
  const perpX = -dirZ;
  const perpZ = dirX;
  const englishOffset = sideEnglish * 0.012;

  // Cue stick behind the ball, pulling back with the charge and shifting slightly for side english.
  const pullback = 0.06 + cueController.state().charge * 0.28;
  const cueBaseX = cueInfo.x + perpX * englishOffset;
  const cueBaseZ = cueInfo.z + perpZ * englishOffset;
  cueStickHandle?.setScale([BALL_VISUAL_SCALE * 1.18, BALL_VISUAL_SCALE * 1.18, BALL_VISUAL_SCALE * 1.18]);
  cueStickHandle?.setPosition(cueBaseX - dirX * (0.48 + pullback), BALL_SURFACE_Y + 0.028, cueBaseZ - dirZ * (0.48 + pullback));
  cueStickHandle?.setRotation(0, -angle, 0.06);

  // Render crisp 3D blue chalk tip, brass ferrule, maple shaft, and rosewood butt extending behind the cue ball
  poseLine(
    cueTip3dHandle,
    cueBaseX - dirX * (0.036 + pullback),
    cueBaseZ - dirZ * (0.036 + pullback),
    cueBaseX - dirX * (0.052 + pullback),
    cueBaseZ - dirZ * (0.052 + pullback),
    BALL_SURFACE_Y + 0.015,
    0.011
  );
  poseLine(
    cueFerrule3dHandle,
    cueBaseX - dirX * (0.052 + pullback),
    cueBaseZ - dirZ * (0.052 + pullback),
    cueBaseX - dirX * (0.098 + pullback),
    cueBaseZ - dirZ * (0.098 + pullback),
    BALL_SURFACE_Y + 0.018,
    0.013
  );
  poseLine(
    cueShaft3dHandle,
    cueBaseX - dirX * (0.098 + pullback),
    cueBaseZ - dirZ * (0.098 + pullback),
    cueBaseX - dirX * (0.58 + pullback),
    cueBaseZ - dirZ * (0.58 + pullback),
    BALL_SURFACE_Y + 0.034,
    0.018
  );
  poseLine(
    cueButt3dHandle,
    cueBaseX - dirX * (0.58 + pullback),
    cueBaseZ - dirZ * (0.58 + pullback),
    cueBaseX - dirX * (1.08 + pullback),
    cueBaseZ - dirZ * (1.08 + pullback),
    BALL_SURFACE_Y + 0.058,
    0.025
  );

  // Physics sweep preview (sphereCast against live balls and cushions).
  const sweep = sim.sweepFromCue(angle);
  poseLine(aimLineHandle, cueInfo.x, cueInfo.z, sweep.ghostX, sweep.ghostZ, BALL_SURFACE_Y + 0.002, visualReviewCapture ? 0.0038 : 0.006);
  aimMarkerHandle?.setPosition(sweep.ghostX, BALL_SURFACE_Y, sweep.ghostZ);
  aimGhostRingHandle?.setPosition(sweep.ghostX, BALL_SURFACE_Y + 0.003, sweep.ghostZ);
  aimGhostRingHandle?.setRotation(Math.PI / 2, 0, 0);
  aimGhostRingHandle?.setScale([1, 1, 1]);

  if (sweep.kind === "ball" && sweep.ballNumber !== null) {
    parkNode(aimBankHandle);
    const targetBall = ballInfoByNumber.get(sweep.ballNumber);
    if (targetBall) {
      const impDx = targetBall.x - sweep.ghostX;
      const impDz = targetBall.z - sweep.ghostZ;
      const impLen = Math.hypot(impDx, impDz) || 1;
      const objDirX = impDx / impLen;
      const objDirZ = impDz / impLen;
      // Object ball target vector (gold)
      poseLine(
        aimObjectLineHandle,
        targetBall.x,
        targetBall.z,
        targetBall.x + objDirX * 0.56,
        targetBall.z + objDirZ * 0.56,
        BALL_SURFACE_Y + 0.003,
        visualReviewCapture ? 0.0036 : 0.0052
      );
      // Cue ball tangent deflection vector (cyan-white), modulated by spin/english
      const dot = dirX * objDirX + dirZ * objDirZ;
      let tangX = dirX - dot * objDirX + cueController.state().spin * 0.35 * dirX + sideEnglish * 0.25 * perpX;
      let tangZ = dirZ - dot * objDirZ + cueController.state().spin * 0.35 * dirZ + sideEnglish * 0.25 * perpZ;
      const tangLen = Math.hypot(tangX, tangZ);
      if (tangLen > 0.05) {
        tangX /= tangLen;
        tangZ /= tangLen;
        poseLine(
          aimDeflectionLineHandle,
          sweep.ghostX,
          sweep.ghostZ,
          sweep.ghostX + tangX * 0.38,
          sweep.ghostZ + tangZ * 0.38,
          BALL_SURFACE_Y + 0.003,
          visualReviewCapture ? 0.0032 : 0.0045
        );
      } else {
        parkNode(aimDeflectionLineHandle);
      }
    } else {
      parkNode(aimObjectLineHandle);
      parkNode(aimDeflectionLineHandle);
    }
  } else if (sweep.kind === "cushion") {
    parkNode(aimObjectLineHandle);
    parkNode(aimDeflectionLineHandle);
    const dot = dirX * sweep.normalX + dirZ * sweep.normalZ;
    const bankX = dirX - 2 * dot * sweep.normalX + sideEnglish * 0.18 * perpX;
    const bankZ = dirZ - 2 * dot * sweep.normalZ + sideEnglish * 0.18 * perpZ;
    poseLine(aimBankHandle, sweep.ghostX, sweep.ghostZ, sweep.ghostX + bankX * 0.48, sweep.ghostZ + bankZ * 0.48, BALL_SURFACE_Y + 0.002, visualReviewCapture ? 0.0034 : 0.005);
  } else {
    parkNode(aimBankHandle);
    parkNode(aimObjectLineHandle);
    parkNode(aimDeflectionLineHandle);
  }
}

// ------------------------------------------------------------- evidence ------
function publishEvidence(): void {
  const snap = rules.snapshot();
  const cueState = cueController.state();
  const diagnostics: AuraDiagnostics = app.diagnostics();
  const infos = sim.ballInfos();
  const maxBallSpeed = infos.reduce((max, b) => Math.max(max, b.speed), 0);
  const maxAngularSpeed = maxBallSpeed / Math.max(0.01, BALL_RADIUS);
  const liveCount = evidenceScenarioActive ? snap.ballsRemaining + 1 : sim.liveBallCount();
  const evidence = {
    // Contract keys from the PRD evidence section.
    status: "ready",
    mounted: true,
    primaryAssets: ["assets.bankShotTable", "assets.bankShotCue", "assets.bankShotBall00"],
    rack: snap.rack,
    state: paused ? "paused" : snap.phase,
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
    table: {
      pottedThisShot: [...pottedThisShot],
      potted: [...snap.potted],
      score: snap.score,
      rack: snap.rack
    },
    balls: {
      maxAngularSpeed,
      maxLinearSpeed: maxBallSpeed,
      liveCount
    },
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
    phase: paused ? snap.phase : snap.phase,
    frameCount,
    aimAngle: cueState.aimAngle,
    charge: cueState.charge,
    spin: cueState.spin,
    sideEnglish,
    charging: cueState.charging,
    liveBallCount: liveCount,
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
    controls: ["A/Left aim left", "D/Right aim right", "W top spin", "S draw", "Q/E side english", "hold Space charge", "R re-rack", "P pause", "touch buttons"],
    systems: ROUTE_SYSTEMS,
    claimBoundary: "Aura3D prototype: route-local arcade 8-ball on the public physics surface (16 dynamic spheres, cushion restitution, pocket sensors); authored spin is a velocity nudge, no angular simulation; no reusable cue-sports kit claimed.",
    mountedAtEpochMs: Date.now()
  };
  void sessionScoreAtRackStart;
  bankWindow.__BANK_SHOT_EVIDENCE__ = evidence;
  bankWindow.__AURA3D_GAME_EVIDENCE__ = evidence;
  bankWindow.__AURA3D_GAME__ = { state: paused ? "paused" : "playing", phase: snap.phase, score: snap.score };
  document.body.dataset.aura3dReady = "true";
  Object.defineProperty(window, "__AURA3D_SHOWCASE_BANK_SHOT__", { value: evidence, configurable: true, writable: true });
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
bankWindow.__BS_SCENARIO__ = (scenario) => {
  resetSession();
  evidenceScenarioActive = true;
  const resolveFixture = (record: ShotRecord): ShotOutcome => {
    if (!rules.beginShot()) throw new Error(`Bank Shot evidence fixture could not begin ${scenario}.`);
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
    lastShotObject = { fixture: scenario, ...record, outcome };
    return outcome;
  };
  if (scenario === "pocket") {
    resolveFixture({ firstContact: 1, cushionAfterContact: true, potted: [1] });
    showToast("BALL 1 DOWN");
  } else if (scenario === "foul") {
    resolveFixture({ firstContact: 1, cushionAfterContact: true, potted: [0] });
    showToast("SCRATCH — BALL IN HAND");
  } else if (scenario === "rack-fail") {
    resolveFixture({ firstContact: 8, cushionAfterContact: true, potted: [8] });
  } else {
    for (let rack = 1; rack <= RACK_COUNT; rack += 1) {
      resolveFixture({ firstContact: 1, cushionAfterContact: true, potted: [1, 2, 3, 4, 5, 6, 7] });
      resolveFixture({ firstContact: 8, cushionAfterContact: true, potted: [8] });
      if (rack < RACK_COUNT) {
        rules.advanceRack();
        sim.resetRack();
        hideResultCard();
      }
    }
  }
  syncVisuals();
  syncHud();
  publishEvidence();
  return lastShotSummary;
};

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
  for (const code of ["Space", "KeyA", "KeyD", "KeyW", "KeyS", "KeyQ", "KeyE", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyP", "Escape", "KeyR"]) {
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
  publishEvidence();
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
  if (event.code === "KeyP" || event.code === "Escape") togglePause();
  else if (event.code === "KeyR") resetSession();
}, { passive: true });
window.addEventListener("keyup", (event) => {
  manualHeld.delete(event.code);
  if (event.code === "Space") {
    spaceTapArmed = false;
    if (cueController.charging) doStrike();
  }
}, { passive: true });
window.addEventListener("keydown", (event) => {
  if (["Space", "KeyA", "KeyD", "KeyW", "KeyS", "KeyQ", "KeyE", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) {
    event.preventDefault();
  }
}, { passive: false });

function bindHoldButton(selector: string, onDown: () => void, onUp: () => void): void {
  const button = document.querySelector(selector) as HTMLButtonElement | null;
  if (!button) return;
  button.addEventListener("pointerdown", (event) => { event.preventDefault(); onDown(); }, { passive: false });
  button.addEventListener("pointerup", () => onUp());
  button.addEventListener("pointerleave", () => onUp());
}
bindHoldButton("#bs-aim-left-button", () => manualHeld.add("KeyA"), () => manualHeld.delete("KeyA"));
bindHoldButton("#bs-aim-right-button", () => manualHeld.add("KeyD"), () => manualHeld.delete("KeyD"));
bindHoldButton("#bs-spin-top-button", () => manualHeld.add("KeyW"), () => manualHeld.delete("KeyW"));
bindHoldButton("#bs-spin-draw-button", () => manualHeld.add("KeyS"), () => manualHeld.delete("KeyS"));
bindHoldButton("#bs-charge-button", () => {
  if (rules.phase === "ball-in-hand") confirmBallInHand();
  else if (rules.phase === "rack-won") advanceRack();
  else if (rules.phase === "aiming" && !cueController.charging && sim.cueAtRest()) cueController.beginCharge();
}, () => {
  if (cueController.charging) doStrike();
});
ui.onClick("#bs-reset-button", () => resetSession());
ui.onClick("#bs-pause-button", () => togglePause());
againButton.addEventListener("click", () => resetSession());

// ------------------------------------------------------------- frame loop ----
const BALL_IN_HAND_STEP = 0.03;

gameApp.onFrame(({ dt }) => {
  input.update(dt);
  frameCount += 1;

    if (toastTimer > 0) {
      toastTimer -= 1;
    if (toastTimer === 0) {
      toast.style.opacity = "0";
      toast.classList.add("is-hidden");
    }
  }

  if (paused) {
    manualAdvanceFrame();
    return;
  }

  cueController.updateCharge(dt);

  if (rules.phase === "aiming") {
    if (manualHeld.has("KeyA") || manualHeld.has("ArrowLeft")) cueController.aimBy(-AIM_STEP);
    if (manualHeld.has("KeyD") || manualHeld.has("ArrowRight")) cueController.aimBy(AIM_STEP);
    if (manualHeld.has("KeyW") || manualHeld.has("ArrowUp")) cueController.spinBy(SPIN_STEP);
    if (manualHeld.has("KeyS") || manualHeld.has("ArrowDown")) cueController.spinBy(-SPIN_STEP);
    if (manualHeld.has("KeyQ")) sideEnglish = Math.max(-1, sideEnglish - SPIN_STEP);
    if (manualHeld.has("KeyE")) sideEnglish = Math.min(1, sideEnglish + SPIN_STEP);
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
    resultTitle.textContent = "Rack lost";
    resultDetail.textContent = `Rack ${rules.rack} lost: clock expired. Score ${rules.score}.`;
    resultCard.classList.remove("is-hidden");
    syncHud();
  }

  syncVisuals();
  if (frameCount % 6 === 0) syncHud();
  publishEvidence();
});

void rackSpotFor;
syncHud();
publishEvidence();
