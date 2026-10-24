/** Raw-WebGL2 micro-experiments isolating the cost of Aura's final tone-map present draw (remote only, software GL). */
const W = 640, H = 360;
const VS = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() { vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); v_uv = position; gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0); }`;
const FS_PASS = `#version 300 es
precision highp float;
uniform sampler2D u_source; in vec2 v_uv; out vec4 outColor;
void main() { outColor = texture(u_source, v_uv); }`;
const FS_TONE = `#version 300 es
precision highp float;
uniform sampler2D u_source; uniform float u_exposure; in vec2 v_uv; out vec4 outColor;
float linearToSrgb(float v) { return v <= 0.0031308 ? v * 12.92 : 1.055 * pow(v, 1.0 / 2.4) - 0.055; }
vec3 acesRrtAndOdtFit(vec3 value) { vec3 n = value * (value + 0.0245786) - 0.000090537; vec3 d = value * (0.983729 * value + 0.4329510) + 0.238081; return n / d; }
vec3 acesFilmic(vec3 color) {
  const mat3 i = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 o = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  vec3 a = i * (color / 0.6); a = acesRrtAndOdtFit(a); return clamp(o * a, 0.0, 1.0);
}
void main() { vec3 c = texture(u_source, clamp(v_uv, vec2(0.0), vec2(1.0))).rgb; vec3 m = acesFilmic(max(vec3(0.0), c * u_exposure)); outColor = vec4(vec3(linearToSrgb(m.r), linearToSrgb(m.g), linearToSrgb(m.b)), 1.0); }`;
const SCENE_VS = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const SCENE_FS = `#version 300 es
precision highp float; out vec4 o; void main() { o = vec4(0.8, 0.4, 0.2, 1.0); }`;

type Variant = { name: string; run(): number };
const results: Array<{ name: string; medianMs: number; samplesMs: number[] }> = [];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader"); gl.attachShader(p, s); }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
}

function experiment(name: string, opts: { aa: boolean; srcFormat: "rgba16f" | "rgba8"; shader: "tone" | "pass" | "ldr"; target: "default" | "fbo8" | "fbo8ms"; viaMsaaBlit: boolean; filter?: "linear" | "nearest" }): void {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  document.body.appendChild(canvas);
  const gl = canvas.getContext("webgl2", { antialias: opts.aa, alpha: false, preserveDrawingBuffer: false })!;
  const sink = new Uint8Array(4);
  const vao = gl.createVertexArray();
  const ldrSrc = (window as unknown as { __LDR_FS__?: string }).__LDR_FS__;
  const prog = program(gl, VS, opts.shader === "ldr" ? ldrSrc! : opts.shader === "tone" ? FS_TONE : FS_PASS);
  const sceneProg = program(gl, SCENE_VS, SCENE_FS);
  const sceneVao = gl.createVertexArray()!; gl.bindVertexArray(sceneVao);
  const vb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, 0, 0.5]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(sceneProg, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.getExtension("EXT_color_buffer_float"); gl.getExtension("EXT_color_buffer_half_float");
  const ifmt = opts.srcFormat === "rgba16f" ? gl.RGBA16F : gl.RGBA8;
  const src = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, src); gl.texStorage2D(gl.TEXTURE_2D, 1, ifmt, W, H);
  const filt = opts.filter === "nearest" ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const srcFbo = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, srcFbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, src, 0);
  // MSAA scene target (as Aura: 4x renderbuffer colour + depth)
  const msFbo = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
  const msColor = gl.createRenderbuffer()!; gl.bindRenderbuffer(gl.RENDERBUFFER, msColor); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, ifmt, W, H); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColor);
  const msDepth = gl.createRenderbuffer()!; gl.bindRenderbuffer(gl.RENDERBUFFER, msDepth); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.DEPTH_COMPONENT24, W, H); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msDepth);
  // optional offscreen RGBA8 targets
  const t8 = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t8); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
  const fbo8 = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, fbo8); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t8, 0);
  const rb8 = gl.createRenderbuffer()!; gl.bindRenderbuffer(gl.RENDERBUFFER, rb8); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.RGBA8, W, H);
  const fbo8ms = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, fbo8ms); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb8);

  const frame = (): void => {
    if (opts.viaMsaaBlit) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo); gl.viewport(0, 0, W, H); gl.enable(gl.DEPTH_TEST); gl.clearColor(0.1, 0.1, 0.1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(sceneProg); gl.bindVertexArray(sceneVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, srcFbo); gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, srcFbo); gl.viewport(0, 0, W, H); gl.clearColor(0.4, 0.3, 0.2, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, opts.target === "default" ? null : opts.target === "fbo8" ? fbo8 : fbo8ms);
    gl.viewport(0, 0, W, H); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    gl.useProgram(prog); gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(gl.getUniformLocation(prog, "u_source"), 0);
    const ue = gl.getUniformLocation(prog, "u_exposure"); if (ue) gl.uniform1f(ue, 1);
    if (opts.shader === "ldr") {
      const i1 = (n: string, v: number) => { const l = gl.getUniformLocation(prog, n); if (l) gl.uniform1i(l, v); };
      const f1 = (n: string, v: number) => { const l = gl.getUniformLocation(prog, n); if (l) gl.uniform1f(l, v); };
      gl.uniform2f(gl.getUniformLocation(prog, "u_texelSize"), 1 / W, 1 / H);
      i1("u_hasToneMapping", 1); i1("u_toneOperator", 2); i1("u_inputColorSpace", 0); i1("u_outputColorSpace", 1);
      f1("u_whitePoint", 1); f1("u_gamma", 2.2); i1("u_hasColorGrade", 0); f1("u_contrast", 1); f1("u_saturation", 1); i1("u_hasFxaa", 0); f1("u_edgeThreshold", 0.125); f1("u_subpixelBlend", 0.75);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (opts.target === "fbo8ms") { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo8ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbo8); gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo8); }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sink);
    gl.depthMask(true);
  };
  for (let i = 0; i < 3; i++) frame();
  const samples: number[] = [];
  for (let i = 0; i < 8; i++) { const t = performance.now(); frame(); samples.push(performance.now() - t); }
  results.push({ name, medianMs: +median(samples).toFixed(2), samplesMs: samples.map((s) => +s.toFixed(1)) });
  canvas.remove();
}

const base = { aa: true, srcFormat: "rgba16f", shader: "tone", target: "default", viaMsaaBlit: true } as const;
const plan: Array<[string, Parameters<typeof experiment>[1]]> = [
  ["A aura-like: aa ctx, rgba16f src via msaa blit, tone shader, default fb", base],
  ["B passthrough shader", { ...base, shader: "pass" }],
  ["C rgba8 source/msaa", { ...base, srcFormat: "rgba8" }],
  ["D context antialias=false", { ...base, aa: false }],
  ["E target offscreen rgba8 fbo (non-msaa)", { ...base, target: "fbo8" }],
  ["F target offscreen rgba8 4x msaa fbo + resolve", { ...base, target: "fbo8ms" }],
  ["G source filled by clear (no msaa blit)", { ...base, viaMsaaBlit: false }],
  ["H nearest filter", { ...base, filter: "nearest" }],
  ["J EXACT Aura LDR fragment shader (tone only), rgba16f", { ...base, shader: "ldr" }],
  ["K exact Aura LDR shader, rgba8 source", { ...base, shader: "ldr", srcFormat: "rgba8" }],
  ["L exact Aura LDR shader, aa=false, fbo8 target", { ...base, shader: "ldr", aa: false, target: "fbo8" }],
  ["I aa=false, rgba8, pass, fbo8 (floor)", { aa: false, srcFormat: "rgba8", shader: "pass", target: "fbo8", viaMsaaBlit: false }]
];
const w = window as unknown as Record<string, unknown>;
try {
  for (const [name, opts] of plan) experiment(name, opts);
  w.__MICRO__ = { ready: true, results };
} catch (e) {
  w.__MICRO__ = { ready: false, error: String((e as Error).stack ?? e), results };
}
