import type { ButtonState, PointerCancellation, PointerCancellationReason, PointerContact, PointerCoordinates } from "./InputSnapshot";

export interface PointerEventLike {
  readonly clientX: number;
  readonly clientY: number;
  readonly button?: number;
  readonly buttons?: number;
  readonly pointerId?: number;
  readonly pointerType?: string;
  readonly timeStamp?: number;
  preventDefault?(): void;
}

export interface WheelEventLike {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly timeStamp?: number;
  preventDefault?(): void;
}

/** The drawing buffer can differ from CSS size and devicePixelRatio. */
export interface PointerCoordinateTarget {
  readonly width?: number;
  readonly height?: number;
  readonly offsetWidth?: number;
  readonly offsetHeight?: number;
  getBoundingClientRect?(): { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
}

interface ContactState {
  id: number;
  pointerType: string;
  overTarget: boolean;
  clientX: number;
  clientY: number;
  startClientX: number;
  startClientY: number;
  maxClientDistance: number;
  hadMultipleContacts: boolean;
  timestamp: number;
  startedAt: number;
  target?: PointerCoordinateTarget;
  deltaX: number;
  deltaY: number;
  buttons: Set<number>;
  pressed: Set<number>;
  released: Set<number>;
  cancelled: boolean;
}

export class PointerDevice {
  x = 0;
  y = 0;
  deltaX = 0;
  deltaY = 0;
  wheelX = 0;
  wheelY = 0;

  private readonly contacts = new Map<number, ContactState>();
  private readonly retired: ContactState[] = [];
  private readonly cancellations: PointerCancellation[] = [];
  private readonly cancelledButtons = new Set<number>();
  private cancellationReason?: PointerCancellationReason;
  private previousButtons = new Set<number>();
  private pixelRatio = 1;
  private primaryId?: number;
  private lastCoordinates: PointerCoordinates = coordinates(0, 0, undefined, 1);
  private lastTimestamp = 0;
  private coordinateTarget?: PointerCoordinateTarget;

  setDevicePixelRatio(value: number): void {
    if (!Number.isFinite(value) || value <= 0) throw new Error("Device pixel ratio must be positive");
    this.pixelRatio = value;
  }

  setCoordinateTarget(target?: PointerCoordinateTarget): void {
    this.coordinateTarget = target;
  }

  move(event: PointerEventLike, target?: PointerCoordinateTarget): void {
    const id = event.pointerId ?? 0;
    let contact = this.contacts.get(id);
    if (contact?.cancelled) return;
    const wasActive = (contact?.buttons.size ?? 0) > 0;
    // A mouse or pen can hover; a touch does not become active until pointerdown.
    if (!contact && event.pointerType === "touch") return;
    if (!contact) {
      contact = this.createContact(event, target);
      this.contacts.set(id, contact);
      if (this.primaryId === undefined) this.primaryId = id;
    } else {
      this.moveContact(contact, event, target);
    }
    this.updateOverTarget(contact, event, target);
    // Pointer Events report extra mouse/pen chord changes on pointermove, not
    // as another pointerdown/up. A zero mask is left to pointerup/cancel so a
    // transient move cannot masquerade as an activation release.
    if (wasActive && contact.pointerType !== "touch" && event.buttons !== undefined && event.buttons > 0) {
      this.syncButtons(contact, event.buttons);
    }
    if (![...this.contacts.values()].some(item => item.buttons.size > 0)) this.primaryId = id;
    this.selectPrimary();
    this.refreshPrimary();
  }

  down(event: PointerEventLike, target?: PointerCoordinateTarget): void {
    const id = event.pointerId ?? 0;
    let contact = this.contacts.get(id);
    if (contact && contact.buttons.size === 0 && (contact.released.size > 0 || contact.cancelled)) {
      this.retired.push(contact);
      this.contacts.delete(id);
      contact = undefined;
    }
    if (!contact) {
      contact = this.createContact(event, target);
      this.contacts.set(id, contact);
    } else {
      this.moveContact(contact, event, target);
      if (contact.buttons.size === 0) {
        contact.startedAt = eventTime(event.timeStamp);
        contact.startClientX = event.clientX;
        contact.startClientY = event.clientY;
        contact.maxClientDistance = 0;
        contact.hadMultipleContacts = false;
        contact.deltaX = contact.deltaY = 0;
      }
    }
    const button = event.button ?? 0;
    contact.overTarget = true;
    if (!contact.buttons.has(button)) contact.pressed.add(button);
    contact.buttons.add(button);
    this.cancelledButtons.delete(button);
    if (contact.pointerType !== "touch" && event.buttons !== undefined && event.buttons > 0) this.syncButtons(contact, event.buttons);
    const active = [...this.contacts.values()].filter(item => item.buttons.size > 0 && item.pointerType === "touch");
    if (active.length > 1) for (const item of active) item.hadMultipleContacts = true;
    this.selectPrimary();
    this.refreshPrimary();
  }

