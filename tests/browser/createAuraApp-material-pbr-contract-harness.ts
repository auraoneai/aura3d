import {
  camera,
  createAuraApp,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraMaterialSpec
} from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

type MaterialFeatureStatus = "pass" | "partial" | "unsupported";

interface PixelBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface VariantPixelMetrics {
  readonly width: number;
  readonly height: number;
  readonly nonBackgroundPixels: number;
  readonly colorBuckets: number;
  readonly foregroundBounds: PixelBounds;
  readonly meanRgb: readonly [number, number, number];
  readonly meanLuma: number;
  /**
   * Mean absolute luma difference between horizontally adjacent foreground
   * pixels. A flat untextured material varies only with shading gradients, so a
   * sampled base-color texture measurably increases local detail. This is what
   * separates "the colour changed" from "a texture is actually sampled".
   */
  readonly localLumaVariation: number;
  /**
   * `localLumaVariation` divided by mean foreground luma. Absolute variation is
   * brightness-confounded: a bright flat material shows larger absolute adjacent
   * differences than a dark textured one purely from shading gradients, which is
   * why the absolute form produced a false negative here. Normalizing by mean
   * luma makes "how much detail per unit brightness" comparable across variants.
   */
  readonly relativeLumaVariation: number;
  /**
   * Mean per-pixel chroma (max RGB channel minus min RGB channel) across the
   * foreground. An achromatic flat override is near zero by construction, while
   * a sampled base-color texture carries real hue spread. This is the metric a
   * material swap cannot fake without actually sampling colour data.
   */
  readonly meanChroma: number;
  readonly hash: string;
}

interface VariantCapture {
  readonly id: string;
  readonly feature: string;
  readonly material?: AuraMaterialSpec;
  readonly diagnostics: {
    readonly backend: string;
    readonly runtimeBackend: string | undefined;
    readonly drawCalls: number;
    readonly renderSize: readonly number[];
  };
  readonly pixels: VariantPixelMetrics;
}

interface VariantComparison {
  readonly feature: string;
  readonly variantA: string;
  readonly variantB: string;
  /** Mean absolute per-channel difference over the compared region, 0-255. */
  readonly pixelDelta: number;
  /**
   * Fraction of compared-region pixels whose summed channel difference exceeds a
   * visible threshold. A mean alone can be dragged down by the large background
   * area inside the union bounds, so the fraction records how much of the region
   * actually changed rather than by how much on average.
   */
  readonly changedPixelFraction: number;
  readonly meanLumaDelta: number;
  readonly foregroundBounds: PixelBounds;
}

interface UnsupportedFeatureReport {
  readonly feature: string;
  readonly status: MaterialFeatureStatus;
  readonly reason: string;
}

interface RootMaterialContractRunner {
  readonly imports: readonly string[];
  readonly typedTextureAsset: {
    readonly id: string;
    readonly typed: string;
    readonly textureCount: number;
    readonly materialCount: number;
  };
  renderVariant(id: string): Promise<VariantCapture>;
  compareVariants(variantA: string, variantB: string): VariantComparison;
  unsupportedFeatures(): readonly UnsupportedFeatureReport[];
  helperStatuses(): readonly {
    readonly name: string;
    readonly status: "root-proven" | "partial" | "internal-only" | "roadmap" | "unsupported";
    readonly reason: string;
  }[];
}

interface InternalCapture {
  readonly publicCapture: VariantCapture;
  readonly pixels: Uint8Array;
}

type VariantKind = "material" | "typed-textured-asset" | "typed-texture-off";

interface MaterialVariantDefinition {
  readonly id: string;
  readonly feature: string;
  readonly kind: VariantKind;
  readonly material?: AuraMaterialSpec;
}

declare global {
  interface Window {
    __AURA3D_ROOT_MATERIAL_CONTRACT_RUNNER__?: RootMaterialContractRunner;
    __AURA3D_ROOT_MATERIAL_CONTRACT_ERROR__?: string;
  }
}

