import { Material } from "./Material";
import { type DrawCommand, type RenderDevice, RenderDeviceError, type RenderShaderProgram } from "./RenderDevice";
import { BaseRenderPass, type RenderPassContext } from "./RenderPass";
import { ShaderModule } from "./ShaderModule";
import { DEFAULT_DEPTH_SHADER_NAME, type ShaderLibrary, createDefaultShaderLibrary } from "./ShaderLibrary";
import { type RenderItem } from "./ForwardPass";
import { identityMat4, multiplyMat4, type Mat4 } from "@galileo3d/scene";

export interface DepthPassOptions {
  readonly casters: readonly RenderItem[];
  readonly shaderLibrary?: ShaderLibrary;
  readonly viewProjectionMatrix?: Float32Array | readonly number[];
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
    const drawRange = resolveDepthDrawRange(caster.geometry, caster.drawRange);
    const modelMatrix = toMat4(caster.modelMatrix ?? identityMat4(), caster.label);
    const viewProjection = toMat4(this.options.viewProjectionMatrix ?? identityMat4(), caster.label);
    this.material.setParameter("u_modelViewProjection", multiplyMat4(viewProjection, modelMatrix));
    const command: DrawCommand = {
      label: caster.label ?? "shadow-caster",
      topology: caster.geometry.topology,
      vertexBuffer,
      vertexFormat: caster.geometry.vertexBuffer.format,
      vertexCount: indexBuffer ? caster.geometry.vertexBuffer.vertexCount : drawRange.count,
      ...(indexBuffer === undefined && drawRange.start > 0 ? { firstVertex: drawRange.start } : {}),
      shader,
      uniforms: this.material.getParameters()
    };
    if (indexBuffer) {
      Object.assign(command, {
        indexBuffer,
        indexType: caster.geometry.indexBuffer?.type,
        indexCount: drawRange.count,
        ...(drawRange.start > 0 ? { firstIndex: drawRange.start } : {})
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

function resolveDepthDrawRange(geometry: RenderItem["geometry"], range: RenderItem["drawRange"]): { readonly start: number; readonly count: number } {
  const available = geometry.indexBuffer?.count ?? geometry.vertexBuffer.vertexCount;
  if (!range) return { start: 0, count: available };
  if (!Number.isInteger(range.start) || range.start < 0 || !Number.isInteger(range.count) || range.count <= 0 || range.start + range.count > available) {
    throw new RenderDeviceError("Depth caster drawRange must fit inside geometry draw count", "DEPTH_DRAW_RANGE_INVALID", {
      start: range.start,
      count: range.count,
      available
    });
  }
  return range;
}

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

function toMat4(value: Float32Array | readonly number[], label?: string): Mat4 {
  const values = Array.from(value);
  if (values.length !== 16 || values.some((entry) => !Number.isFinite(entry))) {
    throw new Error(`DepthPass ${label ?? "caster"} matrix must contain 16 finite numbers.`);
  }
  return values as unknown as Mat4;
}
