import { Bone, type BoneDescriptor } from "./Bone.js";
import { multiplyMat4, type Mat4, type Vec3 } from "./Keyframe.js";

export class Skeleton {
  readonly bones: readonly Bone[];

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
  }

  worldMatrices(): readonly Mat4[] {
    const matrices: Mat4[] = [];
    for (let index = 0; index < this.bones.length; index += 1) {
      const bone = this.bones[index]!;
      const local = bone.localMatrix();
      matrices[index] = bone.parentIndex >= 0 ? multiplyMat4(matrices[bone.parentIndex]!, local) : local;
    }
    return matrices;
  }

  matrixPalette(): readonly Mat4[] {
    const worlds = this.worldMatrices();
    return this.bones.map((bone, index) => multiplyMat4(worlds[index]!, bone.inverseBindMatrix));
  }

  /** World-space positions (translation component of each bone's world matrix). */
  boneWorldPositions(): readonly Vec3[] {
    return this.worldMatrices().map((m) => [m[12]!, m[13]!, m[14]!] as Vec3);
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
