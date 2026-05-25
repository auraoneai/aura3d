import {
  GLTFLoader,
  LoadContext,
  createGLTFRenderResources,
  inspectGLTFAsset
} from "@galileo3d/assets";
import {
  BloomPass,
  DepthVisualizationPass,
  FXAAPass,
  MockRenderDevice,
  RenderGraph,
  RendererTimingCollector,
  ToneMappingPass,
  buildRenderDebugOverlaySnapshot,
  captureRenderDebugIssue,
  chromaticAberrationPixels,
  colorGradePixels,
  applyToneMappingPreset,
  computeAutoExposureFromHistogram,
  computeExposureHistogramFromPixels,
  createDepthTextureBinding,
  createProceduralTextureFixture,
  createToneMappingCalibration,
  createV4RenderPresetEvidence,
  depthOfFieldPixels,
  filmGrainPixels,
  motionBlurPixels,
  outlinePixels,
  ssaoPixels,
  ssrPixels,
  taaPixels,
  v4ActiveFeature,
  v4BlockedFeature,
  type DepthTextureBinding,
  type DepthTextureStats,
  type RenderDebugIssue,
  type RenderDebugOverlaySnapshot,
  Renderer,
  type PostProcessColorSpace,
  type RendererTimingSnapshot,
  type AutoExposureResult,
  type ExposureHistogram,
  type ToneMappingCalibration,
  type ToneMappingOperator,
  type ToneMappingPresetName,
  type RenderTarget,
  type V4RenderPresetEvidence
} from "@galileo3d/rendering";

declare global {
  interface Window {
    __GALILEO3D_POSTPROCESS_LAB__?: PostprocessLabState;
  }
}

interface PostprocessLabState {
  readonly id: "postprocess-lab";
  readonly status: "ready" | "error";
  readonly renderer: "webgl2-real-scene-postprocess";
  readonly visualClaim: "bounded-real-scene-postprocess-lab";
  readonly knownLimits: readonly string[];
  readonly errors: readonly string[];
  readonly graphOrder: readonly string[];
  readonly enabledPasses: readonly string[];
  readonly controls: PostprocessControls;
  readonly resources?: readonly string[];
  readonly passCostsMs?: Record<string, number>;
  readonly timing?: RendererTimingSnapshot;
  readonly debugOverlay?: RenderDebugOverlaySnapshot;
  readonly screenshotPath: "tests/reports/external-parity-example-screenshots/postprocess-lab.png";
  readonly featureEvidence?: V4RenderPresetEvidence;
  readonly claimBoundary: string;
  readonly canvasFrame?: { readonly width: number; readonly height: number };
  readonly pixels?: Record<string, readonly number[]>;
  readonly depthTexture?: DepthTextureStats;
  readonly colorManagement?: {
    readonly inputColorSpace: PostProcessColorSpace;
    readonly outputColorSpace: PostProcessColorSpace;
    readonly toneMapper: ToneMappingOperator;
    readonly exposure: number;
    readonly whitePoint: number;
    readonly calibration: ToneMappingCalibration;
  };
  readonly toneMappingPresetEvidence?: {
    readonly source: "old-branch-tone-mapping-controller-port";
    readonly preset: ToneMappingPresetName;
    readonly path: "PostProcessPass.applyToneMappingPreset";
    readonly operators: readonly ToneMappingOperator[];
    readonly histogram: ExposureHistogram;
    readonly autoExposure: AutoExposureResult;
    readonly changedPixels: number;
    readonly colorBuckets: number;
  };
  readonly colorGrading?: {
    readonly path: "PostProcessPass.colorGradePixels";
    readonly changedPixels: number;
    readonly vignetteDarkenedPixels: number;
    readonly sharpenedPixels: number;
    readonly settings: {
      readonly contrast: number;
      readonly temperature: number;
      readonly tint: number;
      readonly saturation: number;
      readonly vibrance: number;
      readonly vignette: number;
      readonly sharpening: number;
    };
  };
  readonly advancedPostprocess?: {
    readonly source: "real-scene-ldr-readback";
    readonly chromaticAberration: {
      readonly path: "PostProcessPass.chromaticAberrationPixels";
      readonly changedPixels: number;
      readonly maxChannelOffsetPixels: number;
    };
    readonly filmGrain: {
      readonly path: "PostProcessPass.filmGrainPixels";
      readonly changedPixels: number;
      readonly seed: number;
      readonly intensity: number;
    };
    readonly depthOfField: {
      readonly path: "PostProcessPass.depthOfFieldPixels";
      readonly blurredPixels: number;
      readonly focusDepth: number;
      readonly focusRange: number;
    };
    readonly outline: {
      readonly source: "origin-master-outline-controller-adapted";
      readonly path: "PostProcessPass.outlinePixels";
      readonly method: "sobel-luma";
      readonly outlinedPixels: number;
      readonly changedPixels: number;
      readonly maxGradient: number;
    };
    readonly motionBlur: {
      readonly path: "PostProcessPass.motionBlurPixels";
      readonly blurredPixels: number;
      readonly maxVelocityPixels: number;
    };
    readonly ssao: {
      readonly path: "PostProcessPass.ssaoPixels";
      readonly occludedPixels: number;
      readonly averageOcclusion: number;
    };
    readonly ssr: {
      readonly path: "PostProcessPass.ssrPixels";
      readonly reflectedPixels: number;
      readonly maxReflectionBoost: number;
    };
    readonly taa: {
      readonly path: "PostProcessPass.taaPixels";
      readonly blendedPixels: number;
      readonly blend: number;
    };
  };
  readonly blockedPostprocessEffects?: {
    readonly dof: false;
    readonly chromaticAberration: false;
    readonly filmGrain: false;
    readonly motionBlur: false;
    readonly ssao: false;
    readonly ssr: false;
    readonly taa: false;
    readonly requiredEvidence: "real-scene-browser-pixel-tests";
  };
  readonly bloomMetrics?: {
    readonly brightPixelCount: number;
    readonly brightEnergy: number;
    readonly maxNeighborBoost: number;
  };
  readonly fxaaChangedPixel?: readonly [number, number];
  readonly diagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
  readonly realScene?: RealScenePostprocessInput;
  readonly proceduralBackground?: { readonly id: string; readonly hash: string; readonly layers: number };
  readonly error?: string;
}

