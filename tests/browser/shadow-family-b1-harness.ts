import {
  DEFAULT_INSTANCED_PBR_SHADER_NAME,
  DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME,
  DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_NAME,
  DEFAULT_SKINNED_LIT_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_SHADER_NAME,
  Geometry,
  InstancedPBRMaterial,
  PBRMaterial,
  Renderer,
  Sampler,
  ShaderModule,
  ShadowMap,
  ShadowPass,
  TextureBinding,
  computePerspectiveCameraFrame,
  createDefaultShaderLibrary,
  createShadowAtlasPlan,
  createShadowFilterKernel,
  createSpotShadowProjection,
  type RenderDevice,
  type RenderItem,
} from "@aura3d/rendering";
import {
  PointLight,
  Scene,
  SpotLight,
  composeMat4,
  multiplyMat4,
  type Mat4,
} from "@aura3d/scene";

declare global {
  interface Window {
    __AURA3D_SHADOW_FAMILY_B1__?: unknown;
  }
}

const WIDTH = 640;
const HEIGHT = 480;
const SPOT_EYE: readonly [number, number, number] = [0, 3.6, 3.0];
const SPOT_TARGET: readonly [number, number, number] = [0, -0.4, -0.2];
const SPOT_ANGLE = 0.55;
const SPOT_PENUMBRA = 0.4;
const SPOT_RANGE = 10;
const SPOT_DEPTH_SIZE = 1024;
const SPOT_DEPTH_NEAR = 2;

void run().catch((error) => {
  window.__AURA3D_SHADOW_FAMILY_B1__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
});

async function run(): Promise<void> {
  const root = document.getElementById("shadow-family-b1-root");
  if (!(root instanceof HTMLElement)) throw new Error("Missing shadow-family-b1 root.");
  const spotCanvas = createCanvas("b1-spot-canvas");
  const pointCanvas = createCanvas("b1-point-canvas");
  root.append(spotCanvas, pointCanvas);

  const spot = await renderSpotFamily(spotCanvas);
  const shaders = await verifySpotShaderCompilation();
  const point = await renderPointFamily(pointCanvas);
  const atlas = createShadowAtlasPlan(
    [
      { id: "directional-key", size: 1024, priority: 3 },
      { id: "spot-stage", size: 1024, priority: 2 },
      { id: "point-hall", size: 512, priority: 1 },
    ],
    2048,
  );

  window.__AURA3D_SHADOW_FAMILY_B1__ = {
    status: "ready",
    schema: "a3d-shadow-family-b1",
    scene: { width: WIDTH, height: HEIGHT },
    spot,
    shaders,
    point,
    atlas: {
      atlasSize: atlas.atlasSize,
      utilization: atlas.utilization,
      allocationIds: atlas.allocations.map((entry) => entry.id),
      allocationCount: atlas.allocations.length,
      fallbackCount: atlas.fallbacks.length,
      warnings: atlas.warnings,
    },
  };
}

interface SpotFamilyResult {
  readonly depthRendered: boolean;
  readonly depthCasterCount: number;
  readonly collectedDirectionMatch: boolean;
  readonly spotMatrixUsed: readonly number[];
  readonly pcf: FrameResult;
  readonly singleTap: FrameResult;
  readonly unshadowed: FrameResult;
  readonly shadowDropCount: number;
  readonly singleTapDropCount: number;
  readonly directionalOnlyDropCount: number;
  readonly pcfVsSingleDiffCount: number;
  readonly litCornerDeltaPcfVsUnshadowed: number;
  readonly litCornerDeltaPcfVsSingle: number;
  readonly shadowPatchLumaPcf: number;
  readonly shadowPatchLumaSingle: number;
  readonly shadowPatchLumaUnshadowed: number;
  readonly litPatchLumaPcf: number;
  readonly litPatchLumaUnshadowed: number;
  readonly dataUrl: string;
}

interface FrameResult {
  readonly diagnostics: { drawCalls: number; lastError: string | null };
  readonly pixelStats: {
    readonly meanLuma: number;
    readonly nonBlackPixels: number;
    readonly uniqueColorBuckets: number;
  };
}

