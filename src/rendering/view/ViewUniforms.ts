/**
 * Per-view uniform buffer management with std140 layout.
 * Provides CPU-side representation and GPU buffer updates.
 * @module ViewUniforms
 */

import { Matrix4 } from '../../math/Matrix4';
import { Vector3 } from '../../math/Vector3';
import { Vector4 } from '../../math/Vector4';
import { Camera } from '../camera/Camera';

/**
 * Per-view uniform data structure matching std140 layout.
 * This matches the GLSL/WGSL uniform buffer layout for efficient GPU transfer.
 *
 * std140 layout rules:
 * - vec3 aligns to 16 bytes (4 floats)
 * - mat4 is 4 x vec4 = 64 bytes
 * - Scalars align to 4 bytes
 *
 * Total size: 640 bytes
 */
export interface ViewUniformData {
  /**
   * View matrix (world to camera space). 64 bytes.
   */
  viewMatrix: Matrix4;

  /**
   * Projection matrix (camera to clip space). 64 bytes.
   */
  projectionMatrix: Matrix4;

  /**
   * Combined view-projection matrix. 64 bytes.
   */
  viewProjectionMatrix: Matrix4;

  /**
   * Inverse view matrix (camera to world space). 64 bytes.
   */
  inverseViewMatrix: Matrix4;

  /**
   * Inverse projection matrix. 64 bytes.
   */
  inverseProjectionMatrix: Matrix4;

  /**
   * Inverse view-projection matrix. 64 bytes.
   */
  inverseViewProjectionMatrix: Matrix4;

  /**
   * Previous frame's view matrix (for motion vectors). 64 bytes.
   */
  previousViewMatrix: Matrix4;

  /**
   * Previous frame's view-projection matrix. 64 bytes.
   */
  previousViewProjectionMatrix: Matrix4;

  /**
   * Camera position in world space. 16 bytes (vec4 in std140).
   */
  cameraPosition: Vector4;

  /**
   * Camera forward direction. 16 bytes (vec4 in std140).
   */
  cameraForward: Vector4;

  /**
   * Camera up direction. 16 bytes (vec4 in std140).
   */
  cameraUp: Vector4;

  /**
   * Camera right direction. 16 bytes (vec4 in std140).
   */
  cameraRight: Vector4;

  /**
   * Near and far plane distances, viewport size. 16 bytes.
   * x = near, y = far, z = viewport width, w = viewport height
   */
  cameraParams: Vector4;

  /**
   * Time and frame info. 16 bytes.
   * x = time (seconds), y = deltaTime, z = frame count, w = reserved
   */
  timeParams: Vector4;

  /**
   * Viewport info. 16 bytes.
   * x = viewport x, y = viewport y, z = viewport width, w = viewport height
   */
  viewportParams: Vector4;

  /**
   * Screen dimensions. 16 bytes.
   * x = screen width, y = screen height, z = 1/width, w = 1/height
   */
  screenParams: Vector4;
}

/**
 * ViewUniforms class for managing per-view uniform buffers.
 * Handles CPU-side data and provides methods for GPU buffer updates.
 *
 * @example
 * ```typescript
 * const camera = new Camera();
 * const uniforms = new ViewUniforms();
 *
 * // Update from camera
 * uniforms.updateFromCamera(camera, 1920, 1080);
 * uniforms.updateTime(elapsedTime, deltaTime, frameCount);
 *
 * // Get data for GPU upload
 * const buffer = uniforms.toFloat32Array();
 *
 * // In WebGPU
 * device.queue.writeBuffer(uniformBuffer, 0, buffer);
 *
 * // In WebGL2
 * gl.bufferSubData(gl.UNIFORM_BUFFER, 0, buffer);
 * ```
 */
export class ViewUniforms {
  /**
   * Uniform data structure.
   */
  private _data: ViewUniformData;

  /**
   * Cached Float32Array for GPU upload.
   */
  private _buffer: Float32Array;

