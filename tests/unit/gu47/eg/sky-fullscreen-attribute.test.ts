/**
 * GU47 phase 2 (receipt `sky`: "sky.preetham clouds and sky.gradient stars
 * draw over the flat background" measured 0): the sky program reads its
 * fullscreen triangle from `in vec2 a_pos`, but the triangle was uploaded with
 * `VertexFormat.P3`, whose attribute the device binds as `a_position` /
 * `position`. WebGL2Device resolves attributes by shader name, then semantic
 * (MultiDraw.resolveAttributeLocation), so `a_pos` stayed unbound, every vertex
 * read the generic (0, 0, 0, 1) and the triangle was degenerate: no sky pixel
 * was ever written, in the background or the after-opaque phase.
 *
 * The mock device applies the device's attribute rule to every draw.
 */
import { describe, expect, it } from "vitest";
import { SkyBackgroundPass } from "../../../../packages/rendering/src/atmosphere/SkyBackgroundPass";
import { sky } from "../../../../packages/engine/src/agent-api/nodes/sky";

interface Sources { readonly label: string; readonly vertex: string; readonly fragment: string; readonly marker: string }
interface Attribute { readonly shaderName: string; readonly semantic: string; readonly components: number }
interface Draw { readonly label: string; readonly vertexFormat: { readonly attributes: readonly Attribute[] }; readonly shader: { readonly vertex: string } }

function vertexInputs(source: string): string[] {
  return [...source.matchAll(/^\s*(?:layout\s*\([^)]*\)\s*)?in\s+(?:highp\s+|mediump\s+|lowp\s+)?\w+\s+(\w+)\s*;/gm)].map((m) => m[1]!);
}

function recordingDevice(draws: Draw[]) {
  return {
    createShaderProgram(sources: Sources) { return { label: sources.label, vertex: sources.vertex }; },
    createBuffer: () => ({}),
    updateBuffer() {},
    draw(command: Draw) { draws.push(command); }
  };
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const specOf = (builder: { toJSON(): unknown }) => (builder.toJSON() as { spec: never }).spec;

describe("GU47 phase 2 sky fullscreen triangle", () => {
  for (const [name, spec] of [
    ["preetham clouds", specOf(sky.preetham({ sun: { elevationDeg: 35, azimuthDeg: 140 }, turbidity: 3, clouds: { coverage: 0.45, speed: 0, color: "#fff2e0" } }))],
    ["gradient stars", specOf(sky.gradient({ zenith: "#050913", horizon: "#16243a", stars: { count: 1500, brightness: 1.4 } }))]
  ] as const) {
    for (const depthTested of [false, true]) {
      it(`binds every vertex input of the sky program (${name}, ${depthTested ? "after-opaque" : "background"})`, () => {
        const draws: Draw[] = [];
        const pass = new SkyBackgroundPass(recordingDevice(draws) as never);
        pass.setSpec(spec, 0);
        pass.drawSky(IDENTITY, depthTested);
        expect(draws).toHaveLength(1);
        const draw = draws[0]!;
        const provided = new Set(draw.vertexFormat.attributes.flatMap((a) => [a.shaderName, a.semantic]));
        const inputs = vertexInputs(draw.shader.vertex);
        expect(inputs.length).toBeGreaterThan(0);
        for (const input of inputs) expect(provided, `vertex input ${input} has no matching attribute`).toContain(input);
      });
    }
  }
});
