/**
 * @module Shaders
 * @description
 * Shader compiler for GPU shader compilation and linking.
 * Supports both GLSL ES 3.0 (WebGL2) and WGSL (WebGPU) compilation.
 */

import { Logger } from '../core/Logger';

const logger = Logger.create('ShaderCompiler');

/**
 * Shader type enumeration
 */
export enum ShaderType {
  /** Vertex shader */
  Vertex = 'vertex',
  /** Fragment/pixel shader */
  Fragment = 'fragment',
  /** Compute shader (WebGPU only) */
  Compute = 'compute'
}

/**
 * Shader target platform
 */
export enum ShaderTarget {
  /** GLSL ES 3.0 for WebGL2 */
  GLSL = 'glsl',
  /** WGSL for WebGPU */
  WGSL = 'wgsl'
}

/**
 * Compilation error with source location
 */
export interface CompileError {
  /** Line number in source (1-based) */
  line: number;
  /** Column number in source (1-based) */
  column: number;
  /** Error message */
  message: string;
  /** Source code excerpt around error */
  source: string;
  /** Severity level */
  severity: 'error' | 'warning';
}

/**
 * Compilation warning
 */
export interface CompileWarning {
  /** Line number in source (1-based) */
  line: number;
  /** Warning message */
  message: string;
}

/**
 * Compiled shader object
 */
export interface CompiledShader {
  /** Shader type */
  type: ShaderType;
  /** Target platform */
  target: ShaderTarget;
  /** Compiled source code */
  source: string;
  /** Original source code */
  originalSource: string;
  /** Source map for debugging */
  sourceMap?: SourceMap;
  /** GPU shader object (platform-specific) */
  handle?: WebGLShader | GPUShaderModule;
}

/**
 * Linked shader program
 */
export interface LinkedProgram {
  /** Vertex shader */
  vertex: CompiledShader;
  /** Fragment shader */
  fragment: CompiledShader;
  /** GPU program object (WebGL only) */
  handle?: WebGLProgram;
  /** Uniform locations */
  uniforms: Map<string, WebGLUniformLocation | number>;
  /** Attribute locations */
  attributes: Map<string, number>;
}

/**
 * Compilation result
 */
export interface CompileResult {
  /** Whether compilation succeeded */
  success: boolean;
  /** Compiled shader (if successful) */
  shader?: CompiledShader;
  /** Compilation errors */
  errors: CompileError[];
  /** Compilation warnings */
  warnings: CompileWarning[];
  /** Compilation time in milliseconds */
  compileTime: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation succeeded */
  valid: boolean;
  /** Validation errors */
  errors: CompileError[];
  /** Validation warnings */
  warnings: CompileWarning[];
}

/**
 * Source map for debugging
 */
export interface SourceMap {
  /** Original line to processed line mapping */
  lineMapping: Map<number, number>;
  /** File names for included chunks */
  sources: string[];
}

/**
 * Preprocessor directive type
 */
interface PreprocessorDirective {
  type: 'define' | 'include' | 'ifdef' | 'ifndef' | 'endif' | 'pragma';
  value?: string;
  condition?: string;
}

/**
 * Shader compiler for GLSL and WGSL.
 * Compiles shader source code for GPU execution with error reporting,
 * preprocessor support, and source mapping for debugging.
 *
 * @example
 * ```typescript
 * // Compile a vertex shader for WebGL2
 * const result = await ShaderCompiler.compile(
 *   vertexSource,
 *   ShaderType.Vertex,
 *   ShaderTarget.GLSL,
 *   gl
 * );
 *
 * if (result.success) {
 *   console.log('Shader compiled successfully');
 * } else {
 *   result.errors.forEach(err => {
 *     console.error(`Line ${err.line}: ${err.message}`);
 *   });
 * }
 *
 * // Link vertex and fragment shaders
 * const program = await ShaderCompiler.link(
 *   vertexResult.shader!,
 *   fragmentResult.shader!,
 *   gl
 * );
 * ```
 */
