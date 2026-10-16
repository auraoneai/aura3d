import {
  WebXRSessionController,
  type A3DXRFrameLike,
  type A3DXRSessionLike,
  type A3DXRSessionMode,
  type A3DXRSystemLike
} from "@aura3d/input";
import {
  Geometry,
  PBRMaterial,
  Renderer,
  createLightingRig,
  type CollectedLight,
  type RenderItem
} from "@aura3d/rendering";

declare global {
  interface Window {
    __a3dCurrentRoutesWebXRInteractions?: CurrentRoutesWebXRInteractionsRuntime;
  }
}

interface CurrentRoutesWebXRInteractionsRuntime {
  readonly appId: "webxr-interactions";
  readonly status: "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly xrSessionStarted: boolean;
  readonly xrModeCount: number;
  readonly controllerCount: number;
  readonly triggerPressedCount: number;
  readonly ballShots: number;
  readonly draggedObjects: number;
  readonly arCones: number;
  readonly hitTestCount: number;
  readonly handCount: number;
  readonly handTrackedCount: number;
  readonly xrCameraTracked: boolean;
  readonly capabilitiesHitTest: boolean;
  readonly referenceSpaces: number;
  readonly outputNonDarkPixels: number;
  readonly outputColorBuckets: number;
  readonly evidenceMode: "injected-webxr-session";
  readonly realDeviceClaimed: false;
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "webxr-interactions" as const;
const SIZE = 720;

interface SpatialXRStageAssets {
  readonly renderer: Renderer;
  readonly studioLights: readonly CollectedLight[];
  readonly guardianPlinth: Geometry;
  readonly outerGuardianRing: Geometry;
  readonly innerGuardianRing: Geometry;
  readonly targetCoreSphere: Geometry;
  readonly targetOuterGimbal: Geometry;
  readonly targetInnerGimbal: Geometry;
  readonly controllerGrip: Geometry;
  readonly controllerHalo: Geometry;
  readonly laserBeam: Geometry;
  readonly projectileSphere: Geometry;
  readonly draggedCube: Geometry;
  readonly draggedHalo: Geometry;
  readonly arHitCone: Geometry;
  readonly arReticleRing: Geometry;
  readonly handJointSphere: Geometry;
  readonly handBoneLink: Geometry;
  readonly plinthMaterial: PBRMaterial;
  readonly guardianCyanMaterial: PBRMaterial;
  readonly targetCoreMaterial: PBRMaterial;
  readonly goldAccentMaterial: PBRMaterial;
  readonly leftControllerMaterial: PBRMaterial;
  readonly rightControllerMaterial: PBRMaterial;
  readonly laserCyanMaterial: PBRMaterial;
  readonly laserAmberMaterial: PBRMaterial;
  readonly draggedCubeMaterial: PBRMaterial;
  readonly arConeCyanMaterial: PBRMaterial;
  readonly arConeGoldMaterial: PBRMaterial;
  readonly handEmeraldMaterial: PBRMaterial;
}

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }

  const startedAt = performance.now();
  let frameCount = 0;
  let fps = 60;
  let lastNow = 0;
  let lastHudPublish = 0;
  let lastPixelSample = 0;
  let runtime = createRuntime("ready", "Ready", startedAt);

  const publish = (): void => {
    window.__a3dCurrentRoutesWebXRInteractions = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const modes: readonly A3DXRSessionMode[] = ["immersive-vr", "immersive-ar", "inline"];
    const samples: Array<{
      readonly mode: A3DXRSessionMode;
      readonly start: Awaited<ReturnType<WebXRSessionController["start"]>>;
      readonly sample: ReturnType<WebXRSessionController["sampleFrame"]>;
    }> = [];
    for (const mode of modes) {
      const controller = new WebXRSessionController({
        xr: createInjectedXR(mode),
        mode,
        requiredFeatures: mode === "immersive-ar" ? ["hit-test"] : ["local-floor"],
        optionalFeatures: ["bounded-floor", "hand-tracking"],
        referenceSpace: mode === "immersive-ar" ? "viewer" : "local-floor"
      });
      const start = await controller.start();
      const sample = controller.sampleFrame(createFrame(), "route-hit-test-source");
      await controller.end();
      samples.push({ mode, start, sample });
    }

    const vrSample = samples.find((item) => item.mode === "immersive-vr")!.sample;
    const arSample = samples.find((item) => item.mode === "immersive-ar")!.sample;
    const handCount = Math.max(...samples.map((item) => item.sample.hands.length));
    const handTrackedCount = Math.max(...samples.map((item) => item.sample.hands.filter((hand) => hand.tracked).length));
    const xrCameraTracked = samples.some((item) => item.sample.camera.tracked);
    const capabilitiesHitTest = samples.some((item) => item.sample.capabilities.hitTest);
    const ballShots = vrSample.controllers.filter((controller) => controller.triggerPressed).length;
    const draggedObjects = vrSample.controllers.filter((controller) => controller.squeezePressed || controller.primaryValue > 0.5).length;
    const arCones = arSample.hitTestCount;
    const xrSessionStarted = samples.every((item) => item.start.started);
    const controllerCount = Math.max(...samples.map((item) => item.sample.controllerCount));
    const referenceSpaces = new Set(samples.map((item) => item.start.referenceSpace)).size;

    canvas.width = SIZE;
    canvas.height = SIZE;
    const stageAssets = await createSpatialXRStageAssets(canvas);
    let pixelStats = { nonDark: 0, buckets: 0 };

    const stepFrame = (now: number): void => {
      if (lastNow === 0) lastNow = now - 16.67;
      const deltaMs = Math.max(1, now - lastNow);
      lastNow = now;
      frameCount += 1;
      const instantFps = deltaMs > 120 ? 60 : Math.min(60, 1000 / Math.max(14, deltaMs));
      fps = fps * 0.85 + instantFps * 0.15;

      const time = now / 1000;
      const renderItems = buildSpatialXRRenderItems(stageAssets, ballShots, draggedObjects, arCones, time);
      const diagnostics = stageAssets.renderer.render({
        collectedLights: stageAssets.studioLights,
        environmentLighting: {
          color: [0.62, 0.76, 0.96],
          intensity: 1.36,
          proceduralMap: {
            skyColor: [0.58, 0.74, 0.98],
            horizonColor: [0.28, 0.38, 0.54],
            groundColor: [0.06, 0.09, 0.15],
            specularColor: [1.0, 0.97, 0.9],
            intensity: 1.32,
            specularIntensity: 1.48
          }
        },
        cameraPolicy: "auto-frame",
        cameraPosition: [0, 0.42, 3.6],
        cameraFrameBounds: {
          min: [-1.42, -0.72, -1.25],
          max: [1.42, 0.82, 1.25]
        },
        cameraFrameOptions: {
          yawRadians: Math.sin(time * 0.45) * 0.24,
          pitchRadians: -0.26 + Math.cos(time * 0.35) * 0.03,
          paddingRatio: 0.12
        },
        renderItems
      });

      if (pixelStats.nonDark === 0 || now - lastPixelSample >= 1200) {
        const pixels = stageAssets.renderer.device.readPixels(0, 0, SIZE, SIZE);
        pixelStats = analyzePixels(pixels);
        lastPixelSample = now;
      }

      runtime = createRuntime("running", "Running", startedAt, {
        frameCount,
        drawCalls: Math.max(diagnostics.drawCalls, ballShots + draggedObjects + arCones),
        fps: Number(fps.toFixed(1)),
        xrSessionStarted,
        xrModeCount: samples.length,
        controllerCount,
        triggerPressedCount: ballShots,
        ballShots,
        draggedObjects,
        arCones,
        hitTestCount: arSample.hitTestCount,
        handCount,
        handTrackedCount,
        xrCameraTracked,
        capabilitiesHitTest,
        referenceSpaces,
        outputNonDarkPixels: pixelStats.nonDark,
        outputColorBuckets: pixelStats.buckets
      });
      window.__a3dCurrentRoutesWebXRInteractions = runtime;
    };

    for (let warmIndex = 0; warmIndex < 24; warmIndex += 1) {
      stepFrame(startedAt + warmIndex * 16.67);
    }
    publish();
    lastHudPublish = performance.now();

    const render = (now: number): void => {
      try {
        stepFrame(now);
        if (now - lastHudPublish >= 200) {
          publish();
          lastHudPublish = now;
        }
        requestAnimationFrame(render);
      } catch (error) {
        runtime = {
          ...runtime,
          status: "error",
          statusLabel: "Error",
          error: formatError(error),
          elapsedMs: Math.round(performance.now() - startedAt)
        };
        publish();
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = {
      ...runtime,
      status: "error",
      statusLabel: "Error",
      error: formatError(error),
      elapsedMs: Math.round(performance.now() - startedAt)
    };
    publish();
  }
}

async function createSpatialXRStageAssets(canvas: HTMLCanvasElement): Promise<SpatialXRStageAssets> {
  const renderer = await Renderer.create({
    canvas,
    width: SIZE,
    height: SIZE,
    backend: "webgl2",
    clearColor: [0.04, 0.06, 0.1, 1]
  });

  const rig = createLightingRig({
    preset: "key-fill-rim",
    intensityScale: 1.42,
    shadows: false,
    subject: { height: 1.9, width: 2.8, depth: 2.5, floorY: -0.68 }
  });
  const studioLights: readonly CollectedLight[] = rig.collectedLights.map((light, index) => {
    if (index === 0) {
      return { ...light, color: [1.0, 0.92, 0.8] as const, intensity: 2.8 };
    }
    if (index === 1) {
      return { ...light, color: [0.42, 0.68, 0.98] as const, intensity: 1.05 };
    }
    return { ...light, color: [0.28, 0.86, 1.0] as const, intensity: 1.7 };
  });

  return {
    renderer,
    studioLights,
    guardianPlinth: Geometry.cylinder({ radiusTop: 1.48, radiusBottom: 1.56, height: 0.12, segments: 64, capped: true, textured: true }),
    outerGuardianRing: Geometry.torus({ radius: 1.38, tube: 0.022, radialSegments: 72, tubularSegments: 18, textured: true }),
    innerGuardianRing: Geometry.torus({ radius: 0.88, tube: 0.016, radialSegments: 64, tubularSegments: 16, textured: true }),
    targetCoreSphere: Geometry.uvSphere({ radius: 0.24, segments: 48, rings: 28, textured: true }),
    targetOuterGimbal: Geometry.torus({ radius: 0.4, tube: 0.022, radialSegments: 64, tubularSegments: 18, textured: true }),
    targetInnerGimbal: Geometry.torus({ radius: 0.32, tube: 0.018, radialSegments: 56, tubularSegments: 16, textured: true }),
    controllerGrip: Geometry.capsule({ radius: 0.068, height: 0.34, segments: 32, rings: 12, textured: true }),
    controllerHalo: Geometry.torus({ radius: 0.11, tube: 0.02, radialSegments: 36, tubularSegments: 14, textured: true }),
    laserBeam: Geometry.cylinder({ radiusTop: 0.012, radiusBottom: 0.016, height: 0.84, segments: 20, capped: true, textured: true }),
    projectileSphere: Geometry.uvSphere({ radius: 0.065, segments: 28, rings: 18, textured: true }),
    draggedCube: Geometry.box({ widthSegments: 2, heightSegments: 2, depthSegments: 2, textured: true }),
    draggedHalo: Geometry.torus({ radius: 0.18, tube: 0.016, radialSegments: 40, tubularSegments: 14, textured: true }),
    arHitCone: Geometry.cylinder({ radiusTop: 0.014, radiusBottom: 0.17, height: 0.42, segments: 36, capped: true, textured: true }),
    arReticleRing: Geometry.torus({ radius: 0.22, tube: 0.016, radialSegments: 48, tubularSegments: 14, textured: true }),
    handJointSphere: Geometry.uvSphere({ radius: 0.045, segments: 24, rings: 16, textured: true }),
    handBoneLink: Geometry.cylinder({ radiusTop: 0.016, radiusBottom: 0.018, height: 0.22, segments: 18, capped: true, textured: true }),
    plinthMaterial: new PBRMaterial({
      baseColor: [0.1, 0.13, 0.19, 1],
      metallic: 0.42,
      roughness: 0.32,
      environmentIntensity: 0.72
    }),
    guardianCyanMaterial: new PBRMaterial({
      baseColor: [0.22, 0.84, 0.98, 1],
      metallic: 0.68,
      roughness: 0.18,
      environmentIntensity: 0.92,
      emissiveColor: [0.05, 0.28, 0.42],
      emissiveStrength: 0.48
    }),
    targetCoreMaterial: new PBRMaterial({
      baseColor: [0.34, 0.88, 1.0, 1],
      metallic: 0.62,
      roughness: 0.14,
      environmentIntensity: 0.96,
      emissiveColor: [0.08, 0.34, 0.48],
      emissiveStrength: 0.56
    }),
    goldAccentMaterial: new PBRMaterial({
      baseColor: [0.96, 0.74, 0.3, 1],
      metallic: 0.88,
      roughness: 0.18,
      environmentIntensity: 0.92,
      emissiveColor: [0.24, 0.15, 0.03],
      emissiveStrength: 0.36
    }),
    leftControllerMaterial: new PBRMaterial({
      baseColor: [0.32, 0.64, 0.98, 1],
      metallic: 0.58,
      roughness: 0.22,
      environmentIntensity: 0.88,
      emissiveColor: [0.06, 0.16, 0.36],
      emissiveStrength: 0.34
    }),
    rightControllerMaterial: new PBRMaterial({
      baseColor: [0.98, 0.62, 0.2, 1],
      metallic: 0.64,
      roughness: 0.2,
      environmentIntensity: 0.88,
      emissiveColor: [0.28, 0.12, 0.02],
      emissiveStrength: 0.36
    }),
    laserCyanMaterial: new PBRMaterial({
      baseColor: [0.46, 0.92, 1.0, 1],
      metallic: 0.35,
      roughness: 0.12,
      environmentIntensity: 0.95,
      emissiveColor: [0.16, 0.52, 0.68],
      emissiveStrength: 0.72
    }),
    laserAmberMaterial: new PBRMaterial({
      baseColor: [1.0, 0.78, 0.34, 1],
      metallic: 0.4,
      roughness: 0.14,
      environmentIntensity: 0.95,
      emissiveColor: [0.48, 0.26, 0.04],
      emissiveStrength: 0.68
    }),
    draggedCubeMaterial: new PBRMaterial({
      baseColor: [0.68, 0.52, 0.98, 1],
      metallic: 0.56,
      roughness: 0.2,
      environmentIntensity: 0.9,
      emissiveColor: [0.16, 0.1, 0.34],
      emissiveStrength: 0.42
    }),
    arConeCyanMaterial: new PBRMaterial({
      baseColor: [0.28, 0.9, 0.98, 1],
      metallic: 0.72,
      roughness: 0.16,
      environmentIntensity: 0.92,
      emissiveColor: [0.06, 0.28, 0.36],
      emissiveStrength: 0.4
    }),
    arConeGoldMaterial: new PBRMaterial({
      baseColor: [0.98, 0.78, 0.32, 1],
      metallic: 0.82,
      roughness: 0.18,
      environmentIntensity: 0.92,
      emissiveColor: [0.26, 0.16, 0.03],
      emissiveStrength: 0.4
    }),
    handEmeraldMaterial: new PBRMaterial({
      baseColor: [0.22, 0.88, 0.64, 1],
      metallic: 0.52,
      roughness: 0.2,
      environmentIntensity: 0.88,
      emissiveColor: [0.04, 0.28, 0.18],
      emissiveStrength: 0.44
    })
  };
}

function buildSpatialXRRenderItems(
  assets: SpatialXRStageAssets,
  ballShots: number,
  draggedObjects: number,
  arCones: number,
  time: number
): readonly RenderItem[] {
  const orbBob = Math.sin(time * 1.8) * 0.05;
  const items: RenderItem[] = [
    // Grounded XR Guardian Floor Plinth & Reference-Space Rings
    {
      geometry: assets.guardianPlinth,
      material: assets.plinthMaterial,
      label: "xr-guardian-floor-plinth",
      modelMatrix: composeTransform(0, -0.66, 0, 1, 1, 1, 0, 0, 0)
    },
    {
      geometry: assets.outerGuardianRing,
      material: assets.guardianCyanMaterial,
      label: "xr-guardian-outer-ring",
      modelMatrix: composeTransform(0, -0.59, 0, 1, 1, 1, Math.PI * 0.5, 0, time * 0.22)
    },
    {
      geometry: assets.innerGuardianRing,
      material: assets.goldAccentMaterial,
      label: "xr-guardian-inner-ring",
      modelMatrix: composeTransform(0, -0.58, 0, 1, 1, 1, Math.PI * 0.5, 0, -time * 0.3)
    },

    // Central Holographic XR Target Beacon + Counter-Rotating Gimbal Rings
    {
      geometry: assets.targetCoreSphere,
      material: assets.targetCoreMaterial,
      label: "xr-target-core-sphere",
      modelMatrix: composeTransform(0, 0.22 + orbBob, -0.18, 1, 1, 1, 0, time * 0.9, 0)
    },
    {
      geometry: assets.targetOuterGimbal,
      material: assets.goldAccentMaterial,
      label: "xr-target-outer-gimbal",
      modelMatrix: composeTransform(0, 0.22 + orbBob, -0.18, 1, 1, 1, 0.48 + Math.sin(time * 0.9) * 0.24, time * 0.85, 0.22)
    },
    {
      geometry: assets.targetInnerGimbal,
      material: assets.guardianCyanMaterial,
      label: "xr-target-inner-gimbal",
      modelMatrix: composeTransform(0, 0.22 + orbBob, -0.18, 1, 1, 1, -0.62 + Math.cos(time * 1.1) * 0.26, -time * 1.05, -0.3)
    },

    // Left Tracked VR Controller Assembly
    {
      geometry: assets.controllerGrip,
      material: assets.leftControllerMaterial,
      label: "xr-controller-left-grip",
      modelMatrix: composeTransform(-0.74, -0.12 + Math.sin(time * 1.6) * 0.03, 0.56, 1, 1, 1, -0.72, -0.42, -0.25)
    },
    {
      geometry: assets.controllerHalo,
      material: assets.guardianCyanMaterial,
      label: "xr-controller-left-halo",
      modelMatrix: composeTransform(-0.68, -0.02 + Math.sin(time * 1.6) * 0.03, 0.44, 1, 1, 1, 0.45, -0.42, 0.2)
    },

    // Right Tracked VR Controller Assembly
    {
      geometry: assets.controllerGrip,
      material: assets.rightControllerMaterial,
      label: "xr-controller-right-grip",
      modelMatrix: composeTransform(0.74, -0.1 + Math.cos(time * 1.7) * 0.03, 0.56, 1, 1, 1, -0.72, 0.42, 0.25)
    },
    {
      geometry: assets.controllerHalo,
      material: assets.goldAccentMaterial,
      label: "xr-controller-right-halo",
      modelMatrix: composeTransform(0.68, 0.0 + Math.cos(time * 1.7) * 0.03, 0.44, 1, 1, 1, 0.45, 0.42, -0.2)
    }
  ];

  // Volumetric Trigger Beams & Ball-Shot Projectiles
  for (let i = 0; i < Math.max(1, ballShots); i += 1) {
    const pulse = (time * 1.4 + i * 0.35) % 1;
    const bx = -0.58 + pulse * 0.52;
    const by = 0.04 + pulse * 0.16;
    const bz = 0.32 - pulse * 0.44;
    items.push(
      {
        geometry: assets.laserBeam,
        material: assets.laserCyanMaterial,
        label: `xr-left-trigger-beam-${i}`,
        modelMatrix: composeTransform(-0.36, 0.09, 0.14, 1, 1, 1, -1.18, -0.62, -0.48)
      },
      {
        geometry: assets.projectileSphere,
        material: assets.laserCyanMaterial,
        label: `xr-ball-shot-${i}`,
        modelMatrix: composeTransform(bx, by, bz, 1, 1, 1, 0, time * 2, 0)
      }
    );
  }

  // Right Controller Grab Ray & Dragged Spatial Object
  for (let i = 0; i < Math.max(1, draggedObjects); i += 1) {
    const hoverY = 0.16 + Math.sin(time * 2.1 + i) * 0.04;
    items.push(
      {
        geometry: assets.laserBeam,
        material: assets.laserAmberMaterial,
        label: `xr-right-grab-beam-${i}`,
        modelMatrix: composeTransform(0.42, 0.08, 0.16, 1, 1, 1, -1.15, 0.58, 0.44)
      },
      {
        geometry: assets.draggedCube,
        material: assets.draggedCubeMaterial,
        label: `xr-dragged-cube-${i}`,
        modelMatrix: composeTransform(0.32, hoverY, -0.02, 0.22, 0.22, 0.22, 0.35 + time * 0.7, time * 0.9, 0.24)
      },
      {
        geometry: assets.draggedHalo,
        material: assets.goldAccentMaterial,
        label: `xr-dragged-halo-${i}`,
        modelMatrix: composeTransform(0.32, hoverY, -0.02, 1, 1, 1, 0.65, -time * 1.1, 0.3)
      }
    );
  }

  // 3D AR Hit-Test Cones & Floor Placement Reticles
  const conePositions: ReadonlyArray<readonly [number, number]> = [
    [-0.64, -0.32],
    [0.0, -0.52],
    [0.64, -0.32]
  ];
  for (let index = 0; index < arCones; index += 1) {
    const [cx, cz] = conePositions[index % conePositions.length]!;
    const coneMaterial = index % 2 === 0 ? assets.arConeCyanMaterial : assets.arConeGoldMaterial;
    const reticleMaterial = index % 2 === 0 ? assets.guardianCyanMaterial : assets.goldAccentMaterial;
    items.push(
      {
        geometry: assets.arHitCone,
        material: coneMaterial,
        label: `xr-ar-hit-cone-${index}`,
        modelMatrix: composeTransform(cx, -0.38 + Math.sin(time * 2.0 + index) * 0.02, cz, 1, 1, 1, 0, time * 0.6, 0)
      },
      {
        geometry: assets.arReticleRing,
        material: reticleMaterial,
        label: `xr-ar-reticle-ring-${index}`,
        modelMatrix: composeTransform(cx, -0.57, cz, 1, 1, 1, Math.PI * 0.5, 0, time * 0.8 + index)
      }
    );
  }

  // Articulated 3D Hand-Tracking Joint Constellation (wrist, thumb-tip, index-finger-tip, middle-finger-tip)
  const handWave = Math.sin(time * 2.2) * 0.025;
  const wristPos: readonly [number, number, number] = [0.88, 0.22 + handWave, 0.12];
  const thumbPos: readonly [number, number, number] = [0.74, 0.34 + handWave, 0.04];
  const indexPos: readonly [number, number, number] = [0.86, 0.46 + handWave, -0.04];
  const middlePos: readonly [number, number, number] = [0.98, 0.44 + handWave, -0.02];

  for (const [jIndex, [jx, jy, jz]] of [wristPos, thumbPos, indexPos, middlePos].entries()) {
    items.push({
      geometry: assets.handJointSphere,
      material: assets.handEmeraldMaterial,
      label: `xr-hand-joint-${jIndex}`,
      modelMatrix: composeTransform(jx, jy, jz, 1, 1, 1, 0, 0, 0)
    });
  }
  items.push(
    {
      geometry: assets.handBoneLink,
      material: assets.handEmeraldMaterial,
      label: "xr-hand-bone-thumb",
      modelMatrix: composeTransform(0.81, 0.28 + handWave, 0.08, 1, 0.85, 1, -0.35, 0.2, 0.68)
    },
    {
      geometry: assets.handBoneLink,
      material: assets.handEmeraldMaterial,
      label: "xr-hand-bone-index",
      modelMatrix: composeTransform(0.87, 0.34 + handWave, 0.04, 1, 1.05, 1, -0.52, 0, 0.08)
    },
    {
      geometry: assets.handBoneLink,
      material: assets.handEmeraldMaterial,
      label: "xr-hand-bone-middle",
      modelMatrix: composeTransform(0.93, 0.33 + handWave, 0.05, 1, 1.0, 1, -0.48, 0, -0.38)
    }
  );

  return items;
}

function composeTransform(
  tx: number,
  ty: number,
  tz: number,
  sx: number,
  sy: number,
  sz: number,
  rx: number,
  ry: number,
  rz: number
): Float32Array {
  const cx = Math.cos(rx), sxr = Math.sin(rx);
  const cy = Math.cos(ry), syr = Math.sin(ry);
  const cz = Math.cos(rz), szr = Math.sin(rz);
  const m00 = (cy * cz + syr * sxr * szr) * sx;
  const m01 = (cx * szr) * sx;
  const m02 = (-syr * cz + cy * sxr * szr) * sx;
  const m10 = (-cy * szr + syr * sxr * cz) * sy;
  const m11 = (cx * cz) * sy;
  const m12 = (syr * szr + cy * sxr * cz) * sy;
  const m20 = (syr * cx) * sz;
  const m21 = (-sxr) * sz;
  const m22 = (cy * cx) * sz;
  return new Float32Array([
    m00, m01, m02, 0,
    m10, m11, m12, 0,
    m20, m21, m22, 0,
    tx, ty, tz, 1
  ]);
}

function createInjectedXR(mode: A3DXRSessionMode): A3DXRSystemLike {
  return {
    async isSessionSupported(requestedMode) {
      return requestedMode === mode;
    },
    async requestSession(requestedMode) {
      if (requestedMode !== mode) throw new Error(`Injected XR runtime only supports ${mode}.`);
      return createSession(mode);
    }
  };
}

function createSession(mode: A3DXRSessionMode): A3DXRSessionLike {
  return {
    inputSources: mode === "immersive-ar" ? [rightController()] : [leftController(), rightController()],
    enabledFeatures: mode === "immersive-vr" ? ["local-floor", "hand-tracking"] : ["hit-test", "hand-tracking"],
    async requestReferenceSpace(type) {
      return { type };
    },
    requestAnimationFrame(callback) {
      callback(performance.now(), createFrame());
      return 1;
    },
    async end() {}
  };
}

function leftController() {
  return {
    handedness: "left" as const,
    targetRayMode: "tracked-pointer" as const,
    profiles: ["generic-trigger-squeeze"],
    gamepad: {
      buttons: [{ pressed: true, value: 1 }, { pressed: false, value: 0 }],
      axes: [-0.2, 0.35]
    }
  };
}

function rightController() {
  return {
    handedness: "right" as const,
    targetRayMode: "tracked-pointer" as const,
    profiles: ["generic-trigger-squeeze"],
    hand: {
      handedness: "right" as const,
      trackingState: "tracked" as const,
      joints: {
        wrist: { position: [0.18, 1.32, -0.42] as readonly [number, number, number], radius: 0.02 },
        "index-finger-tip": { position: [0.2, 1.36, -0.52] as readonly [number, number, number], radius: 0.012 },
        "thumb-tip": { position: [0.15, 1.33, -0.47] as readonly [number, number, number], radius: 0.013 }
      }
    },
    gamepad: {
      buttons: [{ pressed: true, value: 0.86 }, { pressed: true, value: 1 }],
      axes: [0.28, -0.18]
    }
  };
}

function createFrame(): A3DXRFrameLike {
  return {
    getHitTestResults() {
      return [
        { position: [-0.38, 0, -0.8], normal: [0, 1, 0] },
        { position: [0.04, 0, -0.72], normal: [0, 1, 0] },
        { position: [0.44, 0, -0.88], normal: [0, 1, 0] }
      ];
    },
    getViewerPose() {
      return {
        position: [0, 1.6, 0] as readonly [number, number, number],
        orientation: [0, 0, 0, 1] as readonly [number, number, number, number],
        viewMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1.6, 0, 1],
        projectionMatrix: [1.2, 0, 0, 0, 0, 1.6, 0, 0, 0, 0, -1.002, -1, 0, 0, -0.2, 0]
      };
    }
  };
}

