import { afterEach, describe, expect, it } from "vitest";

/**
 * Audit RR-5 and RR-9 on the page wiring of Apex Overdrive (src/native/index.ts), with a fake AudioContext that, like a
 * desktop browser, only starts when resume() runs inside a user gesture. The remote Chromium runner starts audio without a
 * gesture, so it cannot show this bug; this test can.
 */

let gesture = false;
const contexts: FakeContext[] = [];

function stub(): any {
  const fn = function () { return stub(); };
  return new Proxy(fn, {
    get: (_t, key) => (key === "then" ? undefined : key === "value" ? 0 : stub()),
    set: () => true,
    apply: () => stub()
  });
}

class FakeContext {
  state: "suspended" | "running" | "closed" = "suspended";
  currentTime = 0;
  sampleRate = 44100;
  destination = stub();
  resumeCalls = 0;
  suspendCalls = 0;
  constructor() { contexts.push(this); }
  async resume(): Promise<void> { this.resumeCalls++; if (gesture) this.state = "running"; }
  async suspend(): Promise<void> { this.suspendCalls++; if (this.state !== "closed") this.state = "suspended"; }
  async close(): Promise<void> { this.state = "closed"; }
  createGain() { return stub(); }
  createOscillator() { return stub(); }
  createBiquadFilter() { return stub(); }
  createBufferSource() { return stub(); }
  createBuffer() { return { getChannelData: () => new Float32Array(16) }; }
  createPanner() { return stub(); }
  createConvolver() { return stub(); }
}

class FakeDocument extends EventTarget {
  hidden = false;
  getElementById() { return null; }
}

function install(): { win: EventTarget; doc: FakeDocument } {
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  (win as Record<string, unknown>).location = { search: "?seed=42" };
  const doc = new FakeDocument();
  const g = globalThis as Record<string, unknown>;
  g.window = win;
  g.document = doc;
  g.AudioContext = FakeContext;
  g.localStorage = { getItem: () => null, setItem: () => undefined };
  return { win, doc };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.window; delete g.document; delete g.AudioContext; delete g.localStorage;
  contexts.length = 0;
  gesture = false;
});

describe("Apex Overdrive sound and background wiring", () => {
  it("the first run is not silent: the first pointer or key gesture resumes the context (RR-5)", async () => {
    const { win } = install();
    const { createNativeRoadster } = await import("../../../apps/showcase-roadster-rush/src/native/index");
    const game = createNativeRoadster({ harness: false });
    game.start(); // boot-time start, outside any gesture
    await flush();
    expect(contexts.length).toBe(1);
    expect(contexts[0]!.state).toBe("suspended");
    gesture = true;
    win.dispatchEvent(new Event("pointerdown"));
    gesture = false;
    await flush();
    expect(contexts[0]!.state).toBe("running");
  });

  it("a hidden tab pauses the run and suspends the context; showing it resumes sound, the run stays paused (RR-9)", async () => {
    const { win, doc } = install();
    const { createNativeRoadster } = await import("../../../apps/showcase-roadster-rush/src/native/index");
    const game = createNativeRoadster({ harness: false });
    gesture = true;
    win.dispatchEvent(new Event("keydown"));
    game.start();
    await flush();
    expect(contexts[0]!.state).toBe("running");
    doc.hidden = true;
    doc.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(game.paused).toBe(true);
    expect(contexts[0]!.state).toBe("suspended");
    doc.hidden = false;
    doc.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(contexts[0]!.state).toBe("running");
    expect(game.paused).toBe(true);
  });

  it("window blur pauses a live run (RR-9)", async () => {
    const { win } = install();
    const { createNativeRoadster } = await import("../../../apps/showcase-roadster-rush/src/native/index");
    const game = createNativeRoadster({ harness: false });
    game.start();
    win.dispatchEvent(new Event("blur"));
    expect(game.paused).toBe(true);
  });
});
