import type { Input } from "../../../shared/coin-sim";

// @concern input-touch
const BUTTONS = [
  { dir: "up", label: "▲" },
  { dir: "left", label: "◀" },
  { dir: "down", label: "▼" },
  { dir: "right", label: "▶" }
] as const;

export function createTouchPad() {
  const pad = document.createElement("div");
  pad.className = "dpad";
  const held = new Set<string>();
  for (const { dir, label } of BUTTONS) {
    const button = document.createElement("button");
    button.dataset.dir = dir;
    button.textContent = label;
    button.addEventListener("pointerdown", (event) => {
      button.setPointerCapture(event.pointerId);
      held.add(dir);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, () => held.delete(dir));
    pad.append(button);
  }
  document.body.append(pad);
  return {
    read: (): Input => ({ x: Number(held.has("right")) - Number(held.has("left")), z: Number(held.has("down")) - Number(held.has("up")) }),
    dispose: () => pad.remove()
  };
}
