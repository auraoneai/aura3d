import { expect, test } from "@playwright/test";
import { TAA_RESOLVE_GLSL } from "../../packages/rendering/src/post/shaders/taa.glsl";
import { MB_RECONSTRUCT_GLSL } from "../../packages/rendering/src/post/shaders/motionBlur.glsl";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Phase-B shader-level numerical checks. These synthetic inputs isolate the
 * resolve from scene authoring; a separate renderer/asset sequence is still
 * needed to prove skinned, instanced and transparent motion-vector production.
 */
test("temporal resolve rejects stale history and reconstructs a higher-resolution grid", async ({ page }) => {
  const server = await startExampleDevServer();
  try {
    await page.goto(server.origin);
    const results = await page.evaluate((fragment) => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2", { antialias: false });
      if (!gl || !gl.getExtension("EXT_color_buffer_float")) throw new Error("Float-renderable WebGL2 is required for native temporal resolve");
      const shader = (kind: number, source: string) => {
        const result = gl.createShader(kind);
        if (!result) throw new Error("shader allocation failed");
        gl.shaderSource(result, source);
        gl.compileShader(result);
        if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result) ?? "shader compile failed");
        return result;
      };
      const vs = shader(gl.VERTEX_SHADER, `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`);
      const fs = shader(gl.FRAGMENT_SHADER, fragment);
      const program = gl.createProgram();
      if (!program) throw new Error("program allocation failed");
      gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
      gl.useProgram(program);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const textures: WebGLTexture[] = [];
      const upload = (width: number, height: number, data: Float32Array, unit: number, name: string) => {
        const texture = gl.createTexture();
        if (!texture) throw new Error("texture allocation failed");
        textures.push(texture); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
        gl.uniform1i(gl.getUniformLocation(program, name), unit);
      };
      const fill = (size: number, value: readonly [number, number, number, number]) => {
        const data = new Float32Array(size * size * 4);
        for (let i = 0; i < size * size; i++) data.set(value, i * 4);
        return data;
      };
      const run = (settings: { history: boolean; reactive: number; previousDepth: number; expectedDepth?: number; depthNear?: number; negativeColor?: boolean; currentAlpha?: number; priorAlpha?: number; motion: number; outputSize: number }) => {
        const outer = settings.negativeColor ? -.4 : .8;
        const center = settings.negativeColor ? -.2 : .2;
        const prior = settings.negativeColor ? -.3 : .5;
        const currentAlpha = settings.currentAlpha ?? .5, priorAlpha = settings.priorAlpha ?? .5;
        const current = fill(3, [outer, outer, outer, currentAlpha]);
        current.set([center, center, center, currentAlpha], 4 * 4);
        upload(3, 3, current, 0, "u_current");
        upload(settings.outputSize, settings.outputSize, fill(settings.outputSize, [prior, prior, prior, priorAlpha]), 1, "u_history");
        const expectedDepth = settings.expectedDepth ?? .5;
        upload(3, 3, fill(3, [settings.motion, 0, expectedDepth, expectedDepth]), 2, "u_velocityDilate");
        upload(3, 3, fill(3, [settings.previousDepth, 0, 0, 1]), 3, "u_linZPrev");
        upload(3, 3, fill(3, [settings.reactive, 0, 0, 1]), 4, "u_reactive");
        const output = gl.createTexture(), fb = gl.createFramebuffer();
        if (!output || !fb) throw new Error("output allocation failed");
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, output);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, settings.outputSize, settings.outputSize, 0, gl.RGBA, gl.FLOAT, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("incomplete output");
        gl.viewport(0, 0, settings.outputSize, settings.outputSize);
        gl.uniform1i(gl.getUniformLocation(program, "u_hasReactive"), 1);
        gl.uniform1i(gl.getUniformLocation(program, "u_hasHistory"), settings.history ? 1 : 0);
        gl.uniform1i(gl.getUniformLocation(program, "u_hasExpectedDepth"), 1);
        gl.uniform1f(gl.getUniformLocation(program, "u_depthNear"), settings.depthNear ?? 0);
        gl.uniform2f(gl.getUniformLocation(program, "u_jitterUv"), 0, 0);
        gl.uniform2f(gl.getUniformLocation(program, "u_previousJitterUv"), 0, 0);
        gl.uniform1f(gl.getUniformLocation(program, "u_feedbackMin"), .9);
        gl.uniform1f(gl.getUniformLocation(program, "u_feedbackMax"), .9);
        gl.uniform1f(gl.getUniformLocation(program, "u_varianceGamma"), 2);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const pixel = new Float32Array(4);
        const outputCenter = settings.outputSize === 3 ? 1 : 2;
        gl.readPixels(outputCenter, outputCenter, 1, 1, gl.RGBA, gl.FLOAT, pixel);
        gl.deleteFramebuffer(fb); gl.deleteTexture(output);
        for (const texture of textures.splice(0)) gl.deleteTexture(texture);
        return [...pixel];
      };
      try {
        const base = { history: true, reactive: 0, previousDepth: .5, motion: 0, outputSize: 3 };
        return {
          accumulated: run(base),
          cameraCut: run({ ...base, history: false }),
          disoccluded: run({ ...base, previousDepth: .9 }),
          reactive: run({ ...base, reactive: 1 }),
          signedDepth: run({ ...base, previousDepth: -1, expectedDepth: -1, depthNear: -2 }),
          uncovered: run({ ...base, previousDepth: 3e38, expectedDepth: -1, depthNear: -2 }),
          negativeColor: run({ ...base, negativeColor: true }),
          indirectTag: run({ ...base, currentAlpha: 2.8, priorAlpha: 2.2 }),
          opacityChange: run({ ...base, currentAlpha: .9, priorAlpha: .1 }),
          offscreen: run({ ...base, motion: .8 }),
          reconstructed: run({ ...base, history: false, outputSize: 6 })
        };
      } finally {
        gl.deleteVertexArray(vao); gl.deleteProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
      }
    }, TAA_RESOLVE_GLSL);
    expect(results.accumulated[0]!).toBeGreaterThan(results.cameraCut[0]! + .1);
    expect(results.signedDepth[0]!).toBeGreaterThan(results.cameraCut[0]! + .1);
    expect(results.negativeColor[0]!).toBeLessThan(-.1);
    expect(results.indirectTag[0]!).toBeGreaterThan(results.cameraCut[0]! + .1);
    expect(results.indirectTag[3]!).toBeCloseTo(2.8, 5);
    expect(results.opacityChange[0]!).toBeCloseTo(.2, 5);
    for (const key of ["cameraCut", "disoccluded", "reactive", "offscreen", "uncovered"] as const) {
      expect(results[key][0]!).toBeCloseTo(.2, 2);
      expect(results[key][3]!).toBeCloseTo(.5, 2);
    }
    // Independent bilinear reconstruction: three outer texels are 0.8 and the
    // center is 0.2, with fractional coordinate (0.75, 0.75).
    expect(results.reconstructed[0]!).toBeCloseTo(.4625, 2);
    expect(results.reconstructed[3]!).toBeCloseTo(.5, 2);
  } finally {
    await server.close();
  }
});

