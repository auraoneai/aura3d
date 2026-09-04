import {
  camera,
  createAuraApp,
  effects,
  lights,
  scene,
  sky,
  water,
  weather,
  type AuraSceneBuilder
} from "@aura3d/engine";

interface ImageMetrics {
  readonly nonDarkPixels: number;
  readonly nonLightPixels: number;
  readonly colorBuckets: number;
  readonly spatialChecksum: number;
}

interface D3Capture {
  readonly id: string;
  readonly drawCalls: number;
  readonly nodeCount: number;
  readonly image: ImageMetrics;
  readonly meta: Record<string, string | number | boolean>;
}

interface D3Result {
  readonly status: "ready" | "error" | "waiting";
  readonly captures?: readonly D3Capture[];
  readonly checks?: Record<string, boolean | number | string>;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_D3_ATMOSPHERE_WATER__?: D3Result;
  }
}

window.__AURA3D_D3_ATMOSPHERE_WATER__ = { status: "waiting" };

const mount = document.querySelector<HTMLElement>("#mount");
const shoot = document.querySelector<HTMLButtonElement>("#shoot");
const contactSheet = document.createElement("canvas");
contactSheet.width = 1280;
contactSheet.height = 1080;
contactSheet.style.position = "fixed";
contactSheet.style.left = "0";
contactSheet.style.top = "0";
contactSheet.style.width = "1280px";
contactSheet.style.height = "1080px";
contactSheet.style.background = "#020617";
contactSheet.style.zIndex = "1";
document.body.append(contactSheet);
let contactSheetIndex = 0;

if (!mount || !shoot) {
  window.__AURA3D_D3_ATMOSPHERE_WATER__ = { status: "error", error: "Harness DOM is missing mount or shoot button." };
} else {
  shoot.addEventListener("click", () => {
    shoot.hidden = true;
    void runHarness().catch((error: unknown) => {
      window.__AURA3D_D3_ATMOSPHERE_WATER__ = {
        status: "error",
        error: error instanceof Error ? error.stack ?? error.message : String(error)
      };
    });
  }, { once: true });
}

const skyCamera = camera.perspective({ position: [0, 2.2, 7.5], target: [0, 1.2, -1], fov: 60 });
const groundCamera = camera.perspective({ position: [0, 1.6, 4.2], target: [0, 0, -0.5], fov: 45 });
const precipCamera = camera.perspective({ position: [0, 1.8, 4.6], target: [0, 1.2, -1], fov: 55 });
const waterCamera = camera.perspective({ position: [0, 2.6, 5.2], target: [0, 0, -1.6], fov: 55 });

