import {
  DEFAULT_PROMPT,
  MockProvider,
  applyAuraScenePatch,
  createAuraSceneDiagnostics,
  type AuraSceneDiagnostics,
  type AuraSceneIR,
  type AuraSceneObject,
  type AuraScenePatch
} from "/apps/wow-common/src/ai-scene-runtime.ts";

interface PromptLabRuntime {
  readonly appId: "aura-prompt-to-scene";
  readonly status: "idle" | "generating" | "ready" | "patching" | "error";
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly ir: AuraSceneIR | null;
  readonly diagnostics: AuraSceneDiagnostics | null;
  readonly patchHistory: readonly AuraScenePatch[];
  readonly screenshotCaptured: boolean;
  readonly exportReady: boolean;
  readonly lastExport?: unknown;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_AI_SCENE_PROMPT_LAB__?: PromptLabRuntime;
    __a3dAiSceneRuntime?: PromptLabRuntime;
  }
}

const provider = new MockProvider();
const canvas = requireElement("viewport", HTMLCanvasElement);
const context = canvas.getContext("2d");
if (!context) throw new Error("Aura Prompt To Scene requires a 2D canvas context.");

const promptInput = requireElement("prompt-input", HTMLTextAreaElement);
const editInput = requireElement("edit-input", HTMLInputElement);
const generateButton = requireElement("generate-button", HTMLButtonElement);
const patchButton = requireElement("patch-button", HTMLButtonElement);
const screenshotButton = requireElement("screenshot-button", HTMLButtonElement);
const exportButton = requireElement("export-button", HTMLButtonElement);
const statusPill = requireElement("status-pill", HTMLElement);
const providerLabel = requireElement("provider-label", HTMLElement);
const irOutput = requireElement("ir-output", HTMLElement);
const diagnosticsOutput = requireElement("diagnostics-output", HTMLElement);
const patchLog = requireElement("patch-log", HTMLElement);
const downloadLink = requireElement("download-link", HTMLAnchorElement);

promptInput.value = DEFAULT_PROMPT;
providerLabel.textContent = `${provider.info.label} / ${provider.info.model} / no API key`;

let scene: AuraSceneIR | null = null;
let diagnostics: AuraSceneDiagnostics | null = null;
let status: PromptLabRuntime["status"] = "idle";
let errorText: string | undefined;
let frameCount = 0;
let drawCalls = 0;
let screenshotDataUrl: string | undefined;
let exportReady = false;
let patchHistory: AuraScenePatch[] = [];
let lastExport: unknown;
let startedAt = performance.now();

generateButton.addEventListener("click", () => void generateScene());
patchButton.addEventListener("click", () => void applyConversationEdit());
screenshotButton.addEventListener("click", captureScreenshot);
exportButton.addEventListener("click", exportBundle);

window.addEventListener("resize", () => {
  syncCanvasRenderSize();
  publish(true);
});

syncCanvasRenderSize();
publish(true);
void generateScene();
requestAnimationFrame(renderFrame);

async function generateScene(): Promise<void> {
  setBusy(true);
  status = "generating";
  errorText = undefined;
  patchHistory = [];
  screenshotDataUrl = undefined;
  exportReady = false;
  startedAt = performance.now();
  publish(true);
  try {
    scene = await provider.generateScene({ prompt: promptInput.value, qualityTarget: "L1" });
    status = "ready";
    patchLog.textContent = "MockProvider generated a deterministic AuraSceneIR.";
    updateDiagnostics();
    publish(true);
  } catch (error) {
    status = "error";
    errorText = formatError(error);
    publish(true);
  } finally {
    setBusy(false);
  }
}

async function applyConversationEdit(): Promise<void> {
  if (!scene) return;
  setBusy(true);
  status = "patching";
  errorText = undefined;
  publish(true);
  try {
    const patch = await provider.generatePatch({ prompt: editInput.value, scene });
    scene = applyAuraScenePatch(scene, patch);
    patchHistory = [...patchHistory, patch];
    status = "ready";
    exportReady = false;
    patchLog.textContent = `${patch.summary}: ${patch.prompt}`;
    updateDiagnostics();
    publish(true);
  } catch (error) {
    status = "error";
    errorText = formatError(error);
    publish(true);
  } finally {
    setBusy(false);
  }
}

