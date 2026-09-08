/** Independent test-only GPU oracle. Use a dedicated context, never the root renderer's context. */
export interface SkinningOracleInput {
  position: readonly number[];
  /** Final morphed object-space position, when present (not a delta). */
  morphPosition?: readonly number[];
  joints: readonly number[];
  weights: readonly number[];
  /** Full submitted column-major palette, sixteen floats per joint. */
  matrices: readonly number[];
  modelMatrix: readonly number[];
  expectedWorldPosition: readonly number[];
}
export interface SkinningOracleResult {
  backend: 'webgl2-transform-feedback';
  worldPosition: number[];
  maxAbsoluteError: number;
  changedPaletteWorldPosition: number[];
  changedPaletteDelta: number;
  paletteTranslation: number;
}

export function validateSkinningOracleInput(input: SkinningOracleInput): void {
  const finite = (values: readonly number[], length: number, name: string) => {
    if (values.length !== length || values.some(value => !Number.isFinite(value))) throw new Error(`Invalid ${name}`);
  };
  finite(input.position, 3, 'position');
  if (input.morphPosition) finite(input.morphPosition, 3, 'morphPosition');
  finite(input.modelMatrix, 16, 'modelMatrix');
  finite(input.expectedWorldPosition, 3, 'expectedWorldPosition');
  if (![4, 8].includes(input.weights.length) || input.joints.length !== input.weights.length) throw new Error('Expected four or eight influences');
  finite(input.weights, input.weights.length, 'weights');
  if (!input.matrices.length || input.matrices.length % 16 || input.matrices.some(value => !Number.isFinite(value))) throw new Error('Invalid palette');
  if (input.joints.some(joint => !Number.isInteger(joint) || joint < 0 || joint >= input.matrices.length / 16)) throw new Error('Joint outside palette');
  if (input.weights.some(weight => weight < 0) || Math.abs(input.weights.reduce((a, b) => a + b, 0) - 1) > 1e-4) throw new Error('Weights must be normalized');
}

