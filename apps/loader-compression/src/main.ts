import {
  GLTFLoader,
  LoadContext,
  createDracoDecoder,
  createGLTFRenderResources,
  createMeshoptDecoder,
  evaluateGLTFExtensionSupport,
  type GLTFDracoDecodeDescriptor,
  type GLTFDracoDecoder,
  type GLTFDracoDecoderModule,
  type GLTFMeshoptDecodeDescriptor,
  type GLTFMeshoptDecoder,
  type GLTFMeshoptDecoderModule,
  type GLTFRenderResources
} from "@aura3d/assets";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";

declare global {
  interface Window {
    __a3dCurrentRoutesLoaderCompression?: CurrentRoutesLoaderCompressionRuntime;
  }
}

interface CurrentRoutesLoaderCompressionRuntime {
  readonly appId: "loader-compression";
  readonly status: "loading" | "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly meshCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly decoderStatus: "available" | "unavailable";
  readonly decoderDecodeCount: number;
  readonly meshoptDecodeCount: number;
  readonly dracoDecodeCount: number;
  readonly dracoDecoderKind: "pending" | "draco3d-browser-wasm";
  readonly compressedBytes: number;
  readonly decodedBytes: number;
  readonly decodeMs: number;
  readonly extensionsUsed: readonly string[];
  readonly unsupportedRequired: readonly string[];
  readonly elapsedMs: number;
  readonly renderer: "a3d-webgl2";
  readonly error?: string;
}

const APP_ID = "loader-compression" as const;
const WIDTH = 1280;
const HEIGHT = 720;
const COMPRESSED_POSITION_BYTES = new Uint8Array([
  160, 1, 12, 0, 0, 0, 40, 1, 12, 0, 0, 0, 161, 1, 12, 0, 0, 0, 111, 1, 60, 0, 0, 0,
  255, 125, 1, 12, 0, 0, 0, 246, 1, 12, 0, 0, 0, 40, 1, 12, 0, 0, 0, 92, 1, 12, 0, 0, 0,
  255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 236, 81, 56, 191, 0, 0, 0, 191, 0, 0, 0, 0
]);
const NORMAL_BYTES = new Uint8Array([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 63,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 63,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 63
]);
const INDEX_BYTES = new Uint8Array([0, 0, 1, 0, 2, 0]);
const DRACO_COMPRESSED_TRIANGLE_BYTES = new Uint8Array([
  68, 82, 65, 67, 79, 2, 2, 1, 1, 0, 0, 0, 3, 1, 1, 1, 0, 0, 1, 7, 255, 1, 17,
  1, 1, 0, 2, 255, 0, 0, 0, 0, 0, 1, 0, 9, 3, 0, 0, 2, 1, 1, 9, 3, 0, 1, 0,
  1, 1, 1, 0, 13, 3, 85, 21, 39, 173, 42, 3, 4, 112, 129, 233, 255, 0, 3, 128,
  255, 23, 48, 0, 0, 0, 0, 0, 0, 255, 15, 0, 0, 10, 215, 35, 191, 61, 10, 215,
  190, 0, 0, 0, 0, 10, 215, 163, 63, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128,
  63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  128, 63
]);

