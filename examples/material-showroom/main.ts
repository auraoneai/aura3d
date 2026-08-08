import { Renderable, Scene } from "@aura3d/scene";
import {
  Geometry,
  NormalMappedPBRMaterial,
  PBRMaterial,
  Renderer,
  Sampler,
  Texture,
  TextureBinding,
  TexturedPBRMaterial,
  UnlitMaterial,
  bloomPixels,
  createEnvironmentMapResourceSet,
  createPhysicalMaterialPreset,
  createProceduralTextureFixture,
  createExternalParityRenderPresetEvidence,
  listPhysicalMaterialPresets,
  externalParityActiveFeature,
  externalParityBlockedFeature,
  type EnvironmentLightingOptions,
  type ProceduralTextureFixture,
  type ExternalParityRenderPresetEvidence
} from "@aura3d/rendering";

declare global {
  interface Window {
    __AURA3D_MATERIAL_SHOWROOM__?: MaterialShowroomState;
  }
}

interface MaterialShowroomState {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly visualClaim: "bounded-pbr-material-showroom";
  readonly environmentLighting: "sampled-rgba8-environment-map-approximation";
  readonly environmentPreset?: MaterialShowroomEnvironmentPreset;
  readonly environmentPresets?: readonly MaterialShowroomEnvironmentPreset[];
  readonly diagnostics?: { readonly drawCalls: number; readonly textures?: number; readonly textureBytes?: number; readonly lastError: string | null };
  readonly canvasFrame?: { readonly width: number; readonly height: number };
  readonly environmentResources?: {
    readonly inputEncoding: string;
    readonly outputColorSpace: string;
    readonly hdrSource: boolean;
    readonly maxLinearValue: number;
    readonly specularMipCount: number;
    readonly diffuseIrradianceSize: readonly [number, number];
    readonly brdfLutSize: readonly [number, number];
  };
  readonly screenshotPath: "tests/reports/external-parity-example-screenshots/material-showroom.png";
  readonly featureEvidence?: ExternalParityRenderPresetEvidence;
  readonly claimBoundary: string;
  readonly materials?: readonly string[];
  readonly oldBranchPhysicalMaterialPresets?: readonly string[];
  readonly proceduralTextureFixtures?: readonly { readonly id: string; readonly hash: string; readonly semantic: string }[];
  readonly pixels?: Record<string, readonly number[]>;
  readonly postprocess?: {
    readonly source: "webgl2-material-showroom-emissive-readback";
    readonly path: "PostProcessPass.bloomPixels";
    readonly brightPixelCount: number;
    readonly brightEnergy: number;
    readonly maxNeighborBoost: number;
    readonly beforeNeighbor: readonly number[];
    readonly afterNeighbor: readonly number[];
    readonly previewFrame: { readonly width: number; readonly height: number };
  };
  readonly materialKnownLimits?: Record<string, readonly string[]>;
  readonly knownLimits: readonly string[];
  readonly errors: readonly string[];
  readonly error?: string;
}

type MaterialShowroomEnvironmentPreset = "studio" | "overcast" | "sunset";

const materialNames = [
  "dielectric-gloss",
  "dielectric-rough",
  "metal-gloss",
  "metal-rough",
  "normal-mapped",
  "emissive",
  "alpha-blend",
  "double-sided",
  "clearcoat-like",
  "transmission-like",
  "sheen-like",
  "anisotropy-like",
  "iridescence-like",
  "physical-gold",
  "physical-copper",
  "physical-glass",
  "physical-water",
  "physical-skin",
  "physical-eye",
  "physical-hair",
  "physical-terrain",
  "physical-toon"
] as const;

