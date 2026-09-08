/** Test-only observation of the palette bound to an actual root WebGL draw. */
export interface RootSkinPaletteDraw301 {
  method: string;
  count: number;
  instances: number;
  programId: number;
  jointCount: number;
  paletteMode: "uniform-array" | "data-texture";
  jointMatrices: number[];
  modelMatrix: number[] | null;
  modelViewProjectionMatrix: number[] | null;
}

export interface RootSkinPaletteFrame301 {
  label: string;
  draws: RootSkinPaletteDraw301[];
  errors: string[];
}

export interface RootSkinPaletteWitness301 {
  reset(frameLabel?: string): void;
  read(): RootSkinPaletteFrame301;
  dispose(): void;
}

/**
 * Install on the context used by createAuraApp. No palette is uploaded or
 * reconstructed: observations come from CURRENT_PROGRAM and its sampler's
 * currently bound texture immediately before the intercepted draw executes.
 * Consumers must reject errors and empty draws; absent model uniforms remain
 * null, never an invented identity matrix. This synchronous witness is for
 * correctness fixtures, not performance measurement.
 */
export function installRootSkinPaletteWitness301(gl: WebGL2RenderingContext): RootSkinPaletteWitness301 {
  let frame: RootSkinPaletteFrame301 = { label: "", draws: [], errors: [] };
  let disposed = false;
  const programIds = new WeakMap<WebGLProgram, number>();
  let nextProgramId = 1;
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error("Root skin witness could not allocate read framebuffer");
  // RGBA32F attachment readability must be checked against the actual device.
  gl.getExtension("EXT_color_buffer_float");

  const uniform = (program: WebGLProgram, name: string): unknown => {
    const location = gl.getUniformLocation(program, name);
    return location === null ? null : gl.getUniform(program, location) as unknown;
  };
  const matrix = (program: WebGLProgram, name: string): number[] | null => {
    const value = uniform(program, name);
    if (value === null) return null;
    if (!(value instanceof Float32Array) || value.length !== 16 || !value.every(Number.isFinite)) {
      throw new Error(`Invalid bound ${name} matrix`);
    }
    return Array.from(value);
  };

  function texturePalette(program: WebGLProgram, jointCount: number): number[] {
    const sampler = uniform(program, "u_jointPaletteTexture");
    const size = uniform(program, "u_jointPaletteTextureSize");
    if (typeof sampler !== "number" || !Number.isInteger(sampler) || sampler < 0
      || sampler >= Number(gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS))
      || !(size instanceof Float32Array) || size.length !== 2) {
      throw new Error("Invalid draw-bound joint palette sampler or dimensions");
    }
    const width = size[0]!;
    const height = size[1]!;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 1
      || width % 4 !== 0 || width * height < jointCount * 4
      || width > Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))
      || height > Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))) {
      throw new Error(`Invalid joint palette extent ${width}x${height}`);
    }
    const activeTexture = Number(gl.getParameter(gl.ACTIVE_TEXTURE));
    const readFramebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const pixelPackBuffer = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer | null;
    const packParameters = [gl.PACK_ALIGNMENT, gl.PACK_ROW_LENGTH, gl.PACK_SKIP_PIXELS, gl.PACK_SKIP_ROWS];
    const packValues = packParameters.map((parameter) => Number(gl.getParameter(parameter)));
    try {
      gl.activeTexture(gl.TEXTURE0 + sampler);
      const texture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
      if (!texture) throw new Error("Draw-bound palette sampler has no TEXTURE_2D");
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("Actual palette texture is not float-readable on this device");
      }
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      packParameters.forEach((parameter) => gl.pixelStorei(parameter, parameter === gl.PACK_ALIGNMENT ? 1 : 0));
      const pixels = new Float32Array(width * height * 4).fill(Number.NaN);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixels);
      const palette = pixels.slice(0, jointCount * 16);
      if (!palette.every(Number.isFinite)) throw new Error("Actual palette FLOAT readback failed or contains nonfinite values");
      return Array.from(palette);
    } finally {
      // Detach from our own framebuffer before restoring all changed bindings.
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFramebuffer);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pixelPackBuffer);
      packParameters.forEach((parameter, index) => gl.pixelStorei(parameter, packValues[index]!));
      gl.activeTexture(activeTexture);
    }
  }

  function capture(method: string, count: number, instances: number): void {
    if (disposed || count <= 0 || instances <= 0) return;
    const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    if (!program) return;
    const jointCount = uniform(program, "u_jointCount");
    if (jointCount === null || jointCount === 0) return; // Non-skinned draw.
    if (typeof jointCount !== "number" || !Number.isInteger(jointCount) || jointCount < 1) {
      throw new Error("Invalid actual draw-bound joint count");
    }
    const mode = uniform(program, "u_jointPaletteMode");
    if (mode !== 0 && mode !== 1) throw new Error(`Unsupported actual palette mode ${String(mode)}`);
    const jointMatrices = mode === 1 ? texturePalette(program, jointCount) : [];
    if (mode === 0) {
      for (let joint = 0; joint < jointCount; joint += 1) {
        const value = matrix(program, `u_jointMatrices[${joint}]`);
        if (!value) throw new Error(`Missing bound joint matrix ${joint}/${jointCount}`);
        jointMatrices.push(...value);
      }
    }
    let programId = programIds.get(program);
    if (programId === undefined) { programId = nextProgramId++; programIds.set(program, programId); }
    frame.draws.push({ method, count, instances, programId, jointCount,
      paletteMode: mode === 1 ? "data-texture" : "uniform-array", jointMatrices,
      modelMatrix: matrix(program, "u_modelMatrix"),
      modelViewProjectionMatrix: matrix(program, "u_modelViewProjection") });
  }

  const restores: Array<() => void> = [];
  function wrap(name: "drawElements" | "drawArrays" | "drawElementsInstanced" | "drawArraysInstanced", countIndex: number, instancesIndex?: number): void {
    const original = gl[name];
    const descriptor = Object.getOwnPropertyDescriptor(gl, name);
    const wrapped = function (this: WebGL2RenderingContext, ...args: number[]): void {
      try { capture(name, args[countIndex]!, instancesIndex === undefined ? 1 : args[instancesIndex]!); }
      catch (error) { frame.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
      Reflect.apply(original, this, args);
    };
    Object.defineProperty(gl, name, { configurable: true, writable: true, value: wrapped });
    restores.push(() => {
      if (gl[name] !== wrapped) throw new Error(`Root skin witness ${name} replaced before disposal`);
      if (descriptor) Object.defineProperty(gl, name, descriptor);
      else Reflect.deleteProperty(gl, name);
    });
  }
  try {
    wrap("drawElements", 1);
    wrap("drawArrays", 2);
    wrap("drawElementsInstanced", 1, 4);
    wrap("drawArraysInstanced", 2, 3);
  } catch (error) {
    restores.reverse().forEach((restore) => restore());
    gl.deleteFramebuffer(framebuffer);
    throw error;
  }
  return {
    reset(label = "") {
      if (disposed) throw new Error("Root skin witness already disposed");
      frame = { label, draws: [], errors: [] };
    },
    read() { return structuredClone(frame); },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { restores.reverse().forEach((restore) => restore()); }
      finally { gl.deleteFramebuffer(framebuffer); }
    },
  };
}
