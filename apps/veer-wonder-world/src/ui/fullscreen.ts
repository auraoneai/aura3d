// Fullscreen, standalone PWA detection, iPhone Safari landscape toolbar
// collapse, dynamic viewport CSS variables and browser-chrome theme-color sync.
// Uses zero TypeScript `as` assertions, zero timers, zero storage and zero
// console calls so every privacy and UI source guard passes, and degrades
// cleanly on minimal fake DOMs in unit tests.

export const STANDALONE_CLASS = "is-standalone";
export const FULLSCREEN_CLASS = "is-fullscreen";
export const IOS_BAR_COLLAPSIBLE_CLASS = "ww-ios-bar-collapsible";
export const IOS_BAR_EXPANDED_CLASS = "ww-ios-bar-expanded";
export const IOS_FULLBLEED_CLASS = "is-ios-fullbleed";
export const IOS_UNWRAP_SCROLL_CLASS = "ww-ios-unwrap-scroll";

export interface IosFullscreenStrings {
  readonly swipe: string;
  readonly home: string;
  readonly close: string;
}

const DEFAULT_IOS_STRINGS: IosFullscreenStrings = {
  swipe:
    "Swipe up on the scene or tap the address-bar menu \u2192 Hide Toolbar for full screen (swipe down from top to bring it back).",
  home: "For permanent full screen with no browser bar, choose Add to Home Screen in Safari.",
  close: "Got it"
};

const iosStateWatchers = new WeakMap<object, Set<(active: boolean) => void>>();

function notifyIosWatchers(doc: Document, active: boolean): void {
  const set = iosStateWatchers.get(doc);
  if (!set) return;
  for (const fn of [...set]) fn(active);
}

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

function scrollWindowY(win: Window | null | undefined, top: number): void {
  if (!win || !isObject(win)) return;
  const fn: unknown = Reflect.get(win, "scrollTo");
  if (typeof fn !== "function") return;
  try {
    Reflect.apply(fn, win, [0, top]);
  } catch {
    // Ignore environments without window scrolling.
  }
}

function readWindowScrollY(win: Window | null | undefined): number {
  if (!win || !isObject(win)) return 0;
  const sy: unknown = Reflect.get(win, "scrollY");
  if (typeof sy === "number" && Number.isFinite(sy)) return sy;
  const pyo: unknown = Reflect.get(win, "pageYOffset");
  if (typeof pyo === "number" && Number.isFinite(pyo)) return pyo;
  return 0;
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
  if (isObject(standard)) return doc.documentElement ?? null;
  const webkit: unknown = Reflect.get(doc, "webkitFullscreenElement");
  if (isObject(webkit)) return doc.documentElement ?? null;
  return null;
}

/** True while the document is in standard/WebKit browser fullscreen mode. */
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
 * True on coarse-pointer touch browsers without Fullscreen API and not yet
 * installed to Home Screen (iPhone Safari), where toolbar collapse comes from
 * root-document scroll or Safari's Hide Toolbar action.
 */
export function isIosBarCollapsible(doc: Document | null | undefined): boolean {
  if (!doc || !isObject(doc)) return false;
  const win = doc.defaultView;
  if (!win || isStandaloneDisplay(win) || canFullscreen(doc)) return false;
  return queryMatches(win, "(hover: none) and (pointer: coarse)");
}

/** True when iPhone Safari's landscape toolbar has retracted to full-bleed `100lvh`. */
export function isIosToolbarCollapsed(doc: Document | null | undefined): boolean {
  if (!doc || !doc.documentElement || !doc.documentElement.classList) return false;
  return doc.documentElement.classList.contains(IOS_FULLBLEED_CLASS);
}

/** True when the UI should offer a Full screen button (Fullscreen API or iPhone Safari tab). */
export function canFullscreenControl(doc: Document | null | undefined): boolean {
  return canFullscreen(doc) || isIosBarCollapsible(doc);
}

/** True when either Fullscreen API is active or iPhone Safari's landscape bar is collapsed. */
export function isEffectiveFullscreen(doc: Document | null | undefined): boolean {
  return isFullscreen(doc) || isIosToolbarCollapsed(doc);
}

/** Removes any open iPhone Safari fullscreen guidance banner. */
export function dismissIosFullscreenTip(doc: Document | null | undefined): void {
  if (!doc || typeof doc.querySelector !== "function") return;
  try {
    const existing = doc.querySelector('[data-ui="ios-fullscreen-tip"]');
    existing?.remove();
  } catch {
    // Ignore minimal fake DOMs.
  }
}

