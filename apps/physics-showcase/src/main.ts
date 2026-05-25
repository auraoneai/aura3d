import {
  Geometry,
  PBRMaterial,
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";
import { DirectionalLight, composeMat4, quatFromEuler, type Vec3 } from "@galileo3d/scene";
import { bindPhysicsControls, DEFAULT_PHYSICS_CONTROLS, type PhysicsControlState } from "./controls";
import { applyShowcaseImpulse, createPhysicsScene, raycastImpulse, stepPhysicsScene, type PhysicsBodyView, type PhysicsSceneFixture } from "./physicsScene";

declare global {
  interface Window {
    __g3dV8PhysicsShowcase?: V8PhysicsRuntime;
  }
}

type RuntimeStatus = "loading" | "ready" | "running" | "error";

interface V8PhysicsRuntime {
  readonly status: RuntimeStatus;
  readonly appId: "physics-showcase";
  readonly statusLabel: string;
  readonly drawCalls: number;
  readonly frameCount: number;
  readonly bodies: number;
  readonly contacts: number;
  readonly constraints: number;
  readonly kineticEnergy: number;
  readonly lastRaycastBody: number;
  readonly paused: boolean;
  readonly debugOverlay: boolean;
  readonly rendererStatus: "pending" | "ready" | "error";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "physics-showcase" as const;
const WIDTH = 1280;
const HEIGHT = 960;
const FRAME_BOUNDS: CameraFrameBounds = { min: [-2, -0.85, -1.45], max: [2, 1.35, 1.45] };

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const startedAt = performance.now();
  let controls: PhysicsControlState = DEFAULT_PHYSICS_CONTROLS;
  let fixture = createPhysicsScene();
  let snapshot = fixture.world.snapshot();
  let runtime: V8PhysicsRuntime = {
    status: "loading",
    appId: APP_ID,
    statusLabel: "Loading",
    drawCalls: 0,
    frameCount: 0,
    bodies: snapshot.stats.bodies,
    contacts: snapshot.stats.contacts,
    constraints: snapshot.stats.constraints,
    kineticEnergy: 0,
    lastRaycastBody: 0,
    paused: controls.paused,
    debugOverlay: controls.debugOverlay,
    rendererStatus: "pending",
    elapsedMs: 0
  };
  const update = (patch: Partial<V8PhysicsRuntime>): void => {
    runtime = { ...runtime, ...patch, elapsedMs: Math.round(performance.now() - startedAt) };
    publish(root, runtime, controls);
  };
  const getControls = bindPhysicsControls(root, (next, action) => {
    controls = next;
    if (action === "reset") {
      fixture = createPhysicsScene();
      snapshot = fixture.world.snapshot();
    }
    if (action === "impulse") {
      applyShowcaseImpulse(fixture, controls.impulseStrength);
    }
    update({ paused: controls.paused, debugOverlay: controls.debugOverlay, bodies: snapshot.stats.bodies, contacts: snapshot.stats.contacts, constraints: snapshot.stats.constraints });
  });

  try {
    const renderer = await G3DRenderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      preserveDrawingBuffer: true,
      clearColor: [0.018, 0.021, 0.026, 1]
    });
    update({ rendererStatus: "ready", statusLabel: "Renderer ready" });
    const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: WIDTH, height: HEIGHT }, {
      yawRadians: -0.48,
      pitchRadians: -0.16,
      paddingRatio: 0.1,
      fovYRadians: 0.62,
      nearPadding: 0.16,
      farPadding: 2.8
    });
    const resources = createResources();
    const source: RenderSource = {
      collectRenderItems: () => createItems(resources, fixture, controls.debugOverlay),
      collectedLights: createLights(),
      cameraPolicy: "require",
      cameraPosition: frame.cameraPosition,
      environmentLighting: {
        color: [0.74, 0.78, 0.86],
        intensity: 0.44,
        proceduralMap: {
          skyColor: [0.54, 0.68, 0.9],
          horizonColor: [0.93, 0.78, 0.52],
          groundColor: [0.1, 0.12, 0.16],
          specularColor: [0.96, 0.92, 0.84],
          intensity: 0.46,
          specularIntensity: 0.86
        }
      },
      frustumCulling: false,
      postprocess: false
    };
    const metadata = {
      assetId: APP_ID,
      assetName: "V8 Physics Showcase Fixture",
      assetUri: "/apps/physics-showcase/",
      meshCount: fixture.bodies.length + 4,
      primitiveCount: fixture.bodies.length + 4,
      materialCount: 8,
      textureCount: 0,
      imageCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      extensionsUsed: ["G3D_physics_world", "G3D_rigid_bodies", "G3D_constraints", "G3D_raycast"]
    };
    let lastNow = 0;

    canvas.addEventListener("pointerdown", () => {
      const bodyId = raycastImpulse(fixture, controls.impulseStrength);
      update({ lastRaycastBody: bodyId });
    });

    const render = (now: number): void => {
      try {
        controls = getControls();
        const dt = lastNow > 0 ? (now - lastNow) / 1000 : 1 / 60;
        lastNow = now;
        if (!controls.paused) {
          snapshot = stepPhysicsScene(fixture, dt, controls.gravityScale);
        }
        const result = renderer.renderFrame({
          source,
          camera: {
            viewProjectionMatrix: frame.viewProjectionMatrix,
            viewMatrix: frame.viewMatrix,
            projectionMatrix: frame.projectionMatrix
          },
          metadata: { ...metadata, meshCount: fixture.bodies.length + 4, primitiveCount: fixture.bodies.length + 4 }
        });
        const nextFrame = runtime.frameCount + 1;
        runtime = {
          ...runtime,
          status: nextFrame === 1 ? "ready" : "running",
          statusLabel: nextFrame === 1 ? "Ready" : "Running",
          drawCalls: result.diagnostics.drawCalls,
          frameCount: nextFrame,
          bodies: snapshot.stats.bodies,
          contacts: snapshot.stats.contacts,
          constraints: snapshot.stats.constraints,
          kineticEnergy: Number(snapshot.stats.kineticEnergy.toFixed(2)),
          paused: controls.paused,
          debugOverlay: controls.debugOverlay,
          elapsedMs: Math.round(performance.now() - startedAt)
        };
        window.__g3dV8PhysicsShowcase = runtime;
        if (nextFrame === 1 || nextFrame % 8 === 0) publish(root, runtime, controls);
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

interface PhysicsResources {
  readonly cube: Geometry;
  readonly sphere: Geometry;
  readonly cylinder: Geometry;
  readonly materials: Record<PhysicsBodyView["material"] | "floor" | "line" | "debug", PBRMaterial>;
}

function createResources(): PhysicsResources {
  return {
    cube: Geometry.litCube(1),
    sphere: Geometry.uvSphere(0.5, 48, 24),
    cylinder: Geometry.cylinder({ radius: 0.5, height: 1, segments: 32 }),
    materials: {
      floor: new PBRMaterial({ name: "physics-floor", baseColor: [0.08, 0.09, 0.11, 1], roughness: 0.6 }),
      blue: new PBRMaterial({ name: "physics-blue", baseColor: [0.15, 0.45, 0.9, 1], roughness: 0.3, clearcoatFactor: 0.32 }),
      gold: new PBRMaterial({ name: "physics-gold", baseColor: [0.95, 0.66, 0.22, 1], metallic: 0.24, roughness: 0.28 }),
      red: new PBRMaterial({ name: "physics-red", baseColor: [0.92, 0.18, 0.12, 1], roughness: 0.34 }),
      green: new PBRMaterial({ name: "physics-green", baseColor: [0.18, 0.7, 0.5, 1], roughness: 0.38 }),
      line: new PBRMaterial({ name: "physics-constraint", baseColor: [0.85, 0.9, 1, 1], roughness: 0.22, clearcoatFactor: 0.4 }),
      debug: new PBRMaterial({ name: "physics-debug", baseColor: [0.9, 0.24, 0.72, 1], roughness: 0.2 })
    }
  };
}

function createItems(resources: PhysicsResources, fixture: PhysicsSceneFixture, debugOverlay: boolean): readonly RenderItem[] {
  const items: RenderItem[] = [
    { label: "physics-backdrop", geometry: resources.cube, material: resources.materials.floor, modelMatrix: composeMat4([0, 0.2, -1.28], [0, 0, 0, 1], [3.9, 1.9, 0.05]) }
  ];
  for (const view of fixture.bodies) {
    items.push(bodyItem(resources, view));
  }
  const anchor = fixture.anchor.position;
  const pendulum = fixture.pendulum.position;
  const mid: Vec3 = [(anchor[0] + pendulum[0]) * 0.5, (anchor[1] + pendulum[1]) * 0.5, (anchor[2] + pendulum[2]) * 0.5];
  const length = Math.hypot(anchor[0] - pendulum[0], anchor[1] - pendulum[1], anchor[2] - pendulum[2]);
  items.push({
    label: "physics-spring-constraint",
    geometry: resources.cylinder,
    material: resources.materials.line,
    modelMatrix: composeMat4(mid, [0, 0, 0, 1], [0.018, Math.max(0.05, length), 0.018])
  });
  if (debugOverlay) {
    items.push(...fixture.bodies.filter((view) => view.body.type === "dynamic").map((view) => ({
      label: `debug-bounds-${view.body.id}`,
      geometry: resources.cube,
      material: resources.materials.debug,
      modelMatrix: composeMat4(view.body.position, [0, 0, 0, 1], [view.halfExtents[0] * 2.16, view.halfExtents[1] * 2.16, view.halfExtents[2] * 2.16])
    })));
  }
  return items;
}

function bodyItem(resources: PhysicsResources, view: PhysicsBodyView): RenderItem {
  const material = view.body.type === "static" ? resources.materials.floor : resources.materials[view.material];
  if (view.kind === "sphere") {
    return {
      label: `physics-sphere-${view.body.id}`,
      geometry: resources.sphere,
      material,
      modelMatrix: composeMat4(view.body.position, view.body.rotation, [view.radius * 2, view.radius * 2, view.radius * 2])
    };
  }
  const rotation = view.body.id === 2 ? quatFromEuler(0, 0, -0.24) : view.body.rotation;
  return {
    label: `physics-box-${view.body.id}`,
    geometry: resources.cube,
    material,
    modelMatrix: composeMat4(view.body.position, rotation, [view.halfExtents[0] * 2, view.halfExtents[1] * 2, view.halfExtents[2] * 2])
  };
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("v8-physics-key");
  key.intensity = 3.5;
  key.color = [1, 0.94, 0.84];
  const fill = new DirectionalLight("v8-physics-fill");
  fill.intensity = 1.5;
  fill.color = [0.58, 0.72, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.4, 3.3, 2.1], direction: [-0.48, -0.72, -0.5], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-2.6, 1.8, 1.8], direction: [0.62, -0.32, -0.55], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill }
  ];
}

