import { Geometry } from "/packages/rendering/src/Geometry.js";
import { IndexBuffer } from "/packages/rendering/src/IndexBuffer.js";
import { Renderer } from "/packages/rendering/src/Renderer.js";
import { UnlitMaterial } from "/packages/rendering/src/UnlitMaterial.js";
import { VertexBuffer } from "/packages/rendering/src/VertexBuffer.js";
import { VertexFormat } from "/packages/rendering/src/VertexFormat.js";
import type { WebGPUDevice } from "/packages/rendering/src/WebGPUDevice.js";

/**
 * muse3jsparity-PRD J2 — native WebGPU post pixel proof.
 *
 * Rendering-package level (not root): NDC quads rendered by Renderer on the
 * real WebGPU backend, then WebGPUDevice.executeWebGPUBloom /
 * executeWebGPUColorGrade / executeWebGPUFxaa over the scene target with
 * readback metrics per stage. TAA is withheld by design (no velocity or
 * history inputs on the WebGPU path — same doctrine as root A3).
 */

const WIDTH = 256;
const HEIGHT = 256;

interface J2ImageMetrics {
  readonly brightPixels: number;
  readonly meanLuma: number;
  readonly diffPixelsVsScene: number;
  readonly meanAbsDiffVsScene: number;
}

interface J2Stage {
  readonly id: string;
  readonly brightPixels: number;
  readonly meanLuma: number;
  readonly diffPixelsVsScene: number;
  readonly meanAbsDiffVsScene: number;
  readonly drawCalls: number;
}

interface J2Result {
  readonly status: "ready" | "error" | "unsupported";
  readonly backend?: string;
  readonly adapter?: string;
  readonly stages?: readonly J2Stage[];
  readonly postErrors?: readonly string[];
  readonly checks?: Record<string, number | string | boolean>;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_J2_WEBGPU_POST__?: J2Result;
  }
}

window.__AURA3D_J2_WEBGPU_POST__ = { status: "waiting" } as J2Result;

const mount = document.querySelector<HTMLElement>("#mount");
const shoot = document.querySelector<HTMLButtonElement>("#shoot");

if (!mount || !shoot) {
  window.__AURA3D_J2_WEBGPU_POST__ = { status: "error", error: "Harness DOM is missing mount or shoot button." };
} else {
  shoot.addEventListener("click", () => {
    shoot.hidden = true;
    void runHarness().catch((error: unknown) => {
      window.__AURA3D_J2_WEBGPU_POST__ = {
        status: "error",
        error: error instanceof Error ? error.stack ?? error.message : String(error)
      };
    });
  }, { once: true });
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function ndcQuad(x0: number, y0: number, x1: number, y1: number): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3, 4);
  vertices.setAttribute(0, "position", [x0, y0, 0]);
  vertices.setAttribute(1, "position", [x1, y0, 0]);
  vertices.setAttribute(2, "position", [x1, y1, 0]);
  vertices.setAttribute(3, "position", [x0, y1, 0]);
  return new Geometry(vertices, new IndexBuffer([0, 1, 2, 0, 2, 3], 4));
}

function paintGallery(gallery: readonly { readonly id: string; readonly pixels: Uint8Array }[]): void {
  mount!.innerHTML = "";
  const strip = document.createElement("div");
  strip.style.cssText = "display:flex;gap:8px;align-items:flex-start;";
  for (const entry of gallery) {
    const wrap = document.createElement("div");
    const label = document.createElement("div");
    label.textContent = entry.id;
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.style.cssText = "width:256px;height:256px;image-rendering:pixelated;";
    const context = canvas.getContext("2d");
    if (context) {
      const image = context.createImageData(WIDTH, HEIGHT);
      image.data.set(entry.pixels.subarray(0, WIDTH * HEIGHT * 4));
      context.putImageData(image, 0, 0);
    }
    wrap.append(label, canvas);
    strip.append(wrap);
  }
  mount!.append(strip);
}

function analyze(baseline: Uint8Array | Uint8ClampedArray, current: Uint8Array | Uint8ClampedArray): J2ImageMetrics {
  let brightPixels = 0;
  let lumaSum = 0;
  let diffPixels = 0;
  let absDiffSum = 0;
  const count = Math.floor(current.length / 4);
  for (let index = 0; index < count; index += 1) {
    const r = (current[index * 4] ?? 0) / 255;
    const g = (current[index * 4 + 1] ?? 0) / 255;
    const b = (current[index * 4 + 2] ?? 0) / 255;
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    lumaSum += luma;
    if (luma > 0.75) brightPixels += 1;
    const br = (baseline[index * 4] ?? 0) / 255;
    const bg = (baseline[index * 4 + 1] ?? 0) / 255;
    const bb = (baseline[index * 4 + 2] ?? 0) / 255;
    const diff = (Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb)) / 3;
    absDiffSum += diff;
    if (diff > 0.02) diffPixels += 1;
  }
  return { brightPixels, meanLuma: lumaSum / Math.max(1, count), diffPixelsVsScene: diffPixels, meanAbsDiffVsScene: absDiffSum / Math.max(1, count) };
}

