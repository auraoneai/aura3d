/**
 * @fileoverview Unit tests for MeshComponent.
 * Tests mesh attachment, material assignment, LOD management, and visibility flags.
 */

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * MeshComponent interface based on RenderSystem specification.
 */
class MeshComponent {
  meshId: string;
  materialId: string;
  visible: boolean;
  castShadows: boolean;
  receiveShadows: boolean;
  layerMask: number;
  lodLevel: number;
  boundingBox: { min: [number, number, number]; max: [number, number, number] } | null;

  constructor(options?: Partial<MeshComponent>) {
    this.meshId = options?.meshId ?? '';
    this.materialId = options?.materialId ?? '';
    this.visible = options?.visible ?? true;
    this.castShadows = options?.castShadows ?? true;
    this.receiveShadows = options?.receiveShadows ?? true;
    this.layerMask = options?.layerMask ?? 1;
    this.lodLevel = options?.lodLevel ?? 0;
    this.boundingBox = options?.boundingBox ?? null;
  }

  setMesh(meshId: string): this {
    this.meshId = meshId;
    return this;
  }

  setMaterial(materialId: string): this {
    this.materialId = materialId;
    return this;
  }

  setVisible(visible: boolean): this {
    this.visible = visible;
    return this;
  }

  setShadowCasting(enabled: boolean): this {
    this.castShadows = enabled;
    return this;
  }

  setShadowReceiving(enabled: boolean): this {
    this.receiveShadows = enabled;
    return this;
  }

  setLayer(layerMask: number): this {
    this.layerMask = layerMask;
    return this;
  }

  setLODLevel(level: number): this {
    this.lodLevel = Math.max(0, level);
    return this;
  }

  computeBoundingBox(vertices: Array<[number, number, number]>): void {
    if (vertices.length === 0) {
      this.boundingBox = null;
      return;
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const [x, y, z] of vertices) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    this.boundingBox = {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ]
    };
  }

  getBoundingBoxCenter(): [number, number, number] | null {
    if (!this.boundingBox) return null;

    return [
      (this.boundingBox.min[0] + this.boundingBox.max[0]) / 2,
      (this.boundingBox.min[1] + this.boundingBox.max[1]) / 2,
      (this.boundingBox.min[2] + this.boundingBox.max[2]) / 2
    ];
  }

  getBoundingBoxSize(): [number, number, number] | null {
    if (!this.boundingBox) return null;

    return [
      this.boundingBox.max[0] - this.boundingBox.min[0],
      this.boundingBox.max[1] - this.boundingBox.min[1],
      this.boundingBox.max[2] - this.boundingBox.min[2]
    ];
  }

  isVisibleForLayer(cameraLayerMask: number): boolean {
    return (this.layerMask & cameraLayerMask) !== 0;
  }

  serialize(): object {
    return {
      meshId: this.meshId,
      materialId: this.materialId,
      visible: this.visible,
      castShadows: this.castShadows,
      receiveShadows: this.receiveShadows,
      layerMask: this.layerMask,
      lodLevel: this.lodLevel,
      boundingBox: this.boundingBox
    };
  }

  deserialize(data: any): void {
    this.meshId = data.meshId ?? '';
    this.materialId = data.materialId ?? '';
    this.visible = data.visible ?? true;
    this.castShadows = data.castShadows ?? true;
    this.receiveShadows = data.receiveShadows ?? true;
    this.layerMask = data.layerMask ?? 1;
    this.lodLevel = data.lodLevel ?? 0;
    this.boundingBox = data.boundingBox ?? null;
  }

  reset(): void {
    this.meshId = '';
    this.materialId = '';
    this.visible = true;
    this.castShadows = true;
    this.receiveShadows = true;
    this.layerMask = 1;
    this.lodLevel = 0;
    this.boundingBox = null;
  }
}

