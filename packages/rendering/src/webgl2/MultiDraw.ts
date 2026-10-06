// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts; 0 changed logic lines.

import { RenderDeviceError, type DrawCommand, type InstanceVertexAttribute, type RenderBuffer, type RenderShaderProgram } from "../RenderDevice";
import { isTextureBinding } from "../TextureBinding";
import type { VertexAttribute, VertexFormat } from "../VertexFormat";
import { WebGL2Buffer, WebGL2ShaderProgram } from "../WebGL2Device";
import type { WebGL2DeviceHost } from "./DeviceHost";

export interface WebGL2VertexArrayCacheEntry {
  readonly key: string;
  readonly handle: WebGLVertexArrayObject;
  readonly boundLocations: ReadonlySet<number>;
}

export class WebGL2DrawCallBinder {
  constructor(readonly host: WebGL2DeviceHost) {}

  nextVertexFormatId = 1;

  readonly uniformLocationCache = new WeakMap<WebGL2ShaderProgram, Map<string, WebGLUniformLocation | null>>();

  readonly vertexArrayCache = new Map<string, WebGL2VertexArrayCacheEntry>();

  readonly vertexFormatIds = new WeakMap<VertexFormat, number>();

  draw(command: DrawCommand): void {
    this.host.lifecycle.assertFrame();
    const vertexBuffer = this.requireBuffer(command.vertexBuffer);
    this.applyRenderState(command.renderState);
    let shader: WebGL2ShaderProgram | undefined;
    if (command.shader) {
      const activeShader = this.requireShader(command.shader);
      shader = activeShader;
      this.host.stateCache.useProgram(activeShader.handle, () => this.host.gl.useProgram(activeShader.handle));
      if (command.uniforms) {
        this.uploadUniforms(activeShader, command.uniforms);
        if (this.host.errorCheckMode === "strict") {
          const uniformError = this.host.lifecycle.readError();
          if (uniformError) {
            throw new RenderDeviceError(`WebGL2 uniform upload failed for draw ${command.label ?? "unnamed"}: ${uniformError}`, "WEBGL_DRAW_FAILED", {
              label: command.label,
              stage: "uniforms",
              error: uniformError
            });
          }
        }
      }
    }

    if (shader && command.vertexFormat) {
      this.bindVertexArrayForCommand(command, shader, vertexBuffer);
      if (this.host.errorCheckMode === "strict") {
        const vertexFormatError = this.host.lifecycle.readError();
        if (vertexFormatError) {
          throw new RenderDeviceError(`WebGL2 vertex format binding failed for draw ${command.label ?? "unnamed"}: ${vertexFormatError}`, "WEBGL_DRAW_FAILED", {
            label: command.label,
            stage: "vertex-format",
            error: vertexFormatError
          });
        }
      }
    } else {
      this.bindNoVertexArray();
      this.host.stateCache.bindBuffer(this.host.gl.ARRAY_BUFFER, vertexBuffer.handle, () => this.host.gl.bindBuffer(this.host.gl.ARRAY_BUFFER, vertexBuffer.handle));
    }
    if (command.indexBuffer) {
      const indexBuffer = this.requireBuffer(command.indexBuffer);
      if (!shader || !command.vertexFormat) {
        this.host.stateCache.bindBuffer(this.host.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle, () => this.host.gl.bindBuffer(this.host.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle));
      }
      const type = command.indexType === "uint32" ? this.host.gl.UNSIGNED_INT : this.host.gl.UNSIGNED_SHORT;
      const indexByteSize = command.indexType === "uint32" ? 4 : 2;
      const indexOffset = (command.firstIndex ?? 0) * indexByteSize;
      if ((command.instanceCount ?? 1) > 1) {
        this.host.gl.drawElementsInstanced(this.primitive(command.topology), command.indexCount ?? 0, type, indexOffset, command.instanceCount ?? 1);
        this.host.counters.nativeInstancedSubmissions += 1;
      } else {
        this.host.gl.drawElements(this.primitive(command.topology), command.indexCount ?? 0, type, indexOffset);
      }
    } else {
      if ((command.instanceCount ?? 1) > 1) {
        this.host.gl.drawArraysInstanced(this.primitive(command.topology), command.firstVertex ?? 0, command.vertexCount, command.instanceCount ?? 1);
        this.host.counters.nativeInstancedSubmissions += 1;
      } else {
        this.host.gl.drawArrays(this.primitive(command.topology), command.firstVertex ?? 0, command.vertexCount);
      }
    }
    this.host.counters.drawCalls += 1;
    if (this.host.activeRenderTarget?.sampleCount && this.host.activeRenderTarget.sampleCount > 1) this.host.activeRenderTarget.needsResolve = true;
    if (this.host.errorCheckMode === "strict") {
      const drawError = this.host.lifecycle.readError();
      if (drawError) {
        throw new RenderDeviceError(`WebGL2 draw failed for ${command.label ?? "unnamed"}: ${drawError}`, "WEBGL_DRAW_FAILED", {
          label: command.label,
          stage: "draw",
          error: drawError
        });
      }
    }
  }