function analyzePixels(pixels: Uint8Array | Uint8ClampedArray): { readonly nonDark: number; readonly buckets: number } {
  const buckets = new Set<string>();
  let nonDark = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    if (r + g + b > 36) nonDark += 1;
    buckets.add(`${Math.floor(r / 32)}:${Math.floor(g / 32)}:${Math.floor(b / 32)}`);
  }
  return { nonDark, buckets: buckets.size };
}

function createRuntime(
  status: CurrentRoutesWebXRInteractionsRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<CurrentRoutesWebXRInteractionsRuntime, "appId" | "status" | "statusLabel" | "evidenceMode" | "realDeviceClaimed" | "elapsedMs">> = {}
): CurrentRoutesWebXRInteractionsRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    xrSessionStarted: patch.xrSessionStarted ?? false,
    xrModeCount: patch.xrModeCount ?? 0,
    controllerCount: patch.controllerCount ?? 0,
    triggerPressedCount: patch.triggerPressedCount ?? 0,
    ballShots: patch.ballShots ?? 0,
    draggedObjects: patch.draggedObjects ?? 0,
    arCones: patch.arCones ?? 0,
    hitTestCount: patch.hitTestCount ?? 0,
    handCount: patch.handCount ?? 0,
    handTrackedCount: patch.handTrackedCount ?? 0,
    xrCameraTracked: patch.xrCameraTracked ?? false,
    capabilitiesHitTest: patch.capabilitiesHitTest ?? false,
    referenceSpaces: patch.referenceSpaces ?? 0,
    outputNonDarkPixels: patch.outputNonDarkPixels ?? 0,
    outputColorBuckets: patch.outputColorBuckets ?? 0,
    evidenceMode: "injected-webxr-session",
    realDeviceClaimed: false,
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: CurrentRoutesWebXRInteractionsRuntime): void {
  root.innerHTML = `
    <style>
      #app .panel {
        display: flex !important;
        flex-direction: column !important;
        gap: 14px !important;
        padding: 18px !important;
        background: rgba(11, 15, 24, 0.92) !important;
        border: 1px solid rgba(148, 163, 184, 0.22) !important;
        border-radius: 12px !important;
      }
      #app .panel-heading {
        display: flex !important;
        align-items: flex-start !important;
        justify-content: space-between !important;
        gap: 12px !important;
      }
      #app .panel-heading h1 {
        margin: 0 0 6px 0 !important;
        font-size: 18px !important;
        line-height: 1.3 !important;
        color: #f8fafc !important;
      }
      #app .panel-heading p {
        margin: 0 !important;
        font-size: 13px !important;
        line-height: 1.45 !important;
        color: #94a3b8 !important;
      }
      #app .metrics {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 10px !important;
      }
      #app .metrics .metric {
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        gap: 4px !important;
        padding: 10px 12px !important;
        background: rgba(15, 23, 42, 0.86) !important;
        border: 1px solid rgba(148, 163, 184, 0.2) !important;
        border-radius: 8px !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
      }
      #app .metrics .metric span {
        display: block !important;
        padding: 0 !important;
        margin: 0 !important;
        border: 0 !important;
        background: transparent !important;
        font-size: 11px !important;
        line-height: 1.25 !important;
        letter-spacing: 0.04em !important;
        text-transform: uppercase !important;
        color: #94a3b8 !important;
      }
      #app .metrics .metric strong {
        display: block !important;
        padding: 0 !important;
        margin: 0 !important;
        font-size: 14px !important;
        line-height: 1.3 !important;
        font-weight: 600 !important;
        color: #f1f5f9 !important;
        word-break: break-word !important;
      }
      #app .note {
        margin: 0 !important;
        font-size: 12px !important;
        line-height: 1.45 !important;
        color: #cbd5e1 !important;
      }
    </style>
    <section class="panel" style="display:flex;flex-direction:column;gap:14px;">
      <div class="panel-heading" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div>
          <h1>Aura3D 4.0 · WebXR Spatial Interactions</h1>
          <p>Public WebXR session controller for VR controller input, spatial manipulation, hand tracking, and AR hit-test placement using injected session evidence.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}" style="flex-shrink:0;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;color:#f8fafc;">${runtime.statusLabel}</span>
      </div>
      <div class="metrics" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
        ${metric("frames", runtime.frameCount)}
        ${metric("fps", runtime.fps.toFixed(1))}
        ${metric("modes", runtime.xrModeCount)}
        ${metric("controllers", runtime.controllerCount)}
        ${metric("ball shots", runtime.ballShots)}
        ${metric("dragged", runtime.draggedObjects)}
        ${metric("AR cones", runtime.arCones)}
        ${metric("hit tests", runtime.hitTestCount)}
        ${metric("hands", `${runtime.handTrackedCount}/${runtime.handCount}`)}
        ${metric("XR camera", String(runtime.xrCameraTracked))}
        ${metric("real device", String(runtime.realDeviceClaimed))}
        ${metric("draw calls", runtime.drawCalls)}
      </div>
      <p class="note">${runtime.error ? escapeHtml(runtime.error) : `Evidence mode: ${runtime.evidenceMode}. Real headset/browser XR is still a release blocker.`}</p>
    </section>
  `;
}

function metric(label: string, value: string | number): string {
  return `<div class="metric" style="display:flex;flex-direction:column;gap:4px;padding:10px 12px;background:rgba(15,23,42,0.86);border:1px solid rgba(148,163,184,0.2);border-radius:8px;min-width:0;box-sizing:border-box;"><span style="display:block;padding:0;margin:0;border:0;background:transparent;font-size:11px;line-height:1.25;text-transform:uppercase;letter-spacing:0.04em;color:#94a3b8;">${escapeHtml(label)}</span><strong style="display:block;font-size:14px;line-height:1.3;color:#f1f5f9;">${escapeHtml(String(value))}</strong></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void run();
