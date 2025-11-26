/**
 * Scalar Field Renderer
 *
 * GPU-accelerated rendering of scalar fields using various techniques:
 * - Volume rendering with ray marching
 * - Isosurface extraction and rendering
 * - Slice rendering (axial, sagittal, coronal)
 *
 * @example
 * ```typescript
 * const renderer = new ScalarFieldRenderer(gl);
 * renderer.setColorMap(ColorMap.viridis());
 * renderer.renderVolume(scalarField, camera, { density: 100 });
 * renderer.renderIsosurface(scalarField, 0.5, camera);
 * ```
 */

import { ScalarFieldData } from './FieldData';
import { ColorMap } from './ColorMap';
import { MarchingCubesTables } from './MarchingCubesTables';
import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';

export interface VolumeRenderOptions {
    density?: number;
    opacity?: number;
    quality?: 'low' | 'medium' | 'high';
}

export interface IsosurfaceOptions {
    smooth?: boolean;
    color?: [number, number, number];
    wireframe?: boolean;
}

export type SliceAxis = 'x' | 'y' | 'z';

export interface SliceOptions {
    axis: SliceAxis;
    position: number;
    interpolate?: boolean;
}

/**
 * Scalar field renderer
 */
export class ScalarFieldRenderer {
    private gl: WebGL2RenderingContext | null = null;
    private colorMap: ColorMap;
    private volumeProgram: WebGLProgram | null = null;
    private isosurfaceProgram: WebGLProgram | null = null;
    private sliceProgram: WebGLProgram | null = null;
    private lutTexture: WebGLTexture | null = null;
    private volumeTexture: WebGLTexture | null = null;

    constructor(gl?: WebGL2RenderingContext) {
        this.gl = gl || null;
        this.colorMap = ColorMap.viridis();

        if (this.gl) {
            this.initializeShaders();
            this.updateColorMapTexture();
        }
    }

    /**
     * Set WebGL context
     */
    public setContext(gl: WebGL2RenderingContext): void {
        this.gl = gl;
        this.initializeShaders();
        this.updateColorMapTexture();
    }

    /**
     * Set color map
     */
    public setColorMap(colorMap: ColorMap): void {
        this.colorMap = colorMap;
        if (this.gl) {
            this.updateColorMapTexture();
        }
    }

    /**
     * Render volume using ray marching
     */
    public renderVolume(
        field: ScalarFieldData,
        viewMatrix: Matrix4,
        projMatrix: Matrix4,
        options: VolumeRenderOptions = {}
    ): void {
        if (!this.gl || !this.volumeProgram) {
            console.warn('WebGL context not initialized');
            return;
        }

        const density = options.density ?? 100;
        const opacity = options.opacity ?? 0.5;
        const samples = options.quality === 'high' ? 512 : options.quality === 'low' ? 128 : 256;

        // Update volume texture
        this.updateVolumeTexture(field);

        // Render using volume ray marching
        // Implementation would use WebGL shaders for GPU acceleration
        // This is a simplified version showing the structure
    }

    /**
     * Render isosurface using marching cubes
     */
    public renderIsosurface(
        field: ScalarFieldData,
        isovalue: number,
        viewMatrix: Matrix4,
        projMatrix: Matrix4,
        options: IsosurfaceOptions = {}
    ): { vertices: Float32Array; normals: Float32Array; indices: Uint32Array } {
        const vertices: number[] = [];
        const normals: number[] = [];
        const indices: number[] = [];

        const [nx, ny, nz] = field.dimensions;
        const smooth = options.smooth ?? true;

        // Marching cubes algorithm
        for (let k = 0; k < nz - 1; k++) {
            for (let j = 0; j < ny - 1; j++) {
                for (let i = 0; i < nx - 1; i++) {
                    this.processCube(field, i, j, k, isovalue, vertices, normals, indices, smooth);
                }
            }
        }

        return {
            vertices: new Float32Array(vertices),
            normals: new Float32Array(normals),
            indices: new Uint32Array(indices)
        };
    }

