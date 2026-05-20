import {
  Geometry,
  PBRMaterial,
  Renderer,
  Sampler,
  TexturedPBRMaterial,
  computePerspectiveCameraFrame,
  encodeLinearHdrEnvironmentToRgba16f,
  Texture,
  TextureBinding,
  type RenderDeviceDiagnostics,
  type RenderItem
} from "/packages/rendering/src/index.js";
import {
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance
} from "/packages/rendering/src/v6/index.js";
import { composeMat4 } from "/packages/scene/src/index.js";
import {
  createV6HeroShaderLibrary,
  createV6ProductionStageScene
} from "/tests/browser/v6-production-scene-tools.js";
import * as THREE from "/node_modules/three/build/three.module.js";
import { RGBELoader } from "/node_modules/three/examples/jsm/loaders/RGBELoader.js";

declare global {
  interface Window {
    __V7_PMREM_PARITY__?: unknown;
  }
}

interface PixelStats {
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
  readonly averageLuma: number;
  readonly maxLuma: number;
  readonly centerPixel: readonly [number, number, number, number];
}

interface DiffStats {
  readonly meanDelta: number;
  readonly maxDelta: number;
  readonly changedPixels: number;
  readonly structuralSimilarityProxy: number;
}

const WIDTH = 1024;
const HEIGHT = 768;
const HDR_URI = "/fixtures/v6/environments/hdri/studio_small_08_1k.hdr";
const SKYBOX_HDR_URI = "/fixtures/v6/environments/hdri/industrial_high_contrast_1k.hdr";
const ROUGHNESS_SWATCHES = [
  { id: "mirror", roughness: 0.02, color: [1, 1, 1, 1] as const, x: -1.65 },
  { id: "low-roughness", roughness: 0.16, color: [0.95, 0.9, 0.82, 1] as const, x: -0.55 },
  { id: "medium-roughness", roughness: 0.42, color: [0.86, 0.9, 1, 1] as const, x: 0.55 },
  { id: "high-roughness", roughness: 0.74, color: [0.84, 0.86, 0.9, 1] as const, x: 1.65 }
] as const;
const TRANSMISSION_PROBES = [
  { id: "clear-glass", x: -1.05, color: [0.86, 0.96, 1, 0.55] as const, transmission: 0.92, roughness: 0.02, thickness: 0.08, attenuation: [0.9, 0.98, 1] as const, backdrop: [0.18, 0.32, 0.82, 1] as const },
  { id: "warm-volume", x: 0, color: [1, 0.86, 0.58, 0.6] as const, transmission: 0.7, roughness: 0.12, thickness: 0.45, attenuation: [1, 0.72, 0.38] as const, backdrop: [0.85, 0.25, 0.18, 1] as const },
  { id: "cool-volume", x: 1.05, color: [0.62, 0.82, 1, 0.6] as const, transmission: 0.78, roughness: 0.22, thickness: 0.68, attenuation: [0.42, 0.74, 1] as const, backdrop: [0.12, 0.7, 0.42, 1] as const }
] as const;

function createPMREMFrame() {
  return computePerspectiveCameraFrame({ min: [-2.28, -0.72, -0.62], max: [2.28, 0.72, 0.62] }, { width: WIDTH, height: HEIGHT }, {
    yawRadians: -0.34,
    pitchRadians: -0.1,
    paddingRatio: 0.22,
    fovYRadians: 0.62,
    nearPadding: 0.18,
    farPadding: 2.2
  });
}

function createTransmissionFrame() {
  return computePerspectiveCameraFrame({ min: [-1.82, -0.82, -0.72], max: [1.82, 0.82, 0.72] }, { width: WIDTH, height: HEIGHT }, {
    yawRadians: -0.24,
    pitchRadians: -0.08,
    paddingRatio: 0.18,
    fovYRadians: 0.6,
    nearPadding: 0.18,
    farPadding: 2.2
  });
}

