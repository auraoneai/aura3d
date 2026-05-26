import { ShaderMaterialThreeCompat } from "./ShaderMaterial";

export class RawShaderMaterialThreeCompat extends ShaderMaterialThreeCompat {
  override readonly type = "RawShaderMaterial";
  glslVersion: "300 es" | "100" = "300 es";
}
