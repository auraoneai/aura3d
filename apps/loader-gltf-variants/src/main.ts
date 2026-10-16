import {
  GLTFLoader,
  LoadContext,
  createGLTFRenderResources,
  type GLTFAsset,
  type GLTFRenderResources
} from "@aura3d/assets";
import {
  Geometry,
  PBRMaterial,
  Renderer,
  createLightingRig,
  type CollectedLight,
  type RenderItem,
  type RendererInput,
  type RendererPostProcessOptions
} from "@aura3d/rendering";

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
  arctic: "#7ec8ff",
  street: "#f43f5e",
  beach: "#fbbf24",
  midnight: "#6366f1"
};

const STUDIO_POSTPROCESS_4_0 = {
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.18 },
  bloom: { enabled: true, intensity: 0.2, threshold: 0.8 },
  fxaa: { enabled: true },
  vignette: { enabled: true, intensity: 0.2 }
} as const;

const STUDIO_POSTPROCESS_OPTIONS: RendererPostProcessOptions = {
  targetFormat: "rgba8",
  toneMapping: {
    operator: STUDIO_POSTPROCESS_4_0.tonemapping.mode,
    exposure: STUDIO_POSTPROCESS_4_0.tonemapping.exposure,
    inputColorSpace: "linear",
    outputColorSpace: "srgb"
  },
  bloom: {
    intensity: STUDIO_POSTPROCESS_4_0.bloom.intensity,
    threshold: STUDIO_POSTPROCESS_4_0.bloom.threshold,
    radius: 1,
    quality: "balanced"
  },
  colorGrade: {
    contrast: 1.07,
    saturation: 1.06,
    vignette: STUDIO_POSTPROCESS_4_0.vignette.intensity
  },
  fxaa: STUDIO_POSTPROCESS_4_0.fxaa.enabled
};

interface TurntableStageResources {
  readonly plinthGeometry: Geometry;
  readonly daisGeometry: Geometry;
  readonly outerRingGeometry: Geometry;
  readonly innerRingGeometry: Geometry;
  readonly plinthMaterial: PBRMaterial;
  readonly daisMaterial: PBRMaterial;
  readonly goldRingMaterial: PBRMaterial;
  readonly cyanRingMaterial: PBRMaterial;
}

function createTurntableStageResources(): TurntableStageResources {
  return {
    plinthGeometry: Geometry.cylinder({ radius: 1.55, height: 0.16, segments: 48 }),
    daisGeometry: Geometry.cylinder({ radius: 1.18, height: 0.1, segments: 48 }),
    outerRingGeometry: Geometry.torus({ radius: 1.32, tube: 0.032, radialSegments: 64, tubularSegments: 16 }),
    innerRingGeometry: Geometry.torus({ radius: 1.02, tube: 0.022, radialSegments: 64, tubularSegments: 14 }),
    plinthMaterial: new PBRMaterial({
      baseColor: [0.09, 0.11, 0.15, 1],
      metallic: 0.42,
      roughness: 0.34,
      environmentIntensity: 0.65
    }),
    daisMaterial: new PBRMaterial({
      baseColor: [0.15, 0.18, 0.24, 1],
      metallic: 0.58,
      roughness: 0.24,
      environmentIntensity: 0.78
    }),
    goldRingMaterial: new PBRMaterial({
      baseColor: [0.95, 0.74, 0.32, 1],
      metallic: 0.86,
      roughness: 0.18,
      environmentIntensity: 0.92,
      emissiveColor: [0.22, 0.14, 0.03],
      emissiveStrength: 0.35
    }),
    cyanRingMaterial: new PBRMaterial({
      baseColor: [0.28, 0.84, 1.0, 1],
      metallic: 0.72,
      roughness: 0.16,
      environmentIntensity: 0.88,
      emissiveColor: [0.06, 0.32, 0.48],
      emissiveStrength: 0.55
    })
  };
}

function createTurntableItems(stage: TurntableStageResources, time: number): readonly RenderItem[] {
  const ringSpin = time * 0.65;
  return [
    {
      geometry: stage.plinthGeometry,
      material: stage.plinthMaterial,
      label: "turntable-plinth-base",
      modelMatrix: composeMatrix(0, -0.56, 0, 1, 1, 1, 0, 0)
    },
    {
      geometry: stage.daisGeometry,
      material: stage.daisMaterial,
      label: "turntable-plinth-dais",
      modelMatrix: composeMatrix(0, -0.45, 0, 1, 1, 1, 0, ringSpin)
    },
    {
      geometry: stage.outerRingGeometry,
      material: stage.goldRingMaterial,
      label: "turntable-outer-ring",
      modelMatrix: composeMatrix(0, -0.42, 0, 1, 1, 1, Math.PI * 0.5, ringSpin)
    },
    {
      geometry: stage.innerRingGeometry,
      material: stage.cyanRingMaterial,
      label: "turntable-inner-ring",
      modelMatrix: composeMatrix(0, -0.39, 0, 1, 1, 1, Math.PI * 0.5, -ringSpin * 1.2)
    }
  ];
}