async function run(): Promise<void> {
  const root = document.getElementById("pmrem-root");
  if (!(root instanceof HTMLElement)) throw new Error("Missing PMREM root.");
  const g3dCanvas = createCanvas("v7-pmrem-g3d");
  const threeCanvas = createCanvas("v7-pmrem-threejs");
  const diffCanvas = createCanvas("v7-pmrem-diff");
  const atlasCanvas = createCanvas("v7-pmrem-cubemap-atlas", 1024, 512);
  const g3dSkyboxCanvas = createCanvas("v7-pmrem-skybox-g3d");
  const threeSkyboxCanvas = createCanvas("v7-pmrem-skybox-threejs");
  const skyboxDiffCanvas = createCanvas("v7-pmrem-skybox-diff");
  const g3dTransmissionCanvas = createCanvas("v7-pmrem-transmission-g3d");
  const threeTransmissionCanvas = createCanvas("v7-pmrem-transmission-threejs");
  const transmissionDiffCanvas = createCanvas("v7-pmrem-transmission-diff");
  const g3dTexturedParallaxCanvas = createCanvas("v7-pmrem-textured-parallax-g3d");
  const g3dTexturedFlatCanvas = createCanvas("v7-pmrem-textured-flat-g3d");
  const texturedParallaxDiffCanvas = createCanvas("v7-pmrem-textured-parallax-diff");
  const threeTexturedTransmissionCanvas = createCanvas("v7-pmrem-textured-transmission-threejs");
  const texturedTransmissionDiffCanvas = createCanvas("v7-pmrem-textured-transmission-diff");
  root.append(
    g3dCanvas,
    threeCanvas,
    diffCanvas,
    atlasCanvas,
    g3dSkyboxCanvas,
    threeSkyboxCanvas,
    skyboxDiffCanvas,
    g3dTransmissionCanvas,
    threeTransmissionCanvas,
    transmissionDiffCanvas,
    g3dTexturedParallaxCanvas,
    g3dTexturedFlatCanvas,
    texturedParallaxDiffCanvas,
    threeTexturedTransmissionCanvas,
    texturedTransmissionDiffCanvas
  );

  const hdr = await fetchBytes(`${location.origin}${HDR_URI}`);
  const hdrPipeline = createV6PbrHdrPipelineFromRadiance(hdr, {
    id: "studio-small-08-pmrem-delta",
    label: "Studio Small 08 PMREM Delta",
    intensity: 1.35,
    backgroundIntensity: 0.9,
    rotation: 0.18,
    toneMapping: { operator: "filmic", exposure: 1.05, whitePoint: 11.2 },
    cubemapFaceSize: 128
  });
  const skyboxHdr = await fetchBytes(`${location.origin}${SKYBOX_HDR_URI}`);
  const skyboxHdrPipeline = createV6PbrHdrPipelineFromRadiance(skyboxHdr, {
    id: "industrial-high-contrast-skybox-coverage",
    label: "Industrial High Contrast Skybox Coverage",
    intensity: 1.28,
    backgroundIntensity: 1,
    rotation: 0,
    toneMapping: { operator: "filmic", exposure: 1.05, whitePoint: 11.2 },
    cubemapFaceSize: 128
  });
  const g3d = await renderG3D(g3dCanvas, hdrPipeline);
  const threejs = await renderThree(threeCanvas, `${location.origin}${HDR_URI}`);
  const diff = renderDiff(g3d.pixels, threejs.pixels, diffCanvas);
  const cubemapAtlas = renderCubemapAtlas(hdrPipeline, atlasCanvas);
  const g3dSkybox = await renderG3DSkybox(g3dSkyboxCanvas, skyboxHdrPipeline);
  const threejsSkybox = await renderThreeSkybox(threeSkyboxCanvas, `${location.origin}${SKYBOX_HDR_URI}`);
  const skyboxDiff = renderDiff(g3dSkybox.pixels, threejsSkybox.pixels, skyboxDiffCanvas);
  const g3dTransmission = await renderG3DTransmission(g3dTransmissionCanvas, hdrPipeline);
  const threejsTransmission = await renderThreeTransmission(threeTransmissionCanvas, `${location.origin}${HDR_URI}`);
  const transmissionDiff = renderDiff(g3dTransmission.pixels, threejsTransmission.pixels, transmissionDiffCanvas);
  const g3dTexturedParallax = await renderG3DTexturedParallaxTransmission(g3dTexturedParallaxCanvas, hdrPipeline, true);
  const g3dTexturedFlat = await renderG3DTexturedParallaxTransmission(g3dTexturedFlatCanvas, hdrPipeline, false);
  const texturedParallaxDiff = renderDiff(g3dTexturedParallax.pixels, g3dTexturedFlat.pixels, texturedParallaxDiffCanvas);
  const threejsTexturedTransmission = await renderThreeTexturedTransmission(threeTexturedTransmissionCanvas, `${location.origin}${HDR_URI}`);
  const texturedTransmissionDiff = renderDiff(g3dTexturedFlat.pixels, threejsTexturedTransmission.pixels, texturedTransmissionDiffCanvas);

  window.__V7_PMREM_PARITY__ = {
    status: "ready",
    schema: "g3d-v7-pmrem-parity/v1",
    purpose: "same-scene PMREM/reflection delta gate",
    parity: {
      claim: "bounded-threejs-cubemap-pmrem-parity",
      reason: "This artifact gates G3D GGX cubemap PMREM against a Three.js PMREMGenerator baseline for metallic roughness reflections, visible HDR skybox response, cubemap mip/face resource proof, bounded cubemap transmission/refraction, and bounded same-scene deltas. It does not claim parallax-corrected, screen-space, caustic, or multi-bounce refraction parity."
    },
    scene: {
      type: "metallic-roughness-sphere-row",
      hdrUri: HDR_URI,
      width: WIDTH,
      height: HEIGHT,
      skyboxHdrUri: SKYBOX_HDR_URI,
      setupAlignment: "shared-camera-near-black-background-same-hdri-aces-target",
      swatches: ROUGHNESS_SWATCHES
    },
    g3d: {
      diagnostics: g3d.diagnostics,
      pixelStats: analyzePixels(g3d.pixels),
      cubemapPMREMModel: hdrPipeline.diagnostics.cubemapPMREMModel,
      cubemapPMREMShaderSampling: hdrPipeline.diagnostics.cubemapPMREMShaderSampling,
      cubemapFaceSize: hdrPipeline.diagnostics.cubemapFaceSize,
      cubemapMipCount: hdrPipeline.diagnostics.cubemapMipCount,
      cubemapAtlas
    },
    threejs: {
      diagnostics: threejs.diagnostics,
      pixelStats: analyzePixels(threejs.pixels),
      pmremGenerator: true,
      environmentMapping: "PMREMGenerator.fromEquirectangular"
    },
    diff,
    skybox: {
      parity: {
        claim: "bounded-hdr-skybox-parity",
        reason: "This is a visible HDR background/skybox parity artifact for the same HDR texture, exposure, and tone-mapping intent. It does not claim parallax-corrected, screen-space, caustic, or multi-bounce refraction parity."
      },
      g3d: {
        diagnostics: g3dSkybox.diagnostics,
        pixelStats: analyzePixels(g3dSkybox.pixels),
        rendererPath: "G3D WebGL2 HDR skybox material using raw linear HDR texture, aligned ACES-style tone mapping, exposure, and rotation"
      },
      threejs: {
        diagnostics: threejsSkybox.diagnostics,
        pixelStats: analyzePixels(threejsSkybox.pixels),
        rendererPath: "Three.js scene.background using the same HDR texture"
      },
      diff: skyboxDiff
    },
    transmission: {
      parity: {
        claim: "bounded-cubemap-transmission-refraction-parity",
        reason: "This gates G3D transmission/volume materials against Three.js MeshPhysicalMaterial with same HDR, camera, tone mapping intent, colored backplates, cubemap PMREM lighting, and refracted cubemap environment sampling. It does not claim parallax-corrected, screen-space, caustic, or multi-bounce refraction parity."
      },
      probes: TRANSMISSION_PROBES,
      g3d: {
        diagnostics: g3dTransmission.diagnostics,
        pixelStats: analyzePixels(g3dTransmission.pixels),
        rendererPath: "G3D WebGL2 PBRMaterial transmission/volume uniforms with cubemap PMREM environment lighting"
      },
      threejs: {
        diagnostics: threejsTransmission.diagnostics,
        pixelStats: analyzePixels(threejsTransmission.pixels),
        rendererPath: "Three.js MeshPhysicalMaterial transmission/thickness over the same colored backplates"
      },
      diff: transmissionDiff
    },
    texturedParallax: {
      claim: "g3d-textured-pbr-parallax-transmission-browser-proof",
      reason: "This is a G3D-only browser artifact proving the textured/imported-GLTF shader path binds parallax PMREM transmission controls and renders both enabled and disabled configurations. Visible parallax delta is not claimed by this section unless the pixel diff is nonzero. It is not a Three.js parity claim.",
      enabled: {
        diagnostics: g3dTexturedParallax.diagnostics,
        pixelStats: analyzePixels(g3dTexturedParallax.pixels),
        materialPath: "TexturedPBRMaterial",
        uniforms: g3dTexturedParallax.uniforms
      },
      disabled: {
        diagnostics: g3dTexturedFlat.diagnostics,
        pixelStats: analyzePixels(g3dTexturedFlat.pixels),
        materialPath: "TexturedPBRMaterial",
        uniforms: g3dTexturedFlat.uniforms
      },
      diff: texturedParallaxDiff
    },
    texturedTransmissionParity: {
      claim: "bounded-textured-transmission-volume-threejs-delta",
      reason: "This compares G3D TexturedPBRMaterial with parallax disabled against a Three.js MeshPhysicalMaterial textured transmission/volume reference using the same HDR, camera, base texture, colored backplates, and tone-mapping intent. Parallax-enabled G3D proof is tracked separately because Three.js does not expose the same box-projected parallax PMREM controls in this harness.",
      g3d: {
        diagnostics: g3dTexturedFlat.diagnostics,
        pixelStats: analyzePixels(g3dTexturedFlat.pixels),
        materialPath: "TexturedPBRMaterial",
        uniforms: g3dTexturedFlat.uniforms
      },
      threejs: {
        diagnostics: threejsTexturedTransmission.diagnostics,
        pixelStats: analyzePixels(threejsTexturedTransmission.pixels),
        materialPath: "MeshPhysicalMaterial"
      },
      diff: texturedTransmissionDiff
    },
    artifacts: {
      g3d: "tests/reports/v7/pmrem-parity/g3d-pmrem-spheres.png",
      threejs: "tests/reports/v7/pmrem-parity/threejs-pmrem-spheres.png",
      diff: "tests/reports/v7/pmrem-parity/pmrem-diff.png",
      cubemapAtlas: "tests/reports/v7/pmrem-parity/g3d-cubemap-pmrem-atlas.png",
      g3dSkybox: "tests/reports/v7/pmrem-parity/g3d-hdr-skybox.png",
      threejsSkybox: "tests/reports/v7/pmrem-parity/threejs-hdr-skybox.png",
      skyboxDiff: "tests/reports/v7/pmrem-parity/hdr-skybox-diff.png",
      g3dTransmission: "tests/reports/v7/pmrem-parity/g3d-transmission-pmrem.png",
      threejsTransmission: "tests/reports/v7/pmrem-parity/threejs-transmission-pmrem.png",
      transmissionDiff: "tests/reports/v7/pmrem-parity/transmission-pmrem-diff.png",
      g3dTexturedParallax: "tests/reports/v7/pmrem-parity/g3d-textured-parallax-transmission.png",
      g3dTexturedFlat: "tests/reports/v7/pmrem-parity/g3d-textured-parallax-disabled.png",
      texturedParallaxDiff: "tests/reports/v7/pmrem-parity/textured-parallax-transmission-diff.png",
      threejsTexturedTransmission: "tests/reports/v7/pmrem-parity/threejs-textured-transmission.png",
      texturedTransmissionDiff: "tests/reports/v7/pmrem-parity/textured-transmission-threejs-diff.png"
    },
    dataUrls: {
      g3d: pixelsToDataUrl(g3d.pixels, WIDTH, HEIGHT, true),
      threejs: pixelsToDataUrl(threejs.pixels, WIDTH, HEIGHT, true),
      diff: diffCanvas.toDataURL("image/png"),
      cubemapAtlas: atlasCanvas.toDataURL("image/png"),
      g3dSkybox: pixelsToDataUrl(g3dSkybox.pixels, WIDTH, HEIGHT, true),
      threejsSkybox: pixelsToDataUrl(threejsSkybox.pixels, WIDTH, HEIGHT, true),
      skyboxDiff: skyboxDiffCanvas.toDataURL("image/png"),
      g3dTransmission: pixelsToDataUrl(g3dTransmission.pixels, WIDTH, HEIGHT, true),
      threejsTransmission: pixelsToDataUrl(threejsTransmission.pixels, WIDTH, HEIGHT, true),
      transmissionDiff: transmissionDiffCanvas.toDataURL("image/png"),
      g3dTexturedParallax: pixelsToDataUrl(g3dTexturedParallax.pixels, WIDTH, HEIGHT, true),
      g3dTexturedFlat: pixelsToDataUrl(g3dTexturedFlat.pixels, WIDTH, HEIGHT, true),
      texturedParallaxDiff: texturedParallaxDiffCanvas.toDataURL("image/png"),
      threejsTexturedTransmission: pixelsToDataUrl(threejsTexturedTransmission.pixels, WIDTH, HEIGHT, true),
      texturedTransmissionDiff: texturedTransmissionDiffCanvas.toDataURL("image/png")
    },
    openGaps: [
      "Delta thresholds and visual inspection still need to be tightened before claiming broad PMREM parity.",
      "Transmission/refraction PMREM behavior is now covered by a bounded cubemap-refraction probe, and textured PBR parallax controls now have G3D-only browser proof, but Three.js parallax-corrected, screen-space, caustic, and broad multi-bounce refraction parity are still not claimed.",
      "This PMREM artifact does not make broad WebGPU renderer parity or the full Three.js ecosystem replacement claim."
    ]
  };
}

