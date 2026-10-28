import { camera, createAuraApp, lights, material, primitives, scene } from "../../packages/engine/src";
import { vi } from "vitest";

interface FakeProgram { id: number; shaders: { source: string }[]; attrs: string[]; uniforms: string[] }

/**
 * A WebGL2 context that accepts every call, counts them by name and answers just enough queries (shader/program
 * reflection, capability parameters, no extensions) for the direct render path to mount and draw. Unknown `createX`
 * methods return an opaque handle; unknown constants get distinct numbers.
 */
export function makeFakeGl(): { gl: WebGL2RenderingContext; calls: Record<string, number> } {
  let next = 1;
  const calls: Record<string, number> = {};
  const consts = new Map<string, number>();
  const constant = (name: string): number => {
    let value = consts.get(name);
    if (value === undefined) { value = 0x10000 + consts.size; consts.set(name, value); }
    return value;
  };
  const base: Record<string, unknown> = {
    NO_ERROR: 0,
    getParameter(p: number) {
      if (p === constant("RENDERER")) return "fake-webgl2";
      if (p === constant("VENDOR")) return "aura3d";
      if (p === constant("VERSION")) return "WebGL 2.0";
      if (p === constant("VIEWPORT")) return [0, 0, 640, 360];
      return 16;
    },
    getExtension() { return null; },
    getSupportedExtensions() { return []; },
    createShader() { return { id: next++, source: "" }; },
    shaderSource(s: { source: string }, src: string) { s.source = src; },
    getShaderParameter() { return true; },
    getShaderInfoLog() { return ""; },
    createProgram(): FakeProgram { return { id: next++, shaders: [], attrs: [], uniforms: [] }; },
    attachShader(p: FakeProgram, s: { source: string }) { p.shaders.push(s); },
    linkProgram(p: FakeProgram) {
      const src = p.shaders.map((s) => s.source).join("\n");
      p.attrs = [...new Set([...src.matchAll(/\b(?:in|attribute)\s+\w+\s+(\w+)\s*;/g)].map((m) => m[1]!))];
      p.uniforms = [...new Set([...src.matchAll(/\buniform\s+(?:highp\s+|mediump\s+|lowp\s+)?\w+\s+(\w+)(?:\[\d+\])?\s*;/g)].map((m) => m[1]!))];
    },
    getProgramParameter(p: FakeProgram, param: number) {
      if (param === constant("LINK_STATUS")) return true;
      if (param === constant("ACTIVE_ATTRIBUTES")) return p.attrs.length;
      if (param === constant("ACTIVE_UNIFORMS")) return p.uniforms.length;
      return 0;
    },
    getProgramInfoLog() { return ""; },
    getActiveAttrib(p: FakeProgram, i: number) { return p.attrs[i] ? { name: p.attrs[i], type: constant("FLOAT"), size: 1 } : null; },
    getAttribLocation(p: FakeProgram, n: string) { return p.attrs.indexOf(n); },
    getActiveUniform(p: FakeProgram, i: number) { return p.uniforms[i] ? { name: p.uniforms[i], type: constant("FLOAT"), size: 1 } : null; },
    getUniformLocation(p: FakeProgram, n: string) { const name = n.replace(/\[0\]$/, ""); return p.uniforms.includes(name) ? { name } : null; },
    isEnabled() { return false; },
    getError() { return 0; },
    checkFramebufferStatus() { return constant("FRAMEBUFFER_COMPLETE"); },
    isContextLost() { return false; },
    getShaderPrecisionFormat() { return { rangeMin: 127, rangeMax: 127, precision: 23 }; },
    getContextAttributes() { return { antialias: true, alpha: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false }; }
  };
  const wrapped = new Map<string, unknown>();
  const count = (name: string, impl?: (...a: unknown[]) => unknown) => {
    let fn = wrapped.get(name);
    if (!fn) {
      fn = (...args: unknown[]) => { calls[name] = (calls[name] ?? 0) + 1; return impl ? impl.apply(base, args) : undefined; };
      wrapped.set(name, fn);
    }
    return fn;
  };
  const gl = new Proxy(base, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop in target) {
        const value = target[prop];
        return typeof value === "function" ? count(prop, value as (...a: unknown[]) => unknown) : value;
      }
      if (/^[A-Z][A-Z0-9_]+$/.test(prop)) return constant(prop);
      if (prop.startsWith("create")) return count(prop, () => ({ id: next++ }));
      return count(prop);
    }
  });
  return { gl: gl as unknown as WebGL2RenderingContext, calls };
}


/** Mounts the benchmark cube scene (same as tests/browser/frame-cost-harness.ts) on a fake canvas/context. Call `vi.unstubAllGlobals()` when done. */
export async function mountFakeCube(quality: "auto" | "production" = "auto") {
  const { gl, calls } = makeFakeGl();
  class FakeCanvas {
    width = 640; height = 360; style = {}; parentElement = null; clientWidth = 640; clientHeight = 360; dataset = {};
    getBoundingClientRect() { return { width: 640, height: 360, left: 0, top: 0, right: 640, bottom: 360 }; }
    setAttribute() {} hasAttribute() { return true; } getAttribute() { return null; }
    getContext() { return gl; } addEventListener() {} removeEventListener() {}
  }
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("WebGL2RenderingContext", class {});
  vi.stubGlobal("window", { innerWidth: 640, innerHeight: 360, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, location: { href: "http://localhost/" } });
  const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
    autoStart: false, resize: false, pixelRatio: 1, quality,
    scene: scene()
      .camera(camera.perspective({ fov: 50, near: 0.1, far: 100, position: [2, 2, 4], target: [0, 0.5, 0] }))
      .add(lights.ambient({ color: "#ffffff", intensity: 1 }))
      .add(primitives.box({ name: "cube", size: [1, 1, 1], material: material.pbr({ color: "#d86a3a" }) }).runtime({ id: "cube" }))
  });
  await app.ready();
  const cube = app.nodes.require("cube");
  let yaw = 0;
  /** One harness frame: rotate the cube, then step. */
  const frame = (): void => { yaw += 1 / 60; cube.setRotation(0, yaw, 0); app.step(1 / 60); };
  return { app, calls, frame };
}
