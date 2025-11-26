import { describe, it, expect } from 'vitest';
import { Frustum } from '../../../math/Frustum';
import { Plane } from '../../../math/Plane';
import { Vector3 } from '../../../math/Vector3';
import { Matrix4 } from '../../../math/Matrix4';

describe('Frustum', () => {
  describe('constructor', () => {
    it('creates frustum with default planes', () => {
      const frustum = new Frustum();

      expect(frustum.planes).toHaveLength(6);
      expect(frustum.planes[0]).toBeInstanceOf(Plane);
    });

    it('creates frustum from plane array', () => {
      const planes = [
        new Plane(new Vector3(1, 0, 0), 0),
        new Plane(new Vector3(-1, 0, 0), 0),
        new Plane(new Vector3(0, 1, 0), 0),
        new Plane(new Vector3(0, -1, 0), 0),
        new Plane(new Vector3(0, 0, 1), 0),
        new Plane(new Vector3(0, 0, -1), 0),
      ];

      const frustum = new Frustum(planes);

      expect(frustum.planes).toHaveLength(6);
      expect(frustum.planes[0].equals(planes[0])).toBe(true);
    });

    it('ignores incomplete plane array', () => {
      const planes = [
        new Plane(new Vector3(1, 0, 0), 0),
        new Plane(new Vector3(-1, 0, 0), 0),
      ];

      const frustum = new Frustum(planes);

      expect(frustum.planes).toHaveLength(6);
    });
  });

  describe('static factory methods', () => {
    it('fromProjectionMatrix() creates frustum from matrix', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 1, 0.1, 100);
      const viewProj = projection.multiply(view);

      const frustum = Frustum.fromProjectionMatrix(viewProj);

      expect(frustum.planes).toHaveLength(6);
      frustum.planes.forEach(plane => {
        expect(plane.normal.length()).toBeCloseTo(1, 4);
      });
    });
  });

  describe('setFromProjectionMatrix', () => {
    it('extracts planes from view-projection matrix', () => {
      const frustum = new Frustum();
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 1, 0.1, 100);
      const viewProj = projection.multiply(view);

      frustum.setFromProjectionMatrix(viewProj);

      frustum.planes.forEach(plane => {
        expect(plane.normal.length()).toBeCloseTo(1, 4);
      });
    });

    it('normalizes plane equations', () => {
      const frustum = new Frustum();
      const matrix = Matrix4.perspective(Math.PI / 4, 16/9, 0.1, 1000);

      frustum.setFromProjectionMatrix(matrix);

      frustum.planes.forEach(plane => {
        expect(plane.normal.length()).toBeCloseTo(1, 4);
      });
    });

    it('returns this for chaining', () => {
      const frustum = new Frustum();
      const matrix = Matrix4.perspective(Math.PI / 4, 1, 0.1, 100);

      const result = frustum.setFromProjectionMatrix(matrix);

      expect(result).toBe(frustum);
    });
  });

  describe('setFromViewProjectionMatrix', () => {
    it('combines view and projection matrices', () => {
      const frustum = new Frustum();
      const view = Matrix4.lookAt(
        new Vector3(0, 5, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 16/9, 0.1, 100);

      frustum.setFromViewProjectionMatrix(view, projection);

      frustum.planes.forEach(plane => {
        expect(plane.normal.length()).toBeCloseTo(1, 4);
      });
    });

    it('returns this for chaining', () => {
      const frustum = new Frustum();
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        Vector3.zero(),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 1, 0.1, 100);

      const result = frustum.setFromViewProjectionMatrix(view, projection);

      expect(result).toBe(frustum);
    });
  });

  describe('containsPoint', () => {
    let frustum: Frustum;

    beforeEach(() => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 1, 1, 20);
      const viewProj = projection.multiply(view);
      frustum = Frustum.fromProjectionMatrix(viewProj);
    });

    it('detects point inside frustum', () => {
      const point = new Vector3(0, 0, 5);
      expect(frustum.containsPoint(point)).toBe(true);
    });

    it('detects point at center of frustum', () => {
      const point = new Vector3(0, 0, 0);
      expect(frustum.containsPoint(point)).toBe(true);
    });

    it('detects point outside frustum', () => {
      const point = new Vector3(100, 0, 0);
      expect(frustum.containsPoint(point)).toBe(false);
    });

    it('detects point behind near plane', () => {
      const point = new Vector3(0, 0, 15);
      expect(frustum.containsPoint(point)).toBe(false);
    });

    it('detects point beyond far plane', () => {
      const point = new Vector3(0, 0, -15);
      expect(frustum.containsPoint(point)).toBe(false);
    });
  });

  describe('intersectsBox', () => {
    let frustum: Frustum;

    beforeEach(() => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 1, 1, 20);
      const viewProj = projection.multiply(view);
      frustum = Frustum.fromProjectionMatrix(viewProj);
    });

    it('detects box inside frustum', () => {
      const box = {
        min: new Vector3(-1, -1, -1),
        max: new Vector3(1, 1, 1),
      };

      expect(frustum.intersectsBox(box)).toBe(true);
    });

    it('detects box partially inside frustum', () => {
      const box = {
        min: new Vector3(-5, -5, -5),
        max: new Vector3(5, 5, 5),
      };

      expect(frustum.intersectsBox(box)).toBe(true);
    });

    it('detects box outside frustum', () => {
      const box = {
        min: new Vector3(100, 100, 100),
        max: new Vector3(101, 101, 101),
      };

      expect(frustum.intersectsBox(box)).toBe(false);
    });

    it('detects box behind camera', () => {
      const box = {
        min: new Vector3(-1, -1, 15),
        max: new Vector3(1, 1, 20),
      };

      expect(frustum.intersectsBox(box)).toBe(false);
    });

    it('detects box beyond far plane', () => {
      const box = {
        min: new Vector3(-1, -1, -25),
        max: new Vector3(1, 1, -20),
      };

      expect(frustum.intersectsBox(box)).toBe(false);
    });

    it('handles box touching frustum boundary', () => {
      const box = {
        min: new Vector3(-0.1, -0.1, -0.1),
        max: new Vector3(0.1, 0.1, 0.1),
      };

      expect(frustum.intersectsBox(box)).toBe(true);
    });
  });

  describe('intersectsSphere', () => {
    let frustum: Frustum;

    beforeEach(() => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 1, 1, 20);
      const viewProj = projection.multiply(view);
      frustum = Frustum.fromProjectionMatrix(viewProj);
    });

    it('detects sphere inside frustum', () => {
      const sphere = {
        center: new Vector3(0, 0, 0),
        radius: 1,
      };

      expect(frustum.intersectsSphere(sphere)).toBe(true);
    });

    it('detects sphere partially inside frustum', () => {
      const sphere = {
        center: new Vector3(0, 0, 0),
        radius: 10,
      };

      expect(frustum.intersectsSphere(sphere)).toBe(true);
    });

    it('detects sphere outside frustum', () => {
      const sphere = {
        center: new Vector3(100, 0, 0),
        radius: 1,
      };

      expect(frustum.intersectsSphere(sphere)).toBe(false);
    });

    it('detects sphere behind camera', () => {
      const sphere = {
        center: new Vector3(0, 0, 15),
        radius: 2,
      };

      expect(frustum.intersectsSphere(sphere)).toBe(false);
    });

    it('detects sphere beyond far plane', () => {
      const sphere = {
        center: new Vector3(0, 0, -25),
        radius: 2,
      };

      expect(frustum.intersectsSphere(sphere)).toBe(false);
    });

    it('detects sphere touching frustum boundary', () => {
      const sphere = {
        center: new Vector3(0, 0, 0),
        radius: 0.5,
      };

      expect(frustum.intersectsSphere(sphere)).toBe(true);
    });
  });

  describe('getCorners', () => {
    it('returns 8 corner points', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 1, 1, 20);
      const viewProj = projection.multiply(view);
      const frustum = Frustum.fromProjectionMatrix(viewProj);

      const corners = frustum.getCorners();

      expect(corners).toHaveLength(8);
    });

    it('returns Vector3 instances', () => {
      const frustum = new Frustum();
      const corners = frustum.getCorners();

      corners.forEach(corner => {
        expect(corner).toBeInstanceOf(Vector3);
      });
    });

    it('corners form valid frustum shape', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 1, 1, 20);
      const viewProj = projection.multiply(view);
      const frustum = Frustum.fromProjectionMatrix(viewProj);

      const corners = frustum.getCorners();

      // Near plane corners (first 4) should be closer than far plane corners
      const nearCorners = corners.slice(0, 4);
      const farCorners = corners.slice(4, 8);

      nearCorners.forEach(nearCorner => {
        farCorners.forEach(farCorner => {
          expect(nearCorner.z).toBeGreaterThan(farCorner.z);
        });
      });
    });

    it('handles orthographic projection', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.orthographic(-5, 5, -5, 5, 0.1, 100);
      const viewProj = projection.multiply(view);
      const frustum = Frustum.fromProjectionMatrix(viewProj);

      const corners = frustum.getCorners();

      expect(corners).toHaveLength(8);
    });
  });

  describe('copy and clone operations', () => {
    it('clone() creates independent copy', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 1, 1, 20);
      const viewProj = projection.multiply(view);
      const original = Frustum.fromProjectionMatrix(viewProj);

      const cloned = original.clone();

      expect(cloned.planes).toHaveLength(6);
      cloned.planes.forEach((plane, i) => {
        expect(plane.equals(original.planes[i])).toBe(true);
      });

      cloned.planes[0].constant = 999;
      expect(cloned.planes[0].equals(original.planes[0])).toBe(false);
    });

    it('copy() copies values from another frustum', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 1, 1, 20);
      const viewProj = projection.multiply(view);
      const source = Frustum.fromProjectionMatrix(viewProj);
      const target = new Frustum();

      target.copy(source);

      target.planes.forEach((plane, i) => {
        expect(plane.equals(source.planes[i])).toBe(true);
      });
    });

    it('copy() returns this for chaining', () => {
      const source = new Frustum();
      const target = new Frustum();

      const result = target.copy(source);

      expect(result).toBe(target);
    });
  });

  describe('perspective projection', () => {
    it('creates correct frustum for perspective projection', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 16/9, 0.1, 100);
      const viewProj = projection.multiply(view);
      const frustum = Frustum.fromProjectionMatrix(viewProj);

      const origin = new Vector3(0, 0, 10);
      expect(frustum.containsPoint(origin)).toBe(true);
    });

    it('correctly culls objects outside view', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 1, 1, 20);
      const viewProj = projection.multiply(view);
      const frustum = Frustum.fromProjectionMatrix(viewProj);

      const farBox = {
        min: new Vector3(-1, -1, -50),
        max: new Vector3(1, 1, -45),
      };

      expect(frustum.intersectsBox(farBox)).toBe(false);
    });

    it('includes objects in narrow field of view', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 8, 1, 1, 20);
      const viewProj = projection.multiply(view);
      const frustum = Frustum.fromProjectionMatrix(viewProj);

      const centerBox = {
        min: new Vector3(-0.5, -0.5, -0.5),
        max: new Vector3(0.5, 0.5, 0.5),
      };

      expect(frustum.intersectsBox(centerBox)).toBe(true);
    });
  });

  describe('orthographic projection', () => {
    it('creates correct frustum for orthographic projection', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.orthographic(-10, 10, -10, 10, 0.1, 100);
      const viewProj = projection.multiply(view);
      const frustum = Frustum.fromProjectionMatrix(viewProj);

      expect(frustum.planes).toHaveLength(6);
      frustum.planes.forEach(plane => {
        expect(plane.normal.length()).toBeCloseTo(1, 4);
      });
    });

    it('has parallel sides for orthographic projection', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.orthographic(-5, 5, -5, 5, 0.1, 100);
      const viewProj = projection.multiply(view);
      const frustum = Frustum.fromProjectionMatrix(viewProj);

      const nearBox = {
        min: new Vector3(-4, -4, 0),
        max: new Vector3(4, 4, 1),
      };

      expect(frustum.intersectsBox(nearBox)).toBe(true);
    });
  });

  describe('culling optimization', () => {
    it('early-out returns false quickly for distant objects', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 1, 1, 20);
      const viewProj = projection.multiply(view);
      const frustum = Frustum.fromProjectionMatrix(viewProj);

      const distantBox = {
        min: new Vector3(1000, 1000, 1000),
        max: new Vector3(1001, 1001, 1001),
      };

      expect(frustum.intersectsBox(distantBox)).toBe(false);
    });

    it('handles large box spanning multiple planes', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 1, 1, 20);
      const viewProj = projection.multiply(view);
      const frustum = Frustum.fromProjectionMatrix(viewProj);

      const largeBox = {
        min: new Vector3(-100, -100, -100),
        max: new Vector3(100, 100, 100),
      };

      expect(frustum.intersectsBox(largeBox)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles identity matrix', () => {
      const frustum = new Frustum();
      const identity = new Matrix4();

      frustum.setFromProjectionMatrix(identity);

      expect(frustum.planes).toHaveLength(6);
    });

    it('handles extremely narrow frustum', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(0.01, 1, 1, 20);
      const viewProj = projection.multiply(view);
      const frustum = Frustum.fromProjectionMatrix(viewProj);

      const centerPoint = new Vector3(0, 0, 0);
      expect(frustum.containsPoint(centerPoint)).toBe(true);
    });

    it('handles extremely wide frustum', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI * 0.9, 1, 1, 20);
      const viewProj = projection.multiply(view);
      const frustum = Frustum.fromProjectionMatrix(viewProj);

      expect(frustum.planes).toHaveLength(6);
    });

    it('handles very large depth range', () => {
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 10),
        new Vector3(0, 0, 0),
        new Vector3(0, 1, 0)
      );
      const projection = Matrix4.perspective(Math.PI / 4, 1, 0.001, 10000);
      const viewProj = projection.multiply(view);
      const frustum = Frustum.fromProjectionMatrix(viewProj);

      expect(frustum.planes).toHaveLength(6);
    });
  });
});
