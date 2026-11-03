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

import { formatDiagnosticError, sanitizeDiagnosticText } from "../sanitizeDiagnostics.js";

export interface AuraErrorOverlayDetails {
  readonly code: string;
  readonly message: string;
  /** First 5 lines of cause.stack (empty when no stack is available). */
  readonly stackLines: readonly string[];
}

function readField(value: unknown, key: string): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return undefined;
  try { return Reflect.get(value, key); } catch { return undefined; }
}

/** The overlay is DOM- and clipboard-visible: every field is bounded and redacted,
 * and hostile thrown values (throwing getters, revoked proxies) cannot escape. */
export function errorOverlayDetails(error: unknown): AuraErrorOverlayDetails {
  const rawCode = readField(error, "code");
  const code = typeof rawCode === "string" ? sanitizeDiagnosticText(rawCode).slice(0, 128) : "error";
  const rawMessage = readField(error, "message");
  const message = typeof rawMessage === "string" ? sanitizeDiagnosticText(rawMessage) : formatDiagnosticError(error);
  const cause = readField(error, "cause");
  const causeStack = typeof cause === "string" ? cause : readField(cause, "stack");
  const ownStack = readField(error, "stack");
  const stack = typeof causeStack === "string" ? causeStack : typeof ownStack === "string" ? ownStack : "";
  const stackLines = stack.slice(0, 16384).split("\n").slice(0, 5).map((line) => sanitizeDiagnosticText(line.trim())).filter(Boolean);
  return { code, message, stackLines };
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
    fontSize: "16px",
    lineHeight: "1.5"
  } satisfies Partial<CSSStyleDeclaration>);

  const title = doc.createElement("strong");
  title.textContent = `Aura3D renderer error: ${details.code}`;
  overlay.append(title);

  const message = doc.createElement("div");
  message.style.overflowWrap = "anywhere";
  message.textContent = details.message;
  overlay.append(message);

  if (details.stackLines.length > 0) {
    const stack = doc.createElement("pre");
    stack.style.margin = "0";
    stack.style.whiteSpace = "pre-wrap";
    // Long unbreakable tokens (file URLs, paths) must wrap too — otherwise the
    // overlay scrolls horizontally on narrow viewports (§1945: readable at 390px).
    stack.style.overflowWrap = "anywhere";
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
