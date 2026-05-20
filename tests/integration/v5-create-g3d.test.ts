import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const templates = ["v5-premium-product-viewer","v5-architecture-interior","v5-material-authoring","v5-asset-inspector","v5-character-viewer","v5-postprocess-scene","v5-custom-threejs-migration","v5-large-scene"];

describe("V5 create-g3d templates", () => {
  it("mirrors every V5 template", () => {
    expect(templates.every((template) => existsSync(resolve(`templates/${template}/index.html`)) && existsSync(resolve(`packages/create-g3d/templates/${template}/index.html`)))).toBe(true);
  });
});
