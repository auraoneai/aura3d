import { afterEach, describe, expect, it } from "vitest";
import { GameShellImpl } from "../../../packages/game/src/components.js";
import { GameSessionImpl } from "../../../packages/game/src/session/GameSession.js";
import type { HudDocument, HudElement } from "../../../packages/game/src/hud/dom.js";

/**
 * The full game entry's `game.shell.setLoadingProgress()` / `track()` (S5-WP27-02). They used to accept
 * calls silently; they now drive a real loading screen and progress meter owned by the game. The unit
 * suite has no DOM emulator, so a minimal fake `document` stands in (same approach as shell.test.ts).
 */
class FakeEl implements HudElement {
  tagName: string;
  className = "";
  textContent: string | null = "";
  innerHTML = "";
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  children: FakeEl[] = [];
  attrs = new Map<string, string>();
  parent: FakeEl | null = null;
  private readonly classes = new Set<string>();
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  get classList() {
    const cs = this.classes;
    return {
      add: (...n: string[]) => n.forEach((c) => cs.add(c)),
      remove: (...n: string[]) => n.forEach((c) => cs.delete(c)),
      toggle: (n: string, force?: boolean) => { (force ?? !cs.has(n)) ? cs.add(n) : cs.delete(n); },
      contains: (n: string) => cs.has(n)
    };
  }
  appendChild(c: HudElement): void {
    const f = c as FakeEl;
    f.parent?.removeChild(f);
    f.parent = this;
    this.children.push(f);
  }
  removeChild(c: HudElement): void {
    const i = this.children.indexOf(c as FakeEl);
    if (i >= 0) this.children.splice(i, 1);
    (c as FakeEl).parent = null;
  }
  remove(): void { this.parent?.removeChild(this); }
  setAttribute(n: string, v: string): void { this.attrs.set(n, v); }
  getAttribute(n: string): string | null { return this.attrs.get(n) ?? null; }
  addEventListener(): void {}
  removeEventListener(): void {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
  find(pred: (e: FakeEl) => boolean): FakeEl | null {
    if (pred(this)) return this;
    for (const c of this.children) { const r = c.find(pred); if (r) return r; }
    return null;
  }
}

class FakeDoc implements HudDocument {
  body = new FakeEl("body");
  createElement(tag: string): HudElement { return new FakeEl(tag); }
  createTextNode(text: string): HudElement { const e = new FakeEl("text"); e.textContent = text; return e; }
}

const g = globalThis as { document?: unknown };
const hadDocument = "document" in g;
const priorDocument = g.document;
afterEach(() => {
  if (hadDocument) g.document = priorDocument;
  else delete g.document;
});

function setup() {
  const doc = new FakeDoc();
  g.document = doc;
  const session = new GameSessionImpl({ seed: 1, time: { scale: 1, hitStopRemaining: 0, advance: (dt: number) => dt } as never });
  session.transition("loading");
  const shell = new GameShellImpl(session);
  const meter = () => doc.body.find((e) => e.tagName === "PROGRESS");
  const bar = () => doc.body.find((e) => e.className === "a3g-loading-bar");
  const screen = () => doc.body.find((e) => e.className.includes("a3g-loading ") || e.className.endsWith("a3g-loading"));
  return { doc, session, shell, meter, bar, screen };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("full game entry shell loading progress", () => {
  it("aggregates tracked weights, including rejected promises, into a visible meter", async () => {
    const { shell, meter, bar, screen } = setup();
    let resolveA!: () => void;
    let rejectB!: (e: unknown) => void;
    const a = new Promise<void>((r) => { resolveA = r; });
    const b = new Promise<void>((_, r) => { rejectB = r; });
    b.catch(() => undefined); // the caller keeps ownership of the rejection

    shell.track(a, 1);
    shell.track(b, 3);
    expect(meter()?.getAttribute("value")).toBe("0");
    expect(screen()?.style.display).toBe("");

    resolveA();
    await flush();
    expect(meter()?.getAttribute("value")).toBe("0.25");
    expect(bar()?.style.width).toBe("25.0%");

    rejectB(new Error("asset failed"));
    await flush();
    expect(meter()?.getAttribute("value")).toBe("1");
    expect(bar()?.style.width).toBe("100.0%");
  });

  it("applies a manual fraction and label, clamps it, and hides outside the loading state", () => {
    const { session, shell, meter, bar, screen, doc } = setup();
    shell.setLoadingProgress(0.5, "Streaming track");
    expect(meter()?.getAttribute("value")).toBe("0.5");
    expect(bar()?.style.width).toBe("50.0%");
    expect(doc.body.find((e) => e.className === "a3g-loading-label")?.textContent).toBe("Streaming track");
    expect(meter()?.getAttribute("aria-label")).toBe("Streaming track");

    shell.setLoadingProgress(4);
    expect(meter()?.getAttribute("value")).toBe("1");

    session.transition("playing");
    expect(screen()?.style.display).toBe("none");
    session.transition("title");
    session.transition("loading");
    expect(screen()?.style.display).toBe("");
  });

  it("rejects invalid input with coded errors", () => {
    const { shell } = setup();
    expect(() => shell.setLoadingProgress(Number.NaN)).toThrow(/GAME_LOADING_FRACTION_INVALID_V1/);
    expect(() => shell.track(Promise.resolve(), -1)).toThrow(/GAME_LOADING_WEIGHT_INVALID_V1/);
    expect(() => shell.track(Promise.resolve(), Number.POSITIVE_INFINITY)).toThrow(/GAME_LOADING_WEIGHT_INVALID_V1/);
  });

  it("releases its DOM on dispose, ignores late settlement and refuses further use", async () => {
    const { shell, doc } = setup();
    let resolveLate!: () => void;
    shell.track(new Promise<void>((r) => { resolveLate = r; }), 1);
    expect(doc.body.find((e) => e.className === "a3g-loading-region")).not.toBeNull();

    shell.dispose();
    expect(doc.body.children).toHaveLength(0);
    resolveLate();
    await flush();
    expect(doc.body.children).toHaveLength(0);
    expect(() => shell.setLoadingProgress(0.5)).toThrow(/GAME_DISPOSED_V1/);
    expect(() => shell.track(Promise.resolve(), 1)).toThrow(/GAME_DISPOSED_V1/);
  });

  it("fails with an actionable error when there is no document", () => {
    delete g.document;
    const session = new GameSessionImpl({ seed: 1, time: { scale: 1, hitStopRemaining: 0, advance: (dt: number) => dt } as never });
    const shell = new GameShellImpl(session);
    expect(() => shell.setLoadingProgress(0.5)).toThrow(/GAME_SHELL_LOADING_UNAVAILABLE_V1/);
  });
});
