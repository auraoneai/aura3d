import { Box3, Ray, Vector3 } from "@aura3d/math";
import { Geometry } from "./Geometry";
import { MAX_GPU_INSTANCES, type RenderItem, type RenderMaterial } from "./ForwardPass";

export interface LodLevel {
  readonly name: string;
  readonly geometry: Geometry;
  readonly material?: RenderMaterial;
  readonly maxDistance?: number;
  readonly minScreenSize?: number;
}

export interface LodSelectionInput {
  readonly distance: number;
  readonly screenSize: number;
  readonly levels: readonly LodLevel[];
}

export interface LodSelection {
  readonly level: LodLevel;
  readonly levelIndex: number;
  readonly reason: "distance" | "screen-size" | "fallback";
}

export interface StaticBatchInput {
  readonly geometry: Geometry;
  readonly material: RenderMaterial;
  readonly modelMatrix: Float32Array | readonly number[];
  readonly batchKey: string;
  readonly label?: string;
}

export interface StaticBatchOptions {
  readonly maxInstancesPerBatch?: number;
  readonly labelPrefix?: string;
}

export interface StaticBatchResult {
  readonly renderItems: readonly RenderItem[];
  readonly logicalItems: number;
  readonly submittedItems: number;
  readonly batches: number;
  readonly unbatchedItems: number;
  readonly maxInstancesPerBatch: number;
  readonly drawCallReduction: number;
}

export interface StaticSpatialItem<T = unknown> {
  readonly id: string;
  readonly bounds: StaticSpatialBounds;
  readonly payload?: T;
}

export interface StaticSpatialBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface StaticBoundsIntersector {
  intersectsBox(box: Box3): boolean;
}

export interface StaticBoundsBvhOptions {
  readonly maxLeafSize?: number;
  readonly maxDepth?: number;
}

export interface StaticBoundsBvh<T = unknown> {
  readonly root: StaticBoundsBvhNode;
  readonly items: readonly StaticSpatialItem<T>[];
  readonly diagnostics: StaticBoundsBvhBuildDiagnostics;
}

export interface StaticBoundsBvhNode {
  readonly id: number;
  readonly bounds: StaticSpatialBounds;
  readonly depth: number;
  readonly itemCount: number;
  readonly itemIndices?: readonly number[];
  readonly left?: StaticBoundsBvhNode;
  readonly right?: StaticBoundsBvhNode;
}

export interface StaticBoundsBvhBuildDiagnostics {
  readonly objectCount: number;
  readonly bvhNodes: number;
  readonly leafNodes: number;
  readonly maxDepth: number;
  readonly buildTimeMs: number;
}

export interface StaticBoundsBvhQueryOptions {
  readonly bounds?: StaticSpatialBounds;
  readonly frustum?: StaticBoundsIntersector;
}

export interface StaticBoundsBvhQueryResult<T = unknown> {
  readonly items: readonly StaticSpatialItem<T>[];
  readonly diagnostics: StaticBoundsBvhTraversalDiagnostics;
}

export interface StaticBoundsBvhTraversalDiagnostics {
  readonly totalObjects: number;
  readonly visibleObjects: number;
  readonly culledObjects: number;
  readonly bvhNodes: number;
  readonly visitedNodes: number;
  readonly rejectedNodes: number;
  readonly boundsTests: number;
  readonly leafTests: number;
  readonly traversalTimeMs: number;
}

export interface StaticBoundsBvhUpdateResult<T = unknown> {
  readonly bvh: StaticBoundsBvh<T>;
  readonly updatedObjects: number;
  readonly strategy: "rebuild";
}

export interface StaticBoundsBvhRaycastHit<T = unknown> {
  readonly item: StaticSpatialItem<T>;
  readonly distance: number;
  readonly point: readonly [number, number, number];
}

export interface StaticBoundsBvhRaycastResult<T = unknown> {
  readonly hits: readonly StaticBoundsBvhRaycastHit<T>[];
  readonly diagnostics: StaticBoundsBvhRaycastDiagnostics;
}

export interface StaticBoundsBvhRaycastDiagnostics {
  readonly totalObjects: number;
  readonly hitObjects: number;
  readonly bvhNodes: number;
  readonly visitedNodes: number;
  readonly rejectedNodes: number;
  readonly boundsTests: number;
  readonly leafTests: number;
  readonly traversalTimeMs: number;
}

