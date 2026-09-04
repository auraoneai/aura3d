import type { ControlObject3DLike } from "./NativeControlTypes";

export type HoverOutlineTone = "hover" | "selected" | "hover-selected";

export interface HoverOutlineStyle {
  readonly color: readonly [number, number, number, number];
  readonly width: number;
}

export interface HoverOutlineOptions {
  readonly hover?: Partial<HoverOutlineStyle>;
  readonly selected?: Partial<HoverOutlineStyle>;
  readonly hoverSelected?: Partial<HoverOutlineStyle>;
}

export interface HoverOutlineEntry {
  readonly object: ControlObject3DLike;
  readonly tone: HoverOutlineTone;
  readonly style: HoverOutlineStyle;
}

const DEFAULT_HOVER_STYLE: HoverOutlineStyle = {
  color: [0.4, 0.75, 1, 1],
  width: 2
};

const DEFAULT_SELECTED_STYLE: HoverOutlineStyle = {
  color: [1, 0.62, 0.16, 1],
  width: 3
};

const DEFAULT_HOVER_SELECTED_STYLE: HoverOutlineStyle = {
  color: [1, 0.85, 0.4, 1],
  width: 4
};

/**
 * Hover/selection highlight state for the editor outline pass (A3).
 *
 * This class owns the *decision* — which objects request an outline and with
 * which tone — while the renderer owns the pixels. A viewport feeds pointer
 * picks (`setHovered`) and selection commits (`setSelected`) and reads
 * `entries()` to submit outline geometry; the browser proof asserts the
 * submitted outline changes rendered pixels.
 */
export class HoverOutline {
  private readonly hoverStyle: HoverOutlineStyle;
  private readonly selectedStyle: HoverOutlineStyle;
  private readonly hoverSelectedStyle: HoverOutlineStyle;
  private hovered: ControlObject3DLike | null = null;
  private readonly selectedObjects = new Set<ControlObject3DLike>();
  private disposed = false;

  constructor(options: HoverOutlineOptions = {}) {
    this.hoverStyle = { ...DEFAULT_HOVER_STYLE, ...options.hover };
    this.selectedStyle = { ...DEFAULT_SELECTED_STYLE, ...options.selected };
    this.hoverSelectedStyle = { ...DEFAULT_HOVER_SELECTED_STYLE, ...options.hoverSelected };
  }

  /** True after `dispose()`; setters are no-ops past this point. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  setHovered(object: ControlObject3DLike | null): void {
    if (this.disposed) return;
    this.hovered = object;
  }

  setSelected(objects: readonly ControlObject3DLike[]): void {
    if (this.disposed) return;
    this.selectedObjects.clear();
    for (const object of objects) this.selectedObjects.add(object);
  }

  clear(): void {
    if (this.disposed) return;
    this.hovered = null;
    this.selectedObjects.clear();
  }

  entries(): readonly HoverOutlineEntry[] {
    const entries: HoverOutlineEntry[] = [];
    const seen = new Set<ControlObject3DLike>();
    if (this.hovered) {
      const selected = this.selectedObjects.has(this.hovered);
      entries.push({
        object: this.hovered,
        tone: selected ? "hover-selected" : "hover",
        style: selected ? this.hoverSelectedStyle : this.hoverStyle
      });
      seen.add(this.hovered);
    }
    for (const object of this.selectedObjects) {
      if (seen.has(object)) continue;
      entries.push({ object, tone: "selected", style: this.selectedStyle });
    }
    return entries;
  }

  /**
   * F1-standard disposal: drops hover/selection references and owns zero DOM
   * listeners, so nothing can leak. Idempotent.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hovered = null;
    this.selectedObjects.clear();
  }
}
