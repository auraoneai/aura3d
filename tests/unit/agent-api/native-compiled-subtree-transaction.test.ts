import { describe, expect, it, vi } from "vitest";
import "@aura3d/engine";
import { asRuntimeImpl, CompiledSceneImpl, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { flattenTaggingMountedRoots } from "../../../packages/engine/src/agent-api/compiler/mountedRoots";
import { flattenAuraSceneNodes, flattenNodesWithLineWorldMatrices } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { compileScene, registerNodeHandler } from "../../../packages/engine/src/contracts/compiler";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { primitive } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import { groups } from "../../../packages/engine/src/agent-api/nodes/groups";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraSceneNode, AuraSceneSnapshot, ProductionRuntimePrimitiveEntry } from "../../../packages/engine/src/agent-api/nodes/types";
import type { RenderItem } from "@aura3d/rendering";
import { Geometry } from "../../../packages/rendering/src/Geometry";

const box = (name: string, id = name): AuraSceneNode =>
  primitive("box", { name, size: 1 }).runtime({ id }).toJSON();
const group = (name: string, id = name): AuraSceneNode =>
  groups.create(name, []).runtime({ id }).toJSON();
const groupWithNestedParent = (name: string): AuraSceneNode =>
  groups.create(name, [groups.create("inner", []).runtime({ id: "inner" })]).runtime({ id: "outer" }).toJSON();
const nestedSceneRoot = (): AuraSceneNode => groups.create("outer", [
  groups.create("inner", [primitive("box", { name: "authored", size: 1 }).runtime({ id: "authored" })]).runtime({ id: "inner" }),
  primitive("box", { name: "sibling", size: 1 }).runtime({ id: "sibling" })
]).runtime({ id: "outer" }).toJSON();
const nestedReplacement = (name: string): AuraSceneNode =>
  groups.create(name, [primitive("box", { name: `${name}-mesh`, size: 1 }).runtime({ id: `${name}-mesh` })]).runtime({ id: "inner" }).toJSON();

function makeScene(callbacks: {
  added?: (entries: readonly ProductionRuntimePrimitiveEntry[]) => void;
  removed?: (entries: readonly ProductionRuntimePrimitiveEntry[]) => void;
} = {}, core = false): CompiledSceneImpl {
  const flags = resolveQrFlags({ options: core ? ["compiler", "lighting", "core"] : ["compiler", "lighting"] });
  const ctx = {
    renderer: undefined, assets: undefined, quality: { tier: "high" }, strict: true,
    flags, degrade: () => undefined, canvas: { width: 640, height: 480 },
    environmentLighting: () => ({}), collectedLights: [], runtimeWarnings: new Set<string>(),
    onPrimitiveEntriesAdded: callbacks.added, onPrimitiveEntriesRemoved: callbacks.removed
  } as unknown as MountSceneCompileContext;
  return new CompiledSceneImpl(0, null, [], new Set(), [], [], [], [], ctx, [], []);
}

const nameOf = (node: AuraSceneNode): string | undefined => (node as { name?: string }).name;
const names = (impl: CompiledSceneImpl): Array<string | undefined> => impl.liveNodes.map(nameOf);

