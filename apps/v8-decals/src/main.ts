import {
  Geometry,
  PBRMaterial,
  createRaycastProjectedDecalGeometry,
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type CollectedLight,
  type ProjectedDecalTriangleMesh,
  type RenderItem,
  type RenderSource
} from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/v9";
import { DirectionalLight, composeMat4, type Vec3 } from "@galileo3d/scene";
import { placeDecalFromPointer, seededDecals, type DecalPlacement } from "./decalPlacement";

declare global {
  interface Window {
    __g3dV8Decals?: V8DecalsRuntime;
  }
}

type RuntimeStatus = "loading" | "ready" | "running" | "error";

interface V8DecalsRuntime {
  readonly status: RuntimeStatus;
  readonly appId: "v8-decals";
  readonly statusLabel: string;
  readonly drawCalls: number;
  readonly frameCount: number;
  readonly decalCount: number;
  readonly projectedDecalVertices: number;
  readonly projectedDecalTriangles: number;
  readonly decalBlendMode: "pending" | "alpha-blend";
  readonly decalShape: "pending" | "ellipse";
  readonly blendedDecalMaterials: number;
  readonly decalDepthWriteDisabled: boolean;
  readonly decalCullMode: "pending" | "none" | "back" | "front" | "mixed";
  readonly decalPolygonOffsetEnabled: boolean;
  readonly lastPlacement: string;
  readonly raycastStatus: "seeded" | "hit" | "miss";
  readonly rendererStatus: "pending" | "ready" | "error";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "v8-decals" as const;
const FALLBACK_WIDTH = 1280;
const FALLBACK_HEIGHT = 960;
const MAX_PIXEL_RATIO = 2;
const MAX_RENDER_EDGE = 2560;
const TARGET_RADIUS = 0.88;
const TARGET_CENTER: Vec3 = [0, 0.14, 0];
const FRAME_BOUNDS: CameraFrameBounds = { min: [-1.35, -0.9, -1.05], max: [1.35, 1.14, 1.05] };
const DECAL_RENDER_STATE = {
  blend: true,
  depthWrite: false,
  cullMode: "none",
  polygonOffset: { factor: -1, units: -1 }
} as const;

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  let renderSize = syncCanvasRenderSize(canvas);

  const startedAt = performance.now();
  let runtime: V8DecalsRuntime = {
    status: "loading",
    appId: APP_ID,
    statusLabel: "Loading",
    drawCalls: 0,
    frameCount: 0,
    decalCount: 0,
    projectedDecalVertices: 0,
    projectedDecalTriangles: 0,
    decalBlendMode: "pending",
    decalShape: "pending",
    blendedDecalMaterials: 0,
    decalDepthWriteDisabled: false,
    decalCullMode: "pending",
    decalPolygonOffsetEnabled: false,
    lastPlacement: "Preparing decal target",
    raycastStatus: "seeded",
    rendererStatus: "pending",
    elapsedMs: 0
  };

  const update = (patch: Partial<V8DecalsRuntime>): void => {
    runtime = { ...runtime, ...patch, elapsedMs: Math.round(performance.now() - startedAt) };
    publish(root, runtime);
  };