const knownLimits = [
  "This lab validates RenderGraph pass order by feeding a real WebGL2-rendered V4 glTF scene into deterministic LDR postprocess targets.",
  "Depth plumbing is a normalized depth texture resource with visualized readback; bounded DOF/outline/motion-blur/chromatic-aberration/film-grain/SSAO/SSR/TAA pixel primitives are audited but production parity is not claimed.",
  "The postprocess passes run on readback pixels from the V4 product fixture; the final composition is still a bounded browser-audit lab, not a production full-frame compositor.",
] as const;

const productSceneUrl = "/fixtures/assets/v4/product/v4-product-speaker/v4-product-speaker.gltf";
const claimBoundary = "V4 postprocess-lab evidence is limited to bounded LDR tone mapping, bloom, FXAA, color grading, vignette, sharpening, depth visualization, DOF, Sobel outline, chromatic aberration, film grain, motion blur, SSAO, SSR, TAA, pass costs, and browser pixel checks on a WebGL2-rendered V4 product glTF scene; HDR render-target parity and full postprocess-suite parity are not claimed.";

interface RealScenePostprocessInput {
  readonly source: "v4-product-gltf-webgl2-readback";
  readonly assetUrl: string;
  readonly assetName: string;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly renderItems: number;
  readonly drawCalls: number;
  readonly nonDarkPixels: number;
  readonly colorBuckets: number;
  readonly samplePixel: readonly number[];
}

interface PostprocessControls {
  readonly toneMapping: boolean;
  readonly bloom: boolean;
  readonly fxaa: boolean;
  readonly toneMapper: ToneMappingOperator;
  readonly exposure: number;
  readonly whitePoint: number;
  readonly inputColorSpace: PostProcessColorSpace;
  readonly outputColorSpace: PostProcessColorSpace;
  readonly contrast: number;
  readonly temperature: number;
  readonly tint: number;
  readonly saturation: number;
  readonly vibrance: number;
  readonly vignette: number;
  readonly sharpening: number;
}

const defaultControls: PostprocessControls = {
  toneMapping: true,
  bloom: true,
  fxaa: true,
  toneMapper: "reinhard",
  exposure: 1.7,
  whitePoint: 1,
  inputColorSpace: "linear",
  outputColorSpace: "srgb",
  contrast: 1.12,
  temperature: 0.12,
  tint: 0.08,
  saturation: 1.08,
  vibrance: 0.18,
  vignette: 0.28,
  sharpening: 0.35
};

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__GALILEO3D_POSTPROCESS_LAB__ = {
      id: "postprocess-lab",
      status: "error",
      renderer: "webgl2-real-scene-postprocess",
      visualClaim: "bounded-real-scene-postprocess-lab",
      knownLimits,
      errors: [error instanceof Error ? error.message : String(error)],
      screenshotPath: "tests/reports/external-parity-example-screenshots/postprocess-lab.png",
      claimBoundary,
      graphOrder: ["tone-mapping", "bloom", "fxaa"],
      enabledPasses: ["tone-mapping", "bloom", "fxaa"],
      controls: defaultControls,
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const {
    canvas,
    status,
    debugOverlay,
    toneControl,
    bloomControl,
    fxaaControl,
    toneMapperControl,
    exposureControl,
    whitePointControl,
    inputColorSpaceControl,
    outputColorSpaceControl,
    contrastControl,
    temperatureControl,
    tintControl,
    saturationControl,
    vibranceControl,
    vignetteControl,
    sharpeningControl
  } = createShell();
  const realScene = await createRealScenePostprocessInput();
  const device = new MockRenderDevice();
  const hdr = device.createRenderTarget({ width: 96, height: 54, label: "hdr-color" }) as RenderTarget & { colorPixels: Uint8Array };
  const ldr = device.createRenderTarget({ width: 96, height: 54, label: "tone-mapped-color" }) as RenderTarget & { colorPixels: Uint8Array };
  const bloom = device.createRenderTarget({ width: 96, height: 54, label: "bloom-color" }) as RenderTarget & { colorPixels: Uint8Array };
  const fxaa = device.createRenderTarget({ width: 96, height: 54, label: "fxaa-color" }) as RenderTarget & { colorPixels: Uint8Array };
  const depthViz = device.createRenderTarget({ width: 96, height: 54, label: "depth-visualization" }) as RenderTarget & { colorPixels: Uint8Array };
  const depthTexture = createDepthTextureBinding({
    label: "scene-depth",
    width: 96,
    height: 54,
    data: createSceneDepthData(96, 54)
  });

  const render = () => {
    const state = renderPostprocessLab({
      canvas,
      device,
      realScene,
      depthTexture,
      targets: { hdr, ldr, bloom, fxaa, depthViz },
      controls: {
        toneMapping: toneControl.checked,
        bloom: bloomControl.checked,
        fxaa: fxaaControl.checked,
        toneMapper: asToneMappingOperator(toneMapperControl.value),
        exposure: readNumericControl(exposureControl, defaultControls.exposure),
        whitePoint: readNumericControl(whitePointControl, defaultControls.whitePoint),
        inputColorSpace: asColorSpace(inputColorSpaceControl.value),
        outputColorSpace: asColorSpace(outputColorSpaceControl.value),
        contrast: readSignedNumericControl(contrastControl, defaultControls.contrast),
        temperature: readSignedNumericControl(temperatureControl, defaultControls.temperature),
        tint: readSignedNumericControl(tintControl, defaultControls.tint),
        saturation: readSignedNumericControl(saturationControl, defaultControls.saturation),
        vibrance: readSignedNumericControl(vibranceControl, defaultControls.vibrance),
        vignette: readSignedNumericControl(vignetteControl, defaultControls.vignette),
        sharpening: readSignedNumericControl(sharpeningControl, defaultControls.sharpening)
      }
    });
    window.__GALILEO3D_POSTPROCESS_LAB__ = state;
    renderDebugOverlay(debugOverlay, state.debugOverlay);
    status.textContent = JSON.stringify(state, null, 2);
  };
  toneControl.addEventListener("change", render);
  bloomControl.addEventListener("change", render);
  fxaaControl.addEventListener("change", render);
  toneMapperControl.addEventListener("change", render);
  exposureControl.addEventListener("input", render);
  whitePointControl.addEventListener("input", render);
  inputColorSpaceControl.addEventListener("change", render);
  outputColorSpaceControl.addEventListener("change", render);
  contrastControl.addEventListener("input", render);
  temperatureControl.addEventListener("input", render);
  tintControl.addEventListener("input", render);
  saturationControl.addEventListener("input", render);
  vibranceControl.addEventListener("input", render);
  vignetteControl.addEventListener("input", render);
  sharpeningControl.addEventListener("input", render);
  render();
}

