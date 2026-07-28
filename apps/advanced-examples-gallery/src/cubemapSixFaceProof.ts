import {
  Renderer,
  Texture,
  TextureBinding,
  type TextureCubeFace,
  type TextureCubeFaceDescriptor
} from "@aura3d/rendering";
import { PerspectiveCamera } from "@aura3d/scene";

const FACE_COLORS: Readonly<Record<TextureCubeFace, readonly [number, number, number, number]>> = {
  px: [255, 42, 48, 255],
  nx: [42, 232, 92, 255],
  py: [54, 105, 255, 255],
  ny: [255, 211, 42, 255],
  pz: [238, 52, 224, 255],
  nz: [44, 224, 238, 255]
};

const FACE_ROTATIONS: Readonly<Record<TextureCubeFace, readonly [number, number, number, number]>> = {
  px: [0, -Math.SQRT1_2, 0, Math.SQRT1_2],
  nx: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
  py: [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
  ny: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2],
  pz: [0, 1, 0, 0],
  nz: [0, 0, 0, 1]
};

interface CubemapSixFaceProofState {
  readonly status: "ready" | "error";
  readonly route: "advanced-examples-gallery/cubemap-six-face-proof";
  readonly rendererPath: "Renderer.environmentBackground -> EnvironmentBackgroundPass";
  readonly sampledFaces?: readonly TextureCubeFace[];
  readonly centerPixels?: Readonly<Record<TextureCubeFace, readonly number[]>>;
  readonly diagnostics?: Readonly<Record<TextureCubeFace, {
    readonly drawCalls: number;
    readonly lastError: string | null;
  }>>;
  readonly claimBoundary: string;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_CUBEMAP_SIX_FACE_PROOF__?: CubemapSixFaceProofState;
  }
}

async function run(): Promise<void> {
  const faces = ["px", "nx", "py", "ny", "pz", "nz"] as const;
  const texture = createCubemap(16);
  const centerPixels = {} as Record<TextureCubeFace, readonly number[]>;
  const diagnostics = {} as Record<TextureCubeFace, { readonly drawCalls: number; readonly lastError: string | null }>;

  for (const face of faces) {
    const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-face="${face}"]`);
    if (!canvas) throw new Error(`Missing cubemap proof canvas for ${face}.`);
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: canvas.width,
      height: canvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const camera = new PerspectiveCamera({
      fovYRadians: Math.PI / 2,
      aspect: 1,
      near: 0.1,
      far: 20
    });
    camera.transform.setRotation(...FACE_ROTATIONS[face]);
    camera.updateCameraMatrices();
    const result = renderer.render({
      renderItems: [],
      environmentBackground: {
        projection: "cubemap",
        texture: new TextureBinding({
          name: `cubemap-six-face-${face}`,
          texture,
          required: true,
          expectedColorSpace: "linear",
          expectedDimension: "cube"
        }),
        encoding: "linear",
        intensity: 1,
        outputColorSpace: "srgb"
      }
    }, camera);
    renderer.device.setRenderTarget(null);
    centerPixels[face] = Array.from(renderer.device.readPixels(canvas.width / 2, canvas.height / 2, 1, 1));
    diagnostics[face] = { drawCalls: result.drawCalls, lastError: result.lastError };
    renderer.dispose();
  }

  texture.dispose();
  window.__AURA3D_CUBEMAP_SIX_FACE_PROOF__ = {
    status: "ready",
    route: "advanced-examples-gallery/cubemap-six-face-proof",
    rendererPath: "Renderer.environmentBackground -> EnvironmentBackgroundPass",
    sampledFaces: faces,
    centerPixels,
    diagnostics,
    claimBoundary: "Rendering-internal cubemap background proof only; this does not claim live reflection probes, planar reflection, PMREM roughness parity, or createAuraApp exposure."
  };
}

function createCubemap(size: number): Texture {
  const cubeFaces: TextureCubeFaceDescriptor[] = (Object.keys(FACE_COLORS) as TextureCubeFace[]).map((face) => ({
    face,
    mipLevels: [{
      width: size,
      height: size,
      data: solidFace(size, FACE_COLORS[face])
    }]
  }));
  return new Texture({
    width: size,
    height: size,
    dimension: "cube",
    cubeFaces,
    label: "advanced-gallery-six-face-cubemap",
    format: "rgba8",
    colorSpace: "linear"
  });
}

function solidFace(size: number, color: readonly [number, number, number, number]): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(color, offset);
  return pixels;
}

run().catch((error) => {
  window.__AURA3D_CUBEMAP_SIX_FACE_PROOF__ = {
    status: "error",
    route: "advanced-examples-gallery/cubemap-six-face-proof",
    rendererPath: "Renderer.environmentBackground -> EnvironmentBackgroundPass",
    claimBoundary: "Rendering-internal cubemap background proof only.",
    error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)
  };
});
