export type VisualVector3 = readonly [number, number, number] | {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
};

export type VisualInputSet = readonly string[] | Readonly<Record<string, boolean>>;

export type VisualStateCollection<T extends { readonly id: string }> =
  | readonly T[]
  | Readonly<Record<string, T>>;

export interface VisualRuntimeNodeState {
  readonly id: string;
  readonly position?: VisualVector3;
  readonly rotation?: VisualVector3;
  readonly scale?: VisualVector3;
  readonly visible?: boolean;
  readonly material?: Readonly<Record<string, unknown>>;
  readonly morphTargets?: Readonly<Record<string, number>>;
  readonly tags?: readonly string[];
}

export interface VisualInputSnapshot {
  readonly pressed?: VisualInputSet;
  readonly held?: VisualInputSet;
  readonly released?: VisualInputSet;
  readonly buffered?: VisualInputSet;
  readonly combos?: VisualInputSet;
  readonly axes?: Readonly<Record<string, number>>;
}

export interface VisualAnimationEvent {
  readonly id?: string;
  readonly type: string;
  readonly controllerId?: string;
  readonly clip?: string;
  readonly time?: number;
  readonly bone?: string;
  readonly payload?: unknown;
}

export interface VisualAnimationControllerState {
  readonly id: string;
  readonly nodeId?: string;
  readonly currentClip?: string;
  readonly clipTime?: number;
  readonly clips?: readonly string[];
  readonly layers?: Readonly<Record<string, number>>;
  readonly morphTargets?: readonly string[];
  readonly events?: readonly VisualAnimationEvent[];
}

export interface VisualPhysicsBodyState {
  readonly id: string;
  readonly position?: VisualVector3;
  readonly velocity?: VisualVector3;
  readonly grounded?: boolean;
}

export interface VisualCollisionEvent {
  readonly id?: string;
  readonly type: "enter" | "exit";
  readonly bodyId?: string;
  readonly otherBodyId?: string;
  readonly point?: VisualVector3;
  readonly normal?: VisualVector3;
  readonly payload?: unknown;
}

export interface VisualRaycastHit {
  readonly id: string;
  readonly hit: boolean;
  readonly bodyId?: string;
  readonly point?: VisualVector3;
  readonly normal?: VisualVector3;
  readonly distance?: number;
}

export interface VisualOverlapResult {
  readonly id: string;
  readonly bodyIds: readonly string[];
}

export interface VisualCombatEvent {
  readonly id?: string;
  readonly type: "hit" | "blocked" | "damage" | "knockback";
  readonly actorId?: string;
  readonly targetId?: string;
  readonly hitboxId?: string;
  readonly amount?: number;
  readonly payload?: unknown;
}

export interface VisualCameraState {
  readonly id?: string;
  readonly position?: VisualVector3;
  readonly targetIds?: readonly string[];
}

export interface VisualGraphExecutionContext {
  readonly frame?: number;
  readonly time?: number;
  readonly dt?: number;
  readonly runtimeNodes?: VisualStateCollection<VisualRuntimeNodeState>;
  readonly input?: VisualInputSnapshot;
  readonly animationControllers?: VisualStateCollection<VisualAnimationControllerState>;
  readonly animationEvents?: readonly VisualAnimationEvent[];
  readonly physicsBodies?: VisualStateCollection<VisualPhysicsBodyState>;
  readonly collisionEvents?: readonly VisualCollisionEvent[];
  readonly raycastHits?: VisualStateCollection<VisualRaycastHit>;
  readonly overlaps?: VisualStateCollection<VisualOverlapResult>;
  readonly combatEvents?: readonly VisualCombatEvent[];
  readonly camera?: VisualCameraState;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

export interface VisualGraphValidationOptions {
  readonly context?: VisualGraphExecutionContext;
  readonly strictReferences?: boolean;
  readonly allowCycles?: boolean;
}

export interface VisualGraphSideEffect {
  readonly kind: string;
  readonly nodeId: string;
  readonly target?: string;
  readonly frame?: number;
  readonly time?: number;
  readonly payload: unknown;
}

export interface VisualGraphDiagnostic {
  readonly level: "info" | "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly nodeId?: string;
}