async function renderSpotFamily(canvas: HTMLCanvasElement): Promise<SpotFamilyResult> {
  const direction = normalize3([
    SPOT_TARGET[0] - SPOT_EYE[0],
    SPOT_TARGET[1] - SPOT_EYE[1],
    SPOT_TARGET[2] - SPOT_EYE[2],
  ]);
  const lightWorld = rigidMatrixLookingAlong(SPOT_EYE, direction);
  const viewMatrix = invertRigid(lightWorld);
  const projection = createSpotShadowProjection(SPOT_ANGLE, SPOT_RANGE, SPOT_DEPTH_NEAR);
  const spotMatrix = multiplyMat4(projection.projectionMatrix as Mat4, viewMatrix as Mat4);

  const scene = new Scene();
  const spot = new SpotLight("b1-spot-key");
  spot.castsShadow = true;
  spot.intensity = 60;
  spot.color = [1, 0.95, 0.85];
  spot.angle = SPOT_ANGLE;
  spot.penumbra = SPOT_PENUMBRA;
  spot.range = SPOT_RANGE;
  spot.transform.setLocalMatrix(lightWorld as Mat4, { decompose: false });
  scene.root.addChild(spot);
  scene.updateWorldTransforms();

  const world = spot.transform.worldMatrix;
  const collectedDirection: readonly [number, number, number] = [-world[8]!, -world[9]!, -world[10]!];
  const collectedDirectionMatch =
    Math.abs(collectedDirection[0]! - direction[0]!) < 1e-4 &&
    Math.abs(collectedDirection[1]! - direction[1]!) < 1e-4 &&
    Math.abs(collectedDirection[2]! - direction[2]!) < 1e-4;
  if (!collectedDirectionMatch) {
    throw new Error(
      `Spot light basis mismatch: collected ${collectedDirection} vs intended ${direction}. ` +
        `world=${Array.from(world).map((v) => Number(v.toFixed(4)))} ` +
        `local=${lightWorld.map((v) => Number(v.toFixed(4)))}`,
    );
  }

  const items = spotSceneItems();
  const frame = computePerspectiveCameraFrame(
    { min: [-2.4, -0.9, -2.4], max: [2.4, 1.3, 2.4] },
    { width: WIDTH, height: HEIGHT },
    { yawRadians: -0.35, pitchRadians: -0.24, paddingRatio: 0.2, fovYRadians: 0.6, nearPadding: 0.18, farPadding: 2.6 },
  );

  const renderer = await Renderer.create({
    canvas,
    width: WIDTH,
    height: HEIGHT,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0.012, 0.014, 0.018, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets"],
  });
  try {
    const shaderLibrary = createDefaultShaderLibrary();
    const depthMap = new ShadowMap({
      size: SPOT_DEPTH_SIZE,
      bias: 0.001,
      filter: "pcf",
      pcfRadius: 1,
      pcfSamples: 9,
      label: "b1-spot-depth",
    });
    const shadowPass = new ShadowPass({
      light: spot,
      casters: items,
      shadowMap: depthMap,
      viewProjectionMatrix: spotMatrix,
      shaderLibrary,
    });
    const device = renderer.device;
    device.beginFrame(WIDTH, HEIGHT);
    let depthRendered = false;
    let depthCasterCount = 0;
    try {
      const depthResult = shadowPass.execute({ device, width: WIDTH, height: HEIGHT });
      depthRendered = depthResult.rendered;
      depthCasterCount = depthResult.casterCount;
    } finally {
      device.endFrame();
    }
    if (!depthRendered) throw new Error("Spot depth pass did not render.");
    const forwardMap = shadowPass.getForwardShadowMap({
      lightMatrix: spotMatrix,
      strength: 0.85,
      slopeBias: 1,
      bias: 0.001,
    });
    if (!forwardMap) throw new Error("Spot depth pass produced no forward map.");
    const depthTexture = forwardMap.texture.texture;
    if (!depthTexture) throw new Error("Spot depth pass produced no depth texture.");

    const pcfKernel = createShadowFilterKernel({ filter: "pcf", pcfRadius: 1, pcfSamples: 9 });
    const singleKernel = createShadowFilterKernel({ filter: "none" });
    const texel: readonly [number, number] = [1 / SPOT_DEPTH_SIZE, 1 / SPOT_DEPTH_SIZE];
    const spotEntry = (filterKernel: typeof pcfKernel) => ({
      texture: new TextureBinding({
        name: "u_spotShadowMapTexture",
        texture: depthTexture,
        sampler: new Sampler({
          minFilter: "nearest",
          magFilter: "nearest",
          addressU: "clamp-to-edge",
          addressV: "clamp-to-edge",
        }),
        required: true,
      }),
      lightPosition: [SPOT_EYE[0], SPOT_EYE[1], SPOT_EYE[2]] as readonly [number, number, number],
      lightDirection: direction,
      angle: SPOT_ANGLE,
      penumbra: SPOT_PENUMBRA,
      range: SPOT_RANGE,
      shadowMatrix: spotMatrix,
      strength: 0.85,
      bias: 0.001,
      slopeBias: 1,
      texelSize: texel,
      filterKernel,
    });

    const environmentLighting = {
      color: [0.1, 0.13, 0.18] as readonly [number, number, number],
      intensity: 0.32,
    };
    const renderWithMap = (spotLight: ReturnType<typeof spotEntry> | undefined, directionalMap = false) => {
      const diagnostics = renderer.render(
        {
          scene,
          renderItems: items,
          environmentLighting,
          ...(spotLight
            ? {
                shadowMap: {
                  ...forwardMap,
                  spotLight,
                },
              }
            : directionalMap
              ? { shadowMap: { ...forwardMap } }
              : {}),
          cameraPolicy: "require",
          cameraPosition: frame.cameraPosition,
        },
        {
          viewProjectionMatrix: frame.viewProjectionMatrix,
          viewMatrix: frame.viewMatrix,
          projectionMatrix: frame.projectionMatrix,
        },
      );
      return { diagnostics, pixels: device.readPixels(0, 0, WIDTH, HEIGHT) };
    };

    const pcfRender = renderWithMap(spotEntry(pcfKernel));
    const singleRender = renderWithMap(spotEntry(singleKernel));
    const unshadowedRender = renderWithMap(undefined);
    // Control: the same perspective depth sampled through the legacy
    // directional factor (no spot entry). Agreement with the spot path shows the
    // new override neither invents nor loses shadow mass on identical inputs.
    const directionalOnlyRender = renderWithMap(undefined, true);
    const directionalOnlyDropCount = countDrops(directionalOnlyRender.pixels, unshadowedRender.pixels, 12);
    // Leave the shadowed PCF frame presented for the screenshot.
    renderWithMap(spotEntry(pcfKernel));
    const dataUrl = canvas.toDataURL("image/png");

    const pcf = summarizeFrame(pcfRender.diagnostics, pcfRender.pixels);
    const singleTap = summarizeFrame(singleRender.diagnostics, singleRender.pixels);
    const unshadowed = summarizeFrame(unshadowedRender.diagnostics, unshadowedRender.pixels);
    const pcfPixels = pcfRender.pixels;
    const singlePixels = singleRender.pixels;
    const unshadowedPixels = unshadowedRender.pixels;

    for (const geometry of items) geometry.geometry.dispose();
    shadowPass.dispose();
    renderer.dispose();

    return {
      depthRendered,
      depthCasterCount,
      collectedDirectionMatch,
      spotMatrixUsed: Array.from(spotMatrix),
      pcf,
      singleTap,
      unshadowed,
      shadowDropCount: countDrops(pcfPixels, unshadowedPixels, 12),
      singleTapDropCount: countDrops(singlePixels, unshadowedPixels, 12),
      directionalOnlyDropCount,
      pcfVsSingleDiffCount: countDrops(pcfPixels, singlePixels, 8),
      litCornerDeltaPcfVsUnshadowed: Math.abs(
        regionLuma(pcfPixels, 8, 8, 64, 48) - regionLuma(unshadowedPixels, 8, 8, 64, 48),
      ),
      litCornerDeltaPcfVsSingle: Math.abs(
        regionLuma(pcfPixels, 8, 8, 64, 48) - regionLuma(singlePixels, 8, 8, 64, 48),
      ),
      shadowPatchLumaPcf: regionLuma(pcfPixels, 345, 276, 40, 16),
      shadowPatchLumaSingle: regionLuma(singlePixels, 345, 276, 40, 16),
      shadowPatchLumaUnshadowed: regionLuma(unshadowedPixels, 345, 276, 40, 16),
      litPatchLumaPcf: regionLuma(pcfPixels, 170, 305, 80, 50),
      litPatchLumaUnshadowed: regionLuma(unshadowedPixels, 170, 305, 80, 50),
      dataUrl,
    };
  } catch (error) {
    renderer.dispose();
    throw error;
  }
}