const claimBoundary = "ExternalParity material-showroom evidence is limited to bounded WebGL2 PBR material response, generated RGBA8 environment resources, and browser pixel checks; HDR IBL and production PBR parity are not claimed.";

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__AURA3D_MATERIAL_SHOWROOM__ = {
      status: "error",
      renderer: "webgl2",
      visualClaim: "bounded-pbr-material-showroom",
      environmentLighting: "sampled-rgba8-environment-map-approximation",
      screenshotPath: "tests/reports/external-parity-example-screenshots/material-showroom.png",
      claimBoundary,
      knownLimits: knownLimits(),
      errors: [error instanceof Error ? error.message : String(error)],
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const { canvas, previewCanvas, status, environmentPresetSelect } = createShell();
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.055, 0.065, 0.078, 1],
    antialias: true,
    preserveDrawingBuffer: true
  });
  const renderPreset = (preset: MaterialShowroomEnvironmentPreset) => {
    const sceneResources = createShowroomScene(canvas.width / canvas.height, preset);
    const environmentLighting = createEnvironmentLighting(preset);
    const diagnostics = renderer.render({
      ...sceneResources,
      environmentLighting: environmentLighting.lighting
    });
    const pixels = readMaterialPixels(renderer);
    const postprocess = renderPostprocessPreview(renderer, previewCanvas);
    window.__AURA3D_MATERIAL_SHOWROOM__ = {
      status: "ready",
      renderer: "webgl2",
      visualClaim: "bounded-pbr-material-showroom",
      environmentLighting: "sampled-rgba8-environment-map-approximation",
      environmentPreset: preset,
      environmentPresets: ["studio", "overcast", "sunset"],
      diagnostics,
      canvasFrame: { width: canvas.width, height: canvas.height },
      environmentResources: environmentLighting.resources,
      screenshotPath: "tests/reports/external-parity-example-screenshots/material-showroom.png",
      claimBoundary,
      featureEvidence: createExternalParityRenderPresetEvidence({
        exampleId: "material-showroom",
        screenshotPath: "tests/reports/external-parity-example-screenshots/material-showroom.png",
        toneMapper: "bounded-direct",
        exposure: preset === "sunset" ? 1.08 : 1,
        whitePoint: 1,
        features: [
          externalParityActiveFeature("color-management", "PBR shaders use linear material inputs and sRGB texture/color output evidence is validated by browser pixels."),
          externalParityActiveFeature("tone-mapping", "Material response is bounded in the direct PBR shader and bloom preview uses shared LDR postprocess readback."),
          externalParityActiveFeature("exposure", "Preset records exposure metadata for screenshot/report evidence."),
          externalParityActiveFeature("bounded-pbr", "Browser pixels validate dielectric, metal, rough, glossy, normal-mapped, emissive, alpha, double-sided, clearcoat-like, transmission-like, sheen-like, anisotropy-like, iridescence-like, and old-branch physical material preset ports including terrain and toon intent."),
          externalParityActiveFeature("environment-reflections", "Generated RGBA8 environment map, mip resources, and BRDF LUT are bound to metallic/rough materials."),
          externalParityActiveFeature("postprocess-bloom", "Shared PostProcessPass.bloomPixels changes emissive readback pixels in the preview."),
          externalParityBlockedFeature("directional-shadows", "Material showroom is a material response scene; directional shadow evidence is owned by shadow-lab."),
          externalParityBlockedFeature("hdr", "HDR render targets and HDR IBL remain blocked; this scene uses generated RGBA8 environment resources.")
        ]
      }),
      materials: [...materialNames],
      oldBranchPhysicalMaterialPresets: listPhysicalMaterialPresets().map((entry) => entry.name),
      proceduralTextureFixtures: materialShowroomProceduralTextureSummaries(),
      pixels,
      postprocess,
      materialKnownLimits: materialKnownLimits(),
      knownLimits: knownLimits(),
      errors: []
    };
    status.textContent = JSON.stringify(window.__AURA3D_MATERIAL_SHOWROOM__, null, 2);
  };
  environmentPresetSelect.addEventListener("change", () => {
    renderPreset(asMaterialShowroomEnvironmentPreset(environmentPresetSelect.value));
  });
  renderPreset("studio");
  window.addEventListener("beforeunload", () => renderer.dispose(), { once: true });
}

