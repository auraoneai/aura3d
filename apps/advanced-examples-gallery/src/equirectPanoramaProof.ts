import { Renderer, Texture, TextureBinding } from "@aura3d/rendering";
import { PerspectiveCamera } from "@aura3d/scene";

type ViewId = "left" | "forward" | "right";

const VIEW_ROTATIONS: Readonly<Record<ViewId, readonly [number, number, number, number]>> = {
  left: [0, -Math.SQRT1_2, 0, Math.SQRT1_2],
  forward: [0, 0, 0, 1],
  right: [0, Math.SQRT1_2, 0, Math.SQRT1_2]
};

interface EquirectPanoramaProofState {
  readonly status: "ready" | "error";
  readonly route: "advanced-examples-gallery/equirect-panorama-proof";
  readonly rendererPath: "Renderer.environmentBackground -> EnvironmentBackgroundPass";
  readonly projection: "equirect";
  readonly panoramaSize?: readonly [number, number];
  readonly sampledViews?: readonly ViewId[];
  readonly centerPixels?: Readonly<Record<ViewId, readonly number[]>>;
  readonly horizonPixelPairs?: Readonly<Record<ViewId, readonly [readonly number[], readonly number[]]>>;
  readonly diagnostics?: Readonly<Record<ViewId, { readonly drawCalls: number; readonly lastError: string | null }>>;
  readonly claimBoundary: string;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_EQUIRECT_PANORAMA_PROOF__?: EquirectPanoramaProofState;
  }
}

async function run(): Promise<void> {
  const views = ["left", "forward", "right"] as const;
  const panorama = createDirectionalPanorama(256, 128);
  const centerPixels = {} as Record<ViewId, readonly number[]>;
  const horizonPixelPairs = {} as Record<ViewId, readonly [readonly number[], readonly number[]]>;
  const diagnostics = {} as Record<ViewId, { readonly drawCalls: number; readonly lastError: string | null }>;

  for (const view of views) {
    const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-yaw="${view}"]`);
    if (!canvas) throw new Error(`Missing equirect panorama canvas for ${view}.`);
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: canvas.width,
      height: canvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const camera = new PerspectiveCamera({
      fovYRadians: Math.PI / 2,
      aspect: canvas.width / canvas.height,
      near: 0.1,
      far: 20
    });
    camera.transform.setRotation(...VIEW_ROTATIONS[view]);
    camera.updateCameraMatrices();
    const result = renderer.render({
      renderItems: [],
      environmentBackground: {
        projection: "equirect",
        texture: new TextureBinding({
          name: `equirect-panorama-${view}`,
          texture: panorama,
          required: true,
          expectedColorSpace: "linear",
          expectedDimension: "2d"
        }),
        encoding: "linear",
        intensity: 1,
        outputColorSpace: "srgb"
      }
    }, camera);
    renderer.device.setRenderTarget(null);
    centerPixels[view] = readPixel(renderer, canvas.width / 2, canvas.height / 2);
    horizonPixelPairs[view] = [
      readPixel(renderer, canvas.width * 0.25, canvas.height / 2),
      readPixel(renderer, canvas.width * 0.75, canvas.height / 2)
    ];
    diagnostics[view] = { drawCalls: result.drawCalls, lastError: result.lastError };
    renderer.dispose();
  }

  panorama.dispose();
  window.__AURA3D_EQUIRECT_PANORAMA_PROOF__ = {
    status: "ready",
    route: "advanced-examples-gallery/equirect-panorama-proof",
    rendererPath: "Renderer.environmentBackground -> EnvironmentBackgroundPass",
    projection: "equirect",
    panoramaSize: [256, 128],
    sampledViews: views,
    centerPixels,
    horizonPixelPairs,
    diagnostics,
    claimBoundary: "Rendering-internal equirectangular background proof only; this does not claim HDR decode, physical sky, PMREM roughness parity, live probes, or createAuraApp exposure."
  };
}

function createDirectionalPanorama(width: number, height: number): Texture {
  const bandColors: readonly (readonly [number, number, number])[] = [
    [245, 42, 56],
    [42, 224, 105],
    [55, 104, 250],
    [242, 201, 45]
  ];
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const latitude = Math.abs((y / (height - 1)) * 2 - 1);
    for (let x = 0; x < width; x += 1) {
      const band = Math.min(3, Math.floor((x / width) * 4));
      const color = bandColors[band]!;
      const horizonBoost = Math.round((1 - latitude) * 28);
      const offset = (y * width + x) * 4;
      pixels[offset] = Math.min(255, color[0] + horizonBoost);
      pixels[offset + 1] = Math.min(255, color[1] + horizonBoost);
      pixels[offset + 2] = Math.min(255, color[2] + horizonBoost);
      pixels[offset + 3] = 255;
    }
  }
  return new Texture({
    width,
    height,
    data: pixels,
    label: "advanced-gallery-directional-equirect-panorama",
    format: "rgba8",
    colorSpace: "linear"
  });
}

function readPixel(renderer: Renderer, x: number, y: number): readonly number[] {
  return Array.from(renderer.device.readPixels(Math.floor(x), Math.floor(y), 1, 1));
}

run().catch((error) => {
  window.__AURA3D_EQUIRECT_PANORAMA_PROOF__ = {
    status: "error",
    route: "advanced-examples-gallery/equirect-panorama-proof",
    rendererPath: "Renderer.environmentBackground -> EnvironmentBackgroundPass",
    projection: "equirect",
    claimBoundary: "Rendering-internal equirectangular background proof only.",
    error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)
  };
});