function spotSceneItems(): RenderItem[] {
  const floorMaterial = new InstancedPBRMaterial({
    name: "b1-spot-floor",
    baseColor: [0.52, 0.54, 0.57, 1],
    metallic: 0,
    roughness: 0.72,
    environmentIntensity: 0.25,
  });
  const sphereMaterial = new InstancedPBRMaterial({
    name: "b1-spot-sphere",
    baseColor: [0.85, 0.88, 0.92, 1],
    metallic: 0.25,
    roughness: 0.32,
    environmentIntensity: 0.25,
  });
  return [
    {
      label: "b1-spot-floor",
      geometry: Geometry.litCube(1),
      material: floorMaterial,
      modelMatrix: composeMat4([0, -0.72, 0], [0, 0, 0, 1], [6, 0.1, 6]),
    },
    {
      label: "b1-spot-sphere",
      geometry: Geometry.uvSphere(0.55, 48, 24),
      material: sphereMaterial,
      modelMatrix: composeMat4([0, 0.12, 0], [0, 0, 0, 1], [1, 1, 1]),
    },
  ];
}

interface PointFamilyResult {
  readonly shadowed: FrameResult;
  readonly unshadowed: FrameResult;
  readonly shadowDropCount: number;
  readonly shadowPatchDelta: number;
  readonly litPatchAgreement: number;
  readonly shadowPatchLumaShadowed: number;
  readonly shadowPatchLumaUnshadowed: number;
  readonly dataUrl: string;
}

