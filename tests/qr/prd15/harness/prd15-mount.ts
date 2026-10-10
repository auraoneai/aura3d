/**
 * PRD-15 §15-SPECS mount harness. Query params:
 *   mode=lit|fail|pack   — lit scene (directional + occluder), forced
 *                          mount failure (strict + remote model URL), or a
 *                          plain production mount for the consumer smoke
 *                          path.
 *   flags=csv            — a3d-qr flag list (identity checks run both arms).
 *   pixels=1             — attach the frame as RGBA numbers for luma checks.
 *
 * Publishes window.__QR_READY__ (payload) or window.__QR_ERROR__ (message).
 */
import {
  camera,
  createAuraApp,
  lights,
  material,
  primitives,
  scene,
  type AuraApp
} from "@aura3d/engine";

declare const __AURA3D_VERSION__: string;

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") ?? "lit";
const flags = (params.get("flags") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const wantPixels = params.get("pixels") === "1";

function publishError(error: unknown): void {
  (window as { __QR_ERROR__?: string }).__QR_ERROR__ =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function framePixels(app: AuraApp): Promise<{ width: number; height: number; pixels: number[] }> {
  const canvas = document.querySelector("canvas")!;
  app.step(0); app.step(0); app.step(0); app.step(0);
  const shot = document.createElement("canvas");
  shot.width = canvas.width; shot.height = canvas.height;
  const ctx = shot.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  const data = ctx.getImageData(0, 0, shot.width, shot.height).data;
  return { width: shot.width, height: shot.height, pixels: Array.from(data) };
}

async function servedShaderScan(): Promise<{ files: number; hits: string[] }> {
  const urls = performance.getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => u.includes("/packages/rendering/src/") && (u.endsWith(".ts") || u.endsWith(".js")));
  const hits: string[] = [];
  for (const url of urls) {
    try {
      const text = await (await fetch(url)).text();
      if (text.includes("u_lightDirection")) hits.push(url);
    } catch { /* unreadable module — ignore */ }
  }
  return { files: urls.length, hits };
}

async function run(): Promise<void> {
  const host = document.getElementById("stage")!;
  const built =
    mode === "fail"
      ? scene()
          .camera(camera.perspective({ position: [0, 1.5, 4], target: [0, 0.5, 0], fov: 45, near: 0.1, far: 50 }))
          .background("#1d2126")
          .add(lights.directional({ name: "sun", position: [4, 6, 3], intensity: 2, color: "#ffffff" }))
          // T4.1/T4.5 trigger: remote model URLs are blocked on the
          // production bridge → typed AuraRuntimeError under strict.
          .add({
            kind: "model",
            name: "unsafe-remote",
            asset: { url: "https://example.invalid/model.glb", format: "glb" },
            castShadow: false,
            receiveShadow: false,
            visible: true
          } as never)
      : scene()
          .camera(camera.perspective({ position: [3.2, 2.6, 4.2], target: [0, 0.4, 0], fov: 45, near: 0.1, far: 60 }))
          .background("#1d2126")
          .add(lights.ambient({ name: "fill", intensity: 0.12, color: "#ffffff" }))
          .add(lights.directional({ name: "sun", position: [4, 6, 2], intensity: 3, color: "#fff2e0", shadow: true }))
          .add(primitives.plane({ name: "ground", size: 10, material: material.pbr({ color: "#808080", roughness: 0.9 }) }))
          .add(primitives.box({ name: "occluder", size: [0.8, 2.4, 0.8], position: [0, 1.2, 0], material: material.pbr({ color: "#606060", roughness: 0.7 }), castShadow: true }));

  const app = createAuraApp(host, {
    scene: built,
    strict: true,
    renderer: { qualityProfile: "production", backend: "webgl2" } as never,
    qualityRebuild: { flags },
    resize: false,
    autoStart: false
  });

  try {
    await app.ready();
  } catch (error) {
    (window as { __QR_READY__?: unknown }).__QR_READY__ = {
      harness: "prd15-mount", mode, flags, version: __AURA3D_VERSION__,
      mountFailed: true,
      errorName: error instanceof Error ? error.name : "Error",
      errorMessage: error instanceof Error ? error.message : String(error),
      overlayText: document.querySelector('[role="alert"]')?.textContent ?? null,
      extra: {}
    };
    return;
  }

  const diag = app.diagnostics() as unknown as Record<string, unknown>;
  (window as { __QR_READY__?: unknown }).__QR_READY__ = {
    harness: "prd15-mount", mode, flags, version: __AURA3D_VERSION__,
    mountFailed: false,
    backend: diag.backend ?? null,
    degradations: diag.degradations ?? diag.dropped ?? [],
    drawCalls: diag.drawCalls ?? null,
    shaderScan: await servedShaderScan(),
    overlayText: document.querySelector('[role="alert"]')?.textContent ?? null,
    extra: wantPixels ? { frame: await framePixels(app) } : {}
  };
}

run().catch(publishError);
