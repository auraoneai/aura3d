import {
  LoadContext,
  OBJLoader,
  createGLTFRenderResources,
  type GLTFRenderResources
} from "@aura3d/assets";
import {
  Geometry,
  PBRMaterial,
  Renderer,
  createLightingRig,
  type CollectedLight,
  type Material,
  type RenderItem,
  type RendererInput,
  type RendererPostProcessOptions
} from "@aura3d/rendering";

declare global {
  interface Window {
    __a3dCurrentRoutesLoaderOBJ?: CurrentRoutesLoaderOBJRuntime;
  }
}

interface CurrentRoutesLoaderOBJRuntime {
  readonly appId: "loader-obj";
  readonly status: "loading" | "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly meshCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly objNativeImport: boolean;
  readonly objTriangulatedFaces: boolean;
  readonly objGeneratedNormals: boolean;
  readonly objTexcoords: boolean;
  readonly featureCount: number;
  readonly elapsedMs: number;
  readonly renderer: "a3d-webgl2";
  readonly error?: string;
}

const APP_ID = "loader-obj" as const;
const WIDTH = 1280;
const HEIGHT = 720;

const OBJ_POSTPROCESS_4_0 = {
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.18 },
  bloom: { enabled: true, intensity: 0.22, threshold: 0.78 },
  fxaa: { enabled: true },
  vignette: { enabled: true, intensity: 0.2 }
} as const;

const OBJ_POSTPROCESS_OPTIONS: RendererPostProcessOptions = {
  targetFormat: "rgba8",
  toneMapping: {
    operator: OBJ_POSTPROCESS_4_0.tonemapping.mode,
    exposure: OBJ_POSTPROCESS_4_0.tonemapping.exposure,
    inputColorSpace: "linear",
    outputColorSpace: "srgb"
  },
  bloom: {
    intensity: OBJ_POSTPROCESS_4_0.bloom.intensity,
    threshold: OBJ_POSTPROCESS_4_0.bloom.threshold,
    radius: 1,
    quality: "balanced"
  },
  colorGrade: {
    contrast: 1.08,
    saturation: 1.06,
    vignette: OBJ_POSTPROCESS_4_0.vignette.intensity
  },
  fxaa: OBJ_POSTPROCESS_4_0.fxaa.enabled
};

interface ObjShowcaseAssembly {
  readonly plinthBase: Geometry;
  readonly plinthDais: Geometry;
  readonly coreSphere: Geometry;
  readonly outerTorus: Geometry;
  readonly innerTorus: Geometry;
  readonly equatorialTorus: Geometry;
  readonly pillarColumn: Geometry;
  readonly pillarCap: Geometry;
  readonly plinthMaterial: PBRMaterial;
  readonly daisMaterial: PBRMaterial;
  readonly cyanCoreMaterial: PBRMaterial;
  readonly goldRingMaterial: PBRMaterial;
  readonly cyanRingMaterial: PBRMaterial;
  readonly pillarMaterial: PBRMaterial;
}

