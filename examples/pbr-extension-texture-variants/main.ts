import { Renderable, Scene } from "@galileo3d/scene";
import {
  DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
  Geometry,
  Renderer,
  Texture,
  TexturedPBRMaterial,
  createV4EnvironmentLighting,
  type RenderDeviceDiagnostics
} from "@galileo3d/rendering";

type VariantId =
  | "clearcoat"
  | "transmission-volume"
  | "specular-sheen-anisotropy"
  | "iridescence"
  | "clearcoat-transmission-volume"
  | "specular-sheen-anisotropy-iridescence";

interface VariantEvidence {
  readonly id: VariantId;
  readonly shaderVariant: string;
  readonly pixel: readonly number[];
  readonly rgb: number;
}

interface PbrExtensionTextureVariantState {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly visualClaim: "bounded-pbr-extension-texture-variants";
  readonly screenshotPath: "tests/reports/v4-example-screenshots/pbr-extension-texture-variants.png";
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly canvasFrame?: { readonly width: number; readonly height: number };
  readonly variants: readonly VariantEvidence[];
  readonly featureEvidence: {
    readonly samplerBudgetedShaderVariants: boolean;
    readonly combinedSamplerBudgetedShaderVariants: boolean;
    readonly advancedTextureMapsRendered: boolean;
    readonly variantCount: number;
    readonly variantNames: readonly string[];
    readonly browserPixelReadback: boolean;
  };
  readonly knownLimits: readonly string[];
  readonly errors: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __GALILEO3D_PBR_EXTENSION_TEXTURE_VARIANTS__?: PbrExtensionTextureVariantState;
  }
}

