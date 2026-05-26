import { InputSnapshot } from "@aura3d/input";
import { FlyControls } from "./FlyControls";
import { OrbitControls } from "./OrbitControls";
import { Picking, type PickingOptions, type PickingReport, type V5PickResult } from "./Picking";
import { ControlVector3, type ControlObject3DLike, type Vector3Like } from "./NativeControlTypes";

export type InteractionControlMode = "orbit" | "fly";
export type InteractionControlsEventType =
  | "mode-change"
  | "hover-enter"
  | "hover-exit"
  | "pick"
  | "hotspot-click";

export interface InteractionRay {
  readonly origin: Vector3Like;
  readonly direction: Vector3Like;
}

export type InteractionRayProvider = (snapshot: InputSnapshot) => InteractionRay;
export type InteractionRootProvider = () => ControlObject3DLike | undefined;
export type InteractionControlsListener = (event: InteractionControlsEvent) => void;
export type HotspotHandler = (event: InteractionControlsEvent & { readonly hit: V5PickResult }) => void;

export interface InteractionControlsOptions {
  readonly mode?: InteractionControlMode;
  readonly orbit?: OrbitControls;
  readonly fly?: FlyControls;
  readonly picking?: Picking;
  readonly root?: ControlObject3DLike | InteractionRootProvider;
  readonly rayProvider?: InteractionRayProvider;
  readonly pickOptions?: PickingOptions;
  readonly rotateButton?: number;
  readonly panButton?: number;
  readonly rotateSpeed?: number;
  readonly panSpeed?: number;
  readonly dollySpeed?: number;
  readonly flyMoveSpeed?: number;
}

export interface InteractionControlsEvent {
  readonly type: InteractionControlsEventType;
  readonly mode: InteractionControlMode;
  readonly snapshot: InputSnapshot;
  readonly hit?: V5PickResult;
  readonly previousHit?: V5PickResult;
}

export interface InteractionControlsUpdate {
  readonly mode: InteractionControlMode;
  readonly pickReport?: PickingReport;
  readonly hit: V5PickResult | null;
}

export class InteractionControls {
  readonly orbit: OrbitControls;
  readonly fly: FlyControls;
  readonly picking: Picking;

  enabled = true;

  private controlMode: InteractionControlMode;
  private rootRef?: ControlObject3DLike | InteractionRootProvider;
  private rayProvider?: InteractionRayProvider;
  private pickOptions: PickingOptions;
  private readonly listeners = new Set<InteractionControlsListener>();
  private readonly hotspotHandlers = new Map<string, Set<HotspotHandler>>();
  private hoverHit: V5PickResult | null = null;
  private disposed = false;

  private readonly rotateButton: number;
  private readonly panButton: number;
  private readonly rotateSpeed: number;
  private readonly panSpeed: number;
  private readonly dollySpeed: number;
  private readonly flyMoveSpeed: number;

  constructor(options: InteractionControlsOptions = {}) {
    this.orbit = options.orbit ?? new OrbitControls();
    this.fly = options.fly ?? new FlyControls();
    this.picking = options.picking ?? new Picking();
    this.controlMode = options.mode ?? "orbit";
    this.rootRef = options.root;
    this.rayProvider = options.rayProvider;
    this.pickOptions = options.pickOptions ?? {};
    this.rotateButton = options.rotateButton ?? 0;
    this.panButton = options.panButton ?? 1;
    this.rotateSpeed = options.rotateSpeed ?? 0.005;
    this.panSpeed = options.panSpeed ?? 0.01;
    this.dollySpeed = options.dollySpeed ?? 0.001;
    this.flyMoveSpeed = options.flyMoveSpeed ?? 1;
  }

  get mode(): InteractionControlMode {
    return this.controlMode;
  }

  setMode(mode: InteractionControlMode, snapshot = new InputSnapshot()): void {
    if (this.controlMode === mode) return;
    this.controlMode = mode;
    this.emit({ type: "mode-change", mode, snapshot });
  }

  setRoot(root: ControlObject3DLike | InteractionRootProvider | undefined): void {
    this.rootRef = root;
    this.hoverHit = null;
  }

  setRayProvider(provider: InteractionRayProvider | undefined): void {
    this.rayProvider = provider;
  }

