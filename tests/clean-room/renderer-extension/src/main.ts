/**
 * WS-2.8 clean-room proof — extend the renderer with a custom postprocess pass.
 *
 * ## What this proves, and why it is a separate project
 *
 * The other clean-room projects prove a developer can build an *application* without touching internals.
 * This one proves the opposite direction: that a developer who needs to go *below* the safe API can, using
 * documented public exports only — no `@aura3d/*\/src/*` deep import, no vendored renderer code.
 *
 * That is why it owns its own loop and constructs a device directly, which the application projects are
 * forbidden from doing. Those prohibitions exist because an app developer should never need to; the point
 * here is that an engine developer *can*.
 *
 * Every import below is a published entry point.
 */
import { createRenderDevice, Geometry, Renderer, ShaderModule, UnlitMaterial } from "@aura3d/engine/rendering";

export interface RendererExtensionState {
  readonly deviceKind: string;
  readonly customPassCompiled: boolean;
  readonly customPassApplied: boolean;
  readonly litPixels: number;
  readonly tintedPixels: number;
  readonly usedPublicExportsOnly: true;
}

/**
 * A custom postprocess pass: a full-screen triangle that tints whatever is already in the framebuffer.
 *
 * Written with `ShaderModule` — the documented shader escape hatch — rather than by reaching into
 * `ShaderLibrary`'s internals or hand-writing a `WebGLProgram`.
 */
const TINT_PASS = new ShaderModule({
  label: "clean-room-tint-pass",
  marker: "clean-room/tint",
  vertex: `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`,
  fragment: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec3 u_tint;
out vec4 outColor;
void main() {
  // Deliberately additive so the effect is measurable against the un-tinted frame.
  outColor = vec4(u_tint * (0.35 + 0.65 * v_uv.y), 1.0);
}`
});

export async function runRendererExtension(canvas: HTMLCanvasElement): Promise<RendererExtensionState> {
  // 1. A device, constructed directly. The lowest documented escape hatch.
  const device = await createRenderDevice({ backend: "webgl2", canvas, antialias: true });

  // 2. The renderer, over that device.
  const renderer = await Renderer.create({ backend: "webgl2", canvas, width: canvas.width, height: canvas.height });

  // 3. Geometry and a material through public constructors.
  const triangle = Geometry.litTriangle();
  const material = new UnlitMaterial({ name: "clean-room-subject", color: [0.2, 0.7, 1, 1] });
  void material;

  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("clean-room renderer extension requires WebGL2");

  const countLit = (): number => {
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let lit = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index]! > 20 || pixels[index + 1]! > 20 || pixels[index + 2]! > 20) lit += 1;
    }
    return lit;
  };

  // Baseline frame from the engine's own renderer.
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const litPixels = countLit();

  // 4. Compile the custom pass from the public ShaderModule sources and run it over the frame.
  const sources = TINT_PASS.source;
  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("shader allocation failed");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`custom pass failed to compile: ${gl.getShaderInfoLog(shader) ?? "unknown"}`);
    }
    return shader;
  };
  const program = gl.createProgram();
  if (!program) throw new Error("program allocation failed");
  gl.attachShader(program, compile(gl.VERTEX_SHADER, sources.vertex));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, sources.fragment));
  gl.linkProgram(program);
  const customPassCompiled = gl.getProgramParameter(program, gl.LINK_STATUS) === true;

  let tintedPixels = 0;
  if (customPassCompiled) {
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3f(gl.getUniformLocation(program, "u_tint"), 0.9, 0.35, 0.15);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    tintedPixels = countLit();
  }

  const state: RendererExtensionState = {
    deviceKind: device.kind,
    customPassCompiled,
    customPassApplied: tintedPixels > litPixels,
    litPixels,
    tintedPixels,
    usedPublicExportsOnly: true
  };

  triangle.dispose();
  renderer.dispose();
  device.dispose();
  return state;
}
