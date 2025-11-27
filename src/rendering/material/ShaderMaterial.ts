import { Logger } from '../../core/Logger';
import { IdGenerator } from '../../core/IdGenerator';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';
import { Vector3 } from '../../math/Vector3';
import { Vector4 } from '../../math/Vector4';
import { Matrix3 } from '../../math/Matrix3';
import { Matrix4 } from '../../math/Matrix4';
import { Texture } from '../texture/Texture';

const logger = Logger.create('ShaderMaterial');

/**
 * Shader uniform types.
 */
export enum UniformType {
  Float = 'float',
  Vec2 = 'vec2',
  Vec3 = 'vec3',
  Vec4 = 'vec4',
  Int = 'int',
  IVec2 = 'ivec2',
  IVec3 = 'ivec3',
  IVec4 = 'ivec4',
  Bool = 'bool',
  Mat3 = 'mat3',
  Mat4 = 'mat4',
  Sampler2D = 'sampler2D',
  SamplerCube = 'samplerCube',
}

/**
 * Shader uniform value types.
 */
export type UniformValue =
  | number
  | boolean
  | Vector2
  | Vector3
  | Vector4
  | Matrix3
  | Matrix4
  | Color
  | Texture
  | number[]
  | Float32Array;

/**
 * Shader uniform definition.
 */
export interface ShaderUniform {
  /** Uniform name in shader */
  name: string;
  /** Uniform type */
  type: UniformType;
  /** Uniform value */
  value: UniformValue;
}

/**
 * Shader source code.
 */
export interface ShaderSource {
  /** Vertex shader source */
  vertex: string;
  /** Fragment shader source */
  fragment: string;
  /** Optional defines/macros */
  defines?: Record<string, string | number | boolean>;
}

/**
 * Custom shader material with user-defined uniforms and shaders.
 * Provides low-level control over rendering with automatic uniform management.
 *
 * @example
 * ```typescript
 * // Create a custom toon shader material
 * const toonMaterial = new ShaderMaterial({
 *   name: 'ToonShader',
 *   vertex: `
 *     attribute vec3 aPosition;
 *     attribute vec3 aNormal;
 *     uniform mat4 uModelViewProjection;
 *     uniform mat3 uNormalMatrix;
 *     varying vec3 vNormal;
 *
 *     void main() {
 *       vNormal = normalize(uNormalMatrix * aNormal);
 *       gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
 *     }
 *   `,
 *   fragment: `
 *     precision highp float;
 *     varying vec3 vNormal;
 *     uniform vec3 uLightDir;
 *     uniform vec3 uColor;
 *     uniform int uSteps;
 *
 *     void main() {
 *       float intensity = dot(vNormal, uLightDir);
 *       intensity = floor(intensity * float(uSteps)) / float(uSteps);
 *       gl_FragColor = vec4(uColor * intensity, 1.0);
 *     }
 *   `,
 * });
 *
 * // Set uniforms
 * toonMaterial.setUniform('uLightDir', new Vector3(0, 1, 0));
 * toonMaterial.setUniform('uColor', new Vector3(1, 0.5, 0.2));
 * toonMaterial.setUniform('uSteps', 4);
 *
 * // Set textures
 * toonMaterial.setTexture('uMainTex', albedoTexture);
 *
 * // Hot-reload shader
 * toonMaterial.updateShader(newVertexSource, newFragmentSource);
 *
 * // Clone with modifications
 * const variant = toonMaterial.clone();
 * variant.setUniform('uSteps', 8);
 * ```
 */
export class ShaderMaterial {
  /** Unique material identifier */
  readonly id: string;

  /** Material name */
  name: string;

  /** Vertex shader source */
  private vertexShader: string;

  /** Fragment shader source */
  private fragmentShader: string;

  /** Shader defines/macros */
  private defines: Record<string, string | number | boolean>;

  /** User-defined uniforms */
  private uniforms = new Map<string, ShaderUniform>();

  /** Texture uniforms */
  private textures = new Map<string, Texture>();

  /** Whether shader needs recompilation */
  private shaderDirty = true;

