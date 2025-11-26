/**
 * @module Shader
 * @description Shader class wrapping vertex/fragment programs with introspection and hot-reload.
 */

import { Logger } from '../../core/Logger';
import { EventBus } from '../../core/EventBus';
import { IDisposable } from '../../types';
import { ShaderPreprocessor, DefinesMap } from './ShaderPreprocessor';
import { ShaderLanguage } from './ShaderChunks';
import { Vector2, Vector3, Vector4, Matrix3, Matrix4, Color } from '../../math';

const logger = Logger.create('Shader');

/**
 * Shader type
 */
export enum ShaderType {
  Vertex = 'vertex',
  Fragment = 'fragment',
  Compute = 'compute'
}

/**
 * Shader uniform type information
 */
export interface UniformInfo {
  /** Uniform name */
  name: string;
  /** Uniform type (e.g., 'float', 'vec3', 'sampler2D') */
  type: string;
  /** Uniform location */
  location: WebGLUniformLocation | null;
  /** Array size (1 for non-arrays) */
  size: number;
}

/**
 * Shader attribute type information
 */
export interface AttributeInfo {
  /** Attribute name */
  name: string;
  /** Attribute type (e.g., 'float', 'vec3', 'mat4') */
  type: string;
  /** Attribute location */
  location: number;
  /** Array size (1 for non-arrays) */
  size: number;
}

/**
 * Shader compilation error information
 */
export interface ShaderError {
  /** Error message */
  message: string;
  /** Shader type where error occurred */
  shaderType: ShaderType;
  /** Line number (if available) */
  line?: number;
  /** Column number (if available) */
  column?: number;
  /** Offending code snippet */
  snippet?: string;
}

/**
 * Shader source code
 */
export interface ShaderSource {
  /** Vertex shader source */
  vertex: string;
  /** Fragment shader source */
  fragment: string;
  /** Compute shader source (optional) */
  compute?: string;
}

/**
 * Shader creation options
 */
export interface ShaderOptions {
  /** Shader name for debugging */
  name: string;
  /** Shader source code */
  source: ShaderSource;
  /** Preprocessor defines */
  defines?: DefinesMap;
  /** Target shader language */
  language?: ShaderLanguage;
  /** Enable hot-reload in development */
  hotReload?: boolean;
  /** WebGL rendering context */
  gl?: WebGL2RenderingContext;
}

/**
 * Uniform value types
 */
export type UniformValue =
  | number
  | Vector2
  | Vector3
  | Vector4
  | Color
  | Matrix3
  | Matrix4
  | number[]
  | Float32Array
  | Int32Array
  | WebGLTexture;

/**
 * Shader program wrapping vertex and fragment shaders with introspection.
 *
 * Features:
 * - Automatic uniform and attribute introspection
 * - Type-safe uniform setters
 * - Compile error parsing with line numbers
 * - Hot-reload support for development
 * - Preprocessor integration
 * - Efficient uniform caching
 *
 * @example
 * ```typescript
 * // Create shader
 * const shader = new Shader({
 *   name: 'PBR',
 *   source: {
 *     vertex: vertexSource,
 *     fragment: fragmentSource
 *   },
 *   defines: {
 *     USE_SHADOWS: 1,
 *     MAX_LIGHTS: 4
 *   },
 *   gl: gl
 * });
 *
 * // Use shader
 * shader.bind();
 * shader.setUniform('modelMatrix', modelMatrix);
 * shader.setUniform('viewMatrix', viewMatrix);
 * shader.setUniform('albedo', new Vector3(1, 0, 0));
 *
 * // Draw
 * gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
 *
 * // Cleanup
 * shader.dispose();
 * ```
 */
export class Shader implements IDisposable {
  /** Shader name */
  readonly name: string;

  /** WebGL rendering context */
  private gl: WebGL2RenderingContext | null;

  /** WebGL program */
  private program: WebGLProgram | null;

  /** Vertex shader */
  private vertexShader: WebGLShader | null;

  /** Fragment shader */
  private fragmentShader: WebGLShader | null;

  /** Shader source code */
  private source: ShaderSource;

  /** Preprocessor defines */
  private defines: DefinesMap;

  /** Shader language */
  private language: ShaderLanguage;

  /** Uniform information map */
  private uniforms: Map<string, UniformInfo>;

  /** Attribute information map */
  private attributes: Map<string, AttributeInfo>;

  /** Uniform value cache to avoid redundant uploads */
  private uniformCache: Map<string, any>;

  /** Whether shader is compiled and ready */
  private ready: boolean;

