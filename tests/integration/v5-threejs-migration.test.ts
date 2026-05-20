import { describe, expect, it } from "vitest";
import { migrateThreeToG3D } from "../../packages/three-compat/src";

describe("V5 migrated Three.js example integration", () => {
  it("produces code that targets G3D compat imports", () => {
    const result = migrateThreeToG3D('import * as THREE from "three"; const renderer = new THREE.WebGLRenderer(); renderer.setSize(1, 1);');
    expect(result.code).toContain('from "@galileo3d/three-compat"');
    expect(result.code).toContain("createRendererV5");
    expect(result.code).toContain("renderer.resize");
  });
});
