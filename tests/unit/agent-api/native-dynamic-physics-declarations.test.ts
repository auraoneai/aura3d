import { describe, expect, it, vi } from "vitest";
import type { CompiledScene, RuntimeCompiledSceneInternals } from "../../../packages/engine/src/contracts/compiler.js";
import { bindRuntimeCompiled } from "../../../packages/engine/src/contracts/compiler.js";
import { nodeHandleExtensionFor, registerNodeHandleExtension } from "../../../packages/engine/src/contracts/runtimeNodes.js";
import { createAuraAppWithPhysicsWorldAccess } from "../../../packages/engine/src/agent-api/app/createAuraAppCore.js";
import { runtimeNodeQueryState, type MutableAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { group } from "../../../packages/engine/src/agent-api/nodes/groups.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { scene, type AuraSceneBuilder } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import type { AuraSceneNode, AuraRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/nodes/types.js";
import type { PhysicsWorldAccess, PhysicsWorldConstructor } from "../../../packages/engine/src/agent-api/physics/PhysicsWorldAccess.js";
import { RigidBody, type RigidBodyDescriptor } from "../../../packages/physics/src/RigidBody.js";

/** A deterministic source-level world: no solver, browser, GPU, or network is used. */
class TestWorld {
  readonly fixedDelta = 1 / 60;
  readonly records = new Map<number, RigidBody>();
  readonly colliderOwners = new Set<number>();
  readonly gravity: readonly [number, number, number];
  nextId = 1;
  bodyCalls = 0;
  colliderCalls = 0;
  stepCalls = 0;
  failBodyCall = -1;
  failColliderCall = -1;
  disposed = false;

  constructor(options: { readonly gravity?: readonly [number, number, number] } = {}) {
    this.gravity = options.gravity ?? [0, -9.81, 0];
  }

  createRigidBody(descriptor: RigidBodyDescriptor = {}): RigidBody {
    this.bodyCalls += 1;
    if (this.bodyCalls === this.failBodyCall) throw new Error("injected body failure");
    const body = new RigidBody(this.nextId++, descriptor);
    this.records.set(body.id, body);
    return body;
  }

  createCollider(body: RigidBody): { readonly id: number; readonly bodyId: number } {
    this.colliderCalls += 1;
    if (this.colliderCalls === this.failColliderCall) throw new Error("injected collider failure");
    this.colliderOwners.add(body.id);
    return { id: body.id, bodyId: body.id };
  }

  removeRigidBody(id: number): void {
    this.records.delete(id);
    this.colliderOwners.delete(id);
  }

  getBody(id: number): RigidBody | undefined { return this.records.get(id); }
  bodies(): RigidBody[] { return [...this.records.values()]; }
  // Preview diagnostics need the method but do not need a fake collider implementation.
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
    return {
      backend: { active: "test" },
      stats: { bodies: this.records.size, colliders: this.colliderOwners.size, steps: this.stepCalls },
      contacts: []
    };
  }
  dispose(): void { this.disposed = true; this.records.clear(); this.colliderOwners.clear(); }
}

const box = (name: string, id = name) => {
  const builder = primitives.box({ name, size: [1, 1, 1] })
    .physics({ type: "dynamic", shape: "box", halfExtents: [0.5, 0.5, 0.5], mass: 1 });
  return id === "" ? builder : builder.runtime({ id });
};

function collectNodes(nodes: readonly AuraSceneNode[], out = new Map<string, AuraSceneNode>()): Map<string, AuraSceneNode> {
  for (const node of nodes) {
    const id = "runtime" in node ? node.runtime?.id : undefined;
    if (id) out.set(id, node);
    if (node.kind === "group") collectNodes(node.children, out);
  }
  return out;
}

