import { describe, expect, it } from "vitest";
import { Scene } from "@galileo3d/scene";
import { CameraRig, EditorFlyControls, FirstPersonControls, InputSnapshot, InputSystem, OrbitControls, createSceneCameraControlAdapter } from "@galileo3d/input";
import { Quaternion, Vector3 } from "@galileo3d/math";

function snapshot(options: ConstructorParameters<typeof InputSnapshot>[0] = {}): InputSnapshot {
  return new InputSnapshot(options);
}

function quatTuple(q: Quaternion): [number, number, number, number] {
  return [q.x, q.y, q.z, q.w];
}

describe("camera controls scene camera contracts", () => {
  it("adapts scene cameras to orbit controls without renderer or DOM coupling", () => {
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera();
    scene.root.addChild(camera);
    const adapter = createSceneCameraControlAdapter(camera);
    const controls = new OrbitControls(adapter, { distance: 10, target: { x: 0, y: 0, z: 0 } });

    expect(camera.transform.position).toEqual([0, expect.closeTo(0), 10]);

    controls.update(snapshot({ pointer: { deltaX: 100, deltaY: 20, buttons: new Map([[0, { down: true, pressed: false, released: false }]]) } }));

    expect(camera.transform.position[0]).not.toBe(0);
    expect(camera.transform.position[1]).not.toBe(0);
    expect(camera.transform.rotation).not.toEqual([0, 0, 0, 1]);
  });

  it("adapts scene cameras to first-person movement and pitch/yaw clamps", () => {
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera();
    scene.root.addChild(camera);
    const adapter = createSceneCameraControlAdapter(camera);
    const controls = new FirstPersonControls(adapter, { moveSpeed: 2, lookSpeed: 0.01 });

    controls.update(
      snapshot({
        keys: new Set(["KeyW", "KeyD"]),
        pointer: { deltaX: 5, deltaY: 10, buttons: new Map([[0, { down: true, pressed: false, released: false }]]) }
      }),
      0.5
    );

    expect(camera.transform.position[0]).toBeGreaterThan(0);
    expect(camera.transform.position[2]).toBeGreaterThan(0);
    expect(camera.transform.rotation).not.toEqual([0, 0, 0, 1]);
  });

  it("camera rig blends and applies scene camera states through the adapter", () => {
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera();
    scene.root.addChild(camera);
    const adapter = createSceneCameraControlAdapter(camera);
    const rig = new CameraRig(adapter);

    const blended = rig.blend(
      { position: { x: 0, y: 0, z: 10 }, target: { x: 0, y: 0, z: 0 } },
      { position: { x: 10, y: 4, z: 0 }, target: { x: 1, y: 1, z: 1 } },
      0.25
    );
    rig.apply(blended);

    expect(camera.transform.position).toEqual([2.5, 1, 7.5]);
    expect(camera.transform.rotation).not.toEqual([0, 0, 0, 1]);
  });

  it("adapters initialize and maintain rotation state from an existing scene camera", () => {
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera();
    camera.transform.setRotation(...quatTuple(Quaternion.fromAxisAngle(Vector3.up, Math.PI / 2)));
    const adapter = createSceneCameraControlAdapter(camera);

    expect(adapter.rotation.y).toBeCloseTo(Math.PI / 2);

    adapter.lookAt({ x: 0, y: 0, z: -1 });
    expect(adapter.rotation.y).toBeCloseTo(0);
    expect(camera.transform.rotation).toEqual([0, 0, 0, 1]);
  });

  it("first-person controls inherit adapter yaw instead of snapping to zero", () => {
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera();
    camera.transform.setRotation(...quatTuple(Quaternion.fromAxisAngle(Vector3.up, Math.PI / 2)));
    const controls = new FirstPersonControls(createSceneCameraControlAdapter(camera), { moveSpeed: 1 });

    controls.update(snapshot({ keys: new Set(["KeyW"]) }), 1);

    expect(camera.transform.position[0]).toBeCloseTo(1);
    expect(camera.transform.position[2]).toBeCloseTo(0);
  });

  it("disposed controls stop mutating scene cameras", () => {
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera();
    const controls = new OrbitControls(createSceneCameraControlAdapter(camera), { distance: 5 });
    const before = [...camera.transform.position];

    controls.dispose();
    controls.update(snapshot({ pointer: { deltaX: 100, buttons: new Map([[0, { down: true, pressed: false, released: false }]]) } }));

    expect(camera.transform.position).toEqual(before);
  });

  it("keeps camera update order explicit from input snapshot through scene world matrix", () => {
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera();
    scene.root.addChild(camera);
    const controls = new FirstPersonControls(createSceneCameraControlAdapter(camera), { moveSpeed: 2, lookSpeed: 0.01 });

    controls.update(snapshot({ keys: new Set(["KeyW"]) }), 0.5);
    expect(camera.transform.isDirty()).toBe(true);

    scene.updateWorldTransforms();
    expect(camera.transform.isDirty()).toBe(false);
    expect(camera.transform.worldMatrix[14]).toBeGreaterThan(0);
  });

  it("input targets attach once and dispose removes each camera-control listener once", () => {
    const active = new Map<string, Set<EventListener>>();
    const target = {
      addEventListener(type: string, listener: EventListener) {
        const listeners = active.get(type) ?? new Set<EventListener>();
        listeners.add(listener);
        active.set(type, listeners);
      },
      removeEventListener(type: string, listener: EventListener) {
        active.get(type)?.delete(listener);
      }
    };
    const input = new InputSystem(target);

    input.attach(target);
    expect([...active.values()].map((listeners) => listeners.size)).toEqual([1, 1, 1, 1, 1, 1, 1]);

    input.dispose();
    expect([...active.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });

  it("editor fly controls provide editor camera navigation without DOM coupling", () => {
    const camera = {
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }
    };
    const controls = new EditorFlyControls(camera, { baseSpeed: 2, fastMultiplier: 3, lookSpeed: 0.01 });

    controls.update(
      snapshot({
        keys: new Set(["KeyW", "KeyE", "ShiftLeft"]),
        pointer: { deltaX: 8, deltaY: -4, buttons: new Map([[1, { down: true, pressed: false, released: false }]]) }
      }),
      0.5
    );

    expect(camera.position.y).toBeGreaterThan(1);
    expect(camera.position.z).toBeGreaterThan(0);
    expect(camera.rotation.x).not.toBe(0);
    expect(camera.rotation.y).not.toBe(0);

    controls.dispose();
    const before = { ...camera.position };
    controls.update(snapshot({ keys: new Set(["KeyW"]) }), 1);
    expect(camera.position).toEqual(before);
  });
});