  try {
    const renderer = await G3DRenderer.create({
      canvas,
      width: renderSize.width,
      height: renderSize.height,
      backend: "webgl2",
      clearColor: [0.02, 0.023, 0.028, 1]
    });
    update({ rendererStatus: "ready", statusLabel: "Renderer ready" });

    const resources = createResources();
    const decals: DecalRenderEntry[] = seededDecals().map((placement) => createProjectedDecalEntry(resources, placement));
    update({ ...decalStats(decals), ...decalMaterialStats(resources), decalShape: "ellipse", decalCount: decals.length });

    const render = (now: number): void => {
      try {
        void now;
        const nextSize = syncCanvasRenderSize(canvas);
        if (nextSize.width !== renderSize.width || nextSize.height !== renderSize.height) {
          renderSize = nextSize;
          renderer.resize(renderSize.width, renderSize.height);
        }
        resources.targetMatrix = composeMat4(TARGET_CENTER, [0, 0, 0, 1], [1, 1, 1]);
        const frame = computeDecalCameraFrame(renderSize);
        const diagnostics = renderer.render({
          source: createSource(resources, decals, frame.cameraPosition),
          camera: {
            viewProjectionMatrix: frame.viewProjectionMatrix,
            viewMatrix: frame.viewMatrix,
            projectionMatrix: frame.projectionMatrix
          }
        });
        const nextFrame = runtime.frameCount + 1;
        runtime = {
          ...runtime,
          status: nextFrame === 1 ? "ready" : "running",
          statusLabel: nextFrame === 1 ? "Ready" : "Running",
          drawCalls: diagnostics.drawCalls,
          frameCount: nextFrame,
          decalCount: decals.length,
          decalShape: "ellipse",
          ...decalStats(decals),
          ...decalMaterialStats(resources),
          elapsedMs: Math.round(performance.now() - startedAt)
        };
        window.__g3dV8Decals = runtime;
        if (nextFrame === 1 || nextFrame % 8 === 0) publish(root, runtime);
        requestAnimationFrame(render);
      } catch (error) {
        update({ status: "error", statusLabel: "Error", rendererStatus: "error", error: formatError(error) });
      }
    };

    canvas.addEventListener("pointerdown", (event) => {
      const placement = placeDecalFromPointer({
        clientX: event.clientX,
        clientY: event.clientY,
        canvas,
        radius: TARGET_RADIUS,
        id: decals.length
      });
      if (!placement) {
        update({ raycastStatus: "miss", lastPlacement: "Ray missed the curved target" });
        return;
      }
      decals.push(createProjectedDecalEntry(resources, placement));
      update({
        raycastStatus: "hit",
        decalCount: decals.length,
        decalShape: "ellipse",
        ...decalStats(decals),
        ...decalMaterialStats(resources),
        lastPlacement: `${placement.position.map((value) => value.toFixed(2)).join(", ")} normal ${placement.normal.map((value) => value.toFixed(2)).join(", ")}`
      });
    });

    publish(root, runtime);
    requestAnimationFrame(render);
  } catch (error) {
    update({ status: "error", statusLabel: "Error", rendererStatus: "error", error: formatError(error) });
  }
}

