import { Asset, AssetMetadata } from '../Asset';
import { IAssetLoader, LoadOptions } from '../AssetLoader';
import { Logger } from '../../core/Logger';

const logger = Logger.create('ShaderLoader');

/**
 * Shader language enumeration
 */
export enum ShaderLanguage {
  /** OpenGL Shading Language */
  GLSL = 'glsl',
  /** WebGPU Shading Language */
  WGSL = 'wgsl',
  /** SPIR-V binary format */
  SPIRV = 'spirv'
}

/**
 * Shader type enumeration
 */
export enum ShaderType {
  VERTEX = 'vertex',
  FRAGMENT = 'fragment',
  COMPUTE = 'compute',
  GEOMETRY = 'geometry',
  TESSELLATION_CONTROL = 'tess-control',
  TESSELLATION_EVALUATION = 'tess-eval'
}

/**
 * Shader metadata
 */
export interface ShaderMetadata extends AssetMetadata {
  /** Shader language */
  language: ShaderLanguage;
  /** Shader type */
  type: ShaderType;
  /** Entry point function name */
  entryPoint?: string;
  /** Shader version (e.g., "300 es", "450") */
  version?: string;
  /** Required extensions */
  extensions?: string[];
  /** Uniform definitions */
  uniforms?: Map<string, string>;
  /** Attribute definitions */
  attributes?: Map<string, string>;
}

/**
 * Shader asset containing shader source code
 */
export class ShaderAsset extends Asset {
  private source: string | Uint8Array | null = null;
  private shaderMetadata: ShaderMetadata | null = null;
  private compiled: WebGLShader | GPUShaderModule | null = null;

  /**
   * Gets the shader source code
   */
  get code(): string | Uint8Array | null {
    return this.source;
  }

  /**
   * Gets the shader metadata
   */
  override get metadata(): Readonly<AssetMetadata> {
    return this.shaderMetadata || {};
  }

  /**
   * Gets the compiled shader
   */
  get compiledShader(): WebGLShader | GPUShaderModule | null {
    return this.compiled;
  }

  /**
   * Sets the shader data
   */
  setData(
    source: string | Uint8Array,
    metadata: ShaderMetadata,
    compiled?: WebGLShader | GPUShaderModule
  ): void {
    this.source = source;
    this.shaderMetadata = metadata;
    if (compiled) {
      this.compiled = compiled;
    }
  }

  /**
   * Gets the estimated memory size in bytes
   */
  getMemorySize(): number {
    if (!this.source) {
      return 0;
    }

    if (typeof this.source === 'string') {
      return this.source.length * 2;
    }

    return this.source.byteLength;
  }

  /**
   * Disposes the shader and frees resources
   */
  override dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.source = null;
    this.shaderMetadata = null;
    this.compiled = null;

    super.dispose();
  }
}

/**
 * Shader loader supporting GLSL and WGSL
 * Supports: .vert, .frag, .comp, .glsl, .wgsl, .spv
 */
export class ShaderLoader implements IAssetLoader<ShaderAsset> {
  private static readonly SUPPORTED_EXTENSIONS = [
    'vert', 'frag', 'comp', 'glsl', 'wgsl', 'spv',
    'vs', 'fs', 'cs', 'geom', 'tesc', 'tese'
  ];

  /**
   * Loads a shader from a URL
   */
  async load(url: string, options?: LoadOptions): Promise<ShaderAsset> {
    logger.debug(`Loading shader: ${url}`);

    try {
      const asset = new ShaderAsset({ name: url });
      const ext = this.getExtension(url);

      const response = await fetch(url, { signal: options?.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      let source: string | Uint8Array;
      let language: ShaderLanguage;

      if (ext === 'spv') {
        const arrayBuffer = await response.arrayBuffer();
        source = new Uint8Array(arrayBuffer);
        language = ShaderLanguage.SPIRV;
      } else {
        source = await response.text();
        language = ext === 'wgsl' ? ShaderLanguage.WGSL : ShaderLanguage.GLSL;
      }

      const type = this.detectShaderType(url, source);
      const metadata: ShaderMetadata = {
        language,
        type,
        entryPoint: language === ShaderLanguage.WGSL ? 'main' : undefined
      };

      if (typeof source === 'string') {
        this.parseShaderMetadata(source, metadata);
      }

      asset.setData(source, metadata);

      logger.info(`Shader loaded successfully: ${url} (${type}, ${language})`);
      return asset;
    } catch (error) {
      logger.error(`Failed to load shader: ${url}`, error);
      throw error;
    }
  }

  /**
   * Checks if this loader can handle the given URL
   */
  canLoad(url: string): boolean {
    const ext = this.getExtension(url);
    return ext !== null && ShaderLoader.SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * Gets supported file extensions
   */
  getSupportedExtensions(): string[] {
    return [...ShaderLoader.SUPPORTED_EXTENSIONS];
  }

  /**
   * Detects shader type from URL and source
   */
  private detectShaderType(url: string, source: string | Uint8Array): ShaderType {
    const ext = this.getExtension(url);

    if (ext) {
      switch (ext) {
        case 'vert':
        case 'vs':
          return ShaderType.VERTEX;
        case 'frag':
        case 'fs':
          return ShaderType.FRAGMENT;
        case 'comp':
        case 'cs':
          return ShaderType.COMPUTE;
        case 'geom':
          return ShaderType.GEOMETRY;
        case 'tesc':
          return ShaderType.TESSELLATION_CONTROL;
        case 'tese':
          return ShaderType.TESSELLATION_EVALUATION;
      }
    }

    if (typeof source === 'string') {
      if (source.includes('gl_Position')) {
        return ShaderType.VERTEX;
      }
      if (source.includes('gl_FragColor') || source.includes('out vec4')) {
        return ShaderType.FRAGMENT;
      }
      if (source.includes('@compute') || source.includes('layout(local_size')) {
        return ShaderType.COMPUTE;
      }
    }

    return ShaderType.FRAGMENT;
  }

  /**
   * Parses shader metadata from source code
   */
  private parseShaderMetadata(source: string, metadata: ShaderMetadata): void {
    const versionMatch = source.match(/#version\s+(\d+\s+\w*)/);
    if (versionMatch) {
      metadata.version = versionMatch[1].trim();
    }

    const extensions: string[] = [];
    const extensionRegex = /#extension\s+([\w_]+)\s*:/g;
    let match;

    while ((match = extensionRegex.exec(source)) !== null) {
      extensions.push(match[1]);
    }

    if (extensions.length > 0) {
      metadata.extensions = extensions;
    }

    const uniforms = new Map<string, string>();
    const uniformRegex = /uniform\s+([\w_]+)\s+([\w_]+)/g;

    while ((match = uniformRegex.exec(source)) !== null) {
      uniforms.set(match[2], match[1]);
    }

    if (uniforms.size > 0) {
      metadata.uniforms = uniforms;
    }

    const attributes = new Map<string, string>();
    const attributeRegex = /(?:attribute|in)\s+([\w_]+)\s+([\w_]+)/g;

    while ((match = attributeRegex.exec(source)) !== null) {
      attributes.set(match[2], match[1]);
    }

    if (attributes.size > 0) {
      metadata.attributes = attributes;
    }
  }

  /**
   * Extracts file extension from URL
   */
  private getExtension(url: string): string | null {
    const match = url.match(/\.([^./?#]+)(?:[?#]|$)/i);
    return match ? match[1].toLowerCase() : null;
  }
}