async function renderPointFamily(canvas: HTMLCanvasElement): Promise<PointFamilyResult> {
  const scene = new Scene();
  const point = new PointLight("b1-point-key");
  point.castsShadow = true;
  point.intensity = 14;
  point.color = [1, 0.93, 0.82];
  point.range = 8;
  point.transform.setPosition(0.4, 1.5, 1.1);
  scene.root.addChild(point);

  const floorGeometry = Geometry.litCube(1);
  const sphereGeometry = Geometry.uvSphere(0.5, 48, 24);
  const items: RenderItem[] = [
    {
      label: "b1-point-floor",
      geometry: floorGeometry,
      material: new PBRMaterial({
        name: "b1-point-floor-material",
        baseColor: [0.4, 0.42, 0.45, 1],
        metallic: 0,
        roughness: 0.8,
        environmentIntensity: 0.22,
      }),
      modelMatrix: composeMat4([0, -0.72, 0], [0, 0, 0, 1], [6, 0.1, 6]),
    },
    {
      label: "b1-point-sphere",
      geometry: sphereGeometry,
      material: new PBRMaterial({
        name: "b1-point-sphere-material",
        baseColor: [0.8, 0.84, 0.88, 1],
        metallic: 0.3,
        roughness: 0.35,
        environmentIntensity: 0.22,
      }),
      modelMatrix: composeMat4([0, 0.08, 0], [0, 0, 0, 1], [1, 1, 1]),
    },
  ];
  const frame = computePerspectiveCameraFrame(
    { min: [-2.4, -0.9, -2.4], max: [2.4, 1.3, 2.4] },
    { width: WIDTH, height: HEIGHT },
    { yawRadians: -0.4, pitchRadians: -0.22, paddingRatio: 0.2, fovYRadians: 0.6, nearPadding: 0.18, farPadding: 2.6 },
  );

  const renderer = await Renderer.create({
    canvas,
    width: WIDTH,
    height: HEIGHT,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0.012, 0.014, 0.018, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets"],
  });
  try {
    const renderWithShadow = (withShadow: boolean) => {
      const diagnostics = renderer.render(
        {
          scene,
          renderItems: items,
          environmentLighting: {
            color: [0.1, 0.13, 0.18],
            intensity: 0.3,
          },
          ...(withShadow
            ? {
                shadow: {
                  enabled: true,
                  light: point,
                  size: 512,
                  strength: 0.8,
                  bias: 0.001,
                  slopeBias: 1,
                  filter: "pcf" as const,
                  pcfRadius: 1,
                  pcfSamples: 9,
                  label: "b1-point-shadow",
                },
              }
            : {}),
          cameraPolicy: "require",
          cameraPosition: frame.cameraPosition,
        },
        {
          viewProjectionMatrix: frame.viewProjectionMatrix,
          viewMatrix: frame.viewMatrix,
          projectionMatrix: frame.projectionMatrix,
        },
      );
      return { diagnostics, pixels: renderer.device.readPixels(0, 0, WIDTH, HEIGHT) };
    };

    const shadowedRender = renderWithShadow(true);
    const unshadowedRender = renderWithShadow(false);
    // Leave the shadowed frame presented for the screenshot.
    renderWithShadow(true);
    const dataUrl = canvas.toDataURL("image/png");

    const shadowed = summarizeFrame(shadowedRender.diagnostics, shadowedRender.pixels);
    const unshadowed = summarizeFrame(unshadowedRender.diagnostics, unshadowedRender.pixels);
    floorGeometry.dispose();
    sphereGeometry.dispose();
    renderer.dispose();
    return {
      shadowed,
      unshadowed,
      shadowDropCount: countDrops(shadowedRender.pixels, unshadowedRender.pixels, 12),
      shadowPatchDelta: Number(
        (
          regionLuma(unshadowedRender.pixels, 290, 292, 70, 36) -
          regionLuma(shadowedRender.pixels, 290, 292, 70, 36)
        ).toFixed(4),
      ),
      litPatchAgreement: Math.abs(
        regionLuma(shadowedRender.pixels, 170, 305, 80, 50) -
          regionLuma(unshadowedRender.pixels, 170, 305, 80, 50),
      ),
      shadowPatchLumaShadowed: regionLuma(shadowedRender.pixels, 290, 292, 70, 36),
      shadowPatchLumaUnshadowed: regionLuma(unshadowedRender.pixels, 290, 292, 70, 36),
      dataUrl,
    };
  } catch (error) {
    renderer.dispose();
    throw error;
  }
}

