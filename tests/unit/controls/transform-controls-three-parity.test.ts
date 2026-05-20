// @ts-nocheck
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ControlVector3, TransformControls } from "../../../packages/controls/src";

describe("TransformControls bounded Three.js parity", () => {
  it("applies translate, rotate, and scale deltas to an attached object like Three.Object3D transform mutation", () => {
    const g3dObject = {
      position: new ControlVector3(0, 0, -5),
      rotation: new ControlVector3(0, 0, 0),
      scale: new ControlVector3(1, 1, 1)
    };
    const threeObject = new THREE.Object3D();
    threeObject.position.set(0, 0, -5);
    threeObject.rotation.set(0, 0, 0);
    threeObject.scale.set(1, 1, 1);
    const controls = new TransformControls();
    controls.attach(g3dObject);

    controls.setMode("translate");
    controls.apply(new ControlVector3(0.25, 0.5, -0.1));
    threeObject.position.add(new THREE.Vector3(0.25, 0.5, -0.1));

    controls.setMode("rotate");
    controls.apply(new ControlVector3(0, 0.35, 0));
    threeObject.rotation.y += 0.35;

    controls.setMode("scale");
    controls.apply(new ControlVector3(0.2, 0.1, 0.3));
    threeObject.scale.add(new THREE.Vector3(0.2, 0.1, 0.3));

    expect(g3dObject.position.x).toBeCloseTo(threeObject.position.x);
    expect(g3dObject.position.y).toBeCloseTo(threeObject.position.y);
    expect(g3dObject.position.z).toBeCloseTo(threeObject.position.z);
    expect(g3dObject.rotation.y).toBeCloseTo(threeObject.rotation.y);
    expect(g3dObject.scale.x).toBeCloseTo(threeObject.scale.x);
    expect(g3dObject.scale.y).toBeCloseTo(threeObject.scale.y);
    expect(g3dObject.scale.z).toBeCloseTo(threeObject.scale.z);

    controls.detach();
    controls.apply(new ControlVector3(1, 1, 1));
    expect(g3dObject.position.x).toBeCloseTo(0.25);
  });
});
