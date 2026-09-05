import {
  Geometry,
  InstancedPBRMaterial,
  Renderer,
  Sampler,
  ShadowMap,
  ShadowPass,
  TextureBinding,
  computePerspectiveCameraFrame,
  createDefaultShaderLibrary,
  createShadowFilterKernel,
  createSpotShadowProjection,
  type RenderItem,
} from "@aura3d/rendering";
import {
  Scene,
  SpotLight,
  composeMat4,
  multiplyMat4,
  type Mat4,
} from "@aura3d/scene";

/**
 * muse3jsparity-PRD J2 — native WebGPU spot-shadow pixel proof.
 *
 * Rendering-package level (not root): the B1 spot family (floor + offset
 * sphere caster, spot key light, PCF kernel) rendered by Renderer on the
 * real WebGPU backend with NATIVE readback (readPixelsAsync =
 * copyTextureToBuffer). The sphere sits off-axis (+x) so a mirrored or
 * fullscreen-dimmer fallback cannot satisfy the centroid gate: the old
 * center-sample stub darkened every pixel uniformly (centroid = frame
 * center), while the projective PCF path under test drops a localized,
 * off-center shadow.
 *
 * Native PBR shades with a single fixed key light; the spot factor gates
 * that direct term by spot-frustum occlusion (documented constraint, same
 * as the directional native factor).
 */

const WIDTH = 640;
const HEIGHT = 480;
const SPOT_EYE: readonly [number, number, number] = [0, 3.6, 3.0];
const SPOT_TARGET: readonly [number, number, number] = [0, -0.4, -0.2];
const SPOT_ANGLE = 0.55;
const SPOT_PENUMBRA = 0.4;
const SPOT_RANGE = 10;
const SPOT_DEPTH_SIZE = 512;
const SPOT_DEPTH_NEAR = 2;
const SPHERE_X = 0.9;

declare global {
  interface Window {
    __AURA3D_J2_WEBGPU_SPOT__?: unknown;
  }
}

void run().catch((error) => {
  window.__AURA3D_J2_WEBGPU_SPOT__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
});

