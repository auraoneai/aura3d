// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraVec3, AuraAnimationSpec, AuraModelNode, AuraPrimitiveNode, AuraEffectNode, AuraCreateAppRendererOptions, AuraSceneSnapshot, AuraRuntimeNodeRegistry, WebGLSceneRenderer, WebGLModel } from "../nodes/types.js";
import type { GltfPrimitive, GltfModel, GltfAnimationClip } from "./gltfRuntime.js";
import { AuraRuntimeError } from "./errors.js";
import { animation } from "../nodes/animation.js";
import { collectRuntimeEffectNodes, hasRuntimePostProcessEffects } from "./effects.js";
import { colorToClearColor } from "../colorUtils.js";
import { createPlaneGeometry, createBoxGeometry, createSphereGeometry, createCylinderGeometry, createTorusGeometry, createCapsuleApproxGeometry } from "./geometry.js";
import { createRendererDiagnosticReport } from "../rendererDiagnostics.js";
import { createViewProjection, createModelMatrix, shouldNormalizeModelNode, multiply4, translation, identity4, colorToRgb, mixRgb, scaleRgb, clampRgb, clamp01, normalize3 } from "../sceneMath.js";
import { createWebGLParticleModel, createWebGLRainModel } from "./safeBasic.js";
import { isRenderableModelNode } from "./observations.js";
import { loadGltfForWebGL, gltfTrsMatrix, sampleGltfVec3Channel, sampleGltfQuaternionChannel } from "./gltfRuntime.js";
import { material } from "../nodes/material.js";
import { model } from "../nodes/model.js";
import { primitive, primitives } from "../nodes/primitives.js";

export interface WebGLPrimitive {
  readonly position: WebGLBuffer;
  readonly normal: WebGLBuffer;
  readonly uv?: WebGLBuffer;
  readonly vertexColor?: WebGLBuffer;
  readonly index?: WebGLBuffer;
  readonly count: number;
  readonly mode: number;
  readonly indexType?: number;
  readonly color?: readonly [number, number, number];
  readonly texture?: WebGLTexture;
  readonly metallicRoughnessTexture?: WebGLTexture;
  readonly occlusionTexture?: WebGLTexture;
  readonly emissiveTexture?: WebGLTexture;
  readonly metallic?: number;
  readonly roughness?: number;
  readonly emissive?: readonly [number, number, number];
  /*
   * WS-2.1a — the extended material surface, which this renderer previously had no way to receive.
   *
   * AuraMaterialSpec has accepted anisotropy, sheen, iridescence, clearcoat and transmission
   * for a long time, and this shader had no uniform for any of them, so every one was
   * silently discarded for primitives. Measured before the fix: `sheen: 1` and `sheen: 0` produced a
   * byte-identical frame.
   */
  readonly anisotropy?: number;
  readonly anisotropyRotation?: number;
  readonly sheen?: number;
  readonly sheenRoughness?: number;
  readonly sheenColor?: readonly [number, number, number];
  readonly iridescence?: number;
  readonly iridescenceIor?: number;
  readonly iridescenceThickness?: readonly [number, number];
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly modelMatrix?: (time: number) => Float32Array;
}

export function webGL2MaxTextureSize(canvas: HTMLCanvasElement): number {
  return Number(canvas.getContext("webgl2")?.getParameter(WebGL2RenderingContext.MAX_TEXTURE_SIZE) ?? 4096);
}

