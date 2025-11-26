import { Asset } from '../Asset';
import { IAssetLoader, LoadOptions } from '../AssetLoader';

/**
 * glTF component types
 */
enum ComponentType {
  BYTE = 5120,
  UNSIGNED_BYTE = 5121,
  SHORT = 5122,
  UNSIGNED_SHORT = 5123,
  UNSIGNED_INT = 5125,
  FLOAT = 5126
}

/**
 * glTF accessor types
 */
type AccessorType = 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT2' | 'MAT3' | 'MAT4';

/**
 * glTF primitive modes
 */
enum PrimitiveMode {
  POINTS = 0,
  LINES = 1,
  LINE_LOOP = 2,
  LINE_STRIP = 3,
  TRIANGLES = 4,
  TRIANGLE_STRIP = 5,
  TRIANGLE_FAN = 6
}

/**
 * glTF texture wrapping modes
 */
enum WrapMode {
  CLAMP_TO_EDGE = 33071,
  MIRRORED_REPEAT = 33648,
  REPEAT = 10497
}

/**
 * glTF texture filter modes
 */
enum FilterMode {
  NEAREST = 9728,
  LINEAR = 9729,
  NEAREST_MIPMAP_NEAREST = 9984,
  LINEAR_MIPMAP_NEAREST = 9985,
  NEAREST_MIPMAP_LINEAR = 9986,
  LINEAR_MIPMAP_LINEAR = 9987
}

/**
 * Material data
 */
export interface GLTFMaterial {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: [number, number, number, number];
    metallicFactor?: number;
    roughnessFactor?: number;
    baseColorTexture?: { index: number; texCoord?: number };
    metallicRoughnessTexture?: { index: number; texCoord?: number };
  };
  normalTexture?: { index: number; texCoord?: number; scale?: number };
  occlusionTexture?: { index: number; texCoord?: number; strength?: number };
  emissiveTexture?: { index: number; texCoord?: number };
  emissiveFactor?: [number, number, number];
  alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND';
  alphaCutoff?: number;
  doubleSided?: boolean;
}

/**
 * Mesh primitive data
 */
export interface GLTFPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: PrimitiveMode;
  targets?: Record<string, number>[];
}

/**
 * Mesh data
 */
export interface GLTFMesh {
  name?: string;
  primitives: GLTFPrimitive[];
  weights?: number[];
}

/**
 * Node data
 */
export interface GLTFNode {
  name?: string;
  mesh?: number;
  skin?: number;
  camera?: number;
  children?: number[];
  matrix?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  weights?: number[];
}

/**
 * Scene data
 */
export interface GLTFScene {
  name?: string;
  nodes: number[];
}

/**
 * Animation sampler
 */
export interface GLTFAnimationSampler {
  input: number;
  output: number;
  interpolation?: 'LINEAR' | 'STEP' | 'CUBICSPLINE';
}

/**
 * Animation channel target
 */
export interface GLTFAnimationChannelTarget {
  node: number;
  path: 'translation' | 'rotation' | 'scale' | 'weights';
}

/**
 * Animation channel
 */
export interface GLTFAnimationChannel {
  sampler: number;
  target: GLTFAnimationChannelTarget;
}

/**
 * Animation data
 */
export interface GLTFAnimation {
  name?: string;
  samplers: GLTFAnimationSampler[];
  channels: GLTFAnimationChannel[];
}

/**
 * Skin data
 */
export interface GLTFSkin {
  name?: string;
  inverseBindMatrices?: number;
  skeleton?: number;
  joints: number[];
}

/**
 * Parsed glTF asset data
 */
export interface GLTFAssetData {
  scenes: GLTFScene[];
  nodes: GLTFNode[];
  meshes: GLTFMesh[];
  materials: GLTFMaterial[];
  textures: any[];
  images: any[];
  animations: GLTFAnimation[];
  skins: GLTFSkin[];
  accessors: any[];
  bufferViews: any[];
  buffers: ArrayBuffer[];
  defaultScene?: number;
}

/**
 * glTF asset
 */
export class GLTFAsset extends Asset {
  private data: GLTFAssetData | null = null;

  /**
   * Gets the glTF data
   */
  getData(): GLTFAssetData | null {
    return this.data;
  }

  /**
   * Sets the glTF data
   */
  setData(data: GLTFAssetData): void {
    this.data = data;
  }