async function run(): Promise<void> {
  const root = document.getElementById("webgpu-spot-shadow-j2-root");
  if (!(root instanceof HTMLElement)) throw new Error("Missing webgpu-spot-shadow-j2 root.");
  const gallery = document.createElement("div");
  gallery.style.cssText = "display:flex;gap:8px;align-items:flex-start;";
  root.append(gallery);

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
  const spot = new SpotLight("j2-spot-key");
  spot.castsShadow = true;
  spot.intensity = 60;
  spot.color = [1, 0.95, 0.85];
  spot.angle = SPOT_ANGLE;
  spot.penumbra = SPOT_PENUMBRA;
  spot.range = SPOT_RANGE;
  spot.transform.setLocalMatrix(lightWorld as Mat4, { decompose: false });
  scene.root.addChild(spot);
  scene.updateWorldTransforms();

  const items = spotSceneItems();
  const frame = computePerspectiveCameraFrame(
    { min: [-2.4, -0.9, -2.4], max: [2.4, 1.3, 2.4] },
    { width: WIDTH, height: HEIGHT },
    { yawRadians: -0.35, pitchRadians: -0.24, paddingRatio: 0.2, fovYRadians: 0.6, nearPadding: 0.18, farPadding: 2.6 },
  );

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  root.append(canvas);
  const renderer = await Renderer.create({
    canvas,
    width: WIDTH,
    height: HEIGHT,
    backend: "webgpu",
    clearColor: [0.012, 0.014, 0.018, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets"],
  });
  try {
    if (renderer.device.kind !== "webgpu" && renderer.device.kind !== "webgl2") {
      throw new Error(`J2 spot proof requires the WebGPU backend, got ${renderer.device.kind}.`);
    }
    const device = renderer.device as {
      readonly kind: string;
      readonly info: { readonly vendor?: string; readonly renderer?: string };
      createRenderTarget(descriptor: unknown): { dispose(): void; readonly label: string };
      setRenderTarget(target: unknown): void;
      readPixelsAsync?(x: number, y: number, width: number, height: number): Promise<Uint8Array>;
      readPixels(x: number, y: number, width: number, height: number): Uint8Array;
      beginFrame(width: number, height: number): void;
      endFrame(): void;
      getDiagnostics(): { readonly drawCalls: number; readonly lastError: string | null; readonly nativeShadowMapBindings?: number };
    };
    const shaderLibrary = createDefaultShaderLibrary();
    const depthMap = new ShadowMap({
      size: SPOT_DEPTH_SIZE,
      bias: 0.001,
      filter: "pcf",
      pcfRadius: 1,
      pcfSamples: 9,
      label: "j2-spot-depth",
    });
    const shadowPass = new ShadowPass({
      light: spot,
      casters: items,
      shadowMap: depthMap,
      viewProjectionMatrix: spotMatrix,
      shaderLibrary,
    });
    device.beginFrame(WIDTH, HEIGHT);
    let depthRendered = false;
    let depthCasterCount = 0;
    try {
      const depthResult = shadowPass.execute({ device: device as never, width: WIDTH, height: HEIGHT });
      depthRendered = depthResult.rendered;
      depthCasterCount = depthResult.casterCount;
    } finally {
      device.endFrame();
    }
    if (!depthRendered) throw new Error("Spot depth pass did not render on the WebGPU backend.");
    const forwardMap = shadowPass.getForwardShadowMap({
      lightMatrix: spotMatrix,
      strength: 0.85,
      slopeBias: 1,
      bias: 0.001,
    });
    if (!forwardMap) throw new Error("Spot depth pass produced no forward map.");
    const depthTexture = forwardMap.texture.texture;
    if (!depthTexture) throw new Error("Spot depth pass produced no depth texture.");

    // Native depth-encoding leg: the shadow target's own GPU pixels must
    // carry a real depth gradient (background clear = far = 255, casters
    // nearer), proving the native depth fragment packs framebuffer depth.
    const shadowTarget = shadowPass.getRenderTarget();
    if (!shadowTarget) throw new Error("Spot depth pass produced no render target.");
    device.setRenderTarget(shadowTarget as never);
    const depthPixels = await readFrame(device, 0, 0, SPOT_DEPTH_SIZE, SPOT_DEPTH_SIZE);
    const depthStats = analyzeDepthTarget(depthPixels);

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
    const litTarget = device.createRenderTarget({ width: WIDTH, height: HEIGHT, format: "rgba8", label: "j2-spot-lit" });
    try {
      const renderWithMap = async (spotLight: ReturnType<typeof spotEntry> | undefined) => {
        const diagnostics = renderer.render(
          {
            scene,
            renderItems: items,
            environmentLighting,
            ...(spotLight ? { shadowMap: { ...forwardMap, spotLight } } : {}),
            renderTarget: litTarget,
            cameraPolicy: "require",
            cameraPosition: frame.cameraPosition,
          } as never,
          {
            viewProjectionMatrix: frame.viewProjectionMatrix,
            viewMatrix: frame.viewMatrix,
            projectionMatrix: frame.projectionMatrix,
          } as never,
        );
        device.setRenderTarget(litTarget as never);
        const pixels = await readFrame(device, 0, 0, WIDTH, HEIGHT);
        return { diagnostics, pixels };
      };

      const pcfRender = await renderWithMap(spotEntry(pcfKernel));
      const pcfShadowBindings = device.getDiagnostics().nativeShadowMapBindings ?? -1;
      const singleRender = await renderWithMap(spotEntry(singleKernel));
      const unshadowedRender = await renderWithMap(undefined);

      const pcfPixels = pcfRender.pixels;
      const singlePixels = singleRender.pixels;
      const unshadowedPixels = unshadowedRender.pixels;
      const earlyDrops = dropMask(pcfPixels, unshadowedPixels, 12);
      paintFrame(gallery, "pcf", pcfRender.pixels);
      paintFrame(gallery, "single", singleRender.pixels);
      paintFrame(gallery, "unshadowed", unshadowedRender.pixels);
      paintDepthFrame(gallery, depthPixels);
      paintDropOverlay(gallery, earlyDrops.mask, pcfPixels);
      const galleryPanelCount = gallery.childElementCount;
      // CPU oracle probe: world point P sits on the floor directly behind the
      // sphere along the spot axis (analytic shadow center). Project it
      // through both matrices on the CPU and compare against the GPU frames
      // and the depth readback (both v orientations) to split math errors
      // from uniform/texture delivery errors.
      const cpuProbe = cpuShadowProbe(
        [1.104, -0.62, -0.681],
        frame.viewProjectionMatrix as unknown as readonly number[],
        spotMatrix as unknown as readonly number[],
        direction,
        depthPixels,
        pcfPixels,
        unshadowedPixels,
      );
      const cpuRowProbe = [-2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1.104, 1.5, 2, 2.5].map((x) =>
        cpuShadowProbe(
          [x, -0.62, -0.681],
          frame.viewProjectionMatrix as unknown as readonly number[],
          spotMatrix as unknown as readonly number[],
          direction,
          depthPixels,
          pcfPixels,
          unshadowedPixels,
        ),
      );
      const drops = dropMask(pcfPixels, unshadowedPixels, 12);
      const dropGrid = dropCoarseGrid(drops.mask);
      const bbox = dropBoundingBox(drops);
      const shadowDropCount = drops.count;
      const centroidX = bbox.count > 0 ? bbox.sumX / bbox.count : -1;
      const shadowBboxLumaPcf = bbox.count > 0 ? bboxMeanLuma(pcfPixels, bbox) : -1;
      const shadowBboxLumaUnshadowed = bbox.count > 0 ? bboxMeanLuma(unshadowedPixels, bbox) : -1;
      // Shadow-core receiver patch (B1 methodology): the drop bounding box is
      // dilution-prone — it spans the caster's own dark silhouette plus lit
      // floor around the shadow — so the depth leg is measured on a fixed
      // floor patch inside the shadow core instead. Top-down (408, 273,
      // 40x32) sits on lit floor (unshadowed ~184, CPU row probes at screens
      // 407/433 drop ~45) clear of the sphere silhouette (dark in the
      // unshadowed frame near screen 367). regionLuma takes top-down rows.
      const shadowCorePatchLumaPcf = regionLuma(pcfPixels, 408, 273, 40, 32);
      const shadowCorePatchLumaUnshadowed = regionLuma(unshadowedPixels, 408, 273, 40, 32);

      for (const geometry of items) geometry.geometry.dispose();
      shadowPass.dispose();
      window.__AURA3D_J2_WEBGPU_SPOT__ = {
        status: "ready",
        schema: "a3d-webgpu-spot-shadow-j2",
        backend: renderer.device.kind,
        adapter: `${device.info.vendor ?? ""} ${device.info.renderer ?? ""}`.trim(),
        depthRendered,
        depthCasterCount,
        depthStats,
        pcf: summarizeFrame(pcfRender.diagnostics, pcfPixels),
        singleTap: summarizeFrame(singleRender.diagnostics, singlePixels),
        unshadowed: summarizeFrame(unshadowedRender.diagnostics, unshadowedPixels),
        shadowDropCount,
        dropFraction: Number((shadowDropCount / (WIDTH * HEIGHT)).toFixed(4)),
        centroidX: Number(centroidX.toFixed(1)),
        centroidOffCenterPx: Number(Math.abs(centroidX - WIDTH / 2).toFixed(1)),
        bbox: { minX: bbox.minX, maxX: bbox.maxX, minY: bbox.minY, maxY: bbox.maxY },
        shadowBboxLumaPcf,
        shadowBboxLumaUnshadowed,
        shadowBboxDrop: Number((shadowBboxLumaUnshadowed - shadowBboxLumaPcf).toFixed(2)),
        shadowCorePatchLumaPcf,
        shadowCorePatchLumaUnshadowed,
        shadowCorePatchDrop: Number((shadowCorePatchLumaUnshadowed - shadowCorePatchLumaPcf).toFixed(2)),
        singleTapDropCount: countDrops(singlePixels, unshadowedPixels, 12),
        pcfVsSingleDiffCount: countDrops(pcfPixels, singlePixels, 8),
        litCornerDeltaPcfVsUnshadowed: Math.abs(
          regionLuma(pcfPixels, 8, 8, 64, 48) - regionLuma(unshadowedPixels, 8, 8, 64, 48),
        ),
        pcfShadowBindings,
        cpuProbe,
        cpuRowProbe,
        dropGrid,
        galleryPanelCount,
      };
    } finally {
      litTarget.dispose();
    }
  } finally {
    renderer.dispose();
  }
}

function spotSceneItems(): RenderItem[] {
  const floorMaterial = new InstancedPBRMaterial({
    name: "j2-spot-floor",
    baseColor: [0.52, 0.54, 0.57, 1],
    metallic: 0,
    roughness: 0.72,
    environmentIntensity: 0.25,
  });
  const sphereMaterial = new InstancedPBRMaterial({
    name: "j2-spot-sphere",
    baseColor: [0.85, 0.88, 0.92, 1],
    metallic: 0.25,
    roughness: 0.32,
    environmentIntensity: 0.25,
  });
  return [
    {
      label: "j2-spot-floor",
      geometry: Geometry.litCube(1),
      material: floorMaterial,
      modelMatrix: composeMat4([0, -0.72, 0], [0, 0, 0, 1], [6, 0.1, 6]),
    },
    {
      label: "j2-spot-sphere",
      geometry: Geometry.uvSphere(0.55, 48, 24),
      material: sphereMaterial,
      modelMatrix: composeMat4([SPHERE_X, 0.12, 0], [0, 0, 0, 1], [1, 1, 1]),
    },
  ];
}

async function readFrame(
  device: { readPixelsAsync?(x: number, y: number, w: number, h: number): Promise<Uint8Array>; readPixels(x: number, y: number, w: number, h: number): Uint8Array },
  x: number, y: number, w: number, h: number,
): Promise<Uint8Array> {
  if (typeof device.readPixelsAsync === "function") return device.readPixelsAsync(x, y, w, h);
  return device.readPixels(x, y, w, h);
}

function multiplyMat4Vec4(m: readonly number[], v: readonly [number, number, number, number]): [number, number, number, number] {
  // Column-major mat4 * vec4.
  return [
    m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2] + m[12]! * v[3],
    m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2] + m[13]! * v[3],
    m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2] + m[14]! * v[3],
    m[3]! * v[0] + m[7]! * v[1] + m[11]! * v[2] + m[15]! * v[3],
  ];
}