type DracoDecoderModuleFactory = (config?: {
  readonly locateFile?: (file: string, prefix: string) => string;
}) => Promise<GLTFDracoDecoderModule> | GLTFDracoDecoderModule;

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  drawFallback(canvas);

  const startedAt = performance.now();
  let runtime = createRuntime("loading", "Loading compressed glTF fixture", startedAt);
  let frameCount = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = 0;
  let lastNow = 0;
  let lastUi = 0;

  const publish = (): void => {
    window.__a3dCurrentRoutesLoaderCompression = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const decoder = await createMeasuredMeshoptDecoder();
    const dracoDecoder = await createMeasuredDracoDecoder();
    const asset = await new GLTFLoader({ meshoptDecoder: decoder.decode }).load({
      url: createMeshoptFixtureDataUrl()
    }, new LoadContext());
    const dracoAsset = await new GLTFLoader({ dracoDecoder: dracoDecoder.decode }).load({
      url: createDracoFixtureDataUrl()
    }, new LoadContext());
    const resources = await createGLTFRenderResources(asset);
    const dracoResources = await createGLTFRenderResources(dracoAsset);
    const renderer = await A3DRenderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      preserveDrawingBuffer: true,
      clearColor: [0.006, 0.008, 0.012, 1]
    });
    const extensionSupport = evaluateGLTFExtensionSupport(asset.loaderDiagnostics.extensionsUsed, asset.loaderDiagnostics.extensionsRequired);
    runtime = createRuntime("ready", "Ready", startedAt, {
      meshCount: asset.loaderDiagnostics.meshCount,
      vertexCount: asset.loaderDiagnostics.vertexCount,
      indexCount: asset.loaderDiagnostics.indexCount,
      decoderStatus: decoder.status(),
      decoderDecodeCount: decoder.snapshot().decodeCount + dracoDecoder.snapshot().decodeCount,
      meshoptDecodeCount: decoder.snapshot().decodeCount,
      dracoDecodeCount: dracoDecoder.snapshot().decodeCount,
      dracoDecoderKind: dracoDecoder.kind,
      compressedBytes: decoder.snapshot().compressedBytes + dracoDecoder.snapshot().compressedBytes,
      decodedBytes: decoder.snapshot().decodedBytes + dracoDecoder.snapshot().decodedBytes,
      decodeMs: Number((decoder.snapshot().decodeMs + dracoDecoder.snapshot().decodeMs).toFixed(3)),
      extensionsUsed: [...asset.loaderDiagnostics.extensionsUsed, ...dracoAsset.loaderDiagnostics.extensionsUsed],
      unsupportedRequired: [...extensionSupport.unsupportedRequired, ...evaluateGLTFExtensionSupport(dracoAsset.loaderDiagnostics.extensionsUsed, dracoAsset.loaderDiagnostics.extensionsRequired).unsupportedRequired]
    });
    publish();

    const render = (now: number): void => {
      try {
        if (lastNow === 0) lastNow = now;
        const delta = Math.max(0, (now - lastNow) / 1000);
        lastNow = now;
        frameCount += 1;
        fpsFrames += 1;
        if (fpsFrom === 0) fpsFrom = now;
        if (now - fpsFrom >= 500) {
          fps = fpsFrames * 1000 / (now - fpsFrom);
          fpsFrames = 0;
          fpsFrom = now;
        }
        const activeResources = Math.floor(now / 900) % 2 === 0 ? resources : dracoResources;
        const frame = createRendererInput(activeResources, now / 1000);
        const result = renderer.renderFrame(frame);
        const decoderSnapshot = decoder.snapshot();
        const dracoSnapshot = dracoDecoder.snapshot();
        runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, {
          frameCount,
          drawCalls: result.diagnostics.drawCalls,
          fps,
          meshCount: asset.loaderDiagnostics.meshCount,
          vertexCount: asset.loaderDiagnostics.vertexCount,
          indexCount: asset.loaderDiagnostics.indexCount,
          decoderStatus: decoder.status(),
          decoderDecodeCount: decoderSnapshot.decodeCount + dracoSnapshot.decodeCount,
          meshoptDecodeCount: decoderSnapshot.decodeCount,
          dracoDecodeCount: dracoSnapshot.decodeCount,
          dracoDecoderKind: dracoDecoder.kind,
          compressedBytes: decoderSnapshot.compressedBytes + dracoSnapshot.compressedBytes,
          decodedBytes: decoderSnapshot.decodedBytes + dracoSnapshot.decodedBytes,
          decodeMs: Number((decoderSnapshot.decodeMs + dracoSnapshot.decodeMs).toFixed(3)),
          extensionsUsed: [...asset.loaderDiagnostics.extensionsUsed, ...dracoAsset.loaderDiagnostics.extensionsUsed],
          unsupportedRequired: [...extensionSupport.unsupportedRequired, ...evaluateGLTFExtensionSupport(dracoAsset.loaderDiagnostics.extensionsUsed, dracoAsset.loaderDiagnostics.extensionsRequired).unsupportedRequired]
        });
        window.__a3dCurrentRoutesLoaderCompression = runtime;
        if (frameCount === 1 || now - lastUi > 220 || delta === 0) {
          publish();
          lastUi = now;
        }
        requestAnimationFrame(render);
      } catch (error) {
        runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
        publish();
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
    publish();
  }
}

