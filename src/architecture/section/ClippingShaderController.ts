/**
 * ClippingShaderController.ts
 * GPU-accelerated clipping plane shader management
 * Part of G3D 5.0 Architecture/BIM Module
 */

import { Vector3 } from '../../math';
import { Shader } from '../../rendering';
import { SectionPlane } from './SectionPlane';
import { IClippingPlaneUniform } from './SectionTypes';

/**
 * Clipping shader injection code
 */
const CLIPPING_SHADER_CHUNK = `
#if NUM_CLIPPING_PLANES > 0
  uniform vec4 clippingPlanes[NUM_CLIPPING_PLANES];
  uniform int clippingEnabled[NUM_CLIPPING_PLANES];

  bool isClipped(vec3 worldPos) {
    for (int i = 0; i < NUM_CLIPPING_PLANES; i++) {
      if (clippingEnabled[i] == 0) continue;

      float dist = dot(worldPos, clippingPlanes[i].xyz) + clippingPlanes[i].w;
      if (dist < 0.0) return true;
    }
    return false;
  }
#endif
`;

const CLIPPING_VERTEX_CHUNK = `
#if NUM_CLIPPING_PLANES > 0
  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
#endif
`;

const CLIPPING_FRAGMENT_CHUNK = `
#if NUM_CLIPPING_PLANES > 0
  if (isClipped(vWorldPosition)) {
    discard;
  }
#endif
`;

/**
 * GPU-accelerated clipping plane controller
 * Manages shader uniforms for real-time mesh clipping
 *
 * Performance: < 1ms per frame for up to 6 clipping planes
 *
 * @example
 * ```typescript
 * const controller = new ClippingShaderController();
 *
 * // Add clipping planes
 * controller.addPlane('section1', sectionPlane1);
 * controller.addPlane('section2', sectionPlane2);
 *
 * // Update shader program
 * controller.updateShader(shaderProgram);
 *
 * // Update uniforms each frame
 * controller.updateUniforms(shaderProgram);
 * ```
 */
export class ClippingShaderController {
  private planes: Map<string, SectionPlane>;
  private maxPlanes: number;
  private uniformData: IClippingPlaneUniform[];
  private needsUpdate: boolean;
  private shaderDefines: Map<string, string>;

  /**
   * Create a new clipping shader controller
   * @param maxPlanes - Maximum number of clipping planes (default: 6)
   */
  constructor(maxPlanes: number = 6) {
    this.planes = new Map();
    this.maxPlanes = maxPlanes;
    this.uniformData = [];
    this.needsUpdate = true;
    this.shaderDefines = new Map();

    this.initializeUniformData();
  }

  /**
   * Initialize uniform data arrays
   */
  private initializeUniformData(): void {
    this.uniformData = [];
    for (let i = 0; i < this.maxPlanes; i++) {
      this.uniformData.push({
        plane: new Float32Array(4),
        enabled: 0
      });
    }
  }

  /**
   * Add a clipping plane
   * @param name - Plane identifier
   * @param plane - Section plane
   * @returns True if added successfully
   */
  public addPlane(name: string, plane: SectionPlane): boolean {
    if (this.planes.size >= this.maxPlanes) {
      console.warn(`Maximum number of clipping planes (${this.maxPlanes}) reached`);
      return false;
    }

    this.planes.set(name, plane);
    this.needsUpdate = true;
    return true;
  }

  /**
   * Remove a clipping plane
   * @param name - Plane identifier
   * @returns True if removed
   */
  public removePlane(name: string): boolean {
    const removed = this.planes.delete(name);
    if (removed) {
      this.needsUpdate = true;
    }
    return removed;
  }

  /**
   * Get clipping plane
   * @param name - Plane identifier
   * @returns Section plane or undefined
   */
  public getPlane(name: string): SectionPlane | undefined {
    return this.planes.get(name);
  }

  /**
   * Clear all clipping planes
   */
  public clear(): void {
    this.planes.clear();
    this.needsUpdate = true;
  }

  /**
   * Update uniform data from planes
   */
  private updateUniformData(): void {
    let index = 0;

    for (const plane of this.planes.values()) {
      if (index >= this.maxPlanes) break;

      const coefficients = plane.getCoefficients();
      this.uniformData[index].plane.set(coefficients);
      this.uniformData[index].enabled = plane.enabled ? 1 : 0;
      index++;
    }

    // Clear unused slots
    for (let i = index; i < this.maxPlanes; i++) {
      this.uniformData[i].plane.fill(0);
      this.uniformData[i].enabled = 0;
    }

    this.needsUpdate = false;
  }

  /**
   * Get shader defines for clipping
   * @returns Shader defines
   */
  public getShaderDefines(): Map<string, string> {
    this.shaderDefines.clear();
    this.shaderDefines.set('NUM_CLIPPING_PLANES', this.maxPlanes.toString());
    return this.shaderDefines;
  }

  /**
   * Get shader code chunks
   * @returns Object with vertex and fragment shader chunks
   */
  public getShaderChunks(): {
    common: string;
    vertex: string;
    fragment: string;
  } {
    return {
      common: CLIPPING_SHADER_CHUNK,
      vertex: CLIPPING_VERTEX_CHUNK,
      fragment: CLIPPING_FRAGMENT_CHUNK
    };
  }

