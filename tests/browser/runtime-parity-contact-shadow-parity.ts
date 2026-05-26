import {
  Geometry,
  PBRMaterial,
  Renderer,
  computePerspectiveCameraFrame,
  type CollectedLight,
  type RenderDeviceDiagnostics,
  type RenderItem
} from "/packages/rendering/src/index.js";
import { createContactShadowPass } from "/packages/rendering/src/production-runtime/index.js";
import { DirectionalLight, composeMat4 } from "/packages/scene/src/index.js";
import * as THREE from "/node_modules/three/build/three.module.js";

declare global {
  interface Window {
    __V7_CONTACT_SHADOW_PARITY__?: unknown;
  }
}

interface PixelStats {
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
  readonly averageLuma: number;
  readonly maxLuma: number;
  readonly contactPatchAverageLuma: number;
  readonly floorPatchAverageLuma: number;
  readonly contactDarkening: number;
}

interface DiffStats {
  readonly meanDelta: number;
  readonly maxDelta: number;
  readonly changedPixels: number;
  readonly structuralSimilarityProxy: number;
}

const WIDTH = 1024;
const HEIGHT = 768;
const LIGHT_DIRECTION = [-0.42, -0.82, -0.38] as const;
const FLOOR_Y = -0.58;
const OBJECT_BOUNDS = { min: [-0.62, -0.54, -0.62] as const, max: [0.62, 0.54, 0.62] as const };
const CONTACT_CASTERS = [
  {
    id: "hero-sphere",
    type: "sphere",
    position: [0, 0, 0] as const,
    scale: [1, 1, 1] as const,
    bounds: OBJECT_BOUNDS,
    color: [0.82, 0.86, 0.9, 1] as const,
    roughness: 0.36,
    metallic: 0.15
  },
  {
    id: "left-block",
    type: "cube",
    position: [-0.92, -0.22, 0.22] as const,
    scale: [0.56, 0.72, 0.46] as const,
    bounds: { min: [-1.2, -0.58, -0.01] as const, max: [-0.64, 0.14, 0.45] as const },
    color: [0.72, 0.76, 0.84, 1] as const,
    roughness: 0.48,
    metallic: 0.04
  },
  {
    id: "right-small-sphere",
    type: "sphere",
    position: [0.92, -0.18, -0.26] as const,
    scale: [0.74, 0.74, 0.74] as const,
    bounds: { min: [0.52, -0.58, -0.66] as const, max: [1.32, 0.22, 0.14] as const },
    color: [0.78, 0.83, 0.88, 1] as const,
    roughness: 0.42,
    metallic: 0.08
  }
] as const;

function createContactFrame() {
  return computePerspectiveCameraFrame({ min: [-2.05, -0.75, -1.35], max: [2.05, 1.05, 1.35] }, { width: WIDTH, height: HEIGHT }, {
    yawRadians: -0.42,
    pitchRadians: -0.24,
    paddingRatio: 0.2,
    fovYRadians: 0.58,
    nearPadding: 0.18,
    farPadding: 2.6
  });
}

