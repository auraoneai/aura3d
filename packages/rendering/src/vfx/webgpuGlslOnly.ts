// PRD-07 VFX passes (particles, ribbons) ship GLSL programs only. On a WebGPU device the program creation fails with
// WGSL_PROGRAM_MISSING; the pass then skips its draws with one warning, like a custom shader without WGSL, instead of
// throwing out of every frame. Every other draw continues. WebGL2 never reaches the catch.
import type { RenderDevice, RenderShaderProgram } from "../RenderDevice";

const warned = new Set<string>();

/** The program, or undefined when this WebGPU device has no WGSL twin for it (warned once per code). */
export function glslOnlyVfxProgram(device: RenderDevice, code: string, what: string, create: () => RenderShaderProgram): RenderShaderProgram | undefined {
  try {
    return create();
  } catch (error) {
    if (device.kind !== "webgpu" || (error as { code?: unknown } | null)?.code !== "WGSL_PROGRAM_MISSING") throw error;
    if (!warned.has(code)) {
      warned.add(code);
      console.warn(`[aura3d] ${code}: ${what} have no WGSL program yet; they are skipped on WebGPU (every other draw continues).`);
    }
    return undefined;
  }
}
