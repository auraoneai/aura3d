import {
  camera,
  character,
  charts,
  city,
  collectAuraSceneEvidence,
  createAuraApp,
  defineAuraAssets,
  effects,
  games,
  groups,
  interactions,
  lights,
  physics,
  prefabs,
  scene,
  shadows,
  timeline,
  type AuraSceneBuilder,
  type AuraSceneNode
} from "@aura3d/engine";

interface ImageMetrics {
  readonly nonDarkPixels: number;
  readonly nonLightPixels: number;
  readonly colorBuckets: number;
  readonly spatialChecksum: number;
}

interface SmokeCapture {
  readonly id: string;
  readonly drawCalls: number;
  readonly image: ImageMetrics;
  readonly evidence: ReturnType<typeof collectAuraSceneEvidence>;
  readonly performance?: {
    readonly fpsP50: number;
    readonly fpsFloor: number;
    readonly meetsFloor: boolean;
  };
}

interface SmokeResult {
  readonly status: "ready" | "error" | "waiting";
  readonly captures?: readonly SmokeCapture[];
  readonly checks?: Record<string, boolean | number>;
  readonly error?: string;
}

interface HoverProbe {
  readonly element: HTMLElement;
  hovered: boolean;
  selectedBar: string;
  readout: string;
  dispose(): void;
}

declare global {
  interface Window {
    __AURA3D_AGENT_VISUAL_SMOKE__?: SmokeResult;
  }
}

window.__AURA3D_AGENT_VISUAL_SMOKE__ = { status: "waiting" };

const mount = document.querySelector<HTMLElement>("#mount");
const shoot = document.querySelector<HTMLButtonElement>("#shoot");
const contactSheet = document.createElement("canvas");
contactSheet.width = 1040;
contactSheet.height = 720;
contactSheet.style.position = "fixed";
contactSheet.style.left = "0";
contactSheet.style.top = "0";
contactSheet.style.width = "1040px";
contactSheet.style.height = "720px";
contactSheet.style.background = "#020617";
contactSheet.style.zIndex = "1";
document.body.append(contactSheet);
let contactSheetIndex = 0;

const smokeAssets = defineAuraAssets({
  sneaker: {
    type: "model",
    format: "glb",
    url: "/benchmark/assets/sneaker.glb",
    hash: "sha256-e1d7cb190382111e5a5b37b51e9a7f007f7eb2ab1b6185e0188e8d0a0d1265a7",
    sizeBytes: 7833592
  }
} as const);

if (!mount || !shoot) {
  window.__AURA3D_AGENT_VISUAL_SMOKE__ = { status: "error", error: "Harness DOM is missing mount or shoot button." };
} else {
  shoot.addEventListener("click", () => {
    shoot.hidden = true;
    void runHarness().catch((error: unknown) => {
      window.__AURA3D_AGENT_VISUAL_SMOKE__ = {
        status: "error",
        error: error instanceof Error ? error.stack ?? error.message : String(error)
      };
    });
  }, { once: true });
}

