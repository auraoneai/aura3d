/**
 * createBindingStore: validated, persisted, rebindable input bindings for games (keyboard primary + optional alternate
 * keys, controller buttons), with reserved keys and conflict detection. Extracted from the Aura Slam 3D controls store
 * (controls.js), which it reproduces exactly when configured with that game's actions.
 *
 * Pure: no DOM; storage is injected (`localStorage` in a browser). Corrupt, wrong-version or invalid stored data falls
 * back to the defaults per device; write failures never throw and are reported as `saved: false`.
 *
 * TODO(WP-1): export through the public `@aura3d/engine/game` subpath once the game kit is published.
 */

export interface BindingStorage { getItem(key: string): string | null; setItem?(key: string, value: string): void }

export interface BindingActionDefinition { readonly id: string; readonly label: string; readonly description?: string }

export type KeyBinding = readonly [primary: string, alternate: string | null];
export type ButtonBinding = number;

export interface BindingDeviceConfig {
  /** `keys`: each action has `[primary, alternate | null]`; `buttons`: each action has one button index. */
  readonly kind: "keys" | "buttons";
  readonly actions: readonly BindingActionDefinition[];
  readonly defaults: Readonly<Record<string, KeyBinding | ButtonBinding>>;
  /** Keys (or button indices as strings) that can never be assigned, with the message to show. */
  readonly reserved?: Readonly<Record<string, string>>;
  /** Display names for non-letter keys, e.g. `{ Space: "Space", ArrowLeft: "Left arrow" }`. Also whitelists them. */
  readonly namedKeys?: Readonly<Record<string, string>>;
  /** Extra key predicate; the default allows KeyA-Z, Digit0-9, Numpad0-9 and every `namedKeys` entry. */
  readonly allowedKey?: (code: string) => boolean;
  /** Button predicate; the default allows integers 0..15. */
  readonly allowedButton?: (index: number) => boolean;
  /** Names for button indices (e.g. an Xbox and a PlayStation table) chosen by `labelFor(..., { variant })`. */
  readonly buttonNames?: Readonly<Record<string, readonly string[]>>;
}

export interface BindingError { readonly action: string | null; readonly input: string | number | null; readonly message: string }
export interface BindingValidation { readonly valid: boolean; readonly errors: BindingError[] }
export interface BindingApplyResult { readonly ok: boolean; readonly saved: boolean; readonly errors: BindingError[] }
export type BindingProfile = Readonly<Record<string, KeyBinding | ButtonBinding>>;
export type BindingListener = (event: { device: string; bindings: BindingProfile | null; saved: boolean }) => void;

export interface BindingStoreOptions {
  readonly devices: Readonly<Record<string, BindingDeviceConfig>>;
  readonly storageKey: string;
  readonly version: number;
  readonly storage?: BindingStorage | null;
}

export interface BindingStore {
  devices(): string[];
  actions(device: string): BindingActionDefinition[];
  defaults(device: string): BindingProfile | null;
  getBindings(device: string): BindingProfile | null;
  validate(device: string, profile: unknown): BindingValidation;
  apply(device: string, profile: unknown): BindingApplyResult;
  /** Which action a key code triggers on a `keys` device (the first one by default). */
  actionForKey(code: unknown, device?: string): string | null;
  isDown(action: string, keys: { readonly [code: string]: boolean | undefined } | null | undefined, device?: string): boolean;
  buttonFor(action: string, device?: string): number | null;
  labelFor(action: string, device?: string, options?: { all?: boolean; variant?: string }): string;
  labelInput(input: unknown, device: string, options?: { variant?: string }): string;
  subscribe(listener: BindingListener): () => void;
}

