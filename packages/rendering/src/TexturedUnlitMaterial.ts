import { Material, type RenderState } from "./Material";
import { DEFAULT_TEXTURED_UNLIT_SHADER_NAME } from "./ShaderLibraryCore";
import { Sampler } from "./Sampler";
import { Texture } from "./Texture";
import { TextureBinding } from "./TextureBinding";

export interface TexturedUnlitMaterialOptions {
  readonly name?: string;
  readonly texture: Texture;
  readonly sampler?: Sampler;
  readonly textureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly color?: readonly [number, number, number, number];
  readonly renderState?: Partial<RenderState>;
}

export class TexturedUnlitMaterial extends Material {
  constructor(options: TexturedUnlitMaterialOptions) {
    const color = options.color ?? [1, 1, 1, 1];
    validateColor(color);
    super({
      name: options.name ?? "textured-unlit",
      shaderKey: DEFAULT_TEXTURED_UNLIT_SHADER_NAME,
      renderState: options.renderState,
      parameters: {
        u_baseColor: color,
        u_baseColorTexture: new TextureBinding({
          name: "u_baseColorTexture",
          texture: options.texture,
          sampler: options.sampler,
          transform: options.textureTransform
        }),
        u_baseColorTextureOffset: options.textureTransform?.offset ?? [0, 0],
        u_baseColorTextureScale: options.textureTransform?.scale ?? [1, 1],
        u_baseColorTextureRotation: options.textureTransform?.rotation ?? 0,
        u_modelViewProjection: identityMatrix(),
        // P2 instanced-GLB path (muse3jsparity-PRD): zero instances by
        // default so non-instanced draws keep the legacy shader branch
        // bit-exact; applyInstanceBinding stamps real counts per item.
        u_instanceMatrices: defaultTexturedUnlitInstanceMatrices(),
        u_instanceCount: 0,
        u_instanceAttributeMode: 0
      },
      requiredAttributes: ["a_position", "a_uv"],
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
        { name: "u_baseColorTexture", kind: "texture2d" },
        { name: "u_baseColorTextureOffset", kind: "vec2" },
        { name: "u_baseColorTextureScale", kind: "vec2" },
        { name: "u_baseColorTextureRotation", kind: "float" },
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_instanceMatrices", kind: "any" },
        { name: "u_instanceCount", kind: "float" },
        { name: "u_instanceAttributeMode", kind: "float" }
      ]
    });
  }
}

/** 64 identity matrices: the uniform-path instance ceiling (mirrors ForwardPass MAX_GPU_INSTANCES). */
function defaultTexturedUnlitInstanceMatrices(): Float32Array {
  const matrices = new Float32Array(64 * 16);
  matrices[0] = 1;
  matrices[5] = 1;
  matrices[10] = 1;
  matrices[15] = 1;
  return matrices;
}

function validateColor(color: readonly [number, number, number, number]): void {
  if (color.length !== 4 || color.some((channel) => channel < 0 || channel > 1 || !Number.isFinite(channel))) {
    throw new Error("TexturedUnlitMaterial color must contain four finite values in [0, 1]");
  }
}

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}
