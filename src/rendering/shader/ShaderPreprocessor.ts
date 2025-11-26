/**
 * @module ShaderPreprocessor
 * @description Shader preprocessing system for handling includes, defines, and conditionals.
 * Preserves line numbers for accurate error reporting.
 */

import { Logger } from '../../core/Logger';
import { ShaderChunks, ShaderLanguage } from './ShaderChunks';

const logger = Logger.create('ShaderPreprocessor');

/**
 * Preprocessor directive types
 */
enum DirectiveType {
  Include = 'include',
  Define = 'define',
  Ifdef = 'ifdef',
  Ifndef = 'ifndef',
  Else = 'else',
  Endif = 'endif',
  Pragma = 'pragma'
}

/**
 * Preprocessor defines map
 */
export type DefinesMap = Record<string, string | number | boolean>;

/**
 * Preprocessor options
 */
export interface PreprocessorOptions {
  /** Defines to inject */
  defines?: DefinesMap;
  /** Include resolver function */
  includeResolver?: (path: string) => string | undefined;
  /** Whether to preserve line numbers with #line directives */
  preserveLineNumbers?: boolean;
  /** Target shader language */
  language?: ShaderLanguage;
}

/**
 * Preprocessor result
 */
export interface PreprocessorResult {
  /** Processed shader source */
  source: string;
  /** List of included files/chunks */
  includes: string[];
  /** List of defines used */
  defines: string[];
  /** Any warnings generated during preprocessing */
  warnings: string[];
}

/**
 * Line information for error reporting
 */
interface LineInfo {
  /** Original line number */
  originalLine: number;
  /** Source file/chunk name */
  source: string;
}

/**
 * Conditional block state
 */
interface ConditionalState {
  /** Whether we're currently inside an active block */
  active: boolean;
  /** Whether we've seen an else for this block */
  hasElse: boolean;
  /** The line where this conditional started */
  startLine: number;
}

/**
 * Shader preprocessor for handling includes, defines, and conditional compilation.
 *
 * Features:
 * - #include directive for including shader chunks
 * - #define for constant substitution
 * - #ifdef/#ifndef/#else/#endif for conditional compilation
 * - Line number preservation for accurate error reporting
 * - Circular include detection
 *
 * @example
 * ```typescript
 * const preprocessor = new ShaderPreprocessor({
 *   defines: {
 *     USE_SHADOWS: 1,
 *     MAX_LIGHTS: 8,
 *     QUALITY: 'high'
 *   },
 *   language: ShaderLanguage.GLSL300
 * });
 *
 * const result = preprocessor.process(`
 *   #include <common_math>
 *   #ifdef USE_SHADOWS
 *     #include <shadow_sampling>
 *   #endif
 *
 *   void main() {
 *     float value = PI * 2.0;
 *   }
 * `);
 * ```
 */
export class ShaderPreprocessor {
  private defines: Map<string, string>;
  private includeResolver?: (path: string) => string | undefined;
  private preserveLineNumbers: boolean;
  private language: ShaderLanguage;
  private includes: Set<string>;
  private warnings: string[];
  private lineMap: Map<number, LineInfo>;

  /**
   * Creates a new shader preprocessor
   *
   * @param options - Preprocessor options
   */
  constructor(options: PreprocessorOptions = {}) {
    this.defines = new Map();
    this.includeResolver = options.includeResolver;
    this.preserveLineNumbers = options.preserveLineNumbers ?? true;
    this.language = options.language ?? ShaderLanguage.GLSL300;
    this.includes = new Set();
    this.warnings = [];
    this.lineMap = new Map();

    // Set initial defines
    if (options.defines) {
      for (const [key, value] of Object.entries(options.defines)) {
        this.define(key, value);
      }
    }
  }

  /**
   * Define a preprocessor symbol
   *
   * @param name - Symbol name
   * @param value - Symbol value (defaults to '1')
   */
  define(name: string, value: string | number | boolean = 1): void {
    const valueStr = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
    this.defines.set(name, valueStr);
  }

  /**
   * Undefine a preprocessor symbol
   *
   * @param name - Symbol name
   */
  undefine(name: string): void {
    this.defines.delete(name);
  }

  /**
   * Check if a symbol is defined
   *
   * @param name - Symbol name
   * @returns True if defined
   */
  isDefined(name: string): boolean {
    return this.defines.has(name);
  }

