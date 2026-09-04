import { InputSnapshot } from "./InputSnapshot";

export type ActionBinding =
  | { readonly type: "keyboard"; readonly code: string }
  | { readonly type: "keyboard-chord"; readonly codes: readonly string[] }
  | { readonly type: "pointer"; readonly button: number }
  | { readonly type: "gamepad-button"; readonly gamepad?: number; readonly button: number };

export type AxisBinding =
  | { readonly type: "keyboard-axis"; readonly negative: string; readonly positive: string; readonly scale?: number }
  | { readonly type: "pointer-axis"; readonly axis: "x" | "y" | "wheelX" | "wheelY"; readonly scale?: number }
  | { readonly type: "gamepad-axis"; readonly gamepad?: number; readonly axis: number; readonly scale?: number };

export interface SerializedActionBindings {
  readonly actions: Readonly<Record<string, readonly ActionBinding[]>>;
  readonly axes: Readonly<Record<string, readonly AxisBinding[]>>;
}

export interface ActionConflict {
  readonly code: string;
  readonly actions: readonly string[];
}

export class ActionMap {
  private readonly actions = new Map<string, readonly ActionBinding[]>();
  private readonly axes = new Map<string, readonly AxisBinding[]>();
  private readonly originalActions = new Map<string, readonly ActionBinding[] | undefined>();
  private readonly originalAxes = new Map<string, readonly AxisBinding[] | undefined>();
  private readonly listeners = new Set<() => void>();
  private snapshot = new InputSnapshot();

  bind(name: string, bindings: readonly ActionBinding[]): void {
    this.actions.set(name, [...bindings]);
    this.emitChange();
  }

  bindAxis(name: string, bindings: readonly AxisBinding[]): void {
    this.axes.set(name, [...bindings]);
    this.emitChange();
  }

  /**
   * Remapping hook for settings UI: replace one action's bindings. The bindings
   * present before the first `rebind`/`unbind` are kept as the shipped defaults
   * so `resetAction` can restore them. Plain `bind` (route setup, snapshot
   * restore) never records, so setup itself cannot poison reset.
   */
  rebind(name: string, bindings: readonly ActionBinding[]): void {
    if (!this.originalActions.has(name)) this.originalActions.set(name, this.actions.get(name));
    this.actions.set(name, [...bindings]);
    this.emitChange();
  }

  rebindAxis(name: string, bindings: readonly AxisBinding[]): void {
    if (!this.originalAxes.has(name)) this.originalAxes.set(name, this.axes.get(name));
    this.axes.set(name, [...bindings]);
    this.emitChange();
  }

  /** Remove an action entirely. Returns false when the action was not bound. */
  unbind(name: string): boolean {
    if (!this.originalActions.has(name)) this.originalActions.set(name, this.actions.get(name));
    if (!this.originalAxes.has(name)) this.originalAxes.set(name, this.axes.get(name));
    const removed = this.actions.delete(name);
    this.axes.delete(name);
    if (removed) this.emitChange();
    return removed;
  }

  /** Restore the shipped defaults for one action. Returns false when never remapped. */
  resetAction(name: string): boolean {
    const hadActions = this.originalActions.has(name);
    const hadAxes = this.originalAxes.has(name);
    if (!hadActions && !hadAxes) return false;
    if (hadActions) {
      const original = this.originalActions.get(name);
      if (original === undefined) this.actions.delete(name);
      else this.actions.set(name, [...original]);
      this.originalActions.delete(name);
    }
    if (hadAxes) {
      const original = this.originalAxes.get(name);
      if (original === undefined) this.axes.delete(name);
      else this.axes.set(name, [...original]);
      this.originalAxes.delete(name);
    }
    this.emitChange();
    return true;
  }

  /** Restore every remapped action to its shipped defaults. */
  resetAll(): void {
    for (const name of new Set([...this.originalActions.keys(), ...this.originalAxes.keys()])) {
      this.resetAction(name);
    }
  }

  actionNames(): readonly string[] {
    return [...new Set([...this.actions.keys(), ...this.axes.keys()])];
  }

  getBindings(name: string): readonly ActionBinding[] | undefined {
    const bindings = this.actions.get(name);
    return bindings ? [...bindings] : undefined;
  }

  getAxisBindings(name: string): readonly AxisBinding[] | undefined {
    const bindings = this.axes.get(name);
    return bindings ? [...bindings] : undefined;
  }

  /** Serialize for settings persistence (localStorage). Plain JSON data only. */
  serializeBindings(): SerializedActionBindings {
    return {
      actions: Object.fromEntries([...this.actions.entries()].map(([name, bindings]) => [name, [...bindings]])),
      axes: Object.fromEntries([...this.axes.entries()].map(([name, bindings]) => [name, [...bindings]]))
    };
  }

