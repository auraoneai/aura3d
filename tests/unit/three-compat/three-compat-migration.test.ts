import { describe, expect, it } from "vitest";
import {
  THREE_COMPAT_THREE_IMPORT_MAP,
  THREE_COMPAT_UNSUPPORTED_THREE_IMPORTS,
  migrateThreeToA3D
} from "../../../packages/three-compat/src";

/**
 * This suite previously asserted `result.code).toContain("@aura3d/three-compat/postprocessing")` — that the
 * codemod rewrites Three.js `EffectComposer` imports onto a `./postprocessing` subpath. WS-3.4 deleted the
 * tree that subpath built from, so the assertion was pinning a rewrite onto a published export that resolves
 * to nothing. R2 forbids weakening a test to make code pass; it does not require preserving an assertion whose
 * subject is a defect. The expectation is inverted here because the old contract was wrong, not because the
 * new code cannot meet it.
 */
describe("ThreeCompat Three.js migration", () => {
  it("rewrites core, controls, loaders, and renderer boilerplate", () => {
    const source = `
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
const renderer = new THREE.WebGLRenderer();
renderer.setSize(800, 600);
`;
    const result = migrateThreeToA3D(source);
    expect(THREE_COMPAT_THREE_IMPORT_MAP.three).toBe("@aura3d/three-compat");
    expect(result.rewrittenImports).toBeGreaterThanOrEqual(3);
    expect(result.code).toContain("@aura3d/three-compat");
    expect(result.code).toContain("@aura3d/three-compat/controls");
    expect(result.code).toContain("@aura3d/three-compat/loaders");
    expect(result.code).toContain("createThreeCompatRenderer");
    expect(result.code).toContain("renderer.resize");
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["renderer-adapter", "controls-adapter", "loader-adapter"])
    );
  });

  it("never rewrites an import onto a subpath the package does not export", () => {
    const exported = new Set<string>([
      "@aura3d/three-compat",
      "@aura3d/three-compat/controls",
      "@aura3d/three-compat/loaders",
      "@aura3d/three-compat/animation",
      "@aura3d/three-compat/migration"
    ]);
    for (const target of Object.values(THREE_COMPAT_THREE_IMPORT_MAP)) {
      expect(exported.has(target)).toBe(true);
    }
  });

  it("leaves postprocessing imports untouched and reports them as unsupported", () => {
    const source = `
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
`;
    const result = migrateThreeToA3D(source);

    // The specifiers survive verbatim, so the developer gets a compile error at the import site rather than a
    // silent behavioural change from a CPU pixel pass standing in for a GPU composer.
    expect(result.code).toContain("three/examples/jsm/postprocessing/EffectComposer.js");
    expect(result.code).toContain("three/examples/jsm/postprocessing/UnrealBloomPass.js");
    expect(result.code).not.toContain("@aura3d/three-compat/postprocessing");

    const unsupported = result.warnings.find((warning) => warning.code === "postprocessing-unsupported");
    expect(unsupported).toBeDefined();
    expect(unsupported?.message).toContain("EffectComposer.js");
    expect(unsupported?.message).toContain("UnrealBloomPass.js");
    expect(unsupported?.message).toContain("effects.bloom()");
  });

  it("declares both addons/ and examples/jsm/ spellings of every unsupported specifier", () => {
    for (const specifier of THREE_COMPAT_UNSUPPORTED_THREE_IMPORTS) {
      const counterpart = specifier.includes("/addons/")
        ? specifier.replace("/addons/", "/examples/jsm/")
        : specifier.replace("/examples/jsm/", "/addons/");
      expect(THREE_COMPAT_UNSUPPORTED_THREE_IMPORTS).toContain(counterpart);
    }
  });
});
