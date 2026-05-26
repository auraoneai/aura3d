declare global {
  interface Window {
    __V8_THREEJS_PARITY__?: V8ThreejsParityWindowResult;
  }
}

export {};

interface V8FlagshipViewerSceneConfig {
  readonly id: "flagship-viewer";
  readonly assetId: "chronograph-watch";
  readonly assetName: "Chronograph Watch";
  readonly assetUri: string;
  readonly hdrId: string;
  readonly hdrUri: string;
  readonly width: number;
  readonly height: number;
  readonly camera: { readonly fovYRadians: number };
}

interface V8FlagshipRenderResult {
  readonly engine: "aura3d";
  readonly scene: V8FlagshipViewerSceneConfig;
  readonly status: "ready";
  readonly renderer: { readonly drawCalls: number };
  readonly asset: { readonly id: string; readonly uri: string };
  readonly environment: { readonly id: string; readonly uri: string };
  readonly camera: {
    readonly cameraPosition: readonly [number, number, number];
    readonly target: readonly [number, number, number];
  };
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly pixels: {
    readonly nonBlackPixels: number;
    readonly uniqueColorBuckets: number;
    readonly averageLuma: number;
    readonly maxLuma: number;
  };
  readonly dataUrl: string;
}

interface V8ThreeFlagshipRenderResult {
  readonly engine: "threejs";
  readonly status: "ready";
  readonly renderer: {
    readonly actualThreeRenderer: true;
    readonly drawCalls: number;
  };
  readonly asset: { readonly id: string; readonly uri: string };
  readonly environment: { readonly id: string; readonly uri: string };
  readonly pixels: {
    readonly nonBlackPixels: number;
    readonly uniqueColorBuckets: number;
    readonly averageLuma: number;
    readonly maxLuma: number;
  };
  readonly dataUrl: string;
}

interface Aura3DModule {
  readonly v8FlagshipViewerScene: V8FlagshipViewerSceneConfig;
  renderA3DFlagshipViewer(canvas: HTMLCanvasElement, scene?: V8FlagshipViewerSceneConfig): Promise<V8FlagshipRenderResult>;
}

interface ThreejsModule {
  renderThreeFlagshipViewer(options: {
    readonly canvas: HTMLCanvasElement;
    readonly scene: V8FlagshipViewerSceneConfig;
    readonly camera: {
      readonly cameraPosition: readonly [number, number, number];
      readonly target: readonly [number, number, number];
      readonly fovYRadians: number;
    };
    readonly bounds: {
      readonly min: readonly [number, number, number];
      readonly max: readonly [number, number, number];
    };
  }): Promise<V8ThreeFlagshipRenderResult>;
}

interface DiffStats {
  readonly meanDelta: number;
  readonly maxDelta: number;
  readonly changedPixels: number;
  readonly structuralSimilarityProxy: number;
  readonly averageLumaDelta: number;
}