  /** Restore bindings serialized by `serializeBindings`. Throws on malformed data. */
  restoreBindings(data: SerializedActionBindings): void {
    if (!data || typeof data !== "object" || !data.actions || !data.axes) {
      throw new Error("Invalid action bindings snapshot: expected { actions, axes }.");
    }
    for (const [name, bindings] of Object.entries(data.actions)) {
      if (!Array.isArray(bindings) || !bindings.every(isActionBinding)) {
        throw new Error(`Invalid action bindings for "${name}".`);
      }
      this.bind(name, bindings);
    }
    for (const [name, bindings] of Object.entries(data.axes)) {
      if (!Array.isArray(bindings) || !bindings.every(isAxisBinding)) {
        throw new Error(`Invalid axis bindings for "${name}".`);
      }
      this.bindAxis(name, bindings);
    }
  }

  /**
   * Find keyboard codes / gamepad buttons claimed by more than one action so a
   * remapping UI can warn before saving a conflicting layout.
   */
  findConflicts(): readonly ActionConflict[] {
    const owners = new Map<string, Set<string>>();
    const claim = (key: string, action: string): void => {
      let set = owners.get(key);
      if (!set) {
        set = new Set();
        owners.set(key, set);
      }
      set.add(action);
    };
    for (const [name, bindings] of this.actions) {
      for (const binding of bindings) {
        if (binding.type === "keyboard") claim(`key:${binding.code}`, name);
        else if (binding.type === "keyboard-chord") {
          for (const code of binding.codes) claim(`key:${code}`, name);
        } else if (binding.type === "gamepad-button") {
          claim(`pad:${binding.gamepad ?? 0}:${binding.button}`, name);
        }
      }
    }
    const conflicts: ActionConflict[] = [];
    for (const [code, actions] of owners) {
      if (actions.size > 1) conflicts.push({ code, actions: [...actions].sort() });
    }
    return conflicts.sort((a, b) => (a.code < b.code ? -1 : 1));
  }

  /** Subscribe a remapping UI to binding changes. Returns an unsubscribe function. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  useSnapshot(snapshot: InputSnapshot): void {
    this.snapshot = snapshot;
  }

  down(name: string, snapshot = this.snapshot): boolean {
    return this.evaluate(name, snapshot, "down");
  }

  pressed(name: string, snapshot = this.snapshot): boolean {
    return this.evaluate(name, snapshot, "pressed");
  }

  released(name: string, snapshot = this.snapshot): boolean {
    return this.evaluate(name, snapshot, "released");
  }

  axis(name: string, snapshot = this.snapshot): number {
    let value = 0;

    for (const binding of this.axes.get(name) ?? []) {
      const scale = binding.scale ?? 1;
      if (binding.type === "keyboard-axis") {
        value += (snapshot.key(binding.positive).down ? 1 : 0) * scale;
        value -= (snapshot.key(binding.negative).down ? 1 : 0) * scale;
      } else if (binding.type === "pointer-axis") {
        const pointerValue =
          binding.axis === "x"
            ? snapshot.pointer.deltaX
            : binding.axis === "y"
              ? snapshot.pointer.deltaY
              : snapshot.pointer[binding.axis];
        value += pointerValue * scale;
      } else {
        const gamepad = snapshot.gamepads.find((pad) => pad.index === (binding.gamepad ?? 0));
        value += (gamepad?.axes[binding.axis] ?? 0) * scale;
      }
    }

    return value;
  }

  private emitChange(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private evaluate(name: string, snapshot: InputSnapshot, field: "down" | "pressed" | "released"): boolean {
    return (this.actions.get(name) ?? []).some((binding) => {
      if (binding.type === "keyboard") {
        return snapshot.key(binding.code)[field];
      }
      if (binding.type === "keyboard-chord") {
        return evaluateChord(binding.codes, snapshot, field);
      }
      if (binding.type === "pointer") {
        return snapshot.button(binding.button)[field];
      }
      return snapshot.gamepadButton(binding.gamepad ?? 0, binding.button)[field];
    });
  }
}

function isActionBinding(value: unknown): value is ActionBinding {
  if (!value || typeof value !== "object") return false;
  const binding = value as Record<string, unknown>;
  switch (binding.type) {
    case "keyboard":
      return typeof binding.code === "string";
    case "keyboard-chord":
      return Array.isArray(binding.codes) && binding.codes.every((code): code is string => typeof code === "string");
    case "pointer":
      return typeof binding.button === "number";
    case "gamepad-button":
      return typeof binding.button === "number" && (binding.gamepad === undefined || typeof binding.gamepad === "number");
    default:
      return false;
  }
}

function isAxisBinding(value: unknown): value is AxisBinding {
  if (!value || typeof value !== "object") return false;
  const binding = value as Record<string, unknown>;
  switch (binding.type) {
    case "keyboard-axis":
      return typeof binding.negative === "string" && typeof binding.positive === "string";
    case "pointer-axis":
      return binding.axis === "x" || binding.axis === "y" || binding.axis === "wheelX" || binding.axis === "wheelY";
    case "gamepad-axis":
      return typeof binding.axis === "number";
    default:
      return false;
  }
}

function evaluateChord(codes: readonly string[], snapshot: InputSnapshot, field: "down" | "pressed" | "released"): boolean {
  if (codes.length === 0) return false;
  const states = codes.map((code) => snapshot.key(code));
  if (field === "down") {
    return states.every((state) => state.down);
  }
  if (field === "pressed") {
    return states.every((state) => state.down) && states.some((state) => state.pressed);
  }
  return states.some((state) => state.released);
}
