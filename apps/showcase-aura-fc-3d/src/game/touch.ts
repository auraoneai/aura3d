// Aura FC 3D — phone controls: one analog movement stick plus the match buttons.
//
// The engine's `mountTouchControls` sticks did not mount (audit FC-06: the presets name their rects `leftStick`, the
// mounter looks up `stick`), and its `dpad-4btn` layout had only left/right movement and no switch or pause. This
// layer is the game's own: a stick read as an analog vector, and buttons that press named bindings on the same
// `app.input` controller the keyboard drives (`input.touch.press("TouchShoot")` holds the `shoot` action), so touch,
// keys and gamepad share one action path. Shown on coarse pointers or after the first touch; hidden otherwise.

export interface TouchSink {
  readonly touch: { press(binding: string): void; release(binding: string): void };
}

export interface FcTouch {
  readonly visible: boolean;
  /** Stick vector in screen space: x right, y down, length 0..1 (0 when no finger is on it). */
  stick(): [number, number];
  evidence(): { visible: boolean; stick: boolean; buttons: readonly string[]; value: [number, number] };
}

/** Button id -> [label, binding pressed on the input controller]. Bindings are declared in main.ts actions. */
export const TOUCH_BUTTONS: readonly (readonly [string, string, string])[] = [
  ["shoot", "SHOOT", "TouchShoot"],
  ["pass", "PASS", "TouchPass"],
  ["driven", "LONG", "TouchDriven"],
  ["sprint", "SPRINT", "TouchSprint"],
  ["skillA", "SKILL", "TouchSkillA"],
  ["skillB", "SLIDE", "TouchSkillB"],
  ["switch", "SWITCH", "TouchSwitch"],
  ["pause", "II", "TouchPause"]
];

const css = `
.fc-touch { position: fixed; inset: 0; pointer-events: none; z-index: 40; touch-action: none; }
.fc-touch.fc-hidden { display: none; }
.fc-touch-stick { position: absolute; left: calc(14px + env(safe-area-inset-left, 0px)); bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  width: 132px; height: 132px; border-radius: 50%; pointer-events: auto; touch-action: none;
  background: radial-gradient(circle, rgba(216,255,62,.10), rgba(5,12,10,.42)); border: 1px solid rgba(216,255,62,.38); }
.fc-touch-nub { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%;
  background: rgba(216,255,62,.55); box-shadow: 0 0 14px rgba(216,255,62,.35); }
.fc-touch-pad { position: absolute; right: calc(10px + env(safe-area-inset-right, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  display: grid; grid-template-columns: repeat(3, 52px); gap: 8px; pointer-events: none; }
.fc-touch-btn { width: 52px; height: 52px; border-radius: 14px; pointer-events: auto; touch-action: none;
  display: flex; align-items: center; justify-content: center; font: 700 12px "Whitney", sans-serif; letter-spacing: .04em;
  color: #f3f0dc; background: rgba(5,12,10,.62); border: 1px solid rgba(243,240,220,.28); user-select: none; -webkit-user-select: none; }
.fc-touch-btn[data-fc-touch="shoot"] { background: rgba(216,255,62,.78); color: #0b1f1c; border-color: #d8ff3e; }
.fc-touch-btn[data-fc-touch="pass"] { background: rgba(125,252,255,.62); color: #04161a; border-color: #7dfcff; }
.fc-touch-btn.down { transform: scale(.94); filter: brightness(1.25); }
.fc-touch-top { position: absolute; right: calc(10px + env(safe-area-inset-right, 0px)); top: calc(var(--a3d-bar-space, 44px) + 92px); pointer-events: none; }
`;

export function mountFcTouch(input: TouchSink, host: HTMLElement, opts: { coarse: () => boolean }): FcTouch {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.className = "fc-touch fc-hidden";
  root.setAttribute("aria-label", "Touch controls");
  host.appendChild(root);

  const stickEl = document.createElement("div");
  stickEl.className = "fc-touch-stick";
  stickEl.setAttribute("role", "slider");
  stickEl.setAttribute("aria-label", "Move");
  const nub = document.createElement("div");
  nub.className = "fc-touch-nub";
  stickEl.appendChild(nub);
  root.appendChild(stickEl);

  let value: [number, number] = [0, 0];
  let stickPointer: number | null = null;
  const setFromEvent = (e: PointerEvent) => {
    const r = stickEl.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = (e.clientX - (r.left + radius)) / (radius * 0.8);
    let dy = (e.clientY - (r.top + radius)) / (radius * 0.8);
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    // small dead zone so a resting thumb does not drift the player
    value = Math.hypot(dx, dy) < 0.16 ? [0, 0] : [dx, dy];
    nub.style.transform = `translate(${dx * radius * 0.8}px, ${dy * radius * 0.8}px)`;
  };
  const endStick = () => { stickPointer = null; value = [0, 0]; nub.style.transform = ""; };
  stickEl.addEventListener("pointerdown", (e) => { stickPointer = e.pointerId; stickEl.setPointerCapture?.(e.pointerId); setFromEvent(e); e.preventDefault(); });
  stickEl.addEventListener("pointermove", (e) => { if (e.pointerId === stickPointer) setFromEvent(e); });
  stickEl.addEventListener("pointerup", (e) => { if (e.pointerId === stickPointer) endStick(); });
  stickEl.addEventListener("pointercancel", (e) => { if (e.pointerId === stickPointer) endStick(); });

  const pad = document.createElement("div");
  pad.className = "fc-touch-pad";
  root.appendChild(pad);
  const top = document.createElement("div");
  top.className = "fc-touch-top";
  root.appendChild(top);
  const buttons: string[] = [];
  for (const [id, label, binding] of TOUCH_BUTTONS) {
    const b = document.createElement("div");
    b.className = "fc-touch-btn";
    b.dataset.fcTouch = id;
    b.dataset.control = id;
    b.setAttribute("role", "button");
    b.setAttribute("aria-label", id === "pause" ? "Pause" : label.toLowerCase());
    b.textContent = label;
    (id === "pause" ? top : pad).appendChild(b);
    let down = false;
    const release = () => { if (!down) return; down = false; b.classList.remove("down"); input.touch.release(binding); };
    b.addEventListener("pointerdown", (e) => {
      down = true; b.classList.add("down"); b.setPointerCapture?.(e.pointerId); input.touch.press(binding); e.preventDefault();
      (navigator as unknown as { vibrate?: (ms: number) => boolean }).vibrate?.(10);
    });
    b.addEventListener("pointerup", release);
    b.addEventListener("pointercancel", release);
    b.addEventListener("lostpointercapture", release);
    buttons.push(id);
  }

  let visible = false;
  const show = (on: boolean) => { visible = on; root.classList.toggle("fc-hidden", !on); };
  show(opts.coarse());
  window.addEventListener("touchstart", () => { if (!visible) show(true); }, { passive: true });

  return {
    get visible() { return visible; },
    stick: () => value,
    evidence: () => ({ visible, stick: true, buttons, value: [+value[0].toFixed(2), +value[1].toFixed(2)] })
  };
}
