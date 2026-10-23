/**
 * M-INPUT bindings: TypeScript transcription of apps/showcase-top-tennis/public/toptennis/controls.js.
 * Same storage key, version, validation rules, error messages and labels; pure (no DOM, storage is injected).
 */
import {
  CONTROLS_STORAGE_KEY, CONTROLS_VERSION, DEFAULT_CONTROLLER_BINDINGS, DEFAULT_KEYBOARD_BINDINGS,
  type ControllerAction, type ControllerBindings, type KeyboardAction, type KeyboardBindings,
} from "../contract/input";

export type ControlDevice = "keyboard" | "controller";
export type ControlAction = KeyboardAction | ControllerAction;

export interface ActionDefinition { readonly id: string; readonly label: string; readonly description: string }
export interface BindingError { readonly action: string | null; readonly input: string | number | null; readonly message: string }
export interface BindingValidation { readonly valid: boolean; readonly errors: BindingError[] }
export interface ApplyResult { readonly ok: boolean; readonly saved: boolean; readonly errors: BindingError[] }
export interface StorageLike { getItem(key: string): string | null; setItem?(key: string, value: string): void }
export type KeysDown = { readonly [code: string]: boolean | undefined } | undefined | null;
export type BindingsListener = (event: { device: ControlDevice; bindings: KeyboardBindings | ControllerBindings | null; saved: boolean }) => void;

const hasOwn = (target: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(target, key);

const def = (id: string, label: string, description: string): ActionDefinition => Object.freeze({ id, label, description });

export const ACTION_DEFINITIONS: { readonly keyboard: readonly ActionDefinition[]; readonly controller: readonly ActionDefinition[] } = Object.freeze({
  keyboard: Object.freeze([
    def("left", "Move / aim left", "Move left and aim shots left."),
    def("right", "Move / aim right", "Move right and aim shots right."),
    def("up", "Move forward / aim deep", "Move forward and aim deeper shots."),
    def("down", "Move back / aim short", "Move back and aim shorter shots."),
    def("hit", "Toss / hit", "Press to toss or swing. Press twice quickly for power."),
    def("power", "Power modifier", "Hold while pressing hit to add power."),
    def("short", "Prepare short shot", "Toggle the short-shot preset."),
    def("deep", "Prepare deep shot", "Toggle the deep-shot preset."),
    def("lob", "Lob swing", "Start a lob swing immediately when available."),
    def("placement", "Controlled placement", "Hold while aiming a normal or deep shot in supported offline difficulties."),
  ]),
  controller: Object.freeze([
    def("hit", "Toss / hit", "Press to toss or swing. Press twice quickly for power."),
    def("power", "Power modifier", "Hold while pressing hit to add power."),
    def("short", "Prepare short shot", "Toggle the short-shot preset."),
    def("deep", "Prepare deep shot", "Toggle the deep-shot preset."),
    def("lob", "Prepare / cancel lob", "Toggle a prepared lob, then press hit to swing."),
  ]),
});

const KEY_NAMES: Readonly<Record<string, string>> = Object.freeze({
  ArrowLeft: "Left arrow", ArrowRight: "Right arrow", ArrowUp: "Up arrow", ArrowDown: "Down arrow",
  Space: "Space", ShiftLeft: "Left Shift", ShiftRight: "Right Shift",
});
const XBOX_NAMES: readonly string[] = Object.freeze(["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View / Back", "Menu / Start", "Left stick click", "Right stick click", "D-pad up", "D-pad down", "D-pad left", "D-pad right", "Home"]);
const PLAYSTATION_NAMES: readonly string[] = Object.freeze(["Cross", "Circle", "Square", "Triangle", "L1", "R1", "L2", "R2", "Share", "Options", "L3", "R3", "D-pad up", "D-pad down", "D-pad left", "D-pad right", "PS"]);

type Profile = Record<string, unknown>;
const knownDevice = (device: unknown): device is ControlDevice => device === "keyboard" || device === "controller";

function cloneProfile(device: ControlDevice, profile: Profile): Profile {
  return Object.fromEntries(ACTION_DEFINITIONS[device].map(({ id }) => [id, device === "keyboard" ? [...(profile[id] as readonly unknown[])] : profile[id]]));
}
const allowedKey = (code: unknown): boolean =>
  typeof code === "string" && code !== "KeyP" && code !== "KeyF" && (/^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code) || hasOwn(KEY_NAMES, code));
