/**
 * GU47 phase 2 (lane g20, second visual pass): `?perf=1` frame-cost probe for the software-WebGL2 capture runner.
 * It wraps the WebGL2 prototype before the engine creates its context and reports, every 20 s of wall time, through
 * `console.error` (the luma capture logs page errors as `GL_CONSOLE` lines, at most 200 characters each):
 *   NR_PERF f=<frames> ms=<mean frame ms> d=<draws/frame> fb=<framebuffer binds/frame> c=<programs linked> cms=<link ms>
 *   NR_PROG <tag> ms=<ms per frame> n=<draws per frame>   (top programs by GPU time, `?perf=2` only)
 * `?perf=2` calls `gl.finish()` after every draw so the time of each draw lands on its program (it slows the page; the
 * absolute numbers are inflated, the split between programs is the point). Nothing here runs without `?perf`.
 */

interface ProgramStat { tag: string; ms: number; draws: number }

const TAGS: readonly [RegExp, string][] = [
  [/outline|u_inkColor|edgeThreshold/i, "ink"],
  [/grain/i, "grain"],
  [/bloom|u_threshold/i, "bloom"],
  [/ssao|ambientOcclusion|u_aoRadius/i, "ao"],
  [/fxaa/i, "fxaa"],
  [/vignette/i, "vignette"],
  [/colorGrade|u_contrast|u_saturation/i, "grade"],
  [/volumetric|godRay/i, "volumetric"],
  [/toneMap|agx|aces/i, "tonemap"]
];