  up(event: PointerEventLike, target?: PointerCoordinateTarget): void {
    const contact = this.contacts.get(event.pointerId ?? 0);
    if (!contact || contact.buttons.size === 0) return;
    this.moveContact(contact, event, target);
    this.updateOverTarget(contact, event, target);
    const released = event.buttons === 0 && contact.pointerType !== "touch" ? [...contact.buttons] : [event.button ?? 0];
    for (const button of released) {
      if (contact.buttons.delete(button)) {
        contact.released.add(button);
        if (!this.currentButtons().has(button)) this.cancelledButtons.delete(button);
      }
    }
    if (contact.buttons.size === 0 && !contact.overTarget) this.retire(contact);
    this.selectPrimary();
    this.refreshPrimary();
  }

  cancel(event: PointerEventLike, reason: PointerCancellationReason = "pointercancel", target?: PointerCoordinateTarget): void {
    const contact = this.contacts.get(event.pointerId ?? 0);
    if (!contact || contact.buttons.size === 0) return;
    this.moveContact(contact, event, target);
    this.cancelContact(contact, reason, eventTime(event.timeStamp));
    this.selectPrimary();
    this.refreshPrimary();
  }

  /** End hover when a pointer leaves the target; an active captured contact continues. */
  leave(event: PointerEventLike): void {
    const id = event.pointerId ?? 0;
    const contact = this.contacts.get(id);
    if (!contact) return;
    contact.overTarget = false;
    if (contact.buttons.size > 0) return;
    this.retire(contact);
    this.selectPrimary();
    this.refreshPrimary();
  }

  private retire(contact: ContactState): void {
    const id = contact.id;
    if (contact.released.size || contact.cancelled) this.retired.push(contact);
    this.contacts.delete(id);
    if (this.primaryId === id) this.primaryId = undefined;
  }

  wheel(event: WheelEventLike, target?: PointerCoordinateTarget): void {
    this.wheelX += event.deltaX;
    this.wheelY += event.deltaY;
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      const primary = this.primaryId === undefined ? undefined : this.contacts.get(this.primaryId);
      if (primary) {
        primary.clientX = event.clientX!;
        primary.clientY = event.clientY!;
        primary.target = target ?? primary.target ?? this.coordinateTarget;
      }
      this.lastCoordinates = coordinates(event.clientX!, event.clientY!, target ?? primary?.target ?? this.coordinateTarget, this.pixelRatio);
      this.x = this.lastCoordinates.framebufferX;
      this.y = this.lastCoordinates.framebufferY;
    }
    this.lastTimestamp = eventTime(event.timeStamp);
  }

  blur(reason: PointerCancellationReason = "blur", timestamp = eventTime()): void {
    this.cancellationReason = reason;
    for (const [id, contact] of this.contacts) {
      if (contact.buttons.size > 0) this.cancelContact(contact, reason, timestamp);
      else this.contacts.delete(id);
    }
    this.selectPrimary();
    this.refreshPrimary();
  }

  snapshotData() {
    const buttonMap = new Map<number, ButtonState>();
    for (const button of this.currentButtons()) buttonMap.set(button, { down: true, pressed: false, released: false });
    const contacts = [...this.retired, ...this.contacts.values()].map((contact) => this.snapshotContact(contact));
    const primary = this.primaryId === undefined ? undefined : this.contacts.get(this.primaryId);
    this.refreshPrimary(); // also updates coordinates after target resizing or scrolling
    return {
      pointer: {
        ...this.lastCoordinates,
        x: this.x,
        y: this.y,
        deltaX: this.deltaX,
        deltaY: this.deltaY,
        wheelX: this.wheelX,
        wheelY: this.wheelY,
        timestamp: Math.max(this.lastTimestamp, primary?.timestamp ?? 0),
        primaryId: this.primaryId,
        buttons: buttonMap,
        contacts,
        touches: contacts.filter((contact) => contact.pointerType === "touch" && contact.down),
        cancellations: [...this.cancellations],
        cancellationReason: this.cancellationReason
      },
      previousPointerButtons: new Set(this.previousButtons),
      cancelledPointerButtons: new Set(this.cancelledButtons)
    };
  }

