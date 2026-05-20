// @ts-nocheck
import {
  Geometry,
  PBRMaterial,
  computePerspectiveCameraFrame,
  createParallaxBarrierInterleavePlan,
  createParallaxBarrierPixelComposite,
  createStereoCameraRig,
  type CameraFrameBounds,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/v9";
import { DirectionalLight, composeMat4, quatFromEuler } from "@galileo3d/scene";
import * as THREE from "three";
import { ParallaxBarrierEffect } from "/node_modules/three/examples/jsm/effects/ParallaxBarrierEffect.js";

declare global {
  interface Window {
    __V9_PARALLAX_PARITY__?: V9ParallaxParityResult;
  }
}

export {};

type V9ParallaxParityResult = V9ParallaxParityReady | V9ParallaxParityError;

interface V9ParallaxParityReady {
  readonly status: "ready";
  readonly schema: "g3d-v9-parallax-parity/v1";
  readonly purpose: "same-scene G3D row-interleaved parallax barrier vs Three.js ParallaxBarrierEffect baseline";
  readonly generatedInBrowserAt: string;
  readonly scene: typeof SCENE;
  readonly g3d: {
    readonly renderer: { readonly leftDrawCalls: number; readonly rightDrawCalls: number; readonly compositePixels: number };
    readonly barrier: { readonly axis: "y"; readonly stripPitchPx: 2; readonly dutyCycle: 0.5; readonly composition: string };
    readonly pixels: PixelStats;
  };
  readonly threejs: {
    readonly renderer: { readonly actualThreeRenderer: true; readonly drawCalls: number; readonly triangles: number };
    readonly effect: { readonly actualParallaxBarrierEffect: true; readonly shaderAxis: "gl_FragCoord.y"; readonly rigViews: 2 };
    readonly pixels: PixelStats;
  };
  readonly diff: DiffStats;
  readonly assertions: {
    readonly sameResolution: boolean;
    readonly actualThreeRenderer: boolean;
    readonly actualThreeParallaxBarrierEffect: boolean;
    readonly g3dRendererOwnedRowComposite: boolean;
    readonly g3dUsesReferenceStripPitch: boolean;
    readonly threeShaderUsesRows: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly dataUrls: {
    readonly g3d: string;
    readonly threejs: string;
    readonly sideBySide: string;
  };
  readonly humanNotes: readonly string[];
}

interface V9ParallaxParityError {
  readonly status: "error";
  readonly schema: "g3d-v9-parallax-parity/v1";
  readonly generatedInBrowserAt: string;
  readonly error: string;
  readonly expectedRenderer: "THREE.WebGLRenderer";
  readonly expectedReferenceEffect: "ParallaxBarrierEffect";
}

interface PixelStats {
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
  readonly averageLuma: number;
  readonly saturatedPixels: number;
}

interface DiffStats {
  readonly meanDelta: number;
  readonly maxDelta: number;
  readonly changedPixels: number;
  readonly structuralSimilarityProxy: number;
}

interface BarrierResources {
  readonly cube: Geometry;
  readonly sphere: Geometry;
  readonly cylinder: Geometry;
  readonly floor: PBRMaterial;
  readonly red: PBRMaterial;
  readonly cyan: PBRMaterial;
  readonly gold: PBRMaterial;
  readonly glass: PBRMaterial;
  readonly dark: PBRMaterial;
}

const SCENE = {
  id: "v9-parallax-barrier",
  width: 640,
  height: 480,
  frameBounds: { min: [-1.75, -0.92, -1.55], max: [1.75, 1.55, 1.55] } as CameraFrameBounds,
  eyeSeparation: 0.17,
  convergenceDistance: 2.8,
  parallaxStrength: 0.64,
  stripPitchPx: 2,
  interleaveAxis: "y"
} as const;

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  const json = document.getElementById("report-json");
  try {
    const g3dCanvas = requiredCanvas("g3d-parallax", SCENE.width, SCENE.height);
    const threeCanvas = requiredCanvas("threejs-parallax", SCENE.width, SCENE.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", SCENE.width * 2, SCENE.height + 60);
    if (status) status.textContent = "rendering G3D row-interleaved parallax barrier";
    const g3d = await renderG3DParallax(g3dCanvas);
    if (status) status.textContent = "rendering Three.js ParallaxBarrierEffect";
    const threejs = await renderThreeParallax(threeCanvas);
    const [g3dPixels, threePixels] = await Promise.all([dataUrlToPixels(g3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const diff = computeDiff(g3dPixels, threePixels);
    const sideBySide = await drawSideBySide(sideBySideCanvas, g3d.dataUrl, threejs.dataUrl, diff);
    const ready: V9ParallaxParityReady = {
      status: "ready",
      schema: "g3d-v9-parallax-parity/v1",
      purpose: "same-scene G3D row-interleaved parallax barrier vs Three.js ParallaxBarrierEffect baseline",
      generatedInBrowserAt: new Date().toISOString(),
      scene: SCENE,
      g3d: {
        renderer: {
          leftDrawCalls: g3d.leftDrawCalls,
          rightDrawCalls: g3d.rightDrawCalls,
          compositePixels: g3d.compositePixels
        },
        barrier: {
          axis: g3d.axis,
          stripPitchPx: g3d.stripPitchPx,
          dutyCycle: g3d.dutyCycle,
          composition: g3d.composition
        },
        pixels: analyzeImageData(g3dPixels)
      },
      threejs: {
        renderer: {
          actualThreeRenderer: threejs.actualThreeRenderer,
          drawCalls: threejs.drawCalls,
          triangles: threejs.triangles
        },
        effect: {
          actualParallaxBarrierEffect: threejs.actualParallaxBarrierEffect,
          shaderAxis: "gl_FragCoord.y",
          rigViews: 2
        },
        pixels: analyzeImageData(threePixels)
      },
      diff,
      assertions: {
        sameResolution: g3dCanvas.width === threeCanvas.width && g3dCanvas.height === threeCanvas.height,
        actualThreeRenderer: threejs.actualThreeRenderer,
        actualThreeParallaxBarrierEffect: threejs.actualParallaxBarrierEffect,
        g3dRendererOwnedRowComposite: g3d.axis === "y" && g3d.composition === "renderer-owned-interleaved-pixels",
        g3dUsesReferenceStripPitch: g3d.stripPitchPx === 2 && g3d.dutyCycle === 0.5,
        threeShaderUsesRows: threejs.shaderUsesRows,
        fakeEqualityClaimed: false
      },
      dataUrls: {
        g3d: g3d.dataUrl,
        threejs: threejs.dataUrl,
        sideBySide
      },
      humanNotes: [
        `Mean RGB delta is ${diff.meanDelta}; structural similarity proxy is ${diff.structuralSimilarityProxy}.`,
        "Three.js ParallaxBarrierEffect interleaves on gl_FragCoord.y with a two-pixel cadence.",
        "This artifact proves the G3D compositor uses the same row axis and strip pitch on a bounded same-scene workload. It is not a blanket visual equality claim."
      ]
    };
    window.__V9_PARALLAX_PARITY__ = ready;
    if (status) status.textContent = "ready";
    if (json) json.textContent = JSON.stringify(stripDataUrls(ready), null, 2);
  } catch (error) {
    const failure: V9ParallaxParityError = {
      status: "error",
      schema: "g3d-v9-parallax-parity/v1",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      expectedRenderer: "THREE.WebGLRenderer",
      expectedReferenceEffect: "ParallaxBarrierEffect"
    };
    window.__V9_PARALLAX_PARITY__ = failure;
    if (status) status.textContent = "error";
    if (json) json.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderG3DParallax(canvas: HTMLCanvasElement) {
  const [leftRenderer, rightRenderer] = await Promise.all([
    G3DRenderer.create({ canvas: document.createElement("canvas"), width: SCENE.width, height: SCENE.height, backend: "webgl2", clearColor: [0.006, 0.008, 0.012, 1] }),
    G3DRenderer.create({ canvas: document.createElement("canvas"), width: SCENE.width, height: SCENE.height, backend: "webgl2", clearColor: [0.006, 0.008, 0.012, 1] })
  ]);
  const leftResources = createResources("left");
  const rightResources = createResources("right");
  const frame = computePerspectiveCameraFrame(SCENE.frameBounds, { width: SCENE.width, height: SCENE.height }, {
    yawRadians: -0.38,
    pitchRadians: -0.1,
    paddingRatio: 0.13,
    fovYRadians: 0.66,
    nearPadding: 0.16,
    farPadding: 2.6
  });
  const stereoRig = createStereoCameraRig({
    frame,
    viewport: { x: 0, y: 0, width: SCENE.width * 2, height: SCENE.height },
    eyeSeparation: SCENE.eyeSeparation * SCENE.parallaxStrength,
    convergenceDistance: Math.max(SCENE.convergenceDistance, frame.near + 0.25),
    layout: "side-by-side"
  });
  const [leftEye, rightEye] = stereoRig.views;
  const leftDiagnostics = leftRenderer.render({
    source: createSource(leftResources, leftEye.cameraPosition),
    camera: { viewProjectionMatrix: leftEye.viewProjectionMatrix, viewMatrix: leftEye.viewMatrix, projectionMatrix: leftEye.projectionMatrix }
  });
  const rightDiagnostics = rightRenderer.render({
    source: createSource(rightResources, rightEye.cameraPosition),
    camera: { viewProjectionMatrix: rightEye.viewProjectionMatrix, viewMatrix: rightEye.viewMatrix, projectionMatrix: rightEye.projectionMatrix }
  });
  const barrierPlan = createParallaxBarrierInterleavePlan({
    axis: "y",
    stripPitchPx: SCENE.stripPitchPx,
    dutyCycle: 0.5,
    rightOpacity: 1
  });
  const composite = createParallaxBarrierPixelComposite({
    width: SCENE.width,
    height: SCENE.height,
    leftPixels: leftRenderer.device.readPixels(0, 0, SCENE.width, SCENE.height),
    rightPixels: rightRenderer.device.readPixels(0, 0, SCENE.width, SCENE.height),
    axis: barrierPlan.axis,
    stripPitchPx: barrierPlan.stripPitchPx,
    dutyCycle: barrierPlan.dutyCycle,
    flipY: true
  });
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create G3D parallax composite context.");
  context.putImageData(new ImageData(composite.pixels, SCENE.width, SCENE.height), 0, 0);
  return {
    leftDrawCalls: leftDiagnostics.drawCalls,
    rightDrawCalls: rightDiagnostics.drawCalls,
    compositePixels: composite.width * composite.height,
    axis: composite.axis,
    stripPitchPx: composite.stripPitchPx,
    dutyCycle: composite.dutyCycle,
    composition: composite.composition,
    dataUrl: canvas.toDataURL("image/png")
  };
}

async function renderThreeParallax(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SCENE.width, SCENE.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  if (!(renderer instanceof THREE.WebGLRenderer)) {
    throw new Error("Parallax parity requires an actual THREE.WebGLRenderer.");
  }
  const scene = createThreeScene();
  const camera = new THREE.PerspectiveCamera(38, SCENE.width / SCENE.height, 0.1, 20);
  camera.position.set(2.15, 1.35, 3.2);
  camera.lookAt(0, 0.1, 0);
  camera.updateProjectionMatrix();
  const effect = new ParallaxBarrierEffect(renderer);
  if (!(effect instanceof ParallaxBarrierEffect)) {
    throw new Error("Parallax parity requires the actual Three.js ParallaxBarrierEffect.");
  }
  effect.setSize(SCENE.width, SCENE.height);
  effect.render(scene, camera);
  return {
    actualThreeRenderer: true as const,
    actualParallaxBarrierEffect: true as const,
    shaderUsesRows: /gl_FragCoord\.y/.test(ParallaxBarrierEffect.toString()),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    dataUrl: canvas.toDataURL("image/png")
  };
}

function createSource(resources: BarrierResources, cameraPosition: readonly [number, number, number]): RenderSource {
  return {
    collectRenderItems: () => createItems(resources),
    collectedLights: createLights(),
    cameraPolicy: "require",
    cameraPosition,
    cameraFrameBounds: SCENE.frameBounds,
    environmentLighting: {
      color: [0.74, 0.8, 0.9],
      intensity: 0.38,
      proceduralMap: {
        skyColor: [0.08, 0.16, 0.3],
        horizonColor: [0.42, 0.68, 0.86],
        groundColor: [0.04, 0.045, 0.06],
        specularColor: [0.88, 0.94, 1],
        intensity: 0.48,
        specularIntensity: 0.86
      }
    },
    frustumCulling: false,
    postprocess: false
  };
}

function createResources(eye: "left" | "right"): BarrierResources {
  const tint = eye === "left" ? 1 : 0.82;
  return {
    cube: Geometry.litCube(1),
    sphere: Geometry.uvSphere(0.5, 48, 24),
    cylinder: Geometry.cylinder({ radius: 0.5, height: 1, segments: 48 }),
    floor: new PBRMaterial({ name: `parity-floor-${eye}`, baseColor: [0.06 * tint, 0.07 * tint, 0.085 * tint, 1], roughness: 0.58, metallic: 0.05 }),
    red: new PBRMaterial({ name: `parity-red-${eye}`, baseColor: [0.9, 0.12 * tint, 0.1 * tint, 1], roughness: 0.28, clearcoatFactor: 0.35 }),
    cyan: new PBRMaterial({ name: `parity-cyan-${eye}`, baseColor: [0.08 * tint, 0.68, 0.92, 1], roughness: 0.26, clearcoatFactor: 0.35 }),
    gold: new PBRMaterial({ name: `parity-gold-${eye}`, baseColor: [1, 0.62, 0.18, 1], roughness: 0.22, metallic: 0.5 }),
    glass: new PBRMaterial({ name: `parity-glass-${eye}`, baseColor: [0.46, 0.72, 1, 1], roughness: 0.08, clearcoatFactor: 0.8, transmissionFactor: 0.1 }),
    dark: new PBRMaterial({ name: `parity-dark-${eye}`, baseColor: [0.02, 0.028, 0.04, 1], roughness: 0.5, metallic: 0.08 })
  };
}

function createItems(resources: BarrierResources): readonly RenderItem[] {
  return [
    { label: "parity-floor", geometry: resources.cube, material: resources.floor, modelMatrix: composeMat4([0, -0.68, 0], [0, 0, 0, 1], [4.2, 0.05, 3.0]) },
    { label: "parity-back", geometry: resources.cube, material: resources.dark, modelMatrix: composeMat4([0, 0.35, -1.48], [0, 0, 0, 1], [4.2, 2.1, 0.05]) },
    { label: "parity-center-glass", geometry: resources.sphere, material: resources.glass, modelMatrix: composeMat4([0, 0.32, 0], quatFromEuler(0, 0.25, 0), [0.72, 0.72, 0.72]) },
    { label: "parity-near-gold", geometry: resources.cube, material: resources.gold, modelMatrix: composeMat4([0.26, -0.2, 0.88], quatFromEuler(0.25, 0.38, 0.1), [0.34, 0.34, 0.34]) },
    { label: "parity-left-column", geometry: resources.cylinder, material: resources.cyan, modelMatrix: composeMat4([-0.95, -0.16, -0.36], [0, 0, 0, 1], [0.16, 0.9, 0.16]) },
    { label: "parity-right-column", geometry: resources.cylinder, material: resources.red, modelMatrix: composeMat4([0.95, -0.16, -0.36], [0, 0, 0, 1], [0.16, 0.9, 0.16]) },
    { label: "parity-far-left", geometry: resources.sphere, material: resources.red, modelMatrix: composeMat4([-1.32, -0.18, -0.9], [0, 0, 0, 1], [0.22, 0.22, 0.22]) },
    { label: "parity-far-right", geometry: resources.sphere, material: resources.cyan, modelMatrix: composeMat4([1.32, -0.18, -0.9], [0, 0, 0, 1], [0.22, 0.22, 0.22]) }
  ];
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("parity-key");
  key.intensity = 3.6;
  key.color = [1, 0.94, 0.84];
  const rim = new DirectionalLight("parity-rim");
  rim.intensity = 1.8;
  rim.color = [0.55, 0.74, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.2, 3.1, 2.2], direction: [-0.42, -0.72, -0.52], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: rim.color, intensity: rim.intensity, position: [-2.2, 2.1, -1.8], direction: [0.58, -0.36, 0.73], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: rim }
  ];
}

function createThreeScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070b);
  scene.add(new THREE.HemisphereLight(0xd7e2ff, 0x242018, 0.5));
  const key = new THREE.DirectionalLight(0xffead4, 3.1);
  key.position.set(2.2, 3.1, 2.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ebfff, 1.5);
  rim.position.set(-2.2, 2.1, -1.8);
  scene.add(rim);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x151a20, roughness: 0.58, metalness: 0.05 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.5, metalness: 0.08 });
  const redMaterial = new THREE.MeshStandardMaterial({ color: 0xe6201a, roughness: 0.28 });
  const cyanMaterial = new THREE.MeshStandardMaterial({ color: 0x18addc, roughness: 0.26 });
  const goldMaterial = new THREE.MeshStandardMaterial({ color: 0xff9e2d, roughness: 0.22, metalness: 0.5 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x75b8ff, roughness: 0.08, metalness: 0.03 });
  addThreeCube(scene, [0, -0.68, 0], [4.2, 0.05, 3.0], [0, 0, 0], floorMaterial);
  addThreeCube(scene, [0, 0.35, -1.48], [4.2, 2.1, 0.05], [0, 0, 0], darkMaterial);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 24), glassMaterial);
  sphere.position.set(0, 0.32, 0);
  sphere.scale.setScalar(0.72);
  scene.add(sphere);
  addThreeCube(scene, [0.26, -0.2, 0.88], [0.34, 0.34, 0.34], [0.25, 0.38, 0.1], goldMaterial);
  addThreeCylinder(scene, [-0.95, -0.16, -0.36], [0.16, 0.9, 0.16], cyanMaterial);
  addThreeCylinder(scene, [0.95, -0.16, -0.36], [0.16, 0.9, 0.16], redMaterial);
  addThreeSphere(scene, [-1.32, -0.18, -0.9], [0.22, 0.22, 0.22], redMaterial);
  addThreeSphere(scene, [1.32, -0.18, -0.9], [0.22, 0.22, 0.22], cyanMaterial);
  return scene;
}

