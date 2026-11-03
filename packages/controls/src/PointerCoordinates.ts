/** A current canvas content box and the framebuffer coordinates it maps to. */
export interface PointerContentBox {
  readonly width: number;
  readonly height: number;
  fromClient(clientX: number, clientY: number): { readonly x: number; readonly y: number };
}

/**
 * Measure once per event/selection so client coordinates, CSS scale, padding,
 * borders and the drawing-buffer size all refer to the same layout snapshot.
 */
export function measurePointerContentBox(element: HTMLElement, label: string): PointerContentBox {
  const rect = element.getBoundingClientRect();
  const scaleX = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
  const scaleY = element.offsetHeight > 0 ? rect.height / element.offsetHeight : 1;
  const view = element.ownerDocument?.defaultView;
  const style = view?.getComputedStyle?.(element);
  const cssNumber = (value: string | undefined, fallback = 0): number => {
    const parsed = Number.parseFloat(value ?? "");
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  // clientLeft/Top are useful when computed style is unavailable, as on
  // structural event targets. clientWidth/Height already include padding.
  const fallbackLeft = element.clientLeft || 0;
  const fallbackTop = element.clientTop || 0;
  const fallbackRight = element.offsetWidth > 0 && element.clientWidth > 0
    ? Math.max(0, element.offsetWidth - element.clientWidth - fallbackLeft) : 0;
  const fallbackBottom = element.offsetHeight > 0 && element.clientHeight > 0
    ? Math.max(0, element.offsetHeight - element.clientHeight - fallbackTop) : 0;
  const left = cssNumber(style?.borderLeftWidth, fallbackLeft) + cssNumber(style?.paddingLeft);
  const right = cssNumber(style?.borderRightWidth, fallbackRight) + cssNumber(style?.paddingRight);
  const top = cssNumber(style?.borderTopWidth, fallbackTop) + cssNumber(style?.paddingTop);
  const bottom = cssNumber(style?.borderBottomWidth, fallbackBottom) + cssNumber(style?.paddingBottom);
  const contentWidth = rect.width / scaleX - left - right;
  const contentHeight = rect.height / scaleY - top - bottom;
  if (!(scaleX > 0) || !(scaleY > 0) || !(contentWidth > 0) || !(contentHeight > 0)) {
    throw new RangeError(`${label} target must have a non-zero size.`);
  }
  const canvas = element as HTMLElement & { readonly width?: number; readonly height?: number };
  const width = canvas.width && canvas.width > 0 ? canvas.width : contentWidth * scaleX;
  const height = canvas.height && canvas.height > 0 ? canvas.height : contentHeight * scaleY;
  return {
    width,
    height,
    fromClient: (clientX, clientY) => ({
      x: ((clientX - rect.left) / scaleX - left) * width / contentWidth,
      y: ((clientY - rect.top) / scaleY - top) * height / contentHeight
    })
  };
}
