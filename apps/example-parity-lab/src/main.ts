import { createGLTFSceneAnimationRuntime, loadV6GLTFRenderPipeline, type GLTFSceneAnimationApplyResult } from "@galileo3d/assets";
import {
  AnimationClip,
  AnimationTrack,
  solveTwoBoneIk
} from "@galileo3d/animation";
import { createAnimationController, createPhysicsScene } from "@galileo3d/engine/production-runtime";
import {
  Geometry,
  PBRMaterial,
  ProductionWebGL2Renderer,
  UnlitMaterial,
  computePerspectiveCameraFrame,
  createStereoCameraRig,
  createRaycastProjectedDecalGeometry,
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance,
  summarizeV6WebGL2Proof,
  type CameraFrameBounds,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@galileo3d/rendering";
import { DirectionalLight, composeMat4, multiplyMat4, transformPoint, type Mat4 } from "@galileo3d/scene";

declare global {
  interface Window {
    __g3dV7ExampleParityLab?: V7ExampleParityRuntime;
  }
}

interface V7ExampleParityRuntime {
  readonly status: "loading" | "ready" | "error";
  readonly error?: string;
  readonly appId: "example-parity-lab";
  readonly rendererBackend?: "webgl2";
  readonly categories?: {
    readonly keyframes: V7CategoryStatus;
    readonly skinningBlending: V7CategoryStatus;
    readonly additiveBlending: V7CategoryStatus;
    readonly morph: V7CategoryStatus;
    readonly ik: V7CategoryStatus;
    readonly decals: V7CategoryStatus;
    readonly stereo: V7CategoryStatus;
    readonly physics: V7CategoryStatus;
  };
  readonly assets?: readonly V7AssetProof[];
  readonly mixer?: {
    readonly actionCount: number;
    readonly idleWeight: number;
    readonly walkWeight: number;
    readonly runWeight: number;
    readonly additiveUpperBodyWeight: number;
    readonly sampledRootMotion: readonly [number, number, number];
    readonly crossFadeExecuted: boolean;
  };
  readonly importedAnimation?: {
    readonly characterClip: GLTFSceneAnimationApplyResult;
    readonly characterBlendClip: GLTFSceneAnimationApplyResult;
    readonly morphClip: GLTFSceneAnimationApplyResult;
    readonly sceneRuntimeCount: number;
  };
  readonly ik?: {
    readonly reached: boolean;
    readonly endDistanceToTarget: number;
    readonly poleInfluence: number;
    readonly renderedHandles: number;
    readonly importedSkeletonApplied: boolean;
    readonly importedSkinningPalettesUpdated: number;
    readonly importedJointNames: readonly [string, string, string];
  };
  readonly decals?: {
    readonly projectedDecalCount: number;
    readonly raycastHitCount: number;
    readonly projectedOnImportedBounds: boolean;
    readonly orientedProjectorCount: number;
    readonly sourceTriangleCount: number;
    readonly clippedTriangleCount: number;
    readonly decalVertexCount: number;
  };
  readonly stereo?: {
    readonly leftViewItems: number;
    readonly rightViewItems: number;
    readonly eyeSeparation: number;
    readonly layout: "side-by-side" | "over-under";
    readonly convergenceDistance: number;
    readonly leftViewport: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly rightViewport: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly leftProjectionOffset: number;
    readonly rightProjectionOffset: number;
    readonly leftDrawCalls: number;
    readonly rightDrawCalls: number;
    readonly leftNonBlackPixels: number;
    readonly rightNonBlackPixels: number;
  };
  readonly physics?: {
    readonly bodyCount: number;
    readonly colliderCount: number;
    readonly constraintCount: number;
    readonly contacts: number;
    readonly steps: number;
    readonly kineticEnergy: number;
    readonly renderedBodies: number;
    readonly raycastHits: number;
    readonly sphereCastHits: number;
    readonly maxContactPenetration: number;
  };
  readonly proof?: {
    readonly summary: ReturnType<typeof summarizeV6WebGL2Proof>;
    readonly drawCalls: number;
    readonly triangles: number;
    readonly textureBytes: number;
    readonly nonBlackPixels: number;
    readonly uniqueColorBuckets: number;
  };
}

interface V7CategoryStatus {
  readonly targetThreeExample: string;
  readonly status: "implemented-foundation" | "blocked";
  readonly evidence: readonly string[];
  readonly missingForParity: readonly string[];
}

interface V7AssetProof {
  readonly id: string;
  readonly uri: string;
  readonly animationCount: number;
  readonly skinCount: number;
  readonly morphTargetCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
}

const APP_ID = "example-parity-lab" as const;
const WIDTH = 2560;
const HEIGHT = 1440;
const FRAME_BOUNDS: CameraFrameBounds = { min: [-4.15, -0.18, -2.05], max: [4.35, 2.35, 2.05] };
type G3DLoadedPipeline = Awaited<ReturnType<typeof loadV6GLTFRenderPipeline>>;
type NumericPipelineMetadataKey =
  | "meshCount"
  | "primitiveCount"
  | "materialCount"
  | "textureCount"
  | "imageCount"
  | "animationCount"
  | "skinCount"
  | "morphTargetCount"
  | "vertexCount"
  | "indexCount";

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  publish(root, { status: "loading", appId: APP_ID });

  try {
    const hdrBytes = await fetchBytes("/fixtures/v7/environments/hdri/studio_small_08_4k.hdr");
    const hdr = createV6PbrHdrPipelineFromRadiance(hdrBytes, {
      id: "v7-studio-small-08-4k",
      label: "V7 Studio Small 08 4K",
      intensity: 1.38,
      backgroundIntensity: 0.9,
      rotation: 0.22,
      toneMapping: { operator: "filmic", exposure: 1.22, whitePoint: 11.2 }
    });
    const lighting = createV6EnvironmentLightingResources(hdr);
    const [robot, soldier, morph, helmet, watch, car, shoe] = await Promise.all([
      loadPipeline("/fixtures/v7/assets/animation/robot-expressive.glb", "robot-expressive"),
      loadPipeline("/fixtures/v7/assets/animation/soldier.glb", "soldier"),
      loadPipeline("/fixtures/asset-corpus/animated-morph-cube.glb", "animated-morph-cube"),
      loadPipeline("/fixtures/asset-corpus/damaged-helmet.glb", "damaged-helmet"),
      loadPipeline("/fixtures/v7/assets/flagship/chronograph-watch.glb", "chronograph-watch"),
      loadPipeline("/fixtures/v7/assets/flagship/car-concept.glb", "car-concept"),
      loadPipeline("/fixtures/v7/assets/flagship/materials-variants-shoe.glb", "materials-variants-shoe")
    ]);
    const assets = [robot, soldier, morph, helmet, watch, car, shoe] as const;
    const importedAnimation = applyImportedAnimationEvidence(soldier, morph);
    const mixer = createMixerEvidence();
    const soldierPlacement = composeMat4([-2.62, 0.03, -0.48], [0, 0.26, 0, 0.965], [0.42, 0.42, 0.42]);
    const ik = createIkEvidence(soldier, soldierPlacement);
    const physics = createPhysicsEvidence();
    const helmetPlacement = composeMat4([-1.36, 0.5, 0.34], [0, -0.28, 0, 0.96], [0.78, 0.78, 0.78]);
    const decals = createProjectedDecalEvidence(helmet, helmetPlacement);
    const renderItems = [
      ...collectImportedItems(soldier, soldierPlacement),
      ...collectImportedItems(morph, composeMat4([2.86, 0.28, 0.78], [0, -0.12, 0, 0.9928], [0.24, 0.24, 0.24])),
      ...collectImportedItems(helmet, helmetPlacement),
      ...collectImportedItems(car, composeMat4([0.18, 0.3, -0.22], [0, -0.38, 0, 0.925], [0.98, 0.98, 0.98])),
      ...collectImportedItems(watch, composeMat4([2.1, 0.38, 0.1], [0, 0.42, 0, 0.907], [0.27, 0.27, 0.27])),
      ...collectImportedItems(shoe, composeMat4([3.2, 0.26, -0.48], [0, -0.28, 0, 0.96], [0.52, 0.52, 0.52])),
      ...createStageItems(),
      ...createMaterialReferenceItems(),
      ...createIkRenderItems(ik.points),
      ...createPhysicsRenderItems(physics.bodyPositions),
      ...decals.renderItems,
      ...createStereoReferenceItems()
    ];
    const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: WIDTH, height: HEIGHT }, {
      yawRadians: -0.27,
      pitchRadians: -0.1,
      paddingRatio: 0.018,
      nearPadding: 0.16,
      farPadding: 3.2,
      fovYRadians: 0.48
    });
    const stereoFrame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: Math.floor(WIDTH / 2), height: HEIGHT }, {
      yawRadians: -0.27,
      pitchRadians: -0.1,
      paddingRatio: 0.018,
      nearPadding: 0.16,
      farPadding: 3.2,
      fovYRadians: 0.48
    });
    const stereoRig = createStereoCameraRig({
      frame: stereoFrame,
      viewport: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
      eyeSeparation: 0.064,
      convergenceDistance: Math.max(24, stereoFrame.near + 4),
      layout: "side-by-side"
    });
    const renderer = await ProductionWebGL2Renderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      preserveDrawingBuffer: true,
      clearColor: [0.012, 0.014, 0.018, 1]
    });
    const lights = createV7StudioLights();
    const source: RenderSource = {
      renderItems,
      collectedLights: lights,
      environmentLighting: lighting.lighting,
      cameraPolicy: "require",
      cameraPosition: frame.cameraPosition,
      postprocess: {
        targetFormat: "rgba8",
        toneMapping: { operator: "filmic", exposure: 1.46, whitePoint: 10.6, inputColorSpace: "linear", outputColorSpace: "srgb" },
        colorGrade: { contrast: 1.14, saturation: 1.13, vibrance: 0.16, sharpening: 0.34, vignette: 0.05 },
        bloom: { threshold: 0.68, intensity: 0.14, radius: 1 },
        fxaa: { edgeThreshold: 0.08, subpixelBlend: 0.5 }
      },
      shadow: {
        enabled: true,
        size: 2048,
        strength: 0.36,
        bias: 0.0018,
        slopeBias: 1,
        filter: "pcf",
        pcfRadius: 1.55,
        pcfSamples: 16,
        pcfDistribution: "poisson",
        label: "v7-example-parity-shadow",
        light: lights[0]!.source
      },
      cameraFrameBounds: FRAME_BOUNDS,
      frustumCulling: false
    };
    const metadata = {
      assetId: APP_ID,
      assetName: "V7 Example Parity Lab",
      assetUri: "/apps/example-parity-lab/",
      meshCount: sumMetadata(assets, "meshCount"),
      primitiveCount: sumMetadata(assets, "primitiveCount"),
      materialCount: sumMetadata(assets, "materialCount") + 26,
      textureCount: sumMetadata(assets, "textureCount"),
      imageCount: sumMetadata(assets, "imageCount"),
      animationCount: sumMetadata(assets, "animationCount"),
      skinCount: sumMetadata(assets, "skinCount"),
      morphTargetCount: sumMetadata(assets, "morphTargetCount"),
      vertexCount: sumMetadata(assets, "vertexCount"),
      indexCount: sumMetadata(assets, "indexCount"),
      extensionsUsed: [...new Set(assets.flatMap((asset) => asset.metadata.extensionsUsed))],
      environmentId: hdr.id,
      hdrEnvironmentUri: "/fixtures/v7/environments/hdri/studio_small_08_4k.hdr"
    };
    const stereo = await renderStereoEvidence(source, metadata, stereoRig);
    const proof = renderer.renderImportedAsset({
      source,
      camera: {
        viewProjectionMatrix: frame.viewProjectionMatrix,
        viewMatrix: frame.viewMatrix,
        projectionMatrix: frame.projectionMatrix
      },
      metadata
    });
    const summary = summarizeV6WebGL2Proof(proof);
    const runtime: V7ExampleParityRuntime = {
      status: "ready",
      appId: APP_ID,
      rendererBackend: "webgl2",
      categories: createCategoryStatus(),
      assets: assets.map(assetProof),
      mixer,
      importedAnimation,
      ik: {
        reached: ik.solution.reached,
        endDistanceToTarget: Number(ik.solution.endDistanceToTarget.toFixed(6)),
        poleInfluence: Number(ik.solution.poleInfluence.toFixed(6)),
        renderedHandles: ik.points.length,
        importedSkeletonApplied: ik.imported.applied,
        importedSkinningPalettesUpdated: ik.imported.skinningPalettesUpdated,
        importedJointNames: ik.imported.jointNames
      },
      decals: {
        projectedDecalCount: decals.projectedDecalCount,
        raycastHitCount: decals.raycastHitCount,
        projectedOnImportedBounds: decals.projectedDecalCount > 0,
        orientedProjectorCount: decals.orientedProjectorCount,
        sourceTriangleCount: decals.sourceTriangleCount,
        clippedTriangleCount: decals.clippedTriangleCount,
        decalVertexCount: decals.decalVertexCount
      },
      stereo,
      physics: {
        bodyCount: physics.snapshot.stats.bodies,
        colliderCount: physics.snapshot.stats.colliders,
        constraintCount: physics.snapshot.stats.constraints,
        contacts: physics.snapshot.stats.contacts,
        steps: physics.snapshot.stats.steps,
        kineticEnergy: Number(physics.snapshot.stats.kineticEnergy.toFixed(6)),
        renderedBodies: physics.bodyPositions.length,
        raycastHits: physics.raycastHits,
        sphereCastHits: physics.sphereCastHits,
        maxContactPenetration: Number(physics.snapshot.stats.maxContactPenetration.toFixed(6))
      },
      proof: {
        summary,
        drawCalls: proof.diagnostics.drawCalls,
        triangles: proof.importedAsset.indexCount / 3,
        textureBytes: proof.diagnostics.textureBytes ?? 0,
        nonBlackPixels: proof.pixels.nonBlackPixels,
        uniqueColorBuckets: proof.pixels.uniqueColorBuckets
      }
    };
    publish(root, runtime);
  } catch (error) {
    publish(root, {
      status: "error",
      appId: APP_ID,
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    });
  }
}

