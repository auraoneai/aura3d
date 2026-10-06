/**
 * C-06 — scene graph transforms and color parsing (CONTRACTS.md). Provider: PRD 01.
 * Implementations are PRD 01's new files `agent-api/sceneGraph.ts` and
 * `agent-api/color.ts`; the PR 0a stubs delegate to today's math.
 */

import type { AuraVec3, AuraTransformSpec, AuraColor } from "../agent-api/index";
import { srgbToLinearChannel } from "@aura3d/rendering";

export type AuraEulerOrder = "XYZ" | "XZY" | "YXZ" | "YZX" | "ZXY" | "ZYX";
export type AuraQuat = readonly [number, number, number, number];         // shared with C-22 (PRD 08 "first public quaternion type")
export interface AuraWorldTransform { readonly matrix: Float32Array; readonly position: AuraVec3; readonly quaternion: AuraQuat; readonly scale: AuraVec3; readonly sheared: boolean; }

/**
 * PR 0a stub: composes parent * local with ZYX order via the same math as
 * `eulerToQuat` (index.ts:5345); `rotationOrder` and `quaternion` are ignored
 * (listed in DIAGNOSTIC_ONLY_FIELDS, ownerPrd 1).
 */
export function composeWorldMatrix(parent: Float32Array, local: AuraTransformSpec, out: Float32Array): Float32Array {
  const [px, py, pz] = local.position ?? [0, 0, 0];
  const q = eulerToQuaternion(local.rotation ?? [0, 0, 0], "ZYX");
  const s = local.scale === undefined ? [1, 1, 1] : typeof local.scale === "number" ? [local.scale, local.scale, local.scale] : local.scale;
  const localM = composeTRS(px, py, pz, q, s as AuraVec3);
  multiplyMat4Into(out, parent, localM);
  return out;
}

export function decomposeMatrix(m: Float32Array): AuraWorldTransform {
  const sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]);
  const sz = Math.hypot(m[8], m[9], m[10]);
  const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
  const sign = det < 0 ? -1 : 1;
  const r00 = m[0] / (sign * sx), r01 = m[4] / sy, r02 = m[8] / sz;
  const r10 = m[1] / (sign * sx), r11 = m[5] / sy, r12 = m[9] / sz;
  const r20 = m[2] / (sign * sx), r21 = m[6] / sy, r22 = m[10] / sz;
  const trace = r00 + r11 + r22;
  let q: [number, number, number, number];
  if (trace > 0) {
    const t = Math.sqrt(trace + 1) * 2;
    q = [(r21 - r12) / t, (r02 - r20) / t, (r10 - r01) / t, t / 4];
  } else if (r00 > r11 && r00 > r22) {
    const t = Math.sqrt(1 + r00 - r11 - r22) * 2;
    q = [t / 4, (r01 + r10) / t, (r02 + r20) / t, (r21 - r12) / t];
  } else if (r11 > r22) {
    const t = Math.sqrt(1 + r11 - r00 - r22) * 2;
    q = [(r01 + r10) / t, t / 4, (r12 + r21) / t, (r02 - r20) / t];
  } else {
    const t = Math.sqrt(1 + r22 - r00 - r11) * 2;
    q = [(r02 + r20) / t, (r12 + r21) / t, t / 4, (r10 - r01) / t];
  }
  const orth = Math.abs(r00 * r01 + r10 * r11 + r20 * r21) + Math.abs(r00 * r02 + r10 * r12 + r20 * r22) + Math.abs(r01 * r02 + r11 * r12 + r21 * r22);
  return {
    matrix: m,
    position: [m[12], m[13], m[14]],
    quaternion: q,
    scale: [sx * sign, sy, sz],
    sheared: orth > 1e-4
  };
}

/** PR 0a stub: delegates to the existing `eulerToQuat` (index.ts:5345) ZYX math; other orders lower to ZYX. */
export function eulerToQuaternion(euler: AuraVec3, order: AuraEulerOrder): AuraQuat {
  const [x, y, z] = euler;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  if (order === "ZYX") {
    return [
      s1 * c2 * c3 + c1 * s2 * s3,
      c1 * s2 * c3 - s1 * c2 * s3,
      c1 * c2 * s3 + s1 * s2 * c3,
      c1 * c2 * c3 - s1 * s2 * s3
    ];
  }
  // PRD 01 lands the remaining orders; PR 0a lowers them through the ZYX path
  // so snapshots remain defined.
  return eulerToQuaternion(euler, "ZYX");
}

// AuraTransformSpec additions (PR 0a, optional): rotationOrder?: AuraEulerOrder (default "ZYX" = today's behaviour); quaternion?: AuraQuat (wins over rotation)
// AuraNodeBuilder additions: rotate(x: number, y: number, z: number, order?: AuraEulerOrder): this; quaternion(x: number, y: number, z: number, w: number): this

export class AuraColorParseError extends Error {
  constructor(public readonly input: unknown) {
    super(`AuraColorParseError:${String(input)}`);
    this.name = "AuraColorParseError";
  }
}

function parseSrgbChannels(color: AuraColor): readonly [number, number, number, number] {
  if (typeof color === "number" && Number.isFinite(color)) {
    const v = color >>> 0;
    return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255, ((v >> 24) & 0xff) / 255 || 1];
  }
  if (typeof color === "string") {
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color);
    if (hex) {
      const body = hex[1];
      if (body.length === 3) {
        return [parseInt(body[0] + body[0], 16) / 255, parseInt(body[1] + body[1], 16) / 255, parseInt(body[2] + body[2], 16) / 255, 1];
      }
      const value = Number.parseInt(body, 16);
      const alpha = body.length === 8 ? (value & 0xff) / 255 : 1;
      const rgb = body.length === 8 ? value >>> 8 : value;
      return [((rgb >> 16) & 0xff) / 255, ((rgb >> 8) & 0xff) / 255, (rgb & 0xff) / 255, alpha];
    }
  }
  throw new AuraColorParseError(color);
}

/** PR 0a stub: linear RGBA, delegating to the existing hex parser semantics. */
export function parseAuraColor(color: AuraColor): readonly [number, number, number, number] {
  const [r, g, b, a] = parseSrgbChannels(color);
  return [srgbToLinearChannel(r), srgbToLinearChannel(g), srgbToLinearChannel(b), a];
}

/** sRGB-encoded RGBA. */
export function parseAuraColorSrgb(color: AuraColor): readonly [number, number, number, number] {
  return parseSrgbChannels(color);
}

function composeTRS(px: number, py: number, pz: number, q: AuraQuat, s: AuraVec3): Float32Array {
  const [qx, qy, qz, qw] = q;
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  const out = new Float32Array(16);
  out[0] = (1 - (yy + zz)) * s[0]; out[1] = (xy + wz) * s[0]; out[2] = (xz - wy) * s[0]; out[3] = 0;
  out[4] = (xy - wz) * s[1]; out[5] = (1 - (xx + zz)) * s[1]; out[6] = (yz + wx) * s[1]; out[7] = 0;
  out[8] = (xz + wy) * s[2]; out[9] = (yz - wx) * s[2]; out[10] = (1 - (xx + yy)) * s[2]; out[11] = 0;
  out[12] = px; out[13] = py; out[14] = pz; out[15] = 1;
  return out;
}

function multiplyMat4Into(out: Float32Array, a: Float32Array, b: Float32Array): void {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    out[c * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    out[c * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    out[c * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
  }
}
