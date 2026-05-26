import { describe, expect, it } from "vitest";
import {
  ForwardPass,
  Geometry,
  MockRenderDevice,
  UnlitMaterial,
  createDefaultShaderLibrary,
  type RenderShaderProgram,
  type ShaderSources
} from "../../../packages/rendering/src";

describe("CurrentRoutes ForwardPass shader cache", () => {
  it("does not compile a shader program again for subsequent frames on the same pass", () => {
    const device = new CountingMockRenderDevice();
    const pass = new ForwardPass({
      items: [
        {
          geometry: Geometry.triangle(),
          material: new UnlitMaterial({ name: "current-routes-unlit" }),
          label: "current-routes-cache-item"
        }
      ]
    });

    executeFrame(device, pass);
    executeFrame(device, pass);
    executeFrame(device, pass);

    expect(device.shaderProgramCreates).toBe(1);
  });

  it("reuses the same shader module across ForwardPass instances that share a device and shader library", () => {
    const device = new CountingMockRenderDevice();
    const shaderLibrary = createDefaultShaderLibrary();
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial({ name: "current-routes-shared-library-unlit" });

    executeFrame(
      device,
      new ForwardPass({
        items: [{ geometry, material, label: "current-routes-cache-pass-a" }],
        shaderLibrary
      })
    );
    executeFrame(
      device,
      new ForwardPass({
        items: [{ geometry, material, label: "current-routes-cache-pass-b" }],
        shaderLibrary
      })
    );

    expect(device.shaderProgramCreates).toBe(1);
  });

  it("compiles once per render device so shader programs are not shared across device ownership boundaries", () => {
    const shaderLibrary = createDefaultShaderLibrary();
    const material = new UnlitMaterial({ name: "current-routes-device-owned-unlit" });
    const geometry = Geometry.triangle();
    const firstDevice = new CountingMockRenderDevice();
    const secondDevice = new CountingMockRenderDevice();

    executeFrame(
      firstDevice,
      new ForwardPass({
        items: [{ geometry, material, label: "current-routes-cache-device-a" }],
        shaderLibrary
      })
    );
    executeFrame(
      secondDevice,
      new ForwardPass({
        items: [{ geometry, material, label: "current-routes-cache-device-b" }],
        shaderLibrary
      })
    );

    expect(firstDevice.shaderProgramCreates).toBe(1);
    expect(secondDevice.shaderProgramCreates).toBe(1);
  });
});

class CountingMockRenderDevice extends MockRenderDevice {
  public shaderProgramCreates = 0;

  override createShaderProgram(sources: ShaderSources): RenderShaderProgram {
    this.shaderProgramCreates += 1;
    return super.createShaderProgram(sources);
  }
}

function executeFrame(device: MockRenderDevice, pass: ForwardPass): void {
  device.beginFrame(16, 16);
  pass.execute({ device, width: 16, height: 16 });
  device.endFrame();
}
