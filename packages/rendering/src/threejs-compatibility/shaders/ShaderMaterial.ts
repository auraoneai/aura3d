import { UniformsV5 } from "./Uniforms";
import { diagnoseV5Shader, type V5ShaderDiagnostic } from "./ShaderDiagnostics";

export class ShaderMaterialV5 {
  readonly type: string = "ShaderMaterial";
  readonly uniforms = new UniformsV5();

  constructor(public vertexShader: string, public fragmentShader: string) {}

  setUniform(name: string, value: number | boolean | string | readonly number[]): this {
    this.uniforms.set(name, value);
    return this;
  }

  diagnose(): V5ShaderDiagnostic {
    return diagnoseV5Shader(this.vertexShader, this.fragmentShader);
  }
}
