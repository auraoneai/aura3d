/**
 * Dev-only live feel-tuning overlay (`@aura3d/engine/devtools`).
 *
 * Auto-builds numeric sliders (`{ value, min, max, step }`) and enum switches (`{ value, options }`)
 * from a typed schema, persists overrides to storage keyed by their authored baseline (`{ value, was }`)
 * so stale browser overrides auto-invalidate as soon as source constants change, and exports a compact
 * `key baseline → value` diff block ready to paste into an agent or commit back to source.
 */

export interface AuraTuneNumberSpec {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly label?: string;
}

export interface AuraTuneChoiceSpec<V extends string = string> {
  readonly value: V;
  readonly options: readonly V[];
  readonly label?: string;
}

export type AuraTuneSpec = AuraTuneNumberSpec | AuraTuneChoiceSpec;
export type AuraTuneSchema = Readonly<Record<string, AuraTuneSpec>>;

export type AuraTuneValues<S extends AuraTuneSchema> = {
  [K in keyof S]: S[K] extends AuraTuneChoiceSpec<infer V>
    ? V
    : S[K] extends AuraTuneNumberSpec
      ? number
      : never;
};

export interface AuraTuneChangeEvent<S extends AuraTuneSchema = AuraTuneSchema, K extends keyof S & string = keyof S & string> {
  readonly id: string;
  readonly key: K;
  readonly value: AuraTuneValues<S>[K];
  readonly baseline: AuraTuneValues<S>[K];
  readonly values: Readonly<AuraTuneValues<S>>;
}

export interface AuraTuneStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface AuraTuneClipboardLike {
  writeText(text: string): Promise<void>;
}

export interface AuraTuneOverlayOptions<S extends AuraTuneSchema> {
  /** Stable game/scene identifier used for storage (`aura3d:tune:<id>`) and the exported diff header. */
  readonly id: string;
  /** Tuning entries in display order. */
  readonly schema: S;
  /** Called whenever a value changes via UI, `set()`, or `reset()`. */
  readonly onChange?: (event: AuraTuneChangeEvent<S>) => void;
  /** Mount host for the DOM panel and hint badge. Pass `null` for headless/state-only use. Default `document.body` when available. */
  readonly host?: HTMLElement | null;
  /** Keyboard `event.code` that toggles the panel, or `false` to disable the shortcut. Default `"Backquote"`. */
  readonly toggleKey?: string | false;
  /** Query parameter name that opens the panel on load (e.g. `?tune`), or `false` to disable. Default `"tune"`. */
  readonly autoOpenParam?: string | false;
  /** URL search string override for deterministic tests. Default `location.search`. */
  readonly search?: string;
  /** Storage backend override. Default `localStorage` when available, `null` disables persistence. */
  readonly storage?: AuraTuneStorageLike | null;
  /** Clipboard backend override. Default `navigator.clipboard` when available. */
  readonly clipboard?: AuraTuneClipboardLike | null;
  /** EventTarget receiving `CustomEvent("aura:tune", { detail })` on changes. Default `globalThis` when dispatch-capable. */
  readonly eventTarget?: Pick<EventTarget, "dispatchEvent"> | null;
  /** Hide the subtle `` ` tune `` corner hint (default: hidden automatically under WebDriver / headless user agents). */
  readonly hideHint?: boolean;
}

export interface AuraTuneOverlay<S extends AuraTuneSchema = AuraTuneSchema> {
  readonly id: string;
  readonly storageKey: string;
  /** Live current values (updated in place as controls move). */
  readonly values: Readonly<AuraTuneValues<S>>;
  /** Authored baseline values captured from `schema` at creation. */
  readonly baseline: Readonly<AuraTuneValues<S>>;
  /** Panel root element when mounted in a DOM host, else `null`. */
  readonly element: HTMLElement | null;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(force?: boolean): boolean;
  /** Programmatically set one key (snapped/validated against the schema). Returns `true` when accepted. */
  set<K extends keyof S & string>(key: K, value: AuraTuneValues<S>[K]): boolean;
  /** Persist current overrides (with `{ value, was: baseline }`) and copy `diffBlock()` to the clipboard when non-empty. */
  save(): Promise<{ readonly saved: boolean; readonly copied: boolean; readonly diff: string }>;
  /** Revert to last saved overrides, or to the authored `schema` baseline when `options.toBaseline` is `true`. */
  reset(options?: { readonly toBaseline?: boolean }): void;
  /** Multi-line agent-pastable diff block (`""` when every value matches its authored baseline). */
  diffBlock(): string;
  dispose(): void;
}