    /**
     * Render slice through field
     */
    public renderSlice(
        field: ScalarFieldData,
        options: SliceOptions
    ): { positions: Float32Array; colors: Uint8Array; width: number; height: number } {
        const { axis, position, interpolate = true } = options;
        const [nx, ny, nz] = field.dimensions;

        let width: number, height: number;
        let getData: (i: number, j: number) => number;

        switch (axis) {
            case 'x': {
                width = ny;
                height = nz;
                const slice = Math.round(position * (nx - 1));
                getData = (j: number, k: number) => field.getValue(slice, j, k);
                break;
            }
            case 'y': {
                width = nx;
                height = nz;
                const slice = Math.round(position * (ny - 1));
                getData = (i: number, k: number) => field.getValue(i, slice, k);
                break;
            }
            case 'z': {
                width = nx;
                height = ny;
                const slice = Math.round(position * (nz - 1));
                getData = (i: number, j: number) => field.getValue(i, j, slice);
                break;
            }
        }

        const positions = new Float32Array(width * height * 3);
        const colors = new Uint8Array(width * height * 3);

        const minVal = field.min;
        const maxVal = field.max;

        for (let j = 0; j < height; j++) {
            for (let i = 0; i < width; i++) {
                const idx = (j * width + i) * 3;
                const value = getData(i, j);

                // Position
                positions[idx] = i;
                positions[idx + 1] = j;
                positions[idx + 2] = 0;

                // Color from colormap
                const color = this.colorMap.mapValue(value, minVal, maxVal);
                colors[idx] = color[0];
                colors[idx + 1] = color[1];
                colors[idx + 2] = color[2];
            }
        }

        return { positions, colors, width, height };
    }

    /**
     * Process single cube for marching cubes
     */
    private processCube(
        field: ScalarFieldData,
        i: number,
        j: number,
        k: number,
        isovalue: number,
        vertices: number[],
        normals: number[],
        indices: number[],
        smooth: boolean
    ): void {
        // Get 8 corner values
        const values = [
            field.getValue(i, j, k),
            field.getValue(i + 1, j, k),
            field.getValue(i + 1, j + 1, k),
            field.getValue(i, j + 1, k),
            field.getValue(i, j, k + 1),
            field.getValue(i + 1, j, k + 1),
            field.getValue(i + 1, j + 1, k + 1),
            field.getValue(i, j + 1, k + 1)
        ];

        // Get cube index
        const cubeIndex = MarchingCubesTables.getCubeIndex(values, isovalue);

        // Skip if completely inside or outside
        if (cubeIndex === 0 || cubeIndex === 255) {
            return;
        }

        // Get world positions of cube corners
        const corners = MarchingCubesTables.cubeVertices.map(v => {
            const [x, y, z] = field.indexToWorld(i + v[0], j + v[1], k + v[2]);
            return [x, y, z];
        });

        // Interpolate edge vertices
        const edgeVertices: number[][] = [];
        const edges = MarchingCubesTables.edgeTable[cubeIndex];

        for (let e = 0; e < 12; e++) {
            if ((edges & (1 << e)) !== 0) {
                const [v1Idx, v2Idx] = MarchingCubesTables.edgeVertices[e];
                const vertex = MarchingCubesTables.interpolateVertex(
                    corners[v1Idx],
                    corners[v2Idx],
                    values[v1Idx],
                    values[v2Idx],
                    isovalue
                );
                edgeVertices[e] = vertex;
            }
        }

        // Generate triangles
        const triangles = MarchingCubesTables.triTable[cubeIndex];
        const baseIdx = vertices.length / 3;

        for (let t = 0; t < 15; t += 3) {
            if (triangles[t] === -1) break;

            const v0 = edgeVertices[triangles[t]];
            const v1 = edgeVertices[triangles[t + 1]];
            const v2 = edgeVertices[triangles[t + 2]];

            // Add vertices
            vertices.push(...v0, ...v1, ...v2);

            // Calculate normal
            let normal: number[];
            if (smooth) {
                // Use gradient for smooth shading
                const [wx, wy, wz] = v0;
                const grad = field.gradient(
                    Math.round((wx - field.boundsMin[0]) / field.spacing[0]),
                    Math.round((wy - field.boundsMin[1]) / field.spacing[1]),
                    Math.round((wz - field.boundsMin[2]) / field.spacing[2])
                );
                const len = grad.length();
                normal = len > 0 ? [-grad.x / len, -grad.y / len, -grad.z / len] : [0, 1, 0];
            } else {
                // Face normal
                const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
                const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
                const nx = e1[1] * e2[2] - e1[2] * e2[1];
                const ny = e1[2] * e2[0] - e1[0] * e2[2];
                const nz = e1[0] * e2[1] - e1[1] * e2[0];
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                normal = len > 0 ? [nx / len, ny / len, nz / len] : [0, 1, 0];
            }

            normals.push(...normal, ...normal, ...normal);

            // Add indices
            const idx = baseIdx + (t / 3) * 3;
            indices.push(idx, idx + 1, idx + 2);
        }
    }