  /**
   * Inject clipping code into shader source
   * @param vertexSource - Vertex shader source
   * @param fragmentSource - Fragment shader source
   * @returns Modified shader sources
   */
  public injectShaderCode(
    vertexSource: string,
    fragmentSource: string
  ): { vertex: string; fragment: string } {
    const chunks = this.getShaderChunks();

    // Add varying declaration
    const varyingDecl = `
#if NUM_CLIPPING_PLANES > 0
  varying vec3 vWorldPosition;
#endif
`;

    // Inject into vertex shader
    let vertex = vertexSource;
    if (!vertex.includes('vWorldPosition')) {
      vertex = vertex.replace(
        'void main()',
        varyingDecl + chunks.common + '\nvoid main()'
      );
      vertex = vertex.replace(
        /}\s*$/,
        chunks.vertex + '\n}'
      );
    }

    // Inject into fragment shader
    let fragment = fragmentSource;
    if (!fragment.includes('isClipped')) {
      fragment = fragment.replace(
        'void main()',
        varyingDecl + chunks.common + '\nvoid main()'
      );
      fragment = fragment.replace(
        /void main\(\)\s*{/,
        'void main() {\n' + chunks.fragment
      );
    }

    return { vertex, fragment };
  }

  /**
   * Update shader uniforms
   * @param shader - Shader program to update
   */
  public updateUniforms(shader: Shader): void {
    if (this.needsUpdate) {
      this.updateUniformData();
    }

    // Set clipping plane uniforms
    const planeArray = new Float32Array(this.maxPlanes * 4);
    const enabledArray = new Int32Array(this.maxPlanes);

    for (let i = 0; i < this.maxPlanes; i++) {
      planeArray.set(this.uniformData[i].plane, i * 4);
      enabledArray[i] = this.uniformData[i].enabled;
    }

    shader.setUniform('clippingPlanes', planeArray);
    shader.setUniform('clippingEnabled', enabledArray);
  }

  /**
   * Check if shader needs clipping support
   * @returns True if any planes are active
   */
  public needsClipping(): boolean {
    return this.planes.size > 0;
  }

  /**
   * Get number of active planes
   * @returns Number of active (enabled) planes
   */
  public getActivePlaneCount(): number {
    let count = 0;
    for (const plane of this.planes.values()) {
      if (plane.enabled) count++;
    }
    return count;
  }

  /**
   * Get total plane count
   * @returns Total number of planes
   */
  public getPlaneCount(): number {
    return this.planes.size;
  }

  /**
   * Create shader program with clipping support
   * @param vertexSource - Base vertex shader source
   * @param fragmentSource - Base fragment shader source
   * @returns Shader program with clipping
   */
  public createClippingShader(
    vertexSource: string,
    fragmentSource: string
  ): { vertex: string; fragment: string; defines: Map<string, string> } {
    const injected = this.injectShaderCode(vertexSource, fragmentSource);
    const defines = this.getShaderDefines();

    return {
      vertex: injected.vertex,
      fragment: injected.fragment,
      defines
    };
  }

  /**
   * Generate section cap geometry for closed surfaces
   * @param geometry - Input geometry
   * @param plane - Section plane
   * @returns Cap geometry vertices and indices
   */
  public generateSectionCap(
    geometry: Float32Array,
    plane: SectionPlane
  ): { vertices: Float32Array; indices: Uint32Array } | null {
    // This is a simplified implementation
    // Full implementation would use polygon triangulation

    const vertices: number[] = [];
    const indices: number[] = [];

    // Extract triangles from geometry
    const triangleCount = geometry.length / 9; // 3 vertices * 3 components

    for (let i = 0; i < triangleCount; i++) {
      const offset = i * 9;
      const v1 = new Vector3(geometry[offset], geometry[offset + 1], geometry[offset + 2]);
      const v2 = new Vector3(geometry[offset + 3], geometry[offset + 4], geometry[offset + 5]);
      const v3 = new Vector3(geometry[offset + 6], geometry[offset + 7], geometry[offset + 8]);

      // Check if triangle intersects plane
      const d1 = plane.distanceToPoint(v1);
      const d2 = plane.distanceToPoint(v2);
      const d3 = plane.distanceToPoint(v3);

      // Triangle crosses plane
      if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0) ||
          (d2 > 0 && d3 < 0) || (d2 < 0 && d3 > 0) ||
          (d3 > 0 && d1 < 0) || (d3 < 0 && d1 > 0)) {

        // Find intersection edges and create cap
        const intersections: Vector3[] = [];

        const i12 = plane.intersectSegment(v1, v2);
        if (i12) intersections.push(i12);

        const i23 = plane.intersectSegment(v2, v3);
        if (i23) intersections.push(i23);

        const i31 = plane.intersectSegment(v3, v1);
        if (i31) intersections.push(i31);

        // Add intersection points to cap
        for (const point of intersections) {
          vertices.push(point.x, point.y, point.z);
        }
      }
    }

    if (vertices.length === 0) return null;

    // Simple fan triangulation from first vertex
    const vertexCount = vertices.length / 3;
    for (let i = 1; i < vertexCount - 1; i++) {
      indices.push(0, i, i + 1);
    }

    return {
      vertices: new Float32Array(vertices),
      indices: new Uint32Array(indices)
    };
  }

  /**
   * Enable all planes
   */
  public enableAll(): void {
    for (const plane of this.planes.values()) {
      plane.enabled = true;
    }
    this.needsUpdate = true;
  }

  /**
   * Disable all planes
   */
  public disableAll(): void {
    for (const plane of this.planes.values()) {
      plane.enabled = false;
    }
    this.needsUpdate = true;
  }
}