  /** Whether uniforms need update */
  private uniformsDirty = true;

  /** Compiled shader program handle */
  private program: WebGLProgram | null = null;

  /**
   * Creates a new ShaderMaterial instance.
   *
   * @param options - Shader material options
   *
   * @example
   * ```typescript
   * const material = new ShaderMaterial({
   *   name: 'CustomShader',
   *   vertex: vertexSource,
   *   fragment: fragmentSource,
   *   defines: {
   *     USE_TEXTURE: true,
   *     MAX_LIGHTS: 4,
   *   },
   * });
   * ```
   */
  constructor(options: {
    name?: string;
    vertex: string;
    fragment: string;
    defines?: Record<string, string | number | boolean>;
  }) {
    this.id = IdGenerator.nextAssetId();
    this.name = options.name || `ShaderMaterial_${this.id}`;
    this.vertexShader = options.vertex;
    this.fragmentShader = options.fragment;
    this.defines = options.defines || {};

    logger.debug(`Created shader material: ${this.name}`, { id: this.id });
  }

  /**
   * Sets a uniform value.
   * Type is automatically inferred from the value.
   *
   * @param name - Uniform name
   * @param value - Uniform value
   *
   * @example
   * ```typescript
   * material.setUniform('uTime', 0.5);
   * material.setUniform('uColor', new Vector3(1, 0, 0));
   * material.setUniform('uTransform', matrix4);
   * material.setUniform('uLightCount', 4);
   * material.setUniform('uEnabled', true);
   * ```
   */
  setUniform(name: string, value: UniformValue): void {
    const type = this.inferUniformType(value);

    this.uniforms.set(name, {
      name,
      type,
      value,
    });

    this.uniformsDirty = true;
    logger.trace(`Set uniform ${this.name}.${name}`, { type, value });
  }

  /**
   * Gets a uniform value.
   *
   * @param name - Uniform name
   * @returns Uniform value or undefined
   *
   * @example
   * ```typescript
   * const time = material.getUniform('uTime') as number;
   * const color = material.getUniform('uColor') as Vector3;
   * ```
   */
  getUniform(name: string): UniformValue | undefined {
    return this.uniforms.get(name)?.value;
  }

  /**
   * Gets all uniforms.
   *
   * @returns Map of uniforms
   */
  getAllUniforms(): ReadonlyMap<string, ShaderUniform> {
    return this.uniforms;
  }

  /**
   * Checks if a uniform exists.
   *
   * @param name - Uniform name
   * @returns True if uniform exists
   */
  hasUniform(name: string): boolean {
    return this.uniforms.has(name);
  }

  /**
   * Removes a uniform.
   *
   * @param name - Uniform name
   * @returns True if uniform was removed
   */
  removeUniform(name: string): boolean {
    const removed = this.uniforms.delete(name);
    if (removed) {
      this.uniformsDirty = true;
    }
    return removed;
  }

  /**
   * Sets a texture uniform.
   *
   * @param name - Uniform name (e.g., 'uMainTex')
   * @param texture - Texture or null
   *
   * @example
   * ```typescript
   * material.setTexture('uMainTex', albedoTexture);
   * material.setTexture('uNormalMap', normalTexture);
   * material.setTexture('uEnvMap', cubemapTexture);
   * ```
   */
  setTexture(name: string, texture: Texture | null): void {
    if (texture) {
      this.textures.set(name, texture);
      this.setUniform(name, texture);
    } else {
      this.textures.delete(name);
      this.removeUniform(name);
    }
  }

  /**
   * Gets a texture uniform.
   *
   * @param name - Uniform name
   * @returns Texture or undefined
   */
  getTexture(name: string): Texture | undefined {
    return this.textures.get(name);
  }

  /**
   * Gets all textures.
   *
   * @returns Map of textures
   */
  getAllTextures(): ReadonlyMap<string, Texture> {
    return this.textures;
  }

