import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuraAppWithPhysicsWorldAccess } from "../../../packages/engine/src/agent-api/app/createAuraAppCore";
import type { PhysicsWorldAccess, PhysicsWorldConstructor } from "../../../packages/engine/src/agent-api/physics/PhysicsWorldAccess";
import { camera, defineModelAssets, group, instances, material, primitives, scene } from "../../../packages/engine/src/public/index";
import type { AuraApp } from "../../../packages/engine/src/agent-api/nodes/types";
import type { AuraSceneBuilder } from "../../../packages/engine/src/agent-api/nodes/scene";
import { RigidBody, type RigidBodyDescriptor } from "../../../packages/physics/src/RigidBody";
import { MockRenderBuffer, MockRenderDevice, type DrawCommand } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

/** Deterministic solver boundary: application, compiler and rendering stay real. */
class TestWorld {
  readonly fixedDelta = 1 / 60;
  readonly records = new Map<number, RigidBody>();
  readonly colliderOwners = new Set<number>();
  readonly gravity: Vec3;
  nextId = 1;
  stepCalls = 0;
  disposed = false;

  constructor(options: { readonly gravity?: Vec3 } = {}) { this.gravity = options.gravity ?? [0, 0, 0]; }
  createRigidBody(descriptor: RigidBodyDescriptor = {}): RigidBody {
    const body = new RigidBody(this.nextId++, descriptor);
    this.records.set(body.id, body);
    return body;
  }
  createCollider(body: RigidBody): { readonly id: number; readonly bodyId: number } {
    this.colliderOwners.add(body.id);
    return { id: body.id, bodyId: body.id };
  }
  removeRigidBody(id: number): void { this.records.delete(id); this.colliderOwners.delete(id); }
  getBody(id: number): RigidBody | undefined { return this.records.get(id); }
  bodies(): RigidBody[] { return [...this.records.values()]; }
  colliders(): [] { return []; }
  step(dt = this.fixedDelta): [] {
    this.stepCalls += 1;
    for (const body of this.records.values()) {
      if (body.type !== "dynamic" || body.sleeping) continue;
      body.setPosition([
        body.position[0] + body.velocity[0] * dt,
        body.position[1] + body.velocity[1] * dt,
        body.position[2] + body.velocity[2] * dt
      ]);
    }
    return [];
  }
  snapshot() {
    return { backend: { active: "test" }, stats: { bodies: this.records.size, colliders: this.colliderOwners.size, steps: this.stepCalls }, contacts: [] };
  }
  dispose(): void { this.disposed = true; this.records.clear(); this.colliderOwners.clear(); }
}

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

interface CapturedDraw {
  readonly label: string;
  readonly model: readonly number[] | null;
  readonly instances: readonly (readonly number[])[];
}

/** Snapshot uniforms and instance bytes at submission, before buffers are reused. */
class CapturingDevice extends MockRenderDevice {
  readonly submitted: CapturedDraw[] = [];
  override draw(command: DrawCommand): void {
    const uniform = command.uniforms?.get("u_modelMatrix");
    const model = uniform instanceof Float32Array || Array.isArray(uniform) ? Array.from(uniform) : null;
    const columns = [0, 1, 2, 3].map((index) => command.instanceAttributes?.find((attribute) => attribute.shaderName === `a_instanceMatrix${index}`));
    const matrices: number[][] = [];
    if (columns.every((column) => column?.buffer instanceof MockRenderBuffer)) {
      for (let instance = 0; instance < (command.instanceCount ?? 1); instance += 1) {
        const matrix: number[] = [];
        for (const column of columns) {
          const attribute = column!;
          const bytes = (attribute.buffer as MockRenderBuffer).bytes;
          const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          for (let row = 0; row < 4; row += 1) matrix.push(data.getFloat32(attribute.offset + instance * attribute.stride + row * 4, true));
        }
        matrices.push(matrix);
      }
    }
    this.submitted.push({ label: command.label ?? "", model, instances: matrices });
    super.draw(command);
  }
}

const child = (name = "body") => primitives.box({ name, size: [1, 1, 1], material: material.pbr({ color: "#a05030" }) })
  .position(1, 0, 0)
  .runtime({ id: name })
  .physics({ type: "dynamic", shape: "box", halfExtents: [0.5, 0.5, 0.5], mass: 1 });