function renderCubemapAtlas(
  hdrPipeline: ReturnType<typeof createV6PbrHdrPipelineFromRadiance>,
  canvas: HTMLCanvasElement
): {
  readonly faceSize: number;
  readonly displayedMipLevels: readonly number[];
  readonly displayedFaceCount: number;
  readonly model: string;
  readonly luminanceVarianceByDisplayedMip: readonly number[];
  readonly edgeMeanDeltaByDisplayedMip: readonly number[];
} {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PMREM cubemap atlas canvas requires 2D context.");
  const displayedMipLevels = [0, Math.min(3, hdrPipeline.cubemapPMREM.mipCount - 1), hdrPipeline.cubemapPMREM.mipCount - 1];
  const cell = 128;
  canvas.width = cell * 6;
  canvas.height = cell * displayedMipLevels.length;
  context.fillStyle = "#06080d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const luminanceVarianceByDisplayedMip: number[] = [];
  const edgeMeanDeltaByDisplayedMip: number[] = [];
  for (let row = 0; row < displayedMipLevels.length; row += 1) {
    const mip = displayedMipLevels[row]!;
    const level = hdrPipeline.cubemapPMREM.levels.find((candidate) => candidate.mip === mip);
    if (!level) throw new Error(`Missing G3D cubemap PMREM mip ${mip}.`);
    luminanceVarianceByDisplayedMip.push(Number(cubemapMipVariance(level.faces).toFixed(6)));
    edgeMeanDeltaByDisplayedMip.push(Number(cubemapMipEdgeDelta(level.faces).toFixed(6)));
    for (let column = 0; column < level.faces.length; column += 1) {
      const face = level.faces[column]!;
      const image = context.createImageData(face.width, face.height);
      const halfData = face.data instanceof Uint16Array ? face.data : new Uint16Array(face.data.buffer);
      for (let offset = 0; offset + 3 < halfData.length; offset += 4) {
        const red = halfFloatToNumber(halfData[offset] ?? 0);
        const green = halfFloatToNumber(halfData[offset + 1] ?? 0);
        const blue = halfFloatToNumber(halfData[offset + 2] ?? 0);
        const mapped = toneMapRgb(red, green, blue, 1.35);
        image.data[offset] = mapped[0];
        image.data[offset + 1] = mapped[1];
        image.data[offset + 2] = mapped[2];
        image.data[offset + 3] = 255;
      }
      const tile = document.createElement("canvas");
      tile.width = face.width;
      tile.height = face.height;
      const tileContext = tile.getContext("2d");
      if (!tileContext) throw new Error("Could not create cubemap atlas tile context.");
      tileContext.putImageData(image, 0, 0);
      context.imageSmoothingEnabled = true;
      context.drawImage(tile, column * cell, row * cell, cell, cell);
      context.strokeStyle = "rgba(255,255,255,0.22)";
      context.strokeRect(column * cell + 0.5, row * cell + 0.5, cell - 1, cell - 1);
    }
  }
  return {
    faceSize: hdrPipeline.cubemapPMREM.faceSize,
    displayedMipLevels,
    displayedFaceCount: displayedMipLevels.length * 6,
    model: hdrPipeline.diagnostics.cubemapPMREMModel,
    luminanceVarianceByDisplayedMip,
    edgeMeanDeltaByDisplayedMip
  };
}

