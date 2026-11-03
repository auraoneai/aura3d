import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import type { AuraWorkerHostEndpoint, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types.js";

class EventTargetStub {
  readonly listeners = new Map<string, Set<(event: any) => void>>();

  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, detail: Record<string, unknown> = {}): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ ...detail, type });
  }
}

class CaptureCanvas extends EventTargetStub {
  readonly captures = new Set<number>();
  readonly releases: number[] = [];
  readonly rejectedCaptures = new Set<number>();
  width = 40;
  height = 20;

  transferControlToOffscreen(): OffscreenCanvas {
    return { width: this.width, height: this.height } as OffscreenCanvas;
  }

  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, width: 40, height: 20 } as DOMRect;
  }

  setPointerCapture(id: number): void {
    if (this.rejectedCaptures.has(id)) throw new Error("capture rejected");
    this.captures.add(id);
  }

  releasePointerCapture(id: number): void {
    this.releases.push(id);
    if (this.captures.delete(id)) this.emit("lostpointercapture", { pointerId: id });
  }

  pointer(type: "pointerdown" | "pointerup" | "lostpointercapture", id: number): void {
    this.emit(type, { pointerId: id, pointerType: "touch", clientX: 5, clientY: 6, buttons: type === "pointerdown" ? 1 : 0, pressure: 0.5, timeStamp: 1 });
    // Browsers implicitly release capture after a pointer ends.
    if (type === "pointerup" || type === "lostpointercapture") this.captures.delete(id);
  }
}

class HostWorker extends EventTargetStub {
  readonly messages: AuraWorkerRequest[] = [];
  terminated = 0;

  postMessage(message: AuraWorkerRequest): void {
    this.messages.push(message);
    queueMicrotask(() => {
      if (!this.terminated) this.emit("message", { data: { type: "result", id: message.id } satisfies AuraWorkerResponse });
    });
  }

  terminate(): void { this.terminated++; }
}

const scene = (): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0", background: "#000", nodes: [], camera: {}, diagnostics: { enabled: false }
}) as unknown as AuraSceneSnapshot;

const tick = async (): Promise<void> => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

afterEach(() => vi.unstubAllGlobals());

describe("worker host pointer capture ownership", () => {
  it("releases only its still-live captures when disposed and leaves rejected captures alone", async () => {
    const page = new EventTargetStub();
    vi.stubGlobal("window", page);
    const canvas = new CaptureCanvas();
    const worker = new HostWorker();
    // Model capture held by a separate consumer that this bridge cannot claim.
    canvas.captures.add(3);
    canvas.rejectedCaptures.add(3);
    const app = createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker as unknown as AuraWorkerHostEndpoint, scene: scene(), autoStart: false });
    await app.ready;

    canvas.pointer("pointerdown", 1);
    canvas.pointer("pointerdown", 2);
    canvas.pointer("pointerup", 2);
    canvas.pointer("pointerdown", 3);
    await tick();
    const inputCount = worker.messages.filter((message) => message.type === "input").length;

    const first = app.dispose();
    expect(canvas.releases).toEqual([1]);
    expect([...canvas.captures]).toEqual([3]);
    await Promise.all([first, app.dispose()]);
    await tick();
    expect(canvas.releases).toEqual([1]);
    expect(worker.messages.filter((message) => message.type === "input")).toHaveLength(inputCount);
    expect(worker.terminated).toBe(1);
  });

  it("releases captures on blur while publishing one cancellation per active pointer", async () => {
    const page = new EventTargetStub();
    vi.stubGlobal("window", page);
    const canvas = new CaptureCanvas();
    const worker = new HostWorker();
    const app = createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker as unknown as AuraWorkerHostEndpoint, scene: scene(), autoStart: false });
    await app.ready;
    canvas.pointer("pointerdown", 1);
    canvas.pointer("pointerdown", 2);
    await tick();

    // releasePointerCapture synchronously emits lostpointercapture in this
    // test, exercising the reentrant-event edge as well as browser timing.
    page.emit("blur");
    await tick();
    expect(canvas.releases).toEqual([1, 2]);
    expect([...canvas.captures]).toEqual([]);
    const lastInput = worker.messages.filter((message) => message.type === "input").at(-1);
    expect(lastInput?.type).toBe("input");
    if (lastInput?.type !== "input") throw new Error("missing input");
    expect(lastInput.input.pointers).toEqual([]);
    expect(lastInput.input.pointerEvents?.map((event) => [event.phase, event.pointer.id, event.phase === "cancel" ? event.reason : ""])).toEqual([
      ["cancel", 1, "blur"], ["cancel", 2, "blur"]
    ]);
    await app.dispose();
    expect(canvas.releases).toEqual([1, 2]);
  });

  it("forgets capture lost before teardown", async () => {
    const page = new EventTargetStub();
    vi.stubGlobal("window", page);
    const canvas = new CaptureCanvas();
    const worker = new HostWorker();
    const app = createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: worker as unknown as AuraWorkerHostEndpoint, scene: scene(), autoStart: false });
    await app.ready;
    canvas.pointer("pointerdown", 4);
    canvas.pointer("lostpointercapture", 4);
    await app.dispose();
    expect(canvas.releases).toEqual([]);
  });
});
