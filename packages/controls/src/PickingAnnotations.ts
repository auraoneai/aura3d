import { Picking, type PickingOptions, type PickingReport, type V5PickResult } from "./Picking";
import { ControlVector3, type ControlObject3DLike, type ControlPickMetadata, type Vector3Like } from "./NativeControlTypes";

export type PickingAnnotationKind = "hotspot" | "label" | "district" | "building" | "robot" | "entity";
export type PickingAnnotationSource = "imported-gltf" | "procedural" | "screen-space";
export type PickingAnnotationHitPolicy = "nearest" | "priority";

export interface PickingAnnotation<TPayload = unknown> {
  readonly id: string;
  readonly label: string;
  readonly kind: PickingAnnotationKind;
  readonly position: Vector3Like | readonly [number, number, number];
  readonly radius: number;
  readonly priority?: number;
  readonly group?: string;
  readonly routeId?: string;
  readonly source?: PickingAnnotationSource;
  readonly selectable?: boolean;
  readonly highlightable?: boolean;
  readonly targetId?: string;
  readonly payload?: TPayload;
}

export interface PickingAnnotationRoot<TPayload = unknown> extends ControlObject3DLike {
  readonly type: "PickingAnnotationRoot";
  readonly name: string;
  readonly children: readonly PickingAnnotationObject<TPayload>[];
}

export interface PickingAnnotationObject<TPayload = unknown> extends ControlObject3DLike {
  readonly type: "PickingAnnotation";
  readonly name: string;
  readonly picking: ControlPickMetadata;
  readonly userData: {
    readonly g3dPicking: ControlPickMetadata;
    readonly g3dPickingAnnotation: PickingAnnotation<TPayload>;
  };
}

export interface PickingAnnotationReport<TPayload = unknown> extends PickingReport {
  readonly annotation: PickingAnnotation<TPayload> | null;
  readonly annotations: readonly PickingAnnotation<TPayload>[];
}

export interface PickingAnnotationOptions extends PickingOptions {
  readonly hitPolicy?: PickingAnnotationHitPolicy;
}

export interface ImportedGlbHotspotDescriptor<TPayload = unknown> {
  readonly id?: string;
  readonly nodeName?: string;
  readonly label?: string;
  readonly focusId?: string;
  readonly position: Vector3Like | readonly [number, number, number];
  readonly radius?: number;
  readonly priority?: number;
  readonly selectable?: boolean;
  readonly highlightable?: boolean;
  readonly payload?: TPayload;
}

export interface DistrictPickingDescriptor<TPayload = unknown> {
  readonly id: string;
  readonly label?: string;
  readonly center: Vector3Like | readonly [number, number, number];
  readonly radius: number;
  readonly priority?: number;
  readonly routeId?: string;
  readonly payload?: TPayload;
  readonly buildings?: readonly BuildingPickingDescriptor<TPayload>[];
}

export interface BuildingPickingDescriptor<TPayload = unknown> {
  readonly id: string;
  readonly label?: string;
  readonly position: Vector3Like | readonly [number, number, number];
  readonly radius: number;
  readonly priority?: number;
  readonly payload?: TPayload;
}

export interface EntityPickingDescriptor<TPayload = unknown> {
  readonly id: string;
  readonly label?: string;
  readonly kind?: "robot" | "entity";
  readonly position: Vector3Like | readonly [number, number, number];
  readonly radius: number;
  readonly priority?: number;
  readonly group?: string;
  readonly routeId?: string;
  readonly payload?: TPayload;
}

export interface ScreenPickingAnnotation<TPayload = unknown> {
  readonly id: string;
  readonly label: string;
  readonly kind: PickingAnnotationKind;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly priority?: number;
  readonly group?: string;
  readonly routeId?: string;
  readonly source?: PickingAnnotationSource;
  readonly selectable?: boolean;
  readonly highlightable?: boolean;
  readonly targetId?: string;
  readonly payload?: TPayload;
}

export interface ScreenPickingHit<TPayload = unknown> {
  readonly annotation: ScreenPickingAnnotation<TPayload>;
  readonly distance: number;
}

export interface ScreenPickingReport<TPayload = unknown> {
  readonly hit: ScreenPickingHit<TPayload> | null;
  readonly hits: readonly ScreenPickingHit<TPayload>[];
  readonly diagnostics: {
    readonly testedAnnotations: number;
    readonly candidateAnnotations: number;
    readonly hitCount: number;
    readonly skippedDisabled: number;
    readonly skippedOutOfRadius: number;
    readonly nearestHitLabel: string | null;
  };
}

export interface ScreenPickingOptions {
  readonly tolerance?: number;
  readonly hitPolicy?: PickingAnnotationHitPolicy;
}

