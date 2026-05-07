import { Quaternion, Vector3 } from "@galileo3d/math";
import { type Camera } from "@galileo3d/scene";
import { type CameraTransformLike, type EulerLike, type Vec3Like } from "./ControlTypes";

export interface SceneCameraControlAdapter extends CameraTransformLike {
  readonly camera: Camera;
  readonly position: Vec3Like;
  readonly rotation: EulerLike;
  lookAt(target: Vec3Like): void;
}

export function createSceneCameraControlAdapter(camera: Camera): SceneCameraControlAdapter {
  const euler = quaternionToEuler(camera.transform.rotation);
  const position = {
    get x(): number {
      return camera.transform.position[0];
    },
    set x(value: number) {
      camera.transform.setPosition(value, camera.transform.position[1], camera.transform.position[2]);
    },
    get y(): number {
      return camera.transform.position[1];
    },
    set y(value: number) {
      camera.transform.setPosition(camera.transform.position[0], value, camera.transform.position[2]);
    },
    get z(): number {
      return camera.transform.position[2];
    },
    set z(value: number) {
      camera.transform.setPosition(camera.transform.position[0], camera.transform.position[1], value);
    }
  };
  const rotation = {
    get x(): number {
      return euler.x;
    },
    set x(value: number) {
      euler.x = value;
      applyEuler(camera, euler);
    },
    get y(): number {
      return euler.y;
    },
    set y(value: number) {
      euler.y = value;
      applyEuler(camera, euler);
    },
    get z(): number {
      return euler.z;
    },
    set z(value: number) {
      euler.z = value;
      applyEuler(camera, euler);
    }
  };

  return {
    camera,
    position,
    rotation,
    lookAt(target: Vec3Like): void {
      const origin = new Vector3(camera.transform.position[0], camera.transform.position[1], camera.transform.position[2]);
      const direction = new Vector3(target.x, target.y, target.z).subtract(origin).normalize();
      if (direction.lengthSquared() === 0) return;
      const q = Quaternion.fromUnitVectors(Vector3.forward, direction);
      camera.transform.setRotation(q.x, q.y, q.z, q.w);
      const nextEuler = quaternionToEuler([q.x, q.y, q.z, q.w]);
      euler.x = nextEuler.x;
      euler.y = nextEuler.y;
      euler.z = nextEuler.z;
    }
  };
}

function applyEuler(camera: Camera, euler: EulerLike): void {
  const yaw = Quaternion.fromAxisAngle(Vector3.up, euler.y);
  const pitch = Quaternion.fromAxisAngle(Vector3.right, euler.x);
  const roll = Quaternion.fromAxisAngle(new Vector3(0, 0, 1), euler.z);
  const q = yaw.multiply(pitch).multiply(roll).normalize();
  camera.transform.setRotation(q.x, q.y, q.z, q.w);
}

function quaternionToEuler(rotation: readonly [number, number, number, number]): EulerLike {
  const [x, y, z, w] = rotation;
  const sinPitch = 2 * (w * x - z * y);
  const pitch = Math.abs(sinPitch) >= 1 ? Math.sign(sinPitch) * Math.PI / 2 : Math.asin(sinPitch);
  const yaw = Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y));
  const roll = Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z));
  return { x: pitch, y: yaw, z: roll };
}