function harness(initial: AuraSceneBuilder = scene().add(box("existing")), bindNodes = true) {
  const worlds: TestWorld[] = [];
  class TrackedWorld extends TestWorld {
    constructor(options: ConstructorParameters<typeof TestWorld>[0]) { super(options); worlds.push(this); }
  }
  const access: PhysicsWorldAccess = {
    preload: async () => {},
    requireReady: () => TrackedWorld as unknown as PhysicsWorldConstructor
  };
  const app = createAuraAppWithPhysicsWorldAccess(access, undefined as never, {
    scene: initial,
    autoStart: false,
    physics: { bindNodes, gravity: [0, 0, 0] },
    qualityRebuild: { flags: { A3D_QR_COMPILER: true, A3D_QR_CORE: true }, allowUrlFlags: false }
  });
  // Touching the public API also ensures a world exists for an initially empty scene.
  const physics = app.physics;
  const world = worlds[0]!;
  const mounted = collectNodes(initial.toJSON().nodes);
  const compiled = {} as CompiledScene;
  let onAdd: ((node: AuraSceneNode, parentId?: string) => void) | undefined;
  let onRemove: ((id: string) => void) | undefined;
  const addSubtree = vi.fn((node: AuraSceneNode, parentId?: string) => {
    onAdd?.(node, parentId);
    const id = "runtime" in node ? node.runtime?.id : undefined;
    if (!id) throw new Error("compiled subtree requires an id");
    const prior = mounted.get(id);
    mounted.set(id, node);
    let active = true;
    return {
      commit: () => { active = false; },
      rollback: () => {
        if (!active) return;
        active = false;
        if (mounted.get(id) !== node) return;
        if (prior) mounted.set(id, prior);
        else mounted.delete(id);
      }
    };
  });
  const removeSubtree = vi.fn((id: string) => {
    const existed = mounted.delete(id);
    onRemove?.(id);
    return existed;
  });
  bindRuntimeCompiled(compiled, { addSubtree, removeSubtree } as unknown as RuntimeCompiledSceneInternals);
  (app.nodes as MutableAuraRuntimeNodeRegistry).attachCompiled(compiled);
  return {
    app, physics, world, worlds, mounted, addSubtree, removeSubtree,
    setAddHook(next: typeof onAdd) { onAdd = next; },
    setRemoveHook(next: typeof onRemove) { onRemove = next; }
  };
}

