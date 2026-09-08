import { WebGPUDevice } from '../../packages/rendering/src/WebGPUDevice';
import { VertexFormat } from '../../packages/rendering/src/VertexFormat';
import { createDefaultShaderLibrary, DEFAULT_UNLIT_SHADER_NAME, DEFAULT_TEXTURED_UNLIT_SHADER_NAME } from '../../packages/rendering/src/ShaderLibrary';
import { Texture } from '../../packages/rendering/src/Texture';
import { TextureBinding } from '../../packages/rendering/src/TextureBinding';
import type { UniformValue } from '../../packages/rendering/src/RenderDevice';

/** Native rasterization and GPU texture readback, with analytical barycentric
 * expectations. The CPU only calculates expected values, never output pixels. */
export async function runBasicColor301() {
  const device = await WebGPUDevice.create();
  const target = device.createRenderTarget({ width: 64, height: 64, format: 'rgba8', label: 'basic-color301' });
  const positions = [[-.9, -.9, 0], [.9, -.9, 0], [0, .9, 0]];
  const colors = [[1, 0, 0, .8], [0, 1, 0, .6], [0, 0, 1, .4]];
  const tint = [.5, .75, .25, .5];
  const locations = [[13, 49], [50, 49], [32, 13]];
  const results = [];
  const textureBytes = [128, 192, 64, 128];
  const texture = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array(textureBytes) });
  try {
    for (const textured of [false, true]) {
    for (const components of [0, 3, 4] as const) {
      const vertices = new Float32Array(positions.flatMap((position, i) => [...position, ...(textured ? [.5, .5] : []), ...colors[i]!.slice(0, components)]));
      const buffer = device.createBuffer('vertex', vertices.byteLength, vertices);
      const format = new VertexFormat([
        { semantic: 'position', components: 3, offset: 0 },
        ...(textured ? [{ semantic: 'uv' as const, components: 2 as const, offset: 12 }] : []),
        ...(components ? [{ semantic: 'color' as const, components, offset: textured ? 20 : 12 }] : [])
      ]);
      const marker = '@aura3d-shader:basic-rgb301';
      const sources = components !== 3 ? createDefaultShaderLibrary().compileSource(textured ? DEFAULT_TEXTURED_UNLIT_SHADER_NAME : DEFAULT_UNLIT_SHADER_NAME) : {
        label: 'basic-rgb301', marker,
        vertex: `// ${marker}\nlayout(location = 0) in vec3 a_position; layout(location = 4) in vec3 a_color; ${textured ? "layout(location = 2) in vec2 a_uv;" : ""}`,
        fragment: `// ${marker}\nuniform vec4 u_baseColor; ${textured ? "uniform sampler2D u_baseColorTexture;" : ""}`
      };
      const shader = device.createShaderProgram(sources);
      device.setRenderTarget(target);
      device.beginFrame(64, 64);
      device.clear([0, 0, 0, 0]);
      const uniforms = new Map<string, UniformValue>([["u_baseColor", tint], ["u_color", [1, 1, 1, 1]]]);
      if (textured) uniforms.set("u_baseColorTexture", new TextureBinding({ name: "u_baseColorTexture", texture }));
      device.draw({ topology: 'triangles', vertexBuffer: buffer, vertexFormat: format, vertexCount: 3, shader,
        uniforms });
      device.endFrame();
      await device.waitForSubmittedWork();
      const samples = [];
      for (const [x, y] of locations) {
        const px = (x! + .5) / 32 - 1;
        const py = 1 - (y! + .5) / 32;
        const blue = (py + .9) / 1.8;
        const green = (px + .9 - .9 * blue) / 1.8;
        const red = 1 - green - blue;
        const expected = (components === 0 ? tint : [red * tint[0]!, green * tint[1]!, blue * tint[2]!, (components === 3 ? 1 : red * .8 + green * .6 + blue * .4) * tint[3]!]).map((value, channel) => Math.round(value * (textured ? textureBytes[channel]! : 255)));
        samples.push({ x, y, expected, actual: Array.from(await device.readPixelsAsync(x!, y!, 1, 1)) });
      }
      results.push({ textured, components, samples });
      shader.dispose(); buffer.dispose();
    }
    }
    return { schema: 'muse301-native-basic-color/v1', adapter: device.info.renderer, results, diagnostics: device.getDiagnostics() };
  } finally { texture.dispose(); target.dispose(); device.dispose(); }
}
(window as unknown as { runBasicColor301: typeof runBasicColor301 }).runBasicColor301 = runBasicColor301;
