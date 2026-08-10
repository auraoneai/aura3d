import { Geometry, ShaderModule, VertexBuffer, VertexFormat, type Renderer } from "@aura3d/rendering";

export interface ExternalTelemetryFrame {
  readonly extensionId: "external-telemetry-shader";
  readonly shaderCompiled: boolean;
  readonly extensionApplied: boolean;
  readonly brightPixels: number;
  readonly signalPixels: number;
  readonly drawCalls: number;
}

export interface ExternalTelemetryExtension {
  draw(options: { readonly time: number; readonly strength: number }): ExternalTelemetryFrame;
  dispose(): { readonly geometryDisposed: boolean; readonly shaderDisposed: boolean; readonly deviceStillOwnedByHost: boolean };
}

const TELEMETRY_SHADER = new ShaderModule({
  label: "external-telemetry-overlay",
  marker: "external-integration/telemetry-overlay",
  vertex: `#version 300 es
// @aura3d-shader:external-integration/telemetry-overlay
precision highp float;
in vec3 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position.xy * 0.5 + 0.5;
  gl_Position = vec4(a_position.xy, 0.0, 1.0);
}`,
  fragment: `#version 300 es
// @aura3d-shader:external-integration/telemetry-overlay
precision highp float;
in vec2 v_uv;
uniform float u_time;
uniform float u_strength;
out vec4 outColor;

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float node(vec2 p, vec2 center, float radius) {
  float d = length(p - center);
  return smoothstep(radius, radius * 0.25, d) + 0.32 * smoothstep(radius * 3.4, radius, d);
}

void main() {
  vec2 uv = v_uv;
  vec2 p = vec2((uv.x - 0.5) * 1.42, uv.y - 0.5);
  vec3 base = mix(vec3(0.018, 0.042, 0.075), vec3(0.038, 0.078, 0.125), uv.y);
  float vignette = 1.0 - smoothstep(0.32, 0.88, length(p));
  base *= 0.62 + 0.38 * vignette;

  vec2 gridUv = p * vec2(18.0, 18.0);
  vec2 gridCell = abs(fract(gridUv) - 0.5);
  float grid = 1.0 - smoothstep(0.465, 0.5, max(gridCell.x, gridCell.y));
  float axis = (1.0 - smoothstep(0.002, 0.007, abs(p.x))) + (1.0 - smoothstep(0.002, 0.007, abs(p.y)));
  base += vec3(0.025, 0.12, 0.16) * (grid * 0.22 + axis * 0.32);

  vec2 a = vec2(-0.44, -0.16);
  vec2 b = vec2(-0.18, 0.19);
  vec2 c = vec2(0.12, -0.04);
  vec2 d = vec2(0.43, 0.20);
  vec2 e = vec2(0.33, -0.26);
  float links = 0.0;
  links += smoothstep(0.012, 0.002, segment(p, a, b));
  links += smoothstep(0.012, 0.002, segment(p, b, c));
  links += smoothstep(0.012, 0.002, segment(p, c, d));
  links += smoothstep(0.012, 0.002, segment(p, c, e));
  links += smoothstep(0.012, 0.002, segment(p, a, c));

  float pulse = 0.82 + 0.18 * sin(u_time * 2.0);
  float cyan = node(p, a, 0.032) + node(p, c, 0.038) * pulse + node(p, d, 0.03);
  float violet = node(p, b, 0.034) + node(p, e, 0.032);
  vec3 signal = vec3(0.02, 0.86, 0.95) * (cyan + links * 0.58)
    + vec3(0.65, 0.25, 1.0) * violet;

  float radius = length(p - c);
  float ring = smoothstep(0.012, 0.002, abs(radius - (0.18 + 0.025 * sin(u_time))));
  float sweepAngle = atan(p.y - c.y, p.x - c.x);
  float sweep = pow(max(0.0, cos(sweepAngle - u_time * 0.72)), 44.0)
    * smoothstep(0.38, 0.06, radius);
  signal += vec3(0.07, 0.72, 0.95) * (ring * 0.68 + sweep * 1.25);

  float bars = step(0.72, fract(uv.x * 54.0 + floor(uv.y * 14.0) * 0.37))
    * smoothstep(0.86, 0.54, uv.y) * smoothstep(0.50, 0.57, uv.y);
  signal += vec3(1.0, 0.42, 0.12) * bars * 0.34;

  vec3 inactive = base
    + vec3(0.035, 0.42, 0.56) * (links * 0.42 + cyan * 0.34)
    + vec3(0.22, 0.10, 0.42) * violet * 0.28;
  vec3 enhanced = base + signal;
  vec3 color = mix(inactive, enhanced, u_strength);
  color += vec3(0.025, 0.075, 0.09) * sin(uv.y * 900.0) * 0.08;
  outColor = vec4(color, 1.0);
}`
});

