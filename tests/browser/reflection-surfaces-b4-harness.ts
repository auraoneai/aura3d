import {
  Geometry,
  GlassRefractionCapture,
  PlanarReflectionCapture,
  Renderer,
  UnlitMaterial,
  WaterReflectionRefractionCapture,
  computePlanarViewMatrix,
  createPlanarProjectionMatrix,
  createReflectionSurface,
  multiplyPlanarMatrices,
  type RenderItem,
  type RenderTarget,
} from "@aura3d/rendering";
import { ScreenSpaceReflectionPass } from "@aura3d/rendering/reflection-surfaces";

interface ReflectionSurfacesB4BrowserEvidence {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly claimBoundary: string;
  readonly mirrorRevisions?: readonly [number, number];
  readonly mirrorPixelHashes?: readonly [string, string];
  readonly mirrorChangedPixelCount?: number;
  readonly floorMirrorVsPlainDelta?: number;
  readonly glassTintedDelta?: number;
  readonly glassTransmittance?: number;
  readonly waterRevisions?: readonly [number, number];
  readonly waterChangedPixelCount?: number;
  readonly waterBlendedDelta?: number;
  readonly planarStatus?: string;
  readonly floorStatus?: string;
  readonly glassStatus?: string;
  readonly waterStatus?: string;
  readonly ssrStatus?: string;
  readonly ssrEvidence?: { nativeDraws: number; reflectedPixels: number; movedReflectionPixels: number; roughnessDelta: number; offscreenDelta: number; cameraReflectionPixels: number; occludedRedReflectionPixels: number; missingDepthRejected: boolean; disposed: boolean; images: string[] };
  readonly planarTrueReflection?: boolean;
  readonly floorTrueReflection?: boolean;
  readonly glassTrueReflection?: boolean;
  readonly waterTrueReflection?: boolean;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_REFLECTION_SURFACES_B4__?: ReflectionSurfacesB4BrowserEvidence;
  }
}

const EYE: readonly [number, number, number] = [0, 1.6, 4.2];
const TARGET: readonly [number, number, number] = [0, 0.4, 0];
const UP: readonly [number, number, number] = [0, 1, 0];