function createRendererInput(resources: GLTFRenderResources, time: number): Parameters<A3DRenderer["renderFrame"]>[0] {
  const viewport = { width: WIDTH, height: HEIGHT };
  const input = resources.toRendererInput(viewport, {
    qualityPreset: "studio-preview",
    postprocess: false,
    frame: {
      yawRadians: -0.34 + Math.sin(time * 0.8) * 0.08,
      pitchRadians: -0.18,
      paddingRatio: 0.18,
      nearPadding: 0.2,
      farPadding: 2.2
    }
  });
  return {
    source: input.source,
    camera: input.camera,
    metadata: {
      assetId: APP_ID,
      assetName: "CurrentRoutes Loader Compression",
      assetUri: "/apps/loader-compression/",
      meshCount: 1,
      primitiveCount: 1,
      materialCount: 1,
      textureCount: 0,
      imageCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      extensionsUsed: ["EXT_meshopt_compression", "KHR_materials_unlit"]
    }
  };
}

function createRuntime(
  status: CurrentRoutesLoaderCompressionRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<CurrentRoutesLoaderCompressionRuntime, "appId" | "status" | "statusLabel" | "elapsedMs" | "renderer">> = {}
): CurrentRoutesLoaderCompressionRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    meshCount: patch.meshCount ?? 0,
    vertexCount: patch.vertexCount ?? 0,
    indexCount: patch.indexCount ?? 0,
    decoderStatus: patch.decoderStatus ?? "unavailable",
    decoderDecodeCount: patch.decoderDecodeCount ?? 0,
    meshoptDecodeCount: patch.meshoptDecodeCount ?? 0,
    dracoDecodeCount: patch.dracoDecodeCount ?? 0,
    dracoDecoderKind: patch.dracoDecoderKind ?? "pending",
    compressedBytes: patch.compressedBytes ?? 0,
    decodedBytes: patch.decodedBytes ?? 0,
    decodeMs: patch.decodeMs ?? 0,
    extensionsUsed: patch.extensionsUsed ?? [],
    unsupportedRequired: patch.unsupportedRequired ?? [],
    elapsedMs: Math.round(performance.now() - startedAt),
    renderer: "a3d-webgl2",
    ...(patch.error ? { error: patch.error } : {})
  };
}

async function createMeasuredDracoDecoder(): Promise<{
  readonly decode: GLTFDracoDecoder;
  readonly kind: "draco3d-browser-wasm";
  status(): "available" | "unavailable";
  snapshot(): { readonly decodeCount: number; readonly compressedBytes: number; readonly decodedBytes: number; readonly decodeMs: number };
}> {
  const module = await loadBrowserDracoDecoderModule();
  const base = createDracoDecoder(module);
  let decodeCount = 0;
  let compressedBytes = 0;
  let decodedBytes = 0;
  let decodeMs = 0;
  return {
    kind: "draco3d-browser-wasm",
    async decode(source: Uint8Array, descriptor: GLTFDracoDecodeDescriptor) {
      const startedAt = performance.now();
      const decoded = await base(source, descriptor);
      decodeCount += 1;
      compressedBytes += source.byteLength;
      decodedBytes += estimateDecodedDracoBytes(decoded);
      decodeMs = Number((decodeMs + performance.now() - startedAt).toFixed(3));
      return decoded;
    },
    status: () => "available",
    snapshot: () => ({ decodeCount, compressedBytes, decodedBytes, decodeMs })
  };
}

