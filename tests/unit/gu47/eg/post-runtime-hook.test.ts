/**
 * GU47 E-G, E-C handoff 1: `createProductionRuntimePostprocess` applies the
 * app's `app.post.setEffect` / `setEffectEnabled` overrides to the compiler
 * bag (bloom pass params, the legacy DOF twin), keyed by the app's canvas.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createProductionRuntimePostprocess } from "../../../../packages/engine/src/agent-api/compiler/postprocess";
import { Prd03PostSurface, resetRuntimePostOverrides } from "../../../../packages/engine/src/agent-api/postBridge";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";

const FLAGS = { on: () => false } as never;
const canvas = (): HTMLCanvasElement => ({ width: 640, height: 360 }) as HTMLCanvasElement;
/** `options.bloom` is `boolean | BloomOptions`; the compiler always submits the object form. */
const bloomOf = (options: { readonly bloom?: unknown }): { readonly intensity?: number; readonly threshold?: number } | undefined =>
  typeof options.bloom === "object" && options.bloom !== null ? options.bloom as { readonly intensity?: number; readonly threshold?: number } : undefined;

function scene(...nodes: { toJSON(): unknown }[]) {
  return { nodes: nodes.map((node) => node.toJSON()), camera: { near: 0.1, far: 100 } } as never;
}

afterEach(() => resetRuntimePostOverrides());

describe("GU47 E-G compiler hook for app.post.setEffect (E-C handoff 1)", () => {
  it("bloom pass params follow setEffect on the next compile of the same snapshot", () => {
    const snapshot = scene(effects.bloom({ intensity: 0.3, threshold: 0.7 }));
    const target = canvas();
    const post = new Prd03PostSurface(FLAGS, target);
    const before = createProductionRuntimePostprocess(snapshot, [], 640, 360, true, { canvas: target });
    expect(bloomOf(before)?.intensity).toBeCloseTo(0.3, 6);
    post.setEffect("bloom", { intensity: 1.2, threshold: 0.4 });
    const after = createProductionRuntimePostprocess(snapshot, [], 640, 360, true, { canvas: target });
    expect(bloomOf(after)?.intensity).toBeCloseTo(1.2, 6);
    expect(bloomOf(after)?.threshold).toBeCloseTo(0.4, 6);
  });

  it("setEffectEnabled(false) drops bloom and depth of field from the compiler bag", () => {
    const snapshot = scene(effects.bloom({ intensity: 0.5 }), effects.depthOfField({ focusDistance: 4 }));
    const target = canvas();
    const post = new Prd03PostSurface(FLAGS, target);
    const on = createProductionRuntimePostprocess(snapshot, [], 640, 360, true, { canvas: target });
    expect(on.bloom).toBeDefined();
    expect(on.depthOfField).toBeDefined();
    post.setEffectEnabled("bloom", false);
    post.setEffectEnabled("depthOfField", false);
    const off = createProductionRuntimePostprocess(snapshot, [], 640, 360, true, { canvas: target });
    expect(off.bloom).toBeUndefined();
    expect(off.depthOfField).toBeUndefined();
  });

  it("overrides stay with their canvas: a second app's compile is untouched", () => {
    const snapshot = scene(effects.bloom({ intensity: 0.3 }));
    const first = canvas();
    const second = canvas();
    const postA = new Prd03PostSurface(FLAGS, first);
    new Prd03PostSurface(FLAGS, second);
    postA.setEffect("bloom", { intensity: 1.5 });
    expect(bloomOf(createProductionRuntimePostprocess(snapshot, [], 640, 360, true, { canvas: first }))?.intensity).toBeCloseTo(1.5, 6);
    expect(bloomOf(createProductionRuntimePostprocess(snapshot, [], 640, 360, true, { canvas: second }))?.intensity).toBeCloseTo(0.3, 6);
  });
});