function renderFrame(now: number): void {
  frameCount += 1;
  drawCalls = 0;
  const seconds = (now - startedAt) / 1000;
  drawScene(seconds);
  updateDiagnostics();
  publish(frameCount < 2);
  requestAnimationFrame(renderFrame);
}

function drawScene(seconds: number): void {
  const width = canvas.width;
  const height = canvas.height;
  const activeScene = scene;
  const palette = activeScene?.environment.palette ?? ["#38d6ff", "#ff4fd8", "#f6fbff", "#07111d"];
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#030610");
  gradient.addColorStop(0.5, palette[3] ?? "#07111d");
  gradient.addColorStop(1, "#020407");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  drawCalls += 1;

  drawFog(activeScene?.environment.fogDensity ?? 0.16, palette, seconds);
  drawGround(activeScene, palette, seconds);
  drawPracticalLights(activeScene, palette, seconds);

  const objects = activeScene?.objects ?? [];
  for (const object of objects) {
    drawObject(object, seconds);
  }

  drawCameraPath(activeScene, seconds);
  drawTimeline(activeScene);
}

function drawFog(density: number, palette: readonly string[], seconds: number): void {
  const layers = Math.max(4, Math.round(density * 12));
  for (let index = 0; index < layers; index += 1) {
    const y = canvas.height * (0.2 + index * 0.07);
    const x = canvas.width * (0.5 + Math.sin(seconds * 0.2 + index) * 0.12);
    const radius = canvas.width * (0.25 + index * 0.03);
    const fog = context.createRadialGradient(x, y, 10, x, y, radius);
    fog.addColorStop(0, alphaColor(palette[index % palette.length] ?? "#38d6ff", 0.08));
    fog.addColorStop(1, "rgba(2, 4, 7, 0)");
    context.fillStyle = fog;
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawCalls += 1;
  }
}

function drawGround(activeScene: AuraSceneIR | null, palette: readonly string[], seconds: number): void {
  const horizon = canvas.height * 0.58;
  context.fillStyle = "#0b0f16";
  context.beginPath();
  context.moveTo(0, canvas.height);
  context.lineTo(canvas.width * 0.36, horizon);
  context.lineTo(canvas.width * 0.64, horizon);
  context.lineTo(canvas.width, canvas.height);
  context.closePath();
  context.fill();
  drawCalls += 1;

  const reflectionCount = activeScene?.environment.ground.includes("reflective") ? 10 : 5;
  for (let index = 0; index < reflectionCount; index += 1) {
    const y = horizon + index * canvas.height * 0.045;
    context.strokeStyle = alphaColor(palette[index % palette.length] ?? "#38d6ff", 0.32 - index * 0.018);
    context.lineWidth = Math.max(1, canvas.height * 0.006 - index * 0.35);
    context.beginPath();
    context.moveTo(canvas.width * (0.24 - index * 0.015), y + Math.sin(seconds + index) * 2);
    context.lineTo(canvas.width * (0.76 + index * 0.015), y - Math.cos(seconds + index) * 2);
    context.stroke();
    drawCalls += 1;
  }
}

function drawPracticalLights(activeScene: AuraSceneIR | null, palette: readonly string[], seconds: number): void {
  const count = activeScene?.lighting.practicals ?? 4;
  for (let index = 0; index < count; index += 1) {
    const left = index % 2 === 0;
    const x = canvas.width * (left ? 0.16 : 0.84);
    const y = canvas.height * (0.18 + (index / Math.max(1, count)) * 0.36);
    const color = palette[index % palette.length] ?? "#38d6ff";
    context.fillStyle = alphaColor(color, 0.82);
    context.shadowColor = color;
    context.shadowBlur = 24 + Math.sin(seconds * 2 + index) * 5;
    context.fillRect(x - 18, y - 7, 36, 14);
    context.shadowBlur = 0;
    drawCalls += 1;
  }
}