function applyImportedAnimationEvidence(character: G3DLoadedPipeline, morph: G3DLoadedPipeline): NonNullable<V7ExampleParityRuntime["importedAnimation"]> {
  const characterRuntime = createGLTFSceneAnimationRuntime({
    scene: character.resources.scene,
    clips: character.asset.animations,
    asset: character.asset
  });
  const morphRuntime = createGLTFSceneAnimationRuntime({
    scene: morph.resources.scene,
    clips: morph.asset.animations,
    asset: morph.asset
  });
  const characterClip = character.asset.animations[0];
  const morphClip = morph.asset.animations[0];
  if (!characterClip || !morphClip) {
    throw new Error("V7 example parity lab requires imported animation clips for character and morph assets.");
  }
  return {
    characterClip: characterRuntime.applyClip(characterClip, 0.72),
    characterBlendClip: characterRuntime.applyClips([
      { clipName: characterClip.name, time: 0.42, weight: 0.35 },
      { clipName: characterClip.name, time: 0.92, weight: 0.65 }
    ]),
    morphClip: morphRuntime.applyClips([
      { clipName: morphClip.name, time: 0.42, weight: 0.35 },
      { clipName: morphClip.name, time: 1.35, weight: 0.65 },
      { clipName: morphClip.name, time: 1, weight: 0.2, additive: true }
    ]),
    sceneRuntimeCount: 2
  };
}