describe("compiled subtree transactions", () => {
  it("rolls back a failing resource-publication callback and preserves the prior same-ID generation", () => {
    let failedEntry: ProductionRuntimePrimitiveEntry | undefined;
    const removed = vi.fn();
    const impl = makeScene({
      added(entries) {
        if (nameOf(entries[0]!.node) === "new") {
          failedEntry = entries[0];
          throw new Error("publication failed");
        }
      },
      removed
    });
    const old = box("old", "shared"), other = box("other");
    impl.addSubtree(old);
    impl.addSubtree(other);
    const oldEntry = impl.primitiveEntries[0]!;
    expect(() => impl.addSubtree(box("new", "shared"))).toThrow("publication failed");
    expect(impl.dynamicRoots.get("shared")).toBe(old);
    expect(names(impl)).toEqual(["old", "other"]);
    expect(impl.primitiveEntries).toContain(oldEntry);
    expect(oldEntry.resources[0]!.material.disposed).toBe(false);
    expect(failedEntry!.resources[0]!.material.disposed).toBe(true);
    expect(removed).toHaveBeenCalledWith([failedEntry]);
    impl.dispose();
  });

  it("stages handler contributions and cleans up a handler that throws", () => {
    const dispose = vi.fn();
    const unregister = registerNodeHandler({
      kind: "primitive", owner: "prd02",
      compile(node, _ctx, out) {
        out.addItems([{ label: nameOf(node as AuraSceneNode) } as unknown as RenderItem]);
        out.set("marker", nameOf(node as AuraSceneNode));
        if (nameOf(node as AuraSceneNode) === "bad") throw new Error("handler failed");
      },
      dispose
    });
    const impl = makeScene();
    try {
      impl.addSubtree(box("good"));
      const before = [...impl.persistentContributions.items];
      expect(() => impl.addSubtree(box("bad"))).toThrow("handler failed");
      expect(impl.persistentContributions.items).toEqual(before);
      expect(impl.persistentContributions.overrides.get("marker")).toBe("good");
      expect(names(impl)).toEqual(["good"]);
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally { impl.dispose(); unregister(); }
  });

  it("detaches and disposes staged resources even if the collected-light setter throws during publication and rollback", () => {
    const impl = makeScene();
    impl.addSubtree(box("existing"));
    const existing = impl.primitiveEntries[0]!;
    const release = vi.spyOn(Geometry.prototype, "dispose");
    Object.defineProperty(impl.mountCtx, "collectedLights", {
      configurable: true,
      get: () => [],
      set: () => { throw new Error("light publication failed"); }
    });
    try {
      const failing = groups.create("failing", [
        primitive("box", { name: "staged", size: 1 }),
        lights.point({ name: "staged-light" })
      ]).runtime({ id: "failing" }).toJSON();
      expect(() => impl.addSubtree(failing)).toThrow(/creation and rollback failed/);
      expect(names(impl)).toEqual(["existing"]);
      expect(impl.dynamicRoots.has("failing")).toBe(false);
      expect(impl.primitiveEntries).toEqual([existing]);
      expect(existing.resources[0]!.material.disposed).toBe(false);
      expect(release).toHaveBeenCalled();
    } finally { release.mockRestore(); impl.dispose(); }
  });

  it("restores the predecessor and its override when a deferred replacement rolls back", () => {
    const unregister = registerNodeHandler({
      kind: "primitive", owner: "prd02",
      compile(node, _ctx, out) { out.set("marker", nameOf(node as AuraSceneNode)); }
    });
    const impl = makeScene();
    try {
      const old = box("old", "same"), replacement = box("replacement", "same");
      impl.addSubtree(old);
      const oldResource = impl.primitiveEntries[0]!.resources[0]!;
      const mutation = impl.addSubtree(replacement, undefined, { deferCommit: true });
      expect(impl.dynamicRoots.get("same")).toBe(replacement);
      mutation.rollback();
      mutation.rollback();
      expect(impl.dynamicRoots.get("same")).toBe(old);
      expect(names(impl)).toEqual(["old"]);
      expect(impl.persistentContributions.overrides.get("marker")).toBe("old");
      expect(oldResource.material.disposed).toBe(false);
    } finally { impl.dispose(); unregister(); }
  });

  it("commits a replacement once and retires its predecessor without touching unrelated resources", () => {
    const impl = makeScene();
    const old = box("old", "same"), unrelated = box("other"), replacement = box("new", "same");
    impl.addSubtree(old);
    impl.addSubtree(unrelated);
    const oldMaterial = impl.primitiveEntries[0]!.resources[0]!.material;
    const unrelatedMaterial = impl.primitiveEntries[1]!.resources[0]!.material;
    const mutation = impl.addSubtree(replacement, undefined, { deferCommit: true });
    mutation.commit();
    mutation.commit();
    mutation.rollback();
    expect(names(impl)).toEqual(["other", "new"]);
    expect(impl.dynamicRoots.get("same")).toBe(replacement);
    expect(oldMaterial.disposed).toBe(true);
    expect(unrelatedMaterial.disposed).toBe(false);
    impl.dispose();
  });

  it("preserves an unrelated addition made by a callback before that callback throws", () => {
    let impl: CompiledSceneImpl;
    const nested = box("nested");
    impl = makeScene({ added(entries) {
      if (nameOf(entries[0]!.node) === "outer") {
        impl.addSubtree(nested);
        throw new Error("outer failed");
      }
    } });
    expect(() => impl.addSubtree(box("outer"))).toThrow("outer failed");
    expect(names(impl)).toEqual(["nested"]);
    expect(impl.dynamicRoots.get("nested")).toBe(nested);
    impl.dispose();
  });

  it.each(["remove", "replace"] as const)("rejects a child if its parent is %sd during staging", (operation) => {
    let impl: CompiledSceneImpl;
    const replacement = group("replacement", "parent");
    const unregister = registerNodeHandler({
      kind: "primitive", owner: "prd02",
      compile(node) {
        if (nameOf(node as AuraSceneNode) !== "child") return;
        impl.removeSubtree("parent");
        if (operation === "replace") impl.addSubtree(replacement);
      }
    });
    impl = makeScene();
    try {
      impl.addSubtree(group("original", "parent"));
      expect(() => impl.addSubtree(box("child"), "parent")).toThrow(/parent changed during staging/);
      expect(impl.dynamicRoots.has("child")).toBe(false);
      expect(names(impl)).toEqual([]);
      if (operation === "replace") expect(impl.dynamicRoots.get("parent")).toBe(replacement);
      else expect(impl.dynamicRoots.has("parent")).toBe(false);
    } finally { impl.dispose(); unregister(); }
  });

  it("preserves a same-ID reentrant winner and retires superseded generations", () => {
    let impl: CompiledSceneImpl;
    const winner = box("winner", "same");
    impl = makeScene({ added(entries) {
      if (nameOf(entries[0]!.node) === "outer") impl.addSubtree(winner);
    } });
    impl.addSubtree(box("old", "same"));
    const oldMaterial = impl.primitiveEntries[0]!.resources[0]!.material;
    expect(() => impl.addSubtree(box("outer", "same"))).toThrow(/superseded/);
    expect(names(impl)).toEqual(["winner"]);
    expect(impl.dynamicRoots.get("same")).toBe(winner);
    expect(oldMaterial.disposed).toBe(true);
    impl.dispose();
  });

  it("does not resurrect either generation if a deferred replacement is explicitly removed", () => {
    const impl = makeScene();
    impl.addSubtree(box("old", "same"));
    const mutation = impl.addSubtree(box("new", "same"), undefined, { deferCommit: true });
    expect(impl.removeSubtree("same")).toBe(true);
    mutation.rollback();
    mutation.commit();
    expect(names(impl)).toEqual([]);
    expect(impl.dynamicRoots.has("same")).toBe(false);
    impl.dispose();
  });

  it("retires dynamically added descendant roots when their parent is removed", () => {
    const impl = makeScene();
    impl.addSubtree(group("parent"));
    impl.addSubtree(box("child"), "parent");
    impl.addSubtree(box("grandchild"), "child");
    expect(impl.removeSubtree("parent")).toBe(true);
    expect(names(impl)).toEqual([]);
    expect(impl.dynamicRoots.has("child")).toBe(false);
    expect(impl.dynamicRoots.has("grandchild")).toBe(false);
    expect(impl.removeSubtree("child")).toBe(false);
    impl.dispose();
  });

  it("keeps an empty parent root usable after its last child leaves", () => {
    const impl = makeScene();
    const parent = group("parent");
    impl.addSubtree(parent);
    impl.addSubtree(box("first"), "parent");
    expect(impl.removeSubtree("first")).toBe(true);
    expect(impl.dynamicRoots.get("parent")).toBe(parent);
    impl.addSubtree(box("second"), "parent");
    expect(impl.removeSubtree("parent")).toBe(true);
    expect(names(impl)).toEqual([]);
    expect(impl.dynamicRoots.has("second")).toBe(false);
    impl.dispose();
  });

  it("owns a child added under a nested group with its containing root", () => {
    const impl = makeScene();
    impl.addSubtree(groupWithNestedParent("outer"));
    impl.addSubtree(box("child"), "inner");
    expect(impl.dynamicRoots.has("child")).toBe(true);
    expect(impl.removeSubtree("outer")).toBe(true);
    expect(impl.dynamicRoots.has("child")).toBe(false);
    expect(names(impl)).toEqual([]);
    impl.dispose();
  });

  it("removes an authored inner group and its dynamic descendants without touching siblings", () => {
    const impl = makeScene();
    impl.addSubtree(nestedSceneRoot());
    impl.addSubtree(box("dynamic"), "inner");
    const sibling = impl.primitiveEntries.find((entry) => nameOf(entry.node) === "sibling")!;
    const removed = impl.primitiveEntries.filter((entry) => ["authored", "dynamic"].includes(nameOf(entry.node) ?? ""));
    expect(impl.removeSubtree("inner")).toBe(true);
    expect(names(impl)).toEqual(["sibling"]);
    expect(impl.dynamicRoots.has("inner")).toBe(false);
    expect(impl.dynamicRoots.has("dynamic")).toBe(false);
    expect(sibling.resources[0]!.material.disposed).toBe(false);
    expect(removed.every((entry) => entry.resources[0]!.material.disposed)).toBe(true);
    expect(() => impl.addSubtree(box("late"), "inner")).toThrow(/parent is not live/);
    impl.dispose();
  });

  it("rolls back and then commits a same-ID authored inner-group replacement", () => {
    const impl = makeScene();
    impl.addSubtree(nestedSceneRoot());
    impl.addSubtree(box("dynamic"), "inner");
    const previous = impl.dynamicRoots.get("inner");
    const rolledBack = impl.addSubtree(nestedReplacement("cancelled"), undefined, { deferCommit: true });
    rolledBack.rollback();
    expect(impl.dynamicRoots.get("inner")).toBe(previous);
    expect(names(impl)).toEqual(["authored", "sibling", "dynamic"]);
    const replacement = nestedReplacement("replacement");
    const committed = impl.addSubtree(replacement, undefined, { deferCommit: true });
    committed.commit();
    expect(impl.dynamicRoots.get("inner")).toBe(replacement);
    expect(impl.dynamicRoots.has("dynamic")).toBe(false);
    expect(names(impl)).toEqual(["sibling", "replacement-mesh"]);
    expect(impl.removeSubtree("outer")).toBe(true);
    expect(names(impl)).toEqual([]);
    impl.dispose();
  });

  it.each(["rollback", "commit"] as const)("%ss an enlisted inner replacement with its pending parent", (action) => {
    const impl = makeScene();
    const original = nestedSceneRoot();
    impl.addSubtree(original);
    const oldMaterial = impl.primitiveEntries.find((entry) => nameOf(entry.node) === "authored")!.resources[0]!.material;
    const parentMutation = impl.addSubtree(nestedSceneRoot(), undefined, { deferCommit: true });
    const child = nestedReplacement("enlisted");
    // This direct compiler add commits its receipt, but the parent still owns
    // the final decision and retains its predecessor until that decision.
    impl.addSubtree(child);
    expect(oldMaterial.disposed).toBe(false);
    parentMutation[action]();
    if (action === "rollback") {
      expect(impl.dynamicRoots.get("outer")).toBe(original);
      expect(names(impl)).toEqual(["authored", "sibling"]);
      expect(oldMaterial.disposed).toBe(false);
    } else {
      expect(impl.dynamicRoots.get("inner")).toBe(child);
      expect(names(impl)).toEqual(["sibling", "enlisted-mesh"]);
      expect(oldMaterial.disposed).toBe(true);
    }
    impl.dispose();
  });

  it("preserves a reentrant same-ID inner replacement made during removal cleanup", () => {
    let impl: CompiledSceneImpl;
    let once = false;
    const replacement = nestedReplacement("reentrant");
    impl = makeScene({ removed(entries) {
      if (!once && entries.some((entry) => nameOf(entry.node) === "authored")) {
        once = true;
        impl.addSubtree(replacement, "outer");
      }
    } });
    impl.addSubtree(nestedSceneRoot());
    expect(impl.removeSubtree("inner")).toBe(true);
    expect(impl.dynamicRoots.get("inner")).toBe(replacement);
    expect(names(impl)).toEqual(["sibling", "reentrant-mesh"]);
    impl.dispose();
  });

  it("keeps all authored parent transforms when replacing an inner group under CORE", () => {
    const impl = makeScene({}, true);
    const outer = groups.create("outer", [
      groups.create("unnamed", [
        groups.create("inner", [primitive("box", { name: "old", size: 1 })], { position: [2, 0, 0] }).runtime({ id: "inner" })
      ], { position: [0, 2, 0] })
    ], { position: [3, 0, 0], rotation: [0, 0, Math.PI / 2] }).runtime({ id: "outer" }).toJSON();
    const replacement = groups.create("replacement", [
      primitive("box", { name: "new", size: 1, position: [1, 0, 0] })
    ], { position: [2, 0, 0] }).runtime({ id: "inner" }).toJSON();
    impl.addSubtree(outer);
    impl.addSubtree(replacement);
    const node = impl.liveNodes.find((candidate) => nameOf(candidate) === "new") as { position?: readonly number[] };
    expect(node.position?.[0]).toBeCloseTo(1, 5);
    expect(node.position?.[1]).toBeCloseTo(3, 5);
    impl.dispose();
  });

  it("preserves entirely unnamed mounted ancestors for replacement and later additions", async () => {
    const authored = scene().add(groups.create("unnamed", [
      groups.create("inner", [primitive("box", { name: "old", size: 1 })], { position: [2, 0, 0] }).runtime({ id: "inner" })
    ], { position: [5, 0, 0], rotation: [0, 0, Math.PI / 2] })).toJSON() as AuraSceneSnapshot;
    const temp = makeScene({}, true);
    const mounted = { ...authored, nodes: flattenTaggingMountedRoots(authored.nodes,
      (nodes, options) => flattenAuraSceneNodes(nodes, temp.mountCtx.flags, options)) };
    const registry = createAuraRuntimeNodeRegistry(mounted, {}, authored);
    const context: MountSceneCompileContext = { ...temp.mountCtx, runtimeNodes: registry };
    const compiled = await compileScene(mounted, context);
    const impl = asRuntimeImpl(compiled)!;
    try {
      const replacement = groups.create("replacement", [
        primitive("box", { name: "new", size: 1, position: [1, 0, 0] })
      ], { position: [2, 0, 0] }).runtime({ id: "inner" }).toJSON();
      impl.addSubtree(replacement);
      impl.addSubtree(primitive("box", { name: "later", size: 1, position: [1, 0, 0] }).runtime({ id: "later" }).toJSON(), "inner");
      for (const name of ["new", "later"]) {
        const node = impl.liveNodes.find((candidate) => nameOf(candidate) === name) as { position?: readonly number[] };
        expect(node.position?.[0]).toBeCloseTo(5, 5);
        expect(node.position?.[1]).toBeCloseTo(3, 5);
      }
    } finally { compiled.dispose(); temp.dispose(); }
  });

  it("retains mounted inner-group identities through both flatten passes", async () => {
    const authored = scene().add(nestedSceneRoot()).toJSON() as AuraSceneSnapshot;
    const mounted = { ...authored, nodes: flattenTaggingMountedRoots(authored.nodes, flattenNodesWithLineWorldMatrices) };
    const registry = createAuraRuntimeNodeRegistry(mounted, {}, authored);
    const temp = makeScene();
    const context = { ...temp.mountCtx, runtimeNodes: registry } as MountSceneCompileContext;
    const compiled = await compileScene(mounted, context);
    const impl = asRuntimeImpl(compiled)!;
    try {
      expect(impl.dynamicRoots.has("inner")).toBe(true);
      expect(impl.removeSubtree("inner")).toBe(true);
      expect(names(impl)).toEqual(["sibling"]);
      expect(impl.dynamicRoots.has("outer")).toBe(true);
    } finally { compiled.dispose(); temp.dispose(); }
  });

  it("rejects a nested child when its containing parent generation is replaced during staging", () => {
    let impl: CompiledSceneImpl;
    const replacement = groupWithNestedParent("replacement");
    const unregister = registerNodeHandler({
      kind: "primitive", owner: "prd02",
      compile(node) {
        if (nameOf(node as AuraSceneNode) !== "child") return;
        impl.removeSubtree("outer");
        impl.addSubtree(replacement);
      }
    });
    impl = makeScene();
    try {
      impl.addSubtree(groupWithNestedParent("original"));
      expect(() => impl.addSubtree(box("child"), "inner")).toThrow(/parent changed during staging/);
      expect(impl.dynamicRoots.get("outer")).toBe(replacement);
      expect(impl.dynamicRoots.has("child")).toBe(false);
      expect(names(impl)).toEqual([]);
    } finally { impl.dispose(); unregister(); }
  });

  it("retires a pending descendant replacement and its predecessor with the parent", () => {
    const impl = makeScene();
    impl.addSubtree(group("parent"));
    impl.addSubtree(box("old-child", "child"), "parent");
    const mutation = impl.addSubtree(box("new-child", "child"), "parent", { deferCommit: true });
    expect(impl.removeSubtree("parent")).toBe(true);
    mutation.rollback();
    expect(names(impl)).toEqual([]);
    expect(impl.dynamicRoots.has("child")).toBe(false);
    impl.dispose();
  });

  it("retires only descendants belonging to the replaced parent generation", () => {
    const impl = makeScene();
    impl.addSubtree(group("old-parent", "parent"));
    impl.addSubtree(box("old-child"), "parent");
    const mutation = impl.addSubtree(group("new-parent", "parent"), undefined, { deferCommit: true });
    impl.addSubtree(box("new-child"), "parent");
    mutation.commit();
    expect(impl.dynamicRoots.has("old-child")).toBe(false);
    expect(impl.dynamicRoots.has("new-child")).toBe(true);
    expect(names(impl)).toEqual(["new-child"]);
    impl.dispose();
  });

  it("retains the committed winner when retiring the old generation throws", () => {
    const impl = makeScene();
    impl.addSubtree(box("old", "same"));
    const material = impl.primitiveEntries[0]!.resources[0]!.material;
    vi.spyOn(material, "dispose").mockImplementation(() => { throw new Error("cleanup failed"); });
    const winner = box("winner", "same");
    const mutation = impl.addSubtree(winner, undefined, { deferCommit: true });
    expect(() => mutation.commit()).toThrow(/cleanup failed/i);
    mutation.rollback();
    expect(names(impl)).toEqual(["winner"]);
    expect(impl.dynamicRoots.get("same")).toBe(winner);
    impl.dispose();
  });

  it("ignores late handler contributions after the owning node is removed", async () => {
    let release!: () => void;
    const pause = new Promise<void>((resolve) => { release = resolve; });
    const unregister = registerNodeHandler({
      kind: "primitive", owner: "prd02",
      async compile(_node, _ctx, out) { await pause; out.addItems([{ label: "late" } as unknown as RenderItem]); out.set("marker", "late"); }
    });
    const impl = makeScene();
    try {
      impl.addSubtree(box("async"));
      expect(impl.removeSubtree("async")).toBe(true);
      release();
      await pause;
      await Promise.resolve();
      expect(impl.persistentContributions.items).toEqual([]);
      expect(impl.persistentContributions.overrides.has("marker")).toBe(false);
    } finally { release(); impl.dispose(); unregister(); }
  });

  it("rejects reusing an already-owned node object without changing the live scene", () => {
    const impl = makeScene();
    const node = box("one");
    impl.addSubtree(node);
    expect(() => impl.addSubtree(node)).toThrow(/already owned/);
    expect(names(impl)).toEqual(["one"]);
    impl.dispose();
  });
});
