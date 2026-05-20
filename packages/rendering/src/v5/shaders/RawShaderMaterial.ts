import { ShaderMaterialV5 } from "./ShaderMaterial";

export class RawShaderMaterialV5 extends ShaderMaterialV5 {
  override readonly type = "RawShaderMaterial";
  glslVersion: "300 es" | "100" = "300 es";
}