describe('MeshComponent', () => {
  describe('initialization', () => {
    it('creates with default values', () => {
      const mesh = new MeshComponent();

      expect(mesh.meshId).toBe('');
      expect(mesh.materialId).toBe('');
      expect(mesh.visible).toBe(true);
      expect(mesh.castShadows).toBe(true);
      expect(mesh.receiveShadows).toBe(true);
      expect(mesh.layerMask).toBe(1);
      expect(mesh.lodLevel).toBe(0);
      expect(mesh.boundingBox).toBeNull();
    });

    it('creates with custom mesh ID', () => {
      const mesh = new MeshComponent({ meshId: 'models/character.mesh' });
      expect(mesh.meshId).toBe('models/character.mesh');
    });

    it('creates with custom material ID', () => {
      const mesh = new MeshComponent({ materialId: 'materials/metal.mat' });
      expect(mesh.materialId).toBe('materials/metal.mat');
    });

    it('creates with visibility disabled', () => {
      const mesh = new MeshComponent({ visible: false });
      expect(mesh.visible).toBe(false);
    });

    it('creates with custom shadow settings', () => {
      const mesh = new MeshComponent({
        castShadows: false,
        receiveShadows: false
      });

      expect(mesh.castShadows).toBe(false);
      expect(mesh.receiveShadows).toBe(false);
    });

    it('creates with custom layer mask', () => {
      const mesh = new MeshComponent({ layerMask: 0b1010 });
      expect(mesh.layerMask).toBe(0b1010);
    });

    it('creates with custom LOD level', () => {
      const mesh = new MeshComponent({ lodLevel: 2 });
      expect(mesh.lodLevel).toBe(2);
    });
  });

  describe('mesh attachment', () => {
    let mesh: MeshComponent;

    beforeEach(() => {
      mesh = new MeshComponent();
    });

    it('setMesh() updates mesh ID', () => {
      mesh.setMesh('models/cube.mesh');
      expect(mesh.meshId).toBe('models/cube.mesh');
    });

    it('setMesh() supports method chaining', () => {
      const result = mesh.setMesh('models/sphere.mesh');
      expect(result).toBe(mesh);
    });

    it('can change mesh after initialization', () => {
      mesh.setMesh('mesh1.mesh');
      mesh.setMesh('mesh2.mesh');
      expect(mesh.meshId).toBe('mesh2.mesh');
    });

    it('accepts empty mesh ID', () => {
      mesh.setMesh('some_mesh.mesh');
      mesh.setMesh('');
      expect(mesh.meshId).toBe('');
    });

    it('handles path separators correctly', () => {
      mesh.setMesh('assets/models/characters/player.mesh');
      expect(mesh.meshId).toBe('assets/models/characters/player.mesh');
    });
  });

  describe('material assignment', () => {
    let mesh: MeshComponent;

    beforeEach(() => {
      mesh = new MeshComponent();
    });

    it('setMaterial() updates material ID', () => {
      mesh.setMaterial('materials/pbr_metal.mat');
      expect(mesh.materialId).toBe('materials/pbr_metal.mat');
    });

    it('setMaterial() supports method chaining', () => {
      const result = mesh.setMaterial('materials/wood.mat');
      expect(result).toBe(mesh);
    });

    it('can swap materials dynamically', () => {
      mesh.setMaterial('material1.mat');
      mesh.setMaterial('material2.mat');
      mesh.setMaterial('material3.mat');
      expect(mesh.materialId).toBe('material3.mat');
    });

    it('accepts empty material ID', () => {
      mesh.setMaterial('some_material.mat');
      mesh.setMaterial('');
      expect(mesh.materialId).toBe('');
    });
  });

  describe('visibility management', () => {
    let mesh: MeshComponent;

    beforeEach(() => {
      mesh = new MeshComponent();
    });

    it('setVisible() enables visibility', () => {
      mesh.visible = false;
      mesh.setVisible(true);
      expect(mesh.visible).toBe(true);
    });

    it('setVisible() disables visibility', () => {
      mesh.setVisible(false);
      expect(mesh.visible).toBe(false);
    });

    it('setVisible() supports method chaining', () => {
      const result = mesh.setVisible(false);
      expect(result).toBe(mesh);
    });

    it('toggles visibility correctly', () => {
      mesh.setVisible(false);
      expect(mesh.visible).toBe(false);

      mesh.setVisible(true);
      expect(mesh.visible).toBe(true);
    });
  });

  describe('shadow configuration', () => {
    let mesh: MeshComponent;

    beforeEach(() => {
      mesh = new MeshComponent();
    });

    it('setShadowCasting() enables shadow casting', () => {
      mesh.castShadows = false;
      mesh.setShadowCasting(true);
      expect(mesh.castShadows).toBe(true);
    });

    it('setShadowCasting() disables shadow casting', () => {
      mesh.setShadowCasting(false);
      expect(mesh.castShadows).toBe(false);
    });

    it('setShadowReceiving() enables shadow receiving', () => {
      mesh.receiveShadows = false;
      mesh.setShadowReceiving(true);
      expect(mesh.receiveShadows).toBe(true);
    });

    it('setShadowReceiving() disables shadow receiving', () => {
      mesh.setShadowReceiving(false);
      expect(mesh.receiveShadows).toBe(false);
    });

    it('shadow methods support chaining', () => {
      const result = mesh
        .setShadowCasting(false)
        .setShadowReceiving(false);

      expect(result).toBe(mesh);
      expect(mesh.castShadows).toBe(false);
      expect(mesh.receiveShadows).toBe(false);
    });

    it('can cast shadows without receiving them', () => {
      mesh.setShadowCasting(true);
      mesh.setShadowReceiving(false);

      expect(mesh.castShadows).toBe(true);
      expect(mesh.receiveShadows).toBe(false);
    });

    it('can receive shadows without casting them', () => {
      mesh.setShadowCasting(false);
      mesh.setShadowReceiving(true);

      expect(mesh.castShadows).toBe(false);
      expect(mesh.receiveShadows).toBe(true);
    });
  });

  describe('render layer assignment', () => {
    let mesh: MeshComponent;

    beforeEach(() => {
      mesh = new MeshComponent();
    });

    it('setLayer() updates layer mask', () => {
      mesh.setLayer(0b0010);
      expect(mesh.layerMask).toBe(0b0010);
    });

    it('setLayer() supports method chaining', () => {
      const result = mesh.setLayer(0b1111);
      expect(result).toBe(mesh);
    });

    it('isVisibleForLayer() returns true for matching layer', () => {
      mesh.setLayer(0b0001);
      expect(mesh.isVisibleForLayer(0b0001)).toBe(true);
    });

    it('isVisibleForLayer() returns false for non-matching layer', () => {
      mesh.setLayer(0b0001);
      expect(mesh.isVisibleForLayer(0b0010)).toBe(false);
    });

    it('isVisibleForLayer() works with multiple layers', () => {
      mesh.setLayer(0b1010);
      expect(mesh.isVisibleForLayer(0b1000)).toBe(true);
      expect(mesh.isVisibleForLayer(0b0010)).toBe(true);
      expect(mesh.isVisibleForLayer(0b0100)).toBe(false);
    });

    it('supports combined layer masks', () => {
      mesh.setLayer(0b1111);
      expect(mesh.isVisibleForLayer(0b0001)).toBe(true);
      expect(mesh.isVisibleForLayer(0b1000)).toBe(true);
    });

    it('handles layer 0 correctly', () => {
      mesh.setLayer(0);
      expect(mesh.isVisibleForLayer(0b1111)).toBe(false);
    });
  });

  describe('LOD level management', () => {
    let mesh: MeshComponent;

    beforeEach(() => {
      mesh = new MeshComponent();
    });

    it('setLODLevel() updates LOD level', () => {
      mesh.setLODLevel(2);
      expect(mesh.lodLevel).toBe(2);
    });

    it('setLODLevel() supports method chaining', () => {
      const result = mesh.setLODLevel(1);
      expect(result).toBe(mesh);
    });

    it('setLODLevel() clamps negative values to 0', () => {
      mesh.setLODLevel(-5);
      expect(mesh.lodLevel).toBe(0);
    });

    it('supports multiple LOD levels', () => {
      mesh.setLODLevel(0);
      expect(mesh.lodLevel).toBe(0);

      mesh.setLODLevel(1);
      expect(mesh.lodLevel).toBe(1);

      mesh.setLODLevel(2);
      expect(mesh.lodLevel).toBe(2);
    });

    it('handles high LOD levels', () => {
      mesh.setLODLevel(10);
      expect(mesh.lodLevel).toBe(10);
    });
  });

  describe('bounding box computation', () => {
    let mesh: MeshComponent;

    beforeEach(() => {
      mesh = new MeshComponent();
    });

    it('computeBoundingBox() calculates correct bounds', () => {
      const vertices: Array<[number, number, number]> = [
        [0, 0, 0],
        [1, 1, 1],
        [-1, -1, -1],
        [2, 0.5, -0.5]
      ];

      mesh.computeBoundingBox(vertices);

      expect(mesh.boundingBox).not.toBeNull();
      expect(mesh.boundingBox!.min).toEqual([-1, -1, -1]);
      expect(mesh.boundingBox!.max).toEqual([2, 1, 1]);
    });

    it('computeBoundingBox() handles single vertex', () => {
      const vertices: Array<[number, number, number]> = [[5, 10, 15]];

      mesh.computeBoundingBox(vertices);

      expect(mesh.boundingBox!.min).toEqual([5, 10, 15]);
      expect(mesh.boundingBox!.max).toEqual([5, 10, 15]);
    });

    it('computeBoundingBox() handles empty vertex array', () => {
      mesh.computeBoundingBox([]);
      expect(mesh.boundingBox).toBeNull();
    });

    it('computeBoundingBox() updates existing bounds', () => {
      mesh.computeBoundingBox([[0, 0, 0], [1, 1, 1]]);
      mesh.computeBoundingBox([[0, 0, 0], [2, 2, 2]]);

      expect(mesh.boundingBox!.max).toEqual([2, 2, 2]);
    });

    it('getBoundingBoxCenter() returns correct center', () => {
      mesh.computeBoundingBox([[0, 0, 0], [2, 4, 6]]);

      const center = mesh.getBoundingBoxCenter();
      expect(center).toEqual([1, 2, 3]);
    });

    it('getBoundingBoxCenter() returns null when no bounds', () => {
      const center = mesh.getBoundingBoxCenter();
      expect(center).toBeNull();
    });

    it('getBoundingBoxSize() returns correct size', () => {
      mesh.computeBoundingBox([[-1, -2, -3], [1, 2, 3]]);

      const size = mesh.getBoundingBoxSize();
      expect(size).toEqual([2, 4, 6]);
    });

    it('getBoundingBoxSize() returns null when no bounds', () => {
      const size = mesh.getBoundingBoxSize();
      expect(size).toBeNull();
    });

    it('handles negative coordinates', () => {
      mesh.computeBoundingBox([[-5, -5, -5], [-1, -1, -1]]);

      expect(mesh.boundingBox!.min).toEqual([-5, -5, -5]);
      expect(mesh.boundingBox!.max).toEqual([-1, -1, -1]);
    });
  });

  describe('serialization', () => {
    it('serialize() produces correct structure', () => {
      const mesh = new MeshComponent({
        meshId: 'cube.mesh',
        materialId: 'metal.mat',
        visible: false,
        castShadows: false,
        receiveShadows: true,
        layerMask: 0b1010,
        lodLevel: 2
      });

      const data = mesh.serialize();

      expect(data).toHaveProperty('meshId', 'cube.mesh');
      expect(data).toHaveProperty('materialId', 'metal.mat');
      expect(data).toHaveProperty('visible', false);
      expect(data).toHaveProperty('castShadows', false);
      expect(data).toHaveProperty('receiveShadows', true);
      expect(data).toHaveProperty('layerMask', 0b1010);
      expect(data).toHaveProperty('lodLevel', 2);
    });

    it('deserialize() restores mesh state', () => {
      const data = {
        meshId: 'sphere.mesh',
        materialId: 'glass.mat',
        visible: true,
        castShadows: true,
        receiveShadows: false,
        layerMask: 0b0101,
        lodLevel: 1,
        boundingBox: { min: [0, 0, 0], max: [1, 1, 1] }
      };

      const mesh = new MeshComponent();
      mesh.deserialize(data);

      expect(mesh.meshId).toBe('sphere.mesh');
      expect(mesh.materialId).toBe('glass.mat');
      expect(mesh.visible).toBe(true);
      expect(mesh.castShadows).toBe(true);
      expect(mesh.receiveShadows).toBe(false);
      expect(mesh.layerMask).toBe(0b0101);
      expect(mesh.lodLevel).toBe(1);
      expect(mesh.boundingBox).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
    });

    it('serialize/deserialize round-trip preserves data', () => {
      const mesh1 = new MeshComponent({
        meshId: 'model.mesh',
        materialId: 'texture.mat',
        visible: false,
        castShadows: true,
        receiveShadows: true,
        layerMask: 0xFF,
        lodLevel: 3
      });

      mesh1.computeBoundingBox([[0, 0, 0], [5, 5, 5]]);

      const data = mesh1.serialize();
      const mesh2 = new MeshComponent();
      mesh2.deserialize(data);

      expect(JSON.stringify(mesh1.serialize())).toBe(JSON.stringify(mesh2.serialize()));
    });
  });

  describe('reset functionality', () => {
    it('reset() returns mesh to default state', () => {
      const mesh = new MeshComponent({
        meshId: 'model.mesh',
        materialId: 'mat.mat',
        visible: false,
        castShadows: false,
        receiveShadows: false,
        layerMask: 0xFF,
        lodLevel: 5
      });

      mesh.computeBoundingBox([[0, 0, 0], [1, 1, 1]]);
      mesh.reset();

      expect(mesh.meshId).toBe('');
      expect(mesh.materialId).toBe('');
      expect(mesh.visible).toBe(true);
      expect(mesh.castShadows).toBe(true);
      expect(mesh.receiveShadows).toBe(true);
      expect(mesh.layerMask).toBe(1);
      expect(mesh.lodLevel).toBe(0);
      expect(mesh.boundingBox).toBeNull();
    });
  });

  describe('method chaining', () => {
    it('supports full method chain configuration', () => {
      const mesh = new MeshComponent();

      const result = mesh
        .setMesh('model.mesh')
        .setMaterial('material.mat')
        .setVisible(true)
        .setShadowCasting(true)
        .setShadowReceiving(true)
        .setLayer(0b1111)
        .setLODLevel(2);

      expect(result).toBe(mesh);
      expect(mesh.meshId).toBe('model.mesh');
      expect(mesh.materialId).toBe('material.mat');
      expect(mesh.visible).toBe(true);
      expect(mesh.castShadows).toBe(true);
      expect(mesh.receiveShadows).toBe(true);
      expect(mesh.layerMask).toBe(0b1111);
      expect(mesh.lodLevel).toBe(2);
    });
  });
});
