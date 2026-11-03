import { InputSnapshot } from "@aura3d/input";
import { FirstPersonControls, type FirstPersonControlsOptions } from "./FirstPersonControls";
import type { CameraTransformLike } from "./ControlTypes";

export interface PointerLockControlsOptions extends FirstPersonControlsOptions {
  /**
   * The browser element to lock. Omit this for the original snapshot-only,
   * synchronous lock gate (useful in headless applications).
   */
  readonly element?: HTMLElement;
  /** Called when this controller gains or loses its lock, including cancellation. */
  readonly onLockChange?: (locked: boolean) => void;
  /** Called for unavailable APIs, denied requests and failures to exit the lock. */
  readonly onLockError?: (error: unknown) => void;
}

interface LockRequest {
  cancelled: boolean;
  promiseBased: boolean;
}

// A document exposes only the locked element, not the code which requested it.
// Track Aura controllers separately so one controller cannot release another's
// lock, and serialize their in-flight requests so an event has one owner.
const documentOwners = new WeakMap<Document, PointerLockControls>();
const documentRequests = new WeakMap<Document, PointerLockControls>();

/**
 * First-person controls with an optional browser pointer-lock target.
 *
 * With an element, call lock() from a user gesture. `locked` becomes true only
 * after the document reports that this controller's request succeeded. Raw
 * browser mouse movement is consumed on update alongside keyboard snapshots;
 * custom snapshots should not repeat those same relative mouse movements.
 * Without an element, lock()/unlock() preserve the original synchronous input
 * gate and movement comes entirely from snapshots.
 */
export class PointerLockControls extends FirstPersonControls {
  private readonly element?: HTMLElement;
  private readonly doc?: Document;
  private readonly onLockChange?: (locked: boolean) => void;
  private readonly onLockError?: (error: unknown) => void;
  private request?: LockRequest;
  private isLocked = false;
  private disposed = false;
  private lockListenersAttached = false;
  private exitPending = false;
  private movementX = 0;
  private movementY = 0;

  constructor(camera: CameraTransformLike, options: PointerLockControlsOptions = {}) {
    super(camera, options);
    this.element = options.element;
    this.doc = options.element?.ownerDocument;
    this.onLockChange = options.onLockChange;
    this.onLockError = options.onLockError;
    if (this.doc) {
      this.attachLockListeners();
      this.doc.addEventListener("mousemove", this.handleMouseMove);
      this.doc.addEventListener("visibilitychange", this.handleVisibilityChange);
      this.doc.defaultView?.addEventListener("blur", this.handleBlur);
    }
  }

  get locked(): boolean {
    return this.isLocked;
  }

  set locked(value: boolean) {
    if (value) this.lock();
    else this.unlock();
  }

  lock(): void {
    if (this.disposed) return;
    const element = this.element;
    const doc = this.doc;
    if (!element || !doc) {
      this.setLocked(true);
      return;
    }
    if (this.request) {
      if (this.request.cancelled) this.reportError(new Error("A cancelled pointer-lock request is still settling."));
      return;
    }
    if (this.exitPending) {
      this.reportError(new Error("The previous pointer lock is still being released."));
      return;
    }
    if (this.isElementLocked()) {
      if (documentOwners.get(doc) === this) this.setLocked(true);
      else this.reportError(new Error("The element's pointer lock is owned elsewhere."));
      return;
    }
    if (documentRequests.has(doc)) {
      this.reportError(new Error("Another Aura3D pointer-lock request is pending in this document."));
      return;
    }
    if (typeof element.requestPointerLock !== "function") {
      this.reportError(new Error("Pointer lock is unavailable on this element."));
      return;
    }

    const request: LockRequest = { cancelled: false, promiseBased: false };
    this.request = request;
    documentRequests.set(doc, this);
    try {
      // Older browsers return void and report the outcome through events.
      const result = element.requestPointerLock() as Promise<void> | void;
      if (result && typeof result.then === "function") {
        request.promiseBased = true;
        void Promise.resolve(result).then(
          () => {
            // Also handles an acquisition that finishes after unlock/dispose.
            if (this.request !== request) return;
            if (this.isElementLocked()) this.handlePointerLockChange();
            else this.failRequest(request, new Error("Pointer lock ended before the request completed."));
          },
          (error: unknown) => this.failRequest(request, error)
        );
      }
    } catch (error) {
      this.failRequest(request, error);
    }
  }

  unlock(): void {
    if (this.disposed) return;
    if (this.request) this.request.cancelled = true;
    this.clearMovement();
    try {
      this.setLocked(false);
    } finally {
      this.exitOwnedLock();
    }
  }

