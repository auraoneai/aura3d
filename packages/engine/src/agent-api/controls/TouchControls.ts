/**
 * `controls/TouchControls.ts` (I-1): DOM overlay for a
 * `GameTouchControlLayout`.
 *
 * `mountTouchControls(app, input, layout, options)` mounts one element per
 * `GameTouchControlRegion` as a sibling of the canvas: buttons and d-pad
 * regions press/release the region's `binding` through `input.touch`
 * (I-2's virtual device), sticks drive a `VirtualTouchJoystick` and publish
 * `layout.bindings`-named axes via `input.touch.setAxis`.
 *
 * Every control is `pointer-events: auto`, `touch-action: none`, gets
 * `setPointerCapture` on down, carries `aria-label` + `role="button"`, and is
 * clamped to ≥ 48 CSS px. The container respects `env(safe-area-inset-*)`.
 * I-4: `autoHide` (default true) shows the overlay on the first `touchstart`
 * and hides it on keyboard/gamepad input.
 *
 * Engine-pure: no renderer imports; works against jsdom in tests.
 */
import type {
  GameInputController,
  GameTouchControlLayout,
  GameTouchControlRegion
} from "../GameRuntime.js";
import { VirtualTouchJoystick } from "@aura3d/input";

export interface MountTouchControlsOptions {
  /** Overlay host; default: the app's canvas parent or `document.body`. */
  readonly parent?: HTMLElement;
  /** I-4: show on `touchstart`, hide on keyboard/gamepad (default true). */
  readonly autoHide?: boolean;
  /** Initial visibility; default false when `autoHide`, else true. */
  readonly visible?: boolean;
  /** Class-name prefix; default `"a3d-touch"`. */
  readonly classPrefix?: string;
  /** axis name published by the move stick; default `"move"`. */
  readonly moveAxis?: string;
  /** DOM override for tests (jsdom/fake document); default `globalThis.document`. */
  readonly document?: Document;
}

export interface MountedTouchControls {
  readonly kind: "aura-mounted-touch-controls";
  readonly el: HTMLElement;
  visible(): boolean;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const MIN_CSS_PX = 48;

type AppWithDom = {
  readonly canvas?: { readonly parentElement?: HTMLElement | null };
  readonly dom?: { readonly canvas?: { readonly parentElement?: HTMLElement | null } };
};

export function mountTouchControls(
  app: AppWithDom | undefined,
  input: Pick<GameInputController, "touch">,
  layout: GameTouchControlLayout,
  options: MountTouchControlsOptions = {}
): MountedTouchControls {
  const doc = options.document ?? (typeof document !== "undefined" ? document : undefined);
  if (!doc) {
    throw new Error("mountTouchControls requires a DOM (document undefined).");
  }
  const prefix = options.classPrefix ?? "a3d-touch";
  const autoHide = options.autoHide ?? true;
  const parent =
    options.parent ??
    app?.canvas?.parentElement ??
    app?.dom?.canvas?.parentElement ??
    doc.body;

  const el = doc.createElement("div");
  el.className = `${prefix}-overlay`;
  el.setAttribute("data-aura-touch-overlay", "");
  Object.assign(el.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    zIndex: "20",
    paddingTop: "env(safe-area-inset-top, 0px)",
    paddingRight: "env(safe-area-inset-right, 0px)",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
    paddingLeft: "env(safe-area-inset-left, 0px)"
  } as Partial<CSSStyleDeclaration>);

  const disposers: (() => void)[] = [];
  const sticks: { el: HTMLElement; joystick: VirtualTouchJoystick }[] = [];
  const moveAxis = options.moveAxis ?? "move";

  const regionStyle = (region: GameTouchControlRegion, elx: number, ely: number, size: number): Partial<CSSStyleDeclaration> => ({
    position: "absolute",
    left: `${Math.round(elx - size / 2)}px`,
    top: `${Math.round(ely - size / 2)}px`,
    width: `${Math.round(size)}px`,
    height: `${Math.round(size)}px`,
    pointerEvents: "auto",
    touchAction: "none",
    userSelect: "none",
    zIndex: String(region.zIndex)
  });

