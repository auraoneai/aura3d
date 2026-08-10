import { camera, createAuraApp, game, lights, material, model, primitives, scene, type AuraApp } from "@aura3d/engine";
import { createRapierPhysics, type RapierBodyHandle, type RapierCharacterControllerHandle, type RapierCharacterMovement, type RapierPhysicsWorld } from "@aura3d/physics-rapier";
import { assets } from "../../src/aura-assets.js";

const CHARACTER = assets.showcaseAnimatedRunnerHero;
const CLIP = CHARACTER.metadata?.animationClips?.includes("OffensiveIdle") ? "OffensiveIdle" : CHARACTER.metadata?.animationClips?.[0] ?? "";
const PHYSICS = {
  gravity: [0, -9.81, 0] as const,
  start: [-2.2, 0.91, 0] as const,
  capsule: { halfHeight: 0.6, radius: 0.3 },
  step: { position: [0, 0.15, 0] as const, halfExtents: [0.65, 0.15, 1.1] as const },
  movement: [0.035, 0, 0] as const,
  traceSteps: 70,
  dt: 1 / 60,
  autostep: { maxHeight: 0.35, minWidth: 0.2 },
  snapToGround: 0.2
} as const;

interface RapierCharacterEvidence {
  readonly id: "rapier-character-lab";
  readonly status: "loading" | "ready" | "running" | "complete" | "error";
  readonly claim: "optional-selected-rapier-physical-character";
  readonly assetId: string;
  readonly assetHash: string;
  readonly packageOwner: "@aura3d/physics-rapier";
  readonly nativeCharacterController: boolean;
  readonly runtimeBackend?: string;
  readonly steps: number;
  readonly position: readonly [number, number, number];
  readonly lastMovement?: RapierCharacterMovement;
  readonly totalCollisions: number;
  readonly groundedFrames: number;
  readonly reachedAutostep: boolean;
  readonly drawCalls: number;
  readonly errors: readonly string[];
  readonly knownLimits: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_RAPIER_CHARACTER_LAB__?: RapierCharacterEvidence;
    __AURA3D_RAPIER_CHARACTER_DISPOSE__?: () => { worldDisposed: boolean; bodiesReleased: boolean };
  }
}

const knownLimits = [
  "This proves the selected optional Rapier adapter on one deterministic kinematic capsule ground/autostep trace.",
  "It does not claim root createAuraApp physics, universal character behavior, networking, animation-state-machine, visual, or performance parity."
] as const;

let app: AuraApp | undefined;
let world: RapierPhysicsWorld | undefined;
let body: RapierBodyHandle | undefined;
let controller: RapierCharacterControllerHandle | undefined;
let actor: ReturnType<NonNullable<AuraApp["nodes"]>["require"]> | undefined;
let status: RapierCharacterEvidence["status"] = "loading";
let steps = 0;
let totalCollisions = 0;
let groundedFrames = 0;
let lastMovement: RapierCharacterMovement | undefined;
let running = false;
let presentHandle = 0;

installShell();
publish();
void boot().catch(fail);

async function boot(): Promise<void> {
  if (!CLIP) throw new Error("The typed runner asset has no animation clips.");
  const [physics, visual] = await Promise.all([createWorld(), createVisual()]);
  world = physics.world;
  body = physics.body;
  app = visual;
  controller = world.createCharacterController(0.01)
    .enableAutostep(PHYSICS.autostep.maxHeight, PHYSICS.autostep.minWidth)
    .enableSnapToGround(PHYSICS.snapToGround)
    .setMaxSlopeClimbAngle(Math.PI / 4);
  actor = app.nodes.require("rapier-character");
  syncVisual();
  bindControls();
  status = "ready";
  startPresentLoop();
  publish();
  window.__AURA3D_RAPIER_CHARACTER_DISPOSE__ = dispose;
  window.addEventListener("beforeunload", dispose, { once: true });
}

async function createWorld(): Promise<{ world: RapierPhysicsWorld; body: RapierBodyHandle }> {
  const next = await createRapierPhysics({ gravity: PHYSICS.gravity });
  next.createBody({ type: "fixed", position: [0, -0.1, 0], shape: { kind: "box", halfExtents: [4.5, 0.1, 2] }, friction: 1 });
  next.createBody({ type: "fixed", position: PHYSICS.step.position, shape: { kind: "box", halfExtents: PHYSICS.step.halfExtents }, friction: 1 });
  const character = next.createBody({ type: "kinematic-position", position: PHYSICS.start, shape: { kind: "capsule", halfHeight: PHYSICS.capsule.halfHeight, radius: PHYSICS.capsule.radius }, friction: 0 });
  return { world: next, body: character };
}

