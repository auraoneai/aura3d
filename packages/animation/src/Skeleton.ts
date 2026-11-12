import { Bone, type BoneDescriptor } from "./Bone.js";
import type { Mat4, Quat, Vec3 } from "./Keyframe.js";

function composeMat4Into(
  translation: Vec3,
  rotation: Quat,
  scale: Vec3,
  out: Float32Array,
  offset: number
): void {
  let rx = rotation[0];
  let ry = rotation[1];
  let rz = rotation[2];
  let rw = rotation[3];
  const length = Math.hypot(rx, ry, rz, rw);
  if (length <= 1e-9) {
    rx = 0;
    ry = 0;
    rz = 0;
    rw = 1;
  } else {
    const inv = 1 / length;
    rx *= inv;
    ry *= inv;
    rz *= inv;
    rw *= inv;
  }
  const x2 = rx + rx;
  const y2 = ry + ry;
  const z2 = rz + rz;
  const xx = rx * x2;
  const xy = rx * y2;
  const xz = rx * z2;
  const yy = ry * y2;
  const yz = ry * z2;
  const zz = rz * z2;
  const wx = rw * x2;
  const wy = rw * y2;
  const wz = rw * z2;
  const sx = scale[0];
  const sy = scale[1];
  const sz = scale[2];
  out[offset] = (1 - (yy + zz)) * sx;
  out[offset + 1] = (xy + wz) * sx;
  out[offset + 2] = (xz - wy) * sx;
  out[offset + 3] = 0;
  out[offset + 4] = (xy - wz) * sy;
  out[offset + 5] = (1 - (xx + zz)) * sy;
  out[offset + 6] = (yz + wx) * sy;
  out[offset + 7] = 0;
  out[offset + 8] = (xz + wy) * sz;
  out[offset + 9] = (yz - wx) * sz;
  out[offset + 10] = (1 - (xx + yy)) * sz;
  out[offset + 11] = 0;
  out[offset + 12] = translation[0];
  out[offset + 13] = translation[1];
  out[offset + 14] = translation[2];
  out[offset + 15] = 1;
}

function multiplyMat4Into(
  a: ArrayLike<number>,
  aOffset: number,
  b: ArrayLike<number>,
  bOffset: number,
  out: Float32Array,
  outOffset: number
): void {
  const a0 = a[aOffset]!;
  const a1 = a[aOffset + 1]!;
  const a2 = a[aOffset + 2]!;
  const a3 = a[aOffset + 3]!;
  const a4 = a[aOffset + 4]!;
  const a5 = a[aOffset + 5]!;
  const a6 = a[aOffset + 6]!;
  const a7 = a[aOffset + 7]!;
  const a8 = a[aOffset + 8]!;
  const a9 = a[aOffset + 9]!;
  const a10 = a[aOffset + 10]!;
  const a11 = a[aOffset + 11]!;
  const a12 = a[aOffset + 12]!;
  const a13 = a[aOffset + 13]!;
  const a14 = a[aOffset + 14]!;
  const a15 = a[aOffset + 15]!;
  for (let col = 0; col < 4; col += 1) {
    const bc = bOffset + col * 4;
    const b0 = b[bc]!;
    const b1 = b[bc + 1]!;
    const b2 = b[bc + 2]!;
    const b3 = b[bc + 3]!;
    const oc = outOffset + col * 4;
    out[oc] = a0 * b0 + a4 * b1 + a8 * b2 + a12 * b3;
    out[oc + 1] = a1 * b0 + a5 * b1 + a9 * b2 + a13 * b3;
    out[oc + 2] = a2 * b0 + a6 * b1 + a10 * b2 + a14 * b3;
    out[oc + 3] = a3 * b0 + a7 * b1 + a11 * b2 + a15 * b3;
  }
}

export class Skeleton {
  readonly bones: readonly Bone[];
  private readonly localScratch = new Float32Array(16);
  private readonly worldBuffer: Float32Array;
  private readonly worldViews: readonly Mat4[];
  private readonly paletteBuffer: Float32Array;
  private readonly paletteViews: readonly Mat4[];
  private readonly positionBuffer: Float32Array;
  private readonly positionViews: readonly Vec3[];