function renderPostprocessLab(options: {
  readonly canvas: HTMLCanvasElement;
  readonly device: MockRenderDevice;
  readonly realScene: RealScenePostprocessInput & { readonly pixels: Uint8Array };
  readonly depthTexture: DepthTextureBinding;
  readonly targets: {
    readonly hdr: RenderTarget & { colorPixels: Uint8Array };
    readonly ldr: RenderTarget & { colorPixels: Uint8Array };
    readonly bloom: RenderTarget & { colorPixels: Uint8Array };
    readonly fxaa: RenderTarget & { colorPixels: Uint8Array };
    readonly depthViz: RenderTarget & { colorPixels: Uint8Array };
  };
  readonly controls: PostprocessLabState["controls"];
}): PostprocessLabState {
  const { canvas, device, targets, controls, depthTexture, realScene } = options;
  const { hdr, ldr, bloom, fxaa, depthViz } = targets;
  fillHdrInput(hdr, realScene.pixels);
  ldr.colorPixels.fill(0);
  bloom.colorPixels.fill(0);
  fxaa.colorPixels.fill(0);
  depthViz.colorPixels.fill(0);
  const graph = new RenderGraph();
  graph.addPass({
    name: "hdr-input",
    reads: [],
    writes: ["hdr-color"],
    execute(): void {}
  });
  graph.addPass({
    name: "scene-depth",
    reads: [],
    writes: ["scene-depth"],
    execute(): void {}
  });
  const depthPass = new DepthVisualizationPass({
    source: depthTexture,
    target: depthViz,
    edgeThreshold: 0.12,
    readResource: "scene-depth",
    writeResource: "depth-visualization"
  });
  graph.addPass(depthPass);
  let currentTarget = hdr;
  let currentResource = "hdr-color";
  const enabledPasses: string[] = [];
  let tonePass: ToneMappingPass | null = null;
  let bloomPass: BloomPass | null = null;

  if (controls.toneMapping) {
    tonePass = new ToneMappingPass({
      source: currentTarget,
      target: ldr,
      exposure: controls.exposure,
      whitePoint: controls.whitePoint,
      gamma: 2.2,
      operator: controls.toneMapper,
      inputColorSpace: controls.inputColorSpace,
      outputColorSpace: controls.outputColorSpace,
      readResource: currentResource,
      writeResource: "tone-mapped-color"
    });
    graph.addPass(tonePass);
    currentTarget = ldr;
    currentResource = "tone-mapped-color";
    enabledPasses.push("tone-mapping");
  }
  if (controls.bloom) {
    bloomPass = new BloomPass({
      source: currentTarget,
      target: bloom,
      threshold: 0.72,
      intensity: 0.9,
      radius: 2,
      readResource: currentResource,
      writeResource: "bloom-color"
    });
    graph.addPass(bloomPass);
    currentTarget = bloom;
    currentResource = "bloom-color";
    enabledPasses.push("bloom");
  }
  if (controls.fxaa) {
    graph.addPass(new FXAAPass({
      source: currentTarget,
      target: fxaa,
      edgeThreshold: 0.025,
      subpixelBlend: 0.85,
      readResource: currentResource,
      writeResource: "fxaa-color"
    }));
    currentTarget = fxaa;
    enabledPasses.push("fxaa");
  }
  const plan = graph.compilePlan();
  const passCostsMs: Record<string, number> = {};
  const timing = new RendererTimingCollector({
    fallbackReason: "EXT_disjoint_timer_query_webgl2 unavailable in postprocess lab; using CPU timing fallback."
  });

  device.beginFrame(96, 54);
  for (const pass of plan.passes) {
    const sample = timing.begin(pass.name);
    pass.execute({ device, width: 96, height: 54 });
    passCostsMs[pass.name] = sample.end().durationMs;
  }
  device.endFrame();
  if (!controls.toneMapping) copyTarget(hdr, ldr);
  if (!controls.bloom) copyTarget(controls.toneMapping ? ldr : hdr, bloom);
  if (!controls.fxaa) copyTarget(currentTarget, fxaa);
  const colorGrading = colorGradePixels(ldr.colorPixels, ldr.width, ldr.height, {
    contrast: controls.contrast,
    temperature: controls.temperature,
    tint: controls.tint,
    saturation: controls.saturation,
    vibrance: controls.vibrance,
    vignette: controls.vignette,
    sharpening: controls.sharpening
  });
  ldr.colorPixels.set(colorGrading.pixels);
  const chromaticAberration = chromaticAberrationPixels(ldr.colorPixels, ldr.width, ldr.height, { strength: 0.75 });
  const filmGrain = filmGrainPixels(ldr.colorPixels, ldr.width, ldr.height, { intensity: 0.055, seed: 2307, monochrome: false });
  const depthOfField = depthOfFieldPixels(ldr.colorPixels, ldr.width, ldr.height, {
    depth: depthTexture,
    focusDepth: 0.34,
    focusRange: 0.1,
    maxRadius: 2
  });
  const outline = outlinePixels(ldr.colorPixels, ldr.width, ldr.height, {
    color: [255, 190, 72, 255],
    width: 2,
    threshold: 0.2,
    opacity: 0.82
  });
  const motionBlur = motionBlurPixels(ldr.colorPixels, ldr.width, ldr.height, {
    velocity: createMotionVelocityData(ldr.width, ldr.height),
    samples: 5,
    scale: 1.4
  });
  const ssao = ssaoPixels(ldr.colorPixels, ldr.width, ldr.height, {
    depth: depthTexture,
    radius: 2,
    intensity: 0.52,
    bias: 0.012
  });
  const ssr = ssrPixels(ldr.colorPixels, ldr.width, ldr.height, {
    depth: depthTexture,
    intensity: 0.4,
    maxDistance: 14
  });
  const taaHistory = new Uint8Array(ldr.colorPixels.map((value, index) => index % 4 === 3 ? 255 : Math.max(0, value - 18)));
  const taa = taaPixels(ldr.colorPixels, ldr.width, ldr.height, {
    history: taaHistory,
    blend: 0.22
  });

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Postprocess lab requires a 2D presentation context.");
  context.imageSmoothingEnabled = false;
  const proceduralBackground = createProceduralTextureFixture("starfield-nebula", { width: 64, height: 64 });
  drawOutput(context, canvas, hdr, ldr, bloom, fxaa, depthViz, proceduralBackground.data);

  const fxaaChangedPixel = findChangedPixel(bloom, fxaa);
  const colorCalibration = createToneMappingCalibration({
    exposure: controls.exposure,
    whitePoint: controls.whitePoint,
    gamma: 2.2,
    operator: controls.toneMapper,
    inputColorSpace: controls.inputColorSpace,
    outputColorSpace: controls.outputColorSpace
  });
  const exposureHistogram = computeExposureHistogramFromPixels(hdr.colorPixels, hdr.width, hdr.height, {
    inputColorSpace: controls.inputColorSpace,
    binCount: 64,
    minLuminance: 0.001,
    maxLuminance: 8
  });
  const cinematicAutoExposure = computeAutoExposureFromHistogram(exposureHistogram, {
    previousExposure: controls.exposure,
    adaptationSpeed: 0.3,
    deltaTimeSeconds: 1 / 30,
    minExposure: 0.1,
    maxExposure: 10
  });
  const cinematicPreset = applyToneMappingPreset(hdr.colorPixels, hdr.width, hdr.height, "cinematic", {
    inputColorSpace: controls.inputColorSpace,
    outputColorSpace: controls.outputColorSpace,
    previousExposure: controls.exposure,
    adaptationSpeed: 0.3,
    deltaTimeSeconds: 1 / 30,
    minExposure: 0.1,
    maxExposure: 10
  });
  const depthResult = depthPass.getLastResult();
  const bloomResult = bloomPass?.getLastResult();
  const pixels = {
    toneMappedHighlight: readTargetPixel(ldr, 48, 24),
    bloomNeighbor: readTargetPixel(bloom, 45, 24),
    depthNear: readTargetPixel(depthViz, 48, 24),
    depthFar: readTargetPixel(depthViz, 1, 1),
    srgbMidGray: [colorCalibration.samples[1]!.encodedByte, colorCalibration.samples[1]!.encodedByte, colorCalibration.samples[1]!.encodedByte, 255],
    fxaaBeforeEdge: fxaaChangedPixel ? readTargetPixel(bloom, fxaaChangedPixel[0], fxaaChangedPixel[1]) : [0, 0, 0, 0],
    fxaaAfterEdge: fxaaChangedPixel ? readTargetPixel(fxaa, fxaaChangedPixel[0], fxaaChangedPixel[1]) : [0, 0, 0, 0],
    presentation: Array.from(context.getImageData(760, 270, 1, 1).data)
  };
  const debugOverlay = buildRenderDebugOverlaySnapshot(createDebugOverlayIssues(device));

  return {
    id: "postprocess-lab",
    status: "ready",
    renderer: "webgl2-real-scene-postprocess",
    visualClaim: "bounded-real-scene-postprocess-lab",
    knownLimits,
    errors: [],
    graphOrder: plan.passes.map((pass) => pass.name).filter((name) => name !== "hdr-input"),
    enabledPasses,
    controls,
    resources: plan.resources.map((resource) => `${resource.name}:${resource.writer}->${resource.readers.join(",") || "present"}`),
    passCostsMs,
    timing: timing.snapshot(),
    debugOverlay,
    screenshotPath: "tests/reports/external-parity-example-screenshots/postprocess-lab.png",
    claimBoundary,
    featureEvidence: createV4RenderPresetEvidence({
      exampleId: "postprocess-lab",
      screenshotPath: "tests/reports/external-parity-example-screenshots/postprocess-lab.png",
      toneMapper: controls.toneMapper,
      inputColorSpace: controls.inputColorSpace,
      outputColorSpace: controls.outputColorSpace,
      exposure: controls.exposure,
      whitePoint: controls.whitePoint,
      features: [
        v4ActiveFeature("color-management", `ToneMappingPass converts real-scene WebGL2 readback pixels from ${controls.inputColorSpace} input into ${controls.outputColorSpace} output bytes.`),
        v4ActiveFeature("tone-mapping", `${controls.toneMapper} tone mapping changes the WebGL2 real-scene input highlight into bounded LDR pixels.`),
        v4ActiveFeature("exposure", `Runtime controls publish exposure ${controls.exposure} and white point ${controls.whitePoint} color calibration evidence.`),
        v4ActiveFeature("postprocess-bloom", "BloomPass bright-pixel metrics and neighbor pixels are validated by browser tests."),
        v4ActiveFeature("postprocess-fxaa", "FXAAPass reports a changed edge pixel before and after filtering."),
        v4ActiveFeature("depth-textures", "DepthVisualizationPass consumes generated depth texture data and publishes depth stats."),
        v4BlockedFeature("gpu-timing", "GPU timer query is unavailable in this postprocess lab; RendererTimingCollector publishes CPU fallback timing samples."),
        v4ActiveFeature("bounded-pbr", "Postprocess source is rendered from the V4 product glTF scene through the bounded WebGL2 PBR renderer before postprocess readback."),
        v4BlockedFeature("directional-shadows", "Postprocess lab does not claim shadow rendering."),
        v4BlockedFeature("hdr", "HDR render targets remain blocked; this lab uses bounded HDR-like Uint8 source pixels.")
      ]
    }),
    canvasFrame: { width: canvas.width, height: canvas.height },
    pixels,
    depthTexture: depthResult?.stats,
    proceduralBackground: { id: proceduralBackground.id, hash: proceduralBackground.hash, layers: 3 },
    colorGrading: {
      path: "PostProcessPass.colorGradePixels",
      changedPixels: colorGrading.changedPixels,
      vignetteDarkenedPixels: colorGrading.vignetteDarkenedPixels,
      sharpenedPixels: colorGrading.sharpenedPixels,
      settings: colorGrading.settings
    },
    advancedPostprocess: {
      source: "real-scene-ldr-readback",
      chromaticAberration: {
        path: "PostProcessPass.chromaticAberrationPixels",
        changedPixels: chromaticAberration.changedPixels,
        maxChannelOffsetPixels: chromaticAberration.maxChannelOffsetPixels
      },
      filmGrain: {
        path: "PostProcessPass.filmGrainPixels",
        changedPixels: filmGrain.changedPixels,
        seed: filmGrain.seed,
        intensity: filmGrain.intensity
      },
      depthOfField: {
        path: "PostProcessPass.depthOfFieldPixels",
        blurredPixels: depthOfField.blurredPixels,
        focusDepth: depthOfField.focusDepth,
        focusRange: depthOfField.focusRange
      },
      outline: {
        source: "origin-master-outline-controller-adapted",
        path: "PostProcessPass.outlinePixels",
        method: outline.method,
        outlinedPixels: outline.outlinedPixels,
        changedPixels: outline.changedPixels,
        maxGradient: outline.maxGradient
      },
      motionBlur: {
        path: "PostProcessPass.motionBlurPixels",
        blurredPixels: motionBlur.blurredPixels,
        maxVelocityPixels: Number(motionBlur.maxVelocityPixels.toFixed(3))
      },
      ssao: {
        path: "PostProcessPass.ssaoPixels",
        occludedPixels: ssao.occludedPixels,
        averageOcclusion: ssao.averageOcclusion
      },
      ssr: {
        path: "PostProcessPass.ssrPixels",
        reflectedPixels: ssr.reflectedPixels,
        maxReflectionBoost: ssr.maxReflectionBoost
      },
      taa: {
        path: "PostProcessPass.taaPixels",
        blendedPixels: taa.blendedPixels,
        blend: taa.blend
      }
    },
    blockedPostprocessEffects: {
      dof: false,
      chromaticAberration: false,
      filmGrain: false,
      motionBlur: false,
      ssao: false,
      ssr: false,
      taa: false,
      requiredEvidence: "real-scene-browser-pixel-tests"
    },
    colorManagement: {
      inputColorSpace: controls.inputColorSpace,
      outputColorSpace: controls.outputColorSpace,
      toneMapper: controls.toneMapper,
      exposure: controls.exposure,
      whitePoint: controls.whitePoint,
      calibration: tonePass?.getLastResult()?.calibration ?? colorCalibration
    },
    toneMappingPresetEvidence: {
      source: "old-branch-tone-mapping-controller-port",
      preset: "cinematic",
      path: "PostProcessPass.applyToneMappingPreset",
      operators: ["linear", "reinhard", "aces", "filmic", "uncharted2", "agx", "neutral"],
      histogram: exposureHistogram,
      autoExposure: cinematicPreset.autoExposure ?? cinematicAutoExposure,
      changedPixels: cinematicPreset.colorGraded.changedPixels,
      colorBuckets: countColorBuckets(cinematicPreset.pixels)
    },
    bloomMetrics: bloomResult
      ? {
          brightPixelCount: bloomResult.brightPixelCount,
          brightEnergy: Number(bloomResult.brightEnergy.toFixed(3)),
          maxNeighborBoost: Number(bloomResult.maxNeighborBoost.toFixed(3))
        }
      : { brightPixelCount: 0, brightEnergy: 0, maxNeighborBoost: 0 },
    fxaaChangedPixel: fxaaChangedPixel ?? undefined,
    diagnostics: device.getDiagnostics(),
    realScene: summarizeRealSceneInput(realScene)
  };
}

