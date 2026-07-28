import { bloomPixels, createDepthTextureBinding, createRenderDevice, depthOfFieldPixels, motionBlurPixels, outlinePixels, ssaoPixels, ssrPixels } from "@aura3d/rendering";

declare global {
  interface Window {
    __AURA3D_NATIVE_OUTLINE_PIXEL__?: {
      readonly status: "ready" | "error";
      readonly width?: number;
      readonly height?: number;
      readonly maxChannelDelta?: number;
      readonly changedChannelCount?: number;
      readonly bloomMaxChannelDelta?: number;
      readonly bloomChangedChannelCount?: number;
      readonly ssaoMaxChannelDelta?: number;
      readonly ssaoChangedChannelCount?: number;
      readonly ssaoEffectChangedChannelCount?: number;
      readonly ssrMaxChannelDelta?: number;
      readonly ssrChangedChannelCount?: number;
      readonly ssrEffectChangedChannelCount?: number;
      readonly depthOfFieldMaxChannelDelta?: number;
      readonly depthOfFieldChangedChannelCount?: number;
      readonly depthOfFieldEffectChangedChannelCount?: number;
      readonly motionBlurMaxChannelDelta?: number;
      readonly motionBlurChangedChannelCount?: number;
      readonly motionBlurEffectChangedChannelCount?: number;
      readonly gpu?: readonly number[];
      readonly cpu?: readonly number[];
      readonly error?: string;
    };
  }
}

void run();