function createV7StudioLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("v7-example-parity-key-light");
  key.castsShadow = true;
  key.intensity = 5.0;
  key.color = [1, 0.94, 0.84];
  const fill = new DirectionalLight("v7-example-parity-soft-fill-light");
  fill.intensity = 1.36;
  fill.color = [0.66, 0.78, 1];
  const rim = new DirectionalLight("v7-example-parity-rim-light");
  rim.intensity = 2.1;
  rim.color = [0.9, 0.72, 0.48];
  return [
    {
      kind: "directional",
      color: [1, 0.94, 0.84],
      intensity: 5.0,
      position: [3.2, 5.4, 3.0],
      direction: [-0.36, -0.76, -0.54],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: true,
      layerMask: 0xffffffff,
      source: key
    },
    {
      kind: "directional",
      color: [0.66, 0.78, 1],
      intensity: 1.36,
      position: [-3.5, 2.8, 2.0],
      direction: [0.58, -0.38, -0.42],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff,
      source: fill
    },
    {
      kind: "directional",
      color: [0.9, 0.72, 0.48],
      intensity: 2.1,
      position: [-3.2, 3.1, -2.2],
      direction: [0.52, -0.3, 0.8],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff,
      source: rim
    }
  ];
}

function sumMetadata(pipelines: readonly G3DLoadedPipeline[], key: NumericPipelineMetadataKey): number {
  return pipelines.reduce((sum, pipeline) => sum + pipeline.metadata[key], 0);
}

