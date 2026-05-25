import {
  Geometry,
  V4_PHYSICAL_MATERIAL_MATRIX,
  PBRMaterial,
  Renderer,
  Sampler,
  Texture,
  TexturedPBRMaterial,
  analyzeV4MaterialMatrix,
  createLightingDefault,
  type V4PhysicalMaterialDescriptor,
  type LightingDefaultPreset,
  type RenderItem
} from "@galileo3d/rendering";

declare global {
  interface Window {
    __G3D_V4_MATERIAL_STUDIO__?: unknown;
  }
}

type StudioEnvironment = "studioProduct" | "interiorGallery" | "outdoorDay";

const environments: readonly StudioEnvironment[] = ["studioProduct", "interiorGallery", "outdoorDay"];
const claimBoundary = "Milestone 8 material studio proof only; V4 release still requires licensed production textures and same-scene Three.js visual parity.";

export async function mountMaterialStudioV4(id: string): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app root.");
  root.innerHTML = `
    <main style="display:grid;grid-template-columns:340px 1fr;height:100vh;background:#111316;color:#f4f1e8;font-family:Inter,system-ui,sans-serif">
      <aside style="border-right:1px solid #30363d;padding:18px;overflow:auto">
        <h1 style="font-size:20px;margin:0 0 14px">Material Studio Pro</h1>
        <label>Environment <select data-testid="hr4-material-environment">${environments.map((env) => `<option value="${env}">${labelEnvironment(env)}</option>`).join("")}</select></label>
        <div data-testid="hr4-material-list" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:16px">
          ${V4_PHYSICAL_MATERIAL_MATRIX.map((material) => `<div style="border:1px solid #30363d;padding:7px;background:#191e24">${material.label}</div>`).join("")}
        </div>
        <pre data-testid="hr4-material-status" style="white-space:pre-wrap;background:#171b20;padding:12px;margin-top:16px;max-height:38vh;overflow:auto">loading</pre>
      </aside>
      <section style="display:grid;grid-template-rows:1fr 44px;min-width:0">
        <canvas data-testid="hr4-material-canvas" width="1280" height="820" style="width:100%;height:100%;display:block"></canvas>
        <div style="border-top:1px solid #30363d;padding:10px 14px">Physical material matrix: HDR/IBL, tone mapping, texture slots, and extension diagnostics</div>
      </section>
    </main>`;

  const canvas = root.querySelector<HTMLCanvasElement>("[data-testid='hr4-material-canvas']")!;
  const status = root.querySelector<HTMLElement>("[data-testid='hr4-material-status']")!;
  const environmentSelect = root.querySelector<HTMLSelectElement>("[data-testid='hr4-material-environment']")!;
  const renderer = await Renderer.create({ backend: "webgl2", canvas, width: 1280, height: 820, clearColor: [0.018, 0.02, 0.024, 1], antialias: true, preserveDrawingBuffer: true });
  const textures = createStudioTextures();

  function render(): void {
    const environment = environmentSelect.value as StudioEnvironment;
    const lighting = createLightingDefault(environment as LightingDefaultPreset);
    const renderItems = createMaterialRenderItems(textures, environment);
    const diagnostics = renderer.render({
      renderItems,
      cameraPolicy: "auto-frame",
      cameraFrameBounds: { min: [-3.95, -1.55, -0.72], max: [3.95, 1.4, 0.72] },
      cameraFrameOptions: { paddingRatio: 0.12, yawRadians: -0.28, pitchRadians: -0.12 },
      environmentLighting: lighting.environmentLighting,
      shadow: false,
      postprocess: lighting.postprocess,
      frustumCulling: false
    });
    const frame = renderer.captureFrame();
    const analyses = analyzeV4MaterialMatrix();
    const state = {
      id,
      status: "ready",
      renderer: "webgl2",
      productSurface: "material-studio-pro",
      materialLibrary: "fixtures/v4/materials/material-library.json",
      textureDirectory: "fixtures/v4/materials/textures",
      materialIds: V4_PHYSICAL_MATERIAL_MATRIX.map((material) => material.id),
      materialCount: V4_PHYSICAL_MATERIAL_MATRIX.length,
      reflectanceClasses: analyses.map((entry) => entry.reflectanceClass),
      boundedDiagnostics: analyses.flatMap((entry) => entry.extensionDiagnostics.filter((extension) => extension.support === "bounded").map((extension) => extension.extension)),
      environmentPreset: environment,
      hdrIbl: true,
      colorManagement: "linear-input-srgb-output",
      toneMapping: lighting.postprocess.toneMapping,
      drawCalls: diagnostics.drawCalls,
      textureCount: Object.keys(textures).length,
      pixelBucketCount: countPixelBuckets(frame.pixels),
      featureChecklist: ["12-material-matrix", "hdr-ibl", "tone-mapping", "texture-backed-materials", "extension-diagnostics", "app-ui"],
      claimBoundary
    };
    window.__G3D_V4_MATERIAL_STUDIO__ = state;
    status.textContent = JSON.stringify(state, null, 2);
  }

  environmentSelect.addEventListener("change", render);
  render();
  window.addEventListener("beforeunload", () => renderer.dispose(), { once: true });
}

