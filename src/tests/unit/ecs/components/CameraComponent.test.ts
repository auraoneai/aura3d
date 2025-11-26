/**
 * @fileoverview Unit tests for CameraComponent.
 * Tests perspective/orthographic projections, view matrix computation, frustum extraction, and ray casting.
 */

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * CameraComponent implementation for testing.
 */
class CameraComponent {
  active: boolean;
  fov: number;
  near: number;
  far: number;
  aspect: number;
  priority: number;
  targetTexture: string | null;
  clearFlags: 'solid' | 'skybox' | 'depth';
  clearColor: [number, number, number, number];
  projectionMode: 'perspective' | 'orthographic';
  orthographicSize: number;
  viewport: { x: number; y: number; width: number; height: number };

  constructor(options?: Partial<CameraComponent>) {
    this.active = options?.active ?? true;
    this.fov = options?.fov ?? Math.PI / 4;
    this.near = options?.near ?? 0.1;
    this.far = options?.far ?? 1000;
    this.aspect = options?.aspect ?? 16 / 9;
    this.priority = options?.priority ?? 0;
    this.targetTexture = options?.targetTexture ?? null;
    this.clearFlags = options?.clearFlags ?? 'solid';
    this.clearColor = options?.clearColor ?? [0, 0, 0, 1];
    this.projectionMode = options?.projectionMode ?? 'perspective';
    this.orthographicSize = options?.orthographicSize ?? 10;
    this.viewport = options?.viewport ?? { x: 0, y: 0, width: 1, height: 1 };
  }

  setPerspective(fov: number, aspect: number, near: number, far: number): this {
    this.projectionMode = 'perspective';
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    return this;
  }

  setOrthographic(size: number, aspect: number, near: number, far: number): this {
    this.projectionMode = 'orthographic';
    this.orthographicSize = size;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    return this;
  }

  getProjectionMatrix(): Float32Array {
    const matrix = new Float32Array(16);

    if (this.projectionMode === 'perspective') {
      const f = 1.0 / Math.tan(this.fov / 2);
      const rangeInv = 1.0 / (this.near - this.far);

      matrix[0] = f / this.aspect;
      matrix[5] = f;
      matrix[10] = (this.near + this.far) * rangeInv;
      matrix[11] = -1;
      matrix[14] = this.near * this.far * rangeInv * 2;
    } else {
      const width = this.orthographicSize * this.aspect;
      const height = this.orthographicSize;
      const depth = this.far - this.near;

      matrix[0] = 2 / width;
      matrix[5] = 2 / height;
      matrix[10] = -2 / depth;
      matrix[14] = -(this.far + this.near) / depth;
      matrix[15] = 1;
    }

    return matrix;
  }

  getViewMatrix(position: [number, number, number], rotation: [number, number, number, number]): Float32Array {
    const matrix = new Float32Array(16);
    const [x, y, z] = position;
    const [qx, qy, qz, qw] = rotation;

    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2;
    const yy = qy * y2, yz = qy * z2, zz = qz * z2;
    const wx = qw * x2, wy = qw * y2, wz = qw * z2;

    matrix[0] = 1 - (yy + zz);
    matrix[1] = xy + wz;
    matrix[2] = xz - wy;

    matrix[4] = xy - wz;
    matrix[5] = 1 - (xx + zz);
    matrix[6] = yz + wx;

    matrix[8] = xz + wy;
    matrix[9] = yz - wx;
    matrix[10] = 1 - (xx + yy);

    matrix[12] = -(matrix[0] * x + matrix[4] * y + matrix[8] * z);
    matrix[13] = -(matrix[1] * x + matrix[5] * y + matrix[9] * z);
    matrix[14] = -(matrix[2] * x + matrix[6] * y + matrix[10] * z);
    matrix[15] = 1;

    return matrix;
  }