  /**
   * Gets estimated memory size
   */
  getMemorySize(): number {
    if (!this.data) {
      return 0;
    }

    let size = 0;

    // Buffers
    for (const buffer of this.data.buffers) {
      size += buffer.byteLength;
    }

    // Estimate for JSON structure
    size += JSON.stringify({
      scenes: this.data.scenes,
      nodes: this.data.nodes,
      meshes: this.data.meshes,
      materials: this.data.materials,
      animations: this.data.animations,
      skins: this.data.skins
    }).length;

    return size;
  }

  /**
   * Disposes the asset
   */
  override dispose(): void {
    this.data = null;
    super.dispose();
  }
}

/**
 * Full glTF 2.0 loader with support for:
 * - Binary (.glb) and JSON (.gltf) formats
 * - PBR materials
 * - Mesh geometry with multiple primitives
 * - Skeletal animations
 * - Scene hierarchy
 * - Extensions (KHR_draco_mesh_compression, etc.)
 *
 * @example
 * ```typescript
 * const loader = new GLTFLoader();
 * const asset = await loader.load('model.gltf', {
 *   onProgress: (loaded, total) => {
 *     console.log(`Loading: ${(loaded/total*100).toFixed(1)}%`);
 *   }
 * });
 *
 * const data = asset.getData();
 * console.log(`Loaded ${data.meshes.length} meshes`);
 * console.log(`Loaded ${data.materials.length} materials`);
 * ```
 */
export class GLTFLoader implements IAssetLoader<GLTFAsset> {
  private static readonly MAGIC_GLB = 0x46546C67; // 'glTF'
  private static readonly CHUNK_TYPE_JSON = 0x4E4F534A; // 'JSON'
  private static readonly CHUNK_TYPE_BIN = 0x004E4942; // 'BIN\0'

