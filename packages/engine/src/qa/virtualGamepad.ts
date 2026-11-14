/** W3C `"standard"` gamepad button names recognized by `installVirtualGamepads`. */
export type QaVirtualPadButton =
  | "A"
  | "B"
  | "X"
  | "Y"
  | "LB"
  | "RB"
  | "LT"
  | "RT"
  | "Select"
  | "Start"
  | "L3"
  | "R3"
  | "Up"
  | "Down"
  | "Left"
  | "Right"
  | "Home";

export type QaVirtualPadSlot = 0 | 1 | 2 | 3;

export interface QaVirtualGamepadButtonSnapshot {
  readonly pressed: boolean;
  readonly touched: boolean;
  readonly value: number;
}

export interface QaVirtualGamepadSnapshot {
  readonly index: number;
  readonly id: string;
  readonly connected: boolean;
  readonly mapping: "standard";
  readonly timestamp: number;
  readonly buttons: readonly QaVirtualGamepadButtonSnapshot[];
  readonly axes: readonly [number, number, number, number];
}

export interface QaVirtualGamepadsOptions {
  /** Navigator-like object whose `getGamepads()` is shimmed (restored on `uninstall()`). Default `navigator` when present. */
  readonly navigatorTarget?: Record<string, unknown> | null;
  /** EventTarget receiving `gamepadconnected` / `gamepaddisconnected` events. Default `globalThis` when dispatch-capable. */
  readonly eventTarget?: Pick<EventTarget, "dispatchEvent"> | null;
  /** Clock in milliseconds stamped onto `gamepad.timestamp`. Default `performance.now`. */
  readonly nowMs?: () => number;
}

export interface QaVirtualGamepads {
  /** Hold or release a standard button on pad `slot` (`0..3`), lazy-connecting the pad on first activation. */
  hold(slot: QaVirtualPadSlot, button: QaVirtualPadButton, down: boolean): void;
  /** Set an analog stick axis (`0..3`) in `[-1, 1]`, lazy-connecting the pad when non-zero. */
  setAxis(slot: QaVirtualPadSlot, axis: 0 | 1 | 2 | 3, value: number): void;
  /**
   * Apply a compact replay token (`"Pad1A"`, `"Pad2Left"`, `"Pad1TurnL"`, `"Pad1TurnR"`).
   * D-pad tokens (`Up`/`Down`/`Left`/`Right`) drive both buttons 12..15 and left-stick axes 0..1;
   * `TurnL`/`TurnR` drive right-stick horizontal axis 2. Returns `true` when `token` matched.
   */
  applyToken(token: string, down: boolean): boolean;
  /** Explicitly disconnect a pad slot and emit `gamepaddisconnected`. */
  disconnect(slot: QaVirtualPadSlot): void;
  /** Clear all held buttons and axes across connected pads without disconnecting them. */
  releaseAll(): void;
  /** Read the 4-slot `getGamepads()` snapshot directly. */
  snapshot(): readonly [
    QaVirtualGamepadSnapshot | null,
    QaVirtualGamepadSnapshot | null,
    QaVirtualGamepadSnapshot | null,
    QaVirtualGamepadSnapshot | null
  ];
  /** Restore the original `navigator.getGamepads` descriptor. */
  uninstall(): void;
}

const STANDARD_BUTTON_INDEX: Readonly<Record<QaVirtualPadButton, number>> = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  Select: 8,
  Start: 9,
  L3: 10,
  R3: 11,
  Up: 12,
  Down: 13,
  Left: 14,
  Right: 15,
  Home: 16
};

interface InternalPadState {
  readonly index: QaVirtualPadSlot;
  readonly id: string;
  connected: boolean;
  readonly held: Set<QaVirtualPadButton>;
  readonly tokenHeld: Set<"TurnL" | "TurnR">;
  readonly explicitAxes: [number, number, number, number];
}

const TOKEN_RE = /^Pad([1-4])(A|B|X|Y|LB|RB|LT|RT|Select|Start|L3|R3|Up|Down|Left|Right|Home|TurnL|TurnR)$/;

function defaultNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function clampAxis(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

function emitGamepadEvent(
  target: Pick<EventTarget, "dispatchEvent"> | null,
  type: "gamepadconnected" | "gamepaddisconnected",
  gamepad: QaVirtualGamepadSnapshot
): void {
  if (!target || typeof Event !== "function") return;
  try {
    const event = Object.assign(new Event(type), { gamepad });
    target.dispatchEvent(event);
  } catch {
    // Ignore environments without constructible DOM Event.
  }
}

/**
 * Install a deterministic 4-pad W3C `"standard"` `navigator.getGamepads()` harness for headless QA runs.
 * Matching real browsers, slots start `null` until their first button/axis input, then fire `gamepadconnected`.
 */
export function installVirtualGamepads(options: QaVirtualGamepadsOptions = {}): QaVirtualGamepads {
  const navTarget =
    options.navigatorTarget === undefined
      ? typeof navigator !== "undefined"
        ? (navigator as unknown as Record<string, unknown>)
        : null
      : options.navigatorTarget;
  const eventTarget =
    options.eventTarget === undefined
      ? typeof globalThis !== "undefined" && typeof (globalThis as { dispatchEvent?: unknown }).dispatchEvent === "function"
        ? (globalThis as unknown as Pick<EventTarget, "dispatchEvent">)
        : null
      : options.eventTarget;
  const nowMs = options.nowMs ?? defaultNowMs;

  const pads: [InternalPadState | null, InternalPadState | null, InternalPadState | null, InternalPadState | null] = [
    null,
    null,
    null,
    null
  ];

  const buildPadSnapshot = (pad: InternalPadState): QaVirtualGamepadSnapshot => {
    const buttons: QaVirtualGamepadButtonSnapshot[] = [];
    for (let i = 0; i < 17; i++) {
      buttons.push({ pressed: false, touched: false, value: 0 });
    }
    for (const btn of pad.held) {
      const idx = STANDARD_BUTTON_INDEX[btn];
      buttons[idx] = { pressed: true, touched: true, value: 1 };
    }
    const dpadX = (pad.held.has("Right") ? 1 : 0) - (pad.held.has("Left") ? 1 : 0);
    const dpadY = (pad.held.has("Down") ? 1 : 0) - (pad.held.has("Up") ? 1 : 0);
    const turnX = (pad.tokenHeld.has("TurnR") ? 1 : 0) - (pad.tokenHeld.has("TurnL") ? 1 : 0);
    const axes: [number, number, number, number] = [
      pad.explicitAxes[0] !== 0 ? pad.explicitAxes[0] : dpadX,
      pad.explicitAxes[1] !== 0 ? pad.explicitAxes[1] : dpadY,
      pad.explicitAxes[2] !== 0 ? pad.explicitAxes[2] : turnX,
      pad.explicitAxes[3]
    ];
    return {
      index: pad.index,
      id: pad.id,
      connected: pad.connected,
      mapping: "standard",
      timestamp: nowMs(),
      buttons,
      axes
    };
  };

  const ensureConnected = (slot: QaVirtualPadSlot): InternalPadState => {
    let pad = pads[slot];
    if (!pad) {
      pad = {
        index: slot,
        id: `Aura3D Virtual Gamepad ${slot + 1}`,
        connected: true,
        held: new Set(),
        tokenHeld: new Set(),
        explicitAxes: [0, 0, 0, 0]
      };
      pads[slot] = pad;
      emitGamepadEvent(eventTarget, "gamepadconnected", buildPadSnapshot(pad));
    } else if (!pad.connected) {
      pad.connected = true;
      emitGamepadEvent(eventTarget, "gamepadconnected", buildPadSnapshot(pad));
    }
    return pad;
  };

  const snapshot = (): readonly [
    QaVirtualGamepadSnapshot | null,
    QaVirtualGamepadSnapshot | null,
    QaVirtualGamepadSnapshot | null,
    QaVirtualGamepadSnapshot | null
  ] => [
    pads[0]?.connected ? buildPadSnapshot(pads[0]) : null,
    pads[1]?.connected ? buildPadSnapshot(pads[1]) : null,
    pads[2]?.connected ? buildPadSnapshot(pads[2]) : null,
    pads[3]?.connected ? buildPadSnapshot(pads[3]) : null
  ];

  const hadOwnDescriptor = navTarget ? Object.prototype.hasOwnProperty.call(navTarget, "getGamepads") : false;
  const previousDescriptor = navTarget ? Object.getOwnPropertyDescriptor(navTarget, "getGamepads") : undefined;
  let installedOnNav = false;
  if (navTarget) {
    try {
      Object.defineProperty(navTarget, "getGamepads", {
        configurable: true,
        writable: true,
        value: snapshot
      });
      installedOnNav = true;
    } catch {
      installedOnNav = false;
    }
  }

  return {
    hold(slot, button, down) {
      if (down) {
        ensureConnected(slot).held.add(button);
      } else {
        pads[slot]?.held.delete(button);
      }
    },
    setAxis(slot, axis, value) {
      const clamped = clampAxis(value);
      if (clamped !== 0) {
        ensureConnected(slot).explicitAxes[axis] = clamped;
      } else if (pads[slot]) {
        pads[slot]!.explicitAxes[axis] = 0;
      }
    },
    applyToken(token, down) {
      const match = TOKEN_RE.exec(token);
      if (!match) return false;
      const slot = (Number(match[1]) - 1) as QaVirtualPadSlot;
      const action = match[2]!;
      if (action === "TurnL" || action === "TurnR") {
        if (down) ensureConnected(slot).tokenHeld.add(action);
        else pads[slot]?.tokenHeld.delete(action);
        return true;
      }
      if (down) ensureConnected(slot).held.add(action as QaVirtualPadButton);
      else pads[slot]?.held.delete(action as QaVirtualPadButton);
      return true;
    },
    disconnect(slot) {
      const pad = pads[slot];
      if (!pad || !pad.connected) return;
      pad.held.clear();
      pad.tokenHeld.clear();
      pad.explicitAxes[0] = 0;
      pad.explicitAxes[1] = 0;
      pad.explicitAxes[2] = 0;
      pad.explicitAxes[3] = 0;
      pad.connected = false;
      emitGamepadEvent(eventTarget, "gamepaddisconnected", buildPadSnapshot(pad));
    },
    releaseAll() {
      for (const pad of pads) {
        if (!pad) continue;
        pad.held.clear();
        pad.tokenHeld.clear();
        pad.explicitAxes[0] = 0;
        pad.explicitAxes[1] = 0;
        pad.explicitAxes[2] = 0;
        pad.explicitAxes[3] = 0;
      }
    },
    snapshot,
    uninstall() {
      if (!navTarget || !installedOnNav) return;
      try {
        if (hadOwnDescriptor && previousDescriptor) {
          Object.defineProperty(navTarget, "getGamepads", previousDescriptor);
        } else {
          delete navTarget.getGamepads;
        }
      } catch {
        // Ignore non-configurable fallback.
      }
      installedOnNav = false;
    }
  };
}