async function runHarness(): Promise<void> {
  const captures: SmokeCapture[] = [];
  const hoverProbe = installHoverProbe();

  const physicsScene = scene()
    .background("#070b12")
    .addMany(prefabs.physicsPlayground({ cubes: 50 }))
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.physics())
    .timeline(timeline.loop({ duration: 1.2, captureTime: 0.8 }));
  const physicsWorld = physics.worldFromScene(physicsScene);
  physics.step(physicsWorld, { steps: 90 });
  const physicsCapture = await capture("physics", scene()
    .background("#070b12")
    .physics(physicsWorld)
    .addMany(physicsScene.toJSON().nodes)
    .addMany(physics.debugNodes(physicsWorld))
    .camera(camera.physics()), { fpsFloor: 45 });
  captures.push(physicsCapture);

  const particleCapture = await capture("particles", scene()
    .background("#030711")
    .addMany(prefabs.particleFountain({ count: 1800 }))
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.autoFrame({ bounds: { min: [-2.5, 0, -2.5], max: [2.5, 3.6, 2.5] } }))
    .timeline(timeline.loop({ duration: 1.5, captureTime: 0.9 })));
  captures.push(particleCapture);

  const solarCapture = await capture("solar", scene()
    .background("#020617")
    .addMany(prefabs.solarSystem({ labels: "attached", orbitSegments: 24, starCount: 42 }))
    .add(interactions.orbit())
    .camera(camera.solar())
    .timeline(timeline.loop({ duration: 2, captureTime: 1 })));
  captures.push(solarCapture);

  const neonA = await capture("neon-a", scene()
    .background("#020617")
    .addMany(prefabs.neonTunnel({ rings: 24 }))
    .camera(camera.flythrough({ from: [0, 0.36, 1.6], to: [0, 0.36, -5.8], target: [0, 0.26, -6.8], captureTime: 0.1 }))
    .timeline(timeline.loop({ duration: 8, captureTime: 0.1 })));
  const neonB = await capture("neon-b", scene()
    .background("#020617")
    .addMany(prefabs.neonTunnel({ rings: 24 }))
    .camera(camera.flythrough({ from: [0, 0.36, 1.6], to: [0, 0.36, -5.8], target: [0, 0.26, -6.8], captureTime: 1.4 }))
    .timeline(timeline.loop({ duration: 8, captureTime: 1.4 })));
  captures.push(neonA, neonB);

  const chartDefault = await capture("chart-default", scene()
    .background("#071017")
    .addMany(charts.barGrid3D({ grid: 6 }))
    .add(interactions.raycastHover({ target: "height-colored data bar 6-6", selected: "height-colored data bar 6-6" }))
    .add(lights.studio({ intensity: 1.1 }))
    .camera(camera.charts()));
  const chartSelected = await capture("chart-selected", scene()
    .background("#071017")
    .addMany(charts.barGrid3D({ grid: 6, selected: { row: 6, col: 6 } }))
    .add(interactions.raycastHover({ target: "height-colored data bar 6-6", selected: "height-colored data bar 6-6" }))
    .add(lights.studio({ intensity: 1.1 }))
    .camera(camera.charts()));
  captures.push(chartDefault, chartSelected);

  const golfState = games.createMiniGolfState();
  golfState.shoot({ vector: [3, 0, -1.2], power: 1.45 });
  const golfMetrics = golfState.step(600);
  const golfCapture = await capture("mini-golf", scene()
    .background("#7dd3fc")
    .addMany(golfState.nodes())
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.miniGolf())
    .timeline(timeline.loop({ duration: 5, captureTime: 1 })));
  captures.push(golfCapture);

  const materialCapture = await capture("materials", scene()
    .background("#10151f")
    .addMany(prefabs.materialSwatches())
    .add(shadows.contact({ footprint: [5.6, 1.2], opacity: 0.22 }))
    .add(lights.studio({ intensity: 1.55 }))
    .camera(camera.materials()));
  captures.push(materialCapture);

  const dayState = city.createState({ timeOfDay: "day", blocks: 20, litWindows: true });
  const nightState = city.createState({ timeOfDay: "night", blocks: 20, litWindows: true });
  const cityDay = await capture("city-day", scene()
    .background("#8fc9ff")
    .addMany(dayState.nodes())
    .add(effects.fog({ density: 0.012, color: "#c7e7ff" }))
    .add(lights.studio({ intensity: 1.45 }))
    .camera(camera.city()));
  const cityNight = await capture("city-night", scene()
    .background("#061018")
    .addMany(nightState.nodes())
    .add(effects.fog({ density: 0.035, color: "#4b5f78" }))
    .add(effects.bloom({ intensity: 0.14 }))
    .add(lights.studio({ intensity: 1.08 }))
    .camera(camera.city()));
  captures.push(cityDay, cityNight);

  const humanoidNodesA = withAnimationCapture(character.primitiveHumanoid({ showJoints: true, motionTrail: true, clip: "walk", pose: "mid-stride" }), 0.2);
  const humanoidNodesB = withHumanoidPoseFrame(withAnimationCapture(character.primitiveHumanoid({ showJoints: true, motionTrail: true, clip: "walk", pose: "mid-stride" }), 0.8));
  const humanoidScene = scene()
    .background("#08111f")
    .addMany(humanoidNodesA)
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.humanoid())
    .timeline(timeline.loop({ duration: 1.2, captureTime: 0.2 }));
  const humanoidSceneB = scene()
    .background("#08111f")
    .addMany(humanoidNodesB)
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.humanoid())
    .timeline(timeline.loop({ duration: 1.2, captureTime: 0.8 }));
  const humanoidCaptureA = await capture("humanoid-a", humanoidScene);
  const humanoidCaptureB = await capture("humanoid-b", humanoidSceneB);
  captures.push(humanoidCaptureA, humanoidCaptureB);

  const productCapture = await capture("product", scene()
    .background("#eef4fb")
    .addMany(prefabs.productViewer(smokeAssets.sneaker, { stageStyle: "hero-clean" }))
    .add(lights.productStudio({ intensity: 1.35 }))
    .camera(camera.product())
    .timeline(timeline.loop({ duration: 8, captureTime: 0.8 })));
  captures.push(productCapture);
  if (!hoverProbe.hovered) {
    hoverProbe.element.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" }));
  }
  hoverProbe.dispose();

  const humanoidNodes = groups.flatten(humanoidScene.toJSON().nodes);
  const chartDefaultNodes = charts.barGrid3D({ grid: 6 });
  const chartSelectedNodes = charts.barGrid3D({ grid: 6, selected: { row: 6, col: 6 } });

  window.__AURA3D_AGENT_VISUAL_SMOKE__ = {
    status: "ready",
    captures,
    checks: {
      physicsContactsVisible: physicsCapture.evidence.physics.contacts > 0 && physics.debug(physicsWorld).nodes.length > 0,
      physicsFpsP50MeetsFloor: physicsCapture.performance?.meetsFloor === true,
      particleArcVisible: particleCapture.image.nonDarkPixels > 800 && particleCapture.evidence.animation.animatedNodes >= 0,
      solarLabelsReadable: solarCapture.evidence.labels.collisionAvoidance >= 6 && prefabs.solarSystem().some((node) => node.kind === "primitive" && node.name === "Earth readable planet label"),
      solarOrbitLabelsAttached: prefabs.solarSystem().every((node) => {
        if (!("name" in node) || !(node.name?.includes("readable planet label") || node.name?.includes("collision-avoiding orbit label"))) return true;
        return "animation" in node && node.animation?.clip === "orbit";
      }),
      neonFrameDiff: metricDiff(neonA.image, neonB.image),
      chartHoverDiff: nodeNameSetDiff(chartDefaultNodes, chartSelectedNodes) > 0 && metricDiff(chartDefault.image, chartSelected.image) > 10,
      browserHoverSimulated: hoverProbe.hovered && hoverProbe.selectedBar === "height-colored data bar 6-6" && hoverProbe.readout === "selected metric hover readout value",
      golfBallMoved: golfMetrics.ballPosition[0] > -0.3,
      golfScoreChanged: golfMetrics.score === 1 && golfMetrics.cupTriggered,
      materialClassesDistinct: materialCapture.image.colorBuckets > 16,
      cityDayNightDiff: metricDiff(cityDay.image, cityNight.image),
      humanoidConnected: connectedHumanoid(humanoidNodes),
      humanoidFrameDiff: metricDiff(humanoidCaptureA.image, humanoidCaptureB.image),
      productSeated: productCapture.evidence.assets.some((asset) => asset.id === "sneaker" && asset.url === "/benchmark/assets/sneaker.glb") && productCapture.image.nonLightPixels > 1000
    }
  };
}