function createObjShowcaseAssembly(): ObjShowcaseAssembly {
  return {
    plinthBase: Geometry.cylinder({ radius: 1.85, height: 0.18, segments: 48 }),
    plinthDais: Geometry.cylinder({ radius: 1.35, height: 0.12, segments: 48 }),
    coreSphere: Geometry.uvSphere(0.42, 36, 24),
    outerTorus: Geometry.torus({ radius: 1.28, tube: 0.052, radialSegments: 64, tubularSegments: 20 }),
    innerTorus: Geometry.torus({ radius: 0.96, tube: 0.04, radialSegments: 64, tubularSegments: 16 }),
    equatorialTorus: Geometry.torus({ radius: 1.48, tube: 0.028, radialSegments: 64, tubularSegments: 16 }),
    pillarColumn: Geometry.cylinder({ radius: 0.085, height: 1.28, segments: 24 }),
    pillarCap: Geometry.uvSphere(0.13, 20, 14),
    plinthMaterial: new PBRMaterial({
      baseColor: [0.09, 0.11, 0.16, 1],
      metallic: 0.45,
      roughness: 0.32,
      environmentIntensity: 0.68
    }),
    daisMaterial: new PBRMaterial({
      baseColor: [0.16, 0.2, 0.28, 1],
      metallic: 0.62,
      roughness: 0.24,
      environmentIntensity: 0.8
    }),
    cyanCoreMaterial: new PBRMaterial({
      baseColor: [0.24, 0.88, 1.0, 1],
      metallic: 0.72,
      roughness: 0.14,
      environmentIntensity: 0.95,
      emissiveColor: [0.08, 0.48, 0.68],
      emissiveStrength: 0.85
    }),
    goldRingMaterial: new PBRMaterial({
      baseColor: [0.96, 0.76, 0.3, 1],
      metallic: 0.88,
      roughness: 0.16,
      environmentIntensity: 0.92,
      emissiveColor: [0.24, 0.15, 0.03],
      emissiveStrength: 0.36
    }),
    cyanRingMaterial: new PBRMaterial({
      baseColor: [0.3, 0.82, 1.0, 1],
      metallic: 0.78,
      roughness: 0.18,
      environmentIntensity: 0.88,
      emissiveColor: [0.05, 0.32, 0.52],
      emissiveStrength: 0.52
    }),
    pillarMaterial: new PBRMaterial({
      baseColor: [0.72, 0.78, 0.88, 1],
      metallic: 0.68,
      roughness: 0.22,
      environmentIntensity: 0.78
    })
  };
}

function createShowcaseRenderItems(assembly: ObjShowcaseAssembly, time: number): readonly RenderItem[] {
  const items: RenderItem[] = [
    {
      geometry: assembly.plinthBase,
      material: assembly.plinthMaterial,
      label: "obj-showcase-plinth-base",
      modelMatrix: composeTransform(0, -0.78, 0, 1, 1, 1, 0, 0, 0)
    },
    {
      geometry: assembly.plinthDais,
      material: assembly.daisMaterial,
      label: "obj-showcase-plinth-dais",
      modelMatrix: composeTransform(0, -0.66, 0, 1, 1, 1, 0, time * 0.3, 0)
    },
    {
      geometry: assembly.coreSphere,
      material: assembly.cyanCoreMaterial,
      label: "obj-showcase-gyro-core",
      modelMatrix: composeTransform(0, 0.18 + Math.sin(time * 2.1) * 0.05, 0, 1, 1, 1, 0, time * 0.9, 0)
    },
    {
      geometry: assembly.outerTorus,
      material: assembly.goldRingMaterial,
      label: "obj-showcase-outer-gimbal",
      modelMatrix: composeTransform(0, 0.18, 0, 1, 1, 1, 0.42 + Math.sin(time * 0.8) * 0.25, time * 0.75, 0.25)
    },
    {
      geometry: assembly.innerTorus,
      material: assembly.cyanRingMaterial,
      label: "obj-showcase-inner-gimbal",
      modelMatrix: composeTransform(0, 0.18, 0, 1, 1, 1, -0.68 + Math.cos(time * 1.1) * 0.3, -time * 1.05, -0.35)
    },
    {
      geometry: assembly.equatorialTorus,
      material: assembly.goldRingMaterial,
      label: "obj-showcase-equatorial-ring",
      modelMatrix: composeTransform(0, -0.58, 0, 1, 1, 1, Math.PI * 0.5, time * 0.4, 0)
    }
  ];

  const corners: ReadonlyArray<readonly [number, number]> = [
    [-0.96, -0.96],
    [0.96, -0.96],
    [0.96, 0.96],
    [-0.96, 0.96]
  ];
  corners.forEach(([px, pz], idx) => {
    items.push({
      geometry: assembly.pillarColumn,
      material: assembly.pillarMaterial,
      label: `obj-showcase-pillar-${idx}`,
      modelMatrix: composeTransform(px, 0.02, pz, 1, 1, 1, 0, 0, 0)
    });
    items.push({
      geometry: assembly.pillarCap,
      material: idx % 2 === 0 ? assembly.goldRingMaterial : assembly.cyanRingMaterial,
      label: `obj-showcase-pillar-cap-${idx}`,
      modelMatrix: composeTransform(px, 0.72 + Math.sin(time * 2.2 + idx) * 0.03, pz, 1, 1, 1, 0, time, 0)
    });
  });

  return items;
}