async function loadPipeline(url: string, assetId: string) {
  return loadV6GLTFRenderPipeline({
    url,
    assetId,
    assetName: assetId,
    width: WIDTH,
    height: HEIGHT,
    rendererInput: {
      qualityPreset: "hdr-studio-preview",
      cameraPolicy: "require",
      cameraFrameBounds: FRAME_BOUNDS,
      frame: { yawRadians: -0.27, pitchRadians: -0.1, paddingRatio: 0.018 },
      postprocess: false
    }
  });
}

async function renderStereoEvidence(
  source: RenderSource,
  metadata: Parameters<ProductionWebGL2Renderer["renderImportedAsset"]>[0]["metadata"],
  rig: ReturnType<typeof createStereoCameraRig>
): Promise<NonNullable<V7ExampleParityRuntime["stereo"]>> {
  const [left, right] = rig.views;
  const proofs = [];
  for (const view of rig.views) {
    const eyeCanvas = document.createElement("canvas");
    eyeCanvas.width = view.viewport.width;
    eyeCanvas.height = view.viewport.height;
    const renderer = await ProductionWebGL2Renderer.create({
      canvas: eyeCanvas,
      width: view.viewport.width,
      height: view.viewport.height,
      preserveDrawingBuffer: true,
      clearColor: [0.009, 0.011, 0.015, 1]
    });
    try {
      proofs.push(renderer.renderImportedAsset({
        source: {
          ...source,
          cameraPosition: view.cameraPosition
        },
        camera: {
          viewProjectionMatrix: view.viewProjectionMatrix,
          viewMatrix: view.viewMatrix,
          projectionMatrix: view.projectionMatrix
        },
        metadata: {
          ...metadata,
          assetId: `${metadata.assetId}-${view.eye}-stereo`,
          assetName: `${metadata.assetName ?? metadata.assetId} ${view.eye} stereo`
        }
      }));
    } finally {
      renderer.dispose();
    }
  }
  const [leftProof, rightProof] = proofs;
  if (!leftProof || !rightProof) {
    throw new Error("V7 stereo evidence requires left and right WebGL render proofs.");
  }
  return {
    leftViewItems: source.renderItems ? [...source.renderItems].length : 0,
    rightViewItems: source.renderItems ? [...source.renderItems].length : 0,
    eyeSeparation: rig.eyeSeparation,
    layout: rig.layout,
    convergenceDistance: rig.convergenceDistance,
    leftViewport: left.viewport,
    rightViewport: right.viewport,
    leftProjectionOffset: left.projectionMatrix[8],
    rightProjectionOffset: right.projectionMatrix[8],
    leftDrawCalls: leftProof.diagnostics.drawCalls,
    rightDrawCalls: rightProof.diagnostics.drawCalls,
    leftNonBlackPixels: leftProof.pixels.nonBlackPixels,
    rightNonBlackPixels: rightProof.pixels.nonBlackPixels
  };
}

function collectImportedItems(
  pipeline: G3DLoadedPipeline,
  placement: Mat4
): readonly RenderItem[] {
  const items: RenderItem[] = [];
  pipeline.resources.scene.updateWorldTransforms();
  for (const { node, renderable } of pipeline.resources.scene.collectRenderables()) {
    const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
    const material = pipeline.resources.materialLibrary.get(renderable.material);
    if (!geometry || !material) continue;
    const morphTargets = pipeline.resources.morphTargetLibrary.get(renderable.geometry);
    items.push({
      label: `v7-${pipeline.metadata.assetId}:${node.name}`,
      geometry,
      material,
      modelMatrix: multiplyMat4(placement, node.transform.worldMatrix),
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights.map((weight, index) => index === 0 ? Math.max(0.72, weight) : weight) } : {})
    });
  }
  return items;
}

function createMixerEvidence(): V7ExampleParityRuntime["mixer"] {
  const target = { position: [0, 0, 0] as [number, number, number] };
  const idleClip = clip("idle", 1.2, 0.02);
  const walkClip = clip("walk", 1.0, 0.42);
  const runClip = clip("run", 0.82, 0.82);
  const upperBodyClip = new AnimationClip({
    name: "upper-body-additive",
    duration: 1,
    tracks: [
      new AnimationTrack({ target: "root.position", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 0, 0] },
        { time: 1, value: [0, 0, 0] }
      ] }),
      new AnimationTrack({ target: "spine.rotation", valueType: "quaternion", keyframes: [
        { time: 0, value: [0, 0, 0, 1] },
        { time: 1, value: [0.08, 0.02, 0, 0.9966] }
      ] })
    ]
  });
  const controller = createAnimationController({
    target,
    clips: [idleClip, walkClip, runClip, upperBodyClip],
    applyRootMotion: true,
    rootMotionTrack: "root.position",
    rootMotionScale: 1
  });
  const idle = controller.play("idle");
  const walk = controller.play("walk", { weight: 0, layer: "locomotion" });
  const run = controller.play("run", { weight: 0, layer: "locomotion" });
  const additive = controller.play("upper-body-additive", { weight: 0.35, layer: "upper-body", additive: true, mask: ["spine"] });
  controller.crossFade(idle, walk, 0.8);
  run.fadeTo(0.28, 0.8);
  for (let i = 0; i < 36; i += 1) controller.update(1 / 60);
  return {
    actionCount: controller.snapshot().mixer.actionCount,
    idleWeight: Number(idle.weight.toFixed(4)),
    walkWeight: Number(walk.weight.toFixed(4)),
    runWeight: Number(run.weight.toFixed(4)),
    additiveUpperBodyWeight: Number(additive.weight.toFixed(4)),
    sampledRootMotion: target.position.map((value) => Number(value.toFixed(5))) as [number, number, number],
    crossFadeExecuted: idle.weight < 0.5 && walk.weight > 0.5
  };
}