  constructor(bones: readonly (Bone | BoneDescriptor)[]) {
    if (bones.length === 0) {
      throw new Error("Skeleton requires at least one bone.");
    }
    this.bones = bones.map((bone) => bone instanceof Bone ? bone : new Bone(bone));
    for (let index = 0; index < this.bones.length; index += 1) {
      const parent = this.bones[index]!.parentIndex;
      if (parent >= index || parent < -1) {
        throw new Error(`Bone ${this.bones[index]!.name} has invalid parent index ${parent}.`);
      }
    }
    const count = this.bones.length;
    this.worldBuffer = new Float32Array(count * 16);
    this.paletteBuffer = new Float32Array(count * 16);
    this.positionBuffer = new Float32Array(count * 3);
    const wViews: Mat4[] = new Array(count);
    const pViews: Mat4[] = new Array(count);
    const posViews: Vec3[] = new Array(count);
    for (let index = 0; index < count; index += 1) {
      wViews[index] = this.worldBuffer.subarray(index * 16, (index + 1) * 16) as unknown as Mat4;
      pViews[index] = this.paletteBuffer.subarray(index * 16, (index + 1) * 16) as unknown as Mat4;
      posViews[index] = this.positionBuffer.subarray(index * 3, (index + 1) * 3) as unknown as Vec3;
    }
    this.worldViews = wViews;
    this.paletteViews = pViews;
    this.positionViews = posViews;
  }

  private computeWorldBuffer(): Float32Array {
    const out = this.worldBuffer;
    const local = this.localScratch;
    for (let index = 0; index < this.bones.length; index += 1) {
      const bone = this.bones[index]!;
      const dstOffset = index * 16;
      if (bone.parentIndex >= 0) {
        composeMat4Into(bone.translation, bone.rotation, bone.scale, local, 0);
        multiplyMat4Into(out, bone.parentIndex * 16, local, 0, out, dstOffset);
      } else {
        composeMat4Into(bone.translation, bone.rotation, bone.scale, out, dstOffset);
      }
    }
    return out;
  }

  /** Contiguous `boneCount * 16` column-major world matrices reused across frames. */
  worldMatricesBuffer(): Float32Array {
    return this.computeWorldBuffer();
  }

  worldMatrices(): readonly Mat4[] {
    this.computeWorldBuffer();
    return this.worldViews;
  }

  /** Contiguous `boneCount * 16` column-major skinning palette reused across frames. */
  matrixPaletteBuffer(): Float32Array {
    const worlds = this.computeWorldBuffer();
    const out = this.paletteBuffer;
    for (let index = 0; index < this.bones.length; index += 1) {
      const bone = this.bones[index]!;
      const offset = index * 16;
      multiplyMat4Into(worlds, offset, bone.inverseBindMatrix, 0, out, offset);
    }
    return out;
  }

  matrixPalette(): readonly Mat4[] {
    this.matrixPaletteBuffer();
    return this.paletteViews;
  }

  /** World-space positions (translation component of each bone's world matrix). */
  boneWorldPositions(): readonly Vec3[] {
    const worlds = this.computeWorldBuffer();
    const pos = this.positionBuffer;
    for (let index = 0; index < this.bones.length; index += 1) {
      const wOff = index * 16;
      const pOff = index * 3;
      pos[pOff] = worlds[wOff + 12]!;
      pos[pOff + 1] = worlds[wOff + 13]!;
      pos[pOff + 2] = worlds[wOff + 14]!;
    }
    return this.positionViews;
  }

  /**
   * Ordered descendant chain from a bone (by name or index), following the first child at each
   * level. Returns bone indices root-first — the input to {@link createSpringChain} (use the
   * matching {@link boneWorldPositions} as the rest pose). Members tagged `springChain` are honored;
   * the walk stops at the first leaf or when a child is no longer part of the chain.
   */
  springChainIndices(root: string | number): readonly number[] {
    const rootIndex = typeof root === "number" ? root : this.bones.findIndex((b) => b.name === root);
    if (rootIndex < 0 || rootIndex >= this.bones.length) {
      throw new Error(`Spring chain root ${String(root)} not found in skeleton.`);
    }
    const chain: number[] = [rootIndex];
    let current = rootIndex;
    for (;;) {
      const childIndex = this.bones.findIndex((b, i) => i > current && b.parentIndex === current);
      if (childIndex < 0) break;
      chain.push(childIndex);
      current = childIndex;
    }
    return chain;
  }

  /**
   * Write solved spring-chain world positions back onto the bones as local translations (relative
   * to each bone's solved parent), so the deformed chain renders. `chainIndices` and `positions`
   * are root-first and aligned.
   */
  writeSpringChainBack(chainIndices: readonly number[], positions: readonly Vec3[]): void {
    if (chainIndices.length !== positions.length) {
      throw new Error("Spring chain indices and positions must align.");
    }
    for (let i = 1; i < chainIndices.length; i += 1) {
      const boneIndex = chainIndices[i]!;
      const parentPos = positions[i - 1]!;
      const pos = positions[i]!;
      this.bones[boneIndex]!.translation = [pos[0] - parentPos[0], pos[1] - parentPos[1], pos[2] - parentPos[2]];
    }
  }
}
