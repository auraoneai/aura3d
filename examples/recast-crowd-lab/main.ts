import { camera, createAuraApp, game, lights, material, model, primitives, scene, type AuraApp } from "@aura3d/engine";
import { createRecastNavigation, type NavigationVec3, type RecastCrowdHandle, type RecastNavMeshHandle } from "@aura3d/navigation-recast";
import { assets } from "../../src/aura-assets.js";

const CITY = assets.showcaseSkylineCity;
const CHARACTER = assets.showcaseAnimatedRunnerHero;
const CLIP = CHARACTER.metadata?.animationClips?.includes("OffensiveIdle") ? "OffensiveIdle" : CHARACTER.metadata?.animationClips?.[0] ?? "";
const NAVIGATION = {
  starts: [[-4.1, 0, -0.9], [-4.25, 0, -0.3], [-4.1, 0, 0.3], [-4.25, 0, 0.9], [-3.65, 0, -0.6], [-3.65, 0, 0.6]] as const,
  targets: [[4.1, 0, 0.9], [4.25, 0, 0.3], [4.1, 0, -0.3], [4.25, 0, -0.9], [3.65, 0, 0.6], [3.65, 0, -0.6]] as const,
  traceSteps: 210,
  pulseSteps: 15,
  dt: 1 / 60,
  agent: { radius: 0.18, height: 1.25, maxSpeed: 2.4, maxAcceleration: 8, collisionQueryRange: 1.5, pathOptimizationRange: 4, separationWeight: 1.2 }
} as const;
const SOUP = createWalkableSoup();

interface RecastCrowdEvidence {
  readonly id: "recast-crowd-lab";
  readonly status: "loading" | "ready" | "running" | "complete" | "error";
  readonly claim: "optional-selected-recast-navigation-crowd";
  readonly assets: readonly { readonly id: string; readonly hash: string }[];
  readonly packageOwner: "@aura3d/navigation-recast";
  readonly nativeCrowd: boolean;
  readonly nativePathQuery: boolean;
  readonly runtimeBackend?: string;
  readonly steps: number;
  readonly path: readonly NavigationVec3[];
  readonly positions: readonly NavigationVec3[];
  readonly splitAroundObstacle: boolean;
  readonly serializedNavMeshBytes: number;
  readonly drawCalls: number;
  readonly resets: number;
  readonly errors: readonly string[];
  readonly knownLimits: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_RECAST_CROWD_LAB__?: RecastCrowdEvidence;
    __AURA3D_RECAST_CROWD_DISPOSE__?: () => { crowdDisposed: boolean; navMeshDisposed: boolean; visualDisposed: boolean };
  }
}

const knownLimits = [
  "This proves the selected optional Recast/Detour adapter on one generated navmesh, native path query, and deterministic six-agent crowd trace.",
  "It does not claim root createAuraApp navigation, arbitrary navmesh authoring, off-mesh links, temporary obstacles, visual, draw-call, or performance parity."
] as const;

let app: AuraApp | undefined;
let navMesh: RecastNavMeshHandle | undefined;
let crowd: RecastCrowdHandle | undefined;
let path: readonly NavigationVec3[] = [];
let status: RecastCrowdEvidence["status"] = "loading";
let steps = 0;
let resets = 0;
let running = false;
let serializedNavMeshBytes = 0;
let presentHandle = 0;

installShell();
publish();
void boot().catch(fail);

async function boot(): Promise<void> {
  if (!CLIP) throw new Error("The typed runner asset has no animation clips.");
  const navigation = await createRecastNavigation();
  navMesh = navigation.generateSolo(SOUP, {});
  const query = navMesh.computePath(NAVIGATION.starts[0], NAVIGATION.targets[0]);
  if (!query.success) throw new Error(query.error ?? "Native Detour path query failed.");
  path = query.points;
  serializedNavMeshBytes = navMesh.serialize().byteLength;
  createCrowd();
  app = await createVisual();
  syncVisual();
  bindControls();
  status = "ready";
  startPresentLoop();
  publish();
  window.__AURA3D_RECAST_CROWD_DISPOSE__ = dispose;
  window.addEventListener("beforeunload", dispose, { once: true });
}

