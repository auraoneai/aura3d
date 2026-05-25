// @ts-nocheck
import {
  Geometry,
  PBRMaterial,
  computePerspectiveCameraFrame,
  createRaycastProjectedDecalGeometry,
  type CameraFrameBounds,
  type CollectedLight,
  type ProjectedDecalTriangleMesh,
  type RenderItem,
  type RenderSource
} from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";
import { DirectionalLight, composeMat4, normalizeVec3, type Vec3 } from "@galileo3d/scene";
import { placeDecalFromPointer, seededDecals, type DecalPlacement } from "../../apps/decals/src/decalPlacement";
import * as THREE from "three";
import { DecalGeometry } from "/node_modules/three/examples/jsm/geometries/DecalGeometry.js";

declare global {
  interface Window {
    __V9_DECALS_PARITY__?: V9DecalsParityResult;
  }
}

export {};

type V9DecalsParityResult = V9DecalsParityReady | V9DecalsParityError;

interface V9DecalsParityReady {
  readonly status: "ready";
  readonly schema: "g3d-threejs-parity-decals-parity/v1";
  readonly purpose: "same-scene G3D ProjectedDecalGeometry vs Three.js DecalGeometry baseline";
  readonly generatedInBrowserAt: string;
  readonly scene: typeof SCENE;
  readonly g3d: {
    readonly renderer: { readonly drawCalls: number };
    readonly decals: { readonly count: number; readonly triangles: number; readonly vertices: number; readonly shape: "ellipse" };
    readonly pixels: PixelStats;
  };
  readonly threejs: {
    readonly renderer: { readonly actualThreeRenderer: true; readonly drawCalls: number; readonly triangles: number };
    readonly decals: { readonly count: number; readonly geometries: number; readonly decalGeometryConstructor: "DecalGeometry" };
    readonly pixels: PixelStats;
  };
  readonly projectorSemantics: {
    readonly samePlacementCount: boolean;
    readonly maxHitPositionDelta: number;
    readonly minNormalDot: number;
    readonly pointerHitDelta: number;
    readonly pointerNormalDot: number;
  };
  readonly diff: DiffStats;
  readonly assertions: {
    readonly samePlacements: boolean;
    readonly sameResolution: boolean;
    readonly actualThreeRenderer: boolean;
    readonly actualThreeDecalGeometry: boolean;
    readonly g3dEllipseProjectedGeometry: boolean;
    readonly projectorSemanticsClose: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly dataUrls: {
    readonly g3d: string;
    readonly threejs: string;
    readonly sideBySide: string;
  };
  readonly humanNotes: readonly string[];
}

interface V9DecalsParityError {
  readonly status: "error";
  readonly schema: "g3d-threejs-parity-decals-parity/v1";
  readonly generatedInBrowserAt: string;
  readonly error: string;
  readonly expectedRenderer: "THREE.WebGLRenderer";
  readonly expectedReferenceGeometry: "DecalGeometry";
}

interface PixelStats {
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
  readonly averageLuma: number;
  readonly saturatedPixels: number;
}

interface DiffStats {
  readonly meanDelta: number;
  readonly maxDelta: number;
  readonly changedPixels: number;
  readonly structuralSimilarityProxy: number;
}

interface DecalResources {
  readonly sphere: Geometry;
  readonly cube: Geometry;
  readonly sourceMesh: ProjectedDecalTriangleMesh;
  readonly targetMaterial: PBRMaterial;
  readonly floorMaterial: PBRMaterial;
  readonly backdropMaterial: PBRMaterial;
  readonly decalMaterials: readonly PBRMaterial[];
}

interface DecalRenderEntry {
  readonly geometry: Geometry;
  readonly clippedTriangleCount: number;
  readonly vertexCount: number;
  readonly hit: { readonly position: readonly [number, number, number]; readonly normal: readonly [number, number, number] };
}

const SCENE = {
  id: "v9-decals",
  width: 640,
  height: 480,
  targetRadius: 0.88,
  targetCenter: [0, 0.14, 0] as const,
  frameBounds: { min: [-1.35, -0.9, -1.05], max: [1.35, 1.14, 1.05] } as CameraFrameBounds,
  decalCount: 7
} as const;

const DECAL_RENDER_STATE = {
  blend: true,
  depthWrite: false,
  cullMode: "none",
  polygonOffset: { factor: -1, units: -1 }
} as const;

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  try {
    const g3dCanvas = requiredCanvas("g3d-decals", SCENE.width, SCENE.height);
    const threeCanvas = requiredCanvas("threejs-decals", SCENE.width, SCENE.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", SCENE.width * 2, SCENE.height + 60);
    const placements = seededDecals(SCENE.decalCount);
    if (status) status.textContent = "rendering G3D decals";
    const g3d = await renderG3DDecals(g3dCanvas, placements);
    if (status) status.textContent = "rendering Three.js DecalGeometry baseline";
    const threejs = await renderThreeDecals(threeCanvas, placements);
    const [g3dPixels, threePixels] = await Promise.all([dataUrlToPixels(g3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const diff = computeDiff(g3dPixels, threePixels);
    const projectorSemantics = compareProjectorSemantics(g3d.entries, threejs.semanticHits, g3dCanvas);
    const sideBySide = await drawSideBySide(sideBySideCanvas, g3d.dataUrl, threejs.dataUrl, diff);
    const ready: V9DecalsParityReady = {
      status: "ready",
      schema: "g3d-threejs-parity-decals-parity/v1",
      purpose: "same-scene G3D ProjectedDecalGeometry vs Three.js DecalGeometry baseline",
      generatedInBrowserAt: new Date().toISOString(),
      scene: SCENE,
      g3d: {
        renderer: { drawCalls: g3d.drawCalls },
        decals: {
          count: g3d.entries.length,
          triangles: g3d.entries.reduce((sum, entry) => sum + entry.clippedTriangleCount, 0),
          vertices: g3d.entries.reduce((sum, entry) => sum + entry.vertexCount, 0),
          shape: "ellipse"
        },
        pixels: analyzeImageData(g3dPixels)
      },
      threejs: {
        renderer: {
          actualThreeRenderer: threejs.actualThreeRenderer,
          drawCalls: threejs.drawCalls,
          triangles: threejs.triangles
        },
        decals: {
          count: threejs.decalCount,
          geometries: threejs.decalGeometryCount,
          decalGeometryConstructor: "DecalGeometry"
        },
        pixels: analyzeImageData(threePixels)
      },
      projectorSemantics,
      diff,
      assertions: {
        samePlacements: placements.length === g3d.entries.length && placements.length === threejs.decalCount,
        sameResolution: g3dCanvas.width === threeCanvas.width && g3dCanvas.height === threeCanvas.height,
        actualThreeRenderer: threejs.actualThreeRenderer,
        actualThreeDecalGeometry: threejs.decalGeometryCount === placements.length,
        g3dEllipseProjectedGeometry: g3d.entries.length === placements.length && g3d.entries.every((entry) => entry.clippedTriangleCount >= 8),
        projectorSemanticsClose: projectorSemantics.maxHitPositionDelta <= 0.035
          && projectorSemantics.minNormalDot >= 0.985
          && projectorSemantics.pointerHitDelta <= 0.035
          && projectorSemantics.pointerNormalDot >= 0.985,
        fakeEqualityClaimed: false
      },
      dataUrls: {
        g3d: g3d.dataUrl,
        threejs: threejs.dataUrl,
        sideBySide
      },
      humanNotes: [
        `Mean RGB delta is ${diff.meanDelta}; structural similarity proxy is ${diff.structuralSimilarityProxy}.`,
        `Projector max hit delta is ${projectorSemantics.maxHitPositionDelta}; minimum normal dot is ${projectorSemantics.minNormalDot}.`,
        "This artifact proves a bounded same-scene decals comparison and projector semantics. It is not a blanket visual equality claim."
      ]
    };
    window.__V9_DECALS_PARITY__ = ready;
    if (status) status.textContent = JSON.stringify({ status: ready.status, diff: ready.diff, projectorSemantics }, null, 2);
  } catch (error) {
    const failure: V9DecalsParityError = {
      status: "error",
      schema: "g3d-threejs-parity-decals-parity/v1",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      expectedRenderer: "THREE.WebGLRenderer",
      expectedReferenceGeometry: "DecalGeometry"
    };
    window.__V9_DECALS_PARITY__ = failure;
    if (status) status.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderG3DDecals(canvas: HTMLCanvasElement, placements: readonly DecalPlacement[]) {
  const renderer = await G3DRenderer.create({
    canvas,
    width: SCENE.width,
    height: SCENE.height,
    backend: "webgl2",
    clearColor: [0.02, 0.023, 0.028, 1]
  });
  const resources = createG3DResources();
  const entries = placements.map((placement) => createProjectedDecalEntry(resources, placement));
  const frame = computeDecalCameraFrame();
  const diagnostics = renderer.render({
    source: createSource(resources, entries, frame.cameraPosition),
    camera: {
      viewProjectionMatrix: frame.viewProjectionMatrix,
      viewMatrix: frame.viewMatrix,
      projectionMatrix: frame.projectionMatrix
    }
  });
  return { drawCalls: diagnostics.drawCalls, entries, dataUrl: canvas.toDataURL("image/png") };
}

async function renderThreeDecals(canvas: HTMLCanvasElement, placements: readonly DecalPlacement[]) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SCENE.width, SCENE.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  if (!(renderer instanceof THREE.WebGLRenderer)) {
    throw new Error("Decals parity requires an actual THREE.WebGLRenderer.");
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070a);
  scene.add(new THREE.HemisphereLight(0xd7e2ff, 0x242018, 0.5));
  const key = new THREE.DirectionalLight(0xffead4, 3.1);
  key.position.set(2.2, 3.1, 2.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9ebfff, 1.2);
  fill.position.set(-2.8, 1.8, 1.6);
  scene.add(fill);

  const target = new THREE.Mesh(
    new THREE.SphereGeometry(SCENE.targetRadius, 64, 32),
    new THREE.MeshStandardMaterial({ color: 0x8d9196, roughness: 0.42, metalness: 0.08 })
  );
  target.position.set(...SCENE.targetCenter);
  scene.add(target);
  scene.add(new THREE.Mesh(
    new THREE.BoxGeometry(2.95, 0.06, 2.05),
    new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.62, metalness: 0 })
  ));
  scene.children.at(-1)!.position.set(0, -0.78, 0);
  scene.add(new THREE.Mesh(
    new THREE.BoxGeometry(2.95, 1.82, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x2f3d52, roughness: 0.46, metalness: 0.12 })
  ));
  scene.children.at(-1)!.position.set(0, 0.36, -1.08);

  const semanticHits = placements.map((placement) => raycastThreeSphere(placement));
  let decalGeometryCount = 0;
  const decalAlphaMap = createCircularAlphaTexture();
  for (const [index, placement] of placements.entries()) {
    const semanticHit = semanticHits[index]!;
    const normal = new THREE.Vector3(...semanticHit.normal).normalize();
    const position = new THREE.Vector3(...semanticHit.position);
    const orientation = new THREE.Euler().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(position, position.clone().add(normal), new THREE.Vector3(...placement.tangent).normalize())
    );
    const size = new THREE.Vector3(placement.size * 1.72, placement.size * 1.72, 0.18);
    const geometry = new DecalGeometry(target, position, orientation, size);
    if (geometry.constructor.name === "DecalGeometry") decalGeometryCount += 1;
    const color = placement.color;
    scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: new THREE.Color(color[0], color[1], color[2]),
      transparent: true,
      opacity: 0.72,
      alphaMap: decalAlphaMap,
      alphaTest: 0.08,
      roughness: 0.34,
      metalness: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    })));
  }
  const frame = computeDecalCameraFrame();
  const camera = new THREE.PerspectiveCamera(
    frame.fovYRadians * 180 / Math.PI,
    frame.aspect,
    frame.near,
    frame.far
  );
  camera.position.set(frame.cameraPosition[0], frame.cameraPosition[1], frame.cameraPosition[2]);
  camera.lookAt(frame.center[0], frame.center[1], frame.center[2]);
  camera.updateMatrixWorld(true);
  renderer.render(scene, camera);
  const result = {
    actualThreeRenderer: true as const,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    decalCount: placements.length,
    decalGeometryCount,
    semanticHits,
    dataUrl: canvas.toDataURL("image/png")
  };
  decalAlphaMap.dispose();
  renderer.dispose();
  return result;
}

