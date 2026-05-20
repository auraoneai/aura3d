import {
  Geometry,
  PBRMaterial,
  computePerspectiveCameraFrame,
  createStereoEffectPlan,
  createStereoCameraRig,
  type CameraFrameBounds,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/v9";
import { DirectionalLight, composeMat4, quatFromEuler } from "@galileo3d/scene";
import { bindStereoControls, DEFAULT_STEREO_CONTROLS, type StereoControlState } from "./stereoControls";

declare global {
  interface Window {
    __g3dV8StereoEffects?: V8StereoRuntime;
  }
}

type RuntimeStatus = "loading" | "ready" | "running" | "error";

interface V8StereoRuntime {
  readonly status: RuntimeStatus;
  readonly appId: "v8-stereo-effects";
  readonly statusLabel: string;
  readonly drawCalls: number;
  readonly frameCount: number;
  readonly leftDrawCalls: number;
  readonly rightDrawCalls: number;
  readonly ipd: number;
  readonly convergence: number;
  readonly appliedConvergence: number;
  readonly parallax: number;
  readonly mode: string;
  readonly visibleDifference: number;
  readonly stereoRigSource: "public-createStereoCameraRig";
  readonly stereoRigViews: number;
  readonly effectPlanSource: "public-createStereoEffectPlan";
  readonly effectComposition: string;
  readonly rendererStatus: "pending" | "ready" | "error";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "v8-stereo-effects" as const;
const SIZE = 720;
const FRAME_BOUNDS: CameraFrameBounds = { min: [-1.55, -0.85, -1.35], max: [1.55, 1.45, 1.35] };

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const leftCanvas = document.getElementById("leftViewport");
  const rightCanvas = document.getElementById("rightViewport");
  if (!(root instanceof HTMLElement) || !(leftCanvas instanceof HTMLCanvasElement) || !(rightCanvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app, #leftViewport, and #rightViewport.`);
  }
  leftCanvas.width = SIZE;
  leftCanvas.height = SIZE;
  rightCanvas.width = SIZE;
  rightCanvas.height = SIZE;

  const startedAt = performance.now();
  let controls: StereoControlState = DEFAULT_STEREO_CONTROLS;
  let runtime: V8StereoRuntime = {
    status: "loading",
    appId: APP_ID,
    statusLabel: "Loading",
    drawCalls: 0,
    frameCount: 0,
    leftDrawCalls: 0,
    rightDrawCalls: 0,
    ipd: controls.ipd,
    convergence: controls.convergence,
    appliedConvergence: controls.convergence,
    parallax: controls.parallax,
    mode: controls.mode,
    visibleDifference: 0,
    stereoRigSource: "public-createStereoCameraRig",
    stereoRigViews: 0,
    effectPlanSource: "public-createStereoEffectPlan",
    effectComposition: "dual-canvas",
    rendererStatus: "pending",
    elapsedMs: 0
  };
  const update = (patch: Partial<V8StereoRuntime>): void => {
    runtime = { ...runtime, ...patch, elapsedMs: Math.round(performance.now() - startedAt) };
    publish(root, runtime, controls);
  };
  const getControls = bindStereoControls(root, (next) => {
    controls = next;
    update({ ipd: next.ipd, convergence: next.convergence, parallax: next.parallax, mode: next.mode });
  });

  try {
    const [leftRenderer, rightRenderer] = await Promise.all([
      G3DRenderer.create({ canvas: leftCanvas, width: SIZE, height: SIZE, preserveDrawingBuffer: true, clearColor: [0.015, 0.018, 0.024, 1] }),
      G3DRenderer.create({ canvas: rightCanvas, width: SIZE, height: SIZE, preserveDrawingBuffer: true, clearColor: [0.015, 0.018, 0.024, 1] })
    ]);
    update({ rendererStatus: "ready", statusLabel: "Renderer ready" });
    const leftResources = createResources();
    const rightResources = createResources();
    const createSource = (resources: StereoResources): RenderSource => ({
      collectRenderItems: () => createItems(resources, runtime.frameCount, getControls().mode),
      collectedLights: createLights(),
      cameraPolicy: "require",
      environmentLighting: {
        color: [0.74, 0.78, 0.86],
        intensity: 0.44,
        proceduralMap: {
          skyColor: [0.52, 0.68, 0.94],
          horizonColor: [0.95, 0.78, 0.5],
          groundColor: [0.1, 0.12, 0.16],
          specularColor: [0.95, 0.92, 1],
          intensity: 0.45,
          specularIntensity: 0.82
        }
      },
      frustumCulling: false,
      postprocess: false
    });
    const metadata = {
      assetId: APP_ID,
      assetName: "V8 Stereo Fixture",
      assetUri: "/apps/v8-stereo-effects/",
      meshCount: 11,
      primitiveCount: 11,
      materialCount: 7,
      textureCount: 0,
      imageCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      extensionsUsed: ["G3D_stereo_camera_rig"]
    };
    const baseFrame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: SIZE, height: SIZE }, {
      yawRadians: -0.42,
      pitchRadians: -0.12,
      paddingRatio: 0.12,
      fovYRadians: 0.64,
      nearPadding: 0.16,
      farPadding: 2.6
    });

    const render = (now: number): void => {
      try {
        void now;
        controls = getControls();
        const appliedConvergence = Math.max(controls.convergence, baseFrame.near + 0.25);
        const effectPlan = createStereoEffectPlan({
          mode: controls.mode === "anaglyph-preview" ? "anaglyph" : "side-by-side",
          width: SIZE * 2,
          height: SIZE,
          eyeSeparation: controls.ipd,
          convergenceDistance: appliedConvergence,
          parallaxStrength: controls.parallax
        });
        const stereoRig = createStereoCameraRig({
          frame: baseFrame,
          viewport: { x: 0, y: 0, width: SIZE * 2, height: SIZE },
          eyeSeparation: controls.ipd * Math.max(0.01, controls.parallax),
          convergenceDistance: appliedConvergence,
          layout: "side-by-side"
        });
        const [leftEye, rightEye] = stereoRig.views;
        const leftResult = leftRenderer.renderFrame({
          source: { ...createSource(leftResources), cameraPosition: leftEye.cameraPosition },
          camera: { viewProjectionMatrix: leftEye.viewProjectionMatrix, viewMatrix: leftEye.viewMatrix, projectionMatrix: leftEye.projectionMatrix },
          metadata
        });
        const rightResult = rightRenderer.renderFrame({
          source: { ...createSource(rightResources), cameraPosition: rightEye.cameraPosition },
          camera: { viewProjectionMatrix: rightEye.viewProjectionMatrix, viewMatrix: rightEye.viewMatrix, projectionMatrix: rightEye.projectionMatrix },
          metadata
        });
        const nextFrame = runtime.frameCount + 1;
        runtime = {
          ...runtime,
          status: nextFrame === 1 ? "ready" : "running",
          statusLabel: nextFrame === 1 ? "Ready" : "Running",
          drawCalls: leftResult.diagnostics.drawCalls + rightResult.diagnostics.drawCalls,
          leftDrawCalls: leftResult.diagnostics.drawCalls,
          rightDrawCalls: rightResult.diagnostics.drawCalls,
          frameCount: nextFrame,
          ipd: controls.ipd,
          convergence: controls.convergence,
          appliedConvergence,
          parallax: controls.parallax,
          mode: controls.mode,
          visibleDifference: Number((controls.ipd * controls.parallax * 100).toFixed(2)),
          stereoRigSource: "public-createStereoCameraRig",
          stereoRigViews: stereoRig.views.length,
          effectPlanSource: "public-createStereoEffectPlan",
          effectComposition: effectPlan.composition,
          elapsedMs: Math.round(performance.now() - startedAt)
        };
        window.__g3dV8StereoEffects = runtime;
        if (nextFrame === 1 || nextFrame % 10 === 0) publish(root, runtime, controls);
        requestAnimationFrame(render);
      } catch (error) {
        update({ status: "error", statusLabel: "Error", rendererStatus: "error", error: formatError(error) });
      }
    };

    publish(root, runtime, controls);
    requestAnimationFrame(render);
  } catch (error) {
    update({ status: "error", statusLabel: "Error", rendererStatus: "error", error: formatError(error) });
  }
}