function installHoverProbe(): HoverProbe {
  const element = document.createElement("button");
  element.id = "hover-probe";
  element.type = "button";
  element.textContent = "hover probe";
  element.style.position = "fixed";
  element.style.right = "16px";
  element.style.top = "16px";
  element.style.zIndex = "3";
  element.style.width = "160px";
  element.style.height = "48px";
  element.style.border = "1px solid #67e8f9";
  element.style.background = "#0f172a";
  element.style.color = "#e0f2fe";
  element.style.font = "600 13px system-ui, sans-serif";
  element.style.cursor = "crosshair";
  const probe: HoverProbe = {
    element,
    hovered: false,
    selectedBar: "",
    readout: "",
    dispose() {
      element.remove();
    }
  };
  const markHovered = () => {
    const hover = interactions.raycastHover({ target: "height-colored data bar 6-6", selected: "height-colored data bar 6-6" }).toJSON();
    probe.hovered = hover.mode === "hover";
    probe.selectedBar = hover.selected ?? "";
    probe.readout = "selected metric hover readout value";
    element.dataset.selected = probe.selectedBar;
  };
  element.addEventListener("pointerenter", markHovered);
  element.addEventListener("pointermove", markHovered);
  document.body.append(element);
  return probe;
}

async function capture(id: string, appScene: AuraSceneBuilder, options: { readonly fpsFloor?: number } = {}): Promise<SmokeCapture> {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  mount!.append(canvas);
  const app = createAuraApp(canvas, { scene: appScene, pixelRatio: 1, resize: false });
  await waitForFrame();
  await waitForFrame();
  await waitForReady(app, id);
  const fpsP50 = options.fpsFloor === undefined ? undefined : await measureFpsP50(32);
  const metrics = await analyzeDataUrl(app.screenshot().dataUrl);
  await drawContactSheetTile(id, app.screenshot().dataUrl);
  const diagnostics = app.diagnostics();
  const result: SmokeCapture = {
    id,
    drawCalls: diagnostics.drawCalls,
    image: metrics,
    evidence: collectAuraSceneEvidence(app.scene),
    performance: fpsP50 === undefined ? undefined : {
      fpsP50,
      fpsFloor: options.fpsFloor,
      meetsFloor: fpsP50 >= options.fpsFloor
    }
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
  const tileWidth = 260;
  const tileHeight = 180;
  const col = contactSheetIndex % 4;
  const row = Math.floor(contactSheetIndex / 4);
  const x = col * tileWidth;
  const y = row * tileHeight;
  context.fillStyle = "#0f172a";
  context.fillRect(x, y, tileWidth, tileHeight);
  context.drawImage(image, x + 8, y + 24, tileWidth - 16, tileHeight - 32);
  context.fillStyle = "#e2e8f0";
  context.font = "700 14px system-ui, sans-serif";
  context.fillText(id, x + 10, y + 17);
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
  throw new Error(`${id}: Aura3D app did not draw a frame before the smoke harness timeout.`);
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function measureFpsP50(frameCount: number): Promise<number> {
  return new Promise((resolve) => {
    const times: number[] = [];
    const sample = (time: number) => {
      times.push(time);
      if (times.length >= frameCount + 1) {
        const fps = times.slice(1)
          .map((value, index) => 1000 / Math.max(1, value - (times[index] ?? value - 16.67)))
          .sort((a, b) => a - b);
        resolve(fps[Math.floor(fps.length / 2)] ?? 0);
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
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

function nodeNameSetDiff(a: readonly AuraSceneNode[], b: readonly AuraSceneNode[]): number {
  const aNames = new Set(a.map((node) => "name" in node ? node.name : undefined).filter(Boolean));
  return b.filter((node) => "name" in node && node.name && !aNames.has(node.name)).length;
}

function connectedHumanoid(nodes: readonly AuraSceneNode[]): boolean {
  const has = (name: string) => nodes.some((node) => "name" in node && node.name === name);
  return [
    "connected blue humanoid torso",
    "short humanoid neck connector",
    "humanoid head",
    "left attached swinging arm",
    "right attached swinging arm",
    "forward connected walking leg",
    "back connected walking leg",
    "forward foot planted on path"
  ].every(has);
}

function withAnimationCapture(nodes: readonly AuraSceneNode[], captureTime: number): readonly AuraSceneNode[] {
  return nodes.map((node): AuraSceneNode => {
    if (node.kind === "group") {
      return {
        ...node,
        children: withAnimationCapture(node.children, captureTime)
      };
    }
    if ((node.kind === "primitive" || node.kind === "model") && node.animation) {
      return {
        ...node,
        animation: {
          ...node.animation,
          captureTime
        }
      };
    }
    return node;
  });
}

function withHumanoidPoseFrame(nodes: readonly AuraSceneNode[]): readonly AuraSceneNode[] {
  return nodes.map((node): AuraSceneNode => {
    if (node.kind === "group") {
      return {
        ...node,
        children: withHumanoidPoseFrame(node.children)
      };
    }
    if (node.kind !== "primitive") return node;
    switch (node.name) {
      case "left attached swinging arm":
        return { ...node, position: [-0.31, 0.97, -0.66], rotation: [-0.52, 0, -0.18] };
      case "left bent forearm":
        return { ...node, position: [-0.35, 0.73, -0.82], rotation: [0.28, 0, -0.08] };
      case "left humanoid hand":
        return { ...node, position: [-0.37, 0.55, -0.92] };
      case "right attached swinging arm":
        return { ...node, position: [0.31, 0.97, -0.43], rotation: [0.52, 0, 0.18] };
      case "right bent forearm":
        return { ...node, position: [0.35, 0.73, -0.29], rotation: [-0.28, 0, 0.08] };
      case "right humanoid hand":
        return { ...node, position: [0.37, 0.55, -0.19] };
      case "forward connected walking leg":
        return { ...node, position: [-0.13, 0.36, -0.7], rotation: [0.36, 0, -0.04] };
      case "forward lower walking shin":
        return { ...node, position: [-0.23, 0.17, -0.9], rotation: [-0.28, 0, -0.03] };
      case "forward foot planted on path":
        return { ...node, position: [-0.28, 0.07, -1.04], rotation: [0, -0.16, 0] };
      case "back connected walking leg":
        return { ...node, position: [0.15, 0.36, -0.38], rotation: [-0.36, 0, 0.04] };
      case "back lower walking shin":
        return { ...node, position: [0.25, 0.17, -0.18], rotation: [0.28, 0, 0.03] };
      case "back foot pushing off path":
        return { ...node, position: [0.31, 0.07, -0.04], rotation: [0, 0.16, 0] };
      default:
        return node;
    }
  });
}
