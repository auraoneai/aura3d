import {
  DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
  createGLTFRenderResourceDiagnostics,
  createGLTFSceneAnimationRuntime,
  loadV6GLTFRenderPipeline
} from "@galileo3d/assets";
import {
  Geometry,
  PBRMaterial,
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type CollectedLight,
  type Material,
  type RenderItem,
  type RenderSource
} from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/v9";
import { DirectionalLight, composeMat4, type Mat4 } from "@galileo3d/scene";

type LoadedPipeline = Awaited<ReturnType<typeof loadV6GLTFRenderPipeline>>;
type Runtime = {
  readonly appId: "wow-kira-ik-room";
  readonly status: "loading" | "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly elapsedMs: number;
  readonly width: number;
  readonly height: number;
  readonly skinName: string;
  readonly jointNames: readonly [string, string, string];
  readonly target: readonly [number, number, number];
  readonly endEffector: readonly [number, number, number];
  readonly endEffectorDistance: number;
  readonly reached: boolean;
  readonly stretched: boolean;
  readonly skinningPalettesUpdated: number;
  readonly ikApplied: boolean;
  readonly animationTracksApplied: number;
  readonly animationMissingTargets: readonly string[];
  readonly skinnedDrawItems: number;
  readonly texturedDrawItems: number;
  readonly texturedSkinnedDrawItems: number;
  readonly untexturedSkinnedDrawItems: number;
  readonly fallbackWhiteDrawItems: number;
  readonly staticKiraMeshLabels: readonly string[];
  readonly characterMotion: number;
  readonly motionSamples: number;
  readonly motionTimeRange: number;
  readonly poseDiversityScore: number;
  readonly motionHealthy: boolean;
  readonly animationCount: number;
  readonly clipName: string;
  readonly animationBindingTracks: number;
  readonly animationBoundTracks: number;
  readonly originalAnimationCount: number;
  readonly textureCount: number;
  readonly materialCount: number;
  readonly meshCount: number;
  readonly loadMs: number;
  readonly fixture: string;
  readonly limitations: readonly string[];
  readonly error?: string;
};

declare global {
  interface Window {
    __g3dKiraIk?: Runtime;
    __g3dV8SkinningIk?: Runtime;
  }
}