const screenshotPath = "tests/reports/v4-example-screenshots/pbr-extension-texture-variants.png" as const;
const variantCenters: Record<VariantId, { readonly x: number; readonly y: number }> = {
  clearcoat: { x: 80, y: 270 },
  "transmission-volume": { x: 240, y: 270 },
  "clearcoat-transmission-volume": { x: 400, y: 270 },
  "specular-sheen-anisotropy": { x: 560, y: 270 },
  iridescence: { x: 720, y: 270 },
  "specular-sheen-anisotropy-iridescence": { x: 880, y: 270 }
};

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__GALILEO3D_PBR_EXTENSION_TEXTURE_VARIANTS__ = {
      status: "error",
      renderer: "webgl2",
      visualClaim: "bounded-pbr-extension-texture-variants",
      screenshotPath,
      variants: [],
      featureEvidence: {
        samplerBudgetedShaderVariants: false,
        combinedSamplerBudgetedShaderVariants: false,
        advancedTextureMapsRendered: false,
        variantCount: 0,
        variantNames: [],
        browserPixelReadback: false
      },
      knownLimits: knownLimits(),
      errors: [error instanceof Error ? error.message : String(error)],
      error: serializeError(error)
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const shell = document.createElement("main");
  shell.innerHTML = `
    <canvas data-testid="pbr-extension-texture-variants-canvas" width="960" height="540" aria-label="PBR extension texture variant WebGL scene"></canvas>
    <pre data-testid="pbr-extension-texture-variants-status">booting</pre>
  `;
  document.body.append(shell);
  const canvas = shell.querySelector<HTMLCanvasElement>("[data-testid='pbr-extension-texture-variants-canvas']");
  const status = shell.querySelector<HTMLElement>("[data-testid='pbr-extension-texture-variants-status']");
  if (!canvas || !status) throw new Error("PBR extension texture variant shell did not create required elements.");

  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.014, 0.016, 0.02, 1],
    preserveDrawingBuffer: true,
    antialias: false
  });

  const scene = new Scene();
  const camera = scene.createOrthographicCamera({ left: -4.8, right: 4.8, bottom: -2.7, top: 2.7, near: 0.1, far: 20 });
  camera.transform.setPosition(0, 0, 8);
  scene.root.addChild(camera);
  const key = scene.createLight("directional", "variant-key");
  key.intensity = 0.95;
  key.color = { x: 0.9, y: 0.84, z: 0.76 };
  scene.root.addChild(key);
  const fill = scene.createLight("point", "variant-fill");
  fill.intensity = 0.24;
  fill.range = 9;
  fill.color = { x: 0.4, y: 0.62, z: 1 };
  fill.transform.setPosition(-2.8, 1.6, 3);
  scene.root.addChild(fill);

  const materials = createMaterials();
  const entries: readonly [VariantId, number, TexturedPBRMaterial][] = [
    ["clearcoat", -4, materials.clearcoat],
    ["transmission-volume", -2.4, materials.transmissionVolume],
    ["clearcoat-transmission-volume", -0.8, materials.clearcoatTransmissionVolume],
    ["specular-sheen-anisotropy", 0.8, materials.specularSheenAnisotropy],
    ["iridescence", 2.4, materials.iridescence],
    ["specular-sheen-anisotropy-iridescence", 4, materials.specularSheenAnisotropyIridescence]
  ];
  for (const [id, x, material] of entries) {
    const node = scene.createNode(`pbr-extension-${id}`);
    node.transform.setPosition(x, 0, 0);
    node.transform.setRotation(0.16, 0.32, 0, 1);
    node.transform.setScale(1.05, 1.05, 1.05);
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:textured-cube", material: `material:${id}` }));
  }

  const diagnostics = renderer.render({
    scene,
    geometryLibrary: { "geometry:textured-cube": Geometry.texturedCube(1.1) },
    materialLibrary: new Map(entries.map(([id, , material]) => [`material:${id}`, material])),
    environmentLighting: createV4EnvironmentLighting("studio").lighting
  });
  const variants = entries.map(([id, , material]) => {
    const pixel = readPixel(renderer, variantCenters[id].x, variantCenters[id].y);
    return {
      id,
      shaderVariant: material.shaderVariant ?? "missing",
      pixel,
      rgb: rgb(pixel)
    };
  });
  const expectedVariants = [
    DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT,
    DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
    DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT,
    DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT,
    DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
    DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT
  ];
  const expectedCombinedVariants = [
    DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
    DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT
  ];
  window.__GALILEO3D_PBR_EXTENSION_TEXTURE_VARIANTS__ = {
    status: "ready",
    renderer: "webgl2",
    visualClaim: "bounded-pbr-extension-texture-variants",
    screenshotPath,
    diagnostics,
    canvasFrame: { width: canvas.width, height: canvas.height },
    variants,
    featureEvidence: {
      samplerBudgetedShaderVariants: expectedVariants.every((variant) => variants.some((entry) => entry.shaderVariant === variant)),
      combinedSamplerBudgetedShaderVariants: expectedCombinedVariants.every((variant) => variants.some((entry) => entry.shaderVariant === variant)),
      advancedTextureMapsRendered: variants.every((entry) => entry.rgb > 20 && entry.pixel[3] === 255),
      variantCount: variants.length,
      variantNames: variants.map((entry) => entry.shaderVariant),
      browserPixelReadback: variants.every((entry) => entry.pixel.length === 4)
    },
    knownLimits: knownLimits(),
    errors: []
  };
  status.textContent = JSON.stringify(window.__GALILEO3D_PBR_EXTENSION_TEXTURE_VARIANTS__, null, 2);
  window.addEventListener("beforeunload", () => renderer.dispose(), { once: true });
}

