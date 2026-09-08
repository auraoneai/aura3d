import { describe, expect, it } from "vitest";
import { createAuraApp, primitives, scene } from "../../../packages/engine/src";

const makeApp = () => createAuraApp(null, {
  autoStart: false,
  scene: scene().add(primitives.box({ name: "async lifecycle abstract probe" }))
});

describe("root asynchronous lifecycle", () => {
  it("rejects unavailable native submission before simulation advances and recovers the queue", async () => {
    const app = makeApp();
    const first = app.stepAsync(0.1);
    const second = app.stepAsync(0.2);
    await expect(first).rejects.toThrow(/asynchronous submission unavailable/);
    await expect(second).rejects.toThrow(/asynchronous submission unavailable/);
    expect(app.runtime.frame).toBe(0);
    app.step(0.3);
    expect(app.runtime.time).toBeCloseTo(0.3);
    await app.disposeAsync();
  });

  it("rejects concurrent synchronous state changes without replacing the scene", async () => {
    const app = makeApp();
    const original = app.scene;
    const pending = app.stepAsync();
    expect(() => app.setScene(scene())).toThrow(/submission is pending/);
    expect(() => app.step()).toThrow(/submission is pending/);
    expect(() => app.advance()).toThrow(/submission is pending/);
    expect(app.scene).toBe(original);
    await expect(pending).rejects.toThrow(/unavailable/);
    app.setScene(scene());
    await app.disposeAsync();
  });

  it("settles queued work on disposal and rejects all later state advancement", async () => {
    const app = makeApp();
    const pending = app.stepAsync();
    const rejected = expect(pending).rejects.toThrow(/disposed/);
    await app.disposeAsync();
    await rejected;
    await expect(app.stepAsync()).rejects.toThrow(/disposed/);
    expect(() => app.advance()).toThrow(/disposed/);
    expect(app.runtime.frame).toBe(0);
    await app.disposeAsync();
  });

  it.each([NaN, Infinity, -0.1])("rejects invalid delta %s without poisoning synchronous use", async (dt) => {
    const app = makeApp();
    await expect(app.stepAsync(dt)).rejects.toThrow(/finite non-negative/);
    app.step(0.1);
    expect(app.runtime.frame).toBe(1);
    await app.disposeAsync();
  });
});