function createCrowd(): void {
  if (!navMesh) throw new Error("Cannot create a crowd before its navmesh.");
  crowd?.dispose();
  const next = navMesh.createCrowd(16, 0.25);
  NAVIGATION.starts.forEach((start, index) => {
    const agent = next.addAgent(start, NAVIGATION.agent);
    if (!next.requestMoveTarget(agent, NAVIGATION.targets[index]!)) throw new Error(`Native crowd agent ${index} rejected its target.`);
  });
  crowd = next;
}

async function createVisual(): Promise<AuraApp> {
  let builder = scene()
    .background("#05070b")
    .camera(camera.perspective({ position: [0, 7.2, 11.5], target: [0, 0.25, -0.5], fov: 42 }))
    .add(lights.ambient({ intensity: 0.42, color: "#ffffff" }))
    .add(lights.directional({ name: "crowd key", position: [7, 13, 8], intensity: 2.4, color: "#fff4e6" }))
    .add(model(CITY, { name: "typed skyline context", scaleMode: "fit", targetHeight: 3.5, castShadow: false, receiveShadow: false }).position(0, 0, -6.2))
    .add(primitives.box({ name: "walkable navigation deck", material: material.pbr({ color: "#273244", roughness: 0.82 }) }).position(0, -0.08, 0).scale([10, 0.16, 6]))
    .add(primitives.box({ name: "unwalkable central obstacle", material: material.pbr({ color: "#d97706", roughness: 0.55 }) }).position(0, 0.5, 0).scale([2, 1, 3]))
    .add(primitives.box({ name: "start gate", material: material.neon({ color: "#67e8f9", emissive: "#67e8f9", emissiveIntensity: 1.35 }) }).position(-4.35, 0.02, 0).scale([0.06, 0.04, 2.6]))
    .add(primitives.box({ name: "destination gate", material: material.neon({ color: "#fbbf24", emissive: "#fbbf24", emissiveIntensity: 1.35 }) }).position(4.35, 0.02, 0).scale([0.06, 0.04, 2.6]))
    .add(model(CHARACTER, { name: "typed lead crowd actor", scaleMode: "fit", targetHeight: 1.25, castShadow: false, receiveShadow: false })
      .animate({ clip: CLIP, loop: true, captureTime: 0.2 })
      .runtime(game.runtimeNode("crowd-lead", { tags: ["typed-glb", "selected-recast", "native-crowd"] })));
  for (let index = 1; index < NAVIGATION.starts.length; index += 1) {
    builder = builder.add(primitives.sphere({ name: `native crowd agent ${index + 1}`, material: material.pbr({ color: index % 2 ? "#38bdf8" : "#a78bfa", roughness: 0.4 }) }).scale(0.44).runtime(game.runtimeNode(`crowd-${index}`, { tags: ["selected-recast", "native-crowd"] })));
  }
  const next = createAuraApp("#recast-crowd-canvas", {
    autoStart: false,
    resize: true,
    pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: builder
  });
  await next.ready();
  return next;
}

async function runTrace(): Promise<void> {
  if (running || status === "loading" || status === "error") return;
  if (steps >= NAVIGATION.traceSteps) reset();
  running = true;
  status = "running";
  setControls();
  while (steps < NAVIGATION.traceSteps && running) {
    advance(Math.min(4, NAVIGATION.traceSteps - steps));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  running = false;
  status = steps >= NAVIGATION.traceSteps ? "complete" : "ready";
  setControls();
  publish();
}

function advance(count = NAVIGATION.pulseSteps): void {
  if (!crowd || !app || steps >= NAVIGATION.traceSteps) return;
  const accepted = Math.min(count, NAVIGATION.traceSteps - steps);
  for (let index = 0; index < accepted; index += 1) crowd.update(NAVIGATION.dt);
  steps += accepted;
  syncVisual();
  status = steps >= NAVIGATION.traceSteps ? "complete" : running ? "running" : "ready";
  publish();
}

function reset(): void {
  if (!navMesh || !app) return;
  running = false;
  createCrowd();
  steps = 0;
  resets += 1;
  status = "ready";
  syncVisual();
  setControls();
  publish();
}

function syncVisual(): void {
  if (!crowd || !app) return;
  crowd.positions().forEach((position, index) => {
    const node = app!.nodes.require(index === 0 ? "crowd-lead" : `crowd-${index}`);
    node.setPosition(position[0], index === 0 ? position[1] : position[1] + 0.22, position[2]);
    if (index === 0) node.play(CLIP, { loop: true, captureTime: 0.2 + steps / 168 });
  });
  app.step(NAVIGATION.dt);
}

function bindControls(): void {
  requiredElement<HTMLButtonElement>("[data-testid='crowd-run']").addEventListener("click", () => void runTrace());
  requiredElement<HTMLButtonElement>("[data-testid='crowd-pulse']").addEventListener("click", () => advance());
  requiredElement<HTMLButtonElement>("[data-testid='crowd-reset']").addEventListener("click", reset);
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyN") { event.preventDefault(); void runTrace(); }
    if (event.code === "Space") { event.preventDefault(); advance(); }
    if (event.code === "KeyR") { event.preventDefault(); reset(); }
  });
  setControls();
}

