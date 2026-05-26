import { UniformsThreeCompat } from "./Uniforms";
import { diagnoseThreeCompatShader, type ThreeCompatShaderDiagnostic } from "./ShaderDiagnostics";

export class ShaderMaterialThreeCompat {
  readonly type: string = "ShaderMaterial";
  readonly uniforms = new UniformsThreeCompat();

  constructor(public vertexShader: string, public fragmentShader: string) {}

  setUniform(name: string, value: number | boolean | string | readonly number[]): this {
    this.uniforms.set(name, value);
    return this;
  }

  diagnose(): ThreeCompatShaderDiagnostic {
    return diagnoseThreeCompatShader(this.vertexShader, this.fragmentShader);
  }
}