function createMaterials(): {
  readonly clearcoat: TexturedPBRMaterial;
  readonly transmissionVolume: TexturedPBRMaterial;
  readonly specularSheenAnisotropy: TexturedPBRMaterial;
  readonly iridescence: TexturedPBRMaterial;
  readonly clearcoatTransmissionVolume: TexturedPBRMaterial;
  readonly specularSheenAnisotropyIridescence: TexturedPBRMaterial;
} {
  return {
    clearcoat: new TexturedPBRMaterial({
      name: "variant-clearcoat-textures",
      baseColor: [0.72, 0.95, 0.86, 1],
      metallic: 0.02,
      roughness: 0.22,
      clearcoatFactor: 0.95,
      clearcoatRoughnessFactor: 0.18,
      clearcoatTexture: pixelTexture("clearcoat-factor", [255, 255, 255, 255], "linear"),
      clearcoatRoughnessTexture: pixelTexture("clearcoat-roughness", [255, 96, 255, 255], "linear"),
      clearcoatNormalTexture: pixelTexture("clearcoat-normal", [128, 128, 255, 255], "linear"),
      clearcoatNormalScale: 0.35
    }),
    transmissionVolume: new TexturedPBRMaterial({
      name: "variant-transmission-volume-textures",
      baseColor: [0.5, 0.82, 1, 0.92],
      metallic: 0,
      roughness: 0.16,
      transmissionFactor: 0.58,
      diffuseTransmissionFactor: 0.3,
      diffuseTransmissionColorFactor: [0.5, 0.8, 1],
      volumeThicknessFactor: 0.48,
      volumeAttenuationDistance: 2.4,
      volumeAttenuationColor: [0.5, 0.7, 1],
      transmissionTexture: pixelTexture("transmission-factor", [220, 255, 255, 255], "linear"),
      diffuseTransmissionTexture: pixelTexture("diffuse-transmission", [180, 255, 255, 255], "linear"),
      diffuseTransmissionColorTexture: pixelTexture("diffuse-transmission-color", [120, 190, 255, 255], "srgb"),
      volumeThicknessTexture: pixelTexture("volume-thickness", [255, 160, 255, 255], "linear")
    }),
    specularSheenAnisotropy: new TexturedPBRMaterial({
      name: "variant-specular-sheen-anisotropy-textures",
      baseColor: [0.52, 0.2, 0.26, 1],
      metallic: 0.32,
      roughness: 0.34,
      specularFactor: 0.92,
      specularColorFactor: [0.85, 0.9, 1],
      sheenColorFactor: [1, 0.35, 0.44],
      sheenRoughnessFactor: 0.38,
      anisotropyStrength: 0.78,
      anisotropyRotation: 0.7,
      specularTexture: pixelTexture("specular-factor", [255, 255, 255, 220], "linear"),
      specularColorTexture: pixelTexture("specular-color", [210, 225, 255, 255], "srgb"),
      sheenColorTexture: pixelTexture("sheen-color", [255, 80, 120, 255], "srgb"),
      sheenRoughnessTexture: pixelTexture("sheen-roughness", [255, 255, 255, 160], "linear"),
      anisotropyTexture: pixelTexture("anisotropy", [128, 160, 230, 255], "linear")
    }),
    iridescence: new TexturedPBRMaterial({
      name: "variant-iridescence-textures",
      baseColor: [0.24, 0.3, 0.88, 1],
      metallic: 0.06,
      roughness: 0.18,
      iridescenceFactor: 0.9,
      iridescenceIor: 1.58,
      iridescenceThicknessMinimum: 120,
      iridescenceThicknessMaximum: 720,
      dispersion: 12,
      specularFactor: 0.9,
      iridescenceTexture: pixelTexture("iridescence-factor", [240, 255, 255, 255], "linear"),
      iridescenceThicknessTexture: pixelTexture("iridescence-thickness", [255, 190, 255, 255], "linear")
    }),
    clearcoatTransmissionVolume: new TexturedPBRMaterial({
      name: "variant-clearcoat-transmission-volume-textures",
      baseColor: [0.62, 0.88, 0.96, 0.88],
      metallic: 0.02,
      roughness: 0.18,
      clearcoatFactor: 0.82,
      clearcoatRoughnessFactor: 0.16,
      transmissionFactor: 0.48,
      diffuseTransmissionFactor: 0.22,
      diffuseTransmissionColorFactor: [0.62, 0.9, 1],
      volumeThicknessFactor: 0.36,
      volumeAttenuationDistance: 2.8,
      volumeAttenuationColor: [0.62, 0.8, 1],
      clearcoatTexture: pixelTexture("combined-clearcoat-factor", [255, 255, 255, 255], "linear"),
      clearcoatRoughnessTexture: pixelTexture("combined-clearcoat-roughness", [255, 112, 255, 255], "linear"),
      clearcoatNormalTexture: pixelTexture("combined-clearcoat-normal", [128, 128, 255, 255], "linear"),
      transmissionTexture: pixelTexture("combined-transmission-factor", [210, 255, 255, 255], "linear"),
      diffuseTransmissionTexture: pixelTexture("combined-diffuse-transmission", [180, 250, 255, 255], "linear"),
      diffuseTransmissionColorTexture: pixelTexture("combined-diffuse-transmission-color", [120, 210, 255, 255], "srgb"),
      volumeThicknessTexture: pixelTexture("combined-volume-thickness", [255, 170, 255, 255], "linear")
    }),
    specularSheenAnisotropyIridescence: new TexturedPBRMaterial({
      name: "variant-specular-sheen-anisotropy-iridescence-textures",
      baseColor: [0.38, 0.24, 0.92, 1],
      metallic: 0.18,
      roughness: 0.22,
      specularFactor: 0.9,
      specularColorFactor: [0.78, 0.88, 1],
      sheenColorFactor: [0.8, 0.25, 0.95],
      sheenRoughnessFactor: 0.32,
      anisotropyStrength: 0.72,
      anisotropyRotation: 0.48,
      iridescenceFactor: 0.82,
      iridescenceIor: 1.52,
      iridescenceThicknessMinimum: 160,
      iridescenceThicknessMaximum: 680,
      dispersion: 8,
      specularTexture: pixelTexture("combined-specular-factor", [255, 255, 255, 230], "linear"),
      specularColorTexture: pixelTexture("combined-specular-color", [190, 220, 255, 255], "srgb"),
      sheenColorTexture: pixelTexture("combined-sheen-color", [220, 90, 255, 255], "srgb"),
      sheenRoughnessTexture: pixelTexture("combined-sheen-roughness", [255, 255, 255, 150], "linear"),
      anisotropyTexture: pixelTexture("combined-anisotropy", [128, 175, 235, 255], "linear"),
      iridescenceTexture: pixelTexture("combined-iridescence-factor", [240, 255, 255, 255], "linear"),
      iridescenceThicknessTexture: pixelTexture("combined-iridescence-thickness", [255, 190, 255, 255], "linear")
    })
  };
}