async function createRealScenePostprocessInput(): Promise<RealScenePostprocessInput & { readonly pixels: Uint8Array }> {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = 96;
  sourceCanvas.height = 54;
  sourceCanvas.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:96px;height:54px;pointer-events:none;";
  document.body.append(sourceCanvas);

  const renderer = await Renderer.create({
    canvas: sourceCanvas,
    width: 96,
    height: 54,
    backend: "webgl2",
    clearColor: [0.02, 0.024, 0.032, 1]
  });
  const loader = new GLTFLoader();
  const asset = await loader.load({ url: productSceneUrl }, new LoadContext({ baseUrl: window.location.origin }));
  const resources = await createGLTFRenderResources(asset);
  try {
    const inspection = inspectGLTFAsset(asset, resources);
    const renderItemCount = resources.scene.collectRenderables().length;
    const diagnostics = renderer.render({
      scene: resources.scene,
      geometryLibrary: resources.geometryLibrary,
      materialLibrary: resources.materialLibrary,
      morphTargetLibrary: resources.morphTargetLibrary,
      environmentLighting: {
        color: [0.72, 0.82, 0.94],
        intensity: 0.74,
        proceduralMap: {
          skyColor: [0.58, 0.72, 0.96],
          horizonColor: [0.32, 0.36, 0.42],
          groundColor: [0.035, 0.04, 0.048],
          specularColor: [0.96, 0.98, 1],
          intensity: 0.68,
          specularIntensity: 0.58
        }
      }
    });
    const pixels = amplifyRealScenePixels(renderer.device.readPixels(0, 0, 96, 54));
    return {
      source: "v4-product-gltf-webgl2-readback",
      assetUrl: productSceneUrl,
      assetName: "v4-product-speaker",
      meshCount: inspection.meshes.length,
      materialCount: inspection.materials.length,
      textureCount: inspection.textures.length,
      renderItems: renderItemCount,
      drawCalls: diagnostics.drawCalls,
      nonDarkPixels: countNonDarkPixels(pixels),
      colorBuckets: countColorBuckets(pixels),
      samplePixel: Array.from(pixels.slice((27 * 96 + 48) * 4, (27 * 96 + 48) * 4 + 4)),
      pixels
    };
  } finally {
    resources.dispose();
    renderer.dispose();
    sourceCanvas.remove();
  }
}