function setControls(): void {
  const run = document.querySelector<HTMLButtonElement>("[data-testid='crowd-run']");
  const pulse = document.querySelector<HTMLButtonElement>("[data-testid='crowd-pulse']");
  if (run) { run.disabled = running; run.textContent = steps >= NAVIGATION.traceSteps ? "Run again" : running ? "Routing crowd…" : "Run crowd trace"; }
  if (pulse) pulse.disabled = running || steps >= NAVIGATION.traceSteps;
}

function startPresentLoop(): void {
  if (presentHandle) window.clearInterval(presentHandle);
  presentHandle = window.setInterval(() => { if (app && !running && status !== "error") app.step(0); }, 100);
}

function publish(): void {
  const positions = crowd?.positions() ?? NAVIGATION.starts;
  const diagnostics = app?.diagnostics();
  const splitAroundObstacle = steps >= NAVIGATION.traceSteps && positions.some((position) => position[2] > 0.8) && positions.some((position) => position[2] < -0.8) && positions.every((position) => Math.abs(position[0]) > 1 || Math.abs(position[2]) >= 1.2);
  const evidence: RecastCrowdEvidence = {
    id: "recast-crowd-lab",
    status,
    claim: "optional-selected-recast-navigation-crowd",
    assets: [{ id: CITY.id, hash: CITY.hash }, { id: CHARACTER.id, hash: CHARACTER.hash }],
    packageOwner: "@aura3d/navigation-recast",
    nativeCrowd: typeof crowd?.unsafeRecastCrowd().update === "function",
    nativePathQuery: path.length > 1,
    runtimeBackend: diagnostics?.renderer?.runtime.backend,
    steps,
    path,
    positions,
    splitAroundObstacle,
    serializedNavMeshBytes,
    drawCalls: diagnostics?.drawCalls ?? 0,
    resets,
    errors: diagnostics?.errors ?? [],
    knownLimits
  };
  window.__AURA3D_RECAST_CROWD_LAB__ = evidence;
  document.body.dataset.aura3dReady = String(status === "ready" || status === "complete");
  document.documentElement.dataset.auraRouteStatus = status;
  const stateNode = document.querySelector<HTMLElement>("[data-testid='crowd-state']");
  if (stateNode) stateNode.textContent = status;
  const progress = document.querySelector<HTMLElement>("[data-testid='crowd-progress']");
  if (progress) progress.style.width = `${Math.min(100, steps / NAVIGATION.traceSteps * 100)}%`;
  const metrics = document.querySelector<HTMLElement>("[data-testid='crowd-metrics']");
  if (metrics) metrics.innerHTML = `<span><strong>${steps}/${NAVIGATION.traceSteps}</strong> native ticks</span><span><strong>${positions.length}</strong> live agents</span><span><strong>${path.length}</strong> path corners</span><span><strong>${splitAroundObstacle ? "SPLIT" : "FORMING"}</strong> obstacle flow</span>`;
  const lead = document.querySelector<HTMLElement>("[data-testid='crowd-lead-position']");
  if (lead) lead.textContent = positions[0]!.map((value) => value.toFixed(3)).join("  ");
  const mesh = document.querySelector<HTMLElement>("[data-testid='crowd-mesh-bytes']");
  if (mesh) mesh.textContent = serializedNavMeshBytes ? `${serializedNavMeshBytes.toLocaleString()} BYTES · NATIVE DETOUR` : "GENERATING WASM NAVMESH";
}

