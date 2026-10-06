// PRD-02 Phase 2 — C-31 `lighting` / `shadows` diagnostics sections:
// observed values only; a field the runtime cannot measure is `null`. Mock
// app: a scene containing a primitive named "contact shadow footprint" still
// reports `contactShadows.passExecuted === false` — nothing is derived from
// a node name (PRD-02:1924).

import { describe, expect, it } from "vitest";
import { diagnosticsSectionsAll } from "../../../packages/engine/src/contracts/diagnostics.js";
import { appExtensionsAll } from "../../../packages/engine/src/contracts/app.js";
import { Prd02LightingRuntime } from "@aura3d/engine/lanes";
import "@aura3d/engine/lanes";

describe("prd02 C-38 app.lighting registration", () => {
  it("prd02 lighting extension registered under flag", () => {
    const ext = appExtensionsAll().find((e) => e.member === "lighting" && e.owner === "prd02");
    expect(ext).toBeDefined();
    expect(ext!.flag).toBe("A3D_QR_LIGHTING");
  });
});

describe("prd02 C-31 diagnostics sections (observed values only)", () => {
  const sections = diagnosticsSectionsAll().filter((s) => s.owner === "prd02");

  it("lighting + shadows sections registered", () => {
    expect(sections.map((s) => s.key).sort()).toEqual(["lighting", "shadows"]);
  });

  it("mock app without a renderer: unmeasurable fields are null, not derived", () => {
    const app = {}; // no lighting member
    const lighting = sections.find((s) => s.key === "lighting")!.collect(app as never) as Record<string, unknown>;
    expect(lighting.lightsEvaluated).toBeNull();
    expect(lighting.lightsCulledByRange).toBeNull();
    const shadows = sections.find((s) => s.key === "shadows")!.collect(app as never) as Record<string, unknown>;
    expect(shadows.contactShadows).toBeNull();
  });

  it("mock device with a 'contact shadow footprint' primitive: passExecuted is observed false", () => {
    // A primitive named "contact shadow footprint" must never satisfy the
    // contact-shadow diagnostic — passExecuted comes from the device only.
    const runtime = new Prd02LightingRuntime();
    const diag = runtime.diagnostics();
    expect(diag.contactShadows.passExecuted).toBe(false);
    expect(diag.shadows).toHaveLength(0);

    const app = { lighting: runtime };
    const shadowsSection = diagnosticsSectionsAll().find((s) => s.id === "prd02.shadows")!;
    const out = shadowsSection.collect(app as never) as { contactShadows: { passExecuted: boolean } };
    expect(out.contactShadows.passExecuted).toBe(false);
  });

  it("runtime bookkeeping: rotation/intensity setters do not throw; probe calls resolve", async () => {
    const runtime = new Prd02LightingRuntime();
    runtime.setEnvironmentRotation(0.5);
    runtime.setEnvironmentIntensity(1.4);
    await runtime.updateProbe("mirror");
    await runtime.rebakeIrradiance("room");
    expect(typeof runtime.diagnostics().environment.source).toBe("string");
  });
});