async function runHarness(): Promise<void> {
  const captures: D3Capture[] = [];

  const day = sky.dayNight({ hour: 12 });
  const night = sky.dayNight({ hour: 0 });
  const dryGround = weather.wetGround({ type: "clear" });
  const skyDay = await capture("sky-day", scene()
    .background(day.background)
    .addMany(day.nodes)
    .addMany(dryGround.nodes)
    .add(effects.fog({ density: 0.02, color: "#c7e7ff" }))
    .camera(skyCamera), { background: day.background, dayFactor: day.dayFactor, stars: day.visibleStarCount });
  const skyNight = await capture("sky-night", scene()
    .background(night.background)
    .addMany(night.nodes)
    .addMany(dryGround.nodes)
    .add(effects.fog({ density: 0.035, color: "#1c2f4d" }))
    .camera(skyCamera), { background: night.background, dayFactor: night.dayFactor, stars: night.visibleStarCount });
  captures.push(skyDay, skyNight);

  const wet = weather.wetGround({ type: "rain" });
  const groundDry = await capture("ground-dry", scene()
    .background("#101820")
    .addMany(dryGround.nodes)
    .add(lights.studio({ intensity: 1.25 }))
    .camera(groundCamera), { wetness: dryGround.wetness, albedo: dryGround.albedoColor, puddles: dryGround.puddleCount });
  const groundWet = await capture("ground-wet", scene()
    .background("#101820")
    .addMany(wet.nodes)
    .add(lights.studio({ intensity: 1.25 }))
    .camera(groundCamera), { wetness: wet.wetness, albedo: wet.albedoColor, puddles: wet.puddleCount });
  captures.push(groundDry, groundWet);

  const rain = weather.precipitation({ type: "rain" });
  const snow = weather.precipitation({ type: "snow" });
  const precipClear = await capture("precip-clear", scene()
    .background("#0b1526")
    .addMany(dryGround.nodes)
    .add(lights.studio({ intensity: 1.1 }))
    .camera(precipCamera), { kind: "clear-baseline" });
  const precipRain = await capture("precip-rain", scene()
    .background("#0b1526")
    .addMany(dryGround.nodes)
    .addMany(rain.nodes)
    .add(lights.studio({ intensity: 1.1 }))
    .camera(precipCamera), { kind: "rain", drops: rain.dropCount, wetness: rain.wetness });
  const precipSnow = await capture("precip-snow", scene()
    .background("#0b1526")
    .addMany(dryGround.nodes)
    .addMany(snow.nodes)
    .add(lights.studio({ intensity: 1.1 }))
    .camera(precipCamera), { kind: "snow", drops: snow.dropCount, wetness: snow.wetness });
  captures.push(precipClear, precipRain, precipSnow);

  const calm = water.surface({ preset: "moderate" });
  const wake = water.surface({ preset: "moderate", boat: { x: 0.3, z: -2, headingRadians: 0, speed: 3 } });
  const waterCalm = await capture("water-calm", scene()
    .background("#7fb2d9")
    .addMany(calm.nodes)
    .add(lights.studio({ intensity: 1.25 }))
    .camera(waterCamera), { bands: calm.bandCount, foam: calm.foamCount, wake: calm.wakeSegmentCount });
  const waterWake = await capture("water-wake", scene()
    .background("#7fb2d9")
    .addMany(wake.nodes)
    .add(lights.studio({ intensity: 1.25 }))
    .camera(waterCamera), { bands: wake.bandCount, foam: wake.foamCount, wake: wake.wakeSegmentCount });
  captures.push(waterCalm, waterWake);

  const stormGround = weather.wetGround({ type: "thunderstorm" });
  let flashElapsed = -1;
  let flashIntensity = 0;
  for (let elapsed = 0; elapsed <= 8 && flashElapsed < 0; elapsed += 0.2) {
    const flash = weather.lightning({ type: "thunderstorm", elapsedSeconds: elapsed, seed: 5 });
    if (flash.intensity > 0.05) {
      flashElapsed = Number(elapsed.toFixed(2));
      flashIntensity = flash.intensity;
    }
  }
  const stormDark = await capture("storm-dark", scene()
    .background("#0a1420")
    .addMany(stormGround.nodes)
    .add(lights.studio({ intensity: 0.7 }))
    .camera(groundCamera), { kind: "storm-no-flash", wetness: stormGround.wetness });
  let stormFlash: D3Capture;
  if (flashElapsed >= 0) {
    const flash = weather.lightning({ type: "thunderstorm", elapsedSeconds: flashElapsed, seed: 5 });
    stormFlash = await capture("storm-flash", scene()
      .background("#0a1420")
      .addMany(stormGround.nodes)
      .addMany(flash.nodes)
      .add(lights.studio({ intensity: 0.7 }))
      .camera(groundCamera), { kind: "storm-flash", elapsed: flashElapsed, flash: flashIntensity });
  } else {
    stormFlash = await capture("storm-flash", scene()
      .background("#0a1420")
      .addMany(stormGround.nodes)
      .add(lights.studio({ intensity: 0.7 }))
      .camera(groundCamera), { kind: "storm-flash-missing", elapsed: -1, flash: 0 });
  }
  captures.push(stormDark, stormFlash);

  const buoyancy = water.buoyancy({ preset: "moderate" });
  const byId = (id: string): D3Capture => captures.find((entry) => entry.id === id)!;

  window.__AURA3D_D3_ATMOSPHERE_WATER__ = {
    status: "ready",
    captures,
    checks: {
      dayNightDiff: metricDiff(byId("sky-day").image, byId("sky-night").image),
      wetDiff: metricDiff(byId("ground-dry").image, byId("ground-wet").image),
      rainDiff: metricDiff(byId("precip-clear").image, byId("precip-rain").image),
      snowDiff: metricDiff(byId("precip-clear").image, byId("precip-snow").image),
      wakeDiff: metricDiff(byId("water-calm").image, byId("water-wake").image),
      flashDiff: metricDiff(byId("storm-dark").image, byId("storm-flash").image),
      flashElapsed,
      flashIntensity,
      wetAlbedo: wet.albedoColor,
      dryAlbedo: dryGround.albedoColor,
      wetPuddles: wet.puddleCount,
      rainDrops: rain.dropCount,
      snowDrops: snow.dropCount,
      foamCount: wake.foamCount,
      wakeSegments: wake.wakeSegmentCount,
      buoyancyObject: buoyancy.objectId,
      buoyancySamples: buoyancy.samplePointCount,
      planarDependency: "B4: planar reflection/refraction targets unsupported; bounded refraction look only"
    }
  };
}

async function capture(id: string, appScene: AuraSceneBuilder, meta: Record<string, string | number | boolean>): Promise<D3Capture> {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  mount!.append(canvas);
  const app = createAuraApp(canvas, { scene: appScene, pixelRatio: 1, resize: false });
  await waitForFrame();
  await waitForFrame();
  await waitForReady(app, id);
  const metrics = await analyzeDataUrl(app.screenshot().dataUrl);
  await drawContactSheetTile(id, app.screenshot().dataUrl);
  const diagnostics = app.diagnostics();
  const result: D3Capture = {
    id,
    drawCalls: diagnostics.drawCalls,
    nodeCount: Array.isArray((app.scene as { readonly nodes?: readonly unknown[] }).nodes)
      ? ((app.scene as { readonly nodes?: readonly unknown[] }).nodes!.length)
      : 0,
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
  const tileWidth = 320;
  const tileHeight = 360;
  const col = contactSheetIndex % 4;
  const row = Math.floor(contactSheetIndex / 4);
  const x = col * tileWidth;
  const y = row * tileHeight;
  context.fillStyle = "#0f172a";
  context.fillRect(x, y, tileWidth, tileHeight);
  context.drawImage(image, x + 8, y + 30, tileWidth - 16, tileHeight - 38);
  context.fillStyle = "#e2e8f0";
  context.font = "700 15px system-ui, sans-serif";
  context.fillText(id, x + 10, y + 20);
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
  throw new Error(`${id}: Aura3D app did not draw a frame before the D3 harness timeout.`);
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