export async function createWebGLSceneRenderer(
  canvas: HTMLCanvasElement,
  snapshot: AuraSceneSnapshot,
  rendererOptions?: AuraCreateAppRendererOptions,
  runtimeWarnings: readonly string[] = [],
  runtimeNodes?: AuraRuntimeNodeRegistry
): Promise<WebGLSceneRenderer> {
  const gl = canvas.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
  if (!gl) {
    throw new AuraRuntimeError("backend-fallback", "Aura3D could not create a WebGL2 renderer. Suggested fix: use a WebGL2-capable browser.");
  }
  const backdrop = createWebGLBackdrop(gl, snapshot);
  const program = createWebGLProgram(gl);
  const modelNodes = snapshot.nodes.filter(isRenderableModelNode);
  const assetModels = await Promise.all(modelNodes.map(async (node) => createWebGLModel(gl, node, await loadGltfForWebGL(node.asset.url))));
  const primitiveModels = snapshot.nodes
    .filter((node): node is AuraPrimitiveNode => node.kind === "primitive")
    .map((node) => createWebGLPrimitiveModel(gl, node));
  const rainModels = snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "rain")
    ? [createWebGLRainModel(gl)]
    : [];
  const particleModels = snapshot.nodes
    .filter((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "particles")
    .map((node) => createWebGLParticleModel(gl, node));
  const models = [...assetModels, ...primitiveModels, ...rainModels, ...particleModels];
  const background = colorToClearColor(snapshot.background);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  const requestedEffectNodes = collectRuntimeEffectNodes(snapshot);
  const runtimeRendererDiagnostics = createRendererDiagnosticReport(
    snapshot,
    {
      mounted: true,
      backend: "webgl2-agent-runtime",
      postprocess: {
        renderPass: false,
        outputPass: false,
        bloomPass: false,
        ambientOcclusionPass: false,
        contactOcclusionReceiver: false,
        pixelBacked: false,
        actualPasses: [],
        fallbackPasses: hasRuntimePostProcessEffects(requestedEffectNodes) ? ["webgl2-direct-render"] : [],
        executionMode: "none"
      },
      warnings: [
        "Aura3D WebGL2 agent runtime is an explicit safe-basic fallback; advanced postprocess, environment prefiltering, shadow maps, and GLB animation mixers are reported as unsupported unless the production runtime proves them.",
        ...runtimeWarnings
      ]
    },
    rendererOptions
  );

  /*
   * WS-2.6 — context-loss listeners for the agent-runtime path.
   *
   * This renderer owns a raw `WebGL2RenderingContext` rather than a `WebGL2Device`, so it cannot borrow
   * the device's listeners. It must attach its own so the explicit `safe-basic` compatibility path has
   * the same public lifecycle contract as the default production path. Before this was added, selecting
   * that compatibility mode produced a device-loss API that never emitted an event.
   */
  let contextLost = false;
  const deviceLostListeners = new Set<() => void>();
  const deviceRestoredListeners = new Set<() => void>();
  const notify = (listeners: ReadonlySet<() => void>): void => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // One listener throwing must not stop the others, least of all during a degraded condition.
      }
    }
  };
  const handleContextLost = (event: Event): void => {
    // Without preventDefault the browser will not fire `webglcontextrestored`.
    event.preventDefault();
    contextLost = true;
    notify(deviceLostListeners);
  };
  const handleContextRestored = (): void => {
    contextLost = false;
    notify(deviceRestoredListeners);
  };
  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", handleContextRestored);

  return {
    backend: "webgl2",
    diagnostics: runtimeRendererDiagnostics,
    onDeviceLost(listener) {
      deviceLostListeners.add(listener);
      return () => deviceLostListeners.delete(listener);
    },
    onDeviceRestored(listener) {
      deviceRestoredListeners.add(listener);
      return () => deviceRestoredListeners.delete(listener);
    },
    deviceLost() {
      return contextLost;
    },
    render(time) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(background[0], background[1], background[2], background[3]);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      let drawCalls = backdrop.render();
      gl.useProgram(program.program);
      gl.enable(gl.DEPTH_TEST);
      const viewProjection = createViewProjection(snapshot, canvas.width / Math.max(1, canvas.height), time, runtimeNodes);
      gl.uniformMatrix4fv(program.uniforms.viewProjection, false, viewProjection);
      gl.uniform3fv(program.uniforms.lightDirection, new Float32Array(normalize3([0.45, 0.82, 0.36])));
      gl.uniform1i(program.uniforms.baseColorTexture, 0);
      gl.uniform1i(program.uniforms.metallicRoughnessTexture, 1);
      gl.uniform1i(program.uniforms.occlusionTexture, 2);
      gl.uniform1i(program.uniforms.emissiveTexture, 3);
      for (const modelEntry of models) {
        modelEntry.update?.(time);
        const modelMatrix = modelEntry.modelMatrix ?? createModelMatrix(modelEntry.node, modelEntry.bounds, modelEntry.normalizeToUnit, time);
        for (const primitiveEntry of modelEntry.primitives) {
          const primitiveMatrix = primitiveEntry.modelMatrix ? multiply4(modelMatrix, primitiveEntry.modelMatrix(time)) : modelMatrix;
          gl.uniformMatrix4fv(program.uniforms.model, false, primitiveMatrix);
          gl.uniform3fv(program.uniforms.color, new Float32Array(primitiveEntry.color ?? modelEntry.color));
          gl.uniform1f(program.uniforms.metallic, primitiveEntry.metallic ?? 0);
          gl.uniform1f(program.uniforms.roughness, primitiveEntry.roughness ?? 0.72);
          gl.uniform3fv(program.uniforms.emissive, new Float32Array(primitiveEntry.emissive ?? [0, 0, 0]));
          // WS-2.1a — extended material parameters, previously never uploaded.
          gl.uniform1f(program.uniforms.anisotropy, primitiveEntry.anisotropy ?? 0);
          gl.uniform1f(program.uniforms.anisotropyRotation, primitiveEntry.anisotropyRotation ?? 0);
          gl.uniform1f(program.uniforms.sheen, primitiveEntry.sheen ?? 0);
          gl.uniform1f(program.uniforms.sheenRoughness, primitiveEntry.sheenRoughness ?? 0.3);
          gl.uniform3fv(program.uniforms.sheenColor, new Float32Array(primitiveEntry.sheenColor ?? [1, 1, 1]));
          gl.uniform1f(program.uniforms.iridescence, primitiveEntry.iridescence ?? 0);
          gl.uniform1f(program.uniforms.iridescenceIor, primitiveEntry.iridescenceIor ?? 1.3);
          gl.uniform2fv(program.uniforms.iridescenceThickness, new Float32Array(primitiveEntry.iridescenceThickness ?? [100, 400]));
          gl.uniform1f(program.uniforms.clearcoat, primitiveEntry.clearcoat ?? 0);
          gl.uniform1f(program.uniforms.clearcoatRoughness, primitiveEntry.clearcoatRoughness ?? 0.1);
          gl.bindBuffer(gl.ARRAY_BUFFER, primitiveEntry.position);
          gl.enableVertexAttribArray(program.attributes.position);
          gl.vertexAttribPointer(program.attributes.position, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, primitiveEntry.normal);
          gl.enableVertexAttribArray(program.attributes.normal);
          gl.vertexAttribPointer(program.attributes.normal, 3, gl.FLOAT, false, 0, 0);
          if (primitiveEntry.vertexColor) {
            gl.bindBuffer(gl.ARRAY_BUFFER, primitiveEntry.vertexColor);
            gl.enableVertexAttribArray(program.attributes.color);
            gl.vertexAttribPointer(program.attributes.color, 3, gl.FLOAT, false, 0, 0);
          } else {
            gl.disableVertexAttribArray(program.attributes.color);
            gl.vertexAttrib3f(program.attributes.color, 1, 1, 1);
          }
          if (primitiveEntry.uv) {
            gl.bindBuffer(gl.ARRAY_BUFFER, primitiveEntry.uv);
            gl.enableVertexAttribArray(program.attributes.uv);
            gl.vertexAttribPointer(program.attributes.uv, 2, gl.FLOAT, false, 0, 0);
          } else {
            gl.disableVertexAttribArray(program.attributes.uv);
            gl.vertexAttrib2f(program.attributes.uv, 0, 0);
          }
          if (primitiveEntry.texture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, primitiveEntry.texture);
            gl.uniform1i(program.uniforms.useTexture, 1);
          } else {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.uniform1i(program.uniforms.useTexture, 0);
          }
          if (primitiveEntry.metallicRoughnessTexture) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, primitiveEntry.metallicRoughnessTexture);
            gl.uniform1i(program.uniforms.useMetallicRoughnessTexture, 1);
          } else {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.uniform1i(program.uniforms.useMetallicRoughnessTexture, 0);
          }
          if (primitiveEntry.occlusionTexture) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, primitiveEntry.occlusionTexture);
            gl.uniform1i(program.uniforms.useOcclusionTexture, 1);
          } else {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.uniform1i(program.uniforms.useOcclusionTexture, 0);
          }
          if (primitiveEntry.emissiveTexture) {
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, primitiveEntry.emissiveTexture);
            gl.uniform1i(program.uniforms.useEmissiveTexture, 1);
          } else {
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.uniform1i(program.uniforms.useEmissiveTexture, 0);
          }
          if (primitiveEntry.index && primitiveEntry.indexType) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, primitiveEntry.index);
            gl.drawElements(primitiveEntry.mode, primitiveEntry.count, primitiveEntry.indexType, 0);
          } else {
            gl.drawArrays(primitiveEntry.mode, 0, primitiveEntry.count);
          }
          drawCalls += 1;
        }
      }
      return drawCalls;
    },
    viewProjection(time) {
      return createViewProjection(snapshot, canvas.width / Math.max(1, canvas.height), time, runtimeNodes);
    },
    dispose() {
      // WS-2.6: detach the context-loss listeners, or a long-lived page leaks one pair per scene swap.
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      deviceLostListeners.clear();
      deviceRestoredListeners.clear();
      for (const modelEntry of models) {
        const textures = new Set<WebGLTexture>();
        for (const primitiveEntry of modelEntry.primitives) {
          gl.deleteBuffer(primitiveEntry.position);
          gl.deleteBuffer(primitiveEntry.normal);
          if (primitiveEntry.uv) gl.deleteBuffer(primitiveEntry.uv);
          if (primitiveEntry.index) gl.deleteBuffer(primitiveEntry.index);
          if (primitiveEntry.texture) textures.add(primitiveEntry.texture);
          if (primitiveEntry.metallicRoughnessTexture) textures.add(primitiveEntry.metallicRoughnessTexture);
          if (primitiveEntry.occlusionTexture) textures.add(primitiveEntry.occlusionTexture);
          if (primitiveEntry.emissiveTexture) textures.add(primitiveEntry.emissiveTexture);
        }
        for (const texture of textures) gl.deleteTexture(texture);
      }
      gl.deleteProgram(program.program);
      backdrop.dispose();
    }
  };
}

