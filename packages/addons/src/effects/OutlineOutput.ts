import {
  DEFAULT_INSTANCED_PBR_SHADER_NAME, DEFAULT_INSTANCED_UNLIT_SHADER_NAME,
  DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME, DEFAULT_PBR_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_UNLIT_SHADER_NAME,
  DEFAULT_UNLIT_SHADER_NAME, Geometry, IndexBuffer,
  UnlitMaterial, VertexBuffer, VertexFormat, isTextureBinding,
  type CameraLike, type MaterialInstance, type RenderItem, type Renderer
} from "@aura3d/rendering";

export interface OutlineOutputOptions {
  /** Normal extrusion distance in the object's local units. */
  readonly width?: number;
  readonly color?: readonly [number, number, number] | readonly [number, number, number, number];
  readonly opacity?: number;
  /**
   * The default rejects alpha cutouts, alpha-to-coverage, textured or vertex/
   * instance alpha on blended materials, unknown shaders or variants, custom
   * instance attributes, and scissor/stencil/color-write masks. An untextured
   * hull cannot reproduce these silhouettes. "geometry" explicitly opts into
   * that approximation (including unknown shader deformation and masks).
   * Uniform base-color alpha of blended materials is multiplied by outline
   * opacity in either mode. Opaque materials ignore their base-color alpha.
   */
  readonly alphaMode?: "strict" | "geometry";
  readonly maxVertices?: number;
  readonly maxIndices?: number;
  readonly maxItems?: number;
}

interface OwnedOutline { readonly geometry: Geometry; readonly material: UnlitMaterial; }

// These built-in shaders expose the standard base color/alpha contract. An
// arbitrary shader may discard fragments or deform vertices without declaring
// either through the material's ordinary alpha parameters.
const KNOWN_OUTLINE_SHADERS = new Set([
  DEFAULT_UNLIT_SHADER_NAME, DEFAULT_PBR_SHADER_NAME,
  DEFAULT_INSTANCED_UNLIT_SHADER_NAME, DEFAULT_INSTANCED_PBR_SHADER_NAME,
  DEFAULT_TEXTURED_UNLIT_SHADER_NAME, DEFAULT_TEXTURED_PBR_SHADER_NAME,
  DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME
]);

/**
 * Inverted-hull, object-space outlines for triangle RenderItems. Each call to
 * items() snapshots positions and normals, expanding them in local space and
 * making a front-face-culled unlit shell. Submit both the original items and
 * the shells (or call render()). Width changes with object transform and
 * perspective; this is not a constant-pixel screen-space outline.
 *
 * Static and instanced geometry is supported. Skinning and morphing are
 * rejected because CPU snapshots cannot follow GPU deformations. The caller
 * owns the source geometry/materials; the output owns its generated buffers
 * and materials, replacing them on the next items() call or dispose().
 */
export class OutlineOutput {
  private readonly width: number;
  private readonly color: readonly [number, number, number, number];
  private readonly opacity: number;
  private readonly alphaMode: "strict" | "geometry";
  private readonly maxVertices: number;
  private readonly maxIndices: number;
  private readonly maxItems: number;
  private owned: OwnedOutline[] = [];
  private readonly retiring = new Set<Geometry | UnlitMaterial | VertexBuffer>();
  private readonly disposalInFlight = new Set<Geometry | UnlitMaterial | VertexBuffer>();
  private disposed = false;
  private building = false;

  constructor(options: OutlineOutputOptions = {}) {
    this.width = options.width ?? 0.03;
    this.opacity = options.opacity ?? 1;
    this.alphaMode = options.alphaMode ?? "strict";
    this.maxVertices = options.maxVertices ?? 1_000_000;
    this.maxIndices = options.maxIndices ?? 3_000_000;
    this.maxItems = options.maxItems ?? 16_384;
    const color = options.color ?? [0, 0, 0, 1];
    if (!Number.isFinite(this.width) || this.width < 0) throw new RangeError("Outline width must be finite and non-negative");
    if (!Number.isFinite(this.opacity) || this.opacity < 0 || this.opacity > 1) throw new RangeError("Outline opacity must be in [0, 1]");
    if (color.length < 3 || color.length > 4 || color.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) throw new RangeError("Outline color must contain three or four values in [0, 1]");
    if (this.alphaMode !== "strict" && this.alphaMode !== "geometry") throw new RangeError("Invalid outline alphaMode");
    if (!Number.isSafeInteger(this.maxVertices) || this.maxVertices < 1 || this.maxVertices > 1_000_000) throw new RangeError("Outline maxVertices must be in [1, 1000000]");
    if (!Number.isSafeInteger(this.maxIndices) || this.maxIndices < 1 || this.maxIndices > 3_000_000) throw new RangeError("Outline maxIndices must be in [1, 3000000]");
    if (!Number.isSafeInteger(this.maxItems) || this.maxItems < 1 || this.maxItems > 16_384) throw new RangeError("Outline maxItems must be in [1, 16384]");
    this.color = [color[0], color[1], color[2], color[3] ?? 1];
  }

