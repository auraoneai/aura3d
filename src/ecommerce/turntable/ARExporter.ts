/**
 * ARExporter - AR Quick Look (iOS) and Scene Viewer (Android) export system
 *
 * @example
 * ```typescript
 * const arExporter = new ARExporter();
 *
 * // Auto-detect platform and export
 * await arExporter.exportForPlatform(model, {
 *   scale: 1.0,
 *   title: 'Premium Headphones',
 *   autoDownload: true
 * });
 *
 * // Export specific format
 * const usdzBlob = await arExporter.exportUSDZ(model);
 * const glbBlob = await arExporter.exportGLB(model);
 *
 * // Trigger AR view
 * arExporter.launchARQuickLook(usdzBlob, 'product.usdz');
 * arExporter.launchSceneViewer(glbBlob, 'product.glb');
 * ```
 */

import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { Matrix4 } from '../../math/Matrix4';

export type ARPlatform = 'ios' | 'android' | 'unknown';
export type ARFormat = 'usdz' | 'glb';

export interface ARExportConfig {
  /** Scale factor for model */
  scale?: number;
  /** Model title/name */
  title?: string;
  /** Model description */
  description?: string;
  /** Automatically download after export */
  autoDownload?: boolean;
  /** Automatically launch AR viewer */
  autoLaunch?: boolean;
  /** Optimize for file size */
  optimize?: boolean;
  /** Maximum texture resolution */
  maxTextureSize?: number;
  /** Compress textures */
  compressTextures?: boolean;
}

export interface USDZConfig extends ARExportConfig {
  /** USD version */
  usdVersion?: string;
  /** Enable PBR materials */
  usePBR?: boolean;
}

export interface GLBConfig extends ARExportConfig {
  /** Include animations */
  includeAnimations?: boolean;
  /** Draco compression */
  useDraco?: boolean;
}

/**
 * Model data structure
 */
export interface ModelData {
  vertices: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  indices?: Uint16Array | Uint32Array;
  materials?: MaterialData[];
  name?: string;
}

export interface MaterialData {
  name?: string;
  baseColor?: [number, number, number, number];
  metallic?: number;
  roughness?: number;
  baseColorTexture?: string;
  metallicRoughnessTexture?: string;
  normalTexture?: string;
  emissiveTexture?: string;
  emissiveFactor?: [number, number, number];
}

/**
 * ARExporter handles export to USDZ and GLB formats for AR
 */
export class ARExporter {
  private _platform: ARPlatform;

  constructor() {
    this._platform = this._detectPlatform();
  }

  /**
   * Detect current platform
   */
  private _detectPlatform(): ARPlatform {
    const userAgent = navigator.userAgent.toLowerCase();

    if (/iphone|ipad|ipod/.test(userAgent)) {
      return 'ios';
    } else if (/android/.test(userAgent)) {
      return 'android';
    }

    return 'unknown';
  }

  /**
   * Get current platform
   */
  public get platform(): ARPlatform {
    return this._platform;
  }

  /**
   * Check if platform supports AR
   */
  public get supportsAR(): boolean {
    return this._platform === 'ios' || this._platform === 'android';
  }

  /**
   * Get recommended format for current platform
   */
  public getRecommendedFormat(): ARFormat {
    return this._platform === 'ios' ? 'usdz' : 'glb';
  }

  /**
   * Export for current platform
   */
  public async exportForPlatform(
    model: ModelData,
    config: ARExportConfig = {}
  ): Promise<Blob> {
    const format = this.getRecommendedFormat();

    let blob: Blob;
    if (format === 'usdz') {
      blob = await this.exportUSDZ(model, config);
    } else {
      blob = await this.exportGLB(model, config);
    }

    // Auto download
    if (config.autoDownload) {
      const filename = `${config.title || 'model'}.${format}`;
      this._downloadBlob(blob, filename);
    }

    // Auto launch
    if (config.autoLaunch) {
      const filename = `${config.title || 'model'}.${format}`;
      if (format === 'usdz') {
        this.launchARQuickLook(blob, filename);
      } else {
        this.launchSceneViewer(blob, filename);
      }
    }

    return blob;
  }

  /**
   * Export to USDZ format (iOS AR Quick Look)
   */
  public async exportUSDZ(model: ModelData, config: USDZConfig = {}): Promise<Blob> {
    const {
      scale = 1.0,
      title = 'Model',
      optimize = true,
      maxTextureSize = 2048,
      usePBR = true
    } = config;

    // Generate USDA (USD ASCII) content
    const usda = this._generateUSDA(model, {
      scale,
      title,
      usePBR,
      maxTextureSize
    });

    // Convert to binary (in real implementation, would use USD libraries)
    // For now, we'll create a simple text-based version
    const blob = new Blob([usda], { type: 'model/vnd.usdz+zip' });

    return blob;
  }

