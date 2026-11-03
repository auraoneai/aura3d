/**
 * PRD 11 Phase 3 (§6.6 layer 3) — `DrawDataTexture` is the per-draw data
 * source the `a3d_prd11_draw_id` chunk fetches. Each draw occupies
 * `TEXELS_PER_DRAW` RGBA32F texels in a single-row texture:
 *
 *   [0..3]  model matrix columns 0..3 (mat4)
 *   [4]     base colour (linear RGBA; multiplies the shared material)
 *   [5]     meta — (firstIndex, baseVertex, indexCount, flags)
 *
 * `gl_DrawID` (with `WEBGL_multi_draw`) or the `u_drawId` uniform (loop
 * fallback) selects the row offset `drawIndex * TEXELS_PER_DRAW`.
 */

import { Texture, type TextureDescriptor } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import { Sampler } from "../Sampler";
import type { RenderDevice, UniformValue } from "../RenderDevice";
import type { ResourceRegistryRegistration } from "../contracts/rendererFactory";

export const DRAW_DATA_TEXELS_PER_DRAW = 6;

const drawDataBindings = new WeakMap<Texture, TextureBinding>();
const drawDataInstances = new WeakSet<object>();

/** Internal identity check; proxies and objects with a forged prototype are not instances. */
export function isDrawDataTexture(value: unknown): value is DrawDataTexture {
  return (typeof value === "object" && value !== null) && drawDataInstances.has(value);
}

/** One shared `u_a3dDrawData` binding per draw-data texture: multi-draw merging compares uniform values by identity. */
export function drawDataBindingFor(texture: Texture): TextureBinding {
  let binding = drawDataBindings.get(texture);
  if (!binding) drawDataBindings.set(texture, binding = new TextureBinding({ name: "u_a3dDrawData", texture, required: false,
    // RGBA32F remains complete without optional float-linear filtering.
    sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }) }));
  return binding;
}

/**
 * Meta texel `.w` bit layout (parity-L5 / SG-02): bit 0 = visible, bits 1+
 * = packed `PackedGeometryEntry.geometryId`. Shaders read
 * `(uint(meta.w + 0.5) & 1u) != 0u` for visibility and
 * `uint(meta.w + 0.5) >> 1` for the geometry id; values are stored as numeric
 * floats, and `baseVertex`/`firstIndex`/`indexCount` stay in `meta.xyz`.
 */
export const DRAW_DATA_VISIBLE_BIT = 1;
export const DRAW_DATA_GEOMETRY_ID_SHIFT = 1;

/** Pack `meta.w` for a draw row: bit 0 visible, upper bits the pooled geometry id. */
export function packDrawDataFlags(visible: boolean, geometryId = 0): number {
  return (visible ? DRAW_DATA_VISIBLE_BIT : 0) | (Math.max(0, geometryId | 0) << DRAW_DATA_GEOMETRY_ID_SHIFT);
}

/** Inverse of {@link packDrawDataFlags} (tests + shader-side verification). */
export function unpackDrawDataFlags(flags: number): { readonly visible: boolean; readonly geometryId: number } {
  const bits = flags >>> 0;
  return { visible: (bits & DRAW_DATA_VISIBLE_BIT) !== 0, geometryId: bits >>> DRAW_DATA_GEOMETRY_ID_SHIFT };
}

export interface DrawDataEntry {
  /** Column-major mat4. */
  readonly model: ArrayLike<number>;
  readonly baseColor?: ArrayLike<number>;
  /** Packed meta texel; defaults to firstIndex=baseVertex=indexCount=flags=0. */
  readonly meta?: ArrayLike<number>;
}

export class DrawDataTexture {
  private readonly data: Float32Array;
  private texture: Texture | null = null;
  private dirty = true;
  private restoreRegistered = false;
  private restoreRegistry: ResourceRegistryRegistration | null = null;
  private restoreHandle: object | null = null;
  private restoreToken: { active: boolean } | null = null;
  private readonly pendingUnregistrations = new Map<ResourceRegistryRegistration, Set<object>>();
  private readonly pendingTextures = new Set<Texture>();
  private registering = false;
  private disposing = false;

  constructor(readonly maxDraws: number) {
    if (!Number.isInteger(maxDraws) || maxDraws <= 0) {
      throw new RangeError("DrawDataTexture maxDraws must be a positive integer");
    }
    this.data = new Float32Array(maxDraws * DRAW_DATA_TEXELS_PER_DRAW * 4);
    drawDataInstances.add(this);
  }

  setDraw(drawIndex: number, entry: DrawDataEntry): void {
    this.assertMutable();
    if (drawIndex < 0 || drawIndex >= this.maxDraws) {
      throw new RangeError(`Draw index ${drawIndex} outside DrawDataTexture capacity ${this.maxDraws}`);
    }
    const base = drawIndex * DRAW_DATA_TEXELS_PER_DRAW * 4;
    for (let i = 0; i < 16; i += 1) this.data[base + i] = entry.model[i] ?? (i % 5 === 0 ? 1 : 0);
    const color = entry.baseColor;
    this.data[base + 16] = color?.[0] ?? 1;
    this.data[base + 17] = color?.[1] ?? 1;
    this.data[base + 18] = color?.[2] ?? 1;
    this.data[base + 19] = color?.[3] ?? 1;
    const meta = entry.meta;
    this.data[base + 20] = meta?.[0] ?? 0;
    this.data[base + 21] = meta?.[1] ?? 0;
    this.data[base + 22] = meta?.[2] ?? 0;
    this.data[base + 23] = meta?.[3] ?? 0;
    this.dirty = true;
  }

