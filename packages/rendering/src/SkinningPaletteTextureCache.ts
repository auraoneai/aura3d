/**
 * C-18 (PRD-06 T0.10): `SkinningPaletteTextureCache` — the real
 * `SkinningPaletteTextureCacheLike`.
 *
 * One RGBA32F palette texture pair ({current, previous}) per stable skin key —
 * `item.skinning.paletteKey`, the `GLTFAnimationRuntime` skinning-binding object
 * (PRD-06 §9.2). Palette writes go through `Texture.update()`, which keeps the
 * same `Texture` objects alive: `webgl2/TextureUpload.ts` observes the revision
 * bump and re-uploads with `texSubImage2D` instead of allocating a new WebGL
 * texture per draw (E21/E39).
 *
 * Frame model: `beginFrame()` advances the internal frame counter (used when no
 * C-28 `DeviceCounters` frame is threaded through) and rotates the previous
 * frame's keys — `swap(key)` moves that frame's `current` into `previous`.
 * `upload()` writes at most once per key per frame; later binds in the same
 * frame (forward, depth, velocity) reuse the uploaded texture.
 */

import { Sampler } from "./Sampler";
import { Texture } from "./Texture";
import { TextureBinding } from "./TextureBinding";
import type { RenderDevice } from "./RenderDevice";

function ceilToMultiple(value: number, multiple: number): number {
  return Math.ceil(value / multiple) * multiple;
}

export const SKINNING_PALETTE_TEXELS_PER_MATRIX = 4;
export const SKINNING_PALETTE_MAX_TEXTURE_WIDTH = 1024;

/** Contract C-18 shape (duplicated here so `contracts/deform.ts` stays the PR 0a surface). */
export interface SkinningPaletteTextureCacheLike {
  acquire(device: RenderDevice, key: object, jointCount: number): { readonly current: Texture; readonly previous: Texture };
  upload(key: object, matrices: Float32Array): void;
  swap(key: object): void;
  release(key: object): void;
  diagnostics(): { readonly textures: number; readonly bytes: number; readonly createdThisFrame: number };
}

interface MutablePaletteEntry {
  current: Texture;
  previous: Texture;
  currentData: Float32Array;
  previousData: Float32Array;
  jointCount: number;
  textureSize: [number, number];
  /** Shared sampler for every binding this key produces (E21). */
  sampler: Sampler;
  /** Bindings cached per texture object — survives `swap` without re-allocating (E21). */
  bindings: WeakMap<Texture, TextureBinding>;
  /** Cached zero-filled `u_jointMatrices` for shaders that still declare the array (E21). */
  zeroJointUniforms: Float32Array;
  uploadedFrame: number;
  /** Set once the first upload's matrices passed the finite scan (T0.10). */
  finiteValidated: boolean;
}

export class SkinningPaletteTextureCache implements SkinningPaletteTextureCacheLike {
  private readonly entries = new Map<object, MutablePaletteEntry>();
  private readonly keysUsedLastFrame = new Set<object>();
  private frameId = 0;
  private createdThisFrame = 0;

  /** Advance the frame counter; rotates the keys touched last frame into `previous`. */
  beginFrame(): void {
    this.frameId += 1;
    this.createdThisFrame = 0;
    for (const key of this.keysUsedLastFrame) {
      this.swap(key);
    }
    this.keysUsedLastFrame.clear();
  }

  /**
   * C-18 `acquire`: returns the key's texture pair, creating both on first use.
   * The device is unused — palette textures upload lazily through the texture
   * binding (`WebGL2TextureRegistry.getTextureHandle` honours `revision`).
   */
  acquire(_device: RenderDevice, key: object, jointCount: number): { readonly current: Texture; readonly previous: Texture } {
    const entry = this.entry(key, jointCount);
    this.keysUsedLastFrame.add(key);
    return { current: entry.current, previous: entry.previous };
  }

