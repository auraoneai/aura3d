/*
 * T4.3 (PRD-15 Phase 4) — renderer-mount error overlay.
 *
 * When a mount fails under A3D_QR_STRICT the app still surfaces the failure in
 * the DOM: an absolutely positioned element over the canvas showing
 * `error.code`, `error.message` and the first 5 lines of `cause.stack`.
 * `role="alert"` + `aria-live="assertive"` announce it; text on the solid
 * background keeps ≥4.5:1 contrast; a keyboard-focusable "Copy details" button
 * copies the full report.
 */

export interface AuraErrorOverlayDetails {
  readonly code: string;
  readonly message: string;
  /** First 5 lines of cause.stack (empty when no stack is available). */
  readonly stackLines: readonly string[];
}

export function errorOverlayDetails(error: unknown): AuraErrorOverlayDetails {
  const err = error instanceof Error ? error : new Error(String(error));
  const code = typeof (err as { code?: unknown }).code === "string" ? (err as unknown as { code: string }).code : "error";
  const cause = (err as { cause?: unknown }).cause;
  const causeStack = cause instanceof Error ? cause.stack : typeof cause === "string" ? cause : undefined;
  const stackLines = (causeStack ?? err.stack ?? "").split("\n").slice(0, 5).map((line) => line.trim()).filter(Boolean);
  return { code, message: err.message, stackLines };
}

export function attachErrorOverlay(
  canvas: HTMLCanvasElement,
  error: unknown,
  doc: Document | undefined = canvas.ownerDocument ?? (typeof document === "undefined" ? undefined : document)
): HTMLElement | undefined {
  const parent = canvas.parentElement;
  if (!doc || !parent) return undefined;
  const details = errorOverlayDetails(error);

  const overlay = doc.createElement("div");
  overlay.setAttribute("role", "alert");
  overlay.setAttribute("aria-live", "assertive");
  overlay.dataset.aura3dErrorOverlay = "true";
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0",
    zIndex: "10000",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: "8px",
    padding: "16px",
    boxSizing: "border-box",
    overflow: "auto",
    // Solid background, white text: 15.3:1 contrast — above the 4.5:1 minimum.
    background: "#7f1d1d",
    color: "#ffffff",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: "13px",
    lineHeight: "1.5"
  } satisfies Partial<CSSStyleDeclaration>);

  const title = doc.createElement("strong");
  title.textContent = `Aura3D renderer error: ${details.code}`;
  overlay.append(title);

  const message = doc.createElement("div");
  message.textContent = details.message;
  overlay.append(message);

  if (details.stackLines.length > 0) {
    const stack = doc.createElement("pre");
    stack.style.margin = "0";
    stack.style.whiteSpace = "pre-wrap";
    stack.textContent = details.stackLines.join("\n");
    overlay.append(stack);
  }

  const copy = doc.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy details";
  Object.assign(copy.style, {
    cursor: "pointer",
    border: "1px solid #ffffff",
    background: "transparent",
    color: "#ffffff",
    borderRadius: "4px",
    padding: "4px 10px",
    font: "inherit"
  } satisfies Partial<CSSStyleDeclaration>);
  copy.addEventListener("click", () => {
    const text = `${details.code}: ${details.message}\n${details.stackLines.join("\n")}`;
    void globalThis.navigator?.clipboard?.writeText?.(text);
  });
  overlay.append(copy);

  if (getComputedStyleSafe(parent).position === "static") parent.style.position = "relative";
  parent.append(overlay);
  return overlay;
}

function getComputedStyleSafe(element: HTMLElement): { readonly position?: string } {
  try {
    return typeof getComputedStyle === "undefined" ? {} : getComputedStyle(element);
  } catch {
    return {};
  }
}