/**
 * Third-party-shaped integration: it receives the published Renderer contract,
 * borrows renderer.device for draws, and never owns or disposes that device.
 */
export function createExternalTelemetryExtension(renderer: Renderer, viewport: { readonly width: number; readonly height: number }): ExternalTelemetryExtension {
  const vertices = new VertexBuffer(VertexFormat.P3, 3);
  vertices.setAttribute(0, "position", [-1, -1, 0]);
  vertices.setAttribute(1, "position", [3, -1, 0]);
  vertices.setAttribute(2, "position", [-1, 3, 0]);
  const geometry = new Geometry(vertices, null, "triangles");
  const program = TELEMETRY_SHADER.compile(renderer.device);
  const vertexBuffer = geometry.vertexBuffer.upload(renderer.device);
  const indexBuffer = geometry.indexBuffer?.upload(renderer.device);
  let disposed = false;

  return {
    draw({ time, strength }): ExternalTelemetryFrame {
      if (disposed) throw new Error("External telemetry extension was already disposed.");
      renderer.device.beginFrame(viewport.width, viewport.height);
      renderer.device.draw({
        label: "external-telemetry-overlay",
        topology: geometry.topology,
        renderState: { depthTest: false, depthWrite: false, cullMode: "none", blend: false, depthCompare: "always" },
        vertexBuffer,
        vertexFormat: geometry.vertexBuffer.format,
        vertexCount: geometry.vertexBuffer.vertexCount,
        indexBuffer,
        indexType: geometry.indexBuffer?.type,
        indexCount: geometry.indexBuffer?.count,
        shader: program,
        uniforms: new Map<string, number>([["u_time", time], ["u_strength", strength]])
      });
      renderer.device.endFrame();
      const diagnostics = renderer.device.getDiagnostics();
      const pixels = renderer.device.readPixels(0, 0, viewport.width, viewport.height);
      let brightPixels = 0;
      let signalPixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index] ?? 0;
        const green = pixels[index + 1] ?? 0;
        const blue = pixels[index + 2] ?? 0;
        if (Math.max(red, green, blue) > 80) brightPixels += 1;
        if (blue > 90 && green > red * 1.25) signalPixels += 1;
      }
      return {
        extensionId: "external-telemetry-shader",
        shaderCompiled: !program.disposed,
        extensionApplied: strength > 0.5 && signalPixels > 1_000,
        brightPixels,
        signalPixels,
        drawCalls: diagnostics.drawCalls
      };
    },
    dispose() {
      geometry.dispose();
      TELEMETRY_SHADER.dispose();
      disposed = true;
      return {
        geometryDisposed: geometry.vertexBuffer.uploadedBuffer?.disposed === true
          && (geometry.indexBuffer === null || geometry.indexBuffer.uploadedBuffer?.disposed === true),
        shaderDisposed: program.disposed,
        deviceStillOwnedByHost: !renderer.device.disposed
      };
    }
  };
}
