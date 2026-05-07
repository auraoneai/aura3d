import { Material } from "./Material";
import { type DrawCommand, type RenderDevice, type RenderShaderProgram } from "./RenderDevice";
import { BaseRenderPass, type RenderPassContext } from "./RenderPass";
import { ShaderModule } from "./ShaderModule";
import { DEFAULT_DEPTH_SHADER_NAME, type ShaderLibrary, createDefaultShaderLibrary } from "./ShaderLibrary";
import { type RenderItem } from "./ForwardPass";

export interface DepthPassOptions {
  readonly casters: readonly RenderItem[];
  readonly shaderLibrary?: ShaderLibrary;
}

export class DepthMaterial extends Material {
  constructor() {
    super({
      name: "depth",
      shaderKey: DEFAULT_DEPTH_SHADER_NAME,
      parameters: {
        u_modelViewProjection: identityMatrix()
      },
      requiredAttributes: ["a_position"],
      uniformSchema: [{ name: "u_modelViewProjection", kind: "mat4" }]
    });
  }
}

export class DepthPass extends BaseRenderPass {
  private readonly shaderLibrary: ShaderLibrary;
  private readonly material = new DepthMaterial();
  private shaderModule: ShaderModule | null = null;

  constructor(private readonly options: DepthPassOptions) {
    super("depth", [], ["depth"]);
    this.shaderLibrary = options.shaderLibrary ?? createDefaultShaderLibrary();
  }

  execute(context: RenderPassContext): void {
    for (const caster of this.options.casters) {
      this.drawCaster(context.device, caster);
    }
  }

  private drawCaster(device: RenderDevice, caster: RenderItem): void {
    const shader = this.getShader(device);
    const vertexBuffer = caster.geometry.vertexBuffer.upload(device);
    const indexBuffer = caster.geometry.indexBuffer?.upload(device);
    const command: DrawCommand = {
      label: caster.label ?? "shadow-caster",
      topology: caster.geometry.topology,
      vertexBuffer,
      vertexFormat: caster.geometry.vertexBuffer.format,
      vertexCount: caster.geometry.vertexBuffer.vertexCount,
      shader,
      uniforms: this.material.getParameters()
    };
    if (indexBuffer) {
      Object.assign(command, {
        indexBuffer,
        indexType: caster.geometry.indexBuffer?.type,
        indexCount: caster.geometry.indexBuffer?.count
      });
    }
    device.draw(command);
  }

  private getShader(device: RenderDevice): RenderShaderProgram {
    if (!this.shaderModule) {
      this.shaderModule = ShaderModule.fromLibrary(this.shaderLibrary, this.material.shaderKey);
    }
    return this.shaderModule.compile(device);
  }
}

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}
