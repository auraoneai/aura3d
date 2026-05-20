import { Geometry } from "./Geometry";
import { DEFAULT_RENDER_STATE } from "./Material";
import { type RenderDevice, RenderDeviceError, type RenderShaderProgram, type UniformValue } from "./RenderDevice";
import { RenderPipeline } from "./RenderPipeline";
import { BaseRenderPass, type RenderPassContext } from "./RenderPass";
import { ShaderModule } from "./ShaderModule";
import { createDefaultShaderLibrary, DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_NAME, type ShaderLibrary } from "./ShaderLibrary";
import { TextureBinding } from "./TextureBinding";
import { VertexBuffer } from "./VertexBuffer";
import { VertexFormat } from "./VertexFormat";

export type EnvironmentBackgroundProjection = "equirect" | "cubemap";
export type EnvironmentBackgroundEncoding = "linear" | "srgb" | "rgbe";

export interface EnvironmentBackgroundOptions {
  readonly projection: EnvironmentBackgroundProjection;
  readonly texture: TextureBinding;
  readonly encoding?: EnvironmentBackgroundEncoding;
  readonly intensity?: number;
  readonly rotation?: number;
  readonly outputColorSpace?: "linear" | "srgb";
  readonly inverseViewProjectionMatrix?: Float32Array | readonly number[];
  readonly shaderLibrary?: ShaderLibrary;
}

export const ENVIRONMENT_BACKGROUND_COLOR_RESOURCE = "environment-background-color";

const BACKGROUND_RENDER_STATE = {
  ...DEFAULT_RENDER_STATE,
  depthTest: false,
  depthWrite: false,
  cullMode: "none" as const
};

export class EnvironmentBackgroundPass extends BaseRenderPass {
  private static readonly shaderCaches = new WeakMap<RenderDevice, WeakMap<ShaderLibrary, ShaderModule>>();
  private readonly shaderLibrary: ShaderLibrary;

  constructor(private readonly options: EnvironmentBackgroundOptions) {
    super("environment-background", [], [ENVIRONMENT_BACKGROUND_COLOR_RESOURCE]);
    this.shaderLibrary = options.shaderLibrary ?? createDefaultShaderLibrary();
  }

  execute(context: RenderPassContext): void {
    validateEnvironmentBackgroundOptions(this.options);
    const geometry = createFullscreenTriangleGeometry();
    try {
      const shader = this.getShader(context.device);
      const pipeline = new RenderPipeline({
        label: "environment-background",
        shader,
        vertexFormat: geometry.vertexBuffer.format,
        topology: geometry.topology,
        renderState: BACKGROUND_RENDER_STATE
      });
      const command = pipeline.createDrawCommand({
        label: "environment-background",
        vertexBuffer: geometry.vertexBuffer.upload(context.device),
        vertexCount: geometry.vertexBuffer.vertexCount,
        uniforms: createEnvironmentBackgroundUniforms(this.options)
      });
      context.device.draw(command);
    } finally {
      geometry.dispose();
    }
  }

  private getShader(device: RenderDevice): RenderShaderProgram {
    let libraryCaches = EnvironmentBackgroundPass.shaderCaches.get(device);
    if (!libraryCaches) {
      libraryCaches = new WeakMap<ShaderLibrary, ShaderModule>();
      EnvironmentBackgroundPass.shaderCaches.set(device, libraryCaches);
    }
    let module = libraryCaches.get(this.shaderLibrary);
    if (!module) {
      module = ShaderModule.fromLibrary(this.shaderLibrary, DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_NAME);
      libraryCaches.set(this.shaderLibrary, module);
    }
    return module.compile(device);
  }
}

export function createEnvironmentBackgroundUniforms(options: EnvironmentBackgroundOptions): ReadonlyMap<string, UniformValue> {
  validateEnvironmentBackgroundOptions(options);
  const projectionMode = options.projection === "cubemap" ? 2 : 1;
  const encoding = options.encoding ?? "linear";
  const uniforms = new Map<string, UniformValue>();
  uniforms.set(
    "u_environmentBackgroundTexture",
    options.projection === "equirect"
      ? options.texture
      : new TextureBinding({ name: "u_environmentBackgroundTexture", required: false })
  );
  uniforms.set(
    "u_environmentBackgroundCubeTexture",
    options.projection === "cubemap"
      ? options.texture
      : new TextureBinding({ name: "u_environmentBackgroundCubeTexture", required: false })
  );
  uniforms.set("u_environmentBackgroundProjection", projectionMode);
  uniforms.set("u_environmentBackgroundRotation", options.rotation ?? 0);
  uniforms.set("u_environmentBackgroundIntensity", options.intensity ?? 1);
  uniforms.set("u_environmentBackgroundEncoding", backgroundEncodingUniform(encoding));
  uniforms.set("u_outputColorSpace", (options.outputColorSpace ?? "srgb") === "srgb" ? 1 : 0);
  uniforms.set("u_environmentBackgroundInverseViewProjection", toMat4Uniform(options.inverseViewProjectionMatrix, "inverseViewProjectionMatrix"));
  return uniforms;
}