async function run(): Promise<void> {
  try {
    const canvas = document.querySelector<HTMLCanvasElement>("#outline");
    if (!canvas) throw new Error("Missing outline canvas.");
    const width = canvas.width;
    const height = canvas.height;
    const sourcePixels = createSourcePixels(width, height);
    const options = {
      color: [240, 90, 30, 192] as const,
      width: 2,
      threshold: 0.21,
      opacity: 0.7
    };
    const expected = outlinePixels(sourcePixels, width, height, options).pixels;
    const device = await createRenderDevice({
      backend: "webgl2",
      canvas,
      antialias: false,
      preserveDrawingBuffer: true
    });
    const source = device.createRenderTarget({ width, height, label: "native-outline-pixel-source", format: "rgba8", depth: "texture" });
    const output = device.createRenderTarget({ width, height, label: "native-outline-pixel-output", format: "rgba8", depth: false });
    if (!device.writeRenderTargetPixels || !device.presentLdrPostprocess) {
      throw new Error("WebGL2 native LDR presentation capabilities are unavailable.");
    }
    device.writeRenderTargetPixels(source, sourcePixels);
    device.presentLdrPostprocess(source, {
      passes: [{ name: "outline", options }],
      outputTarget: output
    });
    device.setRenderTarget(output);
    const actual = device.readPixels(0, 0, width, height);
    const outlineComparison = comparePixels(actual, expected);

    const bloomSourcePixels = createBloomSourcePixels(width, height);
    const bloomOptions = { threshold: 0.72, intensity: 0.4, radius: 2 };
    const expectedBloom = bloomPixels(bloomSourcePixels, width, height, bloomOptions).pixels;
    device.writeRenderTargetPixels(source, bloomSourcePixels);
    device.presentLdrPostprocess(source, {
      passes: [{ name: "bloom", options: bloomOptions }],
      outputTarget: output
    });
    device.setRenderTarget(output);
    const actualBloom = device.readPixels(0, 0, width, height);
    const bloomComparison = comparePixels(actualBloom, expectedBloom);

    const depth = createDepthFixture(width, height);
    uploadDepthFixture(
      canvas,
      (source as unknown as { readonly depthTextureHandle: WebGLTexture }).depthTextureHandle,
      depth
    );
    const ssaoOptions = { radius: 2, intensity: 0.7, bias: 0.01 };
    const expectedSsao = ssaoPixels(sourcePixels, width, height, {
      ...ssaoOptions,
      depth: createDepthTextureBinding({ label: "native-ssao-depth-fixture", width, height, data: depth })
    }).pixels;
    device.writeRenderTargetPixels(source, sourcePixels);
    device.presentLdrPostprocess(source, {
      passes: [{ name: "ssao", options: ssaoOptions }],
      outputTarget: output
    });
    device.setRenderTarget(output);
    const actualSsao = device.readPixels(0, 0, width, height);
    const ssaoComparison = comparePixels(actualSsao, expectedSsao);
    const ssaoEffect = comparePixels(expectedSsao, sourcePixels);

    const ssrOptions = { intensity: 0.6, maxDistance: 4 };
    const expectedSsr = ssrPixels(sourcePixels, width, height, {
      ...ssrOptions,
      depth: createDepthTextureBinding({ label: "native-ssr-depth-fixture", width, height, data: depth })
    }).pixels;
    device.writeRenderTargetPixels(source, sourcePixels);
    device.presentLdrPostprocess(source, {
      passes: [{ name: "ssr", options: ssrOptions }],
      outputTarget: output
    });
    device.setRenderTarget(output);
    const actualSsr = device.readPixels(0, 0, width, height);
    const ssrComparison = comparePixels(actualSsr, expectedSsr);
    const ssrEffect = comparePixels(expectedSsr, sourcePixels);

    const depthOfFieldOptions = { focusDepth: 0.5, focusRange: 0.1, maxRadius: 3 };
    const expectedDepthOfField = depthOfFieldPixels(sourcePixels, width, height, {
      ...depthOfFieldOptions,
      depth: createDepthTextureBinding({ label: "native-dof-depth-fixture", width, height, data: depth })
    }).pixels;
    device.writeRenderTargetPixels(source, sourcePixels);
    device.presentLdrPostprocess(source, {
      passes: [{ name: "depth-of-field", options: depthOfFieldOptions }],
      outputTarget: output
    });
    device.setRenderTarget(output);
    const actualDepthOfField = device.readPixels(0, 0, width, height);
    const depthOfFieldComparison = comparePixels(actualDepthOfField, expectedDepthOfField);
    const depthOfFieldEffect = comparePixels(expectedDepthOfField, sourcePixels);

    const velocity = createVelocityFixture(width, height);
    const motionBlurOptions = { velocity, samples: 5, scale: 1 };
    const expectedMotionBlur = motionBlurPixels(sourcePixels, width, height, motionBlurOptions).pixels;
    device.writeRenderTargetPixels(source, sourcePixels);
    device.presentLdrPostprocess(source, {
      passes: [{ name: "motion-blur", options: motionBlurOptions }],
      outputTarget: output
    });
    device.setRenderTarget(output);
    const actualMotionBlur = device.readPixels(0, 0, width, height);
    const motionBlurComparison = comparePixels(actualMotionBlur, expectedMotionBlur);
    const motionBlurEffect = comparePixels(expectedMotionBlur, sourcePixels);

    window.__AURA3D_NATIVE_OUTLINE_PIXEL__ = {
      status: "ready",
      width,
      height,
      maxChannelDelta: outlineComparison.maxChannelDelta,
      changedChannelCount: outlineComparison.changedChannelCount,
      bloomMaxChannelDelta: bloomComparison.maxChannelDelta,
      bloomChangedChannelCount: bloomComparison.changedChannelCount,
      ssaoMaxChannelDelta: ssaoComparison.maxChannelDelta,
      ssaoChangedChannelCount: ssaoComparison.changedChannelCount,
      ssaoEffectChangedChannelCount: ssaoEffect.changedChannelCount,
      ssrMaxChannelDelta: ssrComparison.maxChannelDelta,
      ssrChangedChannelCount: ssrComparison.changedChannelCount,
      ssrEffectChangedChannelCount: ssrEffect.changedChannelCount,
      depthOfFieldMaxChannelDelta: depthOfFieldComparison.maxChannelDelta,
      depthOfFieldChangedChannelCount: depthOfFieldComparison.changedChannelCount,
      depthOfFieldEffectChangedChannelCount: depthOfFieldEffect.changedChannelCount,
      motionBlurMaxChannelDelta: motionBlurComparison.maxChannelDelta,
      motionBlurChangedChannelCount: motionBlurComparison.changedChannelCount,
      motionBlurEffectChangedChannelCount: motionBlurEffect.changedChannelCount,
      gpu: [...actual],
      cpu: [...expected]
    };
    source.dispose();
    output.dispose();
    device.dispose();
  } catch (error) {
    window.__AURA3D_NATIVE_OUTLINE_PIXEL__ = {
      status: "error",
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
  }
}

function createSourcePixels(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const inside = x >= 3 && x <= 5 && y >= 2 && y <= 4;
      pixels[index] = inside ? 230 : 18 + x * 3;
      pixels[index + 1] = inside ? 210 : 24 + y * 4;
      pixels[index + 2] = inside ? 55 : 31;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function createBloomSourcePixels(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const bright = (x === 4 && y === 3) || (x === 6 && y === 2);
      pixels[index] = bright ? 255 : 20 + x * 2;
      pixels[index + 1] = bright ? 235 : 25 + y * 3;
      pixels[index + 2] = bright ? 210 : 30;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function comparePixels(actual: Uint8Array, expected: Uint8Array): {
  readonly maxChannelDelta: number;
  readonly changedChannelCount: number;
} {
  let maxChannelDelta = 0;
  let changedChannelCount = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const delta = Math.abs((actual[index] ?? 0) - (expected[index] ?? 0));
    maxChannelDelta = Math.max(maxChannelDelta, delta);
    if (delta !== 0) changedChannelCount += 1;
  }
  return { maxChannelDelta, changedChannelCount };
}

function createDepthFixture(width: number, height: number): Float32Array {
  const depth = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      depth[y * width + x] = x >= 3 && x <= 5 && y >= 2 && y <= 4 ? 0.72 : 0.22;
    }
  }
  return depth;
}

function uploadDepthFixture(canvas: HTMLCanvasElement, texture: WebGLTexture, depth: Float32Array): void {
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("WebGL2 context unavailable for depth fixture upload.");
  const encoded = new Uint32Array(depth.length);
  for (let index = 0; index < depth.length; index += 1) {
    encoded[index] = Math.round((depth[index] ?? 1) * 0xffffffff);
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    canvas.width,
    canvas.height,
    gl.DEPTH_COMPONENT,
    gl.UNSIGNED_INT,
    encoded
  );
}

function createVelocityFixture(width: number, height: number): Float32Array {
  const velocity = new Float32Array(width * height * 2);
  for (let index = 0; index < width * height; index += 1) {
    velocity[index * 2] = index % 3 === 0 ? 2.4 : -1.6;
    velocity[index * 2 + 1] = index % 2 === 0 ? 0.8 : -0.6;
  }
  return velocity;
}