export class ShaderCompiler {
  /**
   * Compile shader source code
   *
   * @param source - Shader source code
   * @param type - Shader type (vertex, fragment, compute)
   * @param target - Target platform (GLSL or WGSL)
   * @param context - GPU context (WebGL2RenderingContext or GPUDevice)
   * @returns Compilation result with errors/warnings
   *
   * @example
   * ```typescript
   * const result = await ShaderCompiler.compile(
   *   shaderSource,
   *   ShaderType.Fragment,
   *   ShaderTarget.GLSL,
   *   gl
   * );
   * ```
   */
  static async compile(
    source: string,
    type: ShaderType,
    target: ShaderTarget,
    context?: WebGL2RenderingContext | GPUDevice
  ): Promise<CompileResult> {
    const startTime = performance.now();
    const errors: CompileError[] = [];
    const warnings: CompileWarning[] = [];

    try {
      // Validate inputs
      if (!source || source.trim().length === 0) {
        errors.push({
          line: 0,
          column: 0,
          message: 'Empty shader source',
          source: '',
          severity: 'error'
        });
        return { success: false, errors, warnings, compileTime: 0 };
      }

      // Preprocess shader source
      const { processedSource, sourceMap } = this.preprocessShader(source, target);

      // Compile based on target
      let compiledShader: CompiledShader | undefined;
      if (target === ShaderTarget.GLSL) {
        const result = await this.compileGLSL(processedSource, type, context as WebGL2RenderingContext);
        compiledShader = result.shader;
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      } else if (target === ShaderTarget.WGSL) {
        const result = await this.compileWGSL(processedSource, type, context as GPUDevice);
        compiledShader = result.shader;
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      } else {
        errors.push({
          line: 0,
          column: 0,
          message: `Unknown shader target: ${target}`,
          source: '',
          severity: 'error'
        });
      }

      const compileTime = performance.now() - startTime;

      // Performance check
      if (compileTime > 100) {
        logger.warn(`Shader compilation took ${compileTime.toFixed(2)}ms (target: <100ms)`);
      }

      return {
        success: errors.length === 0,
        shader: compiledShader,
        errors,
        warnings,
        compileTime
      };
    } catch (error) {
      const compileTime = performance.now() - startTime;
      errors.push({
        line: 0,
        column: 0,
        message: error instanceof Error ? error.message : String(error),
        source: '',
        severity: 'error'
      });

      return { success: false, errors, warnings, compileTime };
    }
  }

  /**
   * Link vertex and fragment shaders into a program
   *
   * @param vertex - Compiled vertex shader
   * @param fragment - Compiled fragment shader
   * @param gl - WebGL2 rendering context
   * @returns Linked program
   *
   * @example
   * ```typescript
   * const program = await ShaderCompiler.link(vertexShader, fragmentShader, gl);
   * ```
   */
  static async link(
    vertex: CompiledShader,
    fragment: CompiledShader,
    gl?: WebGL2RenderingContext
  ): Promise<LinkedProgram> {
    if (vertex.type !== ShaderType.Vertex) {
      throw new Error('First shader must be a vertex shader');
    }
    if (fragment.type !== ShaderType.Fragment) {
      throw new Error('Second shader must be a fragment shader');
    }
    if (vertex.target !== fragment.target) {
      throw new Error('Shaders must target the same platform');
    }

    if (vertex.target === ShaderTarget.GLSL && gl) {
      return this.linkGLSL(vertex, fragment, gl);
    }

    // For WGSL, linking is handled by the render pipeline
    return {
      vertex,
      fragment,
      uniforms: new Map(),
      attributes: new Map()
    };
  }

