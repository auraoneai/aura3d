import { Bone, type BoneDescriptor } from "./Bone.js";
import { multiplyMat4, type Mat4 } from "./Keyframe.js";

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
}
