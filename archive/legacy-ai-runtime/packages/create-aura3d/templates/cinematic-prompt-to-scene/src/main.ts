type ProviderMode = "fixture" | "mock" | "proxy";

interface CinematicAsset {
  readonly id: string;
  readonly role: string;
  readonly kind: string;
  readonly path: string;
  readonly tags: readonly string[];
  readonly quality: string;
}

interface CinematicSceneIR {
  readonly schema: "aura-scene-ir/0.1";
  readonly sceneId: string;
  readonly title: string;
  readonly prompt: string;
  readonly providerMode: ProviderMode;
  readonly qualityTarget: "L3-cinematic-realtime";
  readonly camera: {
    readonly shot: string;
    readonly movement: string;
    readonly durationSeconds: number;
  };
  readonly look: {
    readonly palette: readonly string[];
    readonly atmosphere: string;
    readonly lighting: readonly string[];
    readonly vfx: readonly string[];
  };
  readonly assets: readonly CinematicAsset[];
  readonly diagnostics: {
    readonly backend: string;
    readonly networkUsed: boolean;
    readonly unresolvedAssets: readonly string[];
    readonly placeholders: readonly string[];
    readonly warnings: readonly string[];
    readonly noFinalFilmClaim: true;
  };
}

interface AssetManifest {
  readonly schema: string;
  readonly library: string;
  readonly assets: readonly CinematicAsset[];
}

const canvas = requireElement<HTMLCanvasElement>("viewport", HTMLCanvasElement);
const context = canvas.getContext("2d");
if (!context) throw new Error("Canvas 2D context is required for this template preview.");

const promptInput = requireElement<HTMLTextAreaElement>("prompt", HTMLTextAreaElement);
const modeSelect = requireElement<HTMLSelectElement>("providerMode", HTMLSelectElement);
const generateButton = requireElement<HTMLButtonElement>("generate", HTMLButtonElement);
const exportButton = requireElement<HTMLButtonElement>("export", HTMLButtonElement);
const statusElement = requireElement<HTMLElement>("status", HTMLElement);
const diagnosticsElement = requireElement<HTMLElement>("diagnostics", HTMLElement);

let manifest: AssetManifest | null = null;
let currentScene: CinematicSceneIR | null = null;
let animationStart = performance.now();

generateButton.addEventListener("click", () => {
  void generateScene();
});

exportButton.addEventListener("click", () => {
  if (currentScene) exportBundle(currentScene);
});

void bootstrap();

async function bootstrap(): Promise<void> {
  manifest = await loadManifest();
  await generateScene();
  requestAnimationFrame(renderFrame);
}

async function loadManifest(): Promise<AssetManifest> {
  const response = await fetch("/asset-manifest.json");
  if (!response.ok) throw new Error(`Unable to load asset manifest: ${response.status}`);
  return response.json() as Promise<AssetManifest>;
}

async function generateScene(): Promise<void> {
  const mode = modeSelect.value as ProviderMode;
  const prompt = promptInput.value.trim();
  animationStart = performance.now();
  try {
    currentScene = mode === "proxy" ? await generateFromProxy(prompt) : generateLocalScene(prompt, mode);
  } catch (error) {
    currentScene = generateLocalScene(prompt, "fixture", [
      `Proxy failed, restored fixture mode: ${error instanceof Error ? error.message : String(error)}`
    ]);
  }
  updateDiagnostics(currentScene);
}

function generateLocalScene(prompt: string, providerMode: ProviderMode, warnings: readonly string[] = []): CinematicSceneIR {
  const lower = prompt.toLowerCase();
  const isHopeful = /hope|flower|protect|warm|emotional/.test(lower);
  const isRainy = /rain|wet|storm|pavement|alley/.test(lower);
  const assets = manifest?.assets ?? [];
  return {
    schema: "aura-scene-ir/0.1",
    sceneId: `cinematic-${stableHash(`${providerMode}:${prompt}`).slice(0, 8)}`,
    title: isHopeful ? "Guardian In The Neon Rain" : "Cinematic Prompt Fixture",
    prompt,
    providerMode,
    qualityTarget: "L3-cinematic-realtime",
    camera: {
      shot: "medium-wide",
      movement: "slow push-in with low parallax over wet pavement",
      durationSeconds: 8
    },
    look: {
      palette: isRainy ? ["cyan rim", "magenta neon", "warm amber practical"] : ["cool blue", "soft amber", "deep graphite"],
      atmosphere: isRainy ? "rain, depth haze, wet reflections" : "soft haze with practical glow",
      lighting: ["blue rim light", "warm practical flower glow", "overhead alley bounce"],
      vfx: ["rain streaks", "fog layers", "wet reflection approximation", "emissive bloom intent"]
    },
    assets,
    diagnostics: {
      backend: "template-canvas-fixture",
      networkUsed: false,
      unresolvedAssets: [],
      placeholders: [],
      warnings,
      noFinalFilmClaim: true
    }
  };
}

