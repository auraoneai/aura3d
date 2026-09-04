/**
 * muse3jsparity-PRD P2 — root `instances.model()` wiring source (package side).
 *
 * Closes the primitive-only instancing gap from the root-facing side WITHOUT
 * touching `packages/engine/src/agent-api/index.ts` (HARD RULE) and WITHOUT
 * touching the D1 owner (`packages/rendering/src/Instancing*.ts` — a sibling
 * owns it; the joint is reported, not edited).
 *
 * Split of responsibilities:
 * - THIS module: root-facing validation + node shape + draw-class math +
 *   fail-closed D1 warning (the 4096-draw footgun must be impossible to hit
 *   silently from root, so a non-instancing-aware material yields an
 *   N-draw estimate AND a `material-rejects-instancing` warning).
 * - D1 sibling (`@aura3d/rendering` Instancing/InstancingDiagnostics):
 *   one-draw execution, per-instance attributes, BatchedMesh-equivalent
 *   consolidation, device-limit fallback at mount.
 *
 * Root wiring is a hunk in agent-api (reported, not applied):
 * 1. Extend `AuraModelNode` with `instances?`, `instanceColors?`,
 *    `instanceLod?` (same shapes as `AuraPrimitiveNode`).
 * 2. Add `instances.model(asset, { transforms, colors?, lod?, material })`
 *    delegating to `createInstancedModelNode`, passing the D1
 *    instancing-aware flag from the material registry.
 * 3. Production mount (`:12703`/`:13246` area) consumes `node.instances`
 *    on model nodes exactly like primitive nodes.
 */

export type InstancedModelVec3 = readonly [number, number, number];

export interface InstancedModelTransform {
  readonly position?: InstancedModelVec3;
  readonly rotation?: InstancedModelVec3;
  readonly scale?: InstancedModelVec3 | number;
}

export type InstancedModelColor = string | readonly [number, number, number];

export interface InstancedModelLodLevel {
  /** Switch past this distance (world units); must ascend. */
  readonly maxDistance: number;
}

export interface InstancedModelLod {
  readonly levels: readonly InstancedModelLodLevel[];
  readonly hysteresis?: number;
}

