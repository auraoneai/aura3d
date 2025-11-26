/**
 * VolumeRenderer.ts - GPU-Accelerated Volume Rendering
 *
 * Implements ray marching volume rendering using WebGL2 3D textures.
 * Supports various rendering modes including direct volume rendering,
 * maximum intensity projection (MIP), and gradient shading.
 *
 * Performance target: 512³ volume @ 30 FPS
 *
 * @example
 * ```typescript
 * const renderer = new VolumeRenderer(gl);
 * renderer.setVolume(volumeData);
 * renderer.setTransferFunction(transferFunction);
 * renderer.setRenderMode('DVR');
 * renderer.render(camera, targetFramebuffer);
 * ```
 */

import { VolumeData } from './VolumeData';
import { TransferFunction } from './TransferFunction';

export type RenderMode = 'DVR' | 'MIP' | 'MinIP' | 'AVERAGE';

export interface Camera {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fov: number;
  aspect: number;
  near: number;
  far: number;
}

export interface RenderSettings {
  stepSize: number;
  alphaThreshold: number;
  enableShading: boolean;
  ambientLight: number;
  diffuseLight: number;
  specularLight: number;
  shininess: number;
  lightDirection: [number, number, number];
}

export class VolumeRenderer {
  private gl: WebGL2RenderingContext;
  private volumeTexture: WebGLTexture | null = null;
  private transferFunctionTexture: WebGLTexture | null = null;
  private shaderProgram: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private volumeData: VolumeData | null = null;
  private renderMode: RenderMode = 'DVR';

  private settings: RenderSettings = {
    stepSize: 0.005,
    alphaThreshold: 0.95,
    enableShading: true,
    ambientLight: 0.3,
    diffuseLight: 0.6,
    specularLight: 0.3,
    shininess: 32.0,
    lightDirection: [0.5, 0.5, 1.0]
  };

  // Shader source
  private vertexShaderSource = `#version 300 es
    precision highp float;

    in vec3 a_position;

    uniform mat4 u_modelViewProjection;

    out vec3 v_position;

    void main() {
      v_position = a_position;
      gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
    }
  `;