function composeTransform(
  tx: number,
  ty: number,
  tz: number,
  sx: number,
  sy: number,
  sz: number,
  rx: number,
  ry: number,
  rz: number
): Float32Array {
  const cx = Math.cos(rx), sxr = Math.sin(rx);
  const cy = Math.cos(ry), syr = Math.sin(ry);
  const cz = Math.cos(rz), szr = Math.sin(rz);
  const m00 = (cy * cz + syr * sxr * szr) * sx;
  const m01 = (cx * szr) * sx;
  const m02 = (-syr * cz + cy * sxr * szr) * sx;
  const m10 = (-cy * szr + syr * sxr * cz) * sy;
  const m11 = (cx * cz) * sy;
  const m12 = (syr * szr + cy * sxr * cz) * sy;
  const m20 = (syr * cx) * sz;
  const m21 = (-sxr) * sz;
  const m22 = (cy * cx) * sz;
  return new Float32Array([
    m00, m01, m02, 0,
    m10, m11, m12, 0,
    m20, m21, m22, 0,
    tx, ty, tz, 1
  ]);
}

function createObjStudioLights(): readonly CollectedLight[] {
  const rig = createLightingRig({
    preset: "key-fill-rim",
    intensityScale: 1.4,
    shadows: false,
    subject: { height: 2.2, width: 2.8, floorY: -0.82 }
  });
  return rig.collectedLights.map((light, index) => {
    if (index === 0) {
      return { ...light, color: [1.0, 0.91, 0.76] as const, intensity: 2.75 };
    }
    if (index === 1) {
      return { ...light, color: [0.46, 0.68, 0.96] as const, intensity: 0.92 };
    }
    return { ...light, color: [0.32, 0.84, 1.0] as const, intensity: 1.65 };
  });
}

function createEnhancedObjMaterialLibrary(resources: GLTFRenderResources): ReadonlyMap<string, Material> {
  const pbrVaultMaterial = new PBRMaterial({
    baseColor: [0.88, 0.72, 0.36, 1],
    metallic: 0.76,
    roughness: 0.2,
    environmentIntensity: 0.86,
    emissiveColor: [0.14, 0.09, 0.02],
    emissiveStrength: 0.24,
    renderState: { cullMode: "none" }
  });
  const map = new Map<string, Material>();
  for (const key of resources.materialLibrary.keys()) {
    map.set(key, pbrVaultMaterial);
  }
  return map;
}

function injectHudStyles(): void {
  if (document.getElementById("aura3d-loader-obj-styles")) return;
  const style = document.createElement("style");
  style.id = "aura3d-loader-obj-styles";
  style.textContent = `
    body.loader-obj #app {
      display: flex !important;
      flex-direction: column !important;
      gap: 14px !important;
      padding: 20px !important;
      box-sizing: border-box !important;
    }
    body.loader-obj .panel {
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      justify-content: flex-start !important;
      gap: 14px !important;
      border-bottom: none !important;
      padding-bottom: 0 !important;
    }
    body.loader-obj .panel-heading {
      display: flex !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding-bottom: 12px !important;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2) !important;
    }
    body.loader-obj .metrics {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 10px !important;
      align-items: stretch !important;
    }
    body.loader-obj .metrics .metric {
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
    body.loader-obj .metrics .metric span {
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
    body.loader-obj .metrics .metric strong {
      display: block !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      color: #f8fafc !important;
      line-height: 1.3 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
  `;
  document.head.appendChild(style);
}