function syncCanvasRenderSize(canvas: HTMLCanvasElement): { readonly width: number; readonly height: number } {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width > 0 ? rect.width : FALLBACK_WIDTH;
  const cssHeight = rect.height > 0 ? rect.height : FALLBACK_HEIGHT;
  const pixelRatio = Math.min(MAX_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
  const edgeScale = Math.min(1, MAX_RENDER_EDGE / Math.max(cssWidth * pixelRatio, cssHeight * pixelRatio));
  const width = Math.max(1, Math.round(cssWidth * pixelRatio * edgeScale));
  const height = Math.max(1, Math.round(cssHeight * pixelRatio * edgeScale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}

function computeDecalCameraFrame(viewport: { readonly width: number; readonly height: number }) {
  return computePerspectiveCameraFrame(FRAME_BOUNDS, viewport, {
    yawRadians: -0.04,
    pitchRadians: -0.02,
    paddingRatio: 0.1,
    fovYRadians: 0.32,
    nearPadding: 0.12,
    farPadding: 2.2
  });
}

function createSource(resources: DecalResources, decals: readonly DecalRenderEntry[], cameraPosition: readonly [number, number, number]): RenderSource {
  return {
    collectRenderItems: () => createRenderItems(resources, decals),
    collectedLights: createLights(),
    cameraPolicy: "require",
    cameraPosition,
    environmentLighting: {
      color: [0.72, 0.78, 0.86],
      intensity: 0.46,
      proceduralMap: {
        skyColor: [0.55, 0.68, 0.9],
        horizonColor: [0.95, 0.76, 0.52],
        groundColor: [0.12, 0.14, 0.17],
        specularColor: [1, 0.92, 0.78],
        intensity: 0.48,
        specularIntensity: 0.88
      }
    },
    frustumCulling: false,
    postprocess: false
  };
}

interface DecalResources {
  readonly sphere: Geometry;
  readonly cube: Geometry;
  readonly sourceMesh: ProjectedDecalTriangleMesh;
  readonly targetMaterial: PBRMaterial;
  readonly floorMaterial: PBRMaterial;
  readonly trimMaterial: PBRMaterial;
  readonly decalMaterials: readonly PBRMaterial[];
  targetMatrix: readonly number[];
}

interface DecalRenderEntry {
  readonly placement: DecalPlacement;
  readonly geometry: Geometry;
  readonly clippedTriangleCount: number;
  readonly vertexCount: number;
}

function createResources(): DecalResources {
  const sphere = Geometry.uvSphere(TARGET_RADIUS, 64, 32);
  return {
    sphere,
    cube: Geometry.litCube(1),
    sourceMesh: triangleMeshFromGeometry(sphere, TARGET_CENTER),
    targetMaterial: new PBRMaterial({
      name: "decal-target-brushed-fixture",
      baseColor: [0.55, 0.57, 0.59, 1],
      metallic: 0.08,
      roughness: 0.42,
      clearcoatFactor: 0.28,
      environmentIntensity: 0.78
    }),
    floorMaterial: new PBRMaterial({
      name: "decal-floor",
      baseColor: [0.14, 0.16, 0.18, 1],
      roughness: 0.62,
      metallic: 0
    }),
    trimMaterial: new PBRMaterial({
      name: "decal-trim",
      baseColor: [0.18, 0.24, 0.32, 1],
      roughness: 0.46,
      metallic: 0.12
    }),
    decalMaterials: [
      createDecalMaterial("decal-red", [0.95, 0.18, 0.12, 0.72], 0.28, 0.5),
      createDecalMaterial("decal-blue", [0.16, 0.48, 0.95, 0.72], 0.24, 0.45),
      createDecalMaterial("decal-gold", [0.98, 0.73, 0.18, 0.76], 0.32, 0.42),
      createDecalMaterial("decal-green", [0.17, 0.76, 0.54, 0.72], 0.3, 0.5),
      createDecalMaterial("decal-magenta", [0.9, 0.22, 0.72, 0.72], 0.26, 0.44)
    ],
    targetMatrix: composeMat4(TARGET_CENTER, [0, 0, 0, 1], [1, 1, 1])
  };
}

function createDecalMaterial(
  name: string,
  baseColor: readonly [number, number, number, number],
  roughness: number,
  clearcoatFactor: number
): PBRMaterial {
  return new PBRMaterial({
    name,
    baseColor,
    roughness,
    clearcoatFactor,
    environmentIntensity: 0.84,
    renderState: DECAL_RENDER_STATE
  });
}

function createRenderItems(resources: DecalResources, decals: readonly DecalRenderEntry[]): readonly RenderItem[] {
  return [
    {
      label: "v8-decals-curved-fixture",
      geometry: resources.sphere,
      material: resources.targetMaterial,
      modelMatrix: resources.targetMatrix
    },
    {
      label: "v8-decals-floor",
      geometry: resources.cube,
      material: resources.floorMaterial,
      modelMatrix: composeMat4([0, -0.78, 0], [0, 0, 0, 1], [2.95, 0.06, 2.05])
    },
    {
      label: "v8-decals-backdrop",
      geometry: resources.cube,
      material: resources.trimMaterial,
      modelMatrix: composeMat4([0, 0.36, -1.08], [0, 0, 0, 1], [2.95, 1.82, 0.05])
    },
    ...decals.map((decal) => ({
      label: `v8-decal-${decal.placement.id}`,
      geometry: decal.geometry,
      material: resources.decalMaterials[decal.placement.id % resources.decalMaterials.length],
      modelMatrix: composeMat4([0, 0, 0], [0, 0, 0, 1], [1, 1, 1])
    }))
  ];
}

function createProjectedDecalEntry(resources: DecalResources, placement: DecalPlacement): DecalRenderEntry {
  const origin: Vec3 = [
    placement.position[0] + placement.normal[0] * 0.42,
    placement.position[1] + placement.normal[1] * 0.42,
    placement.position[2] + placement.normal[2] * 0.42
  ];
  const direction: Vec3 = [-placement.normal[0], -placement.normal[1], -placement.normal[2]];
  const result = createRaycastProjectedDecalGeometry(resources.sourceMesh, { origin, direction }, {
    size: [placement.size * 1.72, placement.size * 1.72, 0.18],
    normalOffset: 0.012,
    maxDistance: 1.2,
    includeBackfaces: true,
    upHint: placement.tangent,
    shape: "ellipse",
    ellipseSegments: 36
  });
  return {
    placement,
    geometry: result.geometry,
    clippedTriangleCount: result.clippedTriangleCount,
    vertexCount: result.vertexCount
  };
}

function triangleMeshFromGeometry(geometry: Geometry, translation: Vec3): ProjectedDecalTriangleMesh {
  const positions: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  for (let index = 0; index < geometry.vertexBuffer.vertexCount; index += 1) {
    const position = toVec3(geometry.vertexBuffer.getAttribute(index, "position"), `position ${index}`);
    const normal = toVec3(geometry.vertexBuffer.getAttribute(index, "normal"), `normal ${index}`);
    positions.push([
      position[0] + translation[0],
      position[1] + translation[1],
      position[2] + translation[2]
    ]);
    normals.push(normal);
  }
  return {
    positions,
    normals,
    indices: geometry.indexBuffer ? Array.from(geometry.indexBuffer.data) : undefined
  };
}

function toVec3(values: readonly number[], label: string): [number, number, number] {
  if (values.length !== 3 || !values.every(Number.isFinite)) {
    throw new Error(`Projected decal source ${label} must be a finite vec3.`);
  }
  return [values[0]!, values[1]!, values[2]!];
}

function decalStats(decals: readonly DecalRenderEntry[]): Pick<V8DecalsRuntime, "projectedDecalVertices" | "projectedDecalTriangles"> {
  return {
    projectedDecalVertices: decals.reduce((sum, decal) => sum + decal.vertexCount, 0),
    projectedDecalTriangles: decals.reduce((sum, decal) => sum + decal.clippedTriangleCount, 0)
  };
}

function decalMaterialStats(resources: DecalResources): Pick<V8DecalsRuntime, "decalBlendMode" | "blendedDecalMaterials" | "decalDepthWriteDisabled" | "decalCullMode" | "decalPolygonOffsetEnabled"> {
  const materials = resources.decalMaterials;
  const blended = materials.filter((material) => material.renderState.blend && !material.renderState.depthWrite);
  const cullModes = new Set(materials.map((material) => material.renderState.cullMode));
  return {
    decalBlendMode: blended.length === materials.length ? "alpha-blend" : "pending",
    blendedDecalMaterials: blended.length,
    decalDepthWriteDisabled: materials.every((material) => !material.renderState.depthWrite),
    decalCullMode: cullModes.size === 1 ? materials[0]?.renderState.cullMode ?? "pending" : "mixed",
    decalPolygonOffsetEnabled: materials.every((material) => material.renderState.polygonOffset !== null)
  };
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("v8-decals-key");
  key.intensity = 3.7;
  key.color = [1, 0.94, 0.84];
  const fill = new DirectionalLight("v8-decals-fill");
  fill.intensity = 1.4;
  fill.color = [0.62, 0.78, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.2, 3.1, 2.4], direction: [-0.45, -0.7, -0.55], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-2.8, 1.8, 1.6], direction: [0.6, -0.25, -0.45], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill }
  ];
}