function tagOf(fs: string): string {
  const def = (name: string): string | null => { const m = new RegExp(`#define ${name} (\\d+)`).exec(fs); return m ? m[1]! : null; };
  if (/#define A3D_LIT\b/.test(fs) || /NUM_POINT_LIGHTS/.test(fs)) {
    const parts = ["lit", `p${def("NUM_POINT_LIGHTS") ?? "?"}`, `c${def("NUM_SHADOW_CASCADES") ?? 0}`];
    if (/#define LIGHTS_CLUSTERED/.test(fs)) parts.push("clu");
    if (/#define USE_INSTANCING\b/.test(fs)) parts.push("inst");
    if (/clearcoat/i.test(fs)) parts.push("coat");
    return `${parts.join("-")}-${fs.length}`;
  }
  for (const [re, tag] of TAGS) if (re.test(fs)) return `${tag}-${fs.length}`;
  return `other-${fs.length}`;
}

export function installPerfProbe(level: number): void {
  const proto = (globalThis as { WebGL2RenderingContext?: { prototype: WebGL2RenderingContext } }).WebGL2RenderingContext?.prototype;
  if (!proto || level <= 0) return;
  const shaderSource = new WeakMap<WebGLShader, { type: number; src: string }>();
  const programTag = new WeakMap<WebGLProgram, ProgramStat>();
  const stats: ProgramStat[] = [];
  let current: ProgramStat | null = null;
  let draws = 0, fbBinds = 0, linked = 0, linkMs = 0, frames = 0, frameMs = 0, last = performance.now(), windowStart = last;

  const origSource = proto.shaderSource;
  proto.shaderSource = function (this: WebGL2RenderingContext, shader: WebGLShader, src: string) {
    shaderSource.set(shader, { type: this.getShaderParameter(shader, this.SHADER_TYPE) as number, src });
    return origSource.call(this, shader, src);
  };
  const origAttach = proto.attachShader;
  const attached = new WeakMap<WebGLProgram, string>();
  proto.attachShader = function (this: WebGL2RenderingContext, program: WebGLProgram, shader: WebGLShader) {
    const s = shaderSource.get(shader);
    if (s && s.type === this.FRAGMENT_SHADER) attached.set(program, s.src);
    return origAttach.call(this, program, shader);
  };
  const origLink = proto.linkProgram;
  proto.linkProgram = function (this: WebGL2RenderingContext, program: WebGLProgram) {
    const t = performance.now();
    origLink.call(this, program);
    // Force the link to finish here so its cost is not charged to the first draw.
    this.getProgramParameter(program, this.LINK_STATUS);
    linkMs += performance.now() - t;
    linked++;
    const stat: ProgramStat = { tag: tagOf(attached.get(program) ?? ""), ms: 0, draws: 0 };
    programTag.set(program, stat);
    stats.push(stat);
  };
  const origUse = proto.useProgram;
  proto.useProgram = function (this: WebGL2RenderingContext, program: WebGLProgram | null) {
    current = program ? programTag.get(program) ?? null : null;
    return origUse.call(this, program);
  };
  const origBind = proto.bindFramebuffer;
  proto.bindFramebuffer = function (this: WebGL2RenderingContext, target: number, fb: WebGLFramebuffer | null) {
    fbBinds++;
    return origBind.call(this, target, fb);
  };
  for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"] as const) {
    const orig = proto[name] as (...args: unknown[]) => void;
    (proto as unknown as Record<string, unknown>)[name] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
      draws++;
      if (level < 2) return orig.apply(this, args);
      const t = performance.now();
      orig.apply(this, args);
      this.finish();
      if (current) { current.ms += performance.now() - t; current.draws++; }
    };
  }

  // Non-draw GL work by kind (uploads, readbacks, blits, clears, mip generation), finished in place on `?perf=2`.
  const kinds: Record<string, { ms: number; n: number }> = {};
  const KIND: Record<string, string> = {
    texImage2D: "up", texSubImage2D: "up", texImage3D: "up", texSubImage3D: "up", texStorage2D: "up", bufferData: "buf", bufferSubData: "buf",
    readPixels: "rd", getBufferSubData: "rd", clientWaitSync: "rd", blitFramebuffer: "blit", clear: "clr", clearBufferfv: "clr", generateMipmap: "mip",
    copyTexSubImage2D: "copy", invalidateFramebuffer: "inv"
  };
  for (const [name, kind] of Object.entries(KIND)) {
    const orig = (proto as unknown as Record<string, ((...args: unknown[]) => unknown) | undefined>)[name];
    if (typeof orig !== "function") continue;
    (proto as unknown as Record<string, unknown>)[name] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
      const t = performance.now();
      const out = orig.apply(this, args);
      if (level >= 2) this.finish();
      const k = kinds[kind] ??= { ms: 0, n: 0 };
      k.ms += performance.now() - t; k.n++;
      return out;
    };
  }
  // Time inside every other requestAnimationFrame callback (the engine frame on the main thread).
  let jsMs = 0;
  const origRaf = globalThis.requestAnimationFrame.bind(globalThis);
  const wrapped = (cb: FrameRequestCallback): number => origRaf((t) => { const a = performance.now(); try { cb(t); } finally { jsMs += performance.now() - a; } });
  globalThis.requestAnimationFrame = wrapped;

  const report = (): void => {
    const now = performance.now();
    const f = Math.max(1, frames);
    console.error(`NR_PERF f=${frames} ms=${(frameMs / f).toFixed(0)} d=${(draws / f).toFixed(0)} fb=${(fbBinds / f).toFixed(1)} c=${linked} cms=${linkMs.toFixed(0)} t=${((now - windowStart) / 1000).toFixed(0)}`);
    console.error(`NR_GL js=${(jsMs / f).toFixed(0)} ${Object.entries(kinds).map(([k, v]) => `${k}=${(v.ms / f).toFixed(0)}/${(v.n / f).toFixed(0)}`).join(" ")}`);
    jsMs = 0;
    for (const k of Object.values(kinds)) { k.ms = 0; k.n = 0; }
    if (level >= 2) {
      const merged = new Map<string, { ms: number; n: number }>();
      for (const s of stats) { const m = merged.get(s.tag) ?? { ms: 0, n: 0 }; m.ms += s.ms; m.n += s.draws; merged.set(s.tag, m); s.ms = 0; s.draws = 0; }
      const top = [...merged].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10);
      for (const [tag, m] of top) if (m.ms > 0) console.error(`NR_PROG ${tag} ms=${(m.ms / f).toFixed(0)} n=${(m.n / f).toFixed(1)}`);
    }
    draws = 0; fbBinds = 0; frames = 0; frameMs = 0; windowStart = now;
  };
  const tick = (t: number): void => {
    frames++;
    frameMs += t - last;
    last = t;
    if (t - windowStart > 20_000) report();
    origRaf(tick);
  };
  origRaf(tick);
}
