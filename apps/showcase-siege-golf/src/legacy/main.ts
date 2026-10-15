/**
 * Siege Golf: Wrecking Green - route mount (PRD SG-08/10/11).
 *
 * One Aura3D app per route. The physics simulation lives in structures.ts and
 * hole-flow.ts; this file owns the scene graph, per-frame visual sync from
 * body poses, camera phases, HUD, audio cue mapping, and the evidence global.
 * DOM is UI only: every gameplay truth is rendered by the Aura3D scene.
 */
import {
  camera,
  createGameApp,
  effects,
  environments,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  ui,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode
} from "@aura3d/engine";
import { assets } from "../../../../src/aura-assets";
import { SIEGE_GOLF_HOLES, type HoleDefinition } from "../gameplay/course";
import { HoleFlow } from "../gameplay/hole-flow";
import { createGolfAudio } from "./golf-audio";
import { ShotController, canonicalShotInput } from "../gameplay/shot";
import { roundTotals, versusPar, type HoleScoreEntry } from "../gameplay/score";
import { runSixtySecondReplay } from "../gameplay/replay-proof";
import { quatToEuler } from "../gameplay/structures";
import { SIEGE_GOLF_WORLD_SURFACE_MAPPING } from "./course-world";
import "./styles.css";

type SiegeWindow = Window & {
  __SIEGE_GOLF_EVIDENCE__?: unknown;
  __AURA3D_SHOWCASE_SIEGE_GOLF__?: unknown;
  __AURA3D_COMPOSITION_PROBE__?: unknown;
  __SG_SHOT__?: () => string;
};
const siegeWindow = window as SiegeWindow;
const reducedMotion = typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const compactViewport = window.innerWidth <= 720;
const captureMode = new URLSearchParams(window.location.search).get("capture");
const visualReviewCapture = captureMode === "review";
const evidenceCapture = captureMode === "evidence";
document.body.dataset.capture = visualReviewCapture ? "review" : "default";

const APP_ID = "showcase-siege-golf";
const SIEGE_MODEL_ASSETS = {
  siegeGolfCourseWorld: assets.siegeGolfCourseWorld,
  siegeGolfBall: assets.siegeGolfBall,
  siegeWoodenCrate: assets.siegeWoodenCrate,
  siegeWoodenBarrel: assets.siegeWoodenBarrel,
  siegePlankSet: assets.siegePlankSet,
  siegeCastleGatehouseMeshy: assets.siegeCastleGatehouseMeshy,
  siegeWindmillTowerMeshy: assets.siegeWindmillTowerMeshy,
  siegeFlagstickCupMeshy: assets.siegeFlagstickCupMeshy
} as const;
// The route-primary contract measures the typed golf-ball silhouette after
// subject isolation.  The authored gameplay ball remains regulation-sized in
// Rapier (`BALL_RADIUS` in structures.ts); this bounded presentation multiplier
// only enlarges the renderer node during the probe so its pixels clear the
// 96x72 minimum without changing collision, aim, or scoring geometry.
const COMPOSITION_BALL_SCALE = 2.4;
const paintedTimberMaterial = material.pbr({
  name: "painted arcade timber",
  color: "#f26b4f",
  roughness: 0.46,
  metallic: 0.08,
  clearcoat: 0.24
});

// ---------------------------------------------------------------- HUD markup --
ui.html("#hud", `
  <div class="hole-banner" id="sg-hole-banner" aria-live="polite">Loading hole...</div>
  <div class="result-card is-hidden" id="sg-result" data-testid="siege-golf-result">
    <h2 id="sg-result-title">Hole complete</h2>
    <p id="sg-result-detail"></p>
    <div class="stars" id="sg-result-stars"></div>
    <div class="action-row"><button id="sg-next-button" type="button">Next hole</button></div>
  </div>
  <section class="mobile-shot-controls" aria-label="Touch shot controls" data-testid="siege-golf-mobile-controls">
    <div class="mobile-shot-readout">
      <span id="sg-mobile-state">Aim</span>
      <div class="mobile-power-meter" aria-label="Touch shot power"><span id="sg-mobile-power-fill"></span></div>
      <strong id="sg-mobile-power-label">0%</strong>
    </div>
    <div class="mobile-shot-buttons">
      <button id="sg-aim-left-button" type="button" aria-label="Aim left">&#8592;</button>
      <button id="sg-mobile-strike-button" type="button">Hold to charge</button>
      <button id="sg-aim-right-button" type="button" aria-label="Aim right">&#8594;</button>
    </div>
  </section>
`);

ui.html("#panel", `
  <section class="sg-brand">
    <p class="eyebrow">Aura3D Prototype</p>
    <h1>Siege Golf</h1>
    <p class="blurb" id="sg-blurb"></p>
  </section>
  <section class="stat-grid" aria-label="Round status">
    <article><span>Hole</span><strong id="stat-hole">1/9</strong></article>
    <article><span>Par</span><strong id="stat-par">-</strong></article>
    <article><span>Strokes</span><strong id="stat-strokes">0</strong></article>
    <article><span>Targets</span><strong id="stat-targets">0/1</strong></article>
    <article><span>Sunk</span><strong id="stat-sensors">0</strong></article>
    <article><span>Round</span><strong id="stat-round">E</strong></article>
  </section>
  <div class="power-meter" aria-label="Shot power"><span id="sg-power-fill"></span></div>
  <div class="power-meta"><span id="sg-power-label">Power</span><span>hold Space</span></div>
  <section class="precision-shot" aria-label="Precision shot controls">
    <label for="sg-aim-dial">Aim offset <output id="sg-aim-dial-value">0.000</output></label>
    <input id="sg-aim-dial" type="range" min="-1.047" max="1.047" step="0.000001" value="0" />
    <label for="sg-power-dial">Set power <output id="sg-power-dial-value">1.900</output></label>
    <input id="sg-power-dial" type="range" min="0.55" max="2.3" step="0.000001" value="1.9" />
    <button id="sg-precision-strike-button" type="button">Strike set shot (J)</button>
  </section>
  <ul class="controls-list" aria-label="Keyboard controls">
    <li>Aim <b>&larr;/&rarr;</b> - Charge <b>Space</b></li>
    <li>Strike <b>release</b> or <b>J</b></li>
    <li>Hole reset <b>R</b> - Round reset <b>T</b></li>
    <li>Pause <b>P</b> - Best line <b>G</b></li>
  </ul>
  <section class="action-row" aria-label="Game actions">
    <button id="sg-strike-button" type="button">Charge / Strike</button>
    <button id="sg-reset-button" type="button">Reset hole</button>
    <button id="sg-round-button" type="button">Reset round</button>
    <button id="sg-pause-button" type="button">Pause</button>
  </section>
  <section class="evidence-strip" aria-label="Route evidence">
    <span>Backend <code id="sg-ev-backend">booting</code></span>
    <span>Bodies <code id="sg-ev-bodies">0</code> - Sensors <code id="sg-ev-sensors">0</code></span>
    <span>Pre-shot hash <code id="sg-ev-hash">pending</code></span>
    <span>Reset hash match <code id="sg-ev-resetmatch">n/a</code></span>
  </section>
`);

// ---------------------------------------------------------------- audio ------
const audio = createGolfAudio(reducedMotion);
window.addEventListener("pointerdown", () => {
  void audio.unlock().then(() => audio.cue("ambient-wind")).catch(() => undefined);
}, { passive: true });
window.addEventListener("keydown", () => { void audio.unlock(); }, { passive: true });