interface SavedTuneEntry {
  readonly value: unknown;
  readonly was: unknown;
}

type SavedTuneMap = Record<string, SavedTuneEntry>;

function isNumberSpec(spec: AuraTuneSpec): spec is AuraTuneNumberSpec {
  return (
    typeof spec.value === "number" &&
    "min" in spec &&
    "max" in spec &&
    "step" in spec &&
    typeof spec.min === "number" &&
    typeof spec.max === "number" &&
    typeof spec.step === "number" &&
    Number.isFinite(spec.value) &&
    Number.isFinite(spec.min) &&
    Number.isFinite(spec.max) &&
    Number.isFinite(spec.step) &&
    spec.step > 0 &&
    spec.min <= spec.max
  );
}

function isChoiceSpec(spec: AuraTuneSpec): spec is AuraTuneChoiceSpec {
  return (
    typeof spec.value === "string" &&
    "options" in spec &&
    Array.isArray(spec.options) &&
    spec.options.length > 1 &&
    spec.options.includes(spec.value)
  );
}

function stepDecimals(step: number): number {
  const text = String(step);
  const expMatch = /e-(\d+)$/i.exec(text);
  if (expMatch) return Number(expMatch[1]);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

function snapNumber(spec: AuraTuneNumberSpec, raw: number): number {
  const clamped = Math.min(spec.max, Math.max(spec.min, raw));
  const decimals = stepDecimals(spec.step);
  const steps = Math.round((clamped - spec.min) / spec.step);
  const snapped = Math.min(spec.max, Math.max(spec.min, spec.min + steps * spec.step));
  return Number(snapped.toFixed(decimals));
}

function isAutomatedBrowser(): boolean {
  if (typeof navigator === "undefined") return true;
  if ((navigator as { readonly webdriver?: boolean }).webdriver) return true;
  return /Headless/i.test(navigator.userAgent ?? "");
}

function defaultStorage(): AuraTuneStorageLike | null {
  try {
    if (typeof localStorage !== "undefined" && localStorage !== null) return localStorage;
  } catch {
    // Sandboxed iframes and opaque origins throw on property access.
  }
  return null;
}

function defaultClipboard(): AuraTuneClipboardLike | null {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard;
    }
  } catch {
    // Ignore restricted clipboard environments.
  }
  return null;
}

