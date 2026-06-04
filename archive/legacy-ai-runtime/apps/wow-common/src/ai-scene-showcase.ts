import { renderAIScenePanel, renderInspector } from "./ai-scene-panel.ts";
import { applyRouteChromeMode } from "./route-quality.ts";
import {
  DEFAULT_PROMPT,
  MockProvider,
  applyAuraScenePatch,
  createAuraSceneDiagnostics,
  type AuraSceneDiagnostics,
  type AuraSceneIR,
  type AuraScenePatch
} from "./ai-scene-runtime.ts";

export type AISceneShowcaseMode = "cinematic" | "diff" | "shot" | "world";

export interface AISceneShowcaseOptions {
  readonly appId: string;
  readonly title: string;
  readonly summary: string;
  readonly prompt?: string;
  readonly editPrompt?: string;
  readonly mode: AISceneShowcaseMode;
}

export interface AISceneShowcaseRuntime {
  readonly appId: string;
  readonly status: "loading" | "ready" | "error";
  readonly provider: string;
  readonly model: string;
  readonly mode: AISceneShowcaseMode;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly ir: AuraSceneIR | null;
  readonly diagnostics: AuraSceneDiagnostics | null;
  readonly patchHistory: readonly AuraScenePatch[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_AI_SCENE_SHOWCASE__?: AISceneShowcaseRuntime;
  }
}

