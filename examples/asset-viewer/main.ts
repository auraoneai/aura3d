import {
  AssetManager,
  GLTFLoader,
  createDracoDecoder,
  createMeshoptDecoder,
  createAssetBundleCacheEvidence,
  createGLTFSceneAnalysisEvidence,
  createGLTFRenderResources,
  inspectGLTFAsset,
  type AssetBundleCacheEvidence,
  type GLTFAsset,
  type GLTFDracoDecodedPrimitive,
  type GLTFDracoDecoder,
  type GLTFDracoDecoderModule,
  type GLTFLoaderDiagnostics,
  type GLTFMeshoptDecoder,
  type GLTFMeshoptDecoderModule,
  type GLTFRenderResources,
  type GLTFAssetInspectionReport,
  type GLTFSceneAnalysisEvidence
} from "@aura3d/assets";
import { AnimationMixer, SceneAnimationBridge, type AnimationAction, type LoopMode, type RootMotionSample } from "@aura3d/animation";
import {
  Material,
  Renderer,
  createV4EnvironmentLighting,
  createV4FlagshipRenderPresetEvidence,
  sampleV4LdrPostprocessReadback,
  type RenderDeviceDiagnostics,
  type V4EnvironmentLightingBundle,
  type V4LdrPostprocessSummary,
  type V4RenderPresetEvidence
} from "@aura3d/rendering";
import { Camera, type Light } from "@aura3d/scene";
import { installExampleStyles } from "../shared/exampleHarness.js";

const KHRONOS_BOX_GLB =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf/Models/Box/glTF-Binary/Box.glb";
const KHRONOS_DAMAGED_HELMET_GLTF =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF/DamagedHelmet.gltf";
const DEFAULT_V4_ASSET_GLTF = "/fixtures/product-studio/products/speaker/speaker.gltf";

interface AssetViewerResult {
  readonly id: "asset-viewer";
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly visualClaim: "bounded-gltf-asset-inspection-viewer";
  readonly knownLimits: readonly string[];
  readonly errors: readonly string[];
  readonly screenshotPath: "tests/reports/external-parity-example-screenshots/asset-viewer.png";
  readonly claimBoundary: string;
  readonly featureEvidence: Record<string, string | number | boolean>;
  readonly v4RenderPreset?: V4RenderPresetEvidence;
  readonly postprocess?: V4LdrPostprocessSummary;
  readonly environmentResources?: V4EnvironmentLightingBundle["resources"];
  readonly assetBundleCache?: AssetBundleCacheEvidence;
  readonly sceneAnalysis?: GLTFSceneAnalysisEvidence;
  readonly sourceKind?: "inline" | "external" | "custom" | "local";
  readonly url?: string;
  readonly meshCount?: number;
  readonly vertexCount?: number;
  readonly indexCount?: number;
  readonly materialCount?: number;
  readonly sceneCount?: number;
  readonly renderGeometryCount?: number;
  readonly renderMaterialCount?: number;
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly frameTiming?: AssetViewerFrameTiming;
  readonly bounds?: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly publicApis?: readonly string[];
  readonly loaderDiagnostics?: GLTFLoaderDiagnostics;
  readonly inspection?: GLTFAssetInspectionReport;
  readonly warnings?: GLTFAssetInspectionReport["warnings"];
  readonly dependencyResolution?: readonly LocalDependencyResolution[];
  readonly decodedTextures?: readonly {
    readonly name: string;
    readonly width: number;
    readonly height: number;
    readonly format: string;
    readonly colorSpace: "linear" | "srgb";
    readonly mipLevels: number;
    readonly fallbackByteLength: number;
  }[];
  readonly resourceTimings?: AssetViewerResourceTimings;
  readonly compressionDecoders?: AssetViewerCompressionDecoderEvidence;
  readonly compressedTextureEvidence?: readonly AssetViewerCompressedTextureEvidence[];
  readonly renderMode?: AssetViewerRenderMode;
  readonly activeRenderMaterials?: readonly string[];
  readonly fallbackMaterials?: readonly AssetViewerFallbackMaterial[];
  readonly lookControls?: AssetViewerLookControls;
  readonly comparisonExport?: AssetViewerComparisonExport;
  readonly materialVariants?: readonly string[];
  readonly selectedMaterialVariant?: string;
  readonly variantSwitching?: {
    readonly available: boolean;
    readonly applied: boolean;
  };
  readonly morphControls?: AssetViewerMorphControls;
  readonly skeletonControls?: AssetViewerSkeletonControls;
  readonly cameraControls?: AssetViewerCameraControls;
  readonly animationPlayback?: AssetViewerAnimationPlayback;
  readonly screenshot?: {
    readonly captured: boolean;
    readonly byteLength: number;
    readonly canvasByteLength: number;
    readonly overlayByteLength: number;
    readonly diagnosticJsonByteLength: number;
    readonly diagnosticJson: string;
    readonly capturedAt: string;
  };
  readonly error?: string;
}

interface LocalDependencyResolution {
  readonly uri: string;
  readonly fileName: string;
  readonly kind: "buffer" | "image" | "document";
  readonly byteLength: number;
}

interface AssetViewerResourceTimings {
  readonly loadMs: number;
  readonly renderResourceMs: number;
  readonly textureDecodeMs: number;
  readonly compressedTranscodeMs: number;
}

interface AssetViewerFrameTiming {
  readonly cpuFrameMs: number;
  readonly gpuFrameMs: number;
  readonly gpuTimingSupported: false;
  readonly gpuTimingSource: "cpu-fallback";
  readonly fallbackReason: string;
}

interface AssetViewerCompressionDecoderEvidence {
  readonly meshopt: AssetViewerCompressionDecoderState;
  readonly draco: AssetViewerCompressionDecoderState;
}

interface AssetViewerCompressionDecoderState {
  readonly status: "available" | "unavailable";
  readonly decodeCount: number;
  readonly decodeMs: number;
  readonly compressedBytes: number;
  readonly decodedBytes: number;
  readonly reason?: string;
  readonly timings: readonly AssetViewerCompressionDecodeTiming[];
}

interface AssetViewerCompressionDecodeTiming {
  readonly bufferViewIndex: number;
  readonly meshIndex?: number;
  readonly primitiveIndex?: number;
  readonly mode?: string;
  readonly filter?: string;
  readonly count?: number;
  readonly byteStride?: number;
  readonly compressedBytes: number;
  readonly decodedBytes: number;
  readonly decodeMs: number;
}

interface AssetViewerCompressedTextureEvidence {
  readonly name: string;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly mipLevels: number;
  readonly fallbackByteLength: number;
  readonly decodedContent: true;
}

interface AssetViewerFallbackMaterial {
  readonly name: "unsupported-feature-fallback";
  readonly baseColor: "#ff4fd8";
  readonly reason: string;
  readonly warningCodes: readonly string[];
  readonly affectedExtensions: readonly string[];
  readonly visibleInInspector: true;
}

type AssetViewerRenderMode = "shaded" | "wireframe" | "bounds" | "material";
type AssetViewerInputKind = "load" | "button" | "pointer" | "keyboard" | "touch" | "wheel";
type AssetViewerEnvironmentPreset = "studio" | "neutral" | "sunset";
type AssetViewerMaterialOverride = "asset" | "matte" | "metallic";
type AssetViewerPostprocessPreview = "off" | "exposure-diagnostic" | "bloom-diagnostic";

interface AssetViewerLookControls {
  readonly materialOverride: AssetViewerMaterialOverride;
  readonly materialOverrideAppliedTo: readonly string[];
  readonly environmentPreset: AssetViewerEnvironmentPreset;
  readonly environmentIntensity: number;
  readonly postprocessPreview: AssetViewerPostprocessPreview;
  readonly postprocessStatus: "disabled" | "diagnostic-only";
  readonly boundedControls: true;
}

interface MutableAssetViewerLookControls {
  materialOverride: AssetViewerMaterialOverride;
  environmentPreset: AssetViewerEnvironmentPreset;
  environmentIntensity: number;
  postprocessPreview: AssetViewerPostprocessPreview;
}

interface AssetViewerComparisonExport {
  readonly schemaVersion: "a3d-v4-asset-viewer-comparison-export-v1";
  readonly generated: boolean;
  readonly generatedAt: string;
  readonly renderer: "webgl2";
  readonly sourceKind?: "inline" | "external" | "custom" | "local";
  readonly url?: string;
  readonly renderMode?: AssetViewerRenderMode;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly textureSlots: readonly string[];
  readonly loaderFeatures: readonly string[];
  readonly warnings: readonly string[];
  readonly lookControls: AssetViewerLookControls;
  readonly screenshotPath: "tests/reports/external-parity-example-screenshots/asset-viewer.png";
  readonly byteLength: number;
}

interface AssetViewerCameraControls {
  readonly orbitYaw: number;
  readonly orbitPitch: number;
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
  readonly focused: boolean;
  readonly fitToBounds: boolean;
  readonly resetView: boolean;
  readonly pointerControls: boolean;
  readonly keyboardControls: boolean;
  readonly touchControls: boolean;
  readonly selectionDiagnostics: boolean;
  readonly selectedMesh: string;
  readonly lastInput: AssetViewerInputKind;
}

interface AssetViewerCameraState {
  orbitYaw: number;
  orbitPitch: number;
  panX: number;
  panY: number;
  zoom: number;
  focused: boolean;
  lastInput: AssetViewerInputKind;
}

interface AssetViewerAnimationPlayback {
  readonly clipName: string;
  readonly time: number;
  readonly duration: number;
  readonly playing: boolean;
  readonly loopMode: LoopMode;
  readonly timeScale: number;
  readonly rootMotion: {
    readonly available: boolean;
    readonly target: string | null;
    readonly distance: number;
    readonly applied: boolean;
    readonly sampleCount: number;
    readonly appliedDistance: number;
    readonly position: readonly [number, number, number];
  };
  readonly appliedTargets: readonly string[];
  readonly sampledNodeTransforms: number;
  readonly applyErrors: readonly { readonly target: string; readonly message: string }[];
  readonly renderApplied: boolean;
}

interface AssetViewerMorphControls {
  readonly available: boolean;
  readonly meshName?: string;
  readonly targetCount: number;
  readonly activeWeights: readonly number[];
  readonly renderApplied: boolean;
}

interface AssetViewerSkeletonControls {
  readonly available: boolean;
  readonly skinCount: number;
  readonly boneCount: number;
  readonly bonesVisibleInInspector: boolean;
}

interface AssetViewerAnimationRuntime {
  readonly mixer: AnimationMixer;
  readonly action: AnimationAction;
  readonly clipIndex: number;
  readonly rootMotionTrack?: string;
  readonly rootMotionTarget: { position: [number, number, number] };
  readonly rootMotionSamples: RootMotionSample[];
}

declare global {
  interface Window {
    __AURA3D_ASSET_VIEWER__?: AssetViewerResult;
  }
}

const knownLimits = [
  "This is a glTF loading and inspection tool for currently supported paths, not complete glTF visual parity.",
  "Animation playback, skinning, morph rendering, variants, Draco, Meshopt, and KTX2/Basis decoding remain bounded or unclaimed unless reported per asset.",
  "Unsupported extensions are surfaced as warnings rather than hidden behind fake visuals.",
] as const;

const claimBoundary = "V4 asset-viewer evidence is limited to the checked-in V4 local corpus, bounded glTF inspection/render-resource creation, browser screenshots, and explicit unsupported-feature warnings; complete glTF loader parity is not claimed.";

function failedFeatureEvidence(message: string): Record<string, string | number | boolean> {
  return {
    loaded: false,
    unsupportedFeaturesVisible: true,
    error: message
  };
}

interface AssetViewerCompressionRuntime {
  readonly meshoptDecoder?: GLTFMeshoptDecoder;
  readonly dracoDecoder?: GLTFDracoDecoder;
  resetAsset(): void;
  snapshot(): AssetViewerCompressionDecoderEvidence;
}

async function createAssetViewerCompressionDecoders(): Promise<AssetViewerCompressionRuntime> {
  const meshopt = await createAssetViewerMeshoptDecoder();
  const draco = await createAssetViewerDracoDecoder();
  return {
    meshoptDecoder: meshopt.decoder,
    dracoDecoder: draco.decoder,
    resetAsset: () => {
      meshopt.resetAsset();
      draco.resetAsset();
    },
    snapshot: () => ({
      meshopt: meshopt.snapshot(),
      draco: draco.snapshot()
    })
  };
}