test("motion blur preserves energy, symmetry, transparent edges and HDR alpha tags", async ({ page }) => {
  const server = await startExampleDevServer();
  try {
    await page.goto(server.origin);
    const result = await page.evaluate((fragment) => {
      const gl = document.createElement("canvas").getContext("webgl2", { antialias: false });
      if (!gl || !gl.getExtension("EXT_color_buffer_float")) throw new Error("Float-renderable WebGL2 is required");
      const compile = (kind: number, source: string) => {
        const shader = gl.createShader(kind);
        if (!shader) throw new Error("shader allocation failed");
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
        return shader;
      };
      const vertex = compile(gl.VERTEX_SHADER, `#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`);
      const frag = compile(gl.FRAGMENT_SHADER, fragment);
      const program = gl.createProgram(), vao = gl.createVertexArray();
      if (!program || !vao) throw new Error("program allocation failed");
      gl.attachShader(program, vertex); gl.attachShader(program, frag); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
      gl.useProgram(program); gl.bindVertexArray(vao);
      const run = (colors: number[][], depthWidth: number, motion: number, samples: number) => {
        const size = colors.length;
        const textures: WebGLTexture[] = [];
        const upload = (width: number, data: Float32Array, unit: number, name: string) => {
          const texture = gl.createTexture();
          if (!texture) throw new Error("texture allocation failed");
          textures.push(texture); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, 1, 0, gl.RGBA, gl.FLOAT, data);
          gl.uniform1i(gl.getUniformLocation(program, name), unit);
        };
        upload(size, Float32Array.from(colors.flat()), 0, "u_color");
        upload(depthWidth, Float32Array.from(Array.from({ length: depthWidth }, () => [motion, 0, 0, 1]).flat()), 1, "u_velocity");
        upload(1, Float32Array.from([motion, 0, 0, 1]), 2, "u_neighbor");
        upload(depthWidth, Float32Array.from(Array.from({ length: depthWidth }, () => [1, 0, 0, 1]).flat()), 3, "u_linearDepth");
        const output = gl.createTexture(), fb = gl.createFramebuffer();
        if (!output || !fb) throw new Error("output allocation failed");
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, output);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, 1, 0, gl.RGBA, gl.FLOAT, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("incomplete output");
        gl.viewport(0, 0, size, 1);
        gl.uniform1f(gl.getUniformLocation(program, "u_shutter"), 1);
        gl.uniform1f(gl.getUniformLocation(program, "u_maxBlurPx"), 8);
        gl.uniform1i(gl.getUniformLocation(program, "u_samples"), samples);
        gl.uniform1i(gl.getUniformLocation(program, "u_tileSize"), 16);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const pixels = new Float32Array(size * 4);
        gl.readPixels(0, 0, size, 1, gl.RGBA, gl.FLOAT, pixels);
        if (gl.getError() !== gl.NO_ERROR) throw new Error("motion blur GL error");
        gl.deleteFramebuffer(fb); gl.deleteTexture(output); for (const texture of textures) gl.deleteTexture(texture);
        return Array.from({ length: size }, (_, i) => Array.from(pixels.slice(i * 4, i * 4 + 4)));
      };
      try {
        const constant = Array.from({ length: 10 }, () => [.4, .2, .1, .5]);
        const pulse = Array.from({ length: 5 }, (_, i) => [i === 2 ? 1 : 0, 0, 0, .5]);
        const transparent = Array.from({ length: 5 }, (_, i) => [i / 5, 0, 0, i / 4]);
        const tagged = Array.from({ length: 5 }, (_, i) => [.4, .2, .1, 2 + i / 10]);
        return {
          constant: run(constant, 5, 1000, 16), single: run(pulse, 5, .6, 1),
          symmetric: run(pulse, 5, .6, 4), transparent: run(transparent, 5, .6, 4),
          tagged: run(tagged, 5, .6, 4)
        };
      } finally {
        gl.deleteVertexArray(vao); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(frag);
      }
    }, MB_RECONSTRUCT_GLSL);
    for (const pixel of result.constant) for (const [channel, expected] of [.4, .2, .1, .5].entries()) expect(pixel[channel]!).toBeCloseTo(expected, 5);
    expect(result.single[2]![0]).toBeCloseTo(1, 5);
    expect(result.single[1]![0]).toBeCloseTo(0, 5);
    expect(result.symmetric[1]![0]).toBeCloseTo(result.symmetric[3]![0]!, 5);
    for (const pixel of result.transparent) expect(pixel[0]!).toBeCloseTo(pixel[3]! * .8, 5);
    for (const [i, pixel] of result.tagged.entries()) expect(pixel[3]!).toBeCloseTo(2 + i / 10, 5);
  } finally {
    await server.close();
  }
});