  getFrustumPlanes(viewProjection: Float32Array): Array<{ normal: [number, number, number]; distance: number }> {
    const planes: Array<{ normal: [number, number, number]; distance: number }> = [];
    const m = viewProjection;

    const createPlane = (a: number, b: number, c: number, d: number) => {
      const length = Math.sqrt(a * a + b * b + c * c);
      return {
        normal: [a / length, b / length, c / length] as [number, number, number],
        distance: d / length
      };
    };

    planes.push(createPlane(m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]));
    planes.push(createPlane(m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]));
    planes.push(createPlane(m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]));
    planes.push(createPlane(m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]));
    planes.push(createPlane(m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]));
    planes.push(createPlane(m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]));

    return planes;
  }

  screenToWorldRay(screenX: number, screenY: number, screenWidth: number, screenHeight: number): {
    origin: [number, number, number];
    direction: [number, number, number];
  } {
    const ndcX = (2 * screenX) / screenWidth - 1;
    const ndcY = 1 - (2 * screenY) / screenHeight;

    return {
      origin: [ndcX, ndcY, -1],
      direction: [ndcX, ndcY, 1]
    };
  }

  setViewport(x: number, y: number, width: number, height: number): this {
    this.viewport = { x, y, width, height };
    return this;
  }

  setClearColor(r: number, g: number, b: number, a: number): this {
    this.clearColor = [r, g, b, a];
    return this;
  }

  setNearFar(near: number, far: number): this {
    this.near = near;
    this.far = far;
    return this;
  }

  serialize(): object {
    return {
      active: this.active,
      fov: this.fov,
      near: this.near,
      far: this.far,
      aspect: this.aspect,
      priority: this.priority,
      targetTexture: this.targetTexture,
      clearFlags: this.clearFlags,
      clearColor: this.clearColor,
      projectionMode: this.projectionMode,
      orthographicSize: this.orthographicSize,
      viewport: this.viewport
    };
  }

  deserialize(data: any): void {
    this.active = data.active ?? true;
    this.fov = data.fov ?? Math.PI / 4;
    this.near = data.near ?? 0.1;
    this.far = data.far ?? 1000;
    this.aspect = data.aspect ?? 16 / 9;
    this.priority = data.priority ?? 0;
    this.targetTexture = data.targetTexture ?? null;
    this.clearFlags = data.clearFlags ?? 'solid';
    this.clearColor = data.clearColor ?? [0, 0, 0, 1];
    this.projectionMode = data.projectionMode ?? 'perspective';
    this.orthographicSize = data.orthographicSize ?? 10;
    this.viewport = data.viewport ?? { x: 0, y: 0, width: 1, height: 1 };
  }

  reset(): void {
    this.active = true;
    this.fov = Math.PI / 4;
    this.near = 0.1;
    this.far = 1000;
    this.aspect = 16 / 9;
    this.priority = 0;
    this.targetTexture = null;
    this.clearFlags = 'solid';
    this.clearColor = [0, 0, 0, 1];
    this.projectionMode = 'perspective';
    this.orthographicSize = 10;
    this.viewport = { x: 0, y: 0, width: 1, height: 1 };
  }
}

