import {
  Geometry,
  NormalMappedPBRMaterial,
  PBRMaterial,
  Renderer,
  Sampler,
  TexturedPBRMaterial,
  createLightingDefault,
  createProceduralTexture,
  type RenderItem
} from "@aura3d/rendering";

declare global {
  interface Window {
    __A3D_MATERIAL_STUDIO_LEGACY__?: ExampleState;
  }
}

interface ExampleState {
  readonly status: "ready" | "error";
  readonly diagnostics?: unknown;
  readonly materials: readonly string[];
  readonly error?: string;
}

const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='legacy-material-studio-canvas']");
if (!canvas) throw new Error("Material studio canvas missing.");

void boot();

async function boot(): Promise<void> {
  const sampler = new Sampler({ minFilter: "linear-mipmap-linear", magFilter: "linear", addressU: "repeat", addressV: "repeat" });
  const normal = createProceduralTexture("normal-from-height", { width: 128, height: 128 });
  const carbon = createProceduralTexture("carbon-fiber", { width: 128, height: 128 });
  const metalRoughness = createProceduralTexture("metallic-roughness-map", { width: 128, height: 128 });
  const panel = createProceduralTexture("sci-fi-panel", { width: 128, height: 128 });
  const sphere = Geometry.uvSphere(0.45, 64, 32, { textured: true });
  const floor = Geometry.texturedCube(1);
  const lighting = createLightingDefault("studioProduct");
  const materials = [
    new PBRMaterial({ name: "rough-plastic", baseColor: [0.88, 0.18, 0.12, 1], metallic: 0, roughness: 0.74 }),
    new PBRMaterial({ name: "polished-metal", baseColor: [0.92, 0.84, 0.64, 1], metallic: 1, roughness: 0.18 }),
    new PBRMaterial({ name: "glass-clearcoat", baseColor: [0.55, 0.88, 1, 0.38], metallic: 0, roughness: 0.04, clearcoatFactor: 0.8, renderState: { blend: true, depthWrite: false, cullMode: "none" } }),
    new PBRMaterial({ name: "emissive-indicator", baseColor: [0.08, 0.72, 1, 1], metallic: 0, roughness: 0.24, emissiveColor: [0.02, 0.5, 1], emissiveStrength: 1.35 }),
    new NormalMappedPBRMaterial({ name: "normal-mapped-matte", baseColor: [0.55, 0.44, 0.86, 1], metallic: 0.05, roughness: 0.48, normalTexture: normal, normalSampler: sampler, normalScale: 0.35 }),
    new TexturedPBRMaterial({ name: "textured-carbon", baseColor: [0.12, 0.13, 0.16, 1], metallic: 0.12, roughness: 0.58, baseColorTexture: carbon, baseColorSampler: sampler, normalTexture: normal, normalSampler: sampler, normalScale: 0.18 }),
    new TexturedPBRMaterial({ name: "metallic-texture", baseColor: [0.7, 0.72, 0.76, 1], metallic: 0.64, roughness: 0.32, metallicRoughnessTexture: metalRoughness, metallicRoughnessSampler: sampler, baseColorTexture: panel, baseColorSampler: sampler })
  ];
  const renderItems: RenderItem[] = materials.map((material, index) => ({
    label: material.name,
    geometry: sphere,
    material,
    modelMatrix: modelMatrix(-2.4 + index * 0.8, 0.05, 0, 1, 1, 1)
  }));
  renderItems.push({
    label: "material-studio-floor",
    geometry: floor,
    material: new PBRMaterial({ name: "matte-floor", baseColor: [0.18, 0.2, 0.22, 1], metallic: 0, roughness: 0.66 }),
    modelMatrix: modelMatrix(0, -0.54, -0.05, 6.6, 0.08, 1.35)
  });

  try {
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: canvas.clientWidth || 1100,
      height: canvas.clientHeight || 620,
      clearColor: [0.012, 0.014, 0.018, 1],
      preserveDrawingBuffer: true
    });
    const diagnostics = renderer.render({
      renderItems,
      cameraPolicy: "auto-frame",
      cameraFrameBounds: { min: [-2.9, -0.6, -0.55], max: [2.9, 0.62, 0.55] },
      environmentLighting: lighting.environmentLighting,
      shadow: lighting.shadows,
      postprocess: lighting.postprocess,
      frustumCulling: false
    });
    window.__A3D_MATERIAL_STUDIO_LEGACY__ = {
      status: "ready",
      diagnostics,
      materials: materials.map((material) => material.name)
    };
  } catch (error) {
    window.__A3D_MATERIAL_STUDIO_LEGACY__ = {
      status: "error",
      materials: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function modelMatrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    tx, ty, tz, 1
  ]);
}