  /** Compilation errors */
  private errors: ShaderError[];

  /** Disposed flag */
  private disposed: boolean;

  /** Hot-reload enabled */
  private hotReloadEnabled: boolean;

  /**
   * Creates a new shader
   *
   * @param options - Shader options
   */
  constructor(options: ShaderOptions) {
    this.name = options.name;
    this.gl = options.gl ?? null;
    this.source = options.source;
    this.defines = options.defines ?? {};
    this.language = options.language ?? ShaderLanguage.GLSL300;
    this.hotReloadEnabled = options.hotReload ?? false;

    this.program = null;
    this.vertexShader = null;
    this.fragmentShader = null;
    this.uniforms = new Map();
    this.attributes = new Map();
    this.uniformCache = new Map();
    this.ready = false;
    this.errors = [];
    this.disposed = false;

    // Compile if GL context provided
    if (this.gl) {
      this.compile();
    }

    logger.debug(`Created shader: ${this.name}`);
  }

  /**
   * Compile the shader program
   *
   * @returns True if compilation succeeded
   */
  compile(): boolean {
    if (!this.gl) {
      logger.error('Cannot compile shader without GL context');
      return false;
    }

    this.errors = [];
    this.ready = false;

    try {
      // Preprocess shaders
      const preprocessor = new ShaderPreprocessor({
        defines: this.defines,
        language: this.language
      });

      const vertexResult = preprocessor.process(this.source.vertex, 'vertex');
      const fragmentResult = preprocessor.process(this.source.fragment, 'fragment');

      // Log preprocessing warnings
      if (vertexResult.warnings.length > 0) {
        logger.warn(`Vertex shader preprocessing warnings for ${this.name}:`, vertexResult.warnings);
      }
      if (fragmentResult.warnings.length > 0) {
        logger.warn(`Fragment shader preprocessing warnings for ${this.name}:`, fragmentResult.warnings);
      }

      // Compile shaders
      this.vertexShader = this.compileShader(vertexResult.source, ShaderType.Vertex);
      if (!this.vertexShader) return false;

      this.fragmentShader = this.compileShader(fragmentResult.source, ShaderType.Fragment);
      if (!this.fragmentShader) return false;

      // Link program
      if (!this.linkProgram()) return false;

      // Introspect uniforms and attributes
      this.introspectUniforms();
      this.introspectAttributes();

      this.ready = true;
      logger.info(`Shader compiled successfully: ${this.name}`);

      // Emit compilation event
      EventBus.emit('asset:loaded', {
        assetId: this.name,
        assetType: 'shader'
      });

      return true;
    } catch (error) {
      logger.error(`Shader compilation failed: ${this.name}`, error);
      this.errors.push({
        message: error instanceof Error ? error.message : String(error),
        shaderType: ShaderType.Vertex
      });
      return false;
    }
  }

  /**
   * Compile a single shader
   *
   * @param source - Shader source code
   * @param type - Shader type
   * @returns Compiled shader or null
   */
  private compileShader(source: string, type: ShaderType): WebGLShader | null {
    if (!this.gl) return null;

    const glType = type === ShaderType.Vertex
      ? this.gl.VERTEX_SHADER
      : this.gl.FRAGMENT_SHADER;

    const shader = this.gl.createShader(glType);
    if (!shader) {
      this.errors.push({
        message: 'Failed to create shader object',
        shaderType: type
      });
      return null;
    }

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const log = this.gl.getShaderInfoLog(shader);
      const error = this.parseCompileError(log || 'Unknown compile error', type, source);
      this.errors.push(error);
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * Link the shader program
   *
   * @returns True if linking succeeded
   */
  private linkProgram(): boolean {
    if (!this.gl || !this.vertexShader || !this.fragmentShader) return false;

    this.program = this.gl.createProgram();
    if (!this.program) {
      this.errors.push({
        message: 'Failed to create program object',
        shaderType: ShaderType.Vertex
      });
      return false;
    }

    this.gl.attachShader(this.program, this.vertexShader);
    this.gl.attachShader(this.program, this.fragmentShader);
    this.gl.linkProgram(this.program);

    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      const log = this.gl.getProgramInfoLog(this.program);
      this.errors.push({
        message: `Program link failed: ${log}`,
        shaderType: ShaderType.Vertex
      });
      return false;
    }

    return true;
  }

