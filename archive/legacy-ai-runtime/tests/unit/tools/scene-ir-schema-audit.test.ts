import { describe, expect, it } from "vitest";
import { createSceneIRSchemaAuditReport } from "../../../tools/scene-ir-schema-audit/index";

describe("scene ir schema audit report", () => {
  it("validates the deterministic mock AuraSceneIR fixture", async () => {
    const report = await createSceneIRSchemaAuditReport();
    expect(report.schema).toBe("a3d-scene-ir-schema-audit");
    expect(report.providerMode).toBe("mock");
    expect(report.networkUsed).toBe(false);
    expect(report.pass).toBe(true);
    expect(report.validation.ok).toBe(true);
    expect(report.evidence.every((entry) => entry.present)).toBe(true);
  });
});