export function runSkinningOracle(gl: WebGL2RenderingContext, input: SkinningOracleInput): SkinningOracleResult {
  validateSkinningOracleInput(input);
  if (gl.isContextLost()) throw new Error('Oracle context lost');
  if (gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE)) throw new Error('Oracle requires idle transform feedback');
  if (input.matrices.length / 16 > gl.getParameter(gl.MAX_TEXTURE_SIZE)) throw new Error('Palette exceeds texture size');
  const previous = {
    program: gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null,
    vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null,
    feedback: gl.getParameter(gl.TRANSFORM_FEEDBACK_BINDING) as WebGLTransformFeedback | null,
    buffer: gl.getParameter(gl.TRANSFORM_FEEDBACK_BUFFER_BINDING) as WebGLBuffer | null,
    texture: gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null,
    sampler: gl.getParameter(gl.SAMPLER_BINDING) as WebGLSampler | null,
    discard: gl.isEnabled(gl.RASTERIZER_DISCARD),
  };
  const unit = (gl.getParameter(gl.ACTIVE_TEXTURE) as number) - gl.TEXTURE0;
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  const texture = gl.createTexture();
  const vao = gl.createVertexArray();
  const feedback = gl.createTransformFeedback();
  const buffer = gl.createBuffer();
  let active = false;
  try {
    if (!program || !texture || !vao || !feedback || !buffer) throw new Error('Oracle GPU allocation failed');
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Oracle shader allocation failed');
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Oracle shader: ${gl.getShaderInfoLog(shader)}`);
      gl.attachShader(program, shader);
    };
    compile(gl.VERTEX_SHADER, `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D palette;
uniform vec3 position;
uniform ivec4 joints0, joints1;
uniform vec4 weights0, weights1;
uniform mat4 model;
out vec3 world;
mat4 bone(int joint) { return mat4(texelFetch(palette, ivec2(0,joint),0), texelFetch(palette, ivec2(1,joint),0), texelFetch(palette, ivec2(2,joint),0), texelFetch(palette, ivec2(3,joint),0)); }
void main() {
mat4 skin = bone(joints0.x)*weights0.x + bone(joints0.y)*weights0.y + bone(joints0.z)*weights0.z + bone(joints0.w)*weights0.w
 + bone(joints1.x)*weights1.x + bone(joints1.y)*weights1.y + bone(joints1.z)*weights1.z + bone(joints1.w)*weights1.w;
world = (model * skin * vec4(position,1.0)).xyz;
gl_Position = vec4(world,1.0);
}`);
    compile(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float; out vec4 color; void main() { color=vec4(1.0); }');
    gl.transformFeedbackVaryings(program, ['world'], gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Oracle link: ${gl.getProgramInfoLog(program)}`);
    gl.useProgram(program); gl.bindVertexArray(vao); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, buffer); gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, 12, gl.STREAM_READ);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer);
    gl.bindTexture(gl.TEXTURE_2D, texture); gl.bindSampler(unit, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.uniform1i(gl.getUniformLocation(program, 'palette'), unit);
    gl.uniform3fv(gl.getUniformLocation(program, 'position'), new Float32Array(input.morphPosition ?? input.position));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, new Float32Array(input.modelMatrix));
    for (const [name, values, integer] of [
      ['joints0', input.joints.slice(0,4), true], ['joints1', input.joints.length === 8 ? input.joints.slice(4) : [0,0,0,0], true],
      ['weights0', input.weights.slice(0,4), false], ['weights1', input.weights.length === 8 ? input.weights.slice(4) : [0,0,0,0], false],
    ] as const) {
      const location = gl.getUniformLocation(program, name);
      if (integer) gl.uniform4iv(location, new Int32Array(values)); else gl.uniform4fv(location, new Float32Array(values));
    }
    gl.enable(gl.RASTERIZER_DISCARD);
    const execute = (palette: Float32Array) => {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, palette.length / 16, 0, gl.RGBA, gl.FLOAT, palette);
      gl.beginTransformFeedback(gl.POINTS); active = true;
      gl.drawArrays(gl.POINTS, 0, 1);
      gl.endTransformFeedback(); active = false;
      const result = new Float32Array(3);
      gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, result);
      const error = gl.getError();
      if (error !== gl.NO_ERROR || result.some(value => !Number.isFinite(value))) throw new Error(`Oracle GPU failure ${error}`);
      return Array.from(result);
    };
    const palette = new Float32Array(input.matrices);
    const worldPosition = execute(palette);
    const modelScale = Math.hypot(input.modelMatrix[0]!,input.modelMatrix[1]!,input.modelMatrix[2]!);
    if (!Number.isFinite(modelScale) || modelScale <= 1e-8) throw new Error('Oracle model scale is invalid');
    // Keep the negative control in world units across renderer-normalized rigs.
    const paletteTranslation = 0.125 / modelScale;
    for (let offset = 12; offset < palette.length; offset += 16) palette[offset] = palette[offset]! + paletteTranslation;
    const changedPaletteWorldPosition = execute(palette);
    return { backend: 'webgl2-transform-feedback', worldPosition,
      maxAbsoluteError: Math.max(...worldPosition.map((value,index) => Math.abs(value - input.expectedWorldPosition[index]!))),
      changedPaletteWorldPosition, changedPaletteDelta: Math.hypot(...worldPosition.map((value,index) => value - changedPaletteWorldPosition[index]!)), paletteTranslation };
  } finally {
    if (active) gl.endTransformFeedback();
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, previous.feedback);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, previous.buffer);
    gl.bindVertexArray(previous.vao); gl.useProgram(previous.program);
    gl.bindTexture(gl.TEXTURE_2D, previous.texture); gl.bindSampler(unit, previous.sampler);
    if (!previous.discard) gl.disable(gl.RASTERIZER_DISCARD);
    gl.deleteBuffer(buffer); gl.deleteTransformFeedback(feedback); gl.deleteVertexArray(vao); gl.deleteTexture(texture);
    gl.deleteProgram(program); for (const shader of shaders) gl.deleteShader(shader);
  }
}