async function loadBrowserDracoDecoderModule(): Promise<GLTFDracoDecoderModule> {
  const decoderScriptUrl = new URL("/node_modules/draco3d/draco_decoder_nodejs.js", window.location.origin).href;
  const decoderWasmUrl = new URL("/node_modules/draco3d/draco_decoder.wasm", window.location.origin).href;
  const response = await fetch(decoderScriptUrl);
  if (!response.ok) {
    throw new Error(`Failed to load draco3d browser decoder: HTTP ${response.status}`);
  }
  const source = await response.text();
  const sourceMapIndex = source.indexOf("//# sourceMappingURL=");
  const moduleSource = sourceMapIndex >= 0 ? source.slice(0, sourceMapIndex) : source;
  const factory = new Function(`${moduleSource}\nreturn typeof DracoDecoderModule === "function" ? DracoDecoderModule : undefined;`)() as unknown;
  if (typeof factory !== "function") {
    throw new Error("draco3d browser decoder script did not expose DracoDecoderModule.");
  }
  return await (factory as DracoDecoderModuleFactory)({
    locateFile: (file) => file === "draco_decoder.wasm" ? decoderWasmUrl : new URL(file, decoderScriptUrl).href
  });
}

function estimateDecodedDracoBytes(decoded: Awaited<ReturnType<GLTFDracoDecoder>>): number {
  const attributeBytes = Object.values(decoded.attributes)
    .reduce((sum, rows) => sum + rows.reduce((rowSum, row) => rowSum + row.length * Float32Array.BYTES_PER_ELEMENT, 0), 0);
  return attributeBytes + ((decoded.indices?.length ?? 0) * Uint32Array.BYTES_PER_ELEMENT);
}

async function createMeasuredMeshoptDecoder(): Promise<{
  readonly decode: GLTFMeshoptDecoder;
  status(): "available" | "unavailable";
  snapshot(): { readonly decodeCount: number; readonly compressedBytes: number; readonly decodedBytes: number; readonly decodeMs: number };
}> {
  const module = await loadMeshoptDecoderModule();
  const base = createMeshoptDecoder(module);
  let decodeCount = 0;
  let compressedBytes = 0;
  let decodedBytes = 0;
  let decodeMs = 0;
  return {
    async decode(source: Uint8Array, descriptor: GLTFMeshoptDecodeDescriptor) {
      const startedAt = performance.now();
      const decoded = await base(source, descriptor);
      decodeCount += 1;
      compressedBytes += source.byteLength;
      decodedBytes += decoded.byteLength;
      decodeMs = Number((decodeMs + performance.now() - startedAt).toFixed(3));
      return decoded;
    },
    status: () => "available",
    snapshot: () => ({ decodeCount, compressedBytes, decodedBytes, decodeMs })
  };
}