const parent = (children: Parameters<typeof group>[1] = [child()]) => group("parent", children, {
  position: [3, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 2, 2]
}).runtime({ id: "parent" });

function authoredScene(children: Parameters<typeof group>[1] = [child()]): AuraSceneBuilder {
  return scene({ camera: camera.perspective({ position: [0, 0, 30], target: [0, 0, 0], fov: 65 }) }).add(parent(children));
}

async function harness(initial: AuraSceneBuilder, bindNodes = true, core = true, mountRenderer = true) {
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: "https://scene.example.test/", search: "" }, addEventListener() {}, removeEventListener() {} });
  const worlds: TestWorld[] = [];
  class TrackedWorld extends TestWorld {
    constructor(options: ConstructorParameters<typeof TestWorld>[0]) { super(options); worlds.push(this); }
  }
  const access: PhysicsWorldAccess = { preload: async () => {}, requireReady: () => TrackedWorld as unknown as PhysicsWorldConstructor };
  const devices: CapturingDevice[] = [];
  vi.spyOn(Renderer, "create").mockImplementation(async (options = {}) => {
    const device = new CapturingDevice();
    Object.defineProperty(device, "kind", { value: "webgl2" });
    Object.defineProperty(device, "info", { value: { ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"] } });
    devices.push(device);
    return new Renderer(device, { ...options, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
  });
  const target = mountRenderer ? new FakeCanvas() as unknown as HTMLCanvasElement : undefined as never;
  const app = createAuraAppWithPhysicsWorldAccess(access, target, {
    scene: initial, autoStart: false, resize: false,
    physics: { bindNodes, gravity: [0, 0, 0] },
    qualityRebuild: { flags: {
      A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true, A3D_QR_CORE: core, A3D_QR_CORE_GENERATOR: true,
      A3D_QR_MATERIALS: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false, A3D_QR_VFX: false
    }, allowUrlFlags: false }
  });
  void app.physics;
  if (mountRenderer) await app.readyStrict({ stage: "first-frame" });
  return { app, device: devices[devices.length - 1]!, world: worlds[worlds.length - 1]! };
}

function frame(app: AuraApp, device: CapturingDevice, name: string): CapturedDraw {
  device.submitted.length = 0;
  app.step(0);
  const draw = device.submitted.filter((entry) => entry.label.includes(`:${name}`)).at(-1);
  expect(draw, `expected a submitted draw for ${name}`).toBeDefined();
  if (!draw?.model) throw new Error(`Missing submitted model matrix for ${name}`);
  return draw;
}

function closeVector(actual: ArrayLike<number>, expected: readonly number[], digits = 5): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, index) => expect(actual[index], `component ${index}`).toBeCloseTo(value, digits));
}

function closeQuaternion(actual: Quat, expected: Quat): void {
  const dot = actual.reduce((sum, value, index) => sum + value * expected[index]!, 0);
  expect(Math.abs(dot)).toBeCloseTo(1, 5);
}

/** The fixture is a single locally generated triangle with an embedded buffer. */
function triangleDocument(): Uint8Array {
  const positions = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const bytes = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength);
  const document = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: bytes.length, uri: `data:application/octet-stream;base64,${bytes.toString("base64")}` }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bytes.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
  };
  return new TextEncoder().encode(JSON.stringify(document));
}

