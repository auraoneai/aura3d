/**
 * threejs-parity lane L4 — public `texture.*` lab.
 *
 * Exercises the real GPU-backed surface end-to-end on one canvas:
 *   - `texture.data`    → checkerboard data texture on the left plane.
 *   - `texture.canvas`  → live 2D canvas source on the right plane; a
 *     post-mount repaint + `needsUpdate` proves source-revision upload by
 *     changing sampled pixels between frames.
 *   - `texture.load`    → real async decode of a browser-encoded data-URI PNG
 *     plus a guaranteed-404 URL, driving `onAssetProgress`/`onAssetError`.
 *
 * `window.__AURA3D_PARITY_TEXTURE_LAB__` carries the evidence the Playwright
 * spec asserts: textured-material pixel backing, sampled-pixel changes after
 * runtime `needsUpdate`, and progress/error bookkeeping.
 */
import {
  camera,
  createAuraApp,
  lights,
  material,
  primitives,
  scene,
  texture,
  type AuraApp
} from "@aura3d/engine";

interface ParityTextureLabState {
  readonly id: "parity-texture-lab";
  status: "boot" | "ready" | "error";
  readonly claim: "public-texture-namespace-runtime-upload";
  drawCalls: number;
  texturedMaterials: number;
  pixelBackedMaterials: number;
  nonDarkPixels: number;
  shotBeforeUpdate: string;
  shotAfterUpdate: string;
  progressEvents: number;
  errorEvents: number;
  loadedHandle: boolean;
  loadedWidth: number;
  loadedFormat: string;
  errors: string[];
  error?: string;
}

declare global {
  interface Window {
    __AURA3D_PARITY_TEXTURE_LAB__?: ParityTextureLabState;
  }
}

const state: ParityTextureLabState = {
  id: "parity-texture-lab",
  status: "boot",
  claim: "public-texture-namespace-runtime-upload",
  drawCalls: 0,
  texturedMaterials: 0,
  pixelBackedMaterials: 0,
  nonDarkPixels: 0,
  shotBeforeUpdate: "",
  shotAfterUpdate: "",
  progressEvents: 0,
  errorEvents: 0,
  loadedHandle: false,
  loadedWidth: 0,
  loadedFormat: "",
  errors: []
};
window.__AURA3D_PARITY_TEXTURE_LAB__ = state;

function checker(w: number, h: number): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const dark = ((x >> 2) + (y >> 2)) % 2 === 0;
      px[i] = dark ? 235 : 40;
      px[i + 1] = dark ? 120 : 200;
      px[i + 2] = dark ? 40 : 235;
      px[i + 3] = 255;
    }
  }
  return px;
}

function paintedCanvas(color: string, glyph: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "48px sans-serif";
  ctx.fillText(glyph, 14, 50);
  return c;
}

function hash(dataUrl: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < dataUrl.length; i += 1) {
    h ^= dataUrl.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

// C-05 capture(): synchronous render + in-task readPixels — reliable on a
// non-preserved drawing buffer (canvas.toDataURL reads a cleared buffer on
// software rasterisers and a stale one under hardware).
async function captureDataUrl(app: AuraApp): Promise<string> {
  const blob = (await app.capture?.({ type: "png-blob" })) as Blob | undefined;
  if (!blob) return "";
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

async function run(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#stage");
  if (!canvas) throw new Error("parity-texture-lab canvas missing");

  const dataTex = texture.data({ width: 16, height: 16, data: checker(16, 16), colorSpace: "srgb" });
  dataTex.wrapS = "repeat";
  dataTex.repeat = [2, 2];
  const live = paintedCanvas("#e11d48", "A");
  const canvasTex = texture.canvas({ canvas: live, colorSpace: "srgb" });

  const app = createAuraApp(canvas, {
    pixelRatio: 1,
    resize: false,
    onAssetProgress: () => { state.progressEvents += 1; },
    onAssetError: () => { state.errorEvents += 1; },
    scene: scene()
      .background("#0b1020")
      .camera(camera.perspective({ position: [0, 0.3, 3.1], target: [0, 0, 0], fov: 38 }))
      .add(primitives.plane({
        name: "tex-data",
        position: [-1.15, 0, 0],
        size: 2.4,
        material: material.pbr({ color: "#ffffff", roughness: 0.85, texture: dataTex })
      }))
      .add(primitives.plane({
        name: "tex-canvas",
        position: [1.15, 0, 0],
        size: 2.4,
        material: material.pbr({ color: "#ffffff", roughness: 0.85, texture: canvasTex })
      }))
      .add(lights.directional({ position: [2, 4, 3], intensity: 2.4 }))
      .add(lights.ambient({ intensity: 0.6 }))
  });
  (window as unknown as { __PARITY_TEXTURE_APP__?: unknown }).__PARITY_TEXTURE_APP__ = app;

  try {
    // Wait for the post-mount texture upgrade to mark materials pixel-backed.
    const deadline = performance.now() + 20_000;
    while (performance.now() < deadline) {
      const textured = app.diagnostics().renderer?.runtime.texturedMaterials ?? [];
      if (textured.length >= 2 && textured.filter((m) => m.pixelBacked).length >= 2) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    // ST-07: real async decode — a fetched PNG run back through
    // texture.load with the app's asset events live. A real URL (not a data
    // URI) so the LoadingManager emits byte-progress events (ST-06).
    const loadedTex = await texture.load("probe.png", { colorSpace: "srgb" });
    state.loadedHandle = true;
    state.loadedWidth = loadedTex.texture.width;
    state.loadedFormat = loadedTex.texture.format;

    // ST-06 error path: a guaranteed-missing URL must reject + fire the error event.
    await texture.load("/parity-lab-does-not-exist.png").catch(() => undefined);

    // ST-3 evidence: repaint the live canvas source and mark needsUpdate —
    // the next rendered frame must sample different pixels.
    const beforeDataUrl = await captureDataUrl(app);
    state.shotBeforeUpdate = hash(beforeDataUrl);
    const ctx = live.getContext("2d")!;
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(0, 0, 64, 64);
    canvasTex.needsUpdate = true;
    app.step(1 / 60);
    const lastShotDataUrl = await captureDataUrl(app);
    state.shotAfterUpdate = hash(lastShotDataUrl);

    // Cheap non-dark pixel count over the app's own screenshot data URL.
    const probe = document.createElement("canvas");
    probe.width = 160;
    probe.height = 90;
    const pctx = probe.getContext("2d")!;
    const img = new Image();
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.src = lastShotDataUrl;
    });
    pctx.drawImage(img, 0, 0, 160, 90);
    const px = pctx.getImageData(0, 0, 160, 90).data;
    let lit = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i]! + px[i + 1]! + px[i + 2]! > 60) lit += 1;
    }
    state.nonDarkPixels = lit;

    const diagnostics = app.diagnostics();
    const textured = diagnostics.renderer?.runtime.texturedMaterials ?? [];
    state.drawCalls = diagnostics.drawCalls;
    state.texturedMaterials = textured.length;
    state.pixelBackedMaterials = textured.filter((m) => m.pixelBacked).length;
    state.errors = diagnostics.errors.slice(0, 8);
    state.status = "ready";
  } catch (error) {
    state.status = "error";
    state.error = error instanceof Error ? error.stack ?? error.message : String(error);
  }
}

run().catch((error: unknown) => {
  state.status = "error";
  state.error = error instanceof Error ? error.stack ?? error.message : String(error);
});
