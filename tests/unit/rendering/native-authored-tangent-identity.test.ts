/**
 * S5-WP04-01: when geometry carries a TANGENT attribute, the base normal map,
 * the clearcoat normal map and anisotropy shade in the authored frame
 * (T Gram-Schmidt against N, B = sign(w) * cross(N, T), negated on back faces)
 * in both generated backends; the UV-derivative frame is only the fallback.
 */
import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd03";
import "../../../packages/rendering/src/lanes/prd04";
import "../../../packages/rendering/src/lanes/prd06";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import type { ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { createGeneratedPbrProgram } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import {
  AUTHORED_TANGENT_GLSL, AUTHORED_TANGENT_WGSL, authoredMappedNormal, authoredTangentFrame, type Vec3
} from "../../../packages/rendering/src/materials/authoredTangent";

const flags: QrFlags = { values: {}, on: () => true };
const lights = { clustered: false, dir: 1, hemisphere: false, point: 0, rect: 0, spot: 0 } as const;
const shadows = { cascades: 0, contact: false, localShadows: 0, pcfTaps: 4 } as const;
const tangentFeatures = { "prd04.tangentFrame": true, "prd04.geometryTangent": true };
const coatNormal = { lobe: "clearcoat", maps: ["clearcoatNormal"], mapUvSets: { clearcoatNormal: 1 as const }, bits: { normalMap: true } };
const anisotropyMap = { lobe: "anisotropy", maps: ["anisotropy"], mapUvSets: { anisotropy: 0 as const }, bits: { map: true } };

function generate(overrides: Partial<ProgramFeatures> = {}) {
  const features = normalizeProgramFeatures({ lighting: "lit", environment: "none", lights, shadows,
    maps: {}, extensions: [], features: {}, ...overrides });
  const generated = generateProgramImpl(features, { flags });
  if (!generated.descriptor) throw new Error("generated descriptor missing");
  return { generated, program: createGeneratedPbrProgram(generated.descriptor) };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const close = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

describe("authored tangent frame reference", () => {
  it("equals the normalized, Gram-Schmidt authored tangent with B = sign(w) * cross(N, T)", () => {
    const n: Vec3 = [0, 0, 1];
    // Authored tangent is skewed off the tangent plane and not unit length.
    const frame = authoredTangentFrame(n, [2, 0, 0.5, 1]);
    close(frame.tangent, [1, 0, 0]);
    close(frame.bitangent, [0, 1, 0]);
    close(frame.normal, n);
    const mirrored = authoredTangentFrame(n, [2, 0, 0.5, -1]);
    close(mirrored.tangent, [1, 0, 0]);
    close(mirrored.bitangent, [0, -1, 0]);
    // Orthonormal and right-handed for w >= 0.
    const skewed = authoredTangentFrame([0.3, 0.4, 0.866], [0.9, -0.2, 0.1, 1]);
    expect(dot(skewed.tangent, skewed.normal)).toBeCloseTo(0, 6);
    expect(dot(skewed.tangent, skewed.tangent)).toBeCloseTo(1, 6);
    close(skewed.bitangent, cross(skewed.normal, skewed.tangent));
  });

  it("mirrored UVs (w = -1) flip the mapped green channel and back faces negate the mapped normal", () => {
    const texel: Vec3 = [0.3, 0.4, 0.866];
    const front = authoredMappedNormal(authoredTangentFrame([0, 0, 1], [1, 0, 0, 1]), texel, 1);
    const mirrored = authoredMappedNormal(authoredTangentFrame([0, 0, 1], [1, 0, 0, -1]), texel, 1);
    expect(front[1]).toBeGreaterThan(0);
    expect(mirrored[1]).toBeCloseTo(-front[1], 6);
    expect(mirrored[0]).toBeCloseTo(front[0], 6);
    // Back face: oriented normal is flipped toward the viewer, faceDirection -1.
    const back = authoredMappedNormal(authoredTangentFrame([0, 0, -1], [1, 0, 0, 1], -1), texel, 1);
    close(back, [-front[0], -front[1], -front[2]]);
    // Scale applies to the tangent-plane components only; degenerate tangent falls back orthogonally.
    const flat = authoredMappedNormal(authoredTangentFrame([0, 0, 1], [1, 0, 0, 1]), texel, 0);
    close(flat, [0, 0, 1]);
    const degenerate = authoredTangentFrame([0, 0, 1], [0, 0, 3, 1]);
    expect(dot(degenerate.tangent, degenerate.tangent)).toBeCloseTo(1, 6);
    expect(dot(degenerate.tangent, [0, 0, 1])).toBeCloseTo(0, 6);
  });

  it("ships the same construction to GLSL and WGSL", () => {
    for (const source of [AUTHORED_TANGENT_GLSL, AUTHORED_TANGENT_WGSL]) {
      expect(source).toContain("front = n * faceDirection");
      expect(source).toContain("tangent.xyz - front * dot(front, tangent.xyz)");
      expect(source).toMatch(/b = cross\(front, t\) \* (\(tangent\.w < 0\.0 \? -1\.0 : 1\.0\)|select\(1\.0, -1\.0, tangent\.w < 0\.0\))/);
      expect(source).toContain("(t * faceDirection, b * faceDirection, n)");
      expect(source).toContain("frame[0] * (texel.x * normalScale) + frame[1] * (texel.y * normalScale) + frame[2] * texel.z");
    }
  });
});

describe("generated WGSL uses the authored frame for every tangent-space map", () => {
  it("routes the tangent varying and applies the authored frame to normal, coat normal and anisotropy maps", () => {
    const { program } = generate({ maps: { normal: { uvSet: 0, transform: false } }, extensions: [coatNormal, anisotropyMap],
      features: tangentFeatures, doubleSided: true });
    const { vertex, fragment } = program;
    expect(vertex).toContain("@location(3) tangent: vec4f");
    expect(vertex).toContain("output.tangent = vec4f(normalize(tangentWorld), deformedTangent.w * select(1.0, -1.0, tangentDet < 0.0));");
    expect(fragment).toContain(AUTHORED_TANGENT_WGSL);
    expect(fragment).toContain("let authoredFrame = a3dAuthoredTangentFrame(geometryNormal, input.tangent, select(-1.0, 1.0, frontFacing));");
    expect(fragment).toContain("if (authoredTangentPresent) { n = a3dAuthoredMapNormal(authoredFrame, normalTexel, material.normalControls.y); }");
    expect(fragment).toContain("if (authoredTangentPresent) { coatNormal = a3dAuthoredMapNormal(authoredFrame, coatNormalTexel, material.coat.z); }");
    expect(fragment).toContain("if (authoredTangentPresent) { anTangent = authoredFrame[0]; anBitangent = authoredFrame[1]; }");
    // The anisotropy-UV derivative frame no longer overrides an authored tangent.
    expect(fragment).toContain("if (!authoredTangentPresent && abs(anUvDet) > 0.00000001) {");
  });

  it("carries the tangent varying for a normal map without anisotropy and keeps single-sided frames unflipped", () => {
    const { program } = generate({ maps: { normal: { uvSet: 1, transform: true } }, features: tangentFeatures });
    expect(program.vertex).toContain("@location(4) tangent: vec4f");
    expect(program.fragment).toContain("@location(4) tangent: vec4f");
    expect(program.fragment).toContain("let authoredFrame = a3dAuthoredTangentFrame(geometryNormal, input.tangent, 1.0);");
    // Without an authored tangent there is no varying and the derivative frame stays.
    const untangented = generate({ maps: { normal: { uvSet: 0, transform: false } } }).program;
    expect(untangented.fragment).not.toContain("a3dAuthoredTangentFrame");
    expect(untangented.fragment).not.toContain("@location(4) tangent");
    expect(untangented.fragment).toContain("let uvDeterminant = uvDx.x * uvDy.y - uvDx.y * uvDy.x;");
  });
});

describe("generated GLSL uses the authored frame for every tangent-space map", () => {
  it("applies the authored frame to the base normal map, clearcoat normal map and anisotropy", () => {
    const { generated } = generate({ maps: { normal: { uvSet: 0, transform: false } }, extensions: [coatNormal, anisotropyMap],
      features: tangentFeatures });
    const fragment = (generated as unknown as { fragment: string }).fragment;
    expect(fragment).toContain("bool a3dPrd04TangentAuthored = false;");
    expect(fragment).toContain("mat3 a3dAuthoredTangentFrame(vec3 orientedNormal, vec4 tangent, float faceDirection)");
    expect(fragment).toContain("N = a3dAuthoredMapNormal(a3dAuthoredTangentFrame(geometryNormal, v_prd04Tangent, a3dPrd04FaceDirection()), a3dNormalTexel, u_normalScale);");
    expect(fragment).toContain("mat3 a3dPrd04Tbn = a3dAuthoredTangentFrame( geometryNormal, v_prd04Tangent, a3dPrd04FaceDirection() );");
    expect(fragment).toContain("if ( !a3dPrd04TangentAuthored && abs( a3dAnDet ) > 1e-8 ) {");
    expect(fragment).toContain("if ( a3dPrd04TangentAuthored ) a3dCoatNormal = a3dAuthoredMapNormal( mat3( a3dPrd04TangentT, a3dPrd04TangentB, geometryNormal ), a3dCoatTexel, u_clearcoatNormalScale );");
    // Declarations precede main, and the authored override follows the derivative fallback.
    const main = fragment.indexOf("void main()");
    expect(fragment.indexOf("in vec4 v_prd04Tangent;")).toBeLessThan(main);
    expect(fragment.indexOf("vec3 N = a3dTangentNormal(")).toBeLessThan(fragment.indexOf("N = a3dAuthoredMapNormal("));
  });
});