interface StereoResources {
  readonly cube: Geometry;
  readonly sphere: Geometry;
  readonly cylinder: Geometry;
  readonly floor: PBRMaterial;
  readonly red: PBRMaterial;
  readonly cyan: PBRMaterial;
  readonly brass: PBRMaterial;
  readonly glass: PBRMaterial;
  readonly dark: PBRMaterial;
}

function createResources(): StereoResources {
  return {
    cube: Geometry.litCube(1),
    sphere: Geometry.uvSphere(0.5, 48, 24),
    cylinder: Geometry.cylinder({ radius: 0.5, height: 1, segments: 48 }),
    floor: new PBRMaterial({ name: "stereo-floor", baseColor: [0.08, 0.09, 0.105, 1], roughness: 0.58 }),
    red: new PBRMaterial({ name: "stereo-red-eye", baseColor: [0.86, 0.12, 0.11, 1], roughness: 0.3, clearcoatFactor: 0.28 }),
    cyan: new PBRMaterial({ name: "stereo-cyan-eye", baseColor: [0.1, 0.66, 0.85, 1], roughness: 0.3, clearcoatFactor: 0.28 }),
    brass: new PBRMaterial({ name: "stereo-brass", baseColor: [0.82, 0.58, 0.22, 1], metallic: 0.35, roughness: 0.28 }),
    glass: new PBRMaterial({ name: "stereo-glass", baseColor: [0.62, 0.78, 1, 1], roughness: 0.12, clearcoatFactor: 0.65, transmissionFactor: 0.12 }),
    dark: new PBRMaterial({ name: "stereo-dark", baseColor: [0.12, 0.16, 0.22, 1], metallic: 0.08, roughness: 0.44 })
  };
}

