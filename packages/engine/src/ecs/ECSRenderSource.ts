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
import { DirectionalLight, PointLight, SpotLight, type Light, type Mat4 } from "@aura3d/scene";

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
 * The camera entity (if provided) supplies `cameraPosition` to the renderer.
 * View/projection matrices are not wired through this bridge; pass a camera
 * to the renderer separately.
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
    ...(options.frustumCulling !== undefined ? { frustumCulling: options.frustumCulling } : {}),
  };
}

function safeQueryComponents(world: World, ctors: Parameters<World["query"]>[0]["include"]): boolean {
  return ctors?.every((ctor) => world.registry.get(ctor as any)) ?? true;
}

function collectECSRenderItems(options: ECSRenderSourceOptions): RenderItem[] {
  const { world, libraries } = options;
  const items: RenderItem[] = [];

  // Querying unregistered components throws UNREGISTERED_COMPONENT; a fresh
  // world that never added a mesh simply has nothing to render.
  if (!safeQueryComponents(world, [MeshComponent, WorldTransformComponent])) return items;

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

let warnedAmbientLightsUnsupported = false;

function collectECSLights(options: ECSRenderSourceOptions): CollectedLight[] {
  const { world } = options;
  const lights: CollectedLight[] = [];

  for (const entity of world
    .query({ include: [LightComponent, WorldTransformComponent] })
    .toArray()) {
    const light = world.get(entity, LightComponent)!;
    const wt = world.get(entity, WorldTransformComponent)!;

    if (light.kind === "ambient") {
      // CollectedLight has no ambient kind; converting to directional would
      // render the scene wrong, so skip until an environment-lighting bridge exists.
      if (!warnedAmbientLightsUnsupported) {
        warnedAmbientLightsUnsupported = true;
        console.warn(
          "[aura3d] Ambient ECS lights are not yet bridged to the renderer's environment lighting; skipping ambient LightComponent entities."
        );
      }
      continue;
    }

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

    lights.push({
      kind: light.kind,
      color: light.color,
      intensity: light.intensity,
      position,
      direction,
      range: light.range,
      spotAngle: light.angle,
      penumbra: light.penumbra,
      castsShadow: light.castsShadow,
      layerMask: light.layerMask,
      source: createLightSource(light, wt.worldMatrix),
    });
  }

  return lights;
}

/**
 * Builds a real scene {@link Light} node for {@link CollectedLight.source}.
 *
 * The renderer dereferences `light.source.visible` when selecting the shadow
 * caster and reads the source's transform for the shadow direction, so the
 * non-nullable contract must be satisfied with a live node.
 */
function createLightSource(light: LightComponent, worldMatrix: Float32Array): Light {
  const source =
    light.kind === "point"
      ? new PointLight("ECSPointLight")
      : light.kind === "spot"
        ? new SpotLight("ECSSpotLight")
        : new DirectionalLight("ECSDirectionalLight");

  source.visible = true;
  source.color = [...light.color];
  source.castsShadow = light.castsShadow;
  source.layerMask = light.layerMask;
  // Scene light setters validate their inputs; the ECS component does not,
  // so only forward values the setters accept (otherwise keep scene defaults).
  if (Number.isFinite(light.intensity) && light.intensity >= 0) source.intensity = light.intensity;
  if (source instanceof PointLight || source instanceof SpotLight) {
    if (Number.isFinite(light.range) && light.range > 0) source.range = light.range;
  }
  if (source instanceof SpotLight) {
    if (light.angle > 0 && light.angle < Math.PI / 2) source.angle = light.angle;
    if (light.penumbra >= 0 && light.penumbra <= 1) source.penumbra = light.penumbra;
  }

  try {
    source.transform.setFromLocalMatrix([...worldMatrix] as Mat4);
    source.updateWorldTransform();
  } catch {
    // Degenerate (zero-scale) world matrix — leave the source at identity;
    // position/direction on the CollectedLight itself are still correct.
  }

  return source;
}

function getECSCameraPosition(options: ECSRenderSourceOptions): [number, number, number] | undefined {
  const { world, cameraEntity } = options;
  if (!cameraEntity) return undefined;
  if (!safeQueryComponents(world, [CameraComponent, WorldTransformComponent])) return undefined;

  try {
    const cam = world.get(cameraEntity, CameraComponent);
    const wt = world.get(cameraEntity, WorldTransformComponent);
    if (!cam || !wt) return undefined;
    return [wt.worldMatrix[12]!, wt.worldMatrix[13]!, wt.worldMatrix[14]!];
  } catch {
    // Destroyed camera entity (World.get asserts liveness) — no camera position.
    return undefined;
  }
}