export function createPickingAnnotationRoot<TPayload = unknown>(
  name: string,
  annotations: readonly PickingAnnotation<TPayload>[]
): PickingAnnotationRoot<TPayload> {
  return {
    type: "PickingAnnotationRoot",
    name,
    position: new ControlVector3(),
    children: annotations.map(createPickingAnnotationObject)
  };
}

export function createPickingAnnotationObject<TPayload = unknown>(
  annotation: PickingAnnotation<TPayload>
): PickingAnnotationObject<TPayload> {
  const radius = positiveFinite(annotation.radius, "annotation radius");
  const metadata: ControlPickMetadata = {
    id: annotation.id,
    label: annotation.label,
    kind: annotation.kind,
    group: annotation.group,
    selectable: annotation.selectable,
    highlightable: annotation.highlightable,
    pickRadius: radius,
    priority: annotation.priority,
    routeId: annotation.routeId,
    source: annotation.source,
    targetId: annotation.targetId,
    payload: annotation.payload
  };
  return {
    type: "PickingAnnotation",
    name: annotation.label,
    position: toVector3(annotation.position),
    scale: new ControlVector3(radius * 2, radius * 2, radius * 2),
    visible: annotation.selectable === false ? false : true,
    pickRadius: radius,
    pickPriority: annotation.priority,
    picking: metadata,
    userData: {
      g3dPicking: metadata,
      g3dPickingAnnotation: annotation
    }
  };
}

export function pickAnnotation<TPayload = unknown>(
  root: ControlObject3DLike,
  origin: Vector3Like = new ControlVector3(),
  direction: Vector3Like = new ControlVector3(0, 0, -1),
  options: PickingAnnotationOptions = {}
): PickingAnnotationReport<TPayload> {
  const report = new Picking().report(root, origin, direction, options);
  const hits = options.hitPolicy === "priority"
    ? [...report.hits].sort(compareAnnotationHitsByPriority)
    : report.hits;
  const hit = hits[0] ?? null;
  return {
    ...report,
    hit,
    hits,
    annotation: hit ? annotationFromPickHit<TPayload>(hit) : null,
    annotations: hits.map((candidate) => annotationFromPickHit<TPayload>(candidate)).filter((annotation): annotation is PickingAnnotation<TPayload> => Boolean(annotation))
  };
}

export function annotationFromPickHit<TPayload = unknown>(
  hit: V5PickResult | null | undefined
): PickingAnnotation<TPayload> | null {
  const value = hit?.object.userData?.g3dPickingAnnotation;
  return isPickingAnnotation(value) ? value as PickingAnnotation<TPayload> : null;
}

export function createImportedGlbHotspotAnnotations<TPayload = unknown>(
  assetId: string,
  hotspots: readonly ImportedGlbHotspotDescriptor<TPayload>[],
  routeId?: string
): readonly PickingAnnotation<TPayload>[] {
  return hotspots.map((hotspot, index) => {
    const targetId = hotspot.focusId ?? hotspot.nodeName ?? hotspot.id ?? `hotspot-${index}`;
    return {
      id: hotspot.id ?? `${assetId}:${targetId}`,
      label: hotspot.label ?? readableLabel(targetId),
      kind: "hotspot",
      position: hotspot.position,
      radius: hotspot.radius ?? 0.18,
      priority: hotspot.priority ?? 100,
      group: assetId,
      routeId,
      source: "imported-gltf",
      selectable: hotspot.selectable,
      highlightable: hotspot.highlightable ?? true,
      targetId,
      payload: hotspot.payload
    };
  });
}

export function createDistrictPickingAnnotations<TPayload = unknown>(
  districts: readonly DistrictPickingDescriptor<TPayload>[]
): readonly PickingAnnotation<TPayload>[] {
  const annotations: PickingAnnotation<TPayload>[] = [];
  for (const district of districts) {
    annotations.push({
      id: district.id,
      label: district.label ?? readableLabel(district.id),
      kind: "district",
      position: district.center,
      radius: district.radius,
      priority: district.priority ?? 10,
      group: "district",
      routeId: district.routeId,
      source: "procedural",
      highlightable: true,
      payload: district.payload
    });
    for (const building of district.buildings ?? []) {
      annotations.push({
        id: building.id,
        label: building.label ?? readableLabel(building.id),
        kind: "building",
        position: building.position,
        radius: building.radius,
        priority: building.priority ?? 40,
        group: district.id,
        routeId: district.routeId,
        source: "procedural",
        highlightable: true,
        payload: building.payload
      });
    }
  }
  return annotations;
}

