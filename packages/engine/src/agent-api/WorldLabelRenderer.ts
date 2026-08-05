/**
 * World-anchored label rendering.
 *
 * ## The defect this fixes
 *
 * `labels.callout(...)` built a valid label node, the node reached the scene
 * snapshot, and evidence counted it -- but nothing drew it. Labels were rendered
 * only by `drawLabelNode`, which lives in the **canvas2d fallback** path. Every
 * public route with a typed GLB takes the **production WebGL2** path, where
 * `createProductionRuntimeRendererInput` collects model and primitive render
 * items and ignores `kind: "label"` entirely.
 *
 * So the API was not partially implemented or mis-projected: it was implemented
 * in the wrong render path. Every callout in every production route was silently
 * dropped. The evidence collector counted label *nodes*, which is why reports
 * showed labels present while the screen showed none.
 *
 * The fix is a real screen-space label layer: labels are world-anchored, projected
 * with the scene's own view-projection matrix each frame, and drawn into a DOM
 * overlay above the canvas. DOM is the right medium for text -- it is legible,
 * accessible, and responsive -- but the *placement* is driven entirely by the 3D
 * projection, so a label tracks its anchor while the camera moves. This is not a
 * route-local DOM overlay: it is one reusable layer owned by the runtime.
 *
 * The projection math here is pure and unit-testable; only `mount` touches the DOM.
 */

export type LabelVec3 = readonly [number, number, number];

/** Policy for labels whose anchor falls outside the viewport. */
export type OffscreenPolicy =
  /** Hide the label entirely. */
  | "hide"
  /** Clamp to the nearest viewport edge, keeping the leader line pointing out. */
  | "clamp"
  /** Keep drawing at the projected position even when offscreen. */
  | "draw";

export interface WorldLabel {
  readonly id: string;
  readonly text: string;
  /** World point the label box is placed at. */
  readonly anchor: LabelVec3;
  /**
   * World point a leader line points at, when it differs from the label's own
   * position. A callout beside a part sets `anchor` to the label position and
   * `leaderAnchor` to the part, so the line stays attached as the camera moves.
   */
  readonly leaderAnchor?: LabelVec3 | undefined;
  /**
   * Screen-space offset from the projected anchor, in CSS pixels. Lets a callout
   * sit beside its target without moving the anchor the leader line points to.
   */
  readonly screenOffset?: readonly [number, number] | undefined;
  readonly color?: string | undefined;
  readonly background?: string | undefined;
  /** Font size in CSS pixels at the default viewport. Scaled for compact viewports. */
  readonly fontSize?: number | undefined;
  readonly leader?: boolean | undefined;
  readonly offscreenPolicy?: OffscreenPolicy | undefined;
  /**
   * Hide the label when its anchor is behind the camera. Defaults to true: a
   * label for geometry behind the viewer is misleading.
   */
  readonly hideWhenBehindCamera?: boolean | undefined;
  /** Screen-anchored HUD labels ignore the projection entirely. */
  readonly screenAnchor?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | undefined;
  /**
   * Respect geometry in front of the label's anchor (WS-2.7).
   *
   * ## Why this field is new when the option is old
   *
   * `occlusionAware` has defaulted to **true** on every `labels.billboard()`, `labels.anchor()` and
   * `labels.axisTick()` since before 1.6, `AuraLabelOptions` accepts it, and `FocusSelection` sets it
   * explicitly — but `worldLabelsFromSnapshot` never read it and `WorldLabel` had no field to read it
   * into. `depth` existed and was used only for draw ordering and collision priority.
   *
   * So a developer reading the API saw occlusion-aware labels on by default while the screen showed
   * labels drawn through walls: a declared capability that quietly did nothing. Adding the field is the
   * part that makes the existing option mean something.
   *
   * Defaults to true here to match the public default. A label with no depth sampler available is drawn
   * normally rather than hidden — absence of a depth signal is not evidence of occlusion.
   */
  readonly occlusionAware?: boolean | undefined;
  /**
   * What to do when the anchor is occluded. `"dim"` keeps the label readable but visibly behind, which
   * is usually better for an annotation than vanishing; `"hide"` suits dense scenes.
   */
  readonly occlusionPolicy?: "dim" | "hide" | undefined;
}

