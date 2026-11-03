import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { BEAM_FRAGMENT, BEAM_VERTEX, DEFAULT_LAMPS, beamGeometry, beamSpec, cylinderSide } from "../../../examples/drift-and-deliver-port/headlights";

const expectVector = (values: ArrayLike<number>, index: number, expected: readonly number[], digits = 6): void => {
  for (let component = 0; component < expected.length; component++) {
    expect(values[index * expected.length + component]).toBeCloseTo(expected[component]!, digits);
  }
};

describe("beam geometry", () => {
  it("generates the open conical wall with the expected corners, normals, UVs and topology", () => {
    const g = cylinderSide(3.2, 0.55, 27, 20, 1);
    expect(g.positions.length).toBe(42 * 3);
    expect(g.normals.length).toBe(42 * 3);
    expect(g.uvs.length).toBe(42 * 2);
    expect(g.indices.length).toBe(20 * 6);

    // Quarter-turns and the duplicated seam pin down the circular cross-section.
    for (const [index, x, y, z, u, v] of [
      [0, 0, 13.5, 3.2, 0, 1], [5, 3.2, 13.5, 0, 0.25, 1],
      [10, 0, 13.5, -3.2, 0.5, 1], [15, -3.2, 13.5, 0, 0.75, 1],
      [20, 0, 13.5, 3.2, 1, 1], [21, 0, -13.5, 0.55, 0, 0],
      [26, 0.55, -13.5, 0, 0.25, 0], [41, 0, -13.5, 0.55, 1, 0]
    ]) {
      expectVector(g.positions, index!, [x!, y!, z!]);
      expectVector(g.uvs, index!, [u!, v!]);
    }

    // The unit normal is perpendicular to the taper's longitudinal tangent.
    const taper = (0.55 - 3.2) / 27;
    const normalScale = Math.hypot(1, taper);
    expectVector(g.normals, 0, [0, taper / normalScale, 1 / normalScale]);
    expectVector(g.normals, 5, [1 / normalScale, taper / normalScale, 0]);
    for (let segment = 0; segment < 20; segment++) {
      const top = segment, bottom = segment + 21;
      expect(Array.from(g.indices.slice(segment * 6, segment * 6 + 6))).toEqual([
        top, bottom, top + 1, bottom, bottom + 1, top + 1
      ]);
    }
  });

  it("places both beams around their lamps and retains surface normals under pitch and squash", () => {
    for (const lamps of [DEFAULT_LAMPS, { halfSpread: 2, y: 1.5, z: 3, tilt: 0.23 }]) {
      const g = beamGeometry(lamps);
      const verticesPerBeam = 20 * 6;
      expect(g.positions.length).toBe(verticesPerBeam * 2 * 3);
      expect(g.normals.length).toBe(g.positions.length);
      expect(g.uvs.length).toBe(verticesPerBeam * 2 * 2);
      expect(Array.from(g.indices)).toEqual(Array.from({ length: verticesPerBeam * 2 }, (_, i) => i));

      for (let i = 0; i < verticesPerBeam * 2; i++) {
        const lampX = i < verticesPerBeam ? -lamps.halfSpread : lamps.halfSpread;
        const u = g.uvs[i * 2]!;
        const along = g.uvs[i * 2 + 1]!;
        const theta = 2 * Math.PI * u;
        const radius = 0.55 + 2.65 * along;
        const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
        const sinTilt = Math.sin(lamps.tilt), cosTilt = Math.cos(lamps.tilt);

        // In the unsquashed cone, the axis is 27 units long and the radius
        // grows linearly from 0.55 at the lamp to 3.2 at the far end.
        expectVector(g.positions, i, [
          lampX + radius * sinTheta,
          lamps.y - 0.55 * (27 * along * sinTilt + radius * cosTheta * cosTilt),
          lamps.z + 27 * along * cosTilt - radius * cosTheta * sinTilt
        ], 4);

        const nx = g.normals[i * 3]!, ny = g.normals[i * 3 + 1]!, nz = g.normals[i * 3 + 2]!;
        expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6);
        // A correct inverse-transpose normal is perpendicular to both the
        // circular and longitudinal tangents of the squashed cone surface.
        const around = nx * cosTheta + ny * 0.55 * sinTheta * cosTilt + nz * sinTheta * sinTilt;
        const forward = nx * 2.65 * sinTheta
          - ny * 0.55 * (27 * sinTilt + 2.65 * cosTheta * cosTilt)
          + nz * (27 * cosTilt - 2.65 * cosTheta * sinTilt);
        expect(around).toBeCloseTo(0, 5);
        expect(forward).toBeCloseTo(0, 5);
        expect(nx * sinTheta - ny * cosTheta * cosTilt / 0.55 - nz * cosTheta * sinTilt).toBeGreaterThan(0);
      }
    }
  });

  it("puts the narrow end at each lamp for a level beam", () => {
    const g = beamGeometry({ halfSpread: 2, y: 1.5, z: 3, tilt: 0 });
    expectVector(g.positions, 0, [-2, -0.26, 30]);
    expectVector(g.positions, 1, [-2, 1.1975, 3]);
    expectVector(g.positions, 120, [2, -0.26, 30]);
    expectVector(g.positions, 121, [2, 1.1975, 3]);
    expectVector(g.uvs, 0, [0, 1]);
    expectVector(g.uvs, 1, [0, 0]);
  });

  it("the cones sit at the car's lamps, narrow end first, and run forward", () => {
    const g = beamGeometry();
    let minZ = Infinity, maxZ = -Infinity, minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < g.positions.length; i += 3) {
      minX = Math.min(minX, g.positions[i]!);
      maxX = Math.max(maxX, g.positions[i]!);
      minZ = Math.min(minZ, g.positions[i + 2]!);
      maxZ = Math.max(maxZ, g.positions[i + 2]!);
    }
    expect(minZ).toBeLessThan(DEFAULT_LAMPS.z + 0.1);
    expect(maxZ).toBeGreaterThan(DEFAULT_LAMPS.z + 20);
    expect(minX).toBeLessThan(-DEFAULT_LAMPS.halfSpread);
    expect(maxX).toBeGreaterThan(DEFAULT_LAMPS.halfSpread);
  });
});