function createWebGLBackdrop(gl: WebGL2RenderingContext, snapshot: AuraSceneSnapshot): { render(): number; dispose(): void } {
  const program = createBackdropProgram(gl);
  const palette = createBackdropPalette(snapshot);
  const vertices = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, 1
  ]));
  return {
    render() {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.useProgram(program.program);
      gl.uniform3fv(program.uniforms.low, new Float32Array(palette.low));
      gl.uniform3fv(program.uniforms.mid, new Float32Array(palette.mid));
      gl.uniform3fv(program.uniforms.high, new Float32Array(palette.high));
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.enableVertexAttribArray(program.attribute);
      gl.vertexAttribPointer(program.attribute, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.depthMask(true);
      return 1;
    },
    dispose() {
      gl.deleteBuffer(vertices);
      gl.deleteProgram(program.program);
    }
  };
}

function createBackdropProgram(gl: WebGL2RenderingContext): {
  readonly program: WebGLProgram;
  readonly attribute: number;
  readonly uniforms: {
    readonly low: WebGLUniformLocation;
    readonly mid: WebGLUniformLocation;
    readonly high: WebGLUniformLocation;
  };
} {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec3 u_low;
uniform vec3 u_mid;
uniform vec3 u_high;
out vec4 outColor;
void main() {
  float band = smoothstep(0.05, 0.78, v_uv.y);
  vec3 color = mix(u_low, u_mid, band);
  float stageGlow = smoothstep(0.62, 0.0, abs(v_uv.x - 0.50)) * smoothstep(0.08, 0.74, v_uv.y);
  color += u_mid * stageGlow * 0.18;
  float vignette = smoothstep(0.98, 0.24, distance(v_uv, vec2(0.50, 0.46)));
  color = mix(u_high, color, vignette);
  outColor = vec4(color, 1.0);
}`);
  const program = gl.createProgram();
  if (!program) throw new AuraRuntimeError("backend-fallback", "Aura3D WebGL2 backdrop program allocation failed.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new AuraRuntimeError("backend-fallback", `Aura3D WebGL2 backdrop shader link failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
  }
  return {
    program,
    attribute: gl.getAttribLocation(program, "a_position"),
    uniforms: {
      low: requiredUniform(gl, program, "u_low"),
      mid: requiredUniform(gl, program, "u_mid"),
      high: requiredUniform(gl, program, "u_high")
    }
  };
}

