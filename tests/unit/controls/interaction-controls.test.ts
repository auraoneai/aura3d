import { describe, expect, it } from "vitest";
import { InputSnapshot } from "@aura3d/input";
import {
  ControlVector3,
  InteractionControls,
  type ControlObject3DLike,
  type ControlPickMetadata,
  type InteractionControlsEventType
} from "../../../packages/controls/src";

describe("InteractionControls", () => {
  it("routes pointer input to orbit controls and keyboard input to fly controls", () => {
    const controls = new InteractionControls();

    controls.update(
      snapshot({
        pointer: {
          deltaX: 100,
          deltaY: -20,
          wheelY: -100,
          buttons: new Map([[0, { down: true, pressed: false, released: false }]])
        }
      })
    );
    expect(controls.orbit.state.rotation.y).toBeCloseTo(0.5);
    expect(controls.orbit.state.rotation.x).toBeCloseTo(-0.1);
    expect(controls.orbit.state.position.z).toBeCloseTo(4.5);

    controls.setMode("fly");
    controls.update(snapshot({ keys: new Set(["KeyW", "KeyD"]) }));

    expect(controls.mode).toBe("fly");
    expect(controls.fly.state.position.z).toBe(4);
    expect(controls.fly.state.position.x).toBe(1);
  });

  it("uses the composed picking surface for hover, pick, and hotspot events", () => {
    const hotspot = pickObject("Group", "fallback-hotspot-name", [0, 0, -3], {
      picking: {
        id: "lens-hotspot",
        kind: "hotspot",
        label: "Lens hotspot",
        pickRadius: 0.3
      }
    });
    const scene = pickObject("Scene", "root", [0, 0, 0], { children: [hotspot] });
    const controls = new InteractionControls({ root: scene });
    const events: InteractionControlsEventType[] = [];
    let hotspotCalls = 0;

    controls.subscribe((event) => events.push(event.type));
    controls.onHotspot("lens-hotspot", (event) => {
      hotspotCalls += 1;
      expect(event.hit.object).toBe(hotspot);
      expect(event.hit.metadata?.label).toBe("Lens hotspot");
    });

    const hover = controls.update(snapshot());
    const click = controls.update(
      snapshot({
        pointer: {
          buttons: new Map(),
          x: 5,
          y: 6
        },
        previousPointerButtons: new Set([0])
      })
    );

    expect(hover.hit?.object).toBe(hotspot);
    expect(click.pickReport?.diagnostics.nearestHitLabel).toBe("Lens hotspot");
    expect(hotspotCalls).toBe(1);
    expect(events).toEqual(["hover-enter", "pick", "hotspot-click"]);
  });

  it("supports route-provided rays, roots, and conservative disposal", () => {
    const left = pickObject("Mesh", "left", [-1, 0, -4], { picking: { pickRadius: 0.25 } });
    const right = pickObject("Mesh", "right", [1, 0, -4], { picking: { pickRadius: 0.25 } });
    let scene = pickObject("Scene", "root", [0, 0, 0], { children: [left] });
    const controls = new InteractionControls({
      root: () => scene,
      rayProvider: () => ({
        origin: new ControlVector3(1, 0, 0),
        direction: new ControlVector3(0, 0, -1)
      })
    });

    expect(controls.update(snapshot()).hit).toBeNull();

    scene = pickObject("Scene", "root", [0, 0, 0], { children: [right] });
    expect(controls.update(snapshot()).hit?.object).toBe(right);

    controls.dispose();
    controls.update(snapshot({ keys: new Set(["KeyW"]) }));
    expect(controls.fly.state.position.z).toBe(5);
  });
});

function snapshot(options: ConstructorParameters<typeof InputSnapshot>[0] = {}): InputSnapshot {
  return new InputSnapshot(options);
}

function pickObject(
  type: string,
  name: string,
  position: readonly [number, number, number],
  options: {
    readonly children?: readonly ControlObject3DLike[];
    readonly picking?: ControlPickMetadata;
  } = {}
): ControlObject3DLike {
  return {
    type,
    name,
    position: new ControlVector3(position[0], position[1], position[2]),
    scale: new ControlVector3(1, 1, 1),
    children: options.children,
    picking: options.picking
  };
}