  for (const region of layout.controls) {
    const size = Math.max(MIN_CSS_PX, region.radius * 2);
    const node = doc.createElement("div");
    node.className = `${prefix}-region ${prefix}-${region.kind}`;
    node.dataset.touchId = region.id;
    node.dataset.touchBinding = region.binding;
    node.setAttribute("aria-label", region.label);
    node.setAttribute("role", "button");
    Object.assign(node.style, regionStyle(region, region.center[0], region.center[1], size));
    if (region.kind === "button" || region.kind === "dpad") {
      node.textContent = region.label;
      const down = (e: Event) => {
        const p = e as PointerEvent;
        input.touch.press(region.binding);
        try { node.setPointerCapture?.(p.pointerId); } catch { /* jsdom */ }
        e.preventDefault?.();
      };
      const up = (e: Event) => {
        input.touch.release(region.binding);
        e.preventDefault?.();
      };
      node.addEventListener("pointerdown", down);
      node.addEventListener("pointerup", up);
      node.addEventListener("pointercancel", up);
      disposers.push(() => {
        node.removeEventListener("pointerdown", down);
        node.removeEventListener("pointerup", up);
        node.removeEventListener("pointercancel", up);
      });
    } else if (region.kind === "stick") {
      const joystick = new VirtualTouchJoystick({
        center: region.center,
        radius: Math.max(size / 2, region.radius),
        fixed: true,
        returnToCenter: true
      });
      const publish = () => {
        const snap = joystick.snapshot();
        // `value` is the normalized [-1,1] stick output (stick is px position).
        input.touch.setAxis(`${moveAxis}:x`, snap.value[0]);
        input.touch.setAxis(`${moveAxis}:y`, snap.value[1]);
      };
      const track = (e: Event, phase: "start" | "move" | "end") => {
        const p = e as PointerEvent;
        const touch = { id: p.pointerId ?? 1, x: p.clientX, y: p.clientY };
        if (phase === "start") {
          if (joystick.touchStart(touch)) {
            try { node.setPointerCapture?.(p.pointerId); } catch { /* jsdom */ }
          }
        } else if (phase === "move") joystick.touchMove(touch);
        else joystick.touchEnd(touch);
        publish();
        e.preventDefault?.();
      };
      const onDown = (e: Event) => track(e, "start");
      const onMove = (e: Event) => track(e, "move");
      const onUp = (e: Event) => track(e, "end");
      node.addEventListener("pointerdown", onDown);
      node.addEventListener("pointermove", onMove);
      node.addEventListener("pointerup", onUp);
      node.addEventListener("pointercancel", onUp);
      disposers.push(() => {
        node.removeEventListener("pointerdown", onDown);
        node.removeEventListener("pointermove", onMove);
        node.removeEventListener("pointerup", onUp);
        node.removeEventListener("pointercancel", onUp);
      });
      sticks.push({ el: node, joystick });
    }
    el.appendChild(node);
  }

  let visible = options.visible ?? !autoHide;
  const applyVisible = () => {
    el.style.display = visible ? "" : "none";
  };
  applyVisible();

  // I-4: global listeners — first touchstart shows; keyboard/gamepad hides.
  const showOnTouch = () => { if (autoHide) { visible = true; applyVisible(); } };
  const hideOnOther = (e: Event) => {
    if (!autoHide) return;
    if (e.type === "pointerdown" && (e as PointerEvent).pointerType === "touch") return;
    if (el.contains(e.target as Node)) return;
    visible = false;
    applyVisible();
  };
  const win = typeof window !== "undefined" ? window : undefined;
  if (autoHide && win?.addEventListener) {
    win.addEventListener("touchstart", showOnTouch, true);
    win.addEventListener("keydown", hideOnOther, true);
    win.addEventListener("gamepadconnected", hideOnOther, true);
    disposers.push(() => {
      win.removeEventListener("touchstart", showOnTouch, true);
      win.removeEventListener("keydown", hideOnOther, true);
      win.removeEventListener("gamepadconnected", hideOnOther, true);
    });
  }

  parent.appendChild(el);
  return {
    kind: "aura-mounted-touch-controls",
    el,
    visible: () => visible,
    setVisible(next) {
      visible = next === true;
      applyVisible();
    },
    dispose() {
      for (const d of disposers) d();
      el.remove();
    }
  };
}
