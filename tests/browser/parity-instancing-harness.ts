/**
 * Parity-L5 SG-01/SG-02 browser harness — real GPU evidence for
 * `instances.mesh` (three.js InstancedMesh) and `batched.mesh` (BatchedMesh):
 *
 *  - `instances.mesh("box", pbr, 4)` with per-instance matrices (a row of
 *    boxes) and per-instance colors (red/green/blue/white) must rasterize —
 *    distinct color buckets prove `setColorAt` reached the instance buffer.
 *  - `batched.mesh` with two geometries (box+sphere) and `setVisibleAt`
 *    toggled mid-run proves slot lifecycle over the packed/pooled path.
 *  - The `WEBGL_multi_draw` extension presence and the renderer's batching
 *    diagnostic are reported so the spec can pin the multi-draw-vs-fallback
 *    route honestly.
 *
 * `window.__AURA3D_PARITY_INSTANCING__` carries the verdict.
 */

import { batched, camera, createAuraApp, createAuraRouteHealthSnapshot, instances, lights, material, scene } from "@aura3d/engine";

interface HarnessResult {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly drawCalls?: number;
  readonly errors?: readonly string[];
  readonly warnings?: readonly string[];
  readonly compiledFeatures?: readonly string[];
  readonly rendererBatching?: unknown;
  readonly multiDrawExtension?: boolean;
  /** §8 route-health: snapshot naming the parity IDs this port exercised. */
  readonly routeHealth?: { readonly status: string; readonly parityIds: readonly string[] };
  readonly image?: {
    readonly nonDarkPixels: number;
    readonly colorBuckets: number;
  };
}

declare global {
  interface Window {
    __AURA3D_PARITY_INSTANCING__?: HarnessResult;
  }
}

const mount = document.getElementById("mount");
const status = document.getElementById("status");

function translation(x: number, y: number, z: number): readonly number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function analyzeImage(image: CanvasImageSource & { readonly width: number; readonly height: number }): HarnessResult["image"] {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const buckets = new Set<number>();
  let nonDark = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    if (r + g + b > 30) nonDark += 1;
    buckets.add(((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5));
  }
  return { nonDarkPixels: nonDark, colorBuckets: buckets.size };
}

function multiDrawExtensionPresent(): boolean {
  const probe = document.createElement("canvas").getContext("webgl2");
  return !!probe?.getExtension("WEBGL_multi_draw");
}

async function run(): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  mount!.append(canvas);

  // SG-01: four instanced boxes in a row, each a distinct color.
  const inst = instances.mesh("box", material.pbr({ color: "#ffffff", roughness: 0.6 }), 4);
  const instanceColors = ["#ff4040", "#40ff40", "#4080ff", "#ffffff"] as const;
  for (let i = 0; i < 4; i += 1) {
    inst.setMatrixAt(i, translation((i - 1.5) * 1.6, 1.2, 0));
    inst.setColorAt(i, instanceColors[i]!);
  }
  inst.needsUpdate = true;

  // SG-02: one box + one sphere through the packed batched route.
  const bat = batched.mesh({ maxInstances: 4, maxVertices: 4096, maxIndices: 8192 });
  const gBox = bat.addGeometry("box");
  const gSphere = bat.addGeometry("sphere");
  const s0 = bat.addInstance(gBox);
  const s1 = bat.addInstance(gSphere);
  bat.setMatrixAt(s0, translation(-1.2, -1.0, 0));
  bat.setMatrixAt(s1, translation(1.2, -1.0, 0));
  bat.setColorAt(s0, "#ffcc33");
  bat.setColorAt(s1, "#33ccff");

  const appScene = scene()
    .background("#0b1020")
    .add(inst)
    .add(bat)
    .add(lights.studio({ intensity: 1.4 }))
    .camera(camera.autoFrame({ bounds: { min: [-4.5, -2.2, -1], max: [4.5, 2.2, 1] } }));

  const app = createAuraApp(canvas, {
    scene: appScene,
    pixelRatio: 1,
    resize: false,
    qualityRebuild: { flags: "parity.batching,tiers.batching,core" }
  });

  // Let several frames settle, then flip visibility once to prove updates.
  // On software GL the async program compile can outlast a fixed rAF count —
  // poll diagnostics until the first real draw lands (bounded).
  await app.ready().catch(() => undefined);
  for (let i = 0; i < 12; i += 1) await waitForFrame();
  const drawWaitStart = Date.now();
  while ((app.diagnostics().drawCalls ?? 0) === 0 && Date.now() - drawWaitStart < 45_000) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  bat.setVisibleAt(s1, false);
  for (let i = 0; i < 4; i += 1) await waitForFrame();
  bat.setVisibleAt(s1, true);
  for (let i = 0; i < 4; i += 1) await waitForFrame();

  const diagnostics = app.diagnostics();
  // C-05 sanctioned readback — app.screenshot()'s toDataURL is unreliable on
  // preserveDrawingBuffer:false contexts.
  const image = analyzeImage(await app.capture({ type: "image-bitmap" }) as ImageBitmap);
  // §8 route-health inside the live app, before dispose (SG-01/SG-02 per lane L5).
  const routeHealth = createAuraRouteHealthSnapshot(app, { parityIds: ["SG-01", "SG-02"] });
  window.__AURA3D_PARITY_INSTANCING__ = {
    status: "ready",
    drawCalls: diagnostics.drawCalls,
    errors: diagnostics.errors,
    warnings: diagnostics.warnings,
    compiledFeatures: diagnostics.compiledFeatures,
    rendererBatching: diagnostics["renderer.batching"],
    multiDrawExtension: multiDrawExtensionPresent(),
    routeHealth,
    image
  };
  app.dispose();
}

if (!mount || !status) {
  window.__AURA3D_PARITY_INSTANCING__ = { status: "error", error: "Harness DOM missing mount/status." };
} else {
  status.textContent = "parity-instancing: running…";
  run()
    .then(() => { status.textContent = "parity-instancing: ready"; })
    .catch((error: unknown) => {
      window.__AURA3D_PARITY_INSTANCING__ = {
        status: "error",
        error: error instanceof Error ? error.stack ?? error.message : String(error)
      };
      status.textContent = "parity-instancing: error";
    });
}
