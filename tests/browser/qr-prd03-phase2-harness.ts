/**
 * PRD-03 Phase-2 browser probes:
 *
 *  - `lutRamp`: LUT_BAKE_GLSL bakes a 33³ RGBA8 TEXTURE_3D (one draw per
 *    b-slice via framebufferTextureLayer), DISPLAY_GRADE_GLSL applies it to a
 *    4096-step gray ramp; the harness compares against the CPU mirror of the
 *    same grade math — ≤1 LSB per step. A `DisplayLutCache` over the real
 *    bake then proves `bakeCount === 1` across 60 frames.
 *  - `toneEval`: an emissive HDR ladder (E ∈ {0.25…8}) rendered flag-on with
 *    `output.toneMapping: "aces"` — the v2 path delegates to the fused
 *    present (CCR-03-5), whose single per-pixel operator eval must land
 *    within 1 LSB of `applyToneOperator("aces", E)`. A double eval would
 *    compress midtones far beyond that bound.
 */
import { LUT_BAKE_GLSL, DISPLAY_GRADE_GLSL } from "../../packages/rendering/src/post/shaders/displayGrade.glsl";
import { DisplayLutCache } from "../../packages/rendering/src/post/DisplayLutCache";
import { applyToneOperator } from "../../packages/rendering/src/post/ToneOperators";
import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";

