import { describe, expect, it } from "vitest";
import { ForwardPass, Geometry, MockRenderDevice, PBRMaterial, Renderer, UnlitMaterial, type UniformValue } from "../../../packages/rendering/src";
import {
  PerspectiveCamera,
  Renderable,
  Scene,
  identityMat4,
  invertMat4,
  multiplyMat4,
  type Mat4
} from "../../../packages/scene/src";

describe("scene transform uniforms", () => {
  it("emits per-node model, normal, and model-view-projection matrices for scene renderables", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera({ name: "camera", aspect: 1, near: 0.1, far: 100 });
    camera.transform.setPosition(0, 0, 8);
    scene.root.addChild(camera);

    const parent = scene.createNode("parent");
    parent.transform.setPosition(2, 0, 0);
    scene.root.addChild(parent);

    const node = scene.createNode("lit-node");
    node.transform.setPosition(1, 2, -3).setScale(2, 3, 4);
    parent.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:lit-triangle", material: "material:pbr" }));

    const geometry = Geometry.litTriangle();
    renderer.render({
      scene,
      geometryLibrary: { "geometry:lit-triangle": geometry },
      materialLibrary: { "material:pbr": new PBRMaterial() }
    }, camera);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const modelMatrix = node.transform.worldMatrix;
    expect(command?.label).toBe("lit-node");
    expectMatrixClose(command?.uniforms?.get("u_modelViewProjection"), multiplyMat4(camera.viewProjectionMatrix, modelMatrix));
    expectMatrixClose(command?.uniforms?.get("u_normalMatrix"), normalMatrixFromModel(modelMatrix));
    expectVec3Close(command?.uniforms?.get("u_cameraPosition"), [0, 0, 8]);

    renderer.dispose();
    geometry.dispose();
  });

  it("derives a normal matrix for direct ForwardPass PBR items with scaled model matrices", () => {
    const device = new MockRenderDevice();
    const modelMatrix = scaleMatrix(2, 3, 4);

    device.beginFrame(8, 8);
    new ForwardPass({
      items: [{
        geometry: Geometry.litTriangle(),
        material: new PBRMaterial(),
        modelMatrix,
        label: "direct-forward-scaled-pbr"
      }]
    }).execute({ device, width: 8, height: 8 });
    device.endFrame();

    const command = device.drawCommands[0];
    expect(command?.label).toBe("direct-forward-scaled-pbr");
    expectMatrixClose(command?.uniforms?.get("u_normalMatrix"), normalMatrixFromModel(modelMatrix));
  });

  it("derives the PBR camera position from explicit projection and view matrices", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const camera = new PerspectiveCamera({ aspect: 1, near: 0.1, far: 100 });
    camera.transform.setPosition(1.5, 2.25, 6.5);
    camera.updateCameraMatrices();
    const geometry = Geometry.litTriangle();

    renderer.render([{
      geometry,
      material: new PBRMaterial(),
      modelMatrix: identityMat4(),
      label: "explicit-camera-pbr"
    }], {
      projectionMatrix: camera.projectionMatrix,
      viewMatrix: camera.viewMatrix
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(command?.label).toBe("explicit-camera-pbr");
    expectVec3Close(command?.uniforms?.get("u_cameraPosition"), [1.5, 2.25, 6.5]);

    renderer.dispose();
    geometry.dispose();
  });

  it("derives the PBR camera position when a custom camera provides viewProjectionMatrix plus viewMatrix", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const camera = new PerspectiveCamera({ aspect: 1, near: 0.1, far: 100 });
    camera.transform.setPosition(-2.5, 1.25, 9.75);
    camera.updateCameraMatrices();
    const geometry = Geometry.litTriangle();

    renderer.render([{
      geometry,
      material: new PBRMaterial(),
      modelMatrix: identityMat4(),
      label: "view-projection-camera-pbr"
    }], {
      viewProjectionMatrix: camera.viewProjectionMatrix,
      viewMatrix: camera.viewMatrix
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(command?.label).toBe("view-projection-camera-pbr");
    expectVec3Close(command?.uniforms?.get("u_cameraPosition"), [-2.5, 1.25, 9.75]);

    renderer.dispose();
    geometry.dispose();
  });

  it("uses explicit projection and view matrices from the camera contract for render items", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const camera = new PerspectiveCamera({ aspect: 1, near: 0.1, far: 100 });
    camera.transform.setPosition(0, 0, 5);
    camera.updateCameraMatrices();
    const modelMatrix = translationMatrix(0.25, 0.5, -1);

    renderer.render([{
      geometry: Geometry.triangle(),
      material: new UnlitMaterial(),
      modelMatrix,
      label: "camera-contract-triangle"
    }], {
      projectionMatrix: camera.projectionMatrix,
      viewMatrix: camera.viewMatrix
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(command?.label).toBe("camera-contract-triangle");
    expectMatrixClose(command?.uniforms?.get("u_modelViewProjection"), multiplyMat4(camera.viewProjectionMatrix, modelMatrix));

    renderer.dispose();
  });
});

function normalMatrixFromModel(modelMatrix: Mat4): Mat4 {
  const inverse = invertMat4(modelMatrix);
  return [
    inverse[0], inverse[4], inverse[8], 0,
    inverse[1], inverse[5], inverse[9], 0,
    inverse[2], inverse[6], inverse[10], 0,
    0, 0, 0, 1
  ];
}

function translationMatrix(x: number, y: number, z: number): Mat4 {
  const matrix = identityMat4();
  matrix[12] = x;
  matrix[13] = y;
  matrix[14] = z;
  return matrix;
}

function scaleMatrix(x: number, y: number, z: number): Mat4 {
  const matrix = identityMat4();
  matrix[0] = x;
  matrix[5] = y;
  matrix[10] = z;
  return matrix;
}

function expectMatrixClose(actual: UniformValue | undefined, expected: readonly number[]): void {
  expect(actual).toBeInstanceOf(Float32Array);
  const values = Array.from(actual as Float32Array);
  expect(values).toHaveLength(16);
  for (let index = 0; index < expected.length; index += 1) {
    expect(values[index]).toBeCloseTo(expected[index]!, 6);
  }
}

function expectVec3Close(actual: UniformValue | undefined, expected: readonly [number, number, number]): void {
  expect(Array.isArray(actual)).toBe(true);
  const values = actual as readonly number[];
  expect(values).toHaveLength(3);
  for (let index = 0; index < expected.length; index += 1) {
    expect(values[index]).toBeCloseTo(expected[index]!, 6);
  }
}
