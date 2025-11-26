/**
 * Comprehensive unit tests for the Mesh class.
 * Tests vertex/index buffers, vertex format, submesh management, bounding box computation, and dynamic updates.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Mesh } from '../../../rendering/geometry/Mesh';
import { VertexBuffer, BufferUsage } from '../../../rendering/geometry/VertexBuffer';
import { IndexBuffer, PrimitiveTopology } from '../../../rendering/geometry/IndexBuffer';
import { VertexFormat } from '../../../rendering/geometry/VertexFormat';
import { Vector3 } from '../../../math/Vector3';
import { Matrix4 } from '../../../math/Matrix4';
import { approximatelyEqual } from '../../utils/TestHelpers';

describe('Mesh', () => {
  let format: VertexFormat;
  let vertexBuffer: VertexBuffer;
  let indexBuffer: IndexBuffer;
  let mesh: Mesh;

  beforeEach(() => {
    format = VertexFormat.P3N3T2();
    vertexBuffer = new VertexBuffer(format, 4);
    indexBuffer = new IndexBuffer(6);

    mesh = new Mesh(vertexBuffer, indexBuffer, 'TestMesh');
  });

  describe('vertex buffer creation', () => {
    it('creates mesh with vertex buffer', () => {
      expect(mesh.vertexBuffer).toBe(vertexBuffer);
      expect(mesh.vertexCount).toBe(4);
    });

    it('exposes vertex format', () => {
      expect(mesh.format).toBe(format);
    });

    it('creates mesh from raw data', () => {
      const vertexData = new Float32Array([
        // pos          normal       uv
        -1, -1, 0,     0, 0, 1,     0, 0,
         1, -1, 0,     0, 0, 1,     1, 0,
         1,  1, 0,     0, 0, 1,     1, 1,
        -1,  1, 0,     0, 0, 1,     0, 1,
      ]);
      const indices = [0, 1, 2, 0, 2, 3];

      const dataM = Mesh.fromData(format, vertexData, indices);

      expect(dataM.vertexCount).toBe(4);
      expect(dataM.indexCount).toBe(6);
      expect(dataM.triangleCount).toBe(2);
    });

    it('supports different buffer usages', () => {
      const dynamicVB = new VertexBuffer(format, 4, BufferUsage.Dynamic);
      const dynamicMesh = new Mesh(dynamicVB, indexBuffer);

      expect(dynamicMesh.vertexBuffer.usage).toBe(BufferUsage.Dynamic);
    });
  });

  describe('index buffer creation', () => {
    it('creates mesh with index buffer', () => {
      expect(mesh.indexBuffer).toBe(indexBuffer);
      expect(mesh.indexCount).toBe(6);
    });

    it('calculates triangle count from indices', () => {
      expect(mesh.triangleCount).toBe(2);
    });

    it('supports different index types', () => {
      const smallIndices = IndexBuffer.fromArray([0, 1, 2]);
      const smallMesh = new Mesh(vertexBuffer, smallIndices);

      expect(smallMesh.triangleCount).toBe(1);
    });

    it('supports different primitive topologies', () => {
      const lineIndices = new IndexBuffer(6, undefined, undefined, PrimitiveTopology.LineList);
      const lineMesh = new Mesh(vertexBuffer, lineIndices);

      expect(lineMesh.indexBuffer.topology).toBe(PrimitiveTopology.LineList);
    });
  });

  describe('vertex format definition', () => {
    it('supports position-only format', () => {
      const p3Format = VertexFormat.P3();
      const p3VB = new VertexBuffer(p3Format, 3);
      const p3Mesh = new Mesh(p3VB, indexBuffer);

      expect(p3Mesh.format.attributes.length).toBe(1);
    });

    it('supports position-normal format', () => {
      const p3n3Format = VertexFormat.P3N3();
      const p3n3VB = new VertexBuffer(p3n3Format, 3);
      const p3n3Mesh = new Mesh(p3n3VB, indexBuffer);

      expect(p3n3Mesh.format.attributes.length).toBe(2);
    });

    it('supports full PBR vertex format', () => {
      const fullFormat = VertexFormat.P3N3T4T2();
      const fullVB = new VertexBuffer(fullFormat, 3);
      const fullMesh = new Mesh(fullVB, indexBuffer);

      expect(fullMesh.format.attributes.length).toBeGreaterThan(2);
    });

    it('calculates correct stride', () => {
      const stride = mesh.format.stride;
      expect(stride).toBeGreaterThan(0);
    });
  });

  describe('submesh management', () => {
    it('creates default submesh', () => {
      expect(mesh.submeshes.length).toBe(1);
      expect(mesh.submeshes[0].startIndex).toBe(0);
      expect(mesh.submeshes[0].indexCount).toBe(6);
    });

    it('adds new submesh', () => {
      mesh.addSubmesh({
        startIndex: 0,
        indexCount: 3,
        materialIndex: 1,
        name: 'Submesh1',
      });

      expect(mesh.submeshes.length).toBe(2);
      expect(mesh.submeshes[1].name).toBe('Submesh1');
    });

    it('clears all submeshes', () => {
      mesh.addSubmesh({
        startIndex: 0,
        indexCount: 3,
        materialIndex: 1,
      });

      mesh.clearSubmeshes();

      expect(mesh.submeshes.length).toBe(0);
    });

    it('supports material indices', () => {
      mesh.addSubmesh({
        startIndex: 0,
        indexCount: 3,
        materialIndex: 5,
      });

      expect(mesh.submeshes[1].materialIndex).toBe(5);
    });

    it('handles multiple submeshes for multi-material meshes', () => {
      mesh.clearSubmeshes();

      mesh.addSubmesh({
        startIndex: 0,
        indexCount: 3,
        materialIndex: 0,
        name: 'Material0',
      });

      mesh.addSubmesh({
        startIndex: 3,
        indexCount: 3,
        materialIndex: 1,
        name: 'Material1',
      });

      expect(mesh.submeshes.length).toBe(2);
      expect(mesh.submeshes[0].materialIndex).toBe(0);
      expect(mesh.submeshes[1].materialIndex).toBe(1);
    });
  });

  describe('bounding box computation', () => {
    beforeEach(() => {
      // Setup a simple quad
      vertexBuffer.setPosition(0, -1, -1, 0);
      vertexBuffer.setPosition(1,  1, -1, 0);
      vertexBuffer.setPosition(2,  1,  1, 0);
      vertexBuffer.setPosition(3, -1,  1, 0);
    });

    it('computes bounding box from vertices', () => {
      mesh.computeBounds();

      const box = mesh.boundingBox;
      expect(box.isEmpty).toBe(false);
      expect(approximatelyEqual(box.min.x, -1, 0.001)).toBe(true);
      expect(approximatelyEqual(box.max.x,  1, 0.001)).toBe(true);
    });

    it('computes bounding sphere', () => {
      mesh.computeBounds();

      const sphere = mesh.boundingSphere;
      expect(sphere.radius).toBeGreaterThan(0);
      expect(sphere.center).toBeDefined();
    });

    it('computes tight bounding sphere using Ritter algorithm', () => {
      mesh.computeBoundingSphere();

      const sphere = mesh.boundingSphere;
      expect(sphere.radius).toBeGreaterThan(0);
    });

    it('updates bounds when vertices change', () => {
      mesh.computeBounds();
      const box1 = mesh.boundingBox.clone();

      vertexBuffer.setPosition(0, -2, -2, 0);
      mesh.computeBounds();
      const box2 = mesh.boundingBox;

      expect(box1.equals(box2)).toBe(false);
    });

    it('handles empty mesh', () => {
      const emptyVB = new VertexBuffer(format, 0);
      const emptyIB = new IndexBuffer(0);
      const emptyMesh = new Mesh(emptyVB, emptyIB);

      emptyMesh.computeBounds();

      expect(emptyMesh.boundingBox.isEmpty).toBe(true);
    });
  });

  describe('vertex attribute access', () => {
    it('reads position data', () => {
      vertexBuffer.setPosition(0, 1, 2, 3);

      const pos = [0, 0, 0];
      vertexBuffer.getPosition(0, pos);

      expect(pos[0]).toBe(1);
      expect(pos[1]).toBe(2);
      expect(pos[2]).toBe(3);
    });

    it('reads normal data', () => {
      vertexBuffer.setNormal(0, 0, 1, 0);

      const normal = [0, 0, 0];
      vertexBuffer.getNormal(0, normal);

      expect(normal[0]).toBe(0);
      expect(normal[1]).toBe(1);
      expect(normal[2]).toBe(0);
    });

    it('reads UV data', () => {
      vertexBuffer.setTexCoord(0, 0.5, 0.75);

      const uv = [0, 0];
      vertexBuffer.getTexCoord(0, uv);

      expect(uv[0]).toBe(0.5);
      expect(uv[1]).toBe(0.75);
    });

    it('handles invalid vertex indices', () => {
      const pos = [0, 0, 0];
      const result = vertexBuffer.getPosition(100, pos);

      expect(result).toBe(false);
    });
  });

  describe('dynamic mesh updates', () => {
    it('updates vertex positions', () => {
      const dynamicVB = new VertexBuffer(format, 4, BufferUsage.Dynamic);
      const dynamicMesh = new Mesh(dynamicVB, indexBuffer);

      dynamicVB.setPosition(0, 5, 5, 5);

      const pos = [0, 0, 0];
      dynamicVB.getPosition(0, pos);

      expect(pos[0]).toBe(5);
    });

    it('updates indices', () => {
      const dynamicIB = new IndexBuffer(6, undefined, BufferUsage.Dynamic);
      dynamicIB.setTriangle(0, 0, 1, 2);

      expect(dynamicIB.indexCount).toBe(6);
    });

    it('recalculates bounds after vertex updates', () => {
      vertexBuffer.setPosition(0, -1, -1, 0);
      mesh.computeBounds();
      const bounds1 = mesh.boundingBox.clone();

      vertexBuffer.setPosition(0, -10, -10, 0);
      mesh.computeBounds();
      const bounds2 = mesh.boundingBox;

      expect(bounds1.equals(bounds2)).toBe(false);
    });
  });

  describe('LOD (Level of Detail)', () => {
    it('adds LOD level', () => {
      const lodIndices = new IndexBuffer(3);
      mesh.addLODLevel({
        distance: 50,
        indexBuffer: lodIndices,
      });

      expect(mesh.lodLevels.length).toBe(1);
    });

    it('sorts LOD levels by distance', () => {
      const lod1 = new IndexBuffer(6);
      const lod2 = new IndexBuffer(3);

      mesh.addLODLevel({ distance: 100, indexBuffer: lod2 });
      mesh.addLODLevel({ distance: 50, indexBuffer: lod1 });

      expect(mesh.lodLevels[0].distance).toBe(50);
      expect(mesh.lodLevels[1].distance).toBe(100);
    });

    it('gets appropriate LOD for distance', () => {
      const lod0 = new IndexBuffer(12);
      const lod1 = new IndexBuffer(6);
      const lod2 = new IndexBuffer(3);

      mesh.addLODLevel({ distance: 0, indexBuffer: lod0 });
      mesh.addLODLevel({ distance: 50, indexBuffer: lod1 });
      mesh.addLODLevel({ distance: 100, indexBuffer: lod2 });

      const levelAt75 = mesh.getLODLevel(75);
      expect(levelAt75?.distance).toBe(50);

      const levelAt120 = mesh.getLODLevel(120);
      expect(levelAt120?.distance).toBe(100);
    });

    it('returns undefined for distance below all LODs', () => {
      mesh.addLODLevel({ distance: 50, indexBuffer: new IndexBuffer(3) });

      const level = mesh.getLODLevel(10);
      expect(level).toBeUndefined();
    });
  });

  describe('morph targets (blend shapes)', () => {
    it('adds morph target', () => {
      const morphPositions = new VertexBuffer(VertexFormat.P3(), 4);

      mesh.addMorphTarget({
        name: 'Smile',
        positions: morphPositions,
        weight: 0.0,
      });

      expect(mesh.morphTargets.length).toBe(1);
    });

    it('sets morph target weight by name', () => {
      const morphPositions = new VertexBuffer(VertexFormat.P3(), 4);

      mesh.addMorphTarget({
        name: 'Smile',
        positions: morphPositions,
        weight: 0.0,
      });

      mesh.setMorphTargetWeight('Smile', 0.5);

      expect(mesh.morphTargets[0].weight).toBe(0.5);
    });

    it('clamps morph target weight to valid range', () => {
      const morphPositions = new VertexBuffer(VertexFormat.P3(), 4);

      mesh.addMorphTarget({
        name: 'Smile',
        positions: morphPositions,
        weight: 0.0,
      });

      mesh.setMorphTargetWeight('Smile', 1.5);
      expect(mesh.morphTargets[0].weight).toBeLessThanOrEqual(1);

      mesh.setMorphTargetWeight('Smile', -0.5);
      expect(mesh.morphTargets[0].weight).toBeGreaterThanOrEqual(0);
    });

    it('gets morph target weight by name', () => {
      const morphPositions = new VertexBuffer(VertexFormat.P3(), 4);

      mesh.addMorphTarget({
        name: 'Smile',
        positions: morphPositions,
        weight: 0.7,
      });

      const weight = mesh.getMorphTargetWeight('Smile');
      expect(weight).toBe(0.7);
    });

    it('returns undefined for non-existent morph target', () => {
      const weight = mesh.getMorphTargetWeight('NonExistent');
      expect(weight).toBeUndefined();
    });

    it('supports multiple morph targets', () => {
      mesh.addMorphTarget({
        name: 'Smile',
        positions: new VertexBuffer(VertexFormat.P3(), 4),
        weight: 0.0,
      });

      mesh.addMorphTarget({
        name: 'Frown',
        positions: new VertexBuffer(VertexFormat.P3(), 4),
        weight: 0.0,
      });

      expect(mesh.morphTargets.length).toBe(2);
    });
  });

  describe('transformation', () => {
    beforeEach(() => {
      vertexBuffer.setPosition(0, 1, 0, 0);
      vertexBuffer.setPosition(1, 0, 1, 0);
      vertexBuffer.setPosition(2, 0, 0, 1);
      vertexBuffer.setPosition(3, 1, 1, 1);
      vertexBuffer.setNormal(0, 1, 0, 0);
      vertexBuffer.setNormal(1, 0, 1, 0);
      vertexBuffer.setNormal(2, 0, 0, 1);
      vertexBuffer.setNormal(3, 0.577, 0.577, 0.577);
    });

    it('transforms vertex positions', () => {
      const transform = Matrix4.translation(5, 0, 0);
      mesh.transform(transform);

      const pos = [0, 0, 0];
      vertexBuffer.getPosition(0, pos);

      expect(approximatelyEqual(pos[0], 6, 0.001)).toBe(true);
    });

    it('transforms normals correctly', () => {
      const transform = Matrix4.scaling(2, 2, 2);
      mesh.transform(transform);

      const normal = [0, 0, 0];
      vertexBuffer.getNormal(0, normal);

      // Normal should remain normalized
      const length = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
      expect(approximatelyEqual(length, 1, 0.001)).toBe(true);
    });

    it('updates bounding box after transformation', () => {
      mesh.computeBounds();
      const bounds1 = mesh.boundingBox.clone();

      const transform = Matrix4.translation(10, 0, 0);
      mesh.transform(transform);

      const bounds2 = mesh.boundingBox;
      expect(bounds1.equals(bounds2)).toBe(false);
    });

    it('handles rotation transforms', () => {
      const transform = Matrix4.rotationY(Math.PI / 2);
      mesh.transform(transform);

      const pos = [0, 0, 0];
      vertexBuffer.getPosition(0, pos);

      // X should become Z approximately
      expect(approximatelyEqual(pos[2], -1, 0.1)).toBe(true);
    });
  });

  describe('cloning', () => {
    beforeEach(() => {
      vertexBuffer.setPosition(0, 1, 2, 3);
      indexBuffer.setTriangle(0, 0, 1, 2);
    });

    it('creates independent copy', () => {
      const cloned = mesh.clone();

      expect(cloned.vertexCount).toBe(mesh.vertexCount);
      expect(cloned.indexCount).toBe(mesh.indexCount);
      expect(cloned).not.toBe(mesh);
    });

    it('copies vertex data', () => {
      const cloned = mesh.clone();

      const pos1 = [0, 0, 0];
      const pos2 = [0, 0, 0];

      mesh.vertexBuffer.getPosition(0, pos1);
      cloned.vertexBuffer.getPosition(0, pos2);

      expect(pos1).toEqual(pos2);
    });

    it('creates independent vertex buffer', () => {
      const cloned = mesh.clone();

      cloned.vertexBuffer.setPosition(0, 9, 9, 9);

      const pos1 = [0, 0, 0];
      const pos2 = [0, 0, 0];

      mesh.vertexBuffer.getPosition(0, pos1);
      cloned.vertexBuffer.getPosition(0, pos2);

      expect(pos1).not.toEqual(pos2);
    });

    it('copies bounding box', () => {
      mesh.computeBounds();
      const cloned = mesh.clone();

      expect(cloned.boundingBox.equals(mesh.boundingBox)).toBe(true);
    });

    it('copies submeshes', () => {
      mesh.addSubmesh({
        startIndex: 0,
        indexCount: 3,
        materialIndex: 1,
      });

      const cloned = mesh.clone();

      expect(cloned.submeshes.length).toBe(mesh.submeshes.length);
    });
  });

  describe('disposal', () => {
    it('disposes of mesh resources', () => {
      expect(() => {
        mesh.dispose();
      }).not.toThrow();
    });

    it('can be disposed multiple times safely', () => {
      mesh.dispose();
      expect(() => {
        mesh.dispose();
      }).not.toThrow();
    });
  });

  describe('memory statistics', () => {
    it('calculates vertex memory usage', () => {
      const stats = mesh.getMemoryStats();

      expect(stats.vertexMemory).toBeGreaterThan(0);
      expect(stats.indexMemory).toBeGreaterThan(0);
      expect(stats.total).toBe(stats.vertexMemory + stats.indexMemory);
    });

    it('includes LOD memory in statistics', () => {
      const lodIndices = new IndexBuffer(100);
      mesh.addLODLevel({
        distance: 50,
        indexBuffer: lodIndices,
      });

      const stats = mesh.getMemoryStats();

      expect(stats.indexMemory).toBeGreaterThan(indexBuffer.byteSize);
    });

    it('includes morph target memory in statistics', () => {
      const morphPositions = new VertexBuffer(VertexFormat.P3(), 100);

      mesh.addMorphTarget({
        name: 'Morph1',
        positions: morphPositions,
        weight: 0,
      });

      const stats = mesh.getMemoryStats();

      expect(stats.vertexMemory).toBeGreaterThan(vertexBuffer.byteSize);
    });
  });

  describe('skinning support', () => {
    it('marks mesh as skinned', () => {
      mesh.skinned = true;

      expect(mesh.skinned).toBe(true);
    });

    it('defaults to non-skinned', () => {
      expect(mesh.skinned).toBe(false);
    });
  });

  describe('naming', () => {
    it('has default name', () => {
      const unnamedMesh = new Mesh(vertexBuffer, indexBuffer);

      expect(unnamedMesh.name).toContain('Mesh');
    });

    it('accepts custom name', () => {
      expect(mesh.name).toBe('TestMesh');
    });
  });
});