async function run(): Promise<void> {
  const root = document.getElementById("contact-root");
  if (!(root instanceof HTMLElement)) throw new Error("Missing contact shadow root.");
  const a3dCanvas = createCanvas("v7-contact-a3d");
  const threeCanvas = createCanvas("v7-contact-threejs");
  const diffCanvas = createCanvas("v7-contact-diff");
  root.append(a3dCanvas, threeCanvas, diffCanvas);

  const a3d = await renderA3D(a3dCanvas);
  const threejs = renderThree(threeCanvas);
  const diff = renderDiff(a3d.pixels, threejs.pixels, diffCanvas);

  window.__V7_CONTACT_SHADOW_PARITY__ = {
    status: "ready",
    schema: "a3d-v7-contact-shadow-parity/v1",
    purpose: "same-scene contact/shadow delta gate",
    parity: {
      claim: "bounded-threejs-soft-contact-shadow-delta-parity",
      reason: "This artifact proves a bounded same-scene A3D soft contact/shadow delta against a Three.js PCFSoftShadowMap baseline. It is not full screen-space, ray, or general contact-shadow parity."
    },
    scene: {
      type: "grounded-multi-caster-contact",
      width: WIDTH,
      height: HEIGHT,
      floorY: FLOOR_Y,
      lightDirection: LIGHT_DIRECTION,
      casterCount: CONTACT_CASTERS.length,
      casters: CONTACT_CASTERS.map((caster) => ({ id: caster.id, type: caster.type, bounds: caster.bounds })),
      setupAlignment: "shared-camera-near-black-background-matched-floor-bounds"
    },
    a3d: {
      diagnostics: a3d.diagnostics,
      pixelStats: analyzePixels(a3d.pixels),
      contactShadow: a3d.contactShadow,
      contactShadows: a3d.contactShadows,
      rendererShadowMap: {
        enabled: (a3d.diagnostics.nativeShadowMapBindings ?? 0) > 0,
        type: "renderer-owned-directional-shadow-map",
        size: 2048,
        pcfSamples: 16,
        nativeShadowMapBindings: a3d.diagnostics.nativeShadowMapBindings ?? 0,
        reason: "This artifact combines the bounded gap-aware receiver contact pass with a renderer-owned A3D directional shadow map and compares it against a same-scene Three.js soft-shadow baseline."
      }
    },
    threejs: {
      diagnostics: threejs.diagnostics,
      pixelStats: analyzePixels(threejs.pixels),
      shadowMap: {
        enabled: true,
        type: "PCFSoftShadowMap",
        size: 2048
      }
    },
    diff,
    artifacts: {
      a3d: "tests/reports/runtime-parity/contact-shadow-parity/a3d-contact-shadow.png",
      threejs: "tests/reports/runtime-parity/contact-shadow-parity/threejs-contact-shadow.png",
      diff: "tests/reports/runtime-parity/contact-shadow-parity/contact-shadow-diff.png"
    },
    dataUrls: {
      a3d: pixelsToDataUrl(a3d.pixels, WIDTH, HEIGHT, true),
      threejs: pixelsToDataUrl(threejs.pixels, WIDTH, HEIGHT, true),
      diff: diffCanvas.toDataURL("image/png")
    },
    openGaps: [
      "A3D contact remains a bounded gap-aware receiver approximation, not a full screen-space or ray/contact-shadow solution.",
      "The delta gate proves only this grounded sphere/floor/camera/light setup, not broad Three.js shadow-system parity.",
      "Broad WebGPU parity across every shadow, postprocess, material-extension, and example path remains open."
    ]
  };
}

async function renderA3D(canvas: HTMLCanvasElement): Promise<{
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly pixels: Uint8Array;
  readonly contactShadow: ReturnType<typeof createContactShadowPass>["diagnostics"];
  readonly contactShadows: readonly ReturnType<typeof createContactShadowPass>["diagnostics"][];
}> {
  const sphere = Geometry.uvSphere(0.54, 96, 48);
  const smallSphere = Geometry.uvSphere(0.54, 80, 40);
  const cube = Geometry.litCube(1);
  const floor = Geometry.litCube(1);
  const contacts = CONTACT_CASTERS.map((caster) => createContactShadowPass({
    bounds: caster.bounds,
    floorY: FLOOR_Y,
    labelPrefix: `v7-contact-shadow-${caster.id}`,
    lightDirection: LIGHT_DIRECTION,
    softness: caster.type === "cube" ? 0.74 : 0.82,
    opacity: caster.type === "cube" ? 0.24 : 0.3,
    footprintPoints: createFootprintPoints(caster.bounds, caster.type === "cube" ? 8 : 12)
  }));
  const renderItems: RenderItem[] = [
    {
      label: "v7-contact-floor",
      geometry: floor,
      material: new PBRMaterial({
        name: "v7-contact-floor-material",
        baseColor: [0.23, 0.245, 0.265, 1],
        metallic: 0,
        roughness: 0.82,
        environmentIntensity: 0
      }),
      modelMatrix: composeMat4([0, FLOOR_Y - 0.035, 0.18], [0, 0, 0, 1], [4.8, 0.07, 4.4])
    },
    ...CONTACT_CASTERS.map((caster): RenderItem => ({
      label: `v7-contact-${caster.id}`,
      geometry: caster.type === "cube" ? cube : caster.id === "right-small-sphere" ? smallSphere : sphere,
      material: new PBRMaterial({
        name: `v7-contact-${caster.id}-material`,
        baseColor: caster.color,
        metallic: caster.metallic,
        roughness: caster.roughness,
        environmentIntensity: 0
      }),
      modelMatrix: composeMat4(caster.position, [0, 0, 0, 1], caster.scale)
    })),
    ...contacts.flatMap((contact) => contact.renderItems)
  ];
  const frame = createContactFrame();
  const renderer = await Renderer.create({
    canvas,
    width: WIDTH,
    height: HEIGHT,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0.012, 0.014, 0.018, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets"]
  });
  const lights = createA3DContactLights();
  const diagnostics = renderer.render({
    renderItems,
    environmentLighting: false,
    collectedLights: lights,
    shadow: {
      enabled: true,
      light: lights[0]?.source,
      size: 2048,
      strength: 0.58,
      bias: 0.0015,
      slopeBias: 1,
      filter: "pcf",
      pcfRadius: 1.6,
      pcfSamples: 16,
      pcfDistribution: "poisson",
      label: "v7-contact-parity-directional-shadow"
    },
    cameraPolicy: "require",
    cameraPosition: frame.cameraPosition,
    postprocess: false
  }, {
    viewProjectionMatrix: frame.viewProjectionMatrix,
    viewMatrix: frame.viewMatrix,
    projectionMatrix: frame.projectionMatrix
  });
  const pixels = renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
  renderer.dispose();
  contacts.forEach((contact) => contact.dispose());
  return {
    diagnostics,
    pixels,
    contactShadow: contacts[0]!.diagnostics,
    contactShadows: contacts.map((contact) => contact.diagnostics)
  };
}

