import { Asset } from '../Asset';
import { IAssetLoader, LoadOptions } from '../AssetLoader';

/**
 * OBJ material data
 */
export interface OBJMaterial {
  name: string;
  ambient?: [number, number, number];
  diffuse?: [number, number, number];
  specular?: [number, number, number];
  emissive?: [number, number, number];
  shininess?: number;
  opacity?: number;
  illum?: number;
  mapDiffuse?: string;
  mapSpecular?: string;
  mapNormal?: string;
  mapBump?: string;
}

/**
 * OBJ mesh object
 */
export interface OBJObject {
  name: string;
  groups: OBJGroup[];
}

/**
 * OBJ group
 */
export interface OBJGroup {
  name: string;
  material?: string;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

/**
 * Parsed OBJ asset data
 */
export interface OBJAssetData {
  objects: OBJObject[];
  materials: Map<string, OBJMaterial>;
}

/**
 * OBJ asset
 */
export class OBJAsset extends Asset {
  private data: OBJAssetData | null = null;

  /**
   * Gets the OBJ data
   */
  getData(): OBJAssetData | null {
    return this.data;
  }

  /**
   * Sets the OBJ data
   */
  setData(data: OBJAssetData): void {
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

    // Calculate vertex data size
    for (const obj of this.data.objects) {
      for (const group of obj.groups) {
        size += group.positions.length * 4; // Float32
        size += group.normals.length * 4;
        size += group.uvs.length * 4;
        size += group.indices.length * 4; // Uint32
      }
    }

    // Estimate material data
    size += this.data.materials.size * 1024; // ~1KB per material

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
 * OBJ file loader with support for:
 * - Vertex positions, normals, and UVs
 * - Multiple objects
 * - Groups with materials
 * - MTL material files
 * - Triangulation of polygons
 *
 * @example
 * ```typescript
 * const loader = new OBJLoader();
 * const asset = await loader.load('model.obj');
 *
 * const data = asset.getData();
 * for (const obj of data.objects) {
 *   console.log(`Object: ${obj.name}`);
 *   for (const group of obj.groups) {
 *     console.log(`  Group: ${group.name}, vertices: ${group.positions.length / 3}`);
 *   }
 * }
 * ```
 */
export class OBJLoader implements IAssetLoader<OBJAsset> {
  /**
   * Loads an OBJ asset
   */
  async load(url: string, options: LoadOptions = {}): Promise<OBJAsset> {
    const asset = new OBJAsset({ name: url, metadata: { uri: url } });

    try {
      // Fetch OBJ file
      const response = await fetch(url, {
        headers: options.headers,
        credentials: options.credentials,
        signal: options.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();

      // Parse OBJ
      const objData = this.parseOBJ(text);

      // Load MTL if referenced
      const mtlLib = this.extractMtlLib(text);
      if (mtlLib) {
        const mtlUrl = this.resolveUrl(mtlLib, url);
        const materials = await this.loadMTL(mtlUrl);
        objData.materials = materials;
      }

      asset.setData(objData);

      return asset;
    } catch (error) {
      throw new Error(`Failed to load OBJ: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Checks if this loader can handle the URL
   */
  canLoad(url: string): boolean {
    return url.toLowerCase().endsWith('.obj');
  }

  /**
   * Gets supported file extensions
   */
  getSupportedExtensions(): string[] {
    return ['obj'];
  }

  /**
   * Parses OBJ file content
   * @private
   */
  private parseOBJ(text: string): OBJAssetData {
    const lines = text.split('\n');

    // Temporary storage
    const positions: [number, number, number][] = [];
    const normals: [number, number, number][] = [];
    const uvs: [number, number][] = [];

    // Output data
    const objects: OBJObject[] = [];
    let currentObject: OBJObject | null = null;
    let currentGroup: OBJGroup | null = null;
    let currentMaterial: string | undefined;

    // Vertex index mapping for current group
    const vertexMap = new Map<string, number>();

    const ensureObject = () => {
      if (!currentObject) {
        currentObject = { name: 'default', groups: [] };
        objects.push(currentObject);
      }
    };

    const ensureGroup = () => {
      ensureObject();
      if (!currentGroup) {
        currentGroup = {
          name: 'default',
          material: currentMaterial,
          positions: [],
          normals: [],
          uvs: [],
          indices: []
        };
        currentObject!.groups.push(currentGroup);
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line === '' || line.startsWith('#')) {
        continue;
      }

      const parts = line.split(/\s+/);
      const cmd = parts[0];

      switch (cmd) {
        case 'v': // Vertex position
          positions.push([
            parseFloat(parts[1]),
            parseFloat(parts[2]),
            parseFloat(parts[3])
          ]);
          break;

        case 'vn': // Vertex normal
          normals.push([
            parseFloat(parts[1]),
            parseFloat(parts[2]),
            parseFloat(parts[3])
          ]);
          break;

        case 'vt': // Vertex texture coordinate
          uvs.push([
            parseFloat(parts[1]),
            parseFloat(parts[2])
          ]);
          break;

        case 'f': // Face
          ensureGroup();
          this.parseFace(
            parts.slice(1),
            positions,
            normals,
            uvs,
            currentGroup!,
            vertexMap
          );
          break;

        case 'o': // Object
          currentObject = { name: parts[1] || 'unnamed', groups: [] };
          objects.push(currentObject);
          currentGroup = null;
          vertexMap.clear();
          break;

        case 'g': // Group
          ensureObject();
          currentGroup = {
            name: parts[1] || 'unnamed',
            material: currentMaterial,
            positions: [],
            normals: [],
            uvs: [],
            indices: []
          };
          currentObject!.groups.push(currentGroup);
          vertexMap.clear();
          break;

        case 'usemtl': // Use material
          currentMaterial = parts[1];
          if (currentGroup) {
            currentGroup.material = currentMaterial;
          }
          break;
      }
    }

    return {
      objects,
      materials: new Map()
    };
  }

  /**
   * Parses face definition
   * @private
   */
  private parseFace(
    vertices: string[],
    positions: [number, number, number][],
    normals: [number, number, number][],
    uvs: [number, number][],
    group: OBJGroup,
    vertexMap: Map<string, number>
  ): void {
    const indices: number[] = [];

    for (const vertex of vertices) {
      // Check cache
      let index = vertexMap.get(vertex);

      if (index === undefined) {
        // Parse vertex indices
        const parts = vertex.split('/');
        const posIdx = parseInt(parts[0]) - 1;
        const uvIdx = parts[1] ? parseInt(parts[1]) - 1 : -1;
        const normIdx = parts[2] ? parseInt(parts[2]) - 1 : -1;

        // Add vertex data
        index = group.positions.length / 3;

        if (posIdx >= 0 && posIdx < positions.length) {
          const pos = positions[posIdx];
          group.positions.push(pos[0], pos[1], pos[2]);
        } else {
          group.positions.push(0, 0, 0);
        }

        if (normIdx >= 0 && normIdx < normals.length) {
          const norm = normals[normIdx];
          group.normals.push(norm[0], norm[1], norm[2]);
        } else {
          group.normals.push(0, 1, 0);
        }

        if (uvIdx >= 0 && uvIdx < uvs.length) {
          const uv = uvs[uvIdx];
          group.uvs.push(uv[0], uv[1]);
        } else {
          group.uvs.push(0, 0);
        }

        vertexMap.set(vertex, index);
      }

      indices.push(index);
    }

    // Triangulate if needed
    if (indices.length === 3) {
      // Triangle
      group.indices.push(...indices);
    } else if (indices.length === 4) {
      // Quad -> 2 triangles
      group.indices.push(indices[0], indices[1], indices[2]);
      group.indices.push(indices[0], indices[2], indices[3]);
    } else if (indices.length > 4) {
      // Polygon -> triangle fan
      for (let i = 1; i < indices.length - 1; i++) {
        group.indices.push(indices[0], indices[i], indices[i + 1]);
      }
    }
  }

  /**
   * Extracts MTL library name from OBJ
   * @private
   */
  private extractMtlLib(text: string): string | null {
    const match = text.match(/^mtllib\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  /**
   * Loads MTL file
   * @private
   */
  private async loadMTL(url: string): Promise<Map<string, OBJMaterial>> {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`Failed to load MTL: ${response.statusText}`);
        return new Map();
      }

      const text = await response.text();
      return this.parseMTL(text);
    } catch (error) {
      console.warn(`Failed to load MTL: ${error}`);
      return new Map();
    }
  }

  /**
   * Parses MTL file content
   * @private
   */
  private parseMTL(text: string): Map<string, OBJMaterial> {
    const lines = text.split('\n');
    const materials = new Map<string, OBJMaterial>();
    let currentMaterial: OBJMaterial | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }

      const parts = trimmed.split(/\s+/);
      const cmd = parts[0];

      switch (cmd) {
        case 'newmtl':
          if (currentMaterial) {
            materials.set(currentMaterial.name, currentMaterial);
          }
          currentMaterial = { name: parts[1] };
          break;

        case 'Ka': // Ambient color
          if (currentMaterial) {
            currentMaterial.ambient = [
              parseFloat(parts[1]),
              parseFloat(parts[2]),
              parseFloat(parts[3])
            ];
          }
          break;

        case 'Kd': // Diffuse color
          if (currentMaterial) {
            currentMaterial.diffuse = [
              parseFloat(parts[1]),
              parseFloat(parts[2]),
              parseFloat(parts[3])
            ];
          }
          break;

        case 'Ks': // Specular color
          if (currentMaterial) {
            currentMaterial.specular = [
              parseFloat(parts[1]),
              parseFloat(parts[2]),
              parseFloat(parts[3])
            ];
          }
          break;

        case 'Ke': // Emissive color
          if (currentMaterial) {
            currentMaterial.emissive = [
              parseFloat(parts[1]),
              parseFloat(parts[2]),
              parseFloat(parts[3])
            ];
          }
          break;

        case 'Ns': // Shininess
          if (currentMaterial) {
            currentMaterial.shininess = parseFloat(parts[1]);
          }
          break;

        case 'd': // Opacity
          if (currentMaterial) {
            currentMaterial.opacity = parseFloat(parts[1]);
          }
          break;

        case 'illum': // Illumination model
          if (currentMaterial) {
            currentMaterial.illum = parseInt(parts[1]);
          }
          break;

        case 'map_Kd': // Diffuse texture
          if (currentMaterial) {
            currentMaterial.mapDiffuse = parts[1];
          }
          break;

        case 'map_Ks': // Specular texture
          if (currentMaterial) {
            currentMaterial.mapSpecular = parts[1];
          }
          break;

        case 'map_Bump':
        case 'bump': // Bump/normal map
          if (currentMaterial) {
            currentMaterial.mapBump = parts[1];
          }
          break;
      }
    }

    // Add last material
    if (currentMaterial) {
      materials.set(currentMaterial.name, currentMaterial);
    }

    return materials;
  }

  /**
   * Resolves relative URL
   * @private
   */
  private resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    return baseDir + url;
  }
}