  /**
   * Process shader source code
   *
   * @param source - Shader source code
   * @param sourceName - Source file/chunk name for error reporting
   * @returns Preprocessor result
   */
  process(source: string, sourceName: string = 'main'): PreprocessorResult {
    // Reset state
    this.includes.clear();
    this.warnings = [];
    this.lineMap.clear();

    try {
      const processed = this.processSource(source, sourceName, new Set());

      return {
        source: processed,
        includes: Array.from(this.includes),
        defines: Array.from(this.defines.keys()),
        warnings: this.warnings
      };
    } catch (error) {
      logger.error('Preprocessing failed', { error, sourceName });
      throw error;
    }
  }

  /**
   * Process source with circular include detection
   *
   * @param source - Source code
   * @param sourceName - Source name
   * @param includeStack - Stack for circular detection
   * @returns Processed source
   */
  private processSource(source: string, sourceName: string, includeStack: Set<string>): string {
    // Check for circular includes
    if (includeStack.has(sourceName)) {
      const cycle = Array.from(includeStack).join(' -> ') + ' -> ' + sourceName;
      throw new Error(`Circular include detected: ${cycle}`);
    }

    const newStack = new Set(includeStack);
    newStack.add(sourceName);

    const lines = source.split('\n');
    const output: string[] = [];
    const conditionalStack: ConditionalState[] = [];
    let currentLine = 0;

    const isActive = (): boolean => {
      return conditionalStack.length === 0 || conditionalStack[conditionalStack.length - 1].active;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentLine = i + 1;
      const trimmed = line.trim();

      // Handle preprocessor directives
      if (trimmed.startsWith('#')) {
        const directive = this.parseDirective(trimmed);

        if (!directive) {
          // Not a recognized directive, pass through if active
          if (isActive()) {
            output.push(line);
          } else {
            output.push(''); // Preserve line count
          }
          continue;
        }

        switch (directive.type) {
          case DirectiveType.Include:
            if (isActive()) {
              const included = this.processInclude(directive.args, newStack);
              if (included) {
                output.push(included);
              }
            } else {
              output.push(''); // Preserve line count
            }
            break;

          case DirectiveType.Define:
            if (isActive()) {
              const [name, value] = this.parseDefine(directive.args);
              this.define(name, value);
            }
            output.push(''); // Remove define from output
            break;

          case DirectiveType.Ifdef:
            {
              const symbol = directive.args.trim();
              const active = isActive() && this.isDefined(symbol);
              conditionalStack.push({
                active,
                hasElse: false,
                startLine: currentLine
              });
              output.push(''); // Remove conditional from output
            }
            break;

          case DirectiveType.Ifndef:
            {
              const symbol = directive.args.trim();
              const active = isActive() && !this.isDefined(symbol);
              conditionalStack.push({
                active,
                hasElse: false,
                startLine: currentLine
              });
              output.push(''); // Remove conditional from output
            }
            break;

          case DirectiveType.Else:
            if (conditionalStack.length === 0) {
              throw new Error(`#else without matching #ifdef or #ifndef at line ${currentLine}`);
            }
            {
              const state = conditionalStack[conditionalStack.length - 1];
              if (state.hasElse) {
                throw new Error(`Multiple #else for same #ifdef/#ifndef at line ${currentLine}`);
              }
              state.hasElse = true;
              state.active = conditionalStack.length === 1
                ? !state.active
                : conditionalStack[conditionalStack.length - 2].active && !state.active;
              output.push(''); // Remove else from output
            }
            break;

          case DirectiveType.Endif:
            if (conditionalStack.length === 0) {
              throw new Error(`#endif without matching #ifdef or #ifndef at line ${currentLine}`);
            }
            conditionalStack.pop();
            output.push(''); // Remove endif from output
            break;

          case DirectiveType.Pragma:
            if (isActive()) {
              output.push(line); // Pass through pragma directives
            } else {
              output.push('');
            }
            break;
        }
      } else {
        // Regular line
        if (isActive()) {
          // Perform define substitution
          const substituted = this.substituteDefines(line);
          output.push(substituted);
        } else {
          // Skip inactive lines but preserve line count
          output.push('');
        }
      }
    }

    // Check for unclosed conditionals
    if (conditionalStack.length > 0) {
      const unclosed = conditionalStack[conditionalStack.length - 1];
      throw new Error(`Unclosed #ifdef/#ifndef started at line ${unclosed.startLine}`);
    }

    return output.join('\n');
  }