async function loadMeshoptDecoderModule(): Promise<GLTFMeshoptDecoderModule> {
  const decoderUrl = new URL("/node_modules/meshoptimizer/meshopt_decoder.mjs", window.location.origin).href;
  const response = await fetch(decoderUrl);
  if (!response.ok) {
    throw new Error(`Failed to load meshoptimizer browser decoder: HTTP ${response.status}`);
  }
  const objectUrl = URL.createObjectURL(new Blob([await response.text()], { type: "application/javascript" }));
  try {
    const module = await import(/* @vite-ignore */ objectUrl) as { readonly MeshoptDecoder?: GLTFMeshoptDecoderModule };
    if (!module.MeshoptDecoder || typeof module.MeshoptDecoder.decodeGltfBuffer !== "function") {
      throw new Error("meshoptimizer browser module did not expose MeshoptDecoder.decodeGltfBuffer.");
    }
    return module.MeshoptDecoder;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function createMeshoptFixtureDataUrl(): string {
  const buffer = concatBytes([COMPRESSED_POSITION_BYTES, NORMAL_BYTES, INDEX_BYTES], [0, 88, 124], 130);
  const gltf = {
    asset: { version: "2.0", generator: "Aura3D ThreejsParity CurrentRoutes loader compression fixture" },
    extensionsUsed: ["EXT_meshopt_compression", "KHR_materials_unlit"],
    extensionsRequired: ["EXT_meshopt_compression"],
    buffers: [{ uri: `data:application/octet-stream;base64,${base64(buffer)}`, byteLength: buffer.byteLength }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: 36,
        byteStride: 12,
        extensions: {
          EXT_meshopt_compression: {
            buffer: 0,
            byteOffset: 0,
            byteLength: COMPRESSED_POSITION_BYTES.byteLength,
            byteStride: 12,
            count: 3,
            mode: "ATTRIBUTES",
            filter: "NONE"
          }
        }
      },
      { buffer: 0, byteOffset: 88, byteLength: NORMAL_BYTES.byteLength },
      { buffer: 0, byteOffset: 124, byteLength: INDEX_BYTES.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.72, -0.5, 0], max: [0.72, 0.68, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    materials: [{
      name: "loader-compression-material",
      pbrMetallicRoughness: { baseColorFactor: [0.96, 0.48, 0.16, 1], roughnessFactor: 0.48, metallicFactor: 0.08 },
      extensions: { KHR_materials_unlit: {} }
    }],
    meshes: [{
      name: "loader-compression-triangle",
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }]
    }],
    nodes: [{ name: "loader-compression-node", mesh: 0 }],
    scenes: [{ name: "loader-compression-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json;base64,${base64(new TextEncoder().encode(JSON.stringify(gltf)))}`;
}

function createDracoFixtureDataUrl(): string {
  const compressed = DRACO_COMPRESSED_TRIANGLE_BYTES;
  const gltf = {
    asset: { version: "2.0", generator: "Aura3D ThreejsParity CurrentRoutes loader Draco compression fixture" },
    extensionsUsed: ["KHR_draco_mesh_compression", "KHR_materials_unlit"],
    extensionsRequired: ["KHR_draco_mesh_compression"],
    buffers: [{ uri: `data:application/octet-stream;base64,${base64(compressed)}`, byteLength: compressed.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: compressed.byteLength }],
    accessors: [
      { componentType: 5126, count: 3, type: "VEC3", min: [-0.64, -0.42, 0], max: [0.64, 0.62, 0] },
      { componentType: 5126, count: 3, type: "VEC3" }
    ],
    materials: [{
      name: "loader-compression-draco-material",
      pbrMetallicRoughness: { baseColorFactor: [0.08, 0.52, 0.92, 1], roughnessFactor: 0.5, metallicFactor: 0.04 },
      extensions: { KHR_materials_unlit: {} }
    }],
    meshes: [{
      name: "loader-compression-draco-triangle",
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        material: 0,
        extensions: {
          KHR_draco_mesh_compression: {
            bufferView: 0,
            attributes: { POSITION: 0, NORMAL: 1 }
          }
        }
      }]
    }],
    nodes: [{ name: "loader-compression-draco-node", mesh: 0 }],
    scenes: [{ name: "loader-compression-draco-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json;base64,${base64(new TextEncoder().encode(JSON.stringify(gltf)))}`;
}

function concatBytes(parts: readonly Uint8Array[], offsets: readonly number[], byteLength: number): Uint8Array {
  const buffer = new Uint8Array(byteLength);
  parts.forEach((part, index) => buffer.set(part, offsets[index] ?? 0));
  return buffer;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function renderUi(root: HTMLElement, runtime: CurrentRoutesLoaderCompressionRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>CurrentRoutes Loader Compression</h1>
        <p>EXT_meshopt_compression and KHR_draco_mesh_compression decoded through public A3D loader hooks.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.statusLabel)}</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Meshes", runtime.meshCount)}
      ${metric("Vertices", runtime.vertexCount)}
      ${metric("Indices", runtime.indexCount)}
      ${metric("Decoder", runtime.decoderStatus)}
      ${metric("Decodes", runtime.decoderDecodeCount)}
      ${metric("Meshopt", runtime.meshoptDecodeCount)}
      ${metric("Draco", runtime.dracoDecodeCount)}
      ${metric("Draco decoder", runtime.dracoDecoderKind)}
      ${metric("Compressed", `${runtime.compressedBytes} bytes`)}
      ${metric("Decoded", `${runtime.decodedBytes} bytes`)}
      ${metric("Decode ms", runtime.decodeMs.toFixed(3))}
      ${metric("Extensions", runtime.extensionsUsed.join(", ") || "pending")}
    </section>
    ${runtime.error ? `<pre>${escapeHtml(runtime.error)}</pre>` : ""}
  `;
}

function metric(label: string, value: string | number): string {
  return `<span>${escapeHtml(label)}<br><strong>${escapeHtml(String(value))}</strong></span>`;
}

function drawFallback(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.006, 0.008, 0.012, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
