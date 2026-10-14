import { camera, createAuraApp, lights, model, scene, type AuraAssetRef } from "@aura3d/engine";
import { assets } from "../../examples/neon-corridor-strike/src/aura-assets";

export const corridorProbeIds = ["ammoCrate", "medkit", "neonCorridorContainmentWorld", "neonContainmentWardenA", "neonContainmentWardenB", "neonContainmentPulseRifle"] as const;
export type CorridorProbeId = typeof corridorProbeIds[number];

const config: Record<CorridorProbeId, { targetHeight?: number; targetMaxDimension?: number; azimuth: number; elevation: number; rotation?: readonly [number, number, number]; minWidth: number; minHeight: number }> = {
  ammoCrate: { targetMaxDimension: 3.4, azimuth: 0.72, elevation: 0.28, minWidth: 180, minHeight: 100 },
  neonCorridorContainmentWorld: { targetMaxDimension: 17, azimuth: 0.58, elevation: 0.24, minWidth: 360, minHeight: 220 },
  neonContainmentWardenA: { targetHeight: 4.2, azimuth: 0.18, elevation: 0.12, rotation: [0, 0, 0], minWidth: 130, minHeight: 220 },
  neonContainmentWardenB: { targetMaxDimension: 4.4, azimuth: 0.18, elevation: 0.12, rotation: [0, 0, 0], minWidth: 260, minHeight: 150 },
  medkit: { targetMaxDimension: 3.4, azimuth: 0.72, elevation: 0.34, minWidth: 180, minHeight: 100 },
  neonContainmentPulseRifle: { targetMaxDimension: 4.4, azimuth: 1.2, elevation: 0.15, rotation: [0, 0, 0.22], minWidth: 230, minHeight: 100 }
};

declare global { interface Window { __AURA3D_CORRIDOR_RELEASE_PROBE__?: unknown; __AURA3D_CORRIDOR_RELEASE_PROBE_ERROR__?: string } }

void run().catch((error) => { window.__AURA3D_CORRIDOR_RELEASE_PROBE_ERROR__ = error instanceof Error ? error.message : String(error); });

async function run(): Promise<void> {
  const id = new URLSearchParams(location.search).get("asset") as CorridorProbeId;
  if (!corridorProbeIds.includes(id)) throw new Error(`unsupported corridor probe ${String(id)}`);
  const view = config[id];
  const asset = assets[id] as AuraAssetRef<"model", CorridorProbeId>;
  const node = model(asset, { name: `corridor-release-probe-${id}`, ...(view.targetHeight ? { targetHeight: view.targetHeight } : {}), ...(view.targetMaxDimension ? { targetMaxDimension: view.targetMaxDimension } : {}) });
  const app = createAuraApp("#probe-stage", {
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene().background("#07131f")
      .camera(camera.frameAsset(asset, { targetHeight: view.targetHeight, targetMaxDimension: view.targetMaxDimension, padding: 0.94, fov: 32, azimuth: view.azimuth, elevation: view.elevation }))
      .add(view.rotation ? node.rotate(...view.rotation) : node)
      .add(lights.studio())
      .add(lights.point({ name: "corridor probe rim", position: [-3, 4, 2], color: "#7ee8ff", intensity: 1.2 }))
  });
  await waitFor(() => app.diagnostics().drawCalls > 0, 30_000);
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const canvas = app.canvas;
  if (!canvas) throw new Error("missing probe canvas");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("missing WebGL2 probe context");
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const bg = [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0];
  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
  for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
    const offset = (y * canvas.width + x) * 4;
    const delta = Math.abs((pixels[offset] ?? 0) - bg[0]) + Math.abs((pixels[offset + 1] ?? 0) - bg[1]) + Math.abs((pixels[offset + 2] ?? 0) - bg[2]);
    if ((pixels[offset + 3] ?? 0) > 0 && delta > 34) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  const foregroundBounds = maxX >= minX ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : { x: 0, y: 0, width: 0, height: 0 };
  const diagnostics = app.diagnostics();
  const failures = [...(foregroundBounds.width >= view.minWidth ? [] : [`foreground-width:${foregroundBounds.width}`]), ...(foregroundBounds.height >= view.minHeight ? [] : [`foreground-height:${foregroundBounds.height}`])];
  window.__AURA3D_CORRIDOR_RELEASE_PROBE__ = { id, hash: asset.hash, route: `tests/browser/neon-corridor-release-asset-probe-harness?asset=${id}`, foregroundBounds, diagnostics: { backend: diagnostics.renderer?.runtime.backend, drawCalls: diagnostics.drawCalls }, failures };
}

async function waitFor(predicate: () => boolean, timeout: number): Promise<void> { const start = performance.now(); while (performance.now() - start < timeout) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 50)); } throw new Error("timed out waiting for corridor release probe"); }
