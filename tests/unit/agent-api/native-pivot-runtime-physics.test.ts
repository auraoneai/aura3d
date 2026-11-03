import { describe, expect, it, vi } from "vitest";
import type { CompiledScene, RuntimeCompiledSceneInternals } from "../../../packages/engine/src/contracts/compiler.js";
import { bindRuntimeCompiled } from "../../../packages/engine/src/contracts/compiler.js";
import { createAuraAppWithPhysicsWorldAccess } from "../../../packages/engine/src/agent-api/app/createAuraAppCore.js";
import { prepareRuntimeNodeRootMotion, prepareRuntimeNodeWorldPose, runtimeNodeTranslateWorld, type MutableAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { auraAssetRefBrand } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { instances } from "../../../packages/engine/src/agent-api/nodes/instances.js";
import { createPhysicsWithAccess, createRuntimeScenePhysicsWithAccess } from "../../../packages/engine/src/agent-api/nodes/physics-core.js";
import { group } from "../../../packages/engine/src/agent-api/nodes/groups.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import type { AuraAssetRef, AuraPrimitiveNode, AuraSceneNode, AuraSceneSnapshot, AuraVec3 } from "../../../packages/engine/src/agent-api/nodes/types.js";
import type { PhysicsWorldAccess, PhysicsWorldConstructor } from "../../../packages/engine/src/agent-api/physics/PhysicsWorldAccess.js";
import { RigidBody, type RigidBodyDescriptor } from "../../../packages/physics/src/RigidBody.js";

/** Source-only world: deterministic bodies without a solver, browser, or GPU. */
class TestWorld {
  readonly fixedDelta = 1 / 60;
  readonly records = new Map<number, RigidBody>();
  readonly colliderOwners = new Set<number>();
  nextId = 1;
  stepCalls = 0;
  disposed = false;
  constructor(_options: unknown = {}) {}
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
  step(): [] { this.stepCalls += 1; return []; }
  snapshot() {
    return { backend: { active: "test" }, stats: { bodies: this.records.size, colliders: this.colliderOwners.size, steps: this.stepCalls }, contacts: [] };
  }
  dispose(): void { this.disposed = true; this.records.clear(); this.colliderOwners.clear(); }
}

function worldsAndAccess() {
  const worlds: TestWorld[] = [];
  class TrackedWorld extends TestWorld {
    constructor(options: unknown) { super(options); worlds.push(this); }
  }
  const access: PhysicsWorldAccess = {
    preload: async () => {},
    requireReady: () => TrackedWorld as unknown as PhysicsWorldConstructor
  };
  return { worlds, access };
}

const physicsBox = (id: string, overrides: Partial<AuraPrimitiveNode> = {}): AuraPrimitiveNode => ({
  ...primitives.box({ name: id, size: [1, 1, 1] }).runtime({ id }).physics({ type: "dynamic", shape: "box", mass: 1 }).toJSON(),
  ...overrides
});
const snapshot = (nodes: readonly AuraSceneNode[]): AuraSceneSnapshot => ({ ...scene().toJSON(), nodes });
const instanceAsset = {
  kind: "aura-asset-ref", id: "light-batch", type: "model", format: "glb", url: "/light-batch.glb",
  [auraAssetRefBrand]: { type: "model", id: "light-batch" }
} as unknown as AuraAssetRef<"model">;
const instanceLights = { offset: [0, 1, 0] as const, color: "#fff", power: 10, distance: 5 };
const pivotedBox = (id = "box"): AuraPrimitiveNode => physicsBox(id, {
  position: [3, 0, 0], pivot: [1, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1],
  physics: { type: "dynamic", mass: 1 }
});
function close(actual: readonly number[], expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, index) => expect(actual[index], `component ${index}`).toBeCloseTo(value, 5));
}
function mount(access: PhysicsWorldAccess, value: AuraSceneSnapshot, core = true) {
  return createAuraAppWithPhysicsWorldAccess(access, undefined as never, {
    scene: value, autoStart: false, physics: { bindNodes: true, gravity: [0, 0, 0] },
    qualityRebuild: { flags: { A3D_QR_CORE: core, A3D_QR_COMPILER: true }, allowUrlFlags: false }
  });
}

