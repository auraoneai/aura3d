import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { BEAM_FRAGMENT, BEAM_VERTEX, DEFAULT_LAMPS, beamGeometry, beamSpec, cylinderSide } from "../../../examples/drift-and-deliver-port/headlights";

/**
 * The headlight beam is the original's only ShaderMaterial. Its geometry is built from three's own cylinder,
 * moved with the original's matrix steps, so the port's generator is checked against three itself.
 */
const arr = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): ArrayLike<number> => a.array as ArrayLike<number>;
const maxDelta = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs((a[i] as number) - (b[i] as number)));
  return m;
};

describe("beam geometry equals three's", () => {
  it("the open cone wall: same vertices, normals, uvs and indices as CylinderGeometry(3.2, 0.55, 27, 20, 1, true)", () => {
    const ref = new THREE.CylinderGeometry(3.2, 0.55, 27, 20, 1, true);
    const mine = cylinderSide(3.2, 0.55, 27, 20, 1);
    expect(mine.positions.length).toBe(ref.attributes.position.array.length);
    expect(maxDelta(mine.positions, arr(ref.attributes.position))).toBeLessThan(1e-5);
    expect(maxDelta(mine.normals, arr(ref.attributes.normal))).toBeLessThan(1e-6);
    expect(maxDelta(mine.uvs, arr(ref.attributes.uv))).toBeLessThan(1e-7);
    expect(Array.from(mine.indices)).toEqual(Array.from(ref.index!.array));
  });

  it("both merged, moved beams equal the original's translate / rotateX / scale / translate pipeline", () => {
    const make = (x: number): THREE.BufferGeometry => {
      const g = new THREE.CylinderGeometry(3.2, 0.55, 27, 20, 1, true);
      g.translate(0, 13.5, 0);
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2 + DEFAULT_LAMPS.tilt));
      g.applyMatrix4(new THREE.Matrix4().makeScale(1, 0.55, 1));
      g.translate(x, DEFAULT_LAMPS.y, DEFAULT_LAMPS.z);
      return g.toNonIndexed();
    };
    const a = make(-DEFAULT_LAMPS.halfSpread);
    const b = make(DEFAULT_LAMPS.halfSpread);
    const mine = beamGeometry();
    const refPos = [...Array.from(arr(a.attributes.position)), ...Array.from(arr(b.attributes.position))];
    const refNormal = [...Array.from(arr(a.attributes.normal)), ...Array.from(arr(b.attributes.normal))];
    expect(mine.positions.length).toBe(refPos.length);
    expect(maxDelta(mine.positions, refPos)).toBeLessThan(1e-4);
    expect(maxDelta(mine.normals, refNormal)).toBeLessThan(1e-5);
    expect(mine.indices.length).toBe(mine.positions.length / 3);
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

describe("beam shaders (ported from the original)", () => {
  const baked = () => createCustomShaderMaterial(beamSpec(), "drift-beam");

  it("keep the original's fade terms", () => {
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