function addThreeCube(scene: THREE.Scene, position: number[], scale: number[], rotation: number[], material: THREE.Material): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  scene.add(mesh);
}

function addThreeCylinder(scene: THREE.Scene, position: number[], scale: number[], material: THREE.Material): void {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 48), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  scene.add(mesh);
}

function addThreeSphere(scene: THREE.Scene, position: number[], scale: number[], material: THREE.Material): void {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 24), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  scene.add(mesh);
}

function requiredCanvas(id: string, width: number, height: number): HTMLCanvasElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${id}.`);
  element.width = width;
  element.height = height;
  return element;
}

async function dataUrlToPixels(dataUrl: string): Promise<ImageData> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create parallax parity pixel canvas.");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function analyzeImageData(image: ImageData): PixelStats {
  let nonBlackPixels = 0;
  let saturatedPixels = 0;
  let lumaTotal = 0;
  const buckets = new Set<number>();
  for (let offset = 0; offset + 3 < image.data.length; offset += 4) {
    const red = image.data[offset] ?? 0;
    const green = image.data[offset + 1] ?? 0;
    const blue = image.data[offset + 2] ?? 0;
    if (red + green + blue > 12) nonBlackPixels += 1;
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 26 && red + green + blue > 90) saturatedPixels += 1;
    buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
    lumaTotal += luma(red, green, blue);
  }
  return {
    nonBlackPixels,
    uniqueColorBuckets: buckets.size,
    averageLuma: Number((lumaTotal / (image.data.length / 4)).toFixed(4)),
    saturatedPixels
  };
}

function computeDiff(left: ImageData, right: ImageData): DiffStats {
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error(`Cannot diff parallax captures with mismatched size: ${left.width}x${left.height} vs ${right.width}x${right.height}.`);
  }
  let totalDelta = 0;
  let maxDelta = 0;
  let changedPixels = 0;
  for (let offset = 0; offset + 3 < left.data.length; offset += 4) {
    const delta = (
      Math.abs((left.data[offset] ?? 0) - (right.data[offset] ?? 0))
      + Math.abs((left.data[offset + 1] ?? 0) - (right.data[offset + 1] ?? 0))
      + Math.abs((left.data[offset + 2] ?? 0) - (right.data[offset + 2] ?? 0))
    ) / 3;
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > 8) changedPixels += 1;
  }
  const meanDelta = totalDelta / (left.width * left.height);
  return {
    meanDelta: Number(meanDelta.toFixed(4)),
    maxDelta: Number(maxDelta.toFixed(4)),
    changedPixels,
    structuralSimilarityProxy: Number(Math.max(0, 1 - meanDelta / 255).toFixed(4))
  };
}

async function drawSideBySide(canvas: HTMLCanvasElement, g3dDataUrl: string, threeDataUrl: string, diff: DiffStats): Promise<string> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create parallax side-by-side canvas.");
  const [g3d, three] = await Promise.all([loadImage(g3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#07090d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(g3d, 0, 0, SCENE.width, SCENE.height);
  context.drawImage(three, SCENE.width, 0, SCENE.width, SCENE.height);
  context.fillStyle = "rgba(7, 9, 13, 0.92)";
  context.fillRect(0, SCENE.height, canvas.width, 60);
  context.fillStyle = "#f3f6f8";
  context.font = "20px system-ui, sans-serif";
  context.fillText("G3D row-interleaved compositor", 20, SCENE.height + 28);
  context.fillText("Three.js ParallaxBarrierEffect", SCENE.width + 20, SCENE.height + 28);
  context.fillStyle = "#aeb8c6";
  context.font = "16px system-ui, sans-serif";
  context.fillText(`mean delta ${diff.meanDelta} | changed ${diff.changedPixels} | SSIM proxy ${diff.structuralSimilarityProxy}`, 20, SCENE.height + 50);
  return canvas.toDataURL("image/png");
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to decode parallax parity image data URL."));
    image.src = dataUrl;
  });
  return image;
}

function stripDataUrls(result: V9ParallaxParityReady): Omit<V9ParallaxParityReady, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

function luma(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
