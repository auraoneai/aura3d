import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

interface RouteEvidenceStatusModule {
  readonly routeEvidenceStatusPolicy: Readonly<Record<string, { readonly accepted: boolean; readonly meaning: string }>>;
  readonly acceptedRouteEvidenceStatuses: readonly string[];
  readonly acceptedRouteEvidenceStatusPattern: RegExp;
  isAcceptedRouteEvidenceStatus(value: unknown): boolean;
  routeEvidenceStatusProvesCapability(value: unknown): boolean;
}

async function loadModule(): Promise<RouteEvidenceStatusModule> {
  return await import(
    pathToFileURL(resolve("tools/showcase-library/route-evidence-status.mjs")).href
  ) as RouteEvidenceStatusModule;
}

describe("mounted route evidence status policy", () => {
  it("handles ready, running, playing, completed, and unsupported deliberately", async () => {
    const module = await loadModule();
    expect([...module.acceptedRouteEvidenceStatuses].sort())
      .toEqual(["completed", "playing", "ready", "running", "unsupported"]);
    for (const status of ["ready", "running", "playing", "completed", "unsupported"]) {
      expect(module.routeEvidenceStatusPolicy[status]?.accepted, `${status} accepted`).toBe(true);
      expect(module.routeEvidenceStatusPolicy[status]?.meaning, `${status} meaning`).toMatch(/mounted/);
      expect(module.isAcceptedRouteEvidenceStatus(status), `${status} accepted by matcher`).toBe(true);
    }
  });

  it("rejects invented or error statuses instead of silently passing them", async () => {
    const module = await loadModule();
    for (const status of ["", "unknown", "error", "failed", "blank", "Ready", "ready ", "pass", "ok", null, 1]) {
      expect(module.isAcceptedRouteEvidenceStatus(status), `${String(status)} must be rejected`).toBe(false);
    }
  });

  it("treats unsupported as a mounted refusal rather than capability proof", async () => {
    const module = await loadModule();
    expect(module.isAcceptedRouteEvidenceStatus("unsupported")).toBe(true);
    expect(module.routeEvidenceStatusProvesCapability("unsupported")).toBe(false);
    for (const status of ["ready", "running", "playing", "completed"]) {
      expect(module.routeEvidenceStatusProvesCapability(status), `${status} proves capability`).toBe(true);
    }
  });

  it("keeps browser evidence specs aligned with the shared accepted-status set", async () => {
    const module = await loadModule();
    const specs = [
      "tests/browser/showcase-library.spec.ts",
      "tests/browser/showcase-route-primary-probes.spec.ts"
    ];
    for (const spec of specs) {
      const text = readFileSync(resolve(spec), "utf8");
      for (const status of module.acceptedRouteEvidenceStatuses) {
        expect(text, `${spec} handles ${status}`).toContain(status);
      }
      expect(text, `${spec} must not accept an open-ended status`).not.toMatch(/status[^\n]*\.\*/);
    }
  });
});