function publish(root: HTMLElement, runtime: V8DecalsRuntime): void {
  window.__g3dV8Decals = runtime;
  const statusClass = runtime.status === "error" ? "is-error" : runtime.status === "loading" ? "is-loading" : "is-running";
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V8 Decals</h1>
        <p>Click the curved fixture to add G3D-rendered decals from a pointer raycast.</p>
      </div>
      <button id="runtime-state" class="${statusClass}" type="button" disabled>${escapeHtml(runtime.statusLabel)}</button>
    </section>
    <section class="metrics">
      <span>${escapeHtml(runtime.status)}</span>
      <span>${runtime.drawCalls} draw calls</span>
      <span>${runtime.frameCount} frames</span>
      <span>${runtime.decalCount} decals</span>
      <span>${runtime.projectedDecalTriangles} projected tris</span>
      <span>${runtime.projectedDecalVertices} decal verts</span>
      <span>${escapeHtml(runtime.decalBlendMode)}</span>
      <span>${escapeHtml(runtime.decalShape)} decals</span>
      <span>${runtime.blendedDecalMaterials} blended materials</span>
      <span>depth write ${runtime.decalDepthWriteDisabled ? "off" : "on"}</span>
      <span>cull ${escapeHtml(runtime.decalCullMode)}</span>
      <span>raycast ${escapeHtml(runtime.raycastStatus)}</span>
      <span>renderer ${escapeHtml(runtime.rendererStatus)}</span>
      <span>${runtime.elapsedMs}ms elapsed</span>
      <span>WebGL2 G3D renderer</span>
    </section>
    <section class="controls">
      <label>Placement target<input type="range" min="0" max="1" value="${runtime.raycastStatus === "miss" ? "0" : "1"}" disabled></label>
      <label>Decal scale<input type="range" min="0" max="100" value="52" disabled></label>
      <label>Blend mode<input type="range" min="0" max="2" value="1" disabled></label>
    </section>
    <section class="diagnostics">
      <h2>Diagnostics</h2>
      <span>Last placement: ${escapeHtml(runtime.lastPlacement)}</span>
      <span>Surface decals are G3D ProjectedDecalGeometry ellipse meshes clipped to the raycast target with transparent depth-safe PBR decal materials.</span>
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