function summarizeFrame(
  diagnostics: { drawCalls: number; lastError: string | null },
  pixels: Uint8Array,
): FrameResult {
  const buckets = new Set<string>();
  let nonBlackPixels = 0;
  let lumaTotal = 0;
  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    lumaTotal += luma(red, green, blue);
    if (red + green + blue > 24) nonBlackPixels += 1;
    buckets.add(`${red >> 4},${green >> 4},${blue >> 4}`);
  }
  return {
    diagnostics: { drawCalls: diagnostics.drawCalls, lastError: diagnostics.lastError },
    pixelStats: {
      meanLuma: Number((lumaTotal / Math.max(1, pixels.length / 4)).toFixed(4)),
      nonBlackPixels,
      uniqueColorBuckets: buckets.size,
    },
  };
}

function countDrops(current: Uint8Array, reference: Uint8Array, threshold: number): number {
  let count = 0;
  for (let offset = 0; offset + 3 < current.length && offset + 3 < reference.length; offset += 4) {
    const drop =
      luma(reference[offset] ?? 0, reference[offset + 1] ?? 0, reference[offset + 2] ?? 0) -
      luma(current[offset] ?? 0, current[offset + 1] ?? 0, current[offset + 2] ?? 0);
    if (drop > threshold) count += 1;
  }
  return count;
}

