/** Small DOM helpers shared by the UI modules. Pure view models never import this file. */
export const byId = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`aura-slam: missing #${id}`);
  return el as T;
};
export const maybeById = <T extends HTMLElement = HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

/** Write text only when it changed (game.js `hudText`): avoids layout churn at 60 fps. */
export function createTextWriter(): (id: string, value: string | number) => void {
  const cache = new Map<string, string>();
  return (id, value) => {
    const text = String(value);
    if (cache.get(id) !== text) {
      byId(id).textContent = text;
      cache.set(id, text);
    }
  };
}

export const setInert = (el: HTMLElement, inert: boolean): void => {
  (el as HTMLElement & { inert: boolean }).inert = inert;
};

/** Show or hide with the original markup's `hidden` + `inert` pairing. */
export function setVisible(el: HTMLElement, show: boolean): void {
  el.hidden = !show;
  setInert(el, !show);
}

/** A `matchMedia` result cached with a `change` listener, so per-frame code never calls `matchMedia` (C12). */
export function cachedMediaQuery(query: string): { matches(): boolean; dispose(): void } {
  const list = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
  let value = Boolean(list?.matches);
  const onChange = (event: MediaQueryListEvent): void => { value = event.matches; };
  list?.addEventListener?.("change", onChange);
  return { matches: () => value, dispose: () => list?.removeEventListener?.("change", onChange) };
}
