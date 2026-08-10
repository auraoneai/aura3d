import { camera, createAuraApp, game, lights, material, model, primitives, scene, type AuraApp } from "@aura3d/engine";
import { AudioClip, AudioSource, AudioSystem, SpatialAudio, type AudioSourceState } from "@aura3d/audio";
import { assets } from "../../src/aura-assets.js";

const HEADPHONES = assets.showcaseHeadphones;
const INITIAL = { left: [-2.5, 0.85, 0] as const, right: [2.5, 0.85, 0] as const };

interface SpatialAudioEvidence {
  readonly id: "spatial-audio-lab";
  readonly status: "ready" | "playing" | "complete" | "error";
  readonly claim: "public-browser-standard-spatial-audio";
  readonly assetId: string;
  readonly assetHash: string;
  readonly packageOwner: "@aura3d/audio";
  readonly contextState: string;
  readonly unlocked: boolean;
  readonly graphCreated: boolean;
  readonly panningModel?: string;
  readonly distanceModel?: string;
  readonly positions: { readonly left: readonly number[]; readonly right: readonly number[] };
  readonly sourceStates: { readonly left: AudioSourceState; readonly right: AudioSourceState };
  readonly plays: number;
  readonly swaps: number;
  readonly muted: boolean;
  readonly runtimeBackend?: string;
  readonly drawCalls: number;
  readonly errors: readonly string[];
  readonly knownLimits: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_SPATIAL_AUDIO_LAB__?: SpatialAudioEvidence;
    __AURA3D_SPATIAL_AUDIO_DISPOSE__?: () => Promise<{ contextClosed: boolean; sourcesDisposed: boolean; pannersDisconnected: boolean; visualDisposed: boolean }>;
  }
}

const knownLimits = [
  "This proves a user-unlocked browser AudioContext, Aura mixer bus, two AudioSource clips, and two HRTF SpatialAudio panners with live positions.",
  "The 3D stage visualizes verified node state; pixels do not prove audibility, perceptual localization, speaker hardware, or cross-device acoustic parity."
] as const;

let app: AuraApp | undefined;
let system: AudioSystem | undefined;
let leftSpatial: SpatialAudio | undefined;
let rightSpatial: SpatialAudio | undefined;
let leftSource: AudioSource | undefined;
let rightSource: AudioSource | undefined;
let leftPosition: readonly [number, number, number] = INITIAL.left;
let rightPosition: readonly [number, number, number] = INITIAL.right;
let status: SpatialAudioEvidence["status"] = "ready";
let plays = 0;
let swaps = 0;
let muted = false;
let graphCreated = false;
let presentHandle = 0;

installShell();
publish();
void boot().catch(fail);

async function boot(): Promise<void> {
  app = createAuraApp("#spatial-audio-canvas", {
    autoStart: false,
    resize: true,
    pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#05070b")
      .camera(camera.perspective({ position: [0, 3.1, 8.5], target: [0, 0.8, 0], fov: 39 }))
      .add(lights.ambient({ intensity: 0.48, color: "#dbeafe" }))
      .add(lights.directional({ name: "audio key", position: [6, 10, 7], intensity: 3, color: "#fff2da" }))
      .add(lights.directional({ name: "audio front fill", position: [0, 4, 8], intensity: 2.6, color: "#e0f2fe" }))
      .add(lights.directional({ name: "audio rim", position: [-6, 4, -2], intensity: 1.4, color: "#8b5cf6" }))
      .add(primitives.box({ name: "acoustic stage", material: material.pbr({ color: "#172233", roughness: 0.72, metallic: 0.14 }) }).position(0, -0.08, 0).scale([9, 0.16, 4.2]))
      .add(model(HEADPHONES, { name: "typed listener headphones", scaleMode: "fit", targetHeight: 2, castShadow: false, receiveShadow: false }).position(0, 0, 0))
      .add(primitives.sphere({ name: "left HRTF emitter", material: material.neon({ color: "#22d3ee", emissive: "#22d3ee", emissiveIntensity: 1.8 }) }).scale(0.62).runtime(game.runtimeNode("audio-left", { tags: ["spatial-audio", "hrtf"] })))
      .add(primitives.sphere({ name: "right HRTF emitter", material: material.neon({ color: "#f59e0b", emissive: "#f59e0b", emissiveIntensity: 1.8 }) }).scale(0.62).runtime(game.runtimeNode("audio-right", { tags: ["spatial-audio", "hrtf"] })))
      .add(primitives.box({ name: "listener axis", material: material.neon({ color: "#a78bfa", emissive: "#a78bfa", emissiveIntensity: 1.2 }) }).position(0, 0.02, 1.2).scale([0.08, 0.04, 1.8]))
  });
  await app.ready();
  syncVisual();
  bindControls();
  startPresentLoop();
  publish();
  window.__AURA3D_SPATIAL_AUDIO_DISPOSE__ = dispose;
  window.addEventListener("beforeunload", () => void dispose(), { once: true });
}

