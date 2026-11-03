/**
 * dfg-lut.ts — the split-sum DFG table read by the CPU BSDF oracle, decoded to
 * float32: 16x16 RG texels (A = F0 scale, B = F90 bias), row index = N·X
 * coordinate, column = perceptual roughness, texel centres.
 *
 * The values are Aura3D's own numerical integration of the split-sum term
 * (isotropic GGX NDF with alpha = roughness², height-correlated Smith
 * visibility, Schlick's (1 - V·H)^5 Fresnel weight; Karis 2013, Heitz 2014),
 * produced deterministically by `generateDfgLut()` in
 * packages/rendering/src/program/DFGLutData.ts — the same binary16 table the
 * renderer binds (tests/unit/rendering/native-lighting-luts.test.ts checks
 * that the baked table equals the generator). No other engine's data is used.
 */
import { DFG_LUT_RG16F, DFG_LUT_SIZE as NATIVE_SIZE } from "../../../../packages/rendering/src/program/DFGLutData";
import { decodeNativeDfgFloat16 } from "./native-dfg-lut";

export const DFG_LUT_SIZE = NATIVE_SIZE;
export const DFG_LUT = Float32Array.from(DFG_LUT_RG16F, (bits) => decodeNativeDfgFloat16(bits));
