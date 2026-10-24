import type { GamepadPoller, PadLike } from "../input/gamepad";

export interface ControllerState {
  index: number | null; id: string | null; hitLabel: string; x: number; y: number; power: boolean; buttons: boolean[]; blocked: boolean;
}

export interface GamepadDeps {
  poller: GamepadPoller;
  /** Called with the active standard pad (or null) so the settings dialog can capture a button. */
  onPad?(pad: Gamepad | null): void;
  overlayOpen(): boolean;
  playActive(): boolean;
  touchPlayEnabled(): boolean;
  swipeActive(): boolean;
  togglePause(): void;
  clearInputs(): void;
  selectShot(shot: "short" | "deep" | "lob"): void;
  intentionalLobEnabled(): boolean;
  swing(forcePower: boolean): void;
  initAudio(): void;
  setStatus?(text: string): void;
}

/** DOM wrapper over M-INPUT's pure poller: reads `navigator.getGamepads()` and applies the press edges (game.js `pollController`). */
export function createController(deps: GamepadDeps): { state: ControllerState; poll(): void; block(): void } {
  const { poller } = deps;
  const state: ControllerState = { index: null, id: null, hitLabel: "A", x: 0, y: 0, power: false, buttons: [], blocked: true };
  function poll(): void {
    let pads: Array<Gamepad | null> = [];
    try { pads = Array.from(navigator.getGamepads?.() || []); } catch { /* gamepad API unavailable */ }
    const result = poller.poll(pads as unknown as PadLike[], {
      documentActive: !document.hidden && document.hasFocus(),
      overlayOpen: deps.overlayOpen(),
      editableFocused: Boolean((document.activeElement as Element | null)?.matches?.('input,textarea,select,[contenteditable="true"]')),
      touchPlayEnabled: deps.touchPlayEnabled(),
      swipeActive: deps.swipeActive()
    });
    Object.assign(state, { index: result.index, id: result.id, hitLabel: result.hitLabel, x: result.x, y: result.y, power: result.power, blocked: result.blocked });
    deps.setStatus?.(result.statusText);
    deps.onPad?.(result.pad as unknown as Gamepad | null);
    if (result.lost) { deps.clearInputs(); if (deps.playActive()) deps.togglePause(); return; }
    if (result.pause) { deps.togglePause(); return; }
    if (result.pressed.short) deps.selectShot("short");
    if (result.pressed.deep) deps.selectShot("deep");
    if (result.pressed.lob && deps.intentionalLobEnabled()) deps.selectShot("lob");
    if (result.pressed.hit) { deps.initAudio(); deps.swing(result.power); }
  }
  function block(): void { poller.block(); state.x = state.y = 0; state.power = false; state.blocked = true; }
  return { state, poll, block };
}
