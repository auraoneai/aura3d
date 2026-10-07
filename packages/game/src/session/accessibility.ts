/**
 * session/accessibility.ts — PRD-09 day-0.
 *
 * Sourced from matchMedia, overridable per-game by the player; overrides are
 * persisted under `a3g:<id>:settings:v1` in localStorage. Change listeners on
 * the media queries re-apply base values (persisted overrides still win).
 */

export interface AccessibilitySettings {
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;
  readonly highContrast: boolean;
}

export type AccessibilityKey = keyof AccessibilitySettings;

export interface AccessibilityController {
  readonly values: AccessibilitySettings;
  set(key: AccessibilityKey, value: boolean): void;
  onChange(cb: (values: AccessibilitySettings) => void): () => void;
  dispose(): void;
}

interface MediaLike {
  readonly matches: boolean;
  addEventListener?(type: "change", cb: (e: { matches: boolean }) => void): void;
  addListener?(cb: (e: { matches: boolean }) => void): void;
  removeEventListener?(type: "change", cb: (e: { matches: boolean }) => void): void;
  removeListener?(cb: (e: { matches: boolean }) => void): void;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AccessibilityDeps {
  readonly storage?: StorageLike | null;
  readonly matchMedia?: (query: string) => MediaLike | null;
}

const match = (query: string): MediaLike | null => {
  try {
    if (typeof matchMedia === "function") return matchMedia(query) as MediaLike;
  } catch {
    /* non-DOM environment */
  }
  return null;
};

const storageFor = (): StorageLike | null => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};

export function createAccessibility(gameId: string, deps?: AccessibilityDeps): AccessibilityController {
  const storageKey = `a3g:${gameId}:settings:v1`;
  const mediaFn = deps?.matchMedia ?? match;
  const reducedMotionQuery = mediaFn("(prefers-reduced-motion: reduce)");
  const contrastQuery = mediaFn("(prefers-contrast: more)") ?? mediaFn("(forced-colors: active)");
  const storage = deps?.storage !== undefined ? deps.storage : storageFor();

  const mediaValues = (): AccessibilitySettings => ({
    reducedMotion: reducedMotionQuery?.matches ?? false,
    reducedFlash: reducedMotionQuery?.matches ?? false,
    highContrast: contrastQuery?.matches ?? false
  });

  const readOverrides = (): Partial<AccessibilitySettings> => {
    try {
      const raw = storage?.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Partial<AccessibilitySettings>) : {};
    } catch {
      return {};
    }
  };
  // In-memory copy — the source of truth when localStorage is unavailable.
  const overrideMap: { [K in AccessibilityKey]?: boolean } = readOverrides();

  const merged = (): AccessibilitySettings => ({ ...mediaValues(), ...overrideMap });
  let values: AccessibilitySettings = merged();
  const listeners = new Set<(v: AccessibilitySettings) => void>();
  const emit = () => {
    for (const cb of [...listeners]) cb(values);
  };

  const onMediaChange = () => {
    values = merged();
    emit();
  };
  const mediaQueries = [reducedMotionQuery, contrastQuery].filter((q): q is MediaLike => q !== null);
  for (const q of mediaQueries) {
    q.addEventListener?.("change", onMediaChange) ?? q.addListener?.(onMediaChange);
  }

  return {
    get values() {
      return values;
    },
    set(key: AccessibilityKey, value: boolean) {
      overrideMap[key] = value;
      try {
        storage?.setItem(storageKey, JSON.stringify(overrideMap));
      } catch {
        /* storage unavailable — keep in-memory */
      }
      values = merged();
      emit();
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose() {
      listeners.clear();
      for (const q of mediaQueries) {
        q.removeEventListener?.("change", onMediaChange) ?? q.removeListener?.(onMediaChange);
      }
    }
  };
}
