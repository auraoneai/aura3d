/**
 * QR lane-01 harness page (tests/qr/prd01/harness). Query params:
 *   engine=aura3d|three   scene=<prd01-*>   a3d-qr=<list>   tm=<op>   exp=<n>
 * Sets window.__QR_READY__ to the adapter's ReadyPayload when the scene has
 * rendered and settled; exposes window.__QR_TOOLS__ (decode + lane metrics) for
 * the capture script's in-page comparisons.
 */

import { scenes as auraScenes } from "../../../../benchmarks/quality-rebuild/aura3d/scenes/prd01/index";
import { scenes as threeScenes } from "../../../../benchmarks/quality-rebuild/three/scenes/prd01/index";
import * as metrics from "../metrics/index";
import type { ImageLike } from "../metrics/maskIoU";

declare global {
  interface Window {
    __QR_READY__?: unknown;
    __QR_ERROR__?: unknown;
    __QR_TOOLS__?: unknown;
  }
}

async function decodePngToImage(dataUrl: string): Promise<ImageLike> {
  const blob = await fetch(dataUrl).then((r) => r.blob());
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: data.data, width: data.width, height: data.height };
}

function toDataUrl(pngBase64: string): string {
  return `data:image/png;base64,${pngBase64}`;
}

window.__QR_TOOLS__ = {
  decodePng: (pngBase64: string) => decodePngToImage(toDataUrl(pngBase64)),
  decodePngRaw: (pngBase64: string) =>
    decodePngToImage(toDataUrl(pngBase64)).then((img) => ({
      width: img.width,
      height: img.height,
      data: Array.from(img.data)
    })),
  metrics
};

async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const engine = params.get("engine") ?? "aura3d";
  const sceneId = params.get("scene");
  const tools = params.get("tools");
  const status = document.getElementById("status")!;
  const stage = document.getElementById("stage") as HTMLElement;

  if (tools === "render-targets") {
    status.textContent = "running render-target tools";
    const { runRenderTargetTools } = await import("./renderTargets");
    const report = await runRenderTargetTools(stage);
    window.__QR_READY__ = { engine: "aura3d", scene: "render-targets", errors: report.errors };
    status.textContent = "ready render-targets";
    document.title = "ready render-targets";
    return;
  }

  if (tools === "program-compile") {
    status.textContent = "running program-compile";
    const { runProgramCompileTool } = await import("./programCompile");
    const report = await runProgramCompileTool();
    window.__QR_READY__ = { engine: "aura3d", scene: "program-compile", errors: report.errors };
    (window as unknown as { __QR_PROGRAM_COMPILE__?: unknown }).__QR_PROGRAM_COMPILE__ = report;
    status.textContent = "ready program-compile";
    document.title = "ready program-compile";
    return;
  }

  if (tools === "canvas-dpr" || tools === "app-capture" || tools === "renderer-mount-failure") {
    status.textContent = `running ${tools}`;
    const { runCanvasDprTool, runAppCaptureTool, runMountFailureTool } = await import("./appTools");
    const report =
      tools === "canvas-dpr" ? await runCanvasDprTool(stage)
      : tools === "app-capture" ? await runAppCaptureTool(stage)
      : await runMountFailureTool(stage);
    window.__QR_READY__ = { engine: "aura3d", scene: tools, errors: report.errors };
    status.textContent = `ready ${tools}`;
    document.title = `ready ${tools}`;
    return;
  }

  const adapters = engine === "three" ? threeScenes : auraScenes;
  const adapter = adapters.find((entry) => entry.id === sceneId);
  if (!adapter) {
    const message = `no prd01 adapter for scene "${sceneId}" on engine "${engine}" (have: ${adapters.map((a) => a.id).join(", ")})`;
    window.__QR_ERROR__ = message;
    status.textContent = message;
    throw new Error(message);
  }
  status.textContent = `mounting ${sceneId} on ${engine}`;
  const payload = await adapter.mount(stage);
  window.__QR_READY__ = payload;
  status.textContent = `ready ${sceneId} on ${engine}`;
  document.title = `ready ${sceneId}`;
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  window.__QR_ERROR__ = message;
  const status = document.getElementById("status");
  if (status) status.textContent = message;
});