function regionLuma(pixels: Uint8Array, x: number, y: number, width: number, height: number): number {
  // Canvas top-origin coordinates: readPixels rows start at the bottom.
  let total = 0;
  let count = 0;
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const offset = ((HEIGHT - 1 - row) * WIDTH + column) * 4;
      total += luma(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0);
      count += 1;
    }
  }
  return Number((total / Math.max(1, count)).toFixed(4));
}

function luma(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function normalize3(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  return [value[0] / length, value[1] / length, value[2] / length];
}

function rigidMatrixLookingAlong(
  eye: readonly [number, number, number],
  direction: readonly [number, number, number],
): number[] {
  const z = [-direction[0], -direction[1], -direction[2]];
  const up: readonly [number, number, number] = [0, 1, 0];
  const x = normalize3([
    up[1] * z[2] - up[2] * z[1],
    up[2] * z[0] - up[0] * z[2],
    up[0] * z[1] - up[1] * z[0],
  ]);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  // Column-major: each axis is a contiguous column.
  return [
    x[0]!, x[1]!, x[2]!, 0,
    y[0]!, y[1]!, y[2]!, 0,
    z[0]!, z[1]!, z[2]!, 0,
    eye[0], eye[1], eye[2], 1,
  ];
}

function invertRigid(m: readonly number[]): number[] {
  const t0 = m[12]!;
  const t1 = m[13]!;
  const t2 = m[14]!;
  // Rotation rows of the inverse are the columns of the input; the translation
  // must use those same transposed rows (not the input's own rows).
  return [
    m[0]!, m[4]!, m[8]!, 0,
    m[1]!, m[5]!, m[9]!, 0,
    m[2]!, m[6]!, m[10]!, 0,
    -(m[0]! * t0 + m[1]! * t1 + m[2]! * t2),
    -(m[4]! * t0 + m[5]! * t1 + m[6]! * t2),
    -(m[8]! * t0 + m[9]! * t1 + m[10]! * t2),
    1,
  ];
}

function createCanvas(id: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.id = id;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return canvas;
}

interface SpotShaderCompilation {
  readonly shader: string;
  readonly variant: string | null;
  readonly compiled: boolean;
  readonly spotUniformCount: number;
  readonly error: string | null;
}

const SPOT_UNIFORM_NAMES = [
  "u_spotShadowMapTexture",
  "u_spotShadowMapEnabled",
  "u_spotShadowLightPosition",
  "u_spotShadowLightDirection",
  "u_spotShadowMatrix",
  "u_spotShadowCone",
  "u_spotShadowRange",
  "u_spotShadowStrength",
  "u_spotShadowBias",
  "u_spotShadowSlopeBias",
  "u_spotShadowTexelSize",
  "u_spotShadowPcfSampleCount",
  "u_spotShadowPcfSamples",
];

/**
 * Control experiment for a link failure: recompile the same preprocessed
 * sources with the B1 spot block removed. If the stripped sources link, the
 * spot addition broke the variant; if they also fail, the variant was already
 * over the driver's resource limits before B1 touched it.
 */
function tryCompileSpotStripped(
  device: RenderDevice,
  library: ReturnType<typeof createDefaultShaderLibrary>,
  name: string,
  variant: string | null,
): true | false | "inconclusive" {
  try {
    const compiled = variant === null
      ? library.compileSource(name)
      : library.compileVariant(name, variant);
    let fragment = compiled.fragment;
    const uniformBlock = `${SPOT_UNIFORM_NAMES.map((uniform) => spotUniformDeclaration(uniform)).join("\n")}\n`;
    if (!fragment.includes(uniformBlock)) return "inconclusive";
    fragment = fragment.replace(uniformBlock, "");
    const fnPattern = /float a3dTexturedPbrSpotShadowFactor\(vec3 worldPosition[\s\S]*?spotGate\);\n\}/;
    if (!fnPattern.test(fragment)) return "inconclusive";
    fragment = fragment.replace(fnPattern, "");
    const dispatchOpen = "a3dTexturedPbrResolveSpotShadowOverride(";
    const dispatchTail = ", kind, spotShadowLayer.z, v_worldPosition, mappedNormal, lightDirection);";
    if (
      fragment.indexOf(dispatchOpen) === -1 ||
      fragment.indexOf(dispatchTail) === -1 ||
      fragment.indexOf(dispatchOpen) !== fragment.lastIndexOf(dispatchOpen)
    ) {
      return "inconclusive";
    }
    fragment = fragment.replace(dispatchOpen, "").replace(dispatchTail, ");");
    const module = new ShaderModule({ ...compiled, fragment });
    const program = module.compile(device);
    program.dispose();
    module.dispose();
    return true;
  } catch {
    return false;
  }
}

