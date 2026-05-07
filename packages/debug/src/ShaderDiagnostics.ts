import { type RenderShaderProgram, type ShaderSources } from "@galileo3d/rendering";

export interface ShaderDiagnosticReport {
  readonly label: string;
  readonly marker: string;
  readonly markerPresentInVertex: boolean;
  readonly markerPresentInFragment: boolean;
  readonly attributes: readonly string[];
  readonly uniforms: readonly string[];
  readonly compileLog: string | null;
}

export class ShaderDiagnostics {
  inspectSources(sources: ShaderSources, compileLog: string | null = null): ShaderDiagnosticReport {
    return {
      label: sources.label,
      marker: sources.marker,
      markerPresentInVertex: sources.vertex.includes(sources.marker),
      markerPresentInFragment: sources.fragment.includes(sources.marker),
      attributes: extractNames(/\b(?:in|attribute)\s+\w+\s+(\w+)\s*;/g, `${sources.vertex}\n${sources.fragment}`),
      uniforms: extractNames(/\buniform\s+\w+\s+(\w+)(?:\s*\[[^\]]+\])?\s*;/g, `${sources.vertex}\n${sources.fragment}`),
      compileLog
    };
  }

  inspectProgram(program: RenderShaderProgram, compileLog: string | null = null): ShaderDiagnosticReport {
    return {
      label: program.label,
      marker: program.marker,
      markerPresentInVertex: true,
      markerPresentInFragment: true,
      attributes: [...program.reflection.attributes.keys()],
      uniforms: [...program.reflection.uniforms],
      compileLog
    };
  }

  assertMarker(report: ShaderDiagnosticReport): void {
    if (!report.markerPresentInVertex || !report.markerPresentInFragment) {
      throw new ShaderDiagnosticError("Shader marker mismatch", report);
    }
  }
}

export class ShaderDiagnosticError extends Error {
  constructor(
    message: string,
    public readonly report: ShaderDiagnosticReport
  ) {
    super(message);
    this.name = "ShaderDiagnosticError";
  }
}

function extractNames(pattern: RegExp, source: string): readonly string[] {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (match[1]) {
      names.add(match[1]);
    }
  }
  return [...names];
}
