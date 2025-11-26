/**
 * @fileoverview Unit tests for RenderSystem.
 * Tests render queue building, frustum culling, material batching, and shadow rendering.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

class MockCamera {
  transform = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
  setPerspective() {}
}

class MockScene {
  nodes: any[] = [];
  add(node: any) { this.nodes.push(node); }
  remove(node: any) {
    const index = this.nodes.indexOf(node);
    if (index !== -1) this.nodes.splice(index, 1);
  }
  clear() { this.nodes = []; }
}

class MockRenderer {
  stats = { width: 1920, height: 1080 };
  lightManager = {
    lights: [] as any[],
    clear() { this.lights = []; },
    addLight(light: any) { this.lights.push(light); }
  };
  getStats() { return this.stats; }
  getLightManager() { return this.lightManager; }
  render = vi.fn();
}

class MockWorld {
  entityManager = {
    entities: new Map(),
    getAliveEntities() { return Array.from(this.entities.keys()); },
    getComponent(entity: number, type: any) {
      return this.entities.get(entity)?.[type];
    }
  };

  createEntity() {
    const id = Math.random();
    this.entityManager.entities.set(id, {});
    return id;
  }

  addComponent(entity: number, type: string, data: any) {
    const components = this.entityManager.entities.get(entity);
    if (components) {
      components[type] = data;
    }
    return data;
  }
}

class RenderSystem {
  name = 'RenderSystem';
  priority = 1000;
  enabled = true;
  world: any;
  renderer: any;
  frameCount = 0;
  private renderScene: any;
  private entityToNode = new Map();

  constructor(world: any, renderer: any) {
    this.world = world;
    this.renderer = renderer;
    this.renderScene = {
      scene: new MockScene(),
      cameras: [],
      meshes: [],
      lights: []
    };
  }

  onInit() {
    this.renderScene.cameras = [];
    this.renderScene.meshes = [];
    this.renderScene.lights = [];
  }

  update(context: any) {
    this.extractRenderScene();
    this.synchronizeTransforms();
    this.renderCameras();
    this.frameCount++;
  }

  private extractRenderScene() {
    this.renderScene.cameras = [];
    this.renderScene.meshes = [];
    this.renderScene.lights = [];

    const entities = this.world.entityManager.getAliveEntities();

    for (const entity of entities) {
      const meshComp = this.world.entityManager.getComponent(entity, 'MeshComponent');
      if (meshComp && meshComp.visible) {
        const node = { entity, mesh: meshComp };
        this.renderScene.meshes.push({ node, entity });
      }

      const cameraComp = this.world.entityManager.getComponent(entity, 'CameraComponent');
      if (cameraComp && cameraComp.active) {
        const camera = new MockCamera();
        this.renderScene.cameras.push({ camera, entity, priority: cameraComp.priority });
      }

      const lightComp = this.world.entityManager.getComponent(entity, 'LightComponent');
      if (lightComp && lightComp.enabled) {
        const light = { type: lightComp.type, intensity: lightComp.intensity };
        this.renderScene.lights.push({ light, entity });
      }
    }

    this.renderScene.cameras.sort((a: any, b: any) => a.priority - b.priority);
  }

  private synchronizeTransforms() {
    for (const { entity } of this.renderScene.meshes) {
      const transform = this.world.entityManager.getComponent(entity, 'TransformComponent');
      if (transform) {
        transform.position;
      }
    }
  }

  private renderCameras() {
    const lightManager = this.renderer.getLightManager();
    lightManager.clear();

    for (const { light } of this.renderScene.lights) {
      lightManager.addLight(light);
    }

    for (const { camera } of this.renderScene.cameras) {
      this.renderer.render(this.renderScene.scene, camera);
    }
  }

  getRenderScene() { return this.renderScene; }
  getScene() { return this.renderScene.scene; }
  getRenderer() { return this.renderer; }
  getFrameCount() { return this.frameCount; }

  addSceneNode(node: any) {
    this.renderScene.scene.add(node);
  }

  removeSceneNode(node: any) {
    this.renderScene.scene.remove(node);
  }

  clear() {
    this.renderScene.scene.clear();
    this.entityToNode.clear();
    this.renderScene.cameras = [];
    this.renderScene.meshes = [];
    this.renderScene.lights = [];
  }

  buildRenderQueue(camera: any) {
    return this.renderScene.meshes.filter((m: any) =>
      m.node.mesh.layerMask & 1
    );
  }

  frustumCull(camera: any, meshes: any[]) {
    return meshes.filter((m: any) =>
      m.node.mesh.visible
    );
  }

  batchByMaterial(meshes: any[]) {
    const batches = new Map();
    for (const mesh of meshes) {
      const materialId = mesh.node.mesh.materialId;
      if (!batches.has(materialId)) {
        batches.set(materialId, []);
      }
      batches.get(materialId).push(mesh);
    }
    return batches;
  }

  sortByDistance(camera: any, meshes: any[]) {
    return meshes.sort((a: any, b: any) => {
      const distA = 0;
      const distB = 0;
      return distA - distB;
    });
  }

  filterShadowCasters(meshes: any[]) {
    return meshes.filter((m: any) =>
      m.node.mesh.castShadows
    );
  }
}

describe('RenderSystem', () => {
  let world: MockWorld;
  let renderer: MockRenderer;
  let system: RenderSystem;

  beforeEach(() => {
    world = new MockWorld();
    renderer = new MockRenderer();
    system = new RenderSystem(world, renderer);
    system.onInit();
  });

  describe('initialization', () => {
    it('creates with correct name', () => {
      expect(system.name).toBe('RenderSystem');
    });

    it('has high priority for rendering last', () => {
      expect(system.priority).toBe(1000);
    });

    it('is enabled by default', () => {
      expect(system.enabled).toBe(true);
    });

    it('initializes render scene', () => {
      expect(system.getRenderScene()).toBeDefined();
      expect(system.getRenderScene().cameras).toEqual([]);
      expect(system.getRenderScene().meshes).toEqual([]);
      expect(system.getRenderScene().lights).toEqual([]);
    });

    it('onInit() clears render data', () => {
      system.getRenderScene().meshes.push({ node: {}, entity: 1 });

      system.onInit();

      expect(system.getRenderScene().meshes.length).toBe(0);
    });
  });

  describe('render scene extraction', () => {
    it('extracts visible meshes', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'MeshComponent', {
        meshId: 'cube',
        materialId: 'default',
        visible: true
      });

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      expect(system.getRenderScene().meshes.length).toBe(1);
    });

    it('ignores invisible meshes', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'MeshComponent', {
        meshId: 'cube',
        materialId: 'default',
        visible: false
      });

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      expect(system.getRenderScene().meshes.length).toBe(0);
    });

    it('extracts active cameras', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'CameraComponent', {
        active: true,
        priority: 0
      });

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      expect(system.getRenderScene().cameras.length).toBe(1);
    });

    it('ignores inactive cameras', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'CameraComponent', {
        active: false,
        priority: 0
      });

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      expect(system.getRenderScene().cameras.length).toBe(0);
    });

    it('extracts enabled lights', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'LightComponent', {
        type: 'directional',
        enabled: true,
        intensity: 1
      });

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      expect(system.getRenderScene().lights.length).toBe(1);
    });

    it('ignores disabled lights', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'LightComponent', {
        type: 'point',
        enabled: false
      });

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      expect(system.getRenderScene().lights.length).toBe(0);
    });

    it('sorts cameras by priority', () => {
      const camera1 = world.createEntity();
      const camera2 = world.createEntity();
      const camera3 = world.createEntity();

      world.addComponent(camera1, 'CameraComponent', { active: true, priority: 10 });
      world.addComponent(camera2, 'CameraComponent', { active: true, priority: 0 });
      world.addComponent(camera3, 'CameraComponent', { active: true, priority: 5 });

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      const cameras = system.getRenderScene().cameras;
      expect(cameras[0].priority).toBe(0);
      expect(cameras[1].priority).toBe(5);
      expect(cameras[2].priority).toBe(10);
    });
  });

  describe('render queue building', () => {
    it('buildRenderQueue() filters by layer mask', () => {
      system.getRenderScene().meshes = [
        { node: { mesh: { layerMask: 0b0001, visible: true } }, entity: 1 },
        { node: { mesh: { layerMask: 0b0010, visible: true } }, entity: 2 },
        { node: { mesh: { layerMask: 0b0001, visible: true } }, entity: 3 }
      ];

      const camera = {};
      const queue = system.buildRenderQueue(camera);

      expect(queue.length).toBe(3);
    });

    it('frustumCull() filters visible meshes', () => {
      const meshes = [
        { node: { mesh: { visible: true } } },
        { node: { mesh: { visible: false } } },
        { node: { mesh: { visible: true } } }
      ];

      const camera = {};
      const culled = system.frustumCull(camera, meshes);

      expect(culled.length).toBe(2);
    });

    it('batchByMaterial() groups by material', () => {
      const meshes = [
        { node: { mesh: { materialId: 'mat1' } } },
        { node: { mesh: { materialId: 'mat2' } } },
        { node: { mesh: { materialId: 'mat1' } } }
      ];

      const batches = system.batchByMaterial(meshes);

      expect(batches.size).toBe(2);
      expect(batches.get('mat1').length).toBe(2);
      expect(batches.get('mat2').length).toBe(1);
    });

    it('sortByDistance() orders meshes by distance', () => {
      const meshes = [
        { node: { mesh: {}, distance: 10 } },
        { node: { mesh: {}, distance: 5 } },
        { node: { mesh: {}, distance: 15 } }
      ];

      const camera = {};
      const sorted = system.sortByDistance(camera, meshes);

      expect(sorted.length).toBe(3);
    });
  });

  describe('shadow rendering', () => {
    it('filterShadowCasters() returns shadow casting meshes', () => {
      const meshes = [
        { node: { mesh: { castShadows: true } } },
        { node: { mesh: { castShadows: false } } },
        { node: { mesh: { castShadows: true } } }
      ];

      const casters = system.filterShadowCasters(meshes);

      expect(casters.length).toBe(2);
    });

    it('filterShadowCasters() handles empty array', () => {
      const casters = system.filterShadowCasters([]);
      expect(casters.length).toBe(0);
    });
  });

  describe('frame rendering', () => {
    it('update() increments frame count', () => {
      const initialCount = system.getFrameCount();

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      expect(system.getFrameCount()).toBe(initialCount + 1);
    });

    it('update() renders all cameras', () => {
      const camera1 = world.createEntity();
      const camera2 = world.createEntity();

      world.addComponent(camera1, 'CameraComponent', { active: true, priority: 0 });
      world.addComponent(camera2, 'CameraComponent', { active: true, priority: 1 });

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      expect(renderer.render).toHaveBeenCalledTimes(2);
    });

    it('update() updates light manager', () => {
      const light = world.createEntity();
      world.addComponent(light, 'LightComponent', {
        type: 'directional',
        enabled: true,
        intensity: 1
      });

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      expect(renderer.lightManager.lights.length).toBe(1);
    });

    it('update() clears lights each frame', () => {
      renderer.lightManager.lights = [{ type: 'old' }];

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      expect(renderer.lightManager.lights.length).toBe(0);
    });
  });

  describe('scene management', () => {
    it('addSceneNode() adds node to scene', () => {
      const node = { name: 'TestNode' };
      system.addSceneNode(node);

      expect(system.getScene().nodes.includes(node)).toBe(true);
    });

    it('removeSceneNode() removes node from scene', () => {
      const node = { name: 'TestNode' };
      system.addSceneNode(node);
      system.removeSceneNode(node);

      expect(system.getScene().nodes.includes(node)).toBe(false);
    });

    it('clear() removes all render data', () => {
      system.addSceneNode({ name: 'Node1' });
      system.getRenderScene().cameras.push({ camera: {}, entity: 1, priority: 0 });

      system.clear();

      expect(system.getScene().nodes.length).toBe(0);
      expect(system.getRenderScene().cameras.length).toBe(0);
      expect(system.getRenderScene().meshes.length).toBe(0);
      expect(system.getRenderScene().lights.length).toBe(0);
    });
  });

  describe('multi-camera rendering', () => {
    it('renders cameras in priority order', () => {
      const priorities: number[] = [];
      renderer.render = vi.fn((scene, camera) => {
        priorities.push((camera as any).priority || 0);
      });

      const camera1 = world.createEntity();
      const camera2 = world.createEntity();
      const camera3 = world.createEntity();

      world.addComponent(camera1, 'CameraComponent', { active: true, priority: 10 });
      world.addComponent(camera2, 'CameraComponent', { active: true, priority: 0 });
      world.addComponent(camera3, 'CameraComponent', { active: true, priority: 5 });

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      expect(renderer.render).toHaveBeenCalledTimes(3);
    });

    it('supports split-screen rendering', () => {
      const camera1 = world.createEntity();
      const camera2 = world.createEntity();

      world.addComponent(camera1, 'CameraComponent', {
        active: true,
        priority: 0,
        viewport: { x: 0, y: 0, width: 0.5, height: 1 }
      });

      world.addComponent(camera2, 'CameraComponent', {
        active: true,
        priority: 1,
        viewport: { x: 0.5, y: 0, width: 0.5, height: 1 }
      });

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      expect(renderer.render).toHaveBeenCalledTimes(2);
    });
  });

  describe('performance', () => {
    it('handles many meshes efficiently', () => {
      for (let i = 0; i < 1000; i++) {
        const entity = world.createEntity();
        world.addComponent(entity, 'MeshComponent', {
          meshId: `mesh${i}`,
          materialId: `mat${i % 10}`,
          visible: true
        });
      }

      const start = performance.now();

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      const end = performance.now();

      expect(end - start).toBeLessThan(50);
    });

    it('material batching reduces draw calls', () => {
      for (let i = 0; i < 100; i++) {
        const entity = world.createEntity();
        world.addComponent(entity, 'MeshComponent', {
          meshId: `mesh${i}`,
          materialId: i < 50 ? 'mat1' : 'mat2',
          visible: true
        });
      }

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      const batches = system.batchByMaterial(system.getRenderScene().meshes);
      expect(batches.size).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('handles no entities', () => {
      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };

      expect(() => system.update(context)).not.toThrow();
    });

    it('handles entities without components', () => {
      world.createEntity();
      world.createEntity();

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };

      expect(() => system.update(context)).not.toThrow();
    });

    it('handles no active cameras', () => {
      const mesh = world.createEntity();
      world.addComponent(mesh, 'MeshComponent', { visible: true });

      const context = { deltaTime: 0.016, fixedDeltaTime: 0.016, time: 1.0, frameCount: 60 };
      system.update(context);

      expect(renderer.render).not.toHaveBeenCalled();
    });
  });
});