function cpuShadowProbe(
  world: readonly [number, number, number],
  viewProjection: readonly number[],
  shadowMatrix: readonly number[],
  spotDirection: readonly [number, number, number],
  depthPixels: Uint8Array,
  pcfPixels: Uint8Array,
  unshadowedPixels: Uint8Array,
): Record<string, number> {
  const out: Record<string, number> = {};
  const clip = multiplyMat4Vec4(viewProjection, [world[0], world[1], world[2], 1]);
  const ndc: [number, number, number] = [clip[0] / clip[3], clip[1] / clip[3], clip[2] / clip[3]];
  out.screenX = Math.round((ndc[0] * 0.5 + 0.5) * WIDTH);
  const rowBottomUp = Math.round((ndc[1] * 0.5 + 0.5) * HEIGHT);
  const rowTopDown = HEIGHT - 1 - rowBottomUp;
  out.screenRowBottomUp = rowBottomUp;
  out.screenRowTopDown = rowTopDown;
  const light = multiplyMat4Vec4(shadowMatrix, [world[0], world[1], world[2], 1]);
  const projected: [number, number, number] = [light[0] / Math.max(light[3], 0.0001), light[1] / Math.max(light[3], 0.0001), light[2] / Math.max(light[3], 0.0001)];
  const uv: [number, number] = [projected[0] * 0.5 + 0.5, projected[1] * 0.5 + 0.5];
  out.uvX = Number(uv[0].toFixed(4));
  out.uvY = Number(uv[1].toFixed(4));
  out.projectedDepth = Number((projected[2] * 0.5 + 0.5).toFixed(4));
  const inRange = uv[0] >= 0 && uv[0] <= 1 && uv[1] >= 0 && uv[1] <= 1 ? 1 : 0;
  out.uvInRange = inRange;
  const tx = world[0] - SPOT_EYE[0];
  const ty = world[1] - SPOT_EYE[1];
  const tz = world[2] - SPOT_EYE[2];
  const coneDistance = Math.max(Math.hypot(tx, ty, tz), 0.0001);
  out.coneDistance = Number(coneDistance.toFixed(3));
  const coneCos = ((tx / coneDistance) * spotDirection[0] + (ty / coneDistance) * spotDirection[1] + (tz / coneDistance) * spotDirection[2]);
  out.coneCos = Number(coneCos.toFixed(4));
  out.coneThreshold = Number(Math.cos(SPOT_ANGLE).toFixed(4));
  const depthAt = (row: number, column: number): number => {
    const r = Math.min(SPOT_DEPTH_SIZE - 1, Math.max(0, row));
    const c = Math.min(SPOT_DEPTH_SIZE - 1, Math.max(0, column));
    return (depthPixels[(r * SPOT_DEPTH_SIZE + c) * 4] ?? 0) / 255;
  };
  const du = Math.min(SPOT_DEPTH_SIZE - 1, Math.max(0, Math.floor(uv[0] * SPOT_DEPTH_SIZE)));
  const dvDirect = Math.min(SPOT_DEPTH_SIZE - 1, Math.max(0, Math.floor(uv[1] * SPOT_DEPTH_SIZE)));
  const dvFlipped = SPOT_DEPTH_SIZE - 1 - dvDirect;
  out.storedDirect = Number(depthAt(dvDirect, du).toFixed(4));
  out.storedFlipped = Number(depthAt(dvFlipped, du).toFixed(4));
  const frameAt = (pixels: Uint8Array, row: number, column: number): number => {
    const r = Math.min(HEIGHT - 1, Math.max(0, row));
    const c = Math.min(WIDTH - 1, Math.max(0, column));
    const offset = (r * WIDTH + c) * 4;
    return luma(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0);
  };
  out.pcfLumaBottomUp = Number(frameAt(pcfPixels, rowBottomUp, out.screenX).toFixed(2));
  out.pcfLumaTopDown = Number(frameAt(pcfPixels, rowTopDown, out.screenX).toFixed(2));
  out.unshadowedLumaBottomUp = Number(frameAt(unshadowedPixels, rowBottomUp, out.screenX).toFixed(2));
  out.unshadowedLumaTopDown = Number(frameAt(unshadowedPixels, rowTopDown, out.screenX).toFixed(2));
  // World-position readout: when the fragment returns the affine-encoded
  // worldPosition viz instead of shaded color, the pcf frame decodes to the
  // GPU-interpolated world position at the probe pixel (J2 debug only).
  const decodeWorld = (pixels: Uint8Array, row: number, column: number): string => {
    const r = Math.min(HEIGHT - 1, Math.max(0, row));
    const c = Math.min(WIDTH - 1, Math.max(0, column));
    const offset = (r * WIDTH + c) * 4;
    const decode = (byte: number): number => Number(((byte / 255) * 8 - 4).toFixed(3));
    return `${decode(pixels[offset] ?? 0)},${decode(pixels[offset + 1] ?? 0)},${decode(pixels[offset + 2] ?? 0)}`;
  };
  (out as Record<string, number | string>).gpuWorldAtProbe = decodeWorld(pcfPixels, rowBottomUp, out.screenX);
  return out;
}