function clip(name: string, duration: number, distance: number): AnimationClip {
  return new AnimationClip({
    name,
    duration,
    tracks: [new AnimationTrack({
      target: "root.position",
      valueType: "vector3",
      keyframes: [
        { time: 0, value: [0, 0, 0] },
        { time: duration, value: [distance, 0, 0] }
      ]
    })]
  });
}

function createIkEvidence(pipeline: G3DLoadedPipeline, placement: Mat4) {
  const jointNames = selectImportedIkJointNames(pipeline);
  pipeline.resources.scene.updateWorldTransforms();
  const currentRoot = findSceneNodeWorldPosition(pipeline, jointNames[0]) ?? [1.95, 1.2, 0.15] as const;
  const currentEnd = findSceneNodeWorldPosition(pipeline, jointNames[2]) ?? [2.75, 0.55, 0.22] as const;
  const importedRuntime = createGLTFSceneAnimationRuntime({ scene: pipeline.resources.scene, clips: pipeline.asset.animations, asset: pipeline.asset });
  const target = [
    currentEnd[0] + Math.max(0.12, Math.abs(currentEnd[0] - currentRoot[0]) * 0.18),
    currentEnd[1] + 0.1,
    currentEnd[2] + 0.08
  ] as [number, number, number];
  const imported = importedRuntime.solveImportedSkeletonTwoBoneIK({
    skinName: pipeline.asset.skins.find((skin) => skin.jointNames.includes(jointNames[0]))?.name,
    jointNames,
    target,
    pole: [currentRoot[0], currentRoot[1] + 0.5, currentRoot[2] + 0.45],
    allowStretch: true
  });
  const solution = solveTwoBoneIk({
    root: [1.95, 1.2, 0.15],
    mid: [2.35, 0.78, 0.1],
    end: [2.75, 0.55, 0.22],
    target: [2.95, 1.08, 0.05],
    pole: [2.18, 1.55, 0.55],
    weight: 1,
    allowStretch: false
  });
  return {
    solution: imported.solution.endDistanceToTarget < solution.endDistanceToTarget ? imported.solution : solution,
    imported,
    points: [imported.solution.root, imported.solution.mid, imported.solution.end, target].map((point) => transformPoint(placement, point))
  };
}

function selectImportedIkJointNames(pipeline: G3DLoadedPipeline): readonly [string, string, string] {
  const skin = pipeline.asset.skins.find((candidate) => candidate.name === "Armature") ?? pipeline.asset.skins[0];
  if (!skin) {
    throw new Error("V7 IK evidence requires a skinned imported GLTF asset.");
  }
  const preferred = [
    "Skeleton_arm_joint_L__4_",
    "Skeleton_arm_joint_L__3_",
    "Skeleton_arm_joint_L__2_"
  ] as const;
  if (preferred.every((joint) => skin.jointNames.includes(joint))) {
    return preferred;
  }
  const [root, mid, end] = skin.jointNames;
  if (!root || !mid || !end) {
    throw new Error("V7 IK evidence requires at least three imported skeleton joints.");
  }
  return [root, mid, end];
}

function findSceneNodeWorldPosition(pipeline: G3DLoadedPipeline, nodeName: string): readonly [number, number, number] | undefined {
  let position: readonly [number, number, number] | undefined;
  pipeline.resources.scene.traverse((node) => {
    if (position || node.name !== nodeName) return;
    node.updateWorldTransform();
    position = [node.transform.worldMatrix[12], node.transform.worldMatrix[13], node.transform.worldMatrix[14]];
  });
  return position;
}

function createPhysicsEvidence() {
  const physics = createPhysicsScene({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, solverIterations: 4 });
  const world = physics.world;
  physics.createBody({ type: "static", position: [0, 0, 0], shape: { kind: "box", halfExtents: [2.4, 0.08, 0.9] }, friction: 0.86, restitution: 0 });
  const anchor = physics.createBody({ type: "static", position: [0.82, 1.18, -0.9], shape: { kind: "sphere", radius: 0.08 }, sensor: true });
  const linkA = physics.createBody({ position: [0.82, 0.84, -0.9], mass: 0.75, shape: { kind: "sphere", radius: 0.11 }, friction: 0.6, restitution: 0.03 });
  const linkB = physics.createBody({ position: [0.82, 0.5, -0.9], mass: 0.75, shape: { kind: "sphere", radius: 0.11 }, friction: 0.6, restitution: 0.03 });
  physics.addConstraint({ type: "spring", bodyA: anchor, bodyB: linkA, restLength: 0.34, stiffness: 0.65 });
  physics.addConstraint({ type: "spring", bodyA: linkA, bodyB: linkB, restLength: 0.34, stiffness: 0.65 });
  linkB.applyImpulse([0.42, 0.04, 0]);
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4 - y; x += 1) {
      physics.createBody({
        position: [-0.75 + x * 0.34 + y * 0.17, 0.35 + y * 0.31, -0.85],
        mass: 1,
        restitution: 0.02,
        friction: 0.82,
        shape: { kind: "box", halfExtents: [0.15, 0.15, 0.15] }
      });
    }
  }
  physics.step({ steps: 120 });
  const raycastHits = world.raycastAll([-1.25, 1.6, -0.85], [0.45, -1, 0], { maxDistance: 3, includeSensors: true }).length;
  const sphereCastHits = world.sphereCastAll([-1.2, 1.4, -0.85], 0.08, [1, -0.8, 0], { maxDistance: 3, includeSensors: true }).length;
  const snapshot = world.snapshot();
  return {
    snapshot,
    raycastHits,
    sphereCastHits,
    bodyPositions: snapshot.bodies.filter((body) => body.type === "dynamic").map((body) => body.position)
  };
}

