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
import { assets } from "../../../src/aura-assets";
import { SIEGE_GOLF_HOLES, type HoleDefinition } from "./course";
import { HoleFlow } from "./hole-flow";
import { createGolfAudio } from "./golf-audio";
import { ShotController, canonicalShotInput } from "./shot";
import { roundTotals, versusPar, type HoleScoreEntry } from "./score";
import { runSixtySecondReplay } from "./replay-proof";
import { quatToEuler } from "./structures";
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

const APP_ID = "showcase-siege-golf";
const SIEGE_MODEL_ASSETS = {
  siegeGolfBall: assets.siegeGolfBall,
  siegeWoodenCrate: assets.siegeWoodenCrate,
  siegeWoodenBarrel: assets.siegeWoodenBarrel,
  siegePlankSet: assets.siegePlankSet
} as const;

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
    <article><span>Sensors</span><strong id="stat-sensors">0</strong></article>
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
let cameraPhase: SiegeCameraPhase = "opening";
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
const AIM_NODE_COUNT = 7;
const DUST_NODE_COUNT = 12;
const BEST_GHOST_NODE_COUNT = 36;
let dynamicHandles = new Map<string, AuraRuntimeNodeHandle>();
let trailHandles: AuraRuntimeNodeHandle[] = [];
let aimHandles: AuraRuntimeNodeHandle[] = [];
let dustHandles: AuraRuntimeNodeHandle[] = [];
let bestGhostHandles: AuraRuntimeNodeHandle[] = [];
interface DustPuff { frames: number; age: number; node: AuraRuntimeNodeHandle; vx: number; vz: number; }
const dustPuffs: DustPuff[] = [];
let dustIndex = 0;
let dustBurstCount = 0;

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