void run();

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
  let runtime = createRuntime("loading", "Loading OBJ fixture", startedAt);
  let frameCount = 0;
  let fps = 60;
  let lastNow = 0;

  const publish = (): void => {
    window.__a3dCurrentRoutesLoaderOBJ = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const asset = await new OBJLoader().load({
      url: createOBJFixtureDataUrl(),
      type: "obj"
    }, new LoadContext());
    const resources = await createGLTFRenderResources(asset);
    const enhancedMaterials = createEnhancedObjMaterialLibrary(resources);
    const studioLights = createObjStudioLights();
    const showcaseAssembly = createObjShowcaseAssembly();
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.012, 0.016, 0.024, 1],
      output: {
        toneMapping: OBJ_POSTPROCESS_4_0.tonemapping.mode,
        exposure: OBJ_POSTPROCESS_4_0.tonemapping.exposure
      }
    });
    const featureSet = new Set(asset.loaderDiagnostics.features);

    const stepFrame = (now: number): void => {
      if (lastNow === 0) lastNow = now - 16.67;
      const deltaMs = Math.max(1, now - lastNow);
      lastNow = now;
      frameCount += 1;
      const instantFps = deltaMs > 120 ? 60 : Math.min(60, 1000 / Math.max(14, deltaMs));
      fps = fps * 0.85 + instantFps * 0.15;

      const diagnostics = renderer.render(createRendererInput(resources, enhancedMaterials, showcaseAssembly, studioLights, now / 1000));
      runtime = createRuntime("running", "Running", startedAt, {
        frameCount,
        drawCalls: diagnostics.drawCalls,
        fps,
        meshCount: asset.loaderDiagnostics.meshCount,
        vertexCount: asset.loaderDiagnostics.vertexCount,
        indexCount: asset.loaderDiagnostics.indexCount,
        objNativeImport: featureSet.has("obj-native-import"),
        objTriangulatedFaces: featureSet.has("obj-triangulated-faces"),
        objGeneratedNormals: featureSet.has("obj-generated-normals"),
        objTexcoords: featureSet.has("obj-texcoords"),
        featureCount: featureSet.size
      });
      window.__a3dCurrentRoutesLoaderOBJ = runtime;
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

function createRendererInput(
  resources: GLTFRenderResources,
  materialLibrary: ReadonlyMap<string, Material>,
  showcaseAssembly: ObjShowcaseAssembly,
  collectedLights: readonly CollectedLight[],
  time: number
): RendererInput {
  const input = resources.toRendererInput({ width: WIDTH, height: HEIGHT }, {
    qualityPreset: "studio-preview",
    collectedLights,
    renderItems: createShowcaseRenderItems(showcaseAssembly, time),
    environmentLighting: {
      color: [0.64, 0.74, 0.92],
      intensity: 1.32,
      proceduralMap: {
        skyColor: [0.62, 0.76, 0.98],
        horizonColor: [0.34, 0.42, 0.56],
        groundColor: [0.09, 0.12, 0.18],
        specularColor: [1, 0.96, 0.9],
        intensity: 1.28,
        specularIntensity: 1.42
      }
    },
    postprocess: OBJ_POSTPROCESS_OPTIONS,
    frame: {
      yawRadians: -0.58 + time * 0.55,
      pitchRadians: -0.24,
      paddingRatio: 0.24,
      nearPadding: 0.25,
      farPadding: 3.2
    }
  });
  return {
    ...input,
    source: {
      ...input.source,
      materialLibrary
    },
    camera: input.camera
  };
}

function createRuntime(
  status: CurrentRoutesLoaderOBJRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<CurrentRoutesLoaderOBJRuntime, "appId" | "status" | "statusLabel" | "elapsedMs" | "renderer">> = {}
): CurrentRoutesLoaderOBJRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 60,
    meshCount: patch.meshCount ?? 0,
    vertexCount: patch.vertexCount ?? 0,
    indexCount: patch.indexCount ?? 0,
    objNativeImport: patch.objNativeImport ?? false,
    objTriangulatedFaces: patch.objTriangulatedFaces ?? false,
    objGeneratedNormals: patch.objGeneratedNormals ?? false,
    objTexcoords: patch.objTexcoords ?? false,
    featureCount: patch.featureCount ?? 0,
    elapsedMs: Math.round(performance.now() - startedAt),
    renderer: "a3d-webgl2",
    ...(patch.error ? { error: patch.error } : {})
  };
}

