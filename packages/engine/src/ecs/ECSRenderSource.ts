import {
  ActiveComponent,
  CameraComponent,
  HierarchyComponent,
  LightComponent,
  MeshComponent,
  NameComponent,
  TransformComponent,
  WorldTransformComponent,
  type Entity,
  type World,
} from "@aura3d/ecs";
import type {
  CollectedLight,
  Geometry,
  MorphTargetDelta,
  RenderItem,
  RenderMaterial,
  RenderSource,
} from "@aura3d/rendering";

export interface ECSRenderLibraries {
  geometry: Map<string, Geometry>;
  material: Map<string, RenderMaterial>;
  morphTarget?: Map<string, readonly MorphTargetDelta[]>;
}

export interface ECSRenderSourceOptions {
  world: World;
  libraries: ECSRenderLibraries;
  cameraEntity?: Entity;
  frustumCulling?: boolean;
}

/**
 * Creates a {@link RenderSource} backed by an ECS {@link World}.
 *
 * The bridge queries entities with {@link MeshComponent} +
 * {@link WorldTransformComponent} each frame and builds {@link RenderItem}
 * objects that the renderer consumes unchanged.
 *
 * Lighting is collected from entities with {@link LightComponent} +
 * {@link WorldTransformComponent}.
 *
 * The camera entity (if provided) supplies `cameraPosition` and
 * `viewProjectionMatrix` to the renderer.
 */
export function createECSRenderSource(options: ECSRenderSourceOptions): RenderSource {
  return {
    collectRenderItems: () => collectECSRenderItems(options),
    get collectedLights() {
      return safeQueryComponents(options.world, [LightComponent, WorldTransformComponent])
        ? collectECSLights(options)
        : [];
    },
    get cameraPosition() {
      return getECSCameraPosition(options);
    },
  };
}

function safeQueryComponents(world: World, ctors: Parameters<World["query"]>[0]["include"]): boolean {
  return ctors?.every((ctor) => world.registry.get(ctor as any)) ?? true;
}

function collectECSRenderItems(options: ECSRenderSourceOptions): RenderItem[] {
  const { world, libraries } = options;
  const items: RenderItem[] = [];

  const entities = world
    .query({ include: [MeshComponent, WorldTransformComponent] })
    .toArray();

  // Filter inactive entities (skip if ActiveComponent exists and is inactive)
  const hasActiveComp = world.registry.get(ActiveComponent) !== undefined;
  const hasHierarchyComp = world.registry.get(HierarchyComponent) !== undefined;
  const visibleEntities = entities.filter((entity) => {
    if (!hasActiveComp) return true;
    const active = world.get(entity, ActiveComponent);
    if (!active) return true;
    if (!hasHierarchyComp) return active.activeSelf;
    const hierarchy = world.get(entity, HierarchyComponent);
    if (!hierarchy || !hierarchy.parent) return active.activeSelf;
    // For children we need activeInHierarchy which is maintained by ActiveSystem.
    return active.activeInHierarchy;
  });

  for (const entity of visibleEntities) {
    const mesh = world.get(entity, MeshComponent)!;
    const wt = world.get(entity, WorldTransformComponent)!;

    const geometry = libraries.geometry.get(mesh.geometry);
    const material = libraries.material.get(mesh.material);
    if (!geometry) continue;

    const hasNameComp = world.registry.get(NameComponent) !== undefined;
    const label = hasNameComp ? world.get(entity, NameComponent)?.name : undefined;

    items.push({
      geometry,
      material,
      label,
      modelMatrix: wt.worldMatrix,
      normalMatrix: wt.normalMatrix,
      ...(mesh.skinning ? { skinning: mesh.skinning } : {}),
      ...(mesh.morphWeights ? { morphWeights: mesh.morphWeights } : {}),
      ...(mesh.instanceTransforms ? { instanceTransforms: mesh.instanceTransforms } : {}),
      ...(mesh.instanceColors ? { instanceColors: mesh.instanceColors } : {}),
    });
  }

  return items;
}

function collectECSLights(options: ECSRenderSourceOptions): CollectedLight[] {
  const { world } = options;
  const lights: CollectedLight[] = [];

  for (const entity of world
    .query({ include: [LightComponent, WorldTransformComponent] })
    .toArray()) {
    const light = world.get(entity, LightComponent)!;
    const wt = world.get(entity, WorldTransformComponent)!;

    // Extract world position from the 4th column of worldMatrix
    const position: [number, number, number] = [
      wt.worldMatrix[12]!,
      wt.worldMatrix[13]!,
      wt.worldMatrix[14]!,
    ];

    // Extract forward direction from the 3rd column (negated for look direction)
    const direction: [number, number, number] = [
      -wt.worldMatrix[8]!,
      -wt.worldMatrix[9]!,
      -wt.worldMatrix[10]!,
    ];

    const kind = light.kind === "ambient" ? "directional" : light.kind;

    lights.push({
      kind,
      color: light.color,
      intensity: light.intensity,
      position,
      direction,
      range: light.range,
      spotAngle: light.angle,
      penumbra: light.penumbra,
      castsShadow: light.castsShadow,
      layerMask: light.layerMask,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      source: null as any, // not consumed by renderer; ECS lights have no SceneNode source
    });
  }

  return lights;
}

function getECSCameraPosition(options: ECSRenderSourceOptions): [number, number, number] | undefined {
  const { world, cameraEntity } = options;
  if (!cameraEntity) return undefined;

  const cam = world.get(cameraEntity, CameraComponent);
  const wt = world.get(cameraEntity, WorldTransformComponent);
  if (!cam || !wt) return undefined;

  return [wt.worldMatrix[12]!, wt.worldMatrix[13]!, wt.worldMatrix[14]!];
}