/** Independent column-major multiplication to inspect the submitted instance. */
function multiply4(left: readonly number[], right: readonly number[]): number[] {
  return Array.from({ length: 16 }, (_, index) => {
    const row = index % 4, column = Math.floor(index / 4);
    return [0, 1, 2, 3].reduce((sum, k) => sum + left[k * 4 + row]! * right[column * 4 + k]!, 0);
  });
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("parented runtime rendering and explicit physics binding", () => {
  it("keeps mounted world-facing poses and draw matrices aligned as the parent moves and physics steps", async () => {
    const h = await harness(authoredScene());
    try {
      const handle = h.app.nodes.require("body"), groupHandle = h.app.nodes.require("parent");
      const body = h.app.physics.bodies.require("body");
      closeVector(handle.position, [3, 2, 0]);
      closeVector(handle.getWorldPosition(), [3, 2, 0]);
      closeVector(body.position(), [3, 2, 0]);
      closeVector(frame(h.app, h.device, "body").model!, [0, 2, 0, 0, -2, 0, 0, 0, 0, 0, 2, 0, 3, 2, 0, 1]);
      expect(h.world.stepCalls).toBe(0);

      groupHandle.setPosition(4, 1, 0);
      closeVector(handle.position, [4, 3, 0]);
      closeVector(handle.getWorldPosition(), [4, 3, 0]);
      closeVector(frame(h.app, h.device, "body").model!.slice(12, 15), [4, 3, 0]);
      closeVector(body.position(), [3, 2, 0]);
      expect(h.world.stepCalls).toBe(0);

      body.setVelocity([2, 0, 0]);
      h.app.physics.step(1);
      expect(h.world.stepCalls).toBe(1);
      closeVector(body.position(), [5, 2, 0]);
      closeVector(handle.position, [5, 2, 0]);
      closeVector(handle.getWorldPosition(), [5, 2, 0]);
      closeVector(frame(h.app, h.device, "body").model!.slice(12, 15), [5, 2, 0]);
    } finally { await h.app.disposeAsync(); }
  });

  it("keeps a runtime-added child's public pose local while writing its simulated world pose through the parent", async () => {
    // A visible anchor mounts the real compiler before the runtime addition.
    const anchor = primitives.box({ name: "anchor" }).position(0, -2, 0);
    const h = await harness(authoredScene([]).add(anchor));
    try {
      const added = h.app.nodes.add!(child("added"), { parent: "parent" });
      const body = h.app.physics.bodies.require("added");
      closeVector(added.position, [1, 0, 0]);
      closeVector(added.getWorldPosition(), [3, 2, 0]);
      closeVector(body.position(), [3, 2, 0]);
      closeVector(frame(h.app, h.device, "added").model!.slice(12, 15), [3, 2, 0]);

      body.setPosition([5, 4, 0]);
      h.app.physics.step(1 / 60);
      closeVector(added.position, [2, -1, 0]);
      closeVector(added.getWorldPosition(), [5, 4, 0]);
      closeVector(frame(h.app, h.device, "added").model!.slice(12, 15), [5, 4, 0]);
    } finally { await h.app.disposeAsync(); }
  });

  it("writes the solver's world quaternion through a rotated parent without applying the parent twice", async () => {
    const h = await harness(authoredScene());
    try {
      const body = h.app.physics.bodies.require("body"), handle = h.app.nodes.require("body");
      const desired: Quat = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)];
      h.world.records.get(body.id)!.setRotation(desired);
      h.app.physics.step(1 / 60);
      closeQuaternion(handle.getWorldQuaternion(), desired);
      const matrix = frame(h.app, h.device, "body").model!;
      closeVector([matrix[0]!, matrix[1]!, matrix[4]!, matrix[5]!], [Math.SQRT2, Math.SQRT2, -Math.SQRT2, Math.SQRT2]);
      closeVector(matrix.slice(12, 15), body.position());
    } finally { await h.app.disposeAsync(); }
  });

  it("tracks a live parent rotation before returning the child to its solver-owned world pose", async () => {
    const h = await harness(authoredScene());
    try {
      const handle = h.app.nodes.require("body"), body = h.app.physics.bodies.require("body");
      h.app.nodes.require("parent").setRotation(0, 0, 0);
      closeVector(handle.getWorldPosition(), [5, 0, 0]);
      closeVector(frame(h.app, h.device, "body").model!.slice(12, 15), [5, 0, 0]);
      closeVector(body.position(), [3, 2, 0]);
      expect(h.world.stepCalls).toBe(0);
      h.app.physics.step(1 / 60);
      closeVector(handle.getWorldPosition(), [3, 2, 0]);
      closeVector(frame(h.app, h.device, "body").model!.slice(12, 15), [3, 2, 0]);
      closeQuaternion(handle.getWorldQuaternion(), [0, 0, Math.SQRT1_2, Math.SQRT1_2]);
    } finally { await h.app.disposeAsync(); }
  });

  it("does not write a parented body to its node when binding is disabled", async () => {
    const h = await harness(authoredScene(), false);
    try {
      const handle = h.app.nodes.require("body"), body = h.app.physics.bodies.require("body");
      h.app.nodes.require("parent").setPosition(4, 1, 0);
      body.setVelocity([2, 0, 0]);
      frame(h.app, h.device, "body");
      expect(h.world.stepCalls).toBe(0);
      h.app.physics.step(1);
      closeVector(body.position(), [5, 2, 0]);
      closeVector(handle.getWorldPosition(), [4, 3, 0]);
      closeVector(frame(h.app, h.device, "body").model!.slice(12, 15), [4, 3, 0]);
    } finally { await h.app.disposeAsync(); }
  });

  it("uses the sleeping body's unchanged world pose when the moved parent is synchronized", async () => {
    const h = await harness(authoredScene());
    try {
      const body = h.app.physics.bodies.require("body"), handle = h.app.nodes.require("body");
      body.sleep();
      h.app.nodes.require("parent").setPosition(4, 1, 0);
      closeVector(handle.getWorldPosition(), [4, 3, 0]);
      h.app.physics.step(1 / 60);
      expect(body.sleeping()).toBe(true);
      closeVector(handle.getWorldPosition(), [3, 2, 0]);
      closeVector(frame(h.app, h.device, "body").model!.slice(12, 15), [3, 2, 0]);
    } finally { await h.app.disposeAsync(); }
  });

  it("preserves render-only shear, a local pivot and parent visibility without touching physics", async () => {
    const visual = primitives.box({ name: "visual", size: [1, 1, 1] }).position(1, 0, 0).rotate(0, 0, Math.PI / 4).runtime({ id: "visual" });
    const start = scene({ camera: camera.perspective({ position: [0, 0, 30], target: [0, 0, 0], fov: 65 }) })
      .add(group("visual-parent", [visual], { scale: [2, 1, 1] }).runtime({ id: "visual-parent" }));
    const h = await harness(start, false);
    try {
      const visualHandle = h.app.nodes.require("visual"), parentHandle = h.app.nodes.require("visual-parent");
      const initial = frame(h.app, h.device, "visual").model!;
      closeVector([initial[0]!, initial[1]!, initial[4]!, initial[5]!], [Math.SQRT2, Math.SQRT1_2, -Math.SQRT2, Math.SQRT1_2]);
      visualHandle.setPivot(0.5, 0, 0);
      const pivoted = frame(h.app, h.device, "visual").model!;
      closeVector(pivoted.slice(12, 15), [3 - Math.SQRT2 / 2, -Math.SQRT2 / 4, 0]);
      parentHandle.setVisible(false);
      h.device.submitted.length = 0;
      h.app.step(0);
      expect(h.device.submitted.some((entry) => entry.label.includes(":visual"))).toBe(false);
      expect(h.world.stepCalls).toBe(0);
    } finally { await h.app.disposeAsync(); }
  });

  it("renders local primitive instances under a parent once and responds to a parent move", async () => {
    const node = instances.box({ name: "instances", size: [1, 1, 1], transforms: [{ position: [0, 0, 0] }, { position: [1, 0, 0] }] })
      .runtime({ id: "instances" });
    const h = await harness(authoredScene([node]), false);
    try {
      const first = frame(h.app, h.device, "instances");
      closeVector(first.model!.slice(12, 15), [3, 0, 0]);
      expect(first.instances).toHaveLength(2);
      closeVector(first.instances[0]!.slice(12, 15), [0, 0, 0]);
      closeVector(first.instances[1]!.slice(12, 15), [1, 0, 0]);
      h.app.nodes.require("parent").setPosition(4, 1, 0);
      const moved = frame(h.app, h.device, "instances");
      closeVector(moved.model!.slice(12, 15), [4, 1, 0]);
      closeVector(moved.instances[1]!.slice(12, 15), [1, 0, 0]);
    } finally { await h.app.disposeAsync(); }
  });

  it("moves an anonymous authored child with its parent without adding a public node ID", async () => {
    const anonymous = primitives.box({ name: "anonymous", size: [1, 1, 1] }).position(1, 0, 0);
    const h = await harness(authoredScene([anonymous]), false);
    try {
      const ids = [...h.app.nodes.ids()];
      expect(ids).not.toContain("anonymous");
      closeVector(frame(h.app, h.device, "anonymous").model!.slice(12, 15), [3, 2, 0]);
      h.app.nodes.require("parent").setPosition(4, 1, 0);
      closeVector(frame(h.app, h.device, "anonymous").model!.slice(12, 15), [4, 3, 0]);
      expect(h.app.nodes.ids()).toEqual(ids);
    } finally { await h.app.disposeAsync(); }
  });

  it.each([
    { label: "world", scaleMode: "world", fit: 1, grounding: 0 },
    { label: "default normalized", scaleMode: undefined, fit: 1.55, grounding: 0.5 }
  ] as const)("submits parented model instances with authored Euler rotation and $label scale", async ({ scaleMode, fit, grounding }) => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("location", { origin: "https://scene.example.test", href: "https://scene.example.test/", search: "" });
    const document = triangleDocument(), originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("data:")) return originalFetch(input, init);
      if (new URL(url, "https://scene.example.test/").pathname === "/triangle.gltf") {
        return new Response(document.slice().buffer as ArrayBuffer, { headers: { "content-type": "model/gltf+json" } });
      }
      throw new Error(`Unexpected model fixture request: ${url}`);
    }));
    const asset = defineModelAssets({ triangle: {
      url: "/triangle.gltf", sha256: createHash("sha256").update(document).digest("hex")
    } }, { queryParam: null }).refs.triangle;
    const node = instances.model(asset, {
      name: "model-instance", quaternion: [0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)],
      ...(scaleMode === undefined ? {} : { scaleMode }),
      transforms: [{ position: [0, 0, 0] }, { position: [1, 0, 0], rotation: [0, 0, Math.PI / 3] }]
    }).position(1, 0, 0).runtime({ id: "model-instance" });
    const h = await harness(authoredScene([node]), false);
    try {
      let draw: CapturedDraw | undefined;
      await vi.waitFor(() => {
        h.device.submitted.length = 0;
        h.app.step(0);
        draw = h.device.submitted.find((item) => item.label.startsWith("actor-") && item.instances.length === 2);
        expect(draw?.model).toHaveLength(16);
      }, { timeout: 3000 });
      const inherited = multiply4(draw!.model!, draw!.instances[0]!);
      const world = multiply4(draw!.model!, draw!.instances[1]!);
      // The model-instance contract applies each specified transform field
      // over the model node. Its Euler value replaces the node quaternion;
      // the first instance retains the 30-degree authored quaternion.
      closeVector([inherited[0]!, inherited[1]!, inherited[4]!, inherited[5]!],
        [-fit, Math.sqrt(3) * fit, -Math.sqrt(3) * fit, -fit]);
      closeVector(inherited.slice(12, 15), [3 - Math.sqrt(3) * grounding * fit, -grounding * fit, 0]);
      closeVector([world[0]!, world[1]!, world[4]!, world[5]!],
        [-Math.sqrt(3) * fit, fit, -fit, -Math.sqrt(3) * fit]);
      closeVector(world.slice(12, 15), [3 - grounding * fit, 2 - Math.sqrt(3) * grounding * fit, 0]);
      h.app.nodes.require("parent").setPosition(4, 1, 0);
      h.device.submitted.length = 0;
      h.app.step(0);
      const moved = h.device.submitted.find((item) => item.label.startsWith("actor-") && item.instances.length === 2);
      expect(moved?.model).toHaveLength(16);
      const movedWorld = multiply4(moved!.model!, moved!.instances[1]!);
      closeVector(movedWorld.slice(12, 15), [4 - grounding * fit, 3 - Math.sqrt(3) * grounding * fit, 0]);
    } finally { await h.app.disposeAsync(); }
  });

  it("removes a parented body and draw while leaving an unrelated sibling live", async () => {
    const sibling = primitives.box({ name: "sibling" }).position(0, -2, 0).runtime({ id: "sibling" });
    const h = await harness(authoredScene().add(sibling));
    try {
      const body = h.app.physics.bodies.require("body");
      expect(h.app.nodes.remove!("parent")).toBe(true);
      expect(h.app.nodes.has("body")).toBe(false);
      expect(h.app.physics.bodies.has("body")).toBe(false);
      expect(() => body.position()).toThrow(/removed/i);
      expect(h.app.nodes.has("sibling")).toBe(true);
      h.device.submitted.length = 0;
      h.app.step(0);
      expect(h.device.submitted.some((entry) => entry.label.includes(":body"))).toBe(false);
      expect(h.device.submitted.some((entry) => entry.label.includes(":sibling"))).toBe(true);
    } finally { await h.app.disposeAsync(); }
  });

  it.each([
    { name: "singular", scale: [0, 1, 1] as const },
    { name: "reflected", scale: [-2, 2, 2] as const },
    { name: "changed collider scale", scale: [3, 3, 3] as const }
  ])("rejects $name parent changes before advancing bound physics", async ({ scale }) => {
    const h = await harness(authoredScene());
    try {
      const body = h.app.physics.bodies.require("body");
      const before = [...body.position()];
      h.app.nodes.require("parent").setScale(scale);
      expect(() => h.app.physics.step(1 / 60)).toThrow(/PHYSICS_UNSUPPORTED_WORLD_TRANSFORM|singular|reflect|scale|shear/i);
      expect(h.world.stepCalls).toBe(0);
      closeVector(body.position(), before);
    } finally { await h.app.disposeAsync(); }
  });

  it("rejects a newly sheared parented physics pose before advancing the solver", async () => {
    const h = await harness(authoredScene([child().rotate(0, 0, Math.PI / 4)]));
    try {
      const body = h.app.physics.bodies.require("body"), before = [...body.position()];
      h.app.nodes.require("parent").setScale([2, 1, 1]);
      expect(() => h.app.physics.step(1 / 60)).toThrow(/PHYSICS_UNSUPPORTED_WORLD_TRANSFORM|scale|shear/i);
      expect(h.world.stepCalls).toBe(0);
      closeVector(body.position(), before);
    } finally { await h.app.disposeAsync(); }
  });

  it("rejects an authored parent look-at before staging a bound child body", async () => {
    const lookAtParent = group("parent", [child()], {
      position: [3, 0, 0], lookAt: [0, 2, 0], scale: [2, 2, 2]
    }).runtime({ id: "parent" });
    const initial = scene().add(lookAtParent);
    await expect(harness(initial)).rejects.toThrow(/PARENTED_LOOK_AT_UNSUPPORTED/);
  });

  it("rejects a dynamically added parented look-at body without publishing a body or handle", async () => {
    const h = await harness(authoredScene([]), true, true, false);
    try {
      expect(h.world.records.size).toBe(0);
      const requested = child("look-child").lookAt(0, 2, 0);
      expect(() => h.app.nodes.add!(requested, { parent: "parent" })).toThrow(/PARENTED_LOOK_AT_UNSUPPORTED/);
      expect(h.app.nodes.has("look-child")).toBe(false);
      expect(h.app.physics.bodies.has("look-child")).toBe(false);
      expect(h.world.records.size).toBe(0);
    } finally { await h.app.disposeAsync(); }
  });

  it("refuses a live reparent beneath a look-at ancestor on the next world operation", async () => {
    const free = primitives.box({ name: "free" }).position(1, 0, 0).runtime({ id: "free" });
    const looker = group("looker", [], { lookAt: [1, 0, 0] }).runtime({ id: "looker" });
    const h = await harness(scene().add(looker).add(free), false);
    try {
      const node = h.app.nodes.require("free"), ancestor = h.app.nodes.require("looker");
      expect(() => ancestor.attach(node)).not.toThrow();
      expect(() => node.getWorldPosition()).toThrow(/PARENTED_LOOK_AT_UNSUPPORTED/);
    } finally { await h.app.disposeAsync(); }
  });

  it("retains unparented and legacy look-at behavior", async () => {
    const unparented = await harness(scene().add(child("unparented").lookAt(0, 2, 0)));
    try {
      expect(() => unparented.app.physics.step(1 / 60)).not.toThrow();
      expect(unparented.app.nodes.has("unparented")).toBe(true);
    } finally { await unparented.app.disposeAsync(); }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    const looker = group("parent", [child()], { position: [3, 0, 0], lookAt: [0, 2, 0], scale: [2, 2, 2] }).runtime({ id: "parent" });
    const legacy = await harness(scene().add(looker), false, false);
    try {
      expect(legacy.app.nodes.has("body")).toBe(true);
      expect(() => legacy.app.physics.step(1 / 60)).not.toThrow();
    } finally { await legacy.app.disposeAsync(); }
  });

  it("preserves legacy authored placement when the core path is disabled", async () => {
    const h = await harness(authoredScene(), false, false);
    try {
      closeVector(h.app.nodes.require("body").position, [4, 0, 0]);
      closeVector(h.app.physics.bodies.require("body").position(), [4, 0, 0]);
      closeVector(frame(h.app, h.device, "body").model!.slice(12, 15), [4, 0, 0]);
    } finally { await h.app.disposeAsync(); }
  });
});