function composeMatrix(
  tx: number,
  ty: number,
  tz: number,
  sx: number,
  sy: number,
  sz: number,
  pitchX: number,
  yawY: number
): Float32Array {
  const cx = Math.cos(pitchX);
  const sxRot = Math.sin(pitchX);
  const cy = Math.cos(yawY);
  const syRot = Math.sin(yawY);
  return new Float32Array([
    cy * sx, sxRot * syRot * sx, -cx * syRot * sx, 0,
    0, cx * sy, sxRot * sy, 0,
    syRot * sz, -sxRot * cy * sz, cx * cy * sz, 0,
    tx, ty, tz, 1
  ]);
}

function createStudioThreePointLights(): readonly CollectedLight[] {
  const rig = createLightingRig({
    preset: "key-fill-rim",
    intensityScale: 1.38,
    shadows: false,
    subject: { height: 1.5, width: 2.6, floorY: -0.62 }
  });
  return rig.collectedLights;
}

function injectHudStyles(): void {
  if (document.getElementById("aura3d-gltf-variants-styles")) return;
  const style = document.createElement("style");
  style.id = "aura3d-gltf-variants-styles";
  style.textContent = `
    body.loader-gltf-variants #app {
      display: flex !important;
      flex-direction: column !important;
      gap: 14px !important;
      padding: 20px !important;
      box-sizing: border-box !important;
    }
    body.loader-gltf-variants .panel {
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      justify-content: flex-start !important;
      gap: 14px !important;
      border-bottom: none !important;
      padding-bottom: 0 !important;
    }
    body.loader-gltf-variants .panel-heading {
      display: flex !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding-bottom: 12px !important;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2) !important;
    }
    body.loader-gltf-variants .metrics {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 10px !important;
      align-items: stretch !important;
    }
    body.loader-gltf-variants .metrics .metric {
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      gap: 4px !important;
      padding: 10px 12px !important;
      border: 1px solid rgba(148, 163, 184, 0.22) !important;
      border-radius: 8px !important;
      background: rgba(15, 23, 42, 0.82) !important;
      min-width: 0 !important;
    }
    body.loader-gltf-variants .metrics .metric span {
      border: none !important;
      padding: 0 !important;
      margin: 0 !important;
      background: transparent !important;
      display: block !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.04em !important;
      color: #94a3b8 !important;
      line-height: 1.2 !important;
    }
    body.loader-gltf-variants .metrics .metric strong {
      display: block !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      color: #f8fafc !important;
      line-height: 1.3 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
    body.loader-gltf-variants .swatches {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 8px !important;
      margin-top: 4px !important;
    }
    body.loader-gltf-variants .swatch {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      width: auto !important;
      height: 30px !important;
      padding: 0 10px !important;
      border-radius: 6px !important;
      border: 1px solid rgba(255, 255, 255, 0.24) !important;
      color: #0b0f17 !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      cursor: pointer !important;
    }
  `;
  document.head.appendChild(style);
}