export function selectLodLevel(input: LodSelectionInput): LodSelection {
  if (input.levels.length === 0) {
    throw new Error("LOD selection requires at least one level.");
  }
  if (!Number.isFinite(input.distance) || input.distance < 0) {
    throw new Error("LOD distance must be finite and non-negative.");
  }
  if (!Number.isFinite(input.screenSize) || input.screenSize < 0) {
    throw new Error("LOD screen size must be finite and non-negative.");
  }

  for (let index = 0; index < input.levels.length; index += 1) {
    const level = input.levels[index]!;
    if (level.maxDistance !== undefined && input.distance <= level.maxDistance) {
      return { level, levelIndex: index, reason: "distance" };
    }
    if (level.minScreenSize !== undefined && input.screenSize >= level.minScreenSize) {
      return { level, levelIndex: index, reason: "screen-size" };
    }
  }

  const levelIndex = input.levels.length - 1;
  return { level: input.levels[levelIndex]!, levelIndex, reason: "fallback" };
}

export function batchStaticRenderItems(items: readonly StaticBatchInput[], options: StaticBatchOptions = {}): StaticBatchResult {
  const maxInstancesPerBatch = options.maxInstancesPerBatch ?? MAX_GPU_INSTANCES;
  if (!Number.isInteger(maxInstancesPerBatch) || maxInstancesPerBatch <= 0 || maxInstancesPerBatch > MAX_GPU_INSTANCES) {
    throw new Error(`Static batch maxInstancesPerBatch must be an integer in [1, ${MAX_GPU_INSTANCES}].`);
  }

  const groups = new Map<string, StaticBatchInput[]>();
  for (const item of items) {
    const matrix = Array.from(item.modelMatrix);
    if (matrix.length !== 16 || !matrix.every(Number.isFinite)) {
      throw new Error(`Static batch item ${item.label ?? item.batchKey} must provide a finite mat4 modelMatrix.`);
    }
    const group = groups.get(item.batchKey);
    if (group) {
      group.push(item);
    } else {
      groups.set(item.batchKey, [item]);
    }
  }

  const renderItems: RenderItem[] = [];
  let unbatchedItems = 0;
  const labelPrefix = options.labelPrefix ?? "static-batch";

  for (const [batchKey, group] of groups) {
    for (let start = 0; start < group.length; start += maxInstancesPerBatch) {
      const chunk = group.slice(start, start + maxInstancesPerBatch);
      if (chunk.length === 1) {
        const item = chunk[0]!;
        renderItems.push({
          geometry: item.geometry,
          material: item.material,
          modelMatrix: item.modelMatrix,
          label: item.label ?? `${labelPrefix}-${batchKey}-${start}`
        });
        unbatchedItems += 1;
        continue;
      }

      const transforms = new Float32Array(chunk.length * 16);
      for (let index = 0; index < chunk.length; index += 1) {
        transforms.set(Array.from(chunk[index]!.modelMatrix), index * 16);
      }
      renderItems.push({
        geometry: chunk[0]!.geometry,
        material: chunk[0]!.material,
        modelMatrix: identityMatrix(),
        instanceTransforms: transforms,
        label: `${labelPrefix}-${batchKey}-${Math.floor(start / maxInstancesPerBatch)}`
      });
    }
  }

  return {
    renderItems,
    logicalItems: items.length,
    submittedItems: renderItems.length,
    batches: renderItems.length - unbatchedItems,
    unbatchedItems,
    maxInstancesPerBatch,
    drawCallReduction: items.length - renderItems.length
  };
}