function createFullscreenTriangleGeometry(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3, 3);
  vertices.setAttribute(0, "position", [-1, -1, 0]);
  vertices.setAttribute(1, "position", [3, -1, 0]);
  vertices.setAttribute(2, "position", [-1, 3, 0]);
  return new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
}

function validateEnvironmentBackgroundOptions(options: EnvironmentBackgroundOptions): void {
  if (options.projection !== "equirect" && options.projection !== "cubemap") {
    throw new RenderDeviceError("Environment background projection must be equirect or cubemap", "ENVIRONMENT_BACKGROUND_CONTRACT", {
      projection: options.projection
    });
  }
  const validation = options.texture.validate();
  if (!options.texture.texture) {
    throw new RenderDeviceError("Environment background requires a texture binding", "ENVIRONMENT_BACKGROUND_CONTRACT", {
      projection: options.projection,
      diagnostics: ["Missing required texture: environment background"]
    });
  }
  if (!validation.ok) {
    throw new RenderDeviceError("Environment background texture binding validation failed", "ENVIRONMENT_BACKGROUND_CONTRACT", {
      projection: options.projection,
      diagnostics: validation.diagnostics
    });
  }
  if (options.projection === "cubemap" && options.texture.texture.dimension !== "cube") {
    throw new RenderDeviceError("Cubemap environment background requires a cube texture", "ENVIRONMENT_BACKGROUND_CONTRACT", {
      textureDimension: options.texture.texture.dimension
    });
  }
  if (options.projection === "equirect" && options.texture.texture.dimension !== "2d") {
    throw new RenderDeviceError("Equirect environment background requires a 2D panorama texture", "ENVIRONMENT_BACKGROUND_CONTRACT", {
      textureDimension: options.texture.texture.dimension
    });
  }
  if (options.intensity !== undefined && (!Number.isFinite(options.intensity) || options.intensity < 0)) {
    throw new RenderDeviceError("Environment background intensity must be finite and non-negative", "ENVIRONMENT_BACKGROUND_CONTRACT", {
      intensity: options.intensity
    });
  }
  if (options.rotation !== undefined && !Number.isFinite(options.rotation)) {
    throw new RenderDeviceError("Environment background rotation must be finite", "ENVIRONMENT_BACKGROUND_CONTRACT", {
      rotation: options.rotation
    });
  }
  const outputColorSpace = options.outputColorSpace ?? "srgb";
  if (outputColorSpace !== "linear" && outputColorSpace !== "srgb") {
    throw new RenderDeviceError("Environment background outputColorSpace must be linear or srgb", "ENVIRONMENT_BACKGROUND_CONTRACT", {
      outputColorSpace
    });
  }
  backgroundEncodingUniform(options.encoding ?? "linear");
  toMat4Uniform(options.inverseViewProjectionMatrix, "inverseViewProjectionMatrix");
}

function backgroundEncodingUniform(encoding: EnvironmentBackgroundEncoding): number {
  switch (encoding) {
    case "linear":
    case "srgb":
      return 0;
    case "rgbe":
      return 2;
    default:
      throw new RenderDeviceError("Environment background encoding must be linear, srgb, or rgbe", "ENVIRONMENT_BACKGROUND_CONTRACT", {
        encoding
      });
  }
}

function toMat4Uniform(value: Float32Array | readonly number[] | undefined, label: string): Float32Array {
  const source = value ?? [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
  if (source.length !== 16 || !Array.from(source).every(Number.isFinite)) {
    throw new RenderDeviceError("Environment background inverse view-projection matrix must contain 16 finite numbers", "ENVIRONMENT_BACKGROUND_CONTRACT", {
      label,
      matrixLength: source.length
    });
  }
  return new Float32Array(source);
}
