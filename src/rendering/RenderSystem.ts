/**
 * @module Rendering
 * @description
 * ECS system for rendering integration. Extracts renderable data from ECS components
 * and coordinates with the Renderer for frame rendering.
 */

import { System, SystemContext, SystemPriority, Query } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { World } from '../ecs/World';
import { TransformComponent } from '../ecs/components/TransformComponent';
import { Renderer } from './Renderer';
import { Scene } from './scene/Scene';
import { SceneNode } from './scene/SceneNode';
import { Camera } from './camera/Camera';
import { Light } from './lighting/Light';
import { DirectionalLight } from './lighting/DirectionalLight';
import { PointLight } from './lighting/PointLight';
import { SpotLight } from './lighting/SpotLight';
import { Logger } from '../core/Logger';
import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';

const logger = Logger.create('RenderSystem');

/**
 * Component interface for renderable meshes.
 */
export interface MeshComponent {
  /** Mesh resource ID or path */
  meshId: string;
  /** Material ID or path */
  materialId: string;
  /** Whether mesh is visible */
  visible: boolean;
  /** Whether to cast shadows */
  castShadows: boolean;
  /** Whether to receive shadows */
  receiveShadows: boolean;
  /** Render layer mask */
  layerMask: number;
}

/**
 * Component interface for cameras.
 */
export interface CameraComponent {
  /** Whether this is the active camera */
  active: boolean;
  /** Field of view in radians */
  fov: number;
  /** Near clipping plane */
  near: number;
  /** Far clipping plane */
  far: number;
  /** Aspect ratio (0 = auto from viewport) */
  aspect: number;
  /** Camera priority (higher renders last) */
  priority: number;
  /** Target render texture (null = screen) */
  targetTexture: string | null;
  /** Clear flags */
  clearFlags: 'solid' | 'skybox' | 'depth';
  /** Clear color (for solid clear) */
  clearColor: [number, number, number, number];
}

/**
 * Component interface for lights.
 */
export interface LightComponent {
  /** Light type */
  type: 'directional' | 'point' | 'spot' | 'area';
  /** Light color */
  color: [number, number, number];
  /** Light intensity */
  intensity: number;
  /** Range (for point/spot) */
  range: number;
  /** Spot angle (for spot) */
  spotAngle: number;
  /** Whether to cast shadows */
  castShadows: boolean;
  /** Shadow resolution */
  shadowResolution: number;
  /** Whether light is enabled */
  enabled: boolean;
}

/**
 * Extracted render scene from ECS world.
 */
interface RenderScene {
  /** Scene graph root */
  scene: Scene;
  /** Active cameras */
  cameras: Array<{ camera: Camera; entity: Entity; priority: number }>;
  /** Renderable meshes */
  meshes: Array<{ node: SceneNode; entity: Entity }>;
  /** Lights */
  lights: Array<{ light: Light; entity: Entity }>;
}

/**
 * ECS system for rendering integration.
 *
 * Responsibilities:
 * - Extract renderable data from ECS components
 * - Build Scene graph from ECS entities
 * - Synchronize transforms
 * - Manage cameras and lights
 * - Coordinate frame rendering
 *
 * @example
 * ```typescript
 * const world = new World();
 * const renderer = await Renderer.create({ ... });
 * const renderSystem = new RenderSystem(world, renderer);
 *
 * world.addSystem(renderSystem);
 * world.init();
 * world.start();
 *
 * // Game loop
 * function loop() {
 *   world.update(deltaTime);
 *   world.lateUpdate(deltaTime);
 *   requestAnimationFrame(loop);
 * }
 * ```
 */
export class RenderSystem extends System {
  override readonly name = 'RenderSystem';
  override priority = 1000; // Render last
  override enabled = true;

  // Query for all entities with renderable components
  override readonly query = {
    any: [
      // Would reference actual component types
      // MeshComponent, CameraComponent, LightComponent
    ],
  };

  override world: World;
  private renderer: Renderer;
  private renderScene: RenderScene;
  private entityToNode: Map<Entity, SceneNode> = new Map();
  private frameCount: number = 0;

