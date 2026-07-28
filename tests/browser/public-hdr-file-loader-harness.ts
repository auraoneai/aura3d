import {
  Geometry,
  PBRMaterial,
  Renderer,
  loadProductionHdrEnvironmentFile
} from "@aura3d/rendering";

declare global {
  interface Window {
    __AURA3D_PUBLIC_HDR_FILE_LOADER__?: {
      readonly status: "ready" | "error";
      readonly source?: string;
      readonly radianceSize?: readonly [number, number];
      readonly cubeFaceCount?: number;
      readonly drawCalls?: number;
      readonly centerPixel?: readonly number[];
      readonly claimBoundary: string;
      readonly error?: string;
    };
  }
}

async function run(): Promise<void> {
  const source = "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr";
  const environment = await loadProductionHdrEnvironmentFile(source, {
    id: "browser-public-hdr-file-loader",
    intensity: 1.1,
    cubemapFaceSize: 8,
    cubemapMipCount: 4,
    cubemapSampleCount: 2,
    irradianceWidth: 8,
    irradianceHeight: 4,
    specularLevels: 4,
    specularSampleCount: 2,
    brdfLutSize: 8,
    brdfLutSampleCount: 8
  });
  const canvas = document.querySelector<HTMLCanvasElement>("#hdr-file-loader");
  if (!canvas) throw new Error("Missing HDR file loader canvas.");
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.003, 0.004, 0.008, 1]
  });
  const diagnostics = renderer.render({
    renderItems: [{
      geometry: Geometry.uvSphere(0.72, 40, 20),
      material: new PBRMaterial({ baseColor: [0.86, 0.9, 0.96, 1], metallic: 1, roughness: 0.18 }),
      label: "public-hdr-file-loader-reflective-sphere"
    }],
    cameraPolicy: "auto-frame",
    environmentLighting: environment.lighting
  });
  renderer.device.setRenderTarget(null);
  const centerPixel = Array.from(renderer.device.readPixels(64, 64, 1, 1));

  window.__AURA3D_PUBLIC_HDR_FILE_LOADER__ = {
    status: "ready",
    source,
    radianceSize: [environment.radiance.width, environment.radiance.height],
    cubeFaceCount: environment.resources.environmentCubeTexture.cubeFaces.length,
    drawCalls: diagnostics.drawCalls,
    centerPixel,
    claimBoundary: "Production-runtime public Radiance HDR file-to-environment proof; this does not claim EXR, root createAuraApp exposure, or arbitrary image decoding."
  };
  renderer.dispose();
  environment.dispose();
}

run().catch((error) => {
  window.__AURA3D_PUBLIC_HDR_FILE_LOADER__ = {
    status: "error",
    claimBoundary: "Production-runtime public Radiance HDR file-to-environment proof.",
    error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)
  };
});