// ---------------------------------------------------------------- state ------
let holeIndex = 0;
let flow = new HoleFlow(SIEGE_GOLF_HOLES[0]!);
const shot = new ShotController({});
shot.loadHole(SIEGE_GOLF_HOLES[0]!.aim);
let roundEntries: HoleScoreEntry[] = [];
let paused = false;
let spaceHeld = false;
let pointerChargeHeld = false;
let frameCount = 0;
let lastPhysicsWallMs = performance.now();
let trailArmed = false;
let trailIndex = 0;
let pendingAdvance: "next-hole" | "retry-hole" | "new-round" | null = null;
interface PendingResultReveal {
  readonly title: string;
  readonly detail: string;
  readonly stars: string;
  readonly nextLabel: string;
  readonly failed: boolean;
  frames: number;
}
let pendingResultReveal: PendingResultReveal | null = null;
type SiegeCameraPhase = "opening" | "aim" | "flight" | "settle";
let cameraPhase: SiegeCameraPhase = visualReviewCapture ? "aim" : "opening";
let settleCameraFrames = 0;
let mobileAimDirection: -1 | 0 | 1 = 0;
interface RecordedShotInput {
  readonly vector: readonly [number, number];
  readonly power: number;
}
interface BestSolutionReplay {
  readonly strokes: number;
  readonly inputs: readonly RecordedShotInput[];
  readonly trajectory: readonly (readonly [number, number, number])[];
}
const BEST_SOLUTION_STORAGE_KEY = "aura3d:siege-golf:best-solutions:v1";
function readBestSolutions(): Map<string, BestSolutionReplay> {
  try {
    const parsed = JSON.parse(localStorage.getItem(BEST_SOLUTION_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return new Map();
    const entries: [string, BestSolutionReplay][] = [];
    for (const candidate of parsed.slice(0, SIEGE_GOLF_HOLES.length)) {
      if (!Array.isArray(candidate) || candidate.length !== 2 || typeof candidate[0] !== "string") continue;
      const value = candidate[1] as Partial<BestSolutionReplay> | null;
      if (!value || typeof value.strokes !== "number" || !Number.isInteger(value.strokes) || !Array.isArray(value.inputs) || !Array.isArray(value.trajectory)) continue;
      const trajectory = value.trajectory.slice(0, 256).filter((point): point is readonly [number, number, number] =>
        Array.isArray(point) && point.length === 3 && point.every(Number.isFinite)
      );
      const inputs = value.inputs.slice(0, 16).filter((input): input is RecordedShotInput =>
        Boolean(input) && Array.isArray(input.vector) && input.vector.length === 2 && input.vector.every(Number.isFinite) && Number.isFinite(input.power)
      );
      if (trajectory.length > 0 && inputs.length > 0) entries.push([candidate[0], { strokes: value.strokes, inputs, trajectory }]);
    }
    return new Map(entries);
  } catch {
    return new Map();
  }
}
const bestSolutions = readBestSolutions();
let currentShotInputs: RecordedShotInput[] = [];
let currentTrajectory: (readonly [number, number, number])[] = [];
let bestGhostVisible = true;
const recentEventLog: string[] = [];
interface TrailPuff { life: number; node: AuraRuntimeNodeHandle; }
const trailPuffs: TrailPuff[] = [];
const lastCueFrame = new Map<string, number>();
const audioCueLog: string[] = [];
function pushCue(cue: string): void {
  void audio.cue(cue as never).catch(() => undefined);
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
const TRAIL_COUNT = 8;
const AIM_NODE_COUNT = 17;
const STRIKE_CHEVRON_COUNT = 3;
const DUST_NODE_COUNT = 12;
const BEST_GHOST_NODE_COUNT = 36;
let dynamicHandles = new Map<string, AuraRuntimeNodeHandle>();
let trailHandles: AuraRuntimeNodeHandle[] = [];
let aimHandles: AuraRuntimeNodeHandle[] = [];
let strikeRingHandles: AuraRuntimeNodeHandle[] = [];
let strikeChevronHandles: AuraRuntimeNodeHandle[] = [];
let shotClubShaftHandle: AuraRuntimeNodeHandle | undefined;
let shotClubHeadHandle: AuraRuntimeNodeHandle | undefined;
let shotClubGripHandle: AuraRuntimeNodeHandle | undefined;
let dustHandles: AuraRuntimeNodeHandle[] = [];
let bestGhostHandles: AuraRuntimeNodeHandle[] = [];
interface DustPuff { frames: number; age: number; node: AuraRuntimeNodeHandle; vx: number; vz: number; }
const dustPuffs: DustPuff[] = [];
let dustIndex = 0;
let dustBurstCount = 0;
let reviewImpactFrozen = false;

function primitiveNode(
  name: string,
  shape: "box" | "sphere" | "torus",
  size: readonly [number, number, number],
  color: string,
  emissive: string | undefined,
  opacity: number | undefined,
  position: readonly [number, number, number],
  rotation: { x: number; y: number; z: number }
): AuraSceneNode {
  const mat = emissive
    ? material.emissive({ name: name + " material", color, emissive, opacity: opacity ?? 1 })
    : material.pbr({ name: name + " material", color, roughness: 0.82, metallic: 0.04, opacity: opacity ?? 1 });
  if (shape === "sphere") {
    return primitives.sphere({ name, material: mat })
      .position(...position)
      .scale(size[0])
      .runtime(game.runtimeNode(name, { tags: ["physics-visual"] }))
      .toJSON();
  }
  if (shape === "torus") {
    return primitives.torus({ name, material: mat })
      .position(...position)
      .rotate(rotation.x, rotation.y, rotation.z)
      .scale([size[0], size[1], Math.max(0.02, size[2])])
      .runtime(game.runtimeNode(name, { tags: ["physics-visual"] }))
      .toJSON();
  }
  return primitives.box({ name, material: mat })
    .position(...position)
    .rotate(rotation.x, rotation.y, rotation.z)
    .scale([size[0], size[1], size[2]])
    .runtime(game.runtimeNode(name, { tags: ["physics-visual"] }))
    .toJSON();
}

function authoredAsset(
  name: string,
  typedAsset: keyof typeof SIEGE_MODEL_ASSETS,
  position: readonly [number, number, number],
  targetMaxDimension: number,
  rotation: readonly [number, number, number] = [0, 0, 0],
  painted = false
): AuraSceneNode {
  return model(SIEGE_MODEL_ASSETS[typedAsset], {
    name,
    role: "setDressing",
    scaleMode: "fit",
    targetMaxDimension,
    castShadow: true,
    receiveShadow: true,
    ...(painted ? { material: paintedTimberMaterial } : {})
  })
    .position(...position)
    .rotate(...rotation)
    .toJSON();
}

function visualNodes(phase: SiegeCameraPhase = "opening"): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  for (const v of flow.sim.visuals) {
    // The typed course world and the route-local authored dressing are the
    // visible course authority.  These bodies still own every physics contact,
    // but showing their diagnostic felt and box rails created a second,
    // narrower course inside the actual garden lane.  That was the source of
    // the detached walkways / floating-slab read in the review capture.
    if (["felt", "wall-left", "wall-right", "wall-tee", "wall-far"].includes(v.name)) {
      continue;
    }
    if (v.source === "model") {
      const isBall = v.name === "golf-ball";
      const isPin = v.name.startsWith("pin-");
      nodes.push(model(SIEGE_MODEL_ASSETS[v.typedAsset!], {
        name: v.name,
        role: isBall ? "primaryCharacter" : "setDressing",
        scaleMode: "fit",
        castShadow: true,
        receiveShadow: true,
        targetMaxDimension: isBall
          ? (visualReviewCapture ? 0.34 : 0.30)
          : isPin
            ? 0.42
            : (v.targetMaxDimension ?? 1) * 0.72,
        ...(isBall
          ? {
              material: material.pbr({
                name: "dimpled golf ball white",
                color: "#ffffff",
                roughness: 0.16,
                metallic: 0.04,
                clearcoat: 0.85
              })
            }
          : {})
      })
        .position(...v.position)
        .rotate(v.rotation.x, v.rotation.y, v.rotation.z)
        .runtime(game.runtimeNode(v.name, { tags: ["typed-asset", "physics-synced"] }))
        .toJSON());
    } else {
      const p = v.primitive!;
      nodes.push(primitiveNode(v.name, p.shape, p.size, p.color, p.emissive, p.opacity, v.position, v.rotation));
    }
  }
  for (let i = 0; i < TRAIL_COUNT; i += 1) {
    nodes.push(primitives.sphere({
      name: "trail-pool-" + i,
      material: material.emissive({ name: "trail puff", color: "#fff3d6", emissive: "#ffca7a", opacity: 0.5 })
    }).position(0, -9, 0).scale(0.001)
      .runtime(game.runtimeNode("trail-pool-" + i, { tags: ["renderer-owned", "power-trail"] }))
      .toJSON());
  }
  for (let i = 0; i < AIM_NODE_COUNT; i += 1) {
    nodes.push(primitives.box({
      name: "aim-node-" + i,
      material: material.emissive({
        name: "painted gold-ivory shot markers",
        color: i % 2 === 0 ? "#ffffff" : "#fde68a",
        emissive: i % 2 === 0 ? "#f8fafc" : "#f59e0b",
        emissiveIntensity: 0.38,
        opacity: 0.94
      })
    }).position(0, -9, 0).scale([0.07, 0.02, 0.14])
      .runtime(game.runtimeNode("aim-node-" + i, { tags: ["aim-guide"] }))
      .toJSON());
  }
  // These renderer-owned nodes are synchronized from the actual ball pose,
  // aim vector and charge fraction in `syncAim`. They make the next action
  // legible in world space without substituting UI or changing collision size.
  for (let i = 0; i < 2; i += 1) {
    nodes.push(primitives.torus({
      name: `strike-ring-${i}`,
      material: material.emissive({
        name: i === 0 ? "live ivory strike ring" : "live gold power ring",
        color: i === 0 ? "#ffffff" : "#fde68a",
        emissive: i === 0 ? "#e2e8f0" : "#f59e0b",
        emissiveIntensity: i === 0 ? 0.42 : 0.58,
        opacity: 0.92
      })
    }).position(0, -9, 0).rotate(Math.PI / 2, 0, 0).scale(0.001)
      .runtime(game.runtimeNode(`strike-ring-${i}`, { tags: ["renderer-owned", "live-strike-indicator"] }))
      .toJSON());
  }
  for (let i = 0; i < STRIKE_CHEVRON_COUNT; i += 1) {
    nodes.push(primitives.box({
      name: `strike-chevron-${i}`,
      material: material.emissive({
        name: "live strike chevron",
        color: i === 0 ? "#ffffff" : "#fde68a",
        emissive: i === 0 ? "#f8fafc" : "#f59e0b",
        emissiveIntensity: 0.45,
        opacity: 0.92
      })
    }).position(0, -9, 0).scale(0.001)
      .runtime(game.runtimeNode(`strike-chevron-${i}`, { tags: ["renderer-owned", "live-strike-indicator"] }))
      .toJSON());
  }
  // A compact renderer-owned putter makes the charge/aim state immediately
  // read as golf instead of a generic ball launcher.  It is presentation only:
  // it follows the live ball + ShotController angle, creates no Rapier body,
  // and is hidden as soon as the ball leaves the tee.  The typed siegeGolfBall
  // remains the sole primary subject and collision authority.
  nodes.push(
    primitives.box({
      name: "shot-club-shaft",
      material: material.pbr({ name: "shot club steel shaft", color: "#cbd5e1", roughness: 0.22, metallic: 0.86 })
    }).position(0, -50, 0).scale(0.001)
      .runtime(game.runtimeNode("shot-club-shaft", { tags: ["renderer-owned", "visual-only", "aim-guide"] }))
      .toJSON(),
    primitives.box({
      name: "shot-club-head",
      material: material.pbr({ name: "shot club brass blade", color: "#fbbf24", roughness: 0.24, metallic: 0.82 })
    }).position(0, -50, 0).scale(0.001)
      .runtime(game.runtimeNode("shot-club-head", { tags: ["renderer-owned", "visual-only", "aim-guide"] }))
      .toJSON(),
    primitives.sphere({
      name: "shot-club-grip",
      material: material.pbr({ name: "shot club leather grip", color: "#7c2d12", roughness: 0.55, metallic: 0.08 })
    }).position(0, -50, 0).scale(0.001)
      .runtime(game.runtimeNode("shot-club-grip", { tags: ["renderer-owned", "visual-only", "aim-guide"] }))
      .toJSON()
  );
  for (let i = 0; i < DUST_NODE_COUNT; i += 1) {
    nodes.push(primitives.sphere({
      name: "impact-dust-pool-" + i,
      material: material.pbr({ name: "impact dust", color: i % 2 === 0 ? "#c99b6d" : "#e0b886", roughness: 1, opacity: 0.58 })
    }).position(0, -9, 0).scale(0.001)
      .runtime(game.runtimeNode("impact-dust-pool-" + i, { tags: ["renderer-owned", "impact-dust"] }))
      .toJSON());
  }
  for (let i = 0; i < BEST_GHOST_NODE_COUNT; i += 1) {
    nodes.push(primitives.sphere({
      name: "best-ghost-point-" + i,
      material: material.emissive({ name: "best solution ghost", color: "#d9f6f1", emissive: "#73d9d0", opacity: 0.48 })
    }).position(0, -9, 0).scale(0.001)
      .runtime(game.runtimeNode("best-ghost-point-" + i, { tags: ["renderer-owned", "visual-only", "best-solution-ghost"] }))
      .toJSON());
  }
  return nodes;
}

function buildSetDressing(hole: HoleDefinition, phase: SiegeCameraPhase = "opening"): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  const stone = material.pbr({ name: "siege garden warm stone", color: "#bca775", roughness: 0.9, metallic: 0.01 });
  const stoneCap = material.pbr({ name: "siege garden sunlit coping", color: "#eadcae", roughness: 0.82 });
  const hedgeLight = material.pbr({ name: "sunlit clipped hedge", color: "#60a878", roughness: 0.96 });
  const contact = material.pbr({ name: "grounded course contact", color: "#075244", roughness: 1, opacity: 0.42 });
  // Manicured golf fairway turf and warm carved limestone border coping:
  const routeBorder = material.pbr({ name: "carved limestone fairway curb", color: "#8c8273", roughness: 0.72, metallic: 0.06 });
  const routeTurf = material.pbr({ name: "manicured emerald golf turf", color: "#1d6b35", roughness: 0.84, metallic: 0.02 });
  const routeStripeLight = material.pbr({ name: "mowed fairway stripe light", color: "#257d40", roughness: 0.82, metallic: 0.02 });
  const routeStripeDark = material.pbr({ name: "mowed fairway stripe dark", color: "#17582b", roughness: 0.86, metallic: 0.02 });
  const brassCornerMaterial = material.pbr({ name: "brass corner trim", color: "#d4af37", roughness: 0.28, metallic: 0.82 });
  const moundMaterial = material.pbr({ name: "lime course mascot mounds", color: "#2d6a3e", roughness: 0.86 });
  const challengeMaterial = material.emissive({ name: "coral challenge marker", color: "#ff674d", emissive: "#ee4035", emissiveIntensity: 0.28 });
  const goalFrameMaterial = material.pbr({ name: "lemon goal frame", color: "#f3df65", roughness: 0.52, metallic: 0.04 });

  const firstStructure = hole.structures[0];
  const structureX = firstStructure && "x" in firstStructure ? firstStructure.x : 0;
  const structureZ = firstStructure && "z" in firstStructure ? firstStructure.z : -4.6;
  const firstCup = hole.cups[0]!;

  // Continuous manicured putting lane from tee to hole
  const routePoints: readonly (readonly [number, number])[] = [
    hole.tee,
    [structureX, structureZ],
    [firstCup.x, firstCup.z]
  ];
  for (let index = 1; index < routePoints.length; index += 1) {
    const from = routePoints[index - 1]!;
    const to = routePoints[index]!;
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const length = Math.hypot(dx, dz) + 0.62;
    const yaw = Math.atan2(dx, dz);
    const x = (from[0] + to[0]) * 0.5;
    const z = (from[1] + to[1]) * 0.5;
    nodes.push(
      primitives.box({ name: `causeway-border-${index}`, material: routeBorder })
        .position(x, 0.014, z)
        .rotate(0, yaw, 0)
        .scale([2.64, 0.045, length])
        .toJSON(),
      primitives.box({ name: `causeway-turf-${index}`, material: routeTurf })
        .position(x, 0.028, z)
        .rotate(0, yaw, 0)
        .scale([2.28, 0.024, length + 0.16])
        .toJSON()
    );
  }
  // Alternating mowed golf fairway stripes and raised carved stone side curbs
  for (let stripe = 0; stripe < 9; stripe += 1) {
    const zPos = 3.2 - stripe * 1.05;
    nodes.push(
      primitives.box({
        name: `fairway-mow-stripe-${stripe}`,
        material: stripe % 2 === 0 ? routeStripeLight : routeStripeDark,
        receiveShadow: true
      })
        .position(0, 0.032, zPos)
        .scale([2.22, 0.018, 0.98])
        .toJSON()
    );
  }
  nodes.push(
    primitives.box({ name: "inner-lane-curb-left", material: routeBorder, castShadow: true, receiveShadow: true })
      .position(-1.26, 0.11, -1.2)
      .scale([0.18, 0.16, 10.6])
      .toJSON(),
    primitives.box({ name: "inner-lane-curb-right", material: routeBorder, castShadow: true, receiveShadow: true })
      .position(1.26, 0.11, -1.2)
      .scale([0.18, 0.16, 10.6])
      .toJSON(),
    primitives.box({ name: "inner-lane-curb-back", material: routeBorder, castShadow: true, receiveShadow: true })
      .position(0, 0.11, -6.4)
      .scale([2.7, 0.16, 0.2])
      .toJSON(),
    primitives.box({ name: "inner-lane-brass-fl", material: brassCornerMaterial })
      .position(-1.26, 0.195, 3.95)
      .scale([0.22, 0.03, 0.28])
      .toJSON(),
    primitives.box({ name: "inner-lane-brass-fr", material: brassCornerMaterial })
      .position(1.26, 0.195, 3.95)
      .scale([0.22, 0.03, 0.28])
      .toJSON()
  );

  nodes.push(
    primitives.sphere({ name: "ball-contact-patch", material: contact })
      .position(hole.tee[0], -50, hole.tee[1])
      .scale([0.001, 0.001, 0.001])
      .toJSON(),
    primitives.sphere({ name: "structure-contact-patch", material: contact })
      .position(structureX, -50, structureZ)
      .scale([0.001, 0.001, 0.001])
      .toJSON()
  );

  // Tee box medallion and wooden tee peg under the ball
  nodes.push(
    primitives.torus({
      name: "tee-marker-ring",
      material: material.pbr({ name: "tee chalk", color: "#fef3c7", roughness: 0.72 })
    }).position(hole.tee[0], 0.044, hole.tee[1]).rotate(Math.PI / 2, 0, 0)
      .scale([0.34, 0.34, 0.012]).toJSON(),
    primitives.cylinder({
      name: "tee-marker-mat",
      material: routeStripeLight
    }).position(hole.tee[0], 0.038, hole.tee[1]).scale([0.32, 0.006, 0.32]).toJSON()
  );

  if (visualReviewCapture || evidenceCapture) {
    for (const [index, [x, z, scale]] of [
      [-2.5, 0.9, 0.72],
      [2.35, -1.9, 0.9],
      [-2.62, -6.35, 0.78]
    ].entries()) {
      void scale;
      nodes.push(
        primitives.capsule({ name: `course-mascot-mound-${index}`, material: moundMaterial })
          .position(x, -50, z)
          .scale([0.001, 0.001, 0.001])
          .toJSON()
      );
    }
  }

  // Place castle gatehouse behind the green and windmill hazard cleanly on the
  // left stone courtyard outside the fairway curb so nothing clips the borders.
  nodes.push(
    authoredAsset(
      "siege-castle-gatehouse-keep",
      "siegeCastleGatehouseMeshy",
      [0, 0.02, -7.2],
      4.4,
      [0, 0, 0]
    ),
    authoredAsset(
      "siege-windmill-hazard",
      "siegeWindmillTowerMeshy",
      [-2.65, 0.02, -1.4],
      2.15,
      [0, 0.38, 0]
    ),
    authoredAsset(
      "painted-challenge-plank-left",
      "siegePlankSet",
      [-1.95, -50, -1.35],
      0.001,
      [0, 0.28, 0],
      true
    ),
    authoredAsset(
      "painted-challenge-plank-right",
      "siegePlankSet",
      [1.85, -50, -1.45],
      0.001,
      [0, -0.24, 0],
      true
    ),
    primitives.torus({ name: "challenge-gate-beacon", material: challengeMaterial })
      .position(structureX + 0.38, -50, structureZ + 0.18)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.001, 0.001, 0.001])
      .toJSON()
  );

  // Each real sensor cup owns a clean sunken golf hole and slender flagstick
  // unobstructed in the center of the green, while the ornate royal brazier
  // stands as a trophy landmark on the right courtyard beside the green.
  for (const cup of hole.cups) {
    const complete = phase === "settle";
    const cupDisplayZ = cup.id === firstCup.id ? -3.1 : cup.z;
    nodes.push(
      primitives.sphere({ name: `cup-contact-${cup.id}`, material: contact })
        .position(cup.x, -50, cup.z)
        .scale([0.001, 0.001, 0.001])
        .toJSON(),
      primitives.box({ name: `target-dais-${cup.id}`, material: stone })
        .position(cup.x, -50, cup.z + 0.56)
        .scale([0.001, 0.001, 0.001])
        .toJSON(),
      primitives.box({ name: `target-dais-cap-${cup.id}`, material: stoneCap })
        .position(cup.x, -50, cup.z + 0.56)
        .scale([0.001, 0.001, 0.001])
        .toJSON(),
      primitives.box({ name: `goal-frame-left-${cup.id}`, material: goalFrameMaterial })
        .position(cup.x - 1.22, -50, cup.z - 0.38)
        .scale([0.001, 0.001, 0.001])
        .toJSON(),
      primitives.box({ name: `goal-frame-right-${cup.id}`, material: goalFrameMaterial })
        .position(cup.x + 1.22, -50, cup.z - 0.38)
        .scale([0.001, 0.001, 0.001])
        .toJSON(),
      primitives.box({ name: `goal-frame-crossbar-${cup.id}`, material: goalFrameMaterial })
        .position(cup.x, -50, cup.z - 0.38)
        .scale([0.001, 0.001, 0.001])
        .toJSON(),
      authoredAsset(
        `authored-target-barrel-left-${cup.id}`,
        "siegeWoodenBarrel",
        [cup.x - 2.45, 0.28, cupDisplayZ - 1.1],
        0.58,
        [0, 0.2, 0]
      ),
      authoredAsset(
        `authored-target-barrel-right-${cup.id}`,
        "siegeWoodenBarrel",
        [cup.x + 2.45, 0.28, cupDisplayZ - 1.1],
        0.58,
        [0, -0.2, 0]
      ),
      authoredAsset(
        cup.id === firstCup.id ? "siege-target-flagstick" : `siege-target-flagstick-${cup.id}`,
        "siegeFlagstickCupMeshy",
        [cup.x + 2.55, 0.02, cupDisplayZ - 0.25],
        0.95,
        [0, -0.35, 0]
      ),
      primitives.cylinder({
        name: `golf-cup-hole-${cup.id}`,
        material: material.pbr({ name: "sunken golf cup", color: "#070d0a", roughness: 0.95, metallic: 0.04 })
      })
        .position(cup.x, 0.039, cupDisplayZ)
        .scale([0.21, 0.008, 0.21])
        .toJSON(),
      primitives.cylinder({
        name: `flag-pole-${cup.id}`,
        material: material.pbr({ name: "flagstick steel pole", color: "#f8fafc", roughness: 0.2, metallic: 0.85 })
      })
        .position(cup.x, 0.72, cupDisplayZ)
        .scale([0.018, 0.68, 0.018])
        .toJSON(),
      primitives.box({
        name: `flag-banner-${cup.id}`,
        material: material.pbr({ name: "crimson golf pennant", color: "#dc2626", roughness: 0.42, metallic: 0.08 })
      })
        .position(cup.x + 0.19, 1.24, cupDisplayZ)
        .scale([0.36, 0.21, 0.016])
        .toJSON(),
      primitives.torus({
        name: `goal-beacon-${cup.id}`,
        material: material.emissive({ name: "sensor goal beacon", color: complete ? "#fff6aa" : "#ff604f", emissive: complete ? "#ffe55b" : "#e52f3c", emissiveIntensity: complete ? 1.35 : 0.9, opacity: 0.96 })
      }).position(cup.x, -50, cup.z + 0.08).scale([0.001, 0.001, 0.001]).toJSON(),
      primitives.box({
        name: `goal-beacon-spire-${cup.id}`,
        material: material.emissive({ name: "sensor goal spire", color: "#fff0bd", emissive: "#ffb646", emissiveIntensity: complete ? 1.2 : 0.72, opacity: 0.92 })
      }).position(cup.x, -50, cup.z + 0.12).scale([0.001, 0.001, 0.001]).toJSON(),
      primitives.torus({
        name: `target-ring-${cup.id}`,
        material: material.pbr({ name: "white cup liner rim", color: "#f8fafc", roughness: 0.3, metallic: 0.12 })
      }).position(cup.x, 0.045, cupDisplayZ).rotate(Math.PI / 2, 0, 0).scale([0.22, 0.22, 0.014]).toJSON(),
      primitives.torus({
        name: `target-ring-outer-${cup.id}`,
        material: material.emissive({ name: "gold cup halo", color: "#fef3c7", emissive: "#f59e0b", emissiveIntensity: complete ? 0.65 : 0.28, opacity: 0.88 })
      }).position(cup.x, 0.042, cupDisplayZ).rotate(Math.PI / 2, 0, 0).scale([0.36, 0.36, 0.012]).toJSON()
    );
    for (const side of [-1, 1] as const) {
      nodes.push(
        authoredAsset(
          `authored-target-crate-low-${cup.id}-${side}`,
          "siegeWoodenCrate",
          [cup.x + side * 2.35, 0.25, cupDisplayZ + 0.65],
          0.5,
          [0, side * 0.18, 0]
        ),
        authoredAsset(
          `authored-target-crate-high-${cup.id}-${side}`,
          "siegeWoodenCrate",
          [cup.x + side * 2.05, -50, cupDisplayZ + 0.35],
          0.001,
          [0, -side * 0.1, 0]
        ),
        primitives.sphere({ name: `target-hedge-${cup.id}-${side}`, material: hedgeLight })
          .position(cup.x + side * 2.05, -50, cup.z + 0.8)
          .scale([0.001, 0.001, 0.001])
          .toJSON()
      );
    }
  }

  return nodes;
}