const allowedButton = (index: unknown): boolean =>
  typeof index === "number" && Number.isInteger(index) && ((index >= 0 && index <= 7) || index === 10 || index === 11);

export function labelInput(input: unknown, device: ControlDevice = "keyboard", options: { playStation?: boolean } = {}): string {
  if (input === null || input === undefined) return "Unassigned";
  if (device === "controller") return (options.playStation ? PLAYSTATION_NAMES : XBOX_NAMES)[input as number] || `Button ${String(input)}`;
  if (typeof input !== "string") return String(input);
  if (hasOwn(KEY_NAMES, input)) return KEY_NAMES[input] as string;
  if (/^Key[A-Z]$/.test(input)) return input.slice(3);
  if (/^Digit[0-9]$/.test(input)) return input.slice(5);
  if (/^Numpad[0-9]$/.test(input)) return `Numpad ${input.slice(6)}`;
  return input;
}

export function validateBindings(device: string, profile: unknown): BindingValidation {
  const errors: BindingError[] = [];
  const fail = (action: string | null, input: string | number | null, message: string): void => { errors.push({ action, input, message }); };
  if (!knownDevice(device)) return { valid: false, errors: [{ action: null, input: null, message: "Unknown control device." }] };
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return { valid: false, errors: [{ action: null, input: null, message: "The control profile must contain every action." }] };
  }
  const record = profile as Profile;
  const ids = new Set(ACTION_DEFINITIONS[device].map(({ id }) => id));
  for (const id of Object.keys(record)) if (!ids.has(id)) fail(id, null, "Unknown control action.");
  const used = new Map<unknown, { id: string; label: string }>();
  for (const { id, label } of ACTION_DEFINITIONS[device]) {
    if (!hasOwn(record, id)) { fail(id, null, `${label} requires a binding.`); continue; }
    const value = record[id];
    if (device === "keyboard" && (!Array.isArray(value) || value.length !== 2)) {
      fail(id, null, `${label} needs a primary key and an optional alternate key.`); continue;
    }
    const inputs: unknown[] = device === "keyboard" ? (value as unknown[]) : [value];
    for (let slot = 0; slot < inputs.length; slot++) {
      const input = inputs[slot];
      if (device === "keyboard" && slot === 1 && input === null) continue;
      if (input === null || input === undefined || input === "") {
        fail(id, (input ?? null) as null | string, slot === 0 ? `${label} requires a primary ${device === "keyboard" ? "key" : "button"}.` : "Use a key or leave the alternate unassigned.");
        continue;
      }
      if (!(device === "keyboard" ? allowedKey(input) : allowedButton(input))) {
        const reserved = device === "keyboard" ? (input === "KeyP" ? "P is reserved for pause / options." : input === "KeyF" ? "F is reserved for fullscreen." : null) : null;
        fail(id, input as string | number, reserved || `${labelInput(input, device)} cannot be assigned. This input is reserved or unsupported.`);
        continue;
      }
      const previous = used.get(input);
      if (previous) fail(id, input as string | number, `${labelInput(input, device)} is already assigned to ${previous.label}.`);
      else used.set(input, { id, label });
    }
  }
  return { valid: errors.length === 0, errors };
}

export interface BindingsStore {
  actions(device: string): ActionDefinition[];
  defaults(device: string): KeyboardBindings | ControllerBindings | null;
  getBindings(device: string): KeyboardBindings | ControllerBindings | null;
  validateBindings: typeof validateBindings;
  applyBindings(device: string, profile: unknown): ApplyResult;
  actionForKey(code: unknown): KeyboardAction | null;
  isDown(action: string, keys: KeysDown): boolean;
  buttonFor(action: string): number | null;
  labelFor(action: string, device?: ControlDevice, options?: { all?: boolean; playStation?: boolean }): string;
  labelInput: typeof labelInput;
  subscribe(listener: BindingsListener): () => void;
}