async function renderG3D(
  canvas: HTMLCanvasElement,
  hdrPipeline: ReturnType<typeof createV6PbrHdrPipelineFromRadiance>
): Promise<{ readonly diagnostics: RenderDeviceDiagnostics; readonly pixels: Uint8Array }> {
  const lighting = createV6EnvironmentLightingResources(hdrPipeline);
  const sphere = Geometry.uvSphere(0.54, 96, 48);
  const renderItems: RenderItem[] = ROUGHNESS_SWATCHES.map((swatch) => ({
    label: `g3d-pmrem-${swatch.id}`,
    geometry: sphere,
    material: new PBRMaterial({
      name: `g3d-pmrem-${swatch.id}-material`,
      baseColor: swatch.color,
      metallic: 1,
      roughness: swatch.roughness,
      environmentIntensity: 0.04
    }),
    modelMatrix: composeMat4([swatch.x, 0, 0], [0, 0, 0, 1], [1, 1, 1])
  }));
  const frame = createPMREMFrame();
  const renderer = await Renderer.create({
    canvas,
    width: WIDTH,
    height: HEIGHT,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0.006, 0.008, 0.012, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets", "hdr-image-based-lighting"]
  });
  const diagnostics = renderer.render({
    renderItems,
    environmentLighting: {
      ...lighting.lighting,
      intensity: 0.034,
      environmentMapIntensity: 2.85,
      environmentMapSpecularIntensity: 4.05,
      environmentMapRotation: 0.18
    },
    cameraPolicy: "require",
    cameraPosition: frame.cameraPosition,
    postprocess: false
  }, {
    viewProjectionMatrix: frame.viewProjectionMatrix,
    viewMatrix: frame.viewMatrix,
    projectionMatrix: frame.projectionMatrix
  });
  const pixels = readCanvasBackbufferPixels(canvas);
  renderer.dispose();
  lighting.dispose();
  return { diagnostics, pixels };
}

