import { type RenderDevice, type RenderShaderProgram } from "./RenderDevice";
import { type CompiledShaderSource, type ShaderLibrary } from "./ShaderLibrary";
import { reflectShaderSources, type ShaderReflection } from "./ShaderReflection";

export class ShaderModule {
  private program: RenderShaderProgram | null = null;
  public readonly reflection: ShaderReflection;

  constructor(public readonly source: CompiledShaderSource) {
    this.reflection = reflectShaderSources(source);
  }

  static fromLibrary(library: ShaderLibrary, name: string): ShaderModule {
    return new ShaderModule(library.compileSource(name));
  }

  static fromLibraryVariant(library: ShaderLibrary, name: string, variantName: string): ShaderModule {
    return new ShaderModule(library.compileVariant(name, variantName));
  }

  compile(device: RenderDevice): RenderShaderProgram {
    if (!this.program || this.program.disposed) {
      this.program = device.createShaderProgram({
        label: this.source.label,
        marker: this.source.marker,
        vertex: this.source.vertex,
        fragment: this.source.fragment
      });
    }
    return this.program;
  }

  dispose(): void {
    this.program?.dispose();
  }
}
