interface ProxyScene {
  readonly schema: string;
  readonly sceneId: string;
  readonly title: string;
  readonly prompt: string;
  readonly providerMode: string;
  readonly qualityTarget: string;
  readonly look: {
    readonly palette: readonly string[];
    readonly atmosphere: string;
    readonly lighting: readonly string[];
    readonly vfx: readonly string[];
  };
  readonly assets: readonly {
    readonly id: string;
    readonly role: string;
    readonly tags: readonly string[];
  }[];
  readonly diagnostics: {
    readonly backend: string;
    readonly networkUsed: boolean;
    readonly secretsExposed: boolean;
    readonly fallbackUsed: boolean;
    readonly warnings: readonly string[];
    readonly noFinalFilmClaim: true;
  };
}

const canvas = requireElement<HTMLCanvasElement>("viewport", HTMLCanvasElement);
const context = canvas.getContext("2d");
if (!context) throw new Error("Canvas 2D context is required.");

const promptInput = requireElement<HTMLTextAreaElement>("prompt", HTMLTextAreaElement);
const generateButton = requireElement<HTMLButtonElement>("generate", HTMLButtonElement);
const exportButton = requireElement<HTMLButtonElement>("export", HTMLButtonElement);
const statusElement = requireElement<HTMLElement>("status", HTMLElement);
const diagnosticsElement = requireElement<HTMLElement>("diagnostics", HTMLElement);
const proxyUrl = import.meta.env.VITE_AURA_SCENE_PROXY_URL ?? "/api/scene";

let scene: ProxyScene | null = null;
let start = performance.now();

generateButton.addEventListener("click", () => {
  void generate();
});

exportButton.addEventListener("click", () => {
  if (scene) exportBundle(scene);
});

void generate();
requestAnimationFrame(renderFrame);

async function generate(): Promise<void> {
  start = performance.now();
  try {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: promptInput.value,
        mode: "live",
        qualityTarget: "L3-cinematic-realtime"
      })
    });
    if (!response.ok) throw new Error(`proxy returned ${response.status}`);
    scene = (await response.json()) as ProxyScene;
  } catch (error) {
    scene = createFixtureFallback(error instanceof Error ? error.message : String(error));
  }
  updatePanel(scene);
}

function createFixtureFallback(message: string): ProxyScene {
  return {
    schema: "aura-scene-ir/0.1",
    sceneId: "browser-fixture-fallback",
    title: "Rooftop Signal Fixture",
    prompt: promptInput.value,
    providerMode: "fixture",
    qualityTarget: "L3-cinematic-realtime",
    look: {
      palette: ["storm blue", "signal green", "warm window amber"],
      atmosphere: "rain haze and beacon glow",
      lighting: ["storm rim", "green practical beacon"],
      vfx: ["rain streaks", "fog layers", "emissive glow"]
    },
    assets: [],
    diagnostics: {
      backend: "browser-fixture-fallback",
      networkUsed: false,
      secretsExposed: false,
      fallbackUsed: true,
      warnings: [`Proxy unavailable, rendered no-key fixture fallback: ${message}`],
      noFinalFilmClaim: true
    }
  };
}

function renderFrame(now: number): void {
  renderScene(scene, (now - start) / 1000);
  requestAnimationFrame(renderFrame);
}

function renderScene(current: ProxyScene | null, time: number): void {
  const width = canvas.width;
  const height = canvas.height;
  const sky = context.createLinearGradient(0, 0, width, height);
  sky.addColorStop(0, "#08131f");
  sky.addColorStop(0.55, "#13202b");
  sky.addColorStop(1, "#07100f");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  drawCity(width, height, time);
  drawRooftop(width, height);
  drawBeacon(width, height, time);
  drawRain(width, height, time);
  drawHaze(width, height, time);
  drawLetterbox(width, height);

  context.fillStyle = "rgba(5, 8, 10, 0.74)";
  context.fillRect(24, 26, 430, 88);
  context.fillStyle = "#edf2f7";
  context.font = "22px system-ui, sans-serif";
  context.fillText(current?.title ?? "Waiting for proxy", 42, 60);
  context.font = "14px system-ui, sans-serif";
  context.fillStyle = "#bdcad6";
  context.fillText(`mode: ${current?.providerMode ?? "loading"} | proxy: ${proxyUrl}`, 42, 88);
}