async function createAssetViewerMeshoptDecoder(): Promise<{
  readonly decoder?: GLTFMeshoptDecoder;
  resetAsset(): void;
  snapshot(): AssetViewerCompressionDecoderState;
}> {
  let state = createCompressionDecoderState("unavailable", "meshoptimizer browser decoder has not been loaded.");
  try {
    const module = await loadMeshoptDecoderModule();
    const baseDecoder = createMeshoptDecoder(module);
    state = createCompressionDecoderState("available");
    return {
      decoder: async (source, descriptor) => {
        const startedAt = performance.now();
        const decoded = await baseDecoder(source, descriptor);
        const decodeMs = elapsedMs(startedAt);
        const decodedBytes = decoded instanceof Uint8Array ? decoded.byteLength : decoded.byteLength;
        const timing: AssetViewerCompressionDecodeTiming = {
          bufferViewIndex: descriptor.bufferViewIndex,
          mode: descriptor.mode,
          filter: descriptor.filter,
          count: descriptor.count,
          byteStride: descriptor.byteStride,
          compressedBytes: source.byteLength,
          decodedBytes,
          decodeMs
        };
        state = appendCompressionTiming(state, timing);
        return decoded;
      },
      resetAsset: () => {
        state = createCompressionDecoderState("available");
      },
      snapshot: () => state
    };
  } catch (error) {
    state = createCompressionDecoderState("unavailable", error instanceof Error ? error.message : String(error));
    return {
      resetAsset: () => {
        state = createCompressionDecoderState("unavailable", state.reason);
      },
      snapshot: () => state
    };
  }
}

async function createAssetViewerDracoDecoder(): Promise<{
  readonly decoder?: GLTFDracoDecoder;
  resetAsset(): void;
  snapshot(): AssetViewerCompressionDecoderState;
}> {
  let state = createCompressionDecoderState("unavailable", "draco3d browser decoder has not been loaded.");
  try {
    const module = await loadDracoDecoderModule();
    const baseDecoder = createDracoDecoder(module);
    state = createCompressionDecoderState("available");
    return {
      decoder: async (source, descriptor) => {
        const startedAt = performance.now();
        const decoded = await baseDecoder(source, descriptor);
        const timing: AssetViewerCompressionDecodeTiming = {
          bufferViewIndex: descriptor.bufferViewIndex,
          meshIndex: descriptor.meshIndex,
          primitiveIndex: descriptor.primitiveIndex,
          compressedBytes: source.byteLength,
          decodedBytes: estimateDracoDecodedBytes(decoded),
          decodeMs: elapsedMs(startedAt)
        };
        state = appendCompressionTiming(state, timing);
        return decoded;
      },
      resetAsset: () => {
        state = createCompressionDecoderState("available");
      },
      snapshot: () => state
    };
  } catch (error) {
    state = createCompressionDecoderState("unavailable", error instanceof Error ? error.message : String(error));
    return {
      resetAsset: () => {
        state = createCompressionDecoderState("unavailable", state.reason);
      },
      snapshot: () => state
    };
  }
}

