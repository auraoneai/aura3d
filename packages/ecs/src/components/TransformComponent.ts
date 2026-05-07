import { Quaternion, Vector3 } from "@galileo3d/math";

export class TransformComponent {
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];

  constructor(
    position: Vector3 | readonly [number, number, number] = Vector3.zero.clone(),
    rotation: Quaternion | readonly [number, number, number, number] = Quaternion.identity.clone(),
    scale: Vector3 | readonly [number, number, number] = Vector3.one.clone()
  ) {
    this.position = position instanceof Vector3 ? position.toArray() : [...position];
    const normalizedRotation = rotation instanceof Quaternion ? rotation.normalize() : new Quaternion(rotation[0], rotation[1], rotation[2], rotation[3]).normalize();
    this.rotation = [normalizedRotation.x, normalizedRotation.y, normalizedRotation.z, normalizedRotation.w];
    this.scale = scale instanceof Vector3 ? scale.toArray() : [...scale];
  }

  toJSON(): { position: [number, number, number]; rotation: [number, number, number, number]; scale: [number, number, number] } {
    return {
      position: [...this.position],
      rotation: [...this.rotation],
      scale: [...this.scale]
    };
  }

  toMath(): { position: Vector3; rotation: Quaternion; scale: Vector3 } {
    return {
      position: new Vector3(this.position[0], this.position[1], this.position[2]),
      rotation: new Quaternion(this.rotation[0], this.rotation[1], this.rotation[2], this.rotation[3]),
      scale: new Vector3(this.scale[0], this.scale[1], this.scale[2])
    };
  }
}
