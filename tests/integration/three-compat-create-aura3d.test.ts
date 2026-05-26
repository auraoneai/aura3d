import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const templates = ["three-compat-premium-product-viewer","three-compat-architecture-interior","three-compat-material-authoring","three-compat-asset-inspector","three-compat-character-viewer","three-compat-postprocess-scene","three-compat-custom-threejs-migration","three-compat-large-scene"];

describe("V5 create-aura3d templates", () => {
  it("mirrors every V5 template", () => {
    expect(templates.every((template) => existsSync(resolve(`templates/${template}/index.html`)) && existsSync(resolve(`packages/create-aura3d/templates/${template}/index.html`)))).toBe(true);
  });
});
