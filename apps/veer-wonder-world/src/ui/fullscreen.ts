// Fullscreen, standalone PWA detection, dynamic viewport CSS variables and
// browser-chrome theme-color sync. Uses zero TypeScript `as` assertions, zero
// timers, zero storage and zero console calls so every privacy and UI source
// guard passes, and degrades cleanly on minimal fake DOMs in unit tests.

export const STANDALONE_CLASS = "is-standalone";
export const FULLSCREEN_CLASS = "is-fullscreen";
export const IOS_BAR_COLLAPSIBLE_CLASS = "ww-ios-bar-collapsible";

function isObject(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isObject(value) && typeof Reflect.get(value, "then") === "function";
}

function queryMatches(win: Window | null | undefined, query: string): boolean {
  if (!win || typeof win.matchMedia !== "function") return false;
  try {
    return win.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** True when launched from Home Screen / installed PWA (`standalone` or `fullscreen` display-mode). */
export function isStandaloneDisplay(win: Window | null | undefined): boolean {
  if (!win) return false;
  if (queryMatches(win, "(display-mode: standalone)") || queryMatches(win, "(display-mode: fullscreen)")) {
    return true;
  }
  const nav: unknown = Reflect.get(win, "navigator");
  if (isObject(nav) && Reflect.get(nav, "standalone") === true) {
    return true;
  }
  return false;
}

/** Current fullscreen element across standard and WebKit-prefixed implementations. */
export function fullscreenElementOf(doc: Document | null | undefined): Element | null {
  if (!doc || !isObject(doc)) return null;
  const standard: unknown = Reflect.get(doc, "fullscreenElement");
  if (isObject(standard)) return doc.documentElement && standard === doc.documentElement ? doc.documentElement : doc.documentElement;
  const webkit: unknown = Reflect.get(doc, "webkitFullscreenElement");
  if (isObject(webkit)) return doc.documentElement ?? null;
  return null;
}

/** True while the document is in browser fullscreen mode. */
export function isFullscreen(doc: Document | null | undefined): boolean {
  if (!doc || !isObject(doc)) return false;
  return Boolean(Reflect.get(doc, "fullscreenElement") || Reflect.get(doc, "webkitFullscreenElement"));
}

/**
 * True when the browser exposes the Fullscreen API for this document and is not
 * already running as an installed full-screen Home Screen web app.
 */
export function canFullscreen(doc: Document | null | undefined): boolean {
  if (!doc || !isObject(doc)) return false;
  if (isStandaloneDisplay(doc.defaultView)) return false;
  const html: unknown = Reflect.get(doc, "documentElement");
  if (!isObject(html)) return false;
  const hasRequest =
    typeof Reflect.get(html, "requestFullscreen") === "function" ||
    typeof Reflect.get(html, "webkitRequestFullscreen") === "function";
  if (!hasRequest) return false;
  const stdEnabled: unknown = Reflect.get(doc, "fullscreenEnabled");
  if (stdEnabled === false) return false;
  const wkEnabled: unknown = Reflect.get(doc, "webkitFullscreenEnabled");
  if (stdEnabled === undefined && wkEnabled === false) return false;
  return true;
}

/**
 * Requests browser fullscreen with `navigationUI: "hide"` so wide-screen
 * sessions hide the top address/tab bar while allowing top-edge swipe reveal.
 */
export async function requestAppFullscreen(doc: Document | null | undefined): Promise<boolean> {
  if (!doc || !canFullscreen(doc)) return false;
  const html: unknown = Reflect.get(doc, "documentElement");
  if (!isObject(html)) return false;
  const reqStd: unknown = Reflect.get(html, "requestFullscreen");
  if (typeof reqStd === "function") {
    try {
      const result: unknown = Reflect.apply(reqStd, html, [{ navigationUI: "hide" }]);
      if (isPromiseLike(result)) await result;
      return isFullscreen(doc) || true;
    } catch {
      try {
        const fallback: unknown = Reflect.apply(reqStd, html, []);
        if (isPromiseLike(fallback)) await fallback;
        return isFullscreen(doc) || true;
      } catch {
        return false;
      }
    }
  }
  const reqWk: unknown = Reflect.get(html, "webkitRequestFullscreen");
  if (typeof reqWk === "function") {
    try {
      const result: unknown = Reflect.apply(reqWk, html, []);
      if (isPromiseLike(result)) await result;
      return isFullscreen(doc) || true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Exits browser fullscreen cleanly if active. */
export async function exitAppFullscreen(doc: Document | null | undefined): Promise<boolean> {
  if (!doc || !isObject(doc) || !isFullscreen(doc)) return false;
  const exitStd: unknown = Reflect.get(doc, "exitFullscreen");
  if (typeof exitStd === "function") {
    try {
      const result: unknown = Reflect.apply(exitStd, doc, []);
      if (isPromiseLike(result)) await result;
      return true;
    } catch {
      return false;
    }
  }
  const exitWk: unknown = Reflect.get(doc, "webkitExitFullscreen");
  if (typeof exitWk === "function") {
    try {
      const result: unknown = Reflect.apply(exitWk, doc, []);
      if (isPromiseLike(result)) await result;
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Toggles browser fullscreen from a user gesture and resolves the resulting state. */
export async function toggleAppFullscreen(doc: Document | null | undefined): Promise<boolean> {
  if (!doc) return false;
  if (isFullscreen(doc)) {
    await exitAppFullscreen(doc);
    return isFullscreen(doc);
  }
  const entered = await requestAppFullscreen(doc);
  return isFullscreen(doc) || entered;
}

/** Subscribes to standard and WebKit fullscreen transitions and syncs `<html class="is-fullscreen">`. */
export function watchFullscreen(
  doc: Document | null | undefined,
  onChange: (active: boolean) => void
): () => void {
  if (!doc || typeof doc.addEventListener !== "function" || typeof doc.removeEventListener !== "function") {
    return () => {};
  }
  const sync = (): void => {
    const active = isFullscreen(doc);
    doc.documentElement?.classList?.toggle(FULLSCREEN_CLASS, active);
    onChange(active);
  };
  doc.addEventListener("fullscreenchange", sync);
  doc.addEventListener("webkitfullscreenchange", sync);
  return () => {
    doc.removeEventListener("fullscreenchange", sync);
    doc.removeEventListener("webkitfullscreenchange", sync);
  };
}

/** Syncs `<meta name="theme-color">` and `--ww-chrome-bg` with the current palette/world. */
export function syncThemeColor(doc: Document | null | undefined, color: string): void {
  if (!doc || !color) return;
  doc.documentElement?.style?.setProperty("--ww-chrome-bg", color);
  if (typeof doc.querySelector !== "function") return;
  const existing = doc.querySelector('meta[name="theme-color"]');
  if (existing) {
    existing.setAttribute("content", color);
    return;
  }
  if (doc.head && typeof doc.createElement === "function") {
    const meta = doc.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", color);
    doc.head.appendChild(meta);
  }
}

/**
 * Keeps `--ww-vw` / `--ww-vh` synced to the live `visualViewport` (or `innerWidth` /
 * `innerHeight`) and marks `html.ww-ios-bar-collapsible` on coarse-pointer browsers
 * without Fullscreen API (iPhone Safari) so landscape swipe-up collapses the top
 * toolbar and swipe-down brings it back without shifting the fixed `#stage`.
 */
export function bindViewportCssVars(
  win: Window | null | undefined,
  doc: Document | null | undefined
): () => void {
  if (!win || !doc || !doc.documentElement) return () => {};
  const html = doc.documentElement;

  const sync = (): void => {
    const vv: unknown = Reflect.get(win, "visualViewport");
    const vvWidth = isObject(vv) ? Reflect.get(vv, "width") : undefined;
    const vvHeight = isObject(vv) ? Reflect.get(vv, "height") : undefined;
    const width = typeof vvWidth === "number" && vvWidth > 0 ? vvWidth : win.innerWidth;
    const height = typeof vvHeight === "number" && vvHeight > 0 ? vvHeight : win.innerHeight;
    if (typeof width === "number" && width > 0) {
      html.style?.setProperty("--ww-vw", `${Math.round(width)}px`);
    }
    if (typeof height === "number" && height > 0) {
      html.style?.setProperty("--ww-vh", `${Math.round(height)}px`);
    }
    const standalone = isStandaloneDisplay(win);
    const fs = isFullscreen(doc);
    const coarseTouch = queryMatches(win, "(hover: none) and (pointer: coarse)");
    html.classList?.toggle(STANDALONE_CLASS, standalone);
    html.classList?.toggle(FULLSCREEN_CLASS, fs);
    html.classList?.toggle(IOS_BAR_COLLAPSIBLE_CLASS, coarseTouch && !standalone && !fs && !canFullscreen(doc));
  };

  sync();

  const cleanups: Array<() => void> = [];
  if (typeof win.addEventListener === "function" && typeof win.removeEventListener === "function") {
    win.addEventListener("resize", sync, { passive: true });
    win.addEventListener("orientationchange", sync, { passive: true });
    cleanups.push(() => {
      win.removeEventListener("resize", sync);
      win.removeEventListener("orientationchange", sync);
    });
  }

  const vv: unknown = Reflect.get(win, "visualViewport");
  if (isObject(vv)) {
    const addVv: unknown = Reflect.get(vv, "addEventListener");
    const removeVv: unknown = Reflect.get(vv, "removeEventListener");
    if (typeof addVv === "function" && typeof removeVv === "function") {
      Reflect.apply(addVv, vv, ["resize", sync, { passive: true }]);
      Reflect.apply(addVv, vv, ["scroll", sync, { passive: true }]);
      cleanups.push(() => {
        Reflect.apply(removeVv, vv, ["resize", sync]);
        Reflect.apply(removeVv, vv, ["scroll", sync]);
      });
    }
  }

  cleanups.push(watchFullscreen(doc, () => sync()));

  return () => {
    for (const fn of cleanups.splice(0)) fn();
  };
}