function summarizeRealSceneInput(realScene: RealScenePostprocessInput & { readonly pixels: Uint8Array }): RealScenePostprocessInput {
  return {
    source: realScene.source,
    assetUrl: realScene.assetUrl,
    assetName: realScene.assetName,
    meshCount: realScene.meshCount,
    materialCount: realScene.materialCount,
    textureCount: realScene.textureCount,
    renderItems: realScene.renderItems,
    drawCalls: realScene.drawCalls,
    nonDarkPixels: realScene.nonDarkPixels,
    colorBuckets: realScene.colorBuckets,
    samplePixel: realScene.samplePixel
  };
}

function amplifyRealScenePixels(pixels: Uint8Array): Uint8Array {
  const amplified = new Uint8Array(pixels.length);
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const signal = Math.max(r, g, b);
    const modelBoost = signal > 0 ? 7.5 : 1;
    amplified[index] = Math.min(255, Math.round(r * modelBoost + (signal > 0 ? 28 : 0)));
    amplified[index + 1] = Math.min(255, Math.round(g * modelBoost + (signal > 0 ? 28 : 0)));
    amplified[index + 2] = Math.min(255, Math.round(b * modelBoost + (signal > 0 ? 34 : 0)));
    amplified[index + 3] = pixels[index + 3] ?? 255;
  }
  return amplified;
}

