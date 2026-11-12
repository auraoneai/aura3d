/// <reference types="node" />
// Widescreen, Apple TV 16:9/21:9 full-bleed diorama & UI layout, Fullscreen API
// swipe-back toggle, iOS Safari toolbar collapse, dynamic theme-color sync, and
// standalone Home Screen PWA manifest checks.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scene } from "@aura3d/engine";
import { describe, expect, it } from "vitest";
import { frameCamera } from "../../../src/scenes/spots.js";
import { buildWorld, WORLD_IDS } from "../../../src/scenes/worlds.js";
import { ENGLISH_ONLY } from "../../../src/ui/accessibility.js";
import { mountChildControls } from "../../../src/ui/child-controls.js";
import { showEpisodeMenu } from "../../../src/ui/episode-menu.js";
import {
  FULLSCREEN_CLASS,
  IOS_BAR_COLLAPSIBLE_CLASS,
  IOS_BAR_EXPANDED_CLASS,
  IOS_FULLBLEED_CLASS,
  IOS_UNWRAP_SCROLL_CLASS,
  STANDALONE_CLASS,
  bindViewportCssVars,
  canFullscreen,
  canFullscreenControl,
  isEffectiveFullscreen,
  isFullscreen,
  isStandaloneDisplay,
  requestAppFullscreen,
  syncThemeColor,
  toggleAppFullscreen
} from "../../../src/ui/fullscreen.js";
import { showStartScreen } from "../../../src/ui/start-screen.js";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface MockFsDocOptions {
  readonly fullscreenSupported?: boolean;
  readonly standalone?: boolean;
  readonly coarsePointer?: boolean;
  readonly innerWidth?: number;
  readonly innerHeight?: number;
  readonly lvhHeight?: number;
}

class MockNode {
  parentNode: MockNode | null = null;
  readonly children: MockNode[] = [];
  readonly dataset: Record<string, string | undefined> = {};
  readonly attrs = new Map<string, string>();
  disabled = false;
  title = "";
  private ownText = "";
  private readonly listeners = new Map<string, Array<(ev: { type: string; timeStamp: number; target: MockNode; preventDefault(): void }) => void>>();

  readonly style = {
    props: new Map<string, string>(),
    setProperty(k: string, v: string): void {
      this.props.set(k, v);
    },
    getPropertyValue(k: string): string {
      return this.props.get(k) ?? "";
    },
    removeProperty(k: string): void {
      this.props.delete(k);
    }
  };

