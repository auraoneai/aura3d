// PRD-07 P3-T3 — bare `sky` node harness (C-21 through the frame graph).
// A `sky.preetham` node (noon sun) + a lit ground plane; reports sky-region
// luma stats + atmosphere diagnostics + sun-disc luminance from a small
// rgba16f debug readback when the renderer exposes one.
import { camera, createAuraApp, primitives, scene, sky } from "@aura3d/engine";

interface SkyBgResult {
  readonly status: "ready" | "error";
  readonly flags?: readonly string[];
  readonly skyLumaStd?: number;
  readonly horizonMeanLuma?: number;
  readonly zenithMeanLuma?: number;
  readonly background?: string | null;
  readonly errors?: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_SKYBG__?: SkyBgResult;
  }
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function meanStd(data: Uint8ClampedArray, y0: number, y1: number, w: number): { mean: number; std: number } {
  let n = 0, sum = 0, sq = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const L = luma(data[i]!, data[i + 1]!, data[i + 2]!);
      n += 1; sum += L; sq += L * L;
    }
  }
  const mean = sum / Math.max(1, n);
  return { mean, std: Math.sqrt(Math.max(0, sq / Math.max(1, n) - mean * mean)) };
}

async function main(): Promise<void> {
  const host = document.getElementById("stage")!;
  const raw = new URLSearchParams(window.location.search).get("a3d-qr");
  const flags = raw ? raw.split(",").filter(Boolean) : [];

  const built = scene()
    .add(sky.preetham({ sun: { elevationDeg: 60, azimuthDeg: 200 }, turbidity: 5 }))
    .add(primitives.plane({ name: "ground", material: { color: "#3a4a2a", roughness: 0.9 }, size: [30, 1, 30], receiveShadow: true }));
  built.camera(camera.perspective({ position: [0, 1.6, 7], target: [0, 3.0, -3], fov: 55, near: 0.05, far: 120 }));

  const app = createAuraApp(host, {
    scene: built,
    renderer: { qualityProfile: "production" },
    pixelRatio: 1,
    resize: false,
    autoStart: false,
    ...(flags.length > 0 ? { qualityRebuild: { flags } } : {})
  });
  await app.ready();
  for (let i = 0; i < 30; i += 1) {
    app.step(1 / 60);
    await frame();
  }
  const canvas = host.querySelector("canvas")!;
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  const ctx = off.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const h = canvas.height;
  const skyRegion = meanStd(data, 0, Math.floor(h * 0.35), canvas.width);
  const zenith = meanStd(data, 0, Math.floor(h * 0.08), canvas.width);
  const horizon = meanStd(data, Math.floor(h * 0.28), Math.floor(h * 0.4), canvas.width);

  const report = app.diagnostics() as unknown as {
    atmosphere?: { background?: string };
    errors?: readonly string[];
  };

  window.__QR_PRD07_SKYBG__ = {
    status: "ready",
    flags,
    skyLumaStd: skyRegion.std,
    zenithMeanLuma: zenith.mean,
    horizonMeanLuma: horizon.mean,
    background: report.atmosphere?.background ?? null,
    errors: [...(report.errors ?? [])]
  };
  app.dispose();
}

main().catch((error: unknown) => {
  window.__QR_PRD07_SKYBG__ = { status: "error", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
});
