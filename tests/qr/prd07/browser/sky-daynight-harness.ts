// PRD-07 P3-T3/T4 — sky.dayNight harness.
// A dayNight scene (hour 10 — sun high) renders under whatever flags the
// ?a3d-qr= param carries. Reports: the full-frame checksum (flag-off identity
// vs flag-on difference), the sky-region luma std (P3-T3 > 6), the horizon-vs-
// zenith mean luma, diagnostics().atmosphere, and the count of visible
// prd07.legacySky.* runtime nodes.
import { camera, createAuraApp, lights, primitives, scene, sky } from "@aura3d/engine";
import { mountReady } from "./mount-timing.js";

interface SkyResult {
  readonly status: "ready" | "error";
  readonly mountMs?: number | null;
  readonly flags?: readonly string[];
  /** Sum of per-pixel channel values — cheap frame fingerprint. */
  readonly checksum?: number;
  readonly skyLumaStd?: number;
  readonly horizonMeanLuma?: number;
  readonly zenithMeanLuma?: number;
  readonly background?: string | null;
  readonly visibleLegacyNodes?: number;
  readonly errors?: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_SKY__?: SkyResult;
  }
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

function snapshot(canvas: HTMLCanvasElement): { data: Uint8ClampedArray; w: number; h: number } {
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  const ctx = off.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, w: canvas.width, h: canvas.height };
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

  const dn = sky.dayNight({ hour: 10, seed: 7 });
  const built = scene();
  for (const node of dn.nodes) built.add(node);
  built.add(primitives.plane({ name: "ground", material: { color: "#33401f", roughness: 0.9 }, size: [30, 1, 30], receiveShadow: true }));
  built.background(dn.background);
  built.camera(camera.perspective({ position: [0, 1.8, 7], target: [0, 3.5, -3], fov: 55, near: 0.05, far: 120 }));

  const app = createAuraApp(host, {
    scene: built,
    renderer: { qualityProfile: "production" },
    pixelRatio: 1,
    resize: false,
    autoStart: false,
    ...(flags.length > 0 ? { qualityRebuild: { flags } } : {})
  });
  const __mount = await mountReady(app);
  for (let i = 0; i < 30; i += 1) {
    app.step(1 / 60);
    await frame();
  }
  const canvas = host.querySelector("canvas")!;
  const shot = snapshot(canvas);
  let checksum = 0;
  for (let i = 0; i < shot.data.length; i += 1) checksum = (checksum + shot.data[i]!) >>> 0;

  const report = app.diagnostics() as unknown as {
    atmosphere?: { background?: string };
    errors?: readonly string[];
  };
  // Visible legacy-sky nodes: count runtime nodes whose id matches and is visible.
  let visibleLegacy = 0;
  const nodes = app.nodes as unknown as { get(id: string): { visible?: boolean; snapshot(): { visible: boolean } } | undefined };
  for (const node of dn.nodes as unknown as Array<{ runtime?: { id?: string } }>) {
    const id = node.runtime?.id;
    if (id?.startsWith("prd07.legacySky.")) {
      const h = nodes?.get?.(id);
      const v = h?.snapshot?.().visible ?? h?.visible ?? true;
      if (v) visibleLegacy += 1;
    }
  }

  const h = shot.h;
  const skyRegion = meanStd(shot.data, 0, Math.floor(h * 0.35), shot.w);          // top third = sky
  const zenith = meanStd(shot.data, 0, Math.floor(h * 0.08), shot.w);            // top edge
  const horizon = meanStd(shot.data, Math.floor(h * 0.28), Math.floor(h * 0.4), shot.w); // near horizon

  window.__QR_PRD07_SKY__ = {
    status: "ready",
    mountMs: __mount.mountMs,
    flags,
    checksum,
    skyLumaStd: skyRegion.std,
    zenithMeanLuma: zenith.mean,
    horizonMeanLuma: horizon.mean,
    background: report.atmosphere?.background ?? null,
    visibleLegacyNodes: visibleLegacy,
    errors: [...(report.errors ?? [])]
  };
  app.dispose();
}

main().catch((error: unknown) => {
  window.__QR_PRD07_SKY__ = { status: "error", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
});