function publish(root: HTMLElement, runtime: V8PhysicsRuntime, controls: PhysicsControlState): void {
  window.__g3dV8PhysicsShowcase = runtime;
  const statusClass = runtime.status === "error" ? "is-error" : runtime.status === "loading" ? "is-loading" : "is-running";
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V8 Physics Showcase</h1>
        <p>G3D physics rigid bodies, a spring constraint, raycast impulse, and rendered contact diagnostics.</p>
      </div>
      <button id="runtime-state" class="${statusClass}" type="button" disabled>${escapeHtml(runtime.statusLabel)}</button>
    </section>
    <section class="metrics">
      <span>${escapeHtml(runtime.status)}</span>
      <span>${runtime.drawCalls} draw calls</span>
      <span>${runtime.frameCount} frames</span>
      <span>${runtime.bodies} bodies</span>
      <span>${runtime.contacts} contacts</span>
      <span>${runtime.constraints} constraints</span>
      <span>${runtime.kineticEnergy} energy</span>
      <span>${runtime.elapsedMs}ms elapsed</span>
    </section>
    <section class="controls">
      <label>Impulse<input id="impulseStrength" type="range" min="8" max="80" value="${Math.round(controls.impulseStrength * 10)}"></label>
      <label>Gravity<input id="gravityScale" type="range" min="0" max="180" value="${Math.round(controls.gravityScale * 100)}"></label>
      <label>Debug overlay<input id="debugOverlay" type="checkbox" ${controls.debugOverlay ? "checked" : ""}></label>
    </section>
    <section class="button-row">
      <button id="pausePhysics" type="button">${controls.paused ? "Resume" : "Pause"}</button>
      <button id="impulsePhysics" type="button">Impulse</button>
      <button id="resetPhysics" type="button">Reset</button>
    </section>
    <section class="diagnostics">
      <h2>Diagnostics</h2>
      <span>Last raycast body: ${runtime.lastRaycastBody || "none"}</span>
      <span>Renderer: ${escapeHtml(runtime.rendererStatus)}</span>
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