/**
 * Is the world point this label annotates hidden by geometry in front of it?
 *
 * ## Why a world-space test rather than a depth-buffer read
 *
 * The obvious implementation is to sample the depth buffer at the label's pixel. **WebGL2 cannot do
 * that for the default framebuffer** — `readPixels` reads colour only, and reading depth requires
 * rendering into a framebuffer with a depth *texture* attachment. Building that would mean restructuring
 * both render paths to render off-screen and blit, for a label feature.
 *
 * A world-space segment test answers the question more directly anyway. "Is this label occluded" really
 * means *"is the subject it points at behind something"*, which is a property of the scene, not of a
 * pixel. It is also deterministic and unit-testable without a GPU, and it gives the same answer at any
 * resolution — a depth read is subject to whatever happened to be rasterised at that exact pixel.
 *
 * Injected rather than computed here so this module stays pure: a test supplies a synthetic occluder and
 * asserts the policy without constructing a scene.
 *
 * Returning `false` for "unknown" is deliberate. Absence of an occlusion signal is not evidence of
 * occlusion, and guessing pessimistically would hide labels whenever the test was unavailable — the same
 * silent-wrong-result shape this phase exists to remove.
 */
export type LabelOcclusionTest = (anchor: LabelVec3) => boolean;

/** Opacity for an occluded label under the `"dim"` policy: visibly behind, still readable. */
const OCCLUDED_OPACITY = 0.35;

export interface LabelViewport {
  readonly width: number;
  readonly height: number;
  /**
   * Device pixel ratio is deliberately not used: labels are placed in CSS pixel
   * space so they stay legible without per-device sizing.
   */
  readonly compact?: boolean | undefined;
}

export interface ProjectedLabel {
  readonly id: string;
  readonly text: string;
  /** CSS-pixel position of the label box centre. */
  readonly x: number;
  readonly y: number;
  /** CSS-pixel position of the leader-line endpoint (the projected anchor). */
  readonly anchorX: number;
  readonly anchorY: number;
  readonly visible: boolean;
  readonly clamped: boolean;
  readonly behindCamera: boolean;
  readonly fontSize: number;
  readonly color: string;
  readonly background: string;
  readonly leader: boolean;
  /** Normalized depth, 0 at the near plane. Used for draw ordering. */
  readonly depth: number;
  /**
   * True when geometry sits in front of this label's anchor (WS-2.7).
   *
   * Reported even when the policy is `"dim"` rather than `"hide"`, so evidence can distinguish
   * "occluded and dimmed" from "not occluded" — a screenshot cannot.
   */
  readonly occluded: boolean;
  /** Opacity multiplier applied for occlusion. 1 when unoccluded, < 1 when dimmed. */
  readonly occlusionOpacity: number;
}

/**
 * Project a world point through a column-major 4x4 view-projection matrix.
 *
 * Returns clip-space w alongside NDC so callers can detect points behind the
 * camera (`w <= 0`) rather than silently drawing a mirrored label.
 */
export function projectWorldPoint(
  viewProjection: ArrayLike<number>,
  point: LabelVec3
): { readonly ndc: readonly [number, number, number]; readonly w: number } {
  const m = viewProjection;
  const [x, y, z] = point;
  // Column-major: element (row r, col c) is m[c * 4 + r], matching the matrices
  // produced by `multiply4`/`perspective` in the agent API renderer.
  const cx = (m[0] as number) * x + (m[4] as number) * y + (m[8] as number) * z + (m[12] as number);
  const cy = (m[1] as number) * x + (m[5] as number) * y + (m[9] as number) * z + (m[13] as number);
  const cz = (m[2] as number) * x + (m[6] as number) * y + (m[10] as number) * z + (m[14] as number);
  const cw = (m[3] as number) * x + (m[7] as number) * y + (m[11] as number) * z + (m[15] as number);
  if (cw === 0) return { ndc: [0, 0, 0], w: 0 };
  return { ndc: [cx / cw, cy / cw, cz / cw], w: cw };
}

/** Convert NDC to CSS-pixel screen coordinates for a viewport. */
export function ndcToScreen(ndc: readonly [number, number, number], viewport: LabelViewport): readonly [number, number] {
  return [
    (ndc[0] * 0.5 + 0.5) * viewport.width,
    (1 - (ndc[1] * 0.5 + 0.5)) * viewport.height
  ];
}

const SCREEN_ANCHOR_MARGIN = 14;