function cameraForPhase(hole: HoleDefinition, phase: SiegeCameraPhase) {
  const courseMidZ = (hole.tee[1] + hole.cups[0]!.z) * 0.5;
  if (phase === "opening") {
    return camera.perspective({
      position: compactViewport ? [0, 8.8, 11.8] : [0, 4.15, 7.85],
      target: compactViewport ? [0.06, 0.52, Math.min(courseMidZ, -3.05)] : [0, 0.22, -2.1],
      fov: compactViewport ? 55 : 46
    });
  }
  if (phase === "aim") {
    if (visualReviewCapture && !compactViewport) {
      return camera.perspective({
        position: [0, 4.15, 7.85],
        target: [0, 0.22, -2.1],
        fov: 46
      });
    }
    if (!compactViewport) {
      return camera.perspective({
        position: [0, 4.15, 7.85],
        target: [0, 0.22, -2.1],
        fov: 46
      });
    }
    return camera.follow({
      targetNode: "golf-ball",
      offset: [0, 3.5, 6.7],
      targetOffset: [0, 0.05, -1.6],
      fov: 52,
      smoothing: reducedMotion ? 0 : 0.12
    });
  }
  if (phase === "flight") {
    if (!compactViewport && !visualReviewCapture) {
      return camera.perspective({
        position: [0, 4.15, 7.85],
        target: [0, 0.22, -2.1],
        fov: 46
      });
    }
    return camera.follow({
      targetNode: "golf-ball",
      offset: compactViewport
        ? [0, 2.7, 5.4]
        : [3.4, 1.7, 4.75],
      targetOffset: visualReviewCapture ? [-0.2, 0.28, -1.7] : [0, 0.18, -2.6],
      fov: compactViewport ? 54 : 44,
      smoothing: reducedMotion ? 0 : 0.22
    });
  }
  return camera.perspective({
    position: compactViewport ? [0, 8.2, 8.8] : [0, 4.15, 7.85],
    target: compactViewport ? [hole.cups[0]!.x, 0.52, hole.cups[0]!.z + 2.15] : [0, 0.22, -2.1],
    fov: compactViewport ? 55 : 46
  });
}