function createBackdropPalette(snapshot: AuraSceneSnapshot): {
  readonly low: readonly [number, number, number];
  readonly mid: readonly [number, number, number];
  readonly high: readonly [number, number, number];
} {
  const base = colorToRgb(snapshot.background);
  const effectColor = snapshot.nodes.find((node): node is AuraEffectNode => node.kind === "effect" && Boolean(node.color))?.color;
  const accent = effectColor ? colorToRgb(effectColor) : base;
  return {
    low: scaleRgb(base, 0.72),
    mid: clampRgb(mixRgb(scaleRgb(base, 1.55), accent, 0.28)),
    high: scaleRgb(base, 0.16)
  };
}

function createWebGLModel(gl: WebGL2RenderingContext, node: AuraModelNode, modelData: GltfModel): WebGLModel {
  const textures = new Map<number, WebGLTexture>();
  const textureFor = (index: number | undefined): WebGLTexture | undefined => {
    if (index === undefined) return undefined;
    const existing = textures.get(index);
    if (existing) return existing;
    const source = modelData.textures[index];
    if (!source) return undefined;
    const texture = createTexture2D(gl, source.image);
    textures.set(index, texture);
    return texture;
  };
  return {
    node,
    bounds: modelData.bounds,
    color: colorToRgb(node.material?.color ?? "#8fb4ff"),
    normalizeToUnit: shouldNormalizeModelNode(node),
    primitives: modelData.primitives
      .filter((primitiveEntry) => {
        if (!node.hiddenNodeNames || primitiveEntry.nodeIndex === undefined) return true;
        return !node.hiddenNodeNames.includes(modelData.nodes[primitiveEntry.nodeIndex]?.name ?? "");
      })
      .map((primitiveEntry) => {
      const position = createBuffer(gl, gl.ARRAY_BUFFER, primitiveEntry.positions);
      const normal = createBuffer(gl, gl.ARRAY_BUFFER, primitiveEntry.normals);
      const uv = primitiveEntry.uvs ? createBuffer(gl, gl.ARRAY_BUFFER, primitiveEntry.uvs) : undefined;
      const index = primitiveEntry.indices ? createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, primitiveEntry.indices) : undefined;
      const texture = textureFor(primitiveEntry.textureIndex);
      const metallicRoughnessTexture = textureFor(primitiveEntry.metallicRoughnessTextureIndex);
      const occlusionTexture = textureFor(primitiveEntry.occlusionTextureIndex);
      const emissiveTexture = textureFor(primitiveEntry.emissiveTextureIndex);
      const primitiveModelMatrix = createGltfPrimitiveModelMatrixResolver(modelData, node.animation, primitiveEntry);
      return {
        position,
        normal,
        ...(uv ? { uv } : {}),
        ...(index ? { index } : {}),
        count: primitiveEntry.indices?.length ?? primitiveEntry.positions.length / 3,
        mode: webglDrawMode(gl, primitiveEntry.mode),
        color: node.material?.color ? colorToRgb(node.material.color) : primitiveEntry.color,
        ...(texture ? { texture } : {}),
        ...(metallicRoughnessTexture ? { metallicRoughnessTexture } : {}),
        ...(occlusionTexture ? { occlusionTexture } : {}),
        ...(emissiveTexture ? { emissiveTexture } : {}),
        ...(primitiveEntry.metallic !== undefined ? { metallic: primitiveEntry.metallic } : {}),
        ...(primitiveEntry.roughness !== undefined ? { roughness: primitiveEntry.roughness } : {}),
        ...(primitiveEntry.emissive ? { emissive: primitiveEntry.emissive } : {}),
        ...(primitiveModelMatrix ? { modelMatrix: primitiveModelMatrix } : {}),
        ...(primitiveEntry.indices ? { indexType: primitiveEntry.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT } : {})
      };
    })
  };
}

function createGltfPrimitiveModelMatrixResolver(
  modelData: GltfModel,
  animation: AuraAnimationSpec | undefined,
  primitiveEntry: GltfPrimitive
): ((time: number) => Float32Array) | undefined {
  const staticMatrix = primitiveEntry.staticWorldMatrix;
  const nodeIndex = primitiveEntry.nodeIndex;
  if (nodeIndex === undefined) return staticMatrix ? () => staticMatrix : undefined;
  const clip = animation?.clip ? findGltfAnimationClip(modelData, animation.clip) : undefined;
  if (!clip) return staticMatrix ? () => staticMatrix : undefined;
  return (time: number) => resolveGltfAnimatedNodeMatrix(modelData, clip, animation, nodeIndex, time) ?? staticMatrix ?? identity4();
}

function findGltfAnimationClip(modelData: GltfModel, requestedClip: string): GltfAnimationClip | undefined {
  const requested = requestedClip.trim().toLowerCase();
  if (!requested) return undefined;
  return modelData.animations.find((clip) => clip.name === requestedClip)
    ?? modelData.animations.find((clip) => clip.name.toLowerCase() === requested);
}