  /**
   * Sets a shader define/macro.
   *
   * @param name - Define name
   * @param value - Define value
   *
   * @example
   * ```typescript
   * material.setDefine('USE_TEXTURE', true);
   * material.setDefine('MAX_LIGHTS', 4);
   * material.setDefine('QUALITY', 'high');
   * ```
   */
  setDefine(name: string, value: string | number | boolean): void {
    this.defines[name] = value;
    this.shaderDirty = true;
    logger.trace(`Set define ${this.name}.${name}`, { value });
  }

  /**
   * Gets a shader define.
   *
   * @param name - Define name
   * @returns Define value or undefined
   */
  getDefine(name: string): string | number | boolean | undefined {
    return this.defines[name];
  }

  /**
   * Gets all defines.
   *
   * @returns Defines object
   */
  getAllDefines(): Readonly<Record<string, string | number | boolean>> {
    return this.defines;
  }

  /**
   * Removes a shader define.
   *
   * @param name - Define name
   * @returns True if define was removed
   */
  removeDefine(name: string): boolean {
    if (name in this.defines) {
      delete this.defines[name];
      this.shaderDirty = true;
      return true;
    }
    return false;
  }

  /**
   * Gets the vertex shader source.
   *
   * @returns Vertex shader code
   */
  getVertexShader(): string {
    return this.vertexShader;
  }

  /**
   * Gets the fragment shader source.
   *
   * @returns Fragment shader code
   */
  getFragmentShader(): string {
    return this.fragmentShader;
  }

  /**
   * Updates shader source code (hot-reload).
   *
   * @param vertex - New vertex shader source
   * @param fragment - New fragment shader source
   *
   * @example
   * ```typescript
   * // Hot-reload shader during development
   * material.updateShader(newVertexSource, newFragmentSource);
   * ```
   */
  updateShader(vertex: string, fragment: string): void {
    this.vertexShader = vertex;
    this.fragmentShader = fragment;
    this.shaderDirty = true;
    logger.info(`Updated shader for ${this.name}`);
  }

  /**
   * Gets preprocessed vertex shader with defines injected.
   *
   * @returns Preprocessed vertex shader
   */
  getPreprocessedVertexShader(): string {
    return this.preprocessShader(this.vertexShader);
  }

  /**
   * Gets preprocessed fragment shader with defines injected.
   *
   * @returns Preprocessed fragment shader
   */
  getPreprocessedFragmentShader(): string {
    return this.preprocessShader(this.fragmentShader);
  }

  /**
   * Checks if shader needs recompilation.
   *
   * @returns True if shader is dirty
   */
  isShaderDirty(): boolean {
    return this.shaderDirty;
  }

  /**
   * Marks shader as clean after compilation.
   */
  markShaderClean(): void {
    this.shaderDirty = false;
  }

  /**
   * Checks if uniforms need update.
   *
   * @returns True if uniforms are dirty
   */
  areUniformsDirty(): boolean {
    return this.uniformsDirty;
  }

  /**
   * Marks uniforms as clean after update.
   */
  markUniformsClean(): void {
    this.uniformsDirty = false;
  }

  /**
   * Gets the compiled shader program handle.
   *
   * @returns WebGL program or null
   */
  getProgram(): WebGLProgram | null {
    return this.program;
  }

  /**
   * Sets the compiled shader program handle.
   * Should only be called by the rendering backend.
   *
   * @param program - WebGL program
   */
  setProgram(program: WebGLProgram | null): void {
    this.program = program;
  }

  /**
   * Clones this shader material.
   * Creates a deep copy with independent uniforms.
   *
   * @returns Cloned shader material
   *
   * @example
   * ```typescript
   * const variant = material.clone();
   * variant.name = 'Variant';
   * variant.setUniform('uColor', new Vector3(0, 1, 0));
   * ```
   */
  clone(): ShaderMaterial {
    const cloned = new ShaderMaterial({
      name: `${this.name}_Clone`,
      vertex: this.vertexShader,
      fragment: this.fragmentShader,
      defines: { ...this.defines },
    });

    // Copy uniforms
    for (const [name, uniform] of this.uniforms) {
      cloned.setUniform(name, this.cloneUniformValue(uniform.value));
    }

    return cloned;
  }

