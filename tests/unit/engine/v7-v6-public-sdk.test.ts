import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GALILEO3D_ENGINE_V6_PRODUCT_SURFACE,
  G3D_THREEJS_EXAMPLE_PARITY_TARGETS,
  G3DRenderer,
  assetsV6,
  createAnimationController,
  createCameraFrame,
  createDirectionalLight,
  createFirstPersonControls,
  createGroundedStage,
  createMapControls,
  createOrbitControls,
  createPhysicsScene,
  createPointerLockControls,
  createProductionRenderOptions,
  createProductViewer,
  createStudioLighting,
  createTrackballControls,
  loadGltfScene,
  loadHdrEnvironment
} from "@galileo3d/engine/v6";
import { AnimationClip, AnimationTrack } from "@galileo3d/animation";

describe("V7 V6 public SDK", () => {
  it("exports the developer-facing renderer product API", () => {
    expect(GALILEO3D_ENGINE_V6_PRODUCT_SURFACE).toBe("g3d-renderer-v6-sdk");
    expect(typeof G3DRenderer.create).toBe("function");
    expect(typeof loadGltfScene).toBe("function");
    expect(typeof loadHdrEnvironment).toBe("function");
    expect(typeof createDirectionalLight).toBe("function");
    expect(typeof createStudioLighting).toBe("function");
    expect(typeof createGroundedStage).toBe("function");
    expect(typeof createCameraFrame).toBe("function");
    expect(typeof createProductionRenderOptions).toBe("function");
    expect(typeof createOrbitControls).toBe("function");
    expect(typeof createFirstPersonControls).toBe("function");
    expect(typeof createMapControls).toBe("function");
    expect(typeof createTrackballControls).toBe("function");
    expect(typeof createPointerLockControls).toBe("function");
    expect(typeof createProductViewer).toBe("function");
    expect(typeof createAnimationController).toBe("function");
    expect(typeof createPhysicsScene).toBe("function");
    expect(G3D_THREEJS_EXAMPLE_PARITY_TARGETS.keyframes).toBe("webgl_animation_keyframes");
    expect(G3D_THREEJS_EXAMPLE_PARITY_TARGETS.skinningIk).toBe("webgl_animation_skinning_ik");
  });

  it("keeps the G3D V6 SDK entrypoint independent from Three.js runtime imports", () => {
    const source = readFileSync(resolve("packages/engine/src/v6/index.ts"), "utf8");

    expect(source).not.toMatch(/from\s+["']three(?:\/[^"']*)?["']/);
    expect(source).not.toMatch(/from\s+["']@galileo3d\/three-compat(?:\/[^"']*)?["']/);
    expect(source).not.toMatch(/from\s+["'][^"']*three-compat[^"']*["']/);
    expect(source).not.toMatch(/\bTHREE\./);
  });

  it("keeps product controls independent from Three.js compatibility runtime", () => {
    const controlsPackage = readFileSync(resolve("packages/controls/package.json"), "utf8");
    const controlsSources = [
      "packages/controls/src/ControlState.ts",
      "packages/controls/src/DragControls.ts",
      "packages/controls/src/Picking.ts",
      "packages/controls/src/SelectionManager.ts",
      "packages/controls/src/TransformControls.ts",
      "packages/controls/src/NativeControlTypes.ts",
      "packages/controls/src/index.ts"
    ].map((file) => readFileSync(resolve(file), "utf8")).join("\n");

    expect(controlsPackage).not.toContain("@galileo3d/three-compat");
    expect(controlsSources).not.toMatch(/three-compat/);
    expect(controlsSources).not.toMatch(/Vector3Compat|Object3DCompat|RaycasterCompat/);
  });

  it("exposes WebGPU as a public async production SDK backend instead of a report-only claim", () => {
    const source = readFileSync(resolve("packages/engine/src/v6/index.ts"), "utf8");
    const rendererSource = readFileSync(resolve("packages/rendering/src/v6/RendererV6.ts"), "utf8");

    expect(source).toContain("resolveRendererV6Backend(options)");
    expect(source).toContain("readonly backendSelection");
    expect(source).toContain("renderFrame(input: G3DRenderOptions)");
    expect(source).toContain("renderFrameAsync(input: G3DRenderOptions)");
    expect(source).toContain("async renderAsync(input: G3DRenderOptions)");
    expect(source).toContain("renderFrame(");
    expect(source).toContain("renderImportedAssetAsync");
    expect(rendererSource).toContain("readBrowserWebGPU()");
    expect(rendererSource).toContain('options.backend ?? (hasWebGPU ? "auto" : "webgl2")');
    expect(rendererSource).toContain("backend='auto' selected WebGPU because a WebGPU runtime object was provided.");
    expect(rendererSource).toContain("backend='auto' selected WebGPU because navigator.gpu is available in the current browser runtime.");
    expect(source).not.toContain("WebGPU as explicit coverage data only");
    expect(source).not.toContain("production rendering currently requires backend='webgl2'");
  });

  it("creates native orbit controls with stable snapshots", () => {
    const controls = createOrbitControls({
      target: [1, 2, 3],
      position: [0, 0, 8]
    });

    expect(controls.snapshot()).toEqual({
      target: [1, 2, 3],
      position: [0, 0, 8],
      rotation: [0, 0],
      zoom: 1,
      enabled: true
    });

    expect(controls.rotate(0.25, -0.5).rotation).toEqual([-0.5, 0.25]);
    expect(controls.pan(2, -1).target).toEqual([3, 1, 3]);
    expect(controls.dolly(0.5).position).toEqual([0, 0, 4]);
    expect(controls.reset()).toEqual({
      target: [1, 2, 3],
      position: [0, 0, 8],
      rotation: [0, 0],
      zoom: 1,
      enabled: true
    });
  });

  it("exposes native non-Three navigation controls for common app camera workflows", () => {
    const firstPerson = createFirstPersonControls({
      position: [0, 1, 5],
      rotation: [0, 0, 0],
      movementSpeed: 2
    });
    expect(firstPerson.moveForward(1).position).toEqual([0, 1, 3]);
    expect(firstPerson.strafe(0.5).position).toEqual([1, 1, 3]);
    expect(firstPerson.look(0.2, -0.1).rotation).toEqual([-0.1, 0.2, 0]);

    const map = createMapControls({ target: [0, 0, 0] });
    expect(map.truck(2, -3).target).toEqual([2, 0, -3]);
    expect(map.pan(1, 1).target).toEqual([3, 1, -3]);

    const trackball = createTrackballControls();
    expect(trackball.rotate(0.3, 0.1).rotation).toEqual([0.1, 0.3]);
    expect(trackball.roll(0.25).rotation).toEqual([0.1, 0.55]);
    expect(trackball.reset().rotation).toEqual([0, 0]);

    const pointerLock = createPointerLockControls();
    expect(pointerLock.look(1, 1).rotation).toEqual([0, 0, 0]);
    expect(pointerLock.lock().locked).toBe(true);
    expect(pointerLock.look(0.4, -0.2).rotation).toEqual([-0.2, 0.4, 0]);
    expect(pointerLock.unlock().locked).toBe(false);
  });

  it("exposes native scene composition helpers for lights, stage, camera, and render options", () => {
    const bounds = {
      min: [-1, -0.5, -0.25] as const,
      max: [1, 1.5, 0.25] as const
    };
    const viewport = { width: 1280, height: 720 };
    const key = createDirectionalLight({
      name: "sdk-key",
      direction: [0, -4, 0],
      color: [1, 0.95, 0.88],
      intensity: 2.4,
      castsShadow: true
    });
    expect(key.kind).toBe("directional");
    expect(key.direction).toEqual([0, -1, 0]);
    expect(key.castsShadow).toBe(true);
    expect(key.source.name).toBe("sdk-key");

    const lights = createStudioLighting({ preset: "product", shadows: true });
    expect(lights).toHaveLength(3);
    expect(lights.some((light) => light.castsShadow)).toBe(true);

    const stage = createGroundedStage(bounds, { labelPrefix: "sdk-stage" });
    expect(stage.floorY).toBeLessThan(bounds.min[1]);
    expect(stage.groundingItems.length).toBeGreaterThanOrEqual(2);
    expect(stage.backgroundItems).toHaveLength(1);
    expect(stage.diagnostics.contactShadow?.mode).toBe("directional-multi-lobe-receiver-contact");
    expect(stage.renderItems({ shadows: false, backgroundVisible: true })).toHaveLength(1);

    const camera = createCameraFrame({
      bounds,
      viewport,
      preset: "product-hero",
      yawRadians: 0.1,
      pitchRadians: -0.05,
      zoom: 1.15
    });
    expect(camera.diagnostics.preset).toBe("product-hero");
    expect(camera.diagnostics.cameraPosition).toHaveLength(3);
    expect(camera.camera.viewProjectionMatrix).toHaveLength(16);

    const renderOptions = createProductionRenderOptions({
      scene: { metadata: { assetId: "sdk-scene" } } as unknown as Parameters<typeof createProductionRenderOptions>[0]["scene"],
      viewport,
      stage,
      lights,
      camera: camera.camera,
      shadows: false,
      postprocess: false
    });
    expect(renderOptions.scene.metadata.assetId).toBe("sdk-scene");
    expect(renderOptions.collectedLights).toBe(lights);
    expect(renderOptions.renderItems).toHaveLength(1);
    expect(renderOptions.shadow).toBe(false);
    expect(renderOptions.postprocess).toBe(false);

    stage.dispose();
  });

  it("exposes native animation and physics SDK helpers for the V7 example parity ladder", () => {
    const target = {
      position: [0, 0, 0] as [number, number, number],
      values: new Map<string, unknown>(),
      setAnimationValue(path: string, value: unknown) {
        this.values.set(path, value);
      }
    };
    const idle = new AnimationClip({
      name: "idle",
      duration: 1,
      tracks: [new AnimationTrack({
        target: "root.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 1, value: [0.05, 0, 0] }
        ]
      })]
    });
    const walk = new AnimationClip({
      name: "walk",
      duration: 1,
      tracks: [new AnimationTrack({
        target: "root.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 1, value: [0.7, 0, 0] }
        ]
      })]
    });
    const upperBodyAdditive = new AnimationClip({
      name: "upper-body-additive",
      duration: 1,
      tracks: [new AnimationTrack({
        target: "spine.rotation",
        valueType: "quaternion",
        keyframes: [
          { time: 0, value: [0, 0, 0, 1] },
          { time: 1, value: [0.08, 0, 0, 0.9968] }
        ]
      })]
    });

    const animation = createAnimationController({
      target,
      clips: [idle, walk, upperBodyAdditive],
      applyRootMotion: true,
      rootMotionTrack: "root.position"
    });
    const idleAction = animation.play("idle");
    animation.play("walk", { weight: 0, layer: "locomotion" });
    animation.play("upper-body-additive", { weight: 0.45, layer: "upper-body", additive: true, mask: ["spine"] });
    animation.crossFade(idleAction, "walk", 0.2);
    for (let i = 0; i < 18; i += 1) animation.update(1 / 60);

    const animationSnapshot = animation.snapshot();
    expect(animationSnapshot.parityTargets.skinningBlending).toBe("webgl_animation_skinning_blending");
    expect(animationSnapshot.capabilities.keyframes).toBe(true);
    expect(animationSnapshot.capabilities.crossFade).toBe(true);
    expect(animationSnapshot.capabilities.additiveLayers).toBe(true);
    expect(animationSnapshot.capabilities.layerMasks).toBe(true);
    expect(animationSnapshot.capabilities.rootMotion).toBe(true);
    expect(animationSnapshot.capabilities.importedGltfAnimationRuntime).toBe(true);
    expect(animationSnapshot.crossFadeCount).toBe(1);
    expect(animationSnapshot.mixer.actionCount).toBe(3);
    expect(target.position[0]).toBeGreaterThan(0.01);
    animation.dispose();

    const physics = createPhysicsScene({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, solverIterations: 4 });
    physics.createGroundPlane(0);
    const anchor = physics.createBody({ type: "static", position: [0, 1.25, 0], shape: { kind: "sphere", radius: 0.08 }, sensor: true });
    const link = physics.createBody({ position: [0, 0.72, 0], mass: 0.75, shape: { kind: "sphere", radius: 0.16 } });
    const box = physics.createBody({ position: [0.12, 0.42, 0], velocity: [0, -0.3, 0], mass: 1, shape: { kind: "box", halfExtents: [0.18, 0.18, 0.18] } });
    physics.addConstraint({ type: "spring", bodyA: anchor, bodyB: link, restLength: 0.42, stiffness: 0.65 });
    box.applyImpulse([0.1, -0.2, 0]);
    physics.step({ steps: 120 });

    const physicsSnapshot = physics.snapshot();
    expect(physicsSnapshot.parityTargets.walkCycle).toBe("webgl_animation_walk");
    expect(physicsSnapshot.capabilities.dynamicRigidBodies).toBe(true);
    expect(physicsSnapshot.capabilities.constraints).toBe(true);
    expect(physicsSnapshot.capabilities.contacts).toBe(true);
    expect(physicsSnapshot.capabilities.raycast).toBe(true);
    expect(physicsSnapshot.capabilities.sphereCast).toBe(true);
    expect(physicsSnapshot.world.stats.bodies).toBe(4);
    expect(physicsSnapshot.world.stats.constraints).toBe(1);
    expect(physicsSnapshot.world.stats.steps).toBe(120);
    expect(physicsSnapshot.world.stats.contacts).toBeGreaterThan(0);
    expect(physics.raycast([0, 2, 0], [0, -1, 0], 3)?.bodyId).toBeGreaterThan(0);
    expect(physics.sphereCast([-0.5, 1.4, 0], 0.08, [1, -1, 0], 3)?.bodyId).toBeGreaterThan(0);
  });


  it("wires the flagship product configurator to the public V6 SDK", () => {
    const appFiles = [
      "apps/v6-product-configurator/src/main.ts",
      "apps/v6-product-configurator/src/assets.ts",
      "apps/v6-product-configurator/src/scene.ts",
      "apps/v6-product-configurator/src/ui.ts"
    ];
    const sources = appFiles.map((file) => readFileSync(resolve(file), "utf8")).join("\n");
    const main = readFileSync(resolve("apps/v6-product-configurator/src/main.ts"), "utf8");

    expect(main).toContain("@galileo3d/engine/v6");
    expect(main).toContain("loadGltfScene");
    expect(main).toContain("loadHdrEnvironment");
    expect(main).toContain("createProductViewer");
    expect(sources).not.toContain("v6-common/src/runtime");
    expect(sources).not.toMatch(/from\s+["']three(?:\/[^"']*)?["']/);
    expect(sources).not.toMatch(/from\s+["']@galileo3d\/three-compat(?:\/[^"']*)?["']/);
  });

  it("exposes GLTF scene and material variant selection through loadGltfScene", () => {
    const engineSource = readFileSync(resolve("packages/engine/src/v6/index.ts"), "utf8");
    const pipelineSource = readFileSync(resolve("packages/assets/src/v6/V6GLTFRenderPipeline.ts"), "utf8");

    expect(engineSource).toContain("readonly materialVariant?: string");
    expect(engineSource).toContain("readonly sceneIndex?: number");
    expect(engineSource).toContain("readonly sceneName?: string");
    expect(pipelineSource).toContain("materialVariant");
    expect(pipelineSource).toContain("sceneIndex");
    expect(pipelineSource).toContain("sceneName");
  });

  it("surfaces unsupported glTF feature metadata through the public SDK assets helper", () => {
    const metadata = assetsV6.createV6GLTFRenderMetadata({
      url: "memory://unsupported-extension.glb",
      loaderDiagnostics: {
        schemaVersion: "gltf-loader-diagnostics-v1",
        features: ["gltf", "pbr"],
        extensionsUsed: ["VENDOR_magic_surface", "KHR_materials_transmission"],
        extensionsRequired: [],
        unsupportedExtensions: ["VENDOR_magic_surface"],
        unsupportedFeatures: [],
        meshCount: 1,
        primitiveCount: 1,
        vertexCount: 3,
        indexCount: 3,
        materialCount: 1,
        textureCount: 0,
        imageCount: 0,
        animationCount: 0,
        skinCount: 0,
        morphTargetCount: 0,
        materialFeatures: ["metallic"],
        textureSlots: [],
        compression: { draco: false, meshopt: false, ktx2Basis: false }
      },
      materials: [{
        name: "glass",
        unlit: false,
        transmission: { transmissionFactor: 0.5 }
      }],
      meshes: []
    } as unknown as Parameters<typeof assetsV6.createV6GLTFRenderMetadata>[0], "unsupported-extension", "Unsupported Extension");

    expect(metadata.extensionsUsed).toContain("VENDOR_magic_surface");
    expect(metadata.unsupportedExtensions).toEqual(["VENDOR_magic_surface"]);
    expect(metadata.materialExtensionCoverage).toContain("KHR_materials_transmission");
    expect(metadata.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
      "unsupported-gltf-extension",
      "bounded-material-extension"
    ]));
  });

  it("loads a real HDR environment through the SDK without browser fetch", async () => {
    const url = "fixtures/v5/environments/hdri/studio_small_08_1k.hdr";
    const environment = await loadHdrEnvironment({
      id: "studio-small-08",
      label: "Studio Small 08",
      url,
      data: readFileSync(resolve(url)),
      intensity: 1.2,
      backgroundIntensity: 0.9,
      rotation: 0.15,
      toneMapping: { operator: "aces", exposure: 1.05, whitePoint: 1.25 }
    });

    expect(environment.id).toBe("studio-small-08");
    expect(environment.url).toBe(url);
    expect(environment.pipeline.diagnostics.realRadianceHdr).toBe(true);
    expect(environment.pipeline.diagnostics.specularPrefilter).toBe(true);
    expect(environment.pipeline.diagnostics.brdfLut).toBe(true);
    expect(environment.environmentLighting.environmentMapTexture).toBeDefined();
    expect(environment.environmentLighting.environmentBrdfLutTexture).toBeDefined();
    expect(environment.environmentLighting.environmentMapEncoding).toBe("linear");
    expect(environment.environmentLighting.environmentMapMipCount).toBeGreaterThanOrEqual(4);

    environment.dispose();
  });

  it("writes a bounded SDK replacement-readiness artifact instead of claiming broad Three.js ecosystem parity", () => {
    const engineSource = readFileSync(resolve("packages/engine/src/v6/index.ts"), "utf8");
    const flagshipSource = readFileSync(resolve("apps/v6-product-configurator/src/main.ts"), "utf8");
    const templateSource = readFileSync(resolve("templates/v6-product-viewer/src/main.ts"), "utf8");
    const controlsPackage = readFileSync(resolve("packages/controls/package.json"), "utf8");
    const controlsSources = [
      "packages/controls/src/ControlState.ts",
      "packages/controls/src/DragControls.ts",
      "packages/controls/src/Picking.ts",
      "packages/controls/src/SelectionManager.ts",
      "packages/controls/src/TransformControls.ts",
      "packages/controls/src/NativeControlTypes.ts",
      "packages/controls/src/index.ts"
    ].map((file) => readFileSync(resolve(file), "utf8")).join("\n");
    const externalConsumerReportPath = resolve("tests/reports/v6-external-consumer.json");
    const externalConsumer = existsSync(externalConsumerReportPath)
      ? JSON.parse(readFileSync(externalConsumerReportPath, "utf8")) as { readonly pass?: boolean }
      : undefined;
    const checks = [
      {
        id: "public-v6-entrypoint",
        pass: typeof G3DRenderer.create === "function"
          && typeof loadGltfScene === "function"
          && typeof loadHdrEnvironment === "function"
          && typeof createDirectionalLight === "function"
          && typeof createStudioLighting === "function"
          && typeof createGroundedStage === "function"
          && typeof createCameraFrame === "function"
          && typeof createProductionRenderOptions === "function"
          && typeof createFirstPersonControls === "function"
          && typeof createMapControls === "function"
          && typeof createTrackballControls === "function"
          && typeof createPointerLockControls === "function"
          && typeof createProductViewer === "function",
        evidence: "@galileo3d/engine/v6 exports renderer, GLTF, HDR, scene-composition, orbit/first-person/map/trackball/pointer-lock controls, and viewer APIs."
      },
      {
        id: "no-three-runtime-delegation",
        pass: !/from\s+["']three(?:\/[^"']*)?["']/.test(engineSource)
          && !/from\s+["']@galileo3d\/three-compat(?:\/[^"']*)?["']/.test(engineSource)
          && !/\bTHREE\./.test(engineSource),
        evidence: "packages/engine/src/v6/index.ts has no Three.js runtime import or THREE namespace use."
      },
      {
        id: "flagship-app-uses-public-sdk",
        pass: flagshipSource.includes("@galileo3d/engine/v6")
          && flagshipSource.includes("loadGltfScene")
          && flagshipSource.includes("loadHdrEnvironment")
          && flagshipSource.includes("createProductViewer"),
        evidence: "apps/v6-product-configurator/src/main.ts imports and uses public V6 SDK APIs."
      },
      {
        id: "template-uses-public-sdk",
        pass: templateSource.includes("@galileo3d/engine/v6")
          && templateSource.includes("loadGltfScene")
          && templateSource.includes("loadHdrEnvironment")
          && templateSource.includes("createProductViewer"),
        evidence: "templates/v6-product-viewer/src/main.ts uses public V6 SDK APIs."
      },
      {
        id: "native-controls-no-three-compat-runtime",
        pass: !controlsPackage.includes("@galileo3d/three-compat")
          && !/three-compat/.test(controlsSources)
          && !/Vector3Compat|Object3DCompat|RaycasterCompat/.test(controlsSources),
        evidence: "packages/controls/src uses native structural control types and package.json has no @galileo3d/three-compat dependency."
      },
      {
        id: "public-sdk-native-navigation-controls",
        pass: typeof createOrbitControls === "function"
          && typeof createFirstPersonControls === "function"
          && typeof createMapControls === "function"
          && typeof createTrackballControls === "function"
          && typeof createPointerLockControls === "function",
        evidence: "@galileo3d/engine/v6 exposes native camera/navigation control factories without Three.js runtime imports."
      },
      {
        id: "public-sdk-frame-render-api",
        pass: engineSource.includes("renderFrame(input: G3DRenderOptions)")
          && engineSource.includes("renderFrameAsync(input: G3DRenderOptions)")
          && readFileSync(resolve("packages/rendering/src/v6/RendererV6.ts"), "utf8").includes("renderFrame(input: V6RendererInput)"),
        evidence: "@galileo3d/engine/v6 exposes frame rendering APIs for real apps instead of forcing every render through screenshot proof/readback."
      },
      {
        id: "public-sdk-scene-composition-helpers",
        pass: typeof createDirectionalLight === "function"
          && typeof createStudioLighting === "function"
          && typeof createGroundedStage === "function"
          && typeof createCameraFrame === "function"
          && typeof createProductionRenderOptions === "function"
          && engineSource.includes("export function createProductionRenderOptions")
          && engineSource.includes("createGroundedStage(options.asset.resources.bounds"),
        evidence: "@galileo3d/engine/v6 exposes native light, stage, camera-frame, and production render-option helpers, and the flagship viewer uses the public grounded-stage helper."
      },
      {
        id: "external-consumer-render-proof",
        pass: externalConsumer?.pass === true,
        evidence: "tests/reports/v6-external-consumer.json"
      }
    ];
    const blockers = [
      "No broad Three.js ecosystem parity claim: controls, loaders, materials, postprocess, examples, migration docs, and production WebGPU are not proven as a complete replacement.",
      "No same-scene Three.js parity artifact proves the SDK as a broad replacement.",
      "WebGPU production SDK coverage is bounded to the async imported GLTF/HDR/PBR path until broader examples and parity gates prove the full ecosystem."
    ];
    const report = {
      schema: "g3d-v7-sdk-replacement-readiness/v1",
      generatedAt: new Date().toISOString(),
      productSurface: GALILEO3D_ENGINE_V6_PRODUCT_SURFACE,
      status: checks.every((check) => check.pass) ? "bounded-sdk-ready" : "blocked",
      broadThreeJsReplacement: false,
      checks,
      blockers
    };

    mkdirSync(resolve("tests/reports/v7"), { recursive: true });
    writeFileSync(resolve("tests/reports/v7/sdk-replacement-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);

    expect(report.status).toBe("bounded-sdk-ready");
    expect(report.broadThreeJsReplacement).toBe(false);
    expect(report.blockers.join(" ")).toMatch(/same-scene Three\.js parity/i);
  });
});