  endFrame(): void {
    this.previousButtons = this.currentButtons();
    this.retired.length = 0;
    this.cancellations.length = 0;
    this.cancelledButtons.clear();
    this.cancellationReason = undefined;
    for (const [id, contact] of this.contacts) {
      contact.pressed.clear();
      contact.released.clear();
      contact.deltaX = contact.deltaY = 0;
      if (contact.buttons.size === 0 && (contact.pointerType === "touch" || contact.cancelled)) this.contacts.delete(id);
      else contact.cancelled = false;
    }
    this.selectPrimary();
    this.deltaX = this.deltaY = 0;
    this.wheelX = this.wheelY = 0;
  }

  private createContact(event: PointerEventLike, target?: PointerCoordinateTarget): ContactState {
    const time = eventTime(event.timeStamp);
    this.lastTimestamp = time;
    return {
      id: event.pointerId ?? 0, pointerType: event.pointerType || "mouse", overTarget: true, clientX: event.clientX, clientY: event.clientY,
      startClientX: event.clientX, startClientY: event.clientY, maxClientDistance: 0, hadMultipleContacts: false, timestamp: time, startedAt: time,
      target: target ?? this.coordinateTarget, deltaX: 0, deltaY: 0,
      buttons: new Set(), pressed: new Set(), released: new Set(), cancelled: false
    };
  }

  private moveContact(contact: ContactState, event: PointerEventLike, target?: PointerCoordinateTarget): void {
    const actualTarget = target ?? contact.target ?? this.coordinateTarget;
    const previous = coordinates(contact.clientX, contact.clientY, actualTarget, this.pixelRatio);
    const next = coordinates(event.clientX, event.clientY, actualTarget, this.pixelRatio);
    contact.deltaX += next.framebufferX - previous.framebufferX;
    contact.deltaY += next.framebufferY - previous.framebufferY;
    contact.clientX = event.clientX;
    contact.clientY = event.clientY;
    contact.maxClientDistance = Math.max(contact.maxClientDistance, Math.hypot(event.clientX - contact.startClientX, event.clientY - contact.startClientY));
    contact.target = actualTarget;
    contact.timestamp = eventTime(event.timeStamp);
    this.lastTimestamp = contact.timestamp;
  }

  private updateOverTarget(contact: ContactState, event: PointerEventLike, target?: PointerCoordinateTarget): void {
    const rect = (target ?? contact.target)?.getBoundingClientRect?.();
    contact.overTarget = !rect || (event.clientX >= rect.left && event.clientX < rect.left + rect.width &&
      event.clientY >= rect.top && event.clientY < rect.top + rect.height);
  }

  private cancelContact(contact: ContactState, reason: PointerCancellationReason, timestamp: number): void {
    const buttons = [...contact.buttons];
    contact.buttons.clear();
    contact.cancelled = true;
    contact.timestamp = timestamp;
    this.lastTimestamp = timestamp;
    const remaining = this.currentButtons();
    for (const button of buttons) if (!remaining.has(button)) this.cancelledButtons.add(button);
    this.cancellations.push(Object.freeze({ id: contact.id, reason, timestamp }));
  }

  private currentButtons(): Set<number> {
    const result = new Set<number>();
    for (const contact of this.contacts.values()) for (const button of contact.buttons) result.add(button);
    return result;
  }

  private syncButtons(contact: ContactState, mask: number): void {
    const next = new Set<number>();
    const maskByButton = [1, 4, 2, 8, 16];
    for (let button = 0; button < maskByButton.length; button++) if (mask & maskByButton[button]!) next.add(button);
    for (const button of contact.buttons) {
      if (!next.has(button)) { contact.buttons.delete(button); contact.released.add(button); }
    }
    for (const button of next) {
      if (!contact.buttons.has(button)) { contact.buttons.add(button); contact.pressed.add(button); this.cancelledButtons.delete(button); }
    }
  }