function createShowroomScene(aspect: number, preset: MaterialShowroomEnvironmentPreset) {
  const scene = new Scene();
  const camera = scene.createOrthographicCamera({ left: -4.15 * aspect, right: 4.15 * aspect, bottom: -2.22, top: 2.08, near: 0.1, far: 30, resizeMode: "preserve-frustum" });
  camera.transform.setPosition(0, 0, 8);
  scene.root.addChild(camera);

  const key = scene.createLight("directional", "showroom-key");
  const lighting = materialShowroomLightingPreset(preset);
  key.intensity = lighting.keyIntensity;
  key.color = lighting.keyColor;
  scene.root.addChild(key);
  const fill = scene.createLight("point", "showroom-cool-fill");
  fill.intensity = lighting.fillIntensity;
  fill.range = 10;
  fill.color = lighting.fillColor;
  fill.transform.setPosition(-2.5, 1.4, 3.0);
  scene.root.addChild(fill);

  const floor = scene.createNode("showroom-gallery-floor");
  floor.transform.setPosition(0, -2.72, -0.32);
  floor.transform.setScale(15.6, 0.18, 1.45);
  scene.root.addChild(floor);
  scene.addRenderable(floor, new Renderable({ geometry: "geometry:textured-cube", material: "material:showroom-floor" }));

  const backPanel = scene.createNode("showroom-gallery-back-panel");
  backPanel.transform.setPosition(0, -0.08, -0.64);
  backPanel.transform.setScale(15.6, 5.2, 0.08);
  scene.root.addChild(backPanel);
  scene.addRenderable(backPanel, new Renderable({ geometry: "geometry:textured-cube", material: "material:showroom-back-panel" }));

  const grid = scene.createNode("showroom-gallery-scale-grid");
  grid.transform.setPosition(0, 0, 0.08);
  scene.root.addChild(grid);
  scene.addRenderable(grid, new Renderable({ geometry: "geometry:gallery-grid", material: "material:showroom-grid-lines" }));

  const entries = [
    ["dielectric-gloss", -3.05, 0.72, "material:dielectric-gloss", "geometry:textured-cube"],
    ["dielectric-rough", -1.0, 0.72, "material:dielectric-rough", "geometry:textured-cube"],
    ["metal-gloss", 1.0, 0.72, "material:metal-gloss", "geometry:textured-cube"],
    ["metal-rough", 3.05, 0.72, "material:metal-rough", "geometry:textured-cube"],
    ["normal-mapped", -3.05, -0.98, "material:normal-mapped", "geometry:textured-cube"],
    ["emissive", -1.0, -0.98, "material:emissive", "geometry:sphere"],
    ["alpha-blend", 1.0, -0.98, "material:alpha-blend", "geometry:sphere"],
    ["double-sided", 3.05, -0.98, "material:double-sided", "geometry:textured-cube"],
    ["clearcoat-like", 5.1, -0.98, "material:clearcoat-like", "geometry:sphere"],
    ["physical-eye", 7.0, -0.98, "material:physical-eye", "geometry:sphere"],
    ["transmission-like", -5.1, 1.65, "material:transmission-like", "geometry:sphere"],
    ["sheen-like", -1.7, 1.65, "material:sheen-like", "geometry:sphere"],
    ["anisotropy-like", 1.7, 1.65, "material:anisotropy-like", "geometry:sphere"],
    ["iridescence-like", 5.1, 1.65, "material:iridescence-like", "geometry:sphere"],
    ["physical-terrain", -7.0, -2.05, "material:physical-terrain", "geometry:textured-cube"],
    ["physical-gold", -5.1, -2.05, "material:physical-gold", "geometry:sphere"],
    ["physical-copper", -3.05, -2.05, "material:physical-copper", "geometry:sphere"],
    ["physical-glass", -1.0, -2.05, "material:physical-glass", "geometry:sphere"],
    ["physical-water", 1.0, -2.05, "material:physical-water", "geometry:sphere"],
    ["physical-skin", 3.05, -2.05, "material:physical-skin", "geometry:sphere"],
    ["physical-hair", 5.1, -2.05, "material:physical-hair", "geometry:sphere"],
    ["physical-toon", 7.0, -2.05, "material:physical-toon", "geometry:textured-cube"]
  ] as const;
  for (const [index, [name, x, y, material, geometry]] of entries.entries()) {
    const backplate = scene.createNode(`showroom-${name}-backplate`);
    backplate.transform.setPosition(x, y, -0.22);
    backplate.transform.setScale(1.34, 1.28, 0.035);
    scene.root.addChild(backplate);
    scene.addRenderable(backplate, new Renderable({ geometry: "geometry:textured-cube", material: `material:showroom-backplate-${index % 6}` }));

    const node = scene.createNode(`showroom-${name}`);
    node.transform.setPosition(x, y, 0);
    node.transform.setScale(1.08, 1.08, 1.08);
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry, material }));
  }

  const normalTexture = createNormalTexture();
  const fixtures = materialShowroomProceduralTextures();
  return {
    scene,
    geometryLibrary: {
      "geometry:sphere": Geometry.uvSphere(0.58, 72, 36),
      "geometry:textured-cube": Geometry.texturedCube(0.94),
      "geometry:gallery-grid": Geometry.lineSegments(materialShowroomGalleryGridLines())
    },
    materialLibrary: {
      "material:dielectric-gloss": new TexturedPBRMaterial({ name: "dielectric-gloss", baseColor: [0.88, 0.78, 0.63, 1], baseColorTexture: fixtures.marble.texture, metallic: 0, roughness: 0.12 }),
      "material:dielectric-rough": new TexturedPBRMaterial({ name: "dielectric-rough", baseColor: [0.46, 0.62, 0.84, 1], baseColorTexture: fixtures.concrete.texture, metallic: 0, roughness: 0.92 }),
      "material:metal-gloss": new TexturedPBRMaterial({ name: "metal-gloss", baseColor: [1, 0.66, 0.22, 1], baseColorTexture: fixtures.metallicPaint.texture, metallic: 1, roughness: 0.14 }),
      "material:metal-rough": new TexturedPBRMaterial({ name: "metal-rough", baseColor: [0.78, 0.76, 0.72, 1], baseColorTexture: fixtures.sciFiPanel.texture, metallic: 1, roughness: 0.74 }),
      "material:normal-mapped": new NormalMappedPBRMaterial({ name: "normal-mapped", baseColor: [0.34, 0.68, 0.98, 1], roughness: 0.4, normalTexture, normalScale: 1.35 }),
      "material:emissive": new PBRMaterial({ name: "emissive", baseColor: [0.12, 0.44, 0.24, 1], roughness: 0.48, emissiveColor: [0.02, 0.95, 0.32], emissiveStrength: 1.95 }),
      "material:alpha-blend": new PBRMaterial({ name: "alpha-blend", baseColor: [0.78, 0.24, 0.94, 0.58], roughness: 0.38, renderState: { blend: true, depthWrite: false, cullMode: "none" } }),
      "material:double-sided": new TexturedPBRMaterial({ name: "double-sided", baseColor: [0.96, 0.56, 0.3, 1], baseColorTexture: fixtures.wood.texture, metallic: 0.04, roughness: 0.52, renderState: { cullMode: "none" } }),
      "material:clearcoat-like": new PBRMaterial({ name: "clearcoat-like", baseColor: [0.72, 0.95, 0.86, 1], roughness: 0.26, clearcoatFactor: 0.85, clearcoatRoughnessFactor: 0.08, specularFactor: 1 }),
      "material:transmission-like": new PBRMaterial({ name: "transmission-like", baseColor: [0.62, 0.9, 1, 0.82], roughness: 0.12, transmissionFactor: 0.5, diffuseTransmissionFactor: 0.22, diffuseTransmissionColorFactor: [0.58, 0.84, 1], volumeThicknessFactor: 0.42, volumeAttenuationDistance: 2.6, volumeAttenuationColor: [0.56, 0.72, 1], ior: 1.42, specularFactor: 0.88 }),
      "material:sheen-like": new PBRMaterial({ name: "sheen-like", baseColor: [0.48, 0.18, 0.2, 1], roughness: 0.62, sheenColorFactor: [0.95, 0.32, 0.42], sheenRoughnessFactor: 0.22, specularFactor: 0.42 }),
      "material:anisotropy-like": new PBRMaterial({ name: "anisotropy-like", baseColor: [0.58, 0.58, 0.66, 1], metallic: 0.82, roughness: 0.24, anisotropyStrength: 0.8, anisotropyRotation: 1.15, specularFactor: 0.95 }),
      "material:iridescence-like": new PBRMaterial({ name: "iridescence-like", baseColor: [0.22, 0.28, 0.78, 1], roughness: 0.18, iridescenceFactor: 0.82, iridescenceIor: 1.6, iridescenceThicknessMinimum: 160, iridescenceThicknessMaximum: 720, dispersion: 18, specularFactor: 0.9 }),
      "material:physical-gold": createPhysicalMaterialPreset("gold"),
      "material:physical-copper": createPhysicalMaterialPreset("copper"),
      "material:physical-glass": createPhysicalMaterialPreset("glass"),
      "material:physical-water": createPhysicalMaterialPreset("water"),
      "material:physical-skin": createPhysicalMaterialPreset("skin"),
      "material:physical-eye": createPhysicalMaterialPreset("eye"),
      "material:physical-hair": createPhysicalMaterialPreset("hair"),
      "material:physical-terrain": createPhysicalMaterialPreset("terrain"),
      "material:physical-toon": createPhysicalMaterialPreset("toon"),
      "material:showroom-floor": new TexturedPBRMaterial({ name: "showroom-cool-textured-floor", baseColor: [0.24, 0.29, 0.34, 1], baseColorTexture: fixtures.concrete.texture, metallic: 0, roughness: 0.68 }),
      "material:showroom-back-panel": new TexturedPBRMaterial({ name: "showroom-textured-gallery-back-panel", baseColor: [0.2, 0.26, 0.33, 1], baseColorTexture: fixtures.sciFiPanel.texture, metallic: 0.05, roughness: 0.82 }),
      "material:showroom-backplate-0": new PBRMaterial({ name: "showroom-backplate-slate", baseColor: [0.12, 0.22, 0.32, 1], metallic: 0.08, roughness: 0.72 }),
      "material:showroom-backplate-1": new PBRMaterial({ name: "showroom-backplate-warm", baseColor: [0.34, 0.2, 0.12, 1], metallic: 0.04, roughness: 0.76 }),
      "material:showroom-backplate-2": new PBRMaterial({ name: "showroom-backplate-olive", baseColor: [0.2, 0.32, 0.2, 1], metallic: 0.04, roughness: 0.74 }),
      "material:showroom-backplate-3": new PBRMaterial({ name: "showroom-backplate-violet", baseColor: [0.28, 0.19, 0.42, 1], metallic: 0.05, roughness: 0.7 }),
      "material:showroom-backplate-4": new PBRMaterial({ name: "showroom-backplate-cyan", baseColor: [0.1, 0.33, 0.38, 1], metallic: 0.08, roughness: 0.72 }),
      "material:showroom-backplate-5": new PBRMaterial({ name: "showroom-backplate-oxide", baseColor: [0.42, 0.18, 0.14, 1], metallic: 0.06, roughness: 0.76 }),
      "material:showroom-grid-lines": new UnlitMaterial({ name: "showroom-scale-grid-lines", color: [0.98, 0.9, 0.74, 0.72], renderState: { depthTest: false, depthWrite: false, blend: true, cullMode: "none" } })
    }
  };
}