  /** Internal acquire for bind paths that never see a RenderDevice (forward/depth uniforms). */
  entry(key: object, jointCount: number): MutablePaletteEntry {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = this.createEntry(key, jointCount);
      this.entries.set(key, entry);
      this.createdThisFrame += 2;
    } else if (entry.jointCount !== jointCount) {
      throw new Error(`SKINNING_PALETTE_KEY_JOINT_COUNT_CHANGED:${jointCount} != ${entry.jointCount} — a palette key must keep its joint count`);
    }
    return entry;
  }

  /** C-18 `upload`: writes `matrices` into the persistent buffer and bumps the texture revision. */
  upload(key: object, matrices: Float32Array): void {
    const entry = this.entries.get(key);
    if (!entry) {
      throw new Error(`SKINNING_PALETTE_UPLOAD_BEFORE_ACQUIRE:${String(key)}`);
    }
    this.keysUsedLastFrame.add(key);
    if (entry.uploadedFrame === this.frameId) {
      return; // at most one palette upload per key per frame (§9.2)
    }
    if (matrices.length > entry.currentData.length) {
      throw new Error("Skinning palette does not fit the data texture");
    }
    entry.currentData.fill(0, matrices.length);
    entry.currentData.set(matrices);
    entry.current.update(entry.currentData);
    entry.uploadedFrame = this.frameId;
  }

  /** C-18 `swap`: current becomes previous. Called by the actor extension once per presented frame. */
  swap(key: object): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    const current = entry.current;
    const currentData = entry.currentData;
    entry.current = entry.previous;
    entry.previous = current;
    entry.currentData = entry.previousData;
    entry.previousData = currentData;
  }

  /** C-18 `release`: disposes both textures so `releaseDisposedTextureHandles` frees the GL handles. */
  release(key: object): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.current.dispose();
    entry.previous.dispose();
    this.entries.delete(key);
    this.keysUsedLastFrame.delete(key);
  }

  releaseAll(): void {
    for (const key of [...this.entries.keys()]) {
      this.release(key);
    }
  }

  diagnostics(): { readonly textures: number; readonly bytes: number; readonly createdThisFrame: number } {
    let bytes = 0;
    for (const entry of this.entries.values()) {
      bytes += entry.current.byteLength + entry.previous.byteLength;
    }
    return { textures: this.entries.size * 2, bytes, createdThisFrame: this.createdThisFrame };
  }

  /** Test/conformance seam: whether a key's current texture has live (non-disposed) data. */
  has(key: object): boolean {
    return this.entries.has(key);
  }

  /**
   * Bind-time texture access for the uniform paths: the current/previous pair,
   * texture dimensions, a reused `TextureBinding` per texture object, the shared
   * sampler and the cached zero joint uniform block. `markFiniteValidated`/`finiteValidated`
   * implement the once-per-key `isFiniteArrayLike` skip (T0.10).
   */
  paletteUniformSet(key: object, jointCount: number): {
    readonly current: Texture;
    readonly previous: Texture;
    readonly textureSize: readonly [number, number];
    readonly currentBinding: TextureBinding;
    readonly previousBinding: TextureBinding;
    readonly zeroJointUniforms: Float32Array;
    readonly finiteValidated: boolean;
    markFiniteValidated(): void;
  } {
    const entry = this.entry(key, jointCount);
    this.keysUsedLastFrame.add(key);
    return {
      current: entry.current,
      previous: entry.previous,
      textureSize: entry.textureSize,
      currentBinding: this.bindingFor(entry, entry.current),
      previousBinding: this.bindingFor(entry, entry.previous),
      zeroJointUniforms: entry.zeroJointUniforms,
      get finiteValidated() {
        return entry.finiteValidated;
      },
      markFiniteValidated() {
        entry.finiteValidated = true;
      }
    };
  }

  private bindingFor(entry: MutablePaletteEntry, texture: Texture): TextureBinding {
    let binding = entry.bindings.get(texture);
    if (!binding) {
      binding = new TextureBinding({ name: "u_jointPaletteTexture", texture, sampler: entry.sampler, required: true });
      entry.bindings.set(texture, binding);
    }
    return binding;
  }

  private createEntry(key: object, jointCount: number): MutablePaletteEntry {
    const texels = jointCount * SKINNING_PALETTE_TEXELS_PER_MATRIX;
    const width = Math.min(
      SKINNING_PALETTE_MAX_TEXTURE_WIDTH,
      Math.max(SKINNING_PALETTE_TEXELS_PER_MATRIX, ceilToMultiple(Math.ceil(Math.sqrt(texels)), SKINNING_PALETTE_TEXELS_PER_MATRIX))
    );
    const height = Math.ceil(texels / width);
    const capacity = width * height * 4;
    const sampler = new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });
    const makeTexture = (label: string) =>
      new Texture({
        width,
        height,
        format: "rgba32f",
        colorSpace: "linear",
        label,
        data: new Float32Array(capacity),
        dynamic: true
      });
    const current = makeTexture(`aura3d-skinning-palette-${jointCount}-current`);
    const previous = makeTexture(`aura3d-skinning-palette-${jointCount}-previous`);
    return {
      current,
      previous,
      currentData: new Float32Array(capacity),
      previousData: new Float32Array(capacity),
      jointCount,
      textureSize: [width, height],
      sampler,
      bindings: new WeakMap(),
      zeroJointUniforms: new Float32Array(96 * 16),
      uploadedFrame: -1,
      finiteValidated: false
    };
  }
}