  /**
   * Whether buffer needs updating.
   */
  private _dirty: boolean = true;

  /**
   * Creates a new ViewUniforms instance.
   *
   * @example
   * ```typescript
   * const uniforms = new ViewUniforms();
   * ```
   */
  constructor() {
    // Initialize with identity matrices
    this._data = {
      viewMatrix: new Matrix4(),
      projectionMatrix: new Matrix4(),
      viewProjectionMatrix: new Matrix4(),
      inverseViewMatrix: new Matrix4(),
      inverseProjectionMatrix: new Matrix4(),
      inverseViewProjectionMatrix: new Matrix4(),
      previousViewMatrix: new Matrix4(),
      previousViewProjectionMatrix: new Matrix4(),
      cameraPosition: new Vector4(0, 0, 0, 1),
      cameraForward: new Vector4(0, 0, -1, 0),
      cameraUp: new Vector4(0, 1, 0, 0),
      cameraRight: new Vector4(1, 0, 0, 0),
      cameraParams: new Vector4(0.1, 1000, 1920, 1080),
      timeParams: new Vector4(0, 0, 0, 0),
      viewportParams: new Vector4(0, 0, 1920, 1080),
      screenParams: new Vector4(1920, 1080, 1 / 1920, 1 / 1080),
    };

    // Calculate buffer size: 8 mat4 (64 bytes each) + 8 vec4 (16 bytes each) = 640 bytes
    this._buffer = new Float32Array(640 / 4);
  }

  /**
   * Gets the uniform data.
   * @returns View uniform data
   */
  get data(): Readonly<ViewUniformData> {
    return this._data;
  }

  /**
   * Updates uniforms from camera.
   *
   * @param camera - Camera to extract data from
   * @param viewportWidth - Viewport width in pixels
   * @param viewportHeight - Viewport height in pixels
   *
   * @example
   * ```typescript
   * uniforms.updateFromCamera(camera, 1920, 1080);
   * ```
   */
  updateFromCamera(camera: Camera, viewportWidth: number, viewportHeight: number): void {
    // Update matrices
    this._data.viewMatrix = camera.viewMatrix.clone();
    this._data.projectionMatrix = camera.projectionMatrix.clone();
    this._data.viewProjectionMatrix = camera.viewProjectionMatrix.clone();

    const invView = camera.inverseViewMatrix;
    const invProj = camera.inverseProjectionMatrix;
    const invVP = camera.inverseViewProjectionMatrix;

    this._data.inverseViewMatrix = invView ? invView.clone() : new Matrix4();
    this._data.inverseProjectionMatrix = invProj ? invProj.clone() : new Matrix4();
    this._data.inverseViewProjectionMatrix = invVP ? invVP.clone() : new Matrix4();

    this._data.previousViewMatrix = camera.previousViewMatrix.clone();
    this._data.previousViewProjectionMatrix = camera.previousViewProjectionMatrix.clone();

    // Update camera vectors
    const worldMatrix = camera.transform.worldMatrix;
    const position = camera.transform.worldPosition;

    this._data.cameraPosition.set(position.x, position.y, position.z, 1);

    // Extract direction vectors from world matrix
    const e = worldMatrix.elements;

    // Right vector (first column)
    this._data.cameraRight.set(e[0], e[1], e[2], 0);

    // Up vector (second column)
    this._data.cameraUp.set(e[4], e[5], e[6], 0);

    // Forward vector (negative third column for right-handed)
    this._data.cameraForward.set(-e[8], -e[9], -e[10], 0);

    // Update camera parameters
    this._data.cameraParams.set(camera.near, camera.far, viewportWidth, viewportHeight);

    // Update viewport parameters
    this._data.viewportParams.set(0, 0, viewportWidth, viewportHeight);

    // Update screen parameters
    this._data.screenParams.set(
      viewportWidth,
      viewportHeight,
      1 / viewportWidth,
      1 / viewportHeight
    );

    this._dirty = true;
  }