describe('CameraComponent', () => {
  describe('initialization', () => {
    it('creates with default perspective settings', () => {
      const camera = new CameraComponent();

      expect(camera.active).toBe(true);
      expect(camera.fov).toBeCloseTo(Math.PI / 4);
      expect(camera.near).toBe(0.1);
      expect(camera.far).toBe(1000);
      expect(camera.aspect).toBeCloseTo(16 / 9);
      expect(camera.priority).toBe(0);
      expect(camera.projectionMode).toBe('perspective');
    });

    it('creates with custom FOV', () => {
      const camera = new CameraComponent({ fov: Math.PI / 3 });
      expect(camera.fov).toBeCloseTo(Math.PI / 3);
    });

    it('creates with custom near/far planes', () => {
      const camera = new CameraComponent({ near: 1, far: 500 });
      expect(camera.near).toBe(1);
      expect(camera.far).toBe(500);
    });

    it('creates with custom aspect ratio', () => {
      const camera = new CameraComponent({ aspect: 4 / 3 });
      expect(camera.aspect).toBeCloseTo(4 / 3);
    });

    it('creates as inactive', () => {
      const camera = new CameraComponent({ active: false });
      expect(camera.active).toBe(false);
    });

    it('creates with custom priority', () => {
      const camera = new CameraComponent({ priority: 10 });
      expect(camera.priority).toBe(10);
    });

    it('creates with render target', () => {
      const camera = new CameraComponent({ targetTexture: 'offscreen_buffer' });
      expect(camera.targetTexture).toBe('offscreen_buffer');
    });

    it('creates with custom clear flags', () => {
      const camera = new CameraComponent({ clearFlags: 'skybox' });
      expect(camera.clearFlags).toBe('skybox');
    });

    it('creates with custom clear color', () => {
      const camera = new CameraComponent({ clearColor: [1, 0, 0, 1] });
      expect(camera.clearColor).toEqual([1, 0, 0, 1]);
    });
  });

  describe('perspective projection setup', () => {
    let camera: CameraComponent;

    beforeEach(() => {
      camera = new CameraComponent();
    });

    it('setPerspective() configures perspective projection', () => {
      camera.setPerspective(Math.PI / 3, 16 / 9, 0.5, 2000);

      expect(camera.projectionMode).toBe('perspective');
      expect(camera.fov).toBeCloseTo(Math.PI / 3);
      expect(camera.aspect).toBeCloseTo(16 / 9);
      expect(camera.near).toBe(0.5);
      expect(camera.far).toBe(2000);
    });

    it('setPerspective() supports method chaining', () => {
      const result = camera.setPerspective(Math.PI / 4, 1, 0.1, 100);
      expect(result).toBe(camera);
    });

    it('supports wide FOV', () => {
      camera.setPerspective(Math.PI / 2, 16 / 9, 0.1, 1000);
      expect(camera.fov).toBeCloseTo(Math.PI / 2);
    });

    it('supports narrow FOV', () => {
      camera.setPerspective(Math.PI / 8, 16 / 9, 0.1, 1000);
      expect(camera.fov).toBeCloseTo(Math.PI / 8);
    });

    it('supports square aspect ratio', () => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 1000);
      expect(camera.aspect).toBe(1);
    });

    it('supports ultrawide aspect ratio', () => {
      camera.setPerspective(Math.PI / 4, 21 / 9, 0.1, 1000);
      expect(camera.aspect).toBeCloseTo(21 / 9);
    });
  });

  describe('orthographic projection setup', () => {
    let camera: CameraComponent;

    beforeEach(() => {
      camera = new CameraComponent();
    });

    it('setOrthographic() configures orthographic projection', () => {
      camera.setOrthographic(20, 16 / 9, 1, 500);

      expect(camera.projectionMode).toBe('orthographic');
      expect(camera.orthographicSize).toBe(20);
      expect(camera.aspect).toBeCloseTo(16 / 9);
      expect(camera.near).toBe(1);
      expect(camera.far).toBe(500);
    });

    it('setOrthographic() supports method chaining', () => {
      const result = camera.setOrthographic(10, 1, 0.1, 100);
      expect(result).toBe(camera);
    });

    it('supports small orthographic size', () => {
      camera.setOrthographic(1, 16 / 9, 0.1, 100);
      expect(camera.orthographicSize).toBe(1);
    });

    it('supports large orthographic size', () => {
      camera.setOrthographic(1000, 16 / 9, 0.1, 5000);
      expect(camera.orthographicSize).toBe(1000);
    });
  });

  describe('projection matrix computation', () => {
    it('getProjectionMatrix() generates perspective matrix', () => {
      const camera = new CameraComponent();
      camera.setPerspective(Math.PI / 4, 16 / 9, 0.1, 1000);

      const matrix = camera.getProjectionMatrix();

      expect(matrix).toBeInstanceOf(Float32Array);
      expect(matrix.length).toBe(16);
      expect(matrix[0]).toBeGreaterThan(0);
      expect(matrix[5]).toBeGreaterThan(0);
      expect(matrix[11]).toBe(-1);
    });

    it('getProjectionMatrix() generates orthographic matrix', () => {
      const camera = new CameraComponent();
      camera.setOrthographic(10, 16 / 9, 0.1, 100);

      const matrix = camera.getProjectionMatrix();

      expect(matrix).toBeInstanceOf(Float32Array);
      expect(matrix.length).toBe(16);
      expect(matrix[15]).toBe(1);
    });

    it('perspective matrix handles different FOVs correctly', () => {
      const camera1 = new CameraComponent({ fov: Math.PI / 4 });
      const camera2 = new CameraComponent({ fov: Math.PI / 2 });

      const matrix1 = camera1.getProjectionMatrix();
      const matrix2 = camera2.getProjectionMatrix();

      expect(matrix1[5]).toBeGreaterThan(matrix2[5]);
    });

    it('perspective matrix handles different aspects correctly', () => {
      const camera1 = new CameraComponent({ aspect: 16 / 9 });
      const camera2 = new CameraComponent({ aspect: 4 / 3 });

      const matrix1 = camera1.getProjectionMatrix();
      const matrix2 = camera2.getProjectionMatrix();

      expect(matrix1[0]).not.toBeCloseTo(matrix2[0]);
    });

    it('projection matrix updates when parameters change', () => {
      const camera = new CameraComponent();
      const matrix1 = camera.getProjectionMatrix();

      camera.setPerspective(Math.PI / 2, 1, 0.1, 1000);
      const matrix2 = camera.getProjectionMatrix();

      expect(matrix1[0]).not.toBeCloseTo(matrix2[0]);
    });
  });

  describe('view matrix computation', () => {
    let camera: CameraComponent;

    beforeEach(() => {
      camera = new CameraComponent();
    });

    it('getViewMatrix() computes view matrix from transform', () => {
      const position: [number, number, number] = [0, 5, 10];
      const rotation: [number, number, number, number] = [0, 0, 0, 1];

      const matrix = camera.getViewMatrix(position, rotation);

      expect(matrix).toBeInstanceOf(Float32Array);
      expect(matrix.length).toBe(16);
    });

    it('view matrix accounts for camera position', () => {
      const position1: [number, number, number] = [0, 0, 0];
      const position2: [number, number, number] = [10, 0, 0];
      const rotation: [number, number, number, number] = [0, 0, 0, 1];

      const matrix1 = camera.getViewMatrix(position1, rotation);
      const matrix2 = camera.getViewMatrix(position2, rotation);

      expect(matrix1[12]).not.toBeCloseTo(matrix2[12]);
    });

    it('view matrix accounts for camera rotation', () => {
      const position: [number, number, number] = [0, 0, 0];
      const rotation1: [number, number, number, number] = [0, 0, 0, 1];
      const rotation2: [number, number, number, number] = [0, 0.707, 0, 0.707];

      const matrix1 = camera.getViewMatrix(position, rotation1);
      const matrix2 = camera.getViewMatrix(position, rotation2);

      expect(matrix1[0]).not.toBeCloseTo(matrix2[0]);
    });

    it('view matrix is correct for identity transform', () => {
      const position: [number, number, number] = [0, 0, 0];
      const rotation: [number, number, number, number] = [0, 0, 0, 1];

      const matrix = camera.getViewMatrix(position, rotation);

      expect(matrix[0]).toBeCloseTo(1);
      expect(matrix[5]).toBeCloseTo(1);
      expect(matrix[10]).toBeCloseTo(1);
      expect(matrix[15]).toBeCloseTo(1);
    });
  });

  describe('frustum extraction', () => {
    let camera: CameraComponent;

    beforeEach(() => {
      camera = new CameraComponent();
    });

    it('getFrustumPlanes() returns 6 planes', () => {
      const viewProjection = new Float32Array(16);
      viewProjection[0] = 1; viewProjection[5] = 1;
      viewProjection[10] = 1; viewProjection[15] = 1;

      const planes = camera.getFrustumPlanes(viewProjection);

      expect(planes.length).toBe(6);
    });

    it('frustum planes have normalized normals', () => {
      const viewProjection = camera.getProjectionMatrix();
      const planes = camera.getFrustumPlanes(viewProjection);

      for (const plane of planes) {
        const [nx, ny, nz] = plane.normal;
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
        expect(length).toBeCloseTo(1, 5);
      }
    });

    it('frustum planes have distance values', () => {
      const viewProjection = camera.getProjectionMatrix();
      const planes = camera.getFrustumPlanes(viewProjection);

      for (const plane of planes) {
        expect(typeof plane.distance).toBe('number');
        expect(isFinite(plane.distance)).toBe(true);
      }
    });

    it('frustum changes with different projections', () => {
      camera.setPerspective(Math.PI / 4, 16 / 9, 0.1, 1000);
      const projection1 = camera.getProjectionMatrix();
      const planes1 = camera.getFrustumPlanes(projection1);

      camera.setPerspective(Math.PI / 2, 16 / 9, 0.1, 1000);
      const projection2 = camera.getProjectionMatrix();
      const planes2 = camera.getFrustumPlanes(projection2);

      expect(planes1[0].normal[0]).not.toBeCloseTo(planes2[0].normal[0]);
    });
  });

  describe('screen-to-world ray casting', () => {
    let camera: CameraComponent;

    beforeEach(() => {
      camera = new CameraComponent();
    });

    it('screenToWorldRay() generates ray from screen coordinates', () => {
      const ray = camera.screenToWorldRay(400, 300, 800, 600);

      expect(ray).toHaveProperty('origin');
      expect(ray).toHaveProperty('direction');
      expect(ray.origin.length).toBe(3);
      expect(ray.direction.length).toBe(3);
    });

    it('center screen coordinate maps to origin', () => {
      const ray = camera.screenToWorldRay(400, 300, 800, 600);

      expect(ray.origin[0]).toBeCloseTo(0);
      expect(ray.origin[1]).toBeCloseTo(0);
    });

    it('top-left corner has negative coordinates', () => {
      const ray = camera.screenToWorldRay(0, 0, 800, 600);

      expect(ray.origin[0]).toBeLessThan(0);
      expect(ray.origin[1]).toBeGreaterThan(0);
    });

    it('bottom-right corner has positive coordinates', () => {
      const ray = camera.screenToWorldRay(800, 600, 800, 600);

      expect(ray.origin[0]).toBeGreaterThan(0);
      expect(ray.origin[1]).toBeLessThan(0);
    });

    it('different screen sizes produce different rays', () => {
      const ray1 = camera.screenToWorldRay(100, 100, 800, 600);
      const ray2 = camera.screenToWorldRay(100, 100, 1920, 1080);

      expect(ray1.origin[0]).not.toBeCloseTo(ray2.origin[0]);
    });
  });

  describe('viewport configuration', () => {
    let camera: CameraComponent;

    beforeEach(() => {
      camera = new CameraComponent();
    });

    it('setViewport() updates viewport', () => {
      camera.setViewport(0.25, 0.25, 0.5, 0.5);

      expect(camera.viewport.x).toBe(0.25);
      expect(camera.viewport.y).toBe(0.25);
      expect(camera.viewport.width).toBe(0.5);
      expect(camera.viewport.height).toBe(0.5);
    });

    it('setViewport() supports method chaining', () => {
      const result = camera.setViewport(0, 0, 1, 1);
      expect(result).toBe(camera);
    });

    it('default viewport is fullscreen', () => {
      expect(camera.viewport.x).toBe(0);
      expect(camera.viewport.y).toBe(0);
      expect(camera.viewport.width).toBe(1);
      expect(camera.viewport.height).toBe(1);
    });

    it('supports split-screen viewports', () => {
      camera.setViewport(0, 0, 0.5, 1);

      expect(camera.viewport.width).toBe(0.5);
      expect(camera.viewport.height).toBe(1);
    });
  });

  describe('near/far plane management', () => {
    let camera: CameraComponent;

    beforeEach(() => {
      camera = new CameraComponent();
    });

    it('setNearFar() updates both planes', () => {
      camera.setNearFar(1, 500);

      expect(camera.near).toBe(1);
      expect(camera.far).toBe(500);
    });

    it('setNearFar() supports method chaining', () => {
      const result = camera.setNearFar(0.5, 2000);
      expect(result).toBe(camera);
    });

    it('supports very close near plane', () => {
      camera.setNearFar(0.01, 1000);
      expect(camera.near).toBe(0.01);
    });

    it('supports very far far plane', () => {
      camera.setNearFar(0.1, 100000);
      expect(camera.far).toBe(100000);
    });

    it('near/far affect projection matrix', () => {
      camera.setNearFar(0.1, 1000);
      const matrix1 = camera.getProjectionMatrix();

      camera.setNearFar(1, 500);
      const matrix2 = camera.getProjectionMatrix();

      expect(matrix1[10]).not.toBeCloseTo(matrix2[10]);
    });
  });

  describe('clear color management', () => {
    let camera: CameraComponent;

    beforeEach(() => {
      camera = new CameraComponent();
    });

    it('setClearColor() updates clear color', () => {
      camera.setClearColor(1, 0, 0, 1);

      expect(camera.clearColor).toEqual([1, 0, 0, 1]);
    });

    it('setClearColor() supports method chaining', () => {
      const result = camera.setClearColor(0, 1, 0, 1);
      expect(result).toBe(camera);
    });

    it('supports RGB values', () => {
      camera.setClearColor(0.5, 0.75, 0.25, 1);

      expect(camera.clearColor[0]).toBe(0.5);
      expect(camera.clearColor[1]).toBe(0.75);
      expect(camera.clearColor[2]).toBe(0.25);
    });

    it('supports alpha channel', () => {
      camera.setClearColor(1, 1, 1, 0.5);
      expect(camera.clearColor[3]).toBe(0.5);
    });

    it('default clear color is black', () => {
      expect(camera.clearColor).toEqual([0, 0, 0, 1]);
    });
  });

  describe('serialization', () => {
    it('serialize() produces correct structure', () => {
      const camera = new CameraComponent({
        active: false,
        fov: Math.PI / 3,
        near: 1,
        far: 500,
        aspect: 4 / 3,
        priority: 5,
        targetTexture: 'render_target',
        clearFlags: 'skybox',
        clearColor: [0.5, 0.5, 1, 1]
      });

      const data = camera.serialize();

      expect(data).toHaveProperty('active', false);
      expect(data).toHaveProperty('fov', Math.PI / 3);
      expect(data).toHaveProperty('near', 1);
      expect(data).toHaveProperty('far', 500);
      expect(data).toHaveProperty('aspect', 4 / 3);
      expect(data).toHaveProperty('priority', 5);
      expect(data).toHaveProperty('targetTexture', 'render_target');
      expect(data).toHaveProperty('clearFlags', 'skybox');
      expect(data).toHaveProperty('clearColor');
    });

    it('deserialize() restores camera state', () => {
      const data = {
        active: true,
        fov: Math.PI / 2,
        near: 0.5,
        far: 2000,
        aspect: 21 / 9,
        priority: 10,
        targetTexture: null,
        clearFlags: 'depth' as const,
        clearColor: [1, 1, 1, 1],
        projectionMode: 'orthographic' as const,
        orthographicSize: 15,
        viewport: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
      };

      const camera = new CameraComponent();
      camera.deserialize(data);

      expect(camera.active).toBe(true);
      expect(camera.fov).toBeCloseTo(Math.PI / 2);
      expect(camera.near).toBe(0.5);
      expect(camera.far).toBe(2000);
      expect(camera.aspect).toBeCloseTo(21 / 9);
      expect(camera.priority).toBe(10);
      expect(camera.clearFlags).toBe('depth');
      expect(camera.projectionMode).toBe('orthographic');
      expect(camera.orthographicSize).toBe(15);
    });

    it('serialize/deserialize round-trip preserves data', () => {
      const camera1 = new CameraComponent({
        fov: Math.PI / 6,
        near: 2,
        far: 750,
        aspect: 16 / 10,
        priority: 3,
        clearColor: [0.1, 0.2, 0.3, 1]
      });

      const data = camera1.serialize();
      const camera2 = new CameraComponent();
      camera2.deserialize(data);

      expect(JSON.stringify(camera1.serialize())).toBe(JSON.stringify(camera2.serialize()));
    });
  });

  describe('reset functionality', () => {
    it('reset() returns camera to default state', () => {
      const camera = new CameraComponent({
        active: false,
        fov: Math.PI / 2,
        near: 5,
        far: 100,
        aspect: 4 / 3,
        priority: 10,
        clearFlags: 'depth',
        clearColor: [1, 0, 0, 1]
      });

      camera.reset();

      expect(camera.active).toBe(true);
      expect(camera.fov).toBeCloseTo(Math.PI / 4);
      expect(camera.near).toBe(0.1);
      expect(camera.far).toBe(1000);
      expect(camera.aspect).toBeCloseTo(16 / 9);
      expect(camera.priority).toBe(0);
      expect(camera.clearFlags).toBe('solid');
      expect(camera.clearColor).toEqual([0, 0, 0, 1]);
    });
  });

  describe('multi-camera priority', () => {
    it('supports camera priority ordering', () => {
      const camera1 = new CameraComponent({ priority: 0 });
      const camera2 = new CameraComponent({ priority: 10 });
      const camera3 = new CameraComponent({ priority: -5 });

      expect(camera1.priority).toBe(0);
      expect(camera2.priority).toBe(10);
      expect(camera3.priority).toBe(-5);
    });

    it('cameras can be sorted by priority', () => {
      const cameras = [
        new CameraComponent({ priority: 5 }),
        new CameraComponent({ priority: 1 }),
        new CameraComponent({ priority: 10 })
      ];

      cameras.sort((a, b) => a.priority - b.priority);

      expect(cameras[0].priority).toBe(1);
      expect(cameras[1].priority).toBe(5);
      expect(cameras[2].priority).toBe(10);
    });
  });

  describe('render target configuration', () => {
    it('supports render to screen (null target)', () => {
      const camera = new CameraComponent({ targetTexture: null });
      expect(camera.targetTexture).toBeNull();
    });

    it('supports render to texture', () => {
      const camera = new CameraComponent({ targetTexture: 'offscreen' });
      expect(camera.targetTexture).toBe('offscreen');
    });

    it('can switch render targets', () => {
      const camera = new CameraComponent();
      expect(camera.targetTexture).toBeNull();

      camera.targetTexture = 'target1';
      expect(camera.targetTexture).toBe('target1');

      camera.targetTexture = null;
      expect(camera.targetTexture).toBeNull();
    });
  });

  describe('method chaining', () => {
    it('supports full method chain configuration', () => {
      const camera = new CameraComponent();

      const result = camera
        .setPerspective(Math.PI / 3, 16 / 9, 0.5, 2000)
        .setViewport(0, 0, 1, 1)
        .setClearColor(0.5, 0.5, 0.5, 1)
        .setNearFar(1, 1000);

      expect(result).toBe(camera);
      expect(camera.fov).toBeCloseTo(Math.PI / 3);
      expect(camera.near).toBe(1);
      expect(camera.far).toBe(1000);
      expect(camera.clearColor[0]).toBe(0.5);
    });
  });
});
