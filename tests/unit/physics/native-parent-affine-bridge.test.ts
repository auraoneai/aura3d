import { describe, expect, it, vi } from "vitest";
import { ScenePhysicsBridge, type ScenePhysicsNode } from "../../../packages/physics/src/ScenePhysicsBridge";

type V3 = [number, number, number];
type Q4 = [number, number, number, number];
const identity = (): Q4 => [0, 0, 0, 1];
const zRotation = (angle: number): Q4 => [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];

function body(position: V3 = [0, 0, 0], rotation: Q4 = identity()) {
  return {
    position: [...position] as V3,
    previousPosition: [...position] as V3,
    rotation: [...rotation] as Q4,
    previousRotation: [...rotation] as Q4,
    setPosition: vi.fn<(value: V3) => void>(),
    setRotation: vi.fn<(value: Q4) => void>()
  };
}

function world(...bodies: ReturnType<typeof body>[]) {
  return { getBody: (id: number) => bodies[id - 1] } as never;
}

function expectVector(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 8));
}

describe("scene physics affine parent synchronization", () => {
  it("preflights all kinematic bodies before rejecting a sheared node", () => {
    const first = body(), second = body();
    const grandparent: ScenePhysicsNode = { scale: [2, 1, 1] };
    const parent: ScenePhysicsNode = { parent: grandparent, position: [0, 0, 0], rotation: zRotation(Math.PI / 4) };
    const bridge = new ScenePhysicsBridge();
    bridge.bind({ bodyId: 1, node: { position: [1, 0, 0], rotation: identity() }, mode: "kinematic" });
    bridge.bind({ bodyId: 2, node: { parent, position: [0, 0, 0], rotation: identity() }, mode: "kinematic" });
    expect(() => bridge.pushKinematic(world(first, second))).toThrow(/shear/i);
    expect(first.setPosition).not.toHaveBeenCalled();
    expect(first.setRotation).not.toHaveBeenCalled();
    expect(second.setPosition).not.toHaveBeenCalled();
    bridge.dispose();
  });

  it("rejects a reflected world transform before moving the body", () => {
    const target = body();
    const bridge = new ScenePhysicsBridge();
    bridge.bind({ bodyId: 1, node: { position: [1, 0, 0], scale: [-1, 1, 1], rotation: identity() }, mode: "kinematic" });
    expect(() => bridge.pushKinematic(world(target))).toThrow(/reflection/i);
    expect(target.setPosition).not.toHaveBeenCalled();
    expect(target.setRotation).not.toHaveBeenCalled();
    bridge.dispose();
  });

  it("extracts the real rigid rotation when two local scale signs form a proper rotation", () => {
    const target = body();
    const bridge = new ScenePhysicsBridge();
    bridge.bind({ bodyId: 1, node: { position: [1, 2, 3], scale: [-1, -1, 1], rotation: identity() }, mode: "kinematic" });
    bridge.pushKinematic(world(target));
    expectVector(target.setPosition.mock.calls[0]![0], [1, 2, 3]);
    const actual = target.setRotation.mock.calls[0]![0] as Q4;
    expect(Math.abs(actual[2])).toBeCloseTo(1, 8);
    expect(Math.abs(actual[3])).toBeCloseTo(0, 8);
    bridge.dispose();
  });

  it("allows a child's inverse rotation to cancel an ancestor's shear", () => {
    const target = body();
    const grandparent: ScenePhysicsNode = { position: [0, 0, 0], scale: [2, 1, 1] };
    const parent: ScenePhysicsNode = { parent: grandparent, position: [0, 0, 0], rotation: zRotation(Math.PI / 4) };
    const child: ScenePhysicsNode = { parent, position: [1, 0, 0], rotation: zRotation(-Math.PI / 4) };
    const bridge = new ScenePhysicsBridge();
    bridge.bind({ bodyId: 1, node: child, mode: "kinematic" });
    bridge.pushKinematic(world(target));
    expectVector(target.setPosition.mock.calls[0]![0], [Math.SQRT2, Math.SQRT1_2, 0]);
    const actual = target.setRotation.mock.calls[0]![0] as Q4;
    expect(Math.abs(actual[3])).toBeCloseTo(1, 8);
    expectVector(actual.slice(0, 3), [0, 0, 0]);
    bridge.dispose();
  });

  it("rejects unrepresentable dynamic rotations before changing any node", () => {
    const first = body([4, 5, 6]);
    const second = body([7, 8, 9], zRotation(Math.PI / 4));
    const good: ScenePhysicsNode = { position: [0, 0, 0], rotation: identity() };
    const bad: ScenePhysicsNode = { parent: { scale: [2, 1, 1] }, position: [0, 0, 0], rotation: identity() };
    const bridge = new ScenePhysicsBridge();
    bridge.bind({ bodyId: 1, node: good });
    bridge.bind({ bodyId: 2, node: bad });
    expect(() => bridge.pullDynamic(world(first, second))).toThrow(/shear or reflection/i);
    expect(good.position).toEqual([0, 0, 0]);
    expect(good.rotation).toEqual(identity());
    expect(bad.position).toEqual([0, 0, 0]);
    bridge.dispose();
  });

  it("preflights the dynamic phase before committing an update's kinematic phase", () => {
    const kinematic = body(), dynamic = body([0, 0, 0], zRotation(Math.PI / 4));
    const bridge = new ScenePhysicsBridge();
    bridge.bind({ bodyId: 1, node: { position: [3, 0, 0], rotation: identity() }, mode: "kinematic" });
    bridge.bind({ bodyId: 2, node: { parent: { scale: [2, 1, 1] }, position: [0, 0, 0], rotation: identity() } });
    expect(() => bridge.update(world(kinematic, dynamic))).toThrow(/shear or reflection/i);
    expect(kinematic.setPosition).not.toHaveBeenCalled();
    expect(kinematic.setRotation).not.toHaveBeenCalled();
    bridge.dispose();
  });

  it("does not invoke world setters when a later binding cannot represent its target", () => {
    const position = vi.fn(), rotation = vi.fn();
    const first = body([1, 2, 3]);
    const second = body([0, 0, 0], zRotation(Math.PI / 4));
    const bridge = new ScenePhysicsBridge();
    bridge.bind({ bodyId: 1, node: { setWorldPosition: position, setWorldQuaternion: rotation } });
    bridge.bind({ bodyId: 2, node: { parent: { scale: [2, 1, 1] } } });
    expect(() => bridge.pullDynamic(world(first, second))).toThrow(/shear or reflection/i);
    expect(position).not.toHaveBeenCalled();
    expect(rotation).not.toHaveBeenCalled();
    bridge.dispose();
  });

  it("pulls a representable axis permutation through a nonuniform parent", () => {
    const target = body([2, 3, 0], zRotation(Math.PI / 2));
    const node: ScenePhysicsNode = { parent: { scale: [2, 1, 1] }, position: [0, 0, 0], rotation: identity() };
    const bridge = new ScenePhysicsBridge();
    bridge.bind({ bodyId: 1, node });
    bridge.pullDynamic(world(target));
    expectVector(node.position!, [1, 3, 0]);
    expectVector(node.rotation!, zRotation(Math.PI / 2));
    bridge.dispose();
  });

  it("solves a valid world rotation through a sheared parent when the child cancels it", () => {
    const target = body([0, 0, 0], identity());
    const grandparent: ScenePhysicsNode = { scale: [2, 1, 1] };
    const parent: ScenePhysicsNode = { parent: grandparent, position: [0, 0, 0], rotation: zRotation(Math.PI / 4) };
    const node: ScenePhysicsNode = { parent, position: [0, 0, 0], rotation: identity() };
    const bridge = new ScenePhysicsBridge();
    bridge.bind({ bodyId: 1, node });
    bridge.pullDynamic(world(target));
    expectVector(node.rotation!, zRotation(-Math.PI / 4));
    bridge.dispose();
  });

  it("stages a parent pose before deriving its bound child's pose", () => {
    const parentBody = body([0, 0, 0], zRotation(Math.PI / 2));
    const childBody = body([0, 2, 0], zRotation(Math.PI / 2));
    const parent: ScenePhysicsNode = { position: [0, 0, 0], rotation: identity(), scale: [2, 1, 1] };
    const child: ScenePhysicsNode = { parent, position: [0, 0, 0], rotation: identity() };
    const bridge = new ScenePhysicsBridge();
    bridge.bind({ bodyId: 2, node: child });
    bridge.bind({ bodyId: 1, node: parent });
    bridge.pullDynamic(world(parentBody, childBody));
    expectVector(parent.rotation!, zRotation(Math.PI / 2));
    expectVector(child.position!, [1, 0, 0]);
    expectVector(child.rotation!, identity());
    bridge.dispose();
  });

  it("rejects an opaque world getter under a nonuniform parent", () => {
    const target = body();
    const node: ScenePhysicsNode = {
      parent: { scale: [2, 1, 1] },
      getWorldPosition: () => [0, 0, 0],
      getWorldQuaternion: () => identity()
    };
    const bridge = new ScenePhysicsBridge();
    bridge.bind({ bodyId: 1, node, mode: "kinematic" });
    expect(() => bridge.pushKinematic(world(target))).toThrow(/ambiguous/i);
    expect(target.setPosition).not.toHaveBeenCalled();
    bridge.dispose();
  });
});