function dispose(): { crowdDisposed: boolean; navMeshDisposed: boolean; visualDisposed: boolean } {
  running = false;
  if (presentHandle) window.clearInterval(presentHandle);
  presentHandle = 0;
  crowd?.dispose();
  navMesh?.dispose();
  app?.dispose();
  return { crowdDisposed: true, navMeshDisposed: navMesh?.disposed ?? true, visualDisposed: true };
}

function fail(error: unknown): void {
  status = "error";
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  window.__AURA3D_RECAST_CROWD_LAB__ = {
    id: "recast-crowd-lab", status, claim: "optional-selected-recast-navigation-crowd",
    assets: [{ id: CITY.id, hash: CITY.hash }, { id: CHARACTER.id, hash: CHARACTER.hash }], packageOwner: "@aura3d/navigation-recast",
    nativeCrowd: false, nativePathQuery: false, steps, path, positions: [], splitAroundObstacle: false, serializedNavMeshBytes,
    drawCalls: 0, resets, errors: [message], knownLimits, error: message
  };
  document.documentElement.dataset.auraRouteStatus = "error";
}

function createWalkableSoup(): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  const quad = (x0: number, z0: number, x1: number, z1: number): void => {
    const base = positions.length / 3;
    positions.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  quad(-5, -3, -1, 3); quad(1, -3, 5, 3); quad(-1, -3, 1, -1.5); quad(-1, 1.5, 1, 3);
  return { positions, indices };
}