function paintFrame(gallery: HTMLElement, id: string, pixels: Uint8Array): void {
  const wrap = document.createElement("div");
  const label = document.createElement("div");
  label.textContent = id;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.cssText = "width:200px;height:150px;image-rendering:pixelated;";
  const context = canvas.getContext("2d");
  if (context) {
    const image = context.createImageData(WIDTH, HEIGHT);
    image.data.set(pixels.subarray(0, WIDTH * HEIGHT * 4));
    context.putImageData(image, 0, 0);
  }
  wrap.append(label, canvas);
  gallery.append(wrap);
}

function paintDropOverlay(gallery: HTMLElement, mask: Uint8Array, pcfPixels: Uint8Array): void {
  const overlay = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let index = 0; index < WIDTH * HEIGHT; index += 1) {
    overlay[index * 4] = pcfPixels[index * 4] ?? 0;
    overlay[index * 4 + 1] = pcfPixels[index * 4 + 1] ?? 0;
    overlay[index * 4 + 2] = pcfPixels[index * 4 + 2] ?? 0;
    overlay[index * 4 + 3] = 255;
    if (mask[index] === 1) {
      overlay[index * 4] = 255;
      overlay[index * 4 + 1] = 0;
      overlay[index * 4 + 2] = 0;
    }
  }
  paintFrame(gallery, "drops-red", overlay);
}

