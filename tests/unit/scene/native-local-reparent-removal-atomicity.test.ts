import { describe, expect, it } from "vitest";
import {
  DisposalNotificationError,
  RemovalNotificationError,
  ReparentNotificationError,
  Scene,
  SceneNode,
  batchReparent,
  transformPoint,
  type Mat4
} from "../../../packages/scene/src/index";

function caught(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the operation to throw.");
}

function expectVector(actual: ArrayLike<number>, expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 8));
}

function localState(node: SceneNode) {
  return {
    position: [...node.transform.position],
    rotation: [...node.transform.rotation],
    scale: [...node.transform.scale],
    pivot: [...node.transform.pivot],
    matrix: [...node.transform.localMatrix],
    residual: node.transform.getLinearResidual(),
    auto: node.transform.matrixAutoUpdate
  };
}

function links(nodes: readonly SceneNode[]) {
  return nodes.map((node) => ({ node, parent: node.parent, children: [...node.children], disposed: node.disposed }));
}

function expectLinksEqual(before: ReturnType<typeof links>, after: ReturnType<typeof links>): void {
  expect(after).toHaveLength(before.length);
  before.forEach((state, index) => {
    const next = after[index]!;
    expect(next.node).toBe(state.node);
    expect(next.parent).toBe(state.parent);
    expect(next.disposed).toBe(state.disposed);
    expect(next.children).toHaveLength(state.children.length);
    state.children.forEach((child, childIndex) => expect(next.children[childIndex]).toBe(child));
  });
}

const shear: Mat4 = [
  1, 0, 0, 0,
  0.5, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];