export function mountAISceneShowcase(options: AISceneShowcaseOptions): void {
  const chromeHidden = applyRouteChromeMode();
  const provider = new MockProvider();
  const canvas = requireElement("viewport", HTMLCanvasElement);
  const context = canvas.getContext("2d");
  if (!context) throw new Error(`${options.title} requires a 2D canvas context.`);

  const panelRoot = requireElement("panel-root", HTMLElement);
  const inspectorRoot = requireElement("inspector-root", HTMLElement);
  const prompt = options.prompt ?? DEFAULT_PROMPT;
  const editPrompt = options.editPrompt ?? "Make the robot smaller, add more fog, and move the camera lower.";
  let scene: AuraSceneIR | null = null;
  let diagnostics: AuraSceneDiagnostics | null = null;
  let status: AISceneShowcaseRuntime["status"] = "loading";
  let errorText: string | undefined;
  let frameCount = 0;
  let drawCalls = 0;
  let patchHistory: AuraScenePatch[] = [];
  let startedAt = performance.now();

  window.addEventListener("resize", syncCanvasRenderSize);
  syncCanvasRenderSize();
  publish();
  void boot();
  requestAnimationFrame(renderFrame);

  async function boot(): Promise<void> {
    try {
      scene = await provider.generateScene({ prompt, qualityTarget: "L2" });
      if (options.mode === "diff") {
        const patch = await provider.generatePatch({ prompt: editPrompt, scene });
        scene = applyAuraScenePatch(scene, patch);
        patchHistory = [patch];
      }
      status = "ready";
      updateDiagnostics();
      publish();
    } catch (error) {
      status = "error";
      errorText = error instanceof Error ? error.message : String(error);
      publish();
    }
  }

  function renderFrame(now: number): void {
    frameCount += 1;
    drawCalls = 0;
    const seconds = (now - startedAt) / 1000;
    drawScene(seconds);
    updateDiagnostics();
    publish();
    requestAnimationFrame(renderFrame);
  }

  function drawScene(seconds: number): void {
    const width = canvas.width;
    const height = canvas.height;
    const palette = scene?.environment.palette ?? ["#38d6ff", "#ff4fd8", "#f6fbff", "#07111d"];
    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#050812");
    background.addColorStop(0.48, "#0a1320");
    background.addColorStop(1, "#020407");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    drawCalls += 1;

    if (options.mode === "diff") {
      drawDiffScene(seconds, palette);
    } else if (options.mode === "shot") {
      drawShotDirector(seconds, palette);
    } else if (options.mode === "world") {
      drawWorldBuilder(seconds, palette);
    } else {
      drawCinematicScene(seconds, palette);
    }
  }

  function drawCinematicScene(seconds: number, palette: readonly string[]): void {
    drawHorizon(palette);
    drawMist(seconds, palette, 0.3);
    drawRobot(canvas.width * 0.42, canvas.height * 0.58, canvas.height * 0.16, seconds, palette);
    drawFlower(canvas.width * 0.58, canvas.height * 0.66, canvas.height * 0.08, seconds, palette);
    drawCameraRail(seconds, palette);
  }

  function drawDiffScene(seconds: number, palette: readonly string[]): void {
    drawSplitPanel(0, "before prompt", palette[0] ?? "#38d6ff");
    drawSplitPanel(canvas.width / 2, "after conversation patch", palette[1] ?? "#ff4fd8");
    drawRobot(canvas.width * 0.27, canvas.height * 0.58, canvas.height * 0.14, seconds, palette);
    drawRobot(canvas.width * 0.72, canvas.height * 0.61, canvas.height * 0.1, seconds, palette);
    drawMist(seconds, palette, 0.42);
  }

  function drawShotDirector(seconds: number, palette: readonly string[]): void {
    drawHorizon(palette);
    for (let index = 0; index < 5; index += 1) {
      const t = index / 4;
      const x = canvas.width * (0.18 + t * 0.64);
      const y = canvas.height * (0.72 - Math.sin(t * Math.PI) * 0.22);
      drawCameraGlyph(x, y, canvas.height * 0.035, palette[index % palette.length] ?? "#38d6ff");
      context.strokeStyle = `rgba(214, 227, 245, ${0.24 + index * 0.08})`;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(canvas.width * 0.5, canvas.height * 0.5 + Math.sin(seconds + index) * 10);
      context.stroke();
      drawCalls += 1;
    }
    drawFlower(canvas.width * 0.5, canvas.height * 0.55, canvas.height * 0.1, seconds, palette);
  }

  function drawWorldBuilder(seconds: number, palette: readonly string[]): void {
    drawGrid();
    const nodes = [
      [0.22, 0.3, "Environment"],
      [0.48, 0.24, "Character"],
      [0.7, 0.38, "Prop"],
      [0.32, 0.68, "Camera"],
      [0.62, 0.7, "Lighting"]
    ] as const;
    for (let index = 0; index < nodes.length; index += 1) {
      const [nx, ny, label] = nodes[index];
      drawWorldNode(canvas.width * nx, canvas.height * ny, label, palette[index % palette.length] ?? "#38d6ff", seconds + index);
    }
  }

  function drawHorizon(palette: readonly string[]): void {
    const horizon = canvas.height * 0.62;
    const floor = context.createLinearGradient(0, horizon, 0, canvas.height);
    floor.addColorStop(0, "rgba(21, 28, 40, 0.94)");
    floor.addColorStop(1, "rgba(3, 5, 9, 1)");
    context.fillStyle = floor;
    context.beginPath();
    context.moveTo(0, canvas.height);
    context.lineTo(canvas.width * 0.34, horizon);
    context.lineTo(canvas.width * 0.66, horizon);
    context.lineTo(canvas.width, canvas.height);
    context.closePath();
    context.fill();
    context.strokeStyle = alphaColor(palette[0] ?? "#38d6ff", 0.32);
    context.lineWidth = 2;
    context.stroke();
    drawCalls += 2;
  }

  function drawMist(seconds: number, palette: readonly string[], density: number): void {
    for (let index = 0; index < 8; index += 1) {
      const x = canvas.width * (0.5 + Math.sin(seconds * 0.18 + index) * 0.32);
      const y = canvas.height * (0.25 + index * 0.06);
      const radius = canvas.width * (0.18 + index * 0.025);
      const fog = context.createRadialGradient(x, y, 0, x, y, radius);
      fog.addColorStop(0, alphaColor(palette[index % palette.length] ?? "#38d6ff", 0.08 * density));
      fog.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = fog;
      context.fillRect(0, 0, canvas.width, canvas.height);
      drawCalls += 1;
    }
  }

  function drawRobot(x: number, y: number, size: number, seconds: number, palette: readonly string[]): void {
    context.save();
    context.translate(x, y + Math.sin(seconds * 1.4) * size * 0.05);
    context.fillStyle = "#cfd8e3";
    context.shadowColor = palette[0] ?? "#38d6ff";
    context.shadowBlur = size * 0.22;
    roundedRect(-size * 0.32, -size * 0.85, size * 0.64, size * 0.38, size * 0.07);
    context.fill();
    context.fillStyle = alphaColor(palette[0] ?? "#38d6ff", 0.92);
    context.fillRect(-size * 0.2, -size * 0.74, size * 0.14, size * 0.06);
    context.fillRect(size * 0.06, -size * 0.74, size * 0.14, size * 0.06);
    context.fillStyle = "#9aa6b2";
    roundedRect(-size * 0.24, -size * 0.43, size * 0.48, size * 0.42, size * 0.09);
    context.fill();
    context.strokeStyle = "#eef4ff";
    context.lineWidth = Math.max(2, size * 0.025);
    context.beginPath();
    context.moveTo(-size * 0.22, -size * 0.25);
    context.lineTo(-size * 0.48, -size * 0.04);
    context.moveTo(size * 0.22, -size * 0.25);
    context.lineTo(size * 0.48, -size * 0.04);
    context.stroke();
    context.restore();
    drawCalls += 5;
  }

  function drawFlower(x: number, y: number, size: number, seconds: number, palette: readonly string[]): void {
    context.save();
    context.translate(x, y);
    context.shadowColor = palette[2] ?? "#f6fbff";
    context.shadowBlur = size * (0.8 + Math.sin(seconds * 2) * 0.18);
    for (let index = 0; index < 7; index += 1) {
      context.rotate((Math.PI * 2) / 7);
      context.fillStyle = alphaColor(palette[index % palette.length] ?? "#8dffab", 0.82);
      context.beginPath();
      context.ellipse(size * 0.34, 0, size * 0.28, size * 0.11, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = "#eaff8f";
    context.beginPath();
    context.arc(0, 0, size * 0.2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    drawCalls += 8;
  }

  function drawCameraRail(seconds: number, palette: readonly string[]): void {
    context.strokeStyle = alphaColor(palette[1] ?? "#ff4fd8", 0.64);
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(canvas.width * 0.18, canvas.height * 0.82);
    context.quadraticCurveTo(canvas.width * 0.52, canvas.height * (0.62 + Math.sin(seconds) * 0.01), canvas.width * 0.86, canvas.height * 0.8);
    context.stroke();
    drawCalls += 1;
  }

  function drawSplitPanel(left: number, label: string, color: string): void {
    context.fillStyle = "rgba(255,255,255,0.025)";
    context.fillRect(left, 0, canvas.width / 2, canvas.height);
    context.strokeStyle = alphaColor(color, 0.45);
    context.lineWidth = 2;
    context.strokeRect(left + 18, 18, canvas.width / 2 - 36, canvas.height - 36);
    context.fillStyle = alphaColor(color, 0.9);
    context.font = `${Math.max(16, canvas.height * 0.024)}px Inter, sans-serif`;
    context.fillText(label, left + 38, 54);
    drawCalls += 3;
  }

  function drawCameraGlyph(x: number, y: number, size: number, color: string): void {
    context.fillStyle = alphaColor(color, 0.84);
    roundedRect(x - size, y - size * 0.5, size * 1.6, size, size * 0.16);
    context.fill();
    context.beginPath();
    context.moveTo(x + size * 0.65, y - size * 0.32);
    context.lineTo(x + size * 1.25, y - size * 0.7);
    context.lineTo(x + size * 1.25, y + size * 0.7);
    context.lineTo(x + size * 0.65, y + size * 0.32);
    context.closePath();
    context.fill();
    drawCalls += 2;
  }

  function drawGrid(): void {
    context.strokeStyle = "rgba(142, 162, 184, 0.18)";
    context.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += canvas.width / 12) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvas.height);
      context.stroke();
    }
    for (let y = 0; y <= canvas.height; y += canvas.height / 8) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
      context.stroke();
    }
    drawCalls += 22;
  }

  function drawWorldNode(x: number, y: number, label: string, color: string, time: number): void {
    const radius = canvas.height * 0.07;
    const glow = context.createRadialGradient(x, y, 0, x, y, radius * 2.6);
    glow.addColorStop(0, alphaColor(color, 0.4));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = glow;
    context.fillRect(x - radius * 3, y - radius * 3, radius * 6, radius * 6);
    context.fillStyle = alphaColor(color, 0.82);
    context.beginPath();
    context.arc(x, y + Math.sin(time) * radius * 0.1, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f6f8fb";
    context.font = `${Math.max(14, canvas.height * 0.022)}px Inter, sans-serif`;
    context.textAlign = "center";
    context.fillText(label, x, y + radius * 1.55);
    context.textAlign = "start";
    drawCalls += 3;
  }

  function roundedRect(x: number, y: number, width: number, height: number, radius: number): void {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
  }

  function updateDiagnostics(): void {
    diagnostics = createAuraSceneDiagnostics({
      provider: provider.info,
      scene,
      frameCount,
      drawCalls,
      renderWidth: canvas.width,
      renderHeight: canvas.height,
      screenshotCaptured: true,
      exportReady: true
    });
  }

  function publish(): void {
    const runtime: AISceneShowcaseRuntime = {
      appId: options.appId,
      status,
      provider: provider.info.label,
      model: provider.info.model,
      mode: options.mode,
      frameCount,
      drawCalls,
      renderWidth: canvas.width,
      renderHeight: canvas.height,
      ir: scene,
      diagnostics,
      patchHistory,
      error: errorText
    };
    window.__AURA3D_AI_SCENE_SHOWCASE__ = runtime;
    (window as unknown as Record<string, unknown>).__AURA3D_AI_SCENE_RUNTIME__ = runtime;
    if (chromeHidden) {
      panelRoot.replaceChildren();
      inspectorRoot.replaceChildren();
      return;
    }
    renderAIScenePanel(panelRoot, {
      title: options.title,
      summary: options.summary,
      status,
      providerLabel: `${provider.info.label} / no API key`,
      scene,
      diagnostics,
      patchCount: patchHistory.length
    });
    renderInspector(inspectorRoot, scene, diagnostics);
  }

  function syncCanvasRenderSize(): void {
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function requireElement<T extends HTMLElement>(id: string, constructor: { new(): T }): T {
    const element = document.getElementById(id);
    if (!(element instanceof constructor)) throw new Error(`Missing #${id}`);
    return element;
  }
}

function alphaColor(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
}