async function runHarness(): Promise<void> {
  const renderer = await Renderer.create({ backend: "webgpu", width: WIDTH, height: HEIGHT, clearColor: [0.02, 0.02, 0.03, 1] });
  try {
    const device = renderer.device as WebGPUDevice & {
      executeWebGPUBloom(source: unknown, options?: unknown): unknown;
      executeWebGPUColorGrade(source: unknown, options?: unknown): unknown;
      executeWebGPUFxaa(source: unknown): unknown;
      getWebGPUBloomDiagnostics(): { readonly mipCount: number; readonly halfFloat: boolean; readonly passes: number; readonly executionMode: string } | null;
      drainWebGPUPostErrors(): Promise<readonly string[]>;
    };
    if (renderer.device.kind !== "webgpu" || typeof device.executeWebGPUBloom !== "function") {
      window.__AURA3D_J2_WEBGPU_POST__ = { status: "unsupported", backend: renderer.device.kind };
      return;
    }
    const items = [
      {
        geometry: ndcQuad(-0.9, -0.55, -0.1, 0.55),
        material: new UnlitMaterial({ color: [1, 1, 1, 1] }),
        modelMatrix: IDENTITY,
        modelViewProjectionMatrix: IDENTITY,
        label: "j2 white quad"
      },
      {
        geometry: ndcQuad(0.1, -0.55, 0.9, 0.55),
        material: new UnlitMaterial({ color: [0.5, 0.5, 0.5, 1] }),
        modelMatrix: IDENTITY,
        modelViewProjectionMatrix: IDENTITY,
        label: "j2 gray quad"
      },
      {
        geometry: ndcQuad(-0.06, -0.9, 0.06, 0.9),
        material: new UnlitMaterial({ color: [0, 0, 0, 1] }),
        modelMatrix: IDENTITY,
        modelViewProjectionMatrix: IDENTITY,
        label: "j2 black divider"
      }
    ];
    const sceneTarget = device.createRenderTarget({ width: WIDTH, height: HEIGHT, format: "rgba8", label: "j2-scene" });
    try {
      const sceneDiagnostics = renderer.render({
        renderItems: items,
        renderTarget: sceneTarget,
        cameraPolicy: "identity"
      } as never);
      const readTarget = async (target: unknown): Promise<Uint8Array> => {
        device.setRenderTarget(target as never);
        return device.readPixelsAsync(0, 0, WIDTH, HEIGHT);
      };
      const scenePixels = await readTarget(sceneTarget);
      const sceneMetrics = analyze(scenePixels, scenePixels);

      const stages: J2Stage[] = [];
      const gallery: { readonly id: string; readonly pixels: Uint8Array }[] = [{ id: "scene", pixels: scenePixels }];
      const bloomOut = device.executeWebGPUBloom(sceneTarget, { threshold: 0.7, knee: 0.1, strength: 0.8, quality: "balanced" }) as never;
      try {
        const pixels = await readTarget(bloomOut);
        gallery.push({ id: "bloom", pixels });
        const metrics = analyze(scenePixels, pixels);
        stages.push({ id: "bloom", ...metrics, drawCalls: sceneDiagnostics.drawCalls });
      } finally {
        (bloomOut as { dispose(): void }).dispose();
      }
      const gradeOut = device.executeWebGPUColorGrade(sceneTarget, { exposure: 1, contrast: 1.2, saturation: 0.5 }) as never;
      try {
        const pixels = await readTarget(gradeOut);
        gallery.push({ id: "grade", pixels });
        const metrics = analyze(scenePixels, pixels);
        stages.push({ id: "color-grade", ...metrics, drawCalls: sceneDiagnostics.drawCalls });
      } finally {
        (gradeOut as { dispose(): void }).dispose();
      }
      const fxaaOut = device.executeWebGPUFxaa(sceneTarget) as never;
      try {
        const pixels = await readTarget(fxaaOut);
        gallery.push({ id: "fxaa", pixels });
        const metrics = analyze(scenePixels, pixels);
        stages.push({ id: "fxaa", ...metrics, drawCalls: sceneDiagnostics.drawCalls });
      } finally {
        (fxaaOut as { dispose(): void }).dispose();
      }

      paintGallery(gallery);
      const postErrors = await device.drainWebGPUPostErrors();
      const byId = (id: string): J2Stage | undefined => stages.find((stage) => stage.id === id);
      const bloom = byId("bloom");
      const grade = byId("grade") ?? byId("color-grade");
      const fxaa = byId("fxaa");
      if (!bloom || !grade || !fxaa || !sceneMetrics) {
        throw new Error(`J2 stage assembly failed: stages=${JSON.stringify(stages)} sceneMetrics=${JSON.stringify(sceneMetrics)}`);
      }
      const bloomDiagnostics = device.getWebGPUBloomDiagnostics();
      const deviceDiagnostics = device.getDiagnostics();
      window.__AURA3D_J2_WEBGPU_POST__ = {
        status: "ready",
        backend: renderer.device.kind,
        adapter: `${device.info.vendor} ${device.info.renderer}`.trim(),
        stages,
        postErrors: [...postErrors],
        checks: {
          sceneBright: sceneMetrics.brightPixels,
          sceneMeanLuma: Number(sceneMetrics.meanLuma.toFixed(4)),
          bloomBright: bloom.brightPixels,
          bloomDiff: bloom.diffPixelsVsScene,
          gradeMeanLuma: Number(grade.meanLuma.toFixed(4)),
          gradeDiff: grade.diffPixelsVsScene,
          fxaaDiff: fxaa.diffPixelsVsScene,
          fxaaMeanAbsDiff: Number(fxaa.meanAbsDiffVsScene.toFixed(4)),
          bloomMipCount: bloomDiagnostics?.mipCount ?? -1,
          bloomHalfFloat: bloomDiagnostics?.halfFloat ?? false,
          bloomPasses: bloomDiagnostics?.passes ?? -1,
          bloomExecutionMode: bloomDiagnostics?.executionMode ?? "missing",
          nativeBloomPasses: deviceDiagnostics.nativeBloomPasses ?? -1,
          nativeColorGradePasses: deviceDiagnostics.nativeColorGradePasses ?? -1,
          nativeFxaaPasses: deviceDiagnostics.nativeFxaaPasses ?? -1
        }
      };
    } finally {
      sceneTarget.dispose();
    }
  } finally {
    renderer.dispose();
  }
}