function drawObject(object: AuraSceneObject, seconds: number): void {
  const center = project(object.position);
  const scale = object.scale[0];
  context.save();
  context.translate(center.x, center.y);
  context.scale(scale, scale);
  context.shadowColor = object.material.emissive ?? object.material.color;
  context.shadowBlur = object.shape === "flower" ? 34 : 12;
  if (object.shape === "robot") {
    drawRobot(object, seconds);
  } else if (object.shape === "flower") {
    drawFlower(object, seconds);
  } else if (object.shape === "tower") {
    drawTower(object);
  } else {
    drawSimpleObject(object);
  }
  context.restore();
}

function drawRobot(object: AuraSceneObject, seconds: number): void {
  const bob = Math.sin(seconds * 1.8) * 5;
  context.fillStyle = object.material.color;
  roundRect(-42, -118 + bob, 84, 68, 10);
  roundRect(-30, -45 + bob, 60, 84, 12);
  context.fillStyle = object.material.emissive ?? "#38d6ff";
  context.beginPath();
  context.arc(-18, -88 + bob, 8, 0, Math.PI * 2);
  context.arc(18, -88 + bob, 8, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#8796a8";
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(-30, -20 + bob);
  context.lineTo(-62, 34 + bob);
  context.moveTo(30, -20 + bob);
  context.lineTo(62, 34 + bob);
  context.moveTo(-18, 38 + bob);
  context.lineTo(-24, 92 + bob);
  context.moveTo(18, 38 + bob);
  context.lineTo(24, 92 + bob);
  context.stroke();
  drawCalls += 6;
}

function drawFlower(object: AuraSceneObject, seconds: number): void {
  const pulse = 1 + Math.sin(seconds * 2.4) * 0.08;
  context.strokeStyle = "#7ee89d";
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(0, 42);
  context.lineTo(0, -16);
  context.stroke();
  context.fillStyle = object.material.emissive ?? "#c7ff66";
  for (let index = 0; index < 7; index += 1) {
    const angle = index * Math.PI * 2 / 7;
    context.beginPath();
    context.ellipse(Math.cos(angle) * 18 * pulse, -28 + Math.sin(angle) * 12 * pulse, 11, 19, angle, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = "#fef08a";
  context.beginPath();
  context.arc(0, -28, 10, 0, Math.PI * 2);
  context.fill();
  drawCalls += 10;
}

function drawTower(object: AuraSceneObject): void {
  context.fillStyle = object.material.color;
  roundRect(-45, -170 * object.scale[1] / Math.max(0.1, object.scale[0]), 90, 250, 4);
  context.fillStyle = "rgba(255,255,255,0.16)";
  for (let row = 0; row < 7; row += 1) {
    context.fillRect(-24, -138 + row * 28, 12, 8);
    context.fillRect(14, -138 + row * 28, 12, 8);
  }
  drawCalls += 15;
}

function drawSimpleObject(object: AuraSceneObject): void {
  context.fillStyle = object.material.color;
  context.beginPath();
  context.arc(0, 0, 42, 0, Math.PI * 2);
  context.fill();
  drawCalls += 1;
}

function drawCameraPath(activeScene: AuraSceneIR | null, seconds: number): void {
  if (!activeScene) return;
  const camera = activeScene.cameras[0];
  if (!camera) return;
  context.strokeStyle = "rgba(246, 248, 251, 0.42)";
  context.lineWidth = 2;
  context.setLineDash([8, 7]);
  context.beginPath();
  context.moveTo(canvas.width * 0.36, canvas.height * 0.78);
  context.quadraticCurveTo(canvas.width * 0.5, canvas.height * 0.66 + Math.sin(seconds) * 8, canvas.width * 0.64, canvas.height * 0.78);
  context.stroke();
  context.setLineDash([]);
  drawCalls += 1;
}

function drawTimeline(activeScene: AuraSceneIR | null): void {
  if (!activeScene) return;
  const left = canvas.width * 0.35;
  const top = canvas.height - 74;
  const width = canvas.width * 0.3;
  context.fillStyle = "rgba(7, 10, 17, 0.62)";
  roundRect(left, top, width, 42, 6);
  context.fillStyle = "#d6e3f5";
  context.font = `${Math.max(12, canvas.width * 0.008)}px ui-sans-serif, system-ui, sans-serif`;
  context.fillText(`${activeScene.timeline.durationSeconds}s shot | ${activeScene.cameras[0]?.movement ?? "camera"}`, left + 14, top + 26);
  drawCalls += 2;
}

function captureScreenshot(): void {
  screenshotDataUrl = canvas.toDataURL("image/png");
  exportReady = true;
  updateDiagnostics();
  publish(true);
}

function exportBundle(): void {
  if (!scene) return;
  if (!screenshotDataUrl) captureScreenshot();
  lastExport = {
    schema: "aura-prompt-to-scene-export/0.1",
    scene,
    diagnostics,
    patches: patchHistory,
    screenshot: screenshotDataUrl,
    exportedAt: new Date(0).toISOString()
  };
  const blob = new Blob([`${JSON.stringify(lastExport, null, 2)}\n`], { type: "application/json" });
  const previous = downloadLink.href;
  downloadLink.href = URL.createObjectURL(blob);
  if (previous.startsWith("blob:")) URL.revokeObjectURL(previous);
  exportReady = true;
  updateDiagnostics();
  publish(true);
}

function updateDiagnostics(): void {
  diagnostics = createAuraSceneDiagnostics({
    provider: provider.info,
    scene,
    frameCount,
    drawCalls,
    renderWidth: canvas.width,
    renderHeight: canvas.height,
    screenshotCaptured: Boolean(screenshotDataUrl),
    exportReady
  });
}

function publish(forceDom = false): void {
  const runtime: PromptLabRuntime = {
    appId: "aura-prompt-to-scene",
    status,
    provider: provider.info.label,
    model: provider.info.model,
    prompt: promptInput.value,
    frameCount,
    drawCalls,
    renderWidth: canvas.width,
    renderHeight: canvas.height,
    ir: scene,
    diagnostics,
    patchHistory,
    screenshotCaptured: Boolean(screenshotDataUrl),
    exportReady,
    ...(lastExport ? { lastExport } : {}),
    ...(errorText ? { error: errorText } : {})
  };
  window.__AURA3D_AI_SCENE_PROMPT_LAB__ = runtime;
  window.__a3dAiSceneRuntime = runtime;
  if (forceDom || frameCount % 12 === 0) {
    renderPanels(runtime);
  }
}

function renderPanels(runtime: PromptLabRuntime): void {
  statusPill.textContent = runtime.status;
  statusPill.classList.toggle("is-error", runtime.status === "error");
  irOutput.textContent = JSON.stringify(runtime.ir, null, 2);
  diagnosticsOutput.textContent = JSON.stringify(runtime.diagnostics, null, 2);
}

function setBusy(busy: boolean): void {
  generateButton.disabled = busy;
  patchButton.disabled = busy;
}

function syncCanvasRenderSize(): void {
  const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const width = Math.max(640, Math.round(window.innerWidth * pixelRatio));
  const height = Math.max(420, Math.round(window.innerHeight * pixelRatio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function project(position: readonly [number, number, number]): { readonly x: number; readonly y: number } {
  const perspective = 1 / (1 + Math.max(-0.8, position[2]) * 0.22);
  return {
    x: canvas.width * (0.5 + position[0] * 0.16 * perspective),
    y: canvas.height * (0.63 - position[1] * 0.18 * perspective)
  };
}

function roundRect(x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

function alphaColor(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
}

function requireElement<T extends HTMLElement>(id: string, constructor: { new(): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) {
    throw new Error(`Missing required element #${id}.`);
  }
  return element;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