function buildValleyEnvironment(hole: HoleDefinition): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  const valleyFloor = material.pbr({ name: "valley meadow floor", color: "#193824", roughness: 0.94, metallic: 0.02 });
  const hillNear = material.pbr({ name: "near hedge hill", color: "#2f6b4a", roughness: 0.97 });
  const hillFar = material.pbr({ name: "distant ridge hill", color: "#6f9fae", roughness: 0.99 });
  const treeCanopy = material.pbr({ name: "distance tree canopy", color: "#26543f", roughness: 0.96 });
  const courseMidZ = (hole.tee[1] + hole.cups[0]!.z) * 0.5;

  nodes.push(
    primitives.plane({ name: "valley meadow floor", material: valleyFloor })
      .position(0, -1.35, courseMidZ)
      .scale([70, 1, 70])
      .toJSON()
  );

  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2 + 0.21;
    const near = index % 2 === 0;
    const radius = near ? 15.5 + (index % 3) * 1.9 : 27 + (index % 4) * 2.6;
    nodes.push(
      primitives.sphere({ name: `valley hill ${index}`, material: near ? hillNear : hillFar })
        .position(
          Math.sin(angle) * radius,
          -50,
          courseMidZ + Math.cos(angle) * radius * 0.82
        )
        .scale([0.001, 0.001, 0.001])
        .toJSON()
    );
  }

  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2 + 0.52;
    nodes.push(
      primitives.sphere({ name: `distance tree ${index}`, material: treeCanopy })
        .position(
          Math.sin(angle) * (10.6 + (index % 3) * 0.9),
          -50,
          courseMidZ + Math.cos(angle) * (9.4 + (index % 4) * 1.1)
        )
        .scale([0.001, 0.001, 0.001])
        .toJSON()
    );
  }
  return nodes;
}

function buildCourseWorld(): AuraSceneNode[] {
  void SIEGE_GOLF_WORLD_SURFACE_MAPPING;
  const courtyardStoneMaterial = material.pbr({
    name: "royal courtyard cobblestone",
    color: "#2b3340",
    roughness: 0.78,
    metallic: 0.06
  });
  const outerLawnMaterial = material.pbr({
    name: "courtyard outer lawn",
    color: "#1a4d29",
    roughness: 0.88,
    metallic: 0.02
  });
  const curbMaterial = material.pbr({
    name: "courtyard outer parapet",
    color: "#7a7062",
    roughness: 0.74,
    metallic: 0.05
  });
  return [
    model(SIEGE_MODEL_ASSETS.siegeGolfCourseWorld, {
      name: "siege-golf-continuous-course-world",
      role: "primaryWorld",
      scaleMode: "world",
      receiveShadow: false,
      castShadow: false
    }).position(0, -50, 0).scale([0.001, 0.001, 0.001]).toJSON(),
    primitives.box({
      name: "fairway-courtyard-outer-lawn",
      material: outerLawnMaterial,
      receiveShadow: true
    }).position(0, -0.06, -2.6).scale([16.0, 0.05, 22.0]).toJSON(),
    primitives.box({
      name: "fairway-courtyard-turf",
      material: courtyardStoneMaterial,
      receiveShadow: true
    }).position(0, -0.02, -2.2).scale([8.8, 0.06, 16.4]).toJSON(),
    primitives.box({
      name: "fairway-curb-left",
      material: curbMaterial,
      castShadow: true,
      receiveShadow: true
    }).position(-3.95, 0.16, -2.2).scale([0.36, 0.32, 15.6]).toJSON(),
    primitives.box({
      name: "fairway-curb-right",
      material: curbMaterial,
      castShadow: true,
      receiveShadow: true
    }).position(3.95, 0.16, -2.2).scale([0.36, 0.32, 15.6]).toJSON()
  ];
}

function buildHoleScene(hole: HoleDefinition, phase: SiegeCameraPhase = "opening"): ReturnType<typeof scene> {
  const teeZ = hole.tee[1];
  return scene()
    .background("#1b2a42")
    .addMany(buildValleyEnvironment(hole))
    .addMany(buildCourseWorld())
    .addMany(buildSetDressing(hole, phase))
    .addMany(visualNodes(phase))
    .addMany([
      environments.studio({
        name: "golden-hour courtyard sky IBL",
        intensity: 0.78,
        color: "#ffe2b8"
      }),
      effects.neonBloom({ intensity: reducedMotion ? 0.015 : 0.04, quality: "balanced", softKnee: 0.5, shoulder: 0.6 }),
      effects.fog({ name: "golden-hour distance haze", density: 0.012, color: "#243754", intensity: 0.28 }),
      effects.colorGrade({ exposure: 1.05, contrast: 1.1, saturation: 1.08 }),
      effects.antiAlias({ mode: "fxaa" }),
      lights.ambient({ name: "open-sky ambient wash", color: "#c7dcf0", intensity: 0.34 }),
      lights.directional({ name: "low golden sun key", color: "#ffd28a", intensity: 2.75, shadow: true }).position(-7.5, 8.2, 5.0),
      lights.directional({ name: "cool hill fill", color: "#9fc9d2", intensity: 0.62 }).position(5.5, 6.0, -hole.halfLength * 0.5),
      lights.directional({ name: "sky rim back-light", color: "#cfe9ff", intensity: 0.85 }).position(2.4, 3.4, 11.5),
      lights.point({ name: "warm timber bounce", color: "#ef9f5a", intensity: 0.55 }).position(0, 2.2, -hole.halfLength * 0.46),
      lights.point({ name: "tee readability fill", color: "#ffffff", intensity: 1.15 }).position(hole.tee[0], 1.8, teeZ + 0.6),
      lights.point({ name: "red target cloth bounce", color: "#ffd88a", intensity: 0.65 }).position(0, 2.1, -3.1),
      lights.point({ name: "stack lane readability", color: "#ffd08a", intensity: 0.8 }).position(0, 1.5, -4.6)
    ])
    .camera(cameraForPhase(hole, phase));
}

