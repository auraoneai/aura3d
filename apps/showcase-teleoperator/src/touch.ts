/**
 * On-screen driving pads for touch screens (C3): steer left, steer right, brake and throttle, each at least 64 CSS px.
 * Pointer events, so several fingers work at once and a finger that slides off a pad releases it. The pads show on a coarse
 * pointer at load or after the first touch anywhere, and add `body.touch` so the HUD makes room for them.
 */
export type TouchPadId = "left" | "right" | "brake" | "throttle";

export interface TouchPads {
  readonly visible: boolean;
  held(id: TouchPadId): boolean;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const PADS: ReadonlyArray<{ id: TouchPadId; label: string; glyph: string }> = [
  { id: "left", label: "Steer left", glyph: "◀" },
  { id: "right", label: "Steer right", glyph: "▶" },
  { id: "brake", label: "Brake", glyph: "BRAKE" },
  { id: "throttle", label: "Throttle", glyph: "GO" }
];

export function mountTouchPads(doc: Document, options: { readonly coarsePointer: boolean; readonly onChange?: () => void }): TouchPads {
  const host = doc.createElement("div");
  host.id = "touchPads";
  host.setAttribute("aria-label", "Driving controls");
  const pointers = new Map<number, TouchPadId>();
  const count: Record<TouchPadId, number> = { left: 0, right: 0, brake: 0, throttle: 0 };
  const els = new Map<TouchPadId, HTMLElement>();
  const refresh = (): void => {
    count.left = count.right = count.brake = count.throttle = 0;
    for (const id of pointers.values()) count[id] += 1;
    for (const [id, el] of els) el.classList.toggle("down", count[id] > 0);
    options.onChange?.();
  };
  const release = (ev: PointerEvent): void => {
    if (!pointers.delete(ev.pointerId)) return;
    refresh();
  };
  for (const pad of PADS) {
    const el = doc.createElement("button");
    el.type = "button";
    el.className = `pad pad-${pad.id}`;
    el.dataset.touch = pad.id;
    el.setAttribute("aria-label", pad.label);
    el.textContent = pad.glyph;
    el.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      pointers.set(ev.pointerId, pad.id);
      try { el.setPointerCapture(ev.pointerId); } catch { /* synthetic pointer */ }
      refresh();
    });
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("lostpointercapture", release);
    // A pad never takes focus, so a keyboard user's next key does not "click" it.
    el.addEventListener("focus", () => el.blur());
    el.addEventListener("contextmenu", (ev) => ev.preventDefault());
    host.appendChild(el);
    els.set(pad.id, el);
  }
  doc.body.appendChild(host);

  let visible = false;
  const setVisible = (v: boolean): void => {
    visible = v;
    host.classList.toggle("on", v);
    doc.body.classList.toggle("touch", v);
    if (!v && pointers.size > 0) {
      pointers.clear();
      refresh();
    }
  };
  const onFirstTouch = (): void => {
    if (!visible) setVisible(true);
  };
  doc.addEventListener("touchstart", onFirstTouch, { passive: true });
  setVisible(options.coarsePointer);

  return {
    get visible() {
      return visible;
    },
    held: (id) => count[id] > 0,
    setVisible,
    dispose() {
      doc.removeEventListener("touchstart", onFirstTouch);
      host.remove();
    }
  };
}