  /**
   * Creates a new RenderSystem.
   *
   * @param world - ECS world
   * @param renderer - Renderer instance
   */
  constructor(world: World, renderer: Renderer) {
    super();
    this.world = world;
    this.renderer = renderer;

    // Initialize render scene
    this.renderScene = {
      scene: new Scene('ECS Scene'),
      cameras: [],
      meshes: [],
      lights: [],
    };

    logger.info('RenderSystem created');
  }

  /**
   * Called when system is initialized.
   */
  override onInit(): void {
    logger.info('RenderSystem initialized');
  }

  /**
   * Called when system starts.
   */
  override onStart(): void {
    logger.info('RenderSystem started');
  }

  /**
   * Updates the render system (called every frame).
   *
   * @param context - System context
   */
  override update(context: SystemContext): void {
    // Extract render data from ECS
    this.extractRenderScene();

    // Synchronize transforms
    this.synchronizeTransforms();

    // Render all cameras
    this.renderCameras();

    this.frameCount++;
  }

  /**
   * Called after all systems update.
   *
   * @param context - System context
   */
  override lateUpdate(context: SystemContext): void {
    // Could handle post-render tasks here
  }

  /**
   * Called when system is destroyed.
   */
  override onDestroy(): void {
    logger.info('RenderSystem destroyed');

    // Cleanup scene
    this.renderScene.scene.clear();
    this.entityToNode.clear();
  }