export function buildStaticBoundsBvh<T = unknown>(
  items: readonly StaticSpatialItem<T>[],
  options: StaticBoundsBvhOptions = {}
): StaticBoundsBvh<T> {
  const startedAt = performanceNow();
  const maxLeafSize = options.maxLeafSize ?? 8;
  const maxDepth = options.maxDepth ?? 32;
  if (!Number.isInteger(maxLeafSize) || maxLeafSize <= 0) {
    throw new Error("Static bounds BVH maxLeafSize must be a positive integer.");
  }
  if (!Number.isInteger(maxDepth) || maxDepth <= 0) {
    throw new Error("Static bounds BVH maxDepth must be a positive integer.");
  }
  if (items.length === 0) {
    throw new Error("Static bounds BVH requires at least one item.");
  }

  const copiedItems = items.map((item, index) => validateSpatialItem(item, index));
  let nextNodeId = 1;
  let nodeCount = 0;
  let leafCount = 0;
  let deepest = 0;

  const buildNode = (indices: readonly number[], depth: number): StaticBoundsBvhNode => {
    nodeCount += 1;
    deepest = Math.max(deepest, depth);
    const bounds = mergeStaticBounds(indices.map((index) => copiedItems[index]!.bounds));
    if (indices.length <= maxLeafSize || depth >= maxDepth) {
      leafCount += 1;
      return {
        id: nextNodeId++,
        bounds,
        depth,
        itemCount: indices.length,
        itemIndices: [...indices]
      };
    }

    const axis = longestBoundsAxis(bounds);
    const sorted = [...indices].sort((a, b) => boundsCenter(copiedItems[a]!.bounds, axis) - boundsCenter(copiedItems[b]!.bounds, axis));
    const split = Math.max(1, Math.floor(sorted.length / 2));
    const left = buildNode(sorted.slice(0, split), depth + 1);
    const right = buildNode(sorted.slice(split), depth + 1);
    return {
      id: nextNodeId++,
      bounds,
      depth,
      itemCount: indices.length,
      left,
      right
    };
  };

  const root = buildNode(copiedItems.map((_, index) => index), 0);
  return {
    root,
    items: copiedItems,
    diagnostics: {
      objectCount: copiedItems.length,
      bvhNodes: nodeCount,
      leafNodes: leafCount,
      maxDepth: deepest,
      buildTimeMs: performanceNow() - startedAt
    }
  };
}

export function queryStaticBoundsBvh<T = unknown>(
  bvh: StaticBoundsBvh<T>,
  options: StaticBoundsBvhQueryOptions = {}
): StaticBoundsBvhQueryResult<T> {
  const startedAt = performanceNow();
  const queryBounds = options.bounds ? validateBounds(options.bounds, "query bounds") : undefined;
  const result: StaticSpatialItem<T>[] = [];
  let visitedNodes = 0;
  let rejectedNodes = 0;
  let boundsTests = 0;
  let leafTests = 0;
  let culledObjects = 0;

  const intersects = (bounds: StaticSpatialBounds): boolean => {
    boundsTests += 1;
    if (queryBounds && !boundsIntersect(bounds, queryBounds)) return false;
    if (options.frustum && !options.frustum.intersectsBox(toBox3(bounds))) return false;
    return true;
  };

  const visit = (node: StaticBoundsBvhNode): void => {
    visitedNodes += 1;
    if (!intersects(node.bounds)) {
      rejectedNodes += 1;
      culledObjects += node.itemCount;
      return;
    }
    if (node.itemIndices) {
      for (const index of node.itemIndices) {
        leafTests += 1;
        const item = bvh.items[index]!;
        if (intersects(item.bounds)) {
          result.push(item);
        } else {
          culledObjects += 1;
        }
      }
      return;
    }
    if (node.left) visit(node.left);
    if (node.right) visit(node.right);
  };

  visit(bvh.root);
  return {
    items: result,
    diagnostics: {
      totalObjects: bvh.items.length,
      visibleObjects: result.length,
      culledObjects,
      bvhNodes: bvh.diagnostics.bvhNodes,
      visitedNodes,
      rejectedNodes,
      boundsTests,
      leafTests,
      traversalTimeMs: performanceNow() - startedAt
    }
  };
}

export function updateStaticBoundsBvh<T = unknown>(
  bvh: StaticBoundsBvh<T>,
  updatedItems: readonly StaticSpatialItem<T>[],
  options: StaticBoundsBvhOptions = {}
): StaticBoundsBvhUpdateResult<T> {
  return {
    bvh: buildStaticBoundsBvh(updatedItems, options),
    updatedObjects: countUpdatedSpatialItems(bvh.items, updatedItems),
    strategy: "rebuild"
  };
}

