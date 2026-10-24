import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuraApp, lights, primitives, scene } from "../../../packages/engine/src";

describe("onFrame callback errors", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports a throwing callback once and keeps running the other callbacks and later frames", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene().add(primitives.box({ name: "cube" })).add(lights.studio())
    });
    const seen: number[] = [];
    app.onFrame(() => {
      throw new Error('Aura3D runtime node "cube" was not found.');
    });
    app.onFrame(({ frame }) => seen.push(frame));

    expect(() => app.advance(1 / 30)).not.toThrow();
    expect(() => app.advance(1 / 30)).not.toThrow();

    expect(seen).toEqual([1, 2]);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]?.[0])).toContain('onFrame callback threw: Aura3D runtime node "cube" was not found.');
    expect(app.diagnostics().errors).toContain('onFrame callback threw: Aura3D runtime node "cube" was not found.');
    app.dispose();
  });
});
