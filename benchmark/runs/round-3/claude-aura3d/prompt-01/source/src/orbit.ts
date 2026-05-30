// Real interactive orbit controls.
//
// The Aura renderer reads `app.scene.camera` every frame, so we drive a genuine
// orbit camera by mutating that camera spec's `position`/`target` in place on
// pointer drag + wheel zoom. A gentle idle auto-rotation keeps the scene moving
// for captured route evidence and pauses while the user is interacting. No app
// recreation per frame.

import type { AuraCameraSpec, AuraVec3 } from "@aura3d/engine";

// `position`/`target` are typed readonly on the snapshot; this loose view lets
// us write them while keeping the public API as the construction surface.
type MutableCamera = { position: AuraVec3; target: AuraVec3; distance?: number };

export interface OrbitOptions {
  target: AuraVec3;
  distance: number;
  minDistance?: number;
  maxDistance?: number;
}

export function attachOrbitControls(
  canvas: HTMLElement,
  camera: AuraCameraSpec,
  options: OrbitOptions,
): { dispose: () => void } {
  const cam = camera as unknown as MutableCamera;
  const target = options.target;
  const minDistance = options.minDistance ?? 2.2;
  const maxDistance = options.maxDistance ?? 11;

  let radius = options.distance;
  let azimuth = 0.9; // horizontal angle
  let polar = 0.92; // vertical angle (0 = top, PI = bottom)
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let idleTimer = 0;
  let running = true;

  const apply = (): void => {
    polar = Math.max(0.18, Math.min(Math.PI - 0.18, polar));
    radius = Math.max(minDistance, Math.min(maxDistance, radius));
    const sinP = Math.sin(polar);
    cam.position = [
      target[0] + radius * sinP * Math.sin(azimuth),
      target[1] + radius * Math.cos(polar),
      target[2] + radius * sinP * Math.cos(azimuth),
    ];
    cam.target = [target[0], target[1], target[2]];
    cam.distance = radius;
  };

  const onPointerDown = (e: PointerEvent): void => {
    dragging = true;
    idleTimer = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return;
    azimuth -= (e.clientX - lastX) * 0.01;
    polar -= (e.clientY - lastY) * 0.01;
    lastX = e.clientX;
    lastY = e.clientY;
    apply();
  };
  const onPointerUp = (e: PointerEvent): void => {
    dragging = false;
    idleTimer = 0;
    canvas.releasePointerCapture?.(e.pointerId);
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    radius += e.deltaY * 0.0025 * radius;
    idleTimer = 0;
    apply();
  };

  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  // Idle auto-rotate loop (independent of the engine render loop).
  let last = performance.now();
  const tick = (now: number): void => {
    if (!running) return;
    const dt = (now - last) / 1000;
    last = now;
    if (!dragging) {
      idleTimer += dt;
      if (idleTimer > 1.2) {
        azimuth += dt * 0.22; // slow showcase spin once idle
        apply();
      }
    }
    requestAnimationFrame(tick);
  };

  apply();
  requestAnimationFrame(tick);

  return {
    dispose() {
      running = false;
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    },
  };
}
