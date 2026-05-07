import { normalizeVec3, type Vec3 } from "./MathTypes.js";
import { Light } from "./Light.js";

export class DirectionalLight extends Light {
  constructor(name = "DirectionalLight", id?: string) {
    super("directional", name, id);
  }

  getDirection(): Vec3 {
    const m = this.transform.worldMatrix;
    return normalizeVec3([-m[8], -m[9], -m[10]]);
  }
}
