import {
  PBRMaterial,
  Renderer,
  createTerrainHeightfieldFixture,
  createTerrainHeightfieldGeometry
} from "@aura3d/rendering";

interface TerrainHeightfieldBrowserEvidence {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly vertexCount?: number;
  readonly triangleCount?: number;
  readonly colliderKind?: string;
  readonly nonBackgroundPixels?: number;
  readonly greenTerrainPixels?: number;
  readonly heightRange?: readonly [number, number];
  readonly claimBoundary: string;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_TERRAIN_HEIGHTFIELD__?: TerrainHeightfieldBrowserEvidence;
  }
}

async function run(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#terrain-heightfield");
  if (!canvas) throw new Error("Missing terrain heightfield canvas.");
  const fixture = createTerrainHeightfieldFixture({
    width: 48,
    height: 36,
    seed: 0x27_07_2026,
    minHeight: -0.16,
    maxHeight: 0.62
  });
  const terrain = createTerrainHeightfieldGeometry(fixture, {
    sizeX: 13,
    sizeZ: 9,
    heightScale: 3.6,
    yOffset: -0.25
  });
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.005, 0.01, 0.014, 1],
    antialias: true,
    preserveDrawingBuffer: true
  });
  const diagnostics = renderer.render({
    renderItems: [{
      geometry: terrain.geometry,
      material: new PBRMaterial({
        name: "terrain heightfield proof",
        baseColor: [0.12, 0.48, 0.16, 1],
        roughness: 0.88,
        metallic: 0
      }),
      label: "generated-terrain-heightfield"
    }],
    cameraPolicy: "auto-frame",
    environmentLighting: {
      color: [0.42, 0.52, 0.38],
      intensity: 0.82,
      proceduralMap: {
        skyColor: [0.38, 0.58, 0.82],
        horizonColor: [0.82, 0.68, 0.42],
        groundColor: [0.03, 0.055, 0.025],
        specularColor: [0.88, 0.94, 0.78],
        intensity: 0.72,
        specularIntensity: 0.35
      }
    },
    frustumCulling: false
  });
  renderer.device.setRenderTarget(null);
  const pixels = renderer.device.readPixels(0, 0, canvas.width, canvas.height);
  let nonBackgroundPixels = 0;
  let greenTerrainPixels = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    if (red > 6 || green > 8 || blue > 9) nonBackgroundPixels += 1;
    if (green > red * 1.25 && green > blue * 1.12 && green > 18) greenTerrainPixels += 1;
  }
  const heights = terrain.collider.heights;
  window.__AURA3D_TERRAIN_HEIGHTFIELD__ = {
    status: "ready",
    renderer: "webgl2",
    vertexCount: terrain.vertexCount,
    triangleCount: terrain.triangleCount,
    colliderKind: terrain.collider.kind,
    nonBackgroundPixels,
    greenTerrainPixels,
    heightRange: [Math.min(...heights), Math.max(...heights)],
    claimBoundary: `${terrain.claimBoundary} Browser proof is rendering-internal and does not claim native heightfield collision. drawCalls=${diagnostics.drawCalls}.`
  };
  renderer.dispose();
}

run().catch((error) => {
  window.__AURA3D_TERRAIN_HEIGHTFIELD__ = {
    status: "error",
    renderer: "webgl2",
    claimBoundary: "Rendering-internal terrain heightfield proof.",
    error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)
  };
});
