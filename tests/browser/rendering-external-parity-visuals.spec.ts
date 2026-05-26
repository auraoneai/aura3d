import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

declare global {
  interface Window {
    __AURA3D_MATERIAL_SHOWROOM__?: V4ExampleState;
    __AURA3D_SHADOW_LAB__?: V4ExampleState;
    __AURA3D_FORWARD_SHADOW_MAP_CHECK__?: V4ForwardShadowMapCheckState;
    __AURA3D_POSTPROCESS_LAB__?: V4ExampleState;
    __AURA3D_WEBGPU_CAPABILITY__?: V4WebGPUCapabilityState;
    __AURA3D_PBR_EXTENSION_TEXTURE_VARIANTS__?: V4PbrExtensionTextureVariantState;
  }
}

test.describe("V4 renderer visual quality evidence", () => {
  let server: ExampleDevServer;
  const report: V4RenderingReport = {
    ok: false,
    generatedAt: new Date().toISOString(),
    command: "pnpm exec playwright test tests/browser/rendering-external-parity-visuals.spec.ts",
    screenshots: [],
    validations: [],
    blockedClaims: [
      "HDR render targets and HDR image-based lighting remain blocked by current renderer feature evidence.",
      "SSAO, SSR, TAA, and DOF are not claimed by V4 renderer evidence.",
      "This report covers renderer-owned labs only; flagship product, architecture, game, and asset viewer V4 screenshots require their owning agents."
    ]
  };

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    report.ok = report.validations.every((validation) => validation.ok);
    report.generatedAt = new Date().toISOString();
    const reportPath = resolve("tests/reports/external-parity-rendering.json");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });

  test("material showroom publishes V4 preset evidence and PBR/environment screenshot", async ({ page }) => {
    await page.goto(`${server.origin}/examples/material-showroom/index.html`, { waitUntil: "domcontentloaded" });
    await waitForState(page, "__AURA3D_MATERIAL_SHOWROOM__");
    await page.getByTestId("material-showroom-environment-preset").selectOption("sunset");
    await expect.poll(() => page.evaluate(() => window.__AURA3D_MATERIAL_SHOWROOM__?.environmentPreset)).toBe("sunset");
    const screenshotPath = "tests/reports/external-parity-example-screenshots/material-showroom.png";
    await captureScreenshot(page, "[data-testid='material-showroom-canvas']", screenshotPath);
    const state = await page.evaluate(() => window.__AURA3D_MATERIAL_SHOWROOM__);
    const checks = {
      ready: state?.status === "ready",
      preset: state?.featureEvidence?.presetId === "aura3d-external-parity-visual-quality-preset",
      screenshotPath: state?.featureEvidence?.screenshotPath === screenshotPath,
      claimBoundary: typeof state?.claimBoundary === "string" && state.claimBoundary.length > 40,
      pbrFeatures: includesAll(state?.featureEvidence?.activeFeatures, ["bounded-pbr", "environment-reflections", "postprocess-bloom"]),
      hdrBlocked: state?.featureEvidence?.blockedFeatures?.some((feature) => feature.feature === "hdr") === true,
      environmentPresets: includesAll(state?.environmentPresets, ["studio", "overcast", "sunset"]) && state?.environmentPreset === "sunset",
      materialSet: includesAll(state?.materials, ["dielectric-gloss", "dielectric-rough", "metal-gloss", "metal-rough", "normal-mapped", "emissive", "alpha-blend", "double-sided", "clearcoat-like", "transmission-like", "sheen-like", "anisotropy-like", "iridescence-like", "physical-gold", "physical-copper", "physical-glass", "physical-water", "physical-skin", "physical-eye", "physical-hair", "physical-terrain", "physical-toon"]),
      oldBranchPhysicalPresets: includesAll(state?.oldBranchPhysicalMaterialPresets, ["gold", "silver", "copper", "fabric", "glass", "water", "skin", "eye", "hair", "terrain", "toon"]),
      proceduralTextureFixtures: includesAll(state?.proceduralTextureFixtures?.map((fixture) => fixture.id), ["marble", "concrete-asphalt", "metallic-paint", "sci-fi-panel", "wood-plank"]) &&
        state?.proceduralTextureFixtures?.every((fixture) => typeof fixture.hash === "string" && fixture.hash.length >= 8) === true,
      materialPixels: Boolean(state?.pixels && Object.values(state.pixels).every((pixel) => channel(pixel, 3) === 255)),
      doubleSidedPixel: channel(state?.pixels?.doubleSided, 0) > 75,
      physicalEyePixel: channel(state?.pixels?.physicalEye, 0) + channel(state?.pixels?.physicalEye, 1) + channel(state?.pixels?.physicalEye, 2) > 150,
      physicalTerrainPixel: channel(state?.pixels?.physicalTerrain, 1) > 18,
      physicalToonPixel: channel(state?.pixels?.physicalToon, 0) > 50,
      environmentResources: (state?.environmentResources?.specularMipCount ?? 0) >= 4,
      postprocessChanged: channel(state?.postprocess?.afterNeighbor, 1) > channel(state?.postprocess?.beforeNeighbor, 1)
    };
    recordValidation("material-showroom-v4-preset", screenshotPath, checks, {
      drawCalls: Number(state?.diagnostics?.drawCalls ?? 0),
      materialCount: Number(state?.materials?.length ?? 0),
      proceduralTextureFixtureCount: Number(state?.proceduralTextureFixtures?.length ?? 0),
      environmentPreset: state?.environmentPreset ?? "missing",
      specularMipCount: Number(state?.environmentResources?.specularMipCount ?? 0),
      bloomBrightPixels: Number(state?.postprocess?.brightPixelCount ?? 0)
    });
    expect(checks, JSON.stringify(state)).toEqual({
      ready: true,
      preset: true,
      screenshotPath: true,
      claimBoundary: true,
      pbrFeatures: true,
      hdrBlocked: true,
      environmentPresets: true,
      materialSet: true,
      oldBranchPhysicalPresets: true,
      proceduralTextureFixtures: true,
      materialPixels: true,
      doubleSidedPixel: true,
      physicalEyePixel: true,
      physicalTerrainPixel: true,
      physicalToonPixel: true,
      environmentResources: true,
      postprocessChanged: true
    });
  });

  test("PBR extension texture variants render through sampler-budgeted WebGL2 shaders", async ({ page }) => {
    await page.goto(`${server.origin}/examples/pbr-extension-texture-variants/index.html`, { waitUntil: "domcontentloaded" });
    await waitForPbrVariantState(page);
    const screenshotPath = "tests/reports/external-parity-example-screenshots/pbr-extension-texture-variants.png";
    await captureScreenshot(page, "[data-testid='pbr-extension-texture-variants-canvas']", screenshotPath);
    const state = await page.evaluate(() => window.__AURA3D_PBR_EXTENSION_TEXTURE_VARIANTS__);
    const variants = state?.variants ?? [];
    const expectedVariants = [
      "clearcoat-textures",
      "transmission-volume-textures",
      "specular-sheen-anisotropy-textures",
      "iridescence-textures",
      "clearcoat-transmission-volume-textures",
      "specular-sheen-anisotropy-iridescence-textures"
    ];
    const expectedCombinedVariants = [
      "clearcoat-transmission-volume-textures",
      "specular-sheen-anisotropy-iridescence-textures"
    ];
    const checks = {
      ready: state?.status === "ready",
      screenshotPath: state?.screenshotPath === screenshotPath,
      samplerBudgetedShaderVariants: state?.featureEvidence?.samplerBudgetedShaderVariants === true &&
        expectedVariants.every((variant) => variants.some((entry) => entry.shaderVariant === variant)),
      combinedSamplerBudgetedShaderVariants: state?.featureEvidence?.combinedSamplerBudgetedShaderVariants === true &&
        expectedCombinedVariants.every((variant) => variants.some((entry) => entry.shaderVariant === variant)),
      advancedTextureMapsRendered: state?.featureEvidence?.advancedTextureMapsRendered === true,
      browserPixelReadback: state?.featureEvidence?.browserPixelReadback === true,
      variantCount: variants.length === 6,
      opaqueNonBlankPixels: variants.length === 6 && variants.every((entry) => channel(entry.pixel, 3) === 255 && entry.rgb > 20),
      distinctVariantPixels: distinctPixelBuckets(variants.map((entry) => entry.pixel)) >= 4,
      drawCalls: Number(state?.diagnostics?.drawCalls ?? 0) >= 6,
      knownLimits: state?.knownLimits?.some((limit) => limit.includes("does not prove every arbitrary all-extension permutation")) === true
    };
    recordValidation("pbr-extension-texture-variant-browser-evidence", screenshotPath, checks, {
      drawCalls: Number(state?.diagnostics?.drawCalls ?? 0),
      variantCount: variants.length,
      combinedVariantCount: variants.filter((entry) => expectedCombinedVariants.includes(entry.shaderVariant)).length,
      distinctVariantPixels: distinctPixelBuckets(variants.map((entry) => entry.pixel)),
      minVariantRgb: variants.length > 0 ? Math.min(...variants.map((entry) => entry.rgb)) : 0,
      maxVariantRgb: variants.length > 0 ? Math.max(...variants.map((entry) => entry.rgb)) : 0
    });
    expect(checks, JSON.stringify(state)).toEqual({
      ready: true,
      screenshotPath: true,
      samplerBudgetedShaderVariants: true,
      combinedSamplerBudgetedShaderVariants: true,
      advancedTextureMapsRendered: true,
      browserPixelReadback: true,
      variantCount: true,
      opaqueNonBlankPixels: true,
      distinctVariantPixels: true,
      drawCalls: true,
      knownLimits: true
    });
  });

  test("shadow lab publishes V4 preset evidence and visible shadow screenshot", async ({ page }) => {
    await page.goto(`${server.origin}/examples/shadow-lab/index.html`, { waitUntil: "domcontentloaded" });
    await waitForState(page, "__AURA3D_SHADOW_LAB__");
    const screenshotPath = "tests/reports/external-parity-example-screenshots/shadow-lab.png";
    await captureScreenshot(page, "body", screenshotPath);
    const state = await page.evaluate(() => window.__AURA3D_SHADOW_LAB__);
    const shadowRgb = rgbSum(state?.shadowPixel);
    const planeRgb = rgbSum(state?.planePixel);
    const checks = {
      ready: state?.status === "ready",
      preset: state?.featureEvidence?.presetId === "aura3d-external-parity-visual-quality-preset",
      screenshotPath: state?.featureEvidence?.screenshotPath === screenshotPath,
      claimBoundary: typeof state?.claimBoundary === "string" && state.claimBoundary.length > 40,
      shadowFeature: state?.featureEvidence?.activeFeatures?.includes("directional-shadows") === true,
      contactBlocked: state?.featureEvidence?.blockedFeatures?.some((feature) => feature.feature === "contact-shadows") === true,
      cascadesRendered: state?.cascadeRendered?.every(Boolean) === true,
      pointShadowFaces: Number(state?.pointSpot?.point?.renderedFaces ?? 0) === 6,
      spotShadowRendered: state?.pointSpot?.spot?.rendered === true && Number(state?.pointSpot?.spot?.pcfSamples ?? 0) >= 9,
      pointSpotPixels: rgbSum(state?.pointSpot?.point?.pixel) > 0 && rgbSum(state?.pointSpot?.spot?.pixel) > 0,
      projectedShadowDarker: shadowRgb > 0 && planeRgb > 0 && shadowRgb < planeRgb,
      pcfPenumbra: rgbSum(state?.pcf?.litPixel) > rgbSum(state?.pcf?.penumbraPixel) && rgbSum(state?.pcf?.penumbraPixel) > rgbSum(state?.pcf?.shadowPixel),
      debugOverlayPixels: Object.values(state?.debugView?.pixels ?? {}).every((pixel) => channel(pixel, 3) === 255)
    };
    recordValidation("shadow-lab-v4-preset", screenshotPath, checks, {
      drawCalls: Number(state?.diagnostics?.drawCalls ?? 0),
      cascadeCount: Number(state?.cascadeCount ?? 0),
      pointShadowFaces: Number(state?.pointSpot?.point?.renderedFaces ?? 0),
      spotPcfSamples: Number(state?.pointSpot?.spot?.pcfSamples ?? 0),
      pointSpotDrawCalls: Number(state?.pointSpot?.drawCalls ?? 0),
      shadowRgb,
      planeRgb,
      pcfSamples: Number(state?.pcf?.samples ?? 0)
    });
    expect(checks, JSON.stringify(state)).toEqual({
      ready: true,
      preset: true,
      screenshotPath: true,
      claimBoundary: true,
      shadowFeature: true,
      contactBlocked: true,
      cascadesRendered: true,
      pointShadowFaces: true,
      spotShadowRendered: true,
      pointSpotPixels: true,
      projectedShadowDarker: true,
      pcfPenumbra: true,
      debugOverlayPixels: true
    });
  });

  test("shadow lab remains stable after resize and under DPR 2", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1180, height: 760 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    try {
      await page.goto(`${server.origin}/examples/shadow-lab/index.html`, { waitUntil: "domcontentloaded" });
      await waitForState(page, "__AURA3D_SHADOW_LAB__");
      const dprScreenshot = "tests/reports/external-parity-example-screenshots/shadow-lab-dpr2.png";
      await captureScreenshot(page, "body", dprScreenshot);
      const dprState = await page.evaluate(() => window.__AURA3D_SHADOW_LAB__);
      const dprShadowRgb = rgbSum(dprState?.shadowPixel);
      const dprPlaneRgb = rgbSum(dprState?.planePixel);

      await page.setViewportSize({ width: 740, height: 620 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForState(page, "__AURA3D_SHADOW_LAB__");
      const resizedScreenshot = "tests/reports/external-parity-example-screenshots/shadow-lab-resized-dpr2.png";
      await captureScreenshot(page, "body", resizedScreenshot);
      const resizedState = await page.evaluate(() => window.__AURA3D_SHADOW_LAB__);
      const resizedShadowRgb = rgbSum(resizedState?.shadowPixel);
      const resizedPlaneRgb = rgbSum(resizedState?.planePixel);
      const checks = {
        dprReady: dprState?.status === "ready",
        dprShadowDarker: dprShadowRgb > 0 && dprPlaneRgb > 0 && dprShadowRgb < dprPlaneRgb,
        dprCascadesRendered: dprState?.cascadeRendered?.every(Boolean) === true,
        resizedReady: resizedState?.status === "ready",
        resizedShadowDarker: resizedShadowRgb > 0 && resizedPlaneRgb > 0 && resizedShadowRgb < resizedPlaneRgb,
        resizedCascadesRendered: resizedState?.cascadeRendered?.every(Boolean) === true,
        dprPublished: await page.evaluate(() => window.devicePixelRatio) === 2,
      };
      recordValidation("shadow-lab-resize-dpr2-stability", dprScreenshot, checks, {
        dprShadowRgb,
        dprPlaneRgb,
        resizedShadowRgb,
        resizedPlaneRgb,
        dpr: 2,
      });
      report.screenshots.push(resizedScreenshot);
      expect(checks, JSON.stringify({ dprState, resizedState })).toEqual({
        dprReady: true,
        dprShadowDarker: true,
        dprCascadesRendered: true,
        resizedReady: true,
        resizedShadowDarker: true,
        resizedCascadesRendered: true,
        dprPublished: true,
      });
    } finally {
      await context.close();
    }
  });

  test("forward pass samples a bound shadow map texture in real WebGL2 rendering", async ({ page }) => {
    await page.goto(`${server.origin}/examples/forward-shadow-map-check/index.html`, { waitUntil: "domcontentloaded" });
    await waitForState(page, "__AURA3D_FORWARD_SHADOW_MAP_CHECK__");
    const screenshotPath = "tests/reports/external-parity-example-screenshots/forward-shadow-map-check.png";
    await captureScreenshot(page, "[data-testid='forward-shadow-map-canvas']", screenshotPath);
    const state = await page.evaluate(() => window.__AURA3D_FORWARD_SHADOW_MAP_CHECK__);
    const checks = {
      ready: state?.status === "ready",
      renderer: state?.renderer === "webgl2-forward-pass-shadow-map",
      forwardPassShadowMapSampling: state?.featureEvidence?.forwardPassShadowMapSampling === true,
      shadowTextureBound: state?.featureEvidence?.shadowTextureBound === true,
      generatedShadowMapTexture: state?.featureEvidence?.generatedShadowMapTexture === true &&
        Number(state?.metrics?.generatedDepthRgb ?? 0) < 750,
      depthPassRenderTarget: state?.featureEvidence?.depthPassRenderTarget === true,
      lightCastsShadow: state?.featureEvidence?.lightCastsShadow === true,
      pcfTextureSamples: Number(state?.featureEvidence?.pcfTextureSamples ?? 0) >= 9,
      litVsShadowedPixelReadback: state?.featureEvidence?.litVsShadowedPixelReadback === true &&
        Number(state?.metrics?.litRgb ?? 0) > Number(state?.metrics?.shadowedRgb ?? 0) + 25,
      drawCalls: Number(state?.diagnostics?.drawCalls ?? 0) >= 2,
      limitsPublished: state?.knownLimits?.some((limit) => limit.includes("not full production shadow atlas")) === true,
    };
    recordValidation("forward-pass-shadow-map-sampling", screenshotPath, checks, {
      litRgb: Number(state?.metrics?.litRgb ?? 0),
      shadowedRgb: Number(state?.metrics?.shadowedRgb ?? 0),
      deltaRgb: Number(state?.metrics?.deltaRgb ?? 0),
      shadowStrength: Number(state?.metrics?.shadowStrength ?? 0),
      generatedDepthRgb: Number(state?.metrics?.generatedDepthRgb ?? 0),
      drawCalls: Number(state?.diagnostics?.drawCalls ?? 0)
    });
    expect(checks, JSON.stringify(state)).toEqual({
      ready: true,
      renderer: true,
      forwardPassShadowMapSampling: true,
      shadowTextureBound: true,
      generatedShadowMapTexture: true,
      depthPassRenderTarget: true,
      lightCastsShadow: true,
      pcfTextureSamples: true,
      litVsShadowedPixelReadback: true,
      drawCalls: true,
      limitsPublished: true,
    });
  });

  test("postprocess lab publishes V4 preset evidence and before-after screenshot", async ({ page }) => {
    await page.goto(`${server.origin}/examples/postprocess-lab/index.html`, { waitUntil: "domcontentloaded" });
    await waitForState(page, "__AURA3D_POSTPROCESS_LAB__");
    const screenshotPath = "tests/reports/external-parity-example-screenshots/postprocess-lab.png";
    await captureScreenshot(page, "[data-testid='postprocess-lab-canvas']", screenshotPath);
    const state = await page.evaluate(() => window.__AURA3D_POSTPROCESS_LAB__);
    const fxaaDelta =
      Math.abs(channel(state?.pixels?.fxaaBeforeEdge, 0) - channel(state?.pixels?.fxaaAfterEdge, 0)) +
      Math.abs(channel(state?.pixels?.fxaaBeforeEdge, 1) - channel(state?.pixels?.fxaaAfterEdge, 1)) +
      Math.abs(channel(state?.pixels?.fxaaBeforeEdge, 2) - channel(state?.pixels?.fxaaAfterEdge, 2));
    const checks = {
      ready: state?.status === "ready",
      preset: state?.featureEvidence?.presetId === "aura3d-external-parity-visual-quality-preset",
      screenshotPath: state?.featureEvidence?.screenshotPath === screenshotPath,
      claimBoundary: typeof state?.claimBoundary === "string" && state.claimBoundary.length > 40,
      postprocessFeatures: includesAll(state?.featureEvidence?.activeFeatures, ["bounded-pbr", "tone-mapping", "postprocess-bloom", "postprocess-fxaa", "depth-textures"]),
      realSceneInput: state?.realScene?.source === "v4-product-gltf-webgl2-readback" &&
        (state.realScene.meshCount ?? 0) >= 1 &&
        (state.realScene.materialCount ?? 0) >= 1 &&
        (state.realScene.renderItems ?? 0) >= 1 &&
        (state.realScene.drawCalls ?? 0) >= 1 &&
        (state.realScene.nonDarkPixels ?? 0) > 80 &&
        (state.realScene.colorBuckets ?? 0) >= 2,
      passCosts: Object.values(state?.passCostsMs ?? {}).every((value) => Number.isFinite(value) && value >= 0),
      colorGrading: state?.colorGrading?.path === "PostProcessPass.colorGradePixels" &&
        Number(state.colorGrading.changedPixels) > 0 &&
        Number(state.colorGrading.vignetteDarkenedPixels) > 0 &&
        Number(state.colorGrading.sharpenedPixels) > 0,
      advancedPostprocess: state?.advancedPostprocess?.source === "real-scene-ldr-readback" &&
        state.advancedPostprocess.chromaticAberration.path === "PostProcessPass.chromaticAberrationPixels" &&
        Number(state.advancedPostprocess.chromaticAberration.changedPixels) > 0 &&
        Number(state.advancedPostprocess.chromaticAberration.maxChannelOffsetPixels) > 0 &&
        state.advancedPostprocess.filmGrain.path === "PostProcessPass.filmGrainPixels" &&
        Number(state.advancedPostprocess.filmGrain.changedPixels) > 0 &&
        state.advancedPostprocess.depthOfField.path === "PostProcessPass.depthOfFieldPixels" &&
        Number(state.advancedPostprocess.depthOfField.blurredPixels) > 0 &&
        state.advancedPostprocess.outline.source === "origin-master-outline-controller-adapted" &&
        state.advancedPostprocess.outline.path === "PostProcessPass.outlinePixels" &&
        state.advancedPostprocess.outline.method === "sobel-luma" &&
        Number(state.advancedPostprocess.outline.outlinedPixels) > 0 &&
        Number(state.advancedPostprocess.outline.changedPixels) > 0 &&
        Number(state.advancedPostprocess.outline.maxGradient) > 0 &&
        state.advancedPostprocess.motionBlur.path === "PostProcessPass.motionBlurPixels" &&
        Number(state.advancedPostprocess.motionBlur.blurredPixels) > 0 &&
        state.advancedPostprocess.ssao.path === "PostProcessPass.ssaoPixels" &&
        Number(state.advancedPostprocess.ssao.occludedPixels) > 0 &&
        state.advancedPostprocess.ssr.path === "PostProcessPass.ssrPixels" &&
        Number(state.advancedPostprocess.ssr.reflectedPixels) > 0 &&
        state.advancedPostprocess.taa.path === "PostProcessPass.taaPixels" &&
        Number(state.advancedPostprocess.taa.blendedPixels) > 0,
      blockedEffects: state?.blockedPostprocessEffects?.dof === false &&
        state.blockedPostprocessEffects.chromaticAberration === false &&
        state.blockedPostprocessEffects.filmGrain === false &&
        state.blockedPostprocessEffects.motionBlur === false &&
        state.blockedPostprocessEffects.ssao === false &&
        state.blockedPostprocessEffects.ssr === false &&
        state.blockedPostprocessEffects.taa === false &&
        state.blockedPostprocessEffects.requiredEvidence === "real-scene-browser-pixel-tests",
      bloomChanged: Number(state?.bloomMetrics?.maxNeighborBoost ?? 0) > 0,
      fxaaChanged: fxaaDelta >= 12,
      depthVisible: channel(state?.pixels?.depthNear, 0) !== channel(state?.pixels?.depthFar, 0),
      seededBackground: state?.proceduralBackground?.id === "starfield-nebula" &&
        typeof state.proceduralBackground.hash === "string" &&
        state.proceduralBackground.hash.length >= 8 &&
        state.proceduralBackground.layers >= 3,
    };
    recordValidation("postprocess-lab-v4-preset", screenshotPath, checks, {
      graphPasses: Number(state?.graphOrder?.length ?? 0),
      timingSamples: Number(state?.timing?.sampleCount ?? 0),
      realSceneDrawCalls: Number(state?.realScene?.drawCalls ?? 0),
      realSceneColorBuckets: Number(state?.realScene?.colorBuckets ?? 0),
      colorGradeChangedPixels: Number(state?.colorGrading?.changedPixels ?? 0),
      sharpenedPixels: Number(state?.colorGrading?.sharpenedPixels ?? 0),
      chromaticAberrationChangedPixels: Number(state?.advancedPostprocess?.chromaticAberration?.changedPixels ?? 0),
      filmGrainChangedPixels: Number(state?.advancedPostprocess?.filmGrain?.changedPixels ?? 0),
      depthOfFieldBlurredPixels: Number(state?.advancedPostprocess?.depthOfField?.blurredPixels ?? 0),
      outlinePixels: Number(state?.advancedPostprocess?.outline?.outlinedPixels ?? 0),
      outlineChangedPixels: Number(state?.advancedPostprocess?.outline?.changedPixels ?? 0),
      motionBlurredPixels: Number(state?.advancedPostprocess?.motionBlur?.blurredPixels ?? 0),
      ssaoOccludedPixels: Number(state?.advancedPostprocess?.ssao?.occludedPixels ?? 0),
      ssrReflectedPixels: Number(state?.advancedPostprocess?.ssr?.reflectedPixels ?? 0),
      taaBlendedPixels: Number(state?.advancedPostprocess?.taa?.blendedPixels ?? 0),
      bloomBoost: Number(state?.bloomMetrics?.maxNeighborBoost ?? 0),
      fxaaDelta,
      proceduralBackgroundLayers: Number(state?.proceduralBackground?.layers ?? 0),
    });
    expect(checks, JSON.stringify(state)).toEqual({
      ready: true,
      preset: true,
      screenshotPath: true,
      claimBoundary: true,
      postprocessFeatures: true,
      realSceneInput: true,
      passCosts: true,
      colorGrading: true,
      advancedPostprocess: true,
      blockedEffects: true,
      bloomChanged: true,
      fxaaChanged: true,
      depthVisible: true,
      seededBackground: true,
    });
  });

  test("postprocess lab exposes runtime color-management controls backed by real-scene pixels", async ({ page }) => {
    await page.goto(`${server.origin}/examples/postprocess-lab/index.html`, { waitUntil: "domcontentloaded" });
    await waitForState(page, "__AURA3D_POSTPROCESS_LAB__");
    const canvas = page.getByTestId("postprocess-lab-canvas");
    const beforeBox = await requiredBox(canvas);
    const initial = await page.evaluate(() => window.__AURA3D_POSTPROCESS_LAB__);
    await page.getByTestId("postprocess-tone-mapper").selectOption("aces");
    await page.getByTestId("postprocess-exposure").fill("2.25");
    await page.getByTestId("postprocess-white-point").fill("1.6");
    await page.getByTestId("postprocess-input-color-space").selectOption("srgb");
    await page.getByTestId("postprocess-output-color-space").selectOption("linear");
    await expect.poll(() => page.evaluate(() => window.__AURA3D_POSTPROCESS_LAB__?.controls.toneMapper)).toBe("aces");
    const afterBox = await requiredBox(canvas);
    const changed = await page.evaluate(() => window.__AURA3D_POSTPROCESS_LAB__);
    const screenshotPath = "tests/reports/external-parity-example-screenshots/postprocess-lab-color-controls.png";
    await captureScreenshot(page, "[data-testid='postprocess-lab-canvas']", screenshotPath);
    const initialHighlight = rgbSum(initial?.pixels?.toneMappedHighlight);
    const changedHighlight = rgbSum(changed?.pixels?.toneMappedHighlight);
    const calibrationSample = changed?.colorManagement?.calibration?.samples?.find((sample) => sample.inputLinear === 0.18);
    const checks = {
      layoutStable: boxesMatch(beforeBox, afterBox),
      controlsPublished: changed?.controls.toneMapper === "aces" &&
        changed.controls.exposure === 2.25 &&
        changed.controls.whitePoint === 1.6 &&
        changed.controls.inputColorSpace === "srgb" &&
        changed.controls.outputColorSpace === "linear",
      featureEvidenceMatchesControls: changed?.featureEvidence?.colorManagement?.toneMapper === "aces" &&
        changed.featureEvidence.colorManagement.inputColorSpace === "srgb" &&
        changed.featureEvidence.colorManagement.outputColorSpace === "linear" &&
        changed.featureEvidence.colorManagement.exposure === 2.25 &&
        changed.featureEvidence.colorManagement.whitePoint === 1.6,
      colorManagementStateMatchesControls: changed?.colorManagement?.toneMapper === "aces" &&
        changed.colorManagement.exposure === 2.25 &&
        changed.colorManagement.whitePoint === 1.6 &&
        changed.colorManagement.inputColorSpace === "srgb" &&
        changed.colorManagement.outputColorSpace === "linear" &&
        changed.colorManagement.calibration.monotonic === true,
      oldBranchPresetEvidence: changed?.toneMappingPresetEvidence?.source === "old-branch-tone-mapping-controller-port" &&
        changed.toneMappingPresetEvidence.preset === "cinematic" &&
        changed.toneMappingPresetEvidence.path === "PostProcessPass.applyToneMappingPreset" &&
        includesAll(changed.toneMappingPresetEvidence.operators, ["aces", "filmic", "uncharted2", "agx", "neutral"]) &&
        changed.toneMappingPresetEvidence.histogram.binCount === 64 &&
        changed.toneMappingPresetEvidence.histogram.pixelCount === 96 * 54 &&
        Number(changed.toneMappingPresetEvidence.histogram.averageLuminance) > 0 &&
        Number(changed.toneMappingPresetEvidence.autoExposure.exposure) > 0 &&
        Number(changed.toneMappingPresetEvidence.changedPixels) > 0,
      realScenePixelsChanged: initialHighlight > 0 && changedHighlight > 0 && Math.abs(initialHighlight - changedHighlight) >= 8,
      linearSrgbCalibrationProof: calibrationSample?.encodedByte !== undefined &&
        calibrationSample.encodedByte >= 0 &&
        calibrationSample.encodedByte <= 255 &&
        changed?.pixels?.srgbMidGray?.[3] === 255,
    };
    recordValidation("postprocess-lab-runtime-color-management-controls", screenshotPath, checks, {
      initialHighlight,
      changedHighlight,
      exposure: Number(changed?.controls.exposure ?? 0),
      whitePoint: Number(changed?.controls.whitePoint ?? 0),
      calibrationMidGrayByte: Number(calibrationSample?.encodedByte ?? -1),
    });
    expect(checks, JSON.stringify({ initial, changed })).toEqual({
      layoutStable: true,
      controlsPublished: true,
      featureEvidenceMatchesControls: true,
      colorManagementStateMatchesControls: true,
      oldBranchPresetEvidence: true,
      realScenePixelsChanged: true,
      linearSrgbCalibrationProof: true,
    });
  });

  test("postprocess lab exposes color-grading controls backed by real-scene pixels", async ({ page }) => {
    await page.goto(`${server.origin}/examples/postprocess-lab/index.html`, { waitUntil: "domcontentloaded" });
    await waitForState(page, "__AURA3D_POSTPROCESS_LAB__");
    const initial = await page.evaluate(() => window.__AURA3D_POSTPROCESS_LAB__);
    await page.getByTestId("postprocess-tone-mapper").selectOption("filmic");
    await page.getByTestId("postprocess-contrast").fill("1.55");
    await page.getByTestId("postprocess-temperature").fill("0.55");
    await page.getByTestId("postprocess-tint").fill("0.35");
    await page.getByTestId("postprocess-saturation").fill("1.45");
    await page.getByTestId("postprocess-vibrance").fill("0.55");
    await page.getByTestId("postprocess-vignette").fill("0.55");
    await page.getByTestId("postprocess-sharpening").fill("0.9");
    await expect.poll(() => page.evaluate(() => window.__AURA3D_POSTPROCESS_LAB__?.controls.toneMapper)).toBe("filmic");
    const changed = await page.evaluate(() => window.__AURA3D_POSTPROCESS_LAB__);
    const screenshotPath = "tests/reports/external-parity-example-screenshots/postprocess-lab-color-grading.png";
    await captureScreenshot(page, "[data-testid='postprocess-lab-canvas']", screenshotPath);
    const checks = {
      filmicPublished: changed?.controls.toneMapper === "filmic" && changed.colorManagement?.toneMapper === "filmic",
      gradingControlsPublished: changed?.controls.contrast === 1.55 &&
        changed.controls.temperature === 0.55 &&
        changed.controls.tint === 0.35 &&
        changed.controls.saturation === 1.45 &&
        changed.controls.vibrance === 0.55 &&
        changed.controls.vignette === 0.55 &&
        changed.controls.sharpening === 0.9,
      gradingChangedPixels: Number(changed?.colorGrading?.changedPixels ?? 0) > 0 &&
        rgbSum(changed?.pixels?.toneMappedHighlight) !== rgbSum(initial?.pixels?.toneMappedHighlight),
      vignetteAndSharpeningActive: Number(changed?.colorGrading?.vignetteDarkenedPixels ?? 0) > 0 &&
        Number(changed?.colorGrading?.sharpenedPixels ?? 0) > 0,
      advancedPostprocessActive: Number(changed?.advancedPostprocess?.chromaticAberration?.changedPixels ?? 0) > 0 &&
        Number(changed?.advancedPostprocess?.filmGrain?.changedPixels ?? 0) > 0 &&
        Number(changed?.advancedPostprocess?.depthOfField?.blurredPixels ?? 0) > 0 &&
        Number(changed?.advancedPostprocess?.outline?.changedPixels ?? 0) > 0 &&
        Number(changed?.advancedPostprocess?.motionBlur?.blurredPixels ?? 0) > 0 &&
        Number(changed?.advancedPostprocess?.ssao?.occludedPixels ?? 0) > 0 &&
        Number(changed?.advancedPostprocess?.ssr?.reflectedPixels ?? 0) > 0 &&
        Number(changed?.advancedPostprocess?.taa?.blendedPixels ?? 0) > 0,
      blockedAdvancedEffects: changed?.blockedPostprocessEffects?.dof === false &&
        changed.blockedPostprocessEffects.chromaticAberration === false &&
        changed.blockedPostprocessEffects.filmGrain === false &&
        changed.blockedPostprocessEffects.motionBlur === false &&
        changed.blockedPostprocessEffects.ssao === false &&
        changed.blockedPostprocessEffects.ssr === false &&
        changed.blockedPostprocessEffects.taa === false,
    };
    recordValidation("postprocess-lab-runtime-color-grading-controls", screenshotPath, checks, {
      changedPixels: Number(changed?.colorGrading?.changedPixels ?? 0),
      vignetteDarkenedPixels: Number(changed?.colorGrading?.vignetteDarkenedPixels ?? 0),
      sharpenedPixels: Number(changed?.colorGrading?.sharpenedPixels ?? 0),
      advancedPostprocessChangedPixels: Number(changed?.advancedPostprocess?.chromaticAberration?.changedPixels ?? 0) +
        Number(changed?.advancedPostprocess?.filmGrain?.changedPixels ?? 0) +
        Number(changed?.advancedPostprocess?.depthOfField?.blurredPixels ?? 0) +
        Number(changed?.advancedPostprocess?.outline?.changedPixels ?? 0) +
        Number(changed?.advancedPostprocess?.motionBlur?.blurredPixels ?? 0),
    });
    expect(checks, JSON.stringify({ initial, changed })).toEqual({
      filmicPublished: true,
      gradingControlsPublished: true,
      gradingChangedPixels: true,
      vignetteAndSharpeningActive: true,
      advancedPostprocessActive: true,
      blockedAdvancedEffects: true,
    });
  });

  test("renderer runtime toggles keep layout stable and change visual state", async ({ page }) => {
    await page.goto(`${server.origin}/examples/postprocess-lab/index.html`, { waitUntil: "domcontentloaded" });
    await waitForState(page, "__AURA3D_POSTPROCESS_LAB__");
    const postprocessCanvas = page.getByTestId("postprocess-lab-canvas");
    const postprocessBefore = await requiredBox(postprocessCanvas);
    const initialPostprocess = await page.evaluate(() => window.__AURA3D_POSTPROCESS_LAB__);
    await page.getByTestId("postprocess-bloom").uncheck();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_POSTPROCESS_LAB__?.controls.bloom)).toBe(false);
    const postprocessAfter = await requiredBox(postprocessCanvas);
    const toggledPostprocess = await page.evaluate(() => window.__AURA3D_POSTPROCESS_LAB__);
    const postprocessToggleScreenshot = "tests/reports/external-parity-example-screenshots/postprocess-lab-toggle-bloom-off.png";
    await captureScreenshot(page, "[data-testid='postprocess-lab-canvas']", postprocessToggleScreenshot);

    await page.goto(`${server.origin}/examples/shadow-lab/index.html`, { waitUntil: "domcontentloaded" });
    await waitForState(page, "__AURA3D_SHADOW_LAB__");
    const shadowCanvas = page.getByTestId("shadow-lab-canvas");
    const shadowBefore = await requiredBox(shadowCanvas);
    const initialShadow = await page.evaluate(() => window.__AURA3D_SHADOW_LAB__);
    await page.getByTestId("shadow-darkness").evaluate((input) => {
      const element = input as HTMLInputElement;
      element.value = "0.85";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__AURA3D_SHADOW_LAB__?.pcf?.shadowPixel?.[0])).not.toBe(initialShadow?.pcf?.shadowPixel?.[0] ?? 0);
    const shadowAfter = await requiredBox(shadowCanvas);
    const toggledShadow = await page.evaluate(() => window.__AURA3D_SHADOW_LAB__);
    const shadowToggleScreenshot = "tests/reports/external-parity-example-screenshots/shadow-lab-toggle-darkness.png";
    await captureScreenshot(page, "[data-testid='shadow-lab-canvas']", shadowToggleScreenshot);

    const checks = {
      postprocessLayoutStable: boxesMatch(postprocessBefore, postprocessAfter),
      postprocessChangedState: initialPostprocess?.controls.bloom === true &&
        toggledPostprocess?.controls.bloom === false &&
        Number(initialPostprocess?.bloomMetrics?.maxNeighborBoost ?? 0) > Number(toggledPostprocess?.bloomMetrics?.maxNeighborBoost ?? 0),
      shadowLayoutStable: boxesMatch(shadowBefore, shadowAfter),
      shadowChangedState: rgbSum(initialShadow?.pcf?.shadowPixel) !== rgbSum(toggledShadow?.pcf?.shadowPixel),
    };
    recordValidation("renderer-runtime-toggle-layout-stability", postprocessToggleScreenshot, checks, {
      postprocessWidthBefore: Math.round(postprocessBefore.width),
      postprocessWidthAfter: Math.round(postprocessAfter.width),
      shadowWidthBefore: Math.round(shadowBefore.width),
      shadowWidthAfter: Math.round(shadowAfter.width),
      initialBloomBoost: Number(initialPostprocess?.bloomMetrics?.maxNeighborBoost ?? 0),
      toggledBloomBoost: Number(toggledPostprocess?.bloomMetrics?.maxNeighborBoost ?? 0),
    });
    report.screenshots.push(shadowToggleScreenshot);
    expect(checks).toEqual({
      postprocessLayoutStable: true,
      postprocessChangedState: true,
      shadowLayoutStable: true,
      shadowChangedState: true,
    });
  });

  test("webgpu capability example publishes supported and blocked visual evidence", async ({ page }) => {
    await page.goto(`${server.origin}/examples/webgpu-capability/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_WEBGPU_CAPABILITY__?.status === "ready", undefined, { timeout: 30_000 });
    const screenshotPath = "tests/reports/external-parity-example-screenshots/webgpu-capability.png";
    await captureScreenshot(page, "[data-testid='webgpu-capability-canvas']", screenshotPath);
    const state = await page.evaluate(() => window.__AURA3D_WEBGPU_CAPABILITY__);
    const checks = {
      ready: state?.status === "ready",
      screenshotPath: Boolean(screenshotPath),
      claimBoundary: state?.knownLimits?.some((limit) => limit.includes("does not claim full WebGPU renderer parity")) === true,
      availabilityClassified: ["available", "not-exposed", "adapter-missing", "device-error"].includes(String(state?.availability)),
      fallbackOrAdapter: state?.renderer === "webgpu" ? state.gracefulFallback === false : state?.gracefulFallback === true,
      blockedFullClaim: state?.knownLimits?.some((limit) => limit.includes("full WebGPU")) === true,
      computeClaimBlocked: state?.computeBoundary?.computeParticlesClaimed === false &&
        state?.computeBoundary?.computeUseCaseClaimed === false &&
        state?.computeBoundary?.fallbackPath === "cpu-webgl2-particles" &&
        state?.computeBoundary?.requiredEvidence === "real-webgpu-compute-browser-run" &&
        state?.knownLimits?.some((limit) => limit.includes("does not claim WebGPU compute particles")) === true,
      centerPixel: Array.isArray(state?.centerPixel) && state.centerPixel.length === 4,
    };
    recordValidation("webgpu-capability-visual-boundary", screenshotPath, checks, {
      hasNavigatorGpu: state?.hasNavigatorGpu ? 1 : 0,
      gracefulFallback: state?.gracefulFallback ? 1 : 0,
      computeParticlesClaimed: state?.computeBoundary?.computeParticlesClaimed ? 1 : 0,
      drawCalls: Number(state?.diagnostics?.drawCalls ?? 0),
    });
    expect(checks, JSON.stringify(state)).toEqual({
      ready: true,
      screenshotPath: true,
      claimBoundary: true,
      availabilityClassified: true,
      fallbackOrAdapter: true,
      blockedFullClaim: true,
      computeClaimBlocked: true,
      centerPixel: true,
    });
  });

  function recordValidation(name: string, screenshotPath: string, checks: Record<string, boolean>, metrics: Record<string, number>): void {
    const ok = Object.values(checks).every(Boolean);
    report.validations.push({ name, ok, screenshotPath, checks, metrics });
    report.screenshots.push(screenshotPath);
  }
});

async function waitForState(page: Page, stateName: "__AURA3D_MATERIAL_SHOWROOM__" | "__AURA3D_SHADOW_LAB__" | "__AURA3D_POSTPROCESS_LAB__"): Promise<void> {
  await page.waitForFunction(
    (name) => {
      const state = (globalThis as Record<string, V4ExampleState | undefined>)[name];
      return state?.status === "ready" || state?.status === "error";
    },
    stateName,
    { timeout: 30_000 }
  );
}

async function waitForPbrVariantState(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const state = window.__AURA3D_PBR_EXTENSION_TEXTURE_VARIANTS__;
      return state?.status === "ready" || state?.status === "error";
    },
    undefined,
    { timeout: 30_000 }
  );
}

async function captureScreenshot(page: Page, selector: string, screenshotPath: string): Promise<void> {
  mkdirSync(dirname(resolve(screenshotPath)), { recursive: true });
  await page.locator(selector).screenshot({ path: screenshotPath });
}

function includesAll(values: readonly string[] | undefined, required: readonly string[]): boolean {
  return required.every((value) => values?.includes(value));
}

function channel(pixel: readonly number[] | undefined, index: number): number {
  return pixel?.[index] ?? 0;
}

function rgbSum(pixel: readonly number[] | undefined): number {
  return channel(pixel, 0) + channel(pixel, 1) + channel(pixel, 2);
}

function distinctPixelBuckets(pixels: readonly (readonly number[])[]): number {
  return new Set(pixels.map((pixel) => `${channel(pixel, 0) >> 4}:${channel(pixel, 1) >> 4}:${channel(pixel, 2) >> 4}`)).size;
}

async function requiredBox(locator: Locator): Promise<{ readonly width: number; readonly height: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Expected locator to have a bounding box.");
  return { width: box.width, height: box.height };
}

function boxesMatch(left: { readonly width: number; readonly height: number }, right: { readonly width: number; readonly height: number }): boolean {
  return Math.abs(left.width - right.width) <= 1 && Math.abs(left.height - right.height) <= 1;
}

interface V4ExampleState {
  readonly status: "ready" | "error";
  readonly featureEvidence?: {
    readonly presetId: string;
    readonly screenshotPath: string;
    readonly colorManagement?: {
      readonly inputColorSpace: "linear" | "srgb";
      readonly outputColorSpace: "linear" | "srgb";
      readonly toneMapper: string;
      readonly exposure: number;
      readonly whitePoint: number;
    };
    readonly activeFeatures: readonly string[];
    readonly blockedFeatures: readonly { readonly feature: string; readonly state: string; readonly reason?: string }[];
  };
  readonly claimBoundary?: string;
  readonly diagnostics?: { readonly drawCalls?: number; readonly lastError: string | null };
  readonly pixels?: Record<string, readonly number[]>;
  readonly environmentResources?: { readonly specularMipCount: number };
  readonly environmentPreset?: string;
  readonly environmentPresets?: readonly string[];
  readonly materials?: readonly string[];
  readonly oldBranchPhysicalMaterialPresets?: readonly string[];
  readonly proceduralTextureFixtures?: readonly { readonly id: string; readonly hash: string; readonly semantic: string }[];
  readonly postprocess?: {
    readonly brightPixelCount: number;
    readonly beforeNeighbor: readonly number[];
    readonly afterNeighbor: readonly number[];
  };
  readonly controls?: {
    readonly toneMapping: boolean;
    readonly bloom: boolean;
    readonly fxaa: boolean;
    readonly toneMapper?: string;
    readonly exposure?: number;
    readonly whitePoint?: number;
    readonly inputColorSpace?: "linear" | "srgb";
    readonly outputColorSpace?: "linear" | "srgb";
    readonly contrast?: number;
    readonly temperature?: number;
    readonly tint?: number;
    readonly saturation?: number;
    readonly vibrance?: number;
    readonly vignette?: number;
    readonly sharpening?: number;
  };
  readonly colorManagement?: {
    readonly inputColorSpace: "linear" | "srgb";
    readonly outputColorSpace: "linear" | "srgb";
    readonly toneMapper: string;
    readonly exposure: number;
    readonly whitePoint: number;
    readonly calibration: {
      readonly monotonic: boolean;
      readonly samples: readonly { readonly inputLinear: number; readonly encodedByte: number }[];
    };
  };
  readonly toneMappingPresetEvidence?: {
    readonly source: string;
    readonly preset: string;
    readonly path: string;
    readonly operators: readonly string[];
    readonly histogram: {
      readonly bins: readonly number[];
      readonly binCount: number;
      readonly pixelCount: number;
      readonly averageLuminance: number;
      readonly maxObservedLuminance: number;
    };
    readonly autoExposure: {
      readonly exposure: number;
      readonly targetExposure: number;
      readonly averageLuminance: number;
      readonly adaptationRate: number;
    };
    readonly changedPixels: number;
    readonly colorBuckets: number;
  };
  readonly cascadeCount?: number;
  readonly cascadeRendered?: readonly boolean[];
  readonly shadowPixel?: readonly number[];
  readonly planePixel?: readonly number[];
  readonly pcf?: {
    readonly samples: number;
    readonly litPixel: readonly number[];
    readonly penumbraPixel: readonly number[];
    readonly shadowPixel: readonly number[];
  };
  readonly pointSpot?: {
    readonly point?: {
      readonly renderedFaces?: number;
      readonly pixel?: readonly number[];
    };
    readonly spot?: {
      readonly rendered?: boolean;
      readonly pcfSamples?: number;
      readonly pixel?: readonly number[];
    };
    readonly drawCalls?: number;
  };
  readonly debugView?: { readonly pixels: Record<string, readonly number[]> };
  readonly passCostsMs?: Record<string, number>;
  readonly graphOrder?: readonly string[];
  readonly timing?: { readonly sampleCount: number };
  readonly bloomMetrics?: { readonly maxNeighborBoost: number };
  readonly colorGrading?: {
    readonly path: string;
    readonly changedPixels: number;
    readonly vignetteDarkenedPixels: number;
    readonly sharpenedPixels: number;
    readonly settings: Record<string, number>;
  };
  readonly advancedPostprocess?: {
    readonly source: string;
    readonly chromaticAberration: { readonly path: string; readonly changedPixels: number; readonly maxChannelOffsetPixels: number };
    readonly filmGrain: { readonly path: string; readonly changedPixels: number };
    readonly depthOfField: { readonly path: string; readonly blurredPixels: number };
    readonly outline: {
      readonly source: string;
      readonly path: string;
      readonly method: string;
      readonly outlinedPixels: number;
      readonly changedPixels: number;
      readonly maxGradient: number;
    };
    readonly motionBlur: { readonly path: string; readonly blurredPixels: number };
    readonly ssao: { readonly path: string; readonly occludedPixels: number };
    readonly ssr: { readonly path: string; readonly reflectedPixels: number };
    readonly taa: { readonly path: string; readonly blendedPixels: number };
  };
  readonly blockedPostprocessEffects?: {
    readonly dof: false;
    readonly chromaticAberration: false;
    readonly filmGrain: false;
    readonly motionBlur: false;
    readonly ssao: false;
    readonly ssr: false;
    readonly taa: false;
    readonly requiredEvidence: string;
  };
  readonly realScene?: {
    readonly source: string;
    readonly meshCount: number;
    readonly materialCount: number;
    readonly renderItems: number;
    readonly drawCalls: number;
    readonly nonDarkPixels: number;
    readonly colorBuckets: number;
  };
  readonly proceduralBackground?: {
    readonly id: string;
    readonly hash: string;
    readonly layers: number;
  };
  readonly error?: string;
}

interface V4RenderingReport {
  ok: boolean;
  generatedAt: string;
  command: string;
  screenshots: string[];
  validations: V4RenderingValidation[];
  blockedClaims: string[];
}

interface V4RenderingValidation {
  readonly name: string;
  readonly ok: boolean;
  readonly screenshotPath: string;
  readonly checks: Record<string, boolean>;
  readonly metrics: Record<string, number>;
}

interface V4PbrExtensionTextureVariantState {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly visualClaim: "bounded-pbr-extension-texture-variants";
  readonly screenshotPath: string;
  readonly diagnostics?: { readonly drawCalls?: number };
  readonly variants: readonly {
    readonly id: string;
    readonly shaderVariant: string;
    readonly pixel: readonly number[];
    readonly rgb: number;
  }[];
  readonly featureEvidence?: {
    readonly samplerBudgetedShaderVariants?: boolean;
    readonly combinedSamplerBudgetedShaderVariants?: boolean;
    readonly advancedTextureMapsRendered?: boolean;
    readonly variantCount?: number;
    readonly variantNames?: readonly string[];
    readonly browserPixelReadback?: boolean;
  };
  readonly knownLimits?: readonly string[];
  readonly error?: string;
}

interface V4ForwardShadowMapCheckState {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2-forward-pass-shadow-map";
  readonly diagnostics?: { readonly drawCalls?: number };
  readonly featureEvidence?: {
    readonly forwardPassShadowMapSampling?: boolean;
    readonly shadowTextureBound?: boolean;
    readonly generatedShadowMapTexture?: boolean;
    readonly depthPassRenderTarget?: boolean;
    readonly lightCastsShadow?: boolean;
    readonly litVsShadowedPixelReadback?: boolean;
    readonly pcfTextureSamples?: number;
  };
  readonly pixels?: {
    readonly lit?: readonly number[];
    readonly shadowed?: readonly number[];
  };
  readonly metrics?: {
    readonly litRgb?: number;
    readonly shadowedRgb?: number;
    readonly deltaRgb?: number;
    readonly shadowStrength?: number;
    readonly generatedDepthRgb?: number;
  };
  readonly knownLimits?: readonly string[];
  readonly error?: string;
}

interface V4WebGPUCapabilityState {
  readonly status: "ready";
  readonly renderer: "webgpu" | "unavailable";
  readonly visualClaim: "webgpu-capability-probe";
  readonly availability: "available" | "not-exposed" | "adapter-missing" | "device-error";
  readonly hasNavigatorGpu: boolean;
  readonly diagnostics?: { readonly drawCalls?: number };
  readonly centerPixel: readonly number[];
  readonly gracefulFallback: boolean;
  readonly computeBoundary?: {
    readonly computeParticlesClaimed: boolean;
    readonly computeUseCaseClaimed: boolean;
    readonly fallbackPath: string;
    readonly requiredEvidence: string;
  };
  readonly knownLimits: readonly string[];
}
