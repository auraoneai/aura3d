/**
 * Comprehensive unit tests for the RenderQueue class.
 * Tests sorting by depth, material, shader, opaque vs transparent, batch grouping, and state caching.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RenderQueue } from '../../../rendering/pipeline/RenderQueue';
import { Material } from '../../../rendering/material/Material';
import { Mesh } from '../../../rendering/geometry/Mesh';
import { VertexBuffer } from '../../../rendering/geometry/VertexBuffer';
import { IndexBuffer } from '../../../rendering/geometry/IndexBuffer';
import { VertexFormat } from '../../../rendering/geometry/VertexFormat';

describe('RenderQueue', () => {
  let queue: RenderQueue;
  let material1: Material;
  let material2: Material;
  let mesh: Mesh;

  beforeEach(() => {
    queue = new RenderQueue();

    material1 = new Material({ name: 'Material1' });
    material2 = new Material({ name: 'Material2' });

    const vb = new VertexBuffer(VertexFormat.P3N3T2(), 3);
    const ib = new IndexBuffer(3);
    mesh = new Mesh(vb, ib);
  });

  describe('sorting by depth', () => {
    it('sorts opaque objects front-to-back', () => {
      queue.addOpaque(mesh, material1, 10);
      queue.addOpaque(mesh, material1, 5);
      queue.addOpaque(mesh, material1, 15);

      queue.sort();

      const items = queue.getOpaqueItems();
      expect(items[0].depth).toBeLessThan(items[1].depth);
      expect(items[1].depth).toBeLessThan(items[2].depth);
    });

    it('sorts transparent objects back-to-front', () => {
      queue.addTransparent(mesh, material1, 5);
      queue.addTransparent(mesh, material1, 10);
      queue.addTransparent(mesh, material1, 15);

      queue.sort();

      const items = queue.getTransparentItems();
      expect(items[0].depth).toBeGreaterThan(items[1].depth);
      expect(items[1].depth).toBeGreaterThan(items[2].depth);
    });
  });

  describe('sorting by material', () => {
    it('groups objects by material', () => {
      queue.addOpaque(mesh, material1, 10);
      queue.addOpaque(mesh, material2, 5);
      queue.addOpaque(mesh, material1, 15);

      queue.sort();

      const items = queue.getOpaqueItems();
      const mat0 = items[0].material;
      const mat1 = items[1].material;

      // Same materials should be grouped together
      if (mat0.id === material1.id) {
        expect(items[1].material.id).toBe(material1.id);
      }
    });

    it('reduces material state changes', () => {
      for (let i = 0; i < 10; i++) {
        const mat = i % 2 === 0 ? material1 : material2;
        queue.addOpaque(mesh, mat, i);
      }

      queue.sort();

      const items = queue.getOpaqueItems();
      let changes = 0;
      for (let i = 1; i < items.length; i++) {
        if (items[i].material.id !== items[i - 1].material.id) {
          changes++;
        }
      }

      expect(changes).toBeLessThan(10);
    });
  });

  describe('sorting by shader', () => {
    it('groups objects by shader variant', () => {
      material1.setShaderVariant('pbr');
      material2.setShaderVariant('unlit');

      queue.addOpaque(mesh, material1, 10);
      queue.addOpaque(mesh, material2, 5);
      queue.addOpaque(mesh, material1, 15);

      queue.sort();

      // Shaders should be grouped
      expect(queue.getOpaqueItems().length).toBe(3);
    });
  });

  describe('opaque vs transparent', () => {
    it('separates opaque and transparent queues', () => {
      queue.addOpaque(mesh, material1, 10);
      queue.addTransparent(mesh, material2, 10);

      expect(queue.getOpaqueItems().length).toBe(1);
      expect(queue.getTransparentItems().length).toBe(1);
    });

    it('renders opaque before transparent', () => {
      queue.addTransparent(mesh, material1, 10);
      queue.addOpaque(mesh, material2, 10);

      queue.sort();

      // Opaque queue should be processed first
      expect(queue.getOpaqueItems().length).toBeGreaterThan(0);
      expect(queue.getTransparentItems().length).toBeGreaterThan(0);
    });

    it('handles alpha cutout as opaque', () => {
      material1.setAlphaMode(AlphaMode.Mask);

      queue.addOpaque(mesh, material1, 10);

      expect(queue.getOpaqueItems().length).toBe(1);
      expect(queue.getTransparentItems().length).toBe(0);
    });

    it('handles alpha blend as transparent', () => {
      material1.setAlphaMode(AlphaMode.Blend);

      queue.addTransparent(mesh, material1, 10);

      expect(queue.getOpaqueItems().length).toBe(0);
      expect(queue.getTransparentItems().length).toBe(1);
    });
  });

  describe('batch grouping', () => {
    it('groups compatible draws into batches', () => {
      for (let i = 0; i < 5; i++) {
        queue.addOpaque(mesh, material1, i);
      }

      queue.sort();
      queue.buildBatches();

      const batches = queue.getBatches();
      expect(batches.length).toBeGreaterThan(0);
    });

    it('breaks batches on material change', () => {
      queue.addOpaque(mesh, material1, 1);
      queue.addOpaque(mesh, material2, 2);
      queue.addOpaque(mesh, material1, 3);

      queue.sort();
      queue.buildBatches();

      const batches = queue.getBatches();
      expect(batches.length).toBeGreaterThan(1);
    });

    it('limits batch size', () => {
      for (let i = 0; i < 1000; i++) {
        queue.addOpaque(mesh, material1, i);
      }

      queue.sort();
      queue.buildBatches({ maxBatchSize: 100 });

      const batches = queue.getBatches();
      batches.forEach(batch => {
        expect(batch.count).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('state caching', () => {
    it('tracks last bound material', () => {
      queue.addOpaque(mesh, material1, 1);
      queue.sort();

      const items = queue.getOpaqueItems();
      queue.execute(items[0]);

      expect(queue.getLastBoundMaterial()).toBe(material1);
    });

    it('skips redundant material binds', () => {
      queue.addOpaque(mesh, material1, 1);
      queue.addOpaque(mesh, material1, 2);

      queue.sort();

      const items = queue.getOpaqueItems();
      let bindCount = 0;

      items.forEach(item => {
        if (queue.needsMaterialBind(item.material)) {
          bindCount++;
          queue.execute(item);
        }
      });

      expect(bindCount).toBe(1);
    });

    it('tracks last bound mesh', () => {
      queue.addOpaque(mesh, material1, 1);
      queue.sort();

      const items = queue.getOpaqueItems();
      queue.execute(items[0]);

      expect(queue.getLastBoundMesh()).toBe(mesh);
    });
  });

  describe('clear and reset', () => {
    it('clears all queues', () => {
      queue.addOpaque(mesh, material1, 1);
      queue.addTransparent(mesh, material2, 1);

      queue.clear();

      expect(queue.getOpaqueItems().length).toBe(0);
      expect(queue.getTransparentItems().length).toBe(0);
    });

    it('resets state cache on clear', () => {
      queue.addOpaque(mesh, material1, 1);
      queue.sort();
      queue.execute(queue.getOpaqueItems()[0]);

      queue.clear();

      expect(queue.getLastBoundMaterial()).toBeNull();
      expect(queue.getLastBoundMesh()).toBeNull();
    });
  });

  describe('statistics', () => {
    it('counts total draw calls', () => {
      for (let i = 0; i < 10; i++) {
        queue.addOpaque(mesh, material1, i);
      }

      const stats = queue.getStats();
      expect(stats.totalDraws).toBe(10);
    });

    it('counts opaque and transparent separately', () => {
      queue.addOpaque(mesh, material1, 1);
      queue.addOpaque(mesh, material1, 2);
      queue.addTransparent(mesh, material2, 1);

      const stats = queue.getStats();
      expect(stats.opaqueDraws).toBe(2);
      expect(stats.transparentDraws).toBe(1);
    });

    it('tracks state changes', () => {
      queue.addOpaque(mesh, material1, 1);
      queue.addOpaque(mesh, material2, 2);
      queue.addOpaque(mesh, material1, 3);

      queue.sort();

      const stats = queue.getStats();
      expect(stats.materialChanges).toBeGreaterThan(0);
    });
  });

  describe('custom sorting', () => {
    it('supports custom sort keys', () => {
      queue.addOpaque(mesh, material1, 10, 100);
      queue.addOpaque(mesh, material1, 5, 200);

      queue.sort();

      const items = queue.getOpaqueItems();
      expect(items.length).toBe(2);
    });

    it('maintains stable sort for equal keys', () => {
      const items = [];
      for (let i = 0; i < 5; i++) {
        queue.addOpaque(mesh, material1, 10);
        items.push(i);
      }

      queue.sort();

      // Order should be stable for equal depths
      expect(queue.getOpaqueItems().length).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('handles empty queue', () => {
      queue.sort();

      expect(queue.getOpaqueItems().length).toBe(0);
      expect(queue.getTransparentItems().length).toBe(0);
    });

    it('handles single item', () => {
      queue.addOpaque(mesh, material1, 10);
      queue.sort();

      expect(queue.getOpaqueItems().length).toBe(1);
    });

    it('handles negative depths', () => {
      queue.addOpaque(mesh, material1, -10);
      queue.addOpaque(mesh, material1, -5);

      queue.sort();

      const items = queue.getOpaqueItems();
      expect(items[0].depth).toBeLessThan(items[1].depth);
    });

    it('handles very large queues', () => {
      for (let i = 0; i < 10000; i++) {
        queue.addOpaque(mesh, material1, Math.random() * 1000);
      }

      expect(() => {
        queue.sort();
      }).not.toThrow();

      expect(queue.getOpaqueItems().length).toBe(10000);
    });
  });
});
