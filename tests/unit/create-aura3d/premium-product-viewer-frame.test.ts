import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem.js";
import type { AuraModelNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera.js";
import { productionActorModelBounds } from "../../../packages/engine/src/agent-api/compiler/actors.js";
import { createProductionRuntimeRendererInput, setPrd01ModelMatrixCache } from "../../../packages/engine/src/agent-api/compiler/renderInput.js";
import { modelMatrixFor } from "../../../packages/engine/src/agent-api/compiler/sceneGraph.js";
import { createModelMatrixCache } from "../../../packages/engine/src/agent-api/sceneGraph.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import { createTypedGLBActor, type TypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { clearTypedGLBActorQrFlags, setTypedGLBActorQrFlags } from "../../../packages/engine/src/production-runtime/actor/extensions.js";

// Run the actual template builders but stop at the app mount: no browser, GPU,
// screenshot, network, or claim about rendered appearance is involved.
const mounted = vi.hoisted(() => ({ snapshot: undefined as AuraSceneSnapshot | undefined, target: "" }));
vi.mock("@aura3d/engine", async (importOriginal) => ({
  ...await importOriginal<typeof import("@aura3d/engine")>(),
  createAuraApp(target: string, options: { scene: { toJSON(): AuraSceneSnapshot } }) {
    mounted.target = target;
    mounted.snapshot = options.scene.toJSON();
    return {};
  }
}));

type Vec3 = readonly [number, number, number];
type Bounds = { min: [number, number, number]; max: [number, number, number] };
interface GltfJson {
  scene: number;
  scenes: Array<{ nodes: number[] }>;
  nodes: Array<{ name?: string; mesh?: number; rotation?: [number, number, number, number]; scale?: Vec3; translation?: Vec3; children?: number[]; matrix?: number[] }>;
  meshes: Array<{ primitives: Array<{ attributes: { POSITION: number } }> }>;
  accessors: Array<{ min: Vec3; max: Vec3 }>;
  images: Array<{ bufferView?: number; uri?: string }>;
  buffers: Array<{ uri?: string }>;
}

function emptyBounds(): Bounds {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

function include(bounds: Bounds, point: Vec3): void {
  for (let axis = 0; axis < 3; axis += 1) {
    bounds.min[axis] = Math.min(bounds.min[axis]!, point[axis]!);
    bounds.max[axis] = Math.max(bounds.max[axis]!, point[axis]!);
  }
}

function extents(bounds: Bounds): Vec3 {
  return [0, 1, 2].map((axis) => bounds.max[axis]! - bounds.min[axis]!) as unknown as Vec3;
}

// Independent glTF TRS of the real accessor AABBs. This asset's three mesh
// nodes are roots without parents/matrices; fail closed if that ever changes.
function authoredBounds(gltf: GltfJson, meshName?: string): Bounds {
  const bounds = emptyBounds();
  for (const index of gltf.scenes[gltf.scene]!.nodes) {
    const node = gltf.nodes[index]!;
    if (node.mesh === undefined || (meshName && node.name !== meshName)) continue;
    expect(node.children).toBeUndefined();
    expect(node.matrix).toBeUndefined();
    const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
    const scale = node.scale ?? [1, 1, 1];
    const translation = node.translation ?? [0, 0, 0];
    for (const primitive of gltf.meshes[node.mesh]!.primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION]!;
      for (let corner = 0; corner < 8; corner += 1) {
        const [x, y, z] = ([0, 1, 2].map((axis) =>
          (corner & (1 << axis) ? accessor.max[axis]! : accessor.min[axis]!) * scale[axis]!
        )) as [number, number, number];
        include(bounds, [
          translation[0] + (1 - 2 * (qy * qy + qz * qz)) * x + 2 * (qx * qy - qz * qw) * y + 2 * (qx * qz + qy * qw) * z,
          translation[1] + 2 * (qx * qy + qz * qw) * x + (1 - 2 * (qx * qx + qz * qz)) * y + 2 * (qy * qz - qx * qw) * z,
          translation[2] + 2 * (qx * qz - qy * qw) * x + 2 * (qy * qz + qx * qw) * y + (1 - 2 * (qx * qx + qy * qy)) * z
        ]);
      }
    }
  }
  return bounds;
}

type Input = ReturnType<typeof createProductionRuntimeRendererInput>;
type Item = RenderItem;

function transformedVertices(item: Item): Vec3[] {
  const matrix = item.modelMatrix;
  if (!matrix) throw new Error(`Missing model matrix for ${item.label}`);
  const positions = item.geometry.getAttributeBuffer("position");
  const vertices: Vec3[] = [];
  for (let index = 0; index < item.geometry.vertexBuffer.vertexCount; index += 1) {
    const p = positions.getDecodedAttribute(index, "position");
    vertices.push([
      matrix[0]! * p[0]! + matrix[4]! * p[1]! + matrix[8]! * p[2]! + matrix[12]!,
      matrix[1]! * p[0]! + matrix[5]! * p[1]! + matrix[9]! * p[2]! + matrix[13]!,
      matrix[2]! * p[0]! + matrix[6]! * p[1]! + matrix[10]! * p[2]! + matrix[14]!
    ]);
  }
  return vertices;
}

function vertexBounds(vertices: readonly Vec3[]): Bounds {
  const bounds = emptyBounds();
  for (const point of vertices) include(bounds, point);
  return bounds;
}

function projectedBounds(vertices: readonly Vec3[], matrix: ArrayLike<number>) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minDepth = Infinity;
  for (const [x, y, z] of vertices) {
    const w = matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!;
    const px = (matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!) / w;
    const py = (matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!) / w;
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    minDepth = Math.min(minDepth, w);
  }
  return { minX, maxX, minY, maxY, minDepth, widthFraction: (maxX - minX) / 2, heightFraction: (maxY - minY) / 2 };
}