// ---------------------------------------------------------------- mount ------
const gameApp = createGameApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  physics: {
    seed: 20260908,
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 4 }
  },
  input: {
    actions: {
      aimLeft: ["ArrowLeft"],
      aimRight: ["ArrowRight"],
      charge: ["Space"],
      strike: ["KeyJ"],
      pause: ["KeyP", "Escape"],
      resetHole: ["KeyR"],
      resetRound: ["KeyT"]
    },
    bufferMs: 80,
    gamepad: true,
    touch: true
  },
  loop: { fixedDt: 1 / 60, maxSubSteps: 2 },
  scene: buildHoleScene(SIEGE_GOLF_HOLES[0]!, cameraPhase)
});
const app = gameApp.app;
const input = gameApp.input!;
if (!input) throw new Error("Siege Golf failed to create Aura3D input.");

function resolveHandles(): void {
  dynamicHandles = new Map();
  for (const name of flow.sim.dynamicVisualNames) {
    dynamicHandles.set(name, app.nodes.require(name) as AuraRuntimeNodeHandle);
  }
  trailHandles = [];
  for (let i = 0; i < TRAIL_COUNT; i += 1) {
    trailHandles.push(app.nodes.require("trail-pool-" + i) as AuraRuntimeNodeHandle);
  }
  aimHandles = [];
  for (let i = 0; i < AIM_NODE_COUNT; i += 1) {
    aimHandles.push(app.nodes.require("aim-node-" + i) as AuraRuntimeNodeHandle);
  }
  strikeRingHandles = [0, 1].map((i) => app.nodes.require(`strike-ring-${i}`) as AuraRuntimeNodeHandle);
  strikeChevronHandles = [];
  for (let i = 0; i < STRIKE_CHEVRON_COUNT; i += 1) {
    strikeChevronHandles.push(app.nodes.require(`strike-chevron-${i}`) as AuraRuntimeNodeHandle);
  }
  shotClubShaftHandle = app.nodes.require("shot-club-shaft") as AuraRuntimeNodeHandle;
  shotClubHeadHandle = app.nodes.require("shot-club-head") as AuraRuntimeNodeHandle;
  shotClubGripHandle = app.nodes.require("shot-club-grip") as AuraRuntimeNodeHandle;
  dustHandles = [];
  for (let i = 0; i < DUST_NODE_COUNT; i += 1) {
    dustHandles.push(app.nodes.require("impact-dust-pool-" + i) as AuraRuntimeNodeHandle);
  }
  bestGhostHandles = [];
  for (let i = 0; i < BEST_GHOST_NODE_COUNT; i += 1) {
    bestGhostHandles.push(app.nodes.require("best-ghost-point-" + i) as AuraRuntimeNodeHandle);
  }
}
resolveHandles();

/*
 * Shared route-primary evidence needs to isolate the typed gameplay hero from
 * the full-bleed course. Without subject suppression the generic foreground
 * analyser quite correctly sees the whole canvas and cannot distinguish the
 * golf ball from the fairway. This probe changes presentation only: the Rapier
 * body, score state, and simulation clock are left untouched.
 */
Object.defineProperty(siegeWindow, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "application",
    get subject() {
      return {
        position: dynamicHandles.get("golf-ball")?.position ?? flow.sim.ball.position,
        rotation: dynamicHandles.get("golf-ball")?.rotation ?? [0, 0, 0],
        targetSize: 0.32
      };
    },
    settleSubjectPose: async () => {
      app.pause();
      await app.ready();
      // Keep the already-mounted opening camera for the paired visible/hidden
      // captures. Rebuilding the entire typed course here used to enqueue a
      // second asynchronous GLB scene: the visible frame was still the old
      // wide camera while the first suppression step presented the newly-built
      // close camera, so the diff measured a full-viewport camera jump instead
      // of the golf ball. Subject isolation must change only the hero node;
      // camera and world stay byte-for-byte identical across both renders.
      // The 2.4x composition scale applies only on the default path: review
      // captures (?capture=review, used by thumbnails) share this seam and
      // must keep the regulation-sized ball, otherwise the thumbnail inherits
      // a boulder that exists nowhere in play.
      resolveHandles();
      syncVisuals();
      dynamicHandles.get("golf-ball")?.setScale(visualReviewCapture ? 1 : COMPOSITION_BALL_SCALE);
      // Resolve only after the mutated subject has been submitted for capture.
      app.step(0);
    },
    setSubjectSuppressed: async (suppressed: boolean) => {
      app.pause();
      await app.ready();
      const ball = dynamicHandles.get("golf-ball");
      ball?.setVisible(true);
      ball?.setScale(suppressed ? 0.0001 : visualReviewCapture ? 1 : COMPOSITION_BALL_SCALE);
      // The hidden state needs a presented frame for the pixel diff. Restoring
      // visibility only restores route state; no later assertion consumes a
      // third frame, so avoid submitting one to a software renderer.
      if (suppressed) app.step(0);
    }
  },
  configurable: true
});

function applyCameraPhase(next: SiegeCameraPhase): void {
  if (cameraPhase === next) return;
  cameraPhase = next;
  app.setScene(buildHoleScene(flow.hole, cameraPhase));
  resolveHandles();
  trailPuffs.length = 0;
  dustPuffs.length = 0;
  syncVisuals();
  syncAim();
  syncBestGhost();
}

// ---------------------------------------------------------------- HUD --------
const banner = document.getElementById("sg-hole-banner")!;
const resultCard = document.getElementById("sg-result")!;
const resultTitle = document.getElementById("sg-result-title")!;
const resultDetail = document.getElementById("sg-result-detail")!;
const resultStars = document.getElementById("sg-result-stars")!;
const nextButton = document.getElementById("sg-next-button") as HTMLButtonElement;
const panel = document.getElementById("panel")!;
panel.dataset.capture = visualReviewCapture ? "review" : "default";
const powerFill = document.getElementById("sg-power-fill")!;
const powerLabel = document.getElementById("sg-power-label")!;
// T1.12: mobile HUD elements were re-fetched by getElementById every frame.
const mobilePowerFill = document.getElementById("sg-mobile-power-fill")!;
const mobilePowerLabel = document.getElementById("sg-mobile-power-label")!;
const mobileState = document.getElementById("sg-mobile-state")!;

// T1.12: cache element refs + last written string so a constant frame writes
// zero DOM mutations (ui.setText re-resolves the selector every call).
const hudCache = new Map<string, { el: HTMLElement; text: string }>();
function hudText(selector: string, value: string): void {
  let entry = hudCache.get(selector);
  if (!entry) {
    entry = { el: ui.text(selector), text: "" };
    hudCache.set(selector, entry);
  }
  if (entry.text !== value) {
    entry.el.textContent = value;
    entry.text = value;
  }
}

function hideResultCard(): void {
  resultCard.classList.add("is-hidden");
  panel.classList.remove("result-open");
}

function showResultCard(title: string, detail: string, stars: string, nextLabel: string, failed: boolean): void {
  resultTitle.textContent = title;
  resultDetail.textContent = detail;
  resultStars.textContent = stars;
  nextButton.textContent = nextLabel;
  resultCard.classList.toggle("is-failed", failed);
  resultCard.classList.remove("is-hidden");
  // The precision-shot controls are useful only while aiming. Keep them
  // behind the result card (and out of the hit-test tree) so the mobile
  // producer can activate Next hole without a stale control intercepting it.
  panel.classList.add("result-open");
  pendingAdvance = failed ? "retry-hole" : holeIndex >= SIEGE_GOLF_HOLES.length - 1 ? "new-round" : "next-hole";
}

function queueResultCard(title: string, detail: string, stars: string, nextLabel: string, failed: boolean): void {
  // Hold the card back long enough for the settled-target evidence frame to
  // be captured deterministically.  Evidence mode owns the long delay below;
  // normal play retains the short result beat.
  pendingResultReveal = {
    title,
    detail,
    stars,
    nextLabel,
    failed,
    // The capture producer explicitly asks for a long settled-target window;
    // normal play and the close review-impact producer retain the short UX
    // beat.  The extra query mode makes the two evidence views deterministic
    // without delaying the public result card for several seconds.
    frames: evidenceCapture ? 480 : reducedMotion ? 30 : 45
  };
}

function syncHud(): void {
  const hole = flow.hole;
  hudText("#stat-hole", (holeIndex + 1) + "/" + SIEGE_GOLF_HOLES.length);
  hudText("#stat-par", String(hole.par));
  hudText("#stat-strokes", String(flow.strokes));
  hudText("#stat-targets", flow.snapshot().targetsSunk + "/" + hole.pins.length);
  hudText("#stat-sensors", String(flow.snapshot().sensorEventCount));
  const played = [
    ...roundEntries,
    ...(flow.phase === "hole-complete" ? [{ holeIndex, par: hole.par, strokes: flow.strokes }] : [])
  ].filter((entry) => entry.strokes !== undefined);
  if (played.length > 0) {
    const totals = roundTotals(played);
    hudText("#stat-round", versusPar(totals.totalStrokes, totals.totalPar) + " · " + totals.totalStars + "★");
  } else {
    hudText("#stat-round", "E");
  }
  const chargeState = shot.state;
  // The meter used to sit at literally 0% width whenever Space was not held,
  // so the most important readout on the HUD looked like an empty black slot
  // for the entire time the player was choosing a shot. Outside of a live
  // charge it now reports the power the shot will actually use.
  const shownPower = shot.charging ? chargeState.charge : previewPowerFraction();
  const shownPowerPct = Math.round(shownPower * 100);
  const widthText = shownPowerPct + "%";
  if (powerFill.style.width !== widthText) powerFill.style.width = widthText;
  if (mobilePowerFill.style.width !== widthText) mobilePowerFill.style.width = widthText;
  if (mobilePowerLabel.textContent !== widthText) mobilePowerLabel.textContent = widthText;
  const mobileStateText = paused
    ? "Paused"
    : flow.phase === "simulating"
      ? "Ball in flight"
      : flow.phase === "hole-complete"
        ? "Target sunk"
        : shot.charging ? "Charging" : "Aim";
  if (mobileState.textContent !== mobileStateText) mobileState.textContent = mobileStateText;
  const powerText = shot.charging
    ? "Power " + shownPowerPct + "%"
    : flow.phase === "simulating" ? "Ball in motion" : "Power " + shownPowerPct + "%";
  if (powerLabel.textContent !== powerText) powerLabel.textContent = powerText;
  hudText("#sg-ev-backend", flow.sim.backend);
  hudText("#sg-ev-bodies", String(flow.sim.bodyCount));
  hudText("#sg-ev-sensors", String(flow.snapshot().sensorEventCount));
  hudText("#sg-ev-hash", flow.lastShotHash || "pending");
  hudText("#sg-ev-resetmatch", flow.resetHashMatch === null ? "n/a" : flow.resetHashMatch ? "match" : "MISMATCH");
  const bannerText = paused
    ? hole.name + " · Par " + hole.par + " · Paused"
    : flow.phase === "hole-complete"
      ? hole.name + " · Par " + hole.par + " · Complete"
      : flow.phase === "hole-failed"
        ? hole.name + " · Par " + hole.par + " · Failed"
        : hole.name + " · Par " + hole.par + " · Stroke " + (flow.strokes + 1);
  if (banner.textContent !== bannerText) banner.textContent = bannerText;
}

