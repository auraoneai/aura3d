import { describe, expect, it, vi } from "vitest";
import { InputSnapshot } from "@aura3d/input";
import { InputSystem } from "@aura3d/input";
import {
  ArcballControls,
  ControlVector3,
  DragControls,
  FirstPersonControls,
  FlyControls,
  HoverOutline,
  InteractionControls,
  MapControls,
  OrbitControls,
  Picking,
  PointerLockControls,
  SelectionManager,
  TrackballControls,
  TransformControls,
  type ControlObject3DLike
} from "../../../packages/controls/src";

function camera(x = 0, y = 0, z = 5): {
  position: { x: number; y: number; z: number };
  lookAt(target: { x: number; y: number; z: number }): void;
} {
  return {
    position: { x, y, z },
    lookAt(): void {}
  };
}

function sceneObject(name: string, position: readonly [number, number, number] = [0, 0, -3]): ControlObject3DLike {
  return {
    type: "Mesh",
    name,
    position: new ControlVector3(position[0], position[1], position[2]),
    scale: new ControlVector3(1, 1, 1)
  };
}

describe("F1 control disposal", () => {
  it("OrbitControls disposes attached and detached instances to the same standard", () => {
    const cam = camera();
    const attached = new OrbitControls(cam);
    attached.rotate(0.3, 0.1);
    attached.dispose();
    expect(attached.isDisposed).toBe(true);
    expect(attached.isCameraAttached).toBe(false);
    expect(attached.state.enabled).toBe(false);
    const azimuth = attached.getAzimuthalAngle();
    attached.rotate(5, 5);
    attached.pan(5, 5);
    attached.dolly(0.5);
    attached.applyInput(new InputSnapshot());
    attached.reset();
    expect(attached.getAzimuthalAngle()).toBe(azimuth);
    expect(() => attached.dispose()).not.toThrow();
    expect(attached.isDisposed).toBe(true);

    const detached = new OrbitControls();
    detached.rotate(1, 1);
    const rotation = { ...detached.state.rotation };
    detached.dispose();
    expect(detached.isDisposed).toBe(true);
    detached.rotate(4, 4);
    detached.pan(4, 4);
    detached.dolly(0.5);
    expect(detached.state.rotation).toEqual(rotation);
    expect(() => detached.dispose()).not.toThrow();
  });

  it("TrackballControls drains damping velocity on dispose", () => {
    const trackball = new TrackballControls();
    trackball.enableDamping = true;
    trackball.dampingFactor = 0.5;
    trackball.rotate(0.4, 0.2);
    trackball.dispose();
    expect(trackball.isDisposed).toBe(true);
    expect(trackball.update(1 / 60)).toBe(false);
    const rotation = { ...trackball.state.rotation };
    const target = { ...trackball.state.target };
    expect(trackball.update(1 / 60)).toBe(false);
    expect(trackball.state.rotation).toEqual(rotation);
    expect(trackball.state.target).toEqual(target);
    trackball.rotate(1, 1);
    trackball.roll(1);
    expect(trackball.update(1 / 60)).toBe(false);
    expect(() => trackball.dispose()).not.toThrow();
  });

  it("FlyControls and FirstPersonControls ignore movement and look input after dispose", () => {
    const fly = new FlyControls();
    fly.moveForward(1);
    const position = { ...fly.state.position };
    fly.dispose();
    expect(fly.isDisposed).toBe(true);
    expect(fly.enabled).toBe(false);
    fly.moveForward(5);
    fly.strafe(5);
    fly.lift(5);
    fly.applyInput(new InputSnapshot({ keys: new Set(["KeyW"]) }), 1);
    expect(fly.state.position).toEqual(position);
    expect(() => fly.dispose()).not.toThrow();

    const firstPerson = new FirstPersonControls();
    firstPerson.look(0.5, 0.5);
    firstPerson.dispose();
    expect(firstPerson.isDisposed).toBe(true);
    const rotation = { ...firstPerson.state.rotation };
    firstPerson.look(3, 3);
    firstPerson.moveForward(3);
    expect(firstPerson.state.rotation).toEqual(rotation);
  });

  it("MapControls stops trucking after dispose", () => {
    const map = new MapControls();
    map.truck(1, 1);
    map.dispose();
    expect(map.isDisposed).toBe(true);
    expect(map.isCameraAttached).toBe(false);
    const target = { ...map.state.target };
    map.truck(9, 9);
    expect(map.state.target).toEqual(target);
  });

  it("PointerLockControls cannot lock after dispose", () => {
    const controls = new PointerLockControls();
    controls.lock();
    expect(controls.locked).toBe(true);
    controls.unlock();
    controls.dispose();
    expect(controls.isDisposed).toBe(true);
    controls.lock();
    expect(controls.locked).toBe(false);
    expect(() => controls.dispose()).not.toThrow();
  });

  it("DragControls ends the drag and optionally disposes owned transforms", () => {
    const target = sceneObject("drag-target");
    const owned = new DragControls();
    owned.start(target);
    expect(owned.dragging).toBe(target);
    owned.dispose();
    expect(owned.isDisposed).toBe(true);
    expect(owned.dragging).toBeNull();
    expect(owned.transforms.object).toBeNull();
    expect(owned.transforms.isDisposed).toBe(true);
    owned.start(target);
    expect(owned.dragging).toBeNull();
    expect(() => owned.dispose()).not.toThrow();

    const shared = new TransformControls();
    const shim = new DragControls({ transforms: shared });
    shim.start(target);
    shim.dispose();
    expect(shim.isDisposed).toBe(true);
    // Caller-supplied helpers stay alive for their owner by default.
    expect(shared.isDisposed).toBe(false);
    expect(shared.object).toBeNull();
  });

  it("TransformControls refuses pointer and delta entry after dispose", () => {
    const controls = new TransformControls({ mode: "translate" });
    const target = {
      position: new ControlVector3(0, 0, 0),
      rotation: new ControlVector3(0, 0, 0),
      scale: new ControlVector3(1, 1, 1)
    };
    controls.attach(target);
    controls.place([0, 0, 0]);
    controls.dispose();
    expect(controls.isDisposed).toBe(true);
    expect(controls.object).toBeNull();
    expect(
      controls.pointerDown({ origin: new ControlVector3(0.6, 0, 5), direction: new ControlVector3(0, 0, -1) })
    ).toBe(false);
    controls.apply(new ControlVector3(4, 4, 4));
    expect(target.position).toEqual(new ControlVector3(0, 0, 0));
    expect(() => controls.dispose()).not.toThrow();
  });

  it("InteractionControls goes silent after dispose", () => {
    const target = sceneObject("hover-target");
    const scene: ControlObject3DLike = {
      type: "Scene",
      name: "root",
      position: new ControlVector3(),
      children: [target]
    };
    const controls = new InteractionControls({ root: scene });
    const events: string[] = [];
    controls.subscribe((event) => events.push(event.type));
    expect(controls.update(new InputSnapshot()).hit?.object).toBe(target);
    controls.dispose();
    expect(controls.isDisposed).toBe(true);
    const eventCount = events.length;
    controls.setMode("fly");
    expect(controls.mode).toBe("orbit");
    const update = controls.update(new InputSnapshot());
    expect(update.hit).toBeNull();
    expect(events).toHaveLength(eventCount);
    expect(() => controls.dispose()).not.toThrow();
  });

  it("SelectionManager drops listeners and selection on dispose and stays re-mountable", () => {
    const selection = new SelectionManager();
    const first = sceneObject("first");
    const seen: number[] = [];
    selection.subscribe(() => seen.push(1));
    selection.select(first);
    expect(seen).toHaveLength(1);
    selection.dispose();
    expect(selection.isDisposed).toBe(true);
    expect(selection.current()).toEqual([]);
    selection.select(first);
    // No listener survived disposal, so the re-mounted selection stays silent.
    expect(seen).toHaveLength(1);
    expect(selection.current()).toEqual([first]);
    expect(() => selection.dispose()).not.toThrow();
  });

  it("proves no control owns DOM listeners across mount/update/dispose cycles", () => {
    const scope = globalThis as unknown as Record<string, unknown>;
    const originalAdd = scope.addEventListener;
    const originalRemove = scope.removeEventListener;
    if (typeof originalAdd !== "function") scope.addEventListener = () => {};
    if (typeof originalRemove !== "function") scope.removeEventListener = () => {};
    const added = vi.spyOn(scope as unknown as EventTarget, "addEventListener");
    const removed = vi.spyOn(scope as unknown as EventTarget, "removeEventListener");
    try {
      for (let cycle = 0; cycle < 10; cycle += 1) {
        const orbit = new OrbitControls(camera());
        orbit.rotate(0.1, 0.1);
        orbit.applyInput(new InputSnapshot());
        orbit.dispose();
        const trackball = new TrackballControls();
        trackball.rotate(0.1, 0.1);
        trackball.update(1 / 60);
        trackball.dispose();
        const fly = new FlyControls();
        fly.moveForward(0.5);
        fly.dispose();
        const firstPerson = new FirstPersonControls();
        firstPerson.look(0.1, 0.1);
        firstPerson.dispose();
        const map = new MapControls();
        map.truck(0.5, 0.5);
        map.dispose();
        const pointerLock = new PointerLockControls();
        pointerLock.lock();
        pointerLock.dispose();
        const drag = new DragControls();
        drag.start(sceneObject(`drag-${cycle}`));
        drag.drag(new ControlVector3(1, 0, 0));
        drag.dispose();
        const transform = new TransformControls();
        transform.attach(sceneObject(`target-${cycle}`));
        transform.apply(new ControlVector3(1, 0, 0));
        transform.dispose();
        const interaction = new InteractionControls();
        const unsubscribe = interaction.subscribe(() => {});
        interaction.update(new InputSnapshot());
        unsubscribe();
        interaction.dispose();
        const selection = new SelectionManager();
        const release = selection.subscribe(() => {});
        selection.select(sceneObject(`selected-${cycle}`));
        release();
        selection.dispose();
        const arcball = new ArcballControls(camera());
        arcball.rotate(1, 1);
        arcball.dispose();
        const outline = new HoverOutline();
        outline.setHovered(sceneObject(`hover-${cycle}`));
        outline.dispose();
        new Picking().pick({
          type: "Scene",
          name: "root",
          position: new ControlVector3(),
          children: [sceneObject(`pick-${cycle}`)]
        });
      }
      expect(added).not.toHaveBeenCalled();
      expect(removed).not.toHaveBeenCalled();
    } finally {
      added.mockRestore();
      removed.mockRestore();
      if (typeof originalAdd !== "function") delete scope.addEventListener;
      if (typeof originalRemove !== "function") delete scope.removeEventListener;
    }
  });

  it("repeated mount/dispose cycles accumulate no listeners and stay silent", () => {
    const events: string[] = [];
    for (let cycle = 0; cycle < 25; cycle += 1) {
      const controls = new InteractionControls();
      controls.subscribe((event) => events.push(event.type));
      controls.onHotspot("hotspot", () => events.push("hotspot-click"));
      controls.update(new InputSnapshot());
      controls.dispose();
      // Post-dispose updates must not emit into the shared log.
      controls.update(new InputSnapshot());
      const selection = new SelectionManager();
      selection.subscribe(() => events.push("selection"));
      selection.select(sceneObject(`cycle-${cycle}`));
      selection.dispose();
      selection.select(sceneObject(`after-${cycle}`));
    }
    // Exactly one live selection event per cycle: post-dispose selects stay silent.
    expect(events.filter((type) => type === "selection")).toHaveLength(25);
  });

  it("InputSystem removes every DOM listener it adds on dispose", () => {
    const added = new Map<string, number>();
    const removed = new Map<string, number>();
    const target = {
      addEventListener(type: string, _listener: EventListener): void {
        added.set(type, (added.get(type) ?? 0) + 1);
      },
      removeEventListener(type: string, _listener: EventListener): void {
        removed.set(type, (removed.get(type) ?? 0) + 1);
      }
    };
    const system = new InputSystem(target);
    system.dispose();
    expect(added.size).toBeGreaterThan(0);
    expect([...added.entries()]).toEqual(expect.arrayContaining([...removed.entries()]));
    for (const [type, count] of added) {
      expect(removed.get(type)).toBe(count);
    }
    expect(() => system.dispose()).not.toThrow();
  });
});