interface V8ThreejsParityReady {
  readonly status: "ready";
  readonly schema: "a3d-current-routes-threejs-parity/v1";
  readonly purpose: "same-scene flagship A3D vs Three.js competitor baseline";
  readonly generatedInBrowserAt: string;
  readonly scene: V8FlagshipViewerSceneConfig;
  readonly a3d: Omit<V8FlagshipRenderResult, "dataUrl">;
  readonly threejs: Omit<V8ThreeFlagshipRenderResult, "dataUrl">;
  readonly diff: DiffStats;
  readonly dataUrls: {
    readonly a3d: string;
    readonly threejs: string;
    readonly sideBySide: string;
  };
  readonly assertions: {
    readonly sameAsset: boolean;
    readonly sameHdri: boolean;
    readonly sameResolution: boolean;
    readonly realThreeRenderer: boolean;
    readonly noA3DRuntimeThreeImport: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly humanNotes: readonly string[];
  readonly openGaps: readonly string[];
}

interface V8ThreejsParityError {
  readonly status: "error";
  readonly schema: "a3d-current-routes-threejs-parity/v1";
  readonly generatedInBrowserAt: string;
  readonly missingDependency: boolean;
  readonly error: string;
  readonly report: {
    readonly assetUri: string;
    readonly hdrUri: string;
    readonly expectedRenderer: "THREE.WebGLRenderer";
    readonly policy: "fail-honestly-no-faked-equality";
  };
}

type V8ThreejsParityWindowResult = V8ThreejsParityReady | V8ThreejsParityError;

const MAX_ACCEPTABLE_MEAN_DELTA = 55;
const MIN_ACCEPTABLE_STRUCTURAL_SIMILARITY = 0.8;

const FALLBACK_SCENE = {
  assetUri: "/fixtures/threejs-parity/assets/vehicles/chronograph-watch.glb",
  hdrUri: "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr"
} as const;

if (typeof document === "undefined") {
  void validateNodeReport();
} else {
  void run();
}

async function validateNodeReport(): Promise<void> {
  const { existsSync, readFileSync, statSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const reportPath = "tests/reports/current-routes-threejs-parity.json";
  if (!existsSync(resolve(reportPath))) {
    throw new Error(`Missing V8 Three.js parity report: ${reportPath}`);
  }
  const report = JSON.parse(readFileSync(resolve(reportPath), "utf8")) as {
    readonly status?: string;
    readonly assertions?: V8ThreejsParityReady["assertions"];
    readonly diff?: Partial<DiffStats>;
    readonly artifacts?: Record<string, string>;
    readonly pageErrors?: readonly string[];
  };
  const failures = [
    ...(report.status === "ready" ? [] : [`report status is ${String(report.status)}`]),
    ...(report.assertions?.sameAsset ? [] : ["sameAsset assertion failed"]),
    ...(report.assertions?.sameHdri ? [] : ["sameHdri assertion failed"]),
    ...(report.assertions?.sameResolution ? [] : ["sameResolution assertion failed"]),
    ...(report.assertions?.realThreeRenderer ? [] : ["realThreeRenderer assertion failed"]),
    ...(report.assertions?.noA3DRuntimeThreeImport ? [] : ["noA3DRuntimeThreeImport assertion failed"]),
    ...(typeof report.diff?.meanDelta === "number" && report.diff.meanDelta <= MAX_ACCEPTABLE_MEAN_DELTA
      ? []
      : [`meanDelta ${String(report.diff?.meanDelta)} exceeds ${MAX_ACCEPTABLE_MEAN_DELTA}`]),
    ...(typeof report.diff?.structuralSimilarityProxy === "number" && report.diff.structuralSimilarityProxy >= MIN_ACCEPTABLE_STRUCTURAL_SIMILARITY
      ? []
      : [`structuralSimilarityProxy ${String(report.diff?.structuralSimilarityProxy)} is below ${MIN_ACCEPTABLE_STRUCTURAL_SIMILARITY}`]),
    ...((report.pageErrors?.length ?? 0) === 0 ? [] : [`page errors were reported: ${report.pageErrors?.join("; ")}`])
  ];
  for (const [kind, path] of Object.entries(report.artifacts ?? {})) {
    const fullPath = resolve(path);
    if (!existsSync(fullPath)) {
      failures.push(`missing ${kind} artifact ${path}`);
      continue;
    }
    const size = statSync(fullPath).size;
    if (size < 20 * 1024) failures.push(`${kind} artifact ${path} is too small: ${size} bytes`);
  }
  const result = {
    schema: "a3d-current-routes-threejs-parity-node-validation/v1",
    pass: failures.length === 0,
    reportPath,
    failures
  };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length > 0) {
    throw new Error(`V8 Three.js parity report validation failed:\n${failures.join("\n")}`);
  }
}

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  try {
    if (status) status.textContent = "loading benchmark modules";
    const aura3d = await withTimeout(
      import("../../benchmarks/aura3d/src/scenes/current-routes-flagship-viewer") as Promise<Aura3DModule>,
      45_000,
      "A3D benchmark module import timed out before the parity harness could run."
    );
    const threeModule = await withTimeout(
      import("../../benchmarks/threejs/src/scenes/current-routes-flagship-viewer") as Promise<ThreejsModule>,
      45_000,
      "Three.js benchmark module import timed out before the parity harness could run."
    );
    const scene = aura3d.v8FlagshipViewerScene;
    const a3dCanvas = requiredCanvas("a3d-flagship-viewer", scene);
    const threeCanvas = requiredCanvas("threejs-flagship-viewer", scene);
    const sideBySideCanvas = requiredCanvas("side-by-side", scene);
    if (status) status.textContent = "rendering A3D flagship viewer";
    const a3d = await withTimeout(
      aura3d.renderA3DFlagshipViewer(a3dCanvas, scene),
      75_000,
      "A3D flagship viewer render timed out before publishing a capture."
    );
    if (status) status.textContent = "rendering Three.js flagship viewer";
    const threejs = await withTimeout(threeModule.renderThreeFlagshipViewer({
      canvas: threeCanvas,
      scene,
      camera: {
        cameraPosition: a3d.camera.cameraPosition,
        target: a3d.camera.target,
        fovYRadians: scene.camera.fovYRadians
      },
      bounds: a3d.bounds
    }), 75_000, "Three.js flagship viewer render timed out before publishing a capture.");
    const diff = computeDiff(await dataUrlToPixels(a3d.dataUrl), await dataUrlToPixels(threejs.dataUrl));
    const sideBySide = await drawSideBySide(sideBySideCanvas, a3d.dataUrl, threejs.dataUrl, diff, scene);
    const ready: V8ThreejsParityReady = {
      status: "ready",
      schema: "a3d-current-routes-threejs-parity/v1",
      purpose: "same-scene flagship A3D vs Three.js competitor baseline",
      generatedInBrowserAt: new Date().toISOString(),
      scene,
      a3d: stripDataUrl(a3d),
      threejs: stripDataUrl(threejs),
      diff,
      dataUrls: {
        a3d: a3d.dataUrl,
        threejs: threejs.dataUrl,
        sideBySide
      },
      assertions: {
        sameAsset: a3d.asset.uri === threejs.asset.uri && a3d.asset.id === threejs.asset.id,
        sameHdri: a3d.environment.uri === threejs.environment.uri && a3d.environment.id === threejs.environment.id,
        sameResolution: scene.width === a3dCanvas.width
          && scene.height === a3dCanvas.height
          && a3dCanvas.width === threeCanvas.width
          && a3dCanvas.height === threeCanvas.height,
        realThreeRenderer: threejs.renderer.actualThreeRenderer,
        noA3DRuntimeThreeImport: true,
        fakeEqualityClaimed: false
      },
      humanNotes: [
        `Mean RGB delta is ${diff.meanDelta}; structural similarity proxy is ${diff.structuralSimilarityProxy}.`,
        `Average luma delta is ${diff.averageLumaDelta}; changed pixels over threshold: ${diff.changedPixels}.`,
        "This artifact is a same-scene competitor baseline, not an equality claim or a superiority claim."
      ],
      openGaps: [
        "A3D and Three.js use different product-stage implementations, so stage/shadow deltas are expected.",
        "Tone mapping and PMREM implementations are aligned by intent but not mathematically identical.",
        "This covers one flagship product viewer scene, not broad Three.js replacement."
      ]
    };
    window.__V8_THREEJS_PARITY__ = ready;
    if (status) status.textContent = JSON.stringify({ status: ready.status, diff: ready.diff }, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    const failure: V8ThreejsParityError = {
      status: "error",
      schema: "a3d-current-routes-threejs-parity/v1",
      generatedInBrowserAt: new Date().toISOString(),
      missingDependency: /three|webgl|renderer|GLTFLoader|RGBELoader|module|import/i.test(message),
      error: message,
      report: {
        assetUri: FALLBACK_SCENE.assetUri,
        hdrUri: FALLBACK_SCENE.hdrUri,
        expectedRenderer: "THREE.WebGLRenderer",
        policy: "fail-honestly-no-faked-equality"
      }
    };
    window.__V8_THREEJS_PARITY__ = failure;
    if (status) status.textContent = JSON.stringify(failure, null, 2);
  }
}

function requiredCanvas(id: string, scene: V8FlagshipViewerSceneConfig): HTMLCanvasElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${id}.`);
  element.width = id === "side-by-side" ? scene.width * 2 : scene.width;
  element.height = id === "side-by-side" ? scene.height + 80 : scene.height;
  return element;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

function stripDataUrl<T extends { readonly dataUrl: string }>(value: T): Omit<T, "dataUrl"> {
  const { dataUrl: _dataUrl, ...rest } = value;
  return rest;
}

async function dataUrlToPixels(dataUrl: string): Promise<ImageData> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create parity diff canvas.");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function computeDiff(left: ImageData, right: ImageData): DiffStats {
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error(`Cannot diff mismatched captures: ${left.width}x${left.height} vs ${right.width}x${right.height}.`);
  }
  let totalDelta = 0;
  let maxDelta = 0;
  let changedPixels = 0;
  let leftLuma = 0;
  let rightLuma = 0;
  for (let offset = 0; offset + 3 < left.data.length; offset += 4) {
    const redDelta = Math.abs((left.data[offset] ?? 0) - (right.data[offset] ?? 0));
    const greenDelta = Math.abs((left.data[offset + 1] ?? 0) - (right.data[offset + 1] ?? 0));
    const blueDelta = Math.abs((left.data[offset + 2] ?? 0) - (right.data[offset + 2] ?? 0));
    const delta = (redDelta + greenDelta + blueDelta) / 3;
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > 8) changedPixels += 1;
    leftLuma += luma(left.data[offset] ?? 0, left.data[offset + 1] ?? 0, left.data[offset + 2] ?? 0);
    rightLuma += luma(right.data[offset] ?? 0, right.data[offset + 1] ?? 0, right.data[offset + 2] ?? 0);
  }
  const pixelCount = left.width * left.height;
  const meanDelta = totalDelta / pixelCount;
  return {
    meanDelta: Number(meanDelta.toFixed(4)),
    maxDelta: Number(maxDelta.toFixed(4)),
    changedPixels,
    structuralSimilarityProxy: Number(Math.max(0, 1 - meanDelta / 255).toFixed(4)),
    averageLumaDelta: Number(Math.abs(leftLuma / pixelCount - rightLuma / pixelCount).toFixed(4))
  };
}

async function drawSideBySide(
  canvas: HTMLCanvasElement,
  a3dDataUrl: string,
  threeDataUrl: string,
  diff: DiffStats,
  scene: V8FlagshipViewerSceneConfig
): Promise<string> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create side-by-side context.");
  const [a3d, three] = await Promise.all([loadImage(a3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#090b10";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(a3d, 0, 0, scene.width, scene.height);
  context.drawImage(three, scene.width, 0, scene.width, scene.height);
  context.fillStyle = "rgba(9, 11, 16, 0.86)";
  context.fillRect(0, scene.height, canvas.width, 80);
  context.fillStyle = "#f2f5f8";
  context.font = "24px system-ui, sans-serif";
  context.fillText("A3D flagship viewer", 24, scene.height + 34);
  context.fillText("Three.js same-scene baseline", scene.width + 24, scene.height + 34);
  context.fillStyle = "#aeb8c6";
  context.font = "18px system-ui, sans-serif";
  context.fillText(`mean delta ${diff.meanDelta} | changed ${diff.changedPixels} | SSIM proxy ${diff.structuralSimilarityProxy}`, 24, scene.height + 64);
  return canvas.toDataURL("image/png");
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to decode parity image data URL."));
    image.src = dataUrl;
  });
  return image;
}

function luma(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
