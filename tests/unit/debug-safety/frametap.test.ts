import { describe, expect, it } from "vitest";
import { installFrameTap } from "../../../packages/debug/src/safety/index";

/** A fake GL context class: draw calls, bindFramebuffer and getExtension, with a controllable canvas. */
function fakeGl() {
  class FakeCanvas {
    constructor(public width: number, public height: number) {}
  }
  class FakeGL {
    ext: { multiDrawElementsInstancedWEBGL: () => string } | undefined;
    constructor(public canvas: unknown) {}
    drawArrays(): string { return "da"; }
    drawElements(): string { return "de"; }
    drawArraysInstanced(): string { return "dai"; }
    drawElementsInstanced(): string { return "dei"; }
    bindFramebuffer(_target: number, _fb: unknown): void {}
    getExtension(name: string): unknown {
      if (!/multi_draw/i.test(name)) return null;
      this.ext ??= { multiDrawElementsInstancedWEBGL: () => "md" };
      return this.ext;
    }
  }
  return { FakeCanvas, FakeGL };
}

function harness(minWidth = 128, minHeight = 96) {
  const { FakeCanvas, FakeGL } = fakeGl();
  const queue: Array<() => void> = [];
  const reported: unknown[] = [];
  // The tap accepts HTMLCanvasElement-like objects (a numeric width) when no DOM is present.
  const tap = installFrameTap({ prototypes: [FakeGL.prototype], enqueue: (fn) => queue.push(fn), onFrame: (c) => reported.push(c), minWidth, minHeight });
  const flush = (): void => { while (queue.length) queue.shift()!(); };
  return { FakeCanvas, FakeGL, tap, queue, reported, flush };
}

describe("frame tap", () => {
  it("reports one frame per task however many draws it contains, after the draw code returned", () => {
    const h = harness();
    const canvas = new h.FakeCanvas(800, 600);
    const gl = new h.FakeGL(canvas);
    expect(gl.drawArrays()).toBe("da");
    gl.drawElements();
    gl.drawElementsInstanced();
    expect(h.reported).toHaveLength(0);
    expect(h.queue).toHaveLength(1);
    h.flush();
    expect(h.reported).toEqual([canvas]);
    expect(h.tap.drawCalls()).toBe(3);
    expect(h.tap.frames()).toBe(1);
    gl.drawArrays();
    h.flush();
    expect(h.reported).toHaveLength(2);
  });

  it("does not report draws into an offscreen framebuffer, only the default framebuffer", () => {
    const h = harness();
    const gl = new h.FakeGL(new h.FakeCanvas(800, 600));
    gl.bindFramebuffer(0x8d40, { fbo: 1 });
    gl.drawElements();
    h.flush();
    expect(h.reported).toHaveLength(0);
    gl.bindFramebuffer(0x8ca8, { read: 1 });
    gl.drawElements();
    h.flush();
    expect(h.reported).toHaveLength(0);
    gl.bindFramebuffer(0x8d40, null);
    gl.drawElements();
    h.flush();
    expect(h.reported).toHaveLength(1);
  });

  it("ignores small canvases (minimaps, HUD widgets) and tracks the largest drawing canvas as the world", () => {
    const h = harness();
    const mini = new h.FakeCanvas(160, 80);
    const world = new h.FakeCanvas(800, 600);
    const side = new h.FakeCanvas(300, 300);
    new h.FakeGL(mini).drawArrays();
    new h.FakeGL(side).drawArrays();
    new h.FakeGL(world).drawArrays();
    h.flush();
    expect(h.tap.worldCanvas()).toBe(world);
    expect(h.reported).not.toContain(mini);
  });

  it("counts multi-draw extension calls as draws", () => {
    const h = harness();
    const gl = new h.FakeGL(new h.FakeCanvas(800, 600));
    const ext = gl.getExtension("WEBGL_multi_draw") as { multiDrawElementsInstancedWEBGL: () => string };
    expect(ext.multiDrawElementsInstancedWEBGL()).toBe("md");
    h.flush();
    expect(h.reported).toHaveLength(1);
    expect(gl.getExtension("WEBGL_multi_draw")).toBe(ext);
    expect(gl.getExtension("OES_something")).toBeNull();
  });

  it("a task that only ran a HUD callback reports nothing, the task where the app draws reports once", () => {
    const h = harness();
    const gl = new h.FakeGL(new h.FakeCanvas(800, 600));
    // Task 1: an unrelated animation-frame callback ran; nothing drew. The old rAF sampler read zeros here.
    h.flush();
    expect(h.reported).toHaveLength(0);
    // Task 2: the app draws.
    gl.drawElements();
    h.flush();
    expect(h.reported).toHaveLength(1);
  });

  it("a failing observer never breaks the page and dispose restores every method", () => {
    const { FakeCanvas, FakeGL } = fakeGl();
    const queue: Array<() => void> = [];
    const before = (FakeGL.prototype as unknown as Record<string, unknown>).drawElements;
    const tap = installFrameTap({ prototypes: [FakeGL.prototype], enqueue: (fn) => queue.push(fn), onFrame: () => { throw new Error("observer bug"); } });
    const gl = new FakeGL(new FakeCanvas(800, 600));
    gl.drawElements();
    expect(() => queue.forEach((fn) => fn())).not.toThrow();
    tap.dispose();
    expect((FakeGL.prototype as unknown as Record<string, unknown>).drawElements).toBe(before);
  });
});
