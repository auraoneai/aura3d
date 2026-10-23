/**
 * M-INPUT gamepad: transcription of `pollController` in game.js. Pure: the caller passes the pad list (from
 * `navigator.getGamepads()`) and the gating flags each frame; nothing here touches the DOM.
 */
import type { BindingsStore } from "./bindings";

export interface PadButtonLike { pressed: boolean; value: number }
export interface PadLike {
  index: number; id: string; connected: boolean; mapping: string;
  axes: readonly number[]; buttons: readonly PadButtonLike[];
}

export interface GamepadGates {
  /** `!document.hidden && document.hasFocus()`. */
  documentActive: boolean;
  workMode: boolean;
  /** Any settings/select/tournament overlay is open. */
  overlayOpen: boolean;
  /** A text field / select / contenteditable element has focus. */
  editableFocused: boolean;
  touchPlayEnabled: boolean;
  swipeActive: boolean;
}

export type PadStatus = "connected" | "unrecognized" | "none";

export interface GamepadResult {
  status: PadStatus;
  /** The pad the poll settled on (for the controls-settings screen), or null. */
  pad: PadLike | null;
  index: number | null;
  id: string | null;
  playStation: boolean;
  hitLabel: string;
  statusText: string;
  /** Movement axes after dead-zone and D-pad override, both [-1, 1]. Zero while blocked or gated. */
  x: number; y: number;
  /** Power modifier button held. */
  power: boolean;
  /** Press edges this poll (only set while play is accepted: touch-play enabled, no swipe, not blocked). */
  pressed: { hit: boolean; short: boolean; deep: boolean; lob: boolean };
  /** The Menu/Start button (index 9) was pressed: toggle pause. */
  pause: boolean;
  /** A previously connected pad vanished this poll: clear inputs and pause active offline play. */
  lost: boolean;
  /** Neutral input is required before play resumes (focus, connection, pause or menu change). */
  blocked: boolean;
}

export interface GamepadPoller {
  poll(pads: ReadonlyArray<PadLike | null | undefined>, gates: GamepadGates): GamepadResult;
  /** Force the neutral-input requirement (used by `clearInputs`). */
  block(): void;
  readonly state: Readonly<{ index: number | null; id: string | null; hitLabel: string; x: number; y: number; power: boolean; blocked: boolean }>;
}

const DEAD_ZONE = 0.18;
const PLAYSTATION = /054c|dualshock|dualsense|playstation|sony|wireless controller/i;
const XBOX = /xbox|xinput|045e/i;
export const axisWithDeadZone = (value: number | undefined): number => {
  const v = value || 0;
  return Math.abs(v) <= DEAD_ZONE ? 0 : Math.sign(v) * Math.min(1, (Math.abs(v) - DEAD_ZONE) / 0.82);
};

export function createGamepadPoller(bindings: Pick<BindingsStore, "buttonFor" | "labelFor">): GamepadPoller {
  const controller = { index: null as number | null, id: null as string | null, hitLabel: "A", x: 0, y: 0, power: false, buttons: [] as boolean[], blocked: true };

  function poll(pads: ReadonlyArray<PadLike | null | undefined>, gates: GamepadGates): GamepadResult {
    const standard = (p: PadLike | null | undefined): p is PadLike => Boolean(p?.connected && p.mapping === "standard");
    const pad = pads.find((p): p is PadLike => standard(p) && p.index === controller.index) ?? pads.find(standard) ?? null;
    const previousIndex = controller.index;
    const previousId = controller.id;
    controller.index = pad?.index ?? null;
    controller.id = pad?.id ?? null;
    const playStation = Boolean(pad && PLAYSTATION.test(pad.id) && !XBOX.test(pad.id));
    controller.hitLabel = bindings.labelFor("hit", "controller", { playStation }).toUpperCase();
    controller.x = controller.y = 0; controller.power = false;
    const anyConnected = pads.some((p) => p?.connected);
    const statusText = pad
      ? `Controller connected. ${bindings.labelFor("hit", "controller", { playStation })}: hit. Use the mouse to select a match.`
      : anyConnected ? "Controller layout not recognized. Try a USB connection in Chrome or Edge." : "Connect your controller, then press a controller button.";
    const status: PadStatus = pad ? "connected" : anyConnected ? "unrecognized" : "none";
    const result: GamepadResult = {
      status, pad, index: controller.index, id: controller.id, playStation, hitLabel: controller.hitLabel, statusText,
      x: 0, y: 0, power: false, pressed: { hit: false, short: false, deep: false, lob: false }, pause: false, lost: false, blocked: controller.blocked,
    };
    if (!pad) {
      controller.buttons = []; controller.blocked = true;
      result.lost = previousIndex !== null; result.blocked = true;
      return result;
    }
    const buttons = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    const pressed = (i: number | null): boolean => i !== null && Boolean(buttons[i]) && !controller.buttons[i];
    if (previousIndex !== pad.index || previousId !== pad.id) controller.blocked = true;
    const gated = !gates.documentActive || gates.workMode || gates.overlayOpen || gates.editableFocused;
    if (gated) {
      controller.blocked = true; controller.buttons = buttons; result.blocked = true; return result;
    }
    // Require neutral input after focus, connection, pause or a menu change. This prevents a held button from
    // starting a shot on return to play.
    if (controller.blocked) {
      controller.blocked = buttons.some(Boolean) || Math.abs(pad.axes[0] || 0) > DEAD_ZONE || Math.abs(pad.axes[1] || 0) > DEAD_ZONE;
      controller.buttons = buttons; result.blocked = controller.blocked; return result;
    }
    if (pressed(9)) { controller.buttons = buttons; result.pause = true; result.blocked = false; return result; }
    if (gates.touchPlayEnabled && !gates.swipeActive) {
      controller.x = buttons[14] || buttons[15] ? Number(!!buttons[15]) - Number(!!buttons[14]) : axisWithDeadZone(pad.axes[0]);
      controller.y = buttons[12] || buttons[13] ? Number(!!buttons[13]) - Number(!!buttons[12]) : axisWithDeadZone(pad.axes[1]);
      controller.power = !!buttons[bindings.buttonFor("power") as number];
      result.pressed.short = pressed(bindings.buttonFor("short"));
      result.pressed.deep = pressed(bindings.buttonFor("deep"));
      result.pressed.lob = pressed(bindings.buttonFor("lob"));
      result.pressed.hit = pressed(bindings.buttonFor("hit"));
      result.x = controller.x; result.y = controller.y; result.power = controller.power;
    }
    controller.buttons = buttons;
    result.blocked = false;
    return result;
  }

  return {
    poll,
    block() { controller.x = controller.y = 0; controller.power = false; controller.blocked = true; },
    get state() { return controller; },
  };
}
