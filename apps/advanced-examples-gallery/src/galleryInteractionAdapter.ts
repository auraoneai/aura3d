import { InteractionControls } from "@galileo3d/controls";
import { InputSnapshot } from "@galileo3d/input";
import type { DemoDefinition } from "./metadata";
import { routeReceivesWaterRipples, usesProductConfiguratorHotspotPicking } from "./galleryRoutePolicies";
import { clamp } from "./math";

export interface GalleryPointer {
  readonly x: number;
  readonly y: number;
}

export interface GalleryPointerRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface GalleryOrbitState {
  readonly yaw: number;
  readonly pitch: number;
}

const GALLERY_ORBIT_YAW_SPEED = 2.5;
const GALLERY_ORBIT_PITCH_SPEED = 1.4;
const GALLERY_ORBIT_MIN_PITCH = -0.72;
const GALLERY_ORBIT_MAX_PITCH = 0.32;

export type GalleryPointerDownAction = "product-hotspot" | "scene-ripple-or-select";

export function resolveGalleryPointerDownAction(demoId: DemoDefinition["id"]): GalleryPointerDownAction {
  return usesProductConfiguratorHotspotPicking(demoId) ? "product-hotspot" : "scene-ripple-or-select";
}

export function routePointerCreatesRipple(demoId: DemoDefinition["id"]): boolean {
  return routeReceivesWaterRipples(demoId);
}

export function pointer01FromClient(clientX: number, clientY: number, rect: GalleryPointerRect): GalleryPointer {
  return {
    x: (clientX - rect.left) / Math.max(1, rect.width),
    y: (clientY - rect.top) / Math.max(1, rect.height)
  };
}

export function applyGalleryOrbitDrag(
  current: GalleryOrbitState,
  previousPointer: GalleryPointer,
  nextPointer: GalleryPointer
): GalleryOrbitState {
  const controls = new InteractionControls({
    mode: "orbit",
    rotateButton: 0,
    rotateSpeed: GALLERY_ORBIT_YAW_SPEED
  });
  controls.orbit.state.rotation.y = current.yaw;
  controls.orbit.state.rotation.x = current.pitch;
  controls.update(new InputSnapshot({
    pointer: {
      deltaX: nextPointer.x - previousPointer.x,
      deltaY: (nextPointer.y - previousPointer.y) * (GALLERY_ORBIT_PITCH_SPEED / GALLERY_ORBIT_YAW_SPEED),
      buttons: new Map([[0, { down: true, pressed: false, released: false }]])
    }
  }));
  return {
    yaw: controls.orbit.state.rotation.y,
    pitch: clamp(controls.orbit.state.rotation.x, GALLERY_ORBIT_MIN_PITCH, GALLERY_ORBIT_MAX_PITCH)
  };
}