  readonly classList = {
    owner: null as MockNode | null,
    tokens(): string[] {
      return (this.owner?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
    },
    contains(c: string): boolean {
      return this.tokens().includes(c);
    },
    add(...cs: string[]): void {
      this.owner?.setAttribute("class", [...new Set([...this.tokens(), ...cs])].join(" "));
    },
    remove(...cs: string[]): void {
      this.owner?.setAttribute("class", this.tokens().filter((t) => !cs.includes(t)).join(" "));
    },
    toggle(c: string, force?: boolean): boolean {
      const on = force ?? !this.contains(c);
      if (on) this.add(c);
      else this.remove(c);
      return on;
    }
  };

  constructor(
    readonly ownerDocument: MockDoc,
    readonly localName: string
  ) {
    this.classList.owner = this;
  }

  get hidden(): boolean {
    return this.attrs.has("hidden");
  }
  set hidden(v: boolean) {
    if (v) this.attrs.set("hidden", "");
    else this.attrs.delete("hidden");
  }

  get className(): string {
    return this.getAttribute("class") ?? "";
  }
  set className(v: string) {
    this.setAttribute("class", v);
  }

  get textContent(): string {
    return this.ownText + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v: string) {
    for (const c of this.children) c.parentNode = null;
    this.children.length = 0;
    this.ownText = v;
  }

  setAttribute(k: string, v: string): void {
    this.attrs.set(k, String(v));
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  hasAttribute(k: string): boolean {
    return this.attrs.has(k);
  }
  removeAttribute(k: string): void {
    this.attrs.delete(k);
  }
  toggleAttribute(k: string, force: boolean): void {
    if (force) this.setAttribute(k, "");
    else this.removeAttribute(k);
  }
  appendChild(child: MockNode): MockNode {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...kids: MockNode[]): void {
    for (const k of kids) this.appendChild(k);
  }
  remove(): void {
    if (!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx >= 0) this.parentNode.children.splice(idx, 1);
    this.parentNode = null;
  }
  focus(): void {}
  getBoundingClientRect(): { width: number; height: number } {
    if (this.hasAttribute("data-ww-lvh-probe") && this.ownerDocument.lvhHeight > 0) {
      return { width: 0, height: this.ownerDocument.lvhHeight };
    }
    return { width: 0, height: 0 };
  }
  addEventListener(type: string, fn: (ev: { type: string; timeStamp: number; target: MockNode; preventDefault(): void }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  removeEventListener(): void {}
  click(timeStamp = 1000): void {
    for (const fn of this.listeners.get("click") ?? []) {
      fn({ type: "click", timeStamp, target: this, preventDefault() {} });
    }
  }
  querySelectorAll(sel: string): MockNode[] {
    const out: MockNode[] = [];
    const matchSingle = (node: MockNode, s: string): boolean => {
      const trimmed = s.trim();
      if (trimmed.startsWith(".")) return node.classList.contains(trimmed.slice(1));
      const attrMatch = /^([a-z0-9_-]*)\[([a-z0-9_-]+)(?:="([^"]*)")?\]$/i.exec(trimmed);
      if (attrMatch) {
        const [, tag, attr, val] = attrMatch;
        if (tag && node.localName !== tag) return false;
        return val !== undefined ? node.getAttribute(attr ?? "") === val : node.hasAttribute(attr ?? "");
      }
      return node.localName === trimmed;
    };
    const parts = sel.split(",").map((p) => p.trim());
    const walk = (n: MockNode): void => {
      for (const c of n.children) {
        if (parts.some((p) => matchSingle(c, p))) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
}

class MockDoc {
  readonly documentElement: MockNode & {
    lang?: string;
    requestFullscreen?: (opts?: { navigationUI?: string }) => Promise<void>;
  };
  readonly head: MockNode;
  readonly body: MockNode;
  fullscreenEnabled: boolean;
  fullscreenElement: MockNode | null = null;
  lastRequestOptions: unknown = undefined;
  lvhHeight: number;
  lastScrollTo: readonly [number, number] | null = null;
  readonly defaultView: {
    innerWidth: number;
    innerHeight: number;
    scrollY: number;
    navigator: { standalone?: boolean };
    scrollTo: (x: number, y: number) => void;
    matchMedia: (q: string) => { matches: boolean; addEventListener(): void; removeEventListener(): void };
    addEventListener(type: string, fn: () => void): void;
    removeEventListener(type: string, fn: () => void): void;
  };
  private readonly docListeners = new Map<string, Set<() => void>>();
  private readonly winListeners = new Map<string, Set<() => void>>();

  constructor(opts: MockFsDocOptions = {}) {
    this.fullscreenEnabled = opts.fullscreenSupported !== false;
    this.lvhHeight = opts.lvhHeight ?? 0;
    this.documentElement = new MockNode(this, "html");
    this.head = new MockNode(this, "head");
    this.body = new MockNode(this, "body");
    this.documentElement.append(this.head, this.body);

    if (opts.fullscreenSupported !== false) {
      this.documentElement.requestFullscreen = async (reqOpts?: { navigationUI?: string }): Promise<void> => {
        this.lastRequestOptions = reqOpts;
        this.fullscreenElement = this.documentElement;
        this.emit("fullscreenchange");
      };
    }

    const winListeners = this.winListeners;
    this.defaultView = {
      innerWidth: opts.innerWidth ?? 1920,
      innerHeight: opts.innerHeight ?? 1080,
      scrollY: 0,
      navigator: { standalone: opts.standalone === true },
      scrollTo: (x: number, y: number): void => {
        this.lastScrollTo = [x, y];
        this.defaultView.scrollY = y;
        for (const fn of winListeners.get("scroll") ?? []) fn();
      },
      matchMedia: (query: string) => ({
        matches:
          (opts.standalone === true && query.includes("standalone")) ||
          (opts.coarsePointer === true && query.includes("pointer: coarse")),
        addEventListener() {},
        removeEventListener() {}
      }),
      addEventListener(type: string, fn: () => void): void {
        const set = winListeners.get(type) ?? new Set();
        set.add(fn);
        winListeners.set(type, set);
      },
      removeEventListener(type: string, fn: () => void): void {
        winListeners.get(type)?.delete(fn);
      }
    };
  }

  async exitFullscreen(): Promise<void> {
    this.fullscreenElement = null;
    this.emit("fullscreenchange");
  }

  createElement(tag: string): MockNode {
    return new MockNode(this, tag.toLowerCase());
  }
  createElementNS(_ns: string, tag: string): MockNode {
    return new MockNode(this, tag.toLowerCase());
  }
  createTextNode(text: string): MockNode {
    const n = new MockNode(this, "#text");
    n.textContent = text;
    return n;
  }
  querySelector(sel: string): MockNode | null {
    return this.documentElement.querySelectorAll(sel)[0] ?? null;
  }
  addEventListener(type: string, fn: () => void): void {
    const set = this.docListeners.get(type) ?? new Set();
    set.add(fn);
    this.docListeners.set(type, set);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.docListeners.get(type)?.delete(fn);
  }
  emit(type: string): void {
    for (const fn of this.docListeners.get(type) ?? []) fn();
  }
  emitResize(w: number, h: number): void {
    this.defaultView.innerWidth = w;
    this.defaultView.innerHeight = h;
    for (const fn of this.winListeners.get("resize") ?? []) fn();
  }
}

describe("Fullscreen API, standalone PWA & iOS Safari bar-collapse helpers", () => {
  it("requests fullscreen with navigationUI: 'hide' so top swipe reveals browser chrome, and toggles cleanly", async () => {
    const mock = new MockDoc({ fullscreenSupported: true });
    const doc = mock as unknown as Document;

    expect(canFullscreen(doc)).toBe(true);
    expect(isFullscreen(doc)).toBe(false);

    const entered = await requestAppFullscreen(doc);
    expect(entered).toBe(true);
    expect(isFullscreen(doc)).toBe(true);
    expect(mock.lastRequestOptions).toEqual({ navigationUI: "hide" });

    const afterToggle = await toggleAppFullscreen(doc);
    expect(afterToggle).toBe(false);
    expect(isFullscreen(doc)).toBe(false);
  });

  it("hides the fullscreen button when already running in standalone Home Screen mode", () => {
    const standaloneMock = new MockDoc({ fullscreenSupported: true, standalone: true });
    const doc = standaloneMock as unknown as Document;
    expect(isStandaloneDisplay(doc.defaultView)).toBe(true);
    expect(canFullscreen(doc)).toBe(false);
  });

  it("marks iPhone Safari coarse-pointer sessions without Fullscreen API as ww-ios-bar-collapsible and syncs viewport vars", () => {
    const iosMock = new MockDoc({
      fullscreenSupported: false,
      standalone: false,
      coarsePointer: true,
      innerWidth: 852,
      innerHeight: 393
    });
    const doc = iosMock as unknown as Document;
    const unbind = bindViewportCssVars(doc.defaultView, doc);

    expect(iosMock.documentElement.style.getPropertyValue("--ww-vw")).toBe("852px");
    expect(iosMock.documentElement.style.getPropertyValue("--ww-vh")).toBe("393px");
    expect(iosMock.documentElement.classList.contains(IOS_BAR_COLLAPSIBLE_CLASS)).toBe(true);
    expect(iosMock.documentElement.classList.contains(STANDALONE_CLASS)).toBe(false);
    expect(iosMock.documentElement.classList.contains(FULLSCREEN_CLASS)).toBe(false);

    iosMock.emitResize(852, 327);
    expect(iosMock.documentElement.style.getPropertyValue("--ww-vh")).toBe("327px");

    syncThemeColor(doc, "#181324");
    expect(iosMock.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#181324");
    expect(iosMock.documentElement.style.getPropertyValue("--ww-chrome-bg")).toBe("#181324");
    unbind();
  });

  it("mounts data-control='fullscreen' in start screen, episode menu, and play controls when supported", async () => {
    const mock = new MockDoc({ fullscreenSupported: true });
    const root = mock.createElement("div");
    mock.body.appendChild(root);
    const uiRoot = root as unknown as HTMLElement;

    const removeStart = showStartScreen(uiRoot, ENGLISH_ONLY, () => {});
    const startFs = root.querySelectorAll('[data-control="fullscreen"]')[0];
    expect(startFs).toBeDefined();
    expect(startFs?.getAttribute("aria-label")).toBe("Full screen");
    removeStart();

    const removeMenu = showEpisodeMenu(uiRoot, ENGLISH_ONLY, [], () => {}, { onParent: () => {} });
    const menuFs = root.querySelectorAll('[data-control="fullscreen"]')[0];
    expect(menuFs).toBeDefined();
    menuFs?.click(1200);
    await Promise.resolve();
    expect(menuFs?.getAttribute("aria-pressed")).toBe("true");
    expect(menuFs?.getAttribute("aria-label")).toBe("Exit full screen");
    removeMenu();

    await toggleAppFullscreen(mock as unknown as Document);
    const controls = mountChildControls(uiRoot, ENGLISH_ONLY, {
      onPause() {},
      onResume() {},
      onReplayWord() {},
      onAllDone() {},
      onParent() {}
    });
    const playFs = root.querySelectorAll('[data-control="fullscreen"]')[0];
    expect(playFs).toBeDefined();
    expect(playFs?.getAttribute("aria-label")).toBe("Full screen");
    controls.dispose();
  });

  it("mounts data-control='fullscreen' on iPhone Safari, opens swipe/Hide-Toolbar helper, and auto-dismisses when bar retracts to 100lvh", async () => {
    const iosMock = new MockDoc({
      fullscreenSupported: false,
      standalone: false,
      coarsePointer: true,
      innerWidth: 932,
      innerHeight: 364,
      lvhHeight: 430
    });
    const doc = iosMock as unknown as Document;
    const root = iosMock.createElement("div");
    iosMock.body.appendChild(root);
    const uiRoot = root as unknown as HTMLElement;

    expect(canFullscreen(doc)).toBe(false);
    expect(canFullscreenControl(doc)).toBe(true);

    const unbind = bindViewportCssVars(doc.defaultView, doc);
    expect(iosMock.documentElement.classList.contains(IOS_BAR_COLLAPSIBLE_CLASS)).toBe(true);
    expect(iosMock.documentElement.classList.contains(IOS_BAR_EXPANDED_CLASS)).toBe(true);
    expect(iosMock.documentElement.classList.contains(IOS_UNWRAP_SCROLL_CLASS)).toBe(true);
    expect(isEffectiveFullscreen(doc)).toBe(false);

    const controls = mountChildControls(uiRoot, ENGLISH_ONLY, {
      onPause() {},
      onResume() {},
      onReplayWord() {},
      onAllDone() {},
      onParent() {}
    });
    const playFs = root.querySelectorAll('[data-control="fullscreen"]')[0];
    expect(playFs).toBeDefined();
    expect(playFs?.getAttribute("aria-label")).toBe("Full screen");

    playFs?.click(1500);
    await Promise.resolve();
    expect(iosMock.lastScrollTo).toEqual([0, 160]);
    expect(iosMock.documentElement.classList.contains(IOS_UNWRAP_SCROLL_CLASS)).toBe(false);
    const tip = root.querySelectorAll('[data-ui="ios-fullscreen-tip"]')[0];
    expect(tip).toBeDefined();
    expect(tip?.textContent).toContain("Hide Toolbar");
    expect(tip?.textContent).toContain("Add to Home Screen");

    // Simulate iPhone Safari collapsing its landscape top bar so visual height reaches 100lvh (430px).
    iosMock.emitResize(932, 430);
    expect(iosMock.documentElement.classList.contains(IOS_FULLBLEED_CLASS)).toBe(true);
    expect(iosMock.documentElement.classList.contains(FULLSCREEN_CLASS)).toBe(true);
    expect(isEffectiveFullscreen(doc)).toBe(true);
    expect(root.querySelectorAll('[data-ui="ios-fullscreen-tip"]')).toHaveLength(0);
    expect(playFs?.getAttribute("aria-pressed")).toBe("true");
    expect(playFs?.getAttribute("aria-label")).toBe("Exit full screen");

    controls.dispose();
    unbind();
  });
});

describe("PWA manifest, Apple TV / widescreen CSS & full-bleed 3D diorama coverage", () => {
  it("ships a clean standalone webmanifest and full-screen meta tags without child data", () => {
    const html = readFileSync(join(appRoot, "index.html"), "utf8");
    const manifest = JSON.parse(readFileSync(join(appRoot, "public/manifest.webmanifest"), "utf8")) as {
      name: string;
      short_name: string;
      display: string;
      display_override: string[];
      icons: Array<{ src: string; type: string }>;
    };
    const iconSvg = readFileSync(join(appRoot, "public/icon.svg"), "utf8");

    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-status-bar-style" content="black-translucent"');
    expect(html).toContain('class="ww-ios-scroll-spacer"');
    expect(manifest.name).toBe("Wonder World");
    expect(manifest.short_name).toBe("Wonder World");
    expect(manifest.display).toBe("standalone");
    expect(manifest.display_override).toContain("fullscreen");
    expect(manifest.icons[0]?.src).toBe("/icon.svg");
    expect(iconSvg).toContain("<svg");
  });

  it("enables landscape Start & Menu layouts on 1080p/4K Apple TV viewports (no max-height: 840px cap)", () => {
    const css = readFileSync(join(appRoot, "src/ui/styles.css"), "utf8");
    expect(css).not.toContain("(max-height: 840px)");
    expect(css).toContain("@media (orientation: landscape) and (min-width: 540px)");
    expect(css).toContain("@media (orientation: landscape) and (min-width: 1200px) and (min-height: 720px)");
    expect(css).toContain("width: min(100%, 96rem);");
    expect(css).toContain("width: var(--ww-vw, 100dvw);");
    expect(css).toContain("height: var(--ww-vh, 100dvh);");
    expect(css).toContain("height: calc(100lvh + 240px);");
    expect(css).toContain("touch-action: pan-y !important;");
  });

  it("covers the full camera frustum width across 16:9 Apple TV, 19.5:9 phone landscape, and 21:9 ultrawide in all 8 worlds", () => {
    const wideAspects = [16 / 9, 2000 / 920, 21 / 9] as const;

    interface JsonNode {
      readonly name?: string;
      readonly type?: string;
      readonly size?: readonly [number, number, number];
      readonly position?: readonly [number, number, number];
      readonly geometry?: {
        readonly positions?: ArrayLike<number>;
      };
      readonly children?: readonly JsonNode[];
      readonly nodes?: readonly JsonNode[];
    }

    const collectNodes = (root: JsonNode): JsonNode[] => {
      const all: JsonNode[] = [root];
      for (const child of [...(root.nodes ?? []), ...(root.children ?? [])]) {
        all.push(...collectNodes(child));
      }
      return all;
    };

    const maxMeshHalfSpanX = (nodes: readonly JsonNode[]): number => {
      let maxHalfX = 0;
      for (const node of nodes) {
        const px = node.position?.[0] ?? 0;
        if (node.size) {
          maxHalfX = Math.max(maxHalfX, Math.abs(px) + Math.abs(node.size[0]) * 0.5);
        }
        const pos = node.geometry?.positions;
        if (pos && pos.length >= 3) {
          for (let i = 0; i < pos.length; i += 3) {
            maxHalfX = Math.max(maxHalfX, Math.abs(px + (pos[i] ?? 0)));
          }
        }
      }
      return maxHalfX;
    };

    for (const worldId of WORLD_IDS) {
      const built = buildWorld(worldId, {
        reducedMotion: false
      });
      const rootBuilder = scene();
      for (const node of built.nodes) {
        rootBuilder.add(node);
      }
      const json = rootBuilder.toJSON() as unknown as JsonNode;
      const nodes = collectNodes(json);

      if (worldId === "home-nook" || worldId === "moonlit-nursery") {
        // Back wall at z = -4.35m must extend past the camera frustum edge even at 21:9 (~10.7m).
        for (const aspect of wideAspects) {
          const cam = frameCamera("wide", aspect);
          const dz = cam.position[2] - -4.35;
          const frustumHalfXAtBackWall = dz * Math.tan((cam.fov * Math.PI) / 360) * aspect;
          const leftWing = nodes.find((n) => n.name?.includes("left wing wall"));
          const rightWing = nodes.find((n) => n.name?.includes("right wing wall"));
          expect(Math.abs(leftWing?.position?.[0] ?? 0), `${worldId} left wing at aspect ${aspect.toFixed(2)}`).toBeGreaterThan(
            frustumHalfXAtBackWall
          );
          expect(Math.abs(rightWing?.position?.[0] ?? 0), `${worldId} right wing at aspect ${aspect.toFixed(2)}`).toBeGreaterThan(
            frustumHalfXAtBackWall
          );
        }
      } else {
        // Outdoor and cloud island plinths must span >= ±20m so wide horizons never chop off.
        const maxHalfX = maxMeshHalfSpanX(nodes);
        expect(maxHalfX, `${worldId} wide island X half-span`).toBeGreaterThanOrEqual(20);
      }
    }
  });
});