  /**
   * Parse shader compilation error
   *
   * @param log - Compiler log
   * @param type - Shader type
   * @param source - Shader source
   * @returns Parsed error
   */
  private parseCompileError(log: string, type: ShaderType, source: string): ShaderError {
    // Try to parse error format: "ERROR: 0:line: message"
    const match = log.match(/ERROR:\s*\d+:(\d+):\s*(.+)/);

    if (match) {
      const line = parseInt(match[1], 10);
      const message = match[2];
      const snippet = this.getCodeSnippet(source, line);

      return {
        message,
        shaderType: type,
        line,
        snippet
      };
    }

    return {
      message: log,
      shaderType: type
    };
  }

  /**
   * Get code snippet around an error line
   *
   * @param source - Shader source
   * @param line - Error line number
   * @param context - Number of context lines
   * @returns Code snippet
   */
  private getCodeSnippet(source: string, line: number, context: number = 2): string {
    const lines = source.split('\n');
    const start = Math.max(0, line - context - 1);
    const end = Math.min(lines.length, line + context);

    const snippet: string[] = [];
    for (let i = start; i < end; i++) {
      const prefix = i === line - 1 ? '>>> ' : '    ';
      snippet.push(`${prefix}${i + 1}: ${lines[i]}`);
    }

    return snippet.join('\n');
  }

  /**
   * Introspect uniform locations and types
   */
  private introspectUniforms(): void {
    if (!this.gl || !this.program) return;

    this.uniforms.clear();

    const count = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = this.gl.getActiveUniform(this.program, i);
      if (!info) continue;

      const location = this.gl.getUniformLocation(this.program, info.name);

      this.uniforms.set(info.name, {
        name: info.name,
        type: this.getUniformTypeName(info.type),
        location,
        size: info.size
      });
    }