const hasOwn = (target: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(target, key);
const DEFAULT_KEY = /^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/;

export function createBindingStore(options: BindingStoreOptions): BindingStore {
  const { devices: configs, storageKey, version, storage } = options;
  const known = (device: unknown): device is string => typeof device === "string" && hasOwn(configs, device);
  const clone = (device: string, profile: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries((configs[device] as BindingDeviceConfig).actions.map(({ id }) => [id, (configs[device] as BindingDeviceConfig).kind === "keys" ? [...(profile[id] as readonly unknown[])] : profile[id]]));

  const allowedKey = (config: BindingDeviceConfig, code: unknown): boolean =>
    typeof code === "string" && !(config.reserved && hasOwn(config.reserved, code))
    && (DEFAULT_KEY.test(code) || Boolean(config.namedKeys && hasOwn(config.namedKeys, code)) || Boolean(config.allowedKey?.(code)));
  const allowedButton = (config: BindingDeviceConfig, index: unknown): boolean =>
    typeof index === "number" && Number.isInteger(index) && !(config.reserved && hasOwn(config.reserved, String(index)))
    && (config.allowedButton ? config.allowedButton(index) : index >= 0 && index <= 15);

  function labelInput(input: unknown, device: string, labelOptions: { variant?: string } = {}): string {
    if (input === null || input === undefined) return "Unassigned";
    const config = configs[device];
    if (!config) return String(input);
    if (config.kind === "buttons") {
      const names = config.buttonNames?.[labelOptions.variant ?? "default"] ?? config.buttonNames?.default;
      return names?.[input as number] || `Button ${String(input)}`;
    }
    if (typeof input !== "string") return String(input);
    if (config.namedKeys && hasOwn(config.namedKeys, input)) return config.namedKeys[input] as string;
    if (/^Key[A-Z]$/.test(input)) return input.slice(3);
    if (/^Digit[0-9]$/.test(input)) return input.slice(5);
    if (/^Numpad[0-9]$/.test(input)) return `Numpad ${input.slice(6)}`;
    return input;
  }

  function validate(device: string, profile: unknown): BindingValidation {
    const errors: BindingError[] = [];
    const fail = (action: string | null, input: string | number | null, message: string): void => { errors.push({ action, input, message }); };
    if (!known(device)) return { valid: false, errors: [{ action: null, input: null, message: "Unknown control device." }] };
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) return { valid: false, errors: [{ action: null, input: null, message: "The control profile must contain every action." }] };
    const config = configs[device] as BindingDeviceConfig;
    const record = profile as Record<string, unknown>;
    const ids = new Set(config.actions.map(({ id }) => id));
    for (const id of Object.keys(record)) if (!ids.has(id)) fail(id, null, "Unknown control action.");
    const used = new Map<unknown, string>();
    const keys = config.kind === "keys";
    for (const { id, label } of config.actions) {
      if (!hasOwn(record, id)) { fail(id, null, `${label} requires a binding.`); continue; }
      const value = record[id];
      if (keys && (!Array.isArray(value) || value.length !== 2)) { fail(id, null, `${label} needs a primary key and an optional alternate key.`); continue; }
      const inputs: unknown[] = keys ? (value as unknown[]) : [value];
      for (let slot = 0; slot < inputs.length; slot++) {
        const input = inputs[slot];
        if (keys && slot === 1 && input === null) continue;
        if (input === null || input === undefined || input === "") {
          fail(id, (input ?? null) as null | string, slot === 0 ? `${label} requires a primary ${keys ? "key" : "button"}.` : "Use a key or leave the alternate unassigned.");
          continue;
        }
        if (!(keys ? allowedKey(config, input) : allowedButton(config, input))) {
          const reservedMessage = typeof input === "string" || typeof input === "number" ? config.reserved?.[String(input)] : undefined;
          fail(id, input as string | number, reservedMessage || `${labelInput(input, device)} cannot be assigned. This input is reserved or unsupported.`);
          continue;
        }
        const previous = used.get(input);
        if (previous) fail(id, input as string | number, `${labelInput(input, device)} is already assigned to ${previous}.`);
        else used.set(input, label);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  const profiles: Record<string, Record<string, unknown>> = {};
  for (const device of Object.keys(configs)) profiles[device] = clone(device, (configs[device] as BindingDeviceConfig).defaults as Record<string, unknown>);
  const listeners = new Set<BindingListener>();
  try {
    const stored = JSON.parse(storage?.getItem(storageKey) || "null") as Record<string, unknown> | null;
    if (stored && stored.version === version) {
      for (const device of Object.keys(configs)) {
        if (validate(device, stored[device]).valid) profiles[device] = clone(device, stored[device] as Record<string, unknown>);
      }
    }
  } catch { /* corrupt or unavailable storage keeps the defaults */ }

  const getBindings = (device: string): BindingProfile | null => (known(device) ? (clone(device, profiles[device] as Record<string, unknown>) as BindingProfile) : null);
  const firstOf = (kind: "keys" | "buttons"): string | undefined => Object.keys(configs).find((d) => (configs[d] as BindingDeviceConfig).kind === kind);

  function apply(device: string, profile: unknown): BindingApplyResult {
    const validation = validate(device, profile);
    if (!validation.valid) return { ok: false, saved: false, errors: validation.errors };
    profiles[device] = clone(device, profile as Record<string, unknown>);
    let saved = false;
    try {
      if (typeof storage?.setItem === "function") {
        storage.setItem(storageKey, JSON.stringify({ version, ...profiles }));
        saved = true;
      }
    } catch { /* storage may be full or blocked: bindings still apply for this session */ }
    for (const listener of listeners) { try { listener({ device, bindings: getBindings(device), saved }); } catch { /* a listener never breaks others */ } }
    return { ok: true, saved, errors: [] };
  }

  return Object.freeze({
    devices: () => Object.keys(configs),
    actions: (device: string) => (known(device) ? (configs[device] as BindingDeviceConfig).actions.map((a) => ({ ...a })) : []),
    defaults: (device: string) => (known(device) ? (clone(device, (configs[device] as BindingDeviceConfig).defaults as Record<string, unknown>) as BindingProfile) : null),
    getBindings, validate, apply,
    actionForKey(code: unknown, device = firstOf("keys")): string | null {
      if (typeof code !== "string" || !device || !known(device)) return null;
      const found = (configs[device] as BindingDeviceConfig).actions.find(({ id }) => ((profiles[device] as Record<string, unknown>)[id] as unknown[]).includes(code));
      return found?.id ?? null;
    },
    isDown(action: string, keys: { readonly [code: string]: boolean | undefined } | null | undefined, device = firstOf("keys")): boolean {
      if (!device || !known(device)) return false;
      const profile = profiles[device] as Record<string, unknown>;
      return hasOwn(profile, action) && (profile[action] as Array<string | null>).some((code) => code !== null && Boolean(keys?.[code]));
    },
    buttonFor(action: string, device = firstOf("buttons")): number | null {
      if (!device || !known(device)) return null;
      const profile = profiles[device] as Record<string, unknown>;
      return hasOwn(profile, action) ? (profile[action] as number) : null;
    },
    labelFor(action: string, device = firstOf("keys"), labelOptions: { all?: boolean; variant?: string } = {}): string {
      if (!device || !known(device) || !hasOwn(profiles[device] as object, action)) return "Unassigned";
      const config = configs[device] as BindingDeviceConfig;
      const value = (profiles[device] as Record<string, unknown>)[action];
      const inputs = config.kind === "keys" ? (value as unknown[]).filter((input) => input !== null) : [value];
      return (labelOptions.all ? inputs : inputs.slice(0, 1)).map((input) => labelInput(input, device, labelOptions)).join(" / ");
    },
    labelInput,
    subscribe(listener: BindingListener) { if (typeof listener !== "function") return () => undefined; listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
}