async function ensureGraph(): Promise<void> {
  if (graphCreated) return;
  system = new AudioSystem();
  await system.unlock();
  const context = system.contextManager.context as AudioContext;
  const spatialBus = system.mixer.createBus("spatial");
  leftSpatial = new SpatialAudio({ context: system.contextManager.context, destination: spatialBus.input, position: vector(leftPosition), maxDistance: 16, refDistance: 1.2, rolloffFactor: 1.15 });
  rightSpatial = new SpatialAudio({ context: system.contextManager.context, destination: spatialBus.input, position: vector(rightPosition), maxDistance: 16, refDistance: 1.2, rolloffFactor: 1.15 });
  leftSource = new AudioSource({ context: system.contextManager.context, destination: leftSpatial.panner, clip: new AudioClip({ name: "left-330hz", buffer: tone(context, 330) }), volume: 0.035 });
  rightSource = new AudioSource({ context: system.contextManager.context, destination: rightSpatial.panner, clip: new AudioClip({ name: "right-523hz", buffer: tone(context, 523) }), volume: 0.035 });
  graphCreated = true;
}

async function playSweep(): Promise<void> {
  if (status === "playing") return;
  await ensureGraph();
  if (!system || !leftSource || !rightSource) return;
  if (system.contextManager.state !== "running") await system.resume();
  status = "playing";
  plays += 1;
  leftSource.play();
  rightSource.play(system.contextManager.context.currentTime + 0.22);
  publish();
  await new Promise((resolve) => setTimeout(resolve, 650));
  status = "complete";
  swapEmitters(false);
  publish();
}

function swapEmitters(count = true): void {
  [leftPosition, rightPosition] = [rightPosition, leftPosition];
  leftSpatial?.setPosition(vector(leftPosition));
  rightSpatial?.setPosition(vector(rightPosition));
  if (count) swaps += 1;
  syncVisual();
  publish();
}

function reset(): void {
  leftPosition = INITIAL.left;
  rightPosition = INITIAL.right;
  leftSpatial?.setPosition(vector(leftPosition));
  rightSpatial?.setPosition(vector(rightPosition));
  leftSource?.stop();
  rightSource?.stop();
  status = "ready";
  swaps = 0;
  syncVisual();
  publish();
}

function toggleMute(): void {
  if (!system) return;
  muted = !muted;
  system.mixer.getBus("spatial").mute(muted);
  publish();
}

function syncVisual(): void {
  if (!app) return;
  app.nodes.require("audio-left").setPosition(...leftPosition);
  app.nodes.require("audio-right").setPosition(...rightPosition);
  app.step(1 / 60);
}

function bindControls(): void {
  requiredElement<HTMLButtonElement>("[data-testid='audio-play']").addEventListener("click", () => void playSweep().catch(fail));
  requiredElement<HTMLButtonElement>("[data-testid='audio-swap']").addEventListener("click", () => swapEmitters());
  requiredElement<HTMLButtonElement>("[data-testid='audio-mute']").addEventListener("click", toggleMute);
  requiredElement<HTMLButtonElement>("[data-testid='audio-reset']").addEventListener("click", reset);
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyP") { event.preventDefault(); void playSweep().catch(fail); }
    if (event.code === "KeyS") { event.preventDefault(); swapEmitters(); }
    if (event.code === "KeyM") { event.preventDefault(); toggleMute(); }
    if (event.code === "KeyR") { event.preventDefault(); reset(); }
  });
}

