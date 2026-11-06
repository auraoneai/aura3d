import { describe, expect, it } from "vitest";
import { withProductionReporting, type A3DProductionRuntime } from "../../../apps/common/src/runtime";

const base = (status: A3DProductionRuntime["status"], extra: Partial<A3DProductionRuntime> = {}): A3DProductionRuntime => ({
  status,
  appId: "a",
  sceneId: "s",
  interactionCount: 0,
  lifecycle: { status, message: `m-${status}`, startedAtMs: 0, updatedAtMs: 0, elapsedMs: 0, timings: [] },
  ...extra
});

describe("apps/common production runtime reporting (W-6)", () => {
  it("reports webgl2 selection and maps status to readiness", () => {
    const ready = withProductionReporting(base("ready"));
    expect(ready.backendSelection).toEqual({ requested: "webgl2", active: "webgl2", missingFeatures: [], deviceLost: false });
    expect(ready.readiness).toEqual({ state: "ready", stage: "first-frame", backend: "webgl2" });
    expect(withProductionReporting(base("animating")).readiness?.state).toBe("ready");
    expect(withProductionReporting(base("loading-asset")).readiness).toEqual({ state: "pending", status: "loading-asset" });
    expect(withProductionReporting(base("error", { error: "no gl" })).readiness).toEqual({ state: "failed", code: "RENDERER_MOUNT_FAILED", message: "no gl" });
  });

  it("is idempotent and does not mutate its input", () => {
    const input = base("ready");
    const once = withProductionReporting(input);
    expect(input.readiness).toBeUndefined();
    expect(withProductionReporting(once)).toEqual(once);
  });
});
