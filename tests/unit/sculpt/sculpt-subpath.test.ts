import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { material } from "@aura3d/engine";
import * as sculpt from "@aura3d/engine/sculpt";
import {
  assembleMultiMaterialNode,
  latheMesh,
  mergeRawMeshes,
  paintMeshColors,
  sculptOrganicSdfMesh,
  sculptPaintedLimbChain,
  sdfTaperedCapsule,
  sminPoly,
  tubeSweepMesh,
  type RawMesh,
  type SdfLimbChain
} from "@aura3d/engine/sculpt";
import * as kernelShim from "../../../apps/showcase-port-shared/proceduralKernel";
import * as limbsShim from "../../../apps/showcase-port-shared/sdfLimbs";

const REPO_ROOT = resolve(__dirname, "../../..");

function assertValidMesh(mesh: RawMesh, label: string): void {
  const vCount = mesh.positions.length / 3;
  expect(vCount, `${label} vertices`).toBeGreaterThan(0);
  expect(mesh.normals.length, `${label} normals`).toBe(mesh.positions.length);
  expect(mesh.uvs.length, `${label} uvs`).toBe(vCount * 2);
  expect(mesh.indices.length % 3, `${label} triangles`).toBe(0);
  expect(mesh.positions.every(Number.isFinite), `${label} finite positions`).toBe(true);
  expect(mesh.indices.every((i) => i >= 0 && i < vCount), `${label} index bounds`).toBe(true);
}

describe("@aura3d/engine/sculpt public subpath", () => {
  it("is declared in the published package exports", () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as { exports: Record<string, unknown> };
    expect(pkg.exports["./sculpt"]).toEqual({
      types: "./dist/engine/public/sculpt.d.ts",
      browser: "./dist/engine/public/sculpt.js",
      import: "./dist/engine/public/sculpt.js",
      default: "./dist/engine/public/sculpt.js"
    });
  });

  it("exports the kernel and SDF limb API, and the showcase shims re-export the same bindings", () => {
    for (const name of ["latheMesh", "tubeSweepMesh", "sculptOrganicSdfMesh", "mergeRawMeshes", "assembleMultiMaterialNode", "sculptSdfLimbChainMesh", "sculptPaintedLimbChain"]) {
      expect(typeof (sculpt as Record<string, unknown>)[name], name).toBe("function");
    }
    for (const [name, value] of Object.entries(kernelShim)) {
      expect((sculpt as Record<string, unknown>)[name], `proceduralKernel shim: ${name}`).toBe(value);
    }
    for (const [name, value] of Object.entries(limbsShim)) {
      expect((sculpt as Record<string, unknown>)[name], `sdfLimbs shim: ${name}`).toBe(value);
    }
  });

  it("builds lathe, swept, and implicit-SDF meshes and merges them into a bounded geometry spec", () => {
    const vase = latheMesh([[0, 0], [0.3, 0.05], [0.22, 0.6], [0.28, 0.9], [0, 1]], 18);
    assertValidMesh(vase, "latheMesh");
    const tube = tubeSweepMesh([[0, 0, 0, 0.1], [0.2, 0.5, 0, 0.08], [0.4, 1, 0.1, 0.04]], 10);
    assertValidMesh(tube, "tubeSweepMesh");
    const blob = sculptOrganicSdfMesh({
      boundsMin: [-0.6, -0.4, -0.4],
      boundsMax: [0.6, 0.4, 0.4],
      resolution: 20,
      evaluate: (x, y, z) =>
        sminPoly(
          sdfTaperedCapsule([x, y, z], [-0.3, 0, 0], [0.3, 0, 0], 0.2, 0.12),
          Math.hypot(x, y - 0.15, z) - 0.15,
          0.08
        )
    });
    assertValidMesh(blob, "sculptOrganicSdfMesh");
    expect(blob.analyticNormals).toBe(true);

    const spec = mergeRawMeshes([vase, tube, paintMeshColors(blob, "#c08040")]);
    expect(spec.kind).toBe("aura-custom-geometry");
    expect(spec.bounds).toBeDefined();
  });

  it("sculpts a painted SDF limb chain and assembles a multi-material node", () => {
    const arm: SdfLimbChain = {
      capsules: [
        { a: [0, 1.4, 0], b: [0.05, 1.12, 0.02], ra: 0.07, rb: 0.055, tag: 0 },
        { a: [0.05, 1.12, 0.02], b: [0.08, 0.86, 0.08], ra: 0.055, rb: 0.042, tag: 1 }
      ],
      hands: [{ wrist: [0.08, 0.86, 0.08], dir: [0.1, -1, 0.2], palm: [-1, 0, 0], radius: 0.042, thumbSide: 1, tag: 2 }],
      blend: 0.03,
      cell: 0.02
    };
    const limb = sculptPaintedLimbChain(arm, { 0: "#3060a0", 1: "#d8a080", 2: "#d8a080" });
    assertValidMesh(limb, "sculptPaintedLimbChain");
    expect(limb.colors?.length).toBe((limb.positions.length / 3) * 4);

    const node = assembleMultiMaterialNode(
      "sculpt-subpath-test",
      [{ mesh: limb, materialIndex: 0 }, { mesh: latheMesh([[0, 0], [0.1, 0.1], [0, 0.2]], 8), materialIndex: 1 }],
      [material.pbr({ color: "#ffffff", roughness: 0.6 }), material.pbr({ color: "#808080", roughness: 0.4 })],
      { id: "sculpt-subpath-test", position: [0, 0, 0] }
    );
    expect(node).toBeDefined();
  });
});