function drawCity(width: number, height: number, time: number): void {
  for (let i = 0; i < 18; i += 1) {
    const x = i * (width / 17);
    const buildingHeight = height * (0.18 + ((i * 37) % 100) / 360);
    context.fillStyle = `rgba(18, 29, 39, ${0.7 + (i % 3) * 0.08})`;
    context.fillRect(x - 24, height * 0.48 - buildingHeight * 0.2, width / 13, buildingHeight);
    context.fillStyle = i % 2 === 0 ? "rgba(255, 177, 83, 0.25)" : "rgba(90, 222, 194, 0.2)";
    for (let w = 0; w < 4; w += 1) {
      context.fillRect(x + 8 + w * 18, height * 0.52 + ((w + i) % 4) * 22, 8, 12);
    }
  }
  context.fillStyle = `rgba(42, 94, 102, ${0.07 + Math.sin(time) * 0.02})`;
  context.fillRect(0, height * 0.34, width, height * 0.22);
}

function drawRooftop(width: number, height: number): void {
  context.fillStyle = "#10171d";
  context.beginPath();
  context.moveTo(0, height);
  context.lineTo(width * 0.33, height * 0.66);
  context.lineTo(width * 0.72, height * 0.62);
  context.lineTo(width, height);
  context.closePath();
  context.fill();
  context.strokeStyle = "rgba(98, 230, 196, 0.28)";
  context.lineWidth = 2;
  for (let i = 0; i < 9; i += 1) {
    context.beginPath();
    context.moveTo(width * (0.08 + i * 0.1), height);
    context.lineTo(width * 0.52, height * 0.64);
    context.stroke();
  }
}

function drawBeacon(width: number, height: number, time: number): void {
  const cx = width * 0.55;
  const base = height * 0.66;
  const pulse = 1 + Math.sin(time * 2.4) * 0.1;
  context.save();
  context.strokeStyle = "#5ce8c8";
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(cx, base);
  context.lineTo(cx, base - 170);
  context.stroke();
  context.strokeStyle = "rgba(92, 232, 200, 0.45)";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(cx - 74, base);
  context.lineTo(cx, base - 120);
  context.lineTo(cx + 74, base);
  context.stroke();
  context.shadowColor = "rgba(92, 232, 200, 0.95)";
  context.shadowBlur = 60 * pulse;
  context.fillStyle = "#a9fff0";
  context.beginPath();
  context.arc(cx, base - 180, 24 * pulse, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawRain(width: number, height: number, time: number): void {
  context.strokeStyle = "rgba(175, 227, 255, 0.32)";
  context.lineWidth = 1;
  for (let i = 0; i < 130; i += 1) {
    const x = (i * 67 + time * 110) % width;
    const y = (i * 43 + time * 260) % height;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x - 7, y + 24);
    context.stroke();
  }
}

function drawHaze(width: number, height: number, time: number): void {
  for (let i = 0; i < 4; i += 1) {
    const x = ((time * 22 + i * 260) % (width + 260)) - 130;
    const y = height * (0.42 + i * 0.08);
    const haze = context.createRadialGradient(x, y, 20, x, y, width * 0.4);
    haze.addColorStop(0, "rgba(141, 198, 215, 0.12)");
    haze.addColorStop(1, "rgba(141, 198, 215, 0)");
    context.fillStyle = haze;
    context.fillRect(0, 0, width, height);
  }
}

function drawLetterbox(width: number, height: number): void {
  context.fillStyle = "rgba(0, 0, 0, 0.76)";
  context.fillRect(0, 0, width, height * 0.085);
  context.fillRect(0, height * 0.915, width, height * 0.085);
}

function updatePanel(current: ProxyScene): void {
  statusElement.innerHTML = [
    `<strong>Provider mode:</strong> ${current.providerMode}`,
    `<strong>Network used:</strong> ${String(current.diagnostics.networkUsed)}`,
    `<strong>Secrets exposed:</strong> ${String(current.diagnostics.secretsExposed)}`,
    "<strong>Boundary:</strong> realtime previs, not final film"
  ].join("");
  diagnosticsElement.textContent = JSON.stringify(current, null, 2);
}

function exportBundle(current: ProxyScene): void {
  const bundle = {
    schema: "aura3d-cinematic-export-bundle/0.1",
    generatedAt: new Date().toISOString(),
    scene: current,
    providerProvenance: {
      providerMode: current.providerMode,
      networkUsed: current.diagnostics.networkUsed,
      secretsExposed: current.diagnostics.secretsExposed,
      fallbackUsed: current.diagnostics.fallbackUsed
    },
    quality: {
      target: current.qualityTarget,
      noFinalFilmClaim: current.diagnostics.noFinalFilmClaim
    }
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${current.sceneId}-export-bundle.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function requireElement<T extends HTMLElement>(id: string, constructor: { new (...args: never[]): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new Error(`Missing element #${id}`);
  return element;
}

declare global {
  interface Window {
    __AURA3D_PROXY_TEMPLATE__?: {
      getScene(): ProxyScene | null;
      proxyUrl: string;
    };
  }
}

window.__AURA3D_PROXY_TEMPLATE__ = {
  getScene: () => scene,
  proxyUrl
};