const APP_ID = "wow-kira-ik-room" as const;
const ORIGINAL_ASSET_URL = "/fixtures/v8/assets/showcase/kira-ik-room.glb";
const ASSET_URL = "/fixtures/v8/assets/showcase/kira-ik-room-animated.glb";
const ORIGINAL_ASSET_ANIMATION_COUNT = 0;
const JOINTS = ["Upperarm_l", "lowerarm_l", "hand_l"] as const;
const FRAME_BOUNDS: CameraFrameBounds = { min: [0.02, -0.58, -1.16], max: [2.05, 2.02, 1.34] };
const MAX_DPR = 2;
const MAX_RENDER_EDGE = 2560;

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport`);
  }

  let size = syncCanvasSize(canvas);
  const startedAt = performance.now();
  let runtime = createRuntime("loading", "Loading Kira IK room", startedAt, size);
  publish(root, runtime);
  drawFallbackFrame(canvas);

  let frameCount = 0;
  let lastNow = 0;
  let animationTime = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = 0;
  let lastUi = 0;
  const motion = createPoseMotionTracker();

  try {
    const renderer = await G3DRenderer.create({
      canvas,
      width: size.width,
      height: size.height,
      preserveDrawingBuffer: true,
      antialias: true,
      clearColor: [0.01, 0.012, 0.018, 1]
    });
    const resizeObserver = new ResizeObserver(() => {
      size = syncCanvasSize(canvas);
      renderer.resize(size.width, size.height);
    });
    resizeObserver.observe(canvas);

    const pipeline = await loadV6GLTFRenderPipeline({
      url: ASSET_URL,
      assetId: APP_ID,
      assetName: "Kira IK Room Animated",
      width: size.width,
      height: size.height,
      rendererInput: {
        qualityPreset: "hdr-studio-preview",
        cameraPolicy: "require",
        cameraFrameBounds: FRAME_BOUNDS,
        frame: { yawRadians: 2.28, pitchRadians: -0.08, paddingRatio: 0.02, fovYRadians: 0.52 },
        postprocess: false
      }
    });
    const animationRuntime = createGLTFSceneAnimationRuntime({
      scene: pipeline.resources.scene,
      clips: pipeline.asset.animations,
      asset: pipeline.asset
    });
    const animationBindings = animationRuntime.inspectClipBindings();
    const selectedAnimation = animationBindings.find((binding) => binding.animatesSkeleton && binding.missingTargetCount === 0)
      ?? animationBindings.find((binding) => binding.animatesSkeleton);
    if (!selectedAnimation) {
      throw new Error("Animated Kira fixture did not expose a bound skeleton animation clip; refusing to fake route-level animation.");
    }
    const initialRenderDiagnostics = createGLTFRenderResourceDiagnostics(pipeline.resources, {
      label: APP_ID,
      suspectStaticNodePattern: /^Kira_/i
    });
    const ikController = animationRuntime.createTwoBoneIKController({
      skinName: "Kira",
      jointNames: JOINTS,
      target: targetAt(0),
      pole: [-0.75, 1.1, 0.9],
      weight: 0.42,
      allowStretch: false,
      apply: true
    });
    const stage = createStage();

    const render = (now: number): void => {
      try {
        if (lastNow === 0) lastNow = now;
        const delta = Math.min(0.08, Math.max(0, (now - lastNow) / 1000));
        lastNow = now;
        animationTime += delta * 2.35;

        const clipName = selectedAnimation.clipName;
        const clipResult = animationRuntime.applyClipByName(clipName, animationTime);
        const target = targetAt(animationTime);
        const ik = ikController.solve({ target, pole: poleAt(animationTime), weight: 0.42, allowStretch: false, apply: true });
        const paletteUpdates = ik.skinningPalettesUpdated + (clipResult?.skinningPalettesUpdated ?? 0);
        const renderDiagnostics = createGLTFRenderResourceDiagnostics(pipeline.resources, {
          label: APP_ID,
          suspectStaticNodePattern: /^Kira_/i
        });
        const motionResult = motion.record(animationTime, pipeline.resources.scene, paletteUpdates, clipResult.tracksApplied);
        const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, size, {
          yawRadians: 2.22 + Math.sin(animationTime * 0.42) * 0.12,
          pitchRadians: -0.08 + Math.sin(animationTime * 0.32) * 0.035,
          paddingRatio: 0.02,
          fovYRadians: 0.52,
          nearPadding: 0.12,
          farPadding: 2.4
        });
        const source: RenderSource = {
          collectRenderItems: () => [
            ...collectImportedItems(pipeline, stage.ikTargetMaterial),
            ...stage.items(target, animationTime)
          ],
          collectedLights: createLights(),
          environmentLighting: DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
          cameraPolicy: "require",
          cameraPosition: frame.cameraPosition,
          cameraFrameBounds: FRAME_BOUNDS,
          frustumCulling: false,
          postprocess: false
        };
        const result = renderer.renderFrame({
          source,
          camera: { viewProjectionMatrix: frame.viewProjectionMatrix, viewMatrix: frame.viewMatrix, projectionMatrix: frame.projectionMatrix },
          metadata: {
            assetId: APP_ID,
            assetName: "Kira IK Room Animated",
            assetUri: ASSET_URL,
            meshCount: pipeline.metadata.meshCount,
            primitiveCount: pipeline.metadata.primitiveCount,
            materialCount: pipeline.metadata.materialCount + stage.materialCount,
            textureCount: pipeline.metadata.textureCount,
            imageCount: pipeline.metadata.imageCount,
            animationCount: pipeline.metadata.animationCount,
            skinCount: pipeline.metadata.skinCount,
            morphTargetCount: pipeline.metadata.morphTargetCount,
            extensionsUsed: pipeline.metadata.extensionsUsed,
            environmentId: "studio-preview",
            hdrEnvironmentUri: "default-gltf-studio-preview"
          }
        });
        frameCount += 1;
        fpsFrames += 1;
        if (fpsFrom === 0) fpsFrom = now;
        if (now - fpsFrom >= 500) {
          fps = fpsFrames * 1000 / (now - fpsFrom);
          fpsFrames = 0;
          fpsFrom = now;
        }

        runtime = {
          appId: APP_ID,
          status: frameCount === 1 ? "ready" : "running",
          statusLabel: frameCount === 1 ? "Ready" : "Running",
          frameCount,
          drawCalls: result.diagnostics.drawCalls,
          fps,
          elapsedMs: Math.round(performance.now() - startedAt),
          width: size.width,
          height: size.height,
          skinName: ik.skinName,
          jointNames: ik.jointNames,
          target,
          endEffector: ik.solution.end,
          endEffectorDistance: ik.solution.endDistanceToTarget,
          reached: ik.solution.reached,
          stretched: ik.solution.stretched,
          skinningPalettesUpdated: paletteUpdates,
          ikApplied: ik.applied,
          animationTracksApplied: clipResult?.tracksApplied ?? 0,
          animationMissingTargets: clipResult?.missingTargets ?? [],
          skinnedDrawItems: renderDiagnostics.skinnedDrawItems,
          texturedDrawItems: renderDiagnostics.texturedDrawItems,
          texturedSkinnedDrawItems: renderDiagnostics.texturedSkinnedDrawItems,
          untexturedSkinnedDrawItems: renderDiagnostics.untexturedSkinnedDrawItems,
          fallbackWhiteDrawItems: renderDiagnostics.fallbackWhiteDrawItems,
          staticKiraMeshLabels: renderDiagnostics.suspectStaticLabels,
          characterMotion: motionResult.poseDelta,
          motionSamples: motionResult.samples,
          motionTimeRange: motionResult.timeRange,
          poseDiversityScore: motionResult.diversity,
          motionHealthy: motionResult.healthy,
          animationCount: pipeline.metadata.animationCount,
          clipName,
          animationBindingTracks: selectedAnimation.trackCount,
          animationBoundTracks: selectedAnimation.boundTrackCount,
          originalAnimationCount: ORIGINAL_ASSET_ANIMATION_COUNT,
          textureCount: pipeline.metadata.textureCount,
          materialCount: pipeline.metadata.materialCount + stage.materialCount,
          meshCount: pipeline.metadata.meshCount,
          loadMs: Math.round(performance.now() - startedAt),
          fixture: "imported kira-ik-room-animated.glb authored clip + skeleton IK",
          limitations: [
            `The original source Kira GLB (${ORIGINAL_ASSET_URL}) has skin data but ${ORIGINAL_ASSET_ANIMATION_COUNT} authored animation clips; this route uses a generated optimized copy with a real Kira_Attention_Reach clip.`,
            "IK is applied at conservative weight because full-weight imported-skeleton solving can visibly over-stretch this asset.",
            ...diagnosticLimitations(initialRenderDiagnostics),
            "This is still a route-authored IK pass layered on an imported authored skeletal clip, not the same original Three.js IK demo rig."
          ]
        };
        window.__g3dKiraIk = runtime;
        window.__g3dV8SkinningIk = runtime;
        if (frameCount === 1 || now - lastUi > 220) {
          publish(root, runtime);
          lastUi = now;
        }
        requestAnimationFrame(render);
      } catch (error) {
        runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
        publish(root, runtime);
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
    publish(root, runtime);
  }
}

function collectImportedItems(pipeline: LoadedPipeline, ikTargetMaterial: Material): readonly RenderItem[] {
  const items: RenderItem[] = [];
  pipeline.resources.scene.updateWorldTransforms();
  for (const { node, renderable } of pipeline.resources.scene.collectRenderables()) {
    const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
    const material = isKiraIkTarget(node.name, renderable.geometry)
      ? ikTargetMaterial
      : pipeline.resources.materialLibrary.get(renderable.material);
    if (!geometry || !material) continue;
    const morphTargets = pipeline.resources.morphTargetLibrary.get(renderable.geometry);
    items.push({
      label: `kira-room:${node.name}`,
      geometry,
      material,
      modelMatrix: node.transform.worldMatrix,
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
}

function createStage(): {
  readonly materialCount: number;
  readonly ikTargetMaterial: Material;
  readonly items: (target: readonly [number, number, number], timeSeconds: number) => readonly RenderItem[];
} {
  const sphere = Geometry.uvSphere(0.072, 32, 16);
  const cube = Geometry.litCube(1);
  const ikTargetMaterial = new PBRMaterial({
    name: "kira-transparent-ik-target",
    baseColor: [0.12, 0.92, 1, 0.34],
    roughness: 0.12,
    metallic: 0.05,
    transmissionFactor: 0.34,
    emissiveColor: [0.02, 0.25, 0.34],
    emissiveStrength: 1.45,
    renderState: { blend: true, depthWrite: false, cullMode: "none" }
  });
  const path = new PBRMaterial({
    name: "kira-motion-path",
    baseColor: [0.4, 0.9, 1, 0.72],
    roughness: 0.28,
    metallic: 0.04,
    emissiveColor: [0.04, 0.28, 0.46],
    emissiveStrength: 1.2,
    renderState: { blend: true, depthWrite: false }
  });
  const floorLight = new PBRMaterial({
    name: "kira-floor-motion-light",
    baseColor: [0.08, 0.5, 0.78, 0.85],
    roughness: 0.22,
    metallic: 0.1,
    emissiveColor: [0.02, 0.16, 0.24],
    emissiveStrength: 1.6
  });
  return {
    materialCount: 3,
    ikTargetMaterial,
    items: (target, timeSeconds) => {
      const transforms: Mat4[] = [];
      for (let index = 0; index < 16; index += 1) {
        const t = targetAt(Math.max(0, timeSeconds - index * 0.12));
        const scale = 1 - index * 0.04;
        transforms.push(composeMat4(t, [0, 0, 0, 1], [scale, scale, scale]));
      }
      const scanlineTransforms: Mat4[] = [];
      for (let index = 0; index < 9; index += 1) {
        const pulse = (Math.sin(timeSeconds * 1.7 + index * 0.8) + 1) * 0.5;
        scanlineTransforms.push(composeMat4([-1.3 + index * 0.32, 0.025, 0.82], [0, 0, 0, 1], [0.18, 0.012, 0.012 + pulse * 0.035]));
      }
      return [
        { label: "kira-ik-target-current", geometry: sphere, material: ikTargetMaterial, modelMatrix: composeMat4(target, [0, 0, 0, 1], [1.8, 1.8, 1.8]) },
        { label: "kira-ik-target-path", geometry: sphere, material: path, modelMatrix: composeMat4([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]), instanceTransforms: flattenMatrices(transforms) },
        { label: "kira-floor-scanlines", geometry: cube, material: floorLight, modelMatrix: composeMat4([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]), instanceTransforms: flattenMatrices(scanlineTransforms) }
      ];
    }
  };
}

function targetAt(timeSeconds: number): readonly [number, number, number] {
  return [
    0.54 + Math.sin(timeSeconds * 1.28) * 0.34,
    1.16 + Math.sin(timeSeconds * 1.76) * 0.22,
    0.42 + Math.cos(timeSeconds * 1.04) * 0.28
  ];
}

function poleAt(timeSeconds: number): readonly [number, number, number] {
  return [0.28 + Math.sin(timeSeconds * 0.42) * 0.12, 1.38, 0.9];
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("kira-key-light");
  key.intensity = 3.2;
  key.color = [1, 0.92, 0.82];
  const fill = new DirectionalLight("kira-fill-light");
  fill.intensity = 1.05;
  fill.color = [0.45, 0.72, 1];
  const rim = new DirectionalLight("kira-rim-light");
  rim.intensity = 1.0;
  rim.color = [0.65, 0.95, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.1, 3.2, 2.4], direction: [-0.35, -0.65, -0.55], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-1.8, 1.9, 1.2], direction: [0.42, -0.32, 0.35], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill },
    { kind: "directional", color: rim.color, intensity: rim.intensity, position: [-1.2, 2.4, -2.2], direction: [-0.12, -0.24, 0.9], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: rim }
  ];
}

function createPoseMotionTracker(): {
  record(time: number, scene: LoadedPipeline["resources"]["scene"], updated: number, tracksApplied: number): {
    readonly samples: number;
    readonly timeRange: number;
    readonly poseDelta: number;
    readonly diversity: number;
    readonly healthy: boolean;
  };
} {
  const jointNames = ["spine_03", "head", "Upperarm_l", "lowerarm_l", "hand_l"] as const;
  const samples: { readonly time: number; readonly pose: readonly number[]; readonly updated: number; readonly tracksApplied: number }[] = [];
  return {
    record(time, scene, updated, tracksApplied) {
      scene.updateWorldTransforms();
      const pose = jointNames.flatMap((jointName) => {
        const node = scene.findByName(jointName)[0];
        if (!node) return [0, 0, 0];
        const matrix = node.transform.worldMatrix;
        return [matrix[12], matrix[13], matrix[14]];
      });
      samples.push({ time, pose, updated, tracksApplied });
      while (samples.length > 48) samples.shift();
      const first = samples[0];
      const last = samples[samples.length - 1];
      const timeRange = first && last ? last.time - first.time : 0;
      let diversity = 0;
      let poseDelta = 0;
      for (let index = 1; index < samples.length; index += 1) {
        const a = samples[index - 1]!.pose;
        const b = samples[index]!.pose;
        let frameDelta = 0;
        for (let component = 0; component < Math.min(a.length, b.length); component += 1) {
          frameDelta += Math.abs(a[component]! - b[component]!);
        }
        poseDelta = frameDelta;
        diversity += frameDelta;
      }
      return {
        samples: samples.length,
        timeRange,
        poseDelta,
        diversity,
        healthy: samples.length >= 6 && timeRange > 0.2 && diversity > 0.025 && samples.some((sample) => sample.updated > 0 && sample.tracksApplied > 0)
      };
    }
  };
}

function syncCanvasSize(canvas: HTMLCanvasElement): { readonly width: number; readonly height: number } {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width || window.innerWidth || 1280);
  const cssHeight = Math.max(1, rect.height || window.innerHeight || 720);
  const dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
  const edgeScale = Math.min(1, MAX_RENDER_EDGE / Math.max(cssWidth * dpr, cssHeight * dpr));
  const width = Math.round(cssWidth * dpr * edgeScale);
  const height = Math.round(cssHeight * dpr * edgeScale);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}

function drawFallbackFrame(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.01, 0.012, 0.018, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function createRuntime(
  status: Runtime["status"],
  statusLabel: string,
  startedAt: number,
  size: { readonly width?: number; readonly height?: number }
): Runtime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: 0,
    drawCalls: 0,
    fps: 0,
    elapsedMs: Math.round(performance.now() - startedAt),
    width: size.width ?? 0,
    height: size.height ?? 0,
    skinName: "pending",
    jointNames: JOINTS,
    target: targetAt(0),
    endEffector: [0, 0, 0],
    endEffectorDistance: 0,
    reached: false,
    stretched: false,
    skinningPalettesUpdated: 0,
    ikApplied: false,
    animationTracksApplied: 0,
    animationMissingTargets: [],
    skinnedDrawItems: 0,
    texturedDrawItems: 0,
    texturedSkinnedDrawItems: 0,
    untexturedSkinnedDrawItems: 0,
    fallbackWhiteDrawItems: 0,
    staticKiraMeshLabels: [],
    characterMotion: 0,
    motionSamples: 0,
    motionTimeRange: 0,
    poseDiversityScore: 0,
    motionHealthy: false,
    animationCount: 0,
    clipName: "pending",
    animationBindingTracks: 0,
    animationBoundTracks: 0,
    originalAnimationCount: ORIGINAL_ASSET_ANIMATION_COUNT,
    textureCount: 0,
    materialCount: 0,
    meshCount: 0,
    loadMs: Math.round(performance.now() - startedAt),
    fixture: "imported kira-ik-room-animated.glb authored clip + skeleton IK",
    limitations: [
      `The original source Kira GLB (${ORIGINAL_ASSET_URL}) has skin data but ${ORIGINAL_ASSET_ANIMATION_COUNT} authored animation clips; this route uses a generated optimized copy with a real Kira_Attention_Reach clip.`,
      "IK is applied at conservative weight because full-weight imported-skeleton solving can visibly over-stretch this asset."
    ]
  };
}

function publish(root: HTMLElement, runtime: Runtime): void {
  window.__g3dKiraIk = runtime;
  window.__g3dV8SkinningIk = runtime;
  root.innerHTML = `
    <section class="panel">
      <span class="status" data-state="${runtime.status}">${escapeHtml(runtime.statusLabel)}</span>
      <h1>Kira IK Room</h1>
      <p>Optimized Kira room GLB with an imported skeletal clip, conservative applied IK target, and explicit load/runtime telemetry.</p>
      <div class="grid">
        ${metric("Frames", runtime.frameCount)}
        ${metric("FPS", runtime.fps.toFixed(1))}
        ${metric("Draw calls", runtime.drawCalls)}
        ${metric("Render size", `${runtime.width}x${runtime.height}`)}
        ${metric("Palettes", runtime.skinningPalettesUpdated)}
        ${metric("IK", runtime.ikApplied ? "applied" : "warming")}
        ${metric("Skinned", `${runtime.texturedSkinnedDrawItems}/${runtime.skinnedDrawItems}`)}
        ${metric("Fallback white", runtime.fallbackWhiteDrawItems)}
        ${metric("Character", runtime.characterMotion > 0.025 ? "moving" : "warming")}
        ${metric("Motion", runtime.motionHealthy ? "healthy" : "warming")}
        ${metric("Clip", runtime.clipName)}
        ${metric("Bound tracks", `${runtime.animationBoundTracks}/${runtime.animationBindingTracks}`)}
        ${metric("Original clips", runtime.originalAnimationCount)}
        ${metric("Load", `${runtime.loadMs}ms`)}
        ${metric("Textures", runtime.textureCount)}
      </div>
      <label>IK target X <input type="range" min="-1.2" max="0.35" step="0.01" value="${runtime.target[0].toFixed(2)}" disabled></label>
      <label>IK target Y <input type="range" min="0.6" max="1.5" step="0.01" value="${runtime.target[1].toFixed(2)}" disabled></label>
      ${runtime.error ? `<pre>${escapeHtml(runtime.error)}</pre>` : ""}
    </section>
  `;
}

function diagnosticLimitations(diagnostics: ReturnType<typeof createGLTFRenderResourceDiagnostics>): readonly string[] {
  const limitations: string[] = [];
  if (diagnostics.suspectStaticLabels.length > 0) {
    limitations.push(`The optimized Kira fixture still has unskinned Kira mesh nodes that cannot deform with the skeleton: ${diagnostics.suspectStaticLabels.join(", ")}.`);
  }
  if (diagnostics.fallbackWhiteDrawItems > 0) {
    limitations.push(`The imported GLB still has ${diagnostics.fallbackWhiteDrawItems} default/fallback white draw item(s); the route replaces the IK target material at render time.`);
  }
  if (diagnostics.texturedSkinnedDrawItems < diagnostics.skinnedDrawItems) {
    limitations.push("Not every skinned Kira draw item has a validated base-color texture binding; material diagnostics should remain part of the acceptance gate.");
  }
  return limitations;
}

function metric(label: string, value: string | number): string {
  return `<div class="metric"><b>${escapeHtml(label)}</b><span>${escapeHtml(String(value))}</span></div>`;
}

function flattenMatrices(matrices: readonly Mat4[]): Float32Array {
  const data = new Float32Array(matrices.length * 16);
  matrices.forEach((matrix, index) => data.set(matrix, index * 16));
  return data;
}

function isKiraIkTarget(nodeName: string, geometryName: string): boolean {
  return nodeName === "boule" || geometryName === "Sphere.003";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