/**
 * Project a set of world labels into screen space.
 *
 * Pure: no DOM. This is the function tests assert on, so label placement is
 * verified by arithmetic rather than by looking at a screenshot.
 */
export function projectWorldLabels(
  labels: readonly WorldLabel[],
  viewProjection: ArrayLike<number>,
  viewport: LabelViewport,
  /** WS-2.7 — occlusion test for a world anchor. Omit when unavailable; labels are then never occluded. */
  isOccluded?: LabelOcclusionTest
): readonly ProjectedLabel[] {
  const compactScale = viewport.compact === true ? 0.86 : 1;
  return labels.map((label) => {
    const fontSize = Math.max(11, Math.round((label.fontSize ?? 14) * compactScale));
    const color = label.color ?? "#f8fafc";
    const background = label.background ?? "rgba(17,24,39,0.88)";
    const leader = label.leader ?? false;

    if (label.screenAnchor) {
      const [x, y] = screenAnchorPosition(label.screenAnchor, viewport, fontSize);
      return {
        id: label.id,
        text: label.text,
        x,
        y,
        anchorX: x,
        anchorY: y,
        visible: true,
        clamped: false,
        behindCamera: false,
        fontSize,
        color,
        background,
        leader: false,
        depth: 0,
        // A screen-anchored HUD label is deliberately in front of everything.
        occluded: false,
        occlusionOpacity: 1
      };
    }

    const projected = projectWorldPoint(viewProjection, label.anchor);
    const behindCamera = projected.w <= 0;
    const [boxAnchorX, boxAnchorY] = ndcToScreen(projected.ndc, viewport);
    // The leader endpoint is projected separately so it lands on the subject, not
    // on the label. Falls back to the label's own anchor when none is given.
    const leaderTarget = label.leaderAnchor
      ? ndcToScreen(projectWorldPoint(viewProjection, label.leaderAnchor).ndc, viewport)
      : ([boxAnchorX, boxAnchorY] as const);
    const anchorX = leaderTarget[0];
    const anchorY = leaderTarget[1];
    const offset = label.screenOffset ?? [0, -28];
    let x = boxAnchorX + offset[0] * compactScale;
    let y = boxAnchorY + offset[1] * compactScale;

    const policy = label.offscreenPolicy ?? "clamp";
    const hideBehind = label.hideWhenBehindCamera ?? true;
    // Estimated half-width from character count: the exact box is measured by the
    // DOM, but clamping needs a bound before layout.
    const halfWidth = Math.max(24, label.text.length * fontSize * 0.31);
    const halfHeight = fontSize * 0.9;
    const withinViewport = x >= -halfWidth && x <= viewport.width + halfWidth
      && y >= -halfHeight && y <= viewport.height + halfHeight;

    let clamped = false;
    let visible = true;
    if (behindCamera && hideBehind) {
      visible = false;
    } else if (!withinViewport) {
      if (policy === "hide") {
        visible = false;
      } else if (policy === "clamp") {
        const clampedX = Math.min(Math.max(x, halfWidth + SCREEN_ANCHOR_MARGIN), viewport.width - halfWidth - SCREEN_ANCHOR_MARGIN);
        const clampedY = Math.min(Math.max(y, halfHeight + SCREEN_ANCHOR_MARGIN), viewport.height - halfHeight - SCREEN_ANCHOR_MARGIN);
        clamped = clampedX !== x || clampedY !== y;
        x = clampedX;
        y = clampedY;
      }
    }

    /*
     * WS-2.7 — occlusion of the point this label annotates.
     *
     * Tested at the LEADER anchor's world position, not the label box. A callout box is deliberately
     * offset beside its subject and often sits over empty space, so testing there would ask about the
     * background rather than the subject. The question is "is the thing this label points at hidden".
     *
     * A label already hidden for another reason is not tested — no need — and one behind the camera is
     * not either, since `behindCamera` already covers it and is a stronger statement.
     */
    const occlusionAware = label.occlusionAware ?? true;
    const occlusionAnchor = label.leaderAnchor ?? label.anchor;
    const occluded = occlusionAware && isOccluded !== undefined && visible && !behindCamera
      ? isOccluded(occlusionAnchor)
      : false;
    const occlusionPolicy = label.occlusionPolicy ?? "dim";
    if (occluded && occlusionPolicy === "hide") visible = false;
    const occlusionOpacity = occluded && occlusionPolicy === "dim" ? OCCLUDED_OPACITY : 1;

    return {
      id: label.id,
      text: label.text,
      x: round(x),
      y: round(y),
      anchorX: round(anchorX),
      anchorY: round(anchorY),
      visible,
      clamped,
      behindCamera,
      fontSize,
      color,
      background,
      leader,
      depth: round(projected.ndc[2]),
      occluded,
      occlusionOpacity
    };
  });
}