  /**
   * Converts to JSON representation.
   *
   * @returns JSON object
   */
  toJSON(): Record<string, any> {
    const uniformsObj: Record<string, any> = {};
    for (const [name, uniform] of this.uniforms) {
      uniformsObj[name] = {
        type: uniform.type,
        value: this.serializeUniformValue(uniform.value),
      };
    }

    const texturesObj: Record<string, string> = {};
    for (const [name, texture] of this.textures) {
      texturesObj[name] = texture.id;
    }

    return {
      id: this.id,
      name: this.name,
      vertexShader: this.vertexShader,
      fragmentShader: this.fragmentShader,
      defines: this.defines,
      uniforms: uniformsObj,
      textures: texturesObj,
    };
  }

  /**
   * Infers uniform type from value.
   *
   * @param value - Uniform value
   * @returns Inferred type
   */
  private inferUniformType(value: UniformValue): UniformType {
    if (typeof value === 'number') {
      return UniformType.Float;
    }

    if (typeof value === 'boolean') {
      return UniformType.Bool;
    }

    if (value instanceof Vector2) {
      return UniformType.Vec2;
    }

    if (value instanceof Vector3) {
      return UniformType.Vec3;
    }

    if (value instanceof Vector4 || value instanceof Color) {
      return UniformType.Vec4;
    }

    if (value instanceof Matrix3) {
      return UniformType.Mat3;
    }

    if (value instanceof Matrix4) {
      return UniformType.Mat4;
    }

    if (value instanceof Texture) {
      return value.type.includes('Cube')
        ? UniformType.SamplerCube
        : UniformType.Sampler2D;
    }

    if (Array.isArray(value) || value instanceof Float32Array) {
      const len = value.length;
      if (len === 2) return UniformType.Vec2;
      if (len === 3) return UniformType.Vec3;
      if (len === 4) return UniformType.Vec4;
      if (len === 9) return UniformType.Mat3;
      if (len === 16) return UniformType.Mat4;
    }

    return UniformType.Float;
  }

