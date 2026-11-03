import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CREATE_AURA3D_TEMPLATES, resolveTemplateAlias } from "create-aura3d";

// The former ThreeCompat starters were renamed to their current names (Q-13-4 / #700) and no longer exist as
// `templates/three-compat-*` directories; create-aura3d keeps each retired name as a deprecation alias
// (packages/create-aura3d/src/index.ts TEMPLATE_ALIASES). Every retired name must still scaffold a shipped template.
const retiredThreeCompatTemplates = ["three-compat-premium-product-viewer","three-compat-architecture-interior","three-compat-material-authoring","three-compat-asset-inspector","three-compat-character-viewer","three-compat-postprocess-scene","three-compat-custom-threejs-migration","three-compat-large-scene"];

describe("ThreeCompat create-aura3d templates", () => {
  it("mirrors every ThreeCompat template", () => {
    for (const retired of retiredThreeCompatTemplates) {
      const resolved = resolveTemplateAlias(retired);
      expect(resolved, retired).not.toBeNull();
      expect(resolved!.deprecated).toBe(retired);
      expect(CREATE_AURA3D_TEMPLATES as readonly string[]).toContain(resolved!.template);
      expect(existsSync(resolve(`packages/create-aura3d/templates/${resolved!.template}/index.html`)), resolved!.template).toBe(true);
    }
  });
});
