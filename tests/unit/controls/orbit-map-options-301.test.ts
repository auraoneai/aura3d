import { describe, expect, it } from "vitest";
import { InputSnapshot, PointerDevice, OrbitControls as InputOrbit } from "@aura3d/input";
import { MapControls, OrbitControls } from "../../../packages/controls/src";

const camera = () => ({ position: { x: 0, y: 0, z: 10 }, fov: 60, aspect: 2, lookAt() {} });
const viewport = () => ({ x: 20, y: 30, width: 800, height: 400 });
const drag = (button: number, deltaX: number, deltaY = 0) => new InputSnapshot({ pointer: {
  deltaX, deltaY, buttons: new Map([[button, { down: true, pressed: true, released: false }]])
} });
const wheel = (wheelY: number, x = 620, y = 230) => new InputSnapshot({ pointer: { wheelY, x, y } });
const touches = (points: number[][]) => new InputSnapshot({ pointer: { touches: points.map(([x, y], id) => ({ id, x: x!, y: y! })) } });
const options = { maxPolar: Math.PI - 0.001, viewport, zoomToCursor: true };

describe("3.0.1 attached Orbit/Map options", () => {
  it("native mouse hover does not masquerade as a touch gesture", () => {
    const pointer = new PointerDevice();
    pointer.move({ clientX: 100, clientY: 200, pointerId: 1, pointerType: "mouse" });
    expect(pointer.snapshotData().pointer.touches).toEqual([]);
    pointer.down({ clientX: 100, clientY: 200, pointerId: 2, pointerType: "touch" });
    expect(pointer.snapshotData().pointer.touches).toHaveLength(1);
    pointer.up({ clientX: 100, clientY: 200, pointerId: 2, pointerType: "touch" });
    expect(pointer.snapshotData().pointer.touches).toEqual([]);
  });
  it.each([OrbitControls, MapControls])("consumes equal damping impulses identically at 30/60/120Hz (%s)", Control => {
    const states = [30, 60, 120].map(hz => {
      const cam = camera();
      const control = new Control(cam, { ...options, enableDamping: true, dampingFactor: 0.08 });
      control.applyInput(drag(Control === MapControls ? 2 : 0, 120, 20), 1 / hz);
      for (let frame = 1; frame < hz; frame++) control.update(1 / hz);
      return { ...cam.position };
    });
    for (const state of states) for (const axis of ["x", "y", "z"] as const) expect(state[axis]).toBeCloseTo(states[0]![axis], 10);
    expect(states[0]!.x).toBeLessThan(-4);
  });

  it.each([OrbitControls, MapControls])("converges after equivalent frame-sampled pan gestures (%s)", Control => {
    const states = [30, 60, 120].map(hz => {
      const control = new Control(camera(), { ...options, enableDamping: true, dampingFactor: 0.08 });
      for (let frame = 0; frame < hz; frame++) control.applyInput(drag(Control === MapControls ? 0 : 2, 120 / hz, 60 / hz), 1 / hz);
      for (let frame = 0; frame < hz; frame++) control.update(1 / hz);
      return [control.state.target.x, control.state.target.y, control.state.target.z];
    });
    for (const state of states) for (let axis = 0; axis < 3; axis++) expect(Math.abs(state[axis]! - states[0]![axis]!)).toBeLessThan(0.0003);
    expect(states[0]![0]).toBeLessThan(-2.39);
  });

  it.each([OrbitControls, MapControls])("keeps a perspective target-plane anchor under the pointer (%s)", Control => {
    const cam = camera();
    const control = new Control(cam, options);
    const anchorX = Math.tan(Math.PI / 6) * 10; // NDC x=.5, aspect=2.
    control.applyInput(wheel(-500));
    const ndcX = (anchorX - cam.position.x) / (control.getDistance() * Math.tan(Math.PI / 6) * 2);
    expect(ndcX).toBeCloseTo(0.5, 10);
    expect(control.state.target.x).toBeGreaterThan(0);
    const centered = new Control(camera(), options);
    centered.applyInput(wheel(-500, 420, 230));
    expect(centered.state.target.x).toBeCloseTo(0, 10);
  });

  it.each([OrbitControls, MapControls])("zooms an orthographic camera about the cursor and restores projection (%s)", Control => {
    let updates = 0;
    const cam = { ...camera(), isOrthographicCamera: true, left: -4, right: 4, top: 2, bottom: -2, zoom: 1, updateProjectionMatrix() { updates++; } };
    const control = new Control(cam, { ...options, minZoom: 0.5, maxZoom: 4 });
    control.saveState();
    control.applyInput(wheel(-500));
    expect((2 - cam.position.x) * cam.zoom / 4).toBeCloseTo(0.5, 10);
    expect(control.getDistance()).toBeCloseTo(10, 10);
    expect(cam.zoom).toBeGreaterThan(1);
    control.applyInput(wheel(-100000));
    expect(cam.zoom).toBe(4);
    control.reset();
    expect(cam.zoom).toBe(1);
    expect(cam.position.x).toBeCloseTo(0, 10);
    expect(updates).toBe(3);
  });

  it("clamps target bounds on every pan/truck/cursor path and cancels outward residual", () => {
    const control = new MapControls(camera(), { ...options, enableDamping: true,
      panBounds: { min: { x: -1, y: 0, z: -2 }, max: { x: 1, y: 0, z: 2 } } });
    control.applyInput(drag(0, 100000, 100000));
    expect(control.state.target.x).toBe(-1);
    expect(control.state.target.z).toBe(2);
    control.truck(100, -100);
    expect(control.state.target.x).toBe(1);
    expect(control.state.target.z).toBe(-2);
    control.update(1);
    expect(control.state.target.x).toBe(1);
    expect(control.state.target.z).toBe(-2);
    expect(control.state.target.y).toBe(0);
    control.reset();
    control.applyInput(wheel(-1000, 20000, 230));
    expect(control.state.target.x).toBe(1);
  });

  it("supports touch rotate, map pan and two-finger pinch without duplicate mouse deltas", () => {
    const orbit = new OrbitControls(camera(), options);
    orbit.applyInput(touches([[100, 100]]));
    orbit.applyInput(touches([[150, 100]]));
    expect(orbit.getAzimuthalAngle()).toBeCloseTo(-0.25, 10);
    const map = new MapControls(camera(), options);
    map.applyInput(touches([[100, 100]]));
    map.applyInput(touches([[150, 120]]));
    expect(map.getAzimuthalAngle()).toBe(0);
    expect(map.state.target.x).toBeLessThan(0);
    expect(map.state.target.z).toBeGreaterThan(0);
    orbit.applyInput(touches([[100, 100], [200, 100]]));
    orbit.applyInput(touches([[50, 100], [250, 100]]));
    expect(orbit.getDistance()).toBeCloseTo(5, 10);
  });

  it("ignores invalid/zero time and input; reset drains residual; disposal cannot be reenabled", () => {
    const cam = camera();
    const orbit = new InputOrbit(cam, { ...options, enableDamping: true });
    const initial = { ...cam.position };
    orbit.update(drag(0, 100), 0);
    orbit.update(drag(0, 100), NaN);
    orbit.update(drag(0, NaN, Infinity));
    orbit.update(wheel(NaN));
    expect(cam.position).toEqual(initial);
    orbit.update(drag(0, 100));
    orbit.reset();
    orbit.update(new InputSnapshot(), 1);
    expect(cam.position).toEqual(initial);
    orbit.update(drag(0, 100));
    orbit.dispose();
    const disposed = { ...cam.position };
    orbit.enabled = true;
    orbit.update(drag(0, 100));
    orbit.reset();
    expect(cam.position).toEqual(disposed);
  });
});