describe("pivoted runtime physics", () => {
  it.each([false, true])("maps a supported root box to the drawn origin and back with core=%s", (core) => {
    const { access, worlds } = worldsAndAccess();
    const app = mount(access, snapshot([pivotedBox()]), core);
    try {
      const body = worlds[0]!.bodies()[0]!;
      close(body.position, [4, -2, 0]);
      body.setPosition([10, 4, 0]);
      body.setRotation([0, 0, 1, 0]);
      app.physics.step(1 / 60);
      const handle = app.nodes.require("box");
      // T(position) T(pivot) R S T(-pivot) puts the geometry origin at [10,4,0].
      close(handle.position, [7, 4, 0]);
      close(handle.rotation, [0, 0, Math.PI]);
      close(handle.pivot, [1, 0, 0]);
      close(app.physics.bodies.require("box").position(), [10, 4, 0]);
    } finally { app.dispose(); }
  });

  it("synchronizes preview kinematic and dynamic pivoted boxes and rejects collider changes before a step", () => {
    const { access, worlds } = worldsAndAccess();
    const kinematic = pivotedBox("kinematic") as AuraPrimitiveNode & { position: AuraVec3; scale: AuraVec3; rotation: AuraVec3 };
    (kinematic as { physics: AuraPrimitiveNode["physics"] }).physics = { type: "kinematic" };
    const dynamic = pivotedBox("dynamic") as AuraPrimitiveNode & { position: AuraVec3; rotation: AuraVec3 };
    const runtime = createRuntimeScenePhysicsWithAccess(access, snapshot([kinematic, dynamic]))!;
    try {
      const [kinematicBody, dynamicBody] = worlds[0]!.bodies();
      kinematic.position = [5, 0, 0];
      kinematic.rotation = [0, 0, Math.PI];
      dynamicBody!.setPosition([10, 4, 0]);
      dynamicBody!.setRotation([0, 0, 1, 0]);
      runtime.step(1 / 60);
      close(kinematicBody!.position, [8, 0, 0]);
      close(dynamic.position, [7, 4, 0]);
      close(dynamic.rotation, [0, 0, Math.PI]);
      const before = worlds[0]!.stepCalls;
      kinematic.scale = [3, 1, 1];
      expect(() => runtime.step(1 / 60)).toThrow(/PIVOT_PHYSICS_UNSUPPORTED/);
      expect(worlds[0]!.stepCalls).toBe(before);
    } finally { runtime.dispose(); }
  });

  it("pushes a bound root kinematic node's pivoted geometry pose to its app body", () => {
    const { access, worlds } = worldsAndAccess();
    const node = { ...pivotedBox("kinematic"), physics: { type: "kinematic" as const } };
    const app = mount(access, snapshot([node]));
    try {
      const handle = app.nodes.require("kinematic");
      handle.setPosition(5, 0, 0).setRotation(0, 0, Math.PI);
      app.physics.step(1 / 60);
      close(worlds[0]!.bodies()[0]!.position, [8, 0, 0]);
    } finally { app.dispose(); }
  });

  it("maps a scene-owned dynamic body on the independent physics controller", () => {
    const { access, worlds } = worldsAndAccess();
    const node = pivotedBox() as AuraPrimitiveNode & { position: AuraVec3; rotation: AuraVec3; scale: AuraVec3 };
    const world = createPhysicsWithAccess(access).worldFromScene(snapshot([node]), { gravity: [0, 0, 0] });
    try {
      const body = worlds[0]!.bodies()[0]!;
      close(body.position, [4, -2, 0]);
      body.setPosition([10, 4, 0]);
      body.setRotation([0, 0, 1, 0]);
      world.step(1 / 60);
      close(node.position, [7, 4, 0]);
      close(node.rotation, [0, 0, Math.PI]);
      const before = worlds[0]!.stepCalls;
      node.scale = [3, 1, 1];
      expect(() => world.step(1 / 60)).toThrow(/PIVOT_PHYSICS_UNSUPPORTED/);
      expect(worlds[0]!.stepCalls).toBe(before);
    } finally { world.dispose(); }
  });

  it("rejects unsupported pivoted physics before allocating a world", () => {
    const invalid: AuraSceneNode[] = [
      group("pivoted-parent", [physicsBox("child")], { pivot: [1, 0, 0] }).toJSON(),
      group("any-parent", [pivotedBox()], { position: [2, 0, 0] }).toJSON(),
      physicsBox("mirrored", { pivot: [1, 0, 0], scale: [-1, 1, 1] }),
      physicsBox("singular", { pivot: [1, 0, 0], scale: [0, 1, 1] }),
      physicsBox("look", { pivot: [1, 0, 0], lookAt: [0, 0, 1] }),
      physicsBox("instance", { instances: [{ pivot: [1, 0, 0] }] }),
      physicsBox("mismatched-collider", { pivot: [1, 0, 0], scale: [2, 1, 1] }),
      physicsBox("overflow", { pivot: [Number.MAX_VALUE, 0, 0], scale: 2 })
    ];
    for (const candidate of invalid) {
      const { access, worlds } = worldsAndAccess();
      expect(() => mount(access, snapshot([candidate]))).toThrow(/PIVOT_PHYSICS_UNSUPPORTED/);
      expect(worlds).toHaveLength(0);
    }
  });

  it("rejects a bad replacement without changing the previous scene or bodies", () => {
    const { access, worlds } = worldsAndAccess();
    const app = mount(access, snapshot([physicsBox("original")]));
    try {
      const bodyIds = app.physics.bodies.ids();
      const worldCount = worlds.length;
      const previous = app.nodes.require("original");
      expect(() => app.setScene(snapshot([group("bad", [physicsBox("replacement")], { pivot: [1, 0, 0] }).toJSON()])))
        .toThrow(/PIVOT_PHYSICS_UNSUPPORTED/);
      expect(app.physics.bodies.ids()).toEqual(bodyIds);
      expect(app.nodes.require("original")).toBe(previous);
      expect(app.nodes.has("replacement")).toBe(false);
      expect(worlds).toHaveLength(worldCount);
    } finally { app.dispose(); }
  });

  it("rejects a compiled addition under a live pivot before compiler or body mutation", () => {
    const { access, worlds } = worldsAndAccess();
    const parent = group("parent", [primitives.box({ name: "visual" })]).runtime({ id: "parent" }).toJSON();
    const app = mount(access, snapshot([parent]));
    try {
      app.physics; // Materialize the existing app-owned world.
      app.nodes.require("parent").setPivot(1, 0, 0);
      const addSubtree = vi.fn();
      const compiled = {} as CompiledScene;
      bindRuntimeCompiled(compiled, { addSubtree, removeSubtree: () => false } as unknown as RuntimeCompiledSceneInternals);
      (app.nodes as MutableAuraRuntimeNodeRegistry).attachCompiled(compiled);
      const worldCount = worlds.length;
      const bodyCount = worlds[0]!.records.size;
      expect(() => app.nodes.add!(physicsBox("new"), { parent: "parent" })).toThrow(/PIVOT_PHYSICS_UNSUPPORTED/);
      expect(addSubtree).not.toHaveBeenCalled();
      expect(worlds).toHaveLength(worldCount);
      expect(worlds[0]!.records.size).toBe(bodyCount);
      expect(app.nodes.has("new")).toBe(false);
    } finally { app.dispose(); }
  });

  it("leaves a pivoted body and its parent unchanged when live attachment or collider edits fail", () => {
    const { access } = worldsAndAccess();
    const parent = group("parent").runtime({ id: "parent" }).toJSON();
    const app = mount(access, snapshot([parent, pivotedBox()]));
    try {
      const handle = app.nodes.require("box");
      const before = handle.snapshot();
      expect(() => app.nodes.require("parent").attach(handle)).toThrow(/PIVOT_PHYSICS_UNSUPPORTED/);
      expect(() => handle.setPivot(2, 0, 0)).toThrow(/PIVOT_PHYSICS_UNSUPPORTED/);
      expect(() => handle.setTransform({ position: [99, 0, 0], scale: 3 })).toThrow(/PIVOT_PHYSICS_UNSUPPORTED/);
      expect(() => handle.play("turntable")).toThrow(/PIVOT_PHYSICS_UNSUPPORTED/);
      expect(() => handle.setGeometry!({ positions: [0, 0, 0] })).toThrow(/PIVOT_PHYSICS_UNSUPPORTED/);
      expect(handle.position).toEqual(before.position);
      expect(handle.scale).toEqual(before.scale);
      expect(handle.pivot).toEqual(before.pivot);
    } finally { app.dispose(); }
  });

  it("checks an ancestor mutation before changing an existing descendant body", () => {
    const { access } = worldsAndAccess();
    const parent = group("parent", [physicsBox("child")]).runtime({ id: "parent" }).toJSON();
    const app = mount(access, snapshot([parent]));
    try {
      const handle = app.nodes.require("parent");
      const before = handle.pivot;
      const ids = app.physics.bodies.ids();
      expect(() => handle.setPivot(1, 0, 0)).toThrow(/PIVOT_PHYSICS_UNSUPPORTED/);
      expect(handle.pivot).toEqual(before);
      expect(app.physics.bodies.ids()).toEqual(ids);
    } finally { app.dispose(); }
  });

  it("copies live instance pivots and rejects pivot with lookAt before changing the batch", () => {
    const { access } = worldsAndAccess();
    const node = { ...primitives.box({ name: "batch" }).runtime({ id: "batch" }).toJSON(), instances: [{ position: [0, 0, 0] as AuraVec3 }] };
    const app = mount(access, snapshot([node]));
    try {
      const handle = app.nodes.require("batch");
      const pivot: [number, number, number] = [1, 0, 0];
      handle.setInstances([{ pivot, quaternion: [0, 0, 0, 1], rotationOrder: "XYZ" }]);
      pivot[0] = 7;
      const before = handle.snapshot().instances;
      expect(before?.[0]?.pivot).toEqual([1, 0, 0]);
      expect(before?.[0]?.quaternion).toEqual([0, 0, 0, 1]);
      expect(() => handle.setInstances([{ pivot: [1, 0, 0] }, { lookAt: [0, 0, 1] }])).toThrow(/INSTANCE_PIVOT_LOOK_AT_UNSUPPORTED/);
      expect(handle.snapshot().instances).toEqual(before);
    } finally { app.dispose(); }
  });

  it("rejects child and ancestor changes that would separate generated instance lights", () => {
    const { access } = worldsAndAccess();
    const generated = instances.model(instanceAsset, { transforms: [{ position: [1, 0, 0] }], lights: instanceLights }).toJSON();
    const child = { ...generated.children[0]!, runtime: { id: "lit-model", mutable: true } } as AuraSceneNode;
    const litGroup = { ...generated, runtime: { id: "lit-group", mutable: true }, children: [child, ...generated.children.slice(1)] };
    const outer = group("outer", [litGroup]).runtime({ id: "outer" }).toJSON();
    const target = group("target").runtime({ id: "target" }).toJSON();
    const app = mount(access, snapshot([outer, target]));
    try {
      const handle = app.nodes.require("lit-model");
      const owner = app.nodes.require("lit-group");
      const ancestor = app.nodes.require("outer");
      const registry = app.nodes as MutableAuraRuntimeNodeRegistry;
      const changed = vi.fn();
      const stop = registry.onSceneChange(changed);
      const before = handle.snapshot();
      const version = handle.version;
      const matrices = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1]);
      const attempts: Array<() => unknown> = [
        () => { handle.position = [2, 0, 0]; },
        () => { handle.rotation = [0, 1, 0]; },
        () => { handle.scale = 2; },
        () => { handle.visible = false; },
        () => handle.setPosition(2, 0, 0),
        () => handle.translate(1, 0, 0),
        () => handle.setRotation(0, 1, 0),
        () => handle.setScale(2),
        () => handle.setPivot(1, 0, 0),
        () => handle.setTransform({ position: [2, 0, 0], scale: 2 }),
        () => handle.setVisible(false),
        () => handle.setInstances([{ position: [2, 0, 0] }]),
        () => handle.setInstanceMatrices(matrices, 1),
        () => handle.play("turntable"),
        () => handle.setAnimation(undefined),
        () => app.nodes.require("target").attach(handle),
        () => prepareRuntimeNodeWorldPose(handle, [2, 0, 0], [0, 0, 0, 1]),
        () => prepareRuntimeNodeRootMotion(handle, [1, 0, 0], 0),
        () => runtimeNodeTranslateWorld(handle, [1, 0, 0]),
        () => owner.setPosition(2, 0, 0),
        () => { ancestor.visible = false; },
        () => app.nodes.remove!("lit-model"),
        () => app.nodes.add!(instances.model(instanceAsset, { transforms: [{ position: [3, 0, 0] }] }).runtime({ id: "lit-model" }))
      ];
      for (const attempt of attempts) {
        expect(attempt).toThrow(/INSTANCE_LIGHTS_RUNTIME_UNSUPPORTED/);
        expect(handle.position).toEqual(before.position);
        expect(handle.rotation).toEqual(before.rotation);
        expect(handle.scale).toEqual(before.scale);
        expect(handle.visible).toBe(before.visible);
        expect(handle.snapshot().instances).toEqual(before.instances);
        expect(handle.snapshot().instanceMatrices).toBeUndefined();
        expect(handle.version).toBe(version);
        expect(app.nodes.has("lit-model")).toBe(true);
      }
      expect(changed).not.toHaveBeenCalled();
      stop();
    } finally { app.dispose(); }
  });

  it("rejects changes to packed WORLD instances while ordinary model batches stay mutable", () => {
    const { access } = worldsAndAccess();
    const transforms = [{ position: [1, 0, 0] as AuraVec3 }];
    const packed = instances.model(instanceAsset, { transforms, static: true }).runtime({ id: "packed" }).toJSON();
    const ordinary = instances.model(instanceAsset, { transforms }).runtime({ id: "ordinary" }).toJSON();
    const app = mount(access, snapshot([packed, ordinary]));
    try {
      const matrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0, 0, 1]);
      const staticHandle = app.nodes.require("packed");
      const before = staticHandle.snapshot().instances;
      const version = staticHandle.version;
      expect(() => staticHandle.setInstances([{ position: [3, 0, 0] }])).toThrow(/INSTANCE_SCATTER_RUNTIME_UNSUPPORTED/);
      expect(() => staticHandle.setInstanceMatrices(matrix, 1)).toThrow(/INSTANCE_SCATTER_RUNTIME_UNSUPPORTED/);
      expect(staticHandle.snapshot().instances).toEqual(before);
      expect(staticHandle.snapshot().instanceMatrices).toBeUndefined();
      expect(staticHandle.version).toBe(version);

      const ordinaryHandle = app.nodes.require("ordinary");
      ordinaryHandle.setPosition(2, 0, 0).setInstances([{ position: [3, 0, 0] }]).setInstanceMatrices(matrix, 1);
      expect(ordinaryHandle.position).toEqual([2, 0, 0]);
      expect(Array.from(ordinaryHandle.snapshot().instanceMatrices!)).toEqual(Array.from(matrix));
    } finally { app.dispose(); }
  });
});
