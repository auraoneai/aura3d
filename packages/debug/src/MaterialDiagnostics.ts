import {
  MaterialBinding,
  MaterialBindingError,
  type Material,
  type MaterialInstance,
  type RenderShaderProgram
} from "@galileo3d/rendering";

export interface MaterialDiagnosticReport {
  readonly materialName: string;
  readonly shaderLabel: string;
  readonly valid: boolean;
  readonly diagnostics: readonly string[];
  readonly uniforms: readonly string[];
}

export class MaterialDiagnostics {
  inspect(material: Material | MaterialInstance, shader: RenderShaderProgram): MaterialDiagnosticReport {
    const binding = new MaterialBinding();
    const materialName = "baseMaterial" in material ? material.baseMaterial.name : material.name;
    try {
      const result = binding.bind(material, shader);
      return {
        materialName,
        shaderLabel: shader.label,
        valid: true,
        diagnostics: [],
        uniforms: [...result.uniforms.keys()]
      };
    } catch (error) {
      if (error instanceof MaterialBindingError) {
        return {
          materialName,
          shaderLabel: shader.label,
          valid: false,
          diagnostics: error.diagnostics,
          uniforms: []
        };
      }
      throw error;
    }
  }

  assertValid(report: MaterialDiagnosticReport): void {
    if (!report.valid) {
      throw new MaterialDiagnosticError("Material diagnostics reported invalid binding", report);
    }
  }
}

export class MaterialDiagnosticError extends Error {
  constructor(
    message: string,
    public readonly report: MaterialDiagnosticReport
  ) {
    super(message);
    this.name = "MaterialDiagnosticError";
  }
}