  setPickOptions(options: PickingOptions): void {
    this.pickOptions = options;
  }

  subscribe(listener: InteractionControlsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onHotspot(id: string, handler: HotspotHandler): () => void {
    const handlers = this.hotspotHandlers.get(id) ?? new Set<HotspotHandler>();
    handlers.add(handler);
    this.hotspotHandlers.set(id, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.hotspotHandlers.delete(id);
    };
  }

  update(snapshot: InputSnapshot): InteractionControlsUpdate {
    if (this.disposed || !this.enabled) {
      return { mode: this.controlMode, hit: this.hoverHit };
    }

    if (this.controlMode === "orbit") {
      this.updateOrbit(snapshot);
    } else {
      this.updateFly(snapshot);
    }

    const pickReport = this.updatePicking(snapshot);
    return { mode: this.controlMode, pickReport, hit: pickReport?.hit ?? null };
  }

  pick(snapshot: InputSnapshot): PickingReport | undefined {
    const root = this.resolveRoot();
    if (!root) return undefined;
    const ray = this.resolveRay(snapshot);
    return this.picking.report(root, ray.origin, ray.direction, this.pickOptions);
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.hotspotHandlers.clear();
    this.hoverHit = null;
  }

  private updateOrbit(snapshot: InputSnapshot): void {
    if (snapshot.button(this.rotateButton).down) {
      this.orbit.rotate(snapshot.pointer.deltaX * this.rotateSpeed, snapshot.pointer.deltaY * this.rotateSpeed);
    }
    if (snapshot.button(this.panButton).down) {
      this.orbit.pan(snapshot.pointer.deltaX * this.panSpeed, -snapshot.pointer.deltaY * this.panSpeed);
    }
    if (snapshot.pointer.wheelY !== 0) {
      this.orbit.dolly(Math.max(0.01, 1 + snapshot.pointer.wheelY * this.dollySpeed));
    }
  }

  private updateFly(snapshot: InputSnapshot): void {
    const distance = this.flyMoveSpeed;
    if (snapshot.key("KeyW").down || snapshot.key("ArrowUp").down) this.fly.moveForward(distance);
    if (snapshot.key("KeyS").down || snapshot.key("ArrowDown").down) this.fly.moveForward(-distance);
    if (snapshot.key("KeyA").down || snapshot.key("ArrowLeft").down) this.fly.strafe(-distance);
    if (snapshot.key("KeyD").down || snapshot.key("ArrowRight").down) this.fly.strafe(distance);
  }

  private updatePicking(snapshot: InputSnapshot): PickingReport | undefined {
    const pickReport = this.pick(snapshot);
    const hit = pickReport?.hit ?? null;
    const previousHit = this.hoverHit;
    if (previousHit?.object !== hit?.object) {
      if (previousHit) this.emit({ type: "hover-exit", mode: this.controlMode, snapshot, previousHit });
      if (hit) this.emit({ type: "hover-enter", mode: this.controlMode, snapshot, hit, previousHit: previousHit ?? undefined });
      this.hoverHit = hit;
    }

    if (hit && snapshot.button(0).released) {
      const event = { type: "pick" as const, mode: this.controlMode, snapshot, hit, previousHit: previousHit ?? undefined };
      this.emit(event);
      this.emitHotspot(event);
    }

    return pickReport;
  }

  private emitHotspot(event: InteractionControlsEvent & { readonly hit: V5PickResult }): void {
    const id = event.hit.metadata?.id ?? event.hit.object.name;
    if (!id) return;
    const hotspotEvent = { ...event, type: "hotspot-click" as const };
    this.emit(hotspotEvent);
    for (const handler of [...(this.hotspotHandlers.get(id) ?? [])]) {
      handler(hotspotEvent);
    }
  }

  private emit(event: InteractionControlsEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  private resolveRoot(): ControlObject3DLike | undefined {
    return typeof this.rootRef === "function" ? this.rootRef() : this.rootRef;
  }

  private resolveRay(snapshot: InputSnapshot): InteractionRay {
    return this.rayProvider?.(snapshot) ?? {
      origin: new ControlVector3(),
      direction: new ControlVector3(0, 0, -1)
    };
  }
}
