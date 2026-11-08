/**
 * Worker rendering lab (K1-K4 proof page, diagnostic). The scene renders in a dedicated worker
 * (`createWorkerRendererWorker`); the game logic stays on the main thread:
 *   - onFrame callbacks spin and orbit boxes and move the player from keyboard input (app.input),
 *   - every node change goes through app.nodes and reaches the worker as one patch per frame,
 *   - clicks (and a scripted self-test click) pick on the main thread with app.pick and recolour the hit box,
 *   - the camera follows the player through app.camera.setPose when the camera extension is present,
 *     otherwise through a camera patch.
 * `?worker=0` runs the same scene on the main thread for comparison. State is mirrored to body data attributes.
 */
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";
import { createWorkerRendererWorker } from "@aura3d/engine/worker";

const q = new URLSearchParams(location.search);
const useWorker = q.get("worker") !== "0";
const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const hud = document.querySelector<HTMLDivElement>("#hud")!;
const data = document.body.dataset;

const boxColors = { a: "#e8743b", b: "#3bb3e8", c: "#9be83b" } as const;
const build = () => scene()
  .background("#101820")
  .camera(camera.perspective({ position: [0, 4.5, 11], target: [0, 0.6, 0], fov: 45 }))
  .add(lights.ambient({ intensity: 0.35 }))
  .add(lights.directional({ intensity: 2.2, position: [5, 9, 6] }))
  .add(primitives.box({ name: "floor", size: [16, 0.2, 10], material: material.pbr({ color: "#2a3340", roughness: 0.9 }) }).position(0, -0.1, 0))
  .add(primitives.box({ name: "a", size: [1.4, 1.4, 1.4], material: material.pbr({ color: boxColors.a, roughness: 0.5 }) }).position(-3, 0.7, 0).runtime({ id: "a" }))
  .add(primitives.box({ name: "b", size: [1.4, 1.4, 1.4], material: material.pbr({ color: boxColors.b, roughness: 0.5 }) }).position(0, 0.7, -1.5).runtime({ id: "b" }))
  .add(primitives.box({ name: "c", size: [1, 1, 1], material: material.pbr({ color: boxColors.c, roughness: 0.5 }) }).position(3, 0.5, 0).runtime({ id: "c" }))
  .add(primitives.sphere({ name: "player", size: [1, 1, 1], material: material.pbr({ color: "#f2f2f2", roughness: 0.3, metallic: 0.1 }) }).position(0, 0.5, 2.5).runtime({ id: "player" }));

const app = createAuraApp(canvas, {
  scene: build(),
  ...(useWorker ? { worker: { createWorker: createWorkerRendererWorker, fallback: "main-thread" as const } } : {}),
  diagnostics: false
});
const execution = app.execution?.active ?? "main-thread";
data.workerLabExecution = execution;
if (app.execution?.fallbackReason) data.workerLabFallback = app.execution.fallbackReason;

const input = app.input({ actions: { left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"] } });
const a = app.nodes.require("a");
const b = app.nodes.require("b");
const c = app.nodes.require("c");
const player = app.nodes.require("player");

let t = 0;
let logicFrames = 0;
let playerX = 0;
let picked = "none";
const pickedIds: string[] = [];
const cam = (app as unknown as { camera?: { setPose?: (pose: { position: readonly number[]; target: readonly number[]; fov?: number }) => void } }).camera;

app.onFrame(({ dt }) => {
  logicFrames += 1;
  t += dt;
  a.setRotation(0, t * 1.2, 0);
  b.setRotation(t * 0.7, t * 0.9, 0);
  c.setPosition(3 * Math.cos(t * 0.8), 0.5 + 0.4 * Math.abs(Math.sin(t * 2)), 3 * Math.sin(t * 0.8) * 0.6);
  input.update(dt);
  if (input.held("left")) playerX -= dt * 4;
  if (input.held("right")) playerX += dt * 4;
  playerX = Math.max(-6, Math.min(6, playerX));
  player.setPosition(playerX, 0.5, 2.5);
  cam?.setPose?.({ position: [playerX * 0.4, 4.5, 11], target: [playerX * 0.4, 0.6, 0], fov: 45 });
});

const pickAt = (x: number, y: number): string => {
  const hit = app.pick?.(x, y);
  const id = hit?.nodeId ?? "none";
  if (hit?.nodeId && hit.nodeId in boxColors) {
    app.nodes.require(hit.nodeId).setMaterial(material.pbr({ color: "#ff2a6d", roughness: 0.4, emissive: "#ff2a6d", emissiveIntensity: 0.6 }) as never);
  }
  picked = id;
  pickedIds.push(id);
  return id;
};
canvas.addEventListener("pointerdown", (event) => {
  const rect = canvas.getBoundingClientRect();
  pickAt(event.clientX - rect.left, event.clientY - rect.top);
});

/** Project a world point to canvas CSS pixels with the app's picking view-projection. */
const project = (p: readonly number[]): [number, number] | undefined => {
  const m = app.viewProjection?.();
  if (!m) return undefined;
  const x = m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!;
  const y = m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!;
  const w = m[3]! * p[0]! + m[7]! * p[1]! + m[11]! * p[2]! + m[15]!;
  const rect = canvas.getBoundingClientRect();
  return [((x / w) + 1) / 2 * rect.width, (1 - (y / w)) / 2 * rect.height];
};

const report = (): void => {
  const diagnostics = app.diagnostics();
  data.workerLabBackend = String(app.backend);
  data.workerLabFrames = String(app.runtime.frame);
  data.workerLabLogicFrames = String(logicFrames);
  data.workerLabDrawCalls = String(diagnostics.drawCalls ?? 0);
  data.workerLabPlayerX = playerX.toFixed(2);
  data.workerLabPicked = pickedIds.join(",") || "none";
  data.workerLabErrors = String(diagnostics.errors.length);
  if (diagnostics.errors.length) data.workerLabLastError = diagnostics.errors.at(-1)!.slice(0, 300);
  hud.textContent = [
    `execution ${execution}${app.execution?.fallbackReason ? ` (${app.execution.fallbackReason})` : ""}`,
    `backend ${app.backend}  presented ${app.runtime.frame}  logic ${logicFrames}  draws ${diagnostics.drawCalls ?? 0}`,
    `player x ${playerX.toFixed(2)}  picked ${picked}  (arrows move, click picks)`,
    diagnostics.errors.length ? `errors ${diagnostics.errors.length}: ${diagnostics.errors.at(-1)}` : ""
  ].join("\n");
};
setInterval(report, 250);

// Scripted self-test, so a headless capture proves input, picking and patches without a human.
void app.ready().then(() => {
  data.workerLabReady = "1";
  setTimeout(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight" }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight" })), 600);
  }, 800);
  setTimeout(() => {
    const at = project(a.position);
    data.workerLabPickPoint = at ? at.map((v) => v.toFixed(1)).join(",") : "no-view-projection";
    if (at) data.workerLabSelfPick = pickAt(at[0], at[1]);
    // An empty spot above the scene must miss.
    data.workerLabSelfMiss = pickAt(4, 4);
  }, 2500);
  setTimeout(report, 2600);
});