async function generateFromProxy(prompt: string): Promise<CinematicSceneIR> {
  const proxyUrl = import.meta.env.VITE_AURA_SCENE_PROXY_URL ?? "/api/scene";
  const response = await fetch(proxyUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, mode: "live", qualityTarget: "L3-cinematic-realtime" })
  });
  if (!response.ok) throw new Error(`server proxy returned ${response.status}`);
  const result = (await response.json()) as Partial<CinematicSceneIR>;
  return {
    ...generateLocalScene(prompt, "proxy"),
    ...result,
    providerMode: "proxy",
    qualityTarget: "L3-cinematic-realtime",
    diagnostics: {
      ...generateLocalScene(prompt, "proxy").diagnostics,
      ...(result.diagnostics ?? {}),
      noFinalFilmClaim: true
    }
  } as CinematicSceneIR;
}

function renderFrame(now: number): void {
  if (currentScene) renderScene(currentScene, (now - animationStart) / 1000);
  requestAnimationFrame(renderFrame);
}

function renderScene(scene: CinematicSceneIR, time: number): void {
  const width = canvas.width;
  const height = canvas.height;
  const push = Math.sin(time * 0.35) * 18;
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#071927");
  gradient.addColorStop(0.45, "#151927");
  gradient.addColorStop(1, "#251426");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  drawAlley(width, height, push);
  drawFog(width, height, time);
  drawRobot(width, height, push);
  drawFlower(width, height, time);
  drawRain(width, height, time);
  drawLetterbox(width, height);
  drawOverlay(scene);
}

function drawAlley(width: number, height: number, push: number): void {
  context.save();
  context.fillStyle = "#111820";
  context.beginPath();
  context.moveTo(0, height);
  context.lineTo(width * 0.38 + push, height * 0.54);
  context.lineTo(width * 0.62 - push, height * 0.54);
  context.lineTo(width, height);
  context.closePath();
  context.fill();

  for (let i = 0; i < 8; i += 1) {
    const t = i / 7;
    context.strokeStyle = `rgba(64, 221, 255, ${0.14 - t * 0.08})`;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(width * (0.05 + t * 0.28), height);
    context.lineTo(width * 0.42, height * 0.55);
    context.stroke();
    context.beginPath();
    context.moveTo(width * (0.95 - t * 0.28), height);
    context.lineTo(width * 0.58, height * 0.55);
    context.stroke();
  }

  for (let i = 0; i < 10; i += 1) {
    const x = width * (0.08 + i * 0.095);
    context.fillStyle = i % 2 === 0 ? "rgba(236, 53, 177, 0.22)" : "rgba(34, 197, 255, 0.2)";
    context.fillRect(x, height * 0.18, width * 0.035, height * 0.3);
  }

  const reflection = context.createLinearGradient(0, height * 0.55, 0, height);
  reflection.addColorStop(0, "rgba(255, 255, 255, 0.02)");
  reflection.addColorStop(1, "rgba(53, 205, 255, 0.18)");
  context.fillStyle = reflection;
  context.fillRect(0, height * 0.55, width, height * 0.45);
  context.restore();
}

function drawRobot(width: number, height: number, push: number): void {
  const cx = width * 0.48 + push * 0.2;
  const ground = height * 0.72;
  context.save();
  context.shadowColor = "rgba(72, 214, 255, 0.8)";
  context.shadowBlur = 26;
  context.fillStyle = "#25313d";
  roundedRect(cx - 56, ground - 144, 112, 112, 18);
  context.fillStyle = "#111820";
  roundedRect(cx - 38, ground - 116, 76, 30, 8);
  context.fillStyle = "#86efff";
  context.fillRect(cx - 26, ground - 105, 14, 8);
  context.fillRect(cx + 12, ground - 105, 14, 8);
  context.fillStyle = "#1b2430";
  roundedRect(cx - 36, ground - 34, 26, 76, 10);
  roundedRect(cx + 10, ground - 34, 26, 76, 10);
  context.strokeStyle = "rgba(255, 195, 88, 0.7)";
  context.lineWidth = 9;
  context.beginPath();
  context.moveTo(cx - 50, ground - 84);
  context.quadraticCurveTo(cx - 98, ground - 58, cx - 92, ground - 16);
  context.stroke();
  context.beginPath();
  context.moveTo(cx + 50, ground - 84);
  context.quadraticCurveTo(cx + 98, ground - 58, cx + 92, ground - 16);
  context.stroke();
  context.restore();
}

