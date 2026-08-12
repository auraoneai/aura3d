import { describe, expect, it } from "vitest";
import { AURA3D_2_SPECIFIER_MIGRATIONS, migrateAura3D2Source } from "../../../tools/migrate-2.0/index";

describe("Aura3D 2.0 import codemod", () => {
  it("rewrites every deprecated aggregate subpath without changing symbols", () => {
    const source = Object.keys(AURA3D_2_SPECIFIER_MIGRATIONS)
      .map((specifier, index) => `export * from ${index % 2 === 0 ? `"${specifier}"` : `'${specifier}'`};`)
      .join("\n");
    const result = migrateAura3D2Source(source);
    expect(result.replacements).toBe(5);
    for (const replacement of Object.values(AURA3D_2_SPECIFIER_MIGRATIONS)) expect(result.source).toContain(replacement);
    for (const deprecated of Object.keys(AURA3D_2_SPECIFIER_MIGRATIONS)) expect(result.source).not.toContain(`${deprecated}"`);
  });

  it("does not rewrite comments, prefixes, or unrelated package names", () => {
    const source = [
      "// @aura3d/engine/lean-product",
      'import x from "@aura3d/engine/lean-product/internal";',
      'import y from "@aura3d/engine";'
    ].join("\n");
    expect(migrateAura3D2Source(source)).toEqual({ source, replacements: 0 });
  });
});
