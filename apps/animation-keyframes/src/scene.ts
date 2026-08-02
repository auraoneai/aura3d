import {
  DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
  createGLTFSceneAnimationMixer,
  loadProductionGLTFRenderPipeline,
  type GLTFSceneAnimationApplyResult
} from "@aura3d/assets";
import {
  Geometry,
  PBRMaterial,
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { DirectionalLight, composeMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { ASSET_URL, type CurrentRoutesKeyframeControls } from "./state.js";

type LoadedPipeline = Awaited<ReturnType<typeof loadProductionGLTFRenderPipeline>>;
type AnimationRuntime = ReturnType<typeof createGLTFSceneAnimationMixer>;
type RouteA3DRenderer = Awaited<ReturnType<typeof A3DRenderer.create>>;

const FRAME_BOUNDS: CameraFrameBounds = { min: [-0.9, -0.12, -0.9], max: [0.9, 2.15, 0.9] };
const WIDTH = 1280;
const HEIGHT = 720;
const ASSET_TIMEOUT_MS = 5000;

export interface CurrentRoutesKeyframeScene {
  readonly renderer: RouteA3DRenderer;
  readonly pipeline: LoadedPipeline;
  readonly animationRuntime: AnimationRuntime;
  readonly clips: readonly LoadedPipeline["asset"]["animations"][number][];
  render(controls: CurrentRoutesKeyframeControls, timeSeconds: number): CurrentRoutesKeyframeFrame;
}

export interface CurrentRoutesKeyframeFrame {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly apply: GLTFSceneAnimationApplyResult;
}

export async function createCurrentRoutesKeyframeScene(canvas: HTMLCanvasElement): Promise<CurrentRoutesKeyframeScene> {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  drawFallbackFrame(canvas);

  const renderer = await A3DRenderer.create({
    canvas,
    width: WIDTH,
    height: HEIGHT,
    preserveDrawingBuffer: true,
    clearColor: [0.005, 0.008, 0.013, 1]
  });

  const pipeline = await withTimeout(loadProductionGLTFRenderPipeline({
    url: ASSET_URL,
    assetId: "animation-keyframes-robot",
    assetName: "Robot Expressive Keyframes",
    width: WIDTH,
    height: HEIGHT,
    rendererInput: {
      cameraPolicy: "require",
      cameraFrameBounds: FRAME_BOUNDS,
      frame: { yawRadians: -0.38, pitchRadians: -0.08, paddingRatio: 0.1, fovYRadians: 0.54 },
      postprocess: false
    }
  }), ASSET_TIMEOUT_MS, `Timed out loading ${ASSET_URL}`);

  const animationRuntime = createGLTFSceneAnimationMixer({
    scene: pipeline.resources.scene,
    clips: pipeline.asset.animations,
    asset: pipeline.asset,
    autoPlay: false
  });
  const stage = createStageItems();

  return {
    renderer,
    pipeline,
    animationRuntime,
    clips: pipeline.asset.animations,
    render: (controls, timeSeconds) => {
      const clip = selectClip(pipeline.asset.animations, controls.clipName);
      const clipTime = clip.duration > 0 ? timeSeconds % clip.duration : 0;
      animationRuntime.playExclusive(clip.name, {
        weight: 1,
        timeScale: controls.playing ? Math.max(0, controls.speed) : 0,
        loopMode: "repeat"
      });
      animationRuntime.seek(clip.name, clipTime);
      if (controls.playing) {
        animationRuntime.resume(clip.name);
      } else {
        animationRuntime.pause(clip.name);
      }
      const apply = animationRuntime.update(0).applyResult;
      const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: WIDTH, height: HEIGHT }, {
        yawRadians: controls.orbitYaw,
        pitchRadians: -0.08,
        paddingRatio: 0.1,
        fovYRadians: 0.54,
        nearPadding: 0.18,
        farPadding: 2.2
      });
      const placement = composeMat4([0, 0, 0], [0, 0.05, 0, 0.9987], [0.2, 0.2, 0.2]);
      const source: RenderSource = {
        collectRenderItems: () => [
          ...collectImportedItems(pipeline, placement),
          ...stage.items(timeSeconds)
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
        camera: {
          viewProjectionMatrix: frame.viewProjectionMatrix,
          viewMatrix: frame.viewMatrix,
          projectionMatrix: frame.projectionMatrix
        },
        metadata: {
          assetId: "animation-keyframes",
          assetName: "CurrentRoutes Animation Keyframes",
          assetUri: "/apps/animation-keyframes/",
          meshCount: pipeline.metadata.meshCount,
          primitiveCount: pipeline.metadata.primitiveCount,
          materialCount: pipeline.metadata.materialCount + stage.materialCount,
          textureCount: pipeline.metadata.textureCount,
          imageCount: pipeline.metadata.imageCount,
          animationCount: pipeline.metadata.animationCount,
          skinCount: pipeline.metadata.skinCount,
          morphTargetCount: pipeline.metadata.morphTargetCount,
          extensionsUsed: pipeline.metadata.extensionsUsed,
          environmentId: "current-routes-fast-studio",
          hdrEnvironmentUri: "deferred"
        }
      });
      return {
        drawCalls: result.diagnostics.drawCalls,
        triangles: Math.floor(pipeline.metadata.indexCount / 3),
        apply
      };
    }
  };
}