function createG3DResources(): DecalResources {
  const sphere = Geometry.uvSphere(SCENE.targetRadius, 64, 32);
  return {
    sphere,
    cube: Geometry.litCube(1),
    sourceMesh: triangleMeshFromGeometry(sphere, SCENE.targetCenter),
    targetMaterial: new PBRMaterial({ name: "decal-target", baseColor: [0.55, 0.57, 0.59, 1], metallic: 0.08, roughness: 0.42 }),
    floorMaterial: new PBRMaterial({ name: "decal-floor", baseColor: [0.14, 0.16, 0.18, 1], roughness: 0.62, metallic: 0 }),
    backdropMaterial: new PBRMaterial({ name: "decal-backdrop", baseColor: [0.18, 0.24, 0.32, 1], roughness: 0.46, metallic: 0.12 }),
    decalMaterials: [
      createDecalMaterial("decal-red", [0.95, 0.18, 0.12, 0.72]),
      createDecalMaterial("decal-blue", [0.16, 0.48, 0.95, 0.72]),
      createDecalMaterial("decal-gold", [0.98, 0.73, 0.18, 0.76]),
      createDecalMaterial("decal-green", [0.17, 0.76, 0.54, 0.72]),
      createDecalMaterial("decal-magenta", [0.9, 0.22, 0.72, 0.72])
    ]
  };
}