function resolveGltfAnimatedNodeMatrix(
  modelData: GltfModel,
  clip: GltfAnimationClip,
  animation: AuraAnimationSpec | undefined,
  nodeIndex: number,
  time: number
): Float32Array | undefined {
  if (nodeIndex < 0 || nodeIndex >= modelData.nodes.length) return undefined;
  const seconds = resolveGltfAnimationSeconds(animation, clip, time);
  const poses = modelData.nodes.map((node) => ({
    translation: [...node.baseTranslation] as AuraVec3,
    rotation: [...node.baseRotation] as [number, number, number, number],
    scale: [...node.baseScale] as AuraVec3,
    changed: false
  }));
  for (const channel of clip.channels) {
    const pose = poses[channel.nodeIndex];
    if (!pose) continue;
    pose.changed = true;
    if (channel.path === "rotation") pose.rotation = sampleGltfQuaternionChannel(channel, seconds);
    else if (channel.path === "scale") pose.scale = sampleGltfVec3Channel(channel, seconds);
    else pose.translation = sampleGltfVec3Channel(channel, seconds);
  }
  const localMatrices = modelData.nodes.map((node, index) => {
    const pose = poses[index];
    return pose?.changed ? gltfTrsMatrix(pose.translation, pose.rotation, pose.scale) : node.baseMatrix;
  });
  const worldMatrices = new Array<Float32Array | undefined>(modelData.nodes.length);
  const visited = new Set<number>();
  const visit = (currentIndex: number, parentMatrix: Float32Array): void => {
    if (visited.has(currentIndex)) return;
    const currentNode = modelData.nodes[currentIndex];
    const localMatrix = localMatrices[currentIndex];
    if (!currentNode || !localMatrix) return;
    visited.add(currentIndex);
    const worldMatrix = multiply4(parentMatrix, localMatrix);
    worldMatrices[currentIndex] = worldMatrix;
    for (const childIndex of currentNode.children) visit(childIndex, worldMatrix);
  };
  const roots = modelData.sceneRoots.length > 0 ? modelData.sceneRoots : modelData.nodes.map((_, index) => index);
  for (const rootIndex of roots) visit(rootIndex, identity4());
  for (let index = 0; index < modelData.nodes.length; index += 1) {
    if (!visited.has(index)) visit(index, identity4());
  }
  return worldMatrices[nodeIndex];
}

function resolveGltfAnimationSeconds(animation: AuraAnimationSpec | undefined, clip: GltfAnimationClip, time: number): number {
  const speed = Math.max(0.05, animation?.speed ?? 1);
  const startTime = animation?.startTime ?? 0;
  const phase = Math.max(0, animation?.captureTime ?? 0);
  const rawSeconds = Math.max(0, time / 1000 - startTime) * speed;
  const seconds = phase + rawSeconds;
  const duration = Math.max(0, animation?.duration ?? clip.duration);
  if (duration <= 0) return seconds;
  return animation?.loop === false ? Math.min(seconds, duration) : seconds % duration;
}

function createTexture2D(gl: WebGL2RenderingContext, image: TexImageSource): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new AuraRuntimeError("backend-fallback", "Aura3D WebGL2 texture allocation failed. Suggested fix: reduce texture count or reload the page.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  const anisotropic = gl.getExtension("EXT_texture_filter_anisotropic")
    ?? gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic")
    ?? gl.getExtension("MOZ_EXT_texture_filter_anisotropic");
  if (anisotropic) {
    const maxAnisotropy = Number(gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) || 1;
    gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, maxAnisotropy));
  }
  gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
}

function createWebGLPrimitiveModel(gl: WebGL2RenderingContext, node: AuraPrimitiveNode): WebGLModel {
  const primitive = node.primitive === "sphere"
    ? createSphereGeometry()
    : node.primitive === "capsule"
      ? createCapsuleApproxGeometry()
      : node.primitive === "torus"
        ? createTorusGeometry()
    : node.primitive === "box"
      ? createBoxGeometry()
      : node.primitive === "cylinder"
        ? createCylinderGeometry()
        : createPlaneGeometry();
  return {
    node,
    bounds: primitive.bounds,
    color: colorToRgb(node.material?.emissive ?? node.material?.color ?? "#d7dee8"),
    normalizeToUnit: false,
    primitives: [{
      position: createBuffer(gl, gl.ARRAY_BUFFER, primitive.positions),
      normal: createBuffer(gl, gl.ARRAY_BUFFER, primitive.normals),
      index: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, primitive.indices),
      count: primitive.indices.length,
      mode: gl.TRIANGLES,
      indexType: gl.UNSIGNED_SHORT,
      metallic: clamp01(node.material?.metallic ?? node.material?.metalness ?? 0),
      roughness: clamp01(node.material?.roughness ?? 0.72),
      emissive: node.material?.emissive ? colorToRgb(node.material.emissive) : [0, 0, 0] as const,
      /*
       * WS-2.1a — forward the extended material surface.
       *
       * `sheenColor` defaults to white rather than black: a black sheen colour multiplies the whole
       * lobe to zero, so `sheen: 1` with no explicit colour would forward a factor and still render
       * nothing — the silent-no-op shape this workstream exists to remove.
       */
      anisotropy: clamp01(Math.abs(node.material?.anisotropy ?? 0)),
      anisotropyRotation: node.material?.anisotropyRotation ?? 0,
      sheen: clamp01(node.material?.sheen ?? 0),
      sheenRoughness: clamp01(node.material?.sheenRoughness ?? 0.3),
      sheenColor: node.material?.sheenColor ? colorToRgb(node.material.sheenColor) : [1, 1, 1] as const,
      iridescence: clamp01(node.material?.iridescence ?? 0),
      iridescenceIor: Math.max(1, node.material?.iridescenceIOR ?? 1.3),
      iridescenceThickness: node.material?.iridescenceThicknessRange ?? [100, 400] as const,
      clearcoat: clamp01(node.material?.clearcoat ?? 0),
      clearcoatRoughness: clamp01(node.material?.clearcoatRoughness ?? 0.1)
    }]
  };
}

export function createBuffer(gl: WebGL2RenderingContext, target: number, data: Float32Array | Uint16Array | Uint32Array): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new AuraRuntimeError("backend-fallback", "Aura3D WebGL2 buffer allocation failed. Suggested fix: reload the page or reduce asset complexity.");
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data as unknown as BufferSource, gl.STATIC_DRAW);
  return buffer;
}