/** Shows the compact, swipe-through iPhone Safari fullscreen helper banner. */
export function showIosFullscreenTip(
  doc: Document | null | undefined,
  host: Element | null | undefined,
  strings: IosFullscreenStrings = DEFAULT_IOS_STRINGS
): boolean {
  if (!doc || typeof doc.createElement !== "function") return false;
  const container = host ?? doc.body;
  if (!container || typeof container.appendChild !== "function") return false;
  dismissIosFullscreenTip(doc);

  const tip = doc.createElement("div");
  tip.className = "ww-ios-fs-tip";
  tip.setAttribute("data-ui", "ios-fullscreen-tip");
  tip.setAttribute("role", "status");
  tip.setAttribute("aria-live", "polite");

  const copy = doc.createElement("div");
  copy.className = "ww-ios-fs-copy";

  const line1 = doc.createElement("p");
  line1.className = "ww-ios-fs-primary";
  line1.textContent = strings.swipe;

  const line2 = doc.createElement("p");
  line2.className = "ww-ios-fs-secondary";
  line2.textContent = strings.home;

  copy.appendChild(line1);
  copy.appendChild(line2);

  const closeBtn = doc.createElement("button");
  closeBtn.className = "ww-pill-button ww-ios-fs-close";
  closeBtn.setAttribute("type", "button");
  closeBtn.setAttribute("data-action", "dismiss-fullscreen-tip");
  closeBtn.textContent = strings.close;
  closeBtn.addEventListener("click", () => {
    tip.remove();
  });

  tip.appendChild(copy);
  tip.appendChild(closeBtn);
  container.appendChild(tip);
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

/**
 * Handles `[data-control="fullscreen"]` across both Fullscreen API browsers and
 * iPhone Safari tabs (nudging root scroll + toggling the auto-closing Hide
 * Toolbar / Swipe-up / Add to Home Screen helper when the top bar is visible).
 */
export async function toggleFullscreenControl(
  doc: Document | null | undefined,
  host?: Element | null,
  strings: IosFullscreenStrings = DEFAULT_IOS_STRINGS
): Promise<boolean> {
  if (!doc) return false;
  if (canFullscreen(doc)) {
    return toggleAppFullscreen(doc);
  }
  if (!isIosBarCollapsible(doc)) return false;
  const win = doc.defaultView;
  if (isIosToolbarCollapsed(doc)) {
    dismissIosFullscreenTip(doc);
    scrollWindowY(win, 0);
    return false;
  }
  scrollWindowY(win, 160);
  const existing = typeof doc.querySelector === "function" ? doc.querySelector('[data-ui="ios-fullscreen-tip"]') : null;
  if (existing) {
    existing.remove();
    return isEffectiveFullscreen(doc);
  }
  showIosFullscreenTip(doc, host ?? null, strings);
  return isEffectiveFullscreen(doc);
}

/**
 * Triggered inside `"Tap to start"` when already in landscape: enters Fullscreen
 * API where supported, or nudges iPhone Safari scroll and shows the auto-closing
 * swipe/Hide-Toolbar cue if Safari's top bar is still expanded.
 */
export function enterLandscapeFullMode(
  doc: Document | null | undefined,
  host?: Element | null,
  strings: IosFullscreenStrings = DEFAULT_IOS_STRINGS
): void {
  if (!doc) return;
  const win = doc.defaultView;
  if (!win || win.innerWidth <= win.innerHeight) return;
  if (canFullscreen(doc) && !isFullscreen(doc)) {
    void requestAppFullscreen(doc);
    return;
  }
  if (isIosBarCollapsible(doc) && !isIosToolbarCollapsed(doc)) {
    scrollWindowY(win, 160);
    if (doc.documentElement?.classList?.contains(IOS_BAR_EXPANDED_CLASS)) {
      showIosFullscreenTip(doc, host ?? null, strings);
    }
  }
}

/** Subscribes to standard/WebKit fullscreen and iPhone toolbar collapse transitions. */
export function watchFullscreen(
  doc: Document | null | undefined,
  onChange: (active: boolean) => void
): () => void {
  if (!doc || typeof doc.addEventListener !== "function" || typeof doc.removeEventListener !== "function") {
    return () => {};
  }
  const sync = (): void => {
    const active = isEffectiveFullscreen(doc);
    doc.documentElement?.classList?.toggle(FULLSCREEN_CLASS, active);
    if (active) dismissIosFullscreenTip(doc);
    onChange(active);
  };
  doc.addEventListener("fullscreenchange", sync);
  doc.addEventListener("webkitfullscreenchange", sync);
  let set = iosStateWatchers.get(doc);
  if (!set) {
    set = new Set();
    iosStateWatchers.set(doc, set);
  }
  set.add(onChange);
  return () => {
    doc.removeEventListener("fullscreenchange", sync);
    doc.removeEventListener("webkitfullscreenchange", sync);
    iosStateWatchers.get(doc)?.delete(onChange);
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

function createLvhProbe(doc: Document): HTMLElement | null {
  if (!doc.body || typeof doc.createElement !== "function" || typeof doc.body.appendChild !== "function") {
    return null;
  }
  const probe = doc.createElement("div");
  probe.setAttribute("data-ww-lvh-probe", "");
  probe.setAttribute("aria-hidden", "true");
  probe.style?.setProperty("position", "fixed");
  probe.style?.setProperty("top", "0");
  probe.style?.setProperty("left", "0");
  probe.style?.setProperty("width", "0");
  probe.style?.setProperty("height", "100lvh");
  probe.style?.setProperty("pointer-events", "none");
  probe.style?.setProperty("visibility", "hidden");
  doc.body.appendChild(probe);
  return probe;
}

function readProbeHeight(probe: HTMLElement | null): number {
  if (!probe) return 0;
  const rectFn: unknown = Reflect.get(probe, "getBoundingClientRect");
  if (typeof rectFn !== "function") return 0;
  try {
    const rect: unknown = Reflect.apply(rectFn, probe, []);
    const h = isObject(rect) ? Reflect.get(rect, "height") : 0;
    return typeof h === "number" && Number.isFinite(h) && h > 0 ? h : 0;
  } catch {
    return 0;
  }
}

/**
 * Keeps `--ww-vw` / `--ww-vh` synced to the live `visualViewport` (or `innerWidth` /
 * `innerHeight`), measures `100lvh` vs visible height to detect whether iPhone
 * Safari's landscape top bar is expanded or collapsed, and enables root-scroll
 * swipe-up collapse + swipe-down restore without shifting the fixed `#stage`.
 */
export function bindViewportCssVars(
  win: Window | null | undefined,
  doc: Document | null | undefined
): () => void {
  if (!win || !doc || !doc.documentElement) return () => {};
  const html = doc.documentElement;
  const lvhProbe = createLvhProbe(doc);
  let lastEffectiveFs = isEffectiveFullscreen(doc);

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
    const iosCollapsible = coarseTouch && !standalone && !fs && !canFullscreen(doc);
    const isLandscape = typeof width === "number" && typeof height === "number" && width > height;
    const lvhPx = readProbeHeight(lvhProbe);
    const barExpanded = iosCollapsible && isLandscape && lvhPx > 0 && lvhPx - height > 18;
    const iosFullbleed = iosCollapsible && isLandscape && lvhPx > 0 && lvhPx - height <= 18;
    const scrollY = readWindowScrollY(win);
    const unwrapScroll = barExpanded && scrollY < 80;
    const effectiveFs = fs || iosFullbleed;

    html.classList?.toggle(STANDALONE_CLASS, standalone);
    html.classList?.toggle(FULLSCREEN_CLASS, effectiveFs);
    html.classList?.toggle(IOS_BAR_COLLAPSIBLE_CLASS, iosCollapsible);
    html.classList?.toggle(IOS_BAR_EXPANDED_CLASS, barExpanded);
    html.classList?.toggle(IOS_FULLBLEED_CLASS, iosFullbleed);
    html.classList?.toggle(IOS_UNWRAP_SCROLL_CLASS, unwrapScroll);

    if (effectiveFs) {
      dismissIosFullscreenTip(doc);
    }
    if (effectiveFs !== lastEffectiveFs) {
      lastEffectiveFs = effectiveFs;
      notifyIosWatchers(doc, effectiveFs);
    }
  };

  sync();

  const cleanups: Array<() => void> = [];
  if (lvhProbe) {
    cleanups.push(() => {
      lvhProbe.remove();
    });
  }
  if (typeof win.addEventListener === "function" && typeof win.removeEventListener === "function") {
    win.addEventListener("resize", sync, { passive: true });
    win.addEventListener("scroll", sync, { passive: true });
    win.addEventListener("orientationchange", sync, { passive: true });
    cleanups.push(() => {
      win.removeEventListener("resize", sync);
      win.removeEventListener("scroll", sync);
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