/**
 * Resolve overlapping labels by nudging later ones vertically.
 *
 * Collision avoidance is a documented option on the label API, so it must
 * actually happen. Labels are sorted front-to-back so nearer labels keep their
 * requested position and farther ones move.
 */
export function resolveLabelCollisions(
  labels: readonly ProjectedLabel[],
  options: { readonly minGap?: number | undefined } = {}
): readonly ProjectedLabel[] {
  const minGap = options.minGap ?? 4;
  const ordered = [...labels].sort((a, b) => a.depth - b.depth);
  const placed: ProjectedLabel[] = [];
  for (const label of ordered) {
    if (!label.visible) {
      placed.push(label);
      continue;
    }
    let y = label.y;
    const halfHeight = label.fontSize * 0.9;
    const halfWidth = Math.max(24, label.text.length * label.fontSize * 0.31);
    let moved = true;
    let guard = 0;
    while (moved && guard < 32) {
      moved = false;
      guard += 1;
      for (const other of placed) {
        if (!other.visible) continue;
        const otherHalfHeight = other.fontSize * 0.9;
        const otherHalfWidth = Math.max(24, other.text.length * other.fontSize * 0.31);
        const overlapsX = Math.abs(label.x - other.x) < halfWidth + otherHalfWidth;
        const overlapsY = Math.abs(y - other.y) < halfHeight + otherHalfHeight + minGap;
        if (overlapsX && overlapsY) {
          y = other.y - (otherHalfHeight + halfHeight + minGap);
          moved = true;
        }
      }
    }
    placed.push(y === label.y ? label : { ...label, y: round(y) });
  }
  // Restore the caller's ordering so ids stay stable for tests and evidence.
  const byId = new Map(placed.map((label) => [label.id, label]));
  return labels.map((label) => byId.get(label.id) ?? label);
}

export interface WorldLabelLayerHost {
  /** Element the layer is appended to; normally the canvas's parent. */
  readonly container: HTMLElement;
  /** Canvas the labels are drawn over, used for CSS-pixel viewport size. */
  readonly canvas: HTMLCanvasElement;
}

export interface WorldLabelLayer {
  /** Replace the label set. */
  setLabels(labels: readonly WorldLabel[]): void;
  /** Reproject and redraw with the current view-projection matrix. */
  update(viewProjection: ArrayLike<number>): void;
  /**
   * Supply the occlusion test used for annotations (WS-2.7).
   *
   * Set separately from `update` because scene geometry changes with `setScene`, and because a layer
   * created before the renderer mounts must remain usable and simply gain occlusion later.
   */
  setOcclusionTest(isOccluded: LabelOcclusionTest | undefined): void;
  /** Most recent projection result, for evidence and tests. */
  snapshot(): readonly ProjectedLabel[];
  dispose(): void;
}

/**
 * Mount the screen-space label layer.
 *
 * Uses `pointer-events: none` so labels never intercept scene interaction, and
 * `aria-live="off"` with per-label `role="note"` so a screen reader can read the
 * annotations without announcing every camera-driven reposition.
 */