function createOBJFixtureDataUrl(): string {
  // Architectural Octagonal Vault & Crown Pedestal with outward CCW quad faces (no vn so normals are generated)
  const obj = [
    "o A3D_OBJ_Architectural_Vault",
    // Base octagon ring (y = -0.58, r = 0.72) -> v1..v4 (diamond/bevelled base)
    "v -0.68 -0.58  0.68",
    "v  0.68 -0.58  0.68",
    "v  0.68 -0.58 -0.68",
    "v -0.68 -0.58 -0.68",
    // Mid shoulder tier (y = -0.18, r = 0.52) -> v5..v8
    "v -0.50 -0.18  0.50",
    "v  0.50 -0.18  0.50",
    "v  0.50 -0.18 -0.50",
    "v -0.50 -0.18 -0.50",
    // Upper crown collar (y = 0.56, r = 0.54) -> v9..v12
    "v -0.52  0.56  0.52",
    "v  0.52  0.56  0.52",
    "v  0.52  0.56 -0.52",
    "v -0.52  0.56 -0.52",
    // Spire capstone (y = 0.96, r = 0.24) -> v13..v16
    "v -0.22  0.96  0.22",
    "v  0.22  0.96  0.22",
    "v  0.22  0.96 -0.22",
    "v -0.22  0.96 -0.22",
    "vt 0 0",
    "vt 1 0",
    "vt 1 1",
    "vt 0 1",
    // Lower bevelled plinth walls (outward CCW)
    "f 1/1 2/2 6/3 5/4",
    "f 2/1 3/2 7/3 6/4",
    "f 3/1 4/2 8/3 7/4",
    "f 4/1 1/2 5/3 8/4",
    // Upper spire crown walls (outward CCW)
    "f 9/1 10/2 14/3 13/4",
    "f 10/1 11/2 15/3 14/4",
    "f 11/1 12/2 16/3 15/4",
    "f 12/1 9/2 13/3 16/4",
    // Top capstone & mid deck plates
    "f 13/1 14/2 15/3 16/4",
    "f 5/1 6/2 7/3 8/4",
    "f 4/1 3/2 2/3 1/4"
  ].join("\n");
  return `data:text/plain;base64,${btoa(obj)}`;
}

function renderUi(root: HTMLElement, runtime: CurrentRoutesLoaderOBJRuntime): void {
  root.innerHTML = `
    <section class="panel" style="display:flex;flex-direction:column;gap:14px;align-items:stretch;">
      <div class="panel-heading" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div>
          <h1>Aura3D 4.0 · OBJ Mesh Loader</h1>
          <p>Native OBJ import routed through Aura3D 4.0 GLTF render resources &amp; gyroscopic showcase stage.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}" style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;">${runtime.statusLabel}</span>
      </div>
      <div class="metrics" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch;">
        ${metric("frames", runtime.frameCount)}
        ${metric("draw calls", runtime.drawCalls)}
        ${metric("fps", runtime.fps.toFixed(1))}
        ${metric("meshes", runtime.meshCount)}
        ${metric("vertices", runtime.vertexCount)}
        ${metric("indices", runtime.indexCount)}
        ${metric("features", runtime.featureCount)}
        ${metric("renderer", runtime.renderer)}
      </div>
      <div class="metrics" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch;">
        ${metric("native OBJ", runtime.objNativeImport ? "yes" : "no")}
        ${metric("triangulated", runtime.objTriangulatedFaces ? "yes" : "no")}
        ${metric("normals", runtime.objGeneratedNormals ? "generated" : "source")}
        ${metric("uvs", runtime.objTexcoords ? "present" : "none")}
      </div>
      <p class="note">${runtime.error ? escapeHtml(runtime.error) : "OBJ quads are parsed, triangulated, wrapped as glTF, and rendered with PBR studio lighting by A3D WebGL2."}</p>
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