function publish(): void {
  const diagnostics = app?.diagnostics();
  const evidence: SpatialAudioEvidence = {
    id: "spatial-audio-lab", status, claim: "public-browser-standard-spatial-audio",
    assetId: HEADPHONES.id, assetHash: HEADPHONES.hash, packageOwner: "@aura3d/audio",
    contextState: system?.contextManager.state ?? "locked", unlocked: system?.contextManager.state === "running",
    graphCreated, panningModel: leftSpatial?.panner.panningModel, distanceModel: leftSpatial?.panner.distanceModel,
    positions: { left: leftPosition, right: rightPosition },
    sourceStates: { left: leftSource?.state ?? "idle", right: rightSource?.state ?? "idle" },
    plays, swaps, muted, runtimeBackend: diagnostics?.renderer?.runtime.backend, drawCalls: diagnostics?.drawCalls ?? 0,
    errors: diagnostics?.errors ?? [], knownLimits
  };
  window.__AURA3D_SPATIAL_AUDIO_LAB__ = evidence;
  document.body.dataset.aura3dReady = "true";
  document.documentElement.dataset.auraRouteStatus = status;
  const state = document.querySelector<HTMLElement>("[data-testid='audio-state']"); if (state) state.textContent = status;
  const graph = document.querySelector<HTMLElement>("[data-testid='audio-graph']"); if (graph) graph.textContent = graphCreated ? `${evidence.panningModel} · ${evidence.distanceModel} · ${evidence.contextState}` : "USER GESTURE REQUIRED · CONTEXT LOCKED";
  const metrics = document.querySelector<HTMLElement>("[data-testid='audio-metrics']"); if (metrics) metrics.innerHTML = `<span><strong>${plays}</strong> spatial sweeps</span><span><strong>${swaps}</strong> manual swaps</span><span><strong>${evidence.unlocked ? "RUNNING" : "LOCKED"}</strong> audio context</span><span><strong>${muted ? "MUTED" : "LIVE"}</strong> spatial bus</span>`;
  const positions = document.querySelector<HTMLElement>("[data-testid='audio-positions']"); if (positions) positions.textContent = `L ${leftPosition[0].toFixed(1)}  ·  R ${rightPosition[0].toFixed(1)}`;
  const mute = document.querySelector<HTMLButtonElement>("[data-testid='audio-mute']"); if (mute) mute.textContent = muted ? "Unmute bus" : "Mute bus";
}

async function dispose(): Promise<{ contextClosed: boolean; sourcesDisposed: boolean; pannersDisconnected: boolean; visualDisposed: boolean }> {
  if (presentHandle) window.clearInterval(presentHandle);
  presentHandle = 0;
  leftSource?.dispose(); rightSource?.dispose(); leftSpatial?.dispose(); rightSpatial?.dispose();
  await system?.dispose(); app?.dispose();
  return { contextClosed: system?.contextManager.state === "closed" || !system, sourcesDisposed: true, pannersDisconnected: true, visualDisposed: true };
}

function startPresentLoop(): void { presentHandle = window.setInterval(() => { if (app && status !== "error") app.step(0); }, 100); }
function vector(value: readonly [number, number, number]): { x: number; y: number; z: number } { return { x: value[0], y: value[1], z: value[2] }; }
function tone(context: AudioContext, frequency: number): AudioBuffer { const frames = Math.floor(context.sampleRate * 0.18); const buffer = context.createBuffer(1, frames, context.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < frames; i += 1) data[i] = Math.sin(i / context.sampleRate * Math.PI * 2 * frequency) * Math.sin(Math.PI * i / frames); return buffer; }
function fail(error: unknown): void { status = "error"; const message = error instanceof Error ? error.stack ?? error.message : String(error); publish(); window.__AURA3D_SPATIAL_AUDIO_LAB__ = { ...window.__AURA3D_SPATIAL_AUDIO_LAB__!, status, errors: [message], error: message }; document.documentElement.dataset.auraRouteStatus = "error"; }

