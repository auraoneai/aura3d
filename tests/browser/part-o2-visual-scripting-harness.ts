import {
  camera,
  createAuraApp,
  game,
  lights,
  material,
  primitives,
  scene,
  visualScripting,
  type AuraApp
} from "@aura3d/engine";
import {
  applyVisualGameplaySideEffects,
  createVisualGameplayState,
  createVisualNode
} from "@aura3d/scripting";

// PART O2 browser proof: the ROOT visualScripting.graph(...).attach() loop
// changes gameplay state in a mounted createAuraApp scene. The graph reads the
// pressed(jump) input deterministically; app code applies the emitted
// game.addScore / game.setObjective side effects only while the input is
// pressed, then moves the player marker and updates the score readout.

const HOME_X = -3;

interface O2Evidence {
  readonly status: "loading" | "ready" | "error";
  readonly claim: "root-visual-scripting-graph-gameplay";
  readonly catalogKinds: number;
  readonly roundTripStable: boolean;
  readonly jumps: number;
  readonly score: number;
  readonly playerX: number;
  readonly objective: string | null;
  readonly lastPressed: boolean;
  readonly lastApplied: number;
  readonly lastSideEffects: readonly string[];
  readonly observes: number;
  readonly errors: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_PART_O2__?: O2Evidence;
  }
}

let app: AuraApp | undefined;
let status: O2Evidence["status"] = "loading";
let jumps = 0;
let observes = 0;
let lastPressed = false;
let lastApplied = 0;
let lastSideEffects: string[] = [];
const gameplay = createVisualGameplayState();

const graph = visualScripting.graph({
  nodes: [
    createVisualNode("onFrame", "frame"),
    createVisualNode("pressed", "jump", { action: "jump" }),
    createVisualNode("getScore", "read-score", { playerId: "p1" }),
    createVisualNode("addScore", "score", { playerId: "p1", points: 1 }),
    createVisualNode("setObjective", "objective", { objectiveId: "reach-pad", status: "complete" })
  ],
  edges: []
});
const roundTripStable = graph.roundTrip().stable;
const catalogKinds = visualScripting.catalog().reduce((total, group) => total + group.kinds.length, 0);

publish();
void boot().catch(fail);

async function boot(): Promise<void> {
  if (!roundTripStable) throw new Error("Root visual scripting graph round-trip is unstable.");
  if (catalogKinds < 25) throw new Error(`Root visual scripting catalog covers ${catalogKinds} kinds, O2 requires 25+.`);
  app = await createVisual();
  bindControls();
  status = "ready";
  publish();
}

async function createVisual(): Promise<AuraApp> {
  const next = createAuraApp("#o2-viewport", {
    autoStart: false,
    resize: true,
    pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#05070b")
      .camera(camera.perspective({ position: [0, 5, 10], target: [0, 0.5, 0], fov: 45 }))
      .add(lights.ambient({ intensity: 0.5, color: "#ffffff" }))
      .add(lights.directional({ name: "o2 key", position: [6, 10, 7], intensity: 2.2, color: "#fff4e6" }))
      .add(primitives.box({ name: "o2 ground", material: material.pbr({ color: "#1b2530", roughness: 0.85 }) }).position(0, -0.08, 0).scale([12, 0.16, 6]))
      .add(primitives.box({ name: "o2 goal pad", material: material.neon({ color: "#fbbf24", emissive: "#fbbf24", emissiveIntensity: 1.2 }) }).position(3, 0.02, 0).scale([1.2, 0.04, 1.2]))
      .add(primitives.box({ name: "o2 player", material: material.pbr({ color: "#38bdf8", roughness: 0.4 }) }).position(HOME_X, 0.3, 0).scale([0.6, 0.6, 0.6]).runtime(game.runtimeNode("o2-player", { tags: ["root-visual-scripting", "gameplay"] })))
  });
  await next.ready();
  return next;
}

// Jump: attach the root graph WITH the jump input pressed. Score, objective,
// and player motion apply only because the pressed node reads true.
function jump(): void {
  if (!app || status !== "ready") return;
  attach({ pressed: ["jump"] });
  if (lastPressed) {
    jumps += 1;
    app.nodes.require("o2-player").setPosition(HOME_X + jumps, 0.3, 0);
    app.step(1 / 60);
  }
  publish();
}

// Observe: attach the same root graph with NO input. Nothing may change.
function observe(): void {
  if (!app || status !== "ready") return;
  attach({});
  observes += 1;
  publish();
}

function attach(input: { pressed?: string[] }): void {
  const result = graph.attach({
    dt: 1 / 60,
    time: jumps / 60,
    frame: jumps,
    input: { pressed: input.pressed ?? [], held: [], released: [], buffered: [], combos: [], axes: {} }
  });
  lastPressed = result.values.get("jump.out") === true;
  lastSideEffects = result.sideEffects.map((effect) => effect.kind);
  lastApplied = lastPressed ? applyVisualGameplaySideEffects(gameplay, result) : 0;
}

function reset(): void {
  if (!app) return;
  jumps = 0;
  observes = 0;
  lastPressed = false;
  lastApplied = 0;
  lastSideEffects = [];
  for (const key of Object.keys(gameplay.scores)) delete gameplay.scores[key];
  for (const key of Object.keys(gameplay.objectives)) delete gameplay.objectives[key];
  app.nodes.require("o2-player").setPosition(HOME_X, 0.3, 0);
  app.step(1 / 60);
  publish();
}

function bindControls(): void {
  document.querySelector<HTMLButtonElement>("[data-testid='o2-jump']")?.addEventListener("click", jump);
  document.querySelector<HTMLButtonElement>("[data-testid='o2-observe']")?.addEventListener("click", observe);
  document.querySelector<HTMLButtonElement>("[data-testid='o2-reset']")?.addEventListener("click", reset);
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") { event.preventDefault(); jump(); }
    if (event.code === "KeyN") { event.preventDefault(); observe(); }
    if (event.code === "KeyR") { event.preventDefault(); reset(); }
  });
}

function publish(): void {
  const evidence: O2Evidence = {
    status,
    claim: "root-visual-scripting-graph-gameplay",
    catalogKinds,
    roundTripStable,
    jumps,
    score: gameplay.scores.p1 ?? 0,
    playerX: HOME_X + jumps,
    objective: gameplay.objectives["reach-pad"] ?? null,
    lastPressed,
    lastApplied,
    lastSideEffects,
    observes,
    errors: app?.diagnostics()?.errors ?? []
  };
  window.__AURA3D_PART_O2__ = evidence;
  document.querySelector<HTMLElement>("[data-testid='o2-state']")!.textContent = status;
  document.querySelector<HTMLElement>("[data-testid='o2-score']")!.textContent = `score ${evidence.score} · jumps ${jumps}`;
}

function fail(error: unknown): void {
  status = "error";
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  window.__AURA3D_PART_O2__ = {
    status, claim: "root-visual-scripting-graph-gameplay", catalogKinds, roundTripStable,
    jumps, score: 0, playerX: HOME_X, objective: null, lastPressed, lastApplied,
    lastSideEffects, observes, errors: [message], error: message
  };
  document.querySelector<HTMLElement>("[data-testid='o2-state']")!.textContent = "error";
}

export {};