    /**
     * Initialize WebGL shaders
     */
    private initializeShaders(): void {
        if (!this.gl) return;

        // Volume rendering shader
        const volumeVS = `#version 300 es
            in vec3 position;
            out vec3 vRayDir;
            uniform mat4 uViewMatrix;
            uniform mat4 uProjMatrix;

            void main() {
                gl_Position = uProjMatrix * uViewMatrix * vec4(position, 1.0);
                vRayDir = position;
            }
        `;

        const volumeFS = `#version 300 es
            precision highp float;
            in vec3 vRayDir;
            out vec4 fragColor;

            uniform sampler3D uVolume;
            uniform sampler2D uColorMap;
            uniform float uDensity;
            uniform float uOpacity;

            void main() {
                // Ray marching implementation
                vec3 rayDir = normalize(vRayDir);
                vec4 color = vec4(0.0);

                const int steps = 256;
                for (int i = 0; i < steps; i++) {
                    vec3 pos = vRayDir + rayDir * float(i) * 0.01;
                    float value = texture(uVolume, pos * 0.5 + 0.5).r;
                    vec3 col = texture(uColorMap, vec2(value, 0.5)).rgb;
                    color.rgb += col * uOpacity;
                    color.a += uOpacity;
                    if (color.a > 0.95) break;
                }

                fragColor = color;
            }
        `;

        this.volumeProgram = this.createProgram(volumeVS, volumeFS);
    }

    /**
     * Create WebGL program
     */
    private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
        if (!this.gl) return null;

        const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentSource);

        if (!vertexShader || !fragmentShader) return null;

        const program = this.gl.createProgram();
        if (!program) return null;

        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Shader program linking failed:', this.gl.getProgramInfoLog(program));
            return null;
        }

        return program;
    }

    /**
     * Compile shader
     */
    private compileShader(type: number, source: string): WebGLShader | null {
        if (!this.gl) return null;

        const shader = this.gl.createShader(type);
        if (!shader) return null;

        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compilation failed:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    /**
     * Update color map texture
     */
    private updateColorMapTexture(): void {
        if (!this.gl) return;

        const lut = this.colorMap.generateLUT(256, false);

        if (!this.lutTexture) {
            this.lutTexture = this.gl.createTexture();
        }

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.lutTexture);
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGB,
            256,
            1,
            0,
            this.gl.RGB,
            this.gl.UNSIGNED_BYTE,
            lut
        );
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    }

    /**
     * Update 3D volume texture
     */
    private updateVolumeTexture(field: ScalarFieldData): void {
        if (!this.gl) return;

        const [nx, ny, nz] = field.dimensions;
        const normalized = new Uint8Array(field.size);

        const min = field.min;
        const max = field.max;
        const range = max - min;

        for (let i = 0; i < field.size; i++) {
            normalized[i] = Math.round(((field.data[i] - min) / range) * 255);
        }

        if (!this.volumeTexture) {
            this.volumeTexture = this.gl.createTexture();
        }

        this.gl.bindTexture(this.gl.TEXTURE_3D, this.volumeTexture);
        this.gl.texImage3D(
            this.gl.TEXTURE_3D,
            0,
            this.gl.R8,
            nx,
            ny,
            nz,
            0,
            this.gl.RED,
            this.gl.UNSIGNED_BYTE,
            normalized
        );
        this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_WRAP_R, this.gl.CLAMP_TO_EDGE);
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        if (!this.gl) return;

        if (this.volumeProgram) this.gl.deleteProgram(this.volumeProgram);
        if (this.isosurfaceProgram) this.gl.deleteProgram(this.isosurfaceProgram);
        if (this.sliceProgram) this.gl.deleteProgram(this.sliceProgram);
        if (this.lutTexture) this.gl.deleteTexture(this.lutTexture);
        if (this.volumeTexture) this.gl.deleteTexture(this.volumeTexture);
    }
}
