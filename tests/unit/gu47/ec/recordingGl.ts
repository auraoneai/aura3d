/**
 * GU47 E-C test double: a WebGL2 context that records what the v2 stage
 * drivers do (program sources, uniform writes, texture binds, draws) so the
 * unit gate can prove uniform writes and draw counts without a browser.
 */
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";
import type { RenderTarget } from "../../../../packages/rendering/src/RenderDevice";

export interface DrawRecord {
  /** Fragment source of the program in use. */
  readonly fragment: string;
  /** Uniform writes since the previous draw, by name. */
  readonly uniforms: Readonly<Record<string, readonly number[]>>;
  /** TEXTURE_3D binds since the previous draw. */
  readonly textures3d: readonly unknown[];
}

export interface RecordingGl {
  readonly gl: WebGL2RenderingContext;
  readonly draws: DrawRecord[];
  readonly texImage3D: { width: number; height: number; depth: number; data: ArrayBufferView | null }[];
}

export function recordingGl(): RecordingGl {
  const draws: DrawRecord[] = [];
  const texImage3D: RecordingGl["texImage3D"] = [];
  const shaderSources = new Map<object, string>();
  const programFragment = new Map<object, string>();
  const attached = new Map<object, object[]>();
  let current: object | null = null;
  let pending: Record<string, number[]> = {};
  let pending3d: unknown[] = [];
  let lastTarget = 0;
  const fns: Record<string, (...args: never[]) => unknown> = {
    createVertexArray: () => ({}),
    createTexture: () => ({ texture: true }),
    createFramebuffer: () => ({}),
    createShader: (type: never) => ({ type }),
    createProgram: () => ({ program: true }),
    shaderSource: (shader: never, source: never) => { shaderSources.set(shader as object, source as string); },
    attachShader: (prog: never, shader: never) => {
      const list = attached.get(prog as object) ?? [];
      list.push(shader as object);
      attached.set(prog as object, list);
    },
    linkProgram: (prog: never) => {
      const fragment = (attached.get(prog as object) ?? []).map((s) => shaderSources.get(s) ?? "").find((s) => !/gl_Position\s*=/.test(s)) ?? "";
      programFragment.set(prog as object, fragment);
    },
    useProgram: (prog: never) => { current = prog as object | null; },
    getUniformLocation: (_prog: never, name: never) => ({ name }),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getProgramInfoLog: () => "",
    bindTexture: (target: never, tex: never) => {
      if ((target as unknown) === "TEXTURE_3D" && tex) pending3d.push(tex);
      lastTarget = target as number;
    },
    texImage3D: (_t: never, _l: never, _f: never, width: never, height: never, depth: never, _b: never, _fmt: never, _type: never, data: never) => {
      texImage3D.push({ width: width as number, height: height as number, depth: depth as number, data: data as ArrayBufferView | null });
    },
    drawArrays: () => {
      draws.push({ fragment: current ? programFragment.get(current) ?? "" : "", uniforms: pending, textures3d: pending3d });
      pending = {};
      pending3d = [];
    }
  };
  for (const name of ["uniform1i", "uniform1f", "uniform2f", "uniform3f", "uniform4f"]) {
    fns[name] = ((loc: { name?: string } | null, ...values: number[]) => {
      if (loc?.name) pending[loc.name] = values;
    }) as never;
  }
  fns.uniformMatrix4fv = ((loc: { name?: string } | null, _t: boolean, value: ArrayLike<number>) => {
    if (loc?.name) pending[loc.name] = Array.from(value);
  }) as never;
  const gl = new Proxy(fns as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      // GL enums: the enum name itself (so TEXTURE_3D binds are recognisable).
      if (typeof prop === "string" && /^[A-Z][A-Z0-9_]*$/.test(prop)) return prop;
      return () => undefined;
    },
    has: () => true
  });
  void lastTarget;
  return { gl: gl as unknown as WebGL2RenderingContext, draws, texImage3D };
}

let seq = 0;
export function fakeTarget(format: "rgba8" | "rgba16f" | "rgba32f" = "rgba16f", size = 16): RenderTarget {
  seq += 1;
  return {
    id: `gu47-ec-${seq}`,
    label: `gu47-ec-${seq}`,
    width: size,
    height: size,
    sampleCount: 1,
    needsResolve: false,
    framebuffer: { fb: seq },
    colorHandle: { color: seq },
    depthTextureHandle: { depth: seq },
    colorTexture: { format },
    dispose: () => undefined
  } as unknown as RenderTarget;
}

export function fakeHost(gl: WebGL2RenderingContext): WebGL2DeviceHost {
  return {
    gl,
    device: { createRenderTarget: (d: { format?: "rgba8" | "rgba16f" | "rgba32f"; width?: number }) => fakeTarget(d.format ?? "rgba16f", d.width ?? 16) },
    stateCache: { invalidate: () => undefined },
    resolveMultisampleTarget: () => undefined,
    lifecycle: { bindOutput: () => undefined },
    activeRenderTarget: null
  } as unknown as WebGL2DeviceHost;
}

export const CAMERA = {
  near: 0.1,
  far: 100,
  projection: "perspective",
  position: [0, 1, 5],
  projectionMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.002, -1, 0, 0, -0.2002, 0]),
  viewMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1, -5, 1]),
  viewProjectionMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.002, -1, 0, -1, 4.8098, 5])
} as never;