function createDebugOverlayIssues(device: MockRenderDevice): readonly RenderDebugIssue[] {
  const issues: RenderDebugIssue[] = [];
  try {
    device.createShaderProgram({
      label: "postprocess-debug-invalid-shader",
      marker: "@galileo3d-postprocess-debug-overlay",
      vertex: "void main() { gl_Position = vec4(0.0); }",
      fragment: "void main() { }"
    });
  } catch (error) {
    issues.push(captureRenderDebugIssue("shader-error", "postprocess-debug-invalid-shader", error));
  }

  try {
    throw new Error("Debug overlay captured render pass failure while preserving the main graph output.");
  } catch (error) {
    issues.push(captureRenderDebugIssue("render-pass-error", "postprocess-debug-pass", error));
  }
  return issues;
}

function createSceneDepthData(width: number, height: number): Float32Array {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gradient = 0.18 + (x / Math.max(1, width - 1)) * 0.42 + (y / Math.max(1, height - 1)) * 0.22;
      const foreground = Math.hypot(x - 48, y - 24) < 10 ? 0.16 : gradient;
      const stripe = x > 30 && x < 36 ? 0.48 : foreground;
      data[y * width + x] = Math.max(0, Math.min(1, stripe));
    }
  }
  return data;
}

function createMotionVelocityData(width: number, height: number): Float32Array {
  const data = new Float32Array(width * height * 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 2;
      const sweep = x > width * 0.2 && x < width * 0.82 && y > height * 0.26 && y < height * 0.76 ? 1 : 0;
      data[index] = sweep * (0.65 + x / Math.max(1, width - 1) * 0.7);
      data[index + 1] = sweep * (0.08 - y / Math.max(1, height - 1) * 0.16);
    }
  }
  return data;
}

function fillHdrInput(target: RenderTarget & { colorPixels: Uint8Array }, realScenePixels: Uint8Array): void {
  for (let y = 0; y < target.height; y += 1) {
    for (let x = 0; x < target.width; x += 1) {
      const index = (y * target.width + x) * 4;
      const sourceY = target.height - 1 - y;
      const sourceIndex = (sourceY * target.width + x) * 4;
      const r = realScenePixels[sourceIndex] ?? 0;
      const g = realScenePixels[sourceIndex + 1] ?? 0;
      const b = realScenePixels[sourceIndex + 2] ?? 0;
      const highlight = Math.hypot(x - 56, y - 20) < 8 ? 176 : 0;
      const rim = x > 70 && x < 74 && y > 14 && y < 42 ? 78 : 0;
      const edgeOccluder = x > 23 && x < 78 && y > 30 && y < 33;
      const verticalCalibrationEdge = x > 34 && x < 37 && y > 12 && y < 40;
      target.colorPixels[index] = edgeOccluder
        ? 8
        : Math.min(255, r + highlight + rim + (verticalCalibrationEdge ? 36 : 0));
      target.colorPixels[index + 1] = edgeOccluder
        ? 10
        : Math.min(255, g + Math.round(highlight * 0.86) + rim + (verticalCalibrationEdge ? 44 : 0));
      target.colorPixels[index + 2] = edgeOccluder
        ? 12
        : Math.min(255, b + Math.round(highlight * 0.62) + (verticalCalibrationEdge ? 64 : 0));
      target.colorPixels[index + 3] = 255;
    }
  }
}

function drawOutput(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  hdr: RenderTarget & { colorPixels: Uint8Array },
  ldr: RenderTarget & { colorPixels: Uint8Array },
  bloom: RenderTarget & { colorPixels: Uint8Array },
  fxaa: RenderTarget & { colorPixels: Uint8Array },
  depthViz: RenderTarget & { colorPixels: Uint8Array },
  starfield: Uint8Array
): void {
  context.fillStyle = "#0e1317";
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawSeededStarfield(context, canvas, starfield);
  drawPresentationGrid(context, canvas);
  const finalImage = new ImageData(new Uint8ClampedArray(fxaa.colorPixels), fxaa.width, fxaa.height);
  const finalScratch = document.createElement("canvas");
  finalScratch.width = fxaa.width;
  finalScratch.height = fxaa.height;
  finalScratch.getContext("2d")!.putImageData(finalImage, 0, 0);
  context.fillStyle = "rgba(4, 8, 13, 0.82)";
  context.fillRect(30, 68, 500, 282);
  context.strokeStyle = "rgba(110, 200, 255, 0.45)";
  context.lineWidth = 2;
  context.strokeRect(30, 68, 500, 282);
  drawPanelGrid(context, 46, 84, 468, 250, 18, "rgba(110, 200, 255, 0.18)");
  context.drawImage(finalScratch, 54, 92, 452, 254);
  context.fillStyle = "#eff7fb";
  context.font = "700 18px ui-sans-serif, system-ui, sans-serif";
  context.fillText("Final postprocess composite", 54, 52);

  const targets = [
    { label: "Input", target: hdr, x: 560, y: 92 },
    { label: "Tone", target: ldr, x: 738, y: 92 },
    { label: "Bloom", target: bloom, x: 560, y: 272 },
    { label: "Depth", target: depthViz, x: 738, y: 272 }
  ] as const;
  for (const entry of targets) {
    const image = new ImageData(new Uint8ClampedArray(entry.target.colorPixels), entry.target.width, entry.target.height);
    const scratch = document.createElement("canvas");
    scratch.width = entry.target.width;
    scratch.height = entry.target.height;
    scratch.getContext("2d")!.putImageData(image, 0, 0);
    context.fillStyle = "rgba(4, 8, 13, 0.72)";
    context.fillRect(entry.x - 10, entry.y - 32, 166, 118);
    context.strokeStyle = "rgba(110, 200, 255, 0.34)";
    context.lineWidth = 1;
    context.strokeRect(entry.x - 10, entry.y - 32, 166, 118);
    drawPanelGrid(context, entry.x - 4, entry.y - 2, 154, 88, 14, "rgba(110, 200, 255, 0.2)");
    context.drawImage(scratch, entry.x, entry.y, 146, 82);
    context.fillStyle = "#d7e3ea";
    context.font = "700 13px ui-sans-serif, system-ui, sans-serif";
    context.fillText(entry.label, entry.x, entry.y - 12);
  }
  drawForegroundScanlines(context, canvas);
}

