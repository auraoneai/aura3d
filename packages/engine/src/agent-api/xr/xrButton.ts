import type { AuraXRMode, AuraXRRuntime, AuraXRSessionInit } from "./types.js";

export type AuraXRButtonState = "checking" | "ready" | "presenting" | "unsupported";

export interface AuraXRButtonLabels {
  readonly checking: string;
  readonly ready: string;
  readonly presenting: string;
  readonly unsupported: string;
}

/** The slice of a DOM element the button touches; lets tests pass a fake document. */
export interface AuraXRButtonElementLike {
  textContent: string | null;
  disabled: boolean;
  title: string;
  style: Record<string, string>;
  addEventListener(type: "click", listener: () => void): void;
  removeEventListener(type: "click", listener: () => void): void;
  setAttribute(name: string, value: string): void;
  remove?(): void;
}

export interface AuraXRButtonDocumentLike {
  createElement(tag: "button"): AuraXRButtonElementLike;
}

export interface AuraXRButtonOptions {
  /**
   * The app (or any holder) whose `xr` runtime the button drives. `AuraApp.xr` is typed optional (test doubles
   * may omit it), so a plain `AuraApp` is accepted here and a missing runtime throws a clear error.
   */
  readonly app: { readonly xr?: AuraXRRuntime | undefined };
  readonly mode?: AuraXRMode;
  readonly sessionInit?: AuraXRSessionInit;
  /** Where to append the button. Omit to create it detached and append it yourself. */
  readonly parent?: { appendChild(node: never): unknown };
  readonly document?: AuraXRButtonDocumentLike;
  readonly labels?: Partial<AuraXRButtonLabels>;
}

export interface AuraXRButtonHandle {
  readonly element: AuraXRButtonElementLike;
  readonly mode: AuraXRMode;
  readonly state: AuraXRButtonState;
  /** Re-check device support, e.g. after a headset is connected. */
  refresh(): Promise<void>;
  dispose(): void;
}

const modeName = (mode: AuraXRMode): string => (mode === "immersive-ar" ? "AR" : "VR");

/**
 * three's `VRButton` / `ARButton` for an Aura3D app. The click handler runs
 * `app.xr.enter()` synchronously inside the user gesture, as WebXR requires.
 */
export function createXRButton(options: AuraXRButtonOptions): AuraXRButtonHandle {
  const mode = options.mode ?? "immersive-vr";
  const kind = modeName(mode);
  const labels: AuraXRButtonLabels = {
    checking: `CHECKING ${kind}`,
    ready: `ENTER ${kind}`,
    presenting: "STOP",
    unsupported: `${kind} NOT SUPPORTED`,
    ...options.labels
  };
  const documentLike = options.document ?? (globalThis.document as unknown as AuraXRButtonDocumentLike | undefined);
  if (!documentLike) throw new Error("xr.button requires a DOM document (pass `document` outside a browser).");
  const element = documentLike.createElement("button");
  Object.assign(element.style, {
    position: "absolute",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "6px 14px",
    border: "1px solid currentColor",
    borderRadius: "4px",
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "500",
    lineHeight: "1.4",
    cursor: "pointer",
    zIndex: "999"
  });
  let state: AuraXRButtonState = "checking";
  let disposed = false;
  const xr = options.app.xr;
  if (!xr) throw new Error("xr.button requires an app with an XR runtime (createAuraApp provides `app.xr`).");

  const render = (next: AuraXRButtonState, title = ""): void => {
    state = next;
    element.textContent = labels[next];
    element.disabled = next === "checking" || next === "unsupported";
    element.title = title;
    element.style.cursor = element.disabled ? "auto" : "pointer";
    element.setAttribute("data-xr-state", next);
  };

  const refresh = async (): Promise<void> => {
    if (xr.isPresenting) return render("presenting");
    render("checking");
    const supported = await xr.isSupported(mode);
    if (disposed) return;
    render(xr.isPresenting ? "presenting" : supported ? "ready" : "unsupported", supported ? "" : `${mode} is not available on this device or browser.`);
  };

  const onClick = (): void => {
    if (state === "presenting") {
      void xr.exit();
      return;
    }
    if (state !== "ready") return;
    void xr.enter(mode, options.sessionInit).then((result) => {
      if (disposed || result.started) return;
      render(result.reason === "unsupported" || result.reason === "no-webxr" ? "unsupported" : "ready", result.message ?? "");
    });
  };
  element.addEventListener("click", onClick);
  const offStart = xr.on("sessionstart", () => render("presenting"));
  const offEnd = xr.on("sessionend", () => void refresh());
  render("checking");
  options.parent?.appendChild(element as never);
  void refresh();

  return {
    element,
    mode,
    get state() {
      return state;
    },
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      element.removeEventListener("click", onClick);
      offStart();
      offEnd();
      element.remove?.();
    }
  };
}