function materialShowroomGalleryGridLines(): readonly (readonly [number, number, number])[] {
  const lines: Array<readonly [number, number, number]> = [];
  for (let x = -8; x <= 8.01; x += 0.18) {
    lines.push([x, -2.48, 0], [x, 2.04, 0]);
  }
  for (let y = -2.36; y <= 2.05; y += 0.18) {
    lines.push([-8.1, y, 0], [8.1, y, 0]);
  }
  for (let index = 0; index < 76; index += 1) {
    const x = -7.86 + (index % 19) * 0.84;
    const y = -2.26 + Math.floor(index / 19) * 0.54 + (index % 3) * 0.05;
    lines.push([x, y, 0], [x + 0.2, y + 0.12, 0]);
    lines.push([x + 0.2, y + 0.12, 0], [x + 0.36, y - 0.04, 0]);
    lines.push([x + 0.08, y + 0.18, 0], [x + 0.32, y + 0.26, 0]);
  }
  for (const x of [-6.2, -4.1, -2.05, 0, 2.05, 4.1, 6.2]) {
    lines.push([x - 0.5, -2.46, 0], [x + 0.5, -2.46, 0]);
    lines.push([x - 0.5, -2.46, 0], [x - 0.5, -2.23, 0]);
    lines.push([x + 0.5, -2.46, 0], [x + 0.5, -2.23, 0]);
  }
  return lines;
}

