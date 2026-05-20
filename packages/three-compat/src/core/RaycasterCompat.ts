import { MeshCompat, Object3DCompat } from "./Object3DCompat";
import { Vector3Compat } from "../math";

export interface RaycasterCompatIntersection {
  readonly object: Object3DCompat;
  readonly distance: number;
  readonly point: Vector3Compat;
}

export class RaycasterCompat {
  readonly ray = {
    origin: new Vector3Compat(),
    direction: new Vector3Compat(0, 0, -1)
  };
  near = 0;
  far = Infinity;

  set(origin: Vector3Compat, direction: Vector3Compat): void {
    this.ray.origin.copy(origin);
    this.ray.direction.copy(direction).normalize();
  }

  intersectObject(object: Object3DCompat, recursive = true): RaycasterCompatIntersection[] {
    const objects: Object3DCompat[] = [];
    recursive ? object.traverse((entry) => objects.push(entry)) : objects.push(object);
    return objects
      .filter((entry) => entry instanceof MeshCompat && entry.visible)
      .map((entry) => {
        const toObject = entry.position.clone().sub(this.ray.origin);
        const distance = Math.max(this.near, Math.min(this.far, toObject.length()));
        return { object: entry, distance, point: entry.position.clone() };
      })
      .filter((entry) => entry.distance >= this.near && entry.distance <= this.far)
      .sort((a, b) => a.distance - b.distance);
  }
}
