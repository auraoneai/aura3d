export interface ShaderProgramSource { readonly vertex: string; readonly fragment: string; readonly defines?: readonly string[]; }
export class ShaderProgramLibrary {
  private readonly programs = new Map<string, ShaderProgramSource>();
  register(key: string, source: ShaderProgramSource): void { this.programs.set(key, source); }
  get(key: string): ShaderProgramSource | undefined { return this.programs.get(key); }
  keys(): readonly string[] { return [...this.programs.keys()]; }
}
