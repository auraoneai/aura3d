import { describe, expect, it } from "vitest";

// Importing the engine barrel runs the lane index, which is what applies the
// lane's Phase-0 registrations.
import "@aura3d/engine/lanes";
import { appExtensionsAll, DIAGNOSTIC_ONLY_FIELDS, diagnosticsSectionsAll, resolveQrFlags } from "@aura3d/engine/contracts";
import { PRD01_SCENE_SPECS } from "../../../../benchmarks/quality-rebuild/scenes/prd01/index";

describe("prd01 lane registrations (Phase 0)", () => {
  it("registers the four C-31 diagnostics sections", () => {
    const keys = diagnosticsSectionsAll().map((section) => section.key);
    expect(keys).toEqual(expect.arrayContaining(["output", "resolution", "programs", "frameAllocations"]));
    const owners = diagnosticsSectionsAll()
      .filter((section) => ["output", "resolution", "programs", "frameAllocations"].includes(section.key))
      .map((section) => section.owner);
    expect(owners).toEqual(["prd01", "prd01", "prd01", "prd01"]);
  });

  it("registers the C-38 output extension as the flag-gated prd01 factory", () => {
    const ext = appExtensionsAll().find((entry) => entry.id === "prd01.output");
    expect(ext).toBeDefined();
    expect(ext!.member).toBe("output");
    expect(ext!.flag).toBe("A3D_QR_CORE");
  });

  it("merges the lane's diagnostic-only fields into DIAGNOSTIC_ONLY_FIELDS", () => {
    for (const key of [
      "renderer.output",
      "renderer.resolution",
      "renderer.msaa",
      "renderer.compile",
      "renderer.strictMount",
      "renderer.debug",
      "primitive.tessellation",
      "material.blend",
      "material.depthWrite",
      "material.ior",
      "transform.rotationOrder",
      "transform.quaternion",
      "background.toneMapped"
    ]) {
      expect(DIAGNOSTIC_ONLY_FIELDS[key], `missing ${key}`).toBeDefined();
      expect(DIAGNOSTIC_ONLY_FIELDS[key]!.ownerPrd).toBe(1);
    }
  });

  it("ships six lane scene specs, one per PRD-01 §17.3 scene", () => {
    expect(Object.keys(PRD01_SCENE_SPECS).sort()).toEqual([
      "prd01-blend-modes",
      "prd01-draw-throughput",
      "prd01-primitive-catalog",
      "prd01-scene-graph-hierarchy",
      "prd01-specular-aa",
      "prd01-tonemap-exposure-ramp"
    ]);
    for (const spec of Object.values(PRD01_SCENE_SPECS)) {
      expect(spec.owner).toBe("prd01");
      expect(spec.referenceProfile).toBe("contract");
      expect(spec.qrFlags).toEqual(["core"]);
      expect(spec.masks.length).toBeGreaterThan(0);
      expect(spec.primaryCriterion.length).toBeGreaterThan(0);
    }
  });

  it("resolves ?a3d-qr=core to the multi-value flag", () => {
    const flags = resolveQrFlags({ url: "http://localhost/?a3d-qr=core" });
    expect(flags.on("A3D_QR_CORE")).toBe(true);
    expect(flags.on("A3D_QR_CORE_OUTPUT")).toBe(false);
    const all = resolveQrFlags({ url: "http://localhost/?a3d-qr=all" });
    expect(all.on("A3D_QR_CORE")).toBe(true);
    const none = resolveQrFlags({ url: "http://localhost/?a3d-qr=none" });
    expect(none.on("A3D_QR_CORE")).toBe(false);
  });
});