function selectClip(clips: CurrentRoutesKeyframeScene["clips"], requested: string): CurrentRoutesKeyframeScene["clips"][number] {
  return clips.find((clip) => clip.name === requested)
    ?? clips.find((clip) => /dance|walk|run/i.test(clip.name))
    ?? clips[0]!;
}

function collectImportedItems(pipeline: LoadedPipeline, placement: Mat4): readonly RenderItem[] {
  const items: RenderItem[] = [];
  pipeline.resources.scene.updateWorldTransforms();
  for (const { node, renderable } of pipeline.resources.scene.collectRenderables()) {
    const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
    const material = pipeline.resources.materialLibrary.get(renderable.material);
    if (!geometry || !material) continue;
    const morphTargets = pipeline.resources.morphTargetLibrary.get(renderable.geometry);
    items.push({
      label: `current-routes-keyframes:${node.name}`,
      geometry,
      material,
      modelMatrix: multiplyMat4(placement, node.transform.worldMatrix),
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
}

function createStageItems(): { readonly materialCount: number; readonly items: (time: number) => readonly RenderItem[] } {
  const cube = Geometry.litCube(1);
  const floor = new PBRMaterial({ name: "current-routes-keyframes-floor", baseColor: [0.055, 0.075, 0.09, 1], roughness: 0.38, metallic: 0.05, environmentIntensity: 0.8 });
  const wall = new PBRMaterial({ name: "current-routes-keyframes-wall", baseColor: [0.018, 0.024, 0.032, 1], roughness: 0.5, metallic: 0, environmentIntensity: 0.5 });
  const cyan = new PBRMaterial({ name: "current-routes-keyframes-cyan", baseColor: [0.06, 0.75, 0.86, 1], roughness: 0.26, metallic: 0.2, emissiveColor: [0.02, 0.16, 0.18], emissiveStrength: 1.2 });
  const amber = new PBRMaterial({ name: "current-routes-keyframes-amber", baseColor: [1, 0.48, 0.16, 1], roughness: 0.3, metallic: 0.12, emissiveColor: [0.22, 0.08, 0.01], emissiveStrength: 1.1 });
  return {
    materialCount: 4,
    items: (time) => {
      const sweep = Math.sin(time * 1.4) * 0.55;
      return [
        { label: "current-routes-keyframes-floor", geometry: cube, material: floor, modelMatrix: composeMat4([0, -0.07, 0], [0, 0, 0, 1], [3.2, 0.04, 2.2]) },
        { label: "current-routes-keyframes-back", geometry: cube, material: wall, modelMatrix: composeMat4([0, 0.78, -0.92], [0, 0, 0, 1], [3.2, 1.75, 0.04]) },
        { label: "current-routes-keyframes-moving-cyan", geometry: cube, material: cyan, modelMatrix: composeMat4([-1.15 + sweep, 0.45, -0.55], [0, 0, 0, 1], [0.08, 0.7, 0.08]) },
        { label: "current-routes-keyframes-moving-amber", geometry: cube, material: amber, modelMatrix: composeMat4([1.12 - sweep * 0.7, 0.36, -0.52], [0, 0, 0, 1], [0.08, 0.55, 0.08]) }
      ];
    }
  };
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("current-routes-keyframes-key");
  key.intensity = 4.5;
  key.color = [1, 0.94, 0.84];
  const fill = new DirectionalLight("current-routes-keyframes-fill");
  fill.intensity = 2.1;
  fill.color = [0.55, 0.74, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.4, 3.4, 2.2], direction: [-0.42, -0.72, -0.52], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-2.5, 2.1, -1.6], direction: [0.62, -0.34, 0.7], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill }
  ];
}

export function drawFallbackFrame(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.006, 0.009, 0.015, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.SCISSOR_TEST);
  drawRect(gl, 0, 0, canvas.width, Math.round(canvas.height * 0.24), [0.018, 0.027, 0.038, 1]);
  drawRect(gl, Math.round(canvas.width * 0.18), Math.round(canvas.height * 0.3), Math.round(canvas.width * 0.16), Math.round(canvas.height * 0.42), [0.05, 0.55, 0.78, 1]);
  drawRect(gl, Math.round(canvas.width * 0.42), Math.round(canvas.height * 0.24), Math.round(canvas.width * 0.17), Math.round(canvas.height * 0.5), [0.86, 0.91, 0.96, 1]);
  drawRect(gl, Math.round(canvas.width * 0.68), Math.round(canvas.height * 0.36), Math.round(canvas.width * 0.11), Math.round(canvas.height * 0.35), [0.95, 0.48, 0.17, 1]);
  gl.disable(gl.SCISSOR_TEST);
}

function drawRect(gl: WebGL2RenderingContext, x: number, y: number, width: number, height: number, color: readonly [number, number, number, number]): void {
  gl.scissor(x, y, width, height);
  gl.clearColor(color[0], color[1], color[2], color[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}
