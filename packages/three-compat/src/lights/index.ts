import { Object3DCompat } from "../core/Object3DCompat";
import { ColorCompat } from "../math";

export class LightCompat extends Object3DCompat {
  override type = "Light";

  constructor(public color = new ColorCompat(1, 1, 1), public intensity = 1) {
    super();
  }
}

export class AmbientLightCompat extends LightCompat { override type = "AmbientLight"; }
export class HemisphereLightCompat extends LightCompat { override type = "HemisphereLight"; }
export class DirectionalLightCompat extends LightCompat { override type = "DirectionalLight"; castShadow = true; }
export class PointLightCompat extends LightCompat { override type = "PointLight"; distance = 0; decay = 2; }
export class SpotLightCompat extends LightCompat { override type = "SpotLight"; angle = Math.PI / 3; penumbra = 0.1; castShadow = true; }
export class RectAreaLightCompat extends LightCompat { override type = "RectAreaLight"; width = 1; height = 1; }
