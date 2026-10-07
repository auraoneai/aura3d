import { describe, expect, it } from "vitest";
import { transformPostV2, postV2Codemod } from "../../../../tools/quality-rebuild/codemods/post-v2.mjs";

describe("post-v2 codemod (report mode)", () => {
  it("is registered-shaped (C-39 AuraCodemod)", () => {
    expect(postV2Codemod.name).toBe("post-v2");
    expect(postV2Codemod.owner).toBe("prd03");
    expect(typeof postV2Codemod.transform).toBe("function");
  });

  it("never rewrites source — code out equals code in", () => {
    const source = `const a = effects.bloom({ intensity: 0.5 });\neffects.antiAlias({ mode: "fxaa" });\n`;
    const { code } = transformPostV2(source, "scene.ts");
    expect(code).toBe(source);
  });

  it("detects effect builders with v2 mappings and correct lines", () => {
    const source = [
      `import { effects } from "@aura3d/engine";`,
      `effects.bloom({ intensity: 0.5 });`,
      `effects.ambientOcclusion({ radius: 1.2 });`,
      `effects.colorGrade({ contrast: 1.1, exposure: 1.3 });`
    ].join("\n");
    const { rows } = transformPostV2(source, "scene.ts");
    const bloom = rows.find((r) => r.construct === "effects.bloom");
    const ao = rows.find((r) => r.construct === "effects.ambientOcclusion");
    const grade = rows.find((r) => r.construct === "effects.colorGrade");
    expect(bloom).toMatchObject({ line: 2, mapping: "exact" });
    expect(ao).toMatchObject({ line: 3, mapping: "approximate" });
    expect(grade).toMatchObject({ line: 4, mapping: "approximate" });
  });

  it("flags constructs with no v2 path as 'none'", () => {
    const { rows } = transformPostV2(`new PostProcessPass({ name: "custom" })`, "legacy.ts");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ construct: "PostProcessPass", mapping: "none" });
    expect(rows[0]!.note).toBeTruthy();
  });

  it("reports renderer toneMapping fields as exact rows", () => {
    const { rows } = transformPostV2(`const opts = { toneMapping: "aces", toneMappingExposure: 1.4 };`, "r.ts");
    expect(rows.map((r) => r.construct)).toEqual(["renderer.toneMapping", "renderer.toneMappingExposure"]);
    expect(rows.every((r) => r.mapping === "exact")).toBe(true);
  });

  it("clean source reports zero rows", () => {
    const { rows } = transformPostV2(`const x = 1;\nfunction unrelated() { return x; }`, "plain.ts");
    expect(rows).toEqual([]);
  });
});
