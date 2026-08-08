import {
  GLTFLoader,
  LoadContext,
  createGLTFRenderResources,
  type GLTFAsset,
  type GLTFRenderResources
} from "@aura3d/assets";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";

declare global {
  interface Window {
    __a3dCurrentRoutesLoaderGLTFVariants?: CurrentRoutesLoaderGLTFVariantsRuntime;
  }
}

interface CurrentRoutesLoaderGLTFVariantsRuntime {
  readonly appId: "loader-gltf-variants";
  readonly status: "loading" | "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly variantCount: number;
  readonly materialVariantNames: readonly string[];
  readonly activeVariant: string;
  readonly selectedMaterialName: string;
  readonly sceneSelectedMaterials: readonly string[];
  readonly extensionsUsed: readonly string[];
  readonly unsupportedRequired: readonly string[];
  readonly elapsedMs: number;
  readonly renderer: "a3d-webgl2";
  readonly error?: string;
}

const APP_ID = "loader-gltf-variants" as const;
const WIDTH = 1280;
const HEIGHT = 720;
const VARIANT_COLORS: Record<string, string> = {
  base: "#d6d1c2",
  copper: "#d1844c",
  arctic: "#7ec8ff"
};

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const startedAt = performance.now();
  let runtime = createRuntime("loading", "Loading KHR_materials_variants fixture", startedAt);
  let frameCount = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = 0;
  let lastNow = 0;
  let lastUi = 0;

  const publish = (): void => {
    window.__a3dCurrentRoutesLoaderGLTFVariants = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const asset = await new GLTFLoader().load({ url: createVariantFixtureDataUrl() }, new LoadContext());
    const resourcesByVariant = await createVariantResources(asset);
    const renderer = await A3DRenderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      preserveDrawingBuffer: true,
      clearColor: [0.012, 0.014, 0.018, 1]
    });
    const variants = ["base", ...asset.materialVariants.map((variant) => variant.name)];
    const selectedMaterials = variants.map((variant) => inspectSelectedMaterial(asset, variant));
    runtime = createRuntime("ready", "Ready", startedAt, {
      meshCount: asset.loaderDiagnostics.meshCount,
      materialCount: asset.loaderDiagnostics.materialCount,
      variantCount: asset.materialVariants.length,
      materialVariantNames: asset.materialVariants.map((variant) => variant.name),
      activeVariant: "base",
      selectedMaterialName: selectedMaterials[0] ?? "base-material",
      sceneSelectedMaterials: selectedMaterials,
      extensionsUsed: asset.loaderDiagnostics.extensionsUsed,
      unsupportedRequired: []
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
        const activeVariant = variants[Math.floor(now / 900) % variants.length] ?? "base";
        const resources = resourcesByVariant.get(activeVariant) ?? resourcesByVariant.get("base");
        if (!resources) throw new Error("Variant resources were not created.");
        const result = renderer.renderFrame(createRendererInput(resources, activeVariant, now / 1000));
        runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, {
          frameCount,
          drawCalls: result.diagnostics.drawCalls,
          fps,
          meshCount: asset.loaderDiagnostics.meshCount,
          materialCount: asset.loaderDiagnostics.materialCount,
          variantCount: asset.materialVariants.length,
          materialVariantNames: asset.materialVariants.map((variant) => variant.name),
          activeVariant,
          selectedMaterialName: inspectSelectedMaterial(asset, activeVariant),
          sceneSelectedMaterials: selectedMaterials,
          extensionsUsed: asset.loaderDiagnostics.extensionsUsed,
          unsupportedRequired: []
        });
        window.__a3dCurrentRoutesLoaderGLTFVariants = runtime;
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

async function createVariantResources(asset: GLTFAsset): Promise<Map<string, GLTFRenderResources>> {
  const entries: Array<[string, GLTFRenderResources]> = [["base", await createGLTFRenderResources(asset)]];
  for (const variant of asset.materialVariants) {
    entries.push([variant.name, await createGLTFRenderResources(asset, { materialVariant: variant.name })]);
  }
  return new Map(entries);
}

function inspectSelectedMaterial(asset: GLTFAsset, variant: string): string {
  const scene = variant === "base" ? asset.createScene() : asset.createScene({ materialVariant: variant });
  return scene.collectRenderables()[0]?.renderable.material ?? "unknown";
}

function createRendererInput(resources: GLTFRenderResources, activeVariant: string, time: number): Parameters<A3DRenderer["renderFrame"]>[0] {
  const input = resources.toRendererInput({ width: WIDTH, height: HEIGHT }, {
    qualityPreset: "studio-preview",
    postprocess: {
      targetFormat: "rgba8",
      toneMapping: { exposure: 1, operator: "filmic", inputColorSpace: "linear", outputColorSpace: "srgb" },
      fxaa: true
    },
    frame: {
      yawRadians: -0.4 + Math.sin(time * 0.5) * 0.05,
      pitchRadians: -0.14,
      paddingRatio: 0.2,
      nearPadding: 0.2,
      farPadding: 2.2
    }
  });
  return {
    source: input.source,
    camera: input.camera,
    metadata: {
      assetId: APP_ID,
      assetName: `CurrentRoutes Loader GLTF Variants ${activeVariant}`,
      assetUri: "/apps/loader-gltf-variants/",
      meshCount: 1,
      primitiveCount: 1,
      materialCount: 3,
      textureCount: 0,
      imageCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      extensionsUsed: ["KHR_materials_variants"]
    }
  };
}

function createRuntime(
  status: CurrentRoutesLoaderGLTFVariantsRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<CurrentRoutesLoaderGLTFVariantsRuntime, "appId" | "status" | "statusLabel" | "elapsedMs" | "renderer">> = {}
): CurrentRoutesLoaderGLTFVariantsRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    meshCount: patch.meshCount ?? 0,
    materialCount: patch.materialCount ?? 0,
    variantCount: patch.variantCount ?? 0,
    materialVariantNames: patch.materialVariantNames ?? [],
    activeVariant: patch.activeVariant ?? "base",
    selectedMaterialName: patch.selectedMaterialName ?? "none",
    sceneSelectedMaterials: patch.sceneSelectedMaterials ?? [],
    extensionsUsed: patch.extensionsUsed ?? [],
    unsupportedRequired: patch.unsupportedRequired ?? [],
    elapsedMs: Math.round(performance.now() - startedAt),
    renderer: "a3d-webgl2",
    ...(patch.error ? { error: patch.error } : {})
  };
}

