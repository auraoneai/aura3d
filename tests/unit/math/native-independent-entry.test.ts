import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as math from "../../../packages/math/src/independent/mutable/index.js";

const {
  Box3, Color, Euler, Frustum, Matrix3, Matrix4, Plane, Quaternion, Ray, Sphere,
  Triangle, Vector2, Vector3, Vector4,
} = math;

function expectVector(actual: { x: number; y: number; z: number }, expected: readonly [number, number, number]): void {
  expect(actual.x).toBeCloseTo(expected[0], 10);
  expect(actual.y).toBeCloseTo(expected[1], 10);
  expect(actual.z).toBeCloseTo(expected[2], 10);
}

describe("internal independent mutable math entry", () => {
  it("composes and decomposes entry vectors, rotations, and matrices together", () => {
    const position = new Vector3(3, 4, 5);
    const rotation = new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2));
    const scale = new Vector3(2, 3, 4);
    const transform = new Matrix4().compose(position, rotation, scale);

    expectVector(new Vector3(1, 0, 0).applyMatrix4(transform), [3, 6, 5]);
    const point4 = new Vector4(1, 0, 0, 1).applyMatrix4(transform);
    expectVector(point4, [3, 6, 5]);
    expect(point4.w).toBe(1);

    const outPosition = new Vector3(), outRotation = new Quaternion(), outScale = new Vector3();
    expect(transform.decompose(outPosition, outRotation, outScale)).toBe(transform);
    expectVector(outPosition, [3, 4, 5]);
    expectVector(outScale, [2, 3, 4]);
    expect(Math.abs(outRotation.dot(rotation))).toBeCloseTo(1, 10);
    const recomposed = new Matrix4().compose(outPosition, outRotation, outScale);
    recomposed.elements.forEach((value, i) => expect(value).toBeCloseTo(transform.elements[i]!, 10));

    const uv = new Vector2(1, 2).applyMatrix3(new Matrix3().makeTranslation(3, 4));
    expect([uv.x, uv.y]).toEqual([4, 6]);
    const normal = new Vector3(1, 0, 0).applyNormalMatrix(new Matrix3().getNormalMatrix(transform));
    expectVector(normal, [0, 1, 0]);
  });

  it("connects triangles, planes, boxes, spheres, rays, and frustums", () => {
    const triangle = new Triangle(new Vector3(-1, -1, -3), new Vector3(1, -1, -3), new Vector3(0, 1, -3));
    const box = new Box3().setFromPoints([new Vector3(-1, -1, -4), new Vector3(1, 1, -2)]);
    const sphere = box.getBoundingSphere(new Sphere());
    const plane = triangle.getPlane(new Plane());
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 0, -1));
    const hit = new Vector3();

    expect(box.intersectsTriangle(triangle)).toBe(true);
    expect(box.intersectsSphere(sphere)).toBe(true);
    expect(sphere.intersectsBox(box)).toBe(true);
    expect(triangle.containsPoint(new Vector3(0, 0, -3))).toBe(true);
    expect(ray.intersectPlane(plane, hit)).toBe(hit);
    expectVector(hit, [0, 0, -3]);
    expect(ray.intersectBox(box, hit)).toBe(hit);
    expectVector(hit, [0, 0, -2]);
    expect(ray.intersectSphere(sphere, hit)).toBe(hit);
    expectVector(hit, [0, 0, -3 + Math.sqrt(3)]);

    const projection = new Matrix4().makePerspectiveForDepthRange(-1, 1, 1, -1, 1, 10, "zero-to-one");
    const frustum = new Frustum().setFromProjectionMatrixDepthRange(projection, "zero-to-one");
    expect(frustum.containsPoint(new Vector3(0, 0, -3))).toBe(true);
    expect(frustum.intersectsBox(box)).toBe(true);
    expect(frustum.intersectsSphere(sphere)).toBe(true);
    expect(frustum.containsPoint(new Vector3(0, 0, 1))).toBe(false);
    expect(frustum.intersectsBox(new Box3(new Vector3(30, 30, -3), new Vector3(31, 31, -2)))).toBe(false);
  });

  it.each(["minus-one-to-one", "zero-to-one"] as const)("projects and clips with the %s depth range", (range) => {
    for (const reversed of [false, true]) {
      const low = range === "zero-to-one" ? 0 : -1;
      const nearDepth = reversed ? 1 : low;
      const farDepth = reversed ? low : 1;
      const projections = [
        new Matrix4().makePerspectiveForDepthRange(-1, 1, 1, -1, 1, 10, range, reversed),
        new Matrix4().makeOrthographicForDepthRange(-1, 1, 1, -1, 1, 10, range, reversed),
      ];
      for (const projection of projections) {
        expect(new Vector3(0, 0, -1).applyMatrix4(projection).z).toBeCloseTo(nearDepth, 10);
        expect(new Vector3(0, 0, -10).applyMatrix4(projection).z).toBeCloseTo(farDepth, 10);
        const frustum = new Frustum().setFromProjectionMatrixDepthRange(projection, range, reversed);
        expect(frustum.containsPoint(new Vector3(0, 0, -2))).toBe(true);
        expect(frustum.containsPoint(new Vector3(0, 0, -0.5))).toBe(false);
        expect(frustum.containsPoint(new Vector3(0, 0, -11))).toBe(false);
      }
    }
  });

  it("exposes numeric projection identifiers and rejects unsupported identifiers atomically", () => {
    expect(math.WebGLCoordinateSystem).toBe(2000);
    expect(math.WebGPUCoordinateSystem).toBe(2001);
    const projection = new Matrix4().makePerspective(-1, 1, 1, -1, 1, 10);
    const frustum = new Frustum().setFromProjectionMatrix(projection);
    expect(frustum.containsPoint(new Vector3(0, 0, -2))).toBe(true);
    const previous = frustum.planes.map(({ normal, constant }) => [normal.x, normal.y, normal.z, constant]);
    const snapshotPlanes = () => frustum.planes.map(({ normal, constant }) => [normal.x, normal.y, normal.z, constant]);
    expect(() => frustum.setFromProjectionMatrix(projection, 0)).toThrow(RangeError);
    // unified 4.x contract: the near plane is chosen last, so planes 0-4 are rewritten (identically here) before the throw.
    expect(snapshotPlanes()).toEqual(previous);
    expect(() => frustum.setFromProjectionMatrix(projection, 1, true)).toThrow(RangeError);
    // unified 4.x contract: the near plane is left untouched; the other five follow the reversed layout.
    expect(snapshotPlanes()[5]).toEqual(previous[5]);
  });

  it("shows alpha, direction, and normal limits on immutable conversions", () => {
    const color = new Color(0.2, 0.4, 0.6);
    const rgba = color.toImmutable(0.25);
    expect(rgba.a).toBe(0.25);
    const colorCopy = new Color().fromImmutable(rgba);
    expect([colorCopy.r, colorCopy.g, colorCopy.b]).toEqual([0.2, 0.4, 0.6]);
    expect(colorCopy.toImmutable().a).toBe(1);
    expect(colorCopy.toImmutable(0.25).a).toBe(0.25);

    const ray = new Ray(new Vector3(1, 2, 3), new Vector3(0, 4, 0));
    const rayCopy = new Ray().fromImmutable(ray.toImmutable());
    expectVector(rayCopy.origin, [1, 2, 3]);
    expectVector(rayCopy.direction, [0, 1, 0]);
    expectVector(ray.at(1, new Vector3()), [1, 6, 3]);
    expectVector(rayCopy.at(1, new Vector3()), [1, 3, 3]);
    ray.origin.x = 9;
    expect(rayCopy.origin.x).toBe(1);
    expect(() => new Ray(new Vector3(), new Vector3()).toImmutable()).toThrow(RangeError);

    const plane = new Plane(new Vector3(0, 2, 0), -4);
    const planeCopy = new Plane().fromImmutable(plane.toImmutable());
    plane.normal.y = -2;
    expectVector(planeCopy.normal, [0, 1, 0]);
    expect(planeCopy.constant).toBe(-2);
    expect(planeCopy.distanceToPoint(new Vector3(0, 3, 0))).toBe(1);
    expect(() => new Plane(new Vector3(0, 0, 0), 0).toImmutable()).toThrow();
    expect(new Triangle()).not.toHaveProperty("toImmutable");
  });

  it("preserves empty bounds and distinguishes shared inputs from copied conversions", () => {
    const box = new Box3();
    const sphere = new Sphere();
    expect(box.toImmutable().isEmpty()).toBe(true);
    expect(new Box3().fromImmutable(box.toImmutable()).isEmpty()).toBe(true);
    expect(sphere.toImmutable().isEmpty()).toBe(true);
    expect(new Sphere().fromImmutable(sphere.toImmutable()).isEmpty()).toBe(true);

    const shared = new Vector3(1, 2, 3);
    const sharedSphere = new Sphere(shared, 2);
    const sharedRay = new Ray(shared, new Vector3(0, 1, 0));
    const sphereSnapshot = new Sphere().fromImmutable(sharedSphere.toImmutable());
    const raySnapshot = new Ray().fromImmutable(sharedRay.toImmutable());
    shared.set(4, 5, 6);
    expect(sharedSphere.center).toBe(shared);
    expect(sharedRay.origin).toBe(shared);
    expectVector(sphereSnapshot.center, [1, 2, 3]);
    expectVector(raySnapshot.origin, [1, 2, 3]);
  });

  it("exposes the color helpers as usable entry values", () => {
    expect(math.ColorManagement).toBeDefined();
    expect(math.COLOR_KEYWORDS.red).toBe(0xff0000);
    expect(math.NoColorSpace).toBe("");
    expect(math.SRGBColorSpace).toBe("srgb");
    expect(math.LinearSRGBColorSpace).toBe("srgb-linear");
    expect(math.LinearTransfer).toBe("linear");
    expect(math.SRGBTransfer).toBe("srgb");
    // unified 4.x contract: decimal-constant transfers stay within 1e-5 of the CSS functions in each direction.
    expect(math.LinearToSRGB(math.SRGBToLinear(0.5))).toBeCloseTo(0.5, 4);
  });

  it("type-checks a source-entry consumer and declarations in memory under NodeNext", () => {
    const consumerPath = resolve("packages/math/src/independent/mutable/__entry_contract_consumer__.mts");
    const consumer = `
      import * as math from "./index.js";
      import type {
        Vector2Like, BufferAttributeLike2, Vector3Like, BufferAttributeLike3, ProjectionCameraLike,
        Vector4Like, BufferAttributeLikeW, ProjectionDepthRange, QuaternionLike, EulerLike, EulerOrder,
        BufferAttributeLike4, ColorLike, ColorManagementApi, HSL, RGB, Box3Like, Box3ObjectLike, TriangleLike,
        PositionAttributeLike, SphereLike, PlaneLike, Line3Like, RayLike, FrustumLike, TriangleCornersLike
      } from "./index.js";

      export type EntryTypes = [
        Vector2Like, BufferAttributeLike2, Vector3Like, BufferAttributeLike3, ProjectionCameraLike,
        Vector4Like, BufferAttributeLikeW, ProjectionDepthRange, QuaternionLike, EulerLike, EulerOrder,
        BufferAttributeLike4, ColorLike, ColorManagementApi, HSL, RGB, Box3Like, Box3ObjectLike, TriangleLike,
        PositionAttributeLike, SphereLike, PlaneLike, Line3Like, RayLike, FrustumLike, TriangleCornersLike
      ];
      type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
      type Assert<T extends true> = T;
      export type DepthRangeIsExplicit = Assert<Equal<ProjectionDepthRange, "minus-one-to-one" | "zero-to-one">>;
      const v = new math.Vector3(0, 0, -2);
      const q = new math.Quaternion().setFromEuler(new math.Euler());
      const transform = new math.Matrix4().compose(v, q, new math.Vector3(1, 1, 1));
      transform.decompose(new math.Vector3(), new math.Quaternion(), new math.Vector3());
      const projection = new math.Matrix4().makePerspectiveForDepthRange(-1, 1, 1, -1, 1, 10, "zero-to-one");
      new math.Matrix4().makeOrthographicForDepthRange(-1, 1, 1, -1, 1, 10, "minus-one-to-one");
      new math.Frustum().setFromProjectionMatrixDepthRange(projection, "zero-to-one").intersectsSphere(new math.Sphere(v, 1));
      new math.Frustum().setFromProjectionMatrix(projection, math.WebGPUCoordinateSystem, true);
      transform.makePerspective(-1, 1, 1, -1, 1, 10, math.WebGLCoordinateSystem);
      transform.makeOrthographic(-1, 1, 1, -1, 1, 10, math.WebGPUCoordinateSystem, true);
      new math.Ray().intersectPlane(new math.Plane(), v);
      new math.Box3().intersectsTriangle(new math.Triangle());
      new math.Vector2().applyMatrix3(new math.Matrix3());
      new math.Vector4().applyMatrix4(transform);
      new math.Color().toImmutable(0.5);
      export const colorManagement = math.ColorManagement;
      export const colorManagers = [math.ColorManagement];
      export const colorValues = [math.COLOR_KEYWORDS, math.SRGBToLinear,
        math.LinearToSRGB, math.NoColorSpace, math.SRGBColorSpace, math.LinearSRGBColorSpace,
        math.LinearTransfer, math.SRGBTransfer];

      // @ts-expect-error Triangle has no immutable conversion in this entry.
      new math.Triangle().toImmutable();
      // @ts-expect-error Numeric depth identifiers are not supported by the explicit API.
      transform.makePerspectiveForDepthRange(-1, 1, 1, -1, 1, 10, 0);
    `;
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      lib: ["lib.es2022.d.ts"],
      strict: true,
      skipLibCheck: true,
      declaration: true,
      emitDeclarationOnly: true,
      types: [],
    };
    const host = ts.createCompilerHost(options);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    const originalFileExists = host.fileExists.bind(host);
    const originalReadFile = host.readFile.bind(host);
    host.fileExists = (fileName) => fileName === consumerPath || originalFileExists(fileName);
    host.readFile = (fileName) => fileName === consumerPath ? consumer : originalReadFile(fileName);
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
      fileName === consumerPath
        ? ts.createSourceFile(fileName, consumer, languageVersion, true)
        : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    const declarations = new Map<string, string>();
    host.writeFile = (fileName, content) => { declarations.set(fileName, content); };
    const program = ts.createProgram([consumerPath], options, host);
    const emitResult = program.emit();
    const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitResult.diagnostics];
    const message = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    });
    // Diagnostic objects contain linked syntax trees; comparing those objects
    // on failure makes the test runner recursively serialize the whole program.
    expect(message).toBe("");
    expect(emitResult.emitSkipped).toBe(false);
    const declaration = declarations.get(consumerPath.replace(/\.mts$/, ".d.mts"));
    expect(declaration).toContain("colorManagement: math.ColorManagementApi");
    expect(declaration).toContain("colorManagers: math.ColorManagementApi[]");
  });
});
