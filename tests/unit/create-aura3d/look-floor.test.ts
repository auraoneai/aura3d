// PRD-13 T3.13 — static look-floor gate coverage.
import { describe, expect, it } from "vitest";
import { CREATE_AURA3D_TEMPLATES } from "../../../packages/create-aura3d/src/index";
import { lookFloorStaticFindings, lookFloorStaticScan, TEMPLATE_LOOK_FLOOR } from "../../../tools/agent-templates/look-floor.mjs";

describe("tools/agent-templates/look-floor", () => {
  it("every create-aura3d template has a §6.4 floor row", () => {
    for (const template of CREATE_AURA3D_TEMPLATES) {
      expect(TEMPLATE_LOOK_FLOOR[template as keyof typeof TEMPLATE_LOOK_FLOOR], `${template} missing`).toBeDefined();
    }
    expect(Object.keys(TEMPLATE_LOOK_FLOOR)).toHaveLength(CREATE_AURA3D_TEMPLATES.length);
  });

  it("static scan is clean on the repo's templates", () => {
    expect(lookFloorStaticScan()).toEqual([]);
  });

  it("flags a template that drops its look preset", () => {
    // Simulate by checking a template name not on disk — findings must name it.
    const findings = lookFloorStaticFindings("not-a-template");
    expect(findings.length).toBe(1);
    expect(findings[0]).toContain("no §6.4 look-floor row");
  });

  it("bans lights.ambient() in look-floored mains", () => {
    // Every preset-anchored template's main.ts must be free of lights.ambient().
    for (const [template, entry] of Object.entries(TEMPLATE_LOOK_FLOOR)) {
      if ((entry as { anchor: string }).anchor !== "preset") continue;
      const findings = lookFloorStaticFindings(template);
      expect(findings.filter((f) => f.includes("lights.ambient")), `${template} ambient leak`).toEqual([]);
    }
  });
});