function createVariantFixtureDataUrl(): string {
  const positions = new Float32Array([
    -1.1, -0.55, 0,
    1.1, -0.55, 0,
    1.1, 0.55, 0,
    -1.1, 0.55, 0
  ]);
  const normals = new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const buffer = new BinaryBufferBuilder();
  const positionView = buffer.appendFloat32(positions);
  const normalView = buffer.appendFloat32(normals);
  const indexView = buffer.appendUint16(indices);
  const bytes = buffer.bytes();
  const gltf = {
    asset: { version: "2.0", generator: "Aura3D CurrentRoutes variants fixture" },
    extensionsUsed: ["KHR_materials_variants"],
    extensionsRequired: ["KHR_materials_variants"],
    extensions: {
      KHR_materials_variants: {
        variants: [{ name: "copper" }, { name: "arctic" }]
      }
    },
    buffers: [{ uri: `data:application/octet-stream;base64,${bytesToBase64(bytes)}`, byteLength: bytes.byteLength }],
    bufferViews: buffer.views,
    accessors: [
      { bufferView: positionView, componentType: 5126, count: 4, type: "VEC3", min: [-1.1, -0.55, 0], max: [1.1, 0.55, 0] },
      { bufferView: normalView, componentType: 5126, count: 4, type: "VEC3" },
      { bufferView: indexView, componentType: 5123, count: 6, type: "SCALAR" }
    ],
    materials: [
      material("base-material", [0.74, 0.71, 0.64, 1], 0, 0.58),
      material("copper-material", [0.96, 0.44, 0.16, 1], 0.2, 0.38),
      material("arctic-material", [0.22, 0.72, 1, 1], 0, 0.22)
    ],
    meshes: [{
      name: "variant-panel",
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0,
        extensions: {
          KHR_materials_variants: {
            mappings: [
              { material: 1, variants: [0] },
              { material: 2, variants: [1] }
            ]
          }
        }
      }]
    }],
    nodes: [{ name: "variant-panel-node", mesh: 0 }],
    scenes: [{ name: "variant-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function material(name: string, color: readonly [number, number, number, number], metallic: number, roughness: number): unknown {
  return {
    name,
    pbrMetallicRoughness: {
      baseColorFactor: color,
      metallicFactor: metallic,
      roughnessFactor: roughness
    }
  };
}

class BinaryBufferBuilder {
  readonly views: Array<{ readonly buffer: 0; readonly byteOffset: number; readonly byteLength: number }> = [];
  private readonly chunks: Uint8Array[] = [];
  private byteLength = 0;

  appendFloat32(values: Float32Array): number {
    return this.appendBytes(new Uint8Array(values.buffer));
  }

  appendUint16(values: Uint16Array): number {
    return this.appendBytes(new Uint8Array(values.buffer));
  }

  bytes(): Uint8Array {
    const output = new Uint8Array(this.byteLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }

  private appendBytes(bytes: Uint8Array): number {
    this.align(4);
    const offset = this.byteLength;
    this.chunks.push(bytes);
    this.byteLength += bytes.byteLength;
    const view = this.views.length;
    this.views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
    return view;
  }

  private align(alignment: number): void {
    const padding = (alignment - (this.byteLength % alignment)) % alignment;
    if (padding === 0) return;
    this.chunks.push(new Uint8Array(padding));
    this.byteLength += padding;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function renderUi(root: HTMLElement, runtime: CurrentRoutesLoaderGLTFVariantsRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h1>CurrentRoutes Loader GLTF Variants</h1>
          <p>KHR_materials_variants selected through public GLTF render resources.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}">${runtime.statusLabel}</span>
      </div>
      <div class="metrics">
        ${metric("frames", runtime.frameCount)}
        ${metric("draw calls", runtime.drawCalls)}
        ${metric("fps", runtime.fps.toFixed(1))}
        ${metric("variants", runtime.variantCount)}
        ${metric("materials", runtime.materialCount)}
        ${metric("active", runtime.activeVariant)}
        ${metric("selected material", runtime.selectedMaterialName)}
        ${metric("renderer", runtime.renderer)}
      </div>
      <div class="swatches">
        ${["base", ...runtime.materialVariantNames].map((variant) => `<span class="swatch" data-active="${variant === runtime.activeVariant}" title="${escapeHtml(variant)}" style="background:${VARIANT_COLORS[variant] ?? "#999"}"></span>`).join("")}
      </div>
      <p class="note">${runtime.error ? escapeHtml(runtime.error) : `Scene material selections: ${runtime.sceneSelectedMaterials.map(escapeHtml).join(", ")}`}</p>
    </section>
  `;
}

function metric(label: string, value: string | number): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void run();
