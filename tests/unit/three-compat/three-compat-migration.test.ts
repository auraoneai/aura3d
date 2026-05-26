import { describe, expect, it } from "vitest";
import { V5_THREE_IMPORT_MAP, migrateThreeToA3D } from "../../../packages/three-compat/src";

describe("V5 Three.js migration", () => {
  it("rewrites core, controls, loaders, postprocessing, and renderer boilerplate", () => {
    const source = `
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
const renderer = new THREE.WebGLRenderer();
renderer.setSize(800, 600);
`;
    const result = migrateThreeToA3D(source);
    expect(V5_THREE_IMPORT_MAP.three).toBe("@aura3d/three-compat");
    expect(result.rewrittenImports).toBeGreaterThanOrEqual(4);
    expect(result.code).toContain("@aura3d/three-compat");
    expect(result.code).toContain("@aura3d/three-compat/controls");
    expect(result.code).toContain("@aura3d/three-compat/loaders");
    expect(result.code).toContain("@aura3d/three-compat/postprocessing");
    expect(result.code).toContain("createRendererV5");
    expect(result.code).toContain("renderer.resize");
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(["renderer-adapter", "controls-adapter", "loader-adapter"]));
  });
});
