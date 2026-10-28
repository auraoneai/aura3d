import { vi } from "vitest";

interface FakeProgram { id: number; shaders: { source: string }[]; attrs: string[]; uniforms: string[] }

/**
 * A WebGL2 context that accepts every call, counts them by name and answers just enough queries (shader/program
 * reflection, capability parameters, no extensions) for the direct render path to mount and draw. Unknown `createX`
 * methods return an opaque handle; unknown constants get distinct numbers.
 */
export function makeFakeGl(): { gl: WebGL2RenderingContext; calls: Record<string, number>; programSources: string[]; raiseError(code: number): void; errorPending(): boolean } {
  let next = 1;
  /** Linked program sources, in link order: what a stale program key would get wrong. */
  const programSources: string[] = [];
  /** Error code returned (once) by the next `getError()`, like a real context's error queue. */
  let pendingError = 0;
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
      programSources.push(src);
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
    getError() { const code = pendingError; pendingError = 0; return code; },
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
  return { gl: gl as unknown as WebGL2RenderingContext, calls, programSources, raiseError(code: number) { pendingError = code; }, errorPending: () => pendingError !== 0 };
}


type EngineModule = typeof import("../../packages/engine/src");
type AuraScene = ReturnType<EngineModule["scene"]>;

export interface FakeSceneOptions {
  readonly quality?: "auto" | "production";
  /** Builds the scene from the engine module the app is created with. Defaults to the benchmark cube. */
  readonly build?: (engine: EngineModule) => AuraScene;
  /** Runtime id of a node to rotate every frame (the cube scene's "cube"); none for other scenes. */
  readonly rotate?: string;
  /** Re-evaluate the engine (and with it every module-level memo and registry cache) before mounting: a cold process. */
  readonly freshModules?: boolean;
}

const cubeScene = ({ camera, lights, material, primitives, scene }: EngineModule): AuraScene => scene()
  .camera(camera.perspective({ fov: 50, near: 0.1, far: 100, position: [2, 2, 4], target: [0, 0.5, 0] }))
  .add(lights.ambient({ color: "#ffffff", intensity: 1 }))
  .add(primitives.box({ name: "cube", size: [1, 1, 1], material: material.pbr({ color: "#d86a3a" }) }).runtime({ id: "cube" }));

/** The benchmark cube on a fake context (see `mountFakeScene`). */
export function mountFakeCube(quality: "auto" | "production" = "auto") {
  return mountFakeScene({ quality });
}

/** Mounts a scene (default: the benchmark cube, same as tests/browser/frame-cost-harness.ts) on a fake canvas/context. Call `vi.unstubAllGlobals()` when done. */
export async function mountFakeScene(options: FakeSceneOptions = {}) {
  const { gl, calls, programSources, raiseError, errorPending } = makeFakeGl();
  class FakeCanvas {
    width = 640; height = 360; style = {}; parentElement = null; clientWidth = 640; clientHeight = 360; dataset = {};
    getBoundingClientRect() { return { width: 640, height: 360, left: 0, top: 0, right: 640, bottom: 360 }; }
    setAttribute() {} hasAttribute() { return true; } getAttribute() { return null; }
    getContext() { return gl; } addEventListener() {} removeEventListener() {}
  }
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("WebGL2RenderingContext", class {});
  vi.stubGlobal("window", { innerWidth: 640, innerHeight: 360, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, location: { href: "http://localhost/" } });
  if (options.freshModules) vi.resetModules();
  const engine: EngineModule = await import("../../packages/engine/src");
  const rotateId = options.rotate ?? (options.build ? undefined : "cube");
  const app = engine.createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
    autoStart: false, resize: false, pixelRatio: 1, quality: options.quality ?? "auto",
    scene: (options.build ?? cubeScene)(engine)
  });
  await app.ready();
  const node = rotateId ? app.nodes.require(rotateId) : undefined;
  let yaw = 0;
  /** One harness frame: rotate the node (when the scene has one), then step. */
  const frame = (): void => { yaw += 1 / 60; node?.setRotation(0, yaw, 0); app.step(1 / 60); };
  return { app, calls, programSources, raiseError, errorPending, frame, engine };
}
