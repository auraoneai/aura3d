import { describe, expect, it, vi } from "vitest";
import { readRootDiagnosticSnapshot } from "../../../packages/engine/src/agent-api/RootDiagnosticSnapshot";

describe("root asynchronous resource observation", () => {
  it("observes upgrade completion and warnings after the last frame without rendering", async () => {
    const observed = { frame: 1, drawCalls: 2, materials: [{ status: "pending", warnings: [] as string[] }] };
    const first = readRootDiagnosticSnapshot(observed, () => observed, false, false);
    await Promise.resolve();
    observed.materials[0]!.status = "textured";
    const completed = readRootDiagnosticSnapshot(first, () => observed, false, false);
    expect(completed.materials[0]!.status).toBe("textured");
    expect(completed.frame).toBe(1);
    expect(completed.drawCalls).toBe(2);
    expect(first.materials[0]!.status).toBe("pending");
    observed.materials[0]!.warnings.push("texture fetch failed");
    const failed = readRootDiagnosticSnapshot(completed, () => observed, false, false);
    expect(failed.materials[0]!.warnings).toEqual(["texture fetch failed"]);
    expect(completed.materials[0]!.warnings).toEqual([]);
  });

  it.each([[true, false], [false, true]])("does not read released or actively submitted resources (%s, %s)", (disposed, busy) => {
    const previous = { frame: 1 };
    const read = vi.fn(() => { throw new Error("resource access forbidden"); });
    expect(readRootDiagnosticSnapshot(previous, read, disposed, busy)).toEqual(previous);
    expect(read).not.toHaveBeenCalled();
  });
});