  /**
   * Parse a preprocessor directive
   *
   * @param line - Line containing directive
   * @returns Parsed directive or null
   */
  private parseDirective(line: string): { type: DirectiveType; args: string } | null {
    const match = line.match(/^#\s*(\w+)\s*(.*?)$/);
    if (!match) return null;

    const [, directive, args] = match;
    const type = directive.toLowerCase();

    switch (type) {
      case 'include':
        return { type: DirectiveType.Include, args: args.trim() };
      case 'define':
        return { type: DirectiveType.Define, args: args.trim() };
      case 'ifdef':
        return { type: DirectiveType.Ifdef, args: args.trim() };
      case 'ifndef':
        return { type: DirectiveType.Ifndef, args: args.trim() };
      case 'else':
        return { type: DirectiveType.Else, args: args.trim() };
      case 'endif':
        return { type: DirectiveType.Endif, args: args.trim() };
      case 'pragma':
        return { type: DirectiveType.Pragma, args: args.trim() };
      default:
        return null;
    }
  }

  /**
   * Process an include directive
   *
   * @param args - Include arguments
   * @param includeStack - Current include stack
   * @returns Included source
   */
  private processInclude(args: string, includeStack: Set<string>): string {
    // Parse include path: #include <chunk> or #include "file"
    const chunkMatch = args.match(/^<(.+)>$/);
    const fileMatch = args.match(/^"(.+)"$/);

    if (chunkMatch) {
      // Include from shader chunks
      const chunkName = chunkMatch[1];
      const chunk = ShaderChunks.getChunk(chunkName, this.language);

      if (!chunk) {
        this.warnings.push(`Shader chunk not found: ${chunkName}`);
        return `// WARNING: Chunk '${chunkName}' not found`;
      }

      this.includes.add(chunkName);
      return this.processSource(chunk, chunkName, includeStack);
    } else if (fileMatch) {
      // Include from file (using custom resolver)
      const filePath = fileMatch[1];

      if (!this.includeResolver) {
        this.warnings.push(`No include resolver provided for: ${filePath}`);
        return `// WARNING: No include resolver for '${filePath}'`;
      }

      const fileSource = this.includeResolver(filePath);
      if (!fileSource) {
        this.warnings.push(`File not found: ${filePath}`);
        return `// WARNING: File '${filePath}' not found`;
      }

      this.includes.add(filePath);
      return this.processSource(fileSource, filePath, includeStack);
    } else {
      this.warnings.push(`Invalid include syntax: ${args}`);
      return `// WARNING: Invalid include syntax: ${args}`;
    }
  }

  /**
   * Parse a define directive
   *
   * @param args - Define arguments
   * @returns [name, value] tuple
   */
  private parseDefine(args: string): [string, string] {
    const match = args.match(/^(\w+)(?:\s+(.+))?$/);
    if (!match) {
      throw new Error(`Invalid #define syntax: ${args}`);
    }

    const [, name, value] = match;
    return [name, value?.trim() ?? '1'];
  }

  /**
   * Substitute defines in a line of code
   *
   * @param line - Line of code
   * @returns Line with substitutions
   */
  private substituteDefines(line: string): string {
    let result = line;

    // Sort defines by length (longest first) to handle overlapping names
    const sortedDefines = Array.from(this.defines.entries())
      .sort((a, b) => b[0].length - a[0].length);

    for (const [name, value] of sortedDefines) {
      // Match whole words only using word boundaries
      const regex = new RegExp(`\\b${name}\\b`, 'g');
      result = result.replace(regex, value);
    }

    return result;
  }

  /**
   * Get line information for error reporting
   *
   * @param lineNumber - Line number in processed source
   * @returns Line info with original line and source
   */
  getLineInfo(lineNumber: number): LineInfo | undefined {
    return this.lineMap.get(lineNumber);
  }

  /**
   * Get all warnings generated during preprocessing
   *
   * @returns Array of warning messages
   */
  getWarnings(): string[] {
    return [...this.warnings];
  }

  /**
   * Clear all defines
   */
  clearDefines(): void {
    this.defines.clear();
  }

  /**
   * Get all current defines
   *
   * @returns Map of defines
   */
  getDefines(): Map<string, string> {
    return new Map(this.defines);
  }
}

/**
 * Utility function to quickly preprocess shader source
 *
 * @param source - Shader source code
 * @param defines - Defines to inject
 * @param language - Target shader language
 * @returns Processed source
 *
 * @example
 * ```typescript
 * const processed = preprocessShader(source, {
 *   USE_SHADOWS: true,
 *   MAX_LIGHTS: 4
 * });
 * ```
 */
export function preprocessShader(
  source: string,
  defines?: DefinesMap,
  language: ShaderLanguage = ShaderLanguage.GLSL300
): string {
  const preprocessor = new ShaderPreprocessor({ defines, language });
  const result = preprocessor.process(source);
  return result.source;
}