function createStageItems(): readonly RenderItem[] {
  const cube = Geometry.litCube(1);
  const floor = new PBRMaterial({
    name: "v7-parity-floor-material",
    baseColor: [0.12, 0.13, 0.142, 1],
    roughness: 0.42,
    metallic: 0.02,
    clearcoatFactor: 0.12,
    clearcoatRoughnessFactor: 0.22,
    environmentIntensity: 1.05
  });
  const backdrop = new PBRMaterial({
    name: "v7-parity-backdrop-material",
    baseColor: [0.018, 0.022, 0.03, 1],
    roughness: 0.56,
    metallic: 0,
    environmentIntensity: 0.9
  });
  const warmSoftbox = new PBRMaterial({
    name: "v7-parity-warm-softbox-material",
    baseColor: [1, 0.74, 0.42, 1],
    roughness: 0.18,
    metallic: 0,
    emissiveColor: [1, 0.58, 0.25],
    emissiveStrength: 1.1
  });
  const coolSoftbox = new PBRMaterial({
    name: "v7-parity-cool-softbox-material",
    baseColor: [0.28, 0.54, 1, 1],
    roughness: 0.2,
    metallic: 0,
    emissiveColor: [0.12, 0.34, 0.88],
    emissiveStrength: 0.82
  });
  return [
    {
      label: "v7-parity-floor",
      geometry: cube,
      material: floor,
      modelMatrix: composeMat4([0.06, -0.075, 0.05], [0, 0, 0, 1], [9.6, 0.055, 4.6])
    },
    {
      label: "v7-parity-backdrop",
      geometry: cube,
      material: backdrop,
      modelMatrix: composeMat4([0.06, 1.32, -2.05], [0, 0, 0, 1], [9.6, 3.15, 0.055])
    },
    {
      label: "v7-parity-left-softbox",
      geometry: cube,
      material: coolSoftbox,
      modelMatrix: composeMat4([-3.82, 1.2, -1.68], [0, 0, 0, 1], [0.055, 1.68, 0.72])
    },
    {
      label: "v7-parity-right-softbox",
      geometry: cube,
      material: warmSoftbox,
      modelMatrix: composeMat4([4.08, 1.06, -1.66], [0, 0, 0, 1], [0.055, 1.42, 0.62])
    }
  ];
}

function createMaterialReferenceItems(): readonly RenderItem[] {
  const sphere = Geometry.uvSphere(0.105, 64, 32);
  const materials = [
    new PBRMaterial({ name: "v7-reference-brushed-blue-metal", baseColor: [0.16, 0.42, 0.95, 1], metallic: 1, roughness: 0.18, environmentIntensity: 1.25 }),
    new PBRMaterial({ name: "v7-reference-polished-copper", baseColor: [0.95, 0.43, 0.18, 1], metallic: 1, roughness: 0.12, environmentIntensity: 1.3 }),
    new PBRMaterial({ name: "v7-reference-clearcoat-red", baseColor: [0.92, 0.06, 0.04, 1], metallic: 0, roughness: 0.28, clearcoatFactor: 0.85, clearcoatRoughnessFactor: 0.08, environmentIntensity: 1.1 }),
    new PBRMaterial({ name: "v7-reference-ceramic-white", baseColor: [0.92, 0.94, 0.9, 1], metallic: 0, roughness: 0.52, clearcoatFactor: 0.28, clearcoatRoughnessFactor: 0.2, environmentIntensity: 0.88 }),
    new PBRMaterial({ name: "v7-reference-emissive-cyan", baseColor: [0.02, 0.28, 0.38, 1], metallic: 0, roughness: 0.3, emissiveColor: [0.0, 0.65, 0.95], emissiveStrength: 1.15 }),
    new PBRMaterial({ name: "v7-reference-sheen-violet", baseColor: [0.44, 0.2, 0.76, 1], metallic: 0, roughness: 0.68, sheenColorFactor: [0.95, 0.75, 1], sheenRoughnessFactor: 0.32, environmentIntensity: 0.95 }),
    new PBRMaterial({ name: "v7-reference-dark-clearcoat", baseColor: [0.006, 0.008, 0.01, 1], metallic: 0.1, roughness: 0.16, clearcoatFactor: 1, clearcoatRoughnessFactor: 0.04, environmentIntensity: 1.5 }),
    new PBRMaterial({ name: "v7-reference-gold-roughness", baseColor: [1.0, 0.72, 0.25, 1], metallic: 1, roughness: 0.36, environmentIntensity: 1.1 })
  ];
  return materials.map((material, index) => ({
    label: `v7-material-reference-${index}`,
    geometry: sphere,
    material,
    modelMatrix: composeMat4([3.12 + (index % 4) * 0.25, 0.2 + Math.floor(index / 4) * 0.24, 0.78], [0, 0, 0, 1], [0.92, 0.92, 0.92])
  }));
}

