import { describe, expect, it } from "vitest";
import { attachRootRenderSource, getRootRenderSource, hasRootRenderableContent } from "../../../packages/engine/src/production-runtime/RootRenderSourceBridge";

describe("explicit production-runtime geometry attachment to a root canvas", () => {
  it("keeps the production content requirement when public geometry is hidden until the owning source detaches", () => {
    const canvas = {} as HTMLCanvasElement;
    let collections = 0;
    expect(hasRootRenderableContent(canvas, false)).toBe(false);
    expect(hasRootRenderableContent(canvas, true)).toBe(true);
    const detach = attachRootRenderSource(canvas, { source: { collectRenderItems: () => { collections++; return []; } } });
    expect(hasRootRenderableContent(canvas, true)).toBe(true);
    expect(hasRootRenderableContent(canvas, false)).toBe(true);
    expect(hasRootRenderableContent({} as HTMLCanvasElement, false)).toBe(false);
    expect(collections).toBe(0);
    detach();
    expect(hasRootRenderableContent(canvas, false)).toBe(false);
    expect(hasRootRenderableContent(canvas, true)).toBe(true);
  });
  it("rejects competing owners and detaches only its own generation", () => {
    const canvas = {} as HTMLCanvasElement;
    const first = { source: { collectRenderItems: () => [] } };
    const second = { source: { collectRenderItems: () => [] } };
    const detachFirst = attachRootRenderSource(canvas, first);
    expect(getRootRenderSource(canvas)).toBe(first);
    expect(() => attachRootRenderSource(canvas, second)).toThrow("already has");
    detachFirst();
    expect(getRootRenderSource(canvas)).toBeUndefined();
    const detachSecond = attachRootRenderSource(canvas, second);
    detachFirst();
    expect(getRootRenderSource(canvas)).toBe(second);
    detachSecond();
    expect(getRootRenderSource(canvas)).toBeUndefined();
  });
});
