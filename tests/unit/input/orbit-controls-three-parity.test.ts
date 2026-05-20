// @ts-nocheck
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { InputSnapshot, OrbitControls } from "../../../packages/input/src";

describe("OrbitControls Three.js parity", () => {
  it("matches Three.js orbit rotation and wheel dolly for the same pointer sequence", () => {
    const dom = new FakeDomElement(720, 720);
    const threeCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    threeCamera.position.set(0, 0, 10);
    const threeControls = new ThreeOrbitControls(threeCamera, dom);
    threeControls.enableDamping = false;
    threeControls.minDistance = 0.1;
    threeControls.maxDistance = 1000;
    threeControls.minPolarAngle = 0.001;
    threeControls.maxPolarAngle = Math.PI - 0.001;
    threeControls.rotateSpeed = 1;
    threeControls.zoomSpeed = 1;

    const g3dCamera = createCamera();
    const g3dControls = new OrbitControls(g3dCamera, {
      target: { x: 0, y: 0, z: 0 },
      distance: 10,
      minDistance: 0.1,
      maxDistance: 1000,
      minPolar: 0.001,
      maxPolar: Math.PI - 0.001,
      rotateSpeed: 2 * Math.PI / 720,
      zoomSpeed: 1
    });

    dom.dispatch("pointerdown", pointerEvent({ clientX: 100, clientY: 100, button: 0, buttons: 1 }));
    dom.dispatch("pointermove", pointerEvent({ clientX: 160, clientY: 130, button: 0, buttons: 1 }));
    dom.dispatch("pointerup", pointerEvent({ clientX: 160, clientY: 130, button: 0, buttons: 0 }));
    dom.dispatch("wheel", wheelEvent({ deltaY: 100, clientX: 160, clientY: 130 }));

    g3dControls.update(new InputSnapshot({
      pointer: { deltaX: 60, deltaY: 30, buttons: new Map([[0, { down: true, pressed: true, released: false }]]) }
    }));
    g3dControls.update(new InputSnapshot({ pointer: { wheelY: 100 } }));

    expect(g3dControls.getAzimuthalAngle()).toBeCloseTo(threeControls.getAzimuthalAngle(), 5);
    expect(g3dControls.getPolarAngle()).toBeCloseTo(threeControls.getPolarAngle(), 5);
    expect(g3dControls.getDistance()).toBeCloseTo(threeControls.getDistance(), 5);
    expect(g3dCamera.position.x).toBeCloseTo(threeCamera.position.x, 4);
    expect(g3dCamera.position.y).toBeCloseTo(threeCamera.position.y, 4);
    expect(g3dCamera.position.z).toBeCloseTo(threeCamera.position.z, 4);
    expect(g3dCamera.lookAtCalls.at(-1)).toEqual({ x: 0, y: 0, z: 0 });

    threeControls.dispose();
    expect(dom.listenerCount("pointerdown")).toBe(0);
  });

  it("supports pan, saveState, reset, and disable flags through the public G3D API", () => {
    const camera = createCamera();
    const controls = new OrbitControls(camera, {
      distance: 8,
      target: { x: 1, y: 0, z: -1 },
      panSpeed: 0.01,
      enableRotate: false
    });
    const before = { ...camera.position };
    controls.update(new InputSnapshot({
      pointer: { deltaX: 100, buttons: new Map([[0, { down: true, pressed: true, released: false }]]) }
    }));
    expect(camera.position.x).toBeCloseTo(before.x);
    expect(camera.position.y).toBeCloseTo(before.y);
    expect(camera.position.z).toBeCloseTo(before.z);

    controls.update(new InputSnapshot({
      pointer: { deltaX: 10, deltaY: -5, buttons: new Map([[2, { down: true, pressed: true, released: false }]]) }
    }));
    expect(controls.target.x).toBeCloseTo(0.2);
    expect(controls.target.y).toBeCloseTo(-0.4);
    controls.saveState();

    controls.update(new InputSnapshot({ pointer: { wheelY: 100 } }));
    expect(controls.getDistance()).toBeGreaterThan(8);
    controls.reset();
    expect(controls.target.x).toBeCloseTo(0.2);
    expect(controls.target.y).toBeCloseTo(-0.4);
    expect(controls.getDistance()).toBeCloseTo(8);
  });
});

function createCamera(): { position: { x: number; y: number; z: number }; lookAtCalls: Array<{ x: number; y: number; z: number }>; lookAt(target: { x: number; y: number; z: number }): void } {
  return {
    position: { x: 0, y: 0, z: 10 },
    lookAtCalls: [],
    lookAt(target) {
      this.lookAtCalls.push({ ...target });
    }
  };
}

function pointerEvent(options: Partial<PointerEvent> = {}): PointerEvent {
  return {
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    buttons: 0,
    clientX: 0,
    clientY: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault() {},
    stopPropagation() {},
    ...options
  } as PointerEvent;
}

function wheelEvent(options: Partial<WheelEvent> = {}): WheelEvent {
  return {
    deltaMode: 0,
    deltaY: 0,
    clientX: 0,
    clientY: 0,
    preventDefault() {},
    ...options
  } as WheelEvent;
}

class FakeDomElement {
  readonly style: Record<string, string> = {};
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();
  private readonly root = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  constructor(readonly clientWidth: number, readonly clientHeight: number) {}

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  setPointerCapture(): void {}

  releasePointerCapture(): void {}

  getRootNode(): typeof this.root {
    return this.root;
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight };
  }

  dispatch(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}
