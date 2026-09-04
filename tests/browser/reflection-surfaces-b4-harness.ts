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
  const ssr = createReflectionSurface({ id: "b4-browser-ssr", kind: "screen-space-reflection" });

  window.__AURA3D_REFLECTION_SURFACES_B4__ = {
    status: "ready",
    renderer: "webgl2",
    claimBoundary:
      "rendering-internal B4 planar mirror, glass refraction, and water composite bindings with probe-delta pixel evidence; no SSR, recursive capture, or createAuraApp claim",
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
    ssrStatus: ssr.report.status,
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
