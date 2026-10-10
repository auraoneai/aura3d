// PRD-13 Q-13-4 (#700) — `three-compat-*` create-aura3d templates take their
// §6.8 names; each retired name stays a one-minor deprecation alias.
// RENAMED grows by one row per rename PR (split N/M of #742).

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  CREATE_AURA3D_TEMPLATES,
  TEMPLATE_ALIASES,
  resolveTemplateAlias,
  templateAliasWarning
} from "../../../packages/create-aura3d/src/index";

const RENAMED: ReadonlyArray<readonly [retired: string, current: string]> = [
  ["three-compat-premium-product-viewer", "premium-product-viewer"],
  ["three-compat-architecture-interior", "architecture-interior"],
  ["three-compat-material-authoring", "material-authoring"],
  ["three-compat-asset-inspector", "asset-inspector"],
  ["three-compat-character-viewer", "character-viewer"],
  ["three-compat-postprocess-scene", "postprocess-scene"],
  ["three-compat-custom-threejs-migration", "custom-scene"]
];

describe("create-aura3d template aliases (Q-13-4)", () => {
  it("TEMPLATE_ALIASES holds exactly the renamed templates", () => {
    expect({ ...TEMPLATE_ALIASES }).toEqual(Object.fromEntries(RENAMED));
  });

  it.each(RENAMED)("%s resolves to %s with a deprecation warning", (retired, current) => {
    expect(CREATE_AURA3D_TEMPLATES).toContain(current);
    expect(CREATE_AURA3D_TEMPLATES).not.toContain(retired);
    const resolved = resolveTemplateAlias(retired);
    expect(resolved).toEqual({ template: current, deprecated: retired });
    expect(templateAliasWarning(resolved!)).toMatch(new RegExp(`${retired}.*renamed.*${current}`));
  });

  it.each(RENAMED)("%s → %s: packaged dir renamed, root mirror removed", (retired, current) => {
    expect(existsSync(resolve(`packages/create-aura3d/templates/${current}/index.html`))).toBe(true);
    expect(existsSync(resolve(`packages/create-aura3d/templates/${retired}`))).toBe(false);
    expect(existsSync(resolve(`templates/${retired}`))).toBe(false);
  });

  it("resolves current names without a warning and rejects unknown names", () => {
    const resolved = resolveTemplateAlias("product-viewer");
    expect(resolved).toEqual({ template: "product-viewer", deprecated: null });
    expect(templateAliasWarning(resolved!)).toBeNull();
    expect(resolveTemplateAlias("no-such-template")).toBeNull();
    expect(resolveTemplateAlias("toString")).toBeNull();
  });
});
