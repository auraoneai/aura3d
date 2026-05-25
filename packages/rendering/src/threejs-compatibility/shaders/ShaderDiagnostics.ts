export interface V5ShaderDiagnostic {
  readonly pass: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function diagnoseV5Shader(vertexShader: string, fragmentShader: string): V5ShaderDiagnostic {
  const errors = [
    ...(!vertexShader.includes("void main") ? ["vertex shader missing void main"] : []),
    ...(!fragmentShader.includes("void main") ? ["fragment shader missing void main"] : []),
    ...(/gl_FragColor/.test(fragmentShader) ? ["fragment shader uses legacy gl_FragColor; use explicit output for modern targets"] : [])
  ];
  const warnings = [
    ...(!/precision\s+(highp|mediump)/.test(fragmentShader) ? ["fragment shader precision is implicit"] : [])
  ];
  return { pass: errors.length === 0, errors, warnings };
}
