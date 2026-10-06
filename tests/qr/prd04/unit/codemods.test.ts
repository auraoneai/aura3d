/**
 * prd04 codemods (PRD-04 §10.2/§10.6, P1-11/P1-12): `pin-emissive-defaults`
 * rewrites and `prd04-model-tint-report` census, plus their C-39 registration
 * under owner prd04.
 */
import { describe, expect, it } from "vitest";
// @ts-ignore: .mjs codemod impl resolved by vitest/node at runtime.
import { transform as pinEmissive } from "../../../../tools/codemods/pin-emissive-defaults.mjs";
import { transform as tintReport } from "../../../../packages/aura3d-cli/src/commands/prd04/modelTintReport";
import { codemodFor } from "../../../../packages/aura3d-cli/src/contracts/commands";
import "../../../../packages/aura3d-cli/src/commands/prd04/index";

describe("pin-emissive-defaults codemod", () => {
  it("adds emissiveIntensity 1.35 to material.emissive({...}) calls missing it", () => {
    const source = `material.emissive({ color: "#ff2200" });\nmaterial.emissive({ color: "#00ff00", emissiveIntensity: 3 });\n`;
    const { code, rows } = pinEmissive(source, "app/src/main.ts");
    expect(code).toContain(`emissiveIntensity: 1.35`);
    expect(code).toContain(`emissiveIntensity: 3`);
    expect(rows).toHaveLength(1);
    expect(rows[0].line).toBe(1);
    expect(rows[0].mapping).toBe("exact");
  });

  it("adds emissiveIntensity 2.8 to material.neon({...}) calls", () => {
    const { code, rows } = pinEmissive(`material.neon({ color: "#0ff" });`, "x.ts");
    expect(code).toContain(`emissiveIntensity: 2.8`);
    expect(rows).toHaveLength(1);
  });

  it("pins object literals with emissive but no emissiveIntensity", () => {
    const source = `const spec = { emissive: "#aa00ff", roughness: 0.4 };`;
    const { code, rows } = pinEmissive(source, "x.ts");
    expect(code).toContain(`emissiveIntensity: 1.35`);
    expect(rows).toHaveLength(1);
    expect(rows[0].mapping).toBe("approximate");
  });

  it("is a no-op when nothing needs pinning", () => {
    const source = `const spec = { emissive: "#fff", emissiveIntensity: 2 };\nmaterial.metal({});\n`;
    const { code, rows } = pinEmissive(source, "x.ts");
    expect(code).toBe(source);
    expect(rows).toHaveLength(0);
  });
});

describe("prd04-model-tint-report codemod", () => {
  it("reports model() calls with a material option, source unchanged", () => {
    const source = [
      `const painted = { color: "#e85d75", roughness: 0.5 };`,
      `model(assets.courierVan, { material: painted });`,
      `model(assets.hero, { material: { color: "#fff" } });`,
      `model(assets.plain, {});`
    ].join("\n");
    const { code, rows } = tintReport(source, "apps/x/src/main.ts");
    expect(code).toBe(source);
    expect(rows).toHaveLength(2);
    expect(rows[0].file).toBe("apps/x/src/main.ts");
    expect(rows[0].line).toBe(2);
    expect(rows[0].note).toContain("followed=identifier painted");
    expect(rows[0].note).toContain("color=true");
    expect(rows[1].line).toBe(3);
    expect(rows[0].mapping).toBe("none");
  });

  it("flags emissive in the material props", () => {
    const { rows } = tintReport(
      `model(assets.x, { material: { emissive: "#f00", emissiveIntensity: 1 } });`,
      "x.ts"
    );
    expect(rows[0].note).toContain("emissive=true");
    expect(rows[0].note).toContain("emissiveIntensity");
  });
});

describe("C-39 registration", () => {
  it("registers both prd04 codemods with owner prd04", () => {
    const pin = codemodFor("pin-emissive-defaults");
    const report = codemodFor("prd04-model-tint-report");
    expect(pin?.owner).toBe("prd04");
    expect(report?.owner).toBe("prd04");
  });
});
