import { describe, expect, it } from "vitest";

describe("showcase port diagnostics (?diag=1)", () => {
  it("is inert outside a browser and without the query parameter", async () => {
    const module = await import("../../../apps/showcase-port-shared/diag");
    expect(module.portDiagnostics.enabled).toBe(false);
    expect(module.portDiagnostics.lines).toEqual([]);
  });
});