describe("compiled runtime declarative physics ownership", () => {
  it("adds and removes a declared body while retaining existing and programmatic bodies", () => {
    const h = harness();
    try {
      const existing = h.physics.bodies.require("existing");
      const programmatic = h.physics.createBody({ name: "programmatic" });
      const prior = h.physics.bodies.ids();
      const node = h.app.nodes.add!(box("added"));
      const added = h.physics.bodies.require("added");
      expect(h.addSubtree).toHaveBeenCalledTimes(1);
      expect(h.physics.bodies.ids()).toEqual([...prior, added.id]);
      expect(h.world.colliderOwners).toEqual(new Set([...prior, added.id]));
      expect(h.app.nodes.require("added")).toBe(node);

      expect(h.app.nodes.remove!("added")).toBe(true);
      expect(h.physics.bodies.ids()).toEqual(prior);
      expect(h.world.colliderOwners).toEqual(new Set(prior));
      expect(h.physics.bodies.get("existing")?.id).toBe(existing.id);
      expect(h.physics.bodies.get("programmatic")?.id).toBe(programmatic.id);
      expect(h.physics.bodies.has("added")).toBe(false);
      expect(() => added.position()).toThrow(/removed/i);
      expect(h.app.nodes.has("added")).toBe(false);
    } finally { h.app.dispose(); }
  });

  it("creates and retires every declaration in a nested runtime subtree, including unnamed handles", () => {
    const h = harness();
    try {
      const programmatic = h.physics.createBody({ name: "programmatic" });
      const initialIds = h.physics.bodies.ids();
      h.app.nodes.add!(group("bundle", [
        box("first"),
        group("inner", [box("second"), box("without-handle", "")]).runtime({ id: "inner" })
      ]).runtime({ id: "bundle" }));
      expect(h.physics.bodies.has("first")).toBe(true);
      expect(h.physics.bodies.has("second")).toBe(true);
      expect(h.physics.bodies.has("without-handle")).toBe(true);
      expect(h.physics.bodies.ids()).toHaveLength(initialIds.length + 3);

      expect(h.app.nodes.remove!("bundle")).toBe(true);
      expect(h.physics.bodies.ids()).toEqual(initialIds);
      expect(h.physics.bodies.get("programmatic")?.id).toBe(programmatic.id);
      for (const name of ["first", "second", "without-handle"]) expect(h.physics.bodies.has(name)).toBe(false);
      expect(h.app.nodes.has("first")).toBe(false);
      expect(h.app.nodes.has("second")).toBe(false);
    } finally { h.app.dispose(); }
  });

  it("retires declarations under an initially mounted group without deleting siblings", () => {
    const h = harness(scene()
      .add(group("root", [box("nested-a"), box("nested-b")]).runtime({ id: "root" }))
      .add(box("sibling")));
    try {
      const sibling = h.physics.bodies.require("sibling");
      const external = h.physics.createBody({ name: "programmatic" });
      expect(h.app.nodes.remove!("root")).toBe(true);
      expect(h.physics.bodies.has("nested-a")).toBe(false);
      expect(h.physics.bodies.has("nested-b")).toBe(false);
      expect(h.physics.bodies.get("sibling")?.id).toBe(sibling.id);
      expect(h.physics.bodies.get("programmatic")?.id).toBe(external.id);
    } finally { h.app.dispose(); }
  });

  it("removes an initially mounted inner group and its detached child handles", () => {
    const h = harness(scene().add(group("outer", [
      group("inner", [box("inner-child")]).runtime({ id: "inner" }),
      box("sibling")
    ]).runtime({ id: "outer" })));
    try {
      const child = h.app.nodes.require("inner-child");
      const body = h.physics.bodies.require("inner-child");
      expect(h.app.nodes.remove!("inner")).toBe(true);
      expect(h.app.nodes.has("inner")).toBe(false);
      expect(h.app.nodes.has("inner-child")).toBe(false);
      expect(h.app.nodes.has("outer")).toBe(true);
      expect(h.app.nodes.has("sibling")).toBe(true);
      expect(h.physics.bodies.has("inner-child")).toBe(false);
      expect(h.physics.bodies.has("sibling")).toBe(true);
      expect(() => body.position()).toThrow(/removed/i);
      expect(runtimeNodeQueryState(child)).toBeUndefined();
      const remount = (h.app.nodes as MutableAuraRuntimeNodeRegistry).sceneWithRuntimeAdditions()!;
      expect(collectNodes(remount.nodes).has("inner-child")).toBe(false);
    } finally { h.app.dispose(); }
  });

  it.each(["body", "collider"] as const)("rolls back the whole added subtree on %s creation failure", (failure) => {
    const h = harness();
    try {
      h.physics.createBody({ name: "programmatic" });
      const ids = h.physics.bodies.ids();
      const colliders = new Set(h.world.colliderOwners);
      if (failure === "body") h.world.failBodyCall = h.world.bodyCalls + 2;
      else h.world.failColliderCall = h.world.colliderCalls + 2;
      expect(() => h.app.nodes.add!(group("bad", [box("staged-a"), box("staged-b")]).runtime({ id: "bad" })))
        .toThrow(new RegExp(`injected ${failure} failure`));
      expect(h.physics.bodies.ids()).toEqual(ids);
      expect(h.world.colliderOwners).toEqual(colliders);
      expect(h.app.nodes.has("bad")).toBe(false);
      expect(h.app.nodes.has("staged-a")).toBe(false);
      expect(h.physics.bodies.has("staged-a")).toBe(false);
      expect(h.mounted.has("bad")).toBe(false);
    } finally { h.app.dispose(); }
  });

  it("rolls back staged physics when compiled subtree creation fails", () => {
    const h = harness();
    try {
      const ids = h.physics.bodies.ids();
      const colliders = new Set(h.world.colliderOwners);
      h.setAddHook(() => { throw new Error("injected compiler failure"); });
      expect(() => h.app.nodes.add!(box("failed"))).toThrow(/injected compiler failure/);
      expect(h.physics.bodies.ids()).toEqual(ids);
      expect(h.world.colliderOwners).toEqual(colliders);
      expect(h.app.nodes.has("failed")).toBe(false);
      expect(h.physics.bodies.has("failed")).toBe(false);
      expect(h.mounted.has("failed")).toBe(false);
    } finally { h.app.dispose(); }
  });

  it("rejects a child of a still-publishing parent before creating or compiling the child", () => {
    const h = harness();
    try {
      let attempted = false;
      h.setAddHook((node) => {
        if (!("runtime" in node) || node.runtime?.id !== "pending-root") return;
        attempted = true;
        expect(() => h.app.nodes.add!(box("too-early"), { parent: "pending-inner" }))
          .toThrow(/RUNTIME_PARENT_PENDING/);
      });
      h.app.nodes.add!(group("pending-root", [
        group("pending-inner", [box("retained")]).runtime({ id: "pending-inner" })
      ]).runtime({ id: "pending-root" }));
      expect(attempted).toBe(true);
      expect(h.addSubtree).toHaveBeenCalledTimes(1);
      expect(h.physics.bodies.has("retained")).toBe(true);
      expect(h.physics.bodies.has("too-early")).toBe(false);
      expect(h.app.nodes.has("too-early")).toBe(false);
      // Once publication completes, the same parent ID is no longer pending.
      h.app.nodes.add!(box("later"), { parent: "pending-inner" });
      expect(h.physics.bodies.has("later")).toBe(true);
    } finally { h.app.dispose(); }
  });

  it("keeps a newly accessed physics runtime alive when compiler creation reenters and then fails", () => {
    const worlds: TestWorld[] = [];
    class TrackedWorld extends TestWorld {
      constructor(options: ConstructorParameters<typeof TestWorld>[0]) { super(options); worlds.push(this); }
    }
    const access: PhysicsWorldAccess = {
      preload: async () => {},
      requireReady: () => TrackedWorld as unknown as PhysicsWorldConstructor
    };
    const app = createAuraAppWithPhysicsWorldAccess(access, undefined as never, {
      scene: scene(), autoStart: false,
      qualityRebuild: { flags: { A3D_QR_COMPILER: true }, allowUrlFlags: false }
    });
    const compiled = {} as CompiledScene;
    let accessed: typeof app.physics | undefined;
    bindRuntimeCompiled(compiled, {
      addSubtree: () => { accessed = app.physics; throw new Error("compiler refused"); },
      removeSubtree: () => false
    } as unknown as RuntimeCompiledSceneInternals);
    (app.nodes as MutableAuraRuntimeNodeRegistry).attachCompiled(compiled);
    try {
      expect(() => app.nodes.add!(box("failed"))).toThrow(/compiler refused/);
      expect(worlds).toHaveLength(1);
      expect(worlds[0]!.disposed).toBe(false);
      expect(app.physics).toBe(accessed);
      expect(app.physics.bodies.ids()).toEqual([]);
      expect(app.physics.createBody({ name: "after-failure" }).id).toBeGreaterThan(0);
    } finally { app.dispose(); }
    expect(worlds[0]!.disposed).toBe(true);
  });

  it("replaces the old declarative body when the latest compiled addition reuses an id", () => {
    const h = harness();
    try {
      const external = h.physics.createBody({ name: "programmatic" });
      const oldNode = h.app.nodes.add!(box("original", "shared"));
      const oldBody = h.physics.bodies.require("original");
      const replacementNode = h.app.nodes.add!(box("replacement", "shared"));
      const replacement = h.physics.bodies.require("replacement");
      expect(replacementNode).not.toBe(oldNode);
      expect(h.app.nodes.require("shared")).toBe(replacementNode);
      expect(replacement.id).not.toBe(oldBody.id);
      expect(h.physics.bodies.has("original")).toBe(false);
      expect(() => oldBody.position()).toThrow(/removed/i);
      expect(h.physics.bodies.get("programmatic")?.id).toBe(external.id);
      expect(h.physics.bodies.ids()).toHaveLength(3); // existing, programmatic, latest
    } finally { h.app.dispose(); }
  });

  it("replaces a mounted group without leaving its old child handles or remount records", () => {
    const h = harness(scene()
      .add(group("old-group", [box("old-child")]).runtime({ id: "shared-group" }))
      .add(box("sibling")));
    try {
      const oldBody = h.physics.bodies.require("old-child");
      h.app.nodes.add!(group("new-group", [box("new-child")]).runtime({ id: "shared-group" }));
      expect(h.app.nodes.has("old-child")).toBe(false);
      expect(h.app.nodes.has("new-child")).toBe(true);
      expect(h.physics.bodies.has("old-child")).toBe(false);
      expect(h.physics.bodies.has("new-child")).toBe(true);
      expect(h.physics.bodies.has("sibling")).toBe(true);
      expect(() => oldBody.position()).toThrow(/removed/i);
      const remount = (h.app.nodes as MutableAuraRuntimeNodeRegistry).sceneWithRuntimeAdditions()!;
      const groups = remount.nodes.filter((entry) => "runtime" in entry && entry.runtime?.id === "shared-group");
      expect(groups).toHaveLength(1);
      expect(groups[0]).toMatchObject({ kind: "group", name: "new-group" });
    } finally { h.app.dispose(); }
  });

  it.each([true, false])("retains the complete authored slot on implicit inner replacement (named outer: %s)", (namedOuter) => {
    const inner = group("inner-old", [box("old-child")], { position: [1, 0, 0] }).runtime({ id: "inner" });
    const wrapper = group("anonymous-wrapper", [inner], { position: [2, 0, 0] });
    const root = namedOuter ? group("outer", [wrapper], { position: [3, 0, 0] }).runtime({ id: "outer" }) : wrapper;
    const h = harness(scene().add(root).add(box("sibling")));
    try {
      const external = h.physics.createBody({ name: "programmatic" });
      h.app.nodes.add!(group("inner-new", [box("new-child").position(1, 0, 0)], { position: [4, 0, 0] }).runtime({ id: "inner" }));
      const expected = namedOuter ? 10 : 7;
      expect(h.physics.bodies.require("new-child").position()).toEqual([expected, 0, 0]);
      expect(h.app.nodes.require("new-child").getWorldPosition()).toEqual([expected, 0, 0]);
      expect(h.physics.bodies.has("old-child")).toBe(false);
      expect(h.addSubtree).toHaveBeenLastCalledWith(expect.anything(), undefined, { deferCommit: true });

      // A second replacement must continue to use the same slot on remount.
      h.app.nodes.add!(group("inner-latest", [box("latest-child").position(1, 0, 0)], { position: [5, 0, 0] }).runtime({ id: "inner" }));
      expect(h.physics.bodies.require("latest-child").position()).toEqual([expected + 1, 0, 0]);
      const remount = (h.app.nodes as MutableAuraRuntimeNodeRegistry).sceneWithRuntimeAdditions()!;
      const outer = remount.nodes[0]!;
      expect(outer.kind).toBe("group");
      if (outer.kind !== "group") throw new Error("expected group");
      const remountWrapper = namedOuter ? outer.children[0]! : outer;
      expect(remountWrapper.kind).toBe("group");
      if (remountWrapper.kind !== "group") throw new Error("expected wrapper");
      expect(remountWrapper.children).toHaveLength(1);
      expect(remountWrapper.children[0]).toMatchObject({ kind: "group", name: "inner-latest", runtime: { id: "inner" } });
      expect(collectNodes(remount.nodes).has("old-child")).toBe(false);

      expect(h.app.nodes.remove!("inner")).toBe(true);
      const afterRemoval = (h.app.nodes as MutableAuraRuntimeNodeRegistry).sceneWithRuntimeAdditions()!;
      expect(collectNodes(afterRemoval.nodes).has("inner")).toBe(false);
      expect(collectNodes(afterRemoval.nodes).has("old-child")).toBe(false);
      expect(h.physics.bodies.has("latest-child")).toBe(false);
      expect(h.physics.bodies.has("sibling")).toBe(true);
      expect(h.physics.bodies.get("programmatic")?.id).toBe(external.id);
    } finally { h.app.dispose(); }
  });

  it("moves an existing inner group directly under an explicitly selected parent", () => {
    const oldParent = group("old-parent", [group("wrapper", [
      group("old-inner", [box("old-child")]).runtime({ id: "inner" })
    ], { position: [2, 0, 0] })], { position: [3, 0, 0] }).runtime({ id: "old-parent" });
    const newParent = group("new-parent", [], { position: [10, 0, 0] }).runtime({ id: "new-parent" });
    const h = harness(scene().add(oldParent).add(newParent));
    try {
      h.app.nodes.add!(group("moved", [box("new-child").position(1, 0, 0)], { position: [4, 0, 0] }).runtime({ id: "inner" }), { parent: "new-parent" });
      expect(h.physics.bodies.require("new-child").position()).toEqual([15, 0, 0]);
      expect(h.app.nodes.require("new-child").getWorldPosition()).toEqual([15, 0, 0]);
      const remount = (h.app.nodes as MutableAuraRuntimeNodeRegistry).sceneWithRuntimeAdditions()!;
      const old = remount.nodes[0]!, next = remount.nodes[1]!;
      expect(old.kind).toBe("group");
      expect(next.kind).toBe("group");
      if (old.kind !== "group" || next.kind !== "group" || old.children[0]?.kind !== "group") throw new Error("expected groups");
      expect(old.children[0].children).toHaveLength(0);
      expect(next.children).toHaveLength(1);
      expect(next.children[0]).toMatchObject({ name: "moved", runtime: { id: "inner" } });
      h.app.nodes.remove!("inner");
      expect(collectNodes((h.app.nodes as MutableAuraRuntimeNodeRegistry).sceneWithRuntimeAdditions()!.nodes).has("inner")).toBe(false);
    } finally { h.app.dispose(); }
  });

  it("does not resurrect an inner group authored inside a compiled addition", () => {
    const h = harness(scene());
    try {
      h.app.nodes.add!(group("outer", [group("wrapper", [
        group("old-inner", [box("old-child")], { position: [1, 0, 0] }).runtime({ id: "inner" })
      ], { position: [2, 0, 0] })], { position: [3, 0, 0] }).runtime({ id: "outer" }));
      h.app.nodes.add!(group("inner-new", [box("new-child").position(1, 0, 0)], { position: [4, 0, 0] }).runtime({ id: "inner" }));
      expect(h.physics.bodies.require("new-child").position()).toEqual([10, 0, 0]);
      expect(h.app.nodes.remove!("inner")).toBe(true);
      expect(collectNodes((h.app.nodes as MutableAuraRuntimeNodeRegistry).sceneWithRuntimeAdditions()!.nodes).has("inner")).toBe(false);
      expect(h.physics.bodies.has("old-child")).toBe(false);
      expect(h.physics.bodies.has("new-child")).toBe(false);

      // Saved ancestor entries may be cloned during removal; their live
      // transform, rather than the stale clone, must seed later physics.
      h.app.nodes.require("outer").setPosition(7, 0, 0);
      h.app.nodes.add!(box("later").position(1, 0, 0), { parent: "outer" });
      expect(h.physics.bodies.require("later").position()).toEqual([8, 0, 0]);
      expect(h.app.nodes.require("later").getWorldPosition()).toEqual([8, 0, 0]);
    } finally { h.app.dispose(); }
  });

  it.each(["remount", "dispose"] as const)("retires an uninstalled preview world when a supersession listener triggers %s", (action) => {
    const h = harness(scene().add(box("initial")));
    try {
      expect(h.worlds).toHaveLength(2); // app-owned physics and the first preview world
      let observed = false;
      h.app.onRenderTermination!((event) => {
        if (event.state !== "superseded" || observed) return;
        observed = true;
        if (action === "remount") h.app.setScene(scene().add(box("newest")));
        else h.app.dispose();
      });
      h.app.setScene(scene().add(box("superseded")));
      expect(observed).toBe(true);
      expect(h.worlds[1]!.disposed).toBe(true);
      expect(h.worlds[2]!.disposed).toBe(true); // outer mount never installed this world
      if (action === "remount") {
        expect(h.worlds).toHaveLength(4);
        expect(h.worlds[3]!.disposed).toBe(false);
        expect(h.physics.bodies.has("newest")).toBe(true);
        expect(h.physics.bodies.has("superseded")).toBe(false);
      } else {
        expect(h.worlds).toHaveLength(3);
        expect(h.worlds[0]!.disposed).toBe(true);
      }
    } finally { h.app.dispose(); }
  });

  it("restores the prior compiler subtree and handle if replacement physics cannot retire", () => {
    const h = harness();
    try {
      const oldNode = h.app.nodes.add!(box("original", "shared"));
      const oldBody = h.physics.bodies.require("original");
      const oldCompiled = h.mounted.get("shared");
      const originalRemove = h.world.removeRigidBody.bind(h.world);
      h.world.removeRigidBody = (id) => {
        if (id === oldBody.id) throw new Error("injected retirement failure");
        originalRemove(id);
      };
      expect(() => h.app.nodes.add!(box("replacement", "shared"))).toThrow(/retire declared physics/);
      expect(h.app.nodes.require("shared")).toBe(oldNode);
      expect(h.mounted.get("shared")).toBe(oldCompiled);
      expect(h.physics.bodies.get("original")?.id).toBe(oldBody.id);
      expect(h.physics.bodies.has("replacement")).toBe(false);
      expect(h.physics.bodies.ids()).toHaveLength(2); // existing and original
    } finally { h.app.dispose(); }
  });

  it("rolls back partially registered handles and staged bodies if an extension refuses a child", () => {
    const h = harness();
    const prior = nodeHandleExtensionFor("timeScale");
    const unregister = registerNodeHandleExtension({
      id: "test.dynamic-physics-registration", owner: "prd15", flag: "A3D_QR_COMPILER",
      member: "timeScale", appliesTo: ["primitive"],
      create: (handle) => {
        if (handle.id === "second-failure") throw new Error("extension refused");
        return 1;
      }
    });
    try {
      const before = h.physics.bodies.ids();
      expect(() => h.app.nodes.add!(group("failed-group", [box("first-staged"), box("second-failure")]).runtime({ id: "failed-group" })))
        .toThrow(/extension refused/);
      expect(h.physics.bodies.ids()).toEqual(before);
      expect(h.app.nodes.has("failed-group")).toBe(false);
      expect(h.app.nodes.has("first-staged")).toBe(false);
      expect(h.app.nodes.has("second-failure")).toBe(false);
      expect(h.mounted.has("failed-group")).toBe(false);
    } finally {
      unregister();
      if (prior) registerNodeHandleExtension(prior);
      h.app.dispose();
    }
  });

  it("retains a new same-id declaration added reentrantly during removal", () => {
    const h = harness();
    try {
      h.app.nodes.add!(box("old", "shared"));
      const old = h.physics.bodies.require("old");
      let replacementNode: AuraRuntimeNodeHandle | undefined;
      h.setRemoveHook((id) => {
        if (id === "shared" && !replacementNode) replacementNode = h.app.nodes.add!(box("new", "shared"));
      });
      expect(h.app.nodes.remove!("shared")).toBe(true);
      expect(replacementNode).toBeDefined();
      expect(h.app.nodes.require("shared")).toBe(replacementNode);
      expect(h.physics.bodies.has("old")).toBe(false);
      expect(h.physics.bodies.has("new")).toBe(true);
      expect(() => old.position()).toThrow(/removed/i);
      expect(h.mounted.has("shared")).toBe(true);
    } finally { h.app.dispose(); }
  });

  it("does not recursively retire an old body when the backend publishes a same-id replacement", () => {
    const h = harness();
    try {
      h.app.nodes.add!(box("old", "shared"));
      const old = h.physics.bodies.require("old");
      const originalRemove = h.world.removeRigidBody.bind(h.world);
      let replacement: AuraRuntimeNodeHandle | undefined;
      let oldRemovalCalls = 0;
      h.world.removeRigidBody = (id) => {
        if (id === old.id) {
          oldRemovalCalls += 1;
          if (!replacement) replacement = h.app.nodes.add!(box("new", "shared"));
        }
        originalRemove(id);
      };
      expect(h.app.nodes.remove!("shared")).toBe(true);
      expect(oldRemovalCalls).toBe(1);
      expect(h.app.nodes.require("shared")).toBe(replacement);
      expect(h.physics.bodies.has("old")).toBe(false);
      expect(h.physics.bodies.has("new")).toBe(true);
      expect(() => old.position()).toThrow(/removed/i);
    } finally { h.app.dispose(); }
  });

  it("discards an older staged addition when body retirement publishes a newer same-id node", () => {
    const h = harness();
    try {
      h.app.nodes.add!(box("old", "shared"));
      const old = h.physics.bodies.require("old");
      const originalRemove = h.world.removeRigidBody.bind(h.world);
      let replacement: AuraRuntimeNodeHandle | undefined;
      let entered = false;
      h.world.removeRigidBody = (id) => {
        if (id === old.id && !entered) {
          entered = true;
          replacement = h.app.nodes.add!(box("newer", "shared"));
        }
        originalRemove(id);
      };
      const result = h.app.nodes.add!(box("older-staged", "shared"));
      expect(result).toBe(replacement);
      expect(h.app.nodes.require("shared")).toBe(replacement);
      expect(h.physics.bodies.has("old")).toBe(false);
      expect(h.physics.bodies.has("older-staged")).toBe(false);
      expect(h.physics.bodies.has("newer")).toBe(true);
      expect(h.physics.bodies.ids()).toHaveLength(2); // existing and the latest addition
    } finally { h.app.dispose(); }
  });

  it.each([true, false])("preserves explicit stepping and bindNodes=%s for newly added bodies", (bindNodes) => {
    const h = harness(scene().add(box("existing")), bindNodes);
    try {
      const handle = h.app.nodes.add!(box("moving"));
      const body = h.physics.bodies.require("moving");
      body.setVelocity([2, 3, 4]);
      expect(handle.position).toEqual([0, 0, 0]);
      h.app.advance(0);
      expect(h.world.stepCalls).toBe(0);
      expect(handle.position).toEqual([0, 0, 0]);
      h.physics.step(1);
      expect(h.world.stepCalls).toBe(1);
      expect(handle.position).toEqual(bindNodes ? [2, 3, 4] : [0, 0, 0]);
    } finally { h.app.dispose(); }
  });

  it("removes dynamically declared bodies on scene replacement while keeping programmatic bodies", () => {
    const h = harness();
    try {
      const external = h.physics.createBody({ name: "programmatic" });
      h.app.nodes.add!(box("transient"));
      const old = h.physics.bodies.require("transient");
      h.app.setScene(scene().add(box("next")));
      expect(h.physics.bodies.has("existing")).toBe(false);
      expect(h.physics.bodies.has("transient")).toBe(false);
      expect(h.physics.bodies.has("next")).toBe(true);
      expect(h.physics.bodies.get("programmatic")?.id).toBe(external.id);
      expect(() => old.position()).toThrow(/removed/i);
    } finally { h.app.dispose(); }
    expect(h.worlds.every((world) => world.disposed)).toBe(true);
  });
});