    logger.debug(`Introspected ${this.uniforms.size} uniforms for shader: ${this.name}`);
  }

  /**
   * Introspect attribute locations and types
   */
  private introspectAttributes(): void {
    if (!this.gl || !this.program) return;

    this.attributes.clear();

    const count = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < count; i++) {
      const info = this.gl.getActiveAttrib(this.program, i);
      if (!info) continue;

      const location = this.gl.getAttribLocation(this.program, info.name);

      this.attributes.set(info.name, {
        name: info.name,
        type: this.getAttributeTypeName(info.type),
        location,
        size: info.size
      });
    }

    logger.debug(`Introspected ${this.attributes.size} attributes for shader: ${this.name}`);
  }

  /**
   * Get uniform type name from GL constant
   *
   * @param type - GL type constant
   * @returns Type name
   */
  private getUniformTypeName(type: number): string {
    if (!this.gl) return 'unknown';

    const typeMap: Record<number, string> = {
      [this.gl.FLOAT]: 'float',
      [this.gl.FLOAT_VEC2]: 'vec2',
      [this.gl.FLOAT_VEC3]: 'vec3',
      [this.gl.FLOAT_VEC4]: 'vec4',
      [this.gl.INT]: 'int',
      [this.gl.INT_VEC2]: 'ivec2',
      [this.gl.INT_VEC3]: 'ivec3',
      [this.gl.INT_VEC4]: 'ivec4',
      [this.gl.BOOL]: 'bool',
      [this.gl.BOOL_VEC2]: 'bvec2',
      [this.gl.BOOL_VEC3]: 'bvec3',
      [this.gl.BOOL_VEC4]: 'bvec4',
      [this.gl.FLOAT_MAT2]: 'mat2',
      [this.gl.FLOAT_MAT3]: 'mat3',
      [this.gl.FLOAT_MAT4]: 'mat4',
      [this.gl.SAMPLER_2D]: 'sampler2D',
      [this.gl.SAMPLER_CUBE]: 'samplerCube',
      [this.gl.SAMPLER_3D]: 'sampler3D',
      [this.gl.SAMPLER_2D_SHADOW]: 'sampler2DShadow'
    };

    return typeMap[type] || 'unknown';
  }

  /**
   * Get attribute type name from GL constant
   *
   * @param type - GL type constant
   * @returns Type name
   */
  private getAttributeTypeName(type: number): string {
    if (!this.gl) return 'unknown';

    const typeMap: Record<number, string> = {
      [this.gl.FLOAT]: 'float',
      [this.gl.FLOAT_VEC2]: 'vec2',
      [this.gl.FLOAT_VEC3]: 'vec3',
      [this.gl.FLOAT_VEC4]: 'vec4',
      [this.gl.FLOAT_MAT2]: 'mat2',
      [this.gl.FLOAT_MAT3]: 'mat3',
      [this.gl.FLOAT_MAT4]: 'mat4'
    };

    return typeMap[type] || 'unknown';
  }

  /**
   * Bind this shader for rendering
   */
  bind(): void {
    if (!this.gl || !this.program || !this.ready) {
      logger.warn(`Cannot bind shader ${this.name}: not ready`);
      return;
    }

    this.gl.useProgram(this.program);
  }

  /**
   * Unbind this shader
   */
  unbind(): void {
    if (!this.gl) return;
    this.gl.useProgram(null);
  }

  /**
   * Set a uniform value
   *
   * @param name - Uniform name
   * @param value - Uniform value
   */
  setUniform(name: string, value: UniformValue): void {
    if (!this.gl || !this.ready) return;

    // Check cache to avoid redundant uploads
    const cached = this.uniformCache.get(name);
    if (cached === value) return;

    const uniform = this.uniforms.get(name);
    if (!uniform || !uniform.location) {
      logger.warn(`Uniform not found: ${name} in shader ${this.name}`);
      return;
    }

    // Set uniform based on type
    if (typeof value === 'number') {
      this.gl.uniform1f(uniform.location, value);
    } else if (value instanceof Vector2) {
      this.gl.uniform2f(uniform.location, value.x, value.y);
    } else if (value instanceof Vector3) {
      this.gl.uniform3f(uniform.location, value.x, value.y, value.z);
    } else if (value instanceof Vector4) {
      this.gl.uniform4f(uniform.location, value.x, value.y, value.z, value.w);
    } else if (value instanceof Color) {
      this.gl.uniform4f(uniform.location, value.r, value.g, value.b, value.a);
    } else if (value instanceof Matrix3) {
      this.gl.uniformMatrix3fv(uniform.location, false, value.elements);
    } else if (value instanceof Matrix4) {
      this.gl.uniformMatrix4fv(uniform.location, false, value.elements);
    } else if (Array.isArray(value)) {
      // Handle arrays
      this.gl.uniform1fv(uniform.location, value);
    } else if (value instanceof Float32Array) {
      this.gl.uniform1fv(uniform.location, value);
    } else if (value instanceof Int32Array) {
      this.gl.uniform1iv(uniform.location, value);
    }

    // Cache value
    this.uniformCache.set(name, value);
  }

  /**
   * Get uniform information
   *
   * @param name - Uniform name
   * @returns Uniform info or undefined
   */
  getUniform(name: string): UniformInfo | undefined {
    return this.uniforms.get(name);
  }

  /**
   * Get all uniforms
   *
   * @returns Array of uniform info
   */
  getAllUniforms(): UniformInfo[] {
    return Array.from(this.uniforms.values());
  }

  /**
   * Get attribute information
   *
   * @param name - Attribute name
   * @returns Attribute info or undefined
   */
  getAttribute(name: string): AttributeInfo | undefined {
    return this.attributes.get(name);
  }

  /**
   * Get all attributes
   *
   * @returns Array of attribute info
   */
  getAllAttributes(): AttributeInfo[] {
    return Array.from(this.attributes.values());
  }

  /**
   * Update defines and recompile
   *
   * @param defines - New defines
   * @returns True if recompilation succeeded
   */
  updateDefines(defines: DefinesMap): boolean {
    this.defines = { ...this.defines, ...defines };
    this.uniformCache.clear();
    return this.compile();
  }

  /**
   * Reload shader from source
   *
   * @param source - New shader source
   * @returns True if reload succeeded
   */
  reload(source: ShaderSource): boolean {
    this.source = source;
    this.uniformCache.clear();
    return this.compile();
  }

  /**
   * Get compilation errors
   *
   * @returns Array of errors
   */
  getErrors(): ShaderError[] {
    return [...this.errors];
  }

  /**
   * Check if shader is ready for use
   */
  get isReady(): boolean {
    return this.ready;
  }

  /**
   * Get WebGL program
   */
  get glProgram(): WebGLProgram | null {
    return this.program;
  }

  /**
   * Dispose of shader resources
   */
  dispose(): void {
    if (this.disposed) return;

    if (this.gl) {
      if (this.program) {
        this.gl.deleteProgram(this.program);
        this.program = null;
      }
      if (this.vertexShader) {
        this.gl.deleteShader(this.vertexShader);
        this.vertexShader = null;
      }
      if (this.fragmentShader) {
        this.gl.deleteShader(this.fragmentShader);
        this.fragmentShader = null;
      }
    }

    this.uniforms.clear();
    this.attributes.clear();
    this.uniformCache.clear();
    this.ready = false;
    this.disposed = true;

    logger.debug(`Disposed shader: ${this.name}`);
  }

  /**
   * Check if shader is disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }
}
