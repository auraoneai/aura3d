import {
  camera,
  createAuraApp,
  effects,
  lights,
  material,
  primitives,
  scene,
  type AuraSceneBuilder
} from "@aura3d/engine";

interface ImageMetrics {
  readonly nonDarkPixels: number;
  readonly nonLightPixels: number;
  readonly colorBuckets: number;
  readonly spatialChecksum: number;
}

interface A5Capture {
  readonly id: string;
  readonly drawCalls: number;
  readonly nodeCount: number;
  readonly fogPreset: string;
  readonly fogEnabled: boolean;
  readonly actualPasses: readonly string[];
  readonly image: ImageMetrics;
  readonly meta: Record<string, string | number | boolean>;
}

interface A5Result {
  readonly status: "ready" | "error" | "waiting";
  readonly captures?: readonly A5Capture[];
  readonly checks?: Record<string, boolean | number | string>;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_A5_VOLUMETRIC__?: A5Result;
  }
}

window.__AURA3D_A5_VOLUMETRIC__ = { status: "waiting" };

const mount = document.querySelector<HTMLElement>("#mount");
const shoot = document.querySelector<HTMLButtonElement>("#shoot");
const contactSheet = document.createElement("canvas");
contactSheet.width = 1280;
contactSheet.height = 400;
contactSheet.style.position = "fixed";
contactSheet.style.left = "0";
contactSheet.style.top = "0";
contactSheet.style.width = "1280px";
contactSheet.style.height = "400px";
contactSheet.style.background = "#020617";
contactSheet.style.zIndex = "1";
document.body.append(contactSheet);
let contactSheetIndex = 0;

if (!mount || !shoot) {
  window.__AURA3D_A5_VOLUMETRIC__ = { status: "error", error: "Harness DOM is missing mount or shoot button." };
} else {
  shoot.addEventListener("click", () => {
    shoot.hidden = true;
    void runHarness().catch((error: unknown) => {
      window.__AURA3D_A5_VOLUMETRIC__ = {
        status: "error",
        error: error instanceof Error ? error.stack ?? error.message : String(error)
      };
    });
  }, { once: true });
}

// Low camera aimed up toward the softbox: view rays align with the direction
// toward the dominant (spot-proxy) light so the forward inscatter lobe reads.
const roomCamera = camera.perspective({ position: [1.6, 0.55, 4.6], target: [-0.6, 1.7, -0.4], fov: 55 });

function roomBody(): AuraSceneBuilder {
  return scene()
    .background("#05070d")
    .add(primitives.box({ name: "floor", material: material.pbr({ color: "#11151d" }) }).position(0, -0.6, 0).scale([9, 0.2, 9]))
    .add(primitives.box({ name: "occluder-left", material: material.pbr({ color: "#1b2432" }) }).position(-1.1, 0.5, -0.6).scale([1, 2.2, 1]))
    .add(primitives.box({ name: "occluder-right", material: material.pbr({ color: "#232c3d" }) }).position(1.2, 0.3, -1.2).scale([1.4, 1.8, 1.4]))
    .add(primitives.box({ name: "back-wall", material: material.pbr({ color: "#0b0f16" }) }).position(0, 1.4, -3.2).scale([9, 4, 0.3]))
    .add(lights.softbox({ position: [-0.6, 2.6, 0.6], intensity: 2.4, color: "#fff2df" }))
    .add(lights.ambient({ intensity: 0.12 }));
}

async function runHarness(): Promise<void> {
  const depth = await capture("fog-depth", roomBody()
    .add(effects.fog({ density: 0.05, color: "#8fa8c8", intensity: 0.5 }))
    .camera(roomCamera), { kind: "plain-exp2-fog" });
  const volumetric = await capture("fog-volumetric", roomBody()
    .add(effects.volumetricFog({ density: 0.05, color: "#8fa8c8", intensity: 0.7, volumetricQuality: "balanced" }))
    .camera(roomCamera), { kind: "volumetric-inscatter", quality: "balanced" });
  const off = await capture("fog-volumetric-off", roomBody()
    .add(effects.volumetricFog({ density: 0.05, color: "#8fa8c8", intensity: 0.7, volumetricQuality: "off" }))
    .camera(roomCamera), { kind: "volumetric-quality-off", quality: "off" });
  const captures = [depth, volumetric, off];
  const byId = (id: string): A5Capture => captures.find((entry) => entry.id === id)!;

  window.__AURA3D_A5_VOLUMETRIC__ = {
    status: "ready",
    captures,
    checks: {
      volumetricDiff: metricDiff(byId("fog-depth").image, byId("fog-volumetric").image),
      qualityOffDiff: metricDiff(byId("fog-depth").image, byId("fog-volumetric-off").image),
      depthPreset: byId("fog-depth").fogPreset,
      volumetricPreset: byId("fog-volumetric").fogPreset,
      offPreset: byId("fog-volumetric-off").fogPreset,
      volumetricPassSubmitted: byId("fog-volumetric").actualPasses.includes("volumetric-light"),
      offPassSubmitted: byId("fog-volumetric-off").actualPasses.includes("volumetric-light")
    }
  };
}

