import { describe, expect, test, vi } from "vitest";
import { AnimationObjectGroup } from "../../../packages/animation/src/AnimationObjectGroup.js";
import { PropertyBinding, type AnimationObjectGroupLike, type PropertyBindingLike } from "../../../packages/animation/src/PropertyBinding.js";

describe("animation group composite reentrancy", () => {
  test("removals take effect immediately and new members wait for the next write", () => {
    const writes: string[] = [];
    let group!: AnimationObjectGroup;
    let changed = false;
    const node = (id: string, onWrite?: () => void) => {
      let current = 0;
      return {
        uuid: id,
        get value() { return current; },
        set value(value: number) { current = value; writes.push(id); onWrite?.(); }
      };
    };
    const second = node("second");
    const third = node("third");
    const late = node("late");
    const first = node("first", () => {
      if (changed) return;
      changed = true;
      group.remove(second);
      group.add(late);
    });
    group = new AnimationObjectGroup(first, second, third);
    const binding = PropertyBinding.create(group, ".value");

    binding.setValue(1);
    expect(writes).toEqual(["first", "third"]);
    expect([first.value, second.value, third.value, late.value]).toEqual([1, 0, 1, 0]);
    writes.length = 0;
    group.add(second);
    binding.setValue(2);
    expect(writes).toEqual(["first", "second", "third", "late"]);
  });

  test("a removed and reactivated member keeps its pending turn", () => {
    const writes: string[] = [];
    let group!: AnimationObjectGroup;
    const second = {
      value: 0,
      set tick(value: number) { this.value = value; writes.push("second"); },
      get tick() { return this.value; }
    };
    const first = {
      value: 0,
      set tick(value: number) { this.value = value; writes.push("first"); group.remove(second); group.add(second); },
      get tick() { return this.value; }
    };
    group = new AnimationObjectGroup(first, second);
    PropertyBinding.create(group, ".tick").setValue(7);
    expect(writes).toEqual(["first", "second"]);
    expect(second.value).toBe(7);
  });

  test("uncaching the current member during its setter keeps the completed write safe", () => {
    let group!: AnimationObjectGroup;
    let current = 0;
    const markDirty = vi.fn();
    const first = {
      isObject3D: true,
      matrixWorldNeedsUpdate: false,
      transform: { markDirty },
      get value() { return current; },
      set value(value: number) { current = value; group.uncache(first); }
    };
    const second = { value: 0 };
    group = new AnimationObjectGroup(first, second);
    const binding = PropertyBinding.create(group, ".value");
    expect(() => binding.setValue(4)).not.toThrow();
    expect([current, second.value]).toEqual([4, 4]);
    expect(first.matrixWorldNeedsUpdate).toBe(true);
    expect(markDirty).toHaveBeenCalledOnce();
    expect(group.stats.objects.total).toBe(1);
  });

  test("unsubscribing and resubscribing cannot redirect an in-flight composite", () => {
    let group!: AnimationObjectGroup;
    let replacement!: PropertyBindingLike;
    let current = 0;
    let changed = false;
    const first = {
      get value() { return current; },
      set value(value: number) {
        current = value;
        if (!changed) {
          changed = true;
          group.unsubscribe_(".value");
          replacement = PropertyBinding.create(group, ".value");
        }
      }
    };
    const second = { value: 0 };
    group = new AnimationObjectGroup(first, second);
    const stale = PropertyBinding.create(group, ".value");
    expect(() => stale.setValue(3)).not.toThrow();
    expect([current, second.value]).toEqual([3, 0]);
    stale.setValue(9);
    expect([current, second.value]).toEqual([3, 0]);
    replacement.setValue(5);
    expect([current, second.value]).toEqual([5, 5]);
  });

  test("disposing a group in a setter suppresses later and future writes", () => {
    let group!: AnimationObjectGroup;
    let current = 0;
    const first = {
      get value() { return current; },
      set value(value: number) { current = value; group.dispose(); }
    };
    const second = { value: 0 };
    group = new AnimationObjectGroup(first, second);
    const binding = PropertyBinding.create(group, ".value");
    expect(() => binding.setValue(3)).not.toThrow();
    binding.setValue(7);
    expect([current, second.value]).toEqual([3, 0]);
    expect(group.stats.objects.total).toBe(0);
  });

  test("a getter that removes its own member cannot return a stale group value", () => {
    let group!: AnimationObjectGroup;
    let reads = 0;
    const first = {
      get value() { reads += 1; group.remove(first); return 11; }
    };
    const second = { value: 22 };
    group = new AnimationObjectGroup(first, second);
    expect(PropertyBinding.create(group, ".value").getValue()).toBe(22);
    expect(reads).toBe(1);
  });

  test("a getter that removes its member during lazy binding prevents the write", () => {
    let group!: AnimationObjectGroup;
    let current = 0;
    const first = {
      get value() { group.remove(first); return current; },
      set value(value: number) { current = value; }
    };
    const second = { value: 0 };
    group = new AnimationObjectGroup(first, second);
    PropertyBinding.create(group, ".value").setValue(8);
    expect([current, second.value]).toEqual([0, 8]);
  });

  test("a reentrant call gets its own snapshot without repeating the outer member", () => {
    let binding!: PropertyBindingLike;
    let current = 0;
    const writes: string[] = [];
    const first = {
      get value() { return current; },
      set value(value: number) {
        current = value;
        writes.push(`first:${value}`);
        if (value === 1) binding.setValue(2);
      }
    };
    let secondValue = 0;
    const second = {
      get value() { return secondValue; },
      set value(value: number) { secondValue = value; writes.push(`second:${value}`); }
    };
    binding = PropertyBinding.create(new AnimationObjectGroup(first, second), ".value");
    binding.setValue(1);
    expect(writes).toEqual(["first:1", "first:2", "second:2", "second:1"]);
  });

  test("custom group-like implementations without membership helpers use the live cached boundary", () => {
    const writes: string[] = [];
    const bindings: PropertyBindingLike[] = [];
    const simple = (name: string, action?: () => void): PropertyBindingLike => ({
      bind() {}, unbind() {}, getValue() { return undefined; },
      setValue() { writes.push(name); action?.(); }
    });
    const removed = simple("removed");
    const remaining = simple("remaining");
    const late = simple("late");
    const first = simple("first", () => {
      bindings.splice(bindings.indexOf(removed), 1);
      bindings.push(late);
    });
    bindings.push(first, removed, remaining);
    const group: AnimationObjectGroupLike = {
      isAnimationObjectGroup: true,
      nCachedObjects_: 0,
      subscribe_: () => bindings
    };
    PropertyBinding.create(group, ".value").setValue(1);
    expect(writes).toEqual(["first", "remaining"]);
  });

  test("composite dispatch preserves later public prototype overrides", () => {
    const read = PropertyBinding.prototype.getValue;
    const write = PropertyBinding.prototype.setValue;
    const calls: string[] = [];
    try {
      PropertyBinding.prototype.getValue = function () {
        calls.push("read");
        return read.call(this);
      };
      PropertyBinding.prototype.setValue = function (value) {
        calls.push("write");
        write.call(this, value);
      };
      const node = { value: 0 };
      const binding = PropertyBinding.create(new AnimationObjectGroup(node), ".value");
      binding.setValue(5);
      expect(binding.getValue()).toBe(5);
      expect(calls).toEqual(["write", "read"]);
    } finally {
      PropertyBinding.prototype.getValue = read;
      PropertyBinding.prototype.setValue = write;
    }
  });

  test.each(["bind", "unbind"] as const)("%s skips members removed during dispatch", (operation) => {
    const calls: string[] = [];
    const bindings: PropertyBindingLike[] = [];
    const simple = (name: string, action?: () => void): PropertyBindingLike => ({
      bind() { if (operation === "bind") { calls.push(name); action?.(); } },
      unbind() { if (operation === "unbind") { calls.push(name); action?.(); } },
      getValue() { return undefined; }, setValue() {}
    });
    const removed = simple("removed");
    const remaining = simple("remaining");
    const late = simple("late");
    const first = simple("first", () => {
      bindings.splice(bindings.indexOf(removed), 1);
      bindings.push(late);
    });
    bindings.push(first, removed, remaining);
    const group: AnimationObjectGroupLike = {
      isAnimationObjectGroup: true,
      nCachedObjects_: 0,
      subscribe_: () => bindings
    };
    PropertyBinding.create(group, ".value")[operation]();
    expect(calls).toEqual(["first", "remaining"]);
  });
});
