// Lane E1 wave 2 (handoff from G01, top-tennis C8): while the WebGL context is lost the frame loop skips presentation instead of
// throwing, and the device does not report CONTEXT_LOST_WEBGL (0x9242) as a GL fault.
import { describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ lost: false, renders: 0, throwOnRender: false as false | (() => void) }));

vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/mountRenderer")>();
  return {
    ...actual,
    createProductionSceneRenderer: async () => ({
      backend: "production-runtime",
      diagnostics: undefined,
      render() {
        if (fake.throwOnRender) fake.throwOnRender();
        fake.renders += 1;
        return 7;
      },
      update() { /* stand-in */ },
      resize() { /* stand-in */ },
      viewProjection: () => new Float32Array(16),
      deviceLost: () => fake.lost,
      dispose() { /* stand-in */ }
    })
  };
});

import { startProductionRender } from "../../../packages/engine/src/agent-api/app/frameLoop";
import { createInitialDiagnostics } from "../../../packages/engine/src/agent-api/diagnostics";
import { scene, primitives } from "../../../packages/engine/src";
import { WebGL2ContextLifecycle } from "../../../packages/rendering/src/webgl2/ContextLifecycle";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const fakeCanvas = () => ({
  width: 64, height: 64, style: { width: "64px", height: "64px" } as Record<string, string>, dataset: {} as Record<string, string>,
  parentElement: null, clientWidth: 64, clientHeight: 64,
  getBoundingClientRect: () => ({ width: 64, height: 64, left: 0, top: 0 }),
  hasAttribute: () => false, getContext: () => null, addEventListener() {}, removeEventListener() {}
}) as unknown as HTMLCanvasElement;

describe("E1 wave 2: context loss (top-tennis C8)", () => {
  it("app frames while the context is lost skip the render and do not throw", async () => {
    fake.lost = false; fake.renders = 0; fake.throwOnRender = false;
    const snapshot = scene().add(primitives.box({ name: "b", size: 1 })).toJSON() as AuraSceneSnapshot;
    const diagnostics = createInitialDiagnostics(snapshot, undefined);
    const controller = await startProductionRender(fakeCanvas(), snapshot, diagnostics, { autoStart: false, resize: false } as never);
    const mounted = fake.renders; // the mount presents a first frame
    controller.render(1);
    expect(fake.renders).toBe(mounted + 1);
    expect(diagnostics.drawCalls).toBe(7);

    fake.lost = true;
    expect(() => controller.render(2)).not.toThrow();
    expect(fake.renders).toBe(mounted + 1);
    expect(diagnostics.drawCalls).toBe(0);

    // The context goes in the middle of a frame, before the lost event: the device throws, the loop does not.
    fake.lost = false;
    fake.throwOnRender = () => { fake.lost = true; throw new Error("WebGL2 LDR postprocess presentation failed: 0x9242"); };
    expect(() => controller.render(3)).not.toThrow();

    // A real failure on a live context still surfaces.
    fake.lost = false;
    fake.throwOnRender = () => { throw new Error("WebGL2 draw failed for x: 0x502"); };
    expect(() => controller.render(4)).toThrow(/0x502/);
    controller.dispose();
  });

  it("the device reads CONTEXT_LOST_WEBGL as a loss, not a fault, and reports the loss before the event", () => {
    const errors: number[] = [];
    let contextLost = false;
    const gl = { NO_ERROR: 0, getError: () => errors.shift() ?? 0, isContextLost: () => contextLost };
    const host = { gl, contextLost: false } as never;
    const lifecycle = new WebGL2ContextLifecycle(host, {} as OffscreenCanvas);
    errors.push(0x9242);
    expect(lifecycle.readError()).toBeNull();
    errors.push(0x502);
    expect(lifecycle.readError()).toBe("0x502");
    expect(lifecycle.isDeviceLost()).toBe(false);
    contextLost = true;
    expect(lifecycle.isDeviceLost()).toBe(true);
  });
});
