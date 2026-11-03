interface PanelFocus {
  readonly element: HTMLElement;
  readonly action: string | undefined;
  readonly path: string | undefined;
  readonly nodeId: string | undefined;
  readonly assetId: string | undefined;
  readonly selection: { readonly start: number; readonly end: number; readonly direction: "forward" | "backward" | "none" } | null;
}

/** Remember a control while a panel rebuilds its contents. */
export function capturePanelFocus(panel: HTMLElement): PanelFocus | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !panel.contains(active)) return null;
  const { action, path, nodeId, assetId } = active.dataset;
  if (!action && !path) return null;
  let selection: PanelFocus["selection"] = null;
  if ((active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
    && active.selectionStart !== null && active.selectionEnd !== null) {
    selection = { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection ?? "none" };
  }
  return { element: active, action, path, nodeId, assetId, selection };
}

/** Do not steal focus if it moved elsewhere while the panel was updating. */
export function restorePanelFocus(panel: HTMLElement, previous: PanelFocus | null, fallback?: HTMLElement | null): void {
  if (!previous || panel.contains(previous.element)) return;
  const active = document.activeElement;
  if (active && active !== document.body && active !== previous.element) return;
  const replacement = Array.from(panel.querySelectorAll<HTMLElement>("button, input, select, textarea")).find((candidate) =>
    candidate.tagName === previous.element.tagName
      && candidate.dataset.action === previous.action
      && candidate.dataset.path === previous.path
      && candidate.dataset.nodeId === previous.nodeId
      && candidate.dataset.assetId === previous.assetId
  );
  const target = replacement && !replacement.matches(":disabled") ? replacement : fallback;
  target?.focus({ preventScroll: true });
  if (target === replacement && previous.selection
    && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
    && target.selectionStart !== null) {
    target.setSelectionRange(previous.selection.start, previous.selection.end, previous.selection.direction);
  }
}