function createEnvironmentLighting(preset: MaterialShowroomEnvironmentPreset): { readonly lighting: EnvironmentLightingOptions; readonly resources: NonNullable<MaterialShowroomState["environmentResources"]> } {
  const presetLighting = materialShowroomLightingPreset(preset);
  const environment = createEnvironmentPixels(64, 32, preset);
  const resources = createEnvironmentMapResourceSet({
    ...environment,
    encoding: "rgba8-srgb"
  }, {
    outputColorSpace: "srgb",
    specularLevels: 4,
    specularBlurRadius: 2,
    irradianceWidth: 16,
    irradianceHeight: 8,
    irradianceBlurRadius: 6,
    brdfLutSize: 32
  });
  return {
    lighting: {
      color: presetLighting.ambientColor,
      intensity: presetLighting.ambientIntensity,
      proceduralMap: {
        skyColor: presetLighting.skyColor,
        horizonColor: presetLighting.horizonColor,
        groundColor: presetLighting.groundColor,
        specularColor: presetLighting.specularColor,
        intensity: presetLighting.environmentMapIntensity,
        specularIntensity: presetLighting.environmentSpecularIntensity
      },
      environmentMapTexture: new TextureBinding({
        name: "u_environmentMapTexture",
        texture: new Texture({
          width: resources.base.width,
          height: resources.base.height,
          colorSpace: "srgb",
          label: "showroom-rgba8-environment-resource-set",
          mipLevels: resources.specularMipLevels
        }),
        sampler: new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "repeat", addressV: "clamp-to-edge" }),
        expectedColorSpace: "srgb",
        required: true
      }),
      environmentMapIntensity: presetLighting.environmentTextureIntensity,
      environmentMapSpecularIntensity: presetLighting.environmentTextureSpecularIntensity,
      environmentMapRotation: preset === "sunset" ? 0.18 : preset === "overcast" ? -0.04 : 0.06,
      environmentMapMipCount: resources.specularMipLevels.length,
      environmentBrdfLutTexture: new TextureBinding({
        name: "u_environmentBrdfLutTexture",
        texture: new Texture({ width: resources.brdfLut.width, height: resources.brdfLut.height, colorSpace: "linear", label: "showroom-brdf-lut", data: resources.brdfLut.data }),
        sampler: new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
        expectedColorSpace: "linear",
        required: true
      })
    },
    resources: resources.diagnostics
  };
}

function materialShowroomLightingPreset(preset: MaterialShowroomEnvironmentPreset): {
  readonly keyColor: readonly [number, number, number];
  readonly keyIntensity: number;
  readonly fillColor: readonly [number, number, number];
  readonly fillIntensity: number;
  readonly ambientColor: readonly [number, number, number];
  readonly ambientIntensity: number;
  readonly skyColor: readonly [number, number, number];
  readonly horizonColor: readonly [number, number, number];
  readonly groundColor: readonly [number, number, number];
  readonly specularColor: readonly [number, number, number];
  readonly environmentMapIntensity: number;
  readonly environmentSpecularIntensity: number;
  readonly environmentTextureIntensity: number;
  readonly environmentTextureSpecularIntensity: number;
} {
  if (preset === "overcast") {
    return {
      keyColor: [0.86, 0.92, 1],
      keyIntensity: 1.72,
      fillColor: [0.65, 0.72, 0.82],
      fillIntensity: 1.18,
      ambientColor: [0.56, 0.62, 0.7],
      ambientIntensity: 0.16,
      skyColor: [0.44, 0.5, 0.58],
      horizonColor: [0.72, 0.75, 0.78],
      groundColor: [0.075, 0.078, 0.085],
      specularColor: [0.86, 0.9, 0.96],
      environmentMapIntensity: 0.42,
      environmentSpecularIntensity: 0.28,
      environmentTextureIntensity: 0.34,
      environmentTextureSpecularIntensity: 0.48
    };
  }
  if (preset === "sunset") {
    return {
      keyColor: [1, 0.72, 0.48],
      keyIntensity: 2.55,
      fillColor: [0.32, 0.43, 1],
      fillIntensity: 0.95,
      ambientColor: [0.6, 0.38, 0.3],
      ambientIntensity: 0.18,
      skyColor: [0.24, 0.23, 0.52],
      horizonColor: [1, 0.54, 0.26],
      groundColor: [0.065, 0.045, 0.052],
      specularColor: [1, 0.78, 0.54],
      environmentMapIntensity: 0.64,
      environmentSpecularIntensity: 0.46,
      environmentTextureIntensity: 0.52,
      environmentTextureSpecularIntensity: 0.84
    };
  }
  return {
    keyColor: [1, 0.9, 0.76],
    keyIntensity: 2.35,
    fillColor: [0.42, 0.64, 1],
    fillIntensity: 1.05,
    ambientColor: [0.46, 0.54, 0.68],
    ambientIntensity: 0.12,
    skyColor: [0.18, 0.34, 0.8],
    horizonColor: [0.94, 0.68, 0.42],
    groundColor: [0.055, 0.06, 0.065],
    specularColor: [1, 0.9, 0.66],
    environmentMapIntensity: 0.6,
    environmentSpecularIntensity: 0.38,
    environmentTextureIntensity: 0.44,
    environmentTextureSpecularIntensity: 0.76
  };
}