export function raycastStaticBoundsBvh<T = unknown>(
  bvh: StaticBoundsBvh<T>,
  ray: Ray
): StaticBoundsBvhRaycastResult<T> {
  const startedAt = performanceNow();
  const hits: StaticBoundsBvhRaycastHit<T>[] = [];
  let visitedNodes = 0;
  let rejectedNodes = 0;
  let boundsTests = 0;
  let leafTests = 0;

  const intersectBounds = (bounds: StaticSpatialBounds): { readonly distance: number; readonly point: readonly [number, number, number] } | undefined => {
    boundsTests += 1;
    const point = ray.intersectBox(toBox3(bounds));
    if (!point) return undefined;
    return { distance: point.distanceTo(ray.origin), point: point.toArray() };
  };

  const visit = (node: StaticBoundsBvhNode): void => {
    visitedNodes += 1;
    if (!intersectBounds(node.bounds)) {
      rejectedNodes += 1;
      return;
    }
    if (node.itemIndices) {
      for (const index of node.itemIndices) {
        leafTests += 1;
        const item = bvh.items[index]!;
        const hit = intersectBounds(item.bounds);
        if (hit) {
          hits.push({ item, distance: hit.distance, point: hit.point });
        }
      }
      return;
    }
    if (node.left) visit(node.left);
    if (node.right) visit(node.right);
  };

  visit(bvh.root);
  hits.sort((a, b) => a.distance - b.distance);
  return {
    hits,
    diagnostics: {
      totalObjects: bvh.items.length,
      hitObjects: hits.length,
      bvhNodes: bvh.diagnostics.bvhNodes,
      visitedNodes,
      rejectedNodes,
      boundsTests,
      leafTests,
      traversalTimeMs: performanceNow() - startedAt
    }
  };
}

function identityMatrix(): readonly number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
}

function validateSpatialItem<T>(item: StaticSpatialItem<T>, index: number): StaticSpatialItem<T> {
  if (!item.id) {
    throw new Error(`Static bounds BVH item ${index} requires an id.`);
  }
  return {
    ...item,
    bounds: validateBounds(item.bounds, item.id)
  };
}

function validateBounds(bounds: StaticSpatialBounds, label: string): StaticSpatialBounds {
  const values = [...bounds.min, ...bounds.max];
  if (bounds.min.length !== 3 || bounds.max.length !== 3 || !values.every(Number.isFinite)) {
    throw new Error(`Static bounds BVH ${label} bounds must contain finite min/max vec3 values.`);
  }
  if (bounds.max[0] < bounds.min[0] || bounds.max[1] < bounds.min[1] || bounds.max[2] < bounds.min[2]) {
    throw new Error(`Static bounds BVH ${label} bounds max must be greater than or equal to min.`);
  }
  return {
    min: [bounds.min[0], bounds.min[1], bounds.min[2]],
    max: [bounds.max[0], bounds.max[1], bounds.max[2]]
  };
}

function mergeStaticBounds(bounds: readonly StaticSpatialBounds[]): StaticSpatialBounds {
  const merged = bounds.reduce((box, current) => box.union(toBox3(current)), new Box3());
  return fromBox3(merged);
}

function boundsIntersect(a: StaticSpatialBounds, b: StaticSpatialBounds): boolean {
  return !(b.max[0] < a.min[0] || b.min[0] > a.max[0] ||
    b.max[1] < a.min[1] || b.min[1] > a.max[1] ||
    b.max[2] < a.min[2] || b.min[2] > a.max[2]);
}

function longestBoundsAxis(bounds: StaticSpatialBounds): 0 | 1 | 2 {
  const sizes = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2]
  ];
  if (sizes[1]! >= sizes[0]! && sizes[1]! >= sizes[2]!) return 1;
  if (sizes[2]! >= sizes[0]! && sizes[2]! >= sizes[1]!) return 2;
  return 0;
}

function boundsCenter(bounds: StaticSpatialBounds, axis: 0 | 1 | 2): number {
  return (bounds.min[axis] + bounds.max[axis]) / 2;
}

function toBox3(bounds: StaticSpatialBounds): Box3 {
  return new Box3(
    new Vector3(bounds.min[0], bounds.min[1], bounds.min[2]),
    new Vector3(bounds.max[0], bounds.max[1], bounds.max[2])
  );
}

function fromBox3(box: Box3): StaticSpatialBounds {
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z]
  };
}

function countUpdatedSpatialItems<T>(previous: readonly StaticSpatialItem<T>[], next: readonly StaticSpatialItem<T>[]): number {
  const previousById = new Map(previous.map((item) => [item.id, item.bounds] as const));
  let changed = 0;
  for (const item of next) {
    const oldBounds = previousById.get(item.id);
    if (!oldBounds || !sameBounds(oldBounds, item.bounds)) {
      changed += 1;
    }
  }
  return changed;
}

function sameBounds(a: StaticSpatialBounds, b: StaticSpatialBounds): boolean {
  return a.min[0] === b.min[0] && a.min[1] === b.min[1] && a.min[2] === b.min[2] &&
    a.max[0] === b.max[0] && a.max[1] === b.max[1] && a.max[2] === b.max[2];
}

function performanceNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
