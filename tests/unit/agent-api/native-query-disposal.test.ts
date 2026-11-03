import { describe, expect, it, vi } from "vitest";
import { createAuraApp } from "../../../packages/engine/src/agent-api/app/createAuraApp";
import { auraAppRegistry } from "../../../packages/engine/src/agent-api/app/liveApps";
import { raycast } from "../../../packages/engine/src/agent-api/SceneQueries";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";

const ray = { origin: [0, 0, 5] as const, direction: [0, 0, -1] as const };

function createApp() {
  return createAuraApp(undefined, {
    scene: scene().add(primitives.box({ name: "box" }).runtime({ id: "box" })),
    autoStart: false
  });
}

describe("app-owned query handles", () => {
  it("invalidates retained handles once without affecting another app", () => {
    const first = createApp();
    const second = createApp();
    const firstHandle = first.nodes.require("box");
    const secondHandle = second.nodes.require("box");
    const hits = (handle: typeof firstHandle, mode: "mesh" | "bounds") => raycast(ray, { handles: [handle], mode });

    try {
      for (const mode of ["mesh", "bounds"] as const) {
        expect(hits(firstHandle, mode).length).toBeGreaterThan(0);
        expect(hits(secondHandle, mode).length).toBeGreaterThan(0);
      }

      first.dispose();
      const versionAfterDispose = first.nodes.version;
      first.dispose();
      expect(first.nodes.version).toBe(versionAfterDispose);
      expect(first.nodes.get("box")).toBeUndefined();
      for (const mode of ["mesh", "bounds"] as const) {
        expect(hits(firstHandle, mode)).toEqual([]);
        expect(hits(secondHandle, mode).length).toBeGreaterThan(0);
      }
    } finally {
      first.dispose();
      second.dispose();
    }
    expect(hits(secondHandle, "mesh")).toEqual([]);
  });

  it("continues app teardown when registry cleanup fails", () => {
    const app = createApp();
    const handle = app.nodes.require("box");
    const registry = app.nodes as typeof app.nodes & { dispose(): void };
    const disposeRegistry = registry.dispose.bind(registry);
    const dispose = vi.spyOn(registry, "dispose").mockImplementation(() => {
      disposeRegistry();
      throw new Error("query cleanup failed");
    });
    try {
      expect(auraAppRegistry.all()).toContain(app);
      expect(() => app.dispose()).not.toThrow();
      expect(dispose).toHaveBeenCalledOnce();
      expect(raycast(ray, { handles: [handle], mode: "mesh" })).toEqual([]);
      expect(auraAppRegistry.all()).not.toContain(app);
      expect(app.diagnostics().errors).toEqual(expect.arrayContaining([expect.stringMatching(/DISPOSE_FAILED:.*query cleanup failed/)]));
    } finally {
      dispose.mockRestore();
      app.dispose();
    }
  });
});