function createEnvironmentPixels(width: number, height: number, preset: MaterialShowroomEnvironmentPreset): { readonly width: number; readonly height: number; readonly data: Uint8Array } {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const v = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / Math.max(1, width - 1);
      const horizon = 1 - Math.abs(v - 0.5) * 2;
      const sun = Math.max(0, 1 - Math.hypot(u - 0.18, v - 0.42) * 6);
      const sunset = preset === "sunset" ? 1 : 0;
      const overcast = preset === "overcast" ? 1 : 0;
      const index = (y * width + x) * 4;
      data[index] = Math.min(255, Math.round(lerp(36 + overcast * 44, 232 - overcast * 54, horizon) + sun * (55 + sunset * 42)));
      data[index + 1] = Math.min(255, Math.round(lerp(70 + overcast * 24, 174 - sunset * 36, horizon) + sun * 35));
      data[index + 2] = Math.min(255, Math.round(lerp(166 + overcast * 24, 86 - sunset * 32, horizon) + sun * (8 + overcast * 18)));
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

function asMaterialShowroomEnvironmentPreset(value: string): MaterialShowroomEnvironmentPreset {
  return value === "overcast" || value === "sunset" ? value : "studio";
}

function createNormalTexture(): Texture {
  return textureFromFixture(createProceduralTextureFixture("normal-from-height", { width: 96, height: 96, label: "showroom-normal-from-height" }));
}

function materialShowroomProceduralTextures(): {
  readonly marble: { readonly fixture: ProceduralTextureFixture; readonly texture: Texture };
  readonly concrete: { readonly fixture: ProceduralTextureFixture; readonly texture: Texture };
  readonly metallicPaint: { readonly fixture: ProceduralTextureFixture; readonly texture: Texture };
  readonly sciFiPanel: { readonly fixture: ProceduralTextureFixture; readonly texture: Texture };
  readonly wood: { readonly fixture: ProceduralTextureFixture; readonly texture: Texture };
} {
  const marble = createProceduralTextureFixture("marble", { width: 96, height: 96, label: "showroom-marble" });
  const concrete = createProceduralTextureFixture("concrete-asphalt", { width: 96, height: 96, label: "showroom-concrete-asphalt" });
  const metallicPaint = createProceduralTextureFixture("metallic-paint", { width: 96, height: 96, label: "showroom-metallic-paint" });
  const sciFiPanel = createProceduralTextureFixture("sci-fi-panel", { width: 96, height: 96, label: "showroom-sci-fi-panel" });
  const wood = createProceduralTextureFixture("wood-plank", { width: 96, height: 96, label: "showroom-wood-plank" });
  return {
    marble: { fixture: marble, texture: textureFromFixture(marble) },
    concrete: { fixture: concrete, texture: textureFromFixture(concrete) },
    metallicPaint: { fixture: metallicPaint, texture: textureFromFixture(metallicPaint) },
    sciFiPanel: { fixture: sciFiPanel, texture: textureFromFixture(sciFiPanel) },
    wood: { fixture: wood, texture: textureFromFixture(wood) }
  };
}

function materialShowroomProceduralTextureSummaries(): readonly { readonly id: string; readonly hash: string; readonly semantic: string }[] {
  return Object.values(materialShowroomProceduralTextures()).map(({ fixture }) => ({
    id: fixture.id,
    hash: fixture.hash,
    semantic: fixture.semantic
  }));
}

function textureFromFixture(fixture: ProceduralTextureFixture): Texture {
  return new Texture({
    width: fixture.width,
    height: fixture.height,
    colorSpace: fixture.colorSpace,
    label: fixture.label,
    data: fixture.data
  });
}

function readMaterialPixels(renderer: Renderer): Record<string, readonly number[]> {
  return {
    dielectricGloss: findPixel(renderer, { x: 250, y: 320, width: 120, height: 110 }, (p) => channel(p, 0) > 45 && channel(p, 1) > 35 && channel(p, 3) === 255),
    dielectricRough: findPixel(renderer, { x: 370, y: 320, width: 120, height: 110 }, (p) => channel(p, 2) > 45 && channel(p, 3) === 255),
    metalGloss: findPixel(renderer, { x: 490, y: 320, width: 120, height: 110 }, (p) => channel(p, 0) > 32 && channel(p, 1) > 20 && channel(p, 0) > channel(p, 2) && channel(p, 3) === 255),
    metalRough: findPixel(renderer, { x: 610, y: 320, width: 120, height: 110 }, (p) => channel(p, 0) + channel(p, 1) + channel(p, 2) > 60 && channel(p, 3) === 255),
    normalMapped: findPixel(renderer, { x: 250, y: 150, width: 120, height: 115 }, (p) => channel(p, 2) > 90 && channel(p, 3) === 255),
    emissive: findPixel(renderer, { x: 370, y: 150, width: 120, height: 115 }, (p) => channel(p, 1) > 85 && channel(p, 0) < 105 && channel(p, 3) === 255),
    alphaBlend: findPixel(renderer, { x: 490, y: 150, width: 120, height: 115 }, (p) => channel(p, 0) > 70 && channel(p, 2) > 80 && channel(p, 3) === 255),
    doubleSided: findPixel(renderer, { x: 610, y: 150, width: 120, height: 115 }, (p) => channel(p, 0) > 75 && channel(p, 1) > 35 && channel(p, 3) === 255),
    clearcoatLike: findPixel(renderer, { x: 730, y: 150, width: 120, height: 115 }, (p) => channel(p, 1) > 70 && channel(p, 2) > 55 && channel(p, 3) === 255),
    physicalEye: findPixel(renderer, { x: 835, y: 150, width: 115, height: 115 }, (p) => channel(p, 0) + channel(p, 1) + channel(p, 2) > 150 && channel(p, 3) === 255),
    physicalTerrain: findPixel(renderer, { x: 8, y: 45, width: 115, height: 110 }, (p) => channel(p, 1) > 18 && channel(p, 0) > 14 && channel(p, 1) >= channel(p, 2) && channel(p, 3) === 255),
    physicalToon: findPixel(renderer, { x: 835, y: 45, width: 115, height: 110 }, (p) => channel(p, 0) > 50 && channel(p, 1) > 24 && channel(p, 0) > channel(p, 2) && channel(p, 3) === 255)
  };
}

function findPixel(
  renderer: Renderer,
  region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  predicate: (pixel: readonly number[]) => boolean
): readonly number[] {
  const pixels = renderer.device.readPixels(region.x, region.y, region.width, region.height);
  for (let index = 0; index < pixels.length; index += 4) {
    const pixel = [pixels[index]!, pixels[index + 1]!, pixels[index + 2]!, pixels[index + 3]!] as const;
    if (predicate(pixel)) return pixel;
  }
  return Array.from(renderer.device.readPixels(region.x + Math.floor(region.width / 2), region.y + Math.floor(region.height / 2), 1, 1));
}

function renderPostprocessPreview(renderer: Renderer, previewCanvas: HTMLCanvasElement): NonNullable<MaterialShowroomState["postprocess"]> {
  const region = { x: 365, y: 125, width: 110, height: 105 };
  const source = renderer.device.readPixels(region.x, region.y, region.width, region.height);
  const bloomed = bloomPixels(source, region.width, region.height, { threshold: 0.32, intensity: 1.45, radius: 4 });
  const boost = findStrongestGreenBoost(source, bloomed.pixels, region.width, region.height);

  const context = previewCanvas.getContext("2d");
  if (!context) throw new Error("Material showroom postprocess preview requires a 2D context.");
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#050608";
  context.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
  drawPreviewImage(context, source, region.width, region.height, 0, 0, 220, 210);
  drawPreviewImage(context, bloomed.pixels, region.width, region.height, 236, 0, 220, 210);
  context.fillStyle = "#dce6eb";
  context.font = "13px ui-sans-serif, system-ui, sans-serif";
  context.fillText("Readback", 10, 18);
  context.fillText("Bloom", 246, 18);

  return {
    source: "webgl2-material-showroom-emissive-readback",
    path: "PostProcessPass.bloomPixels",
    brightPixelCount: bloomed.brightPixelCount,
    brightEnergy: Number(bloomed.brightEnergy.toFixed(3)),
    maxNeighborBoost: Number(bloomed.maxNeighborBoost.toFixed(3)),
    beforeNeighbor: boost.before,
    afterNeighbor: boost.after,
    previewFrame: { width: previewCanvas.width, height: previewCanvas.height }
  };
}

function drawPreviewImage(
  context: CanvasRenderingContext2D,
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  displayWidth: number,
  displayHeight: number
): void {
  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  scratch.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  context.drawImage(scratch, x, y, displayWidth, displayHeight);
}

function findStrongestGreenBoost(
  before: Uint8Array,
  after: Uint8Array,
  width: number,
  height: number
): { readonly before: readonly number[]; readonly after: readonly number[] } {
  let bestX = Math.floor(width / 2);
  let bestY = Math.floor(height / 2);
  let bestDelta = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const beforePixel = readBufferPixel(before, width, x, y);
      const afterPixel = readBufferPixel(after, width, x, y);
      const greenDelta = channel(afterPixel, 1) - channel(beforePixel, 1);
      if (greenDelta > bestDelta && channel(beforePixel, 1) < 248 && channel(afterPixel, 3) === 255) {
        bestDelta = greenDelta;
        bestX = x;
        bestY = y;
      }
    }
  }
  return {
    before: readBufferPixel(before, width, bestX, bestY),
    after: readBufferPixel(after, width, bestX, bestY)
  };
}

