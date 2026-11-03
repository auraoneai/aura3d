import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { multiplyMat4, type Mat4 } from "@aura3d/scene";
import { registerBatchedDrawShader } from "../../../packages/engine/src/agent-api/nodes/batched";
import { normalMatrixFromModel } from "../../../packages/rendering/src/ForwardPass";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";

type Vec3 = readonly [number, number, number];
const direction = (matrix: Mat4, v: Vec3): Vec3 => [
  matrix[0] * v[0] + matrix[4] * v[1] + matrix[8] * v[2],
  matrix[1] * v[0] + matrix[5] * v[1] + matrix[9] * v[2],
  matrix[2] * v[0] + matrix[6] * v[1] + matrix[10] * v[2]
];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: Vec3): Vec3 => { const length = Math.hypot(...v); return [v[0] / length, v[1] / length, v[2] / length]; };

describe("staged combined draw normal transform", () => {
  it("feeds the selected row matrix to the generated normal calculation before it runs", () => {
    registerBatchedDrawShader();
    const flags = createTrustedQrFlags({ A3D_PARITY_BATCHING: true });
    const program = generateProgramImpl(normalizeProgramFeatures({
      pass: "forward", lighting: "lit", features: { "parity.batchDraw": "loop" }
    }), { flags });
    const rowAssignment = program.vertex.indexOf("instanceMatrix = a3dL5Model;");
    const normalCalculation = program.vertex.indexOf("v_normal = a3dWorldNormal(objectNormal, instanceMatrix);");
    expect(program.defines.A3D_L5_FORWARD).toBe(true);
    expect(rowAssignment).toBeGreaterThan(-1);
    expect(normalCalculation).toBeGreaterThan(rowAssignment);
    expect(program.vertex).toContain("mat3(instanceMatrix) * mat3(u_geometryMatrix)");
    expect(program.vertex).toContain("a3dWorld = a3dL5Model * a3dLocal;");
    expect(program.vertex).toContain("uniform highp int u_drawId;");

    if (spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0) {
      const dir = mkdtempSync(join(tmpdir(), "aura3d-combined-normal-"));
      try {
        const vertex = join(dir, "source.vert"), fragment = join(dir, "source.frag");
        writeFileSync(vertex, program.vertex); writeFileSync(fragment, program.fragment);
        const linked = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
        expect(linked).toContain("u_a3dDrawData");
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  });

  it("matches the normal of transformed surface tangents for rotation and nonuniform scale", () => {
    // This independent geometric oracle covers the positive-determinant
    // contract. Mirrored or singular transforms still require admission checks.
    const model: Mat4 = [0, 2, 0, 0, -3, 0, 0, 0, 0, 0, 4, 0, 5, 6, 7, 1];
    const geometry: Mat4 = [5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1];
    const world = multiplyMat4(model, geometry);
    const tangentA: Vec3 = [1, 1, 0], tangentB: Vec3 = [0, 1, 1];
    const objectNormal = cross(tangentA, tangentB);
    const geometric = unit(cross(direction(world, tangentA), direction(world, tangentB)));
    const inverseTranspose = unit(direction(normalMatrixFromModel(world), objectNormal));
    inverseTranspose.forEach((component, index) => expect(component).toBeCloseTo(geometric[index]!, 7));
  });
});