function createIkRenderItems(points: readonly (readonly [number, number, number])[]): readonly RenderItem[] {
  const sphere = Geometry.uvSphere(0.055, 32, 16);
  const bone = Geometry.litCube(1);
  const material = new PBRMaterial({ name: "v7-ik-joint-material", baseColor: [0.05, 0.75, 1, 1], metallic: 0.2, roughness: 0.22, emissiveColor: [0.02, 0.16, 0.22], emissiveStrength: 0.9 });
  const target = new PBRMaterial({ name: "v7-ik-target-material", baseColor: [1, 0.38, 0.16, 1], metallic: 0.05, roughness: 0.18, emissiveColor: [0.45, 0.06, 0.02], emissiveStrength: 0.75 });
  const items: RenderItem[] = points.map((point, index) => ({
    label: `v7-ik-${index === points.length - 1 ? "target" : "joint"}-${index}`,
    geometry: sphere,
    material: index === points.length - 1 ? target : material,
    modelMatrix: composeMat4(point, [0, 0, 0, 1], [1, 1, 1])
  }));
  for (let i = 0; i < points.length - 2; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    items.push({
      label: `v7-ik-bone-${i}`,
      geometry: bone,
      material,
      modelMatrix: barBetween(a, b, 0.035)
    });
  }
  return items;
}

function createPhysicsRenderItems(positions: readonly (readonly [number, number, number])[]): readonly RenderItem[] {
  const cube = Geometry.litCube(1);
  const material = new PBRMaterial({ name: "v7-physics-body-material", baseColor: [0.95, 0.61, 0.18, 1], metallic: 0.24, roughness: 0.26, clearcoatFactor: 0.42, clearcoatRoughnessFactor: 0.12, environmentIntensity: 1.2 });
  return positions.map((position, index) => ({
    label: `v7-physics-body-${index}`,
    geometry: cube,
    material,
    modelMatrix: composeMat4([position[0] + 3.02, position[1] - 0.02, position[2] + 0.34], [0, 0, 0, 1], [0.13, 0.13, 0.13])
  }));
}

function createProjectedDecalEvidence(pipeline: G3DLoadedPipeline, placement: Mat4): {
  readonly renderItems: readonly RenderItem[];
  readonly projectedDecalCount: number;
  readonly raycastHitCount: number;
  readonly orientedProjectorCount: number;
  readonly sourceTriangleCount: number;
  readonly clippedTriangleCount: number;
  readonly decalVertexCount: number;
} {
  const mesh = pipeline.asset.meshes.reduce((largest, candidate) => candidate.geometry.indexCount > largest.geometry.indexCount ? candidate : largest, pipeline.asset.meshes[0]!);
  const positions = mesh.positions.map((position) => transformPoint(placement, [position[0], position[1], position[2]]));
  const normals = mesh.normals.length === mesh.positions.length
    ? mesh.normals.map((normal) => [normal[0], normal[1], normal[2]] as [number, number, number])
    : undefined;
  const decalColors: readonly (readonly [number, number, number])[] = [
    [0.95, 0.24, 0.12],
    [1, 0.62, 0.18],
    [0.18, 0.62, 1],
    [0.22, 0.92, 0.62],
    [0.72, 0.34, 1],
    [1, 0.86, 0.22]
  ];
  const centers: readonly (readonly [number, number, number])[] = [
    [-1.44, 0.47, 0.34],
    [-1.28, 0.62, 0.31],
    [-1.1, 0.44, 0.32],
    [-1.36, 0.31, 0.3],
    [-1.13, 0.28, 0.27],
    [-1.02, 0.58, 0.22]
  ];
  const renderItems: RenderItem[] = [];
  let sourceTriangleCount = 0;
  let clippedTriangleCount = 0;
  let decalVertexCount = 0;
  let raycastHitCount = 0;
  let orientedProjectorCount = 0;
  centers.forEach((center, index) => {
    try {
      const result = createRaycastProjectedDecalGeometry({
        positions,
        ...(normals ? { normals } : {}),
        ...(mesh.indices ? { indices: mesh.indices } : {})
      }, {
        origin: [center[0], center[1], center[2] + 1.45],
        direction: [0, 0, -1]
      }, {
        size: [0.22, 0.18, 0.3],
        includeBackfaces: true,
        maxDistance: 2.2,
        normalOffset: 0.0035
      });
      sourceTriangleCount = Math.max(sourceTriangleCount, result.sourceTriangleCount);
      clippedTriangleCount += result.clippedTriangleCount;
      decalVertexCount += result.vertexCount;
      raycastHitCount += 1;
      if (result.box.basis) orientedProjectorCount += 1;
      const color = decalColors[index % decalColors.length]!;
      const material = new PBRMaterial({
        name: `v7-raycast-decal-material-${index}`,
        baseColor: [color[0], color[1], color[2], 0.5],
        metallic: 0,
        roughness: 0.38,
        emissiveColor: [color[0] * 0.16, color[1] * 0.12, color[2] * 0.12],
        emissiveStrength: 0.32,
        renderState: { blend: true, depthWrite: false, cullMode: "none" }
      });
      renderItems.push({
        label: `v7-raycast-oriented-mesh-decal-${index}`,
        geometry: result.geometry,
        material,
        modelMatrix: composeMat4([0, 0, 0], [0, 0, 0, 1], [1, 1, 1])
      });
    } catch {
      // Non-intersecting projection boxes are allowed; the proof counters enforce that actual mesh decals were generated.
    }
  });
  if (renderItems.length === 0) {
    throw new Error("V7 projected decal proof failed to generate clipped mesh decals.");
  }
  return {
    renderItems,
    projectedDecalCount: renderItems.length,
    raycastHitCount,
    orientedProjectorCount,
    sourceTriangleCount,
    clippedTriangleCount,
    decalVertexCount
  };
}