function readBufferPixel(pixels: Uint8Array, width: number, x: number, y: number): readonly number[] {
  const index = (y * width + x) * 4;
  return Array.from(pixels.slice(index, index + 4));
}

function knownLimits(): readonly string[] {
  return [
    "HDR environment input is blocked for this example; it uses generated RGBA8 environment pixels.",
    "Irradiance convolution, production specular prefiltering, reflection probes, physical transmission refraction, and full Three.js/Babylon PBR parity are not claimed.",
    "Clearcoat, transmission, sheen, anisotropy, and iridescence are bounded material lobe approximations in the current direct PBR shader.",
    "Bloom evidence is a post-render readback preview using the shared PostProcessPass bloom path; the showroom does not claim a renderer-integrated postprocess compositor."
  ];
}

function materialKnownLimits(): Record<string, readonly string[]> {
  return {
    "dielectric-gloss": ["Uses direct lights plus bounded sampled RGBA8 environment lighting; no HDR irradiance probe."],
    "dielectric-rough": ["Roughness response uses shader approximation and sampled environment mip levels; no production prefiltered cubemap."],
    "metal-gloss": ["Metallic reflection is visible through bounded environment sampling; no reflection probes or physically calibrated specular prefilter."],
    "metal-rough": ["Rough metallic response is bounded by generated RGBA8 mips; no HDR metal parity claim."],
    "normal-mapped": ["Normal response uses tangent-space texture sampling under direct lights; no parallax, clearcoat normal, or anisotropy texture path."],
    "emissive": ["Emissive color and strength are visible; bloom is validated only in the readback preview path."],
    "alpha-blend": ["Alpha blend disables depth write; no order-independent transparency."],
    "double-sided": ["Double-sided evidence disables back-face culling on the material; no two-sided normal flip or thin-surface transmission is claimed."],
    "clearcoat-like": ["Clearcoat-like lobe is an approximation in the direct PBR shader; no glTF clearcoat texture parity claim."],
    "transmission-like": ["Transmission-like lobe tints direct material output; no physical refraction, thickness integration, or glTF transmission parity claim."],
    "sheen-like": ["Sheen-like lobe is visible as a bounded additive cloth response; no sheen texture visual parity claim."],
    "anisotropy-like": ["Anisotropy-like lobe uses bounded shader parameters; no tangent-direction anisotropic BRDF parity claim."],
    "iridescence-like": ["Iridescence-like lobe uses deterministic hue modulation; no thin-film spectral parity claim."],
    "physical-gold": ["Old-branch gold preset is ported into current bounded PBR parameters; no spectral metal reference parity claim."],
    "physical-copper": ["Old-branch copper preset is ported into current bounded PBR parameters; no measured conductor reference parity claim."],
    "physical-glass": ["Old-branch glass preset maps to current transmission fallback parameters; no physical refraction parity claim."],
    "physical-water": ["Old-branch water preset maps to current transmission/attenuation parameters; no waves, foam, planar reflection, or caustics claim."],
    "physical-skin": ["Old-branch skin preset maps to bounded diffuse-transmission and sheen parameters; no production SSS claim."],
    "physical-eye": ["Old-branch subsurface/cornea intent maps to bounded diffuse-transmission and clearcoat parameters; no layered cornea/iris geometry or screen-space SSS claim."],
    "physical-hair": ["Old-branch hair preset maps to bounded anisotropy and sheen parameters; no strand scattering claim."],
    "physical-terrain": ["Old-branch terrain preset maps to a bounded rough dielectric and sheen response; no splat mapping, triplanar blending, or distance texture LOD claim."],
    "physical-toon": ["Old-branch toon preset maps to bounded PBR clearcoat/emissive response; no cel bands, outlines, or hatching claim."]
  };
}

