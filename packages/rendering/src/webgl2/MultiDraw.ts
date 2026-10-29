// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts; 0 changed logic lines.

import { RenderDeviceError, type DrawCommand, type InstanceVertexAttribute, type RenderBuffer, type RenderShaderProgram } from "../RenderDevice";
import { resolveBlendMode } from "../contracts/blend";
import type { BlendEquation, BlendFactor } from "../contracts/blend";
import { isTextureBinding, type TextureBinding } from "../TextureBinding";
import type { VertexAttribute, VertexFormat } from "../VertexFormat";
import { WebGL2Buffer, WebGL2ShaderProgram } from "../WebGL2Device";
import type { WebGL2DeviceHost } from "./DeviceHost";

export interface WebGL2VertexArrayCacheEntry {
  readonly key: string;
  readonly handle: WebGLVertexArrayObject;
  readonly boundLocations: ReadonlySet<number>;
  /** Ids of the vertex, index and instance buffers this VAO references (the reverse of `bufferVaoIndex`, SI-6). */
  readonly bufferIds?: readonly number[];
}

/** `uniform1f` on an int/uint/bool uniform raises INVALID_OPERATION, so integer-typed scalars (source `int` or GL enum strings) bind through `uniform1i`/`uniform1ui`. */
function integerUniformKind(type: string | undefined): "int" | "uint" | undefined {
  if (type === "int" || type === "bool" || type === "5124" || type === "35670") return "int";
  if (type === "uint" || type === "5125") return "uint";
  return undefined;
}

export class WebGL2DrawCallBinder {
  constructor(readonly host: WebGL2DeviceHost) {
    // `gl_DrawID` (`#extension GL_ANGLE_multi_draw`) needs WEBGL_multi_draw enabled before the program links, so request it now.
    this.multiDrawExtension();
  }

  nextVertexFormatId = 1;

  uniformLocationCache = new WeakMap<WebGL2ShaderProgram, Map<string, WebGLUniformLocation | null>>();

  /**
   * PRD-01 Phase 6: per-program last-value uniform cache — skips the GL call
   * when the incoming value equals what was last uploaded for this program
   * (numbers by value, arrays element-wise vs a retained snapshot, texture
   * bindings by texture/sampler/transform identity).
   */
  private uniformValueCache = new WeakMap<WebGL2ShaderProgram, Map<string, unknown>>();

  readonly vertexArrayCache = new Map<string, WebGL2VertexArrayCacheEntry>();

  /** buffer id → VAO keys referencing it (PRD-01 Phase 6 §6.1 eviction index). */
  private readonly bufferVaoIndex = new Map<number, Set<string>>();

  readonly vertexFormatIds = new WeakMap<VertexFormat, number>();

  /** #180: `WEBGL_multi_draw`, queried lazily (`undefined` = not queried yet). */
  private multiDrawExt: WebGLMultiDrawExtension | null | undefined;

  /**
   * #94 (Q-01-1, C-29): drop every cache that holds a GL object name or a
   * value uploaded into the lost context, so VAOs, uniform locations and the
   * last-value uniform snapshots recreate lazily on the next draw after
   * `webglcontextrestored`. VAO handles are not deleted: they died with the
   * context. Buffers, textures and programs are rebuilt by the C-29
   * ResourceRegistry (they need CPU-side sources this binder does not own).
   */
  invalidateGpuObjects(): void {
    this.vertexArrayCache.clear();
    this.bufferVaoIndex.clear();
    this.uniformLocationCache = new WeakMap();
    this.uniformValueCache = new WeakMap();
    this.multiDrawExt = undefined;
    this.multiDrawExtension();
  }

  draw(command: DrawCommand): void {
    this.prepareDraw(command);
    this.issueDraw(command);
  }