async function loadDracoDecoderModule(): Promise<GLTFDracoDecoderModule> {
  const decoderUrl = new URL("/node_modules/draco3d/draco_decoder_nodejs.js", window.location.origin).href;
  const wasmUrl = new URL("/node_modules/draco3d/draco_decoder.wasm", window.location.origin).href;
  const [source, wasmBinary] = await Promise.all([fetchText(decoderUrl), fetchArrayBuffer(wasmUrl)]);
  const objectUrl = URL.createObjectURL(new Blob([`${source}\nexport default DracoDecoderModule;`], { type: "application/javascript" }));
  try {
    const module = await import(/* @vite-ignore */ objectUrl) as {
      readonly default?: (options: { readonly wasmBinary: ArrayBuffer }) => Promise<GLTFDracoDecoderModule>;
    };
    if (typeof module.default !== "function") {
      throw new Error("draco3d browser module did not export a decoder factory");
    }
    return await module.default({ wasmBinary });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadMeshoptDecoderModule(): Promise<GLTFMeshoptDecoderModule> {
  const decoderUrl = new URL("/node_modules/meshoptimizer/meshopt_decoder.mjs", window.location.origin).href;
  const source = await fetchText(decoderUrl);
  const objectUrl = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
  try {
    const module = await import(/* @vite-ignore */ objectUrl) as { readonly MeshoptDecoder?: GLTFMeshoptDecoderModule };
    if (!module.MeshoptDecoder || typeof module.MeshoptDecoder.decodeGltfBuffer !== "function") {
      throw new Error("meshoptimizer browser module did not export MeshoptDecoder.decodeGltfBuffer");
    }
    return module.MeshoptDecoder;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

function estimateDracoDecodedBytes(decoded: GLTFDracoDecodedPrimitive): number {
  const attributeBytes = Object.values(decoded.attributes).reduce((sum, rows) =>
    sum + rows.reduce((rowSum, row) => rowSum + row.length * Float32Array.BYTES_PER_ELEMENT, 0), 0);
  const indexBytes = (decoded.indices?.length ?? 0) * Uint32Array.BYTES_PER_ELEMENT;
  return attributeBytes + indexBytes;
}

function createCompressionDecoderState(
  status: AssetViewerCompressionDecoderState["status"],
  reason?: string
): AssetViewerCompressionDecoderState {
  const state: AssetViewerCompressionDecoderState = {
    status,
    decodeCount: 0,
    decodeMs: 0,
    compressedBytes: 0,
    decodedBytes: 0,
    timings: []
  };
  return reason === undefined ? state : { ...state, reason };
}

function appendCompressionTiming(
  state: AssetViewerCompressionDecoderState,
  timing: AssetViewerCompressionDecodeTiming
): AssetViewerCompressionDecoderState {
  const next: AssetViewerCompressionDecoderState = {
    status: state.status,
    decodeCount: state.decodeCount + 1,
    decodeMs: Number((state.decodeMs + timing.decodeMs).toFixed(3)),
    compressedBytes: state.compressedBytes + timing.compressedBytes,
    decodedBytes: state.decodedBytes + timing.decodedBytes,
    timings: [...state.timings, timing]
  };
  return state.reason === undefined ? next : { ...next, reason: state.reason };
}

if (typeof document !== "undefined") {
  installExampleStyles();
  void boot();
}

async function boot(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();

  const shell = document.createElement("main");
  shell.className = "example-shell asset-viewer";

  const stage = document.createElement("div");
  stage.className = "asset-viewer-stage";

  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  canvas.tabIndex = 0;
  canvas.dataset.testid = "asset-viewer-canvas";
  canvas.setAttribute("aria-label", "Asset viewer WebGL viewport");

  const overlay = document.createElement("canvas");
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  overlay.className = "asset-viewer-overlay";
  overlay.dataset.testid = "asset-viewer-overlay";
  overlay.setAttribute("aria-label", "Asset viewer diagnostic overlay");
  stage.append(canvas, overlay);

  const panel = document.createElement("section");
  panel.className = "example-panel asset-viewer-panel";

  const title = document.createElement("h1");
  title.textContent = "Asset Viewer";

  const controls = document.createElement("form");
  controls.dataset.testid = "asset-viewer-controls";
  controls.innerHTML = `
    <label>
      <span>Model</span>
      <select name="model" data-testid="asset-viewer-model">
        <option value="inline">Inline Triangle</option>
        <option value="external">Damaged Helmet glTF</option>
        <option value="custom">Custom URL</option>
      </select>
    </label>
    <label>
      <span>Render mode</span>
      <select name="renderMode" data-testid="asset-viewer-render-mode">
        <option value="shaded">Shaded</option>
        <option value="wireframe">Wireframe overlay</option>
        <option value="bounds">Bounds overlay</option>
        <option value="material">Material IDs</option>
      </select>
    </label>
    <label>
      <span>URL</span>
      <input name="url" data-testid="asset-viewer-url" />
    </label>
    <button type="submit">Load</button>
  `;

  const dropzone = document.createElement("div");
  dropzone.className = "asset-viewer-dropzone";
  dropzone.dataset.testid = "asset-viewer-dropzone";
  dropzone.textContent = "Drop .gltf/.glb with .bin and image dependencies";

  const tools = document.createElement("div");
  tools.className = "asset-viewer-tools";

  const screenshotButton = document.createElement("button");
  screenshotButton.type = "button";
  screenshotButton.dataset.testid = "asset-viewer-screenshot";
  screenshotButton.textContent = "Capture Screenshot";

  const viewControls = document.createElement("div");
  viewControls.className = "asset-viewer-view-controls";
  viewControls.dataset.testid = "asset-viewer-view-controls";
  viewControls.innerHTML = `
    <button type="button" data-view-control="orbit">Orbit</button>
    <button type="button" data-view-control="pan">Pan</button>
    <button type="button" data-view-control="zoom-in">Zoom +</button>
    <button type="button" data-view-control="zoom-out">Zoom -</button>
    <button type="button" data-view-control="focus">Focus</button>
    <button type="button" data-view-control="reset">Reset</button>
  `;

  const lookControlPanel = document.createElement("div");
  lookControlPanel.className = "asset-viewer-look-controls";
  lookControlPanel.dataset.testid = "asset-viewer-look-controls";
  lookControlPanel.innerHTML = `
    <label>
      <span>Material</span>
      <select data-testid="asset-viewer-material-override">
        <option value="asset">Asset</option>
        <option value="matte">Matte override</option>
        <option value="metallic">Metallic override</option>
      </select>
    </label>
    <label>
      <span>Environment</span>
      <select data-testid="asset-viewer-environment-preset">
        <option value="studio">Studio</option>
        <option value="neutral">Neutral</option>
        <option value="sunset">Sunset</option>
      </select>
    </label>
    <label>
      <span>Env intensity</span>
      <input data-testid="asset-viewer-environment-intensity" type="range" min="0.2" max="2.4" step="0.1" value="1.2" />
    </label>
    <label>
      <span>Postprocess</span>
      <select data-testid="asset-viewer-postprocess-preview">
        <option value="off">Off</option>
        <option value="exposure-diagnostic">Exposure diagnostic</option>
        <option value="bloom-diagnostic">Bloom diagnostic</option>
      </select>
    </label>
  `;

  const animationControls = document.createElement("div");
  animationControls.className = "asset-viewer-animation-controls";
  animationControls.dataset.testid = "asset-viewer-animation-controls";
  animationControls.innerHTML = `
    <label>
      <span>Clip</span>
      <select data-testid="asset-viewer-animation-clip"></select>
    </label>
    <label>
      <span>Time</span>
      <input data-testid="asset-viewer-animation-time" type="range" min="0" max="0" step="0.016" value="0" />
    </label>
    <label>
      <span>Loop</span>
      <select data-testid="asset-viewer-animation-loop">
        <option value="repeat">Repeat</option>
        <option value="once">Once</option>
        <option value="pingpong">Ping-pong</option>
      </select>
    </label>
    <label>
      <span>Speed</span>
      <input data-testid="asset-viewer-animation-speed" type="range" min="0.25" max="2" step="0.25" value="1" />
    </label>
    <button type="button" data-testid="asset-viewer-animation-play">Play</button>
  `;

  const variantControls = document.createElement("div");
  variantControls.className = "asset-viewer-variant-controls";
  variantControls.dataset.testid = "asset-viewer-variant-controls";
  variantControls.hidden = true;
  variantControls.innerHTML = `
    <label>
      <span>Material variant</span>
      <select data-testid="asset-viewer-material-variant"></select>
    </label>
  `;

  const morphControls = document.createElement("div");
  morphControls.className = "asset-viewer-morph-controls";
  morphControls.dataset.testid = "asset-viewer-morph-controls";
  morphControls.hidden = true;

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.dataset.testid = "asset-viewer-comparison-export";
  exportButton.textContent = "Export Comparison";

  tools.append(screenshotButton, exportButton, viewControls, lookControlPanel, variantControls, morphControls, animationControls);

  const status = document.createElement("pre");
  status.dataset.testid = "asset-viewer-status";
  status.textContent = "booting";

  const inspector = document.createElement("section");
  inspector.className = "asset-viewer-inspector";
  inspector.dataset.testid = "asset-viewer-inspector";

  panel.append(title, controls, dropzone, tools, inspector, status);
  shell.append(stage, panel);
  root.append(shell);
  installAssetViewerStyles();

  const select = controls.querySelector<HTMLSelectElement>("[data-testid='asset-viewer-model']");
  const input = controls.querySelector<HTMLInputElement>("[data-testid='asset-viewer-url']");
  const renderModeSelect = controls.querySelector<HTMLSelectElement>("[data-testid='asset-viewer-render-mode']");
  if (!select || !input || !renderModeSelect) throw new Error("Asset viewer controls failed to initialize.");

  const initial = resolveInitialModel();
  select.value = initial.kind;
  input.value = initial.url;

  const compressionDecoders = await createAssetViewerCompressionDecoders();
  const manager = new AssetManager({ retries: 1, retryDelayMs: 50 });
  manager.register(new GLTFLoader({
    meshoptDecoder: compressionDecoders.meshoptDecoder,
    dracoDecoder: compressionDecoders.dracoDecoder
  }));
  let loaded: { readonly handle: Awaited<ReturnType<AssetManager["load"]>>; readonly resources: GLTFRenderResources } | undefined;
  let lastResult: AssetViewerResult | undefined;
  let localObjectUrls: string[] = [];
  let animationFrame: number | undefined;
  let animationStartedAt = 0;
  let renderMode: AssetViewerRenderMode = "shaded";
  const lookControls: MutableAssetViewerLookControls = {
    materialOverride: "asset",
    environmentPreset: "studio",
    environmentIntensity: 1.2,
    postprocessPreview: "off"
  };
  let selectedMaterialVariant: string | undefined;
  let cameraState: AssetViewerCameraState = createDefaultCameraState();
  let animationRuntime: AssetViewerAnimationRuntime | undefined;
  let dragStart: {
    x: number;
    y: number;
    orbitYaw: number;
    orbitPitch: number;
    panX: number;
    panY: number;
    mode: "orbit" | "pan";
    input: "pointer" | "touch";
  } | undefined;
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.016, 0.02, 0.026, 1],
    antialias: true,
    preserveDrawingBuffer: true
  });

  const load = async (
    kind: "inline" | "external" | "custom" | "local",
    url: string,
    dependencyResolution: readonly LocalDependencyResolution[] = []
  ) => {
    let loadPhase = "start";
    try {
      loadPhase = "stop-animation-preview";
      stopAnimationPreview();
      loadPhase = "dispose-previous-resources";
      loaded?.resources.dispose();
      if (loaded) await manager.release(loaded.handle);
      status.textContent = "loading";
      selectedMaterialVariant = undefined;
      compressionDecoders.resetAsset();

      const loadStartedAt = performance.now();
      loadPhase = "asset-manager-load";
      const handle = await manager.load<GLTFAsset>(url, { type: "gltf" });
      const loadMs = elapsedMs(loadStartedAt);
      const resourcesStartedAt = performance.now();
      loadPhase = "create-render-resources";
      const resources = await createGLTFRenderResources(handle.value, { ktx2BasisTargetFormat: "etc2-rgba8unorm" });
      const resourceTimings = createResourceTimings(loadMs, elapsedMs(resourcesStartedAt), resources);
      loaded = { handle, resources };
      cameraState = createDefaultCameraState();
      loadPhase = "create-animation-runtime";
      animationRuntime = createAnimationRuntime(handle.value, resources, 0);
      animationRuntime?.mixer.update(0);
      loadPhase = "render-loaded-asset";
      const frame = renderLoadedAsset(canvas, overlay, renderer, resources, handle.value, renderMode, cameraState, lookControls);
      loadPhase = "inspect-gltf-asset";
      const inspection = inspectGLTFAsset(handle.value, resources);
      loadPhase = "configure-controls";
      configureAnimationControls(handle.value);
      configureMaterialVariantControls(handle.value);
      configureMorphControls(handle.value, resources);
      loadPhase = "render-inspection";
      renderInspection(inspector, inspection, handle.value);
      loadPhase = "summarize";
      const result = summarize(kind, url, handle.value, resources, frame.diagnostics, frame.frameTiming, frame.postprocess, frame.environmentResources, inspection, renderMode, lookControls, selectedMaterialVariant, cameraState, animationRuntime, dependencyResolution, resourceTimings, compressionDecoders.snapshot());
      loadPhase = "publish";
      publish(result);
      lastResult = result;
      loadPhase = "status-text";
      status.textContent = assetViewerStatusText(result);
    } catch (error) {
      const message = `${loadPhase}: ${assetViewerErrorMessage(error)}`;
      const result: AssetViewerResult = {
        id: "asset-viewer",
        status: "error",
        renderer: "webgl2",
        visualClaim: "bounded-gltf-asset-inspection-viewer",
        knownLimits,
        errors: [message],
        screenshotPath: "tests/reports/external-parity-example-screenshots/asset-viewer.png",
        claimBoundary,
        featureEvidence: failedFeatureEvidence(message),
        sourceKind: kind,
        url,
        dependencyResolution,
        compressionDecoders: compressionDecoders.snapshot(),
        error: message
      };
      publish(result);
      lastResult = result;
      status.textContent = assetViewerStatusText(result);
    }
  };

  controls.addEventListener("submit", (event) => {
    event.preventDefault();
    const kind = select.value as "inline" | "external" | "custom";
    const url = kind === "inline" ? createInlineTriangleGltfUrl() : kind === "external" ? KHRONOS_DAMAGED_HELMET_GLTF : input.value.trim();
    input.value = url;
    void load(kind, url);
  });

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("is-dragover");
  });
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) return;
    void loadDroppedFiles(files).then(({ url, dependencies }) => {
      select.value = "custom";
      input.value = url;
      return load("local", url, dependencies);
    }).catch((error) => {
      const result: AssetViewerResult = {
        id: "asset-viewer",
        status: "error",
        renderer: "webgl2",
        visualClaim: "bounded-gltf-asset-inspection-viewer",
        knownLimits,
        errors: [error instanceof Error ? error.message : String(error)],
        screenshotPath: "tests/reports/external-parity-example-screenshots/asset-viewer.png",
        claimBoundary,
        featureEvidence: failedFeatureEvidence(error instanceof Error ? error.message : String(error)),
        sourceKind: "local",
        compressionDecoders: compressionDecoders.snapshot(),
        error: error instanceof Error ? error.message : String(error)
      };
      publish(result);
      lastResult = result;
      status.textContent = assetViewerStatusText(result);
    });
  });

  screenshotButton.addEventListener("click", () => {
    const dataUrl = canvas.toDataURL("image/png");
    const overlayDataUrl = overlay.toDataURL("image/png");
    const diagnosticJson = JSON.stringify(lastResult ?? {}, null, 2);
    const next: AssetViewerResult = {
      ...(lastResult ?? {
        id: "asset-viewer",
        status: "error" as const,
        renderer: "webgl2" as const,
        visualClaim: "bounded-gltf-asset-inspection-viewer" as const,
        knownLimits,
        errors: ["Screenshot requested before an asset finished loading."],
        screenshotPath: "tests/reports/external-parity-example-screenshots/asset-viewer.png" as const,
        claimBoundary,
        featureEvidence: failedFeatureEvidence("Screenshot requested before an asset finished loading."),
      }),
      screenshot: {
        captured: dataUrl.startsWith("data:image/png") && overlayDataUrl.startsWith("data:image/png"),
        byteLength: dataUrl.length + overlayDataUrl.length,
        canvasByteLength: dataUrl.length,
        overlayByteLength: overlayDataUrl.length,
        diagnosticJsonByteLength: diagnosticJson.length,
        diagnosticJson,
        capturedAt: new Date().toISOString()
      }
    };
    publish(next);
    lastResult = next;
    status.textContent = assetViewerStatusText(next);
  });

  select.addEventListener("change", () => {
    input.value = select.value === "inline" ? createInlineTriangleGltfUrl() : select.value === "external" ? KHRONOS_DAMAGED_HELMET_GLTF : input.value;
  });

  renderModeSelect.addEventListener("change", () => {
    renderMode = renderModeSelect.value as AssetViewerRenderMode;
    if (!loaded || !lastResult) {
      return;
    }
    const frame = renderLoadedAsset(canvas, overlay, renderer, loaded.resources, loaded.handle.value, renderMode, cameraState, lookControls);
    const next = {
      ...lastResult,
      renderMode,
      activeRenderMaterials: activeRenderMaterials(loaded.resources),
      lookControls: summarizeLookControls(lookControls, loaded.resources),
      selectedMaterialVariant,
      variantSwitching: summarizeVariantSwitching(loaded.handle.value, selectedMaterialVariant),
      morphControls: summarizeMorphControls(loaded.handle.value, loaded.resources),
      skeletonControls: summarizeSkeletonControls(loaded.handle.value),
      diagnostics: frame.diagnostics,
      frameTiming: frame.frameTiming,
      cameraControls: summarizeCameraControls(cameraState, loaded.handle.value),
      animationPlayback: summarizeAnimationPlayback(animationRuntime)
    };
    publish(next);
    lastResult = next;
    status.textContent = assetViewerStatusText(next);
  });

  const materialOverrideSelect = lookControlPanel.querySelector<HTMLSelectElement>("[data-testid='asset-viewer-material-override']");
  const environmentPresetSelect = lookControlPanel.querySelector<HTMLSelectElement>("[data-testid='asset-viewer-environment-preset']");
  const environmentIntensityInput = lookControlPanel.querySelector<HTMLInputElement>("[data-testid='asset-viewer-environment-intensity']");
  const postprocessPreviewSelect = lookControlPanel.querySelector<HTMLSelectElement>("[data-testid='asset-viewer-postprocess-preview']");
  if (!materialOverrideSelect || !environmentPresetSelect || !environmentIntensityInput || !postprocessPreviewSelect) {
    throw new Error("Asset viewer look controls failed to initialize.");
  }

  materialOverrideSelect.addEventListener("change", () => {
    lookControls.materialOverride = asMaterialOverride(materialOverrideSelect.value);
    rerenderLoaded();
  });
  environmentPresetSelect.addEventListener("change", () => {
    lookControls.environmentPreset = asEnvironmentPreset(environmentPresetSelect.value);
    rerenderLoaded();
  });
  environmentIntensityInput.addEventListener("input", () => {
    lookControls.environmentIntensity = clamp(Number(environmentIntensityInput.value) || 1, 0.2, 2.4);
    rerenderLoaded();
  });
  postprocessPreviewSelect.addEventListener("change", () => {
    lookControls.postprocessPreview = asPostprocessPreview(postprocessPreviewSelect.value);
    rerenderLoaded();
  });

  exportButton.addEventListener("click", () => {
    if (!lastResult) return;
    const comparisonExport = createComparisonExport(lastResult);
    const next = {
      ...lastResult,
      comparisonExport
    };
    publish(next);
    lastResult = next;
    status.textContent = assetViewerStatusText(next);
  });

  function configureMaterialVariantControls(asset: GLTFAsset): void {
    const variantSelect = variantControls.querySelector<HTMLSelectElement>("[data-testid='asset-viewer-material-variant']");
    if (!variantSelect) return;
    variantSelect.replaceChildren(
      optionElement("", "Default materials"),
      ...asset.materialVariants.map((variant) => optionElement(variant.name, variant.name))
    );
    variantSelect.value = selectedMaterialVariant ?? "";
    variantSelect.disabled = asset.materialVariants.length === 0;
    variantControls.toggleAttribute("hidden", asset.materialVariants.length === 0);
    variantSelect.onchange = () => {
      void applyMaterialVariant(variantSelect.value || undefined);
    };
  }

  async function applyMaterialVariant(materialVariant: string | undefined): Promise<void> {
    if (!loaded || selectedMaterialVariant === materialVariant) return;
    try {
      stopAnimationPreview();
      selectedMaterialVariant = materialVariant;
      const previousResources = loaded.resources;
      const clipSelect = animationControls.querySelector<HTMLSelectElement>("[data-testid='asset-viewer-animation-clip']");
      const clipIndex = Number(clipSelect?.value ?? animationRuntime?.clipIndex ?? 0) || 0;
      const resourcesStartedAt = performance.now();
      const resources = await createGLTFRenderResources(loaded.handle.value, { ...(materialVariant ? { materialVariant } : {}), ktx2BasisTargetFormat: "etc2-rgba8unorm" });
      const resourceTimings = createResourceTimings(lastResult?.resourceTimings?.loadMs ?? 0, elapsedMs(resourcesStartedAt), resources);
      previousResources.dispose();
      loaded = { handle: loaded.handle, resources };
      animationRuntime = createAnimationRuntime(loaded.handle.value, resources, clipIndex, selectedAnimationLoopMode());
      animationRuntime?.mixer.update(0);

      const frame = renderLoadedAsset(canvas, overlay, renderer, resources, loaded.handle.value, renderMode, cameraState, lookControls);
      const inspection = inspectGLTFAsset(loaded.handle.value, resources);
      configureMorphControls(loaded.handle.value, resources);
      renderInspection(inspector, inspection, loaded.handle.value);
      const result = summarize(
        lastResult?.sourceKind ?? "custom",
        lastResult?.url ?? "",
        loaded.handle.value,
        resources,
        frame.diagnostics,
        frame.frameTiming,
        frame.postprocess,
        frame.environmentResources,
        inspection,
        renderMode,
        lookControls,
        selectedMaterialVariant,
        cameraState,
        animationRuntime,
        lastResult?.dependencyResolution ?? [],
        resourceTimings,
        lastResult?.compressionDecoders
      );
      publish(result);
      lastResult = result;
      status.textContent = assetViewerStatusText(result);
    } catch (error) {
      const result: AssetViewerResult = {
        id: "asset-viewer",
        status: "error",
        renderer: "webgl2",
        visualClaim: "bounded-gltf-asset-inspection-viewer",
        knownLimits,
        errors: [error instanceof Error ? error.message : String(error)],
        screenshotPath: "tests/reports/external-parity-example-screenshots/asset-viewer.png",
        claimBoundary,
        featureEvidence: failedFeatureEvidence(error instanceof Error ? error.message : String(error)),
        sourceKind: lastResult?.sourceKind,
        url: lastResult?.url,
        selectedMaterialVariant: materialVariant,
        error: error instanceof Error ? error.message : String(error)
      };
      publish(result);
      lastResult = result;
      status.textContent = assetViewerStatusText(result);
    }
  }

  function configureMorphControls(asset: GLTFAsset, resources: GLTFRenderResources): void {
    const morphMesh = asset.meshes.find((mesh) => mesh.morphTargets.length > 0);
    morphControls.replaceChildren();
    morphControls.toggleAttribute("hidden", !morphMesh);
    if (!morphMesh) return;

    const title = document.createElement("strong");
    title.textContent = `Morphs: ${morphMesh.name}`;
    morphControls.append(title);
    const renderable = resources.scene.collectRenderables().find((entry) => entry.renderable.geometry === morphMesh.name)?.renderable;
    const weights = renderable?.morphWeights ?? morphMesh.morphWeights;
    morphMesh.morphTargets.forEach((_target, index) => {
      const label = document.createElement("label");
      const caption = document.createElement("span");
      caption.textContent = `Target ${index + 1}`;
      const input = document.createElement("input");
      input.type = "range";
      input.min = "0";
      input.max = "1";
      input.step = "0.01";
      input.value = String(weights[index] ?? 0);
      input.dataset.testid = `asset-viewer-morph-weight-${index}`;
      input.oninput = () => {
        setMorphWeight(morphMesh.name, index, Number(input.value));
      };
      label.append(caption, input);
      morphControls.append(label);
    });
  }

  function setMorphWeight(meshName: string, targetIndex: number, weight: number): void {
    if (!loaded || !lastResult) return;
    const entry = loaded.resources.scene.collectRenderables().find((candidate) => candidate.renderable.geometry === meshName);
    const targets = loaded.resources.morphTargetLibrary.get(meshName);
    if (!entry || !targets) return;
    while (entry.renderable.morphWeights.length < targets.length) {
      entry.renderable.morphWeights.push(0);
    }
    entry.renderable.morphWeights[targetIndex] = clamp(weight, 0, 1);
    const frame = renderLoadedAsset(canvas, overlay, renderer, loaded.resources, loaded.handle.value, renderMode, cameraState, lookControls);
    const next = {
      ...lastResult,
      diagnostics: frame.diagnostics,
      frameTiming: frame.frameTiming,
      lookControls: summarizeLookControls(lookControls, loaded.resources),
      morphControls: summarizeMorphControls(loaded.handle.value, loaded.resources),
      cameraControls: summarizeCameraControls(cameraState, loaded.handle.value),
      animationPlayback: summarizeAnimationPlayback(animationRuntime)
    };
    publish(next);
    lastResult = next;
    status.textContent = assetViewerStatusText(next);
  }

  viewControls.querySelectorAll<HTMLButtonElement>("button[data-view-control]").forEach((button) => {
    button.addEventListener("click", () => runViewControl(button.dataset.viewControl ?? "", "button"));
  });

  canvas.addEventListener("pointerdown", (event) => {
    dragStart = {
      x: event.clientX,
      y: event.clientY,
      orbitYaw: cameraState.orbitYaw,
      orbitPitch: cameraState.orbitPitch,
      panX: cameraState.panX,
      panY: cameraState.panY,
      mode: event.shiftKey ? "pan" : "orbit",
      input: event.pointerType === "touch" ? "touch" : "pointer"
    };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events used by tests do not always register an active pointer.
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragStart) return;
    if (dragStart.mode === "pan") {
      cameraState.panX = clamp(dragStart.panX + (event.clientX - dragStart.x) * 0.0025, -0.65, 0.65);
      cameraState.panY = clamp(dragStart.panY - (event.clientY - dragStart.y) * 0.0025, -0.45, 0.45);
    } else {
      cameraState.orbitYaw = dragStart.orbitYaw + (event.clientX - dragStart.x) * 0.008;
      cameraState.orbitPitch = clamp(dragStart.orbitPitch + (event.clientY - dragStart.y) * 0.006, -0.55, 0.55);
    }
    cameraState.focused = false;
    cameraState.lastInput = dragStart.input;
    rerenderLoaded();
  });
  canvas.addEventListener("pointerup", (event) => {
    dragStart = undefined;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events used by tests do not always register an active pointer.
    }
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    cameraState.zoom = clamp(cameraState.zoom + Math.sign(event.deltaY) * 0.08, 0.72, 1.45);
    cameraState.focused = false;
    cameraState.lastInput = "wheel";
    rerenderLoaded();
  }, { passive: false });
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") cameraState.orbitYaw -= 0.08;
    else if (event.key === "ArrowRight") cameraState.orbitYaw += 0.08;
    else if (event.key === "ArrowUp") cameraState.orbitPitch = clamp(cameraState.orbitPitch - 0.06, -0.55, 0.55);
    else if (event.key === "ArrowDown") cameraState.orbitPitch = clamp(cameraState.orbitPitch + 0.06, -0.55, 0.55);
    else if (event.key === "a") cameraState.panX = clamp(cameraState.panX - 0.08, -0.65, 0.65);
    else if (event.key === "d") cameraState.panX = clamp(cameraState.panX + 0.08, -0.65, 0.65);
    else if (event.key === "w") cameraState.panY = clamp(cameraState.panY + 0.08, -0.45, 0.45);
    else if (event.key === "s") cameraState.panY = clamp(cameraState.panY - 0.08, -0.45, 0.45);
    else if (event.key === "+" || event.key === "=") cameraState.zoom = clamp(cameraState.zoom + 0.08, 0.72, 1.45);
    else if (event.key === "-" || event.key === "_") cameraState.zoom = clamp(cameraState.zoom - 0.08, 0.72, 1.45);
    else if (event.key === "f") return runViewControl("focus", "keyboard");
    else if (event.key === "r") return runViewControl("reset", "keyboard");
    else return;
    event.preventDefault();
    cameraState.focused = false;
    cameraState.lastInput = "keyboard";
    rerenderLoaded();
  });

  window.addEventListener("beforeunload", () => {
    stopAnimationPreview();
    revokeLocalObjectUrls();
    loaded?.resources.dispose();
    if (loaded) void manager.release(loaded.handle);
    renderer.dispose();
  });

  function configureAnimationControls(asset: GLTFAsset): void {
    const clipSelect = animationControls.querySelector<HTMLSelectElement>("[data-testid='asset-viewer-animation-clip']");
    const timeInput = animationControls.querySelector<HTMLInputElement>("[data-testid='asset-viewer-animation-time']");
    const loopSelect = animationControls.querySelector<HTMLSelectElement>("[data-testid='asset-viewer-animation-loop']");
    const speedInput = animationControls.querySelector<HTMLInputElement>("[data-testid='asset-viewer-animation-speed']");
    const existingPlayButton = animationControls.querySelector<HTMLButtonElement>("[data-testid='asset-viewer-animation-play']");
    if (!clipSelect || !timeInput || !loopSelect || !speedInput || !existingPlayButton) return;
    const playButton = existingPlayButton.cloneNode(true) as HTMLButtonElement;
    existingPlayButton.replaceWith(playButton);
    clipSelect.replaceChildren(...asset.animations.map((clip, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${clip.name} (${clip.duration.toFixed(2)}s)`;
      return option;
    }));
    const firstClip = asset.animations[0];
    timeInput.max = String(Math.max(firstClip?.duration ?? 0, 1));
    timeInput.value = "0";
    loopSelect.value = "repeat";
    speedInput.value = "1";
    animationControls.toggleAttribute("hidden", asset.animations.length === 0);
    playButton.addEventListener("click", () => {
      if (!loaded) return;
      const clip = asset.animations[Number(clipSelect.value) || 0];
      if (!clip) return;
      if (animationFrame !== undefined) {
        stopAnimationPreview();
        animationRuntime?.action.pause();
        playButton.textContent = "Play";
        rerenderLoaded();
        return;
      }
      animationRuntime = createAnimationRuntime(asset, loaded.resources, Number(clipSelect.value) || 0, selectedAnimationLoopMode(), selectedAnimationSpeed());
      animationStartedAt = performance.now() - Number(timeInput.value) * 1000;
      playButton.textContent = "Pause";
      const playbackDuration = Math.max(clip.duration, 1);
      timeInput.max = String(playbackDuration);
      const initialTime = Math.min(playbackDuration, Math.max(0.016, Number(timeInput.value) || 0.016));
      timeInput.value = String(initialTime);
      applyAnimationTime(initialTime, true);
      renderLoadedAsset(canvas, overlay, renderer, loaded.resources, asset, renderMode, cameraState, lookControls);
      if (lastResult) {
        const next = { ...lastResult, lookControls: summarizeLookControls(lookControls, loaded.resources), animationPlayback: summarizeAnimationPlayback(animationRuntime) };
        publish(next);
        lastResult = next;
        status.textContent = assetViewerStatusText(next);
      }
      const tick = () => {
        const duration = Math.max(clip.duration, 1);
        const time = (((performance.now() - animationStartedAt) / 1000) * selectedAnimationSpeed()) % duration;
        timeInput.value = String(time);
        applyAnimationTime(time, true);
        renderLoadedAsset(canvas, overlay, renderer, loaded!.resources, asset, renderMode, cameraState, lookControls);
        if (lastResult) {
          const next = { ...lastResult, lookControls: summarizeLookControls(lookControls, loaded!.resources), animationPlayback: summarizeAnimationPlayback(animationRuntime) };
          publish(next);
          lastResult = next;
          status.textContent = assetViewerStatusText(next);
        }
        animationFrame = requestAnimationFrame(tick);
      };
      animationFrame = requestAnimationFrame(tick);
    });
    timeInput.oninput = () => {
      if (!loaded) return;
      animationRuntime = createAnimationRuntime(asset, loaded.resources, Number(clipSelect.value) || 0, selectedAnimationLoopMode(), selectedAnimationSpeed());
      applyAnimationTime(Number(timeInput.value), false);
      rerenderLoaded();
    };
    loopSelect.onchange = () => {
      if (!loaded) return;
      animationRuntime = createAnimationRuntime(asset, loaded.resources, Number(clipSelect.value) || 0, selectedAnimationLoopMode(), selectedAnimationSpeed());
      applyAnimationTime(Number(timeInput.value), animationFrame !== undefined);
      rerenderLoaded();
    };
    speedInput.oninput = () => {
      if (!loaded) return;
      animationRuntime = createAnimationRuntime(asset, loaded.resources, Number(clipSelect.value) || 0, selectedAnimationLoopMode(), selectedAnimationSpeed());
      applyAnimationTime(Number(timeInput.value), animationFrame !== undefined);
      rerenderLoaded();
    };
    clipSelect.onchange = () => {
      const clip = asset.animations[Number(clipSelect.value) || 0];
      timeInput.max = String(Math.max(clip?.duration ?? 0, 1));
      timeInput.value = "0";
      stopAnimationPreview();
      playButton.textContent = "Play";
      if (loaded) {
        animationRuntime = createAnimationRuntime(asset, loaded.resources, Number(clipSelect.value) || 0, selectedAnimationLoopMode(), selectedAnimationSpeed());
        applyAnimationTime(0, false);
        rerenderLoaded();
      }
    };
  }

  function stopAnimationPreview(): void {
    if (animationFrame !== undefined) {
      cancelAnimationFrame(animationFrame);
      animationFrame = undefined;
    }
  }

  function selectedAnimationLoopMode(): LoopMode {
    const loopSelect = animationControls.querySelector<HTMLSelectElement>("[data-testid='asset-viewer-animation-loop']");
    return isLoopMode(loopSelect?.value) ? loopSelect.value : "repeat";
  }

  function selectedAnimationSpeed(): number {
    const speedInput = animationControls.querySelector<HTMLInputElement>("[data-testid='asset-viewer-animation-speed']");
    const speed = Number(speedInput?.value ?? 1);
    return Number.isFinite(speed) && speed > 0 ? speed : 1;
  }

  function revokeLocalObjectUrls(): void {
    for (const url of localObjectUrls) URL.revokeObjectURL(url);
    localObjectUrls = [];
  }

  async function loadDroppedFiles(files: readonly File[]): Promise<{
    readonly url: string;
    readonly dependencies: readonly LocalDependencyResolution[];
  }> {
    revokeLocalObjectUrls();
    const root = files.find((file) => /\.glb$/i.test(file.name)) ?? files.find((file) => /\.gltf$/i.test(file.name));
    if (!root) {
      throw new Error("Drop a .gltf or .glb file with its dependencies.");
    }
    if (/\.glb$/i.test(root.name)) {
      const url = await fileToDataUrl(root, "model/gltf-binary");
      return {
        url,
        dependencies: [{ uri: root.name, fileName: root.name, kind: "document", byteLength: root.size }]
      };
    }
    const text = await root.text();
    const gltf = JSON.parse(text) as {
      buffers?: { uri?: string; byteLength?: number }[];
      images?: { uri?: string; mimeType?: string }[];
    };
    const dependencies: LocalDependencyResolution[] = [{ uri: root.name, fileName: root.name, kind: "document", byteLength: root.size }];
    const filesByName = new Map(files.map((file) => [normalizeLocalPath(file.name), file]));
    const resolve = (uri: string): File | undefined => filesByName.get(normalizeLocalPath(uri)) ?? filesByName.get(fileBasename(uri));

    for (const buffer of gltf.buffers ?? []) {
      if (!buffer.uri || isAbsoluteOrDataUri(buffer.uri)) continue;
      const dependency = resolve(buffer.uri);
      if (!dependency) throw new Error(`Dropped glTF is missing buffer dependency ${buffer.uri}`);
      const url = URL.createObjectURL(dependency);
      localObjectUrls.push(url);
      dependencies.push({ uri: buffer.uri, fileName: dependency.name, kind: "buffer", byteLength: dependency.size });
      buffer.uri = url;
    }
    for (const image of gltf.images ?? []) {
      if (!image.uri || isAbsoluteOrDataUri(image.uri)) continue;
      const dependency = resolve(image.uri);
      if (!dependency) throw new Error(`Dropped glTF is missing image dependency ${image.uri}`);
      const url = URL.createObjectURL(dependency);
      localObjectUrls.push(url);
      dependencies.push({ uri: image.uri, fileName: dependency.name, kind: "image", byteLength: dependency.size });
      image.uri = url;
      image.mimeType ??= dependency.type || mimeTypeForFile(dependency.name);
    }
    const rewritten = new Blob([JSON.stringify(gltf)], { type: "model/gltf+json" });
    const url = URL.createObjectURL(rewritten);
    localObjectUrls.push(url);
    return { url, dependencies };
  }

  await load(initial.kind, initial.url);

  function runViewControl(action: string, input: AssetViewerInputKind): void {
    if (action === "orbit") {
      cameraState.orbitYaw += input === "touch" ? 0.1 : 0.18;
      cameraState.orbitPitch = clamp(cameraState.orbitPitch + 0.06, -0.55, 0.55);
      cameraState.focused = false;
    } else if (action === "pan") {
      cameraState.panX = clamp(cameraState.panX + 0.12, -0.65, 0.65);
      cameraState.panY = clamp(cameraState.panY + 0.06, -0.45, 0.45);
      cameraState.focused = false;
    } else if (action === "zoom-in") {
      cameraState.zoom = clamp(cameraState.zoom + 0.12, 0.72, 1.45);
      cameraState.focused = false;
    } else if (action === "zoom-out") {
      cameraState.zoom = clamp(cameraState.zoom - 0.12, 0.72, 1.45);
      cameraState.focused = false;
    } else if (action === "focus") {
      cameraState.panX = 0;
      cameraState.panY = 0;
      cameraState.zoom = 1.18;
      cameraState.focused = true;
    } else if (action === "reset") {
      cameraState = createDefaultCameraState();
    }
    cameraState.lastInput = input;
    rerenderLoaded();
  }

  function rerenderLoaded(): void {
    if (!loaded || !lastResult) return;
    const frame = renderLoadedAsset(canvas, overlay, renderer, loaded.resources, loaded.handle.value, renderMode, cameraState, lookControls);
    const next = {
      ...lastResult,
      diagnostics: frame.diagnostics,
      frameTiming: frame.frameTiming,
      renderMode,
      activeRenderMaterials: activeRenderMaterials(loaded.resources),
      lookControls: summarizeLookControls(lookControls, loaded.resources),
      selectedMaterialVariant,
      variantSwitching: summarizeVariantSwitching(loaded.handle.value, selectedMaterialVariant),
      morphControls: summarizeMorphControls(loaded.handle.value, loaded.resources),
      skeletonControls: summarizeSkeletonControls(loaded.handle.value),
      cameraControls: summarizeCameraControls(cameraState, loaded.handle.value),
      animationPlayback: summarizeAnimationPlayback(animationRuntime)
    };
    publish(next);
    lastResult = next;
    status.textContent = assetViewerStatusText(next);
  }

  function applyAnimationTime(time: number, playing: boolean): void {
    if (!animationRuntime) return;
    const duration = Math.max(animationRuntime.action.clip.duration, 0.001);
    const sampleTime = clamp(time, 0, duration);
    animationRuntime.rootMotionTarget.position = [0, 0, 0];
    animationRuntime.rootMotionSamples.length = 0;
    animationRuntime.action.time = 0;
    animationRuntime.action.playing = true;
    animationRuntime.action.paused = false;
    const timeScale = animationRuntime.action.timeScale;
    animationRuntime.action.timeScale = 1;
    animationRuntime.mixer.update(sampleTime);
    animationRuntime.action.timeScale = timeScale;
    animationRuntime.action.paused = !playing;
  }
}

function resolveInitialModel(): { readonly kind: "inline" | "external" | "custom"; readonly url: string } {
  const params = new URLSearchParams(window.location.search);
  const model = params.get("model");
  const url = params.get("url");
  if (model === "inline") return { kind: "inline", url: createInlineTriangleGltfUrl() };
  if (model === "external") return { kind: "external", url: url ?? KHRONOS_DAMAGED_HELMET_GLTF };
  if (model === "custom" && url) return { kind: "custom", url };
  return { kind: "custom", url: DEFAULT_V4_ASSET_GLTF };
}

function summarize(
  kind: "inline" | "external" | "custom" | "local",
  url: string,
  asset: GLTFAsset,
  resources: GLTFRenderResources,
  diagnostics: RenderDeviceDiagnostics,
  frameTiming: AssetViewerFrameTiming,
  postprocess: V4LdrPostprocessSummary,
  environmentResources: V4EnvironmentLightingBundle["resources"],
  inspection: GLTFAssetInspectionReport,
  renderMode: AssetViewerRenderMode,
  lookControls: MutableAssetViewerLookControls,
  selectedMaterialVariant: string | undefined,
  cameraState: AssetViewerCameraState,
  animationRuntime: AssetViewerAnimationRuntime | undefined,
  dependencyResolution: readonly LocalDependencyResolution[] = [],
  resourceTimings?: AssetViewerResourceTimings,
  compressionDecoders?: AssetViewerCompressionDecoderEvidence
): AssetViewerResult {
  const firstMesh = asset.meshes[0];
  const realScenePostprocessReadback = postprocess.inputNonDarkPixels > 0 || postprocess.outputNonDarkPixels > 0;
  const v4RenderPreset = createV4FlagshipRenderPresetEvidence({
    exampleId: "asset-viewer",
    screenshotPath: "tests/reports/external-parity-example-screenshots/asset-viewer.png",
    exposure: postprocess.exposure,
    postprocessEvidence: realScenePostprocessReadback,
    lodEvidence: false
  });
  const assetBundleCache = createAssetBundleCacheEvidence({
    assetId: asset.name || firstMesh?.name || "asset-viewer-gltf",
    url,
    meshCount: asset.meshes.length,
    materialCount: asset.materials.length,
    textureCount: asset.textures.length,
    animationCount: asset.animations.length,
    skinCount: asset.skins.length,
    morphTargetCount: asset.meshes.reduce((sum, mesh) => sum + mesh.morphTargets.length, 0),
    decodedTextureBytes: inspection.textures.reduce((sum, texture) => sum + (texture.runtime?.fallbackByteLength ?? 0), 0)
  });
  const sceneAnalysis = createGLTFSceneAnalysisEvidence({
    asset,
    url,
    minCoverage: 0.25,
    topCategories: 6
  });
  return {
    id: "asset-viewer",
    status: "ready",
    renderer: "webgl2",
    visualClaim: "bounded-gltf-asset-inspection-viewer",
    knownLimits,
    errors: [],
    screenshotPath: "tests/reports/external-parity-example-screenshots/asset-viewer.png",
    claimBoundary,
    featureEvidence: {
      loaded: true,
      meshCount: asset.meshes.length,
      materialCount: asset.materials.length,
      textureCount: asset.textures.length,
      animationCount: asset.animations.length,
      skinCount: asset.skins.length,
      morphTargetCount: asset.meshes.reduce((sum, mesh) => sum + mesh.morphTargets.length, 0),
      unsupportedFeaturesVisible: inspection.warnings.length > 0 || asset.loaderDiagnostics.unsupportedExtensions.length > 0,
      fallbackMaterialVisible: fallbackMaterialsFor(inspection, asset).length > 0,
      v4RenderPreset: true,
      sharedV4Preset: v4RenderPreset.presetId,
      generatedEnvironmentMap: true,
      environmentResourceSet: environmentResources.resourceSet,
      environmentReflectionEvidence: true,
      brdfLutValidated: environmentResources.validation.brdfLutTexture,
      postprocessRealSceneReadback: realScenePostprocessReadback,
      assetBundleManifest: assetBundleCache.productionReadiness.bundleManifest,
      assetBundleDependencySorting: assetBundleCache.productionReadiness.dependencySorting,
      assetCacheTelemetry: assetBundleCache.productionReadiness.cacheTelemetry,
      assetCacheEvictions: assetBundleCache.cache.evictions,
      sceneAnalysisTelemetry: sceneAnalysis.productionReadiness.semanticSegmentTelemetry,
      sceneAnalysisSegments: sceneAnalysis.segments.length,
      sceneAnalysisMaskHash: sceneAnalysis.mask.hash,
      objectDetectionTelemetry: sceneAnalysis.cvSystem.detectionTelemetry,
      objectTrackTelemetry: sceneAnalysis.cvSystem.trackingTelemetry,
      poseTelemetry: sceneAnalysis.cvSystem.poseTelemetry,
      objectDetections: sceneAnalysis.objectDetections.length,
      objectTracks: sceneAnalysis.objectTracks.length,
      poseKeypoints: sceneAnalysis.poses.reduce((sum, pose) => sum + pose.keypoints.length, 0),
      screenshotDiagnostics: true,
      lookControls: true,
      comparisonExport: true
    },
    v4RenderPreset,
    postprocess,
    environmentResources,
    assetBundleCache,
    sceneAnalysis,
    sourceKind: kind,
    url,
    meshCount: asset.meshes.length,
    vertexCount: asset.meshes.reduce((sum, mesh) => sum + mesh.geometry.vertexCount, 0),
    indexCount: asset.meshes.reduce((sum, mesh) => sum + mesh.geometry.indexCount, 0),
    materialCount: asset.materials.length,
    sceneCount: asset.scenes.length,
    renderGeometryCount: resources.geometryLibrary.size,
    renderMaterialCount: resources.materialLibrary.size,
    diagnostics,
    frameTiming,
    bounds: firstMesh?.geometry.bounds,
    publicApis: ["AssetManager", "AssetBundleCacheEvidence", "GLTFLoader", "GLTFSceneAnalysisEvidence", "createGLTFRenderResources", "inspectGLTFAsset"],
    loaderDiagnostics: asset.loaderDiagnostics,
    inspection,
    warnings: inspection.warnings,
    dependencyResolution,
    renderMode,
    activeRenderMaterials: activeRenderMaterials(resources),
    fallbackMaterials: fallbackMaterialsFor(inspection, asset),
    lookControls: summarizeLookControls(lookControls, resources),
    materialVariants: asset.materialVariants.map((variant) => variant.name),
    selectedMaterialVariant,
    variantSwitching: summarizeVariantSwitching(asset, selectedMaterialVariant),
    morphControls: summarizeMorphControls(asset, resources),
    skeletonControls: summarizeSkeletonControls(asset),
    cameraControls: summarizeCameraControls(cameraState, asset),
    animationPlayback: summarizeAnimationPlayback(animationRuntime),
    decodedTextures: inspection.textures.flatMap((texture) => texture.runtime ? [{
      name: texture.name,
      width: texture.runtime.width,
      height: texture.runtime.height,
      format: texture.runtime.format,
      colorSpace: texture.runtime.colorSpace,
      mipLevels: texture.runtime.mipLevels,
      fallbackByteLength: texture.runtime.fallbackByteLength
    }] : []),
    resourceTimings,
    compressionDecoders,
    compressedTextureEvidence: inspection.textures.flatMap((texture) => {
      const runtime = texture.runtime;
      if (!runtime || runtime.format === "rgba8") return [];
      return [{
        name: texture.name,
        format: runtime.format,
        width: runtime.width,
        height: runtime.height,
        mipLevels: runtime.mipLevels,
        fallbackByteLength: runtime.fallbackByteLength,
        decodedContent: true as const
      }];
    })
  };
}

function createResourceTimings(loadMs: number, renderResourceMs: number, resources: GLTFRenderResources): AssetViewerResourceTimings {
  const textures = [...resources.textureLibrary.values()];
  const hasTextures = textures.length > 0;
  const hasCompressedTextures = textures.some((texture) => texture.format !== "rgba8");
  return {
    loadMs,
    renderResourceMs,
    textureDecodeMs: hasTextures ? renderResourceMs : 0,
    compressedTranscodeMs: hasCompressedTextures ? renderResourceMs : 0
  };
}

function elapsedMs(startedAt: number): number {
  return Number(Math.max(0, performance.now() - startedAt).toFixed(3));
}

function optionElement(value: string, label: string): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function activeRenderMaterials(resources: GLTFRenderResources): readonly string[] {
  return resources.scene.collectRenderables()
    .map(({ renderable }) => renderable.material)
    .sort((left, right) => left.localeCompare(right));
}

function fallbackMaterialsFor(inspection: GLTFAssetInspectionReport, asset: GLTFAsset): readonly AssetViewerFallbackMaterial[] {
  const warningCodes = inspection.warnings
    .filter((warning) => warning.code.includes("UNSUPPORTED") || warning.code.includes("BOUNDED"))
    .map((warning) => warning.code);
  const affectedExtensions = asset.loaderDiagnostics.unsupportedExtensions;
  if (warningCodes.length === 0 && affectedExtensions.length === 0) {
    return [];
  }
  return [{
    name: "unsupported-feature-fallback",
    baseColor: "#ff4fd8",
    reason: "Unsupported or bounded material/animation features are surfaced with an explicit fallback instead of hidden as successful fidelity.",
    warningCodes,
    affectedExtensions,
    visibleInInspector: true
  }];
}

function summarizeVariantSwitching(
  asset: GLTFAsset,
  selectedMaterialVariant: string | undefined
): { readonly available: boolean; readonly applied: boolean } {
  return {
    available: asset.materialVariants.length > 0,
    applied: selectedMaterialVariant !== undefined && asset.meshes.some((mesh) =>
      mesh.materialVariants.some((mapping) => mapping.variant === selectedMaterialVariant)
    )
  };
}

function summarizeMorphControls(asset: GLTFAsset, resources: GLTFRenderResources): AssetViewerMorphControls {
  const morphMesh = asset.meshes.find((mesh) => mesh.morphTargets.length > 0);
  if (!morphMesh) {
    return {
      available: false,
      targetCount: 0,
      activeWeights: [],
      renderApplied: false
    };
  }
  const renderable = resources.scene.collectRenderables().find((entry) => entry.renderable.geometry === morphMesh.name)?.renderable;
  const activeWeights = [...(renderable?.morphWeights ?? morphMesh.morphWeights)].map((weight) => Number(weight.toFixed(3)));
  return {
    available: true,
    meshName: morphMesh.name,
    targetCount: morphMesh.morphTargets.length,
    activeWeights,
    renderApplied: resources.morphTargetLibrary.has(morphMesh.name) && activeWeights.length === morphMesh.morphTargets.length
  };
}

function summarizeSkeletonControls(asset: GLTFAsset): AssetViewerSkeletonControls {
  const boneCount = asset.skins.reduce((sum, skin) => sum + skin.joints.length, 0);
  return {
    available: asset.skins.length > 0,
    skinCount: asset.skins.length,
    boneCount,
    bonesVisibleInInspector: boneCount > 0
  };
}

function createAnimationRuntime(asset: GLTFAsset, resources: GLTFRenderResources, clipIndex: number, loopMode: LoopMode = "repeat", timeScale = 1): AssetViewerAnimationRuntime | undefined {
  const clip = asset.animations[clipIndex];
  if (!clip) return undefined;
  const bridge = new SceneAnimationBridge();
  const rootMotionTrack = rootMotionTrackForClip(clip);
  const rootMotionTarget = { position: [0, 0, 0] as [number, number, number] };
  const rootMotionSamples: RootMotionSample[] = [];
  resources.scene.traverse((node) => {
    const renderables = resources.scene.collectRenderables().filter((entry) => entry.node.name === node.name);
    bridge.register(node.name, {
      setPosition: (value) => node.transform.setPosition(value[0], value[1], value[2]),
      setRotation: (value) => node.transform.setRotation(value[0], value[1], value[2], value[3]),
      setScale: (value) => node.transform.setScale(value[0], value[1], value[2]),
      setWeights: (value) => {
        for (const { renderable } of renderables) {
          renderable.morphWeights.length = 0;
          renderable.morphWeights.push(...value.map((weight) => clamp(weight, 0, 1)));
        }
      }
    });
  });
  const mixer = new AnimationMixer({
    setAnimationValue: (target, value) => bridge.setAnimationValue(target, value),
    applyRootMotion: (sample) => {
      rootMotionSamples.push(sample);
      rootMotionTarget.position = [
        rootMotionTarget.position[0] + sample.delta[0],
        rootMotionTarget.position[1] + sample.delta[1],
        rootMotionTarget.position[2] + sample.delta[2]
      ];
    }
  }, {
    applyRootMotion: rootMotionTrack !== undefined,
    ...(rootMotionTrack === undefined ? {} : { rootMotionTrack })
  });
  const action = mixer.play(clip);
  action.loopMode = loopMode;
  action.timeScale = timeScale;
  action.pause();
  return {
    mixer,
    action,
    clipIndex,
    ...(rootMotionTrack === undefined ? {} : { rootMotionTrack }),
    rootMotionTarget,
    rootMotionSamples
  };
}

function summarizeAnimationPlayback(runtime: AssetViewerAnimationRuntime | undefined): AssetViewerAnimationPlayback | undefined {
  if (!runtime) return undefined;
  const snapshot = runtime.mixer.snapshot();
  return {
    clipName: runtime.action.clip.name,
    time: Number(runtime.action.time.toFixed(3)),
    duration: Number(runtime.action.clip.duration.toFixed(3)),
    playing: runtime.action.playing && !runtime.action.paused,
    loopMode: runtime.action.loopMode,
    timeScale: runtime.action.timeScale,
    rootMotion: summarizeRootMotion(runtime),
    appliedTargets: Object.keys(snapshot.values).sort(),
    sampledNodeTransforms: Object.keys(snapshot.values).length,
    applyErrors: snapshot.applyErrors,
    renderApplied: snapshot.applyErrors.length === 0 && Object.keys(snapshot.values).length > 0
  };
}

function rootMotionTrackForClip(clip: AnimationAction["clip"]): string | undefined {
  const track = clip.tracks.find((candidate) =>
    (candidate.target.endsWith(".position") || candidate.target.endsWith(".translation")) &&
    candidate.valueType === "vector3"
  );
  return track?.target;
}

function summarizeRootMotion(runtime: AssetViewerAnimationRuntime): AssetViewerAnimationPlayback["rootMotion"] {
  const track = runtime.action.clip.tracks.find((candidate) => candidate.target === runtime.rootMotionTrack);
  const first = track?.keyframes[0]?.value;
  const last = track?.keyframes[track.keyframes.length - 1]?.value;
  const appliedDistance = Number(Math.hypot(
    runtime.rootMotionTarget.position[0],
    runtime.rootMotionTarget.position[1],
    runtime.rootMotionTarget.position[2]
  ).toFixed(3));
  const position = runtime.rootMotionTarget.position.map((component) => Number(component.toFixed(3))) as [number, number, number];
  if (!Array.isArray(first) || !Array.isArray(last) || first.length < 3 || last.length < 3) {
    return {
      available: false,
      target: null,
      distance: 0,
      applied: false,
      sampleCount: runtime.rootMotionSamples.length,
      appliedDistance,
      position
    };
  }
  const dx = Number(last[0]) - Number(first[0]);
  const dy = Number(last[1]) - Number(first[1]);
  const dz = Number(last[2]) - Number(first[2]);
  return {
    available: true,
    target: track?.target ?? null,
    distance: Number(Math.hypot(dx, dy, dz).toFixed(3)),
    applied: runtime.rootMotionSamples.some((sample) => Math.hypot(sample.delta[0], sample.delta[1], sample.delta[2]) > 0),
    sampleCount: runtime.rootMotionSamples.length,
    appliedDistance,
    position
  };
}

function isLoopMode(value: string | undefined): value is LoopMode {
  return value === "once" || value === "repeat" || value === "pingpong";
}

function publish(result: AssetViewerResult): void {
  window.__AURA3D_ASSET_VIEWER__ = result;
}

function assetViewerErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const details = (error as Error & { readonly details?: unknown }).details;
  const detailText = details === undefined ? "" : ` ${JSON.stringify(details)}`;
  const cause = (error as Error & { readonly cause?: unknown }).cause;
  if (cause === undefined) return `${error.message}${detailText}`;
  return `${error.message}${detailText}: ${assetViewerErrorMessage(cause)}`;
}

function assetViewerStatusText(result: AssetViewerResult): string {
  return JSON.stringify({
    id: result.id,
    status: result.status,
    sourceKind: result.sourceKind,
    url: result.url,
    error: result.error,
    meshCount: result.meshCount,
    vertexCount: result.vertexCount,
    renderGeometryCount: result.renderGeometryCount,
    renderMaterialCount: result.renderMaterialCount,
    diagnostics: result.diagnostics,
    warnings: result.warnings?.map((warning) => warning.code),
    compressionDecoders: result.compressionDecoders,
    screenshot: result.screenshot
  }, null, 2);
}

function asMaterialOverride(value: string): AssetViewerMaterialOverride {
  return value === "matte" || value === "metallic" ? value : "asset";
}

function asEnvironmentPreset(value: string): AssetViewerEnvironmentPreset {
  return value === "neutral" || value === "sunset" ? value : "studio";
}

function assetViewerV4EnvironmentPreset(preset: AssetViewerEnvironmentPreset): "studio" | "inspection" | "evening" {
  if (preset === "neutral") return "inspection";
  if (preset === "sunset") return "evening";
  return "studio";
}

function asPostprocessPreview(value: string): AssetViewerPostprocessPreview {
  return value === "exposure-diagnostic" || value === "bloom-diagnostic" ? value : "off";
}

function summarizeLookControls(controls: MutableAssetViewerLookControls, resources: GLTFRenderResources): AssetViewerLookControls {
  return {
    materialOverride: controls.materialOverride,
    materialOverrideAppliedTo: materialOverrideTargets(resources, controls.materialOverride),
    environmentPreset: controls.environmentPreset,
    environmentIntensity: Number(controls.environmentIntensity.toFixed(2)),
    postprocessPreview: controls.postprocessPreview,
    postprocessStatus: controls.postprocessPreview === "off" ? "disabled" : "diagnostic-only",
    boundedControls: true
  };
}

function materialOverrideTargets(resources: GLTFRenderResources, override: AssetViewerMaterialOverride): readonly string[] {
  if (override === "asset") return [];
  return [...resources.materialLibrary.values()]
    .filter((material): material is Material => material instanceof Material)
    .filter((material) => material.getParameter("u_baseColor") !== undefined || material.getParameter("u_metallic") !== undefined || material.getParameter("u_roughness") !== undefined)
    .map((material) => material.name)
    .sort((left, right) => left.localeCompare(right));
}

function applyMaterialLookControls(resources: GLTFRenderResources, controls: MutableAssetViewerLookControls): void {
  if (controls.materialOverride === "asset") return;
  const parameters = controls.materialOverride === "metallic"
    ? { baseColor: [0.82, 0.86, 0.92, 1] as const, metallic: 0.95, roughness: 0.18 }
    : { baseColor: [0.74, 0.78, 0.82, 1] as const, metallic: 0.05, roughness: 0.82 };
  for (const material of resources.materialLibrary.values()) {
    if (!(material instanceof Material)) continue;
    if (material.getParameter("u_baseColor") !== undefined) material.setParameter("u_baseColor", parameters.baseColor);
    if (material.getParameter("u_metallic") !== undefined) material.setParameter("u_metallic", parameters.metallic);
    if (material.getParameter("u_roughness") !== undefined) material.setParameter("u_roughness", parameters.roughness);
  }
}

function environmentPreset(preset: AssetViewerEnvironmentPreset, intensity: number): {
  readonly keyColor: readonly [number, number, number];
  readonly keyIntensity: number;
  readonly fillColor: readonly [number, number, number];
  readonly fillIntensity: number;
  readonly ambientColor: readonly [number, number, number];
  readonly ambientIntensity: number;
  readonly skyColor: readonly [number, number, number];
  readonly horizonColor: readonly [number, number, number];
  readonly groundColor: readonly [number, number, number];
  readonly specularColor: readonly [number, number, number];
  readonly environmentMapIntensity: number;
  readonly environmentSpecularIntensity: number;
} {
  const scaled = clamp(intensity, 0.2, 2.4);
  if (preset === "sunset") {
    return {
      keyColor: [1, 0.72, 0.48],
      keyIntensity: 2.2 * scaled,
      fillColor: [0.35, 0.48, 1],
      fillIntensity: 1.1 * scaled,
      ambientColor: [1, 0.66, 0.48],
      ambientIntensity: 0.18 * scaled,
      skyColor: [0.38, 0.32, 0.62],
      horizonColor: [1, 0.54, 0.28],
      groundColor: [0.07, 0.05, 0.06],
      specularColor: [1, 0.8, 0.58],
      environmentMapIntensity: 0.4 * scaled,
      environmentSpecularIntensity: 0.68 * scaled
    };
  }
  if (preset === "neutral") {
    return {
      keyColor: [0.94, 0.98, 1],
      keyIntensity: 1.8 * scaled,
      fillColor: [0.62, 0.7, 0.78],
      fillIntensity: 1.0 * scaled,
      ambientColor: [0.78, 0.82, 0.86],
      ambientIntensity: 0.14 * scaled,
      skyColor: [0.58, 0.62, 0.68],
      horizonColor: [0.7, 0.72, 0.74],
      groundColor: [0.12, 0.12, 0.13],
      specularColor: [0.92, 0.95, 1],
      environmentMapIntensity: 0.3 * scaled,
      environmentSpecularIntensity: 0.5 * scaled
    };
  }
  return {
    keyColor: [1, 0.94, 0.82],
    keyIntensity: 2.4 * scaled,
    fillColor: [0.42, 0.72, 1],
    fillIntensity: 1.4 * scaled,
    ambientColor: [0.62, 0.74, 0.92],
    ambientIntensity: 0.2 * scaled,
    skyColor: [0.45, 0.55, 0.72],
    horizonColor: [0.72, 0.68, 0.58],
    groundColor: [0.08, 0.08, 0.09],
    specularColor: [1, 1, 1],
    environmentMapIntensity: 0.38 * scaled,
    environmentSpecularIntensity: 0.64 * scaled
  };
}

function createComparisonExport(result: AssetViewerResult): AssetViewerComparisonExport {
  const base = {
    schemaVersion: "a3d-v4-asset-viewer-comparison-export-v1" as const,
    generated: true,
    generatedAt: new Date().toISOString(),
    renderer: "webgl2" as const,
    sourceKind: result.sourceKind,
    url: result.url,
    renderMode: result.renderMode,
    meshCount: result.meshCount ?? 0,
    materialCount: result.materialCount ?? 0,
    textureSlots: result.loaderDiagnostics?.textureSlots ?? [],
    loaderFeatures: result.loaderDiagnostics?.features ?? [],
    warnings: result.warnings?.map((warning) => warning.code) ?? [],
    lookControls: result.lookControls ?? {
      materialOverride: "asset",
      materialOverrideAppliedTo: [],
      environmentPreset: "studio",
      environmentIntensity: 1.2,
      postprocessPreview: "off",
      postprocessStatus: "disabled",
      boundedControls: true as const
    },
    screenshotPath: result.screenshotPath,
    byteLength: 0
  };
  return {
    ...base,
    byteLength: JSON.stringify(base).length
  };
}

function renderLoadedAsset(
  canvas: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
  renderer: Renderer,
  resources: GLTFRenderResources,
  asset: GLTFAsset,
  renderMode: AssetViewerRenderMode,
  cameraState: AssetViewerCameraState,
  lookControls: MutableAssetViewerLookControls
): {
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly frameTiming: AssetViewerFrameTiming;
  readonly postprocess: V4LdrPostprocessSummary;
  readonly environmentResources: V4EnvironmentLightingBundle["resources"];
} {
  const frameStartedAt = performance.now();
  renderer.resize(canvas.width, canvas.height);
  const scene = resources.scene;
  const bounds = assetViewerWorldBounds(resources) ?? asset.meshes[0]?.geometry.bounds;
  const spanX = Math.max(0.1, (bounds?.max[0] ?? 0.5) - (bounds?.min[0] ?? -0.5));
  const spanY = Math.max(0.1, (bounds?.max[1] ?? 0.5) - (bounds?.min[1] ?? -0.5));
  const spanZ = Math.max(0.1, (bounds?.max[2] ?? 0.5) - (bounds?.min[2] ?? -0.5));
  const centerX = ((bounds?.min[0] ?? -0.5) + (bounds?.max[0] ?? 0.5)) * 0.5;
  const centerY = ((bounds?.min[1] ?? -0.5) + (bounds?.max[1] ?? 0.5)) * 0.5;
  const centerZ = ((bounds?.min[2] ?? -0.5) + (bounds?.max[2] ?? 0.5)) * 0.5;
  const radius = Math.max(0.05, Math.hypot(spanX, spanY, spanZ) * 0.5);
  const fovYRadians = Math.PI / 4;
  const distance = Math.max(0.16, (radius / Math.tan(fovYRadians * 0.5)) * 1.35);

  const camera = getOrCreateCamera(scene, distance, canvas);
  const cameraDistance = distance / cameraState.zoom;
  camera.aspect = canvas.width / canvas.height;
  camera.near = Math.max(0.001, distance / 200);
  camera.far = Math.max(distance * 8, distance + radius * 6);
  camera.transform.setPosition(
    centerX + Math.sin(cameraState.orbitYaw) * cameraDistance + cameraState.panX * spanX,
    centerY + Math.sin(cameraState.orbitPitch) * cameraDistance + cameraState.panY * spanY,
    centerZ + Math.cos(cameraState.orbitYaw) * cameraDistance
  );
  camera.transform.setRotation(...quatFromEuler(cameraState.orbitPitch, cameraState.orbitYaw, 0));

  const key = getOrCreateLight(scene, "directional", "asset-viewer-key");
  key.intensity = 2.4;
  key.color = [1, 0.94, 0.82];

  const fill = getOrCreateLight(scene, "point", "asset-viewer-fill");
  const environment = environmentPreset(lookControls.environmentPreset, lookControls.environmentIntensity);
  const lightingBundle = createV4EnvironmentLighting(assetViewerV4EnvironmentPreset(lookControls.environmentPreset));
  key.intensity = environment.keyIntensity;
  key.color = environment.keyColor;
  fill.intensity = environment.fillIntensity;
  fill.range = distance * 3;
  fill.color = environment.fillColor;
  fill.transform.setPosition(-distance * 0.45, distance * 0.35, distance * 0.55);
  applyMaterialLookControls(resources, lookControls);

  const diagnostics = renderer.render({
    scene,
    geometryLibrary: resources.geometryLibrary,
    materialLibrary: resources.materialLibrary,
    morphTargetLibrary: resources.morphTargetLibrary,
    environmentLighting: lightingBundle.lighting
  });
  const postprocess = sampleV4LdrPostprocessReadback({
    device: renderer.device,
    framebufferWidth: canvas.width,
    framebufferHeight: canvas.height,
    exposure: lookControls.postprocessPreview === "exposure-diagnostic" ? 1.25 : 1.12,
    maxWidth: canvas.width,
    maxHeight: canvas.height
  });
  renderDiagnosticOverlay(overlay, asset, renderMode, cameraState);
  return {
    diagnostics,
    frameTiming: createFrameTiming(elapsedMs(frameStartedAt)),
    postprocess,
    environmentResources: lightingBundle.resources
  };
}

function assetViewerWorldBounds(resources: GLTFRenderResources): { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } | undefined {
  resources.scene.updateWorldTransforms();
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  let hasBounds = false;
  for (const { node, renderable } of resources.scene.collectRenderables()) {
    const geometry = resources.geometryLibrary.get(renderable.geometry);
    if (!geometry) continue;
    for (const point of boundsCorners(geometry.bounds)) {
      const transformed = transformPoint(node.transform.worldMatrix, point);
      min[0] = Math.min(min[0], transformed[0]);
      min[1] = Math.min(min[1], transformed[1]);
      min[2] = Math.min(min[2], transformed[2]);
      max[0] = Math.max(max[0], transformed[0]);
      max[1] = Math.max(max[1], transformed[1]);
      max[2] = Math.max(max[2], transformed[2]);
      hasBounds = true;
    }
  }
  return hasBounds ? { min, max } : undefined;
}

function boundsCorners(bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }): readonly (readonly [number, number, number])[] {
  return [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]]
  ];
}

function transformPoint(matrix: readonly number[], point: readonly [number, number, number]): readonly [number, number, number] {
  const x = point[0];
  const y = point[1];
  const z = point[2];
  return [
    (matrix[0] ?? 1) * x + (matrix[4] ?? 0) * y + (matrix[8] ?? 0) * z + (matrix[12] ?? 0),
    (matrix[1] ?? 0) * x + (matrix[5] ?? 1) * y + (matrix[9] ?? 0) * z + (matrix[13] ?? 0),
    (matrix[2] ?? 0) * x + (matrix[6] ?? 0) * y + (matrix[10] ?? 1) * z + (matrix[14] ?? 0)
  ];
}

function createFrameTiming(cpuFrameMs: number): AssetViewerFrameTiming {
  const rounded = Number(cpuFrameMs.toFixed(3));
  return {
    cpuFrameMs: rounded,
    gpuFrameMs: rounded,
    gpuTimingSupported: false,
    gpuTimingSource: "cpu-fallback",
    fallbackReason: "EXT_disjoint_timer_query_webgl2 is not required for asset-viewer evidence; GPU readout mirrors CPU frame timing."
  };
}

function renderDiagnosticOverlay(overlay: HTMLCanvasElement, asset: GLTFAsset, renderMode: AssetViewerRenderMode, cameraState: AssetViewerCameraState): void {
  const context = overlay.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, overlay.width, overlay.height);
  if (renderMode === "shaded") {
    return;
  }
  const mesh = asset.meshes[0];
  if (!mesh) {
    return;
  }
  const bounds = mesh.geometry.bounds;
  const project = (point: readonly [number, number, number]): readonly [number, number] => {
    const spanX = Math.max(0.001, bounds.max[0] - bounds.min[0]);
    const spanY = Math.max(0.001, bounds.max[1] - bounds.min[1]);
    const padding = 84;
    const usableWidth = overlay.width - padding * 2;
    const usableHeight = overlay.height - padding * 2;
    const zoomOffsetX = (usableWidth - usableWidth * cameraState.zoom) * 0.5;
    const zoomOffsetY = (usableHeight - usableHeight * cameraState.zoom) * 0.5;
    const x = padding + zoomOffsetX + ((point[0] - bounds.min[0]) / spanX) * usableWidth * cameraState.zoom + cameraState.panX * overlay.width * 0.18;
    const y = overlay.height - padding - zoomOffsetY - ((point[1] - bounds.min[1]) / spanY) * usableHeight * cameraState.zoom - cameraState.panY * overlay.height * 0.18;
    return [x, y];
  };

  if (renderMode === "wireframe") {
    const indices = mesh.indices.length > 0 ? mesh.indices : mesh.positions.map((_, index) => index);
    context.save();
    context.strokeStyle = "#76d7ff";
    context.lineWidth = 3;
    context.shadowColor = "rgba(118, 215, 255, 0.55)";
    context.shadowBlur = 10;
    for (let index = 0; index + 2 < indices.length; index += 3) {
      const a = mesh.positions[indices[index] ?? 0];
      const b = mesh.positions[indices[index + 1] ?? 0];
      const c = mesh.positions[indices[index + 2] ?? 0];
      if (!a || !b || !c) continue;
      const [ax, ay] = project(a);
      const [bx, by] = project(b);
      const [cx, cy] = project(c);
      context.beginPath();
      context.moveTo(ax, ay);
      context.lineTo(bx, by);
      context.lineTo(cx, cy);
      context.closePath();
      context.stroke();
    }
    context.restore();
  }

  if (renderMode === "bounds") {
    const [x0, y0] = project([bounds.min[0], bounds.min[1], bounds.min[2]]);
    const [x1, y1] = project([bounds.max[0], bounds.max[1], bounds.max[2]]);
    context.save();
    context.strokeStyle = "#ffd166";
    context.fillStyle = "rgba(255, 209, 102, 0.12)";
    context.lineWidth = 4;
    context.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    context.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    context.restore();
  }

  if (renderMode === "material") {
    context.save();
    const materials = asset.materials.length > 0 ? asset.materials : [{ name: "Default material" }];
    context.fillStyle = "rgba(8, 13, 19, 0.78)";
    context.fillRect(28, 28, 320, 36 + materials.length * 34);
    context.font = "700 16px ui-sans-serif, system-ui, sans-serif";
    context.fillStyle = "#eef2f6";
    context.fillText("Material IDs", 48, 56);
    materials.forEach((material, index) => {
      const y = 84 + index * 34;
      context.fillStyle = materialSwatch(index);
      context.fillRect(48, y - 15, 18, 18);
      context.fillStyle = "#dbe6ef";
      context.font = "13px ui-sans-serif, system-ui, sans-serif";
      context.fillText(`${index}: ${material.name}`, 76, y);
    });
    context.restore();
  }
}

function createDefaultCameraState(): AssetViewerCameraState {
  return {
    orbitYaw: -0.36,
    orbitPitch: 0.12,
    panX: 0,
    panY: 0.04,
    zoom: 1.22,
    focused: false,
    lastInput: "load"
  };
}

function summarizeCameraControls(cameraState: AssetViewerCameraState, asset: GLTFAsset): AssetViewerCameraControls {
  return {
    orbitYaw: Number(cameraState.orbitYaw.toFixed(3)),
    orbitPitch: Number(cameraState.orbitPitch.toFixed(3)),
    panX: Number(cameraState.panX.toFixed(3)),
    panY: Number(cameraState.panY.toFixed(3)),
    zoom: Number(cameraState.zoom.toFixed(2)),
    focused: cameraState.focused,
    fitToBounds: true,
    resetView: true,
    pointerControls: true,
    keyboardControls: true,
    touchControls: true,
    selectionDiagnostics: asset.meshes.length > 0,
    selectedMesh: asset.meshes[0]?.name ?? "none",
    lastInput: cameraState.lastInput
  };
}

function getOrCreateCamera(scene: GLTFRenderResources["scene"], distance: number, canvas: HTMLCanvasElement): Camera & { aspect: number; near: number; far: number } {
  const existing = scene.collectCameras().find((entry) => entry.name === "asset-viewer-camera");
  if (existing instanceof Camera) {
    return existing as Camera & { aspect: number; near: number; far: number };
  }
  const camera = scene.createPerspectiveCamera({
    name: "asset-viewer-camera",
    fovYRadians: Math.PI / 4,
    aspect: canvas.width / canvas.height,
    near: 0.01,
    far: distance * 8
  });
  scene.root.addChild(camera);
  return camera;
}

function getOrCreateLight(scene: GLTFRenderResources["scene"], kind: "directional" | "point", name: string): Light {
  const existing = scene.collectLights().find((entry) => entry.name === name);
  if (existing) return existing;
  const light = scene.createLight(kind, name);
  scene.root.addChild(light);
  return light;
}

function quatFromEuler(pitch: number, yaw: number, roll: number): [number, number, number, number] {
  const cy = Math.cos(yaw * 0.5);
  const sy = Math.sin(yaw * 0.5);
  const cp = Math.cos(pitch * 0.5);
  const sp = Math.sin(pitch * 0.5);
  const cr = Math.cos(roll * 0.5);
  const sr = Math.sin(roll * 0.5);
  return [
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy
  ];
}

function materialSwatch(index: number): string {
  return ["#ff6b6b", "#4ecdc4", "#ffe66d", "#a78bfa", "#f472b6"][index % 5]!;
}

function renderInspection(container: HTMLElement, inspection: GLTFAssetInspectionReport, asset: GLTFAsset): void {
  container.replaceChildren(
    inspectorGroup("Hierarchy", inspection.sceneHierarchy.map((node) => `${"  ".repeat(node.depth)}${node.name}${node.hasRenderable ? " [mesh]" : ""}`)),
    inspectorGroup("Meshes", inspection.meshes.map((mesh) => `${mesh.name}: ${mesh.vertexCount} vertices, ${mesh.indexCount} indices, ${mesh.topology}, material ${mesh.material}`)),
    inspectorGroup("Materials", inspection.materials.map((material) => {
      const textures = material.textures.length > 0 ? `, textures ${material.textures.map((slot) => slot.slot).join("/")}` : "";
      const extensions = material.extensions.length > 0 ? `, extensions ${material.extensions.join("/")}` : "";
      return `${material.name}: ${material.alphaMode}, ${material.doubleSided ? "double-sided" : "single-sided"}${textures}${extensions}`;
    })),
    inspectorGroup("Fallbacks", fallbackMaterialsFor(inspection, asset).map((fallback) =>
      `${fallback.name}: ${fallback.baseColor}, ${fallback.reason} warnings ${fallback.warningCodes.join("/") || "none"} extensions ${fallback.affectedExtensions.join("/") || "none"}`
    )),
    inspectorGroup("Textures", inspection.textures.map((texture) => {
      const runtime = texture.runtime ? `${texture.runtime.width}x${texture.runtime.height} ${texture.runtime.format} ${texture.runtime.colorSpace}` : "not decoded";
      return `${texture.name}: image ${texture.imageName}, ${runtime}`;
    })),
    inspectorGroup("Animation", inspection.animations.map((clip) => `${clip.name}: ${clip.duration.toFixed(3)}s, ${clip.trackCount} tracks`)),
    inspectorGroup("Skins", inspection.skins.map((skin) => {
      const bones = skin.bones.length > 0 ? `, bones ${skin.bones.map((bone) => bone.name).join("/")}` : "";
      return `${skin.name}: ${skin.jointCount} joints${bones}`;
    })),
    inspectorGroup("Morphs", inspection.morphTargets.map((morph) => `${morph.mesh}: ${morph.targets.length} targets, weights ${morph.weights.join(",")}`)),
    inspectorGroup("Variants", asset.materialVariants.map((variant) => {
      const mappings = asset.meshes.flatMap((mesh) => mesh.materialVariants.filter((mapping) => mapping.variant === variant.name));
      const materials = mappings.length > 0 ? `, materials ${mappings.map((mapping) => mapping.material).join("/")}` : "";
      return `${variant.name}${materials}`;
    })),
    inspectorGroup("Cameras/Lights", [
      ...inspection.cameras.map((camera) => `${camera.name}: ${camera.type} camera`),
      ...inspection.lights.map((light) => `${light.name}: ${light.type} light, intensity ${light.intensity}`)
    ]),
    inspectorGroup("Warnings", inspection.warnings.map((warning) => `${warning.code}: ${warning.message}`))
  );
}

function inspectorGroup(title: string, rows: readonly string[]): HTMLElement {
  const details = document.createElement("details");
  details.open = rows.length > 0;
  const summary = document.createElement("summary");
  summary.textContent = `${title} (${rows.length})`;
  const list = document.createElement("ul");
  for (const row of rows.length > 0 ? rows : ["None"]) {
    const item = document.createElement("li");
    item.textContent = row;
    list.append(item);
  }
  details.append(summary, list);
  return details;
}

function isAbsoluteOrDataUri(uri: string): boolean {
  return /^(?:data:|blob:|https?:|file:)/i.test(uri);
}

function normalizeLocalPath(path: string): string {
  return decodeURIComponent(path).replaceAll("\\", "/").replace(/^\.\//, "");
}

function fileBasename(path: string): string {
  const normalized = normalizeLocalPath(path);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function mimeTypeForFile(fileName: string): string | undefined {
  if (/\.png$/i.test(fileName)) return "image/png";
  if (/\.jpe?g$/i.test(fileName)) return "image/jpeg";
  if (/\.webp$/i.test(fileName)) return "image/webp";
  if (/\.ktx2$/i.test(fileName)) return "image/ktx2";
  return undefined;
}

async function fileToDataUrl(file: File, mimeType: string): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function createInlineTriangleGltfUrl(): string {
  const positions = floatBytes([-0.7, -0.45, 0, 0.7, -0.45, 0, 0, 0.75, 0]);
  const colors = floatBytes([0.2, 0.45, 1, 1, 0.15, 0.8, 0.45, 1, 1, 0.72, 0.2, 1]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, colors, indices);
  const gltf = {
    asset: { version: "2.0", generator: "Aura3D asset viewer fixture" },
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: colors.byteLength },
      { buffer: 0, byteOffset: positions.byteLength + colors.byteLength, byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.7, -0.45, 0], max: [0.7, 0.75, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    materials: [{ name: "asset-viewer-inline-material", extensions: { KHR_materials_unlit: {} } }],
    meshes: [{ name: "asset-viewer-inline-triangle", primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, indices: 2, material: 0 }] }],
    nodes: [{ name: "asset-viewer-inline-node", mesh: 0 }],
    scenes: [{ name: "asset-viewer-inline-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function floatBytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  new Float32Array(bytes.buffer).set(values);
  return bytes;
}

function uint16Bytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2);
  new Uint16Array(bytes.buffer).set(values);
  return bytes;
}

function concatBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function bytesDataUri(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:application/octet-stream;base64,${btoa(binary)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function installAssetViewerStyles(): void {
  if (document.querySelector("#aura3d-asset-viewer-styles")) return;
  const style = document.createElement("style");
  style.id = "aura3d-asset-viewer-styles";
  style.textContent = `
    .asset-viewer { height: 100vh; overflow: hidden; grid-template-rows: minmax(0, 1fr) minmax(13rem, 21rem); }
    .asset-viewer-stage { position: relative; min-height: 0; background: radial-gradient(circle at 50% 34%, #314756 0, #141f28 55%, #090e13 100%); }
    .asset-viewer-stage canvas { width: 100%; height: 100%; display: block; touch-action: none; }
    .asset-viewer-overlay { position: absolute; inset: 0; pointer-events: none; }
    .asset-viewer-panel { min-height: 0; overflow: auto; grid-template-columns: minmax(12rem, 16rem) minmax(18rem, 1.1fr) minmax(20rem, 1.2fr); }
    .asset-viewer-panel form { display: grid; grid-template-columns: minmax(9rem, 12rem) minmax(11rem, 13rem) minmax(12rem, 1fr) auto; gap: 0.75rem; align-items: end; }
    .asset-viewer-panel label { display: grid; gap: 0.35rem; color: #c6d0da; font-size: 0.8125rem; }
    .asset-viewer-panel select,
    .asset-viewer-panel input,
    .asset-viewer-panel button { min-height: 2.25rem; border: 1px solid #34424d; background: #101820; color: #eef2f6; border-radius: 6px; padding: 0 0.65rem; font: inherit; }
    .asset-viewer-panel input { min-width: 0; }
    .asset-viewer-panel button { background: #2d6cdf; border-color: #5b91ff; cursor: pointer; }
    .asset-viewer-dropzone { border: 1px dashed #5b7080; border-radius: 6px; color: #b7c4ce; min-height: 3rem; display: grid; place-items: center; padding: 0.75rem; background: #0e151c; }
    .asset-viewer-dropzone.is-dragover { border-color: #62d68f; color: #eef2f6; background: #132219; }
    .asset-viewer-tools { display: grid; grid-template-columns: repeat(2, auto) minmax(18rem, 26rem) minmax(16rem, 24rem) minmax(11rem, 14rem) minmax(11rem, 15rem) minmax(0, 1fr); gap: 0.75rem; align-items: center; }
    .asset-viewer-view-controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.45rem; }
    .asset-viewer-look-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.45rem; }
    .asset-viewer-variant-controls { min-width: 0; }
    .asset-viewer-morph-controls { display: grid; gap: 0.4rem; min-width: 0; }
    .asset-viewer-morph-controls strong { color: #eef2f6; font-size: 0.8125rem; overflow-wrap: anywhere; }
    .asset-viewer-animation-controls { display: grid; grid-template-columns: minmax(10rem, 14rem) minmax(10rem, 1fr) auto; gap: 0.75rem; align-items: end; }
    .asset-viewer-inspector { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; color: #dbe6ef; }
    .asset-viewer-inspector details { border: 1px solid #26343f; border-radius: 6px; padding: 0.5rem; background: #101820; min-width: 0; }
    .asset-viewer-inspector summary { cursor: pointer; color: #eef2f6; font-weight: 600; }
    .asset-viewer-inspector ul { margin: 0.5rem 0 0; padding-left: 1rem; max-height: 6rem; overflow: auto; }
    .asset-viewer-inspector li { overflow-wrap: anywhere; color: #b7c4ce; line-height: 1.35; }
    .asset-viewer-panel pre { max-height: 18rem; overflow: auto; font-size: 0.6875rem; line-height: 1.25; }
    @media (max-width: 760px) { .asset-viewer-panel form { grid-template-columns: 1fr; } }
    @media (max-width: 900px) {
      .asset-viewer-tools,
      .asset-viewer-animation-controls,
      .asset-viewer-inspector { grid-template-columns: 1fr; }
    }
  `;
  document.head.append(style);
}