export function createWorldLabelLayer(host: WorldLabelLayerHost): WorldLabelLayer {
  /** WS-2.7 — set by the runtime once scene geometry is known. Undefined means "never occlude". */
  let occlusionTest: LabelOcclusionTest | undefined;
  const root = document.createElement("div");
  root.className = "aura-world-label-layer";
  root.setAttribute("data-aura-world-labels", "");
  root.style.cssText = [
    "position:absolute",
    "inset:0",
    "overflow:hidden",
    "pointer-events:none",
    "z-index:6"
  ].join(";");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.cssText = "position:absolute;inset:0;overflow:visible";
  root.append(svg);

  const parentStyle = getComputedStyle(host.container);
  if (parentStyle.position === "static") host.container.style.position = "relative";
  host.container.append(root);

  let labels: readonly WorldLabel[] = [];
  let projected: readonly ProjectedLabel[] = [];
  const elements = new Map<string, HTMLElement>();
  const leaders = new Map<string, SVGLineElement>();

  const viewport = (): LabelViewport => {
    const rect = host.canvas.getBoundingClientRect();
    const width = rect.width || host.canvas.clientWidth || host.canvas.width;
    const height = rect.height || host.canvas.clientHeight || host.canvas.height;
    return { width, height, compact: width < 560 };
  };

  const ensureElement = (label: ProjectedLabel): HTMLElement => {
    let element = elements.get(label.id);
    if (!element) {
      element = document.createElement("div");
      element.className = "aura-world-label";
      element.setAttribute("role", "note");
      element.setAttribute("data-aura-label-id", label.id);
      element.style.cssText = [
        "position:absolute",
        "transform:translate(-50%,-50%)",
        "white-space:nowrap",
        "border-radius:6px",
        "padding:4px 8px",
        "font:600 14px/1.2 system-ui,-apple-system,BlinkMacSystemFont,sans-serif",
        "border:1px solid rgba(148,163,184,0.5)",
        "pointer-events:none"
      ].join(";");
      root.append(element);
      elements.set(label.id, element);
    }
    return element;
  };

  const ensureLeader = (id: string): SVGLineElement => {
    let line = leaders.get(id);
    if (!line) {
      line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("stroke-width", "1.2");
      line.setAttribute("stroke-linecap", "round");
      svg.append(line);
      leaders.set(id, line);
    }
    return line;
  };

  const draw = () => {
    const seen = new Set<string>();
    for (const label of projected) {
      seen.add(label.id);
      const element = ensureElement(label);
      if (!label.visible) {
        element.style.display = "none";
        leaders.get(label.id)?.setAttribute("stroke", "transparent");
        continue;
      }
      element.style.display = "block";
      element.style.left = `${label.x}px`;
      element.style.top = `${label.y}px`;
      element.style.color = label.color;
      element.style.background = label.background;
      element.style.fontSize = `${label.fontSize}px`;
      /*
       * WS-2.7 — dim an occluded label rather than removing it.
       *
       * `aria-hidden` is deliberately NOT set: the annotation is still true, it is simply behind
       * geometry, and hiding it from a screen reader would trade a visual cue for an accessibility
       * regression. `data-occluded` is exposed so an interaction audit can assert occlusion happened —
       * a screenshot cannot distinguish "dimmed" from "unoccluded but faint".
       */
      element.style.opacity = String(label.occlusionOpacity);
      element.dataset.occluded = label.occluded ? "true" : "false";
      if (element.textContent !== label.text) element.textContent = label.text;
      if (label.leader) {
        const line = ensureLeader(label.id);
        line.setAttribute("x1", String(label.x));
        line.setAttribute("y1", String(label.y));
        line.setAttribute("x2", String(label.anchorX));
        line.setAttribute("y2", String(label.anchorY));
        line.setAttribute("stroke", label.color);
        line.setAttribute("stroke-opacity", String(0.72 * label.occlusionOpacity));
      } else {
        leaders.get(label.id)?.setAttribute("stroke", "transparent");
      }
    }
    // Clean up labels whose target was removed.
    for (const [id, element] of elements) {
      if (seen.has(id)) continue;
      element.remove();
      elements.delete(id);
      leaders.get(id)?.remove();
      leaders.delete(id);
    }
  };

  return {
    setLabels(next) {
      labels = next;
    },
    setOcclusionTest(next) {
      occlusionTest = next;
    },
    update(viewProjection) {
      projected = resolveLabelCollisions(projectWorldLabels(labels, viewProjection, viewport(), occlusionTest));
      draw();
    },
    snapshot() {
      return projected;
    },
    dispose() {
      for (const element of elements.values()) element.remove();
      elements.clear();
      for (const line of leaders.values()) line.remove();
      leaders.clear();
      root.remove();
    }
  };
}

function screenAnchorPosition(
  anchor: NonNullable<WorldLabel["screenAnchor"]>,
  viewport: LabelViewport,
  fontSize: number
): readonly [number, number] {
  const margin = SCREEN_ANCHOR_MARGIN + fontSize;
  if (anchor === "top-left") return [margin * 2.4, margin];
  if (anchor === "top-right") return [viewport.width - margin * 2.4, margin];
  if (anchor === "bottom-left") return [margin * 2.4, viewport.height - margin];
  return [viewport.width - margin * 2.4, viewport.height - margin];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