const captures = new Map<string, InternalCapture>();

const variants: readonly MaterialVariantDefinition[] = [
  {
    id: "base-color-a",
    feature: "base-color",
    kind: "material",
    material: material.pbr({ name: "root-contract-base-color-red", color: "#e6462e", roughness: 0.48, metallic: 0 })
  },
  {
    id: "base-color-b",
    feature: "base-color",
    kind: "material",
    material: material.pbr({ name: "root-contract-base-color-blue", color: "#2f78ff", roughness: 0.48, metallic: 0 })
  },
  {
    id: "metallic-roughness-low",
    feature: "metallic-roughness",
    kind: "material",
    material: material.pbr({
      name: "root-contract-rough-dielectric",
      color: "#d9e2ea",
      roughness: 0.96,
      metallic: 0,
      envMapIntensity: 0.55
    })
  },
  {
    id: "metallic-roughness-high",
    feature: "metallic-roughness",
    kind: "material",
    material: material.chrome({
      name: "root-contract-polished-metal",
      color: "#d9e2ea",
      roughness: 0.025,
      metallic: 1,
      envMapIntensity: 2
    })
  },
  {
    id: "emissive-off",
    feature: "emissive",
    kind: "material",
    material: material.pbr({ name: "root-contract-emissive-off", color: "#111827", roughness: 0.45, metallic: 0 })
  },
  {
    id: "emissive-on",
    feature: "emissive",
    kind: "material",
    material: material.emissive({
      name: "root-contract-emissive-on",
      color: "#111827",
      emissive: "#42f5ff",
      emissiveIntensity: 4.2,
      roughness: 0.35
    })
  },
  {
    id: "alpha-opaque",
    feature: "alpha",
    kind: "material",
    material: material.pbr({ name: "root-contract-alpha-opaque", color: "#eef7ff", roughness: 0.18, metallic: 0, opacity: 1 })
  },
  {
    id: "alpha-transparent",
    feature: "alpha",
    kind: "material",
    material: material.glass({
      name: "root-contract-alpha-transparent",
      color: "#eef7ff",
      roughness: 0.08,
      opacity: 0.28,
      transmission: 0,
      envMapIntensity: 0.9
    })
  },
  {
    id: "clearcoat-low",
    feature: "clearcoat",
    kind: "material",
    material: material.clearcoat({
      name: "root-contract-clearcoat-low",
      color: "#ef233c",
      roughness: 0.45,
      clearcoat: 0,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.7
    })
  },
  {
    id: "clearcoat-high",
    feature: "clearcoat",
    kind: "material",
    material: material.clearcoat({
      name: "root-contract-clearcoat-high",
      color: "#ef233c",
      roughness: 0.055,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.7
    })
  },
  {
    id: "typed-textured-asset",
    feature: "base-color-texture",
    kind: "typed-textured-asset"
  },
  // Controlled texture on/off pair. Both variants render the same typed asset at
  // the same camera and lighting; the only difference is whether the asset's
  // authored base-color textures are used or replaced by a flat, deliberately
  // achromatic untextured material. A real sampled texture must change a
  // substantial fraction of the model region, carry real hue spread the
  // achromatic override cannot produce, and show more brightness-normalized
  // local detail.
  {
    id: "typed-texture-on",
    feature: "base-color-texture-controlled",
    kind: "typed-textured-asset"
  },
  {
    id: "typed-texture-off",
    feature: "base-color-texture-controlled",
    kind: "typed-texture-off",
    material: material.pbr({
      // Deliberately neutral grey: an achromatic override makes the chroma check
      // meaningful, because any measured hue spread must then come from sampled
      // texture data rather than from the override colour itself.
      name: "root-contract-texture-off-flat",
      color: "#909090",
      roughness: 0.55,
      metallic: 0
    })
  }
];