export function createRobotPickingAnnotations<TPayload = unknown>(
  robots: readonly EntityPickingDescriptor<TPayload>[]
): readonly PickingAnnotation<TPayload>[] {
  return createEntityPickingAnnotations(robots.map((robot) => ({ ...robot, kind: "robot" as const })), {
    defaultGroup: "robot",
    defaultPriority: 70
  });
}

export function createEntityPickingAnnotations<TPayload = unknown>(
  entities: readonly EntityPickingDescriptor<TPayload>[],
  options: { readonly defaultGroup?: string; readonly defaultPriority?: number } = {}
): readonly PickingAnnotation<TPayload>[] {
  return entities.map((entity) => ({
    id: entity.id,
    label: entity.label ?? readableLabel(entity.id),
    kind: entity.kind ?? "entity",
    position: entity.position,
    radius: entity.radius,
    priority: entity.priority ?? options.defaultPriority ?? 50,
    group: entity.group ?? options.defaultGroup,
    routeId: entity.routeId,
    source: "procedural",
    highlightable: true,
    targetId: entity.id,
    payload: entity.payload
  }));
}

export function pickScreenSpaceAnnotation<TPayload = unknown>(
  pointer: { readonly x: number; readonly y: number },
  annotations: readonly ScreenPickingAnnotation<TPayload>[],
  options: ScreenPickingOptions = {}
): ScreenPickingReport<TPayload> {
  validateScreenPoint(pointer, "pointer");
  const tolerance = options.tolerance ?? 0;
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError("Screen picking tolerance must be finite and non-negative.");
  const hits: ScreenPickingHit<TPayload>[] = [];
  let skippedDisabled = 0;
  let skippedOutOfRadius = 0;

  for (const annotation of annotations) {
    if (annotation.selectable === false) {
      skippedDisabled += 1;
      continue;
    }
    validateScreenPoint(annotation, annotation.id);
    const radius = positiveFinite(annotation.radius, `${annotation.id} screen radius`) + tolerance;
    const distance = Math.hypot(pointer.x - annotation.x, pointer.y - annotation.y);
    if (distance > radius) {
      skippedOutOfRadius += 1;
      continue;
    }
    hits.push({ annotation, distance });
  }

  hits.sort(options.hitPolicy === "priority" ? compareScreenHitsByPriority : compareScreenHitsByDistance);
  const hit = hits[0] ?? null;
  return {
    hit,
    hits,
    diagnostics: {
      testedAnnotations: annotations.length,
      candidateAnnotations: annotations.length - skippedDisabled,
      hitCount: hits.length,
      skippedDisabled,
      skippedOutOfRadius,
      nearestHitLabel: hit?.annotation.label ?? null
    }
  };
}

function toVector3(value: Vector3Like | readonly [number, number, number]): ControlVector3 {
  const tuple = value as readonly number[];
  const vector = value as Vector3Like;
  const x = Array.isArray(value) ? tuple[0] : vector.x;
  const y = Array.isArray(value) ? tuple[1] : vector.y;
  const z = Array.isArray(value) ? tuple[2] : vector.z;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new RangeError("Picking annotation position must contain three finite values.");
  }
  return new ControlVector3(x, y, z);
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Picking ${label} must be finite and positive.`);
  return value;
}

function readableLabel(value: string): string {
  return value.replace(/[_:-]+/g, " ").replace(/\s+/g, " ").trim() || "Picking target";
}

function compareAnnotationHitsByPriority(left: V5PickResult, right: V5PickResult): number {
  const priorityDelta = (right.metadata?.priority ?? 0) - (left.metadata?.priority ?? 0);
  if (Math.abs(priorityDelta) > 1e-8) return priorityDelta;
  return left.distance - right.distance;
}

function isPickingAnnotation(value: unknown): value is PickingAnnotation {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as { readonly id?: unknown }).id === "string"
    && typeof (value as { readonly label?: unknown }).label === "string";
}

function validateScreenPoint(point: { readonly x: number; readonly y: number }, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`Screen picking ${label} must contain finite x/y values.`);
  }
}

function compareScreenHitsByDistance(left: ScreenPickingHit, right: ScreenPickingHit): number {
  const distanceDelta = left.distance - right.distance;
  if (Math.abs(distanceDelta) > 1e-8) return distanceDelta;
  return (right.annotation.priority ?? 0) - (left.annotation.priority ?? 0);
}

function compareScreenHitsByPriority(left: ScreenPickingHit, right: ScreenPickingHit): number {
  const priorityDelta = (right.annotation.priority ?? 0) - (left.annotation.priority ?? 0);
  if (Math.abs(priorityDelta) > 1e-8) return priorityDelta;
  return left.distance - right.distance;
}