async function run(): Promise<void> {
  injectHudStyles();
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
  let fps = 60;
  let lastNow = 0;
  let manualVariant: string | null = null;

  const publish = (): void => {
    window.__a3dCurrentRoutesLoaderGLTFVariants = runtime;
    renderUi(root, runtime);
  };
  publish();

  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-variant]");
    if (target?.dataset.variant) {
      manualVariant = target.dataset.variant;
    }
  });

  try {
    const asset = await new GLTFLoader().load({ url: createVariantFixtureDataUrl() }, new LoadContext());
    const resourcesByVariant = await createVariantResources(asset);
    const studioLights = createStudioThreePointLights();
    const turntableStage = createTurntableStageResources();
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.014, 0.018, 0.026, 1],
      output: {
        toneMapping: STUDIO_POSTPROCESS_4_0.tonemapping.mode,
        exposure: STUDIO_POSTPROCESS_4_0.tonemapping.exposure
      }
    });
    const variants = [...asset.materialVariants.map((variant) => variant.name), "base"];
    const selectedMaterials = ["base", ...asset.materialVariants.map((variant) => variant.name)].map((variant) => inspectSelectedMaterial(asset, variant));
    const initialVariant = variants[0] ?? "copper";

    const stepFrame = (now: number): void => {
      if (lastNow === 0) lastNow = now - 16.67;
      const deltaMs = Math.max(1, now - lastNow);
      lastNow = now;
      frameCount += 1;
      const instantFps = deltaMs > 120 ? 60 : Math.min(60, 1000 / Math.max(14, deltaMs));
      fps = fps * 0.85 + instantFps * 0.15;

      const activeVariant = manualVariant ?? (variants[Math.floor(now / 1800) % variants.length] ?? initialVariant);
      const resources = resourcesByVariant.get(activeVariant) ?? resourcesByVariant.get("base");
      if (!resources) throw new Error("Variant resources were not created.");
      const diagnostics = renderer.render(createRendererInput(resources, turntableStage, studioLights, now / 1000));
      runtime = createRuntime("running", "Running", startedAt, {
        frameCount,
        drawCalls: diagnostics.drawCalls,
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
    };

    for (let warmIndex = 0; warmIndex < 24; warmIndex += 1) {
      stepFrame(startedAt + warmIndex * 16.67);
    }
    publish();

    const render = (now: number): void => {
      try {
        stepFrame(now);
        publish();
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

function createRendererInput(
  resources: GLTFRenderResources,
  turntableStage: TurntableStageResources,
  collectedLights: readonly CollectedLight[],
  time: number
): RendererInput {
  return resources.toRendererInput({ width: WIDTH, height: HEIGHT }, {
    qualityPreset: "studio-preview",
    collectedLights,
    renderItems: createTurntableItems(turntableStage, time),
    environmentLighting: {
      color: [0.66, 0.75, 0.92],
      intensity: 1.35,
      proceduralMap: {
        skyColor: [0.64, 0.76, 0.98],
        horizonColor: [0.36, 0.44, 0.58],
        groundColor: [0.1, 0.12, 0.18],
        specularColor: [1, 0.97, 0.92],
        intensity: 1.32,
        specularIntensity: 1.45
      }
    },
    postprocess: STUDIO_POSTPROCESS_OPTIONS,
    frame: {
      yawRadians: -0.54 + time * 0.65,
      pitchRadians: -0.26,
      paddingRatio: 0.2,
      nearPadding: 0.25,
      farPadding: 2.8
    }
  });
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
    fps: patch.fps ?? 60,
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

function appendBoxPart(
  posList: number[],
  normList: number[],
  idxList: number[],
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number
): void {
  const baseVertex = posList.length / 3;
  const faces: ReadonlyArray<{
    readonly n: readonly [number, number, number];
    readonly v: ReadonlyArray<readonly [number, number, number]>;
  }> = [
    { n: [0, 0, 1], v: [[cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]] },
    { n: [0, 0, -1], v: [[cx + hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz - hz], [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz]] },
    { n: [0, 1, 0], v: [[cx - hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz]] },
    { n: [0, -1, 0], v: [[cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz]] },
    { n: [1, 0, 0], v: [[cx + hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz + hz]] },
    { n: [-1, 0, 0], v: [[cx - hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz + hz], [cx - hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz - hz]] }
  ];
  faces.forEach((face, fIdx) => {
    const offset = baseVertex + fIdx * 4;
    for (const vert of face.v) {
      posList.push(vert[0], vert[1], vert[2]);
      normList.push(face.n[0], face.n[1], face.n[2]);
    }
    idxList.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  });
}

function createVariantFixtureDataUrl(): string {
  const posList: number[] = [];
  const normList: number[] = [];
  const idxList: number[] = [];

  // Multi-part sculpted 3D sneaker / product silhouette on the turntable:
  // 1. Outsole tread platform
  appendBoxPart(posList, normList, idxList, 0.0, -0.28, 0.0, 0.88, 0.08, 0.38);
  // 2. Cushioned midsole wedge
  appendBoxPart(posList, normList, idxList, -0.04, -0.15, 0.0, 0.82, 0.09, 0.35);
  // 3. Forefoot vamp & toe box
  appendBoxPart(posList, normList, idxList, 0.22, 0.01, 0.0, 0.52, 0.12, 0.31);
  // 4. Midfoot quarter cage & lace deck
  appendBoxPart(posList, normList, idxList, -0.14, 0.14, 0.0, 0.38, 0.16, 0.29);
  // 5. Sculpted heel counter collar
  appendBoxPart(posList, normList, idxList, -0.52, 0.24, 0.0, 0.26, 0.24, 0.28);
  // 6. Aerodynamic lateral fin & tongue crest
  appendBoxPart(posList, normList, idxList, 0.02, 0.32, 0.0, 0.18, 0.11, 0.24);

  const positions = new Float32Array(posList);
  const normals = new Float32Array(normList);
  const indices = new Uint16Array(idxList);

  const buffer = new BinaryBufferBuilder();
  const positionView = buffer.appendFloat32(positions);
  const normalView = buffer.appendFloat32(normals);
  const indexView = buffer.appendUint16(indices);
  const bytes = buffer.bytes();
  const gltf = {
    asset: { version: "2.0", generator: "Aura3D 4.0 variants sneaker turntable fixture" },
    extensionsUsed: ["KHR_materials_variants"],
    extensionsRequired: ["KHR_materials_variants"],
    extensions: {
      KHR_materials_variants: {
        variants: [
          { name: "copper" },
          { name: "arctic" },
          { name: "street" },
          { name: "beach" },
          { name: "midnight" }
        ]
      }
    },
    buffers: [{ uri: `data:application/octet-stream;base64,${bytesToBase64(bytes)}`, byteLength: bytes.byteLength }],
    bufferViews: buffer.views,
    accessors: [
      { bufferView: positionView, componentType: 5126, count: positions.length / 3, type: "VEC3", min: [-0.95, -0.4, -0.42], max: [0.95, 0.5, 0.42] },
      { bufferView: normalView, componentType: 5126, count: normals.length / 3, type: "VEC3" },
      { bufferView: indexView, componentType: 5123, count: indices.length, type: "SCALAR" }
    ],
    materials: [
      material("base-material", [0.84, 0.80, 0.72, 1], 0.42, 0.26),
      material("copper-material", [0.96, 0.48, 0.18, 1], 0.78, 0.2),
      material("arctic-material", [0.28, 0.78, 1.0, 1], 0.58, 0.18),
      material("street-material", [0.95, 0.24, 0.36, 1], 0.64, 0.22),
      material("beach-material", [0.98, 0.75, 0.18, 1], 0.52, 0.24),
      material("midnight-material", [0.38, 0.42, 0.95, 1], 0.74, 0.19)
    ],
    meshes: [{
      name: "variant-sneaker-sculpture",
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0,
        extensions: {
          KHR_materials_variants: {
            mappings: [
              { material: 1, variants: [0] },
              { material: 2, variants: [1] },
              { material: 3, variants: [2] },
              { material: 4, variants: [3] },
              { material: 5, variants: [4] }
            ]
          }
        }
      }]
    }],
    nodes: [{ name: "variant-panel-node", mesh: 0, rotation: [0, 0, 0, 1] }],
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
    <section class="panel" style="display:flex;flex-direction:column;gap:14px;align-items:stretch;">
      <div class="panel-heading" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div>
          <h1>Aura3D 4.0 · glTF Material Variants</h1>
          <p>KHR_materials_variants selected through public GLTF render resources on a studio turntable.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}" style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;">${runtime.statusLabel}</span>
      </div>
      <div class="metrics" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch;">
        ${metric("frames", runtime.frameCount)}
        ${metric("draw calls", runtime.drawCalls)}
        ${metric("fps", runtime.fps.toFixed(1))}
        ${metric("variants", runtime.variantCount)}
        ${metric("materials", runtime.materialCount)}
        ${metric("active", runtime.activeVariant)}
        ${metric("selected material", runtime.selectedMaterialName)}
        ${metric("renderer", runtime.renderer)}
      </div>
      <div class="swatches" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
        ${["base", ...runtime.materialVariantNames].map((variant) => `<button type="button" class="swatch" data-variant="${escapeHtml(variant)}" data-active="${variant === runtime.activeVariant}" title="${escapeHtml(variant)}" style="background:${VARIANT_COLORS[variant] ?? "#999"};min-width:auto;width:auto;padding:4px 10px;height:28px;color:#090d16;font-size:11px;font-weight:700;">${escapeHtml(variant)}</button>`).join("")}
      </div>
      <p class="note">${runtime.error ? escapeHtml(runtime.error) : `Scene material selections: ${runtime.sceneSelectedMaterials.map(escapeHtml).join(", ")}`}</p>
    </section>
  `;
}

function metric(label: string, value: string | number): string {
  return `<div class="metric" style="display:flex;flex-direction:column;justify-content:center;gap:4px;padding:10px 12px;border:1px solid rgba(148,163,184,0.22);border-radius:8px;background:rgba(15,23,42,0.82);min-width:0;"><span style="border:none;padding:0;margin:0;background:transparent;display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#94a3b8;line-height:1.2;">${escapeHtml(label)}</span><strong style="display:block;font-size:14px;font-weight:700;color:#f8fafc;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(String(value))}</strong></div>`;
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