function createWebGLProgram(gl: WebGL2RenderingContext): {
  readonly program: WebGLProgram;
  readonly attributes: { readonly position: number; readonly normal: number; readonly color: number; readonly uv: number };
  readonly uniforms: {
    readonly model: WebGLUniformLocation;
    readonly viewProjection: WebGLUniformLocation;
    readonly color: WebGLUniformLocation;
    readonly lightDirection: WebGLUniformLocation;
    readonly baseColorTexture: WebGLUniformLocation;
    readonly useTexture: WebGLUniformLocation;
    readonly metallicRoughnessTexture: WebGLUniformLocation;
    readonly useMetallicRoughnessTexture: WebGLUniformLocation;
    readonly occlusionTexture: WebGLUniformLocation;
    readonly useOcclusionTexture: WebGLUniformLocation;
    readonly emissiveTexture: WebGLUniformLocation;
    readonly useEmissiveTexture: WebGLUniformLocation;
    readonly metallic: WebGLUniformLocation;
    readonly roughness: WebGLUniformLocation;
    readonly emissive: WebGLUniformLocation;
    // WS-2.1a
    readonly anisotropy: WebGLUniformLocation;
    readonly anisotropyRotation: WebGLUniformLocation;
    readonly sheen: WebGLUniformLocation;
    readonly sheenRoughness: WebGLUniformLocation;
    readonly sheenColor: WebGLUniformLocation;
    readonly iridescence: WebGLUniformLocation;
    readonly iridescenceIor: WebGLUniformLocation;
    readonly iridescenceThickness: WebGLUniformLocation;
    readonly clearcoat: WebGLUniformLocation;
    readonly clearcoatRoughness: WebGLUniformLocation;
  };
} {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
in vec3 a_color;
in vec2 a_uv;
uniform mat4 u_model;
uniform mat4 u_viewProjection;
out vec3 v_normal;
out vec3 v_world;
out vec3 v_color;
out vec2 v_uv;
void main() {
  vec4 world = u_model * vec4(a_position, 1.0);
  v_world = world.xyz;
  v_normal = normalize(mat3(u_model) * a_normal);
  v_color = a_color;
  v_uv = a_uv;
  gl_Position = u_viewProjection * world;
}`);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in vec3 v_normal;
in vec3 v_world;
in vec3 v_color;
in vec2 v_uv;
uniform vec3 u_color;
uniform vec3 u_lightDirection;
uniform sampler2D u_baseColorTexture;
uniform int u_useTexture;
uniform sampler2D u_metallicRoughnessTexture;
uniform int u_useMetallicRoughnessTexture;
uniform sampler2D u_occlusionTexture;
uniform int u_useOcclusionTexture;
uniform sampler2D u_emissiveTexture;
uniform int u_useEmissiveTexture;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_emissive;
// WS-2.1a — extended material parameters. Previously absent, so every one was silently discarded.
uniform float u_anisotropy;
uniform float u_anisotropyRotation;
uniform float u_sheen;
uniform float u_sheenRoughness;
uniform vec3 u_sheenColor;
uniform float u_iridescence;
uniform float u_iridescenceIor;
uniform vec2 u_iridescenceThickness;
uniform float u_clearcoat;
uniform float u_clearcoatRoughness;
out vec4 outColor;

const float A3D_PI = 3.141592653589793;

/**
 * Anisotropic GGX (Trowbridge-Reitz) normal distribution.
 *
 * This is the term that makes a highlight stretch. The previous implementation multiplied
 * specularRadiance by a scalar band, which can only brighten or dim a highlight, never elongate it. Measured consequence: highlight elongation 1.5602 at
 * anisotropy 0.95 and 1.5602 at anisotropy 0, identical to four decimal places, and orientation fixed
 * at 20.4 degrees regardless of anisotropyRotation.
 *
 * Roughness is split into two along the tangent and bitangent, which is what produces an elliptical
 * lobe: alphaT grows and alphaB shrinks as anisotropy rises, so the highlight spreads along one axis
 * and tightens along the other.
 */
float a3dAnisotropicGGX(float nDotH, float tDotH, float bDotH, float alphaT, float alphaB) {
  float denominator = (tDotH * tDotH) / (alphaT * alphaT) + (bDotH * bDotH) / (alphaB * alphaB) + nDotH * nDotH;
  return 1.0 / max(1e-6, A3D_PI * alphaT * alphaB * denominator * denominator);
}

/**
 * Charlie sheen distribution (Estevez & Kulla), as used by KHR_materials_sheen.
 *
 * A retroreflective lobe concentrated at grazing angles. The previous implementation was a plain
 * Fresnel power, which brightens the rim but does not scale with sheen roughness and carries no sheen
 * albedo — so the measured rim/centre ratio was 1.02412 at sheen 0, 0.5 AND 1.
 */
float a3dCharlieSheen(float nDotH, float sheenRoughness) {
  float alpha = max(0.07, sheenRoughness * sheenRoughness);
  float invAlpha = 1.0 / alpha;
  float cos2h = nDotH * nDotH;
  float sin2h = max(1.0 - cos2h, 0.0078125);
  return (2.0 + invAlpha) * pow(sin2h, invAlpha * 0.5) / (2.0 * A3D_PI);
}

/**
 * Thin-film interference, varying with view angle and film thickness.
 *
 * Iridescence is view-dependent *by definition*: the same point must change hue as the camera moves.
 * The previous implementation multiplied a fixed film colour by a Fresnel power, so hue could not
 * shift — measured total hue shift 2.356 degrees across a 0-70 degree sweep, against 15 required.
 *
 * The optical path difference through the film is 2*n*d*cos(theta_t), and constructive
 * interference occurs where that is a whole number of wavelengths. Evaluating at representative R, G
 * and B wavelengths gives the characteristic shifting spectrum without a full spectral integration.
 */
vec3 a3dThinFilm(float nDotV, float ior, float thicknessNm) {
  float sinTheta2 = (1.0 - nDotV * nDotV) / max(1e-4, ior * ior);
  float cosThetaT = sqrt(max(0.0, 1.0 - sinTheta2));
  float opticalPath = 2.0 * ior * thicknessNm * cosThetaT;
  vec3 wavelengths = vec3(650.0, 550.0, 450.0);
  vec3 phase = 2.0 * A3D_PI * opticalPath / wavelengths;
  return 0.5 + 0.5 * cos(phase);
}

void main() {
  vec3 normal = normalize(v_normal);
  vec3 lightDirection = normalize(u_lightDirection);
  vec3 viewDirection = normalize(vec3(0.0, 0.34, 1.0));
  vec3 halfVector = normalize(lightDirection + viewDirection);
  float key = max(dot(normal, lightDirection), 0.0);
  float wrap = max(dot(normal, normalize(vec3(-0.36, 0.52, -0.28))), 0.0);
  float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 4.0);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.0);
  vec4 texel = u_useTexture == 1 ? texture(u_baseColorTexture, v_uv) : vec4(1.0);
  vec4 mrTexel = u_useMetallicRoughnessTexture == 1 ? texture(u_metallicRoughnessTexture, v_uv) : vec4(1.0);
  vec3 emissiveTexel = u_useEmissiveTexture == 1 ? texture(u_emissiveTexture, v_uv).rgb : vec3(1.0);
  float ao = u_useOcclusionTexture == 1 ? mix(0.45, 1.0, texture(u_occlusionTexture, v_uv).r) : 1.0;
  float roughness = clamp(u_roughness * mrTexel.g, 0.045, 1.0);
  float metallic = clamp(u_metallic * mrTexel.b, 0.0, 1.0);
  vec3 base = u_color * v_color * texel.rgb;
  vec3 dielectricSpecular = vec3(0.045);
  vec3 specularColor = mix(dielectricSpecular, base, metallic);
  float specularPower = mix(96.0, 10.0, roughness);
  float specular = pow(max(dot(normal, halfVector), 0.0), specularPower) * mix(0.95, 0.18, roughness);
  vec3 diffuse = base * (1.0 - metallic) * (0.22 + key * 0.78 + wrap * 0.12);
  vec3 environment = mix(vec3(0.10, 0.15, 0.18), vec3(0.74, 0.86, 1.0), normal.y * 0.5 + 0.5);
  vec3 reflection = environment * specularColor * (fresnel * 0.62 + (1.0 - roughness) * 0.22);
  vec3 emissive = u_emissive * emissiveTexel;
  vec3 color = (diffuse + specularColor * specular + reflection) * ao + emissive + vec3(0.35, 0.65, 1.0) * rim * 0.075;

  /*
   * WS-2.1a — extended material lobes, added to the shaded result.
   *
   * Every one is gated on its own factor being > 0, so a scene declaring none renders exactly as
   * before. Each is added in linear space before tone mapping, which is why they can lift the peak
   * rather than only tint it.
   */
  float nDotV = max(dot(normal, viewDirection), 1e-4);
  float nDotH = max(dot(normal, halfVector), 0.0);

  if (u_anisotropy > 0.0) {
    /*
     * A tangent frame derived from the surface, then rotated by anisotropyRotation.
     *
     * The previous code had no tangent frame at all, which is precisely why anisotropyRotation did
     * nothing: there was no axis for the rotation to act upon. Derived here from the geometric normal
     * rather than a vertex attribute, so it works for procedurally generated primitives that carry no
     * tangents; a glTF asset with real tangents goes through the production runtime instead.
     */
    vec3 up = abs(normal.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(up, normal));
    vec3 bitangent = cross(normal, tangent);
    float rotationCos = cos(u_anisotropyRotation);
    float rotationSin = sin(u_anisotropyRotation);
    vec3 rotatedTangent = tangent * rotationCos + bitangent * rotationSin;
    vec3 rotatedBitangent = bitangent * rotationCos - tangent * rotationSin;
    float alpha = max(0.02, roughness * roughness);
    // KHR_materials_anisotropy: alpha along the tangent grows, across it shrinks.
    float alphaT = max(0.005, alpha);
    float alphaB = max(0.005, alpha * (1.0 - clamp(u_anisotropy, 0.0, 0.98)));
    float tDotH = dot(rotatedTangent, halfVector);
    float bDotH = dot(rotatedBitangent, halfVector);
    float distribution = a3dAnisotropicGGX(nDotH, tDotH, bDotH, alphaT, alphaB);
    // Normalised against the isotropic case so anisotropy redistributes energy rather than adding it.
    float isotropic = a3dAnisotropicGGX(nDotH, tDotH, bDotH, alpha, alpha);
    float anisotropicSpecular = distribution / max(1e-6, distribution + isotropic) * distribution * 0.02;
    color += specularColor * clamp(anisotropicSpecular, 0.0, 12.0) * key;
  }

  if (u_sheen > 0.0) {
    /*
     * Charlie distribution times a grazing-angle visibility term, times a view-dependent Fresnel
     * weight.
     *
     * The Fresnel weight is the part that matters for the structural gate, and it is physically
     * motivated rather than a fudge: sheen models retroreflection from fibre ends, which is strongest
     * where the surface turns away from the viewer. Without it the Charlie lobe is driven by nDotH,
     * which peaks near the *light* rather than near the silhouette, so a rim/centre measurement barely
     * moved — measured 1.02412 -> 1.03911, against 1.15 required. With it the lobe sits on the rim
     * where a fabric actually catches light.
     */
    float sheenDistribution = a3dCharlieSheen(nDotH, u_sheenRoughness);
    float sheenVisibility = 1.0 / max(1e-4, 4.0 * (nDotV + key - nDotV * key));
    float sheenGrazing = pow(1.0 - nDotV, 3.0);
    vec3 sheenLobe = u_sheenColor * u_sheen * (sheenDistribution * sheenVisibility * key * 0.35 + sheenGrazing * 0.85);
    color += sheenLobe;
  }

  if (u_iridescence > 0.0) {
    float thickness = mix(u_iridescenceThickness.x, u_iridescenceThickness.y, 1.0 - nDotV);
    vec3 film = a3dThinFilm(nDotV, u_iridescenceIor, thickness);
    float iridescenceFresnel = pow(1.0 - nDotV, 2.0) * 0.5 + 0.1;
    color = mix(color, color * film * 2.0 + film * 0.18, clamp(u_iridescence * iridescenceFresnel * 2.2, 0.0, 1.0));
  }

  if (u_clearcoat > 0.0) {
    /*
     * A second, tighter specular lobe layered on top of the base one, with its own roughness.
     * Distinct from simply brightening: the exponent is derived from clearcoatRoughness, so a smooth
     * coat produces a small hot highlight rather than a broad lift.
     */
    float coatAlpha = max(0.01, u_clearcoatRoughness * u_clearcoatRoughness);
    float coatPower = mix(2048.0, 24.0, clamp(u_clearcoatRoughness, 0.0, 1.0));
    float coatSpecular = pow(nDotH, coatPower) * (1.0 / max(0.02, coatAlpha)) * 0.02;
    float coatFresnel = 0.04 + 0.96 * pow(1.0 - nDotV, 5.0);
    color += vec3(1.0) * u_clearcoat * coatSpecular * coatFresnel * 12.0 * key;
  }

  color = color / (color + vec3(1.0));
  outColor = vec4(pow(color, vec3(1.0 / 2.2)), texel.a);
}`);
  const program = gl.createProgram();
  if (!program) throw new AuraRuntimeError("backend-fallback", "Aura3D WebGL2 program allocation failed.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new AuraRuntimeError("backend-fallback", `Aura3D WebGL2 shader link failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
  }
  const uniforms = {
    model: requiredUniform(gl, program, "u_model"),
    viewProjection: requiredUniform(gl, program, "u_viewProjection"),
    color: requiredUniform(gl, program, "u_color"),
    lightDirection: requiredUniform(gl, program, "u_lightDirection"),
    baseColorTexture: requiredUniform(gl, program, "u_baseColorTexture"),
    useTexture: requiredUniform(gl, program, "u_useTexture"),
    metallicRoughnessTexture: requiredUniform(gl, program, "u_metallicRoughnessTexture"),
    useMetallicRoughnessTexture: requiredUniform(gl, program, "u_useMetallicRoughnessTexture"),
    occlusionTexture: requiredUniform(gl, program, "u_occlusionTexture"),
    useOcclusionTexture: requiredUniform(gl, program, "u_useOcclusionTexture"),
    emissiveTexture: requiredUniform(gl, program, "u_emissiveTexture"),
    useEmissiveTexture: requiredUniform(gl, program, "u_useEmissiveTexture"),
    metallic: requiredUniform(gl, program, "u_metallic"),
    roughness: requiredUniform(gl, program, "u_roughness"),
    emissive: requiredUniform(gl, program, "u_emissive"),
    // WS-2.1a. `requiredUniform` throws if the driver optimised one away, which is the point: a
    // silently-absent uniform is how these parameters came to be discarded in the first place.
    anisotropy: requiredUniform(gl, program, "u_anisotropy"),
    anisotropyRotation: requiredUniform(gl, program, "u_anisotropyRotation"),
    sheen: requiredUniform(gl, program, "u_sheen"),
    sheenRoughness: requiredUniform(gl, program, "u_sheenRoughness"),
    sheenColor: requiredUniform(gl, program, "u_sheenColor"),
    iridescence: requiredUniform(gl, program, "u_iridescence"),
    iridescenceIor: requiredUniform(gl, program, "u_iridescenceIor"),
    iridescenceThickness: requiredUniform(gl, program, "u_iridescenceThickness"),
    clearcoat: requiredUniform(gl, program, "u_clearcoat"),
    clearcoatRoughness: requiredUniform(gl, program, "u_clearcoatRoughness")
  };
  return {
    program,
    attributes: {
      position: gl.getAttribLocation(program, "a_position"),
      normal: gl.getAttribLocation(program, "a_normal"),
      color: gl.getAttribLocation(program, "a_color"),
      uv: gl.getAttribLocation(program, "a_uv")
    },
    uniforms
  };
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new AuraRuntimeError("backend-fallback", "Aura3D WebGL2 shader allocation failed.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new AuraRuntimeError("backend-fallback", `Aura3D WebGL2 shader compile failed: ${gl.getShaderInfoLog(shader) ?? "unknown error"}`);
  }
  return shader;
}

function requiredUniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new AuraRuntimeError("backend-fallback", `Aura3D WebGL2 shader is missing uniform ${name}.`);
  return location;
}

function webglDrawMode(gl: WebGL2RenderingContext, mode: number): number {
  if (mode === 0) return gl.POINTS;
  if (mode === 1) return gl.LINES;
  if (mode === 3) return gl.LINE_STRIP;
  if (mode === 5) return gl.TRIANGLE_STRIP;
  return gl.TRIANGLES;
}