  /**
   * Validate shader source without compiling
   *
   * @param source - Shader source code
   * @param type - Shader type
   * @returns Validation result
   *
   * @example
   * ```typescript
   * const result = ShaderCompiler.validate(source, ShaderType.Vertex);
   * if (!result.valid) {
   *   console.error('Validation errors:', result.errors);
   * }
   * ```
   */
  static validate(source: string, type: ShaderType): ValidationResult {
    const errors: CompileError[] = [];
    const warnings: CompileWarning[] = [];

    // Basic syntax validation
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check for common errors
      if (line.includes('GL_') && !line.startsWith('//') && !line.startsWith('/*')) {
        warnings.push({
          line: i + 1,
          message: 'GL_ constants may not be available in all contexts'
        });
      }

      // Check for missing semicolons (simple heuristic)
      if (line.length > 0 && !line.endsWith(';') && !line.endsWith('{') &&
          !line.endsWith('}') && !line.startsWith('#') && !line.startsWith('//')) {
        const trimmed = line.replace(/\s+/g, ' ');
        if (!trimmed.includes('if') && !trimmed.includes('for') && !trimmed.includes('while')) {
          // Could be missing semicolon
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Preprocess shader source (expand includes, defines, etc.)
   */
  private static preprocessShader(source: string, target: ShaderTarget): {
    processedSource: string;
    sourceMap: SourceMap;
  } {
    const sourceMap: SourceMap = {
      lineMapping: new Map(),
      sources: []
    };

    const lines = source.split('\n');
    const output: string[] = [];
    const defines = new Map<string, string>();
    const conditionalStack: boolean[] = [];
    let currentLine = 0;
    let outputLine = 0;

    for (const line of lines) {
      currentLine++;
      const trimmed = line.trim();

      // Handle preprocessor directives
      if (trimmed.startsWith('#')) {
        const directive = this.parsePreprocessorDirective(trimmed);

        if (directive.type === 'define' && directive.value) {
          const parts = directive.value.split(/\s+/);
          defines.set(parts[0], parts.slice(1).join(' ') || '1');
          continue;
        } else if (directive.type === 'ifdef') {
          conditionalStack.push(defines.has(directive.condition!));
          continue;
        } else if (directive.type === 'ifndef') {
          conditionalStack.push(!defines.has(directive.condition!));
          continue;
        } else if (directive.type === 'endif') {
          conditionalStack.pop();
          continue;
        } else if (directive.type === 'include') {
          // Include handling is done by ShaderChunkRegistry
          continue;
        }
      }

      // Skip lines in false conditional blocks
      if (conditionalStack.length > 0 && !conditionalStack[conditionalStack.length - 1]) {
        continue;
      }

      // Expand defines
      let processedLine = line;
      for (const [key, value] of defines) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        processedLine = processedLine.replace(regex, value);
      }

      output.push(processedLine);
      sourceMap.lineMapping.set(outputLine, currentLine);
      outputLine++;
    }

    return {
      processedSource: output.join('\n'),
      sourceMap
    };
  }

  /**
   * Parse preprocessor directive
   */
  private static parsePreprocessorDirective(line: string): PreprocessorDirective {
    const match = line.match(/#(\w+)\s*(.*)/);
    if (!match) {
      return { type: 'pragma' };
    }

    const [, directive, rest] = match;

    switch (directive) {
      case 'define':
        return { type: 'define', value: rest.trim() };
      case 'include':
        return { type: 'include', value: rest.trim().replace(/["<>]/g, '') };
      case 'ifdef':
        return { type: 'ifdef', condition: rest.trim() };
      case 'ifndef':
        return { type: 'ifndef', condition: rest.trim() };
      case 'endif':
        return { type: 'endif' };
      default:
        return { type: 'pragma', value: rest };
    }
  }

  /**
   * Compile GLSL shader
   */
  private static async compileGLSL(
    source: string,
    type: ShaderType,
    gl?: WebGL2RenderingContext
  ): Promise<{
    shader?: CompiledShader;
    errors: CompileError[];
    warnings: CompileWarning[];
  }> {
    const errors: CompileError[] = [];
    const warnings: CompileWarning[] = [];

    if (!gl) {
      return {
        shader: {
          type,
          target: ShaderTarget.GLSL,
          source,
          originalSource: source
        },
        errors,
        warnings
      };
    }

    // Determine GL shader type
    let glType: number;
    if (type === ShaderType.Vertex) {
      glType = gl.VERTEX_SHADER;
    } else if (type === ShaderType.Fragment) {
      glType = gl.FRAGMENT_SHADER;
    } else {
      errors.push({
        line: 0,
        column: 0,
        message: 'Compute shaders not supported in WebGL2',
        source: '',
        severity: 'error'
      });
      return { errors, warnings };
    }

    // Create and compile shader
    const shader = gl.createShader(glType);
    if (!shader) {
      errors.push({
        line: 0,
        column: 0,
        message: 'Failed to create shader object',
        source: '',
        severity: 'error'
      });
      return { errors, warnings };
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    // Check compilation status
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || 'Unknown error';
      const parsedErrors = this.parseGLSLErrors(log, source);
      errors.push(...parsedErrors);
      gl.deleteShader(shader);
      return { errors, warnings };
    }

    return {
      shader: {
        type,
        target: ShaderTarget.GLSL,
        source,
        originalSource: source,
        handle: shader
      },
      errors,
      warnings
    };
  }

  /**
   * Compile WGSL shader
   */
  private static async compileWGSL(
    source: string,
    type: ShaderType,
    device?: GPUDevice
  ): Promise<{
    shader?: CompiledShader;
    errors: CompileError[];
    warnings: CompileWarning[];
  }> {
    const errors: CompileError[] = [];
    const warnings: CompileWarning[] = [];

    if (!device) {
      return {
        shader: {
          type,
          target: ShaderTarget.WGSL,
          source,
          originalSource: source
        },
        errors,
        warnings
      };
    }

    try {
      const shaderModule = device.createShaderModule({
        code: source
      });

      // WebGPU shader compilation is async
      const compilationInfo = await shaderModule.getCompilationInfo();

      for (const message of compilationInfo.messages) {
        const error: CompileError = {
          line: message.lineNum || 0,
          column: message.linePos || 0,
          message: message.message,
          source: this.getSourceExcerpt(source, message.lineNum || 0),
          severity: message.type === 'error' ? 'error' : 'warning'
        };

        if (message.type === 'error') {
          errors.push(error);
        } else {
          warnings.push({
            line: error.line,
            message: error.message
          });
        }
      }

      if (errors.length > 0) {
        return { errors, warnings };
      }

      return {
        shader: {
          type,
          target: ShaderTarget.WGSL,
          source,
          originalSource: source,
          handle: shaderModule
        },
        errors,
        warnings
      };
    } catch (error) {
      errors.push({
        line: 0,
        column: 0,
        message: error instanceof Error ? error.message : String(error),
        source: '',
        severity: 'error'
      });
      return { errors, warnings };
    }
  }

  /**
   * Link GLSL shaders into program
   */
  private static async linkGLSL(
    vertex: CompiledShader,
    fragment: CompiledShader,
    gl: WebGL2RenderingContext
  ): Promise<LinkedProgram> {
    const program = gl.createProgram();
    if (!program) {
      throw new Error('Failed to create program object');
    }

    gl.attachShader(program, vertex.handle as WebGLShader);
    gl.attachShader(program, fragment.handle as WebGLShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || 'Unknown error';
      gl.deleteProgram(program);
      throw new Error(`Program linking failed: ${log}`);
    }

    // Extract uniform and attribute locations
    const uniforms = new Map<string, WebGLUniformLocation | number>();
    const attributes = new Map<string, number>();

    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) {
        const location = gl.getUniformLocation(program, info.name);
        if (location !== null) {
          uniforms.set(info.name, location);
        }
      }
    }

    const numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < numAttributes; i++) {
      const info = gl.getActiveAttrib(program, i);
      if (info) {
        const location = gl.getAttribLocation(program, info.name);
        attributes.set(info.name, location);
      }
    }

    return {
      vertex,
      fragment,
      handle: program,
      uniforms,
      attributes
    };
  }

  /**
   * Parse GLSL error messages
   */
  private static parseGLSLErrors(log: string, source: string): CompileError[] {
    const errors: CompileError[] = [];
    const lines = log.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      // Try to parse error format: "ERROR: 0:line: message"
      const match = line.match(/ERROR:\s*(\d+):(\d+):\s*(.+)/i) ||
                   line.match(/(\d+):(\d+):\s*(.+)/);

      if (match) {
        const lineNum = parseInt(match[2], 10);
        errors.push({
          line: lineNum,
          column: 0,
          message: match[3].trim(),
          source: this.getSourceExcerpt(source, lineNum),
          severity: 'error'
        });
      } else {
        // Fallback for unparseable errors
        errors.push({
          line: 0,
          column: 0,
          message: line,
          source: '',
          severity: 'error'
        });
      }
    }

    return errors;
  }

  /**
   * Get source code excerpt around error line
   */
  private static getSourceExcerpt(source: string, lineNum: number, context: number = 2): string {
    const lines = source.split('\n');
    const start = Math.max(0, lineNum - context - 1);
    const end = Math.min(lines.length, lineNum + context);

    const excerpt: string[] = [];
    for (let i = start; i < end; i++) {
      const marker = i === lineNum - 1 ? '> ' : '  ';
      excerpt.push(`${marker}${i + 1}: ${lines[i]}`);
    }

    return excerpt.join('\n');
  }
}
