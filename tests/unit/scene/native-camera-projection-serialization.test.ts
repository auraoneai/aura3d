import { describe, expect, it } from "vitest";
import { Vector3 } from "@aura3d/math";
import {
  deserializeScene,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  serializeScene,
  type SerializedScene
} from "../../../packages/scene/src/index";

const leftTile = { fullWidth: 800, fullHeight: 400, x: 0, y: 0, width: 400, height: 400 };
const rightTile = { ...leftTile, x: 400 };

function project(matrix: ArrayLike<number>, x: number, y: number, z: number): readonly [number, number, number] {
  const w = matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!;
  return [
    (matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!) / w,
    (matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!) / w,
    (matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!) / w
  ];
}

function expectSameMatrix(actual: ArrayLike<number>, expected: ArrayLike<number>): void {
  expect(actual.length).toBe(16);
  expect(expected.length).toBe(16);
  for (let index = 0; index < 16; index += 1) expect(actual[index]).toBeCloseTo(expected[index]!, 9);
}

function finiteJsonRoundTrip(scene: Scene): SerializedScene {
  return JSON.parse(JSON.stringify(serializeScene(scene))) as SerializedScene;
}

describe("scene camera projection serialization", () => {
  it("round-trips perspective and orthographic tiles, physical lens and depth through version-1 JSON", () => {
    const scene = new Scene();
    const perspectiveOptions = {
      fovYRadians: 0.7, aspect: 0.75, near: 1, far: 20,
      focalLength: 50, filmGauge: 36, filmOffset: 9,
      depth: { mode: "reversed" as const, clipRange: "zero-to-one" as const }
    };
    const orthographicOptions = {
      left: -5, right: 3, bottom: -2, top: 2, near: -2, far: 20, zoom: 2,
      depth: { mode: "reversed" as const, clipRange: "zero-to-one" as const }
    };
    const perspectiveLeft = scene.createPerspectiveCamera({ ...perspectiveOptions, id: "perspective-left", viewOffset: leftTile });
    const perspectiveRight = scene.createPerspectiveCamera({ ...perspectiveOptions, id: "perspective-right", viewOffset: rightTile });
    const orthographicLeft = scene.createOrthographicCamera({ ...orthographicOptions, id: "orthographic-left", viewOffset: leftTile });
    const orthographicRight = scene.createOrthographicCamera({ ...orthographicOptions, id: "orthographic-right", viewOffset: rightTile });
    perspectiveLeft.setViewport({ x: 1, y: 2, width: 400, height: 400 });
    for (const camera of [perspectiveLeft, perspectiveRight, orthographicLeft, orthographicRight]) scene.root.addChild(camera);

    const document = finiteJsonRoundTrip(scene);
    expect(document.version).toBe(1);
    expect(document.root.children[0]!.camera).toMatchObject({
      fovYRadians: perspectiveLeft.fovYRadians,
      authoredFovYRadians: 0.7,
      focalLength: 50, filmGauge: 36, filmOffset: 9,
      depth: { mode: "reversed", clipRange: "zero-to-one" }, viewOffset: leftTile
    });
    const restored = deserializeScene(document);
    const restoredPerspectiveLeft = restored.getNodeById("perspective-left") as PerspectiveCamera;
    const restoredPerspectiveRight = restored.getNodeById("perspective-right") as PerspectiveCamera;
    const restoredOrthographicLeft = restored.getNodeById("orthographic-left") as OrthographicCamera;
    const restoredOrthographicRight = restored.getNodeById("orthographic-right") as OrthographicCamera;
    expect(restoredPerspectiveLeft).toBeInstanceOf(PerspectiveCamera);
    expect(restoredOrthographicLeft).toBeInstanceOf(OrthographicCamera);
    expect(restoredPerspectiveLeft.viewport).toEqual({ x: 1, y: 2, width: 400, height: 400 });

    const originals = [perspectiveLeft, perspectiveRight, orthographicLeft, orthographicRight];
    const copies = [restoredPerspectiveLeft, restoredPerspectiveRight, restoredOrthographicLeft, restoredOrthographicRight];
    for (let index = 0; index < originals.length; index += 1) {
      const original = originals[index]!;
      const copy = copies[index]!;
      expect(copy.projectionMetadata).toEqual(original.projectionMetadata);
      expectSameMatrix(copy.projectionMatrix, original.projectionMatrix);
      expectSameMatrix(copy.projectionMatrixInverse, original.projectionMatrixInverse);
      for (const point of [new Vector3(-1, 0, -5), new Vector3(0.1, 0, -5), new Vector3(100, 0, -5)]) {
        expect(copy.frustum.containsPoint(point)).toBe(original.frustum.containsPoint(point));
      }
    }

    // The film-shifted perspective seam is x=0.9 at z=-5.
    expect(project(restoredPerspectiveLeft.projectionMatrix, 0.9, 0, -5)[0]).toBeCloseTo(1, 7);
    expect(project(restoredPerspectiveRight.projectionMatrix, 0.9, 0, -5)[0]).toBeCloseTo(-1, 7);
    // The asymmetric orthographic bounds are cropped after the existing zoom.
    expect(project(restoredOrthographicLeft.projectionMatrix, -0.5, 0, -5)[0]).toBeCloseTo(1, 7);
    expect(project(restoredOrthographicRight.projectionMatrix, -0.5, 0, -5)[0]).toBeCloseTo(-1, 7);

    perspectiveLeft.clearViewOffset();
    restoredPerspectiveLeft.clearViewOffset();
    expectSameMatrix(restoredPerspectiveLeft.projectionMatrix, perspectiveLeft.projectionMatrix);
    perspectiveLeft.focalLength = undefined;
    restoredPerspectiveLeft.focalLength = undefined;
    perspectiveLeft.updateCameraMatrices();
    restoredPerspectiveLeft.updateCameraMatrices();
    expect(restoredPerspectiveLeft.fovYRadians).toBeCloseTo(0.7, 9);
    expectSameMatrix(restoredPerspectiveLeft.projectionMatrix, perspectiveLeft.projectionMatrix);
  });

  it("keeps legacy version-1 and explicitly undefined fields at their prior defaults", () => {
    const scene = new Scene();
    const perspective = scene.createPerspectiveCamera({ id: "legacy-perspective", fovYRadians: 0.8, aspect: 1.5, near: 0.2, far: 50 });
    const orthographic = scene.createOrthographicCamera({ id: "legacy-orthographic", left: -3, right: 5, bottom: -2, top: 2, near: 0, far: 50 });
    scene.root.addChild(perspective);
    scene.root.addChild(orthographic);
    const document = finiteJsonRoundTrip(scene);
    const newFields = ["viewOffset", "depth", "focalLength", "filmGauge", "filmOffset", "authoredFovYRadians"];
    for (const child of document.root.children) {
      for (const field of newFields) expect(child.camera).not.toHaveProperty(field);
    }

    const legacy = deserializeScene(document);
    const legacyPerspective = legacy.getNodeById("legacy-perspective") as PerspectiveCamera;
    const legacyOrthographic = legacy.getNodeById("legacy-orthographic") as OrthographicCamera;
    expectSameMatrix(legacyPerspective.projectionMatrix, perspective.projectionMatrix);
    expectSameMatrix(legacyOrthographic.projectionMatrix, orthographic.projectionMatrix);
    expect(legacyPerspective.depth).toEqual({ mode: "standard", clipRange: "minus-one-to-one" });
    expect(legacyPerspective.focalLength).toBeUndefined();
    expect(legacyPerspective.filmGauge).toBe(35);
    expect(legacyPerspective.filmOffset).toBe(0);

    for (const child of document.root.children) {
      Object.assign(child.camera!, { viewOffset: undefined, depth: undefined, focalLength: undefined,
        filmGauge: undefined, filmOffset: undefined, authoredFovYRadians: undefined });
    }
    const withUndefined = deserializeScene(document);
    expectSameMatrix((withUndefined.getNodeById("legacy-perspective") as PerspectiveCamera).projectionMatrix, perspective.projectionMatrix);
    expectSameMatrix((withUndefined.getNodeById("legacy-orthographic") as OrthographicCamera).projectionMatrix, orthographic.projectionMatrix);

    document.root.children[0]!.camera = undefined;
    const withoutPayload = deserializeScene(document).getNodeById("legacy-perspective") as PerspectiveCamera;
    expect(withoutPayload).toMatchObject({ aspect: 1, near: 0.1, far: 1000, focalLength: undefined, filmGauge: 35, filmOffset: 0 });
    expect(withoutPayload.fovYRadians).toBeCloseTo(Math.PI / 3);
  });

  it("retains every supported scene-camera depth mode and clip interval", () => {
    for (const mode of ["standard", "reversed", "logarithmic"] as const) {
      for (const clipRange of ["minus-one-to-one", "zero-to-one"] as const) {
        const scene = new Scene();
        const depth = { mode, clipRange };
        const perspective = scene.createPerspectiveCamera({ id: "depth-perspective", near: 1, far: 100, viewOffset: leftTile, depth });
        const orthographic = scene.createOrthographicCamera({ id: "depth-orthographic", near: 1, far: 100, viewOffset: rightTile, depth });
        scene.root.addChild(perspective);
        scene.root.addChild(orthographic);
        const restored = deserializeScene(finiteJsonRoundTrip(scene));
        const restoredPerspective = restored.getNodeById("depth-perspective") as PerspectiveCamera;
        const restoredOrthographic = restored.getNodeById("depth-orthographic") as OrthographicCamera;
        expect(restoredPerspective.projectionMetadata).toMatchObject(depth);
        expect(restoredOrthographic.projectionMetadata).toMatchObject(depth);
        expectSameMatrix(restoredPerspective.projectionMatrix, perspective.projectionMatrix);
        expectSameMatrix(restoredOrthographic.projectionMatrix, orthographic.projectionMatrix);
      }
    }
  });

  it("retains effective FOV for readers that do not recognize the optional lens fields", () => {
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera({ id: "physical", fovYRadians: 0.7, aspect: 2, focalLength: 50, filmGauge: 36 });
    scene.root.addChild(camera);
    const document = finiteJsonRoundTrip(scene);
    const payload = document.root.children[0]!.camera!;
    delete payload.authoredFovYRadians;
    delete payload.focalLength;
    delete payload.filmGauge;
    delete payload.filmOffset;
    const legacyReader = deserializeScene(document).getNodeById("physical") as PerspectiveCamera;
    expect(legacyReader.fovYRadians).toBeCloseTo(camera.fovYRadians, 9);
    expect(legacyReader.focalLength).toBeUndefined();
  });

  it("preserves an inactive finite FOV until a focal-length override is removed", () => {
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera({ id: "inactive-fov", fovYRadians: 0, focalLength: 50 });
    scene.root.addChild(camera);
    const restored = deserializeScene(finiteJsonRoundTrip(scene)).getNodeById("inactive-fov") as PerspectiveCamera;
    expectSameMatrix(restored.projectionMatrix, camera.projectionMatrix);
    camera.focalLength = undefined;
    restored.focalLength = undefined;
    expect(restored.fovYRadians).toBe(camera.fovYRadians);
    expect(restored.fovYRadians).toBe(0);
    expect(() => camera.updateCameraMatrices()).toThrow(/fov/i);
    expect(() => restored.updateCameraMatrices()).toThrow(/fov/i);
  });

  it("copies projection objects on serialization and deserialization", () => {
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera({ id: "copy", viewOffset: leftTile, depth: { mode: "reversed" } });
    scene.root.addChild(camera);
    const document = serializeScene(scene);
    const payload = document.root.children[0]!.camera!;
    expect(payload.viewOffset).not.toBe(camera.viewOffset);
    expect(payload.depth).not.toBe(camera.depth);
    payload.viewOffset!.x = 400;
    payload.depth!.mode = "standard";
    expect(camera.viewOffset!.x).toBe(0);
    expect(camera.depth.mode).toBe("reversed");

    const restored = deserializeScene(document).getNodeById("copy") as PerspectiveCamera;
    expect(restored.viewOffset).not.toBe(payload.viewOffset);
    expect(restored.depth).not.toBe(payload.depth);
    payload.viewOffset!.x = 0;
    payload.depth!.mode = "reversed";
    expect(restored.viewOffset!.x).toBe(400);
    expect(restored.depth.mode).toBe("standard");
  });

  it("rejects malformed optional projection fields instead of defaulting or dropping them", () => {
    const scene = new Scene();
    scene.root.addChild(scene.createPerspectiveCamera({ id: "validation" }));
    const original = finiteJsonRoundTrip(scene);
    const invalidCases: readonly { field: string; value: unknown; message: RegExp }[] = [
      { field: "viewOffset", value: null, message: /viewOffset/ },
      { field: "viewOffset", value: { ...leftTile, x: 401 }, message: /offset/i },
      { field: "depth", value: null, message: /depth/i },
      { field: "depth", value: { mode: null }, message: /depth mode/i },
      { field: "depth", value: { clipRange: "other" }, message: /clipRange/i },
      { field: "focalLength", value: 0, message: /focalLength/ },
      { field: "filmGauge", value: null, message: /filmGauge/ },
      { field: "filmOffset", value: Infinity, message: /filmOffset/ },
      { field: "authoredFovYRadians", value: Math.PI, message: /authoredFovYRadians/ }
    ];
    for (const { field, value, message } of invalidCases) {
      const document = structuredClone(original);
      (document.root.children[0]!.camera! as unknown as Record<string, unknown>)[field] = value;
      expect(() => deserializeScene(document)).toThrow(message);
    }

    const orthographicScene = new Scene();
    orthographicScene.root.addChild(orthographicScene.createOrthographicCamera());
    const invalidOrthographic = finiteJsonRoundTrip(orthographicScene);
    invalidOrthographic.root.children[0]!.camera!.filmOffset = 1;
    expect(() => deserializeScene(invalidOrthographic)).toThrow(/perspective camera/i);
  });
});