export function createBindingsStore({ storage }: { storage?: StorageLike | null } = {}): BindingsStore {
  const profiles: { keyboard: Profile; controller: Profile } = {
    keyboard: cloneProfile("keyboard", DEFAULT_KEYBOARD_BINDINGS as unknown as Profile),
    controller: cloneProfile("controller", DEFAULT_CONTROLLER_BINDINGS as unknown as Profile),
  };
  const listeners = new Set<BindingsListener>();
  try {
    const stored = JSON.parse(storage?.getItem(CONTROLS_STORAGE_KEY) || "null") as Record<string, unknown> | null;
    if (stored && stored.version === CONTROLS_VERSION) {
      for (const device of ["keyboard", "controller"] as const) {
        if (validateBindings(device, stored[device]).valid) profiles[device] = cloneProfile(device, stored[device] as Profile);
      }
    }
  } catch { /* corrupt or unavailable storage keeps the defaults */ }

  const getBindings = (device: string): KeyboardBindings | ControllerBindings | null =>
    knownDevice(device) ? (cloneProfile(device, profiles[device]) as unknown as KeyboardBindings | ControllerBindings) : null;

  function applyBindings(device: string, profile: unknown): ApplyResult {
    const validation = validateBindings(device, profile);
    if (!validation.valid) return { ok: false, saved: false, errors: validation.errors };
    const known = device as ControlDevice;
    profiles[known] = cloneProfile(known, profile as Profile);
    let saved = false;
    try {
      if (typeof storage?.setItem === "function") {
        storage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify({ version: CONTROLS_VERSION, keyboard: profiles.keyboard, controller: profiles.controller }));
        saved = true;
      }
    } catch { /* storage may be full or blocked: bindings still apply for this session */ }
    for (const listener of listeners) {
      try { listener({ device: known, bindings: getBindings(known), saved }); } catch { /* a listener never breaks others */ }
    }
    return { ok: true, saved, errors: [] };
  }

  function actionForKey(code: unknown): KeyboardAction | null {
    if (typeof code !== "string") return null;
    const found = ACTION_DEFINITIONS.keyboard.find(({ id }) => (profiles.keyboard[id] as unknown[]).includes(code));
    return (found?.id as KeyboardAction | undefined) ?? null;
  }
  function isDown(action: string, keys: KeysDown): boolean {
    return hasOwn(profiles.keyboard, action) && (profiles.keyboard[action] as Array<string | null>).some((code) => code !== null && Boolean(keys?.[code]));
  }
  const buttonFor = (action: string): number | null => (hasOwn(profiles.controller, action) ? (profiles.controller[action] as number) : null);
  function labelFor(action: string, device: ControlDevice = "keyboard", options: { all?: boolean; playStation?: boolean } = {}): string {
    if (!knownDevice(device) || !hasOwn(profiles[device], action)) return "Unassigned";
    const inputs = device === "keyboard" ? (profiles[device][action] as unknown[]).filter((input) => input !== null) : [profiles[device][action]];
    return (options.all ? inputs : inputs.slice(0, 1)).map((input) => labelInput(input, device, options)).join(" / ");
  }
  return Object.freeze({
    actions: (device: string) => (knownDevice(device) ? ACTION_DEFINITIONS[device].map((action) => ({ ...action })) : []),
    defaults: (device: string) => (knownDevice(device)
      ? (cloneProfile(device, (device === "keyboard" ? DEFAULT_KEYBOARD_BINDINGS : DEFAULT_CONTROLLER_BINDINGS) as unknown as Profile) as unknown as KeyboardBindings | ControllerBindings)
      : null),
    getBindings, validateBindings, applyBindings, actionForKey, isDown, buttonFor, labelFor, labelInput,
    subscribe(listener: BindingsListener) { if (typeof listener !== "function") return () => undefined; listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
}