function pixelTexture(label: string, rgba: readonly [number, number, number, number], colorSpace: "linear" | "srgb"): Texture {
  return new Texture({ width: 1, height: 1, label, colorSpace, data: new Uint8Array(rgba) });
}

function readPixel(renderer: Renderer, x: number, y: number): readonly number[] {
  return Array.from(renderer.device.readPixels(x, y, 1, 1));
}

function rgb(pixel: readonly number[]): number {
  return (pixel[0] ?? 0) + (pixel[1] ?? 0) + (pixel[2] ?? 0);
}

function knownLimits(): readonly string[] {
  return [
    "This example proves bounded WebGL2 rendering of sampler-budgeted advanced PBR texture variants.",
    "It includes two combined extension texture-map variants, but does not prove every arbitrary all-extension permutation in one shader.",
    "It does not prove photometric parity against Unity, Unreal, or external PBR conformance suites."
  ];
}

function serializeError(error: unknown): string {
  const details = typeof error === "object" && error !== null && "details" in error
    ? JSON.stringify((error as { readonly details?: unknown }).details)
    : "";
  const stack = error instanceof Error ? error.stack ?? error.message : String(error);
  return details ? `${stack}\n${details}` : stack;
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #06080b; color: #f7f8fb; }
    body { margin: 0; min-height: 100vh; background: #06080b; }
    main { display: grid; grid-template-columns: minmax(0, 1fr) 380px; min-height: 100vh; }
    canvas { width: 100%; height: 100vh; display: block; background: #06080b; }
    pre { margin: 0; padding: 16px; overflow: auto; border-left: 1px solid #263342; background: #0a1017; color: #b8f7d0; font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; }
    @media (max-width: 820px) {
      main { grid-template-columns: 1fr; grid-template-rows: minmax(360px, 64vh) minmax(0, 36vh); }
      canvas { height: 64vh; }
      pre { border-left: 0; border-top: 1px solid #263342; }
    }
  `;
  document.head.append(style);
}
