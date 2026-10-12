import { type RenderDevice, type RenderShaderProgram } from "./RenderDevice";
import { type CompiledShaderSource, type ShaderLibrary } from "./ShaderLibraryCore";
import { reflectShaderSources, type ShaderReflection } from "./ShaderReflection";

export class ShaderModule {
  /**
   * One compiled program per device. A module is often a static singleton
   * (e.g. SceneDepthCopyPass) shared by every Renderer on the page; a single
   * cached program would hand device A's program to device B
   * ("Shader is not a live WebGL2 resource owned by this device").
   */
  private readonly programs = new Map<RenderDevice, RenderShaderProgram>();
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
    // Drop programs whose device or program is gone so a disposed device is not retained.
    for (const [owner, program] of this.programs) {
      if (program.disposed || (owner as { disposed?: boolean }).disposed === true) this.programs.delete(owner);
    }
    let program = this.programs.get(device);
    if (!program) {
      program = device.createShaderProgram({
        label: this.source.label,
        marker: this.source.marker,
        vertex: this.source.vertex,
        fragment: this.source.fragment,
        ...(this.source.webgpu ? { webgpu: this.source.webgpu } : {}),
        ...(this.source.portableBindings ? { portableBindings: this.source.portableBindings } : {})
      });
      this.programs.set(device, program);
    }
    return program;
  }

  dispose(): void {
    for (const program of this.programs.values()) program.dispose();
    this.programs.clear();
  }
}