async function renderG3DSkybox(
  canvas: HTMLCanvasElement,
  hdrPipeline: ReturnType<typeof createV6PbrHdrPipelineFromRadiance>
): Promise<{ readonly diagnostics: RenderDeviceDiagnostics; readonly pixels: Uint8Array }> {
  const lighting = createV6EnvironmentLightingResources(hdrPipeline);
  const rawSkyboxTexture = createRawHdrSkyboxTexture(hdrPipeline);
  const rawSkyboxBinding = new TextureBinding({
    name: "u_environmentMapTexture",
    texture: rawSkyboxTexture,
    sampler: new Sampler({ minFilter: "linear-mipmap-linear", magFilter: "linear", addressU: "repeat", addressV: "clamp-to-edge" }),
    expectedColorSpace: "linear"
  });
  const staged = createV6ProductionStageScene({
    renderItems: [],
    cameraPolicy: "require"
  }, { min: [-1, -1, -1], max: [1, 1, 1] }, { width: WIDTH, height: HEIGHT }, {
    includeFloor: false,
    includeBackdrop: false,
    includeSoftboxes: false,
    hdrSkybox: {
      texture: rawSkyboxBinding,
      rotation: 0,
      exposure: 1.05
    }
  });
  const renderer = await Renderer.create({
    canvas,
    width: WIDTH,
    height: HEIGHT,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0.006, 0.008, 0.012, 1],
    shaderLibrary: createV6HeroShaderLibrary(),
    requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets", "hdr-image-based-lighting"]
  });
  const diagnostics = renderer.render(staged.source, staged.camera);
  const pixels = readCanvasBackbufferPixels(canvas);
  renderer.dispose();
  rawSkyboxTexture.dispose();
  lighting.dispose();
  return { diagnostics, pixels };
}

async function renderG3DTransmission(
  canvas: HTMLCanvasElement,
  hdrPipeline: ReturnType<typeof createV6PbrHdrPipelineFromRadiance>
): Promise<{ readonly diagnostics: RenderDeviceDiagnostics; readonly pixels: Uint8Array }> {
  const lighting = createV6EnvironmentLightingResources(hdrPipeline);
  const sphere = Geometry.uvSphere(0.44, 96, 48, { textured: true });
  const backdrop = Geometry.uvSphere(0.5, 64, 32);
  const backdropItems: RenderItem[] = TRANSMISSION_PROBES.map((probe) => ({
    label: `g3d-transmission-${probe.id}-backdrop`,
    geometry: backdrop,
    material: new PBRMaterial({
      name: `g3d-transmission-${probe.id}-backdrop-material`,
      baseColor: probe.backdrop,
      metallic: 0,
      roughness: 0.48,
      environmentIntensity: 0.06
    }),
    modelMatrix: composeMat4([probe.x, 0, -0.58], [0, 0, 0, 1], [1.08, 1.08, 0.08])
  }));
  const glassItems: RenderItem[] = TRANSMISSION_PROBES.map((probe) => ({
    label: `g3d-transmission-${probe.id}`,
    geometry: sphere,
    material: new PBRMaterial({
      name: `g3d-transmission-${probe.id}-material`,
      baseColor: probe.color,
      metallic: 0,
      roughness: probe.roughness,
      environmentIntensity: 0.02,
      transmissionFactor: probe.transmission,
      diffuseTransmissionFactor: 0.18,
      diffuseTransmissionColorFactor: [probe.color[0], probe.color[1], probe.color[2]],
      transmissionFallbackEnergy: 0.46,
      volumeThicknessFactor: probe.thickness,
      volumeAttenuationDistance: 1.6,
      volumeAttenuationColor: probe.attenuation,
      ior: 1.45,
      specularFactor: 1,
      clearcoatFactor: 0.18,
      clearcoatRoughnessFactor: Math.min(0.24, probe.roughness + 0.04),
      renderState: { blend: true, depthWrite: false, cullMode: "none" }
    }),
    modelMatrix: composeMat4([probe.x, 0, 0], [0, 0, 0, 1], [1, 1, 1])
  }));
  const frame = createTransmissionFrame();
  const renderer = await Renderer.create({
    canvas,
    width: WIDTH,
    height: HEIGHT,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0.006, 0.008, 0.012, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets", "hdr-image-based-lighting"]
  });
  const diagnostics = renderer.render({
    renderItems: [...backdropItems, ...glassItems],
    environmentLighting: {
      ...lighting.lighting,
      intensity: 0.044,
      environmentMapIntensity: 3.1,
      environmentMapSpecularIntensity: 4.2,
      environmentMapRotation: 0.18
    },
    cameraPolicy: "require",
    cameraPosition: frame.cameraPosition,
    postprocess: false
  }, {
    viewProjectionMatrix: frame.viewProjectionMatrix,
    viewMatrix: frame.viewMatrix,
    projectionMatrix: frame.projectionMatrix
  });
  const pixels = readCanvasBackbufferPixels(canvas);
  renderer.dispose();
  lighting.dispose();
  return { diagnostics, pixels };
}

