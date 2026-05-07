import { Matrix4 } from "./Matrix4.js";
import { Quaternion } from "./Quaternion.js";
import { Vector3 } from "./Vector3.js";

export class Transform {
  constructor(
    readonly position = Vector3.zero.clone(),
    readonly rotation = Quaternion.identity.clone(),
    readonly scale = Vector3.one.clone()
  ) {}

  static identity(): Transform {
    return new Transform();
  }

  toMatrix4(): Matrix4 {
    return Matrix4.compose(this.position, this.rotation, this.scale);
  }

  combine(child: Transform): Transform {
    const scaledPosition = child.position.multiply(this.scale);
    const rotatedPosition = this.rotation.rotateVector(scaledPosition);
    return new Transform(
      this.position.add(rotatedPosition),
      this.rotation.multiply(child.rotation).normalize(),
      this.scale.multiply(child.scale)
    );
  }

  transformPoint(point: Vector3): Vector3 {
    return this.toMatrix4().transformPoint(point);
  }
}