  /**
   * Export to GLB format (Android Scene Viewer, general glTF)
   */
  public async exportGLB(model: ModelData, config: GLBConfig = {}): Promise<Blob> {
    const {
      scale = 1.0,
      title = 'Model',
      optimize = true,
      maxTextureSize = 2048,
      includeAnimations = false,
      useDraco = false
    } = config;

    // Generate glTF JSON
    const gltf = this._generateGLTF(model, {
      scale,
      title,
      maxTextureSize,
      includeAnimations,
      useDraco
    });

    // Convert to GLB binary format
    const glb = this._convertToGLB(gltf, model);

    return new Blob([glb], { type: 'model/gltf-binary' });
  }

  /**
   * Launch iOS AR Quick Look
   */
  public launchARQuickLook(blob: Blob, filename: string = 'model.usdz'): void {
    if (this._platform !== 'ios') {
      console.warn('AR Quick Look is only available on iOS');
      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.rel = 'ar';
    anchor.href = url;
    anchor.download = filename;

    // Add AR Quick Look specific attributes
    anchor.setAttribute('rel', 'ar');

    // Trigger download/AR view
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Clean up after delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Launch Android Scene Viewer
   */
  public launchSceneViewer(blob: Blob, filename: string = 'model.glb', title?: string): void {
    if (this._platform !== 'android') {
      console.warn('Scene Viewer is only available on Android');
      return;
    }

    const url = URL.createObjectURL(blob);

    // Create Scene Viewer intent URL
    const intentUrl = `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(url)}&mode=ar_preferred${
      title ? `&title=${encodeURIComponent(title)}` : ''
    }#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(
      url
    )};end;`;

    window.location.href = intentUrl;

    // Clean up after delay
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /**
   * Generate USDA content
   */
  private _generateUSDA(
    model: ModelData,
    config: {
      scale: number;
      title: string;
      usePBR: boolean;
      maxTextureSize: number;
    }
  ): string {
    const { scale, title, usePBR } = config;

    // USD ASCII header
    let usda = `#usda 1.0
(
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Root"
{
    def Scope "Meshes"
    {
`;

    // Add mesh data
    const meshName = model.name || 'Mesh';
    usda += `        def Mesh "${meshName}"
        {
            float3[] extent = [(-1, -1, -1), (1, 1, 1)]
            int[] faceVertexCounts = [`;

    // Face vertex counts (triangles = 3)
    const faceCount = model.indices ? model.indices.length / 3 : model.vertices.length / 9;
    usda += Array(faceCount).fill(3).join(', ');

    usda += `]
            int[] faceVertexIndices = [`;

    // Indices
    if (model.indices) {
      usda += Array.from(model.indices).join(', ');
    } else {
      usda += Array.from({ length: model.vertices.length / 3 }, (_, i) => i).join(', ');
    }

    usda += `]
            point3f[] points = [`;

    // Vertices
    const vertices: string[] = [];
    for (let i = 0; i < model.vertices.length; i += 3) {
      const x = model.vertices[i] * scale;
      const y = model.vertices[i + 1] * scale;
      const z = model.vertices[i + 2] * scale;
      vertices.push(`(${x}, ${y}, ${z})`);
    }
    usda += vertices.join(', ');

    usda += `]
`;

    // Normals
    if (model.normals) {
      usda += `            normal3f[] normals = [`;
      const normals: string[] = [];
      for (let i = 0; i < model.normals.length; i += 3) {
        normals.push(
          `(${model.normals[i]}, ${model.normals[i + 1]}, ${model.normals[i + 2]})`
        );
      }
      usda += normals.join(', ');
      usda += `]
`;
    }

    // UVs
    if (model.uvs) {
      usda += `            texCoord2f[] primvars:st = [`;
      const uvs: string[] = [];
      for (let i = 0; i < model.uvs.length; i += 2) {
        uvs.push(`(${model.uvs[i]}, ${model.uvs[i + 1]})`);
      }
      usda += uvs.join(', ');
      usda += `] (
                interpolation = "vertex"
            )
`;
    }

    usda += `        }
    }
}
`;

    return usda;
  }

  /**
   * Generate glTF JSON
   */
  private _generateGLTF(
    model: ModelData,
    config: {
      scale: number;
      title: string;
      maxTextureSize: number;
      includeAnimations: boolean;
      useDraco: boolean;
    }
  ): any {
    const gltf: any = {
      asset: {
        version: '2.0',
        generator: 'G3D ARExporter',
        copyright: config.title
      },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        {
          name: 'Root',
          mesh: 0,
          scale: [config.scale, config.scale, config.scale]
        }
      ],
      meshes: [
        {
          name: model.name || 'Mesh',
          primitives: [
            {
              attributes: {
                POSITION: 0
              },
              mode: 4 // TRIANGLES
            }
          ]
        }
      ],
      accessors: [],
      bufferViews: [],
      buffers: []
    };

    // Add position accessor
    gltf.accessors.push({
      bufferView: 0,
      componentType: 5126, // FLOAT
      count: model.vertices.length / 3,
      type: 'VEC3',
      min: this._computeMin(model.vertices, 3),
      max: this._computeMax(model.vertices, 3)
    });

    // Add normals if available
    if (model.normals) {
      gltf.meshes[0].primitives[0].attributes.NORMAL = 1;
      gltf.accessors.push({
        bufferView: 1,
        componentType: 5126,
        count: model.normals.length / 3,
        type: 'VEC3'
      });
    }

    // Add UVs if available
    if (model.uvs) {
      gltf.meshes[0].primitives[0].attributes.TEXCOORD_0 = 2;
      gltf.accessors.push({
        bufferView: 2,
        componentType: 5126,
        count: model.uvs.length / 2,
        type: 'VEC2'
      });
    }

    // Add indices if available
    if (model.indices) {
      gltf.meshes[0].primitives[0].indices = gltf.accessors.length;
      gltf.accessors.push({
        bufferView: gltf.bufferViews.length,
        componentType: model.indices instanceof Uint32Array ? 5125 : 5123,
        count: model.indices.length,
        type: 'SCALAR'
      });
    }

    return gltf;
  }

  /**
   * Convert glTF to GLB binary format
   */
  private _convertToGLB(gltf: any, model: ModelData): ArrayBuffer {
    // Simplified GLB creation
    // In real implementation, would properly pack buffers

    const jsonString = JSON.stringify(gltf);
    const jsonBuffer = new TextEncoder().encode(jsonString);

    // Align to 4-byte boundary
    const jsonLength = Math.ceil(jsonBuffer.length / 4) * 4;
    const jsonPadded = new Uint8Array(jsonLength);
    jsonPadded.set(jsonBuffer);

    // GLB header
    const header = new ArrayBuffer(12);
    const headerView = new DataView(header);
    headerView.setUint32(0, 0x46546c67, true); // 'glTF' magic
    headerView.setUint32(4, 2, true); // version
    headerView.setUint32(8, 12 + 8 + jsonLength, true); // total length

    // JSON chunk header
    const jsonChunkHeader = new ArrayBuffer(8);
    const jsonChunkView = new DataView(jsonChunkHeader);
    jsonChunkView.setUint32(0, jsonLength, true);
    jsonChunkView.setUint32(4, 0x4e4f534a, true); // 'JSON'

    // Combine
    const glb = new Uint8Array(header.byteLength + jsonChunkHeader.byteLength + jsonLength);
    glb.set(new Uint8Array(header), 0);
    glb.set(new Uint8Array(jsonChunkHeader), 12);
    glb.set(jsonPadded, 20);

    return glb.buffer;
  }

  /**
   * Compute min values for vertex attribute
   */
  private _computeMin(data: Float32Array, stride: number): number[] {
    const min = Array(stride).fill(Infinity);
    for (let i = 0; i < data.length; i += stride) {
      for (let j = 0; j < stride; j++) {
        min[j] = Math.min(min[j], data[i + j]);
      }
    }
    return min;
  }

  /**
   * Compute max values for vertex attribute
   */
  private _computeMax(data: Float32Array, stride: number): number[] {
    const max = Array(stride).fill(-Infinity);
    for (let i = 0; i < data.length; i += stride) {
      for (let j = 0; j < stride; j++) {
        max[j] = Math.max(max[j], data[i + j]);
      }
    }
    return max;
  }

  /**
   * Download blob as file
   */
  private _downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  /**
   * Optimize model for AR
   */
  public optimizeForAR(model: ModelData, maxTextureSize: number = 2048): ModelData {
    // In real implementation, would:
    // - Reduce polygon count if too high
    // - Resize textures to maxTextureSize
    // - Compress textures
    // - Merge duplicate vertices
    // - Remove unused materials

    return model;
  }

  /**
   * Estimate file size
   */
  public estimateFileSize(model: ModelData, format: ARFormat): number {
    let size = 0;

    // Vertices
    size += model.vertices.length * 4; // 4 bytes per float

    // Normals
    if (model.normals) {
      size += model.normals.length * 4;
    }

    // UVs
    if (model.uvs) {
      size += model.uvs.length * 4;
    }

    // Indices
    if (model.indices) {
      size += model.indices.length * (model.indices instanceof Uint32Array ? 4 : 2);
    }

    // Format overhead
    if (format === 'usdz') {
      size *= 1.5; // USD has more overhead
    } else {
      size *= 1.2; // GLB is more efficient
    }

    return Math.ceil(size);
  }
}