  private fragmentShaderSource = `#version 300 es
    precision highp float;
    precision highp sampler3D;

    in vec3 v_position;

    uniform sampler3D u_volume;
    uniform sampler2D u_transferFunction;
    uniform vec3 u_volumeDimensions;
    uniform vec3 u_volumeSpacing;
    uniform vec3 u_cameraPosition;
    uniform float u_stepSize;
    uniform float u_alphaThreshold;
    uniform int u_renderMode; // 0=DVR, 1=MIP, 2=MinIP, 3=AVERAGE
    uniform bool u_enableShading;
    uniform vec3 u_lightDirection;
    uniform float u_ambientLight;
    uniform float u_diffuseLight;
    uniform float u_specularLight;
    uniform float u_shininess;
    uniform vec2 u_valueRange;

    out vec4 fragColor;

    vec3 calculateGradient(vec3 pos) {
      vec3 s = 1.0 / u_volumeDimensions;

      float gx = texture(u_volume, pos + vec3(s.x, 0, 0)).r -
                 texture(u_volume, pos - vec3(s.x, 0, 0)).r;
      float gy = texture(u_volume, pos + vec3(0, s.y, 0)).r -
                 texture(u_volume, pos - vec3(0, s.y, 0)).r;
      float gz = texture(u_volume, pos + vec3(0, 0, s.z)).r -
                 texture(u_volume, pos - vec3(0, 0, s.z)).r;

      return vec3(gx, gy, gz) / (2.0 * u_volumeSpacing);
    }

    vec4 applyTransferFunction(float value, vec3 gradient) {
      float normalized = (value - u_valueRange.x) / (u_valueRange.y - u_valueRange.x);
      normalized = clamp(normalized, 0.0, 1.0);
      vec4 color = texture(u_transferFunction, vec2(normalized, 0.5));

      // Apply gradient-based opacity modulation if gradient is provided
      if (length(gradient) > 0.0) {
        float gradMag = length(gradient);
        color.a *= smoothstep(0.0, 0.3, gradMag);
      }

      return color;
    }

    vec3 phongShading(vec3 color, vec3 normal, vec3 viewDir, vec3 lightDir) {
      // Ambient
      vec3 ambient = color * u_ambientLight;

      // Diffuse
      float diff = max(dot(normal, lightDir), 0.0);
      vec3 diffuse = color * diff * u_diffuseLight;

      // Specular
      vec3 reflectDir = reflect(-lightDir, normal);
      float spec = pow(max(dot(viewDir, reflectDir), 0.0), u_shininess);
      vec3 specular = vec3(1.0) * spec * u_specularLight;

      return ambient + diffuse + specular;
    }

    void main() {
      vec3 rayOrigin = u_cameraPosition;
      vec3 rayDir = normalize(v_position - rayOrigin);

      // Ray-box intersection
      vec3 boxMin = vec3(0.0);
      vec3 boxMax = vec3(1.0);

      vec3 invRayDir = 1.0 / rayDir;
      vec3 tMin = (boxMin - rayOrigin) * invRayDir;
      vec3 tMax = (boxMax - rayOrigin) * invRayDir;

      vec3 t1 = min(tMin, tMax);
      vec3 t2 = max(tMin, tMax);

      float tNear = max(max(t1.x, t1.y), t1.z);
      float tFar = min(min(t2.x, t2.y), t2.z);

      if (tNear > tFar || tFar < 0.0) {
        discard;
      }

      tNear = max(tNear, 0.0);

      // Ray marching
      vec3 pos = rayOrigin + rayDir * tNear;
      vec3 step = rayDir * u_stepSize;
      float travel = tNear;

      vec4 result = vec4(0.0);
      float maxValue = -1e10;
      float minValue = 1e10;
      float avgValue = 0.0;
      int sampleCount = 0;

      while (travel < tFar && result.a < u_alphaThreshold) {
        if (all(greaterThanEqual(pos, boxMin)) && all(lessThanEqual(pos, boxMax))) {
          float value = texture(u_volume, pos).r;
          sampleCount++;

          if (u_renderMode == 0) { // DVR
            vec3 gradient = u_enableShading ? calculateGradient(pos) : vec3(0.0);
            vec4 color = applyTransferFunction(value, gradient);

            if (u_enableShading && color.a > 0.01 && length(gradient) > 0.01) {
              vec3 normal = normalize(gradient);
              vec3 viewDir = normalize(rayOrigin - pos);
              vec3 lightDir = normalize(u_lightDirection);
              color.rgb = phongShading(color.rgb, normal, viewDir, lightDir);
            }

            // Front-to-back compositing
            color.rgb *= color.a;
            result += color * (1.0 - result.a);

          } else if (u_renderMode == 1) { // MIP
            maxValue = max(maxValue, value);

          } else if (u_renderMode == 2) { // MinIP
            minValue = min(minValue, value);

          } else if (u_renderMode == 3) { // AVERAGE
            avgValue += value;
          }
        }

        pos += step;
        travel += u_stepSize;
      }

      // Finalize based on render mode
      if (u_renderMode == 1) { // MIP
        if (maxValue > -1e10) {
          result = applyTransferFunction(maxValue, vec3(0.0));
        }
      } else if (u_renderMode == 2) { // MinIP
        if (minValue < 1e10) {
          result = applyTransferFunction(minValue, vec3(0.0));
        }
      } else if (u_renderMode == 3) { // AVERAGE
        if (sampleCount > 0) {
          avgValue /= float(sampleCount);
          result = applyTransferFunction(avgValue, vec3(0.0));
        }
      }

      fragColor = result;
    }
  `;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.initializeShaders();
    this.initializeGeometry();
  }

  private initializeShaders(): void {
    const gl = this.gl;

    const vertexShader = this.compileShader(gl.VERTEX_SHADER, this.vertexShaderSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource);

    this.shaderProgram = gl.createProgram()!;
    gl.attachShader(this.shaderProgram, vertexShader);
    gl.attachShader(this.shaderProgram, fragmentShader);
    gl.linkProgram(this.shaderProgram);

    if (!gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS)) {
      throw new Error('Shader program link failed: ' + gl.getProgramInfoLog(this.shaderProgram));
    }

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Shader compilation failed: ' + error);
    }

    return shader;
  }

  private initializeGeometry(): void {
    const gl = this.gl;

    // Cube vertices for ray entry points
    const vertices = new Float32Array([
      // Front face
      0, 0, 0,  1, 0, 0,  1, 1, 0,
      0, 0, 0,  1, 1, 0,  0, 1, 0,
      // Back face
      0, 0, 1,  1, 1, 1,  1, 0, 1,
      0, 0, 1,  0, 1, 1,  1, 1, 1,
      // Top face
      0, 1, 0,  1, 1, 0,  1, 1, 1,
      0, 1, 0,  1, 1, 1,  0, 1, 1,
      // Bottom face
      0, 0, 0,  1, 0, 1,  1, 0, 0,
      0, 0, 0,  0, 0, 1,  1, 0, 1,
      // Right face
      1, 0, 0,  1, 0, 1,  1, 1, 1,
      1, 0, 0,  1, 1, 1,  1, 1, 0,
      // Left face
      0, 0, 0,  0, 1, 0,  0, 1, 1,
      0, 0, 0,  0, 1, 1,  0, 0, 1
    ]);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const positionLoc = gl.getAttribLocation(this.shaderProgram!, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  /**
   * Sets the volume data to render.
   */
  setVolume(volume: VolumeData): void {
    this.volumeData = volume;
    this.uploadVolumeTexture(volume);
  }

  private uploadVolumeTexture(volume: VolumeData): void {
    const gl = this.gl;

    if (this.volumeTexture) {
      gl.deleteTexture(this.volumeTexture);
    }

    this.volumeTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, this.volumeTexture);

    const [width, height, depth] = volume.getDimensions();
    const data = volume.getData();

    // Convert to float for better precision
    let floatData: Float32Array;
    if (data instanceof Float32Array) {
      floatData = data;
    } else {
      floatData = new Float32Array(data.length);
      for (let i = 0; i < data.length; i++) {
        floatData[i] = data[i];
      }
    }

    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.R32F,
      width,
      height,
      depth,
      0,
      gl.RED,
      gl.FLOAT,
      floatData
    );

    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

    gl.bindTexture(gl.TEXTURE_3D, null);
  }

  /**
   * Sets the transfer function for color/opacity mapping.
   */
  setTransferFunction(tf: TransferFunction): void {
    const gl = this.gl;

    if (this.transferFunctionTexture) {
      gl.deleteTexture(this.transferFunctionTexture);
    }

    this.transferFunctionTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.transferFunctionTexture);

    const tfData = tf.generateTexture(256);

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      tfData
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Sets the rendering mode.
   */
  setRenderMode(mode: RenderMode): void {
    this.renderMode = mode;
  }

  /**
   * Updates render settings.
   */
  setSettings(settings: Partial<RenderSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Renders the volume from the given camera viewpoint.
   */
  render(camera: Camera, targetFramebuffer: WebGLFramebuffer | null = null): void {
    if (!this.volumeData || !this.volumeTexture || !this.transferFunctionTexture) {
      console.warn('Volume or transfer function not set');
      return;
    }

    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer);
    gl.useProgram(this.shaderProgram);
    gl.bindVertexArray(this.vao);

    // Set up blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);

    // Bind textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.volumeTexture);
    gl.uniform1i(gl.getUniformLocation(this.shaderProgram!, 'u_volume'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.transferFunctionTexture);
    gl.uniform1i(gl.getUniformLocation(this.shaderProgram!, 'u_transferFunction'), 1);

    // Set uniforms
    const mvpMatrix = this.computeMVP(camera);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.shaderProgram!, 'u_modelViewProjection'), false, mvpMatrix);

    const [width, height, depth] = this.volumeData.getDimensions();
    gl.uniform3f(gl.getUniformLocation(this.shaderProgram!, 'u_volumeDimensions'), width, height, depth);

    const spacing = this.volumeData.getSpacing();
    gl.uniform3f(gl.getUniformLocation(this.shaderProgram!, 'u_volumeSpacing'), spacing[0], spacing[1], spacing[2]);

    gl.uniform3f(gl.getUniformLocation(this.shaderProgram!, 'u_cameraPosition'),
      camera.position[0], camera.position[1], camera.position[2]);

    gl.uniform1f(gl.getUniformLocation(this.shaderProgram!, 'u_stepSize'), this.settings.stepSize);
    gl.uniform1f(gl.getUniformLocation(this.shaderProgram!, 'u_alphaThreshold'), this.settings.alphaThreshold);

    const modeMap: { [key in RenderMode]: number } = { 'DVR': 0, 'MIP': 1, 'MinIP': 2, 'AVERAGE': 3 };
    gl.uniform1i(gl.getUniformLocation(this.shaderProgram!, 'u_renderMode'), modeMap[this.renderMode]);

    gl.uniform1i(gl.getUniformLocation(this.shaderProgram!, 'u_enableShading'), this.settings.enableShading ? 1 : 0);
    gl.uniform3f(gl.getUniformLocation(this.shaderProgram!, 'u_lightDirection'),
      this.settings.lightDirection[0], this.settings.lightDirection[1], this.settings.lightDirection[2]);
    gl.uniform1f(gl.getUniformLocation(this.shaderProgram!, 'u_ambientLight'), this.settings.ambientLight);
    gl.uniform1f(gl.getUniformLocation(this.shaderProgram!, 'u_diffuseLight'), this.settings.diffuseLight);
    gl.uniform1f(gl.getUniformLocation(this.shaderProgram!, 'u_specularLight'), this.settings.specularLight);
    gl.uniform1f(gl.getUniformLocation(this.shaderProgram!, 'u_shininess'), this.settings.shininess);

    const minVal = this.volumeData.getMinValue();
    const maxVal = this.volumeData.getMaxValue();
    gl.uniform2f(gl.getUniformLocation(this.shaderProgram!, 'u_valueRange'), minVal, maxVal);

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 36);

    // Cleanup
    gl.bindVertexArray(null);
    gl.useProgram(null);
    gl.disable(gl.BLEND);
  }

  private computeMVP(camera: Camera): Float32Array {
    const view = this.lookAt(camera.position, camera.target, camera.up);
    const proj = this.perspective(camera.fov, camera.aspect, camera.near, camera.far);
    return this.multiplyMatrices(proj, view);
  }

  private lookAt(eye: [number, number, number], target: [number, number, number], up: [number, number, number]): Float32Array {
    const z = this.normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
    const x = this.normalize(this.cross(up, z));
    const y = this.cross(z, x);

    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -this.dot(x, eye), -this.dot(y, eye), -this.dot(z, eye), 1
    ]);
  }

  private perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
    const f = 1.0 / Math.tan(fovy / 2);
    const rangeInv = 1.0 / (near - far);

    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (near + far) * rangeInv, -1,
      0, 0, near * far * rangeInv * 2, 0
    ]);
  }

  private multiplyMatrices(a: Float32Array, b: Float32Array): Float32Array {
    const result = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[i * 4 + j] = 0;
        for (let k = 0; k < 4; k++) {
          result[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
        }
      }
    }
    return result;
  }

  private normalize(v: number[]): number[] {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  private cross(a: number[], b: number[]): number[] {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  private dot(a: number[], b: [number, number, number]): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  /**
   * Cleanup resources.
   */
  dispose(): void {
    const gl = this.gl;

    if (this.volumeTexture) {
      gl.deleteTexture(this.volumeTexture);
      this.volumeTexture = null;
    }

    if (this.transferFunctionTexture) {
      gl.deleteTexture(this.transferFunctionTexture);
      this.transferFunctionTexture = null;
    }

    if (this.shaderProgram) {
      gl.deleteProgram(this.shaderProgram);
      this.shaderProgram = null;
    }

    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }
  }
}