function createItems(resources: StereoResources, frameCount: number, mode: string): readonly RenderItem[] {
  const t = frameCount * 0.018;
  const leftMaterial = mode === "anaglyph-preview" ? resources.red : resources.cyan;
  const rightMaterial = mode === "anaglyph-preview" ? resources.cyan : resources.red;
  return [
    { label: "stereo-floor", geometry: resources.cube, material: resources.floor, modelMatrix: composeMat4([0, -0.68, 0], [0, 0, 0, 1], [3.6, 0.05, 2.6]) },
    { label: "stereo-back", geometry: resources.cube, material: resources.dark, modelMatrix: composeMat4([0, 0.4, -1.25], [0, 0, 0, 1], [3.6, 1.9, 0.05]) },
    { label: "left-parallax-column", geometry: resources.cylinder, material: leftMaterial, modelMatrix: composeMat4([-0.78, -0.18, -0.32], quatFromEuler(0, 0, 0), [0.16, 0.82, 0.16]) },
    { label: "right-parallax-column", geometry: resources.cylinder, material: rightMaterial, modelMatrix: composeMat4([0.78, -0.18, -0.32], quatFromEuler(0, 0, 0), [0.16, 0.82, 0.16]) },
    { label: "center-orb", geometry: resources.sphere, material: resources.glass, modelMatrix: composeMat4([0, 0.35 + Math.sin(t) * 0.05, 0], quatFromEuler(0, t, 0), [0.72, 0.72, 0.72]) },
    { label: "near-marker", geometry: resources.cube, material: resources.brass, modelMatrix: composeMat4([Math.sin(t) * 0.42, -0.28, 0.86], quatFromEuler(0.2, t, 0.1), [0.28, 0.28, 0.28]) },
    { label: "far-marker-a", geometry: resources.sphere, material: resources.red, modelMatrix: composeMat4([-1.05, -0.12, -0.82], [0, 0, 0, 1], [0.22, 0.22, 0.22]) },
    { label: "far-marker-b", geometry: resources.sphere, material: resources.cyan, modelMatrix: composeMat4([1.05, -0.12, -0.82], [0, 0, 0, 1], [0.22, 0.22, 0.22]) }
  ];
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("v8-stereo-key");
  key.intensity = 3.2;
  key.color = [1, 0.94, 0.86];
  const rim = new DirectionalLight("v8-stereo-rim");
  rim.intensity = 1.7;
  rim.color = [0.58, 0.72, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.1, 3.2, 2.5], direction: [-0.42, -0.74, -0.45], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: rim.color, intensity: rim.intensity, position: [-2.6, 1.8, 1.1], direction: [0.58, -0.28, -0.58], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: rim }
  ];
}

function publish(root: HTMLElement, runtime: V8StereoRuntime, controls: StereoControlState): void {
  window.__g3dV8StereoEffects = runtime;
  const statusClass = runtime.status === "error" ? "is-error" : runtime.status === "loading" ? "is-loading" : "is-running";
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V8 Stereo Effects</h1>
        <p>Dual G3D WebGL2 renderers draw a stereo camera rig with live IPD and parallax controls.</p>
      </div>
      <button id="runtime-state" class="${statusClass}" type="button" disabled>${escapeHtml(runtime.statusLabel)}</button>
    </section>
    <section class="metrics">
      <span>${escapeHtml(runtime.status)}</span>
      <span>${runtime.drawCalls} draw calls</span>
      <span>${runtime.frameCount} frames</span>
      <span>${runtime.leftDrawCalls}/${runtime.rightDrawCalls} L/R calls</span>
      <span>IPD ${runtime.ipd.toFixed(2)}</span>
      <span>converge ${runtime.convergence.toFixed(1)}</span>
      <span>applied ${runtime.appliedConvergence.toFixed(1)}</span>
      <span>parallax ${runtime.parallax.toFixed(2)}</span>
      <span>${runtime.stereoRigViews} public rig views</span>
      <span>${escapeHtml(runtime.effectComposition)}</span>
      <span>${runtime.elapsedMs}ms elapsed</span>
    </section>
    <section class="controls">
      <label>IPD<input id="ipd" type="range" min="4" max="28" value="${Math.round(controls.ipd * 100)}"></label>
      <label>Convergence<input id="convergence" type="range" min="12" max="60" value="${Math.round(controls.convergence * 10)}"></label>
      <label>Parallax<input id="parallax" type="range" min="10" max="100" value="${Math.round(controls.parallax * 100)}"></label>
    </section>
    <section class="button-row">
      <button type="button" data-mode="side-by-side">Side by side</button>
      <button type="button" data-mode="anaglyph-preview">Anaglyph tint</button>
      <button type="button" disabled>${escapeHtml(runtime.rendererStatus)}</button>
    </section>
    <section class="diagnostics">
      <h2>Diagnostics</h2>
      <span>Mode: ${escapeHtml(runtime.mode)}</span>
      <span>Rig: ${escapeHtml(runtime.stereoRigSource)}</span>
      <span>Effect plan: ${escapeHtml(runtime.effectPlanSource)}</span>
      <span>Eye separation signal: ${runtime.visibleDifference}</span>
    </section>
    ${runtime.error ? `<pre class="runtime-error">${escapeHtml(runtime.error)}</pre>` : ""}
  `;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
