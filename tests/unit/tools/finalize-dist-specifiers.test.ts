// 4.7.4 shipped `import("@aura3d/rendering/extension-scalar-atlas")` unrewritten inside @aura3d/engine: the specifier
// regex matched the string `"scalar-atlas import")` first and skipped the real import, so `vite build` of the
// hello-world template failed to resolve it. These pin the narrower pattern and the build guard.

import { describe, expect, it } from "vitest";
import { findBareWorkspaceImports, specifierPattern } from "../../../tools/finalize-dist/specifiers";

const source = [
  'markTextureStage(resource, "scalar-atlas import");',
  'const { createExtensionScalarAtlas } = await import("@aura3d/rendering/extension-scalar-atlas");',
  'import { x } from "@aura3d/math";',
  'import "./side-effect.js";'
].join("\n");

describe("finalize-dist specifiers", () => {
  it("finds the real dynamic import after a string that ends in the word import", () => {
    const specifiers = [...source.matchAll(specifierPattern())].map((m) => m[2]);
    expect(specifiers).toEqual(["@aura3d/rendering/extension-scalar-atlas", "@aura3d/math", "./side-effect.js"]);
  });

  it("the build guard reports bare workspace imports and allows the @aura3d/engine self-reference", () => {
    const names = new Set(["rendering", "math", "engine"]);
    expect(findBareWorkspaceImports(source, names)).toEqual([
      'import("@aura3d/rendering/extension-scalar-atlas"',
      'from "@aura3d/math"'
    ]);
    expect(findBareWorkspaceImports('export * from "@aura3d/engine/rendering";', names)).toEqual([]);
  });
});