  /** Returned shell resources stay live until the next items() call or disposal. */
  items(source: Iterable<RenderItem>): readonly RenderItem[] {
    this.assertAlive();
    if (this.building) throw new Error("Outline output is already building items");
    this.building = true;
    try {
      return this.buildItems(source);
    } finally {
      this.building = false;
    }
  }

  private buildItems(source: Iterable<RenderItem>): readonly RenderItem[] {
    this.cleanupRetired();
    const allocated: OwnedOutline[] = [];
    const result: RenderItem[] = [];
    let count = 0;
    let indices = 0;
    let itemCount = 0;
    try {
      for (const item of source) {
        this.assertAlive();
        itemCount += 1;
        if (itemCount > this.maxItems) throw new RangeError("Outline item budget exceeded");
        const alpha = materialAlpha(item, this.alphaMode) * this.opacity * this.color[3];
        if (alpha === 0 || this.width === 0) continue;
        const geometry = item.geometry;
        if (geometry.topology !== "triangles") throw new Error("Object-space outlines require triangle geometry");
        if (item.skinning || (item.morphTargets?.length ?? 0) > 0 || (item.morphWeights?.length ?? 0) > 0 || (geometry.morphTargets?.length ?? 0) > 0) throw new Error("Object-space outlines do not support skinned or morphed geometry");
        const vertices = geometry.vertexBuffer;
        if (!vertices.format.hasAttribute("normal")) throw new Error("Object-space outlines require vertex normals");
        const normalSlot = vertices.format.getAttribute("normal").bufferSlot;
        if (vertices.format.streams.find((stream) => stream.slot === normalSlot)?.stepMode !== "vertex") {
          throw new Error("Object-space outlines require per-vertex normals");
        }
        const positions = geometry.getAttributeBuffer("position");
        const normals = geometry.getAttributeBuffer("normal");
        count += vertices.vertexCount;
        if (count > this.maxVertices) throw new RangeError("Outline vertex budget exceeded");
        indices += geometry.indexBuffer?.count ?? 0;
        if (indices > this.maxIndices) throw new RangeError("Outline index budget exceeded");
        const expanded = new VertexBuffer(VertexFormat.P3, vertices.vertexCount);
        let shell: Geometry | undefined;
        let material: UnlitMaterial | undefined;
        try {
          for (let index = 0; index < vertices.vertexCount; index += 1) {
            const position = positions.getDecodedAttribute(index, "position");
            const normal = normals.getDecodedAttribute(index, "normal");
            const length = Math.hypot(normal[0]!, normal[1]!, normal[2]!);
            if (!Number.isFinite(length) || length < 1e-12) throw new Error(`Outline vertex ${index} has a zero or non-finite normal`);
            expanded.setAttribute(index, "position", [position[0]! + this.width * normal[0]! / length, position[1]! + this.width * normal[1]! / length, position[2]! + this.width * normal[2]! / length]);
          }
          shell = new Geometry(expanded, geometry.indexBuffer ? new IndexBuffer(geometry.indexBuffer.data, vertices.vertexCount) : null);
          shell.drawRange = geometry.drawRange;
          shell.groups = geometry.groups;
          material = new UnlitMaterial({ color: [this.color[0], this.color[1], this.color[2], alpha], renderState: { cullMode: "front", depthTest: true, depthWrite: alpha >= 1, blend: alpha < 1 } });
          allocated.push({ geometry: shell, material });
        } catch (error) {
          this.retiring.add(shell ?? expanded);
          if (material) this.retiring.add(material);
          throw this.cleanupAfterFailure(error);
        }
        result.push({
          geometry: shell,
          material,
          label: item.label ? `${item.label}:outline` : "outline",
          drawRange: item.drawRange,
          modelMatrix: item.modelMatrix,
          geometryMatrix: item.geometryMatrix,
          modelViewProjectionMatrix: item.modelViewProjectionMatrix,
          instanceTransforms: item.instanceTransforms,
          renderOrder: item.renderOrder,
          layerMask: item.layerMask,
          frustumCulled: item.frustumCulled,
          castShadow: false,
          receiveShadow: false,
          includeInAutoFrame: false
        });
      }
      this.assertAlive();
    } catch (error) {
      this.retireOwned(allocated);
      throw this.cleanupAfterFailure(error);
    }
    this.retireOwned(this.owned);
    this.owned = [];
    try {
      this.cleanupRetired();
      this.assertAlive();
    } catch (error) {
      this.retireOwned(allocated);
      throw this.cleanupAfterFailure(error);
    }
    this.owned = allocated;
    return result;
  }

