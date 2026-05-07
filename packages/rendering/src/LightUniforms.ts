import { type CollectedLight } from "./LightCollector";
import { UniformLayout } from "./UniformLayout";

export const MAX_DIRECT_LIGHTS = 8;

export interface PackedLightUniforms {
  readonly lightCount: number;
  readonly data: Float32Array;
  readonly layout: UniformLayout;
}

export class LightUniforms {
  static readonly floatsPerLight = 16;

  static readonly layout = new UniformLayout([
    { name: "u_lightCount", type: "float" },
    { name: "u_lightData", type: "vec4", arrayLength: MAX_DIRECT_LIGHTS * 4 }
  ]);

  static pack(lights: readonly CollectedLight[], maxLights = MAX_DIRECT_LIGHTS): PackedLightUniforms {
    if (!Number.isInteger(maxLights) || maxLights <= 0 || maxLights > MAX_DIRECT_LIGHTS) {
      throw new RangeError(`maxLights must be an integer in [1, ${MAX_DIRECT_LIGHTS}]`);
    }
    const selected = lights.slice(0, maxLights);
    const data = new Float32Array(MAX_DIRECT_LIGHTS * LightUniforms.floatsPerLight);
    selected.forEach((light, index) => {
      const offset = index * LightUniforms.floatsPerLight;
      data.set([light.color[0], light.color[1], light.color[2], light.intensity], offset);
      data.set([light.position[0], light.position[1], light.position[2], light.range], offset + 4);
      data.set([light.direction[0], light.direction[1], light.direction[2], kindToFloat(light.kind)], offset + 8);
      data.set([light.spotAngle, light.penumbra, light.castsShadow ? 1 : 0, light.layerMask], offset + 12);
    });
    return { lightCount: selected.length, data, layout: LightUniforms.layout };
  }
}

function kindToFloat(kind: CollectedLight["kind"]): number {
  switch (kind) {
    case "directional":
      return 0;
    case "point":
      return 1;
    case "spot":
      return 2;
  }
}