function createFootprintPoints(
  bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] },
  count: number
): readonly [number, number, number][] {
  const centerX = (bounds.min[0] + bounds.max[0]) * 0.5;
  const centerZ = (bounds.min[2] + bounds.max[2]) * 0.5;
  const radiusX = Math.max(0.08, (bounds.max[0] - bounds.min[0]) * 0.28);
  const radiusZ = Math.max(0.08, (bounds.max[2] - bounds.min[2]) * 0.28);
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const radiusScale = index % 2 === 0 ? 1 : 0.62;
    return [
      centerX + Math.cos(angle) * radiusX * radiusScale,
      FLOOR_Y + 0.045,
      centerZ + Math.sin(angle) * radiusZ * radiusScale
    ] as [number, number, number];
  });
}

function createA3DContactLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("v7-contact-parity-key");
  key.color = [1, 0.94, 0.82];
  key.intensity = 1.75;
  key.castsShadow = true;
  const fill = new DirectionalLight("v7-contact-parity-fill");
  fill.color = [0.52, 0.62, 0.84];
  fill.intensity = 0.18;
  return [
    collectedDirectionalLight(key, LIGHT_DIRECTION, true),
    collectedDirectionalLight(fill, [0.62, -0.28, 0.42], false)
  ];
}

function collectedDirectionalLight(
  source: DirectionalLight,
  direction: readonly [number, number, number],
  castsShadow: boolean
): CollectedLight {
  const length = Math.hypot(direction[0], direction[1], direction[2]) || 1;
  return {
    kind: "directional",
    color: source.color as readonly [number, number, number],
    intensity: source.intensity,
    position: [0, 0, 0],
    direction: [direction[0] / length, direction[1] / length, direction[2] / length],
    range: 0,
    spotAngle: 0,
    penumbra: 0,
    castsShadow,
    layerMask: source.layerMask,
    source
  };
}

function renderThree(canvas: HTMLCanvasElement): {
  readonly diagnostics: { readonly drawCalls: number; readonly triangles: number; readonly textures: number };
  readonly pixels: Uint8Array;
} {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030405);
  scene.add(new THREE.HemisphereLight(0x9aa8bf, 0x171719, 1.1));
  const light = new THREE.DirectionalLight(0xffefd6, 3.4);
  light.position.set(3.1, 5.9, 2.8);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.left = -3.2;
  light.shadow.camera.right = 3.2;
  light.shadow.camera.top = 3.2;
  light.shadow.camera.bottom = -3.2;
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = 12;
  light.shadow.bias = -0.00025;
  scene.add(light);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 0.07, 4.4),
    new THREE.MeshStandardMaterial({ color: 0x545961, roughness: 0.82, metalness: 0 })
  );
  floor.position.set(0, FLOOR_Y - 0.035, 0.18);
  floor.receiveShadow = true;
  scene.add(floor);
  for (const caster of CONTACT_CASTERS) {
    const geometry = caster.type === "cube"
      ? new THREE.BoxGeometry(1, 1, 1)
      : new THREE.SphereGeometry(0.54, caster.id === "right-small-sphere" ? 80 : 96, caster.id === "right-small-sphere" ? 40 : 48);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(caster.color[0], caster.color[1], caster.color[2]),
        roughness: caster.roughness,
        metalness: caster.metallic
      })
    );
    mesh.position.set(caster.position[0], caster.position[1], caster.position[2]);
    mesh.scale.set(caster.scale[0], caster.scale[1], caster.scale[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const frame = createContactFrame();
  const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(0.58), WIDTH / HEIGHT, 0.03, 100);
  camera.position.set(frame.cameraPosition[0], frame.cameraPosition[1], frame.cameraPosition[2]);
  camera.lookAt(0, -0.05, 0);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  gl.finish();
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const diagnostics = {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    textures: renderer.info.memory.textures
  };
  renderer.dispose();
  return { diagnostics, pixels };
}