function channel(pixel: readonly number[] | undefined, index: number): number {
  return pixel?.[index] ?? 0;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function createShell(): {
  readonly canvas: HTMLCanvasElement;
  readonly previewCanvas: HTMLCanvasElement;
  readonly status: HTMLElement;
  readonly environmentPresetSelect: HTMLSelectElement;
} {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.innerHTML = `
    <canvas data-testid="material-showroom-canvas" width="960" height="540" tabindex="0" aria-label="Material showroom WebGL viewport"></canvas>
    <canvas class="postprocess-preview" data-testid="material-showroom-postprocess-preview" width="456" height="210" aria-label="Material showroom postprocess preview"></canvas>
    <section>
      <h1>Material Showroom</h1>
      <p>Bounded material-response grid with local texture fixtures, environment-map resources, and bloom readback proof.</p>
      <label>
        <span>Environment</span>
        <select data-testid="material-showroom-environment-preset">
          <option value="studio">Studio</option>
          <option value="overcast">Overcast</option>
          <option value="sunset">Sunset</option>
        </select>
      </label>
      <pre data-testid="material-showroom-status">booting</pre>
    </section>
  `;
  root.append(shell);
  return {
    canvas: shell.querySelector("[data-testid='material-showroom-canvas']")!,
    previewCanvas: shell.querySelector("[data-testid='material-showroom-postprocess-preview']")!,
    status: shell.querySelector("pre")!,
    environmentPresetSelect: shell.querySelector("[data-testid='material-showroom-environment-preset']")!
  };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #2d2924; color: #edf3f5; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-rows: minmax(0, 1fr) auto; background: radial-gradient(circle at 50% 18%, #6a5e50 0, #3d362f 48%, #2d2924 100%); }
    canvas { width: 100%; height: min(82vh, 760px); display: block; background: transparent; }
    .postprocess-preview { display: none; }
    section { border-top: 1px solid #2c363b; background: rgba(18, 24, 29, 0.96); padding: 1rem 1.25rem; display: grid; grid-template-columns: 14rem minmax(18rem, 1fr) minmax(12rem, 16rem); gap: 1rem; align-items: start; }
    h1, p, label, pre { margin: 0; }
    h1 { font-size: 1rem; }
    p { color: #c8d3d8; line-height: 1.4; }
    label { display: grid; gap: 0.35rem; color: #cad3d8; font-size: 0.875rem; }
    select { min-height: 2.25rem; border: 1px solid #34424d; border-radius: 6px; background: #101820; color: #eef2f6; padding: 0 0.65rem; font: inherit; }
    pre { display: none; }
    @media (max-width: 760px) { section { grid-template-columns: 1fr; } canvas { height: 62vh; } }
  `;
  document.head.append(style);
}
