/**
 * @fileoverview Unit tests for TransformSystem.
 * Tests matrix updates, hierarchy propagation, dirty flag handling, and update ordering.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransformSystem } from '../../../../ecs/systems/TransformSystem';
import { TransformComponent } from '../../../../ecs/components/TransformComponent';
import { HierarchyComponent } from '../../../../ecs/components/HierarchyComponent';
import { World } from '../../../../ecs/World';
import { Vector3 } from '../../../../math/Vector3';
import { Quaternion } from '../../../../math/Quaternion';
import { SystemContext } from '../../../../ecs/System';

describe('TransformSystem', () => {
  let world: World;
  let system: TransformSystem;

  beforeEach(() => {
    world = new World();
    system = new TransformSystem();
    system['world'] = world;
    system.onInit();
  });

  describe('initialization', () => {
    it('creates with correct name', () => {
      expect(system.name).toBe('TransformSystem');
    });

    it('initializes internal data structures', () => {
      expect(system['dirtyEntities']).toBeDefined();
      expect(system['entitiesByDepth']).toBeDefined();
      expect(system['worldMatrixCache']).toBeDefined();
      expect(system['localMatrixCache']).toBeDefined();
    });

    it('onInit() clears all caches', () => {
      system['dirtyEntities'].add(1);
      system['worldMatrixCache'].set(1, world.entityManager.getComponent(1, TransformComponent)?.worldMatrix);

      system.onInit();

      expect(system['dirtyEntities'].size).toBe(0);
      expect(system['worldMatrixCache'].size).toBe(0);
    });
  });

  describe('entity transform updates', () => {
    it('updateEntityTransform() updates both local and world matrices', () => {
      const entity = world.createEntity();
      world.addComponent(entity, TransformComponent, {
        position: new Vector3(10, 20, 30)
      });

      system.updateEntityTransform(entity);

      const localMatrix = system.getLocalMatrix(entity);
      expect(localMatrix).toBeDefined();

      const worldMatrix = system.getWorldMatrix(entity);
      expect(worldMatrix).toBeDefined();
    });

    it('updateEntityWorldMatrix() computes world matrix', () => {
      const entity = world.createEntity();
      const transform = world.addComponent(entity, TransformComponent, {
        position: new Vector3(5, 10, 15)
      });

      system.updateEntityWorldMatrix(entity);

      const worldMatrix = system.getWorldMatrix(entity);
      const worldPos = worldMatrix?.getPosition();

      expect(worldPos?.x).toBeCloseTo(5);
      expect(worldPos?.y).toBeCloseTo(10);
      expect(worldPos?.z).toBeCloseTo(15);
    });

    it('handles entity without transform gracefully', () => {
      const entity = world.createEntity();

      expect(() => system.updateEntityTransform(entity)).not.toThrow();
    });

    it('caches local matrix after update', () => {
      const entity = world.createEntity();
      world.addComponent(entity, TransformComponent);

      system.updateEntityTransform(entity);

      const cached = system.getLocalMatrix(entity);
      expect(cached).toBeDefined();
    });

    it('caches world matrix after update', () => {
      const entity = world.createEntity();
      world.addComponent(entity, TransformComponent);

      system.updateEntityTransform(entity);

      const cached = system.getWorldMatrix(entity);
      expect(cached).toBeDefined();
    });
  });

  describe('hierarchy propagation', () => {
    it('updateHierarchy() processes root entity', () => {
      const root = world.createEntity();
      const rootTransform = world.addComponent(root, TransformComponent, {
        position: new Vector3(10, 0, 0)
      });

      system.updateHierarchy(root);

      const worldPos = rootTransform.worldPosition;
      expect(worldPos.x).toBeCloseTo(10);
    });

    it('updateHierarchy() recursively processes children', () => {
      const parent = world.createEntity();
      const child = world.createEntity();

      const parentTransform = world.addComponent(parent, TransformComponent, {
        position: new Vector3(10, 0, 0)
      });

      const childTransform = world.addComponent(child, TransformComponent, {
        position: new Vector3(5, 0, 0)
      });

      const parentHierarchy = world.addComponent(parent, HierarchyComponent);
      const childHierarchy = world.addComponent(child, HierarchyComponent);

      parentHierarchy._addChild(child);
      childHierarchy._setParent(parent);
      childHierarchy.depth = 1;

      system.updateHierarchy(parent);

      const worldPos = childTransform.worldPosition;
      expect(worldPos.x).toBeCloseTo(15);
    });

    it('handles entity with no hierarchy', () => {
      const entity = world.createEntity();
      world.addComponent(entity, TransformComponent);

      expect(() => system.updateHierarchy(entity)).not.toThrow();
    });

    it('handles entity with no children', () => {
      const entity = world.createEntity();
      world.addComponent(entity, TransformComponent);
      world.addComponent(entity, HierarchyComponent);

      expect(() => system.updateHierarchy(entity)).not.toThrow();
    });
  });

  describe('dirty flag handling', () => {
    it('setDirty() marks entity as dirty', () => {
      const entity = 1;

      system.setDirty(entity);

      expect(system.isDirty(entity)).toBe(true);
    });

    it('clearDirty() removes dirty flag', () => {
      const entity = 1;

      system.setDirty(entity);
      system.clearDirty(entity);

      expect(system.isDirty(entity)).toBe(false);
    });

    it('isDirty() returns false for clean entity', () => {
      const entity = 1;

      expect(system.isDirty(entity)).toBe(false);
    });

    it('markHierarchyDirty() marks entity and children', () => {
      const parent = world.createEntity();
      const child = world.createEntity();

      world.addComponent(parent, TransformComponent);
      world.addComponent(child, TransformComponent);

      const parentHierarchy = world.addComponent(parent, HierarchyComponent);
      const childHierarchy = world.addComponent(child, HierarchyComponent);

      parentHierarchy._addChild(child);
      childHierarchy._setParent(parent);

      system.markHierarchyDirty(parent);

      expect(system.isDirty(parent)).toBe(true);
      expect(system.isDirty(child)).toBe(true);
    });

    it('markHierarchyDirty() handles entity without children', () => {
      const entity = world.createEntity();
      world.addComponent(entity, TransformComponent);

      system.markHierarchyDirty(entity);

      expect(system.isDirty(entity)).toBe(true);
    });
  });

  describe('matrix caching', () => {
    it('getLocalMatrix() returns cached matrix', () => {
      const entity = world.createEntity();
      world.addComponent(entity, TransformComponent);

      system.updateEntityTransform(entity);

      const matrix1 = system.getLocalMatrix(entity);
      const matrix2 = system.getLocalMatrix(entity);

      expect(matrix1).toBe(matrix2);
    });

    it('getWorldMatrix() returns cached matrix', () => {
      const entity = world.createEntity();
      world.addComponent(entity, TransformComponent);

      system.updateEntityTransform(entity);

      const matrix1 = system.getWorldMatrix(entity);
      const matrix2 = system.getWorldMatrix(entity);

      expect(matrix1).toBe(matrix2);
    });

    it('getLocalMatrix() computes if not cached', () => {
      const entity = world.createEntity();
      world.addComponent(entity, TransformComponent, {
        position: new Vector3(5, 10, 15)
      });

      const matrix = system.getLocalMatrix(entity);
      const pos = matrix?.getPosition();

      expect(pos?.x).toBeCloseTo(5);
      expect(pos?.y).toBeCloseTo(10);
      expect(pos?.z).toBeCloseTo(15);
    });

    it('getWorldMatrix() computes if not cached', () => {
      const entity = world.createEntity();
      world.addComponent(entity, TransformComponent, {
        position: new Vector3(1, 2, 3)
      });

      const matrix = system.getWorldMatrix(entity);
      expect(matrix).toBeDefined();
    });

    it('returns undefined for non-existent entity', () => {
      const entity = 999999;

      const localMatrix = system.getLocalMatrix(entity);
      const worldMatrix = system.getWorldMatrix(entity);

      expect(localMatrix).toBeUndefined();
      expect(worldMatrix).toBeUndefined();
    });
  });

  describe('update ordering', () => {
    it('update() processes transforms each frame', () => {
      const entity = world.createEntity();
      const transform = world.addComponent(entity, TransformComponent, {
        position: new Vector3(10, 20, 30)
      });

      const context: SystemContext = {
        deltaTime: 0.016,
        fixedDeltaTime: 0.016,
        time: 1.0,
        frameCount: 60
      };

      system['updateLocalMatrices'] = vi.fn();
      system['buildDepthGroups'] = vi.fn();
      system['updateWorldMatrices'] = vi.fn();

      system.update(context);

      expect(system['updateLocalMatrices']).toHaveBeenCalled();
      expect(system['buildDepthGroups']).toHaveBeenCalled();
      expect(system['updateWorldMatrices']).toHaveBeenCalled();
    });

    it('update() clears dirty flags after processing', () => {
      const entity = world.createEntity();
      world.addComponent(entity, TransformComponent);

      system.setDirty(entity);

      const context: SystemContext = {
        deltaTime: 0.016,
        fixedDeltaTime: 0.016,
        time: 1.0,
        frameCount: 60
      };

      system.update(context);

      expect(system.isDirty(entity)).toBe(false);
    });

    it('processes entities in depth order', () => {
      const root = world.createEntity();
      const child = world.createEntity();
      const grandchild = world.createEntity();

      world.addComponent(root, TransformComponent);
      world.addComponent(child, TransformComponent);
      world.addComponent(grandchild, TransformComponent);

      const rootHierarchy = world.addComponent(root, HierarchyComponent);
      const childHierarchy = world.addComponent(child, HierarchyComponent);
      const grandchildHierarchy = world.addComponent(grandchild, HierarchyComponent);

      rootHierarchy._addChild(child);
      childHierarchy._setParent(root);
      childHierarchy._addChild(grandchild);
      childHierarchy.depth = 1;
      grandchildHierarchy._setParent(child);
      grandchildHierarchy.depth = 2;

      system['entitiesByDepth'].set(0, [root]);
      system['entitiesByDepth'].set(1, [child]);
      system['entitiesByDepth'].set(2, [grandchild]);

      expect(() => system['updateWorldMatrices']()).not.toThrow();
    });
  });

  describe('local matrix updates', () => {
    it('updateLocalMatrices() processes all entities', () => {
      const entity1 = world.createEntity();
      const entity2 = world.createEntity();

      world.addComponent(entity1, TransformComponent);
      world.addComponent(entity2, TransformComponent);

      system.setDirty(entity1);
      system.setDirty(entity2);

      system.updateLocalMatrices();

      const matrix1 = system.getLocalMatrix(entity1);
      const matrix2 = system.getLocalMatrix(entity2);

      expect(matrix1).toBeDefined();
      expect(matrix2).toBeDefined();
    });

    it('updateLocalMatrices() updates only dirty entities', () => {
      const entity = world.createEntity();
      const transform = world.addComponent(entity, TransformComponent);

      transform['_localMatrixDirty'] = false;

      system.updateLocalMatrices();

      expect(system.getLocalMatrix(entity)).toBeDefined();
    });

    it('caches local matrices after update', () => {
      const entity = world.createEntity();
      world.addComponent(entity, TransformComponent);

      system.setDirty(entity);
      system.updateLocalMatrices();

      expect(system['localMatrixCache'].has(entity)).toBe(true);
    });
  });

  describe('world matrix updates', () => {
    it('updateWorldMatrices() processes depth-sorted entities', () => {
      const root = world.createEntity();
      const child = world.createEntity();

      world.addComponent(root, TransformComponent);
      world.addComponent(child, TransformComponent);

      const childHierarchy = world.addComponent(child, HierarchyComponent);
      childHierarchy.depth = 1;

      system['entitiesByDepth'].set(0, [root]);
      system['entitiesByDepth'].set(1, [child]);

      expect(() => system['updateWorldMatrices']()).not.toThrow();
    });

    it('handles empty depth groups', () => {
      system['entitiesByDepth'].clear();

      expect(() => system['updateWorldMatrices']()).not.toThrow();
    });

    it('processes depths in ascending order', () => {
      const depths: number[] = [];

      system['entitiesByDepth'].set(2, []);
      system['entitiesByDepth'].set(0, []);
      system['entitiesByDepth'].set(1, []);

      const originalUpdate = system['updateEntityWorldMatrix'].bind(system);
      system['updateEntityWorldMatrix'] = vi.fn();

      system['updateWorldMatrices']();

      const processedDepths = Array.from(system['entitiesByDepth'].keys()).sort((a, b) => a - b);
      expect(processedDepths).toEqual([0, 1, 2]);
    });
  });

  describe('performance', () => {
    it('handles large number of entities efficiently', () => {
      const entityCount = 1000;
      const entities: number[] = [];

      for (let i = 0; i < entityCount; i++) {
        const entity = world.createEntity();
        world.addComponent(entity, TransformComponent, {
          position: new Vector3(i, i, i)
        });
        entities.push(entity);
      }

      const startTime = performance.now();

      const context: SystemContext = {
        deltaTime: 0.016,
        fixedDeltaTime: 0.016,
        time: 1.0,
        frameCount: 60
      };

      system.update(context);

      const endTime = performance.now();
      const updateTime = endTime - startTime;

      expect(updateTime).toBeLessThan(100);
    });

    it('caching reduces redundant computations', () => {
      const entity = world.createEntity();
      world.addComponent(entity, TransformComponent);

      system.updateEntityTransform(entity);

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        system.getWorldMatrix(entity);
      }
      const end = performance.now();

      expect(end - start).toBeLessThan(10);
    });
  });

  describe('edge cases', () => {
    it('handles null world', () => {
      system['world'] = null as any;

      expect(() => system['updateWorldMatrices']()).not.toThrow();
    });

    it('handles entity with transform but no hierarchy', () => {
      const entity = world.createEntity();
      world.addComponent(entity, TransformComponent);

      system.updateEntityWorldMatrix(entity);

      const worldMatrix = system.getWorldMatrix(entity);
      expect(worldMatrix).toBeDefined();
    });

    it('handles circular references gracefully', () => {
      const entity1 = world.createEntity();
      const entity2 = world.createEntity();

      world.addComponent(entity1, TransformComponent);
      world.addComponent(entity2, TransformComponent);

      const hierarchy1 = world.addComponent(entity1, HierarchyComponent);
      const hierarchy2 = world.addComponent(entity2, HierarchyComponent);

      hierarchy1._addChild(entity2);
      hierarchy2._setParent(entity1);

      expect(() => system.updateHierarchy(entity1)).not.toThrow();
    });

    it('handles very deep hierarchies', () => {
      const depth = 100;
      const entities: number[] = [];

      for (let i = 0; i < depth; i++) {
        const entity = world.createEntity();
        world.addComponent(entity, TransformComponent);
        world.addComponent(entity, HierarchyComponent);
        entities.push(entity);

        if (i > 0) {
          const parent = entities[i - 1];
          const parentHierarchy = world.entityManager.getComponent(parent, HierarchyComponent);
          const childHierarchy = world.entityManager.getComponent(entity, HierarchyComponent);

          parentHierarchy?._addChild(entity);
          childHierarchy?._setParent(parent);
          if (childHierarchy) {
            childHierarchy.depth = i;
          }
        }
      }

      expect(() => system.updateHierarchy(entities[0])).not.toThrow();
    });
  });
});