export function createAuraTuneOverlay<S extends AuraTuneSchema>(options: AuraTuneOverlayOptions<S>): AuraTuneOverlay<S> {
  const id = options.id.trim() || "scene";
  const storageKey = `aura3d:tune:${id}`;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const clipboard = options.clipboard === undefined ? defaultClipboard() : options.clipboard;
  const host = options.host === undefined ? (typeof document !== "undefined" ? document.body : null) : options.host;
  const doc = host?.ownerDocument ?? (typeof document !== "undefined" ? document : null);
  const toggleKey = options.toggleKey === undefined ? "Backquote" : options.toggleKey;
  const autoOpenParam = options.autoOpenParam === undefined ? "tune" : options.autoOpenParam;
  const search = options.search ?? (typeof location !== "undefined" ? location.search : "");
  const eventTarget =
    options.eventTarget === undefined
      ? typeof globalThis !== "undefined" && typeof (globalThis as { dispatchEvent?: unknown }).dispatchEvent === "function"
        ? (globalThis as unknown as Pick<EventTarget, "dispatchEvent">)
        : null
      : options.eventTarget;

  const keys = Object.keys(options.schema).filter((key) => {
    const spec = options.schema[key];
    return Boolean(spec) && (isNumberSpec(spec) || isChoiceSpec(spec));
  }) as Array<keyof S & string>;

  const baselineRecord: Record<string, unknown> = {};
  const liveRecord: Record<string, unknown> = {};
  for (const key of keys) {
    const spec = options.schema[key]!;
    const initial = isNumberSpec(spec) ? snapNumber(spec, spec.value) : spec.value;
    baselineRecord[key] = initial;
    liveRecord[key] = initial;
  }

  const coerceForKey = (key: keyof S & string, candidate: unknown): unknown | undefined => {
    const spec = options.schema[key];
    if (!spec) return undefined;
    if (isChoiceSpec(spec)) {
      return typeof candidate === "string" && spec.options.includes(candidate) ? candidate : undefined;
    }
    if (isNumberSpec(spec)) {
      const n = typeof candidate === "number" ? candidate : typeof candidate === "string" && candidate.trim() !== "" ? Number(candidate) : Number.NaN;
      return Number.isFinite(n) ? snapNumber(spec, n) : undefined;
    }
    return undefined;
  };

  // Self-invalidating saved overrides: an override survives only while `saved.was` still equals the
  // authored baseline in `schema`. Once an agent or developer edits the source constant, stale cache drops.
  let saved: SavedTuneMap = {};
  if (storage) {
    try {
      const parsed = JSON.parse(storage.getItem(storageKey) ?? "null") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const key of keys) {
          const entry = (parsed as Record<string, unknown>)[key] as SavedTuneEntry | undefined;
          if (!entry || typeof entry !== "object") continue;
          if (entry.was !== baselineRecord[key]) continue;
          const valid = coerceForKey(key, entry.value);
          if (valid !== undefined && valid !== baselineRecord[key]) {
            saved[key] = { value: valid, was: baselineRecord[key] };
            liveRecord[key] = valid;
          }
        }
      }
    } catch {
      saved = {};
    }
    try {
      if (Object.keys(saved).length > 0) storage.setItem(storageKey, JSON.stringify(saved));
      else storage.removeItem?.(storageKey);
    } catch {
      // Ignore quota/security errors.
    }
  }

  const valuesView = liveRecord as AuraTuneValues<S>;
  const baselineView = Object.freeze({ ...baselineRecord }) as Readonly<AuraTuneValues<S>>;

  const notifyChange = <K extends keyof S & string>(key: K): void => {
    const detail: AuraTuneChangeEvent<S, K> = {
      id,
      key,
      value: valuesView[key],
      baseline: baselineView[key],
      values: valuesView
    };
    options.onChange?.(detail);
    if (eventTarget && typeof CustomEvent === "function") {
      try {
        eventTarget.dispatchEvent(new CustomEvent("aura:tune", { detail }));
      } catch {
        // Ignore environments without constructible CustomEvent.
      }
    }
  };

  const diffBlock = (): string => {
    const changed = keys
      .filter((key) => liveRecord[key] !== baselineRecord[key])
      .map((key) => `${key} ${String(baselineRecord[key])} → ${String(liveRecord[key])}`);
    return changed.length > 0 ? [`Tuned in Aura3D: ${id}`, ...changed].join("\n") : "";
  };

  const FONT_CSS = "font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#f4f7fb;";
  let panelEl: HTMLDivElement | null = null;
  let hintEl: HTMLDivElement | null = null;
  let noteEl: HTMLDivElement | null = null;
  let outEl: HTMLTextAreaElement | null = null;
  let openState = false;
  let disposed = false;

  const rows = new Map<string, { input?: HTMLInputElement; buttons?: HTMLButtonElement[]; readout: HTMLSpanElement }>();

  const syncRowUi = (key: keyof S & string): void => {
    const row = rows.get(key);
    if (!row) return;
    const current = liveRecord[key];
    const base = baselineRecord[key];
    if (row.buttons) {
      for (const btn of row.buttons) {
        btn.style.background = btn.dataset.value === String(current) ? "rgba(56,132,255,0.45)" : "rgba(30,41,59,0.85)";
      }
    } else if (row.input) {
      row.input.value = String(current);
    }
    row.readout.textContent = current === base ? String(current) : `${String(current)} (was ${String(base)})`;
  };

  const setKey = <K extends keyof S & string>(key: K, rawValue: AuraTuneValues<S>[K]): boolean => {
    const coerced = coerceForKey(key, rawValue);
    if (coerced === undefined) return false;
    if (liveRecord[key] === coerced) {
      syncRowUi(key);
      return true;
    }
    liveRecord[key] = coerced;
    syncRowUi(key);
    notifyChange(key);
    return true;
  };

  const persistSaved = (): boolean => {
    if (!storage) return false;
    try {
      if (Object.keys(saved).length > 0) storage.setItem(storageKey, JSON.stringify(saved));
      else storage.removeItem?.(storageKey);
      return true;
    } catch {
      return false;
    }
  };

  const save = async (): Promise<{ readonly saved: boolean; readonly copied: boolean; readonly diff: string }> => {
    saved = {};
    for (const key of keys) {
      if (liveRecord[key] !== baselineRecord[key]) {
        saved[key] = { value: liveRecord[key], was: baselineRecord[key] };
      }
    }
    const stored = persistSaved();
    const diff = diffBlock();
    let copied = false;
    if (diff && clipboard) {
      try {
        await clipboard.writeText(diff);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (outEl) {
      outEl.value = diff;
      outEl.style.display = diff ? "block" : "none";
    }
    if (noteEl) {
      const prefix = stored ? "Saved in browser. " : "Updated diff. ";
      if (!diff) noteEl.textContent = `${prefix}Matches baseline.`;
      else noteEl.textContent = `${prefix}${copied ? "Copied diff block to clipboard." : "Copy diff block below."}`;
    }
    return { saved: stored, copied, diff };
  };

  const reset = (resetOptions?: { readonly toBaseline?: boolean }): void => {
    const toBaseline = resetOptions?.toBaseline ?? false;
    if (toBaseline) {
      saved = {};
      persistSaved();
    }
    for (const key of keys) {
      const target = !toBaseline && saved[key] !== undefined ? saved[key]!.value : baselineRecord[key];
      const changed = liveRecord[key] !== target;
      liveRecord[key] = target;
      syncRowUi(key);
      if (changed) notifyChange(key);
    }
    if (outEl) {
      const diff = diffBlock();
      outEl.value = diff;
      outEl.style.display = diff ? "block" : "none";
    }
    if (noteEl) {
      noteEl.textContent = !toBaseline && Object.keys(saved).length > 0 ? "Reverted to saved values." : "Reverted to baseline.";
    }
  };

  const buildPanel = (): HTMLDivElement | null => {
    if (!doc || !host) return null;
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, css = "", text?: string): HTMLElementTagNameMap[K] => {
      const el = doc.createElement(tag);
      if (css) el.style.cssText = css;
      if (text !== undefined) el.textContent = text;
      return el;
    };

    const panel = make(
      "div",
      [
        FONT_CSS,
        "position:fixed",
        "top:10px",
        "right:10px",
        "width:296px",
        "max-height:calc(100vh - 20px)",
        "overflow:auto",
        "box-sizing:border-box",
        "padding:10px 12px",
        "background:rgba(7,11,18,0.9)",
        "border:1px solid rgba(150,180,220,0.35)",
        "border-radius:8px",
        "z-index:2147483647",
        "display:none"
      ].join(";")
    );
    panel.className = "aura-tune-overlay";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", `Aura3D tune ${id}`);

    const header = make("div", "font-weight:700;margin-bottom:6px;", `Tune ${id}${toggleKey === "Backquote" ? " · ` to close" : ""}`);
    panel.append(header);

    if (keys.length === 0) {
      panel.append(make("div", "color:#9fb0c7;", "Schema has no numeric or multi-option entries."));
    }

    for (const key of keys) {
      const spec = options.schema[key]!;
      const row = make(isChoiceSpec(spec) ? "div" : "label", "display:block;margin:6px 0;");
      const top = make("div", "display:flex;justify-content:space-between;gap:8px;");
      const readout = make("span", "color:#93c5fd;");
      top.append(make("span", "", spec.label ?? key), readout);

      if (isChoiceSpec(spec)) {
        const bar = make("div", "display:flex;gap:6px;margin-top:3px;");
        bar.dataset.pick = key;
        const buttons: HTMLButtonElement[] = [];
        for (const option of spec.options) {
          const btn = make(
            "button",
            `${FONT_CSS}flex:1;border:1px solid rgba(150,180,220,0.35);border-radius:4px;padding:2px 4px;cursor:pointer;`,
            option
          );
          btn.type = "button";
          btn.dataset.value = option;
          btn.addEventListener("click", () => {
            setKey(key, option as AuraTuneValues<S>[typeof key]);
            btn.blur();
          });
          buttons.push(btn);
        }
        bar.append(...buttons);
        row.append(top, bar);
        panel.append(row);
        rows.set(key, { buttons, readout });
        syncRowUi(key);
        continue;
      }

      const input = make("input", "width:100%;margin:3px 0 0;");
      input.type = "range";
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.dataset.key = key;
      input.addEventListener("input", () => {
        setKey(key, Number(input.value) as AuraTuneValues<S>[typeof key]);
      });
      // Release focus so arrow/movement keys immediately return to the game.
      input.addEventListener("pointerup", () => input.blur());
      row.append(top, input);
      panel.append(row);
      rows.set(key, { input, readout });
      syncRowUi(key);
    }

    const actionBtn = (btnId: string, label: string, onClick: () => void): HTMLButtonElement => {
      const btn = make(
        "button",
        `${FONT_CSS}flex:1;background:rgba(30,41,59,0.9);border:1px solid rgba(150,180,220,0.35);border-radius:4px;padding:4px 6px;cursor:pointer;`,
        label
      );
      btn.type = "button";
      btn.dataset.action = btnId;
      btn.addEventListener("click", onClick);
      return btn;
    };

    const actions = make("div", "display:flex;gap:6px;margin-top:10px;");
    actions.append(
      actionBtn("save", "Save & Copy", () => void save()),
      actionBtn("reset", "Reset", () => reset({ toBaseline: false }))
    );
    noteEl = make("div", "margin-top:6px;color:#cbd5e1;");
    outEl = make(
      "textarea",
      `${FONT_CSS}display:none;width:100%;box-sizing:border-box;margin-top:6px;background:rgba(2,6,23,0.9);border:1px solid rgba(150,180,220,0.3);border-radius:4px;padding:4px;`
    );
    outEl.readOnly = true;
    outEl.rows = 4;
    panel.append(actions, noteEl, outEl);

    // Prevent keys typed inside the tuning UI from leaking into gameplay listeners.
    panel.addEventListener("keydown", (event) => event.stopPropagation());
    host.append(panel);
    return panel;
  };

  if (doc && host && !(options.hideHint ?? isAutomatedBrowser()) && toggleKey !== false) {
    hintEl = doc.createElement("div");
    hintEl.className = "aura-tune-hint";
    hintEl.style.cssText = `${FONT_CSS}position:fixed;right:8px;bottom:6px;opacity:0.45;pointer-events:none;z-index:2147483646;`;
    hintEl.textContent = toggleKey === "Backquote" ? "` tune" : `${toggleKey} tune`;
    host.append(hintEl);
  }

  const setOpen = (next: boolean): boolean => {
    if (disposed) return false;
    if (next && !panelEl) panelEl = buildPanel();
    openState = next;
    if (panelEl) panelEl.style.display = next ? "block" : "none";
    if (hintEl) hintEl.style.display = next ? "none" : "";
    return openState;
  };

  const win = doc?.defaultView ?? (typeof window !== "undefined" ? window : null);
  const onWindowKeyDown = (event: KeyboardEvent): void => {
    if (toggleKey === false || event.repeat) return;
    const matches = event.code === toggleKey || (!event.code && toggleKey === "Backquote" && event.key === "`");
    if (!matches) return;
    event.preventDefault();
    setOpen(!openState);
  };
  if (win && toggleKey !== false && typeof win.addEventListener === "function") {
    win.addEventListener("keydown", onWindowKeyDown, true);
  }

  if (autoOpenParam !== false && search) {
    const params = new URLSearchParams(search);
    if (params.has(autoOpenParam)) setOpen(true);
  }

  return {
    id,
    storageKey,
    values: valuesView,
    baseline: baselineView,
    get element() {
      return panelEl;
    },
    get isOpen() {
      return openState;
    },
    open() {
      setOpen(true);
    },
    close() {
      setOpen(false);
    },
    toggle(force) {
      return setOpen(force === undefined ? !openState : force);
    },
    set: setKey,
    save,
    reset,
    diffBlock,
    dispose() {
      if (disposed) return;
      disposed = true;
      openState = false;
      if (win && toggleKey !== false && typeof win.removeEventListener === "function") {
        win.removeEventListener("keydown", onWindowKeyDown, true);
      }
      panelEl?.remove();
      hintEl?.remove();
      panelEl = null;
      hintEl = null;
      rows.clear();
    }
  };
}