function drawFlower(width: number, height: number, time: number): void {
  const cx = width * 0.58;
  const cy = height * 0.69;
  const pulse = 1 + Math.sin(time * 2.2) * 0.08;
  context.save();
  context.shadowColor = "rgba(255, 190, 74, 0.95)";
  context.shadowBlur = 34 * pulse;
  context.strokeStyle = "#6ecf86";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(cx, cy + 42);
  context.quadraticCurveTo(cx - 8, cy + 12, cx, cy - 16);
  context.stroke();
  context.fillStyle = "#ffc45b";
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI * 2 * i) / 6 + time * 0.08;
    context.beginPath();
    context.ellipse(cx + Math.cos(angle) * 16, cy - 22 + Math.sin(angle) * 10, 12, 20, angle, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = "#fff4b8";
  context.beginPath();
  context.arc(cx, cy - 22, 10, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawRain(width: number, height: number, time: number): void {
  context.save();
  context.strokeStyle = "rgba(170, 231, 255, 0.36)";
  context.lineWidth = 1;
  for (let i = 0; i < 150; i += 1) {
    const x = (i * 73 + time * 120) % width;
    const y = (i * 41 + time * 280) % height;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x - 9, y + 26);
    context.stroke();
  }
  context.restore();
}

function drawFog(width: number, height: number, time: number): void {
  context.save();
  for (let i = 0; i < 5; i += 1) {
    const y = height * (0.36 + i * 0.08);
    const x = ((time * 18 + i * 180) % (width + 240)) - 120;
    const fog = context.createRadialGradient(x, y, 10, x, y, width * 0.35);
    fog.addColorStop(0, "rgba(164, 213, 231, 0.13)");
    fog.addColorStop(1, "rgba(164, 213, 231, 0)");
    context.fillStyle = fog;
    context.fillRect(0, 0, width, height);
  }
  context.restore();
}

function drawLetterbox(width: number, height: number): void {
  context.fillStyle = "rgba(0, 0, 0, 0.78)";
  context.fillRect(0, 0, width, height * 0.085);
  context.fillRect(0, height * 0.915, width, height * 0.085);
}

function drawOverlay(scene: CinematicSceneIR): void {
  context.fillStyle = "rgba(6, 8, 10, 0.72)";
  context.fillRect(22, 24, 390, 84);
  context.fillStyle = "#eef3f8";
  context.font = "22px system-ui, sans-serif";
  context.fillText(scene.title, 40, 58);
  context.font = "14px system-ui, sans-serif";
  context.fillStyle = "#b8c4cf";
  context.fillText(`mode: ${scene.providerMode} | target: ${scene.qualityTarget}`, 40, 84);
}

function updateDiagnostics(scene: CinematicSceneIR): void {
  statusElement.innerHTML = [
    `<strong>Mode:</strong> ${scene.providerMode}`,
    `<strong>Backend:</strong> ${scene.diagnostics.backend}`,
    `<strong>Assets:</strong> ${scene.assets.length}`,
    "<strong>Boundary:</strong> realtime previs, not final film"
  ].join("");
  diagnosticsElement.textContent = JSON.stringify(scene, null, 2);
}

function exportBundle(scene: CinematicSceneIR): void {
  const payload = {
    schema: "aura3d-cinematic-export-bundle/0.1",
    generatedAt: new Date().toISOString(),
    scene,
    assetProvenance: {
      manifestSchema: manifest?.schema,
      library: manifest?.library,
      assets: scene.assets
    },
    quality: {
      providerMode: scene.providerMode,
      backend: scene.diagnostics.backend,
      noFinalFilmClaim: scene.diagnostics.noFinalFilmClaim,
      unresolvedHeroAssets: 0,
      placeholderCount: scene.diagnostics.placeholders.length
    }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${scene.sceneId}-export-bundle.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function roundedRect(x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function requireElement<T extends HTMLElement>(id: string, constructor: { new (...args: never[]): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new Error(`Missing element #${id}`);
  return element;
}

declare global {
  interface Window {
    __AURA3D_CINEMATIC_TEMPLATE__?: {
      getScene(): CinematicSceneIR | null;
      mode(): ProviderMode;
    };
  }
}

window.__AURA3D_CINEMATIC_TEMPLATE__ = {
  getScene: () => currentScene,
  mode: () => modeSelect.value as ProviderMode
};