async function run(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#reflection-b4");
  if (!canvas) throw new Error("Missing reflection-b4 canvas.");
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.005, 0.008, 0.015, 1],
  });
  const projection = createPlanarProjectionMatrix(Math.PI / 3, 1, 0.05, 20);
  const directViewProjection = multiplyPlanarMatrices(
    projection,
    computePlanarViewMatrix(EYE, TARGET, UP)
  );

  const cubeGeometry = Geometry.litCube(0.9);
  const brightGeometry = Geometry.litCube(1.4);
  const redMaterial = new UnlitMaterial({ color: [1, 0.06, 0.015, 1] });
  const brightMaterial = new UnlitMaterial({ color: [1, 0.95, 0.9, 1] });
  const sceneItems = (position: readonly [number, number, number]) => [
    {
      geometry: cubeGeometry,
      material: redMaterial,
      modelMatrix: translationMatrix(position[0], position[1], position[2]),
      label: "b4-mirror-source",
    },
  ];

  const renderInto = (
    renderTarget: RenderTarget,
    viewProjectionMatrix: Float32Array,
    items: readonly RenderItem[]
  ): void => {
    renderer.render(
      {
        renderItems: items,
        renderTarget,
        cameraPolicy: "require",
        cameraPosition: EYE,
        environmentLighting: false,
        frustumCulling: false,
      },
      { viewProjectionMatrix }
    );
  };

  // (1) Planar mirror: two captures with the source moved between them.
  const mirror = new PlanarReflectionCapture(renderer.device, 0, {
    resolution: canvas.width,
    label: "b4-browser-mirror",
  });
  const captureMirror = (position: readonly [number, number, number]) =>
    mirror.capture(
      (frame) =>
        renderer.render(
          {
            renderItems: sceneItems(position),
            renderTarget: frame.renderTarget,
            cameraPolicy: "require",
            cameraPosition: frame.mirror.eye,
            environmentLighting: false,
            frustumCulling: false,
          },
          { viewProjectionMatrix: frame.viewProjectionMatrix }
        ),
      EYE,
      TARGET,
      UP,
      projection
    );
  const mirrorA = captureMirror([0, 0.9, 1.6]);
  const mirrorB = captureMirror([2.2, 0.9, 0.4]);

  // (2) Reflective floor (first consumer): mirror-bound vs plain floor frame.
  const reflectorMaterial = mirror.createReflectorMaterial("b4-browser-reflector-floor");
  const floorGeometry = Geometry.texturedCube(1);
  const floorMatrix = scaleTranslateMatrix([0, 0, 0], [6, 0.035, 6]);
  const renderFloorFrame = (material: typeof reflectorMaterial | UnlitMaterial): Uint8Array => {
    renderer.render(
      {
        renderItems: [
          { geometry: floorGeometry, material, modelMatrix: floorMatrix, label: "b4-floor-frame" },
        ],
        cameraPolicy: "require",
        cameraPosition: EYE,
        environmentLighting: false,
        frustumCulling: false,
      },
      { viewProjectionMatrix: directViewProjection }
    );
    renderer.device.setRenderTarget(null);
    return renderer.device.readPixels(0, 0, canvas.width, canvas.height);
  };
  const floorMirrorFrame = renderFloorFrame(reflectorMaterial);
  const floorPlainFrame = renderFloorFrame(new UnlitMaterial({ color: [0.5, 0.52, 0.55, 1] }));
  void mirrorA;

  // (3) Glass: thickness-tinted, roughness-blurred scene-color fetch.
  const glass = new GlassRefractionCapture(renderer.device, {
    resolution: canvas.width,
    label: "b4-browser-glass",
  });
  const glassResult = glass.capture(
    (target) =>
      renderInto(
        target,
        directViewProjection,
        [
          {
            geometry: brightGeometry,
            material: brightMaterial,
            modelMatrix: translationMatrix(0, 0.7, 1.2),
            label: "b4-glass-source",
          },
        ]
      ),
    { thickness: 2.5, roughness: 0.6 }
  );

  // (4) Water: planar reflection + depth-tinted refraction composite.
  const water = new WaterReflectionRefractionCapture(renderer.device, {
    resolution: canvas.width,
    planeY: 0,
    depth: 2,
    label: "b4-browser-water",
  });
  const captureWater = (position: readonly [number, number, number]) =>
    water.capture(
      (frame) =>
        renderer.render(
          {
            renderItems: sceneItems(position),
            renderTarget: frame.reflectionTarget,
            cameraPolicy: "require",
            cameraPosition: frame.mirror.eye,
            environmentLighting: false,
            frustumCulling: false,
          },
          { viewProjectionMatrix: frame.viewProjectionMatrix }
        ),
      (target) => renderInto(target, directViewProjection, sceneItems(position)),
      EYE,
      TARGET,
      UP,
      projection
    );
  const waterA = captureWater([0, 0.9, 1.6]);
  const waterB = captureWater([-2.2, 0.9, 0.6]);
  void waterA;

  const planar = createReflectionSurface({ id: "b4-browser-planar", kind: "planar-reflector", mirror: mirrorB });
  const floor = createReflectionSurface({ id: "b4-browser-floor", kind: "reflective-floor", mirror: mirrorB });
  const glassSurface = createReflectionSurface({
    id: "b4-browser-glass",
    kind: "refractor-glass",
    glass: glassResult,
  });
  const waterSurface = createReflectionSurface({
    id: "b4-browser-water",
    kind: "water-refraction",
    water: waterB,
  });
  const ssrPass = new ScreenSpaceReflectionPass(renderer.device, { width: canvas.width, height: canvas.height, resolutionScale: 1, maxSteps: 64, maxDistance: 10, thickness: 0.08 });
  const ssrScene = renderer.device.createRenderTarget({ width: canvas.width, height: canvas.height, depth: "texture" });
  const ssrNormals = renderer.device.createRenderTarget({ width: canvas.width, height: canvas.height, depth: "renderbuffer" });
  const noDepth = renderer.device.createRenderTarget({ width: canvas.width, height: canvas.height, depth: false });
  const floorColor = new UnlitMaterial({ color: [0.08, 0.08, 0.08, 1] });
  const excluded = new UnlitMaterial({ color: [0.5, 0.5, 1, 0] });
  let ssrFrame = 0;
  let nativeSsrDraws = 0;
  const images: string[] = [];
  const captureSsr = (x: number, roughness: number, cameraShift = 0, occluded = false) => {
    const eye: readonly [number, number, number] = [EYE[0] + cameraShift, EYE[1], EYE[2]];
    const captureView = computePlanarViewMatrix(eye, TARGET, UP);
    const captureProjection = multiplyPlanarMatrices(projection, captureView);
    const source = [...sceneItems([x, 0.8, 0])];
    if (occluded) source.push({ geometry: cubeGeometry, material: floorColor,
      modelMatrix: scaleTranslateMatrix([x, 0.9, 0.8], [3, 3, 0.5]), label: "ssr-occluder" });
    renderInto(ssrScene, captureProjection, [
      { geometry: floorGeometry, material: floorColor, modelMatrix: floorMatrix, label: "ssr-floor" }, ...source,
    ]);
    const normalMaterial = new UnlitMaterial({ color: [(captureView[4]! + 1) / 2, (captureView[5]! + 1) / 2, (captureView[6]! + 1) / 2, roughness] });
    renderInto(ssrNormals, captureProjection, [
      { geometry: floorGeometry, material: normalMaterial, modelMatrix: floorMatrix, label: "ssr-floor-normal-mask" },
      ...source.map(item => ({ ...item, material: excluded })),
    ]);
    renderer.device.setRenderTarget(ssrScene);
    const base = renderer.device.readPixels(0, 0, canvas.width, canvas.height);
    const result = ssrPass.execute({ scene: ssrScene, normalMask: ssrNormals, projection, frame: ++ssrFrame }, 1);
    nativeSsrDraws += result.nativeDraws;
    renderer.device.setRenderTarget(result.target);
    const pixels = renderer.device.readPixels(0, 0, canvas.width, canvas.height);
    renderer.device.presentRenderTarget!(result.target);
    images.push(canvas.toDataURL("image/png"));
    normalMaterial.dispose();
    const residual = Uint8Array.from(pixels, (value, i) => i % 4 === 3 ? 255 : Math.max(0, Math.min(255, 128 + value - base[i]!)));
    let redReflectionPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > base[i]! + 5 && pixels[i]! > pixels[i + 1]! * 1.5) redReflectionPixels += 1;
    return { base, pixels, residual, redReflectionPixels };
  };
  const ssrA = captureSsr(-0.7, 0.05), ssrB = captureSsr(0.7, 0.05);
  const ssrRough = captureSsr(0.7, 1), ssrMiss = captureSsr(30, 0.05);
  const ssrCamera = captureSsr(0.7, 0.05, 0.5), ssrOccluded = captureSsr(0.7, 0.05, 0, true);
  const ssr = createReflectionSurface({ id: "b4-browser-ssr", kind: "screen-space-reflection", ssr: ssrPass });
  const ssrStatus = ssr.report.status;
  const targetBeforeDispose = ssrPass.result?.target;
  let missingDepthRejected = false;
  try { ssrPass.execute({ scene: noDepth, normalMask: ssrNormals, projection, frame: ++ssrFrame }); } catch { missingDepthRejected = true; }
  ssrPass.dispose();
  const ssrEvidence = {
    nativeDraws: nativeSsrDraws, reflectedPixels: countChangedPixels(ssrA.base, ssrA.pixels),
    movedReflectionPixels: countChangedPixels(ssrA.residual, ssrB.residual),
    roughnessDelta: countChangedPixels(ssrB.pixels, ssrRough.pixels),
    offscreenDelta: countChangedPixels(ssrMiss.base, ssrMiss.pixels),
    cameraReflectionPixels: ssrCamera.redReflectionPixels,
    occludedRedReflectionPixels: ssrOccluded.redReflectionPixels,
    missingDepthRejected, disposed: ssrPass.result === undefined && (targetBeforeDispose?.disposed ?? true), images,
  };
  ssrScene.dispose(); ssrNormals.dispose(); noDepth.dispose(); floorColor.dispose(); excluded.dispose();

  window.__AURA3D_REFLECTION_SURFACES_B4__ = {
    status: "ready",
    renderer: "webgl2",
    claimBoundary:
      "rendering-internal B4 planar mirror, glass refraction, and water composite bindings with probe-delta pixel evidence; native bounded SSR; no recursive capture or createAuraApp claim",
    mirrorRevisions: [mirrorA.revision, mirrorB.revision],
    mirrorPixelHashes: [mirrorA.pixelHash, mirrorB.pixelHash],
    mirrorChangedPixelCount: mirrorB.changedPixelCount,
    floorMirrorVsPlainDelta: countChangedPixels(floorMirrorFrame, floorPlainFrame),
    glassTintedDelta: glassResult.tintedPixelCount,
    glassTransmittance: glassResult.params.transmittance,
    waterRevisions: [waterA.revision, waterB.revision],
    waterChangedPixelCount: waterB.changedPixelCount,
    waterBlendedDelta: waterB.blendedPixelCount,
    planarStatus: planar.report.status,
    floorStatus: floor.report.status,
    glassStatus: glassSurface.report.status,
    waterStatus: waterSurface.report.status,
    ssrStatus,
    ssrEvidence,
    planarTrueReflection: planar.report.trueReflection,
    floorTrueReflection: floor.report.trueReflection,
    glassTrueReflection: glassSurface.report.trueReflection,
    waterTrueReflection: waterSurface.report.trueReflection,
  };

  mirror.dispose();
  glass.dispose();
  water.dispose();
  renderer.dispose();
}

function translationMatrix(x: number, y: number, z: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function scaleTranslateMatrix(
  translation: readonly [number, number, number],
  scale: readonly [number, number, number]
): Float32Array {
  return new Float32Array([
    scale[0], 0, 0, 0,
    0, scale[1], 0, 0,
    0, 0, scale[2], 0,
    translation[0], translation[1], translation[2], 1,
  ]);
}

function countChangedPixels(first: Uint8Array, second: Uint8Array): number {
  let changed = 0;
  for (let offset = 0; offset < first.length; offset += 4) {
    if (
      Math.abs((first[offset] ?? 0) - (second[offset] ?? 0)) > 2 ||
      Math.abs((first[offset + 1] ?? 0) - (second[offset + 1] ?? 0)) > 2 ||
      Math.abs((first[offset + 2] ?? 0) - (second[offset + 2] ?? 0)) > 2
    ) changed += 1;
  }
  return changed;
}

run().catch((error) => {
  window.__AURA3D_REFLECTION_SURFACES_B4__ = {
    status: "error",
    renderer: "webgl2",
    claimBoundary: "rendering-internal B4 reflection bindings only",
    error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error),
  };
});
