export interface PhysicsControlState {
  readonly paused: boolean;
  readonly debugOverlay: boolean;
  readonly impulseStrength: number;
  readonly gravityScale: number;
}

export const DEFAULT_PHYSICS_CONTROLS: PhysicsControlState = {
  paused: false,
  debugOverlay: false,
  impulseStrength: 3.2,
  gravityScale: 1
};

export function bindPhysicsControls(root: HTMLElement, onChange: (state: PhysicsControlState, action?: "reset" | "impulse") => void): () => PhysicsControlState {
  let state = DEFAULT_PHYSICS_CONTROLS;
  const read = (): PhysicsControlState => state;
  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === "impulseStrength") state = { ...state, impulseStrength: Number(target.value) / 10 };
    if (target.id === "gravityScale") state = { ...state, gravityScale: Number(target.value) / 100 };
    if (target.id === "debugOverlay") state = { ...state, debugOverlay: target.checked };
    onChange(state);
  });
  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.id === "pausePhysics") {
      state = { ...state, paused: !state.paused };
      onChange(state);
    }
    if (target.id === "resetPhysics") onChange(state, "reset");
    if (target.id === "impulsePhysics") onChange(state, "impulse");
  });
  return read;
}
