/**
 * Guard canvas lab: a REAL WebGL2 context created without preserveDrawingBuffer (the default, like every showcase game),
 * a HUD animation-frame loop that never draws, and a game loop that draws a full-screen triangle. `?mode=` picks the output:
 *   lit   : bright colour             -> the black-frame guard must NOT fire
 *   dark  : very dim but not black    -> must NOT fire
 *   black : draws, every pixel black  -> must fire exactly once (one rung down)
 * `?drawEvery=N` draws on every Nth animation-frame callback; `?pattern=timer` draws from setInterval instead of rAF;
 * `?pattern=fbo` renders into an offscreen framebuffer first, then blits to the canvas in a later rAF callback.
 */
import { installBlackFrameGuard } from "../../packages/debug/src/safety/index";

type Lab = { mode: string; pattern: string; frames: number; draws: number; rung: () => number; observation: () => unknown; error?: string };
const w = window as unknown as { __GUARD_LAB__?: Lab };
const q = new URLSearchParams(location.search);
const mode = q.get("mode") ?? "lit";
const pattern = q.get("pattern") ?? "raf";
const drawEvery = Math.max(1, Number(q.get("drawEvery") ?? "1"));
const lab: Lab = { mode, pattern, frames: 0, draws: 0, rung: () => (window as unknown as { __AURA3D_HEAL__?: { rung: number } }).__AURA3D_HEAL__?.rung ?? -1, observation: () => (window as unknown as { __AURA3D_HEAL__?: { observation?: () => unknown } }).__AURA3D_HEAL__?.observation?.() ?? null };
w.__GUARD_LAB__ = lab;

installBlackFrameGuard();

const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
canvas.width = 640;
canvas.height = 360;
const gl = canvas.getContext("webgl2", { antialias: true, alpha: false }) as WebGL2RenderingContext | null;
if (!gl) {
  lab.error = "no webgl2";
} else {
  const colour: [number, number, number] = mode === "black" ? [0, 0, 0] : mode === "dark" ? [0.03, 0.04, 0.06] : [0.85, 0.6, 0.2];
  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) lab.error = gl.getShaderInfoLog(shader) ?? "compile";
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, "#version 300 es\nvoid main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }"));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, "#version 300 es\nprecision mediump float;\nuniform vec3 uColor;\nout vec4 o;\nvoid main(){ o = vec4(uColor, 1.0); }"));
  gl.linkProgram(program);
  gl.useProgram(program);
  gl.uniform3f(gl.getUniformLocation(program, "uColor"), colour[0], colour[1], colour[2]);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  let fbo: WebGLFramebuffer | null = null;
  let blitReady = false;
  if (pattern === "fbo") {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  const drawFrame = (): void => {
    if (fbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, 64, 64);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      blitReady = true;
    }
    lab.draws += 1;
  };
  const present = (): void => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const hud = document.querySelector("#hud")!;
  const hudLoop = (): void => {
    requestAnimationFrame(hudLoop);
    hud.textContent = `hud ${lab.frames}`;
  };
  let n = 0;
  const gameLoop = (): void => {
    requestAnimationFrame(gameLoop);
    lab.frames += 1;
    n += 1;
    if (n % drawEvery !== 0) return;
    if (pattern === "fbo") drawFrame();
    else if (pattern === "raf") {
      present();
      lab.draws += 1;
    }
  };
  requestAnimationFrame(hudLoop);
  requestAnimationFrame(gameLoop);
  if (pattern === "timer") setInterval(() => { present(); lab.draws += 1; }, 40);
  if (pattern === "fbo") {
    // The default framebuffer is only drawn in a later rAF callback than the offscreen pass.
    const blitLoop = (): void => { requestAnimationFrame(blitLoop); if (blitReady) { present(); blitReady = false; } };
    requestAnimationFrame(blitLoop);
  }
}
