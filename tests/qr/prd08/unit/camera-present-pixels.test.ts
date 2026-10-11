/**
 * Pixels, not evidence (PRD-08 §19 promotion, run 38151983512 NO-EFFECT): the
 * production renderer reads the camera from its render snapshot, a shallow
 * copy made at mount (`{ ...snapshot, nodes }`) that keeps a reference to the
 * authored camera object. Replacing `app.scene.camera` never reached that
 * copy, so flag-on frames were byte-identical to flags-off. The presented
 * pose must land in the object the renderer holds.
 */
import { describe, expect, it } from "vitest";
import { createAuraCameraController } from "../../../../packages/engine/src/agent-api/camera/extension.js";
import type { AuraApp } from "../../../../packages/engine/src/agent-api/index.js";

type FrameCb = (f: { readonly dt: number; readonly time: number }) => void;

function appWithRenderSnapshot(camera: Record<string, unknown>) {
  const callbacks = new Set<FrameCb>();
  const scene = { camera, nodes: [] as unknown[] };
  // What createAuraApp hands the production renderer: a shallow copy.
  const renderSnapshot = { ...scene, nodes: [...scene.nodes] };
  const app = {
    scene,
    nodes: { all: () => [], get: () => undefined },
    onFrame(cb: FrameCb) {
      callbacks.add(cb);
      return () => callbacks.delete(cb);
    }
  };
  return {
    app: app as unknown as AuraApp,
    renderSnapshot,
    tick(dt = 1 / 60, time = 0) {
      for (const cb of [...callbacks]) cb({ dt, time });
    }
  };
}

describe("presented pose reaches the renderer's camera (pixels)", () => {
  it("setPose is visible through a shallow render-snapshot copy", () => {
    const { app, renderSnapshot, tick } = appWithRenderSnapshot({ position: [0, 2, 6], target: [0, 0, 0], fov: 50 });
    const camera = createAuraCameraController(app);
    camera.setPose({ position: [3, 4, 5], target: [1, 1, 1], fov: 62 });
    tick(1 / 60, 16);
    const rendered = renderSnapshot.camera as { position: number[]; target: number[]; fov: number; mode: string };
    expect(rendered.position).toEqual([3, 4, 5]);
    expect(rendered.target).toEqual([1, 1, 1]);
    expect(rendered.fov).toBeCloseTo(62, 6);
    expect(rendered.mode).toBe("perspective");
  });

  it("follow fields are cleared so the renderer uses the presented pose verbatim", () => {
    const authored = { mode: "follow", targetNode: "hero", offset: [0, 2, 6], smoothing: 0.05, position: [0, 2, 6], target: [0, 0, 0], fov: 50 };
    const { app, renderSnapshot, tick } = appWithRenderSnapshot(authored);
    createAuraCameraController(app);
    tick(1 / 60, 16);
    const rendered = renderSnapshot.camera as Record<string, unknown>;
    expect(rendered.mode).toBe("perspective");
    expect(rendered.targetNode).toBeUndefined();
    expect(rendered.offset).toBeUndefined();
    expect(rendered.smoothing).toBeUndefined();
  });

  it("frozen authored specs fall back to replacement (no throw)", () => {
    const { app, tick } = appWithRenderSnapshot(Object.freeze({ position: [0, 2, 6], target: [0, 0, 0], fov: 50 }) as Record<string, unknown>);
    const camera = createAuraCameraController(app);
    camera.setPose({ position: [1, 2, 3] });
    expect(() => tick(1 / 60, 16)).not.toThrow();
    expect((app.scene as unknown as { camera: { position: number[] } }).camera.position).toEqual([1, 2, 3]);
  });
});