describe("beam shaders", () => {
  const baked = () => createCustomShaderMaterial(beamSpec(), "drift-beam");

  it("keeps the distance and view-angle fade terms", () => {
    expect(BEAM_FRAGMENT).toContain("pow(max(1.0 - facing, 0.0), 1.6)");
    expect(BEAM_FRAGMENT).toContain("pow(clamp(1.0 - vT, 0.0, 1.0), 1.25) * smoothstep(0.0, 0.07, vT)");
    expect(BEAM_FRAGMENT).toContain("smoothstep(beamNear, beamNear * 2.3, d)");
    expect(BEAM_VERTEX).toContain("mat3(modelMatrix) * normal");
  });

  it("bake under #version 300 es with every authored uniform declared once", () => {
    const m = baked();
    try {
      const { vertex, fragment } = m.sources.glsl;
      expect(vertex.startsWith("#version 300 es")).toBe(true);
      expect(fragment.startsWith("#version 300 es")).toBe(true);
      for (const [stage, source] of [["vertex", vertex], ["fragment", fragment]] as const) {
        const declared = [...source.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*(?:\[\d+\])?\s*;/gm)].map((x) => x[1]!);
        expect(new Set(declared).size, `${stage}: ${declared.join(", ")}`).toBe(declared.length);
      }
    } finally {
      m.dispose();
    }
  });

  it("is additive, transparent and does not write depth", () => {
    const spec = beamSpec();
    expect(spec.blending).toBe("additive");
    expect(spec.transparent).toBe(true);
    expect(spec.depthWrite).toBe(false);
  });

  const available = spawnSync("glslangValidator", ["--version"]).status === 0;
  it.skipIf(!available)("compiles and links with the reference GLSL compiler", () => {
    const m = baked();
    const dir = mkdtempSync(join(tmpdir(), "drift-glsl-"));
    try {
      writeFileSync(join(dir, "p.vert"), m.sources.glsl.vertex);
      writeFileSync(join(dir, "p.frag"), m.sources.glsl.fragment);
      const r = spawnSync("glslangValidator", [join(dir, "p.vert"), join(dir, "p.frag")], { encoding: "utf8" });
      expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    } finally {
      m.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("beam shader is NaN-safe (pow of a negative base is NaN on real GPUs)", () => {
  it("never raises a possibly-negative value to a fractional power and always writes a finite alpha", () => {
    const code = BEAM_FRAGMENT.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    const powCalls = [...code.matchAll(/pow\(([^;]*?),\s*[0-9.]+\)/g)].map((m) => m[1]!);
    expect(powCalls.length).toBeGreaterThan(0);
    for (const base of powCalls) expect(base, base).toMatch(/^(max\(|clamp\()/);
    expect(BEAM_FRAGMENT).toContain("(a == a) ? clamp(a, 0.0, 1.0) : 0.0");
  });
});