void run().catch((error: unknown) => {
  window.__AURA3D_ROOT_MATERIAL_CONTRACT_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  const initialVariant = requireVariant(new URL(window.location.href).searchParams.get("initial") ?? "base-color-a");
  const app = createAuraApp(requiredElement("material-contract-stage"), {
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: sceneForVariant(initialVariant)
  });
  let currentVariantId = initialVariant.id;
  await waitForAppDraw(app);

  window.__AURA3D_ROOT_MATERIAL_CONTRACT_RUNNER__ = {
    imports: ["@aura3d/engine", "../../src/aura-assets"],
    typedTextureAsset: {
      id: "robotcand",
      typed: "assets.robotcand",
      textureCount: Array.isArray(assets.robotcand.metadata.textures) ? assets.robotcand.metadata.textures.length : 0,
      materialCount: Array.isArray(assets.robotcand.metadata.materials) ? assets.robotcand.metadata.materials.length : 0
    },
    renderVariant: async (id: string): Promise<VariantCapture> => {
      const variant = requireVariant(id);
      if (currentVariantId !== id) {
        app.setScene(sceneForVariant(variant));
        currentVariantId = id;
      }
      await waitForAppDraw(app);
      const capture = readVariantCapture(app, variant);
      captures.set(id, capture);
      return capture.publicCapture;
    },
    compareVariants: (variantA: string, variantB: string): VariantComparison => compareVariants(variantA, variantB),
    unsupportedFeatures: () => [
      {
        feature: "alpha",
        status: "partial",
        reason: "Root material specs accept opacity and glass helpers, but this root WebGL material contract does not prove transparent blending or sorting."
      },
      {
        feature: "normal-map",
        status: "unsupported",
        reason: "Root AuraMaterialSpec carries normal/procedural texture intent, but this root primitive path does not bind sampled normal maps; package/internal renderer tests are separate."
      },
      {
        feature: "glass-transmission",
        status: "partial",
        reason: "Root material.glass proves opacity/alpha only when pixels pass; refraction, volume, IOR, and real transmission remain unproven in root createAuraApp pixels."
      },
      {
        feature: "double-sided",
        status: "unsupported",
        reason: "The public material helper surface has no root double-sided material contract; culling/backface behavior remains route-specific evidence."
      }
    ],
    helperStatuses: () => [
      {
        name: "material.pbr",
        status: "partial",
        reason: "Base color plus metallic/roughness fields are root-pixel tested here, but this is not a full PBR parity claim."
      },
      {
        name: "material.physical",
        status: "partial",
        reason: "Alias of material.pbr in the public root API; no separate physical renderer contract is proven."
      },
      {
        name: "material.emissive",
        status: "root-proven",
        reason: "Root pixels compare emissive on/off material variants and prove visible emissive color/intensity response without claiming bloom."
      },
      {
        name: "material.metal",
        status: "partial",
        reason: "Root pixels test metallic/roughness contrast, but not environment-map reflection parity."
      },
      {
        name: "material.chrome",
        status: "partial",
        reason: "Root pixels test metallic/roughness contrast, but not HDR environment reflections or chrome parity."
      },
      {
        name: "material.glass",
        status: "partial",
        reason: "Root specs accept opacity/glass intent, but this contract does not prove transparent blending, refraction, or volumetric transmission."
      },
      {
        name: "material.clearcoat",
        status: "partial",
        reason: "Root specs carry clearcoat parameters, but the measured root clearcoat pixel delta is below the proof threshold."
      }
    ]
  };
}

function sceneForVariant(variant: MaterialVariantDefinition) {
  if (variant.kind === "typed-texture-off") {
    // Identical framing and lighting to the textured variant. Only the material
    // changes, so any pixel delta is attributable to texture sampling.
    return scene()
      .background("#05070d")
      .camera(camera.frameAsset(assets.robotcand, {
        targetHeight: 2.2,
        padding: 1.4,
        fov: 34,
        azimuth: 0.62,
        elevation: 0.26
      }))
      .add(model(assets.robotcand, {
        targetHeight: 2.2,
        name: "root material typed texture-off probe",
        material: variant.material
      }).runtime({ id: "typed-texture-off" }))
      .add(lights.studio());
  }

  if (variant.kind === "typed-textured-asset") {
    return scene()
      .background("#05070d")
      .camera(camera.frameAsset(assets.robotcand, {
        targetHeight: 2.2,
        padding: 1.4,
        fov: 34,
        azimuth: 0.62,
        elevation: 0.26
      }))
      .add(model(assets.robotcand, { targetHeight: 2.2, name: "root material typed texture probe" }).runtime({ id: "typed-textured-asset" }))
      .add(lights.studio());
  }

  return scene()
    .background("#05070d")
    .camera(camera.orbit({
      target: [0, 0.72, 0],
      distance: 3.2,
      fov: 34,
      position: [1.9, 1.45, 2.55]
    }))
    .add(primitives.sphere({
      name: `root material contract ${variant.id}`,
      material: variant.material
    }).position(0, 0.72, 0).scale(1.06))
    .add(lights.studio());
}

function readVariantCapture(app: ReturnType<typeof createAuraApp>, variant: MaterialVariantDefinition): InternalCapture {
  const canvas = app.canvas;
  if (!canvas) throw new Error("Aura app did not expose a canvas.");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for root material contract proof.");
  const width = canvas.width;
  const height = canvas.height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const metrics = readPixelMetrics(pixels, width, height);
  const diagnostics = app.diagnostics();
  return {
    publicCapture: {
      id: variant.id,
      feature: variant.feature,
      material: variant.material,
      diagnostics: {
        backend: diagnostics.backend,
        runtimeBackend: diagnostics.renderer?.runtime.backend,
        drawCalls: diagnostics.drawCalls,
        renderSize: diagnostics.renderSize
      },
      pixels: metrics
    },
    pixels
  };
}

function readPixelMetrics(pixels: Uint8Array, width: number, height: number): VariantPixelMetrics {
  const background = [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0] as const;
  const buckets = new Set<string>();
  let nonBackgroundPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let redSum = 0;
  let greenSum = 0;
  let blueSum = 0;
  let lumaSum = 0;
  let chromaSum = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const alpha = pixels[index + 3] ?? 0;
      if (!isForegroundPixel(red, green, blue, alpha, background)) continue;
      nonBackgroundPixels += 1;
      buckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      redSum += red;
      greenSum += green;
      blueSum += blue;
      lumaSum += luma(red, green, blue);
      chromaSum += Math.max(red, green, blue) - Math.min(red, green, blue);
    }
  }

  // Second pass: local luma variation across horizontally adjacent foreground
  // pixels inside the model region.
  let variationSum = 0;
  let variationSamples = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x + 1 < width; x += 1) {
      const left = (y * width + x) * 4;
      const right = (y * width + x + 1) * 4;
      const leftForeground = isForegroundPixel(
        pixels[left] ?? 0, pixels[left + 1] ?? 0, pixels[left + 2] ?? 0, pixels[left + 3] ?? 0, background
      );
      const rightForeground = isForegroundPixel(
        pixels[right] ?? 0, pixels[right + 1] ?? 0, pixels[right + 2] ?? 0, pixels[right + 3] ?? 0, background
      );
      if (!leftForeground || !rightForeground) continue;
      variationSum += Math.abs(
        luma(pixels[left] ?? 0, pixels[left + 1] ?? 0, pixels[left + 2] ?? 0)
        - luma(pixels[right] ?? 0, pixels[right + 1] ?? 0, pixels[right + 2] ?? 0)
      );
      variationSamples += 1;
    }
  }

  const denominator = Math.max(1, nonBackgroundPixels);
  const meanLuma = lumaSum / denominator;
  const localLumaVariation = variationSum / Math.max(1, variationSamples);
  return {
    width,
    height,
    nonBackgroundPixels,
    colorBuckets: buckets.size,
    localLumaVariation: Number(localLumaVariation.toFixed(4)),
    relativeLumaVariation: Number((localLumaVariation / Math.max(1, meanLuma)).toFixed(4)),
    meanChroma: Number((chromaSum / denominator).toFixed(4)),
    foregroundBounds: maxX >= minX && maxY >= minY
      ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
      : { x: 0, y: 0, width: 0, height: 0 },
    meanRgb: [
      Number((redSum / denominator).toFixed(3)),
      Number((greenSum / denominator).toFixed(3)),
      Number((blueSum / denominator).toFixed(3))
    ],
    meanLuma: Number(meanLuma.toFixed(3)),
    hash: hashPixels(pixels)
  };
}