function installShell(): void {
  document.body.innerHTML = `<main><section class="stage"><canvas id="recast-crowd-canvas" data-testid="recast-crowd-canvas" aria-label="Six native Recast crowd agents navigating around a central obstacle"></canvas><div class="eyebrow"><i></i> OPTIONAL ADAPTER · RECAST / DETOUR</div><div class="state">STATE · <strong data-testid="crowd-state">loading</strong></div><div class="route"><b>SPAWN</b><span></span><em>UNWALKABLE</em><span></span><b>GOAL</b></div><div class="title"><p>NAVIGATION CROWD 05</p><h1>One route.<br>Six decisions.</h1><span>Native navmesh query. Native local avoidance.</span></div></section><aside><div><p class="kicker">SELECTED NAVIGATION OWNER</p><h2>Detour finds the way.<br>Aura shows the stakes.</h2><p class="lede">A typed lead character and five live markers share one generated Recast navmesh, route around an excluded center, and resolve crowd motion in native WASM.</p></div><div class="mesh" data-testid="crowd-mesh-bytes">GENERATING WASM NAVMESH</div><div class="progress"><span data-testid="crowd-progress"></span></div><div class="controls"><button data-testid="crowd-run">Run crowd trace</button><button data-testid="crowd-pulse">Pulse 15 ticks</button><button data-testid="crowd-reset">Reset</button></div><div class="metrics" data-testid="crowd-metrics"><span>initializing crowd</span></div><div class="vector"><small>LEAD AGENT POSITION</small><code data-testid="crowd-lead-position">—</code></div><div class="keys"><kbd>N</kbd><span>run native trace</span><kbd>SPACE</kbd><span>pulse 15 ticks</span><kbd>R</kbd><span>reset crowd</span></div><p class="limit">Bounded proof: one deterministic six-agent Recast/Detour crowd trace through <code>@aura3d/navigation-recast</code>. This is not root-engine navigation or broad navigation parity.</p></aside></main>`;
  const style = document.createElement("style");
  style.textContent = `:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#05070b;color:#eef6fa}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#05070b}body{overflow:hidden}main{min-height:100vh;display:grid;grid-template-columns:minmax(0,1fr)26rem}.stage{position:relative;min-width:0;overflow:hidden;background:radial-gradient(circle at 50% 35%,#172c3d,#05070b 72%)}canvas{display:block;width:100%;height:100vh}.eyebrow,.state,.title,.route{position:absolute;z-index:3;pointer-events:none}.eyebrow{top:1.45rem;left:1.55rem;display:flex;align-items:center;gap:.55rem;color:#a5c2cf;font:700 .67rem/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.14em}.eyebrow i{width:.5rem;height:.5rem;border-radius:50%;background:#a78bfa;box-shadow:0 0 18px #a78bfa}.state{top:1.35rem;right:1.4rem;padding:.62rem .75rem;border:1px solid #416175;background:#071018cc;color:#89a7b6;font:650 .66rem/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em;text-transform:uppercase}.state strong{color:#67e5d8}.title{left:1.6rem;bottom:1.5rem;text-shadow:0 2px 20px #05070b}.title p,.kicker{margin:0 0 .45rem;color:#f2b85f;font:700 .68rem/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.16em}.title h1{margin:0;font-size:clamp(2.65rem,5vw,4.8rem);line-height:.91;letter-spacing:-.06em;font-weight:540}.title span{display:block;margin-top:.72rem;color:#bad0da}.route{left:18%;right:18%;top:14%;display:grid;grid-template-columns:auto 1fr auto 1fr auto;align-items:center;gap:.55rem;color:#718d99;font:700 .55rem/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.12em}.route span{height:1px;background:linear-gradient(90deg,#67e8f9,#a78bfa,#fbbf24)}.route em{font-style:normal;color:#d8933e}aside{position:relative;z-index:10;display:flex;flex-direction:column;gap:1.12rem;padding:2.05rem 1.85rem 1.4rem;border-left:1px solid #263d4a;background:linear-gradient(155deg,#11212e 0%,#081218 80%);box-shadow:-20px 0 60px #02070a77}h2{margin:0;font-size:2.25rem;line-height:1;letter-spacing:-.052em;font-weight:540}.lede{color:#96aeb9;font-size:.88rem;line-height:1.52}.mesh{padding:.65rem;border:1px solid #3c5362;background:#091821;color:#9bb5c0;font:700 .61rem/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.08em}.progress{height:.34rem;background:#172b35;overflow:hidden}.progress span{display:block;width:0;height:100%;background:linear-gradient(90deg,#67e8f9,#a78bfa,#fbbf24);transition:width .12s linear}.controls{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}.controls button:first-child{grid-column:1/-1}.controls button{min-height:2.65rem;border:1px solid #416173;border-radius:.35rem;background:#102532;color:#d7e7ed;font:650 .7rem/1.2 inherit;cursor:pointer}.controls button:first-child{border-color:#8567bd;background:#261a3c;color:#e5d8ff}.controls button:disabled{opacity:.4;cursor:not-allowed}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}.metrics span{min-height:3.45rem;display:flex;flex-direction:column;justify-content:center;padding:.62rem;border:1px solid #29424e;background:#061117bd;color:#6f8c98;font:600 .61rem/1.3 ui-monospace,SFMono-Regular,monospace;text-transform:uppercase}.metrics strong{color:#eef8fa;font-size:.92rem}.vector{padding:.82rem;border:1px solid #29424e;background:#071219}.vector small{display:block;margin-bottom:.42rem;color:#64828e;font:700 .58rem/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em}.vector code{color:#9ae6e8;font-size:.76rem}.keys{display:grid;grid-template-columns:auto 1fr;gap:.35rem .65rem;align-items:center;color:#78939e;font-size:.66rem}.keys kbd{display:inline-grid;place-items:center;min-width:1.75rem;height:1.45rem;padding:0 .35rem;border:1px solid #496472;border-bottom-width:2px;border-radius:.25rem;background:#0c1b23;color:#d6e8ed;font:700 .61rem ui-monospace,monospace}.limit{margin-top:auto;padding-top:.75rem;border-top:1px solid #263d47;color:#5e7883;font-size:.62rem;line-height:1.44}.limit code{color:#7895a1}@media(max-width:860px){body{overflow:auto}main{grid-template-columns:1fr}canvas{height:68vh;min-height:30rem}aside{border-left:0;border-top:1px solid #263d4a}}`;
  document.head.append(style);
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

export {};