function installShell(): void {
  document.body.innerHTML = `<main><section class="stage"><canvas id="spatial-audio-canvas" data-testid="spatial-audio-canvas" aria-label="Two verified HRTF spatial audio emitters around a typed headphone listener"></canvas><div class="eyebrow"><i></i> WEB AUDIO · PACKAGE-OWNED GRAPH</div><div class="state">STATE · <strong data-testid="audio-state">ready</strong></div><div class="axis"><b>LEFT EMITTER</b><span></span><em>LISTENER</em><span></span><b>RIGHT EMITTER</b></div><div class="title"><p>SPATIAL AUDIO 06</p><h1>Place sound<br>in the scene.</h1><span>Real HRTF panners. Gesture-safe playback.</span></div></section><aside><div><p class="kicker">PUBLIC AUDIO SURFACE</p><h2>Pixels show position.<br>Web Audio makes it spatial.</h2><p class="lede">Two procedural clips route through Aura AudioSource nodes, separate browser HRTF panners, one spatial mixer bus, and a user-unlocked context.</p></div><div class="graph" data-testid="audio-graph">USER GESTURE REQUIRED · CONTEXT LOCKED</div><div class="controls"><button data-testid="audio-play">Play spatial sweep</button><button data-testid="audio-swap">Swap emitters</button><button data-testid="audio-mute">Mute bus</button><button data-testid="audio-reset">Reset</button></div><div class="metrics" data-testid="audio-metrics"><span><strong>0</strong> spatial sweeps</span></div><div class="vector"><small>LIVE PANNER X POSITIONS</small><code data-testid="audio-positions">L -2.5 · R 2.5</code></div><div class="keys"><kbd>P</kbd><span>play sweep</span><kbd>S</kbd><span>swap emitters</span><kbd>M</kbd><span>mute bus</span><kbd>R</kbd><span>reset positions</span></div><p class="limit">Bounded proof: actual package-owned Web Audio graph and live HRTF node state. The visual is explanatory UI; it does not prove audibility, localization perception, speaker hardware, or acoustic parity.</p></aside></main>`;
  const style = document.createElement("style"); style.textContent = `:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#05070b;color:#eef6fa}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#05070b}body{overflow:hidden}main{min-height:100vh;display:grid;grid-template-columns:minmax(0,1fr)26rem}.stage{position:relative;min-width:0;overflow:hidden;background:radial-gradient(circle at 50% 38%,#251c42,#05070b 72%)}canvas{display:block;width:100%;height:100vh}.eyebrow,.state,.title,.axis{position:absolute;z-index:3;pointer-events:none}.eyebrow{top:1.45rem;left:1.55rem;display:flex;align-items:center;gap:.55rem;color:#a5c2cf;font:700 .67rem/1.2 ui-monospace,monospace;letter-spacing:.14em}.eyebrow i{width:.5rem;height:.5rem;border-radius:50%;background:#22d3ee;box-shadow:0 0 18px #22d3ee}.state{top:1.35rem;right:1.4rem;padding:.62rem .75rem;border:1px solid #416175;background:#071018cc;color:#89a7b6;font:650 .66rem/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}.state strong{color:#67e5d8}.title{left:1.6rem;bottom:1.5rem;text-shadow:0 2px 20px #05070b}.title p,.kicker{margin:0 0 .45rem;color:#f2b85f;font:700 .68rem/1.2 ui-monospace,monospace;letter-spacing:.16em}.title h1{margin:0;font-size:clamp(2.65rem,5vw,4.8rem);line-height:.91;letter-spacing:-.06em;font-weight:540}.title span{display:block;margin-top:.72rem;color:#bad0da}.axis{left:14%;right:14%;top:15%;display:grid;grid-template-columns:auto 1fr auto 1fr auto;align-items:center;gap:.55rem;color:#7695a2;font:700 .54rem/1 ui-monospace,monospace;letter-spacing:.1em}.axis span{height:1px;background:linear-gradient(90deg,#22d3ee,#a78bfa,#f59e0b)}.axis em{font-style:normal;color:#c4b5fd}aside{position:relative;z-index:10;display:flex;flex-direction:column;gap:1.25rem;padding:2.05rem 1.85rem 1.4rem;border-left:1px solid #263d4a;background:linear-gradient(155deg,#13202d,#081218 80%);box-shadow:-20px 0 60px #02070a77}h2{margin:0;font-size:2.25rem;line-height:1;letter-spacing:-.052em;font-weight:540}.lede{color:#96aeb9;font-size:.88rem;line-height:1.52}.graph{padding:.72rem;border:1px solid #48546d;background:#0b1421;color:#b7c8d2;font:700 .61rem/1 ui-monospace,monospace;letter-spacing:.07em}.controls{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}.controls button:first-child{grid-column:1/-1}.controls button{min-height:2.65rem;border:1px solid #416173;border-radius:.35rem;background:#102532;color:#d7e7ed;font:650 .7rem/1.2 inherit;cursor:pointer}.controls button:first-child{border-color:#3f9eb2;background:#10303a;color:#bdf5ff}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}.metrics span{min-height:3.45rem;display:flex;flex-direction:column;justify-content:center;padding:.62rem;border:1px solid #29424e;background:#061117bd;color:#6f8c98;font:600 .61rem/1.3 ui-monospace,monospace;text-transform:uppercase}.metrics strong{color:#eef8fa;font-size:.9rem}.vector{padding:.85rem;border:1px solid #29424e;background:#071219}.vector small{display:block;margin-bottom:.42rem;color:#64828e;font:700 .58rem/1 ui-monospace,monospace;letter-spacing:.1em}.vector code{color:#9ae6e8;font-size:.76rem}.keys{display:grid;grid-template-columns:auto 1fr;gap:.36rem .65rem;align-items:center;color:#78939e;font-size:.66rem}.keys kbd{display:inline-grid;place-items:center;width:2rem;height:1.45rem;border:1px solid #496472;border-bottom-width:2px;border-radius:.25rem;background:#0c1b23;color:#d6e8ed;font:700 .61rem ui-monospace,monospace}.limit{margin-top:auto;padding-top:.8rem;border-top:1px solid #263d47;color:#5e7883;font-size:.62rem;line-height:1.44}@media(max-width:860px){body{overflow:auto}main{grid-template-columns:1fr}canvas{height:68vh;min-height:30rem}aside{border-left:0;border-top:1px solid #263d4a}}`; document.head.append(style);
}
function requiredElement<T extends Element>(selector: string): T { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing required element: ${selector}`); return element; }
export {};
