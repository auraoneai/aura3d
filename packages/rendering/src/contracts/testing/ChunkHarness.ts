/**
 * ChunkHarness (PR 0a): wraps registered C-02 chunks into a minimal GLSL ES 3.00
 * vertex+fragment pair so chunks compile in the browser conformance suite and
 * can be text-checked in unit tests (CONTRACTS.md §C-02 / §3.8).
 *
 * Declares both the legacy per-uniform camera symbols and the C-08
 * AuraFrame/AuraLights uniform blocks so stub chunks compile either way.
 */

import type { ShaderChunk } from "../program";

export interface ChunkHarnessProgram {
  readonly vertex: string;
  readonly fragment: string;
}

const PREAMBLE = `#version 300 es
precision highp float;
`;

const LEGACY_DECLS = `
uniform mat4 u_viewProjection;
uniform vec3 u_cameraPosition;
layout(std140) uniform AuraFrame {
  mat4 u_view; mat4 u_projection; mat4 u_viewProjection_m; mat4 u_prevViewProjection;
  vec4 u_cameraPositionNear; vec4 u_resolutionFarTime; vec4 u_exposureFlags;
};
layout(std140) uniform AuraLights {
  vec4 u_lightData[8];
};
`;

export function buildChunkHarnessProgram(chunks: readonly ShaderChunk[], entry: { readonly vertexMain?: string; readonly fragmentMain?: string } = {}): ChunkHarnessProgram {
  const pars: string[] = [];
  const vertex: string[] = [];
  const fragment: string[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    if (seen.has(chunk.name)) continue;
    seen.add(chunk.name);
    if (chunk.stage !== "vertex") fragment.push(chunk.glsl);
    else vertex.push(chunk.glsl);
  }
  const vertexBody = [
    "in vec3 a_position;",
    "uniform mat4 u_modelViewProjection;",
    "void main() { gl_Position = u_modelViewProjection * vec4(a_position, 1.0); }"
  ];
  const fragmentBody = [
    "layout(location = 0) out vec4 fragColor;",
    "void main() { fragColor = vec4(1.0); }"
  ];
  const vertexSrc = [
    PREAMBLE,
    "in vec3 a_position;",
    LEGACY_DECLS,
    ...pars,
    entry.vertexMain ?? "",
    ...vertex,
    `void main() { gl_Position = u_viewProjection * vec4(a_position, 1.0); }`
  ].join("\n");
  const fragmentSrc = [
    PREAMBLE,
    LEGACY_DECLS,
    ...pars,
    entry.fragmentMain ?? "",
    ...fragment,
    "layout(location = 0) out vec4 fragColor;",
    "void main() { fragColor = vec4(1.0); }"
  ].join("\n");
  void vertexBody;
  void fragmentBody;
  return { vertex: vertexSrc, fragment: fragmentSrc };
}