function paintDepthFrame(gallery: HTMLElement, pixels: Uint8Array): void {
  const expanded = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let row = 0; row < HEIGHT; row += 1) {
    for (let column = 0; column < WIDTH; column += 1) {
      const srcRow = Math.floor((row / HEIGHT) * SPOT_DEPTH_SIZE);
      const srcColumn = Math.floor((column / WIDTH) * SPOT_DEPTH_SIZE);
      const red = pixels[(srcRow * SPOT_DEPTH_SIZE + srcColumn) * 4] ?? 0;
      expanded[(row * WIDTH + column) * 4] = red;
      expanded[(row * WIDTH + column) * 4 + 1] = red;
      expanded[(row * WIDTH + column) * 4 + 2] = red;
      expanded[(row * WIDTH + column) * 4 + 3] = 255;
    }
  }
  paintFrame(gallery, "depth-target", expanded);
}

function analyzeDepthTarget(pixels: Uint8Array): { min: number; max: number; uniqueValues: number; farFraction: number } {
  // Map correctness is proven per-texel by the CPU oracle probes (projected
  // receiver depth vs stored sphere/floor depths at known UVs), not by a
  // global darkest-tail centroid: the tail mixes the sphere occluder with the
  // floor gradient's near strip, so its centroid locates neither surface.
  let min = 255;
  let max = 0;
  let far = 0;
  const values = new Set<number>();
  const count = Math.floor(pixels.length / 4);
  for (let index = 0; index < count; index += 1) {
    const red = pixels[index * 4] ?? 0;
    if (red < min) min = red;
    if (red > max) max = red;
    if (red === 255) far += 1;
    values.add(red);
  }
  return {
    min,
    max,
    uniqueValues: values.size,
    farFraction: Number((far / Math.max(1, count)).toFixed(4)),
  };
}