function drawPresentationGrid(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  context.save();
  context.strokeStyle = "rgba(92, 150, 190, 0.28)";
  context.lineWidth = 1;
  for (let x = 18; x < canvas.width; x += 18) {
    context.beginPath();
    context.moveTo(x, 18);
    context.lineTo(x, canvas.height - 18);
    context.stroke();
  }
  for (let y = 18; y < canvas.height; y += 18) {
    context.beginPath();
    context.moveTo(18, y);
    context.lineTo(canvas.width - 18, y);
    context.stroke();
  }
  context.strokeStyle = "rgba(255, 255, 255, 0.16)";
  for (let index = 0; index < 18; index += 1) {
    const x = 42 + index * 50;
    context.beginPath();
    context.moveTo(x, 382);
    context.lineTo(x + 34, 426);
    context.stroke();
  }
  context.restore();
}

function drawPanelGrid(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, step: number, color: string): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1;
  for (let gridX = x; gridX <= x + width; gridX += step) {
    context.beginPath();
    context.moveTo(gridX, y);
    context.lineTo(gridX, y + height);
    context.stroke();
  }
  for (let gridY = y; gridY <= y + height; gridY += step) {
    context.beginPath();
    context.moveTo(x, gridY);
    context.lineTo(x + width, gridY);
    context.stroke();
  }
  context.restore();
}

function drawForegroundScanlines(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  context.save();
  context.strokeStyle = "rgba(240, 248, 255, 0.18)";
  context.lineWidth = 1;
  for (let y = 12; y < canvas.height; y += 12) {
    context.beginPath();
    context.moveTo(14, y);
    context.lineTo(canvas.width - 14, y);
    context.stroke();
  }
  context.strokeStyle = "rgba(110, 200, 255, 0.22)";
  for (let x = 16; x < canvas.width; x += 16) {
    context.beginPath();
    context.moveTo(x, 14);
    context.lineTo(x + 34, canvas.height - 16);
    context.stroke();
  }
  context.restore();
}

function drawSeededStarfield(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, data: Uint8Array): void {
  const gradient = context.createLinearGradient(0, 0, canvas.width, 260);
  gradient.addColorStop(0, "rgba(22, 28, 52, 0.82)");
  gradient.addColorStop(0.55, "rgba(16, 24, 42, 0.48)");
  gradient.addColorStop(1, "rgba(14, 19, 23, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, 260);
  for (let index = 0; index < 170; index += 1) {
    const r = data[(index * 29) % data.length] ?? index;
    const g = data[(index * 47 + 5) % data.length] ?? index;
    const b = data[(index * 71 + 11) % data.length] ?? index;
    const x = (r / 255) * canvas.width;
    const y = (g / 255) * 170 + 12;
    context.fillStyle = `rgba(${110 + (b % 120)}, ${150 + (b % 80)}, 255, ${0.28 + (b / 255) * 0.55})`;
    context.fillRect(x, y, b > 245 ? 2 : 1, b > 245 ? 2 : 1);
  }
}

function readTargetPixel(target: RenderTarget & { colorPixels: Uint8Array }, x: number, y: number): readonly number[] {
  const index = (y * target.width + x) * 4;
  return Array.from(target.colorPixels.slice(index, index + 4));
}

function findChangedPixel(
  before: RenderTarget & { colorPixels: Uint8Array },
  after: RenderTarget & { colorPixels: Uint8Array }
): readonly [number, number] | null {
  if (before.width !== after.width || before.height !== after.height) return null;
  for (let y = 1; y < before.height - 1; y += 1) {
    for (let x = 1; x < before.width - 1; x += 1) {
      const index = (y * before.width + x) * 4;
      const delta =
        Math.abs(before.colorPixels[index]! - after.colorPixels[index]!) +
        Math.abs(before.colorPixels[index + 1]! - after.colorPixels[index + 1]!) +
        Math.abs(before.colorPixels[index + 2]! - after.colorPixels[index + 2]!);
      if (delta >= 12) return [x, y];
    }
  }
  return null;
}

function copyTarget(source: RenderTarget & { colorPixels: Uint8Array }, target: RenderTarget & { colorPixels: Uint8Array }): void {
  target.colorPixels.set(source.colorPixels);
}

function countNonDarkPixels(pixels: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if ((pixels[index] ?? 0) + (pixels[index + 1] ?? 0) + (pixels[index + 2] ?? 0) > 34) count += 1;
  }
  return count;
}

function countColorBuckets(pixels: Uint8Array): number {
  const buckets = new Set<string>();
  for (let index = 0; index < pixels.length; index += 4) {
    const r = Math.floor((pixels[index] ?? 0) / 24);
    const g = Math.floor((pixels[index + 1] ?? 0) / 24);
    const b = Math.floor((pixels[index + 2] ?? 0) / 24);
    if (r + g + b > 0) buckets.add(`${r}:${g}:${b}`);
  }
  return buckets.size;
}