function createMaterialRenderItems(textures: StudioTextures, environment: StudioEnvironment): RenderItem[] {
  const sphere = Geometry.uvSphere(0.38, 64, 32, { textured: true });
  const floor = Geometry.texturedCube(1);
  const items: RenderItem[] = V4_PHYSICAL_MATERIAL_MATRIX.map((descriptor, index) => {
    const column = index % 6;
    const row = Math.floor(index / 6);
    return {
      label: `hr4-${descriptor.id}`,
      geometry: sphere,
      material: createRenderMaterial(descriptor, textures, environment),
      modelMatrix: modelMatrix(-2.95 + column * 1.18, 0.62 - row * 1.15, 0, 1, 1, 1)
    };
  });
  items.push({
    label: "hr4-material-studio-floor",
    geometry: floor,
    material: new PBRMaterial({ name: "hr4-material-studio-floor", baseColor: [0.16, 0.17, 0.18, 1], metallic: 0, roughness: 0.68 }),
    modelMatrix: modelMatrix(0, -1.05, -0.42, 8.2, 0.08, 1.55)
  });
  return items;
}

function createRenderMaterial(descriptor: V4PhysicalMaterialDescriptor, textures: StudioTextures, environment: StudioEnvironment): PBRMaterial | TexturedPBRMaterial {
  const common = {
    name: `hr4-${descriptor.id}`,
    baseColor: descriptor.baseColor,
    metallic: descriptor.metallic,
    roughness: descriptor.roughness,
    emissiveColor: descriptor.emissive,
    emissiveStrength: descriptor.emissiveStrength,
    clearcoatFactor: descriptor.extensions.includes("clearcoat") ? 0.78 : 0,
    clearcoatRoughnessFactor: descriptor.id === "clearcoat-car-paint" ? 0.12 : 0.2,
    transmissionFactor: descriptor.extensions.includes("transmission") ? 0.72 : 0,
    volumeThicknessFactor: descriptor.extensions.includes("volume") ? 0.24 : 0,
    volumeAttenuationColor: [0.78, 0.92, 1] as const,
    ior: descriptor.extensions.includes("ior") ? 1.45 : 1.5,
    specularFactor: descriptor.extensions.includes("specular") ? 1 : 0.65,
    sheenColorFactor: descriptor.extensions.includes("sheen") ? [0.72, 0.42, 1] as const : [0, 0, 0] as const,
    sheenRoughnessFactor: descriptor.extensions.includes("sheen") ? 0.62 : 0,
    anisotropyStrength: descriptor.extensions.includes("anisotropy") ? 0.76 : 0,
    iridescenceFactor: descriptor.extensions.includes("iridescence") ? 0.4 : 0,
    renderState: descriptor.alphaMode === "blend" ? { blend: true, depthWrite: false, cullMode: "none" as const } : undefined
  };
  if (["brushed-metal", "rubber", "fabric-sheen", "emissive", "textured-ceramic-stone", "clearcoat-car-paint", "painted-metal"].includes(descriptor.id)) {
    return new TexturedPBRMaterial({
      ...common,
      baseColorTexture: descriptor.id === "textured-ceramic-stone" ? textures.ceramicStoneBase : descriptor.id === "emissive" ? textures.emissiveGrid : undefined,
      baseColorSampler: textures.sampler,
      normalTexture: textureForNormal(descriptor, textures),
      normalSampler: textures.sampler,
      normalScale: descriptor.id === "brushed-metal" ? 0.24 : descriptor.id === "fabric-sheen" ? 0.42 : 0.34,
      metallicRoughnessTexture: descriptor.id === "textured-ceramic-stone" ? textures.ceramicStoneRoughness : descriptor.id === "rubber" ? textures.rubberGrain : undefined,
      metallicRoughnessSampler: textures.sampler,
      emissiveTexture: descriptor.id === "emissive" ? textures.emissiveGrid : undefined,
      emissiveSampler: textures.sampler,
      textureTexCoords: descriptor.id === "textured-ceramic-stone" ? { baseColor: 0, normal: 0, metallicRoughness: 0 } : undefined,
      baseColorTextureTransform: descriptor.extensions.includes("texture-transform") ? { scale: [1.8, 1.8], rotation: 0.18 } : undefined
    });
  }
  const environmentBoost = environment === "outdoorDay" ? 1.08 : environment === "interiorGallery" ? 0.92 : 1;
  return new PBRMaterial({
    ...common,
    environmentIntensity: environmentBoost
  });
}