  /** State, program, uniforms and vertex input for `command` (everything before the GL draw call). */
  private prepareDraw(command: DrawCommand): void {
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
    if (command.indexBuffer && (!shader || !command.vertexFormat)) {
      const indexBuffer = this.requireBuffer(command.indexBuffer);
      this.host.stateCache.bindBuffer(this.host.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle, () => this.host.gl.bindBuffer(this.host.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle));
    }
  }

  /** The GL draw call for a prepared `command`, plus counters and strict error check. */
  private issueDraw(command: DrawCommand): void {
    if (command.indexBuffer) {
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
    let valueCache = this.uniformValueCache.get(shader);
    if (!valueCache) {
      valueCache = new Map();
      this.uniformValueCache.set(shader, valueCache);
    }
    for (const [name, value] of uniforms) {
      if (!shader.reflection.uniforms.has(name)) {
        continue;
      }
      const location = this.getUniformLocation(shader, name);
      if (location === null) {
        // The name is declared in source (reflection) but the linked program
        // has no location for it — the driver optimised it out as inactive.
        // A location-less uniform has no storage, so binding is a no-op; treat
        // the reflected name as inactive rather than throwing (06-PARITY).
        this.host.counters.inactiveUniformBindCount += 1;
        continue;
      }
      if (isTextureBinding(value)) {
        textureUnit += 1;
        // #1142: no last-value skip for textures. The unit index is positional
        // (order of this material's texture uniforms), and other draws and
        // passes rebind units in between, so "same texture as the last upload
        // for this uniform" does not mean the unit still holds it: a skipped
        // upload samples whatever the unit holds now. Samplers.bindTextureForUnit
        // already dedups redundant binds per unit; uniform1i is cheap.
        // lane 06 Q-01-3: pass the declared uniform type so sampler2DArray
        // uniforms bind TEXTURE_2D_ARRAY units even when texture.dimension is absent.
        this.host.samplers.uploadTextureUniform(location, value, textureUnit - 1, shader.reflection.uniformDetails.get(name)?.type);
      } else if (typeof value === "number") {
        if (valueCache.get(name) === value) continue;
        const kind = integerUniformKind(shader.reflection.uniformDetails.get(name)?.type);
        if (kind === "uint") this.host.gl.uniform1ui(location, value);
        else if (kind === "int") this.host.gl.uniform1i(location, value);
        else this.host.gl.uniform1f(location, value);
        valueCache.set(name, value);
      } else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        const length = (value as ArrayLike<number>).length;
        const floatData = value as Float32List;
        // Last-value check against a retained snapshot: element-wise equal →
        // the previous upload still holds (skip the GL call).
        const lastArray = valueCache.get(name) as Float32Array | undefined;
        if (lastArray !== undefined && lastArray.length === length) {
          let same = true;
          for (let i = 0; i < length; i += 1) {
            if (lastArray[i] !== floatData[i]) {
              same = false;
              break;
            }
          }
          if (same) continue;
          for (let i = 0; i < length; i += 1) lastArray[i] = floatData[i];
        } else {
          valueCache.set(name, Float32Array.from(floatData as ArrayLike<number>));
        }
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
    const instanceBufferIds: number[] = [];
    if (command.instanceAttributes && command.instanceAttributes.length > 0) {
      for (const attribute of command.instanceAttributes) {
        instanceBufferIds.push(this.requireBuffer(attribute.buffer).id);
      }
      this.bindInstanceAttributes(shader, command.instanceAttributes, boundLocations);
    }
    if (indexBuffer) {
      this.host.stateCache.bindBuffer(this.host.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle, () => this.host.gl.bindBuffer(this.host.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle));
    }
    this.disableUnboundVertexAttributes(boundLocations);
    this.applyDefaultAttributes(shader, boundLocations);
    const bufferIds: number[] = [];
    for (const bufferId of [vertexBuffer.id, indexBuffer?.id, ...instanceBufferIds]) {
      if (bufferId !== undefined && !bufferIds.includes(bufferId)) bufferIds.push(bufferId);
    }
    const entry: WebGL2VertexArrayCacheEntry = { key, handle, boundLocations, bufferIds };
    this.vertexArrayCache.set(key, entry);
    for (const bufferId of bufferIds) {
      let keys = this.bufferVaoIndex.get(bufferId);
      if (!keys) {
        keys = new Set();
        this.bufferVaoIndex.set(bufferId, keys);
      }
      keys.add(key);
    }
    return entry;
  }

  /**
   * PRD-01 Phase 6 (CONTRACTS §6.1 declared leak fix): delete every cached VAO
   * that references `bufferId` — the key embeds vertex/index/instance buffer
   * ids, so the index is the authoritative reverse map. Called from
   * `WebGL2Buffer.dispose` before the GL buffer is deleted.
   */
  evictVertexArraysForBuffer(bufferId: number): number {
    const keys = this.bufferVaoIndex.get(bufferId);
    if (!keys) return 0;
    if (keys.size === 0) {
      this.bufferVaoIndex.delete(bufferId);
      return 0;
    }
    let evicted = 0;
    for (const key of keys) {
      const entry = this.vertexArrayCache.get(key);
      if (!entry) continue;
      this.vertexArrayCache.delete(key);
      evicted += 1;
      if (entry.handle) this.host.gl.deleteVertexArray(entry.handle);
      // SI-6: unlink the key from the index sets of the buffers this VAO actually references, not from every set in the map.
      if (entry.bufferIds) {
        for (const otherId of entry.bufferIds) {
          if (otherId === bufferId) continue;
          const set = this.bufferVaoIndex.get(otherId);
          if (!set) continue;
          set.delete(key);
          if (set.size === 0) this.bufferVaoIndex.delete(otherId);
        }
      } else {
        for (const set of this.bufferVaoIndex.values()) set.delete(key);
      }
    }
    // The disposed buffer's own index entry goes too. Per-frame instance buffers (dense shadow casters create and dispose one per
    // node per cascade per frame) would otherwise leave one empty Set per frame in this map for the life of the page, and the scan
    // above would walk all of them on every dispose.
    this.bufferVaoIndex.delete(bufferId);
    return evicted;
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
    const depthCompare = renderState.depthCompareV2 ?? renderState.depthCompare;
    const depthFuncEnum = this.depthCompareEnum(depthCompare);
    this.host.stateCache.depthFunc(depthFuncEnum, () => this.host.gl.depthFunc(depthFuncEnum));
    this.host.stateCache.setEnabled(this.host.gl.SAMPLE_ALPHA_TO_COVERAGE, renderState.alphaToCoverage === true, () => {
      if (renderState.alphaToCoverage === true) this.host.gl.enable(this.host.gl.SAMPLE_ALPHA_TO_COVERAGE);
      else this.host.gl.disable(this.host.gl.SAMPLE_ALPHA_TO_COVERAGE);
    });
    const colorWrite = renderState.colorWrite ?? [true, true, true, true] as const;
    this.host.stateCache.colorMask(colorWrite[0], colorWrite[1], colorWrite[2], colorWrite[3], () => this.host.gl.colorMask(colorWrite[0], colorWrite[1], colorWrite[2], colorWrite[3]));
    if (renderState.scissor) {
      this.host.stateCache.setEnabled(this.host.gl.SCISSOR_TEST, true, () => this.host.gl.enable(this.host.gl.SCISSOR_TEST));
      this.host.stateCache.scissor(renderState.scissor.x, renderState.scissor.y, renderState.scissor.width, renderState.scissor.height, () => {
        this.host.gl.scissor(renderState.scissor!.x, renderState.scissor!.y, renderState.scissor!.width, renderState.scissor!.height);
      });
    } else {
      // SC-01: a device-level scissor (ArrayCamera/StereoCamera views) stays in force for draws with no per-draw scissor.
      const deviceScissor = this.host.lifecycle.effectiveScissor();
      if (deviceScissor) {
        this.host.stateCache.setEnabled(this.host.gl.SCISSOR_TEST, true, () => this.host.gl.enable(this.host.gl.SCISSOR_TEST));
        this.host.stateCache.scissor(deviceScissor.x, deviceScissor.y, deviceScissor.width, deviceScissor.height, () => {
          this.host.gl.scissor(deviceScissor.x, deviceScissor.y, deviceScissor.width, deviceScissor.height);
        });
      } else {
        this.host.stateCache.setEnabled(this.host.gl.SCISSOR_TEST, false, () => this.host.gl.disable(this.host.gl.SCISSOR_TEST));
      }
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
    if (renderState.blendMode !== undefined) {
      // C-04 (§6.8): blendMode wins over `blend`; full factor/equation vocab.
      const resolved = resolveBlendMode(renderState);
      if (resolved === "opaque") {
        this.host.stateCache.setEnabled(this.host.gl.BLEND, false, () => this.host.gl.disable(this.host.gl.BLEND));
      } else {
        this.host.stateCache.setEnabled(this.host.gl.BLEND, true, () => this.host.gl.enable(this.host.gl.BLEND));
        const colorEq = this.blendEquationEnum(resolved.color.equation);
        const alphaEq = this.blendEquationEnum(resolved.alpha.equation);
        this.host.stateCache.blendEquation(colorEq, alphaEq, () => this.host.gl.blendEquationSeparate(colorEq, alphaEq));
        const sC = this.blendFactorEnum(resolved.color.src);
        const dC = this.blendFactorEnum(resolved.color.dst);
        const sA = this.blendFactorEnum(resolved.alpha.src);
        const dA = this.blendFactorEnum(resolved.alpha.dst);
        this.host.stateCache.blendFuncSeparate(sC, dC, sA, dA, () => this.host.gl.blendFuncSeparate(sC, dC, sA, dA));
      }
    } else if (renderState.blend) {
      this.host.stateCache.setEnabled(this.host.gl.BLEND, true, () => this.host.gl.enable(this.host.gl.BLEND));
      // C-04: restore FUNC_ADD only after a blendMode draw changed the equation;
      // a fresh context is already FUNC_ADD so nothing is emitted flag-off.
      if (this.host.stateCache.blendEquationDiffers(this.host.gl.FUNC_ADD, this.host.gl.FUNC_ADD)) {
        this.host.stateCache.blendEquation(this.host.gl.FUNC_ADD, this.host.gl.FUNC_ADD, () => this.host.gl.blendEquationSeparate(this.host.gl.FUNC_ADD, this.host.gl.FUNC_ADD));
      }
      this.host.stateCache.blendFunc(this.host.gl.SRC_ALPHA, this.host.gl.ONE_MINUS_SRC_ALPHA, () => this.host.gl.blendFunc(this.host.gl.SRC_ALPHA, this.host.gl.ONE_MINUS_SRC_ALPHA));
    } else {
      this.host.stateCache.setEnabled(this.host.gl.BLEND, false, () => this.host.gl.disable(this.host.gl.BLEND));
    }
  }

  depthCompareEnum(compare: string): GLenum {
    switch (compare) {
      case "never": return this.host.gl.NEVER;
      case "less": return this.host.gl.LESS;
      case "equal": return this.host.gl.EQUAL;
      case "less-equal": return this.host.gl.LEQUAL;
      case "greater": return this.host.gl.GREATER;
      case "not-equal": return this.host.gl.NOTEQUAL;
      case "greater-equal": return this.host.gl.GEQUAL;
      default: return this.host.gl.ALWAYS;
    }
  }

  blendEquationEnum(equation: BlendEquation): GLenum {
    switch (equation) {
      case "add": return this.host.gl.FUNC_ADD;
      case "subtract": return this.host.gl.FUNC_SUBTRACT;
      case "reverse-subtract": return this.host.gl.FUNC_REVERSE_SUBTRACT;
      case "min": return this.host.gl.MIN;
      case "max": return this.host.gl.MAX;
    }
  }

  blendFactorEnum(factor: BlendFactor): GLenum {
    switch (factor) {
      case "zero": return this.host.gl.ZERO;
      case "one": return this.host.gl.ONE;
      case "src-color": return this.host.gl.SRC_COLOR;
      case "one-minus-src-color": return this.host.gl.ONE_MINUS_SRC_COLOR;
      case "src-alpha": return this.host.gl.SRC_ALPHA;
      case "one-minus-src-alpha": return this.host.gl.ONE_MINUS_SRC_ALPHA;
      case "dst-color": return this.host.gl.DST_COLOR;
      case "one-minus-dst-color": return this.host.gl.ONE_MINUS_DST_COLOR;
      case "dst-alpha": return this.host.gl.DST_ALPHA;
      case "one-minus-dst-alpha": return this.host.gl.ONE_MINUS_DST_ALPHA;
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
   * C-28 (CONTRACTS.md §3.4) — instanced multi-draw (#180). When
   * `WEBGL_multi_draw` is present and every entry shares one program, vertex
   * input, index buffer, topology and render state (uniforms may differ only
   * in `u_drawId`, which a `gl_DrawID` program does not declare), the batch is
   * one `multiDrawElementsInstancedWEBGL` call. Otherwise each entry goes
   * through `draw` (the identity loop is the no-extension fallback).
   */
  multiDrawElementsInstanced(draws: readonly unknown[]): void {
    const commands = draws as readonly DrawCommand[];
    const ext = commands.length > 1 ? this.multiDrawExtension() : null;
    if (ext && canMultiDraw(commands)) {
      this.issueMultiDraw(ext, commands);
      return;
    }
    for (const command of commands) {
      this.draw(command);
    }
  }

  private multiDrawExtension(): WebGLMultiDrawExtension | null {
    if (this.multiDrawExt === undefined) {
      const gl = this.host.gl as WebGL2RenderingContext & { getExtension?: (name: string) => unknown };
      this.multiDrawExt = typeof gl?.getExtension === "function"
        ? (gl.getExtension("WEBGL_multi_draw") as WebGLMultiDrawExtension | null) ?? null
        : null;
    }
    return this.multiDrawExt;
  }

  private issueMultiDraw(ext: WebGLMultiDrawExtension, commands: readonly DrawCommand[]): void {
    const first = commands[0]!;
    this.prepareDraw(first);
    const count = commands.length;
    const counts = new Int32Array(count);
    const offsets = new Int32Array(count);
    const instances = new Int32Array(count);
    const indexByteSize = first.indexType === "uint32" ? 4 : 2;
    for (let index = 0; index < count; index += 1) {
      const command = commands[index]!;
      counts[index] = command.indexCount ?? 0;
      offsets[index] = (command.firstIndex ?? 0) * indexByteSize;
      instances[index] = Math.max(1, command.instanceCount ?? 1);
    }
    const type = first.indexType === "uint32" ? this.host.gl.UNSIGNED_INT : this.host.gl.UNSIGNED_SHORT;
    ext.multiDrawElementsInstancedWEBGL(this.primitive(first.topology), counts, 0, type, offsets, 0, instances, 0, count);
    this.host.counters.drawCalls += 1;
    this.host.counters.multiDrawSubmissions += 1;
    this.host.counters.multiDrawMembers += count;
    if (this.host.activeRenderTarget?.sampleCount && this.host.activeRenderTarget.sampleCount > 1) this.host.activeRenderTarget.needsResolve = true;
    if (this.host.errorCheckMode === "strict") {
      const drawError = this.host.lifecycle.readError();
      if (drawError) {
        throw new RenderDeviceError(`WebGL2 multi-draw failed for ${first.label ?? "unnamed"}: ${drawError}`, "WEBGL_DRAW_FAILED", {
          label: first.label,
          stage: "draw",
          error: drawError
        });
      }
    }
  }

}

/** The subset of `WEBGL_multi_draw` the binder issues. */
export interface WebGLMultiDrawExtension {
  multiDrawElementsInstancedWEBGL(
    mode: GLenum,
    counts: Int32Array, countsOffset: number,
    type: GLenum,
    offsets: Int32Array, offsetsOffset: number,
    instanceCounts: Int32Array, instanceCountsOffset: number,
    drawCount: number
  ): void;
}

/**
 * #180: entries can share one multi-draw call only when everything bound by
 * `prepareDraw(first)` is identical for all of them. A program that declares
 * `u_drawId` is the uniform-loop fallback and must be drawn one by one.
 */
export function canMultiDraw(commands: readonly DrawCommand[]): boolean {
  const first = commands[0];
  if (!first || !first.shader || !first.vertexFormat || !first.indexBuffer) return false;
  if (first.shader.reflection.uniforms.has("u_drawId")) return false;
  for (const command of commands) {
    if (
      command.shader !== first.shader ||
      command.vertexBuffer !== first.vertexBuffer ||
      command.vertexFormat !== first.vertexFormat ||
      command.indexBuffer !== first.indexBuffer ||
      command.indexType !== first.indexType ||
      command.topology !== first.topology ||
      !sameRenderState(command.renderState, first.renderState) ||
      command.instanceAttributes !== first.instanceAttributes ||
      !sameUniformsExceptDrawId(command.uniforms, first.uniforms)
    ) {
      return false;
    }
  }
  return true;
}

function sameRenderState(a: DrawCommand["renderState"], b: DrawCommand["renderState"]): boolean {
  return a === b || (a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b));
}

function sameUniformsExceptDrawId(a: DrawCommand["uniforms"], b: DrawCommand["uniforms"]): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const sizeA = a.size - (a.has("u_drawId") ? 1 : 0);
  const sizeB = b.size - (b.has("u_drawId") ? 1 : 0);
  if (sizeA !== sizeB) return false;
  for (const [name, value] of a) {
    if (name === "u_drawId") continue;
    if (!b.has(name)) return false;
    if (!uniformValueEqual(b.get(name), value)) return false;
  }
  return true;
}

/**
 * L5: one merged call binds `first`'s uniform set for every member — values
 * may only differ in `u_drawId` (which a `gl_DrawID` program replaces with
 * the hardware index). Array-likes compare element-wise so two commands
 * carrying identical CONTENT in different buffers still merge; every other
 * value compares by identity.
 */
function textureBindingsEqual(a: TextureBinding, b: TextureBinding): boolean {
  const sa = a.sampler, sb = b.sampler;
  return a.name === b.name && a.texture === b.texture && a.required === b.required && a.ready === b.ready && a.rotation === b.rotation
    && a.offset[0] === b.offset[0] && a.offset[1] === b.offset[1] && a.scale[0] === b.scale[0] && a.scale[1] === b.scale[1]
    && (sa === sb || (sa.minFilter === sb.minFilter && sa.magFilter === sb.magFilter && sa.addressU === sb.addressU && sa.addressV === sb.addressV
      && sa.addressW === sb.addressW && sa.maxAnisotropy === sb.maxAnisotropy && sa.compare === sb.compare && sa.mirror === sb.mirror));
}

function uniformValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" || typeof b === "number") return a === b;
  // Per-item bindings of the same texture and sampler state are interchangeable for one merged call.
  if (isTextureBinding(a) && isTextureBinding(b)) return textureBindingsEqual(a, b);
  const la = a as ArrayLike<number> | null;
  const lb = b as ArrayLike<number> | null;
  if (
    la !== null && lb !== null &&
    typeof la === "object" && typeof lb === "object" &&
    typeof la.length === "number" && typeof lb.length === "number" &&
    !(a instanceof Map)
  ) {
    if (la.length !== lb.length) return false;
    for (let i = 0; i < la.length; i += 1) {
      if (la[i] !== lb[i]) return false;
    }
    return true;
  }
  return false;
}
