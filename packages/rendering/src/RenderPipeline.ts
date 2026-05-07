import { type RenderState, DEFAULT_RENDER_STATE, validateRenderState } from "./Material";
import {
  type DrawCommand,
  type IndexType,
  type PrimitiveTopology,
  type RenderBuffer,
  type RenderShaderProgram
} from "./RenderDevice";
import { type VertexFormat } from "./VertexFormat";

export interface RenderPipelineDescriptor {
  readonly label?: string;
  readonly shader: RenderShaderProgram;
  readonly vertexFormat: VertexFormat;
  readonly topology?: PrimitiveTopology;
  readonly renderState?: Partial<RenderState>;
  readonly requiredAttributes?: readonly string[];
}

export interface PipelineDrawDescriptor {
  readonly label?: string;
  readonly vertexBuffer: RenderBuffer;
  readonly vertexCount: number;
  readonly instanceCount?: number;
  readonly indexBuffer?: RenderBuffer;
  readonly indexType?: IndexType;
  readonly indexCount?: number;
  readonly uniforms?: DrawCommand["uniforms"];
}

export class RenderPipeline {
  public readonly label: string;
  public readonly shader: RenderShaderProgram;
  public readonly vertexFormat: VertexFormat;
  public readonly topology: PrimitiveTopology;
  public readonly renderState: RenderState;
  public disposed = false;
  private readonly requiredAttributes: readonly string[];

  constructor(descriptor: RenderPipelineDescriptor) {
    if (descriptor.shader.disposed) {
      throw new Error("RenderPipeline shader must not be disposed.");
    }
    this.label = descriptor.label ?? descriptor.shader.label;
    this.shader = descriptor.shader;
    this.vertexFormat = descriptor.vertexFormat;
    this.topology = descriptor.topology ?? "triangles";
    this.renderState = validateRenderState({ ...DEFAULT_RENDER_STATE, ...(descriptor.renderState ?? {}) });
    this.requiredAttributes = descriptor.requiredAttributes ?? [...descriptor.shader.reflection.attributes.keys()];
    this.validateVertexFormat();
  }

  createDrawCommand(descriptor: PipelineDrawDescriptor): DrawCommand {
    if (this.disposed) {
      throw new Error("Cannot draw with a disposed RenderPipeline.");
    }
    if (this.shader.disposed) {
      throw new Error("Cannot draw with a disposed RenderPipeline shader.");
    }
    const command: DrawCommand = {
      label: descriptor.label ?? this.label,
      topology: this.topology,
      renderState: this.renderState,
      vertexBuffer: descriptor.vertexBuffer,
      vertexFormat: this.vertexFormat,
      vertexCount: descriptor.vertexCount,
      ...(descriptor.instanceCount !== undefined ? { instanceCount: descriptor.instanceCount } : {}),
      shader: this.shader,
      uniforms: descriptor.uniforms
    };
    if (descriptor.indexBuffer !== undefined) {
      Object.assign(command, {
        indexBuffer: descriptor.indexBuffer,
        indexType: descriptor.indexType,
        indexCount: descriptor.indexCount
      });
    }
    return command;
  }

  dispose(): void {
    this.disposed = true;
  }

  private validateVertexFormat(): void {
    const missing = this.requiredAttributes.filter((attribute) => !this.hasVertexAttribute(attribute));
    if (missing.length > 0) {
      throw new Error(`RenderPipeline vertex format is missing required attributes: ${missing.join(", ")}`);
    }
  }

  private hasVertexAttribute(attribute: string): boolean {
    return this.vertexFormat.attributes.some((candidate) => candidate.semantic === attribute || candidate.shaderName === attribute);
  }
}
