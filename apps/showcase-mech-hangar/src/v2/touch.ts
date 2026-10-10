// Touch zones — extracted from boot.ts for 14-LOC. Same gesture→action map.
export interface MechTouchDeps {
  input: { setAction(action: string, down: boolean): void };
  getMode(): "hangar" | "arena";
  hangarEnter(): void;
  onTouchEngaged(): void;
}

export function wireMechTouch(deps: MechTouchDeps): void {
  const canvas = document.querySelector("canvas");
  if (!canvas) return;
  let heldAction: string | null = null;
  const release = () => {
    if (heldAction) deps.input.setAction(heldAction, false);
    heldAction = null;
  };
  canvas.addEventListener("pointerdown", (event) => {
    deps.onTouchEngaged();
    if (deps.getMode() === "hangar") {
      // Tap locks the build and drops into the pit.
      deps.hangarEnter();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    if (nx < 0.4) {
      heldAction = nx < 0.15 ? "left" : nx < 0.27 ? "guard" : "right";
      deps.input.setAction(heldAction, true);
    } else {
      const col = nx < 0.7 ? 0 : 1;
      const row = ny < 0.5 ? 0 : 1;
      const tap = row === 0 ? (col === 0 ? "light" : "heavy") : col === 0 ? "special" : "jump";
      deps.input.setAction(tap, true);
      heldAction = tap;
    }
  });
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointerleave", release);
}
