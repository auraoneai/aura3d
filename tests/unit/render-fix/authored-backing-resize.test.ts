import { describe, expect, it } from "vitest";
import { authoredBackingResize } from "../../../packages/engine/src/agent-api/app/canvas";

describe("authoredBackingResize", () => {
  it("does nothing when the engine owns sizing", () => {
    expect(authoredBackingResize(true, { width: 1080, height: 675 }, { width: 720, height: 450 })).toBeNull();
  });

  it("forwards a backing size the author changed after mount (a hand-capped device pixel ratio)", () => {
    expect(authoredBackingResize(false, { width: 1080, height: 675 }, { width: 720, height: 450 })).toEqual({ width: 1080, height: 675 });
  });

  it("does nothing when the backing store matches what the renderer already has", () => {
    expect(authoredBackingResize(false, { width: 720, height: 450 }, { width: 720, height: 450 })).toBeNull();
  });

  it("ignores a degenerate size", () => {
    expect(authoredBackingResize(false, { width: 0, height: 450 }, { width: 720, height: 450 })).toBeNull();
  });

  it("forwards each later change once the synced size is updated", () => {
    let synced = { width: 720, height: 450 };
    const canvas = { width: 720, height: 450 };
    canvas.width = 1440; canvas.height = 900;
    const first = authoredBackingResize(false, canvas, synced);
    expect(first).toEqual({ width: 1440, height: 900 });
    synced = first!;
    expect(authoredBackingResize(false, canvas, synced)).toBeNull();
    canvas.width = 960;
    expect(authoredBackingResize(false, canvas, synced)).toEqual({ width: 960, height: 900 });
  });
});
