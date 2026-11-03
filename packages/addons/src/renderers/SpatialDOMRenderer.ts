/** A top-left-origin rectangle in CSS pixels. */
export interface SpatialDOMViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A world-anchored DOM element. Matrix values are column-major and use the
 * same world coordinates as the view-projection matrix. A function allows an
 * animated scene transform to be sampled anew on each render.
 */
export interface SpatialDOMLabel {
  readonly id: string;
  readonly element: HTMLElement;
  readonly worldMatrix: ArrayLike<number> | (() => ArrayLike<number>);
  /** Screen-aligned pixels, or an oriented world-space plane. Default `screen`. */
  readonly mode?: "screen" | "perspective";
  readonly visible?: boolean;
  /** Receive DOM pointer events instead of passing them through to the canvas. */
  readonly interactive?: boolean;
  readonly ariaLabel?: string;
  /** Explicit layering overrides the normal far-to-near ordering. */
  readonly renderOrder?: number;
  /** World units represented by one CSS pixel on a perspective label; default 0.01. */
  readonly worldUnitsPerPixel?: number;
}

export interface SpatialDOMView {
  readonly viewProjectionMatrix: ArrayLike<number>;
  /** Rectangle within the renderer's dimensions; default is the whole surface. */
  readonly viewport?: SpatialDOMViewport;
  /** NDC depth convention. Defaults to `minus-one-to-one`. */
  readonly depthRange?: "minus-one-to-one" | "zero-to-one";
  /** Reverse the depth sort when the projection maps the near plane to larger NDC values. */
  readonly depthOrder?: "standard" | "reversed";
}

export type SpatialDOMOcclusionTest = (
  label: SpatialDOMLabel,
  worldAnchor: readonly [number, number, number]
) => boolean;

export interface SpatialDOMRendererOptions {
  readonly container: HTMLElement;
  readonly width: number;
  readonly height: number;
  /** Optional caller-owned anchor test. No depth-buffer query is performed. */
  readonly isOccluded?: SpatialDOMOcclusionTest;
}

type StyleProperty = "position" | "left" | "top" | "transform" | "transform-origin" | "z-index" | "display" | "pointer-events";
const OWNED_STYLES: readonly StyleProperty[] = ["position", "left", "top", "transform", "transform-origin", "z-index", "display", "pointer-events"];

interface ManagedLabel {
  readonly element: HTMLElement;
  readonly parent: Node | null;
  readonly nextSibling: Node | null;
  /** A stable insertion point preserves sibling order even if labels are restored separately. */
  readonly marker: Comment | null;
  readonly styles: ReadonlyMap<StyleProperty, readonly [string, string]>;
  readonly ariaHidden: string | null;
  readonly ariaLabel: string | null;
}

interface PreparedLabel {
  readonly label: SpatialDOMLabel;
  readonly depth: number;
  readonly shown: boolean;
  readonly transform: string;
}

// A borrowed element must have exactly one renderer owner. Otherwise a second
// renderer can capture the first renderer's temporary state as its "original"
// state and each renderer will steal the element back from the other on dispose.
const LABEL_OWNERS = new WeakMap<HTMLElement, SpatialDOMRenderer>();
const OUTPUT_LAYERS = new WeakSet<HTMLElement>();

/**
 * Opt-in DOM output. Mount the container over the canvas (its positioning is
 * owned by the caller), then render once per view/frame. The overlay itself
 * clips to the supplied viewport. Its labels preserve their DOM semantics;
 * off-frustum, occluded and explicitly hidden labels leave the accessibility
 * tree. No GPU depth buffer is sampled: the optional callback tests the world
 * anchor only, and does not imply per-pixel occlusion of a label. Frustum
 * visibility is also determined from the anchor; viewport overflow clips the
 * element rectangle but geometry and near/far planes do not clip it per pixel.
 * Perspective planes that collapse or face exactly edge-on are hidden.
 *
 * Pointer events pass through by default. An interactive element receives
 * normal DOM events and those events are not forwarded to the canvas. Remove
 * or dispose restores each element's original parent, styles and ARIA fields.
 * A borrowed element cannot be managed by another renderer until it is removed
 * from this renderer or this renderer is disposed.
 */
export class SpatialDOMRenderer {
  readonly element: HTMLDivElement;
  private readonly managed = new Map<string, ManagedLabel>();
  private readonly occlusionTest?: SpatialDOMOcclusionTest;
  private width: number;
  private height: number;
  private disposed = false;

  constructor(options: SpatialDOMRendererOptions) {
    this.width = positive(options.width, "width");
    this.height = positive(options.height, "height");
    this.occlusionTest = options.isOccluded;
    this.element = options.container.ownerDocument.createElement("div");
    this.element.setAttribute("data-aura-spatial-labels", "");
    this.element.setAttribute("aria-live", "off");
    Object.assign(this.element.style, { position: "absolute", overflow: "hidden", pointerEvents: "none" });
    options.container.appendChild(this.element);
    OUTPUT_LAYERS.add(this.element);
    this.setViewport({ x: 0, y: 0, width: this.width, height: this.height });
  }