function textureForNormal(descriptor: V4PhysicalMaterialDescriptor, textures: StudioTextures): Texture | undefined {
  if (descriptor.id === "brushed-metal") return textures.brushedNormal;
  if (descriptor.id === "rubber") return textures.rubberGrain;
  if (descriptor.id === "fabric-sheen") return textures.fabricWeave;
  if (descriptor.id === "clearcoat-car-paint" || descriptor.id === "painted-metal") return textures.orangePeel;
  if (descriptor.id === "textured-ceramic-stone") return textures.ceramicStoneNormal;
  return undefined;
}

interface StudioTextures {
  readonly sampler: Sampler;
  readonly brushedNormal: Texture;
  readonly orangePeel: Texture;
  readonly rubberGrain: Texture;
  readonly fabricWeave: Texture;
  readonly emissiveGrid: Texture;
  readonly ceramicStoneBase: Texture;
  readonly ceramicStoneNormal: Texture;
  readonly ceramicStoneRoughness: Texture;
}

function createStudioTextures(): StudioTextures {
  const sampler = new Sampler({ minFilter: "linear-mipmap-linear", magFilter: "linear", addressU: "repeat", addressV: "repeat" });
  return {
    sampler,
    brushedNormal: new Texture({ width: 128, height: 128, colorSpace: "linear", label: "brushed-metal-lines", data: proceduralPixels("brushed-metal-lines") }),
    orangePeel: new Texture({ width: 128, height: 128, colorSpace: "linear", label: "clearcoat-orange-peel", data: proceduralPixels("clearcoat-orange-peel") }),
    rubberGrain: new Texture({ width: 128, height: 128, colorSpace: "linear", label: "micro-rubber-grain", data: proceduralPixels("micro-rubber-grain") }),
    fabricWeave: new Texture({ width: 128, height: 128, colorSpace: "linear", label: "woven-fabric", data: proceduralPixels("woven-fabric") }),
    emissiveGrid: new Texture({ width: 128, height: 128, colorSpace: "srgb", label: "emissive-grid", data: proceduralPixels("emissive-grid") }),
    ceramicStoneBase: new Texture({ width: 128, height: 128, colorSpace: "srgb", label: "ceramic-stone-base", data: proceduralPixels("ceramic-stone-base") }),
    ceramicStoneNormal: new Texture({ width: 128, height: 128, colorSpace: "linear", label: "ceramic-stone-normal", data: proceduralPixels("ceramic-stone-normal") }),
    ceramicStoneRoughness: new Texture({ width: 128, height: 128, colorSpace: "linear", label: "ceramic-stone-roughness", data: proceduralPixels("ceramic-stone-roughness") })
  };
}

function proceduralPixels(kind: string): Uint8Array {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const stripe = ((x * 7 + y * 3) % 31) / 30;
      const weave = (((x >> 3) + (y >> 3)) % 2) * 42;
      const grain = pseudoNoise(x, y);
      if (kind.includes("normal")) {
        data[i] = 112 + Math.floor((grain - 0.5) * 34);
        data[i + 1] = 118 + Math.floor((stripe - 0.5) * 30);
        data[i + 2] = 245;
      } else if (kind.includes("emissive")) {
        const line = x % 24 < 3 || y % 24 < 3;
        data[i] = line ? 255 : 18;
        data[i + 1] = line ? 122 : 24;
        data[i + 2] = line ? 38 : 28;
      } else if (kind.includes("ceramic-stone-base")) {
        data[i] = 142 + Math.floor(grain * 48);
        data[i + 1] = 132 + Math.floor(stripe * 38);
        data[i + 2] = 118 + weave;
      } else if (kind.includes("roughness")) {
        data[i] = 255;
        data[i + 1] = 120 + Math.floor(grain * 88);
        data[i + 2] = 255;
      } else {
        const value = 116 + Math.floor(grain * 92) + Math.floor(stripe * 24);
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
      }
      data[i + 3] = 255;
    }
  }
  return data;
}

function pseudoNoise(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function countPixelBuckets(pixels: Uint8Array): number {
  const buckets = new Set<string>();
  for (let index = 0; index < pixels.length; index += 16) {
    buckets.add(`${(pixels[index] ?? 0) >> 4}:${(pixels[index + 1] ?? 0) >> 4}:${(pixels[index + 2] ?? 0) >> 4}`);
  }
  return buckets.size;
}

function modelMatrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    tx, ty, tz, 1
  ]);
}

function labelEnvironment(environment: StudioEnvironment): string {
  switch (environment) {
    case "studioProduct":
      return "Studio Product HDR";
    case "interiorGallery":
      return "Interior Gallery HDR";
    case "outdoorDay":
      return "Outdoor Day HDR";
  }
}
