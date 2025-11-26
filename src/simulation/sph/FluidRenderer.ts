import { Vector3 as Vec3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';

export interface FluidRenderingConfig {
  screenWidth: number;
  screenHeight: number;
  particleRadius: number;
  smoothingRadius: number;
  colorDiffuse: Vec3;
  colorSpecular: Vec3;
  shininess: number;
  refractionIndex: number;
  absorptionCoefficient: Vec3;
  enableThickness: boolean;
  enableRefraction: boolean;
  enableSubsurfaceScattering: boolean;
}

export class FluidRenderer {
  private config: FluidRenderingConfig;
  private depthBuffer: Float32Array;
  private thicknessBuffer: Float32Array;
  private normalBuffer: Float32Array;
  private colorBuffer: Float32Array;

  private depthTexture: WebGLTexture | null = null;
  private thicknessTexture: WebGLTexture | null = null;
  private normalTexture: WebGLTexture | null = null;
  private smoothDepthTexture: WebGLTexture | null = null;

  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;

  constructor(config: FluidRenderingConfig) {
    this.config = config;

    const pixelCount = config.screenWidth * config.screenHeight;
    this.depthBuffer = new Float32Array(pixelCount);
    this.thicknessBuffer = new Float32Array(pixelCount);
    this.normalBuffer = new Float32Array(pixelCount * 3);
    this.colorBuffer = new Float32Array(pixelCount * 4);

    Logger.info(
      `FluidRenderer initialized: ${config.screenWidth}x${config.screenHeight}, ` +
      `particleRadius=${config.particleRadius}`
    );
  }

  public initializeWebGL(
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ): void {
    this.gl = gl;

    this.depthTexture = this.createTexture(gl, this.config.screenWidth, this.config.screenHeight);
    this.thicknessTexture = this.createTexture(gl, this.config.screenWidth, this.config.screenHeight);
    this.normalTexture = this.createTexture(gl, this.config.screenWidth, this.config.screenHeight);
    this.smoothDepthTexture = this.createTexture(gl, this.config.screenWidth, this.config.screenHeight);

    Logger.info('FluidRenderer WebGL resources initialized');
  }

  private createTexture(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    width: number,
    height: number
  ): WebGLTexture | null {
    const texture = gl.createTexture();
    if (!texture) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.FLOAT,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
  }

  public renderDepth(
    positions: Float32Array,
    particleCount: number,
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array
  ): void {
    this.depthBuffer.fill(Number.MAX_VALUE);

    for (let i = 0; i < particleCount; i++) {
      const pIdx = i * 3;
      const worldPos = new Vec3(
        positions[pIdx],
        positions[pIdx + 1],
        positions[pIdx + 2]
      );

      const viewPos = this.transformPoint(worldPos, viewMatrix);
      const clipPos = this.transformPoint(viewPos, projectionMatrix);

      if (clipPos.z <= 0) continue;

      const ndcX = clipPos.x / clipPos.z;
      const ndcY = clipPos.y / clipPos.z;

      if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1) continue;

      const screenX = Math.floor((ndcX * 0.5 + 0.5) * this.config.screenWidth);
      const screenY = Math.floor((ndcY * 0.5 + 0.5) * this.config.screenHeight);

      const radius = this.config.particleRadius;
      const radiusPixels = Math.ceil((radius / clipPos.z) * projectionMatrix[0] * this.config.screenWidth * 0.5);

      for (let dy = -radiusPixels; dy <= radiusPixels; dy++) {
        for (let dx = -radiusPixels; dx <= radiusPixels; dx++) {
          const x = screenX + dx;
          const y = screenY + dy;

          if (x < 0 || x >= this.config.screenWidth || y < 0 || y >= this.config.screenHeight) {
            continue;
          }

          const distSq = dx * dx + dy * dy;
          if (distSq > radiusPixels * radiusPixels) continue;

          const depthOffset = Math.sqrt(radius * radius - (distSq / (radiusPixels * radiusPixels)) * radius * radius);
          const depth = clipPos.z - depthOffset;

          const bufferIdx = y * this.config.screenWidth + x;
          if (depth < this.depthBuffer[bufferIdx]) {
            this.depthBuffer[bufferIdx] = depth;
          }
        }
      }
    }
  }

  public renderThickness(
    positions: Float32Array,
    particleCount: number,
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array
  ): void {
    if (!this.config.enableThickness) return;

    this.thicknessBuffer.fill(0);

    for (let i = 0; i < particleCount; i++) {
      const pIdx = i * 3;
      const worldPos = new Vec3(
        positions[pIdx],
        positions[pIdx + 1],
        positions[pIdx + 2]
      );

      const viewPos = this.transformPoint(worldPos, viewMatrix);
      const clipPos = this.transformPoint(viewPos, projectionMatrix);

      if (clipPos.z <= 0) continue;

      const ndcX = clipPos.x / clipPos.z;
      const ndcY = clipPos.y / clipPos.z;

      if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1) continue;

      const screenX = Math.floor((ndcX * 0.5 + 0.5) * this.config.screenWidth);
      const screenY = Math.floor((ndcY * 0.5 + 0.5) * this.config.screenHeight);

      const radius = this.config.particleRadius;
      const radiusPixels = Math.ceil((radius / clipPos.z) * projectionMatrix[0] * this.config.screenWidth * 0.5);

      for (let dy = -radiusPixels; dy <= radiusPixels; dy++) {
        for (let dx = -radiusPixels; dx <= radiusPixels; dx++) {
          const x = screenX + dx;
          const y = screenY + dy;

          if (x < 0 || x >= this.config.screenWidth || y < 0 || y >= this.config.screenHeight) {
            continue;
          }

          const distSq = dx * dx + dy * dy;
          if (distSq > radiusPixels * radiusPixels) continue;

          const thickness = 2 * Math.sqrt(radius * radius - (distSq / (radiusPixels * radiusPixels)) * radius * radius);

          const bufferIdx = y * this.config.screenWidth + x;
          this.thicknessBuffer[bufferIdx] += thickness;
        }
      }
    }
  }

  public smoothDepth(iterations: number = 1, filterRadius: number = 5): void {
    const tempBuffer = new Float32Array(this.depthBuffer.length);

    for (let iter = 0; iter < iterations; iter++) {
      for (let y = 0; y < this.config.screenHeight; y++) {
        for (let x = 0; x < this.config.screenWidth; x++) {
          const idx = y * this.config.screenWidth + x;

          if (this.depthBuffer[idx] >= Number.MAX_VALUE) {
            tempBuffer[idx] = this.depthBuffer[idx];
            continue;
          }

          let weightSum = 0;
          let depthSum = 0;

          for (let dy = -filterRadius; dy <= filterRadius; dy++) {
            for (let dx = -filterRadius; dx <= filterRadius; dx++) {
              const nx = x + dx;
              const ny = y + dy;

              if (nx < 0 || nx >= this.config.screenWidth || ny < 0 || ny >= this.config.screenHeight) {
                continue;
              }

              const nIdx = ny * this.config.screenWidth + nx;
              if (this.depthBuffer[nIdx] >= Number.MAX_VALUE) continue;

              const distSq = dx * dx + dy * dy;
              const weight = Math.exp(-distSq / (2 * filterRadius * filterRadius));

              depthSum += this.depthBuffer[nIdx] * weight;
              weightSum += weight;
            }
          }

          if (weightSum > 0) {
            tempBuffer[idx] = depthSum / weightSum;
          } else {
            tempBuffer[idx] = this.depthBuffer[idx];
          }
        }
      }

      this.depthBuffer.set(tempBuffer);
    }
  }

  public computeNormals(): void {
    for (let y = 1; y < this.config.screenHeight - 1; y++) {
      for (let x = 1; x < this.config.screenWidth - 1; x++) {
        const idx = y * this.config.screenWidth + x;
        const nIdx = idx * 3;

        if (this.depthBuffer[idx] >= Number.MAX_VALUE) {
          this.normalBuffer[nIdx] = 0;
          this.normalBuffer[nIdx + 1] = 0;
          this.normalBuffer[nIdx + 2] = 1;
          continue;
        }

        const depthCenter = this.depthBuffer[idx];
        const depthRight = this.depthBuffer[y * this.config.screenWidth + (x + 1)];
        const depthLeft = this.depthBuffer[y * this.config.screenWidth + (x - 1)];
        const depthTop = this.depthBuffer[(y - 1) * this.config.screenWidth + x];
        const depthBottom = this.depthBuffer[(y + 1) * this.config.screenWidth + x];

        const ddx = (depthRight - depthLeft) * 0.5;
        const ddy = (depthBottom - depthTop) * 0.5;

        const normal = new Vec3(-ddx, -ddy, 1);
        normal.normalize();

        this.normalBuffer[nIdx] = normal.x;
        this.normalBuffer[nIdx + 1] = normal.y;
        this.normalBuffer[nIdx + 2] = normal.z;
      }
    }
  }

  public shade(
    lightDirection: Vec3,
    lightColor: Vec3,
    ambientColor: Vec3,
    cameraPosition: Vec3
  ): void {
    for (let y = 0; y < this.config.screenHeight; y++) {
      for (let x = 0; x < this.config.screenWidth; x++) {
        const idx = y * this.config.screenWidth + x;
        const cIdx = idx * 4;
        const nIdx = idx * 3;

        if (this.depthBuffer[idx] >= Number.MAX_VALUE) {
          this.colorBuffer[cIdx] = 0;
          this.colorBuffer[cIdx + 1] = 0;
          this.colorBuffer[cIdx + 2] = 0;
          this.colorBuffer[cIdx + 3] = 0;
          continue;
        }

        const normal = new Vec3(
          this.normalBuffer[nIdx],
          this.normalBuffer[nIdx + 1],
          this.normalBuffer[nIdx + 2]
        );

        const ndotl = Math.max(0, Vec3.dot(normal, lightDirection));

        const diffuse = new Vec3(
          this.config.colorDiffuse.x * lightColor.x * ndotl,
          this.config.colorDiffuse.y * lightColor.y * ndotl,
          this.config.colorDiffuse.z * lightColor.z * ndotl
        );

        const reflectDir = Vec3.subtract(
          Vec3.multiplyScalar(normal, 2 * ndotl),
          lightDirection
        );
        const viewDir = new Vec3(0, 0, 1);
        const specFactor = Math.pow(Math.max(0, Vec3.dot(reflectDir, viewDir)), this.config.shininess);

        const specular = new Vec3(
          this.config.colorSpecular.x * lightColor.x * specFactor,
          this.config.colorSpecular.y * lightColor.y * specFactor,
          this.config.colorSpecular.z * lightColor.z * specFactor
        );

        let finalColor = Vec3.add(Vec3.add(ambientColor, diffuse), specular);

        if (this.config.enableThickness) {
          const thickness = this.thicknessBuffer[idx];
          const absorption = new Vec3(
            Math.exp(-this.config.absorptionCoefficient.x * thickness),
            Math.exp(-this.config.absorptionCoefficient.y * thickness),
            Math.exp(-this.config.absorptionCoefficient.z * thickness)
          );

          finalColor = new Vec3(
            finalColor.x * absorption.x,
            finalColor.y * absorption.y,
            finalColor.z * absorption.z
          );
        }

        this.colorBuffer[cIdx] = Math.min(1, finalColor.x);
        this.colorBuffer[cIdx + 1] = Math.min(1, finalColor.y);
        this.colorBuffer[cIdx + 2] = Math.min(1, finalColor.z);
        this.colorBuffer[cIdx + 3] = 1.0;
      }
    }
  }

  private transformPoint(point: Vec3, matrix: Float32Array): Vec3 {
    const x = matrix[0] * point.x + matrix[4] * point.y + matrix[8] * point.z + matrix[12];
    const y = matrix[1] * point.x + matrix[5] * point.y + matrix[9] * point.z + matrix[13];
    const z = matrix[2] * point.x + matrix[6] * point.y + matrix[10] * point.z + matrix[14];
    const w = matrix[3] * point.x + matrix[7] * point.y + matrix[11] * point.z + matrix[15];

    if (w !== 0) {
      return new Vec3(x / w, y / w, z / w);
    }

    return new Vec3(x, y, z);
  }

  public getDepthBuffer(): Float32Array {
    return this.depthBuffer;
  }

  public getThicknessBuffer(): Float32Array {
    return this.thicknessBuffer;
  }

  public getNormalBuffer(): Float32Array {
    return this.normalBuffer;
  }

  public getColorBuffer(): Float32Array {
    return this.colorBuffer;
  }

  public getDepthTexture(): WebGLTexture | null {
    return this.depthTexture;
  }

  public getThicknessTexture(): WebGLTexture | null {
    return this.thicknessTexture;
  }

  public getNormalTexture(): WebGLTexture | null {
    return this.normalTexture;
  }

  public resize(width: number, height: number): void {
    this.config.screenWidth = width;
    this.config.screenHeight = height;

    const pixelCount = width * height;
    this.depthBuffer = new Float32Array(pixelCount);
    this.thicknessBuffer = new Float32Array(pixelCount);
    this.normalBuffer = new Float32Array(pixelCount * 3);
    this.colorBuffer = new Float32Array(pixelCount * 4);

    if (this.gl) {
      if (this.depthTexture) this.gl.deleteTexture(this.depthTexture);
      if (this.thicknessTexture) this.gl.deleteTexture(this.thicknessTexture);
      if (this.normalTexture) this.gl.deleteTexture(this.normalTexture);
      if (this.smoothDepthTexture) this.gl.deleteTexture(this.smoothDepthTexture);

      this.depthTexture = this.createTexture(this.gl, width, height);
      this.thicknessTexture = this.createTexture(this.gl, width, height);
      this.normalTexture = this.createTexture(this.gl, width, height);
      this.smoothDepthTexture = this.createTexture(this.gl, width, height);
    }

    Logger.info(`FluidRenderer resized to ${width}x${height}`);
  }

  public dispose(): void {
    if (this.gl) {
      if (this.depthTexture) this.gl.deleteTexture(this.depthTexture);
      if (this.thicknessTexture) this.gl.deleteTexture(this.thicknessTexture);
      if (this.normalTexture) this.gl.deleteTexture(this.normalTexture);
      if (this.smoothDepthTexture) this.gl.deleteTexture(this.smoothDepthTexture);
    }

    this.depthTexture = null;
    this.thicknessTexture = null;
    this.normalTexture = null;
    this.smoothDepthTexture = null;
    this.gl = null;

    Logger.info('FluidRenderer disposed');
  }
}
