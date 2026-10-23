import { INPUT_HELD, emptyInput, type InputFrame, type InputKey } from "./constants";
import type { InputSource } from "./game";

const EDGE_KEYS: Readonly<Record<string, InputKey>> = {
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyQ: "rollLeft",
  KeyE: "rollRight",
  KeyP: "pausePressed",
  Escape: "pausePressed"
};
const HELD_KEYS: Readonly<Record<string, InputKey>> = {
  Space: "thrust",
  KeyW: "thrust",
  ArrowUp: "thrust",
  KeyS: "dive",
  ArrowDown: "dive",
  ShiftLeft: "boost",
  ShiftRight: "boost"
};

/** Keyboard (and on-screen button) input: key edges are latched until polled, held keys stay on while down. */
export class KeyboardInput implements InputSource {
  private edges = new Set<InputKey>();
  private held = new Map<string, InputKey>();
  private injected = new Map<InputKey, number>();
  private disposers: Array<() => void> = [];

  constructor(target: Window | HTMLElement = window) {
    const onDown = (event: Event): void => {
      const e = event as KeyboardEvent;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const code = e.code;
      const edge = EDGE_KEYS[code];
      const held = HELD_KEYS[code];
      if (!edge && !held && code !== "Enter") return;
      if (e.target instanceof HTMLElement && /^(input|textarea|select)$/i.test(e.target.tagName)) return;
      e.preventDefault();
      if (e.repeat) return;
      if (edge) this.edges.add(edge);
      if (code === "Space" || code === "Enter") this.edges.add("startPressed");
      if (held) {
        this.held.set(code, held);
        if (held === "thrust") this.edges.add("thrustPressed");
      }
    };
    const onUp = (event: Event): void => {
      this.held.delete((event as KeyboardEvent).code);
    };
    const onBlur = (): void => this.reset();
    target.addEventListener("keydown", onDown);
    target.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    this.disposers.push(
      () => target.removeEventListener("keydown", onDown),
      () => target.removeEventListener("keyup", onUp),
      () => window.removeEventListener("blur", onBlur)
    );
  }

  /** Press (`down`) or release an on-screen control. Edge actions fire once; held actions stay on until released. */
  inject(action: InputKey, down: boolean): void {
    if ((INPUT_HELD as readonly string[]).includes(action)) {
      if (down) {
        this.injected.set(action, 1);
        if (action === "thrust") this.edges.add("thrustPressed");
      } else this.injected.delete(action);
    } else if (down) this.edges.add(action);
  }

  poll(): InputFrame {
    const frame = emptyInput();
    for (const key of this.edges) frame[key] = true;
    this.edges.clear();
    for (const key of this.held.values()) frame[key] = true;
    for (const key of this.injected.keys()) frame[key] = true;
    return frame;
  }

  reset(): void {
    this.edges.clear();
    this.held.clear();
    this.injected.clear();
  }

  dispose(): void {
    for (const off of this.disposers) off();
    this.disposers.length = 0;
  }
}