  uploadUniforms(shader: WebGL2ShaderProgram, uniforms: ReadonlyMap<string, unknown>): void {
    let textureUnit = 0;
    for (const [name, value] of uniforms) {
      if (!shader.reflection.uniforms.has(name)) {
        continue;
      }
      const location = this.getUniformLocation(shader, name);
      if (location === null) {
        throw new RenderDeviceError("Material tried to bind a missing shader uniform", "MISSING_UNIFORM", { name });
      }
      if (isTextureBinding(value)) {
        this.host.samplers.uploadTextureUniform(location, value, textureUnit);
        textureUnit += 1;
      } else if (typeof value === "number") {
        this.host.gl.uniform1f(location, value);
      } else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        const length = (value as ArrayLike<number>).length;
        const floatData = value as Float32List;
        if (length === 16 || (length > 16 && length % 16 === 0 && /(?:Matrix|Matrices)$/.test(name))) {
          this.host.gl.uniformMatrix4fv(location, false, floatData);
        } else if (length > 16 && length % 4 === 0) {
          this.host.gl.uniform4fv(location, floatData);
        } else if (length === 4) {
          this.host.gl.uniform4fv(location, floatData);
        } else if (length === 3) {
          this.host.gl.uniform3fv(location, floatData);
        } else if (length === 2) {
          this.host.gl.uniform2fv(location, floatData);
        } else {
          throw new RenderDeviceError("Unsupported uniform array length", "UNSUPPORTED_UNIFORM", { name, length });
        }
      } else {
        throw new RenderDeviceError("Unsupported uniform value", "UNSUPPORTED_UNIFORM", { name, valueType: typeof value });
      }
      if (this.host.errorCheckMode === "strict") {
        const uniformError = this.host.lifecycle.readError();
        if (uniformError) {
          throw new RenderDeviceError(`WebGL2 uniform upload failed for ${name}: ${uniformError}`, "WEBGL_DRAW_FAILED", {
            name,
            stage: "uniform",
            error: uniformError
          });
        }
      }
    }
  }

  getUniformLocation(shader: WebGL2ShaderProgram, name: string): WebGLUniformLocation | null {
    let cache = this.uniformLocationCache.get(shader);
    if (!cache) {
      cache = new Map();
      this.uniformLocationCache.set(shader, cache);
    }
    if (!cache.has(name)) {
      this.host.counters.uniformLocationLookupCount += 1;
      cache.set(name, this.host.gl.getUniformLocation(shader.handle, name) ?? this.host.gl.getUniformLocation(shader.handle, `${name}[0]`));
    }
    return cache.get(name) ?? null;
  }

  bindVertexFormat(shader: RenderShaderProgram, format: VertexFormat): Set<number> {
    const boundLocations = new Set<number>();
    for (const attribute of format.attributes) {
      const location = this.resolveAttributeLocation(shader, attribute);
      if (location < 0) {
        continue;
      }
      if (attribute.type !== "float32") {
        throw new RenderDeviceError("Unsupported vertex attribute type", "UNSUPPORTED_VERTEX_ATTRIBUTE", {
          attribute: attribute.shaderName,
          type: attribute.type
        });
      }
      boundLocations.add(location);
      this.host.gl.enableVertexAttribArray(location);
      this.host.gl.vertexAttribDivisor(location, 0);
      this.host.gl.vertexAttribPointer(
        location,
        attribute.components,
        this.host.gl.FLOAT,
        attribute.normalized,
        format.stride,
        attribute.offset
      );
    }
    return boundLocations;
  }

  bindVertexArrayForCommand(command: DrawCommand, shader: WebGL2ShaderProgram, vertexBuffer: WebGL2Buffer): WebGL2VertexArrayCacheEntry {
    const indexBuffer = command.indexBuffer ? this.requireBuffer(command.indexBuffer) : undefined;
    const key = this.vertexArrayCacheKey(command, shader, vertexBuffer, indexBuffer);
    const cached = this.vertexArrayCache.get(key);
    if (cached) {
      this.host.stateCache.bindVertexArray(cached.handle, () => this.host.gl.bindVertexArray(cached.handle));
      return cached;
    }

    const handle = this.host.gl.createVertexArray();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL vertex array", "WEBGL_ALLOCATION_FAILED");
    }
    this.host.counters.vertexArrayCreateCount += 1;
    this.host.stateCache.bindVertexArray(handle, () => this.host.gl.bindVertexArray(handle));
    this.host.stateCache.bindBuffer(this.host.gl.ARRAY_BUFFER, vertexBuffer.handle, () => this.host.gl.bindBuffer(this.host.gl.ARRAY_BUFFER, vertexBuffer.handle));
    const boundLocations = this.bindVertexFormat(shader, command.vertexFormat!);
    if (command.instanceAttributes && command.instanceAttributes.length > 0) {
      this.bindInstanceAttributes(shader, command.instanceAttributes, boundLocations);
    }
    if (indexBuffer) {
      this.host.stateCache.bindBuffer(this.host.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle, () => this.host.gl.bindBuffer(this.host.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle));
    }
    this.disableUnboundVertexAttributes(boundLocations);
    this.applyDefaultAttributes(shader, boundLocations);
    const entry: WebGL2VertexArrayCacheEntry = { key, handle, boundLocations };
    this.vertexArrayCache.set(key, entry);
    return entry;
  }

  bindNoVertexArray(): void {
    this.host.stateCache.bindVertexArray(null, () => this.host.gl.bindVertexArray(null));
  }

  vertexArrayCacheKey(command: DrawCommand, shader: WebGL2ShaderProgram, vertexBuffer: WebGL2Buffer, indexBuffer: WebGL2Buffer | undefined): string {
    const instanceKey = (command.instanceAttributes ?? []).map((attribute) => {
      const buffer = this.requireBuffer(attribute.buffer);
      return `${attribute.shaderName}:${buffer.id}:${attribute.components}:${attribute.offset}:${attribute.stride}:${attribute.normalized === true ? 1 : 0}:${attribute.divisor ?? 1}`;
    }).join(",");
    return [
      shader.id,
      vertexBuffer.id,
      this.vertexFormatId(command.vertexFormat!),
      indexBuffer?.id ?? 0,
      instanceKey
    ].join("|");
  }

  vertexFormatId(format: VertexFormat): number {
    const existing = this.vertexFormatIds.get(format);
    if (existing !== undefined) return existing;
    const next = this.nextVertexFormatId;
    this.nextVertexFormatId += 1;
    this.vertexFormatIds.set(format, next);
    return next;
  }

  bindInstanceAttributes(shader: RenderShaderProgram, attributes: readonly InstanceVertexAttribute[], boundLocations: Set<number>): void {
    for (const attribute of attributes) {
      const location = shader.reflection.attributes.get(attribute.shaderName);
      if (location === undefined || location < 0) {
        continue;
      }
      if (![1, 2, 3, 4].includes(attribute.components)) {
        throw new RenderDeviceError("Instance vertex attribute components must be 1, 2, 3, or 4", "INVALID_DRAW_COMMAND", {
          attribute: attribute.shaderName,
          components: attribute.components
        });
      }
      if (!Number.isInteger(attribute.offset) || attribute.offset < 0 || attribute.offset % 4 !== 0) {
        throw new RenderDeviceError("Instance vertex attribute offset must be non-negative and 4-byte aligned", "INVALID_DRAW_COMMAND", {
          attribute: attribute.shaderName,
          offset: attribute.offset
        });
      }
      if (!Number.isInteger(attribute.stride) || attribute.stride <= 0 || attribute.stride % 4 !== 0) {
        throw new RenderDeviceError("Instance vertex attribute stride must be positive and 4-byte aligned", "INVALID_DRAW_COMMAND", {
          attribute: attribute.shaderName,
          stride: attribute.stride
        });
      }
      if (attribute.offset + attribute.components * 4 > attribute.stride) {
        throw new RenderDeviceError("Instance vertex attribute range must fit inside its stride", "INVALID_DRAW_COMMAND", {
          attribute: attribute.shaderName,
          offset: attribute.offset,
          components: attribute.components,
          stride: attribute.stride
        });
      }
      const buffer = this.requireBuffer(attribute.buffer);
      boundLocations.add(location);
      this.host.stateCache.bindBuffer(this.host.gl.ARRAY_BUFFER, buffer.handle, () => this.host.gl.bindBuffer(this.host.gl.ARRAY_BUFFER, buffer.handle));
      this.host.gl.enableVertexAttribArray(location);
      this.host.gl.vertexAttribPointer(
        location,
        attribute.components,
        this.host.gl.FLOAT,
        attribute.normalized ?? false,
        attribute.stride,
        attribute.offset
      );
      this.host.gl.vertexAttribDivisor(location, attribute.divisor ?? 1);
    }
  }

  resolveAttributeLocation(shader: RenderShaderProgram, attribute: VertexAttribute): number {
    const reflected = shader.reflection.attributes.get(attribute.shaderName);
    if (reflected !== undefined) {
      return reflected;
    }
    return shader.reflection.attributes.get(attribute.semantic) ?? -1;
  }

  applyDefaultAttributes(shader: RenderShaderProgram, boundLocations: ReadonlySet<number>): void {
    const colorLocation = shader.reflection.attributes.get("a_color") ?? shader.reflection.attributes.get("color");
    if (colorLocation !== undefined && colorLocation >= 0 && !boundLocations.has(colorLocation)) {
      this.host.gl.disableVertexAttribArray(colorLocation);
      this.host.gl.vertexAttribDivisor(colorLocation, 0);
      this.host.gl.vertexAttrib4f(colorLocation, 1, 1, 1, 1);
    }
    const tangentLocation = shader.reflection.attributes.get("a_tangent") ?? shader.reflection.attributes.get("tangent");
    if (tangentLocation !== undefined && tangentLocation >= 0 && !boundLocations.has(tangentLocation)) {
      this.host.gl.disableVertexAttribArray(tangentLocation);
      this.host.gl.vertexAttribDivisor(tangentLocation, 0);
      this.host.gl.vertexAttrib4f(tangentLocation, 1, 0, 0, 1);
    }
    const uv1Location = shader.reflection.attributes.get("a_uv1") ?? shader.reflection.attributes.get("uv1");
    if (uv1Location !== undefined && uv1Location >= 0 && !boundLocations.has(uv1Location)) {
      this.host.gl.disableVertexAttribArray(uv1Location);
      this.host.gl.vertexAttribDivisor(uv1Location, 0);
      this.host.gl.vertexAttrib2f(uv1Location, 0, 0);
    }
    const instanceColorLocation = shader.reflection.attributes.get("a_instanceColor") ?? shader.reflection.attributes.get("instanceColor");
    if (instanceColorLocation !== undefined && instanceColorLocation >= 0 && !boundLocations.has(instanceColorLocation)) {
      this.host.gl.disableVertexAttribArray(instanceColorLocation);
      this.host.gl.vertexAttribDivisor(instanceColorLocation, 0);
      this.host.gl.vertexAttrib4f(instanceColorLocation, 1, 1, 1, 1);
    }
  }

  disableUnboundVertexAttributes(boundLocations: ReadonlySet<number>): void {
    for (let location = 0; location < this.host.maxVertexAttributes; location += 1) {
      if (!boundLocations.has(location)) {
        this.host.gl.disableVertexAttribArray(location);
        this.host.gl.vertexAttribDivisor(location, 0);
      }
    }
  }

  primitive(topology: DrawCommand["topology"]): GLenum {
    if (topology === "lines") return this.host.gl.LINES;
    if (topology === "points") return this.host.gl.POINTS;
    return this.host.gl.TRIANGLES;
  }

  applyRenderState(state: DrawCommand["renderState"]): void {
    const renderState = state ?? {
      depthTest: true,
      depthWrite: true,
      cullMode: "back" as const,
      blend: false,
      depthCompare: "less-equal" as const,
      colorWrite: [true, true, true, true] as const,
      scissor: null,
      polygonOffset: null,
      stencil: null
    };
    this.host.stateCache.setEnabled(this.host.gl.DEPTH_TEST, renderState.depthTest, () => {
      if (renderState.depthTest) this.host.gl.enable(this.host.gl.DEPTH_TEST);
      else this.host.gl.disable(this.host.gl.DEPTH_TEST);
    });
    this.host.stateCache.depthMask(renderState.depthWrite, () => this.host.gl.depthMask(renderState.depthWrite));
    this.host.stateCache.depthFunc(renderState.depthCompare === "always" ? this.host.gl.ALWAYS : this.host.gl.LEQUAL, () => this.host.gl.depthFunc(renderState.depthCompare === "always" ? this.host.gl.ALWAYS : this.host.gl.LEQUAL));
    const colorWrite = renderState.colorWrite ?? [true, true, true, true] as const;
    this.host.stateCache.colorMask(colorWrite[0], colorWrite[1], colorWrite[2], colorWrite[3], () => this.host.gl.colorMask(colorWrite[0], colorWrite[1], colorWrite[2], colorWrite[3]));
    if (renderState.scissor) {
      this.host.stateCache.setEnabled(this.host.gl.SCISSOR_TEST, true, () => this.host.gl.enable(this.host.gl.SCISSOR_TEST));
      this.host.stateCache.scissor(renderState.scissor.x, renderState.scissor.y, renderState.scissor.width, renderState.scissor.height, () => {
        this.host.gl.scissor(renderState.scissor!.x, renderState.scissor!.y, renderState.scissor!.width, renderState.scissor!.height);
      });
    } else {
      this.host.stateCache.setEnabled(this.host.gl.SCISSOR_TEST, false, () => this.host.gl.disable(this.host.gl.SCISSOR_TEST));
    }
    if (renderState.polygonOffset) {
      this.host.stateCache.setEnabled(this.host.gl.POLYGON_OFFSET_FILL, true, () => this.host.gl.enable(this.host.gl.POLYGON_OFFSET_FILL));
      this.host.stateCache.polygonOffset(renderState.polygonOffset.factor, renderState.polygonOffset.units, () => this.host.gl.polygonOffset(renderState.polygonOffset!.factor, renderState.polygonOffset!.units));
    } else {
      this.host.stateCache.setEnabled(this.host.gl.POLYGON_OFFSET_FILL, false, () => this.host.gl.disable(this.host.gl.POLYGON_OFFSET_FILL));
    }
    if (renderState.stencil) {
      const stencil = renderState.stencil;
      const compare = this.stencilCompare(stencil.compare ?? "always");
      const reference = stencil.reference ?? 0;
      const readMask = stencil.readMask ?? 0xff;
      const writeMask = stencil.writeMask ?? 0xff;
      const fail = this.stencilOperation(stencil.fail ?? "keep");
      const depthFail = this.stencilOperation(stencil.depthFail ?? "keep");
      const depthPass = this.stencilOperation(stencil.depthPass ?? "keep");
      this.host.stateCache.setEnabled(this.host.gl.STENCIL_TEST, true, () => this.host.gl.enable(this.host.gl.STENCIL_TEST));
      this.host.stateCache.stencilFunc(compare, reference, readMask, () => this.host.gl.stencilFunc(compare, reference, readMask));
      this.host.stateCache.stencilMask(writeMask, () => this.host.gl.stencilMask(writeMask));
      this.host.stateCache.stencilOp(fail, depthFail, depthPass, () => this.host.gl.stencilOp(fail, depthFail, depthPass));
    } else {
      this.host.stateCache.setEnabled(this.host.gl.STENCIL_TEST, false, () => this.host.gl.disable(this.host.gl.STENCIL_TEST));
    }
    if (renderState.cullMode === "none") {
      this.host.stateCache.setEnabled(this.host.gl.CULL_FACE, false, () => this.host.gl.disable(this.host.gl.CULL_FACE));
    } else {
      this.host.stateCache.setEnabled(this.host.gl.CULL_FACE, true, () => this.host.gl.enable(this.host.gl.CULL_FACE));
      this.host.stateCache.cullFace(renderState.cullMode === "front" ? this.host.gl.FRONT : this.host.gl.BACK, () => this.host.gl.cullFace(renderState.cullMode === "front" ? this.host.gl.FRONT : this.host.gl.BACK));
    }
    if (renderState.blend) {
      this.host.stateCache.setEnabled(this.host.gl.BLEND, true, () => this.host.gl.enable(this.host.gl.BLEND));
      this.host.stateCache.blendFunc(this.host.gl.SRC_ALPHA, this.host.gl.ONE_MINUS_SRC_ALPHA, () => this.host.gl.blendFunc(this.host.gl.SRC_ALPHA, this.host.gl.ONE_MINUS_SRC_ALPHA));
    } else {
      this.host.stateCache.setEnabled(this.host.gl.BLEND, false, () => this.host.gl.disable(this.host.gl.BLEND));
    }
  }

  requireBuffer(buffer: RenderBuffer): WebGL2Buffer {
    if (!(buffer instanceof WebGL2Buffer) || !this.host.buffers.has(buffer) || buffer.disposed) {
      throw new RenderDeviceError("Buffer is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        bufferId: buffer.id
      });
    }
    return buffer;
  }

  stencilCompare(compare: NonNullable<DrawCommand["renderState"]>["stencil"] extends infer Stencil ? Stencil extends { readonly compare?: infer Compare } ? NonNullable<Compare> : never : never): GLenum {
    switch (compare) {
      case "never": return this.host.gl.NEVER;
      case "less": return this.host.gl.LESS;
      case "less-equal": return this.host.gl.LEQUAL;
      case "greater": return this.host.gl.GREATER;
      case "greater-equal": return this.host.gl.GEQUAL;
      case "equal": return this.host.gl.EQUAL;
      case "not-equal": return this.host.gl.NOTEQUAL;
      case "always": return this.host.gl.ALWAYS;
    }
  }

  stencilOperation(operation: NonNullable<DrawCommand["renderState"]>["stencil"] extends infer Stencil ? Stencil extends { readonly fail?: infer Operation } ? NonNullable<Operation> : never : never): GLenum {
    switch (operation) {
      case "keep": return this.host.gl.KEEP;
      case "zero": return this.host.gl.ZERO;
      case "replace": return this.host.gl.REPLACE;
      case "increment": return this.host.gl.INCR;
      case "decrement": return this.host.gl.DECR;
      case "invert": return this.host.gl.INVERT;
      case "increment-wrap": return this.host.gl.INCR_WRAP;
      case "decrement-wrap": return this.host.gl.DECR_WRAP;
    }
  }

  requireShader(shader: RenderShaderProgram): WebGL2ShaderProgram {
    if (!(shader instanceof WebGL2ShaderProgram) || !this.host.shaders.has(shader) || shader.disposed) {
      throw new RenderDeviceError("Shader is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        shaderId: shader.id
      });
    }
    return shader;
  }
  /**
   * C-28 (CONTRACTS.md §3.4) — instanced multi-draw seam. Identity fallback:
   * issues each entry through `draw` until PRD 11 batches it via
   * `WEBGL_multi_draw`.
   */
  multiDrawElementsInstanced(draws: readonly unknown[]): void {
    for (const draw of draws) {
      this.draw(draw as DrawCommand);
    }
  }

}