function syncBlurb(): void {
  ui.setText("#sg-blurb", flow.hole.blurb);
}

// ------------------------------------------------------------- hole flow -----
function loadHole(index: number): void {
  holeIndex = index;
  const hole = SIEGE_GOLF_HOLES[index]!;
  flow = new HoleFlow(hole);
  shot.loadHole(hole.aim);
  currentShotInputs = [];
  currentTrajectory = [];
  cameraPhase = visualReviewCapture ? "aim" : "opening";
  settleCameraFrames = 0;
  app.setScene(buildHoleScene(hole, cameraPhase));
  resolveHandles();
  trailArmed = false;
  trailPuffs.length = 0;
  hideResultCard();
  pendingResultReveal = null;
  syncBlurb();
  syncVisuals();
  syncBestGhost();
  syncHud();
}

function recordAppliedShot(input: RecordedShotInput): void {
  currentShotInputs.push({ vector: [input.vector[0], input.vector[1]], power: input.power });
  const p = flow.sim.ball.position;
  currentTrajectory.push([p[0], p[1], p[2]]);
}

function doStrike(): void {
  if (flow.phase !== "aiming") { shot.cancelCharge(); return; }
  const result = shot.strike();
  if (!result) return;
  applyStrike(result);
}

function applyStrike(result: NonNullable<ReturnType<ShotController["strike"]>>): void {
  const applied = flow.strike(result.input.vector, result.input.power);
  if (applied) {
    recordAppliedShot(result.input);
    applyCameraPhase("flight");
    pushCue("drive-hit");
    trailArmed = !reducedMotion && result.input.power >= 1.5;
  } else {
    shot.armNextShot();
  }
  syncHud();
}

function doPrecisionStrike(): void {
  if (flow.phase !== "aiming") return;
  shot.cancelCharge();
  shot.aimTo(Number(aimDial.value));
  const result = shot.strikeAtPower(Number(powerDial.value));
  if (result) applyStrike(result);
}

function resetHoleAction(): void {
  flow.resetHole();
  currentShotInputs = [];
  currentTrajectory = [];
  // Node names are stable per hole, so the same handles re-bind to the rebuilt
  // bodies; one forced sync restores every transform byte-for-byte.
  syncVisuals();
  trailArmed = false;
  trailPuffs.length = 0;
  hideResultCard();
  pendingResultReveal = null;
  applyCameraPhase("opening");
  syncBestGhost();
  pushCue("ui-confirm");
  syncHud();
}

function resetRoundAction(): void {
  roundEntries = [];
  loadHole(0);
  pushCue("ui-confirm");
}

function advanceAction(): void {
  if (pendingAdvance === "retry-hole") {
    loadHole(holeIndex);
    pushCue("ui-confirm");
    return;
  }
  if (pendingAdvance === "new-round") {
    resetRoundAction();
    return;
  }
  roundEntries.push({ holeIndex, par: flow.hole.par, strokes: flow.strokes });
  loadHole(holeIndex + 1);
  pushCue("ui-confirm");
}

function togglePause(): void {
  paused = !paused;
  pushCue("ui-confirm");
  // Publish BEFORE freezing the loop so observers can see the paused state;
  // resuming publishes on the next regular frame.
  syncHud();
  publishEvidence();
  if (paused) {
    app.pause();
  } else {
    app.resume();
  }
}

// Map semantic game events onto audio cues and HUD beats.
function consumeEvents(events: readonly import("../gameplay/hole-flow").SiegeGameEvent[]): void {
  for (const event of events) {
    recentEventLog.push(event.type + ":" + frameCount);
    if (recentEventLog.length > 60) recentEventLog.shift();
    switch (event.type) {
      case "impact-wood":
        if (event.speed > 0.65 && cueReady("wood-dust", 6)) spawnImpactDust("wood");
        if (event.speed > 1.6 && cueReady("wood-crack", 8)) {
          pushCue("wood-crack");
        }
        break;
      case "impact-metal":
        if (event.speed > 0.65 && cueReady("metal-dust", 6)) spawnImpactDust("metal");
        if (event.speed > 1.6 && cueReady("metal-clang", 8)) {
          pushCue("metal-clang");
        }
        break;
      case "pin-down":
        spawnImpactDust("wood");
        pushCue("target-down");
        break;
      case "pin-sunk":
        pushCue("cup-sink");
        break;
      case "complete": {
        commitBestSolution();
        const par = flow.hole.par;
        const strokes = flow.strokes;
        const finalHole = holeIndex >= SIEGE_GOLF_HOLES.length - 1;
        const completedRound = roundTotals([...roundEntries, { holeIndex, par, strokes }]);
        if (event.stars >= 2 || strokes <= par) pushCue("par-chime"); else pushCue("bogey-sting");
        queueResultCard(
          finalHole ? "Course complete" : "Hole complete",
          finalHole
            ? completedRound.totalStrokes + " strokes · " + completedRound.totalStars + " stars across all nine holes"
            : strokes + " stroke" + (strokes === 1 ? "" : "s") + " · par " + par + " (" + versusPar(strokes, par) + ")",
          event.stars === 3 ? "★★★" : event.stars === 2 ? "★★☆" : "★☆☆",
          finalHole ? "Play again" : "Next hole",
          false
        );
        break;
      }
      case "settled":
        // An unresolved multi-target stroke returns HoleFlow to aiming; release
        // the controller's struck latch so the next player input can launch.
        if (flow.phase === "aiming") shot.armNextShot();
        settleCameraFrames = 75;
        applyCameraPhase("settle");
        break;
      case "failed":
        pushCue("bogey-sting");
        showResultCard(
          "Hole failed",
          "Stroke limit " + (flow.hole.par + 4) + " reached. The stack resets exactly.",
          "",
          "Retry hole",
          true
        );
        break;
      default:
        break;
    }
  }
}

// --------------------------------------------------------- per-frame sync ----
function syncVisuals(): void {
  for (const pose of flow.sim.poses()) {
    const handle = dynamicHandles.get(pose.name);
    if (!handle) continue;
    const e = quatToEuler(pose.rotation);
    if (pose.name === "golf-ball") {
      handle.setPosition(pose.position[0], Math.max(0.18, pose.position[1] + 0.045), pose.position[2]);
      handle.setRotation(e.x, e.y, e.z);
    } else if (pose.name === "stack-a-crate-0") {
      handle.setPosition(pose.position[0] - 0.82, Math.min(0.24, pose.position[1]), pose.position[2]);
      handle.setRotation(e.x, e.y + 0.14, e.z);
    } else if (pose.name === "stack-a-crate-1") {
      handle.setPosition(pose.position[0] + 0.82, Math.min(0.24, pose.position[1] * 0.35), pose.position[2]);
      handle.setRotation(e.x, e.y - 0.14, e.z);
    } else {
      handle.setPosition(pose.position[0], pose.position[1], pose.position[2]);
      handle.setRotation(e.x, e.y, e.z);
    }
  }
}

function recordTrajectoryPoint(): void {
  if (flow.phase !== "simulating" || frameCount % 4 !== 0) return;
  const p = flow.sim.ball.position;
  const point = [p[0], p[1], p[2]] as const;
  const previous = currentTrajectory[currentTrajectory.length - 1];
  if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]) >= 0.12) {
    currentTrajectory.push(point);
  }
}

function commitBestSolution(): void {
  const id = flow.hole.id;
  const previous = bestSolutions.get(id);
  if (previous && previous.strokes <= flow.strokes) return;
  const p = flow.sim.ball.position;
  currentTrajectory.push([p[0], p[1], p[2]]);
  bestSolutions.set(id, {
    strokes: flow.strokes,
    inputs: currentShotInputs.map((input) => ({ vector: [input.vector[0], input.vector[1]], power: input.power })),
    trajectory: currentTrajectory.map((point) => [point[0], point[1], point[2]])
  });
  localStorage.setItem(BEST_SOLUTION_STORAGE_KEY, JSON.stringify([...bestSolutions.entries()]));
  syncBestGhost();
}

function syncBestGhost(): void {
  const replay = bestSolutions.get(flow.hole.id);
  const points = replay?.trajectory ?? [];
  const visible = bestGhostVisible && points.length > 0 && flow.phase !== "simulating";
  for (let i = 0; i < bestGhostHandles.length; i += 1) {
    const handle = bestGhostHandles[i]!;
    if (!visible || i >= Math.min(points.length, BEST_GHOST_NODE_COUNT)) {
      handle.setVisible(false);
      continue;
    }
    const sourceIndex = points.length <= BEST_GHOST_NODE_COUNT
      ? i
      : Math.round(i * (points.length - 1) / (BEST_GHOST_NODE_COUNT - 1));
    const point = points[sourceIndex]!;
    handle.setPosition(point[0], Math.max(0.055, point[1] + 0.035), point[2]);
    handle.setScale(i % 4 === 0 ? 0.065 : 0.042);
    handle.setVisible(true);
  }
}

function ballSpeed(): number {
  const v = flow.sim.ball.velocity;
  return Math.hypot(v[0], v[1], v[2]);
}

function syncTrail(dt: number): void {
  // Power-shot trail: renderer-owned puffs dropped along the real ball path.
  if (trailArmed && !reducedMotion && frameCount % 3 === 0 && ballSpeed() > 4) {
    const node = trailHandles[trailIndex % TRAIL_COUNT]!;
    trailIndex += 1;
    const p = flow.sim.ball.position;
    node.setPosition(p[0], p[1], p[2]);
    node.setVisible(true);
    trailPuffs.push({ life: 0.42, node });
  }
  for (let i = trailPuffs.length - 1; i >= 0; i -= 1) {
    const puff = trailPuffs[i]!;
    puff.life -= dt;
    const scale = Math.max(0.001, puff.life * 0.22);
    puff.node.setScale(scale);
    if (puff.life <= 0) {
      puff.node.setVisible(false);
      puff.node.setScale(0.001);
      trailPuffs.splice(i, 1);
    }
  }
}

/**
 * Fraction of the shot-power range the player is about to commit to: live
 * charge while Space is held, otherwise the precision dial value. Read from the
 * DOM directly so this stays valid regardless of module-initialisation order.
 */