  /**
   * Preprocesses shader with defines.
   *
   * @param source - Shader source
   * @returns Preprocessed source
   */
  private preprocessShader(source: string): string {
    // Inject defines at the top (after #version if present)
    let defineBlock = '';
    for (const [name, value] of Object.entries(this.defines)) {
      if (typeof value === 'boolean') {
        if (value) {
          defineBlock += `#define ${name}\n`;
        }
      } else {
        defineBlock += `#define ${name} ${value}\n`;
      }
    }

    // Find #version directive
    const versionMatch = source.match(/^\s*#version\s+\d+.*$/m);
    if (versionMatch) {
      const versionEnd = versionMatch.index! + versionMatch[0].length;
      return (
        source.substring(0, versionEnd) +
        '\n' +
        defineBlock +
        source.substring(versionEnd)
      );
    }

    return defineBlock + source;
  }

  /**
   * Clones a uniform value.
   *
   * @param value - Uniform value
   * @returns Cloned value
   */
  private cloneUniformValue(value: UniformValue): UniformValue {
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (value instanceof Vector2 || value instanceof Vector3 || value instanceof Vector4) {
      return value.clone();
    }

    if (value instanceof Color) {
      return value.clone();
    }

    if (value instanceof Matrix3 || value instanceof Matrix4) {
      return value.clone();
    }

    if (value instanceof Texture) {
      return value; // Textures are shared
    }

    if (Array.isArray(value)) {
      return [...value];
    }

    if (value instanceof Float32Array) {
      return new Float32Array(value);
    }

    return value;
  }

  /**
   * Serializes a uniform value for JSON.
   *
   * @param value - Uniform value
   * @returns Serialized value
   */
  private serializeUniformValue(value: UniformValue): any {
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (
      value instanceof Vector2 ||
      value instanceof Vector3 ||
      value instanceof Vector4 ||
      value instanceof Color
    ) {
      return value.toArray();
    }

    if (value instanceof Matrix3 || value instanceof Matrix4) {
      return value.toArray();
    }

    if (value instanceof Texture) {
      return value.id;
    }

    if (Array.isArray(value) || value instanceof Float32Array) {
      return Array.from(value);
    }

    return value;
  }

  /**
   * Applies (binds) this material to the GPU, uploading all uniforms and textures.
   * This is the critical method that performs actual GPU operations.
   *
   * @param gl - WebGL2 rendering context
   * @param program - Shader program to bind uniforms to
   *
   * @example
   * ```typescript
   * const gl = renderer.getDevice().getGL();
   * material.apply(gl, material.getProgram());
   * // Material is now active, draw calls will use these uniforms
   * ```
   */
  apply(gl: WebGL2RenderingContext, program: WebGLProgram): void {
    let textureUnit = 0;

    // Upload all uniforms
    for (const [name, uniform] of this.uniforms) {
      const location = gl.getUniformLocation(program, name);
      if (!location) {
        continue; // Uniform doesn't exist in shader or was optimized out
      }

      const { type, value } = uniform;

      // Handle different uniform types
      switch (type) {
        case UniformType.Float:
          if (typeof value === 'number') {
            gl.uniform1f(location, value);
          }
          break;

        case UniformType.Vec2:
          if (value instanceof Vector2) {
            gl.uniform2f(location, value.x, value.y);
          } else if (Array.isArray(value) || value instanceof Float32Array) {
            gl.uniform2fv(location, value);
          }
          break;

        case UniformType.Vec3:
          if (value instanceof Vector3) {
            gl.uniform3f(location, value.x, value.y, value.z);
          } else if (Array.isArray(value) || value instanceof Float32Array) {
            gl.uniform3fv(location, value);
          }
          break;

        case UniformType.Vec4:
          if (value instanceof Vector4) {
            gl.uniform4f(location, value.x, value.y, value.z, value.w);
          } else if (value instanceof Color) {
            gl.uniform4f(location, value.r, value.g, value.b, value.a);
          } else if (Array.isArray(value) || value instanceof Float32Array) {
            gl.uniform4fv(location, value);
          }
          break;

        case UniformType.Int:
          if (typeof value === 'number') {
            gl.uniform1i(location, Math.floor(value));
          }
          break;

        case UniformType.IVec2:
          if (Array.isArray(value)) {
            gl.uniform2i(location, Math.floor(value[0]), Math.floor(value[1]));
          }
          break;

        case UniformType.IVec3:
          if (Array.isArray(value)) {
            gl.uniform3i(
              location,
              Math.floor(value[0]),
              Math.floor(value[1]),
              Math.floor(value[2])
            );
          }
          break;

        case UniformType.IVec4:
          if (Array.isArray(value)) {
            gl.uniform4i(
              location,
              Math.floor(value[0]),
              Math.floor(value[1]),
              Math.floor(value[2]),
              Math.floor(value[3])
            );
          }
          break;

        case UniformType.Bool:
          if (typeof value === 'boolean') {
            gl.uniform1i(location, value ? 1 : 0);
          }
          break;

        case UniformType.Mat3:
          if (value instanceof Matrix3) {
            gl.uniformMatrix3fv(location, false, value.elements);
          } else if (value instanceof Float32Array) {
            gl.uniformMatrix3fv(location, false, value);
          }
          break;

        case UniformType.Mat4:
          if (value instanceof Matrix4) {
            gl.uniformMatrix4fv(location, false, value.elements);
          } else if (value instanceof Float32Array) {
            gl.uniformMatrix4fv(location, false, value);
          }
          break;

        case UniformType.Sampler2D:
        case UniformType.SamplerCube:
          if (value instanceof Texture) {
            const glTexture = value.getGLTexture();
            if (glTexture) {
              gl.activeTexture(gl.TEXTURE0 + textureUnit);
              const target =
                type === UniformType.SamplerCube ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
              gl.bindTexture(target, glTexture);
              gl.uniform1i(location, textureUnit);
              textureUnit++;
            }
          }
          break;

        default:
          logger.warn(`Unknown uniform type: ${type} for ${name}`);
      }
    }

    this.uniformsDirty = false;
    logger.trace(`ShaderMaterial ${this.name} applied to GPU (${this.uniforms.size} uniforms)`);
  }
}