  /** Uniform snapshot for tests and the `u_drawId` loop path. */
  drawTexels(drawIndex: number): Float32Array {
    const base = drawIndex * DRAW_DATA_TEXELS_PER_DRAW * 4;
    return this.data.subarray(base, base + DRAW_DATA_TEXELS_PER_DRAW * 4);
  }

  descriptor(): TextureDescriptor {
    return {
      width: this.maxDraws * DRAW_DATA_TEXELS_PER_DRAW,
      height: 1,
      format: "rgba32f",
      colorSpace: "linear",
      label: "a3d-prd11-draw-data",
      data: this.data,
      dynamic: true, // rows rewrite per frame — `update()`-driven re-upload (L5)
      generateMipmaps: false // texelFetch uses level zero; no float-linear extension is required
    };
  }

  /**
   * Materializes once, then `update()`s in place on dirty rows — the returned
   * `Texture` object is STABLE across row rewrites (markers/uniforms hold it
   * by identity; the device re-uploads on `revision`).
  */
  upload(): Texture {
    this.assertMutable();
    if (!this.texture) {
      this.texture = new Texture(this.descriptor());
      this.dirty = false;
    } else if (this.dirty) {
      this.texture.update(this.data);
      this.dirty = false;
    }
    return this.texture;
  }

  private assertMutable(): void {
    if (this.disposing) throw new Error("DrawDataTexture cannot mutate during disposal");
    if (this.registering) throw new Error("DrawDataTexture cannot mutate during restore registration");
  }

  private unregisterRestoreHandle(registry: ResourceRegistryRegistration, handle: object): void {
    const pending = this.pendingUnregistrations.get(registry);
    const retrying = pending?.has(handle) === true;
    pending?.delete(handle);
    if (pending?.size === 0) this.pendingUnregistrations.delete(registry);
    try {
      const unregister = registry.unregister;
      if (unregister) unregister.call(registry, handle);
      else if (retrying) throw new Error("DrawDataTexture unregister retry is unavailable");
    } catch (error) {
      let handles = this.pendingUnregistrations.get(registry);
      if (!handles) this.pendingUnregistrations.set(registry, handles = new Set());
      handles.add(handle);
      throw error;
    }
  }

  /**
   * PRD 11 Phase 5 (§6.9): register with the C-29 `ResourceRegistry` once.
   * The CPU-side `data` array IS the retained source — the restore rebuild
   * marks the texture dirty and re-uploads it.
   */
  registerForRestore(registry: ResourceRegistryRegistration, device?: RenderDevice | (() => RenderDevice | undefined)): void {
    this.assertMutable();
    if (this.restoreRegistered) return;
    this.registering = true;
    try {
      // A pending old registration may still occupy this instance's key. A
      // fresh key prevents its eventual retry from removing the new callback.
      if (this.pendingUnregistrations.get(registry)?.has(this)) {
        try { this.unregisterRestoreHandle(registry, this); } catch { /* keep the old callback inert */ }
      }
      const handle = this.pendingUnregistrations.get(registry)?.has(this) ? {} : this;
      const token = { active: true };
      try {
        registry.register(handle, {
          kind: "a3d-prd11-draw-data",
          get device() { return typeof device === "function" ? device() : device; },
          rebuild: () => {
            if (!token.active) return;
            // Existing markers retain this Texture by identity. The device's
            // restore lifecycle invalidates native handles; refreshing the CPU
            // texture in place lets those markers bind the recreated resource.
            this.dirty = true;
            this.upload();
          }
        });
      } catch (error) {
        token.active = false;
        // A registry may throw after accepting the handle.
        try { this.unregisterRestoreHandle(registry, handle); } catch { /* preserve registration error */ }
        throw error;
      }
      this.restoreRegistry = registry;
      this.restoreRegistered = true;
      this.restoreHandle = handle;
      this.restoreToken = token;
    } finally {
      this.registering = false;
    }
  }

  /** `sampler2D` binding ready for `uniforms.set("u_a3dDrawData", ...)`. */
  asUniform(): UniformValue {
    return drawDataBindingFor(this.upload());
  }

  dispose(): void {
    if (this.disposing) return;
    if (this.registering) throw new Error("DrawDataTexture cannot dispose during restore registration");
    this.disposing = true;
    try {
      const registry = this.restoreRegistry;
      const handle = this.restoreHandle;
      if (this.restoreToken) this.restoreToken.active = false;
      this.restoreRegistry = null;
      this.restoreRegistered = false;
      this.restoreHandle = null;
      this.restoreToken = null;
      if (this.texture) this.pendingTextures.add(this.texture);
      this.texture = null;

      const unregisterWork = new Map<ResourceRegistryRegistration, Set<object>>();
      for (const [pendingRegistry, pendingHandles] of this.pendingUnregistrations) {
        unregisterWork.set(pendingRegistry, new Set(pendingHandles));
      }
      if (registry && handle) {
        const handles = unregisterWork.get(registry) ?? new Set<object>();
        handles.add(handle);
        unregisterWork.set(registry, handles);
      }
      const errors: unknown[] = [];
      for (const [pendingRegistry, handles] of unregisterWork) {
        for (const pendingHandle of handles) {
          try { this.unregisterRestoreHandle(pendingRegistry, pendingHandle); } catch (error) { errors.push(error); }
        }
      }
      for (const texture of [...this.pendingTextures]) {
        if (!this.pendingTextures.delete(texture) || texture.disposed) continue;
        try { texture.dispose(); } catch (error) {
          if (!texture.disposed) this.pendingTextures.add(texture);
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "DrawDataTexture disposal failed");
    } finally {
      this.disposing = false;
    }
  }
}