function summarizeFrame(
  diagnostics: { drawCalls: number; lastError: string | null },
  pixels: Uint8Array,
): { drawCalls: number; lastError: string | null; meanLuma: number; nonBlackPixels: number } {
  let nonBlackPixels = 0;
  let lumaTotal = 0;
  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    lumaTotal += luma(red, green, blue);
    if (red + green + blue > 24) nonBlackPixels += 1;
  }
  return {
    drawCalls: diagnostics.drawCalls,
    lastError: diagnostics.lastError,
    meanLuma: Number((lumaTotal / Math.max(1, pixels.length / 4)).toFixed(4)),
    nonBlackPixels,
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

function dropMask(current: Uint8Array, reference: Uint8Array, threshold: number): { mask: Uint8Array; count: number } {
  const count = Math.floor(Math.min(current.length, reference.length) / 4);
  const mask = new Uint8Array(WIDTH * HEIGHT);
  let drops = 0;
  for (let index = 0; index < count && index < mask.length; index += 1) {
    const drop =
      luma(reference[index * 4] ?? 0, reference[index * 4 + 1] ?? 0, reference[index * 4 + 2] ?? 0) -
      luma(current[index * 4] ?? 0, current[index * 4 + 1] ?? 0, current[index * 4 + 2] ?? 0);
    if (drop > threshold) {
      mask[index] = 1;
      drops += 1;
    }
  }
  return { mask, count: drops };
}

function dropCoarseGrid(mask: Uint8Array): string {
  // 8x6 coarse map (buffer-bottom-up rows) of drop-pixel counts per cell,
  // so the darkening location reads without opening the screenshot.
  const cells: string[] = [];
  for (let gridRow = 0; gridRow < 6; gridRow += 1) {
    let line = "";
    for (let gridColumn = 0; gridColumn < 8; gridColumn += 1) {
      let count = 0;
      for (let row = Math.floor((gridRow * HEIGHT) / 6); row < Math.floor(((gridRow + 1) * HEIGHT) / 6); row += 1) {
        for (let column = Math.floor((gridColumn * WIDTH) / 8); column < Math.floor(((gridColumn + 1) * WIDTH) / 8); column += 1) {
          if (mask[row * WIDTH + column] === 1) count += 1;
        }
      }
      line += count > 400 ? "#" : count > 100 ? "+" : count > 10 ? "." : " ";
    }
    cells.push(line);
  }
  return cells.join("|");
}

function dropBoundingBox(drops: { mask: Uint8Array; count: number }): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  sumX: number;
  count: number;
} {
  let minX = WIDTH;
  let maxX = -1;
  let minY = HEIGHT;
  let maxY = -1;
  let sumX = 0;
  let count = 0;
  for (let row = 0; row < HEIGHT; row += 1) {
    for (let column = 0; column < WIDTH; column += 1) {
      if (drops.mask[row * WIDTH + column] !== 1) continue;
      if (column < minX) minX = column;
      if (column > maxX) maxX = column;
      if (row < minY) minY = row;
      if (row > maxY) maxY = row;
      sumX += column;
      count += 1;
    }
  }
  return { minX, maxX, minY, maxY, sumX, count };
}

function bboxMeanLuma(
  pixels: Uint8Array,
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
): number {
  let total = 0;
  let count = 0;
  for (let row = bbox.minY; row <= bbox.maxY; row += 1) {
    for (let column = bbox.minX; column <= bbox.maxX; column += 1) {
      const offset = (row * WIDTH + column) * 4;
      total += luma(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0);
      count += 1;
    }
  }
  return Number((total / Math.max(1, count)).toFixed(2));
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