  /**
   * Extracts render scene from ECS world.
   */
  private extractRenderScene(): void {
    this.renderScene.cameras = [];
    this.renderScene.meshes = [];
    this.renderScene.lights = [];

    // Query all entities with components
    // In a real implementation, would use actual ECS queries
    const entities = this.world.entityManager.getAliveEntities();

    for (const entity of entities) {
      // Extract mesh component
      const meshComp = this.getMeshComponent(entity);
      if (meshComp && meshComp.visible) {
        const node = this.getOrCreateSceneNode(entity);
        this.renderScene.meshes.push({ node, entity });
      }

      // Extract camera component
      const cameraComp = this.getCameraComponent(entity);
      if (cameraComp && cameraComp.active) {
        const camera = this.createCameraFromComponent(cameraComp);
        this.renderScene.cameras.push({
          camera,
          entity,
          priority: cameraComp.priority,
        });
      }

      // Extract light component
      const lightComp = this.getLightComponent(entity);
      if (lightComp && lightComp.enabled) {
        const light = this.createLightFromComponent(lightComp);
        if (light) {
          this.renderScene.lights.push({ light, entity });
        }
      }
    }

    // Sort cameras by priority
    this.renderScene.cameras.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Synchronizes transforms from ECS to scene graph.
   */
  private synchronizeTransforms(): void {
    for (const [entity, node] of this.entityToNode) {
      const transform = this.world.entityManager.getComponent(entity, TransformComponent);
      if (!transform) {
        continue;
      }

      // Update position
      node.transform.position.set(
        transform.position.x,
        transform.position.y,
        transform.position.z
      );

      // Update rotation
      node.transform.rotation.set(
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.rotation.w
      );

      // Update scale
      node.transform.scale.set(
        transform.scale.x,
        transform.scale.y,
        transform.scale.z
      );

      // Mark transform dirty
      node.transform.markDirty();
    }
  }

  /**
   * Renders all active cameras.
   */
  private renderCameras(): void {
    const lightManager = this.renderer.getLightManager();

    // Update lights
    lightManager.clear();
    for (const { light, entity } of this.renderScene.lights) {
      // Sync light transform
      const transform = this.world.entityManager.getComponent(entity, TransformComponent);
      if (transform) {
        light.position = new Vector3(
          transform.position.x,
          transform.position.y,
          transform.position.z
        );

        if (light instanceof DirectionalLight || light instanceof SpotLight) {
          // Calculate direction from rotation
          const rotation = new Quaternion(
            transform.rotation.x,
            transform.rotation.y,
            transform.rotation.z,
            transform.rotation.w
          );
          const forward = new Vector3(0, 0, -1);
          forward.applyQuaternion(rotation);
          light.direction = forward;
        }
      }

      lightManager.addLight(light);
    }

    // Render each camera
    for (const { camera, entity } of this.renderScene.cameras) {
      // Sync camera transform
      const transform = this.world.entityManager.getComponent(entity, TransformComponent);
      if (transform) {
        camera.transform.position.set(
          transform.position.x,
          transform.position.y,
          transform.position.z
        );
        camera.transform.rotation.set(
          transform.rotation.x,
          transform.rotation.y,
          transform.rotation.z,
          transform.rotation.w
        );
      }

      // Render
      this.renderer.render(this.renderScene.scene, camera);
    }
  }

  /**
   * Gets or creates a scene node for an entity.
   */
  private getOrCreateSceneNode(entity: Entity): SceneNode {
    let node = this.entityToNode.get(entity);
    if (!node) {
      node = new SceneNode(`Entity_${entity}`);
      this.entityToNode.set(entity, node);
      this.renderScene.scene.add(node);
    }
    return node;
  }

  /**
   * Gets mesh component from entity via entity manager query.
   */
  private getMeshComponent(entity: Entity): MeshComponent | null {
    if (!this.world?.entityManager) {
      return null;
    }
    return this.world.entityManager.getComponent<MeshComponent>(entity, 'MeshComponent') ?? null;
  }

  /**
   * Gets camera component from entity via entity manager query.
   */
  private getCameraComponent(entity: Entity): CameraComponent | null {
    if (!this.world?.entityManager) {
      return null;
    }
    return this.world.entityManager.getComponent<CameraComponent>(entity, 'CameraComponent') ?? null;
  }

  /**
   * Gets light component from entity via entity manager query.
   */
  private getLightComponent(entity: Entity): LightComponent | null {
    if (!this.world?.entityManager) {
      return null;
    }
    return this.world.entityManager.getComponent<LightComponent>(entity, 'LightComponent') ?? null;
  }

  /**
   * Creates a Camera from component data.
   */
  private createCameraFromComponent(comp: CameraComponent): Camera {
    const camera = new Camera();
    camera.setPerspective(
      comp.fov,
      comp.aspect || this.renderer.getStats().width / this.renderer.getStats().height,
      comp.near,
      comp.far
    );
    return camera;
  }

  /**
   * Creates a Light from component data.
   */
  private createLightFromComponent(comp: LightComponent): Light | null {
    let light: Light | null = null;

    switch (comp.type) {
      case 'directional': {
        const dirLight = new DirectionalLight();
        dirLight.direction = new Vector3(0, -1, 0);
        light = dirLight;
        break;
      }
      case 'point': {
        const pointLight = new PointLight(new Vector3(0, 0, 0));
        pointLight.range = comp.range;
        light = pointLight;
        break;
      }
      case 'spot': {
        const spotLight = new SpotLight();
        spotLight.direction = new Vector3(0, -1, 0);
        spotLight.setAngles(comp.spotAngle * 0.5, comp.spotAngle);
        light = spotLight;
        break;
      }
      default:
        logger.warn(`Unsupported light type: ${comp.type}`);
        return null;
    }

    if (light) {
      light.color.set(comp.color[0], comp.color[1], comp.color[2]);
      light.setIntensity(comp.intensity, light.unit);
      light.setShadowsEnabled(comp.castShadows);
    }

    return light;
  }

  /**
   * Gets the render scene.
   *
   * @returns Current render scene
   */
  getRenderScene(): RenderScene {
    return this.renderScene;
  }

  /**
   * Gets the scene graph.
   *
   * @returns Scene graph
   */
  getScene(): Scene {
    return this.renderScene.scene;
  }

  /**
   * Gets the renderer.
   *
   * @returns Renderer instance
   */
  getRenderer(): Renderer {
    return this.renderer;
  }

  /**
   * Gets the frame count.
   *
   * @returns Number of frames rendered
   */
  getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Manually adds a scene node (for non-ECS objects).
   *
   * @param node - Scene node to add
   */
  addSceneNode(node: SceneNode): void {
    this.renderScene.scene.add(node);
  }

  /**
   * Manually removes a scene node.
   *
   * @param node - Scene node to remove
   */
  removeSceneNode(node: SceneNode): void {
    this.renderScene.scene.remove(node);
  }

  /**
   * Clears all render data.
   */
  clear(): void {
    this.renderScene.scene.clear();
    this.entityToNode.clear();
    this.renderScene.cameras = [];
    this.renderScene.meshes = [];
    this.renderScene.lights = [];
  }
}