async function createVisual(): Promise<AuraApp> {
  const next = createAuraApp("#rapier-character-canvas", {
    autoStart: false,
    resize: true,
    pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#05080d")
      .camera(camera.perspective({ position: [0, 2.7, 8.3], target: [0, 0.82, 0], fov: 38 }))
      .add(lights.ambient({ intensity: 0.42, color: "#dbeafe" }))
      .add(lights.directional({ name: "character key", position: [7, 12, 8], intensity: 3.2, color: "#fff0d4" }))
      .add(lights.directional({ name: "character rim", position: [-6, 5, -2], intensity: 1.35, color: "#65d9ff" }))
      .add(primitives.box({ name: "Rapier ground", material: material.pbr({ color: "#142030", roughness: 0.78, metallic: 0.08 }) }).position(0, -0.1, 0).scale([9, 0.2, 4]))
      .add(primitives.box({ name: "native autostep obstacle", material: material.pbr({ color: "#d97706", roughness: 0.5, metallic: 0.12 }) }).position(...PHYSICS.step.position).scale(PHYSICS.step.halfExtents.map((value) => value * 2) as [number, number, number]))
      .add(primitives.box({ name: "start marker", material: material.neon({ color: "#67e8f9", emissive: "#67e8f9", emissiveIntensity: 1.4 }) }).position(-2.2, 0.015, 1.35).scale([0.06, 0.05, 0.7]))
      .add(primitives.box({ name: "finish marker", material: material.neon({ color: "#fbbf24", emissive: "#fbbf24", emissiveIntensity: 1.4 }) }).position(-0.12, 0.315, 1.35).scale([0.06, 0.05, 0.7]))
      .add(model(CHARACTER, { name: "typed Rapier runner", scaleMode: "fit", targetHeight: 1.8, castShadow: false, receiveShadow: false })
        .animate({ clip: CLIP, loop: true, captureTime: 0.2 })
        .runtime(game.runtimeNode("rapier-character", { tags: ["typed-glb", "selected-rapier", "native-character-controller"] })))
  });
  await next.ready();
  return next;
}

async function runTrace(): Promise<void> {
  if (running || status === "loading" || status === "error") return;
  if (steps >= PHYSICS.traceSteps) reset();
  running = true;
  status = "running";
  setControls();
  while (steps < PHYSICS.traceSteps && running) {
    advanceOne();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  running = false;
  status = steps >= PHYSICS.traceSteps ? "complete" : "ready";
  setControls();
  publish();
}

function advanceOne(): void {
  if (!world || !body || !controller || !app || !actor || steps >= PHYSICS.traceSteps) return;
  lastMovement = controller.move(body, PHYSICS.movement);
  world.step(PHYSICS.dt);
  steps += 1;
  totalCollisions += lastMovement.collisions;
  if (lastMovement.grounded) groundedFrames += 1;
  syncVisual();
  status = steps >= PHYSICS.traceSteps ? "complete" : running ? "running" : "ready";
  publish();
}

function reset(): void {
  if (!body || !app || !actor) return;
  running = false;
  body.setPosition(PHYSICS.start);
  steps = 0;
  totalCollisions = 0;
  groundedFrames = 0;
  lastMovement = undefined;
  status = "ready";
  syncVisual();
  setControls();
  publish();
}

function syncVisual(): void {
  if (!body || !app || !actor) return;
  const position = body.position();
  actor.setPosition(position[0], position[1] - PHYSICS.start[1], position[2]);
  actor.play(CLIP, { loop: true, captureTime: 0.2 + steps / 58 });
  app.step(PHYSICS.dt);
}

function bindControls(): void {
  requiredElement<HTMLButtonElement>("[data-testid='rapier-run']").addEventListener("click", () => void runTrace());
  requiredElement<HTMLButtonElement>("[data-testid='rapier-step']").addEventListener("click", advanceOne);
  requiredElement<HTMLButtonElement>("[data-testid='rapier-reset']").addEventListener("click", reset);
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyD" || event.code === "ArrowRight") { event.preventDefault(); advanceOne(); }
    if (event.code === "KeyR") { event.preventDefault(); reset(); }
  });
  setControls();
}

function setControls(): void {
  const run = document.querySelector<HTMLButtonElement>("[data-testid='rapier-run']");
  const step = document.querySelector<HTMLButtonElement>("[data-testid='rapier-step']");
  if (run) { run.disabled = running; run.textContent = steps >= PHYSICS.traceSteps ? "Run again" : running ? "Traversing…" : "Run autostep trace"; }
  if (step) step.disabled = running || steps >= PHYSICS.traceSteps;
}