function viewProjection(input: Input): ArrayLike<number> {
  const matrix = input.camera?.viewProjectionMatrix;
  if (!matrix) throw new Error("Missing frame view-projection matrix");
  return matrix;
}

describe("premium product viewer source framing", () => {
  let snapshot: AuraSceneSnapshot;
  let node: AuraModelNode;
  let actor: TypedGLBActor;
  let gltf: GltfJson;
  let releaseMatrix: (() => void) | undefined;
  const owner = {};

  beforeAll(async () => {
    vi.stubGlobal("window", {});
    await import("../../../packages/create-aura3d/templates/premium-product-viewer/src/main.js");
    if (!mounted.snapshot) throw new Error("Template did not mount a scene");
    snapshot = mounted.snapshot;
    const model = snapshot.nodes.find((candidate): candidate is AuraModelNode => candidate.kind === "model");
    if (!model) throw new Error("Template did not author a model");
    node = model;
    const path = `packages/create-aura3d/templates/premium-product-viewer/public${node.asset.url}`;
    const bytes = readFileSync(path);
    expect(node.asset.hash).toBe(`sha256-${createHash("sha256").update(bytes).digest("hex")}`);
    expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
    gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8")) as GltfJson;
    const url = new URL(node.asset.url, "https://premium-fixture.invalid").href;
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const requested = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (requested !== url) throw new Error(`Unexpected offline asset request: ${requested}`);
      return new Response(new Uint8Array(bytes), { status: 200 });
    });
    const flags = resolveQrFlags({ env: {} });
    expect(flags.on("A3D_QR_CORE")).toBe(true);
    setTypedGLBActorQrFlags(flags, owner);
    releaseMatrix = setPrd01ModelMatrixCache(createModelMatrixCache(modelMatrixFor(flags)), owner);
    actor = await createTypedGLBActor({
      asset: { ...node.asset, url }, id: node.asset.id, name: node.name, width: 1280, height: 720,
      runtimeOwner: owner, shareTextures: false,
      // Texture bytes are embedded; a headless placeholder prevents image
      // decoding from becoming a visual assertion. Geometry is the real GLB.
      imageDecoder: async (source) => {
        if (!source.data) throw new Error("Expected embedded texture bytes");
        return { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) };
      }
    });
  }, 30_000);

  afterAll(() => {
    actor?.dispose();
    releaseMatrix?.();
    clearTypedGLBActorQrFlags(owner);
    vi.unstubAllGlobals();
  });

  function inputFor(cameraSnapshot: AuraSceneSnapshot, model: AuraModelNode, width: number, height: number): Input {
    return createProductionRuntimeRendererInput(
      cameraSnapshot, { width, height } as HTMLCanvasElement, [{ node: model, actor }], [], 0, undefined,
      new Set(), { color: [0, 0, 0], intensity: 0 }, [], undefined, undefined, undefined, owner
    );
  }

  function item(input: Input, name: string): Item {
    const items = [...(input.source.collectRenderItems?.() ?? [])];
    const found = items.find((candidate) => candidate.label?.includes(`:${name}:`));
    if (!found) throw new Error(`Missing ${name}; labels: ${items.map((candidate) => candidate.label).join(", ")}`);
    return found;
  }

  it("derives physical bounds from the hashed GLB and verifies the typed loader", () => {
    expect(mounted.target).toBe("#app");
    expect(node.asset.id).toBe("product");
    const manifest = JSON.parse(readFileSync("packages/create-aura3d/templates/premium-product-viewer/aura.assets.json", "utf8")) as {
      assets: Array<{ id: string; hash: string; license: string; provenance: string }>;
    };
    const product = manifest.assets.find((entry) => entry.id === node.asset.id);
    expect(product?.hash).toBe(node.asset.hash);
    expect(product?.license).toBe("CC0-1.0");
    // invariant: source must keep `Khronos` provenance in the template aura.assets.json — the scaffolded CC0 product GLB stays traceable to its Khronos sample source
    expect(product?.provenance).toContain("Khronos");
    expect(node.asset.format).toBe("glb");
    expect(node.visible).toBe(true);
    expect(node.castShadow).toBe(true);
    expect(node.hiddenNodeNames).toBeUndefined();
    expect(snapshot.nodes.some((candidate) =>
      candidate.kind === "group" && candidate.name === "aura-look:product-studio"
    )).toBe(true);
    expect(snapshot.nodes.some((candidate) =>
      candidate.kind === "interaction" && candidate.mode === "orbit" && candidate.target === node.name
    )).toBe(true);
    expect(gltf.images.length).toBeGreaterThan(0);
    expect(gltf.images.every((image) => image.bufferView !== undefined && image.uri === undefined)).toBe(true);
    expect(gltf.buffers.every((buffer) => buffer.uri === undefined)).toBe(true);
    for (const root of gltf.nodes.filter((candidate) => candidate.mesh !== undefined)) {
      expect(root.scale).toEqual([0.0001, 0.0001, 0.0001]);
    }
    const rawCar = authoredBounds(gltf, "ToyCar");
    const loaded = productionActorModelBounds(node.asset, actor);
    const independent = authoredBounds(gltf);
    extents(rawCar).forEach((value, axis) => expect(value).toBeCloseTo([0.01870753, 0.01162420, 0.03837942][axis]!, 7));
    extents(independent).forEach((value, axis) => expect(value).toBeCloseTo([0.07344292, 0.02882290, 0.07396229][axis]!, 7));
    for (let axis = 0; axis < 3; axis += 1) {
      expect(loaded.min[axis]).toBeCloseTo(independent.min[axis]!, 6);
      expect(loaded.max[axis]).toBeCloseTo(independent.max[axis]!, 6);
    }
    // The generated bounds are untransformed mesh-local extents, not the
    // physical scene-space dimensions the production fitter actually uses.
    expect(node.asset.bounds).toEqual([734.429, 739.623, 288.229]);
    expect(node.asset.bounds![1] / extents(independent)[1]).toBeGreaterThan(20_000);
  });

  it("rejects the historic subpixel frame and frames the actual typed car on the plinth", () => {
    const oldCamera = camera.frameAsset(node.asset, {
      targetHeight: 1.1, padding: 1.55, fov: 32, azimuth: 0.55, elevation: 0.3
    });
    const oldNode: AuraModelNode = { ...node, scale: 0.0021, targetHeight: undefined, targetLength: undefined, targetMaxDimension: undefined };
    const oldInput = inputFor({ ...snapshot, camera: oldCamera }, oldNode, 1280, 720);
    const oldBody = transformedVertices(item(oldInput, "ToyCar"));
    const oldProjection = projectedBounds(oldBody, viewProjection(oldInput));
    expect(oldCamera.distance).toBeCloseTo(4.347, 2);
    expect(oldProjection.heightFraction * 720).toBeLessThan(1);
    expect(oldProjection.widthFraction * 1280).toBeLessThan(1);

    expect(node.targetMaxDimension).toBeCloseTo(1.55, 6);
    expect(node.scale ?? 1).toBe(1);
    const desktop = inputFor(snapshot, node, 1280, 720);
    const mobile = inputFor(snapshot, node, 390, 844);
    const body = transformedVertices(item(desktop, "ToyCar"));
    const fabric = transformedVertices(item(desktop, "Fabric"));
    expect(item(desktop, "Glass")).toBeDefined();
    const bodyBounds = vertexBounds(body);
    const fabricBounds = vertexBounds(fabric);
    const plinth = snapshot.nodes.find((candidate) => candidate.kind === "primitive" && candidate.name === "product plinth");
    expect(plinth?.kind).toBe("primitive");
    if (!plinth || plinth.kind !== "primitive" || typeof plinth.size === "number") throw new Error("Missing plinth dimensions");
    const plinthTop = plinth.position![1] + plinth.size![1] / 2;
    const plinthRadius = Math.min(plinth.size![0], plinth.size![2]) / 2;
    expect(fabricBounds.min[1]).toBeCloseTo(plinthTop, 5);
    expect(fabric.some(([x, y, z]) =>
      Math.hypot(x - plinth.position![0], z - plinth.position![2]) < plinthRadius &&
      Math.abs(y - plinthTop) < 0.0001
    )).toBe(true);
    // The extrema meet in height; this is not a proof of pixel-level contact.
    expect(Math.abs(bodyBounds.min[1] - fabricBounds.max[1])).toBeLessThan(0.001);
    expect(bodyBounds.max[1] - bodyBounds.min[1]).toBeGreaterThan(0.2);
    expect(snapshot.camera.mode).toBe("orbit");
    expect(snapshot.camera.target![1]).toBeGreaterThan(bodyBounds.min[1]);
    expect(snapshot.camera.target![1]).toBeLessThan(bodyBounds.max[1]);
    for (const input of [desktop, mobile]) {
      const projection = projectedBounds(body, viewProjection(input));
      expect(projection.minDepth).toBeGreaterThan(0.1);
      expect(projection.minX).toBeGreaterThan(-0.95);
      expect(projection.maxX).toBeLessThan(0.95);
      expect(projection.minY).toBeGreaterThan(-0.95);
      expect(projection.maxY).toBeLessThan(0.95);
      expect(projection.heightFraction).toBeGreaterThan(0.45);
      expect(projection.heightFraction).toBeLessThan(0.7);
    }
  });
});