  override update(snapshot: InputSnapshot, deltaSeconds: number): void {
    if (this.disposed) return;
    // A whole-device termination must not leave a first-person session active.
    if (snapshot.pointer.cancellationReason) {
      this.unlock();
      return;
    }
    if (this.doc && this.isLocked && (!this.isElementLocked() || documentOwners.get(this.doc) !== this)) {
      if (documentOwners.get(this.doc) === this) documentOwners.delete(this.doc);
      this.exitPending = false;
      this.clearMovement();
      this.setLocked(false);
      return;
    }
    if (!this.isLocked || !this.enabled) {
      this.clearMovement();
      return;
    }

    const deltaX = snapshot.pointer.deltaX + this.movementX;
    const deltaY = snapshot.pointer.deltaY + this.movementY;
    this.clearMovement();
    if (deltaX !== 0 || deltaY !== 0) {
      const buttons = new Map(snapshot.pointer.buttons);
      buttons.set(0, { down: true, pressed: false, released: false });
      super.update(new InputSnapshot({
        keys: snapshot.keys,
        pointer: { ...snapshot.pointer, deltaX, deltaY, buttons },
        gamepads: snapshot.gamepads
      }), deltaSeconds);
      return;
    }
    super.update(snapshot, deltaSeconds);
  }

  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.request) this.request.cancelled = true;
    this.clearMovement();
    this.exitOwnedLock();
    this.doc?.removeEventListener("mousemove", this.handleMouseMove);
    this.doc?.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.doc?.defaultView?.removeEventListener("blur", this.handleBlur);
    if (this.doc && documentOwners.get(this.doc) === this) documentOwners.delete(this.doc);
    // A legacy void-returning request cannot be cancelled. Keep only its two
    // outcome listeners until it settles so a late grant can be released. A
    // promise-returning request can be cleaned up through its own settlement.
    if (!this.request || this.request.promiseBased) this.detachLockListeners();
    super.dispose();
    this.setLocked(false);
  }

  protected override onEnabledChange(enabled: boolean): void {
    if (!enabled) this.clearMovement();
  }

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.isLocked || !this.enabled || !this.doc || documentOwners.get(this.doc) !== this || !this.isElementLocked()) return;
    if (Number.isFinite(event.movementX)) this.movementX += event.movementX;
    if (Number.isFinite(event.movementY)) this.movementY += event.movementY;
  };

  private readonly handleBlur = (): void => {
    this.unlock();
  };

  private readonly handleVisibilityChange = (): void => {
    if (this.doc?.visibilityState === "hidden") this.unlock();
  };

  private readonly handlePointerLockChange = (): void => {
    const doc = this.doc;
    const element = this.element;
    if (!doc || !element) return;
    const isElementLocked = this.isElementLocked();
    if (!isElementLocked) this.exitPending = false;
    const request = this.request;
    if (request && isElementLocked) {
      this.finishRequest(request);
      const owner = documentOwners.get(doc);
      if (request.cancelled || this.disposed) {
        // The previous owner may not have received this same change event
        // yet; its different element no longer holds the document lock.
        if (!owner || owner === this || owner.element !== element) {
          documentOwners.set(doc, this);
          this.exitOwnedLock();
          if (this.disposed && documentOwners.get(doc) === this) documentOwners.delete(doc);
        }
      } else {
        documentOwners.set(doc, this);
        this.setLocked(true);
      }
    } else if (!isElementLocked) {
      if (documentOwners.get(doc) === this) documentOwners.delete(doc);
      this.clearMovement();
      this.setLocked(false);
    }
    if (this.disposed && !this.request) this.detachLockListeners();
  };

  private readonly handlePointerLockError = (): void => {
    // Promise-capable browsers provide the actual rejection reason. Ignoring
    // their redundant error event also prevents it from reporting twice.
    if (this.request && !this.request.promiseBased) {
      this.failRequest(this.request, new Error("The browser denied the pointer-lock request."));
    }
  };

  private attachLockListeners(): void {
    if (!this.doc || this.lockListenersAttached) return;
    this.doc.addEventListener("pointerlockchange", this.handlePointerLockChange);
    this.doc.addEventListener("pointerlockerror", this.handlePointerLockError);
    this.lockListenersAttached = true;
  }

  private detachLockListeners(): void {
    if (!this.doc || !this.lockListenersAttached) return;
    this.doc.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    this.doc.removeEventListener("pointerlockerror", this.handlePointerLockError);
    this.lockListenersAttached = false;
  }

  private finishRequest(request: LockRequest): void {
    if (this.request !== request) return;
    this.request = undefined;
    if (this.doc && documentRequests.get(this.doc) === this) documentRequests.delete(this.doc);
  }

  private failRequest(request: LockRequest, error: unknown): void {
    if (this.request !== request) return;
    this.finishRequest(request);
    if (!request.cancelled && !this.disposed) this.reportError(error);
    if (this.disposed) this.detachLockListeners();
  }

  private exitOwnedLock(): void {
    const doc = this.doc;
    if (!doc || documentOwners.get(doc) !== this) return;
    if (!this.isElementLocked()) {
      documentOwners.delete(doc);
      this.exitPending = false;
      return;
    }
    if (this.exitPending) return;
    try {
      if (typeof doc.exitPointerLock !== "function") throw new Error("Exiting pointer lock is unavailable in this document.");
      this.exitPending = true;
      doc.exitPointerLock();
    } catch (error) {
      this.exitPending = false;
      if (!this.disposed) this.reportError(error);
    }
  }

  private setLocked(value: boolean): void {
    if (this.isLocked === value) return;
    this.isLocked = value;
    this.onLockChange?.(value);
  }

  private isElementLocked(): boolean {
    const element = this.element;
    if (!element || !this.doc) return false;
    // document.pointerLockElement can be retargeted to a shadow host. The
    // containing ShadowRoot exposes the actual element where supported.
    const root = element.getRootNode?.() as (Node & { readonly pointerLockElement?: Element | null }) | undefined;
    if (root && root !== this.doc && "pointerLockElement" in root) return root.pointerLockElement === element;
    return this.doc.pointerLockElement === element;
  }

  private clearMovement(): void {
    this.movementX = this.movementY = 0;
  }

  private reportError(error: unknown): void {
    this.onLockError?.(error);
  }
}
