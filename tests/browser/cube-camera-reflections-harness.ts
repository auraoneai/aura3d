import {
  CubeCameraReflectionCapture,
  Geometry,
  PBRMaterial,
  Renderer,
  UnlitMaterial,
  createReflectionSurface
} from "@aura3d/rendering";

interface CubeCameraReflectionBrowserEvidence {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly claimBoundary: string;
  readonly faceCount?: number;
  readonly captureRevisions?: readonly [number, number];
  readonly captureChangedFaceCount?: number;
  readonly firstReflectivePixel?: readonly number[];
  readonly movedReflectivePixel?: readonly number[];
  readonly reflectiveFrameChangedPixelCount?: number;
  readonly surfaceStatus?: string;
  readonly trueReflection?: boolean;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_CUBE_CAMERA_REFLECTIONS__?: CubeCameraReflectionBrowserEvidence;
  }
}

async function run(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#reflection");
  if (!canvas) throw new Error("Missing reflection canvas.");
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.005, 0.008, 0.015, 1]
  });
  const probe = {
    id: "browser-live-probe",
    position: [0, 0, 0] as const,
    radius: 8,
    intensity: 1.35
  };
  const capture = new CubeCameraReflectionCapture(renderer.device, probe, {
    resolution: canvas.width,
    sampleCount: 4,
    clearColor: [0.002, 0.004, 0.008, 1]
  });
  const movingGeometry = Geometry.litCube(0.9);
  const movingMaterial = new UnlitMaterial({ color: [1, 0.06, 0.015, 1] });
  const reflectiveGeometry = Geometry.uvSphere(0.72, 48, 24);
  const reflectiveMaterial = new PBRMaterial({
    baseColor: [0.82, 0.86, 0.92, 1],
    metallic: 1,
    roughness: 0.04
  });

  const captureAt = (position: readonly [number, number, number]) => capture.capture((face) => {
    renderer.render({
      renderItems: [{
        geometry: movingGeometry,
        material: movingMaterial,
        modelMatrix: translationMatrix(position[0], position[1], position[2]),
        label: "moving-reflection-source"
      }],
      renderTarget: face.renderTarget,
      cameraPolicy: "require",
      cameraPosition: face.position,
      environmentLighting: false,
      frustumCulling: false
    }, { viewProjectionMatrix: face.viewProjectionMatrix });
  });

  const renderReflectiveSurface = (environmentLighting: ReturnType<typeof captureAt>["environmentLighting"]) => {
    renderer.render({
      renderItems: [{
        geometry: reflectiveGeometry,
        material: reflectiveMaterial,
        label: "live-cubemap-reflective-surface"
      }],
      cameraPolicy: "auto-frame",
      environmentLighting,
      frustumCulling: false
    });
    renderer.device.setRenderTarget(null);
    return renderer.device.readPixels(0, 0, canvas.width, canvas.height);
  };

  const firstCapture = captureAt([0, 0, 2.2]);
  const firstFrame = renderReflectiveSurface(firstCapture.environmentLighting);
  const firstReflectivePixel = pixelAt(firstFrame, canvas.width, 48, 48);
  const movedCapture = captureAt([2.2, 0, 0]);
  const movedFrame = renderReflectiveSurface(movedCapture.environmentLighting);
  const movedReflectivePixel = pixelAt(movedFrame, canvas.width, 48, 48);
  const surface = createReflectionSurface({
    id: "browser-reflective-surface",
    kind: "cube-probe",
    probe,
    capture
  });

  window.__AURA3D_CUBE_CAMERA_REFLECTIONS__ = {
    status: "ready",
    renderer: "webgl2",
    claimBoundary: "rendering-internal live cube-camera capture and reflective PBR binding; no planar mirror, SSR, recursive capture, or createAuraApp claim",
    faceCount: movedCapture.texture.cubeFaces.length,
    captureRevisions: [firstCapture.revision, movedCapture.revision],
    captureChangedFaceCount: movedCapture.changedFaceCount,
    firstReflectivePixel,
    movedReflectivePixel,
    reflectiveFrameChangedPixelCount: countChangedPixels(firstFrame, movedFrame),
    surfaceStatus: surface.report.status,
    trueReflection: surface.report.trueReflection
  };

  capture.dispose();
  renderer.dispose();
}

function translationMatrix(x: number, y: number, z: number): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ]);
}

function pixelAt(pixels: Uint8Array, width: number, x: number, y: number): readonly number[] {
  const offset = (y * width + x) * 4;
  return Array.from(pixels.slice(offset, offset + 4));
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
  window.__AURA3D_CUBE_CAMERA_REFLECTIONS__ = {
    status: "error",
    renderer: "webgl2",
    claimBoundary: "rendering-internal live cube-camera capture only",
    error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)
  };
});
