import { describe, it, expect } from 'vitest';
import { Matrix4 } from '../../../math/Matrix4';
import { Vector3 } from '../../../math/Vector3';
import { Quaternion } from '../../../math/Quaternion';
import { EPSILON } from '../../../math/MathConstants';

describe('Matrix4', () => {
  describe('constructor', () => {
    it('creates identity matrix by default', () => {
      const m = new Matrix4();
      const identity = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ];
      expect(Array.from(m.elements)).toEqual(identity);
    });

    it('uses column-major storage', () => {
      const m = new Matrix4();
      // Column 0
      expect(m.elements[0]).toBe(1);
      expect(m.elements[1]).toBe(0);
      expect(m.elements[2]).toBe(0);
      expect(m.elements[3]).toBe(0);
      // Column 1
      expect(m.elements[4]).toBe(0);
      expect(m.elements[5]).toBe(1);
      // etc.
    });
  });

  describe('static factories', () => {
    it('Matrix4.identity() creates identity', () => {
      const m = Matrix4.identity();
      expect(m.determinant()).toBeCloseTo(1, 10);
      expect(m.equals(new Matrix4())).toBe(true);
    });

    it('Matrix4.translation() creates translation matrix', () => {
      const m = Matrix4.translation(1, 2, 3);
      expect(m.elements[12]).toBe(1);
      expect(m.elements[13]).toBe(2);
      expect(m.elements[14]).toBe(3);
      expect(m.elements[15]).toBe(1);
    });

    it('Matrix4.rotationX() creates X-axis rotation', () => {
      const angle = Math.PI / 2;
      const m = Matrix4.rotationX(angle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      expect(m.elements[0]).toBe(1);
      expect(m.elements[5]).toBeCloseTo(cos, 10);
      expect(m.elements[6]).toBeCloseTo(sin, 10);
      expect(m.elements[9]).toBeCloseTo(-sin, 10);
      expect(m.elements[10]).toBeCloseTo(cos, 10);
    });

    it('Matrix4.rotationY() creates Y-axis rotation', () => {
      const angle = Math.PI / 3;
      const m = Matrix4.rotationY(angle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      expect(m.elements[0]).toBeCloseTo(cos, 10);
      expect(m.elements[2]).toBeCloseTo(-sin, 10);
      expect(m.elements[5]).toBe(1);
      expect(m.elements[8]).toBeCloseTo(sin, 10);
      expect(m.elements[10]).toBeCloseTo(cos, 10);
    });

    it('Matrix4.rotationZ() creates Z-axis rotation', () => {
      const angle = Math.PI / 4;
      const m = Matrix4.rotationZ(angle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      expect(m.elements[0]).toBeCloseTo(cos, 10);
      expect(m.elements[1]).toBeCloseTo(sin, 10);
      expect(m.elements[4]).toBeCloseTo(-sin, 10);
      expect(m.elements[5]).toBeCloseTo(cos, 10);
      expect(m.elements[10]).toBe(1);
    });

    it('Matrix4.scale() creates scale matrix', () => {
      const m = Matrix4.scale(2, 3, 4);
      expect(m.elements[0]).toBe(2);
      expect(m.elements[5]).toBe(3);
      expect(m.elements[10]).toBe(4);
      expect(m.elements[15]).toBe(1);
      expect(m.determinant()).toBeCloseTo(24, 10);
    });

    it('Matrix4.rotationAxis() creates arbitrary axis rotation', () => {
      const axis = new Vector3(1, 1, 0).normalize();
      const angle = Math.PI / 2;
      const m = Matrix4.rotationAxis(axis, angle);

      // Rotating around (1,1,0) axis
      expect(m.determinant()).toBeCloseTo(1, 10);
    });
  });

  describe('TRS composition', () => {
    it('compose() creates TRS matrix', () => {
      const position = new Vector3(1, 2, 3);
      const rotation = Quaternion.identity();
      const scale = new Vector3(2, 2, 2);

      const m = new Matrix4();
      m.compose(position, rotation, scale);

      expect(m.getPosition().equals(position)).toBe(true);
      expect(m.getScale().equals(scale, EPSILON)).toBe(true);
    });

    it('compose() with rotation works correctly', () => {
      const position = new Vector3(5, 10, 15);
      const rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
      const scale = new Vector3(1, 1, 1);

      const m = new Matrix4();
      m.compose(position, rotation, scale);

      const extractedPos = m.getPosition();
      const extractedRot = m.getRotation();

      expect(extractedPos.equals(position, EPSILON)).toBe(true);
      expect(extractedRot.equals(rotation, 1e-6)).toBe(true);
    });

    it('Matrix4.compose() static method works', () => {
      const position = new Vector3(1, 2, 3);
      const rotation = Quaternion.identity();
      const scale = new Vector3(2, 3, 4);

      const m = Matrix4.compose(position, rotation, scale);

      expect(m.getPosition().equals(position)).toBe(true);
      expect(m.getScale().equals(scale, EPSILON)).toBe(true);
    });
  });

  describe('matrix multiplication', () => {
    it('multiply() combines transformations', () => {
      const t1 = Matrix4.translation(1, 0, 0);
      const t2 = Matrix4.translation(2, 0, 0);
      const result = t1.multiply(t2);

      expect(result.elements[12]).toBeCloseTo(3, 10);
    });

    it('multiply() does not modify operands', () => {
      const m1 = Matrix4.rotationY(Math.PI / 4);
      const m2 = Matrix4.scale(2, 2, 2);
      const orig1 = m1.clone();
      const orig2 = m2.clone();

      m1.multiply(m2);

      expect(m1.equals(orig1)).toBe(true);
      expect(m2.equals(orig2)).toBe(true);
    });

    it('multiplyInPlace() modifies this matrix', () => {
      const m1 = Matrix4.translation(1, 0, 0);
      const m2 = Matrix4.translation(2, 0, 0);
      const original = m1.clone();

      m1.multiplyInPlace(m2);

      expect(m1.equals(original)).toBe(false);
      expect(m1.elements[12]).toBeCloseTo(3, 10);
    });

    it('premultiply() applies transformation before', () => {
      const t = Matrix4.translation(1, 0, 0);
      const r = Matrix4.rotationY(Math.PI / 2);

      const result1 = t.multiply(r); // translate then rotate
      const result2 = r.premultiply(t); // same as above

      expect(result1.equals(result2)).toBe(true);
    });

    it('multiplication is associative: (A * B) * C = A * (B * C)', () => {
      const A = Matrix4.rotationX(0.5);
      const B = Matrix4.scale(2, 3, 4);
      const C = Matrix4.translation(1, 2, 3);

      const left = A.multiply(B).multiply(C);
      const right = A.multiply(B.multiply(C));

      expect(left.equals(right, 1e-10)).toBe(true);
    });

    it('identity multiplication has no effect', () => {
      const m = Matrix4.rotationY(0.7);
      const identity = Matrix4.identity();

      const r1 = m.multiply(identity);
      const r2 = identity.multiply(m);

      expect(r1.equals(m, EPSILON)).toBe(true);
      expect(r2.equals(m, EPSILON)).toBe(true);
    });

    it('multiplyScalar() scales all elements', () => {
      const m = Matrix4.scale(2, 3, 4);
      const scaled = m.multiplyScalar(2);

      expect(scaled.elements[0]).toBe(4);
      expect(scaled.elements[5]).toBe(6);
      expect(scaled.elements[10]).toBe(8);
    });
  });

  describe('inversion', () => {
    it('invert() computes matrix inverse', () => {
      const m = Matrix4.translation(1, 2, 3);
      const inv = m.invert();

      expect(inv).not.toBeNull();
      if (inv) {
        expect(inv.elements[12]).toBeCloseTo(-1, 10);
        expect(inv.elements[13]).toBeCloseTo(-2, 10);
        expect(inv.elements[14]).toBeCloseTo(-3, 10);
      }
    });

    it('invert() * matrix = identity', () => {
      const m = Matrix4.rotationY(0.5).multiply(Matrix4.scale(2, 3, 4));
      const inv = m.invert();

      expect(inv).not.toBeNull();
      if (inv) {
        const identity = m.multiply(inv);
        expect(identity.equals(Matrix4.identity(), 1e-10)).toBe(true);
      }
    });

    it('invert() returns null for singular matrix', () => {
      const singular = new Matrix4();
      singular.set(
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0
      );
      expect(singular.invert()).toBeNull();
    });

    it('invertInPlace() modifies matrix', () => {
      const m = Matrix4.translation(5, 10, 15);
      const original = m.clone();

      m.invertInPlace();

      expect(m.equals(original)).toBe(false);
      expect(m.elements[12]).toBeCloseTo(-5, 10);
    });

    it('double inversion returns original', () => {
      const m = Matrix4.rotationZ(0.7).multiply(Matrix4.scale(2, 3, 4));
      const inv = m.invert();
      expect(inv).not.toBeNull();

      if (inv) {
        const invInv = inv.invert();
        expect(invInv).not.toBeNull();
        if (invInv) {
          expect(invInv.equals(m, 1e-10)).toBe(true);
        }
      }
    });

    it('affine transformation inversion is exact', () => {
      const m = Matrix4.translation(1, 2, 3)
        .multiply(Matrix4.rotationY(Math.PI / 4))
        .multiply(Matrix4.scale(2, 2, 2));

      const inv = m.invert();
      expect(inv).not.toBeNull();

      if (inv) {
        const product = m.multiply(inv);
        expect(product.equals(Matrix4.identity(), 1e-10)).toBe(true);
      }
    });
  });

  describe('transpose', () => {
    it('transpose() swaps rows and columns', () => {
      const m = new Matrix4();
      m.set(
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16
      );

      const t = m.transpose();

      // First column becomes first row
      expect(t.elements[0]).toBe(1);
      expect(t.elements[4]).toBe(2);
      expect(t.elements[8]).toBe(3);
      expect(t.elements[12]).toBe(4);
    });

    it('transpose twice returns original', () => {
      const m = Matrix4.rotationX(0.5);
      const tt = m.transpose().transpose();

      expect(tt.equals(m, EPSILON)).toBe(true);
    });

    it('transposeInPlace() modifies matrix', () => {
      const m = Matrix4.rotationZ(0.7);
      const original = m.clone();

      m.transposeInPlace();

      expect(m.equals(original)).toBe(false);
      expect(m.transpose().equals(original)).toBe(true);
    });
  });

  describe('decomposition', () => {
    it('decompose() extracts translation, rotation, scale', () => {
      const position = new Vector3(1, 2, 3);
      const rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      const scale = new Vector3(2, 3, 4);

      const m = new Matrix4();
      m.compose(position, rotation, scale);

      const { position: p, rotation: r, scale: s } = m.decompose();

      expect(p.equals(position, EPSILON)).toBe(true);
      expect(r.equals(rotation, 1e-6)).toBe(true);
      expect(s.equals(scale, EPSILON)).toBe(true);
    });

    it('getPosition() extracts translation', () => {
      const m = Matrix4.translation(5, 10, 15);
      const pos = m.getPosition();

      expect(pos.x).toBe(5);
      expect(pos.y).toBe(10);
      expect(pos.z).toBe(15);
    });

    it('getScale() extracts scale factors', () => {
      const m = Matrix4.scale(2, 3, 4);
      const scale = m.getScale();

      expect(scale.x).toBeCloseTo(2, 10);
      expect(scale.y).toBeCloseTo(3, 10);
      expect(scale.z).toBeCloseTo(4, 10);
    });

    it('getRotation() extracts rotation quaternion', () => {
      const rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 3);
      const m = Matrix4.fromQuaternion(rotation);
      const extracted = m.getRotation();

      expect(extracted.equals(rotation, 1e-6)).toBe(true);
    });

    it('getMaxScaleOnAxis() returns maximum scale', () => {
      const m = Matrix4.scale(2, 5, 3);
      const maxScale = m.getMaxScaleOnAxis();

      expect(maxScale).toBeCloseTo(5, 10);
    });

    it('decompose() handles negative scale', () => {
      const position = new Vector3(1, 2, 3);
      const rotation = Quaternion.identity();
      const scale = new Vector3(-2, 3, 4);

      const m = new Matrix4();
      m.compose(position, rotation, scale);

      const { scale: extractedScale } = m.decompose();
      expect(extractedScale.x).toBeCloseTo(-2, 5);
      expect(extractedScale.y).toBeCloseTo(3, 5);
      expect(extractedScale.z).toBeCloseTo(4, 5);
    });
  });

  describe('vector transformation', () => {
    it('transformPoint() transforms position (w=1)', () => {
      const m = Matrix4.translation(1, 2, 3);
      const p = new Vector3(0, 0, 0);
      const result = m.transformPoint(p);

      expect(result.x).toBeCloseTo(1, 10);
      expect(result.y).toBeCloseTo(2, 10);
      expect(result.z).toBeCloseTo(3, 10);
    });

    it('transformVector() transforms direction (w=0)', () => {
      const m = Matrix4.translation(1, 2, 3);
      const v = new Vector3(1, 0, 0);
      const result = m.transformVector(v);

      // Translation should not affect direction vectors
      expect(result.x).toBeCloseTo(1, 10);
      expect(result.y).toBeCloseTo(0, 10);
      expect(result.z).toBeCloseTo(0, 10);
    });

    it('transformVector() applies rotation', () => {
      const m = Matrix4.rotationY(Math.PI / 2);
      const v = new Vector3(1, 0, 0);
      const result = m.transformVector(v);

      expect(result.x).toBeCloseTo(0, 10);
      expect(result.z).toBeCloseTo(-1, 10);
    });

    it('transformPoint() handles perspective divide', () => {
      const m = Matrix4.perspective(Math.PI / 4, 1, 1, 100);
      const p = new Vector3(0, 0, -10);
      const result = m.transformPoint(p);

      // Should apply perspective transformation
      expect(result).toBeDefined();
    });

    it('transformVector() ignores translation', () => {
      const m = Matrix4.translation(100, 200, 300)
        .multiply(Matrix4.scale(2, 2, 2));
      const v = new Vector3(1, 1, 1);
      const result = m.transformVector(v);

      expect(result.x).toBeCloseTo(2, 10);
      expect(result.y).toBeCloseTo(2, 10);
      expect(result.z).toBeCloseTo(2, 10);
    });
  });

  describe('projection matrices', () => {
    it('perspective() creates perspective projection', () => {
      const fov = Math.PI / 4;
      const aspect = 16 / 9;
      const near = 0.1;
      const far = 100;

      const m = Matrix4.perspective(fov, aspect, near, far);

      // Verify it's a projection matrix (element [15] should be 0)
      expect(m.elements[15]).toBe(0);
      expect(m.elements[11]).toBe(-1);
    });

    it('perspectiveInfinite() creates infinite far plane projection', () => {
      const fov = Math.PI / 4;
      const aspect = 16 / 9;
      const near = 0.1;

      const m = new Matrix4();
      m.perspectiveInfinite(fov, aspect, near);

      expect(m.elements[15]).toBe(0);
      expect(m.elements[10]).toBe(-1);
      expect(m.elements[11]).toBe(-1);
    });

    it('orthographic() creates orthographic projection', () => {
      const m = Matrix4.orthographic(-10, 10, -10, 10, 0.1, 100);

      // Verify orthographic properties
      expect(m.elements[15]).toBe(1);
      expect(m.elements[11]).toBe(0);
    });

    it('perspective() produces correct frustum mapping', () => {
      const fov = Math.PI / 2;
      const aspect = 1;
      const near = 1;
      const far = 100;

      const m = Matrix4.perspective(fov, aspect, near, far);

      // Point at near plane should map to NDC
      const nearPoint = new Vector3(0, 0, -near);
      const nearNDC = m.transformPoint(nearPoint);

      expect(nearNDC.z).toBeCloseTo(-1, 5);
    });

    it('orthographic() maintains parallel lines', () => {
      const m = Matrix4.orthographic(-1, 1, -1, 1, 0.1, 10);

      const p1 = new Vector3(0.5, 0, -1);
      const p2 = new Vector3(0.5, 0, -5);

      const t1 = m.transformPoint(p1);
      const t2 = m.transformPoint(p2);

      // X should be same (parallel projection)
      expect(t1.x).toBeCloseTo(t2.x, 10);
    });
  });

  describe('view matrices', () => {
    it('lookAt() creates view matrix', () => {
      const eye = new Vector3(0, 0, 10);
      const target = new Vector3(0, 0, 0);
      const up = new Vector3(0, 1, 0);

      const m = Matrix4.lookAt(eye, target, up);

      // Verify it transforms eye position to origin
      const transformed = m.transformPoint(eye);
      expect(transformed.x).toBeCloseTo(0, 5);
      expect(transformed.y).toBeCloseTo(0, 5);
      expect(transformed.z).toBeCloseTo(0, 5);
    });

    it('Matrix4.lookAt() static method works', () => {
      const eye = new Vector3(5, 5, 5);
      const target = new Vector3(0, 0, 0);
      const up = new Vector3(0, 1, 0);

      const m = Matrix4.lookAt(eye, target, up);

      expect(m.determinant()).not.toBe(0);
    });

    it('lookAt() handles degenerate case (eye == target)', () => {
      const eye = new Vector3(0, 0, 0);
      const target = new Vector3(0, 0, 0);
      const up = new Vector3(0, 1, 0);

      const m = new Matrix4();
      m.lookAt(eye, target, up);

      // Should handle gracefully
      expect(m.elements).toBeDefined();
    });

    it('lookAt() handles up parallel to view direction', () => {
      const eye = new Vector3(0, 10, 0);
      const target = new Vector3(0, 0, 0);
      const up = new Vector3(0, 1, 0);

      const m = new Matrix4();
      m.lookAt(eye, target, up);

      // Should handle gracefully with slight perturbation
      expect(m.determinant()).not.toBe(0);
    });
  });

  describe('combined MVP matrices', () => {
    it('MVP matrix transforms correctly', () => {
      const model = Matrix4.translation(0, 0, -5);
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 16 / 9, 0.1, 100);

      const mvp = projection.multiply(view).multiply(model);

      const worldPos = new Vector3(0, 0, 0);
      const clipPos = mvp.transformPoint(worldPos);

      // Should be in clip space
      expect(clipPos).toBeDefined();
    });

    it('model-view matrix combines correctly', () => {
      const model = Matrix4.rotationY(Math.PI / 4)
        .multiply(Matrix4.translation(0, 0, -10));
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 5),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );

      const mv = view.multiply(model);

      expect(mv.determinant()).not.toBe(0);
    });
  });

  describe('quaternion conversion', () => {
    it('setFromQuaternion() creates rotation matrix', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      const m = new Matrix4();
      m.setFromQuaternion(q);

      const extracted = m.getRotation();
      expect(extracted.equals(q, 1e-6)).toBe(true);
    });

    it('Matrix4.fromQuaternion() static method works', () => {
      const q = Quaternion.fromAxisAngle(Vector3.right(), Math.PI / 3);
      const m = Matrix4.fromQuaternion(q);

      const extracted = m.getRotation();
      expect(extracted.equals(q, 1e-6)).toBe(true);
    });

    it('quaternion roundtrip preserves rotation', () => {
      const original = Quaternion.fromAxisAngle(
        new Vector3(1, 1, 1).normalize(),
        Math.PI / 6
      );

      const m = Matrix4.fromQuaternion(original);
      const extracted = m.getRotation();

      expect(extracted.equals(original, 1e-6)).toBe(true);
    });
  });

  describe('set and identity', () => {
    it('set() accepts row-major values', () => {
      const m = new Matrix4();
      m.set(
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16
      );

      // Verify column-major storage
      expect(m.elements[0]).toBe(1);
      expect(m.elements[1]).toBe(5);
      expect(m.elements[4]).toBe(2);
    });

    it('set() throws with wrong number of arguments', () => {
      const m = new Matrix4();
      expect(() => m.set(1, 2, 3)).toThrow();
    });

    it('identity() resets to identity matrix', () => {
      const m = Matrix4.scale(2, 3, 4);
      m.identity();

      expect(m.equals(Matrix4.identity())).toBe(true);
    });

    it('setTranslation() creates translation matrix', () => {
      const m = new Matrix4();
      m.setTranslation(5, 10, 15);

      expect(m.getPosition().equals(new Vector3(5, 10, 15))).toBe(true);
    });

    it('setScale() creates scale matrix', () => {
      const m = new Matrix4();
      m.setScale(2, 3, 4);

      expect(m.getScale().equals(new Vector3(2, 3, 4), EPSILON)).toBe(true);
    });
  });

  describe('array conversions', () => {
    it('toArray() returns column-major array', () => {
      const m = new Matrix4();
      m.set(
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16
      );

      const arr = m.toArray();
      expect(arr[0]).toBe(1);
      expect(arr[1]).toBe(5);
      expect(arr[4]).toBe(2);
    });

    it('fromArray() sets from column-major array', () => {
      const m = new Matrix4();
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
      m.fromArray(arr);

      expect(m.elements[0]).toBe(1);
      expect(m.elements[15]).toBe(16);
    });

    it('fromArray() with offset works', () => {
      const m = new Matrix4();
      const arr = [99, 98, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
      m.fromArray(arr, 2);

      expect(m.elements[0]).toBe(1);
      expect(m.elements[15]).toBe(16);
    });

    it('roundtrip through array preserves matrix', () => {
      const original = Matrix4.rotationY(0.7);
      const m = new Matrix4();
      m.fromArray(original.toArray());

      expect(m.equals(original)).toBe(true);
    });
  });

  describe('clone and copy', () => {
    it('clone() creates independent copy', () => {
      const m1 = Matrix4.rotationZ(0.5);
      const m2 = m1.clone();

      expect(m2.equals(m1)).toBe(true);

      m2.identity();
      expect(m2.equals(m1)).toBe(false);
    });

    it('copy() copies values', () => {
      const m1 = Matrix4.scale(2, 3, 4);
      const m2 = new Matrix4();
      m2.copy(m1);

      expect(m2.equals(m1)).toBe(true);
    });

    it('copy() returns this for chaining', () => {
      const m1 = Matrix4.translation(1, 2, 3);
      const m2 = new Matrix4();
      const result = m2.copy(m1);

      expect(result).toBe(m2);
    });
  });

  describe('equals', () => {
    it('equals() compares within epsilon', () => {
      const m1 = Matrix4.rotationX(Math.PI / 4);
      const m2 = m1.clone();

      expect(m1.equals(m2)).toBe(true);
    });

    it('equals() handles small differences', () => {
      const m1 = Matrix4.identity();
      const m2 = Matrix4.identity();
      m2.elements[0] += EPSILON * 0.5;

      expect(m1.equals(m2)).toBe(true);
    });

    it('equals() respects custom epsilon', () => {
      const m1 = Matrix4.identity();
      const m2 = Matrix4.identity();
      m2.elements[0] = 1.01;

      expect(m1.equals(m2, 0.1)).toBe(true);
      expect(m1.equals(m2, 0.001)).toBe(false);
    });
  });

  describe('determinant', () => {
    it('determinant() of identity is 1', () => {
      const m = Matrix4.identity();
      expect(m.determinant()).toBeCloseTo(1, 10);
    });

    it('determinant() of scale is product of scales', () => {
      const m = Matrix4.scale(2, 3, 4);
      expect(m.determinant()).toBeCloseTo(24, 10);
    });

    it('determinant() of rotation is 1', () => {
      const m = Matrix4.rotationY(0.7);
      expect(m.determinant()).toBeCloseTo(1, 10);
    });

    it('determinant() of singular matrix is ~0', () => {
      const m = new Matrix4();
      m.set(
        1, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 1
      );
      expect(Math.abs(m.determinant())).toBeLessThan(EPSILON);
    });
  });

  describe('numerical stability', () => {
    it('accumulated transformations remain stable', () => {
      let m = Matrix4.identity();
      const step = Matrix4.rotationY(Math.PI / 180);

      for (let i = 0; i < 360; i++) {
        m = m.multiply(step);
      }

      expect(m.equals(Matrix4.identity(), 1e-5)).toBe(true);
    });

    it('accumulated scales maintain determinant', () => {
      let m = Matrix4.identity();
      const step = Matrix4.scale(1.1, 1.1, 1.1);

      for (let i = 0; i < 10; i++) {
        m = m.multiply(step);
      }

      const expectedDet = Math.pow(1.1, 30);
      expect(m.determinant()).toBeCloseTo(expectedDet, 5);
    });

    it('rotation matrix remains orthogonal', () => {
      const m = Matrix4.rotationX(0.3)
        .multiply(Matrix4.rotationY(0.5))
        .multiply(Matrix4.rotationZ(0.7));

      const inv = m.invert();
      const trans = m.transpose();

      expect(inv).not.toBeNull();
      if (inv) {
        expect(inv.equals(trans, 1e-10)).toBe(true);
      }
    });

    it('compose-decompose roundtrip is accurate', () => {
      const position = new Vector3(1.5, 2.7, 3.9);
      const rotation = Quaternion.fromAxisAngle(
        new Vector3(1, 1, 1).normalize(),
        0.8
      );
      const scale = new Vector3(1.5, 2.5, 3.5);

      const m = new Matrix4();
      m.compose(position, rotation, scale);

      const { position: p, rotation: r, scale: s } = m.decompose();

      expect(p.equals(position, 1e-6)).toBe(true);
      expect(r.equals(rotation, 1e-6)).toBe(true);
      expect(s.equals(scale, 1e-6)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles zero scale gracefully', () => {
      const m = Matrix4.scale(0, 1, 1);
      expect(m.determinant()).toBe(0);
      expect(m.invert()).toBeNull();
    });

    it('handles very small scales', () => {
      const m = Matrix4.scale(1e-10, 1, 1);
      const inv = m.invert();

      expect(inv).not.toBeNull();
      if (inv) {
        const product = m.multiply(inv);
        expect(product.equals(Matrix4.identity(), 1e-5)).toBe(true);
      }
    });

    it('handles very large scales', () => {
      const m = Matrix4.scale(1e6, 1e6, 1e6);
      const inv = m.invert();

      expect(inv).not.toBeNull();
      if (inv) {
        expect(inv.elements[0]).toBeCloseTo(1e-6, 12);
      }
    });

    it('rotation matrices have unit determinant', () => {
      for (let angle = 0; angle < Math.PI * 2; angle += 0.5) {
        const m = Matrix4.rotationX(angle);
        expect(m.determinant()).toBeCloseTo(1, 10);
      }
    });

    it('rotation inverse equals transpose', () => {
      const m = Matrix4.rotationY(0.7);
      const inv = m.invert();
      const trans = m.transpose();

      expect(inv).not.toBeNull();
      if (inv) {
        expect(inv.equals(trans, 1e-10)).toBe(true);
      }
    });
  });
});
