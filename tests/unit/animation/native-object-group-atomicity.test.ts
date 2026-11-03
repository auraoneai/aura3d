import { describe, expect, test } from "vitest";
import { AnimationObjectGroup } from "../../../packages/animation/src/AnimationObjectGroup.js";
import { PropertyBinding, type PropertyBindingNode } from "../../../packages/animation/src/PropertyBinding.js";

describe("animation object group atomic membership", () => {
  test("a failed path lookup does not publish any part of a multi-object add", () => {
    const firstJoint = { name: "joint", value: 1 };
    const secondJoint = { name: "joint", value: 2 };
    const first = { uuid: "first", value: 3, children: [firstJoint] };
    const second = { uuid: "second", value: 4, children: [secondJoint] };
    const unreadable = {
      uuid: "unreadable",
      get children(): never { throw new Error("children unavailable"); }
    };
    const group = new AnimationObjectGroup(first);
    const direct = PropertyBinding.create(group, ".value");
    const joint = PropertyBinding.create(group, "joint.value");
    group.remove(first);

    expect(() => group.add(first, second, unreadable)).toThrow("children unavailable");
    expect(group.stats.objects).toMatchObject({ total: 1, inUse: 0 });
    expect(group.stats.bindingsPerObject).toBe(2);
    direct.setValue(5);
    joint.setValue(6);
    expect([first.value, firstJoint.value, second.value, secondJoint.value]).toEqual([3, 1, 4, 2]);

    group.add(first, second);
    direct.setValue(7);
    joint.setValue(8);
    expect([first.value, firstJoint.value, second.value, secondJoint.value]).toEqual([7, 8, 7, 8]);
    expect(group.stats.objects).toMatchObject({ total: 2, inUse: 2 });
  });

  test("an identity getter failure leaves existing writes and indexes intact", () => {
    const first = { uuid: "first", value: 1 };
    let reads = 0;
    const second = { get uuid() { reads++; return "second"; }, value: 2 };
    const unreadable = { get uuid(): never { throw new Error("identity unavailable"); }, value: 3 };
    const group = new AnimationObjectGroup(first);
    const binding = PropertyBinding.create(group, ".value");

    expect(() => group.add(second, unreadable)).toThrow("identity unavailable");
    expect(reads).toBe(1);
    expect(group.stats.objects).toMatchObject({ total: 1, inUse: 1 });
    binding.setValue(4);
    expect([first.value, second.value]).toEqual([4, 2]);

    group.add(second);
    expect(reads).toBe(2);
    binding.setValue(5);
    expect([first.value, second.value]).toEqual([5, 5]);
    group.uncache(first, second);
    expect(group.stats.objects).toMatchObject({ total: 0, inUse: 0 });
  });

  test("a getter cannot mutate membership while a new add is being prepared", () => {
    const first = { uuid: "first", value: 1 };
    const group = new AnimationObjectGroup(first);
    const binding = PropertyBinding.create(group, ".value");
    const reentrant = {
      get uuid() { group.remove(first); return "second"; },
      value: 2
    };

    expect(() => group.add(reentrant)).toThrow(/while preparing bindings/);
    expect(group.stats.objects).toMatchObject({ total: 1, inUse: 1 });
    binding.setValue(3);
    expect([first.value, reentrant.value]).toEqual([3, 2]);
  });

  test("a failed reentrant subscription leaves the group usable", () => {
    const group = new AnimationObjectGroup();
    let reenter = true;
    const joint = { name: "joint", value: 1 };
    const node: PropertyBindingNode = {
      uuid: "first",
      get children() {
        if (reenter) group.uncache(node);
        return [joint];
      }
    };
    group.add(node);

    expect(() => PropertyBinding.create(group, "joint.value")).toThrow(/while preparing bindings/);
    expect(group.stats.objects).toMatchObject({ total: 1, inUse: 1 });
    expect(group.stats.bindingsPerObject).toBe(0);
    reenter = false;
    const binding = PropertyBinding.create(group, "joint.value");
    binding.setValue(9);
    expect(joint.value).toBe(9);
    expect(group.stats.bindingsPerObject).toBe(1);
  });

  test("active membership checks follow reactivation, uncache and path replacement", () => {
    const first = { uuid: "first", value: 1 };
    const second = { uuid: "second", value: 2 };
    const group = new AnimationObjectGroup(first, second);
    const bindings = group.subscribe_(".value");
    const firstBinding = bindings[0]!;
    const originalSecondBinding = bindings[1]!;

    group.remove(second);
    expect(group.isBindingActive_(".value", firstBinding)).toBe(true);
    expect(group.isBindingActive_(".value", originalSecondBinding)).toBe(false);
    group.add(second);
    expect(group.isBindingActive_(".value", originalSecondBinding)).toBe(true);
    group.uncache(second);
    group.add(second);
    const replacementSecondBinding = bindings[1]!;
    expect(replacementSecondBinding).not.toBe(originalSecondBinding);
    expect(group.isBindingActive_(".value", originalSecondBinding)).toBe(false);
    expect(group.isBindingActive_(".value", replacementSecondBinding)).toBe(true);

    group.unsubscribe_(".value");
    const replacementPath = group.subscribe_(".value");
    const replacementFirstBinding = replacementPath[0]!;
    expect(group.isBindingActive_(".value", firstBinding)).toBe(false);
    expect(group.isBindingActive_(".value", replacementFirstBinding)).toBe(true);
    group.dispose();
    expect(group.isBindingActive_(".value", replacementFirstBinding)).toBe(false);
  });
});