export interface InstancedModelOptions<TAsset> {
  readonly asset: TAsset;
  readonly name?: string;
  readonly transforms: readonly InstancedModelTransform[];
  readonly colors?: readonly InstancedModelColor[];
  readonly materialName?: string;
  /**
   * D1 joint: the bridge sets this from the instancing-aware material
   * registry. Defaults false (fail-closed): an unknown material warns
   * instead of silently expanding to N draws.
   */
  readonly materialInstancingAware?: boolean;
  readonly lod?: InstancedModelLod;
  readonly maxInstancesPerDraw?: number;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

export interface InstancedModelNode<TAsset> {
  readonly kind: "model";
  readonly asset: TAsset;
  readonly name?: string;
  readonly instances: readonly InstancedModelTransform[];
  readonly instanceColors?: readonly InstancedModelColor[];
  /**
   * P2 LOD (muse3jsparity-PRD): recorded declarative input — validated
   * ascending here, consumed by the host/D1 pass. The production mount
   * attaches every instance each frame; per-instance LOD switching is NOT
   * applied at mount yet, so a level list never silently changes the draw.
   */
  readonly instanceLod?: InstancedModelLod;
  /**
   * P2 culling telemetry (muse3jsparity-PRD): centroid + bounding radius over
   * instance positions, stamped on the node so diagnostics and the host
   * frustum pass consume the same input the mount draws.
   */
  readonly instanceCulling: InstancedModelCullingTelemetry;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  readonly visible: boolean;
}

export interface InstancedModelFallbackWarning {
  readonly material: string;
  readonly requestedInstances: number;
  readonly drawnBatches: number;
  readonly reason: "material-rejects-instancing";
  readonly diagnostic: string;
}

export interface InstancedModelCullingTelemetry {
  readonly instanceCount: number;
  readonly centroid: InstancedModelVec3;
  readonly boundingRadius: number;
  /** Host frustum pass owns actual culling; this is the input it consumes. */
  readonly cullable: true;
}

export interface InstancedModelDiagnostics {
  readonly instanceCount: number;
  readonly estimatedDrawCallsWithoutInstancing: number;
  readonly estimatedDrawCallsWithInstancing: number;
  readonly oneDrawClass: boolean;
  readonly fallbackWarning?: InstancedModelFallbackWarning;
  readonly lodLevels: number;
  readonly lodHysteresis: number;
  readonly culling: InstancedModelCullingTelemetry;
}

export interface InstancedModelResult<TAsset> {
  readonly node: InstancedModelNode<TAsset>;
  readonly diagnostics: InstancedModelDiagnostics;
}

const DEFAULT_MAX_INSTANCES_PER_DRAW = 4096;

export function createInstancedModelNode<TAsset>(options: InstancedModelOptions<TAsset>): InstancedModelResult<TAsset> {
  if (options.transforms.length === 0) {
    throw new Error("Aura3D instanced models require at least one transform.");
  }
  if (options.colors && options.colors.length !== options.transforms.length) {
    throw new Error("Aura3D instanced-model color count must match transform count.");
  }
  const lodLevels = options.lod?.levels ?? [];
  for (let i = 1; i < lodLevels.length; i += 1) {
    if ((lodLevels[i]?.maxDistance ?? 0) <= (lodLevels[i - 1]?.maxDistance ?? 0)) {
      throw new Error("Aura3D instanced-model LOD maxDistance levels must ascend.");
    }
  }
  const maxPerDraw = options.maxInstancesPerDraw ?? DEFAULT_MAX_INSTANCES_PER_DRAW;
  if (!Number.isInteger(maxPerDraw) || maxPerDraw <= 0) {
    throw new RangeError("Aura3D instanced-model maxInstancesPerDraw must be a positive integer.");
  }

  const aware = options.materialInstancingAware === true;
  const count = options.transforms.length;
  const withInstancing = Math.ceil(count / maxPerDraw);
  const material = options.materialName ?? "unknown-material";
  const fallbackWarning: InstancedModelFallbackWarning | undefined = aware
    ? undefined
    : {
      material,
      requestedInstances: count,
      drawnBatches: count,
      reason: "material-rejects-instancing",
      diagnostic:
        `Instancing fallback for material "${material}": ` +
        `${count} instances expanded to ${count} draws (material-rejects-instancing). ` +
        `Use an instancing-aware material or instances.model will not reach 1-draw class.`
    };

  const culling = computeCullingTelemetry(options.transforms);
  const node: InstancedModelNode<TAsset> = {
    kind: "model",
    asset: options.asset,
    ...(options.name !== undefined ? { name: options.name } : {}),
    instances: [...options.transforms],
    ...(options.colors ? { instanceColors: [...options.colors] } : {}),
    ...(options.lod ? { instanceLod: { levels: [...options.lod.levels], ...(options.lod.hysteresis !== undefined ? { hysteresis: options.lod.hysteresis } : {}) } } : {}),
    instanceCulling: culling,
    castShadow: options.castShadow ?? true,
    receiveShadow: options.receiveShadow ?? true,
    visible: true
  };

  return {
    node,
    diagnostics: {
      instanceCount: count,
      estimatedDrawCallsWithoutInstancing: count,
      estimatedDrawCallsWithInstancing: aware ? withInstancing : count,
      oneDrawClass: aware && withInstancing === 1,
      ...(fallbackWarning ? { fallbackWarning } : {}),
      lodLevels: lodLevels.length,
      lodHysteresis: options.lod?.hysteresis ?? 0,
      culling
    }
  };
}

function computeCullingTelemetry(transforms: readonly InstancedModelTransform[]): InstancedModelCullingTelemetry {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const positions: InstancedModelVec3[] = transforms.map((transform) => transform.position ?? [0, 0, 0]);
  for (const position of positions) {
    cx += position[0] ?? 0;
    cy += position[1] ?? 0;
    cz += position[2] ?? 0;
  }
  const count = positions.length;
  const centroid: InstancedModelVec3 = [cx / count, cy / count, cz / count];
  let radius = 0;
  for (const position of positions) {
    const distance = Math.hypot((position[0] ?? 0) - centroid[0], (position[1] ?? 0) - centroid[1], (position[2] ?? 0) - centroid[2]);
    if (distance > radius) radius = distance;
  }
  return { instanceCount: count, centroid, boundingRadius: radius, cullable: true };
}
