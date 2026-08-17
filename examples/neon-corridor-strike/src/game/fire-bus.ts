export interface FireBus {
  held: boolean;
  queued: boolean;
}

export function fireBus(): FireBus {
  const root = window as Window & { __AURA3D_FPS_FIRE__?: FireBus };
  if (!root.__AURA3D_FPS_FIRE__) root.__AURA3D_FPS_FIRE__ = { held: false, queued: false };
  return root.__AURA3D_FPS_FIRE__;
}

export function bindFireKeys(onShot?: () => void): () => void {
  const onDown = (event: KeyboardEvent) => {
    if (event.code !== "KeyJ" && event.code !== "KeyF" && event.key !== "j" && event.key !== "f") return;
    const bus = fireBus();
    bus.held = true;
    if (!event.repeat) {
      bus.queued = true;
      onShot?.();
    }
  };
  const onUp = (event: KeyboardEvent) => {
    if (event.code !== "KeyJ" && event.code !== "KeyF" && event.key !== "j" && event.key !== "f") return;
    fireBus().held = false;
  };
  window.addEventListener("keydown", onDown, true);
  window.addEventListener("keyup", onUp, true);
  document.addEventListener("keydown", onDown, true);
  document.addEventListener("keyup", onUp, true);
  return () => {
    window.removeEventListener("keydown", onDown, true);
    window.removeEventListener("keyup", onUp, true);
    document.removeEventListener("keydown", onDown, true);
    document.removeEventListener("keyup", onUp, true);
  };
}