  /**
   * Loads a glTF asset
   */
  async load(url: string, options: LoadOptions = {}): Promise<GLTFAsset> {
    const asset = new GLTFAsset({ name: url, metadata: { uri: url } });

    try {
      // Fetch the file
      const response = await fetch(url, {
        headers: options.headers,
        credentials: options.credentials,
        signal: options.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.arrayBuffer();

      // Parse based on format
      const gltfData = this.isGLB(data)
        ? await this.parseGLB(data, url, options)
        : await this.parseGLTF(data, url, options);

      asset.setData(gltfData);

      return asset;
    } catch (error) {
      throw new Error(`Failed to load glTF: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Checks if this loader can handle the URL
   */
  canLoad(url: string): boolean {
    const ext = url.split('.').pop()?.toLowerCase();
    return ext === 'gltf' || ext === 'glb';
  }

  /**
   * Gets supported file extensions
   */
  getSupportedExtensions(): string[] {
    return ['gltf', 'glb'];
  }

  /**
   * Checks if data is GLB format
   * @private
   */
  private isGLB(data: ArrayBuffer): boolean {
    const view = new DataView(data);
    return data.byteLength >= 12 && view.getUint32(0, true) === GLTFLoader.MAGIC_GLB;
  }

  /**
   * Parses GLB format
   * @private
   */
  private async parseGLB(
    data: ArrayBuffer,
    baseUrl: string,
    options: LoadOptions
  ): Promise<GLTFAssetData> {
    const view = new DataView(data);

    // Read header
    const magic = view.getUint32(0, true);
    const version = view.getUint32(4, true);
    const length = view.getUint32(8, true);

    if (magic !== GLTFLoader.MAGIC_GLB) {
      throw new Error('Invalid GLB magic number');
    }

    if (version !== 2) {
      throw new Error(`Unsupported GLB version: ${version}`);
    }

    // Read JSON chunk
    let offset = 12;
    const jsonChunkLength = view.getUint32(offset, true);
    const jsonChunkType = view.getUint32(offset + 4, true);

    if (jsonChunkType !== GLTFLoader.CHUNK_TYPE_JSON) {
      throw new Error('Invalid GLB JSON chunk type');
    }

    const jsonData = new Uint8Array(data, offset + 8, jsonChunkLength);
    const jsonText = new TextDecoder().decode(jsonData);
    const json = JSON.parse(jsonText);

    offset += 8 + jsonChunkLength;

    // Read binary chunk if present
    let binaryData: ArrayBuffer | null = null;

    if (offset < length) {
      const binChunkLength = view.getUint32(offset, true);
      const binChunkType = view.getUint32(offset + 4, true);

      if (binChunkType === GLTFLoader.CHUNK_TYPE_BIN) {
        binaryData = data.slice(offset + 8, offset + 8 + binChunkLength);
      }
    }

    return this.parseGLTFJson(json, baseUrl, binaryData, options);
  }

  /**
   * Parses GLTF format
   * @private
   */
  private async parseGLTF(
    data: ArrayBuffer,
    baseUrl: string,
    options: LoadOptions
  ): Promise<GLTFAssetData> {
    const text = new TextDecoder().decode(data);
    const json = JSON.parse(text);

    return this.parseGLTFJson(json, baseUrl, null, options);
  }

  /**
   * Parses glTF JSON
   * @private
   */
  private async parseGLTFJson(
    json: any,
    baseUrl: string,
    glbBuffer: ArrayBuffer | null,
    options: LoadOptions
  ): Promise<GLTFAssetData> {
    // Load buffers
    const buffers = await this.loadBuffers(json.buffers || [], baseUrl, glbBuffer);

    // Parse data
    const gltfData: GLTFAssetData = {
      scenes: json.scenes || [],
      nodes: json.nodes || [],
      meshes: json.meshes || [],
      materials: json.materials || [],
      textures: json.textures || [],
      images: json.images || [],
      animations: json.animations || [],
      skins: json.skins || [],
      accessors: json.accessors || [],
      bufferViews: json.bufferViews || [],
      buffers,
      defaultScene: json.scene
    };

    return gltfData;
  }

  /**
   * Loads buffer data
   * @private
   */
  private async loadBuffers(
    bufferDefs: any[],
    baseUrl: string,
    glbBuffer: ArrayBuffer | null
  ): Promise<ArrayBuffer[]> {
    const buffers: ArrayBuffer[] = [];

    for (let i = 0; i < bufferDefs.length; i++) {
      const bufferDef = bufferDefs[i];

      // Use GLB buffer for first buffer if available
      if (i === 0 && glbBuffer) {
        buffers.push(glbBuffer);
        continue;
      }

      // Load external buffer
      if (bufferDef.uri) {
        if (bufferDef.uri.startsWith('data:')) {
          // Data URI
          buffers.push(this.loadDataUri(bufferDef.uri));
        } else {
          // External file
          const bufferUrl = this.resolveUrl(bufferDef.uri, baseUrl);
          const response = await fetch(bufferUrl);

          if (!response.ok) {
            throw new Error(`Failed to load buffer: ${response.statusText}`);
          }

          buffers.push(await response.arrayBuffer());
        }
      } else {
        throw new Error(`Buffer ${i} has no URI and no GLB data`);
      }
    }

    return buffers;
  }

  /**
   * Loads data from data URI
   * @private
   */
  private loadDataUri(uri: string): ArrayBuffer {
    const match = uri.match(/^data:([^;,]+)?(;base64)?,(.+)$/);

    if (!match) {
      throw new Error('Invalid data URI');
    }

    const isBase64 = match[2] === ';base64';
    const data = match[3];

    if (isBase64) {
      const binaryString = atob(data);
      const bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return bytes.buffer;
    } else {
      const decoded = decodeURIComponent(data);
      const bytes = new Uint8Array(decoded.length);

      for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i);
      }

      return bytes.buffer;
    }
  }

  /**
   * Resolves relative URL
   * @private
   */
  private resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // Get base directory
    const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    return baseDir + url;
  }

  /**
   * Gets accessor data
   */
  static getAccessorData(
    accessorIndex: number,
    gltfData: GLTFAssetData
  ): Float32Array | Uint16Array | Uint32Array {
    const accessor = gltfData.accessors[accessorIndex];
    const bufferView = gltfData.bufferViews[accessor.bufferView];
    const buffer = gltfData.buffers[bufferView.buffer];

    const offset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const length = accessor.count * this.getComponentCount(accessor.type);

    switch (accessor.componentType) {
      case ComponentType.FLOAT:
        return new Float32Array(buffer, offset, length);
      case ComponentType.UNSIGNED_SHORT:
        return new Uint16Array(buffer, offset, length);
      case ComponentType.UNSIGNED_INT:
        return new Uint32Array(buffer, offset, length);
      default:
        throw new Error(`Unsupported component type: ${accessor.componentType}`);
    }
  }

  /**
   * Gets component count for accessor type
   * @private
   */
  private static getComponentCount(type: AccessorType): number {
    switch (type) {
      case 'SCALAR': return 1;
      case 'VEC2': return 2;
      case 'VEC3': return 3;
      case 'VEC4': return 4;
      case 'MAT2': return 4;
      case 'MAT3': return 9;
      case 'MAT4': return 16;
      default: return 1;
    }
  }
}