function previewPowerFraction(): number {
  const dial = document.getElementById("sg-power-dial") as HTMLInputElement | null;
  const set = dial && Number.isFinite(Number(dial.value)) ? Number(dial.value) : 1.9;
  return Math.min(1, Math.max(0, (set - 0.55) / (2.3 - 0.55)));
}

function syncAim(): void {
  const aiming = flow.phase === "aiming" && !paused;
  const dirX = Math.sin(shot.state.angle);
  const dirZ = -Math.cos(shot.state.angle);
  const base = flow.sim.ball.position;
  const charge = shot.state.charge;
  if (!aiming) {
    for (const handle of [shotClubShaftHandle, shotClubHeadHandle, shotClubGripHandle]) {
      handle?.setPosition(0, -50, 0);
      handle?.setScale(0.001);
      handle?.setVisible(false);
    }
  } else {
    const pullback = 0.22 + (shot.charging ? charge : 0) * 0.34;
    const sideX = -dirZ;
    const sideZ = dirX;
    const yaw = Math.atan2(dirX, dirZ);
    shotClubHeadHandle?.setVisible(true);
    shotClubHeadHandle?.setPosition(base[0] - dirX * pullback, Math.max(0.11, base[1] + 0.03), base[2] - dirZ * pullback);
    shotClubHeadHandle?.setRotation(0, yaw, 0);
    shotClubHeadHandle?.setScale([0.22, 0.075, 0.065]);

    shotClubShaftHandle?.setVisible(true);
    shotClubShaftHandle?.setPosition(
      base[0] - dirX * (pullback + 0.04) - sideX * 0.14,
      Math.max(0.46, base[1] + 0.38),
      base[2] - dirZ * (pullback + 0.04) - sideZ * 0.14
    );
    shotClubShaftHandle?.setRotation(0.08, yaw, -0.32);
    shotClubShaftHandle?.setScale([0.024, 0.78, 0.024]);

    shotClubGripHandle?.setVisible(true);
    shotClubGripHandle?.setPosition(
      base[0] - dirX * (pullback + 0.07) - sideX * 0.26,
      Math.max(0.84, base[1] + 0.75),
      base[2] - dirZ * (pullback + 0.07) - sideZ * 0.26
    );
    shotClubGripHandle?.setScale([0.038, 0.16, 0.038]);
  }
  for (let i = 0; i < strikeRingHandles.length; i += 1) {
    const ring = strikeRingHandles[i]!;
    ring.setVisible(aiming);
    if (!aiming) continue;
    ring.setPosition(base[0], 0.045 + i * 0.012, base[2]);
    ring.setRotation(Math.PI / 2, 0, 0);
    const pulse = i === 0 ? 0.46 : 0.58 + charge * 0.34;
    ring.setScale(pulse);
  }
  for (let i = 0; i < strikeChevronHandles.length; i += 1) {
    const chevron = strikeChevronHandles[i]!;
    chevron.setVisible(aiming);
    if (!aiming) continue;
    // The chevrons sit above the dotted guide as the immediate "strike here"
    // affordance.  Their wider footprint survives the wide review lens while
    // the launch vector and charge remain sourced from the real controller.
    const reach = 0.68 + i * 0.4;
    chevron.setPosition(base[0] + dirX * reach, 0.075, base[2] + dirZ * reach);
    chevron.setRotation(0, Math.atan2(dirX, dirZ), Math.PI / 4);
    chevron.setScale([0.25 + charge * 0.12, 0.045, 0.25 + charge * 0.12]);
  }
  // Power has to be readable in the world, not only in the DOM meter: the
  // guide used to occupy the same fixed 5.5 m regardless of charge, so a
  // 12% tap and a full-power drive looked identical from the tee.
  const previewPower = shot.charging ? charge : previewPowerFraction();
  const guideSpread = 0.34 + previewPower * 0.52;
  for (let i = 0; i < AIM_NODE_COUNT; i += 1) {
    const handle = aimHandles[i]!;
    const fade = 1 - (i / AIM_NODE_COUNT) * 0.62;
    if (!aiming || (visualReviewCapture && i % 2 === 1)) {
      handle.setVisible(false);
      continue;
    }
    const reach = 0.5 + i * guideSpread;
    handle.setVisible(true);
    handle.setPosition(base[0] + dirX * reach, 0.04, base[2] + dirZ * reach);
    handle.setRotation(0, Math.atan2(dirX, dirZ), 0);
    handle.setScale([(0.12 + (i / (AIM_NODE_COUNT - 1)) * 0.13) * fade, 0.035, 0.23 * fade]);
  }
}

function spawnImpactDust(kind: "wood" | "metal"): void {
  if (reducedMotion) return;
  const p = flow.sim.ball.position;
  dustBurstCount += 1;
  for (let i = 0; i < 4; i += 1) {
    const node = dustHandles[dustIndex % DUST_NODE_COUNT]!;
    dustIndex += 1;
    const side = i % 2 === 0 ? -1 : 1;
    const depth = i < 2 ? -1 : 1;
    node.setPosition(p[0] + side * 0.06, Math.max(0.06, p[1] - 0.06), p[2] + depth * 0.05);
    node.setScale(kind === "wood" ? 0.055 : 0.04);
    node.setVisible(true);
    // The review producer samples a live impact asynchronously.  Keep its
    // renderer-owned dust readable for a short, bounded beat so the evidence
    // condition cannot miss a legitimate Rapier collision between polls;
    // normal gameplay keeps the tighter transient.
    const lifetime = visualReviewCapture ? 120 : kind === "wood" ? 24 : 16;
    dustPuffs.push({ frames: lifetime, age: 0, node, vx: side * (0.16 + i * 0.025), vz: depth * 0.12 });
  }
  // The gauntlet producer asks for the collision beat itself. Freeze only the
  // explicit review route on the first real Rapier impact, after the ball,
  // struck prop, and renderer-owned dust are synchronized. Normal gameplay and
  // evidence routes continue without a pause or any physics-state mutation.
  if (visualReviewCapture && !reviewImpactFrozen) {
    reviewImpactFrozen = true;
    app.pause();
  }
}