function startPresentLoop(): void {
  if (presentHandle) window.clearInterval(presentHandle);
  presentHandle = window.setInterval(() => {
    if (app && !running && status !== "error") app.step(0);
  }, 100);
}

function publish(): void {
  const position = body?.position() ?? PHYSICS.start;
  const diagnostics = app?.diagnostics();
  const evidence: RapierCharacterEvidence = {
    id: "rapier-character-lab",
    status,
    claim: "optional-selected-rapier-physical-character",
    assetId: CHARACTER.id,
    assetHash: CHARACTER.hash,
    packageOwner: "@aura3d/physics-rapier",
    nativeCharacterController: typeof controller?.raw.computeColliderMovement === "function" && typeof controller?.raw.computedMovement === "function",
    runtimeBackend: diagnostics?.renderer?.runtime.backend,
    steps,
    position,
    ...(lastMovement ? { lastMovement } : {}),
    totalCollisions,
    groundedFrames,
    reachedAutostep: position[1] > PHYSICS.start[1] + 0.2,
    drawCalls: diagnostics?.drawCalls ?? 0,
    errors: diagnostics?.errors ?? [],
    knownLimits
  };
  window.__AURA3D_RAPIER_CHARACTER_LAB__ = evidence;
  document.body.dataset.aura3dReady = String(status === "ready" || status === "complete");
  document.documentElement.dataset.auraRouteStatus = status;
  const stateNode = document.querySelector<HTMLElement>("[data-testid='rapier-state']");
  if (stateNode) stateNode.textContent = status;
  const progress = document.querySelector<HTMLElement>("[data-testid='rapier-progress']");
  if (progress) progress.style.width = `${Math.min(100, steps / PHYSICS.traceSteps * 100)}%`;
  const metrics = document.querySelector<HTMLElement>("[data-testid='rapier-metrics']");
  if (metrics) metrics.innerHTML = `<span><strong>${steps}/${PHYSICS.traceSteps}</strong> native steps</span><span><strong>${totalCollisions}</strong> contacts</span><span><strong>${groundedFrames}</strong> grounded frames</span><span><strong>${evidence.reachedAutostep ? "CLEARED" : "APPROACH"}</strong> 0.30m obstacle</span>`;
  const vector = document.querySelector<HTMLElement>("[data-testid='rapier-position']");
  if (vector) vector.textContent = position.map((value) => value.toFixed(3)).join("  ");
}

function dispose(): { worldDisposed: boolean; bodiesReleased: boolean } {
  running = false;
  if (presentHandle) window.clearInterval(presentHandle);
  presentHandle = 0;
  controller?.dispose();
  world?.dispose();
  app?.dispose();
  return { worldDisposed: world?.disposed ?? true, bodiesReleased: (world?.bodies().length ?? 0) === 0 };
}

function fail(error: unknown): void {
  status = "error";
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  window.__AURA3D_RAPIER_CHARACTER_LAB__ = {
    id: "rapier-character-lab", status, claim: "optional-selected-rapier-physical-character", assetId: CHARACTER.id,
    assetHash: CHARACTER.hash, packageOwner: "@aura3d/physics-rapier", nativeCharacterController: false, steps, position: PHYSICS.start,
    totalCollisions, groundedFrames, reachedAutostep: false, drawCalls: 0, errors: [message], knownLimits, error: message
  };
  document.documentElement.dataset.auraRouteStatus = "error";
}

