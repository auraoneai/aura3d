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

  it("08-POSE: authored targetNode/offset/smoothing survive; up and roll are recorded", () => {
    const authored = { mode: "follow", targetNode: "hero", offset: [0, 2, 6], smoothing: 0.05, position: [0, 2, 6], target: [0, 0, 0], fov: 50 };
    const { app, renderSnapshot, tick } = appWithRenderSnapshot(authored);
    const camera = createAuraCameraController(app);
    camera.setPose({ position: [3, 4, 5], target: [1, 1, 1], up: [0, 1, 0], roll: 0.2 });
    tick(1 / 60, 16);
    const rendered = renderSnapshot.camera as Record<string, unknown>;
    // Perspective mode: the renderer's resolver ignores follow fields, so the pose draws verbatim.
    expect(rendered.mode).toBe("perspective");
    expect(rendered.position).toEqual([3, 4, 5]);
    expect(rendered.targetNode).toBe("hero");
    expect(rendered.offset).toEqual([0, 2, 6]);
    expect(rendered.smoothing).toBe(0.05);
    expect(rendered.up).toEqual([0, 1, 0]);
    expect(rendered.roll).toBeCloseTo(0.2, 9);
  });

  it("freezeSpecs: app.scene.camera stays frozen but the renderer-held camera still updates", () => {
    const { app, renderSnapshot, tick } = appWithRenderSnapshot({ position: [0, 2, 6], target: [0, 0, 0], fov: 50 });
    const camera = createAuraCameraController(app, { freezeSpecs: true });
    camera.setPose({ position: [7, 8, 9], target: [0, 1, 0] });
    expect(() => tick(1 / 60, 16)).not.toThrow();
    const exposed = (app.scene as unknown as { camera: { position: number[] } }).camera;
    expect(Object.isFrozen(exposed)).toBe(true);
    expect(exposed.position).toEqual([7, 8, 9]);
    expect((renderSnapshot.camera as { position: number[] }).position).toEqual([7, 8, 9]);
  });

  it("app.setScene reusing the same camera object keeps updates reaching the renderer", () => {
    const shared = { position: [0, 2, 6], target: [0, 0, 0], fov: 50 } as Record<string, unknown>;
    const callbacks = new Set<FrameCb>();
    let renderSnapshot = { camera: shared, nodes: [] as unknown[] };
    const app = {
      scene: { camera: shared, nodes: [] as unknown[] },
      nodes: { all: () => [], get: () => undefined },
      onFrame(cb: FrameCb) {
        callbacks.add(cb);
        return () => callbacks.delete(cb);
      },
      setScene(next: { camera: Record<string, unknown>; nodes: unknown[] }) {
        this.scene = next as never;
        renderSnapshot = { ...next, nodes: [...next.nodes] }; // remount: shallow copy, same camera object
      }
    };
    const camera = createAuraCameraController(app as unknown as AuraApp);
    // Same camera object, new scene wrapper (AuraSceneBuilder.toJSON() reuse).
    (app as unknown as { setScene(n: unknown): void }).setScene({ camera: shared, nodes: [] });
    camera.setPose({ position: [9, 9, 9], target: [0, 1, 0] });
    for (const cb of [...callbacks]) cb({ dt: 1 / 60, time: 0.016 });
    expect((renderSnapshot.camera as { position: number[] }).position).toEqual([9, 9, 9]);
  });

  it("same-camera remount (runtime node add/remove) keeps setPose overrides and the pose on screen", () => {
    const shared = { position: [0, 2, 6], target: [0, 0, 0], fov: 50 } as Record<string, unknown>;
    const callbacks = new Set<FrameCb>();
    let renderSnapshot = { camera: shared, nodes: [] as unknown[] };
    const app = {
      scene: { camera: shared, nodes: [] as unknown[] },
      nodes: { all: () => [], get: () => undefined },
      onFrame(cb: FrameCb) {
        callbacks.add(cb);
        return () => callbacks.delete(cb);
      },
      setScene(next: { camera: Record<string, unknown>; nodes: unknown[] }) {
        this.scene = next as never;
        renderSnapshot = { ...next, nodes: [...next.nodes] };
      }
    };
    const camera = createAuraCameraController(app as unknown as AuraApp);
    camera.setPose({ position: [9, 9, 9], target: [0, 1, 0], fov: 40 });
    for (const cb of [...callbacks]) cb({ dt: 1 / 60, time: 0.016 });
    // runtimeNodes.ts remount: same camera object, new nodes array.
    (app as unknown as { setScene(n: unknown): void }).setScene({ ...app.scene, nodes: [{ kind: "primitive" }] });
    // Immediately after the remount the renderer still shows the presented pose ...
    expect((renderSnapshot.camera as { position: number[] }).position).toEqual([9, 9, 9]);
    // ... and the override survives further frames (no rebind reset it).
    for (const cb of [...callbacks]) cb({ dt: 1 / 60, time: 0.033 });
    expect(camera.presented().position).toEqual([9, 9, 9]);
    expect(camera.presented().fov).toBeCloseTo(40, 6);
  });

  it("app.setScene restores the outgoing authored camera even when the camera is idle", () => {
    const authored = { mode: "follow", targetNode: "hero", position: [0, 2, 6], target: [0, 0, 0], fov: 50 };
    const callbacks = new Set<FrameCb>();
    const app = {
      scene: { camera: authored as Record<string, unknown>, nodes: [] as unknown[] },
      nodes: { all: () => [], get: () => undefined },
      onFrame(cb: FrameCb) {
        callbacks.add(cb);
        return () => callbacks.delete(cb);
      },
      setScene(next: { camera?: Record<string, unknown>; nodes: unknown[] }) {
        this.scene = next as never;
      }
    };
    const camera = createAuraCameraController(app as unknown as AuraApp);
    camera.setPose({ position: [3, 4, 5], target: [1, 1, 1], fov: 70 });
    for (const cb of [...callbacks]) cb({ dt: 1 / 60, time: 0.016 });
    expect(authored.position).toEqual([3, 4, 5]);
    // No presented()/onFrame call after the swap: only setScene runs.
    (app as unknown as { setScene(n: unknown): void }).setScene({ camera: { position: [0, 5, 5], target: [0, 0, 0], fov: 40 }, nodes: [] });
    expect(authored.mode).toBe("follow");
    expect(authored.position).toEqual([0, 2, 6]);
    expect(authored.fov).toBe(50);
    expect("up" in authored).toBe(false);
  });

  it("the authored pose is restored when the scene's camera changes (reused builder/spec)", () => {
    const authored = { mode: "follow", targetNode: "hero", position: [0, 2, 6], target: [0, 0, 0], fov: 50 };
    const { app, tick } = appWithRenderSnapshot(authored);
    const camera = createAuraCameraController(app);
    camera.setPose({ position: [3, 4, 5], target: [1, 1, 1], fov: 70 });
    tick(1 / 60, 16);
    expect(authored.position).toEqual([3, 4, 5]);
    // setScene swaps in a new camera object; the next presented frame rebinds.
    (app.scene as unknown as { camera: unknown }).camera = { position: [0, 5, 5], target: [0, 0, 0], fov: 40 };
    camera.presented();
    expect(authored.mode).toBe("follow");
    expect(authored.position).toEqual([0, 2, 6]);
    expect(authored.target).toEqual([0, 0, 0]);
    expect(authored.fov).toBe(50);
    expect("up" in authored).toBe(false);
    expect("roll" in authored).toBe(false);
  });
});