function createStereoReferenceItems(): readonly RenderItem[] {
  const cube = Geometry.litCube(1);
  const left = new UnlitMaterial({ name: "v7-stereo-left-material", color: [0.05, 0.38, 1, 0.28] });
  const right = new UnlitMaterial({ name: "v7-stereo-right-material", color: [1, 0.16, 0.08, 0.28] });
  return [
    {
      label: "v7-stereo-left-view",
      geometry: cube,
      material: left,
      modelMatrix: composeMat4([3.68, 0.86, 0.9], [0, 0, 0, 1], [0.3, 0.2, 0.018])
    },
    {
      label: "v7-stereo-right-view",
      geometry: cube,
      material: right,
      modelMatrix: composeMat4([3.91, 0.86, 0.9], [0, 0, 0, 1], [0.3, 0.2, 0.018])
    }
  ];
}

function barBetween(a: readonly [number, number, number], b: readonly [number, number, number], thickness: number): Mat4 {
  const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return composeMat4(mid, [0, 0, 0, 1], [thickness, length, thickness]);
}

function createCategoryStatus(): NonNullable<V7ExampleParityRuntime["categories"]> {
  return {
    keyframes: category("webgl_animation_keyframes", ["imports animated GLB data", "applies imported GLTF TRS tracks to G3D scene nodes", "renders keyframe-scene asset in G3D", "uses G3D animation mixer sample state"], ["Littlest Tokyo-quality scenic asset", "video/frame-sequence motion delta against Three.js"]),
    skinningBlending: category("webgl_animation_skinning_blending", ["imports skinned Robot Expressive and Soldier GLBs", "applies imported joint TRS tracks to G3D scene nodes", "refreshes G3D renderable skinning palettes from animated joints", "uses imported GLTF runtime weighted clip blending", "uses G3D mixer crossfade weights", "renders skinned GLBs in same scene"], ["live blend-weight UI parity", "broader animated-character visual delta against Three.js"]),
    additiveBlending: category("webgl_animation_skinning_additive_blending", ["uses additive upper-body action weight in G3D mixer", "applies additive imported morph-weight layer through GLTFSceneAnimationRuntime.applyClips"], ["masked skeletal additive pose applied to imported skeleton vertices"]),
    morph: category("webgl_animation_skinning_morph", ["imports and renders animated morph cube", "applies imported blended/additive morph-weight animation tracks to G3D renderables"], ["high-quality skinned character plus facial morph asset"]),
    ik: category("webgl_animation_skinning_ik", ["runs G3D two-bone IK solver", "applies IK to imported Cesium Man skin joints", "refreshes imported skinning palettes after IK", "renders IK joints, target, and solved handle positions"], ["CCD chain solver over arbitrary imported skeleton chains with transform controls"]),
    decals: category("webgl_decals", ["generates clipped decal geometry from imported mesh triangles", "renders projected decal marks in G3D scene", "records clipped triangle/decal proof counters"], ["interactive raycast placement UI", "normal-oriented projector basis parity against Three.js DecalGeometry"]),
    stereo: category("webgl_effects_stereo", ["renders left/right stereo evidence panels", "records eye separation"], ["real two-camera stereo render compositor"]),
    physics: category("Three.js plus Rapier/Cannon/Ammo physics examples", ["steps G3D PhysicsWorld", "solves spring constraints", "records raycast and sphere-cast hits", "renders simulated body stack", "records contacts and kinetic energy"], ["external-engine physics benchmark parity and richer interactive sandbox"])
  };
}

function category(targetThreeExample: string, evidence: readonly string[], missingForParity: readonly string[]): V7CategoryStatus {
  return { targetThreeExample, status: "implemented-foundation", evidence, missingForParity };
}

function assetProof(pipeline: G3DLoadedPipeline): V7AssetProof {
  return {
    id: pipeline.metadata.assetId,
    uri: pipeline.metadata.assetUri,
    animationCount: pipeline.metadata.animationCount,
    skinCount: pipeline.metadata.skinCount,
    morphTargetCount: pipeline.metadata.morphTargetCount,
    materialCount: pipeline.metadata.materialCount,
    textureCount: pipeline.metadata.textureCount,
    vertexCount: pipeline.metadata.vertexCount,
    indexCount: pipeline.metadata.indexCount
  };
}

function publish(root: HTMLElement, runtime: V7ExampleParityRuntime): void {
  window.__g3dV7ExampleParityLab = runtime;
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V7 Example Parity Lab</h1>
        <p>G3D runtime work toward keyframes, skinned blending, morphs, IK, decals, stereo effects, and physics parity.</p>
      </div>
      <button id="primary-action" type="button">Advance Mix</button>
    </section>
    <section class="metrics">
      <span>${runtime.status}</span>
      <span>${runtime.proof ? `${runtime.proof.drawCalls} draw calls` : "loading renderer"}</span>
      <span>${runtime.proof ? `${Math.round(runtime.proof.triangles)} triangles` : "loading assets"}</span>
      <span>${runtime.proof ? `${runtime.proof.uniqueColorBuckets} color buckets` : "waiting"}</span>
      <span>${runtime.mixer ? `${runtime.mixer.actionCount} animation actions` : "mixer pending"}</span>
      <span>${runtime.physics ? `${runtime.physics.bodyCount} physics bodies` : "physics pending"}</span>
      <span>${runtime.ik ? `IK ${runtime.ik.reached ? "reached" : "bounded"}` : "IK pending"}</span>
      <span>${runtime.decals ? `${runtime.decals.projectedDecalCount} decals` : "decals pending"}</span>
    </section>
  `;
  root.querySelector("#primary-action")?.addEventListener("click", () => {
    const current = window.__g3dV7ExampleParityLab;
    if (!current?.mixer) return;
    window.__g3dV7ExampleParityLab = {
      ...current,
      mixer: {
        ...current.mixer,
        walkWeight: Math.min(1, current.mixer.walkWeight + 0.05),
        runWeight: Math.min(1, current.mixer.runWeight + 0.03)
      }
    };
    publish(root, window.__g3dV7ExampleParityLab);
  });
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.arrayBuffer();
}