const VS = `#version 300 es\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

function compileGl(gl: WebGL2RenderingContext, fsSource: string): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

const LUT_SIZE = 33;
const LUT_PARAMS = { contrast: 1.15, saturation: 1.1, vibrance: 0.25, lutIntensity: 1, userLut: 0 };

/** CPU mirror of LUT_BAKE_GLSL main() — the analytic grade. */
function analyticGrade(r: number, g: number, b: number, p = LUT_PARAMS): [number, number, number] {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const out: [number, number, number] = [0, 0, 0];
  const graded = [clamp(r * p.contrast + 0.5 - 0.5 * p.contrast), clamp(g * p.contrast + 0.5 - 0.5 * p.contrast), clamp(b * p.contrast + 0.5 - 0.5 * p.contrast)];
  const l = 0.2126 * graded[0] + 0.7152 * graded[1] + 0.0722 * graded[2];
  const dist = Math.min(1, Math.abs(graded[0] - l) + Math.abs(graded[1] - l) + Math.abs(graded[2] - l));
  const sat = p.saturation + (p.vibrance === 0 ? 0 : p.vibrance * (1 - dist));
  for (let i = 0; i < 3; i += 1) out[i] = clamp(l + (graded[i] - l) * sat);
  return out;
}

function bakeLut3D(gl: WebGL2RenderingContext): WebGLTexture {
  const program = compileGl(gl, LUT_BAKE_GLSL);
  const lut = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_3D, lut);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, LUT_SIZE, LUT_SIZE, LUT_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, LUT_SIZE, LUT_SIZE);
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, "u_hasUserLut"), 0);
  gl.uniform1f(gl.getUniformLocation(program, "u_lutIntensity"), LUT_PARAMS.lutIntensity);
  gl.uniform1f(gl.getUniformLocation(program, "u_contrast"), LUT_PARAMS.contrast);
  gl.uniform1f(gl.getUniformLocation(program, "u_saturation"), LUT_PARAMS.saturation);
  gl.uniform1f(gl.getUniformLocation(program, "u_vibrance"), LUT_PARAMS.vibrance);
  for (let slice = 0; slice < LUT_SIZE; slice += 1) {
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, lut, 0, slice);
    gl.uniform1f(gl.getUniformLocation(program, "u_slice"), (slice + 0.5) / LUT_SIZE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  return lut;
}

export function runLutRampProbe(): { maxAbsDiff: number; meanAbsDiff: number; steps: number; error?: string } {
  const canvas = document.createElement("canvas");
  canvas.width = 4096;
  canvas.height = 1;
  const gl = canvas.getContext("webgl2", { antialias: false })!;
  try {
    const lut = bakeLut3D(gl);
    const program = compileGl(gl, DISPLAY_GRADE_GLSL);
    // 4096-step gray ramp source texture.
    const src = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, src);
    const ramp = new Uint8Array(4096 * 4);
    for (let x = 0; x < 4096; x += 1) {
      const v = Math.round((x / 4095) * 255);
      ramp.set([v, v, v, 255], x * 4);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 4096, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, ramp);

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const dst = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, dst);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 4096, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    gl.viewport(0, 0, 4096, 1);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, lut);
    gl.uniform1i(gl.getUniformLocation(program, "u_source"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "u_lut3d"), 1);
    gl.uniform1i(gl.getUniformLocation(program, "u_hasLut"), 1);
    gl.uniform1f(gl.getUniformLocation(program, "u_vignetteIntensity"), 0);
    gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), 4096, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const out = new Uint8Array(4096 * 4);
    gl.readPixels(0, 0, 4096, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    let maxAbsDiff = 0;
    let sum = 0;
    for (let x = 0; x < 4096; x += 1) {
      const v = x / 4095;
      const expected = analyticGrade(v, v, v);
      for (let c = 0; c < 3; c += 1) {
        const diff = Math.abs(out[x * 4 + c]! - Math.round(expected[c]! * 255));
        maxAbsDiff = Math.max(maxAbsDiff, diff);
        sum += diff;
      }
    }
    return { maxAbsDiff, meanAbsDiff: sum / (4096 * 3), steps: 4096 };
  } catch (error) {
    return { maxAbsDiff: -1, meanAbsDiff: -1, steps: 4096, error: error instanceof Error ? error.message : String(error) };
  }
}

export function runLutRebakeProbe(): { bakeCount: number; frames: number; error?: string } {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const gl = canvas.getContext("webgl2", { antialias: false })!;
  try {
    const cache = new DisplayLutCache<WebGLTexture>(
      () => bakeLut3D(gl),
      (handle) => gl.deleteTexture(handle)
    );
    for (let frame = 0; frame < 60; frame += 1) {
      cache.acquire(LUT_PARAMS);
    }
    const bakeCount = cache.bakeCount;
    cache.clear();
    return { bakeCount, frames: 60 };
  } catch (error) {
    return { bakeCount: -1, frames: 60, error: error instanceof Error ? error.message : String(error) };
  }
}

/** prd03-tone-ramp content: emissive ladder, no lights — HDR pixel ≈ E. */
const LADDER = [0.25, 0.5, 1, 2, 4, 8] as const;

export async function runToneEvalProbe(): Promise<{ perStep: number[]; expected: number[]; pipeline: string | null; error?: string }> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-2000px;top:0;width:320px;height:200px;";
  document.body.appendChild(host);
  try {
    let built = scene()
      .background("#000000")
      .camera(camera.orthographic({ position: [0, 0, 10], target: [0, 0, 0], orthographicSize: 3.75 }));
    built = built.add(lights.ambient({ name: "off", intensity: 0, color: "#000000" }));
    LADDER.forEach((e, i) => {
      built = built.add(primitives.plane({
        name: `step-${e}`,
        size: [1.4, 1.4],
        material: material.pbr({ color: "#000000", emissive: "#ffffff", emissiveIntensity: e, roughness: 1 })
      }).position(-4.5 + i * 1.8, 0, 0));
    });
    built = built.add(effects.bloom({ intensity: 0.1, threshold: 1.0 }));
    const app = createAuraApp(host, {
      scene: built,
      renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
      pixelRatio: 1,
      resize: false,
      autoStart: false,
      qualityRebuild: { flags: ["post"] },
      output: { toneMapping: "aces", exposure: 1 }
    } as never);
    await app.ready();
    app.step(0);
    const canvas = host.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2")!;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const post = (app.diagnostics() as { post?: { pipeline?: string } }).post;
    app.dispose();
    const cy = Math.round(canvas.height / 2);
    const halfWidth = 3.75 * (canvas.width / canvas.height);
    const cx = (i: number) => Math.round(((-4.5 + i * 1.8) / (2 * halfWidth) + 0.5) * canvas.width);
    const perStep = LADDER.map((_, i) => pixels[(cy * canvas.width + Math.min(canvas.width - 1, Math.max(0, cx(i)))) * 4]!);
    const expected = [...LADDER].map((e) => Math.round(applyToneOperator("aces", [e, e, e], 1)[0]! * 255));
    return { perStep, expected, pipeline: post?.pipeline ?? null };
  } catch (error) {
    return { perStep: [], expected: [], pipeline: null, error: error instanceof Error ? error.message : String(error) };
  } finally {
    host.remove();
  }
}

export async function runQrPrd03Phase2() {
  const lut = runLutRampProbe();
  const rebake = runLutRebakeProbe();
  const tone = await runToneEvalProbe().catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  return { schema: "qr-prd03-phase2/v1", lut, rebake, tone };
}

(window as unknown as { runQrPrd03Phase2: typeof runQrPrd03Phase2 }).runQrPrd03Phase2 = runQrPrd03Phase2;