function spotUniformDeclaration(uniform: string): string {
  if (uniform === "u_spotShadowPcfSamples") return "uniform vec4 u_spotShadowPcfSamples[32];";
  return `uniform ${spotUniformGlslType(uniform)} ${uniform};`;
}

function spotUniformGlslType(uniform: string): string {
  switch (uniform) {
    case "u_spotShadowMapTexture":
      return "sampler2D";
    case "u_spotShadowLightPosition":
    case "u_spotShadowLightDirection":
      return "vec3";
    case "u_spotShadowMatrix":
      return "mat4";
    case "u_spotShadowCone":
    case "u_spotShadowTexelSize":
      return "vec2";
    default:
      return "float";
  }
}

/**
 * Compiles every forward lit shader touched by the B1 spot GLSL on the real GL
 * driver and confirms the reflection exposes all 13 spot uniforms (so the
 * ForwardPass reflection guard binds them). A GLSL syntax error fails loudly
 * here instead of hiding in an unrendered material path.
 */
async function verifySpotShaderCompilation(): Promise<{ readonly programs: readonly SpotShaderCompilation[] }> {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const renderer = await Renderer.create({
    canvas,
    width: 16,
    height: 16,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0, 0, 0, 1],
  });
  try {
    const library = createDefaultShaderLibrary();
    const device: RenderDevice = renderer.device;
    const programs: SpotShaderCompilation[] = [];
    const targets = [
      DEFAULT_INSTANCED_PBR_SHADER_NAME,
      DEFAULT_SKINNED_LIT_SHADER_NAME,
      DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_NAME,
      DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME,
      DEFAULT_TEXTURED_PBR_SHADER_NAME,
    ];
    for (const name of targets) {
      const variants: readonly (string | null)[] = [
        null,
        ...(library.get(name).variants ?? []).map((variant) => variant.name),
      ];
      for (const variant of variants) {
        try {
          const module = variant === null
            ? ShaderModule.fromLibrary(library, name)
            : ShaderModule.fromLibraryVariant(library, name, variant);
          const program = module.compile(device);
          const present = SPOT_UNIFORM_NAMES.filter((uniform) =>
            program.reflection.uniforms.has(uniform),
          ).length;
          programs.push({ shader: name, variant, compiled: true, spotUniformCount: present, error: null });
          program.dispose();
          module.dispose();
        } catch (error) {
          const stripped = tryCompileSpotStripped(device, library, name, variant);
          const log = typeof (error as { details?: { log?: unknown } })?.details?.log === "string"
            ? ((error as { details: { log: string } }).details.log.slice(0, 300))
            : "";
          // spotFree proves the failing preprocessed source contains no B1 spot
          // text at all, so the link failure is definitionally independent of
          // this change (applies to the A3D_PBR_NO_SPOT_SHADOW opt-outs).
          let spotFree = false;
          try {
            const compiled = variant === null
              ? library.compileSource(name)
              : library.compileVariant(name, variant);
            spotFree = !compiled.fragment.includes("u_spotShadowMapTexture");
          } catch {
            spotFree = false;
          }
          programs.push({
            shader: name,
            variant,
            compiled: false,
            spotUniformCount: 0,
            error: `${error instanceof Error ? error.message : String(error)} | log:${log} | spotFree:${spotFree} | stripped:${stripped}`,
          });
        }
      }
    }
    return { programs };
  } finally {
    renderer.dispose();
  }
}