async function renderG3DTexturedParallaxTransmission(
  canvas: HTMLCanvasElement,
  hdrPipeline: ReturnType<typeof createV6PbrHdrPipelineFromRadiance>,
  parallaxEnabled: boolean
): Promise<{
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly pixels: Uint8Array;
  readonly uniforms: {
    readonly transmissionParallaxStrength: number;
    readonly transmissionParallaxBoxMin: readonly [number, number, number];
    readonly transmissionParallaxBoxMax: readonly [number, number, number];
    readonly transmissionBounceCount: number;
    readonly transmissionCausticStrength: number;
  };
}> {
  const lighting = createV6EnvironmentLightingResources(hdrPipeline);
  const baseColorTexture = new Texture({
    width: 4,
    height: 4,
    colorSpace: "srgb",
    label: parallaxEnabled ? "g3d-textured-parallax-base-color" : "g3d-textured-flat-base-color",
    data: new Uint8Array([
      195, 235, 255, 180, 95, 155, 255, 180, 255, 218, 118, 180, 80, 245, 190, 180,
      80, 245, 190, 180, 195, 235, 255, 180, 95, 155, 255, 180, 255, 218, 118, 180,
      255, 218, 118, 180, 80, 245, 190, 180, 195, 235, 255, 180, 95, 155, 255, 180,
      95, 155, 255, 180, 255, 218, 118, 180, 80, 245, 190, 180, 195, 235, 255, 180
    ])
  });
  const sphere = Geometry.uvSphere(0.44, 96, 48, { textured: true });
  const backdrop = Geometry.uvSphere(0.5, 64, 32);
  const parallaxStrength = parallaxEnabled ? 0.9 : 0;
  const bounceCount = parallaxEnabled ? 3 : 0;
  const causticStrength = parallaxEnabled ? 0.48 : 0;
  const boxMin = [-2.05, -1.15, -1.45] as const;
  const boxMax = [2.05, 1.15, 0.85] as const;
  const backdropItems: RenderItem[] = TRANSMISSION_PROBES.map((probe, index) => ({
    label: `${parallaxEnabled ? "g3d-textured-parallax" : "g3d-textured-flat"}-${probe.id}-backdrop`,
    geometry: backdrop,
    material: new PBRMaterial({
      name: `${parallaxEnabled ? "g3d-textured-parallax" : "g3d-textured-flat"}-${probe.id}-backdrop-material`,
      baseColor: index === 0 ? [0.12, 0.32, 0.95, 1] : index === 1 ? [1, 0.26, 0.12, 1] : [0.04, 0.82, 0.38, 1],
      metallic: 0,
      roughness: 0.32,
      environmentIntensity: 0.05
    }),
    modelMatrix: composeMat4([probe.x, 0, -0.72], [0, 0, 0, 1], [1.18, 1.18, 0.08])
  }));
  const glassItems: RenderItem[] = TRANSMISSION_PROBES.map((probe, index) => ({
    label: `${parallaxEnabled ? "g3d-textured-parallax" : "g3d-textured-flat"}-${probe.id}`,
    geometry: sphere,
    material: new TexturedPBRMaterial({
      name: `${parallaxEnabled ? "g3d-textured-parallax" : "g3d-textured-flat"}-${probe.id}-material`,
      baseColor: [probe.color[0], probe.color[1], probe.color[2], 0.58],
      baseColorTexture,
      metallic: 0,
      roughness: Math.max(0.015, probe.roughness * 0.72),
      environmentIntensity: 0.02,
      transmissionFactor: Math.min(0.96, probe.transmission + 0.08),
      diffuseTransmissionFactor: 0.22,
      diffuseTransmissionColorFactor: [probe.color[0], probe.color[1], probe.color[2]],
      transmissionFallbackEnergy: 0.5,
      volumeThicknessFactor: probe.thickness + index * 0.12,
      volumeAttenuationDistance: 1.4,
      volumeAttenuationColor: probe.attenuation,
      transmissionParallaxStrength: parallaxStrength,
      transmissionParallaxBoxMin: boxMin,
      transmissionParallaxBoxMax: boxMax,
      transmissionBounceCount: bounceCount,
      transmissionCausticStrength: causticStrength,
      ior: 1.48,
      specularFactor: 1,
      clearcoatFactor: 0.24,
      clearcoatRoughnessFactor: Math.min(0.22, probe.roughness + 0.035),
      renderState: { blend: true, depthWrite: false, cullMode: "none" }
    }),
    modelMatrix: composeMat4([probe.x, 0, 0], [0, 0, 0, 1], [1, 1, 1])
  }));
  const frame = createTransmissionFrame();
  const renderer = await Renderer.create({
    canvas,
    width: WIDTH,
    height: HEIGHT,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0.006, 0.008, 0.012, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets", "hdr-image-based-lighting"]
  });
  const diagnostics = renderer.render({
    renderItems: [...backdropItems, ...glassItems],
    environmentLighting: {
      ...lighting.lighting,
      intensity: 0.04,
      environmentMapIntensity: 3.3,
      environmentMapSpecularIntensity: 4.35,
      environmentMapRotation: 0.18
    },
    cameraPolicy: "require",
    cameraPosition: frame.cameraPosition,
    postprocess: false
  }, {
    viewProjectionMatrix: frame.viewProjectionMatrix,
    viewMatrix: frame.viewMatrix,
    projectionMatrix: frame.projectionMatrix
  });
  const pixels = readCanvasBackbufferPixels(canvas);
  renderer.dispose();
  baseColorTexture.dispose();
  lighting.dispose();
  return {
    diagnostics,
    pixels,
    uniforms: {
      transmissionParallaxStrength: parallaxStrength,
      transmissionParallaxBoxMin: boxMin,
      transmissionParallaxBoxMax: boxMax,
      transmissionBounceCount: bounceCount,
      transmissionCausticStrength: causticStrength
    }
  };
}

function createRawHdrSkyboxTexture(hdrPipeline: ReturnType<typeof createV6PbrHdrPipelineFromRadiance>): Texture {
  const level = encodeLinearHdrEnvironmentToRgba16f(hdrPipeline.linear);
  return new Texture({
    width: level.width,
    height: level.height,
    format: "rgba16f",
    colorSpace: "linear",
    label: `v7-${hdrPipeline.id}-raw-visible-skybox`,
    data: level.data
  });
}

async function renderThree(canvas: HTMLCanvasElement, hdrUrl: string): Promise<{
  readonly diagnostics: { readonly drawCalls: number; readonly triangles: number; readonly textures: number };
  readonly pixels: Uint8Array;
}> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020203);
  const hdrTexture = await new Promise<THREE.Texture>((resolve, reject) => {
    new RGBELoader().load(hdrUrl, resolve, undefined, reject);
  });
  hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(hdrTexture).texture;
  scene.environment = environment;
  scene.add(new THREE.HemisphereLight(0x283043, 0x050507, 0.18));
  const frame = createPMREMFrame();
  const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(0.62), WIDTH / HEIGHT, 0.03, 100);
  camera.position.set(frame.cameraPosition[0], frame.cameraPosition[1], frame.cameraPosition[2]);
  camera.lookAt(0, 0, 0);
  const geometry = new THREE.SphereGeometry(0.54, 96, 48);
  for (const swatch of ROUGHNESS_SWATCHES) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: new THREE.Color(swatch.color[0], swatch.color[1], swatch.color[2]),
      metalness: 1,
      roughness: swatch.roughness,
      envMapIntensity: 1.55
    }));
    mesh.position.set(swatch.x, 0, 0);
    scene.add(mesh);
  }
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
  pmrem.dispose();
  hdrTexture.dispose();
  environment.dispose();
  renderer.dispose();
  return { diagnostics, pixels };
}