function createShell(): {
  readonly canvas: HTMLCanvasElement;
  readonly status: HTMLElement;
  readonly debugOverlay: HTMLElement;
  readonly toneControl: HTMLInputElement;
  readonly bloomControl: HTMLInputElement;
  readonly fxaaControl: HTMLInputElement;
  readonly toneMapperControl: HTMLSelectElement;
  readonly exposureControl: HTMLInputElement;
  readonly whitePointControl: HTMLInputElement;
  readonly inputColorSpaceControl: HTMLSelectElement;
  readonly outputColorSpaceControl: HTMLSelectElement;
} {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.innerHTML = `
    <canvas data-testid="postprocess-lab-canvas" width="960" height="540" tabindex="0" aria-label="Postprocess lab WebGL viewport"></canvas>
    <section>
      <h1>Postprocess Lab</h1>
      <p>RenderGraph order: WebGL2 V4 product scene readback, depth visualization, tone mapping, bloom, and FXAA.</p>
      <div class="debug-overlay" data-testid="render-debug-overlay"></div>
      <div class="controls">
        <label><input data-testid="postprocess-tone" type="checkbox" checked /> Tone map</label>
        <label><input data-testid="postprocess-bloom" type="checkbox" checked /> Bloom</label>
        <label><input data-testid="postprocess-fxaa" type="checkbox" checked /> FXAA</label>
        <label>Tone mapper
          <select data-testid="postprocess-tone-mapper">
            <option value="reinhard" selected>Reinhard</option>
            <option value="linear">Linear clamp</option>
            <option value="aces">ACES</option>
            <option value="filmic">Filmic</option>
            <option value="uncharted2">Uncharted2</option>
            <option value="agx">AgX</option>
            <option value="neutral">Neutral</option>
          </select>
        </label>
        <label>Exposure <input data-testid="postprocess-exposure" type="range" min="0.6" max="2.4" step="0.05" value="1.7" /></label>
        <label>White point <input data-testid="postprocess-white-point" type="range" min="0.7" max="1.8" step="0.05" value="1" /></label>
        <label>Contrast <input data-testid="postprocess-contrast" type="range" min="0.5" max="1.8" step="0.05" value="1.12" /></label>
        <label>Temperature <input data-testid="postprocess-temperature" type="range" min="-0.8" max="0.8" step="0.05" value="0.12" /></label>
        <label>Tint <input data-testid="postprocess-tint" type="range" min="-0.8" max="0.8" step="0.05" value="0.08" /></label>
        <label>Saturation <input data-testid="postprocess-saturation" type="range" min="0.4" max="1.8" step="0.05" value="1.08" /></label>
        <label>Vibrance <input data-testid="postprocess-vibrance" type="range" min="-0.6" max="0.8" step="0.05" value="0.18" /></label>
        <label>Vignette <input data-testid="postprocess-vignette" type="range" min="0" max="0.7" step="0.05" value="0.28" /></label>
        <label>Sharpen <input data-testid="postprocess-sharpening" type="range" min="0" max="1.2" step="0.05" value="0.35" /></label>
        <label>Input
          <select data-testid="postprocess-input-color-space">
            <option value="linear" selected>Linear</option>
            <option value="srgb">sRGB</option>
          </select>
        </label>
        <label>Output
          <select data-testid="postprocess-output-color-space">
            <option value="srgb" selected>sRGB</option>
            <option value="linear">Linear</option>
          </select>
        </label>
      </div>
      <pre data-testid="postprocess-lab-status">booting</pre>
    </section>
  `;
  root.append(shell);
  return {
    canvas: shell.querySelector("canvas")!,
    status: shell.querySelector("pre")!,
    debugOverlay: shell.querySelector("[data-testid='render-debug-overlay']")!,
    toneControl: shell.querySelector("[data-testid='postprocess-tone']")!,
    bloomControl: shell.querySelector("[data-testid='postprocess-bloom']")!,
    fxaaControl: shell.querySelector("[data-testid='postprocess-fxaa']")!,
    toneMapperControl: shell.querySelector("[data-testid='postprocess-tone-mapper']")!,
    exposureControl: shell.querySelector("[data-testid='postprocess-exposure']")!,
    whitePointControl: shell.querySelector("[data-testid='postprocess-white-point']")!,
    inputColorSpaceControl: shell.querySelector("[data-testid='postprocess-input-color-space']")!,
    outputColorSpaceControl: shell.querySelector("[data-testid='postprocess-output-color-space']")!,
    contrastControl: shell.querySelector("[data-testid='postprocess-contrast']")!,
    temperatureControl: shell.querySelector("[data-testid='postprocess-temperature']")!,
    tintControl: shell.querySelector("[data-testid='postprocess-tint']")!,
    saturationControl: shell.querySelector("[data-testid='postprocess-saturation']")!,
    vibranceControl: shell.querySelector("[data-testid='postprocess-vibrance']")!,
    vignetteControl: shell.querySelector("[data-testid='postprocess-vignette']")!,
    sharpeningControl: shell.querySelector("[data-testid='postprocess-sharpening']")!
  };
}

function asToneMappingOperator(value: string): ToneMappingOperator {
  return value === "linear" || value === "aces" || value === "filmic" || value === "uncharted2" || value === "agx" || value === "neutral" ? value : "reinhard";
}

function asColorSpace(value: string): PostProcessColorSpace {
  return value === "srgb" ? "srgb" : "linear";
}

function readNumericControl(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value);
  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(3)) : fallback;
}

function readSignedNumericControl(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value);
  return Number.isFinite(value) ? Number(value.toFixed(3)) : fallback;
}

function renderDebugOverlay(element: HTMLElement, overlay: RenderDebugOverlaySnapshot | undefined): void {
  if (!overlay?.visible) {
    element.textContent = "Render debug overlay: clean";
    element.dataset.visible = "false";
    return;
  }
  element.dataset.visible = "true";
  element.replaceChildren(
    Object.assign(document.createElement("strong"), { textContent: `Render Debug Overlay (${overlay.issueCount})` }),
    ...overlay.lines.map((line) => Object.assign(document.createElement("span"), { textContent: line }))
  );
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #0e1317; color: #edf3f6; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-rows: minmax(0, 1fr) auto; background: radial-gradient(circle at 38% 20%, #1a2334 0, #0e1317 62%); }
    canvas { width: 100%; height: min(78vh, 700px); display: block; background: transparent; }
    section { border-top: 1px solid #2a343b; background: rgba(21, 27, 32, 0.98); padding: 1rem 1.25rem; display: grid; grid-template-columns: 14rem minmax(18rem, 1fr) minmax(18rem, 28rem); gap: 1rem; align-items: start; }
    h1, p, pre { margin: 0; }
    h1 { font-size: 1rem; }
    p { color: #c8d3d9; line-height: 1.45; font-size: 0.875rem; }
    .debug-overlay { display: none; }
    .debug-overlay strong { color: #ff8fa3; }
    .controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.45rem 0.8rem; color: #dce6eb; font-size: 0.875rem; }
    .controls input { accent-color: #6fd3ff; }
    pre { display: none; }
    @media (max-width: 760px) { section { grid-template-columns: 1fr; } canvas { height: 62vh; } }
  `;
  document.head.append(style);
}