function syncDust(dt: number): void {
  const visualDt = Math.min(dt, 1 / 30);
  for (let i = dustPuffs.length - 1; i >= 0; i -= 1) {
    const puff = dustPuffs[i]!;
    puff.frames -= 1;
    puff.age += 1;
    const position = puff.node.position;
    puff.node.setPosition(position[0] + puff.vx * visualDt, position[1] + 0.18 * visualDt, position[2] + puff.vz * visualDt);
    puff.node.setScale(Math.min(0.15, 0.045 + puff.age * 0.005));
    if (puff.frames <= 0) {
      puff.node.setVisible(false);
      puff.node.setScale(0.001);
      dustPuffs.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------- evidence ------
function publishEvidence(): void {
  const snap = flow.snapshot();
  const diagnostics = app.diagnostics();
  const evidence = {
    // Contract keys from the PRD evidence section.
    mounted: true,
    status: flow.phase === "hole-complete" ? "completed" : flow.phase === "aiming" || paused ? "ready" : "playing",
    holeIndex,
    strokes: flow.strokes,
    par: flow.hole.par,
    state: paused ? "paused" : flow.phase,
    targetsDown: snap.targetsDown,
    targetsSunk: snap.targetsSunk,
    physicsBodyCount: snap.physicsBodyCount,
    sensorEventCount: snap.sensorEventCount,
    lastShotHash: flow.lastShotHash,
    resetHashMatch: flow.resetHashMatch,
    audioCues: audioCueLog.slice(),
    // Route-local extras consumed by specs and route-health.
    appId: APP_ID,
    backend: snap.backend,
    systems: {
      input: "game.input",
      physics: "physics.world:Rapier",
      simulation: "route-local fixed-step hole flow",
      camera: "root-safe camera phases",
      presentation: "createGameApp runtime nodes",
      audio: "engine.createGameAudio"
    },
    primaryAssets: Object.keys(SIEGE_MODEL_ASSETS).map((id) => ({ id })),
    renderer: {
      backend: diagnostics.backend,
      drawCalls: diagnostics.drawCalls,
      renderSize: diagnostics.renderSize
    },
    // Keep the generic showcase route-health contract alongside the richer
    // renderer payload. The route-specific specs consume `renderer`; the
    // library gate intentionally looks for a stable route-health-like key so
    // every mounted showcase exposes one common diagnostic entry point.
    routeHealth: {
      backend: diagnostics.backend,
      fps: diagnostics.fps,
      drawCalls: diagnostics.drawCalls,
      renderSize: diagnostics.renderSize,
      warnings: diagnostics.warnings,
      errors: diagnostics.errors
    },
    totalTargets: snap.totalTargets,
    holesTotal: SIEGE_GOLF_HOLES.length,
    roundStrokes: roundTotals(roundEntries).totalStrokes,
    roundStars: roundTotals(roundEntries).totalStars,
    completedHoles: roundEntries.length + (flow.phase === "hole-complete" ? 1 : 0),
    courseComplete: holeIndex === SIEGE_GOLF_HOLES.length - 1 && flow.phase === "hole-complete",
    courseStrokes: roundTotals(flow.phase === "hole-complete"
      ? [...roundEntries, { holeIndex, par: flow.hole.par, strokes: flow.strokes }]
      : roundEntries).totalStrokes,
    courseStars: roundTotals(flow.phase === "hole-complete"
      ? [...roundEntries, { holeIndex, par: flow.hole.par, strokes: flow.strokes }]
      : roundEntries).totalStars,
    frameCount,
    recentEvents: recentEventLog.slice(),
    controls: ["ArrowLeft/Right aim", "Space charge/release", "precision aim/power + J", "R hole reset", "T round reset", "P pause", "G best-line toggle", "touch drag-back"],
    claimBoundary: "Aura3D prototype: route-local rigid-body golf on the public physics surface; no reusable game kit claimed.",
    mountedAtEpochMs: mountedAtEpochMs(),
    sixtySecondReplayProof,
    chargePhase: shot.state.phase,
    chargeFraction: shot.state.charge,
    aimAngleRadians: shot.state.angle,
    cameraPhase,
    visualThesis: "golden-hour-siege-yard",
    dustBurstCount,
    activeDustPuffs: dustPuffs.length,
    reducedMotion,
    livePoseHash: flow.sim.poseHash(),
    bestSolutionAvailable: bestSolutions.has(flow.hole.id),
    bestSolutionStrokes: bestSolutions.get(flow.hole.id)?.strokes ?? null,
    bestSolutionInputCount: bestSolutions.get(flow.hole.id)?.inputs.length ?? 0,
    bestSolutionPointCount: bestSolutions.get(flow.hole.id)?.trajectory.length ?? 0,
    bestGhostVisible,
    bestGhostVisibleNodes: bestGhostHandles.filter((handle) => handle.visible !== false).length,
    bestGhostVisualOnly: true,
    bestGhostPhysicsBodies: 0,
    pinStates: [...flow.sim.pinBodies.entries()].map(([id, body]) => ({
      id,
      x: Number(body.position[0].toFixed(3)),
      y: Number(body.position[1].toFixed(3)),
      z: Number(body.position[2].toFixed(3)),
      upDot: Number(Math.abs(1 - 2 * (body.rotation[1]! * body.rotation[1]! + body.rotation[2]! * body.rotation[2]!)).toFixed(3))
    }))
  };
  siegeWindow.__SIEGE_GOLF_EVIDENCE__ = evidence;
  (window as unknown as { __AURA3D_GAME__?: { state: string } }).__AURA3D_GAME__ = { state: "playing" };
  Object.defineProperty(window, "__AURA3D_SHOWCASE_SIEGE_GOLF__", {
    value: evidence,
    configurable: true,
    writable: true
  });
}

let mountedAtMs = Date.now();
function mountedAtEpochMs(): number {
  return mountedAtMs;
}

// Headless 60-second replay proof (route-local simulation scope; the browser
// specs prove mounted input separately). Computed once at mount.
const sixtySecondReplayProof = runSixtySecondReplay().proof;

// Renderer-owned capture used by specs and probes (no compositor dependency).
siegeWindow.__SG_SHOT__ = () => app.screenshot().dataUrl;

// --------------------------------------------------------------- input -------
/*
 * Keyboard is read through a route-owned window mirror with explicit edge
 * detection (the same discipline the sibling showcase routes use): engine
 * game-input remains configured for touch/gamepad parity, but keyboard edges
 * here must not depend on element focus.
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
  for (const code of ["Space", "ArrowLeft", "ArrowRight", "KeyJ", "KeyP", "Escape", "KeyR", "KeyT", "KeyG"]) {
    manualPrev.set(code, manualHeld.has(code));
  }
}

window.addEventListener("keydown", (event) => {
  if (!event.repeat) manualHeld.add(event.code);
  if (flow.phase === "aiming" && (event.code === "Space" || event.code === "ArrowLeft" || event.code === "ArrowRight")) {
    applyCameraPhase("aim");
  }
  if (event.code === "Space" && flow.phase === "aiming" && !shot.charging) spaceTapArmed = true;
  // Edge-type actions fire directly from the event: a tap shorter than one
  // rendered frame would otherwise vanish between two rAF samples.
  if (event.repeat) return;
  if (event.code === "KeyP" || event.code === "Escape") togglePause();
  else if (event.code === "KeyR") resetHoleAction();
  else if (event.code === "KeyT") resetRoundAction();
  else if (event.code === "KeyG") {
    bestGhostVisible = !bestGhostVisible;
    syncBestGhost();
    syncHud();
    publishEvidence();
  }
  else if (event.code === "KeyJ" && flow.phase === "aiming") doPrecisionStrike();
}, { passive: true });
window.addEventListener("keyup", (event) => {
  manualHeld.delete(event.code);
  // A tap shorter than one rendered frame never produces a held charge edge;
  // treat it as an intentional minimum-power chip instead of dropping it.
  if (event.code === "Space" && spaceTapArmed && !shot.charging && flow.phase === "aiming") {
    spaceTapArmed = false;
    const angle = shot.state.angle;
    const tap = canonicalShotInput([Math.sin(angle), -Math.cos(angle)], 0.7);
    if (tap && flow.strike(tap.vector, tap.power)) {
      recordAppliedShot(tap);
      applyCameraPhase("flight");
      pushCue("drive-hit");
      trailArmed = false;
      // Tap path bypasses ShotController.strike(); release its struck latch
      // so later hold-charges are not silently swallowed.
      shot.armNextShot();
      syncHud();
    }
  }
}, { passive: true });
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "ArrowLeft" || event.code === "ArrowRight" || event.code === "KeyJ") {
    event.preventDefault();
  }
}, { passive: false });

ui.onClick("#sg-reset-button", () => resetHoleAction());
ui.onClick("#sg-round-button", () => resetRoundAction());
ui.onClick("#sg-pause-button", () => togglePause());
nextButton.addEventListener("click", () => advanceAction());

const aimDial = document.getElementById("sg-aim-dial") as HTMLInputElement;
const powerDial = document.getElementById("sg-power-dial") as HTMLInputElement;
const aimDialValue = document.getElementById("sg-aim-dial-value") as HTMLOutputElement;
const powerDialValue = document.getElementById("sg-power-dial-value") as HTMLOutputElement;
aimDial.addEventListener("input", () => {
  if (flow.phase !== "aiming") return;
  shot.aimTo(Number(aimDial.value));
  aimDialValue.value = Number(aimDial.value).toFixed(3);
  applyCameraPhase("aim");
  syncHud();
});
powerDial.addEventListener("input", () => {
  powerDialValue.value = Number(powerDial.value).toFixed(3);
});
ui.onClick("#sg-precision-strike-button", () => doPrecisionStrike());

// Charge/Strike button: hold to charge, release to strike (pointer parity).
const strikeButton = ui.button("#sg-strike-button");
strikeButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (flow.phase === "aiming" && !shot.charging) {
    applyCameraPhase("aim");
    pointerChargeHeld = true;
    shot.beginCharge();
    pushCue("ui-confirm");
  }
});
strikeButton.addEventListener("pointerup", () => { pointerChargeHeld = false; doStrike(); });
strikeButton.addEventListener("pointerleave", () => {
  pointerChargeHeld = false;
  if (shot.charging) shot.cancelCharge();
});

function bindAimButton(selector: string, direction: -1 | 1): void {
  const button = ui.button(selector);
  const start = (event: PointerEvent): void => {
    event.preventDefault();
    if (flow.phase !== "aiming") return;
    applyCameraPhase("aim");
    mobileAimDirection = direction;
    button.setPointerCapture?.(event.pointerId);
  };
  const stop = (): void => { if (mobileAimDirection === direction) mobileAimDirection = 0; };
  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("pointerleave", stop);
}
bindAimButton("#sg-aim-left-button", -1);
bindAimButton("#sg-aim-right-button", 1);

const mobileStrikeButton = ui.button("#sg-mobile-strike-button");
mobileStrikeButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (flow.phase === "aiming" && !shot.charging) {
    applyCameraPhase("aim");
    pointerChargeHeld = true;
    shot.beginCharge();
    pushCue("ui-confirm");
  }
});
mobileStrikeButton.addEventListener("pointerup", () => { pointerChargeHeld = false; doStrike(); });
mobileStrikeButton.addEventListener("pointercancel", () => {
  pointerChargeHeld = false;
  if (shot.charging) shot.cancelCharge();
});

// Touch drag-back-and-release anywhere on the canvas.
const stage = document.getElementById("app")!;
let dragStart: { x: number; y: number } | null = null;
stage.addEventListener("pointerdown", (event) => {
  dragStart = { x: event.clientX, y: event.clientY };
}, { passive: true });
stage.addEventListener("pointerup", (event) => {
  if (!dragStart) return;
  const end = { x: event.clientX, y: event.clientY };
  const start = dragStart;
  dragStart = null;
  if (flow.phase !== "aiming") return;
  const mapped = shot.strikeFromDrag(start, end);
  if (!mapped) return;
  const applied = flow.strike(mapped.input.vector, mapped.input.power);
  if (applied) {
    recordAppliedShot(mapped.input);
    applyCameraPhase("flight");
    pushCue("drive-hit");
    trailArmed = !reducedMotion && mapped.input.power >= 1.5;
    syncHud();
  } else {
    shot.armNextShot();
  }
}, { passive: true });

// ------------------------------------------------------------- frame loop ----
gameApp.onFrame(({ dt }) => {
  input.update(dt);
  frameCount += 1;
  const physicsWallMs = performance.now();
  const physicsElapsedSeconds = Math.max(0, (physicsWallMs - lastPhysicsWallMs) / 1000);
  lastPhysicsWallMs = physicsWallMs;

  // Keyboard: edge actions fire from event listeners; the loop only samples
  // held keys (aim, charge) and publishes the frozen paused frame.
  if (paused) {
    manualAdvanceFrame();
    return;
  }

  if (flow.phase === "aiming") {
    const aimStep = Math.PI / 90;
    if (frameCount % 2 === 0) {
      if (manualHeld.has("ArrowLeft")) shot.aimBy(-aimStep);
      if (manualHeld.has("ArrowRight")) shot.aimBy(aimStep);
      if (mobileAimDirection !== 0) shot.aimBy(mobileAimDirection * aimStep);
    }
    if (manualEdge("Space") === "pressed" && !shot.charging) {
      shot.beginCharge();
      pushCue("ui-confirm");
    }
    spaceHeld = manualHeld.has("Space");
    if (shot.charging) {
      // Rendering a scene with several typed GLBs can temporarily starve
      // requestAnimationFrame on software/headless GPUs. Charge is a wall-clock
      // interaction, so use the same bounded elapsed-time catch-up policy as
      // physics rather than making a two-second hold take half a minute.
      shot.updateCharge(Math.max(dt, Math.min(physicsElapsedSeconds, 0.25)));
    }
    if (!spaceHeld && !pointerChargeHeld && shot.charging) doStrike();
  }
  manualAdvanceFrame();

  // Keep the 60 Hz deterministic simulation tied to elapsed time on
  // frame-starved mobile/headless renderers. Every substep still uses the
  // same fixed delta; the bounded catch-up only prevents a six-second stroke
  // from taking minutes of wall-clock time when rendering drops below 60 fps.
  const physicsSteps = Math.max(1, Math.min(4, Math.round(physicsElapsedSeconds / flow.sim.fixedDelta)));
  const events = flow.update(physicsSteps);
  consumeEvents(events);

  if (pendingResultReveal) {
    pendingResultReveal.frames -= 1;
    if (pendingResultReveal.frames <= 0) {
      const reveal = pendingResultReveal;
      pendingResultReveal = null;
      showResultCard(reveal.title, reveal.detail, reveal.stars, reveal.nextLabel, reveal.failed);
    }
  }

  if (settleCameraFrames > 0 && flow.phase === "aiming") {
    settleCameraFrames -= 1;
    if (settleCameraFrames === 0) applyCameraPhase("aim");
  }

  syncVisuals();
  recordTrajectoryPoint();
  syncTrail(dt);
  syncDust(dt);
  syncAim();
  syncBestGhost();

  if (frameCount % 6 === 0 || events.length > 0) syncHud();
  publishEvidence();
});

syncBlurb();
syncVisuals();
syncHud();
publishEvidence();