async function renderThreeSkybox(canvas: HTMLCanvasElement, hdrUrl: string): Promise<{
  readonly diagnostics: { readonly drawCalls: number; readonly triangles: number; readonly textures: number };
  readonly pixels: Uint8Array;
}> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const hdrTexture = await new Promise<THREE.Texture>((resolve, reject) => {
    new RGBELoader().load(hdrUrl, resolve, undefined, reject);
  });
  hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = hdrTexture;
  const frame = createPMREMFrame();
  const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(0.62), WIDTH / HEIGHT, 0.03, 100);
  camera.position.set(frame.cameraPosition[0], frame.cameraPosition[1], frame.cameraPosition[2]);
  camera.lookAt(0, 0, 0);
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
  hdrTexture.dispose();
  renderer.dispose();
  return { diagnostics, pixels };
}

async function renderThreeTransmission(canvas: HTMLCanvasElement, hdrUrl: string): Promise<{
  readonly diagnostics: { readonly drawCalls: number; readonly triangles: number; readonly textures: number };
  readonly pixels: Uint8Array;
}> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020203);
  const hdrTexture = await new Promise<THREE.Texture>((resolve, reject) => {
    new RGBELoader().load(hdrUrl, resolve, undefined, reject);
  });
  hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(hdrTexture).texture;
  scene.environment = environment;
  scene.add(new THREE.HemisphereLight(0x273043, 0x050507, 0.12));
  const frame = createTransmissionFrame();
  const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(0.6), WIDTH / HEIGHT, 0.03, 100);
  camera.position.set(frame.cameraPosition[0], frame.cameraPosition[1], frame.cameraPosition[2]);
  camera.lookAt(0, 0, 0);
  const sphereGeometry = new THREE.SphereGeometry(0.44, 96, 48);
  const backdropGeometry = new THREE.SphereGeometry(0.5, 64, 32);
  for (const probe of TRANSMISSION_PROBES) {
    const backdrop = new THREE.Mesh(backdropGeometry, new THREE.MeshStandardMaterial({
      color: new THREE.Color(probe.backdrop[0], probe.backdrop[1], probe.backdrop[2]),
      metalness: 0,
      roughness: 0.48,
      envMapIntensity: 0.35
    }));
    backdrop.position.set(probe.x, 0, -0.58);
    backdrop.scale.set(1.08, 1.08, 0.08);
    scene.add(backdrop);
  }
  for (const probe of TRANSMISSION_PROBES) {
    const glass = new THREE.Mesh(sphereGeometry, new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(probe.color[0], probe.color[1], probe.color[2]),
      metalness: 0,
      roughness: probe.roughness,
      transmission: probe.transmission,
      thickness: probe.thickness,
      attenuationDistance: 1.6,
      attenuationColor: new THREE.Color(probe.attenuation[0], probe.attenuation[1], probe.attenuation[2]),
      ior: 1.45,
      specularIntensity: 1,
      clearcoat: 0.18,
      clearcoatRoughness: Math.min(0.24, probe.roughness + 0.04),
      envMapIntensity: 1.8,
      transparent: true,
      opacity: probe.color[3],
      depthWrite: false
    }));
    glass.position.set(probe.x, 0, 0);
    scene.add(glass);
  }
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
  pmrem.dispose();
  hdrTexture.dispose();
  environment.dispose();
  renderer.dispose();
  return { diagnostics, pixels };
}

async function renderThreeTexturedTransmission(canvas: HTMLCanvasElement, hdrUrl: string): Promise<{
  readonly diagnostics: { readonly drawCalls: number; readonly triangles: number; readonly textures: number };
  readonly pixels: Uint8Array;
}> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020203);
  const hdrTexture = await new Promise<THREE.Texture>((resolve, reject) => {
    new RGBELoader().load(hdrUrl, resolve, undefined, reject);
  });
  hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(hdrTexture).texture;
  scene.environment = environment;
  scene.add(new THREE.HemisphereLight(0x273043, 0x050507, 0.12));
  const frame = createTransmissionFrame();
  const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(0.6), WIDTH / HEIGHT, 0.03, 100);
  camera.position.set(frame.cameraPosition[0], frame.cameraPosition[1], frame.cameraPosition[2]);
  camera.lookAt(0, 0, 0);
  const baseColorTexture = createThreeParallaxBaseColorTexture();
  const sphereGeometry = new THREE.SphereGeometry(0.44, 96, 48);
  const backdropGeometry = new THREE.SphereGeometry(0.5, 64, 32);
  for (let index = 0; index < TRANSMISSION_PROBES.length; index += 1) {
    const probe = TRANSMISSION_PROBES[index]!;
    const backdrop = new THREE.Mesh(backdropGeometry, new THREE.MeshStandardMaterial({
      color: index === 0 ? new THREE.Color(0.12, 0.32, 0.95) : index === 1 ? new THREE.Color(1, 0.26, 0.12) : new THREE.Color(0.04, 0.82, 0.38),
      metalness: 0,
      roughness: 0.32,
      envMapIntensity: 0.35
    }));
    backdrop.position.set(probe.x, 0, -0.72);
    backdrop.scale.set(1.18, 1.18, 0.08);
    scene.add(backdrop);
  }
  for (let index = 0; index < TRANSMISSION_PROBES.length; index += 1) {
    const probe = TRANSMISSION_PROBES[index]!;
    const glass = new THREE.Mesh(sphereGeometry, new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(probe.color[0], probe.color[1], probe.color[2]),
      map: baseColorTexture,
      metalness: 0,
      roughness: Math.max(0.015, probe.roughness * 0.72),
      transmission: Math.min(0.96, probe.transmission + 0.08),
      thickness: probe.thickness + index * 0.12,
      attenuationDistance: 1.4,
      attenuationColor: new THREE.Color(probe.attenuation[0], probe.attenuation[1], probe.attenuation[2]),
      ior: 1.48,
      specularIntensity: 1,
      clearcoat: 0.24,
      clearcoatRoughness: Math.min(0.22, probe.roughness + 0.035),
      envMapIntensity: 1.85,
      transparent: true,
      opacity: 0.58,
      depthWrite: false
    }));
    glass.position.set(probe.x, 0, 0);
    scene.add(glass);
  }
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
  sphereGeometry.dispose();
  backdropGeometry.dispose();
  baseColorTexture.dispose();
  pmrem.dispose();
  hdrTexture.dispose();
  environment.dispose();
  renderer.dispose();
  return { diagnostics, pixels };
}

function createThreeParallaxBaseColorTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([
    195, 235, 255, 180, 95, 155, 255, 180, 255, 218, 118, 180, 80, 245, 190, 180,
    80, 245, 190, 180, 195, 235, 255, 180, 95, 155, 255, 180, 255, 218, 118, 180,
    255, 218, 118, 180, 80, 245, 190, 180, 195, 235, 255, 180, 95, 155, 255, 180,
    95, 155, 255, 180, 255, 218, 118, 180, 80, 245, 190, 180, 195, 235, 255, 180
  ]), 4, 4, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function renderDiff(leftPixels: Uint8Array, rightPixels: Uint8Array, output: HTMLCanvasElement): DiffStats {
  const context = output.getContext("2d");
  if (!context) throw new Error("PMREM diff canvas requires 2D context.");
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
  const centerOffset = ((Math.floor(HEIGHT / 2) * WIDTH) + Math.floor(WIDTH / 2)) * 4;
  return {
    nonBlackPixels,
    uniqueColorBuckets: buckets.size,
    averageLuma: Number((lumaTotal / (WIDTH * HEIGHT)).toFixed(6)),
    maxLuma: Number(maxLuma.toFixed(6)),
    centerPixel: [
      pixels[centerOffset] ?? 0,
      pixels[centerOffset + 1] ?? 0,
      pixels[centerOffset + 2] ?? 0,
      pixels[centerOffset + 3] ?? 0
    ]
  };
}

function readCanvasBackbufferPixels(canvas: HTMLCanvasElement): Uint8Array {
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) throw new Error("PMREM G3D canvas does not expose a WebGL context for pixel readback.");
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.finish();
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

function pixelsToDataUrl(pixels: Uint8Array, width: number, height: number, flipY: boolean): string {
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  if (!context) throw new Error("Could not create PMREM capture canvas.");
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

function cubemapMipVariance(faces: readonly { readonly data: Uint16Array | Float32Array | readonly number[] }[]): number {
  const values: number[] = [];
  for (const face of faces) {
    const data = face.data;
    for (let offset = 0; offset + 2 < data.length; offset += 4) {
      const luma = linearLuma(sampleLinear(data, offset), sampleLinear(data, offset + 1), sampleLinear(data, offset + 2));
      values.push(luma);
    }
  }
  const mean = values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
  return values.reduce((total, value) => total + (value - mean) ** 2, 0) / Math.max(1, values.length);
}

function cubemapMipEdgeDelta(faces: readonly { readonly width: number; readonly height: number; readonly data: Uint16Array | Float32Array | readonly number[] }[]): number {
  const deltas: number[] = [];
  for (const face of faces) {
    const top = faceEdgeMean(face, "top");
    const bottom = faceEdgeMean(face, "bottom");
    const left = faceEdgeMean(face, "left");
    const right = faceEdgeMean(face, "right");
    deltas.push(Math.abs(top - bottom), Math.abs(left - right));
  }
  return deltas.reduce((total, value) => total + value, 0) / Math.max(1, deltas.length);
}

function faceEdgeMean(
  face: { readonly width: number; readonly height: number; readonly data: Uint16Array | Float32Array | readonly number[] },
  edge: "top" | "bottom" | "left" | "right"
): number {
  let total = 0;
  let count = 0;
  const sample = (x: number, y: number): void => {
    const offset = (y * face.width + x) * 4;
    total += linearLuma(sampleLinear(face.data, offset), sampleLinear(face.data, offset + 1), sampleLinear(face.data, offset + 2));
    count += 1;
  };
  if (edge === "top" || edge === "bottom") {
    const y = edge === "top" ? 0 : face.height - 1;
    for (let x = 0; x < face.width; x += 1) sample(x, y);
  } else {
    const x = edge === "left" ? 0 : face.width - 1;
    for (let y = 0; y < face.height; y += 1) sample(x, y);
  }
  return total / Math.max(1, count);
}

function sampleLinear(data: Uint16Array | Float32Array | readonly number[], offset: number): number {
  const value = data[offset] ?? 0;
  return data instanceof Uint16Array ? halfFloatToNumber(value) : Math.max(0, value);
}

function linearLuma(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function toneMapRgb(red: number, green: number, blue: number, exposure: number): readonly [number, number, number] {
  return [
    toneMapChannel(red * exposure),
    toneMapChannel(green * exposure),
    toneMapChannel(blue * exposure)
  ];
}

function toneMapChannel(value: number): number {
  const mapped = Math.max(0, value) / (Math.max(0, value) + 1);
  const srgb = mapped <= 0.0031308 ? mapped * 12.92 : 1.055 * Math.pow(mapped, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(srgb * 255)));
}

function halfFloatToNumber(value: number): number {
  const sign = (value & 0x8000) ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) {
    return sign * 2 ** -14 * (fraction / 1024);
  }
  if (exponent === 31) {
    return fraction === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN;
  }
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function createCanvas(id: string, width = WIDTH, height = HEIGHT): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.id = id;
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.arrayBuffer();
}

run().catch((error) => {
  window.__V7_PMREM_PARITY__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});