function renderDiff(leftPixels: Uint8Array, rightPixels: Uint8Array, output: HTMLCanvasElement): DiffStats {
  const context = output.getContext("2d");
  if (!context) throw new Error("Contact diff canvas requires 2D context.");
  const image = context.createImageData(WIDTH, HEIGHT);
  let totalDelta = 0;
  let maxDelta = 0;
  let changedPixels = 0;
  for (let offset = 0; offset + 3 < image.data.length; offset += 4) {
    const redDelta = Math.abs((leftPixels[offset] ?? 0) - (rightPixels[offset] ?? 0));
    const greenDelta = Math.abs((leftPixels[offset + 1] ?? 0) - (rightPixels[offset + 1] ?? 0));
    const blueDelta = Math.abs((leftPixels[offset + 2] ?? 0) - (rightPixels[offset + 2] ?? 0));
    const delta = (redDelta + greenDelta + blueDelta) / 3;
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > 8) changedPixels += 1;
    image.data[offset] = Math.min(255, redDelta * 2);
    image.data[offset + 1] = Math.min(255, greenDelta * 2);
    image.data[offset + 2] = Math.min(255, blueDelta * 2);
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const meanDelta = totalDelta / (WIDTH * HEIGHT);
  return {
    meanDelta: Number(meanDelta.toFixed(4)),
    maxDelta: Number(maxDelta.toFixed(4)),
    changedPixels,
    structuralSimilarityProxy: Number(Math.max(0, 1 - meanDelta / 255).toFixed(4))
  };
}

function analyzePixels(pixels: Uint8Array): PixelStats {
  let nonBlackPixels = 0;
  let lumaTotal = 0;
  let maxLuma = 0;
  const buckets = new Set<number>();
  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    if (red + green + blue > 12) nonBlackPixels += 1;
    lumaTotal += luma;
    maxLuma = Math.max(maxLuma, luma);
    buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
  }
  const floorContact = analyzeFloorContactLuma(pixels);
  return {
    nonBlackPixels,
    uniqueColorBuckets: buckets.size,
    averageLuma: Number((lumaTotal / (WIDTH * HEIGHT)).toFixed(6)),
    maxLuma: Number(maxLuma.toFixed(6)),
    contactPatchAverageLuma: floorContact.contactLuma,
    floorPatchAverageLuma: floorContact.floorLuma,
    contactDarkening: floorContact.contactDarkening
  };
}

function analyzeFloorContactLuma(pixels: Uint8Array): {
  readonly contactLuma: number;
  readonly floorLuma: number;
  readonly contactDarkening: number;
} {
  const lumas: number[] = [];
  for (let py = 430; py < 690; py += 1) {
    const sourceY = HEIGHT - 1 - py;
    for (let px = 110; px < 930; px += 1) {
      const offset = (sourceY * WIDTH + px) * 4;
      const luma = (pixels[offset] ?? 0) * 0.2126 + (pixels[offset + 1] ?? 0) * 0.7152 + (pixels[offset + 2] ?? 0) * 0.0722;
      if (luma > 14 && luma < 150) lumas.push(luma);
    }
  }
  lumas.sort((a, b) => a - b);
  const contactLuma = percentile(lumas, 0.02);
  const floorLuma = percentile(lumas, 0.74);
  return {
    contactLuma,
    floorLuma,
    contactDarkening: Number((floorLuma - contactLuma).toFixed(6))
  };
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * fraction)));
  return Number((values[index] ?? 0).toFixed(6));
}

function pixelsToDataUrl(pixels: Uint8Array, width: number, height: number, flipY: boolean): string {
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  if (!context) throw new Error("Could not create contact-shadow capture canvas.");
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = flipY ? height - 1 - y : y;
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (sourceY * width + x) * 4;
      const targetOffset = (y * width + x) * 4;
      image.data[targetOffset] = pixels[sourceOffset] ?? 0;
      image.data[targetOffset + 1] = pixels[sourceOffset + 1] ?? 0;
      image.data[targetOffset + 2] = pixels[sourceOffset + 2] ?? 0;
      image.data[targetOffset + 3] = pixels[sourceOffset + 3] ?? 255;
    }
  }
  context.putImageData(image, 0, 0);
  return output.toDataURL("image/png");
}

function createCanvas(id: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.id = id;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return canvas;
}

run().catch((error) => {
  window.__V7_CONTACT_SHADOW_PARITY__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});