function installShell(): void {
  document.body.innerHTML = `<main><section class="stage"><canvas id="rapier-character-canvas" data-testid="rapier-character-canvas" aria-label="Typed runner traversing a Rapier-controlled autostep obstacle"></canvas><div class="eyebrow"><i></i> OPTIONAL ADAPTER · NATIVE RAPIER</div><div class="state">STATE · <strong data-testid="rapier-state">loading</strong></div><div class="title"><p>PHYSICAL CHARACTER 04</p><h1>Ground truth,<br>underfoot.</h1><span>Typed GLB visuals. Native kinematic collision.</span></div><div class="course"><b>START</b><span></span><b>AUTOSTEP 0.30m</b><span></span><b>FINISH</b></div></section><aside><div><p class="kicker">SELECTED PHYSICS OWNER</p><h2>Rapier moves it.<br>Aura presents it.</h2><p class="lede">The character is a real typed GLB. Its capsule, ground snap, slope rule, collision response, and autostep come from the separately shipped Rapier adapter.</p></div><div class="progress"><span data-testid="rapier-progress"></span></div><div class="controls"><button data-testid="rapier-run">Run autostep trace</button><button data-testid="rapier-step">Single step</button><button data-testid="rapier-reset">Reset</button></div><div class="metrics" data-testid="rapier-metrics"><span>initializing WASM</span></div><div class="vector"><small>NATIVE BODY POSITION</small><code data-testid="rapier-position">—</code></div><div class="keys"><kbd>D</kbd><span>single physical step</span><kbd>R</kbd><span>reset trace</span></div><p class="limit">Bounded proof: one deterministic Rapier kinematic-capsule ground/autostep trace through <code>@aura3d/physics-rapier</code>. This is not root-engine physics or universal character-controller parity.</p></aside></main>`;
  const style = document.createElement("style");
  style.textContent = `:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#05080d;color:#eef6fa}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#05080d}body{overflow:hidden}main{min-height:100vh;display:grid;grid-template-columns:minmax(0,1fr)26rem}.stage{position:relative;min-width:0;overflow:hidden;background:radial-gradient(circle at 45% 34%,#193344,#05080d 72%)}canvas{display:block;width:100%;height:100vh}.eyebrow,.state,.title,.course{position:absolute;z-index:3;pointer-events:none}.eyebrow{top:1.45rem;left:1.55rem;display:flex;align-items:center;gap:.55rem;color:#a5c2cf;font:700 .67rem/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.14em}.eyebrow i{width:.5rem;height:.5rem;border-radius:50%;background:#67e8f9;box-shadow:0 0 18px #67e8f9}.state{top:1.35rem;right:1.4rem;padding:.62rem .75rem;border:1px solid #416175;background:#071018cc;color:#89a7b6;font:650 .66rem/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em;text-transform:uppercase}.state strong{color:#67e5d8}.title{left:1.6rem;bottom:1.5rem;text-shadow:0 2px 20px #05080d}.title p,.kicker{margin:0 0 .45rem;color:#f2b85f;font:700 .68rem/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.16em}.title h1{margin:0;font-size:clamp(2.65rem,5vw,4.8rem);line-height:.91;letter-spacing:-.06em;font-weight:540}.title span{display:block;margin-top:.72rem;color:#bad0da}.course{left:18%;right:18%;top:15%;display:grid;grid-template-columns:auto 1fr auto 1fr auto;align-items:center;gap:.55rem;color:#6e8c99;font:700 .55rem/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.12em}.course span{height:1px;background:linear-gradient(90deg,#67e8f9,#d97706)}aside{position:relative;z-index:10;display:flex;flex-direction:column;gap:1.35rem;padding:2.05rem 1.85rem 1.4rem;border-left:1px solid #263d4a;background:linear-gradient(155deg,#10232d 0%,#081218 80%);box-shadow:-20px 0 60px #02070a77}h2{margin:0;font-size:2.45rem;line-height:1;letter-spacing:-.052em;font-weight:540}.lede{color:#96aeb9;font-size:.91rem;line-height:1.56}.progress{height:.34rem;background:#172b35;overflow:hidden}.progress span{display:block;width:0;height:100%;background:linear-gradient(90deg,#67e8f9,#fbbf24);transition:width .12s linear}.controls{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}.controls button:first-child{grid-column:1/-1}.controls button{min-height:2.8rem;border:1px solid #416173;border-radius:.35rem;background:#102532;color:#d7e7ed;font:650 .7rem/1.2 inherit;cursor:pointer}.controls button:first-child{border-color:#cc7b24;background:#39210e;color:#ffd28f}.controls button:disabled{opacity:.4;cursor:not-allowed}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}.metrics span{min-height:3.65rem;display:flex;flex-direction:column;justify-content:center;padding:.62rem;border:1px solid #29424e;background:#061117bd;color:#6f8c98;font:600 .61rem/1.3 ui-monospace,SFMono-Regular,monospace;text-transform:uppercase}.metrics strong{color:#eef8fa;font-size:.92rem}.vector{padding:.85rem;border:1px solid #29424e;background:#071219}.vector small{display:block;margin-bottom:.42rem;color:#64828e;font:700 .58rem/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em}.vector code{color:#9ae6e8;font-size:.76rem}.keys{display:grid;grid-template-columns:auto 1fr;gap:.45rem .65rem;align-items:center;color:#78939e;font-size:.68rem}.keys kbd{display:inline-grid;place-items:center;width:1.75rem;height:1.55rem;border:1px solid #496472;border-bottom-width:2px;border-radius:.25rem;background:#0c1b23;color:#d6e8ed;font:700 .65rem ui-monospace,monospace}.limit{margin-top:auto;padding-top:.9rem;border-top:1px solid #263d47;color:#5e7883;font-size:.64rem;line-height:1.48}.limit code{color:#7895a1}@media(max-width:860px){body{overflow:auto}main{grid-template-columns:1fr}canvas{height:68vh;min-height:30rem}aside{border-left:0;border-top:1px solid #263d4a}}`;
  document.head.append(style);
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

export {};
