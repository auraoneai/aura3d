/**
 * #621 (01-RTARRAY): cube / 2d-array colour targets use texStorage2D/3D, which
 * require a SIZED internal format. rgba8 resolves to unsized gl.RGBA for the
 * texImage2D 2d path; passing that to texStorage left the array framebuffer
 * incomplete on the L4 (GPU run 38143556299).
 */
import { describe, expect, it } from "vitest";
import { renderTargetStorageFormat } from "../../../../packages/rendering/src/WebGL2Device";

// WebGL2 enum values (Khronos): RGBA 0x1908, RGBA8 0x8058, RGBA16F 0x881A, RGBA32F 0x8814.
const GL = { RGBA: 0x1908, RGBA8: 0x8058 } as const;

describe("renderTargetStorageFormat (#621)", () => {
  it("maps unsized RGBA (rgba8 targets) to sized RGBA8 for texStorage", () => {
    expect(renderTargetStorageFormat(GL, GL.RGBA)).toBe(GL.RGBA8);
  });
  it("leaves sized float formats unchanged", () => {
    expect(renderTargetStorageFormat(GL, 0x881a)).toBe(0x881a);
    expect(renderTargetStorageFormat(GL, 0x8814)).toBe(0x8814);
  });
});