function compareVariants(variantA: string, variantB: string): VariantComparison {
  const first = requireCapture(variantA);
  const second = requireCapture(variantB);
  const bounds = unionBounds(first.publicCapture.pixels.foregroundBounds, second.publicCapture.pixels.foregroundBounds);
  let totalDelta = 0;
  let samples = 0;
  let changedPixels = 0;
  let comparedPixels = 0;
  const width = first.publicCapture.pixels.width;
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const index = (y * width + x) * 4;
      const redDelta = Math.abs((first.pixels[index] ?? 0) - (second.pixels[index] ?? 0));
      const greenDelta = Math.abs((first.pixels[index + 1] ?? 0) - (second.pixels[index + 1] ?? 0));
      const blueDelta = Math.abs((first.pixels[index + 2] ?? 0) - (second.pixels[index + 2] ?? 0));
      totalDelta += redDelta + greenDelta + blueDelta;
      samples += 3;
      comparedPixels += 1;
      if (redDelta + greenDelta + blueDelta > CHANGED_PIXEL_THRESHOLD) changedPixels += 1;
    }
  }
  return {
    feature: first.publicCapture.feature,
    variantA,
    variantB,
    pixelDelta: Number((totalDelta / Math.max(1, samples)).toFixed(3)),
    changedPixelFraction: Number((changedPixels / Math.max(1, comparedPixels)).toFixed(4)),
    meanLumaDelta: Number(Math.abs(first.publicCapture.pixels.meanLuma - second.publicCapture.pixels.meanLuma).toFixed(3)),
    foregroundBounds: bounds
  };
}

