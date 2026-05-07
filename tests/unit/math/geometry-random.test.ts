import { describe, expect, it } from "vitest";
import { Box3, Color, Easing, Frustum, Matrix4, Plane, Ray, SeededRandom, Sphere, Vector3, lerp, smoothstep } from "@galileo3d/math";

describe("math geometry and scalar helpers", () => {
  it("intersects rays with plane, sphere, and box", () => {
    const ray = new Ray(new Vector3(0, 0, 10), new Vector3(0, 0, -1));
    expect(ray.intersectPlane(Plane.fromPointNormal(Vector3.zero.clone(), new Vector3(0, 0, 1)))?.equals(Vector3.zero.clone())).toBe(true);
    expect(ray.intersectSphere(new Sphere(Vector3.zero.clone(), 1))?.equals(new Vector3(0, 0, 1))).toBe(true);
    expect(ray.intersectBox(new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1)))?.equals(new Vector3(0, 0, 1))).toBe(true);
  });

  it("rejects invalid sphere radius and ray direction", () => {
    expect(() => new Sphere(Vector3.zero.clone(), -1)).toThrow(/radius/i);
    expect(() => new Ray(Vector3.zero.clone(), Vector3.zero.clone())).toThrow(/direction/i);
  });

  it("extracts frustum planes from a projection matrix", () => {
    const frustum = Frustum.fromMatrix(Matrix4.perspective(Math.PI / 2, 1, 0.1, 100));
    expect(frustum.intersectsSphere(new Sphere(new Vector3(0, 0, -5), 1))).toBe(true);
    expect(frustum.intersectsSphere(new Sphere(new Vector3(100, 0, -5), 1))).toBe(false);
  });

  it("round-trips explicit color spaces", () => {
    const color = Color.fromSRGB(0.5, 0.25, 0.75).toSRGB();
    expect(color.equals(new Color(0.5, 0.25, 0.75), 1e-6)).toBe(true);
  });

  it("keeps interpolation unclamped unless the helper name implies a clamp", () => {
    expect(lerp(0, 10, 1.5)).toBe(15);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });

  it("validates easing input", () => {
    expect(Easing.easeInOutCubic(0.5)).toBe(0.5);
    expect(() => Easing.linear(1.1)).toThrow(/0, 1/);
  });

  it("generates deterministic seeded sequences", () => {
    const a = new SeededRandom(1234);
    const b = new SeededRandom(1234);
    expect([a.nextUint32(), a.nextUint32(), a.nextUint32()]).toEqual([b.nextUint32(), b.nextUint32(), b.nextUint32()]);
  });
});