  /** Render the source and its shells in a single ordinary renderer frame. */
  render(renderer: Pick<Renderer, "render">, source: Iterable<RenderItem>, camera?: CameraLike): ReturnType<Renderer["render"]> {
    this.assertAlive();
    const originals: RenderItem[] = [];
    for (const item of source) {
      if (originals.length >= this.maxItems) throw new RangeError("Outline item budget exceeded");
      originals.push(item);
    }
    return renderer.render([...originals, ...this.items(originals)], camera);
  }

  dispose(): void {
    if (!this.disposed) {
      this.disposed = true;
      this.retireOwned(this.owned);
      this.owned = [];
    }
    this.cleanupRetired();
  }

  private retireOwned(items: readonly OwnedOutline[]): void {
    for (const item of items) {
      this.retiring.add(item.geometry);
      this.retiring.add(item.material);
    }
  }

  private cleanupRetired(): void {
    const errors: unknown[] = [];
    for (const resource of [...this.retiring]) {
      if (this.disposalInFlight.has(resource)) continue;
      this.disposalInFlight.add(resource);
      try {
        if (!resource.disposed) resource.dispose();
        if (!resource.disposed) throw new Error("Outline resource disposal did not complete");
      } catch (error) {
        errors.push(error);
      } finally {
        if (resource.disposed) this.retiring.delete(resource);
        this.disposalInFlight.delete(resource);
      }
    }
    if (errors.length) throw new AggregateError(errors, "Outline resource cleanup failed");
  }

  private cleanupAfterFailure(error: unknown): unknown {
    try {
      this.cleanupRetired();
      return error;
    } catch (cleanup) {
      return new AggregateError([error, cleanup], "Outline operation and cleanup failed");
    }
  }
  private assertAlive(): void { if (this.disposed) throw new Error("Outline output is disposed"); }
}

function materialAlpha(item: RenderItem, mode: "strict" | "geometry"): number {
  if (mode === "strict" && item.instanceAttributes?.length) {
    throw new Error("Outline cannot reproduce source scissor, stencil, color-write masks or custom instance attributes; use alphaMode: geometry for an approximate silhouette");
  }
  const material = item.material;
  if (!material) return 1;
  // Package consumers may provide a MaterialInstance from another copy of the
  // rendering package, where a local instanceof check would not recognize it.
  const base = "baseMaterial" in material ? (material as MaterialInstance).baseMaterial : material;
  if (base.disposed) throw new Error("Cannot outline a disposed material");
  if (mode === "strict" && (!KNOWN_OUTLINE_SHADERS.has(base.shaderKey) || base.shaderVariant !== undefined)) {
    throw new Error("Outline cannot determine custom shader alpha or deformation; use alphaMode: geometry for an approximate silhouette");
  }
  const state = base.renderState;
  if (mode === "strict" && (state.scissor || state.stencil || state.colorWrite.some((enabled) => !enabled))) {
    throw new Error("Outline cannot reproduce source scissor, stencil, color-write masks or custom instance attributes; use alphaMode: geometry for an approximate silhouette");
  }
  const cutoff = material.getParameter("u_alphaCutoff");
  if (typeof cutoff === "number" && (!Number.isFinite(cutoff) || cutoff < 0 || cutoff > 1)) throw new RangeError("Source material alpha cutoff must be in [0, 1]");
  // Named blendMode has precedence over the legacy blend boolean.
  const isBlend = state.blendMode === undefined ? state.blend : state.blendMode !== "opaque";
  const binding = material.getParameter("u_baseColorTexture");
  // Some generated shader paths sample a bound map regardless of the legacy
  // texture-enabled uniform, so a present map must be treated conservatively.
  const texturedAlpha = isBlend && isTextureBinding(binding) && binding.texture !== null;
  const format = item.geometry.vertexBuffer.format;
  const vertexAlpha = isBlend && base.requiredAttributes.includes("a_color") && format.hasAttribute("color") && format.getAttribute("color").components === 4;
  const instanceAlpha = isBlend && item.instanceTransforms !== undefined && item.instanceColors !== undefined;
  if (mode === "strict" && ((typeof cutoff === "number" && cutoff > 0) || state.alphaToCoverage || texturedAlpha || vertexAlpha || instanceAlpha)) {
    throw new Error("Outline alpha cutouts, coverage, or per-pixel/instance alpha require alphaMode: geometry for an approximate silhouette");
  }
  const factor = material.getParameter("u_baseColor");
  if (!isBlend || !(Array.isArray(factor) || ArrayBuffer.isView(factor))) return 1;
  if ((factor as ArrayLike<number>).length !== 4) throw new RangeError("Source material base color must contain four channels");
  const alpha = (factor as ArrayLike<number>)[3]!;
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new RangeError("Source material alpha must be in [0, 1]");
  return alpha;
}