async function capture(id: string, appScene: AuraSceneBuilder, meta: Record<string, string | number | boolean>): Promise<A5Capture> {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  mount!.append(canvas);
  const app = createAuraApp(canvas, { scene: appScene, pixelRatio: 1, resize: false });
  await waitForFrame();
  await waitForFrame();
  await waitForReady(app, id);
  const dataUrl = app.screenshot().dataUrl;
  const metrics = await analyzeDataUrl(dataUrl);
  await drawContactSheetTile(id, dataUrl);
  const diagnostics = app.diagnostics();
  const renderer = (diagnostics as { readonly renderer?: {
    readonly fog?: { readonly preset?: string; readonly enabled?: boolean };
    readonly postprocess?: { readonly actualPasses?: readonly string[] };
  } }).renderer;
  const result: A5Capture = {
    id,
    drawCalls: diagnostics.drawCalls,
    nodeCount: Array.isArray((app.scene as { readonly nodes?: readonly unknown[] }).nodes)
      ? ((app.scene as { readonly nodes?: readonly unknown[] }).nodes!.length)
      : 0,
    fogPreset: renderer?.fog?.preset ?? "unknown",
    fogEnabled: renderer?.fog?.enabled ?? false,
    actualPasses: renderer?.postprocess?.actualPasses ?? [],
    image: metrics,
    meta
  };
  app.dispose();
  canvas.remove();
  return result;
}

async function drawContactSheetTile(id: string, dataUrl: string): Promise<void> {
  const context = contactSheet.getContext("2d");
  if (!context) return;
  if (contactSheetIndex === 0) {
    context.fillStyle = "#020617";
    context.fillRect(0, 0, contactSheet.width, contactSheet.height);
  }
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const tileWidth = 420;
  const tileHeight = 400;
  const x = contactSheetIndex * tileWidth;
  context.fillStyle = "#0f172a";
  context.fillRect(x, 0, tileWidth, tileHeight);
  context.drawImage(image, x + 8, 30, tileWidth - 16, tileHeight - 38);
  context.fillStyle = "#e2e8f0";
  context.font = "700 15px system-ui, sans-serif";
  context.fillText(id, x + 10, 20);
  contactSheetIndex += 1;
}

async function waitForReady(app: ReturnType<typeof createAuraApp>, id: string): Promise<void> {
  for (let index = 0; index < 300; index += 1) {
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length > 0) {
      throw new Error(`${id}: ${diagnostics.errors.join("\n")}`);
    }
    if (diagnostics.drawCalls > 0) return;
    await waitForFrame();
  }
  throw new Error(`${id}: Aura3D app did not draw a frame before the A5 harness timeout.`);
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function analyzeDataUrl(dataUrl: string): Promise<ImageMetrics> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create analysis canvas.");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let nonDarkPixels = 0;
  let nonLightPixels = 0;
  const buckets = new Set<string>();
  let spatialChecksum = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (luma > 24) nonDarkPixels += 1;
    if (luma < 238) nonLightPixels += 1;
    buckets.add(`${Math.floor(r / 32)}:${Math.floor(g / 32)}:${Math.floor(b / 32)}`);
    spatialChecksum = (spatialChecksum + Math.round(luma) * (index + 17)) % 1_000_003;
  }
  return { nonDarkPixels, nonLightPixels, colorBuckets: buckets.size, spatialChecksum };
}

function metricDiff(a: ImageMetrics, b: ImageMetrics): number {
  return Math.abs(a.nonDarkPixels - b.nonDarkPixels) +
    Math.abs(a.nonLightPixels - b.nonLightPixels) +
    Math.abs(a.colorBuckets - b.colorBuckets) * 10 +
    Math.min(1_000, Math.abs(a.spatialChecksum - b.spatialChecksum));
}