  setSize(width: number, height: number): void {
    this.assertAlive();
    const nextWidth = positive(width, "width");
    const nextHeight = positive(height, "height");
    this.width = nextWidth;
    this.height = nextHeight;
    this.setViewport({ x: 0, y: 0, width: this.width, height: this.height });
  }

  render(labels: readonly SpatialDOMLabel[], view: SpatialDOMView): void {
    this.assertAlive();
    const projection = matrix(view.viewProjectionMatrix, "viewProjectionMatrix");
    const viewport = view.viewport ?? { x: 0, y: 0, width: this.width, height: this.height };
    validateViewport(viewport, this.width, this.height);
    const depthRange = view.depthRange ?? "minus-one-to-one";
    if (depthRange !== "minus-one-to-one" && depthRange !== "zero-to-one") throw new RangeError("Unknown spatial DOM depth range.");
    const depthOrder = view.depthOrder ?? "standard";
    if (depthOrder !== "standard" && depthOrder !== "reversed") throw new RangeError("Unknown spatial DOM depth order.");

    const elementsById = new Map<string, HTMLElement>();
    const elements = new Set<HTMLElement>();
    const prepared = labels.map((label): PreparedLabel => {
      if (!label.id || elementsById.has(label.id)) throw new Error(`Spatial DOM label id must be nonempty and unique: ${label.id}`);
      if (elements.has(label.element)) throw new Error("A DOM element cannot belong to multiple spatial labels.");
      if (OUTPUT_LAYERS.has(label.element) || label.element.contains(this.element)) throw new Error("A spatial label cannot be or contain its output layer.");
      const owner = LABEL_OWNERS.get(label.element);
      if (owner && owner !== this) throw new Error("A DOM element is already managed by another SpatialDOMRenderer.");
      elementsById.set(label.id, label.element);
      elements.add(label.element);
      if (label.mode !== undefined && label.mode !== "screen" && label.mode !== "perspective") throw new RangeError("Unknown spatial DOM label mode.");
      if (label.renderOrder !== undefined && !Number.isFinite(label.renderOrder)) throw new RangeError("Label renderOrder must be finite.");
      const scale = positive(label.worldUnitsPerPixel ?? 0.01, "worldUnitsPerPixel");
      const world = matrix(typeof label.worldMatrix === "function" ? label.worldMatrix() : label.worldMatrix, "worldMatrix");
      if (world[3] !== 0 || world[7] !== 0 || world[11] !== 0 || world[15] !== 1) throw new RangeError("A label worldMatrix must be affine.");
      const combined = multiply(projection, world);
      if (!combined.every(Number.isFinite)) throw new RangeError("Spatial label transformation overflowed.");
      const x = combined[12], y = combined[13], z = combined[14], w = combined[15];
      const inFrustum = w > 0 && Math.abs(x) <= w && Math.abs(y) <= w && z <= w && z >= (depthRange === "zero-to-one" ? 0 : -w);
      let shown = label.visible !== false && inFrustum && !(this.occlusionTest?.(label, [world[12], world[13], world[14]]) ?? false);
      const depth = w > 0 ? z / w : Number.POSITIVE_INFINITY;
      let transform = "none";
      if (shown && label.mode === "perspective") {
        const perspective = perspectiveTransform(combined, viewport.width, viewport.height, scale);
        if (perspective === null) shown = false;
        else transform = perspective;
      } else if (shown) {
        transform = `translate3d(${(x / w * 0.5 + 0.5) * viewport.width}px, ${(0.5 - y / w * 0.5) * viewport.height}px, 0) translate(-50%, -50%)`;
      }
      return { label, depth, shown, transform };
    });

    // Validate the full input before moving elements or changing the layer.
    // Callbacks above are caller code and may have disposed this renderer or
    // synchronously lent an element to another renderer while being sampled.
    this.assertAlive();
    for (const { label } of prepared) {
      const owner = LABEL_OWNERS.get(label.element);
      if (owner && owner !== this) throw new Error("A DOM element is already managed by another SpatialDOMRenderer.");
    }
    for (const [id, current] of this.managed) {
      if (elementsById.get(id) !== current.element) {
        restore(current);
        LABEL_OWNERS.delete(current.element);
        this.managed.delete(id);
      }
    }
    this.setViewport(viewport);
    const ordered = [...prepared].sort((a, b) => (a.label.renderOrder ?? 0) - (b.label.renderOrder ?? 0) || (depthOrder === "reversed" ? a.depth - b.depth : b.depth - a.depth) || (a.label.id < b.label.id ? -1 : a.label.id > b.label.id ? 1 : 0));
    ordered.forEach(({ label, depth: _depth, shown, transform }, index) => {
      let current = this.managed.get(label.id);
      if (!current) {
        current = capture(label.element);
        this.managed.set(label.id, current);
        LABEL_OWNERS.set(label.element, this);
      }
      if (label.element.parentNode !== this.element) this.element.appendChild(label.element);
      const style = label.element.style;
      style.position = "absolute";
      style.left = "0";
      style.top = "0";
      style.transformOrigin = "0 0";
      style.transform = transform;
      style.zIndex = String(index + 1);
      style.pointerEvents = label.interactive === true ? "auto" : "none";
      style.display = shown ? current.styles.get("display")![0] : "none";
      setAttribute(label.element, "aria-hidden", shown ? current.ariaHidden : "true");
      setAttribute(label.element, "aria-label", label.ariaLabel ?? current.ariaLabel);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const label of this.managed.values()) {
      restore(label);
      LABEL_OWNERS.delete(label.element);
    }
    this.managed.clear();
    this.element.remove();
    OUTPUT_LAYERS.delete(this.element);
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("SpatialDOMRenderer is disposed.");
  }

  private setViewport(viewport: SpatialDOMViewport): void {
    Object.assign(this.element.style, { left: `${viewport.x}px`, top: `${viewport.y}px`, width: `${viewport.width}px`, height: `${viewport.height}px` });
  }
}

function capture(element: HTMLElement): ManagedLabel {
  const parent = element.parentNode;
  const nextSibling = element.nextSibling;
  const marker = parent ? element.ownerDocument.createComment("aura-spatial-label") : null;
  if (parent && marker) parent.insertBefore(marker, element);
  return {
    element,
    parent,
    nextSibling,
    marker,
    styles: new Map(OWNED_STYLES.map((property) => [property, [element.style.getPropertyValue(property), element.style.getPropertyPriority(property)] as const])),
    ariaHidden: element.getAttribute("aria-hidden"),
    ariaLabel: element.getAttribute("aria-label")
  };
}

function restore(label: ManagedLabel): void {
  for (const [property, [value, priority]] of label.styles) {
    if (value) label.element.style.setProperty(property, value, priority);
    else label.element.style.removeProperty(property);
  }
  setAttribute(label.element, "aria-hidden", label.ariaHidden);
  setAttribute(label.element, "aria-label", label.ariaLabel);
  if (label.marker?.parentNode) {
    label.marker.parentNode.insertBefore(label.element, label.marker);
    label.marker.parentNode.removeChild(label.marker);
  } else if (label.parent) {
    label.parent.insertBefore(label.element, label.nextSibling?.parentNode === label.parent ? label.nextSibling : null);
  } else label.element.remove();
}

function setAttribute(element: HTMLElement, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite.`);
  return value;
}

function validateViewport(viewport: SpatialDOMViewport, width: number, height: number): void {
  if (![viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite) || viewport.x < 0 || viewport.y < 0 || viewport.width <= 0 || viewport.height <= 0 || viewport.x + viewport.width > width || viewport.y + viewport.height > height) {
    throw new RangeError("Spatial DOM viewport must fit within the renderer size.");
  }
}

function matrix(value: ArrayLike<number>, name: string): number[] {
  if (value.length !== 16) throw new RangeError(`${name} must contain 16 column-major values.`);
  const result = Array.from(value);
  if (!result.every(Number.isFinite)) throw new RangeError(`${name} must contain finite values.`);
  return result;
}

function multiply(a: readonly number[], b: readonly number[]): number[] {
  const result = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) result[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return result;
}

function perspectiveTransform(clip: readonly number[], width: number, height: number, scale: number): string | null {
  const css = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    // DOM's downward Y axis is the opposite of the label plane's upward Y.
    const factor = col === 0 || col === 2 ? scale : col === 1 ? -scale : 1;
    const x = clip[col * 4] * factor, y = clip[col * 4 + 1] * factor, w = clip[col * 4 + 3] * factor;
    css[col * 4] = (x + w) * width / 2;
    css[col * 4 + 1] = (w - y) * height / 2;
    css[col * 4 + 2] = clip[col * 4 + 2] * factor;
    css[col * 4 + 3] = w;
  }
  if (!css.every(Number.isFinite)) throw new RangeError("Spatial label CSS transform overflowed.");
  if (!invertible(css)) {
    // HTML content lies in the local XY plane, so replacing only the Z input
    // column leaves every point on that plane unchanged. This preserves flat
    // labels under a zero-depth world scale; CSS otherwise discards the entire
    // element for a singular 4x4 matrix even when its plane can be projected.
    css[8] = 0;
    css[9] = 0;
    css[10] = 1;
    css[11] = 0;
    if (!invertible(css)) return null; // The plane itself is edge-on or collapsed.
  }
  return `matrix3d(${css.join(",")}) translate(-50%, -50%)`;
}

function invertible(value: readonly number[]): boolean {
  const scale = Math.max(...value.map(Math.abs));
  if (scale === 0) return false;
  const rows = Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, col) => value[col * 4 + row] / scale));
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    for (let row = col + 1; row < 4; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    if (rows[pivot][col] === 0) return false;
    [rows[pivot], rows[col]] = [rows[col], rows[pivot]];
    for (let row = col + 1; row < 4; row++) {
      const factor = rows[row][col] / rows[col][col];
      for (let next = col + 1; next < 4; next++) rows[row][next] -= factor * rows[col][next];
    }
  }
  return true;
}
