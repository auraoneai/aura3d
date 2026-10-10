import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CREATE_AURA3D_TEMPLATES, TEMPLATE_ALIASES, createA3DProject, resolveTemplateAlias } from "create-aura3d";

describe("create-aura3d template aliases", () => {
  it("maps every old three-compat-* name to its §6.8 template", () => {
    expect(Object.keys(TEMPLATE_ALIASES)).toHaveLength(8);
    for (const [oldName, newName] of Object.entries(TEMPLATE_ALIASES)) {
      expect(oldName.startsWith("three-compat-")).toBe(true);
      expect(CREATE_AURA3D_TEMPLATES).toContain(newName);
      const resolved = resolveTemplateAlias(oldName);
      expect(resolved?.template).toBe(newName);
      expect(resolved?.deprecated).toBe(oldName);
    }
  });

  it("resolves canonical names without a deprecation", () => {
    const resolved = resolveTemplateAlias("large-scene");
    expect(resolved).toEqual({ template: "large-scene", deprecated: null });
    expect(resolveTemplateAlias("no-such-template")).toBeNull();
  });

  it("scaffolds large-scene files when given --template three-compat-large-scene", () => {
    const dir = mkdtempSync(join(tmpdir(), "a3d-alias-"));
    try {
      const targetDir = resolve(dir, "app");
      const resolved = resolveTemplateAlias("three-compat-large-scene");
      expect(resolved?.template).toBe("large-scene");
      const result = createA3DProject({ targetDir, template: resolved!.template });
      expect(result.template).toBe("large-scene");
      expect(existsSync(resolve(targetDir, "index.html"))).toBe(true);
      expect(existsSync(resolve(targetDir, "package.json"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