  private selectPrimary(): void {
    const current = this.primaryId === undefined ? undefined : this.contacts.get(this.primaryId);
    if (current?.buttons.size) return;
    const active = [...this.contacts.values()].find((contact) => contact.buttons.size > 0);
    if (active) this.primaryId = active.id;
    else if (!current || current.cancelled) this.primaryId = undefined;
  }

  private refreshPrimary(): void {
    const primary = this.primaryId === undefined ? undefined : this.contacts.get(this.primaryId);
    if (!primary) {
      this.deltaX = this.deltaY = 0;
      return;
    }
    this.lastCoordinates = coordinates(primary.clientX, primary.clientY, primary.target, this.pixelRatio);
    this.x = this.lastCoordinates.framebufferX;
    this.y = this.lastCoordinates.framebufferY;
    this.deltaX = primary.deltaX;
    this.deltaY = primary.deltaY;
  }

  private snapshotContact(contact: ContactState): PointerContact {
    const point = coordinates(contact.clientX, contact.clientY, contact.target, this.pixelRatio);
    const start = coordinates(contact.startClientX, contact.startClientY, contact.target, this.pixelRatio);
    const buttons = new Map<number, ButtonState>();
    for (const button of new Set([...contact.buttons, ...contact.pressed, ...contact.released])) {
      buttons.set(button, Object.freeze({ down: contact.buttons.has(button), pressed: contact.pressed.has(button), released: contact.released.has(button) }));
    }
    return Object.freeze({
      ...point, id: contact.id, pointerType: contact.pointerType, overTarget: contact.overTarget, x: point.framebufferX, y: point.framebufferY,
      timestamp: contact.timestamp, startedAt: contact.startedAt, startClientX: contact.startClientX, startClientY: contact.startClientY,
      maxClientDistance: contact.maxClientDistance, hadMultipleContacts: contact.hadMultipleContacts,
      startX: start.framebufferX, startY: start.framebufferY, deltaX: contact.deltaX, deltaY: contact.deltaY,
      buttons, down: contact.buttons.size > 0, pressed: contact.pressed.size > 0,
      released: contact.buttons.size === 0 && contact.released.size > 0 && !contact.cancelled,
      cancelled: contact.cancelled
    });
  }
}

function coordinates(clientX: number, clientY: number, target: PointerCoordinateTarget | undefined, ratio: number): PointerCoordinates {
  const rect = target?.getBoundingClientRect?.();
  const view = (target as { ownerDocument?: { defaultView?: Window | null } } | undefined)?.ownerDocument?.defaultView;
  const style = view?.getComputedStyle && target ? view.getComputedStyle(target as Element) : undefined;
  const cssNumber = (value: string | undefined): number => Number.parseFloat(value ?? "") || 0;
  const renderedScaleX = rect && target?.offsetWidth ? rect.width / target.offsetWidth : 1;
  const renderedScaleY = rect && target?.offsetHeight ? rect.height / target.offsetHeight : 1;
  const left = cssNumber(style?.borderLeftWidth) + cssNumber(style?.paddingLeft);
  const right = cssNumber(style?.borderRightWidth) + cssNumber(style?.paddingRight);
  const top = cssNumber(style?.borderTopWidth) + cssNumber(style?.paddingTop);
  const bottom = cssNumber(style?.borderBottomWidth) + cssNumber(style?.paddingBottom);
  const contentWidth = rect && renderedScaleX > 0 ? rect.width / renderedScaleX - left - right : 0;
  const contentHeight = rect && renderedScaleY > 0 ? rect.height / renderedScaleY - top - bottom : 0;
  const cssX = (clientX - (rect?.left ?? 0)) / (renderedScaleX || 1) - left;
  const cssY = (clientY - (rect?.top ?? 0)) / (renderedScaleY || 1) - top;
  const scaleX = contentWidth > 0 && Number.isFinite(target?.width) ? target!.width! / contentWidth : ratio;
  const scaleY = contentHeight > 0 && Number.isFinite(target?.height) ? target!.height! / contentHeight : ratio;
  return { clientX, clientY, cssX, cssY, framebufferX: cssX * scaleX, framebufferY: cssY * scaleY };
}

function eventTime(timestamp?: number): number {
  return timestamp !== undefined && Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : (globalThis.performance?.now() ?? Date.now());
}
