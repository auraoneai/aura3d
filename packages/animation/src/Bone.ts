import { composeMat4, identityMat4, type Mat4, type Quat, type Vec3 } from "./Keyframe.js";

export type BoneDescriptor = {
  readonly name: string;
  readonly parentIndex: number;
  readonly translation?: Vec3;
  readonly rotation?: Quat;
  readonly scale?: Vec3;
  readonly inverseBindMatrix?: Mat4;
};

export class Bone {
  readonly name: string;
  readonly parentIndex: number;
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
  inverseBindMatrix: Mat4;

  constructor(descriptor: BoneDescriptor) {
    if (descriptor.name.trim().length === 0) {
      throw new Error("Bone name cannot be empty.");
    }
    this.name = descriptor.name;
    this.parentIndex = descriptor.parentIndex;
    this.translation = descriptor.translation ?? [0, 0, 0];
    this.rotation = descriptor.rotation ?? [0, 0, 0, 1];
    this.scale = descriptor.scale ?? [1, 1, 1];
    this.inverseBindMatrix = descriptor.inverseBindMatrix ?? identityMat4();
  }

  localMatrix(): Mat4 {
    return composeMat4(this.translation, this.rotation, this.scale);
  }
}