function visualNodes(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  for (const v of flow.sim.visuals) {
    if (v.source === "model") {
      nodes.push(model(SIEGE_MODEL_ASSETS[v.typedAsset!], {
        name: v.name,
        role: v.name === "golf-ball" ? "primaryCharacter" : "setDressing",
        scaleMode: "fit",
        targetMaxDimension: v.targetMaxDimension ?? 1
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
      material: material.emissive({ name: "aim tick", color: "#f59e0b", emissive: "#fbbf24", opacity: 0.95 })
    }).position(0, -9, 0).scale([0.08 + 0.012 * i, 0.04, 0.22])
      .runtime(game.runtimeNode("aim-node-" + i, { tags: ["aim-guide"] }))
      .toJSON());
  }
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

function buildSetDressing(hole: HoleDefinition): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  const farZ = -(hole.halfLength + 0.6);
  const backZ = 4.0;
  const laneLength = backZ - farZ;
  const pillarSpacing = 3.6;
  const pillarCount = Math.floor(laneLength / pillarSpacing);

  // Alternating grass fairway mowing stripes for turf depth and realism
  const stripeCount = Math.floor(laneLength / 1.6);
  for (let s = 0; s < stripeCount; s++) {
    if (s % 2 === 1) {
      const sz = backZ - s * 1.6 - 0.8;
      nodes.push(primitives.box({
        name: `mow-stripe-${s}`,
        material: material.pbr({ name: `mow-stripe-mat-${s}`, color: "#166534", roughness: 0.92 })
      }).position(0, 0.001, sz).scale([hole.halfWidth * 2, 0.002, 1.58]).toJSON());
    }
  }

  // Pale limestone edging reads as authored siege-yard boundaries without
  // introducing a second neon visual language.
  nodes.push(primitives.box({
    name: "curb-line-left",
    material: material.pbr({ name: "curb-line-mat-l", color: "#d8c6a4", roughness: 0.9 })
  }).position(-hole.halfWidth, 0.005, (backZ + farZ) / 2).scale([0.06, 0.004, laneLength]).toJSON());

  nodes.push(primitives.box({
    name: "curb-line-right",
    material: material.pbr({ name: "curb-line-mat-r", color: "#d8c6a4", roughness: 0.9 })
  }).position(hole.halfWidth, 0.005, (backZ + farZ) / 2).scale([0.06, 0.004, laneLength]).toJSON());

  // Chalk tee ring and dark iron peg.
  nodes.push(primitives.torus({
    name: "tee-marker-ring",
    material: material.pbr({ name: "tee-ring-mat", color: "#f3e8d0", roughness: 0.95 })
  }).position(hole.tee[0], 0.006, hole.tee[1]).rotate(Math.PI / 2, 0, 0).scale([0.45, 0.45, 0.008]).toJSON());

  nodes.push(primitives.box({
    name: "tee-peg",
    material: material.pbr({ name: "tee-peg-mat", color: "#3d352f", roughness: 0.42, metallic: 0.72 })
  }).position(hole.tee[0], 0.04, hole.tee[1]).scale([0.035, 0.08, 0.035]).toJSON());

  // Side fortress stone pillars with warm torch flames along both rails
  for (let i = 0; i <= pillarCount; i++) {
    const z = backZ - i * pillarSpacing;
    // Left stone pillar
    nodes.push(primitives.box({
      name: `pillar-left-${i}`,
      material: material.pbr({ name: `pillar-left-mat-${i}`, color: "#8b7962", roughness: 0.92, metallic: 0.02 })
    }).position(-(hole.halfWidth + 0.62), 0.55, z).scale([0.38, 1.1, 0.38]).toJSON());

    // Left torch flame
    nodes.push(primitives.sphere({
      name: `torch-left-${i}`,
      material: material.emissive({ name: `torch-left-mat-${i}`, color: "#f59e0b", emissive: "#fbbf24", opacity: 0.9 })
    }).position(-(hole.halfWidth + 0.62), 1.18, z).scale(0.085).toJSON());

    // Right stone pillar
    nodes.push(primitives.box({
      name: `pillar-right-${i}`,
      material: material.pbr({ name: `pillar-right-mat-${i}`, color: "#8b7962", roughness: 0.92, metallic: 0.02 })
    }).position(hole.halfWidth + 0.62, 0.55, z).scale([0.38, 1.1, 0.38]).toJSON());

    // Right torch flame
    nodes.push(primitives.sphere({
      name: `torch-right-${i}`,
      material: material.emissive({ name: `torch-right-mat-${i}`, color: "#f59e0b", emissive: "#fbbf24", opacity: 0.9 })
    }).position(hole.halfWidth + 0.62, 1.18, z).scale(0.085).toJSON());
  }

  // Castle battlement end gate at the far end of the hole
  const archZ = farZ - 0.8;
  const archSpan = (hole.halfWidth + 0.8) * 2;
  // Left tower column
  nodes.push(primitives.box({
    name: "end-tower-left",
    material: material.pbr({ name: "end-tower-mat", color: "#756754", roughness: 0.92 })
  }).position(-(hole.halfWidth + 0.8), 1.25, archZ).scale([0.75, 2.5, 0.75]).toJSON());

  // Right tower column
  nodes.push(primitives.box({
    name: "end-tower-right",
    material: material.pbr({ name: "end-tower-mat", color: "#756754", roughness: 0.92 })
  }).position(hole.halfWidth + 0.8, 1.25, archZ).scale([0.75, 2.5, 0.75]).toJSON());

  // Overhead battlement lintel
  nodes.push(primitives.box({
    name: "end-tower-lintel",
    material: material.pbr({ name: "end-lintel-mat", color: "#8b7962", roughness: 0.92 })
  }).position(0, 2.35, archZ).scale([archSpan, 0.45, 0.75]).toJSON());

  // Target cup flag pins and concentric target bullseye rings
  for (let ci = 0; ci < hole.cups.length; ci++) {
    const cup = hole.cups[ci]!;
    // Flag pole
    nodes.push(primitives.box({
      name: `flag-pole-${cup.id}`,
      material: material.pbr({ name: "flag-pole-mat", color: "#e2e8f0", roughness: 0.3, metallic: 0.8 })
    }).position(cup.x, 0.9, cup.z).scale([0.025, 1.8, 0.025]).toJSON());

    // Flag pennant
    nodes.push(primitives.box({
      name: `flag-banner-${cup.id}`,
      material: material.pbr({ name: "flag-banner-mat", color: "#b3262e", roughness: 0.78 })
    }).position(cup.x + 0.22, 1.62, cup.z).scale([0.42, 0.26, 0.02]).toJSON());

    // White chalk cup ring stays readable against the turf.
    nodes.push(primitives.torus({
      name: `target-ring-${cup.id}`,
      material: material.pbr({ name: "target-ring-mat", color: "#f8edd8", roughness: 0.95 })
    }).position(cup.x, 0.008, cup.z).rotate(Math.PI / 2, 0, 0).scale([0.65, 0.65, 0.01]).toJSON());
  }

  // Layered blue hill silhouettes and a low amber sun establish depth and
  // golden-hour time of day. They are environment set dressing, never
  // gameplay or collision evidence.
  for (let h = 0; h < 11; h++) {
    const x = (h - 5) * 3.7;
    const z = farZ - 5.4 - (h % 3) * 1.5;
    nodes.push(primitives.sphere({
      name: `distant-blue-hill-${h}`,
      material: material.pbr({ name: `distant-hill-mat-${h}`, color: h % 2 === 0 ? "#526b78" : "#415c6c", roughness: 1 })
    }).position(x, -0.8 + (h % 3) * 0.22, z).scale(2.8 + (h % 4) * 0.55).toJSON());
  }
  nodes.push(primitives.sphere({
    name: "low-amber-sun",
    material: material.emissive({ name: "sun-disc-mat", color: "#ffd486", emissive: "#ffad4d", opacity: 0.94 })
  }).position(-7.4, 5.7, farZ - 9).scale(1.25).toJSON());

  return nodes;
}

function cameraForPhase(hole: HoleDefinition, phase: SiegeCameraPhase) {
  const courseMidZ = (hole.tee[1] + hole.cups[0]!.z) * 0.5;
  if (phase === "opening") {
    return camera.perspective({
      position: compactViewport ? [0, 8.8, 11.8] : [6.4, 7.5, 10.2],
      target: [0, 0.45, courseMidZ],
      fov: compactViewport ? 55 : 48
    });
  }
  if (phase === "aim") {
    return camera.follow({
      targetNode: "golf-ball",
      offset: compactViewport ? [0, 3.5, 6.7] : [3.4, 2.9, 5.8],
      targetOffset: [0, 0.05, -1.6],
      fov: compactViewport ? 52 : 46,
      smoothing: reducedMotion ? 0 : 0.12
    });
  }
  if (phase === "flight") {
    return camera.follow({
      targetNode: "golf-ball",
      offset: compactViewport ? [0, 2.7, 5.4] : [2.5, 2.1, 4.7],
      targetOffset: [0, 0.12, -1.1],
      fov: compactViewport ? 54 : 48,
      smoothing: reducedMotion ? 0 : 0.22
    });
  }
  return camera.perspective({
    position: compactViewport ? [0, 8.2, 8.8] : [5.2, 6.2, 7.4],
    target: [hole.cups[0]!.x, 0.48, hole.cups[0]!.z + 1.0],
    fov: compactViewport ? 55 : 48
  });
}

function buildHoleScene(hole: HoleDefinition, phase: SiegeCameraPhase = "opening"): ReturnType<typeof scene> {
  const teeZ = hole.tee[1];
  return scene()
    .background("#d99061")
    .addMany(visualNodes())
    .addMany(buildSetDressing(hole))
    .addMany([
      effects.neonBloom({ intensity: reducedMotion ? 0.025 : 0.07 }),
      effects.fog({ name: "golden-hour distance haze", density: 0.009, color: "#9eb1b4", intensity: 0.28 }),
      lights.ambient({ name: "blue-sky ambient wash", color: "#b9d2d5", intensity: 0.72 }),
      lights.directional({ name: "low golden sun key", color: "#ffd28a", intensity: 1.85 }).position(-7.5, 8.2, 5.0),
      lights.directional({ name: "cool hill fill", color: "#8bb3c2", intensity: 0.48 }).position(5.5, 6.0, -hole.halfLength * 0.5),
      lights.point({ name: "warm timber bounce", color: "#ef9f5a", intensity: 0.42 }).position(0, 2.2, -hole.halfLength * 0.46),
      lights.point({ name: "tee readability fill", color: "#fff1c9", intensity: 0.52 }).position(hole.tee[0], 2.0, teeZ + 1.0),
      lights.point({ name: "red target cloth bounce", color: "#d95848", intensity: 0.3 }).position(0, 2.3, -hole.halfLength * 0.75)
    ])
    .camera(cameraForPhase(hole, phase));
}

// ---------------------------------------------------------------- mount ------
const gameApp = createGameApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
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
    gamepad: false,
    touch: true
  },
  loop: { fixedDt: 1 / 60, maxSubSteps: 2 },
  scene: buildHoleScene(SIEGE_GOLF_HOLES[0]!)
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
    settleSubjectPose: () => {
      app.pause();
      const p = flow.sim.ball.position;
      // The ordinary opening camera proves the whole hole. The retained
      // route-primary probe has a different job: prove that the typed ball
      // itself is rendered and readable, so it uses a deterministic close
      // inspection angle before performing the visible/hidden pixel diff.
      app.setScene(buildHoleScene(flow.hole, "opening").camera(camera.perspective({
        position: [p[0] + 0.9, p[1] + 0.72, p[2] + 1.35],
        target: [p[0], p[1], p[2]],
        fov: 35
      })));
      resolveHandles();
      syncVisuals();
      dynamicHandles.get("golf-ball")?.setScale(1);
      app.step(0);
    },
    setSubjectSuppressed: (suppressed: boolean) => {
      app.pause();
      const ball = dynamicHandles.get("golf-ball");
      ball?.setVisible(true);
      ball?.setScale(suppressed ? 0.0001 : 1);
      app.step(0);
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
const powerFill = document.getElementById("sg-power-fill")!;
const powerLabel = document.getElementById("sg-power-label")!;

function hideResultCard(): void {
  resultCard.classList.add("is-hidden");
}

function showResultCard(title: string, detail: string, stars: string, nextLabel: string, failed: boolean): void {
  resultTitle.textContent = title;
  resultDetail.textContent = detail;
  resultStars.textContent = stars;
  nextButton.textContent = nextLabel;
  resultCard.classList.toggle("is-failed", failed);
  resultCard.classList.remove("is-hidden");
  pendingAdvance = failed ? "retry-hole" : holeIndex >= SIEGE_GOLF_HOLES.length - 1 ? "new-round" : "next-hole";
}

function queueResultCard(title: string, detail: string, stars: string, nextLabel: string, failed: boolean): void {
  pendingResultReveal = { title, detail, stars, nextLabel, failed, frames: reducedMotion ? 18 : 45 };
}

function syncHud(): void {
  const hole = flow.hole;
  ui.setText("#stat-hole", (holeIndex + 1) + "/" + SIEGE_GOLF_HOLES.length);
  ui.setText("#stat-par", String(hole.par));
  ui.setText("#stat-strokes", String(flow.strokes));
  ui.setText("#stat-targets", flow.snapshot().targetsSunk + "/" + hole.pins.length);
  ui.setText("#stat-sensors", String(flow.snapshot().sensorEventCount));
  const played = [
    ...roundEntries,
    ...(flow.phase === "hole-complete" ? [{ holeIndex, par: hole.par, strokes: flow.strokes }] : [])
  ].filter((entry) => entry.strokes !== undefined);
  if (played.length > 0) {
    const totals = roundTotals(played);
    ui.setText("#stat-round", versusPar(totals.totalStrokes, totals.totalPar) + " · " + totals.totalStars + "★");
  } else {
    ui.setText("#stat-round", "E");
  }
  const chargeState = shot.state;
  powerFill.style.width = Math.round(chargeState.charge * 100) + "%";
  const mobilePowerFill = document.getElementById("sg-mobile-power-fill")!;
  const mobilePowerLabel = document.getElementById("sg-mobile-power-label")!;
  const mobileState = document.getElementById("sg-mobile-state")!;
  mobilePowerFill.style.width = Math.round(chargeState.charge * 100) + "%";
  mobilePowerLabel.textContent = Math.round(chargeState.charge * 100) + "%";
  mobileState.textContent = paused
    ? "Paused"
    : flow.phase === "simulating"
      ? "Ball in flight"
      : flow.phase === "hole-complete"
        ? "Target sunk"
        : shot.charging ? "Charging" : "Aim";
  powerLabel.textContent = shot.charging
    ? "Power " + Math.round(chargeState.charge * 100) + "%"
    : flow.phase === "simulating" ? "Ball in motion" : "Power";
  ui.setText("#sg-ev-backend", flow.sim.backend);
  ui.setText("#sg-ev-bodies", String(flow.sim.bodyCount));
  ui.setText("#sg-ev-sensors", String(flow.snapshot().sensorEventCount));
  ui.setText("#sg-ev-hash", flow.lastShotHash || "pending");
  ui.setText("#sg-ev-resetmatch", flow.resetHashMatch === null ? "n/a" : flow.resetHashMatch ? "match" : "MISMATCH");
  banner.textContent = paused
    ? hole.name + " · Par " + hole.par + " · Paused"
    : flow.phase === "hole-complete"
      ? hole.name + " · Par " + hole.par + " · Complete"
      : flow.phase === "hole-failed"
        ? hole.name + " · Par " + hole.par + " · Failed"
        : hole.name + " · Par " + hole.par + " · Stroke " + (flow.strokes + 1);
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
  cameraPhase = "opening";
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
function consumeEvents(events: readonly import("./hole-flow").SiegeGameEvent[]): void {
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
    handle.setPosition(pose.position[0], pose.position[1], pose.position[2]);
    handle.setRotation(e.x, e.y, e.z);
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

function syncAim(): void {
  const aiming = flow.phase === "aiming" && !paused;
  const dirX = Math.sin(shot.state.angle);
  const dirZ = -Math.cos(shot.state.angle);
  const base = flow.sim.ball.position;
  for (let i = 0; i < AIM_NODE_COUNT; i += 1) {
    const handle = aimHandles[i]!;
    if (!aiming) {
      handle.setVisible(false);
      continue;
    }
    handle.setVisible(true);
    const reach = 0.45 + i * 0.42;
    handle.setPosition(base[0] + dirX * reach, 0.04, base[2] + dirZ * reach);
    handle.setRotation(0, Math.atan2(dirX, dirZ), 0);
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
    dustPuffs.push({ frames: kind === "wood" ? 24 : 16, age: 0, node, vx: side * (0.16 + i * 0.025), vz: depth * 0.12 });
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
    if (shot.charging) shot.updateCharge(dt);
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