/** Summed per-channel difference above which a pixel counts as visibly changed. */
const CHANGED_PIXEL_THRESHOLD = 24;

function isForegroundPixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
  background: readonly [number, number, number]
): boolean {
  const backgroundDelta = Math.abs(red - background[0]) + Math.abs(green - background[1]) + Math.abs(blue - background[2]);
  return alpha > 8 && backgroundDelta > 24;
}

function luma(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function unionBounds(first: PixelBounds, second: PixelBounds): PixelBounds {
  if (first.width <= 0) return second;
  if (second.width <= 0) return first;
  const minX = Math.min(first.x, second.x);
  const minY = Math.min(first.y, second.y);
  const maxX = Math.max(first.x + first.width - 1, second.x + second.width - 1);
  const maxY = Math.max(first.y + first.height - 1, second.y + second.height - 1);
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function hashPixels(pixels: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const value of pixels) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function requireVariant(id: string): MaterialVariantDefinition {
  const variant = variants.find((candidate) => candidate.id === id);
  if (!variant) throw new Error(`Unknown material contract variant: ${id}`);
  return variant;
}

function requireCapture(id: string): InternalCapture {
  const capture = captures.get(id);
  if (!capture) throw new Error(`Material contract variant was not captured before comparison: ${id}`);
  return capture;
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  await waitFor(() => app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0, 30_000);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for Aura3D root material contract harness.");
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}
