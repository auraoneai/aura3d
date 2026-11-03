import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { CREDIT_NOTE, CREDIT_STYLE, PORT_PAGES, appPagePath, composePortPage, pickCreditSpot } from "../../tools/showcase-port-pages/lib.mjs";

type Spot = { left?: number; right?: number; top?: number; bottom?: number };
const pick = (view: { w: number; h: number }, size: { w: number; h: number }, obstacles: { x: number; y: number; w: number; h: number }[]) =>
  pickCreditSpot(view, size, obstacles, 8) as { spot: Spot; overlap: number; index: number };

describe("Built with Aura3D credit placement (audit cross-cutting, splat-rush C3, wind-wanders WW-2)", () => {
  it("keeps bottom-left when nothing is there", () => {
    expect(pick({ w: 1440, h: 900 }, { w: 400, h: 27 }, []).spot).toEqual({ left: 8, bottom: 8 });
  });

  it("leaves Chroma Roll's mute button free at 1440x900", () => {
    // Live rects from the audit: mute [16,840,44,44]; the old credit covered its lower half.
    const mute = { x: 16, y: 840, w: 44, h: 44 };
    const r = pick({ w: 1440, h: 900 }, { w: 400, h: 27 }, [mute]);
    expect(r.overlap).toBe(0);
    expect(r.spot).toEqual({ right: 8, bottom: 8 });
  });

  it("leaves The Bellkeeper's Walk joystick free at 390x844, where the credit wraps to two lines", () => {
    const pad = { x: 16, y: 844 - 14 - 128, w: 128, h: 128 };
    const r = pick({ w: 390, h: 844 }, { w: 374, h: 44 }, [pad]);
    expect(r.overlap).toBe(0);
    expect(r.spot.top).toBe(8);
  });

  it("slides above a bottom bar when every corner has a control", () => {
    const view = { w: 800, h: 600 };
    const size = { w: 200, h: 30 };
    const obstacles = [
      { x: 0, y: 560, w: 800, h: 40 }, // bottom bar: both bottom corners fully covered
      { x: 0, y: 0, w: 100, h: 40 }, // top-left button
      { x: 780, y: 0, w: 20, h: 20 } // small top-right button
    ];
    const r = pick(view, size, obstacles);
    expect(r.overlap).toBe(0);
    expect(r.spot).toEqual({ left: 8, bottom: 48 });
  });

  it("leaves Chroma Roll's mute button free at 390x844, where the credit spans the width (remote run e5w2-credit)", () => {
    // Measured on the runner: mute [16,784,44,44], credit 382x41 at bottom-left covered it; a top HUD blocks both top corners.
    const mute = { x: 16, y: 784, w: 44, h: 44 };
    const topHud = { x: 0, y: 0, w: 390, h: 56 };
    const r = pick({ w: 390, h: 844 }, { w: 382, h: 41 }, [mute, topHud]);
    expect(r.overlap).toBe(0);
    expect(r.spot).toEqual({ left: 8, bottom: 68 });
  });

  it("takes the least-covered corner when no slide clears every control", () => {
    const view = { w: 300, h: 200 };
    const size = { w: 280, h: 60 };
    const obstacles = [{ x: 0, y: 0, w: 300, h: 70 }, { x: 0, y: 75, w: 300, h: 50 }, { x: 0, y: 130, w: 20, h: 20 }];
    const r = pick(view, size, obstacles);
    expect(r.overlap).toBeGreaterThan(0);
  });

  it("ships a credit that fades on first input, carries no-steer and parses as a script", () => {
    expect(CREDIT_NOTE).toContain('class="aura-credit no-steer"');
    expect(CREDIT_STYLE).toContain(".aura-credit.is-hidden{opacity:0;visibility:hidden");
    const script = /<script>([\s\S]*)<\/script>/.exec(CREDIT_NOTE)?.[1] ?? "";
    expect(script).toContain('addEventListener("keydown",hide,true)');
    expect(script).toContain('addEventListener("pointerdown",hide,true)');
    expect(script).not.toContain("</");
    expect(() => new Function(script)).not.toThrow();
  });

  it("composePortPage replaces an old credit with the canonical one, and recomposing is stable", () => {
    const oldStyle = '<style>.aura-credit{position:fixed;left:8px;bottom:8px;z-index:2147483000}</style>';
    const oldNote = '<aside class="aura-credit" role="note"><a href="/apps/showcase-index/">Built with Aura3D</a> · old.</aside>';
    const appHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Demo</title>${oldStyle}</head><body><div id="app"></div>${oldNote}</body></html>`;
    const exampleHtml = '<!doctype html><html><head><meta charset="utf-8"><title>Example</title></head><body><div id="app"></div><script type="module" src="./main.ts"></script></body></html>';
    const once = composePortPage({ exampleHtml, appHtml });
    expect(once).toContain(CREDIT_STYLE);
    expect(once).toContain(CREDIT_NOTE);
    expect(once).not.toContain("· old.");
    expect(composePortPage({ exampleHtml, appHtml: once })).toBe(once);
  });

  it("covers the eleven port pages", () => {
    expect(PORT_PAGES).toHaveLength(11);
    expect(appPagePath("splat-rush")).toMatch(/apps\/showcase-splat-rush-port\/index\.html$/);
    for (const [slug] of PORT_PAGES) {
      const html = readFileSync(appPagePath(slug), "utf8");
      const notes = [...html.matchAll(/<aside class="aura-credit(?:\s[^"]*)?"[^>]*>[\s\S]*?<\/aside>/g)];
      expect(notes.map(([note]) => note), slug).toEqual([CREDIT_NOTE]);
      expect(html.split(CREDIT_STYLE), slug).toHaveLength(2);
    }
  });
});

describe("port page links to the app's public files", () => {
  it("rewrites the example's ../../apps/<app>/public/ dev path to the app root and does not add the app link twice", () => {
    const exampleHtml = '<!doctype html><html><head><link rel="stylesheet" href="../../apps/showcase-ninja-runner-port/public/fonts/ink-scroll.css" /><title>x</title></head><body><script type="module" src="./main.ts"></script></body></html>';
    const appHtml = '<!doctype html><html><head><link rel="stylesheet" href="./fonts/ink-scroll.css" /><title>x</title></head><body></body></html>';
    const html = composePortPage({ exampleHtml, appHtml });
    expect(html).not.toContain("../../apps/");
    expect(html.match(/fonts\/ink-scroll\.css/g)).toHaveLength(1);
    expect(html).toContain('href="./fonts/ink-scroll.css"');
  });
});

type Rect = { left: number; top: number; width: number; height: number };
type MutationKind = "attributes" | "childList" | "characterData";

/** A deterministic task clock; no browser or real-time waits are involved. */
class CreditClock {
  private now = 0;
  private nextId = 1;
  private jobs = new Map<number, { at: number; every: number; run: () => void }>();

  readonly setTimeout = (run: () => void, ms: number) => this.add(run, ms, 0);
  readonly setInterval = (run: () => void, ms: number) => this.add(run, ms, ms);
  readonly clearTimeout = (id: number) => { this.jobs.delete(id); };
  readonly clearInterval = this.clearTimeout;
  get pending() { return this.jobs.size; }

  private add(run: () => void, ms: number, every: number) {
    const id = this.nextId++;
    this.jobs.set(id, { at: this.now + ms, every, run });
    return id;
  }

  advance(ms: number) {
    const end = this.now + ms;
    let executed = 0;
    while (true) {
      const next = [...this.jobs.entries()].filter(([, job]) => job.at <= end)
        .sort(([idA, a], [idB, b]) => a.at - b.at || idA - idB)[0];
      if (!next) break;
      const [id, job] = next;
      this.now = job.at;
      if (job.every) job.at += job.every;
      else this.jobs.delete(id);
      job.run();
      if (++executed > 10_000) throw new Error("credit timer loop");
    }
    this.now = end;
  }
}

/**
 * Run the actual generated inline script in Node with only its needed DOM APIs.
 * Mutation records are queued like MutationObserver and delivered explicitly at
 * microtask boundaries, including records the script drains with takeRecords().
 */
function creditHarness(mode: "observer" | "missing" | "broken" = "observer", hasScript = true) {
  const clock = new CreditClock();
  const stats = { scans: 0, creditWrites: 0, selfObserved: 0, failedDisconnects: 0 };
  let credit: Element;
  const observers: Observer[] = [];
  type Mutation = { target: Element; type: MutationKind; attributeName?: string };
  type Options = {
    subtree?: boolean; childList?: boolean; characterData?: boolean; attributes?: boolean; attributeFilter?: string[];
  };

  function mutate(target: Element, type: MutationKind, attributeName?: string) {
    if (target === credit && (attributeName === "style" || attributeName === "data-spot")) stats.creditWrites++;
    const record = { target, type, attributeName };
    for (const observer of observers) observer.enqueue(record);
  }

  class Element {
    readonly nodeType = 1;
    readonly children: Element[] = [];
    parentElement: Element | null = null;
    readonly style: Record<string, string>;
    readonly dataset: Record<string, string>;
    readonly classList: { contains: (name: string) => boolean; add: (name: string) => void };
    readonly computed = { position: "static", visibility: "visible", display: "block", opacity: "1" };
    control = false;

    constructor(readonly tagName: string, readonly rect: Rect, classes: string[] = []) {
      this.style = new Proxy({}, {
        set: (target: Record<string, string>, key: string, value: string) => {
          target[key] = value;
          mutate(this, "attributes", "style");
          return true;
        }
      });
      this.dataset = new Proxy({}, {
        set: (target: Record<string, string>, key: string, value: string) => {
          target[key] = value;
          mutate(this, "attributes", `data-${key}`);
          return true;
        }
      });
      const names = new Set(classes);
      this.classList = {
        contains: (name) => names.has(name),
        add: (name) => {
          if (!names.has(name)) {
            names.add(name);
            mutate(this, "attributes", "class");
          }
        }
      };
    }

    contains(other: Element) {
      for (let node: Element | null = other; node; node = node.parentElement) if (node === this) return true;
      return false;
    }

    append(child: Element) {
      child.parentElement = this;
      this.children.push(child);
      mutate(this, "childList");
    }

    remove(child: Element) {
      const index = this.children.indexOf(child);
      if (index < 0) throw new Error("child missing");
      this.children.splice(index, 1);
      child.parentElement = null;
      mutate(this, "childList");
    }

    matches() { return this.control || this.tagName === "BUTTON"; }

    getBoundingClientRect(): Rect {
      if (this !== credit) return { ...this.rect };
      const px = (value: string | undefined) => value && value !== "auto" ? Number.parseFloat(value) : null;
      const left = px(this.style.left) ?? (px(this.style.right) === null ? 8 : 390 - px(this.style.right)! - this.rect.width);
      const top = px(this.style.top) ?? (844 - (px(this.style.bottom) ?? 8) - this.rect.height);
      return { left, top, width: this.rect.width, height: this.rect.height };
    }
  }

  class Observer {
    active = false;
    root: Element | null = null;
    options: Options = {};
    records: Mutation[] = [];

    constructor(private readonly callback: (records: Mutation[]) => void) { observers.push(this); }
    observe(root: Element, options: Options) { this.root = root; this.options = options; this.active = true; }
    disconnect() { this.active = false; this.records = []; }
    takeRecords() { return this.records.splice(0); }
    enqueue(record: Mutation) {
      if (!this.active || !this.root || (record.target !== this.root && !(this.options.subtree && this.root.contains(record.target)))) return;
      if (!this.options[record.type]) return;
      if (record.type === "attributes" && this.options.attributeFilter && !this.options.attributeFilter.includes(record.attributeName ?? "")) return;
      if (record.target === credit && (record.attributeName === "style" || record.attributeName === "data-spot")) stats.selfObserved++;
      this.records.push(record);
    }
    flush() { if (this.active && this.records.length) this.callback(this.takeRecords()); }
  }

  const body = new Element("BODY", { left: 0, top: 0, width: 390, height: 844 });
  const topHud = new Element("DIV", { left: 0, top: 0, width: 390, height: 170 });
  const bottomHud = new Element("DIV", { left: 0, top: 668, width: 390, height: 176 });
  const hud = new Element("DIV", { left: 0, top: 0, width: 390, height: 844 });
  const prompt = new Element("DIV", { left: 32, top: 648, width: 328, height: 26 });
  credit = new Element("ASIDE", { left: 0, top: 0, width: 374, height: 41 }, ["aura-credit", "no-steer"]);
  const link = new Element("A", { left: 0, top: 0, width: 100, height: 20 });
  topHud.computed.position = bottomHud.computed.position = hud.computed.position = "fixed";
  prompt.computed.position = "absolute";
  prompt.computed.display = "none"; // #prompt:empty
  hud.append(prompt);
  credit.append(link);
  for (const node of [topHud, bottomHud, hud, credit]) body.append(node);

  function descendants(node: Element): Element[] {
    return node.children.flatMap((child) => [child, ...descendants(child)]);
  }

  type Event = { type: string; target: Element; key?: string; defaultPrevented: boolean; preventDefault: () => void };
  type Handler = (event: Event) => void;
  const listeners = new Map<string, { handler: Handler; capture: boolean }[]>();
  function addEventListener(type: string, handler: Handler, capture = false) {
    const list = listeners.get(type) ?? [];
    list.push({ handler, capture });
    listeners.set(type, list);
  }
  function removeEventListener(type: string, handler: Handler, capture = false) {
    listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry.handler !== handler || entry.capture !== capture));
  }
  function dispatch(type: string, target: Element = body, key?: string) {
    const event: Event = {
      type, target, key, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }
    };
    for (const { handler } of [...(listeners.get(type) ?? [])]) handler(event);
    return event;
  }

  const document = {
    body,
    currentScript: hasScript ? { parentElement: credit } : null,
    querySelectorAll(selector: string) {
      if (selector !== "body *") throw new Error(`unexpected selector: ${selector}`);
      stats.scans++;
      return descendants(body);
    }
  };
  class BrokenObserver {
    observe() { throw new Error("observer unavailable"); }
    disconnect() { stats.failedDisconnects++; }
  }
  const script = /<script>([\s\S]*)<\/script>/.exec(CREDIT_NOTE)?.[1];
  if (!script) throw new Error("credit script missing");
  const window = {
    clearTimeout(this: unknown, id: number) {
      if (this == null) throw new TypeError("timer requires its global receiver");
      clock.clearTimeout(id);
    }
  };
  runInNewContext(script, {
    document, window, innerWidth: 390, innerHeight: 844,
    getComputedStyle: (el: Element) => el.computed,
    addEventListener, removeEventListener,
    setTimeout: clock.setTimeout, clearTimeout: window.clearTimeout,
    setInterval: clock.setInterval, clearInterval: clock.clearInterval,
    MutationObserver: mode === "missing" ? undefined : mode === "broken" ? BrokenObserver : Observer
  });

  return {
    clock, stats, body, hud, credit, link, prompt, observers, dispatch, mutate,
    flush: () => observers.forEach((observer) => observer.flush()),
    listeners: (type: string) => listeners.get(type) ?? [],
    showPrompt(kind: MutationKind = "childList", attributeName = "class") {
      prompt.computed.display = "block"; // a text change removes the :empty rule
      mutate(prompt, kind, kind === "attributes" ? attributeName : undefined);
    },
    addControl(rect: Rect) {
      const button = new Element("BUTTON", rect);
      hud.append(button);
      return button;
    }
  };
}

function overlap(a: Rect, b: Rect) {
  return Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
}

describe("credit late HUD runtime (generated script in a fake DOM)", () => {
  it.each([
    { kind: "childList", attribute: undefined },
    { kind: "characterData", attribute: undefined },
    { kind: "attributes", attribute: "class" },
    { kind: "attributes", attribute: "style" },
    { kind: "attributes", attribute: "data-state" }
  ] as const)(
    "moves off a prompt becoming visible after five seconds via $kind $attribute",
    ({ kind, attribute }) => {
      const h = creditHarness();
      h.clock.advance(7_000); // all four original 0/600/2000/5000ms checks have completed
      expect(h.credit.getBoundingClientRect().top).toBe(619);
      expect(overlap(h.credit.getBoundingClientRect(), h.prompt.rect)).toBeGreaterThan(0);
      h.showPrompt(kind, attribute);
      h.flush();
      h.clock.advance(199);
      expect(overlap(h.credit.getBoundingClientRect(), h.prompt.rect)).toBeGreaterThan(0);
      h.clock.advance(1);
      expect(overlap(h.credit.getBoundingClientRect(), h.prompt.rect)).toBe(0);
      expect(h.credit.getBoundingClientRect().top).toBe(599);
      expect(h.observers[0]?.options).toMatchObject({ subtree: true, childList: true, characterData: true, attributes: true });
    }
  );

  it("also clears an inserted unpositioned button", () => {
    const h = creditHarness();
    h.clock.advance(7_000);
    const button = h.addControl({ left: 30, top: 625, width: 330, height: 30 });
    expect(overlap(h.credit.getBoundingClientRect(), button.rect)).toBeGreaterThan(0);
    h.flush();
    h.clock.advance(200);
    expect(overlap(h.credit.getBoundingClientRect(), button.rect)).toBe(0);
  });

  it("also rechecks viewport-dependent geometry on resize without a DOM mutation", () => {
    const h = creditHarness();
    h.clock.advance(7_000);
    h.prompt.computed.display = "block";
    h.dispatch("resize");
    h.clock.advance(200);
    expect(overlap(h.credit.getBoundingClientRect(), h.prompt.rect)).toBe(0);
  });

  it("coalesces per-frame changes and resize events without observing its own writes or looping", () => {
    const h = creditHarness();
    h.clock.advance(7_000);
    const start = h.stats.scans;
    for (let frame = 0; frame < 120; frame++) {
      h.prompt.computed.display = frame % 24 < 12 ? "block" : "none";
      for (let i = 0; i < 5; i++) h.mutate(h.prompt, "attributes", "style");
      h.flush();
      if (frame % 3 === 0) h.dispatch("resize");
      h.clock.advance(16);
    }
    expect(h.stats.scans - start).toBeGreaterThanOrEqual(8);
    expect(h.stats.scans - start).toBeLessThanOrEqual(10); // 120 frames, at most five scans/second
    expect(h.stats.creditWrites).toBeGreaterThan(4);
    expect(h.stats.selfObserved).toBe(0);
    h.clock.advance(250); // flush the final coalesced task
    h.flush();
    const settled = h.stats.scans;
    h.clock.advance(5_000);
    h.flush();
    expect(h.stats.scans).toBe(settled);
    expect(h.clock.pending).toBe(0);
  });

  it("drains queued game mutations before temporarily disconnecting for its own writes", () => {
    const h = creditHarness();
    h.clock.advance(7_000);
    const start = h.stats.scans;
    h.showPrompt("characterData"); // observer record queued, not delivered yet
    h.dispatch("resize");
    h.clock.advance(200);
    expect(overlap(h.credit.getBoundingClientRect(), h.prompt.rect)).toBe(0);
    expect(h.clock.pending).toBe(1); // the drained record was not lost
    h.clock.advance(200);
    expect(h.stats.scans - start).toBe(2);
    expect(h.stats.selfObserved).toBe(0);
    expect(h.observers[0]?.active).toBe(true);
  });

  it.each(["keydown", "pointerdown"] as const)("retains focus/link interaction, then tears down on outside %s", (type) => {
    const h = creditHarness();
    h.clock.advance(0);
    h.showPrompt();
    h.flush(); // a placement and the initial settle timers are pending
    expect(h.clock.pending).toBeGreaterThan(0);
    expect(h.listeners("keydown")[0]?.capture).toBe(true);
    expect(h.listeners("pointerdown")[0]?.capture).toBe(true);
    expect(h.dispatch("keydown", h.body, "Tab").defaultPrevented).toBe(false);
    expect(h.dispatch("keydown", h.body, "Shift").defaultPrevented).toBe(false);
    expect(h.dispatch("keydown", h.link, "Enter").defaultPrevented).toBe(false);
    expect(h.dispatch("pointerdown", h.link).defaultPrevented).toBe(false);
    expect(h.credit.classList.contains("no-steer")).toBe(true);
    expect(h.credit.classList.contains("is-hidden")).toBe(false);
    expect(h.observers[0]?.active).toBe(true);

    expect(h.dispatch(type, h.body, type === "keydown" ? "ArrowRight" : undefined).defaultPrevented).toBe(false);
    expect(h.credit.classList.contains("is-hidden")).toBe(true);
    expect(h.observers[0]?.active).toBe(false);
    expect(h.clock.pending).toBe(0);
    expect(h.listeners("resize")).toHaveLength(0);
    expect(h.listeners("keydown")).toHaveLength(0);
    expect(h.listeners("pointerdown")).toHaveLength(0);
    const scans = h.stats.scans;
    h.mutate(h.prompt, "attributes", "style");
    h.flush();
    h.dispatch("resize");
    h.clock.advance(10_000);
    expect(h.stats.scans).toBe(scans);
  });

  it.each(["hidden", "removed"] as const)("stops observing and cancels timers when the credit is %s externally", (action) => {
    const h = creditHarness();
    h.clock.advance(0);
    h.showPrompt();
    h.flush();
    if (action === "hidden") h.credit.classList.add("is-hidden");
    else h.body.remove(h.credit);
    h.flush();
    expect(h.observers[0]?.active).toBe(false);
    expect(h.clock.pending).toBe(0);
    expect(h.listeners("resize")).toHaveLength(0);
    const scans = h.stats.scans;
    h.clock.advance(10_000);
    expect(h.stats.scans).toBe(scans);
  });

  it.each(["missing", "broken"] as const)("uses a bounded polling fallback when MutationObserver is %s", (mode) => {
    const h = creditHarness(mode);
    h.clock.advance(7_000);
    expect(overlap(h.credit.getBoundingClientRect(), h.prompt.rect)).toBeGreaterThan(0);
    h.showPrompt();
    h.clock.advance(700); // 500ms polling plus at most 200ms coalescing
    expect(overlap(h.credit.getBoundingClientRect(), h.prompt.rect)).toBe(0);
    if (mode === "broken") expect(h.stats.failedDisconnects).toBe(1);
    const previousScans = h.stats.scans;
    h.clock.advance(2_000);
    expect(h.stats.scans - previousScans).toBeLessThanOrEqual(4);
    expect(h.stats.scans - previousScans).toBeGreaterThanOrEqual(3);
    h.dispatch("pointerdown");
    expect(h.clock.pending).toBe(0);
    const scans = h.stats.scans;
    h.clock.advance(10_000);
    expect(h.stats.scans).toBe(scans);
  });

  it("stops the polling fallback when the credit is hidden externally", () => {
    const h = creditHarness("missing");
    h.clock.advance(7_000);
    h.credit.classList.add("is-hidden");
    h.clock.advance(500); // the next fallback tick detects the hide and tears down
    expect(h.clock.pending).toBe(0);
    expect(h.listeners("resize")).toHaveLength(0);
    const scans = h.stats.scans;
    h.clock.advance(10_000);
    expect(h.stats.scans).toBe(scans);
  });

  it("does nothing when the executing script has no parent credit", () => {
    const h = creditHarness("observer", false);
    h.clock.advance(10_000);
    expect(h.clock.pending).toBe(0);
    expect(h.stats.scans).toBe(0);
    expect(h.listeners("keydown")).toHaveLength(0);
  });
});