  /**
   * Updates time-related uniforms.
   *
   * @param time - Total elapsed time in seconds
   * @param deltaTime - Time since last frame in seconds
   * @param frameCount - Current frame number
   *
   * @example
   * ```typescript
   * uniforms.updateTime(elapsedTime, deltaTime, frameCount);
   * ```
   */
  updateTime(time: number, deltaTime: number, frameCount: number): void {
    this._data.timeParams.set(time, deltaTime, frameCount, 0);
    this._dirty = true;
  }

  /**
   * Updates viewport parameters.
   *
   * @param x - Viewport x position
   * @param y - Viewport y position
   * @param width - Viewport width
   * @param height - Viewport height
   *
   * @example
   * ```typescript
   * uniforms.updateViewport(0, 0, 1920, 1080);
   * ```
   */
  updateViewport(x: number, y: number, width: number, height: number): void {
    this._data.viewportParams.set(x, y, width, height);
    this._data.cameraParams.z = width;
    this._data.cameraParams.w = height;
    this._dirty = true;
  }

  /**
   * Updates screen parameters.
   *
   * @param width - Screen width in pixels
   * @param height - Screen height in pixels
   *
   * @example
   * ```typescript
   * uniforms.updateScreen(1920, 1080);
   * ```
   */
  updateScreen(width: number, height: number): void {
    this._data.screenParams.set(width, height, 1 / width, 1 / height);
    this._dirty = true;
  }

  /**
   * Converts uniforms to Float32Array for GPU upload.
   * Uses std140 layout rules.
   *
   * @returns Float32Array with uniform data
   *
   * @example
   * ```typescript
   * const buffer = uniforms.toFloat32Array();
   * device.queue.writeBuffer(uniformBuffer, 0, buffer);
   * ```
   */
  toFloat32Array(): Float32Array {
    if (!this._dirty) {
      return this._buffer;
    }

    let offset = 0;

    // Helper to write matrix (16 floats)
    const writeMatrix = (matrix: Matrix4) => {
      this._buffer.set(matrix.elements, offset);
      offset += 16;
    };

    // Helper to write vec4 (4 floats)
    const writeVec4 = (vec: Vector4) => {
      this._buffer[offset++] = vec.x;
      this._buffer[offset++] = vec.y;
      this._buffer[offset++] = vec.z;
      this._buffer[offset++] = vec.w;
    };

    // Write 8 matrices (512 bytes)
    writeMatrix(this._data.viewMatrix);
    writeMatrix(this._data.projectionMatrix);
    writeMatrix(this._data.viewProjectionMatrix);
    writeMatrix(this._data.inverseViewMatrix);
    writeMatrix(this._data.inverseProjectionMatrix);
    writeMatrix(this._data.inverseViewProjectionMatrix);
    writeMatrix(this._data.previousViewMatrix);
    writeMatrix(this._data.previousViewProjectionMatrix);

    // Write 8 vec4s (128 bytes)
    writeVec4(this._data.cameraPosition);
    writeVec4(this._data.cameraForward);
    writeVec4(this._data.cameraUp);
    writeVec4(this._data.cameraRight);
    writeVec4(this._data.cameraParams);
    writeVec4(this._data.timeParams);
    writeVec4(this._data.viewportParams);
    writeVec4(this._data.screenParams);

    this._dirty = false;
    return this._buffer;
  }

  /**
   * Gets the buffer size in bytes.
   * @returns Buffer size (640 bytes)
   */
  static getBufferSize(): number {
    return 640;
  }

  /**
   * Gets the buffer alignment for GPU.
   * @returns Alignment in bytes (256 bytes for most GPUs)
   */
  static getAlignment(): number {
    return 256; // Common minimum uniform buffer alignment
  }