function createDecalMaterial(name: string, baseColor: readonly [number, number, number, number]): PBRMaterial {
  return new PBRMaterial({ name, baseColor, roughness: 0.32, clearcoatFactor: 0.45, renderState: DECAL_RENDER_STATE });
}

function createSource(resources: DecalResources, decals: readonly DecalRenderEntry[], cameraPosition: readonly [number, number, number]): RenderSource {
  return {
    collectRenderItems: () => createRenderItems(resources, decals),
    collectedLights: createLights(),
    cameraPolicy: "require",
    cameraPosition,
    environmentLighting: { color: [0.72, 0.78, 0.86], intensity: 0.46 },
    frustumCulling: false,
    postprocess: false
  };
}

function createRenderItems(resources: DecalResources, decals: readonly DecalRenderEntry[]): readonly RenderItem[] {
  return [
    { label: "decal-target", geometry: resources.sphere, material: resources.targetMaterial, modelMatrix: composeMat4(SCENE.targetCenter, [0, 0, 0, 1], [1, 1, 1]) },
    { label: "decal-floor", geometry: resources.cube, material: resources.floorMaterial, modelMatrix: composeMat4([0, -0.78, 0], [0, 0, 0, 1], [2.95, 0.06, 2.05]) },
    { label: "decal-backdrop", geometry: resources.cube, material: resources.backdropMaterial, modelMatrix: composeMat4([0, 0.36, -1.08], [0, 0, 0, 1], [2.95, 1.82, 0.05]) },
    ...decals.map((decal, index) => ({
      label: `decal-${index}`,
      geometry: decal.geometry,
      material: resources.decalMaterials[index % resources.decalMaterials.length],
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
    geometry: result.geometry,
    clippedTriangleCount: result.clippedTriangleCount,
    vertexCount: result.vertexCount,
    hit: { position: result.hit.position, normal: result.hit.normal }
  };
}

function compareProjectorSemantics(entries: readonly DecalRenderEntry[], threeHits: readonly { readonly position: number[]; readonly normal: number[] }[], canvas: HTMLCanvasElement) {
  let maxHitPositionDelta = 0;
  let minNormalDot = 1;
  entries.forEach((entry, index) => {
    const hit = threeHits[index]!;
    maxHitPositionDelta = Math.max(maxHitPositionDelta, distance(entry.hit.position, hit.position));
    minNormalDot = Math.min(minNormalDot, dot(normalizeVec3(entry.hit.normal), normalizeVec3(hit.normal)));
  });
  const pointerPlacement = placeDecalFromPointer({
    clientX: canvas.getBoundingClientRect().left + canvas.getBoundingClientRect().width / 2,
    clientY: canvas.getBoundingClientRect().top + canvas.getBoundingClientRect().height / 2,
    canvas,
    radius: SCENE.targetRadius,
    center: SCENE.targetCenter,
    id: 99
  });
  if (!pointerPlacement) throw new Error("Pointer semantics check failed to hit the decal target.");
  const pointerThreeHit = raycastThreeSphere(pointerPlacement);
  return {
    samePlacementCount: entries.length === threeHits.length,
    maxHitPositionDelta: Number(maxHitPositionDelta.toFixed(5)),
    minNormalDot: Number(minNormalDot.toFixed(5)),
    pointerHitDelta: Number(distance(pointerPlacement.position, pointerThreeHit.position).toFixed(5)),
    pointerNormalDot: Number(dot(normalizeVec3(pointerPlacement.normal), normalizeVec3(pointerThreeHit.normal)).toFixed(5))
  };
}

function raycastThreeSphere(placement: DecalPlacement): { readonly position: number[]; readonly normal: number[] } {
  const origin = new THREE.Vector3(
    placement.position[0] + placement.normal[0] * 0.42,
    placement.position[1] + placement.normal[1] * 0.42,
    placement.position[2] + placement.normal[2] * 0.42
  );
  const direction = new THREE.Vector3(-placement.normal[0], -placement.normal[1], -placement.normal[2]).normalize();
  const target = new THREE.Mesh(
    new THREE.SphereGeometry(SCENE.targetRadius, 64, 32),
    new THREE.MeshBasicMaterial()
  );
  target.position.set(...SCENE.targetCenter);
  target.updateMatrixWorld(true);
  const hit = new THREE.Raycaster(origin, direction, 0, 1.2).intersectObject(target, false)[0];
  if (!hit || !hit.face) throw new Error("Three.js projector semantics ray missed the sphere.");
  const normal = hit.face.normal.clone().transformDirection(target.matrixWorld).normalize();
  return { position: hit.point.toArray(), normal: normal.toArray() };
}

function createCircularAlphaTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create circular decal alpha texture.");
  context.fillStyle = "black";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createRadialGradient(64, 64, 42, 64, 64, 62);
  gradient.addColorStop(0, "white");
  gradient.addColorStop(0.82, "white");
  gradient.addColorStop(1, "black");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(64, 64, 62, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function computeDecalCameraFrame() {
  return computePerspectiveCameraFrame(SCENE.frameBounds, { width: SCENE.width, height: SCENE.height }, {
    yawRadians: -0.04,
    pitchRadians: -0.02,
    paddingRatio: 0.1,
    fovYRadians: 0.32,
    nearPadding: 0.12,
    farPadding: 2.2
  });
}

function triangleMeshFromGeometry(geometry: Geometry, translation: readonly [number, number, number]): ProjectedDecalTriangleMesh {
  const positions: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  for (let index = 0; index < geometry.vertexBuffer.vertexCount; index += 1) {
    const position = geometry.vertexBuffer.getAttribute(index, "position");
    const normal = geometry.vertexBuffer.getAttribute(index, "normal");
    positions.push([position[0] + translation[0], position[1] + translation[1], position[2] + translation[2]]);
    normals.push([normal[0], normal[1], normal[2]]);
  }
  return { positions, normals, indices: geometry.indexBuffer ? Array.from(geometry.indexBuffer.data) : undefined };
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("decals-key");
  key.intensity = 3.7;
  key.color = [1, 0.94, 0.84];
  const fill = new DirectionalLight("decals-fill");
  fill.intensity = 1.4;
  fill.color = [0.62, 0.78, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.2, 3.1, 2.4], direction: [-0.45, -0.7, -0.55], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-2.8, 1.8, 1.6], direction: [0.6, -0.25, -0.45], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill }
  ];
}

function requiredCanvas(id: string, width: number, height: number): HTMLCanvasElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${id}.`);
  element.width = width;
  element.height = height;
  return element;
}

async function dataUrlToPixels(dataUrl: string): Promise<ImageData> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create decals parity pixel canvas.");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function analyzeImageData(image: ImageData): PixelStats {
  let nonBlackPixels = 0;
  let saturatedPixels = 0;
  let lumaTotal = 0;
  const buckets = new Set<number>();
  for (let offset = 0; offset + 3 < image.data.length; offset += 4) {
    const red = image.data[offset] ?? 0;
    const green = image.data[offset + 1] ?? 0;
    const blue = image.data[offset + 2] ?? 0;
    if (red + green + blue > 12) nonBlackPixels += 1;
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 26 && red + green + blue > 90) saturatedPixels += 1;
    buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
    lumaTotal += luma(red, green, blue);
  }
  return {
    nonBlackPixels,
    uniqueColorBuckets: buckets.size,
    averageLuma: Number((lumaTotal / (image.data.length / 4)).toFixed(4)),
    saturatedPixels
  };
}

function computeDiff(left: ImageData, right: ImageData): DiffStats {
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error(`Cannot diff decals captures with mismatched size: ${left.width}x${left.height} vs ${right.width}x${right.height}.`);
  }
  let totalDelta = 0;
  let maxDelta = 0;
  let changedPixels = 0;
  for (let offset = 0; offset + 3 < left.data.length; offset += 4) {
    const delta = (
      Math.abs((left.data[offset] ?? 0) - (right.data[offset] ?? 0))
      + Math.abs((left.data[offset + 1] ?? 0) - (right.data[offset + 1] ?? 0))
      + Math.abs((left.data[offset + 2] ?? 0) - (right.data[offset + 2] ?? 0))
    ) / 3;
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > 8) changedPixels += 1;
  }
  const meanDelta = totalDelta / (left.width * left.height);
  return {
    meanDelta: Number(meanDelta.toFixed(4)),
    maxDelta: Number(maxDelta.toFixed(4)),
    changedPixels,
    structuralSimilarityProxy: Number(Math.max(0, 1 - meanDelta / 255).toFixed(4))
  };
}

async function drawSideBySide(canvas: HTMLCanvasElement, g3dDataUrl: string, threeDataUrl: string, diff: DiffStats): Promise<string> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create decals side-by-side canvas.");
  const [g3d, three] = await Promise.all([loadImage(g3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#07090d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(g3d, 0, 0, SCENE.width, SCENE.height);
  context.drawImage(three, SCENE.width, 0, SCENE.width, SCENE.height);
  context.fillStyle = "rgba(7, 9, 13, 0.9)";
  context.fillRect(0, SCENE.height, canvas.width, 60);
  context.fillStyle = "#f3f6f8";
  context.font = "20px system-ui, sans-serif";
  context.fillText("G3D ProjectedDecalGeometry", 20, SCENE.height + 28);
  context.fillText("Three.js DecalGeometry baseline", SCENE.width + 20, SCENE.height + 28);
  context.fillStyle = "#aeb8c6";
  context.font = "16px system-ui, sans-serif";
  context.fillText(`mean delta ${diff.meanDelta} | changed ${diff.changedPixels} | SSIM proxy ${diff.structuralSimilarityProxy}`, 20, SCENE.height + 50);
  return canvas.toDataURL("image/png");
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to decode decals parity image data URL."));
    image.src = dataUrl;
  });
  return image;
}

function distance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));
}

function dot(a: readonly number[], b: readonly number[]): number {
  return (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
}

function luma(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
