import { describe, expect, it } from "vitest";
import {
  DragControls,
  FirstPersonControls,
  FlyControls,
  MapControls,
  MeshCompat,
  OrbitControls,
  Picking,
  PointerLockControls,
  SceneCompat,
  SelectionManager,
  TrackballControls,
  TransformControls,
  Vector3Compat
} from "../../../packages/three-compat/src";

describe("ThreeCompat controls", () => {
  it("covers orbit, pan, zoom, fly, first-person, drag, transform, picking, and selection", () => {
    const scene = new SceneCompat();
    const mesh = new MeshCompat();
    mesh.position.set(0, 0, -5);
    scene.add(mesh);

    const orbit = new OrbitControls();
    orbit.rotate(0.2, 0.1);
    orbit.pan(1, 2);
    orbit.dolly(0.5);
    const trackball = new TrackballControls();
    trackball.roll(0.25);
    const map = new MapControls();
    map.truck(3, 4);
    const fly = new FlyControls();
    fly.moveForward(4);
    fly.strafe(2);
    const firstPerson = new FirstPersonControls();
    firstPerson.look(0.1, 0.2);
    const pointerLock = new PointerLockControls();
    pointerLock.lock();
    pointerLock.look(0.3, 0.4);
    const drag = new DragControls();
    drag.start(mesh);
    drag.drag(new Vector3Compat(1, 0, 0));
    drag.end();
    const transform = new TransformControls();
    transform.attach(mesh);
    transform.setMode("rotate");
    transform.apply(new Vector3Compat(0, 0.5, 0));
    transform.setMode("scale");
    transform.apply(new Vector3Compat(1, 1, 1));
    const hit = new Picking().pick(scene);
    const selection = new SelectionManager();
    if (hit) selection.select(hit.object);

    expect(orbit.state.position.z).toBe(2.5);
    expect(trackball.state.rotation.z).toBe(0.25);
    expect(map.state.target.z).toBe(4);
    expect(fly.state.position.z).toBe(1);
    expect(firstPerson.state.rotation.x).toBe(0.2);
    expect(pointerLock.locked).toBe(true);
    expect(mesh.position.x).toBe(1);
    expect(mesh.rotation.y).toBe(0.5);
    expect(mesh.scale.x).toBe(2);
    expect(hit?.object).toBe(mesh);
    expect(selection.selected.has(mesh)).toBe(true);
  });

  it("applies trackball damping and keyboard pan, roll, and dolly controls", () => {
    const trackball = new TrackballControls();
    trackball.enableDamping = true;
    trackball.dampingFactor = 0.5;
    trackball.keyPanSpeed = 0.2;
    trackball.keyRollSpeed = 0.1;

    trackball.rotate(0.4, 0.2);
    trackball.pan(0.2, -0.1);
    trackball.dolly(0.8);
    trackball.handleKey("ArrowRight");
    trackball.handleKey("KeyE");
    trackball.handleKey("=");
    const before = {
      rotationX: trackball.state.rotation.x,
      rotationZ: trackball.state.rotation.z,
      targetX: trackball.state.target.x,
      positionZ: trackball.state.position.z
    };
    const active = trackball.update(1 / 60);

    expect(active).toBe(true);
    expect(trackball.state.rotation.x).toBeGreaterThan(before.rotationX);
    expect(trackball.state.rotation.z).toBeGreaterThan(before.rotationZ);
    expect(trackball.state.target.x).toBeGreaterThan(before.targetX);
    expect(trackball.state.position.z).toBeLessThan(before.positionZ);
  });
});