describe("version-1 infinite camera far plane", () => {
  it("round-trips JSON-safe infinite perspective cameras and fails closed for the old reader", () => {
    for (const mode of ["standard", "reversed"] as const) {
      for (const clipRange of ["minus-one-to-one", "zero-to-one"] as const) {
        const scene = new Scene();
        const camera = scene.createPerspectiveCamera({
          id: "infinite", fovYRadians: 0.7, aspect: 0.75, near: 1, far: Infinity,
          focalLength: 50, filmGauge: 36, filmOffset: 9,
          viewOffset: leftTile, depth: { mode, clipRange }
        });
        scene.root.addChild(camera);
        const serialized = serializeScene(scene);
        const directPayload = serialized.root.children[0]!.camera!;
        // The returned data object has the same explicit shape as its JSON.
        expect(directPayload).toMatchObject({ far: -1, infiniteFar: true });
        const document = JSON.parse(JSON.stringify(serialized)) as SerializedScene;
        const payload = document.root.children[0]!.camera!;
        expect(payload).toMatchObject({ far: -1, infiniteFar: true });

        // The old version-1 reader ignored the marker and passed `far` to
        // this constructor. The sentinel must fail rather than become 1000.
        expect(() => new PerspectiveCamera({
          fovYRadians: payload.fovYRadians, aspect: payload.aspect, near: payload.near, far: payload.far
        })).toThrow(/far/i);

        const restored = deserializeScene(document).getNodeById("infinite") as PerspectiveCamera;
        expect(restored.far).toBe(Infinity);
        expect(restored.projectionMetadata).toMatchObject({ far: Infinity, mode, clipRange, viewOffset: leftTile });
        expect(restored.frustum.activePlanes).toHaveLength(5);
        expectSameMatrix(restored.projectionMatrix, camera.projectionMatrix);
        expectSameMatrix(restored.projectionMatrixInverse, camera.projectionMatrixInverse);
        expect(camera.frustum.containsPoint(new Vector3(0, 0, -1e9))).toBe(true);
        expect(restored.frustum.containsPoint(new Vector3(0, 0, -1e9))).toBe(true);
      }
    }
  });

  it("keeps legacy finite, missing, and direct-object Infinity inputs distinct", () => {
    const scene = new Scene();
    scene.root.addChild(scene.createPerspectiveCamera({ id: "legacy-far", near: 1, far: 200 }));
    const document = serializeScene(scene);
    const payload = document.root.children[0]!.camera!;
    expect(payload.far).toBe(200);
    expect(payload).not.toHaveProperty("infiniteFar");
    expect((deserializeScene(document).getNodeById("legacy-far") as PerspectiveCamera).far).toBe(200);

    payload.far = Infinity;
    const direct = deserializeScene(document).getNodeById("legacy-far") as PerspectiveCamera;
    expect(direct.far).toBe(Infinity);
    expect(direct.frustum.activePlanes).toHaveLength(5);

    (payload as unknown as Record<string, unknown>).far = undefined;
    expect((deserializeScene(document).getNodeById("legacy-far") as PerspectiveCamera).far).toBe(1000);
  });

  it("preserves a valid orthographic far value equal to the perspective sentinel", () => {
    const scene = new Scene();
    scene.root.addChild(scene.createOrthographicCamera({ id: "signed", near: -2, far: -1 }));
    const document = finiteJsonRoundTrip(scene);
    expect(document.root.children[0]!.camera).toMatchObject({ near: -2, far: -1 });
    expect(document.root.children[0]!.camera).not.toHaveProperty("infiniteFar");
    const restored = deserializeScene(document).getNodeById("signed") as OrthographicCamera;
    expect(restored).toMatchObject({ near: -2, far: -1 });
  });

  it("rejects null, conflicting markers, invalid sentinels and unsupported projection combinations", () => {
    const scene = new Scene();
    scene.root.addChild(scene.createPerspectiveCamera({ id: "invalid-far", near: 1, far: 200 }));
    const original = finiteJsonRoundTrip(scene);
    const invalidCases: readonly Record<string, unknown>[] = [
      { far: null },
      { far: NaN },
      { far: -Infinity },
      { far: "Infinity" },
      { far: -1 },
      { far: -1, infiniteFar: false },
      { far: -1, infiniteFar: null },
      { far: -1, infiniteFar: "true" },
      { far: null, infiniteFar: true },
      { far: undefined, infiniteFar: true },
      { far: 200, infiniteFar: true },
      { far: Infinity, infiniteFar: true },
      { far: -1, infiniteFar: true, depth: { mode: "logarithmic" } }
    ];
    for (const invalid of invalidCases) {
      const document = structuredClone(original);
      Object.assign(document.root.children[0]!.camera!, invalid);
      expect(() => deserializeScene(document)).toThrow(/far/i);
    }

    const orthographicScene = new Scene();
    orthographicScene.root.addChild(orthographicScene.createOrthographicCamera({ near: -2, far: -1 }));
    const invalidOrthographic = finiteJsonRoundTrip(orthographicScene);
    invalidOrthographic.root.children[0]!.camera!.infiniteFar = true;
    expect(() => deserializeScene(invalidOrthographic)).toThrow(/far/i);
  });

  it("rejects invalid mutable camera state before writing a lossy far value", () => {
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera({ near: 1, far: 100 });
    scene.root.addChild(camera);
    camera.far = NaN;
    expect(() => serializeScene(scene)).toThrow(/far/i);
    camera.far = -Infinity;
    expect(() => serializeScene(scene)).toThrow(/far/i);
    camera.far = Infinity;
    camera.depth.mode = "logarithmic";
    expect(() => serializeScene(scene)).toThrow(/infinite far/i);

    const orthographicScene = new Scene();
    const orthographic = orthographicScene.createOrthographicCamera();
    orthographicScene.root.addChild(orthographic);
    orthographic.far = Infinity;
    expect(() => serializeScene(orthographicScene)).toThrow(/infinite far/i);
  });
});