describe("ordinary reparent and standalone removal", () => {
  it.each([
    {
      kind: "manual shear",
      configure: (node: SceneNode) => node.transform
        .setPosition(2, 3, 0).setPivot(1, 0, 0).setScale(0, 2, 1).setLinearResidual(shear)
        .setLocalMatrix([
          1, 0, 0, 0,
          1, 1, 0, 0,
          0, 0, 1, 0,
          2, 3, 0, 1
        ], { decompose: false }),
      expectedOrigin: [-3, 3, 0]
    },
    {
      kind: "singular authored TRS and residual",
      configure: (node: SceneNode) => node.transform
        .setPosition(2, 3, 0).setPivot(1, 0, 0).setScale(0, 2, 1).setLinearResidual(shear),
      expectedOrigin: [-2, 3, 0]
    }
  ])("commits a local move with $kind before reporting listener failures", ({ configure, expectedOrigin }) => {
    const oldRoot = new SceneNode({ name: "old-root" });
    const newRoot = new SceneNode({ name: "new-root" });
    const child = new SceneNode({ name: "child" });
    const grandchild = new SceneNode({ name: "grandchild" });
    const oldSpare = new SceneNode({ name: "old-spare" });
    const newSpare = new SceneNode({ name: "new-spare" });
    const independentRoot = new SceneNode({ name: "independent-root" });
    const independentChild = new SceneNode({ name: "independent-child" });
    oldRoot.transform.setPosition(10, 0, 0);
    newRoot.transform.setPosition(-5, 0, 0);
    oldRoot.addChild(child);
    child.addChild(grandchild);
    configure(child);
    oldRoot.updateWorldTransform();
    newRoot.updateWorldTransform();
    const beforeLocal = localState(child);
    const first = new Error("child listener failed");
    const second = new Error("grandchild listener failed");
    const calls: string[] = [];
    const observations: Array<{ linked: boolean; dirty: boolean }> = [];
    const attempted: Array<{ error: unknown; before: ReturnType<typeof links>; after: ReturnType<typeof links> }> = [];
    const observedNodes = [oldRoot, newRoot, child, grandchild, oldSpare, newSpare];
    const observe = (name: string) => {
      calls.push(name);
      observations.push({
        linked: child.parent === newRoot && !oldRoot.children.includes(child) && newRoot.children.includes(child),
        dirty: child.transform.isDirty() && grandchild.transform.isDirty()
      });
    };
    const unsubscribe = [
      child.transform.onDirty(() => { observe("child-throw"); throw first; }),
      child.transform.onDirty(() => {
        observe("child-after");
        for (const action of [() => oldRoot.addChild(oldSpare), () => newRoot.addChild(newSpare)]) {
          const before = links(observedNodes);
          const error = caught(action);
          attempted.push({ error, before, after: links(observedNodes) });
        }
        independentRoot.addChild(independentChild);
      }),
      grandchild.transform.onDirty(() => { observe("grandchild-throw"); throw second; }),
      grandchild.transform.onDirty(() => observe("grandchild-after"))
    ];

    const error = caught(() => newRoot.addChild(child));
    expect(error).toBeInstanceOf(ReparentNotificationError);
    const notificationError = error as ReparentNotificationError;
    expect(notificationError.committed).toBe(true);
    expect(notificationError.errors).toHaveLength(2);
    expect(notificationError.errors).toContain(first);
    expect(notificationError.errors).toContain(second);
    expect(calls.sort()).toEqual(["child-after", "child-throw", "grandchild-after", "grandchild-throw"]);
    expect(observations.every((item) => item.linked && item.dirty)).toBe(true);
    expect(attempted).toHaveLength(2);
    attempted.forEach((item) => {
      expect(item.error).toBeInstanceOf(Error);
      expectLinksEqual(item.before, item.after);
    });
    expect(independentChild.parent).toBe(independentRoot);
    expect(localState(child)).toEqual(beforeLocal);
    unsubscribe.forEach((remove) => remove());
    newRoot.updateWorldTransform();
    expect(localState(child)).toEqual(beforeLocal);
    expectVector(transformPoint(child.transform.worldMatrix, [0, 0, 0]), expectedOrigin);
    expect(() => oldRoot.addChild(oldSpare)).not.toThrow();
    expect(() => newRoot.addChild(newSpare)).not.toThrow();
  });

  it("invalidates a clean detached subtree and recomputes its world without the former parent", () => {
    const root = new SceneNode({ name: "root" });
    const parent = new SceneNode({ name: "parent" });
    const child = new SceneNode({ name: "child" });
    const grandchild = new SceneNode({ name: "grandchild" });
    root.addChild(parent);
    parent.addChild(child);
    child.addChild(grandchild);
    root.transform.setPosition(10, 0, 0);
    parent.transform.setPosition(2, 0, 0);
    child.transform.setPosition(3, 0, 0);
    grandchild.transform.setPosition(4, 0, 0);
    root.updateWorldTransform();
    expectVector(transformPoint(child.transform.worldMatrix, [0, 0, 0]), [15, 0, 0]);
    expectVector(transformPoint(grandchild.transform.worldMatrix, [0, 0, 0]), [19, 0, 0]);
    const observations: Array<{ name: string; detached: boolean; allDirty: boolean }> = [];
    for (const node of [child, grandchild]) {
      node.transform.onDirty(() => observations.push({
        name: node.name,
        detached: child.parent === null && !parent.children.includes(child),
        allDirty: child.transform.isDirty() && grandchild.transform.isDirty()
      }));
    }

    expect(parent.removeChild(child)).toBe(true);
    expect(observations.map((observation) => observation.name).sort()).toEqual(["child", "grandchild"]);
    expect(observations.every((observation) => observation.detached && observation.allDirty)).toBe(true);
    expect(child.transform.isDirty()).toBe(true);
    expect(grandchild.transform.isDirty()).toBe(true);
    child.updateWorldTransform();
    expectVector(transformPoint(child.transform.worldMatrix, [0, 0, 0]), [3, 0, 0]);
    expectVector(transformPoint(grandchild.transform.worldMatrix, [0, 0, 0]), [7, 0, 0]);
    expect(child.transform.isDirty()).toBe(false);
    expect(grandchild.transform.isDirty()).toBe(false);
  });

  it("reports committed removal errors while locking the former root and detached subtree", () => {
    const root = new SceneNode({ name: "root" });
    const parent = new SceneNode({ name: "parent" });
    const child = new SceneNode({ name: "child" });
    const grandchild = new SceneNode({ name: "grandchild" });
    const sibling = new SceneNode({ name: "sibling" });
    const oldSpare = new SceneNode({ name: "old-spare" });
    const detachedSpare = new SceneNode({ name: "detached-spare" });
    const independentRoot = new SceneNode({ name: "independent-root" });
    const independentChild = new SceneNode({ name: "independent-child" });
    root.addChild(parent);
    parent.addChild(child).addChild(sibling);
    child.addChild(grandchild);
    root.updateWorldTransform();
    const observedNodes = [root, parent, child, grandchild, sibling, oldSpare, detachedSpare];
    const first = new Error("child listener failed");
    const second = new Error("grandchild listener failed");
    const calls: string[] = [];
    const attempted: Array<{ error: unknown; before: ReturnType<typeof links>; after: ReturnType<typeof links> }> = [];
    const unsubscribe = [
      grandchild.transform.onDirty(() => { calls.push("grandchild-throw"); throw second; }),
      grandchild.transform.onDirty(() => calls.push("grandchild-after")),
      child.transform.onDirty(() => {
        calls.push("child-throw");
        for (const action of [
          () => root.addChild(oldSpare),
          () => child.addChild(detachedSpare),
          () => parent.removeChild(sibling),
          () => child.dispose()
        ]) {
          const before = links(observedNodes);
          const error = caught(action);
          attempted.push({ error, before, after: links(observedNodes) });
        }
        independentRoot.addChild(independentChild);
        throw first;
      }),
      child.transform.onDirty(() => calls.push("child-after"))
    ];

    const error = caught(() => parent.removeChild(child));
    expect(error).toBeInstanceOf(RemovalNotificationError);
    const notificationError = error as RemovalNotificationError;
    expect(notificationError).toBeInstanceOf(AggregateError);
    expect(notificationError.committed).toBe(true);
    expect(notificationError.child).toBe(child);
    expect(notificationError.previousParent).toBe(parent);
    expect(notificationError.errors).toHaveLength(2);
    expect(notificationError.errors).toContain(first);
    expect(notificationError.errors).toContain(second);
    expect(calls.sort()).toEqual(["child-after", "child-throw", "grandchild-after", "grandchild-throw"]);
    expect(attempted).toHaveLength(4);
    attempted.forEach((item) => {
      expect(item.error).toBeInstanceOf(Error);
      expectLinksEqual(item.before, item.after);
    });
    expect(child.parent).toBeNull();
    expect(parent.children).not.toContain(child);
    expect(grandchild.parent).toBe(child);
    expect(independentChild.parent).toBe(independentRoot);
    unsubscribe.forEach((remove) => remove());
    expect(() => root.addChild(oldSpare)).not.toThrow();
    expect(() => child.addChild(detachedSpare)).not.toThrow();
  });

  it("leaves same-parent and absent-child operations as notification-free no-ops", () => {
    const parent = new SceneNode({ name: "parent" });
    const child = new SceneNode({ name: "child" });
    const absent = new SceneNode({ name: "absent" });
    parent.addChild(child);
    parent.updateWorldTransform();
    const inverse = child.transform.inverseWorldMatrix;
    const before = links([parent, child, absent]);
    const local = localState(child);
    const world = child.transform.worldMatrix;
    const calls: string[] = [];
    child.transform.onDirty(() => calls.push("child"));

    expect(parent.addChild(child)).toBe(parent);
    expect(parent.addChild(child, { preserveWorldTransform: true })).toBe(parent);
    expect(parent.removeChild(absent)).toBe(false);
    expect(absent.removeFromParent()).toBe(false);
    expectLinksEqual(before, links([parent, child, absent]));
    expect(child.transform.isDirty()).toBe(false);
    expect(child.transform.worldMatrix).toBe(world);
    expect(child.transform.inverseWorldMatrix).toBe(inverse);
    expect(localState(child)).toEqual(local);
    expect(calls).toEqual([]);
  });

  it("cleans the full scene registry and rethrows the identical committed removal error", () => {
    const scene = new Scene();
    const parent = scene.createNode("parent");
    const child = scene.createNode("child");
    const grandchild = scene.createNode("grandchild");
    const sibling = scene.createNode("sibling");
    scene.root.addChild(parent);
    parent.addChild(child).addChild(sibling);
    child.addChild(grandchild);
    scene.updateWorldTransforms();
    const first = new Error("child listener");
    const second = new Error("grandchild listener");
    const calls: string[] = [];
    child.transform.onDirty(() => { calls.push("child"); throw first; });
    grandchild.transform.onDirty(() => { calls.push("grandchild"); throw second; });
    const removeFromParent = child.removeFromParent.bind(child);
    let originalError: unknown;
    child.removeFromParent = () => {
      try {
        return removeFromParent();
      } catch (error) {
        originalError = error;
        throw error;
      }
    };

    const error = caught(() => scene.removeNode(child));
    expect(error).toBe(originalError);
    expect(error).toBeInstanceOf(RemovalNotificationError);
    const notificationError = error as RemovalNotificationError;
    expect(notificationError.child).toBe(child);
    expect(notificationError.previousParent).toBe(parent);
    expect(notificationError.committed).toBe(true);
    expect(notificationError.errors).toHaveLength(2);
    expect(notificationError.errors).toContain(first);
    expect(notificationError.errors).toContain(second);
    expect(calls.sort()).toEqual(["child", "grandchild"]);
    expect(scene.getNodeById(child.id)).toBeUndefined();
    expect(scene.getNodeById(grandchild.id)).toBeUndefined();
    expect(scene.getNodeById(parent.id)).toBe(parent);
    expect(scene.getNodeById(sibling.id)).toBe(sibling);
    expect(child.parent).toBeNull();
  });

  it("does not treat a different removal or an ordinary failure as its own committed detach", () => {
    const scene = new Scene();
    const parent = scene.createNode("parent");
    const child = scene.createNode("child");
    const grandchild = scene.createNode("grandchild");
    const unrelated = new SceneNode({ name: "unrelated" });
    scene.root.addChild(parent);
    parent.addChild(child);
    child.addChild(grandchild);
    const cause = new Error("unrelated listener");
    const errors = [
      new RemovalNotificationError(unrelated, parent, [cause]),
      new RemovalNotificationError(child, unrelated, [cause]),
      new Error("ordinary failure")
    ];
    for (const error of errors) {
      child.removeFromParent = () => { throw error; };
      expect(caught(() => scene.removeNode(child))).toBe(error);
      expect(child.parent).toBe(parent);
      expect(parent.children).toContain(child);
      expect(scene.getNodeById(child.id)).toBe(child);
      expect(scene.getNodeById(grandchild.id)).toBe(grandchild);
    }
  });

  it("keeps registry cleanup for normal and false removal returns", () => {
    const scene = new Scene();
    const child = scene.createNode("child");
    const leaf = scene.createNode("leaf");
    const unattached = scene.createNode("unattached");
    scene.root.addChild(child);
    child.addChild(leaf);
    expect(scene.removeNode(child)).toBe(true);
    expect(scene.getNodeById(child.id)).toBeUndefined();
    expect(scene.getNodeById(leaf.id)).toBeUndefined();
    expect(scene.removeNode(unattached)).toBe(false);
    expect(scene.getNodeById(unattached.id)).toBeUndefined();
    expect(scene.removeNode(scene.root)).toBe(false);
    expect(scene.getNodeById(scene.root.id)).toBe(scene.root);
  });

  it("invalidates and updates surviving descendants after nonrecursive disposal without listeners", () => {
    const root = new SceneNode({ name: "root" });
    const parent = new SceneNode({ name: "parent" });
    const child = new SceneNode({ name: "child" });
    const grandchild = new SceneNode({ name: "grandchild" });
    root.addChild(parent);
    parent.addChild(child);
    child.addChild(grandchild);
    root.transform.setPosition(10, 0, 0);
    parent.transform.setPosition(2, 0, 0);
    child.transform.setPosition(3, 0, 0);
    grandchild.transform.setPosition(4, 0, 0);
    root.updateWorldTransform();
    expectVector(transformPoint(child.transform.worldMatrix, [0, 0, 0]), [15, 0, 0]);
    expectVector(transformPoint(grandchild.transform.worldMatrix, [0, 0, 0]), [19, 0, 0]);
    expect(child.transform.isDirty()).toBe(false);
    expect(grandchild.transform.isDirty()).toBe(false);

    expect(() => parent.dispose({ recursive: false })).not.toThrow();
    expect(parent.disposed).toBe(true);
    expect(parent.parent).toBeNull();
    expect(parent.children).toEqual([]);
    expect(root.children).not.toContain(parent);
    expect(child.disposed).toBe(false);
    expect(grandchild.disposed).toBe(false);
    expect(child.parent).toBeNull();
    expect(grandchild.parent).toBe(child);
    expect(child.transform.isDirty()).toBe(true);
    expect(grandchild.transform.isDirty()).toBe(true);
    child.updateWorldTransform();
    expectVector(transformPoint(child.transform.worldMatrix, [0, 0, 0]), [3, 0, 0]);
    expectVector(transformPoint(grandchild.transform.worldMatrix, [0, 0, 0]), [7, 0, 0]);
    expect(child.transform.isDirty()).toBe(false);
    expect(grandchild.transform.isDirty()).toBe(false);
    expect(() => parent.dispose({ recursive: false })).not.toThrow();
    expect(child.parent).toBeNull();
    expect(grandchild.parent).toBe(child);
  });

  it("commits nonrecursive disposal before notifying all surviving subtrees and aggregates their failures", () => {
    const root = new SceneNode({ name: "root" });
    const parent = new SceneNode({ name: "parent" });
    const first = new SceneNode({ name: "first" });
    const leaf = new SceneNode({ name: "leaf" });
    const second = new SceneNode({ name: "second" });
    const oldSpare = new SceneNode({ name: "old-spare" });
    const firstSpare = new SceneNode({ name: "first-spare" });
    const secondSpare = new SceneNode({ name: "second-spare" });
    const independentRoot = new SceneNode({ name: "independent-root" });
    const independentChild = new SceneNode({ name: "independent-child" });
    root.addChild(parent);
    parent.addChild(first).addChild(second);
    first.addChild(leaf);
    root.transform.setPosition(10, 0, 0);
    parent.transform.setPosition(2, 0, 0);
    first.transform.setPosition(3, 0, 0);
    leaf.transform.setPosition(4, 0, 0);
    second.transform.setPosition(5, 0, 0);
    root.updateWorldTransform();
    const firstError = new Error("first listener failed");
    const secondError = new Error("second listener failed");
    const calls: string[] = [];
    const observations: Array<{ committed: boolean; allDirty: boolean }> = [];
    const attempted: Array<{ error: unknown; before: ReturnType<typeof links>; after: ReturnType<typeof links> }> = [];
    const nodes = [root, parent, first, leaf, second, oldSpare, firstSpare, secondSpare];
    const observe = (name: string) => {
      calls.push(name);
      observations.push({
        committed: parent.disposed && parent.parent === null && parent.children.length === 0 &&
          !root.children.includes(parent) && first.parent === null && second.parent === null && leaf.parent === first,
        allDirty: first.transform.isDirty() && leaf.transform.isDirty() && second.transform.isDirty()
      });
    };
    const unsubscribe = [
      leaf.transform.onDirty(() => { observe("leaf-throw"); throw firstError; }),
      leaf.transform.onDirty(() => observe("leaf-after")),
      first.transform.onDirty(() => {
        observe("first");
        for (const action of [
          () => root.addChild(oldSpare),
          () => first.addChild(firstSpare),
          () => second.addChild(secondSpare),
          () => first.removeChild(leaf),
          () => parent.dispose({ recursive: false })
        ]) {
          const before = links(nodes);
          const error = caught(action);
          attempted.push({ error, before, after: links(nodes) });
        }
        independentRoot.addChild(independentChild);
      }),
      second.transform.onDirty(() => { observe("second-throw"); throw secondError; }),
      second.transform.onDirty(() => observe("second-after"))
    ];

    const error = caught(() => parent.dispose({ recursive: false }));
    expect(error).toBeInstanceOf(DisposalNotificationError);
    const notificationError = error as DisposalNotificationError;
    expect(notificationError).toBeInstanceOf(AggregateError);
    expect(notificationError.committed).toBe(true);
    expect(notificationError.node).toBe(parent);
    expect(notificationError.errors).toHaveLength(2);
    expect(notificationError.errors).toContain(firstError);
    expect(notificationError.errors).toContain(secondError);
    expect(calls.sort()).toEqual(["first", "leaf-after", "leaf-throw", "second-after", "second-throw"]);
    expect(observations.every((item) => item.committed && item.allDirty)).toBe(true);
    expect(attempted).toHaveLength(5);
    attempted.forEach((item) => {
      expect(item.error).toBeInstanceOf(Error);
      expectLinksEqual(item.before, item.after);
    });
    expect(independentChild.parent).toBe(independentRoot);
    expect(() => parent.dispose({ recursive: false })).not.toThrow();
    expect(calls).toHaveLength(5);

    unsubscribe.forEach((remove) => remove());
    first.updateWorldTransform();
    second.updateWorldTransform();
    expectVector(transformPoint(first.transform.worldMatrix, [0, 0, 0]), [3, 0, 0]);
    expectVector(transformPoint(leaf.transform.worldMatrix, [0, 0, 0]), [7, 0, 0]);
    expectVector(transformPoint(second.transform.worldMatrix, [0, 0, 0]), [5, 0, 0]);
    expect(() => root.addChild(oldSpare)).not.toThrow();
    expect(() => first.addChild(firstSpare)).not.toThrow();
    expect(() => second.addChild(secondSpare)).not.toThrow();
  });

  it("disposes recursively without generating removal notifications on disposed nodes", () => {
    const parent = new SceneNode({ name: "parent" });
    const child = new SceneNode({ name: "child" });
    const leaf = new SceneNode({ name: "leaf" });
    parent.addChild(child);
    child.addChild(leaf);
    parent.updateWorldTransform();
    const calls: string[] = [];
    child.transform.onDirty(() => { calls.push("child"); throw new Error("unexpected child notification"); });
    leaf.transform.onDirty(() => { calls.push("leaf"); throw new Error("unexpected leaf notification"); });
    expect(() => child.dispose()).not.toThrow();
    expect(calls).toEqual([]);
    expect(child.disposed).toBe(true);
    expect(leaf.disposed).toBe(true);
    expect(child.parent).toBeNull();
    expect(parent.children).not.toContain(child);
    expect(child.children).toEqual([]);
  });

  it("stops an ordered batch at a preflight failure without attempting later entries", () => {
    const scene = new Scene();
    const oldParent = scene.createNode("old");
    const destination = scene.createNode("destination");
    const first = scene.createNode("first");
    const later = scene.createNode("later");
    scene.root.addChild(oldParent).addChild(destination);
    oldParent.addChild(first).addChild(later);
    scene.updateWorldTransforms();
    const error = caught(() => batchReparent([first, destination, later], destination));
    expect(error).toBeInstanceOf(Error);
    expect(first.parent).toBe(destination);
    expect(destination.parent).toBe(scene.root);
    expect(later.parent).toBe(oldParent);
    expect(destination.children).toEqual([first]);
  });

  it("stops an ordered batch after a committed listener failure", () => {
    const scene = new Scene();
    const oldParent = scene.createNode("old");
    const destination = scene.createNode("destination");
    const first = scene.createNode("first");
    const failing = scene.createNode("failing");
    const later = scene.createNode("later");
    scene.root.addChild(oldParent).addChild(destination);
    oldParent.addChild(first).addChild(failing).addChild(later);
    scene.updateWorldTransforms();
    const listenerError = new Error("batch listener");
    failing.transform.onDirty(() => { throw listenerError; });
    const error = caught(() => batchReparent([first, failing, later], destination));
    expect(error).toBeInstanceOf(ReparentNotificationError);
    const notificationError = error as ReparentNotificationError;
    expect(notificationError.committed).toBe(true);
    expect(notificationError.errors).toEqual([listenerError]);
    expect(first.parent).toBe(destination);
    expect(failing.parent).toBe(destination);
    expect(later.parent).toBe(oldParent);
    expect(destination.children).toEqual([first, failing]);
  });
});