  /**
   * Creates GLSL shader code for view uniforms.
   * @returns GLSL uniform block declaration
   *
   * @example
   * ```typescript
   * const glsl = ViewUniforms.generateGLSL();
   * console.log(glsl);
   * ```
   */
  static generateGLSL(): string {
    return `
layout(std140) uniform ViewUniforms {
    mat4 u_viewMatrix;
    mat4 u_projectionMatrix;
    mat4 u_viewProjectionMatrix;
    mat4 u_inverseViewMatrix;
    mat4 u_inverseProjectionMatrix;
    mat4 u_inverseViewProjectionMatrix;
    mat4 u_previousViewMatrix;
    mat4 u_previousViewProjectionMatrix;
    vec4 u_cameraPosition;
    vec4 u_cameraForward;
    vec4 u_cameraUp;
    vec4 u_cameraRight;
    vec4 u_cameraParams;      // near, far, viewportWidth, viewportHeight
    vec4 u_timeParams;         // time, deltaTime, frameCount, reserved
    vec4 u_viewportParams;     // x, y, width, height
    vec4 u_screenParams;       // width, height, 1/width, 1/height
};
`.trim();
  }

  /**
   * Creates WGSL shader code for view uniforms.
   * @returns WGSL uniform struct declaration
   *
   * @example
   * ```typescript
   * const wgsl = ViewUniforms.generateWGSL();
   * console.log(wgsl);
   * ```
   */
  static generateWGSL(): string {
    return `
struct ViewUniforms {
    viewMatrix: mat4x4<f32>,
    projectionMatrix: mat4x4<f32>,
    viewProjectionMatrix: mat4x4<f32>,
    inverseViewMatrix: mat4x4<f32>,
    inverseProjectionMatrix: mat4x4<f32>,
    inverseViewProjectionMatrix: mat4x4<f32>,
    previousViewMatrix: mat4x4<f32>,
    previousViewProjectionMatrix: mat4x4<f32>,
    cameraPosition: vec4<f32>,
    cameraForward: vec4<f32>,
    cameraUp: vec4<f32>,
    cameraRight: vec4<f32>,
    cameraParams: vec4<f32>,      // near, far, viewportWidth, viewportHeight
    timeParams: vec4<f32>,         // time, deltaTime, frameCount, reserved
    viewportParams: vec4<f32>,     // x, y, width, height
    screenParams: vec4<f32>,       // width, height, 1/width, 1/height
}

@group(0) @binding(0) var<uniform> view: ViewUniforms;
`.trim();
  }

  /**
   * Creates a copy of these uniforms.
   * @returns New ViewUniforms instance
   *
   * @example
   * ```typescript
   * const uniforms2 = uniforms.clone();
   * ```
   */
  clone(): ViewUniforms {
    const uniforms = new ViewUniforms();

    uniforms._data.viewMatrix.copy(this._data.viewMatrix);
    uniforms._data.projectionMatrix.copy(this._data.projectionMatrix);
    uniforms._data.viewProjectionMatrix.copy(this._data.viewProjectionMatrix);
    uniforms._data.inverseViewMatrix.copy(this._data.inverseViewMatrix);
    uniforms._data.inverseProjectionMatrix.copy(this._data.inverseProjectionMatrix);
    uniforms._data.inverseViewProjectionMatrix.copy(this._data.inverseViewProjectionMatrix);
    uniforms._data.previousViewMatrix.copy(this._data.previousViewMatrix);
    uniforms._data.previousViewProjectionMatrix.copy(this._data.previousViewProjectionMatrix);

    uniforms._data.cameraPosition.copy(this._data.cameraPosition);
    uniforms._data.cameraForward.copy(this._data.cameraForward);
    uniforms._data.cameraUp.copy(this._data.cameraUp);
    uniforms._data.cameraRight.copy(this._data.cameraRight);
    uniforms._data.cameraParams.copy(this._data.cameraParams);
    uniforms._data.timeParams.copy(this._data.timeParams);
    uniforms._data.viewportParams.copy(this._data.viewportParams);
    uniforms._data.screenParams.copy(this._data.screenParams);

    uniforms._dirty = true;

    return uniforms;
  }
}
