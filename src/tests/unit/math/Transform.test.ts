import { describe, it, expect } from 'vitest';
import { Transform } from '../../../math/Transform';
import { Vector3 } from '../../../math/Vector3';
import { Quaternion } from '../../../math/Quaternion';
import { Matrix4 } from '../../../math/Matrix4';
import { EPSILON } from '../../../math/MathConstants';

describe('Transform', () => {
  describe('constructor', () => {
    it('creates identity transform by default', () => {
      const t = new Transform();

      expect(t.position.equals(new Vector3(0, 0, 0))).toBe(true);
      expect(t.rotation.equals(Quaternion.identity())).toBe(true);
      expect(t.scale.equals(new Vector3(1, 1, 1))).toBe(true);
    });

    it('initializes with identity matrices', () => {
      const t = new Transform();

      expect(t.localMatrix.equals(Matrix4.identity(), EPSILON)).toBe(true);
      expect(t.worldMatrix.equals(Matrix4.identity(), EPSILON)).toBe(true);
    });
  });

  describe('position, rotation, scale', () => {
    it('position getter returns proxied vector', () => {
      const t = new Transform();
      const pos = t.position;

      expect(pos).toBeDefined();
      expect(pos instanceof Vector3).toBe(true);
    });

    it('position setter sets value', () => {
      const t = new Transform();
      t.position = new Vector3(1, 2, 3);

      expect(t.position.x).toBe(1);
      expect(t.position.y).toBe(2);
      expect(t.position.z).toBe(3);
    });

    it('modifying position marks transform dirty', () => {
      const t = new Transform();
      t.updateMatrix(); // Clear dirty flag

      t.position.set(1, 2, 3);

      expect(t.isDirty).toBe(true);
    });

    it('rotation setter sets value', () => {
      const t = new Transform();
      const rot = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      t.rotation = rot;

      expect(t.rotation.equals(rot)).toBe(true);
    });

    it('scale getter returns proxied vector', () => {
      const t = new Transform();
      const scale = t.scale;

      expect(scale).toBeDefined();
      expect(scale instanceof Vector3).toBe(true);
    });

    it('scale setter sets value', () => {
      const t = new Transform();
      t.scale = new Vector3(2, 3, 4);

      expect(t.scale.x).toBe(2);
      expect(t.scale.y).toBe(3);
      expect(t.scale.z).toBe(4);
    });

    it('modifying scale marks transform dirty', () => {
      const t = new Transform();
      t.updateMatrix(); // Clear dirty flag

      t.scale.set(2, 2, 2);

      expect(t.isDirty).toBe(true);
    });
  });

  describe('local vs world space', () => {
    it('worldPosition returns world position', () => {
      const t = new Transform();
      t.position.set(1, 2, 3);

      const worldPos = t.worldPosition;
      expect(worldPos.equals(new Vector3(1, 2, 3))).toBe(true);
    });

    it('worldPosition accounts for parent transform', () => {
      const parent = new Transform();
      parent.position.set(10, 0, 0);

      const child = new Transform();
      child.position.set(5, 0, 0);
      parent.addChild(child);

      const worldPos = child.worldPosition;
      expect(worldPos.x).toBeCloseTo(15, 10);
    });

    it('worldPosition setter updates local position', () => {
      const t = new Transform();
      t.worldPosition = new Vector3(5, 10, 15);

      expect(t.position.equals(new Vector3(5, 10, 15), EPSILON)).toBe(true);
    });

    it('worldPosition setter with parent', () => {
      const parent = new Transform();
      parent.position.set(10, 0, 0);

      const child = new Transform();
      parent.addChild(child);

      child.worldPosition = new Vector3(15, 0, 0);

      expect(child.position.x).toBeCloseTo(5, 10);
    });

    it('worldRotation returns world rotation', () => {
      const t = new Transform();
      const rot = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      t.rotation = rot;

      const worldRot = t.worldRotation;
      expect(worldRot.equals(rot, EPSILON)).toBe(true);
    });

    it('worldRotation accounts for parent transform', () => {
      const parent = new Transform();
      parent.rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);

      const child = new Transform();
      child.rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      parent.addChild(child);

      const worldRot = child.worldRotation;
      const expected = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);

      expect(worldRot.equals(expected, 1e-6)).toBe(true);
    });

    it('worldScale returns world scale', () => {
      const t = new Transform();
      t.scale.set(2, 3, 4);

      const worldScale = t.worldScale;
      expect(worldScale.equals(new Vector3(2, 3, 4), EPSILON)).toBe(true);
    });

    it('worldScale accounts for parent transform', () => {
      const parent = new Transform();
      parent.scale.set(2, 2, 2);

      const child = new Transform();
      child.scale.set(3, 3, 3);
      parent.addChild(child);

      const worldScale = child.worldScale;
      expect(worldScale.x).toBeCloseTo(6, 10);
      expect(worldScale.y).toBeCloseTo(6, 10);
      expect(worldScale.z).toBeCloseTo(6, 10);
    });
  });

  describe('parent-child hierarchy', () => {
    it('addChild() sets parent reference', () => {
      const parent = new Transform();
      const child = new Transform();

      parent.addChild(child);

      expect(child.parent).toBe(parent);
    });

    it('addChild() adds to children array', () => {
      const parent = new Transform();
      const child = new Transform();

      parent.addChild(child);

      expect(parent.children).toContain(child);
      expect(parent.children.length).toBe(1);
    });

    it('addChild() removes from previous parent', () => {
      const parent1 = new Transform();
      const parent2 = new Transform();
      const child = new Transform();

      parent1.addChild(child);
      parent2.addChild(child);

      expect(child.parent).toBe(parent2);
      expect(parent1.children).not.toContain(child);
      expect(parent2.children).toContain(child);
    });

    it('addChild() rejects self as child', () => {
      const t = new Transform();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      t.addChild(t);

      expect(t.parent).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('addChild() rejects ancestor as child', () => {
      const grandparent = new Transform();
      const parent = new Transform();
      const child = new Transform();

      grandparent.addChild(parent);
      parent.addChild(child);

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      child.addChild(grandparent);

      expect(grandparent.parent).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('removeChild() removes child', () => {
      const parent = new Transform();
      const child = new Transform();

      parent.addChild(child);
      parent.removeChild(child);

      expect(child.parent).toBeNull();
      expect(parent.children).not.toContain(child);
    });

    it('removeChild() does nothing if not a child', () => {
      const parent = new Transform();
      const notChild = new Transform();

      parent.removeChild(notChild);

      expect(parent.children.length).toBe(0);
    });

    it('setParent() sets parent', () => {
      const parent = new Transform();
      const child = new Transform();

      child.setParent(parent);

      expect(child.parent).toBe(parent);
      expect(parent.children).toContain(child);
    });

    it('setParent(null) removes parent', () => {
      const parent = new Transform();
      const child = new Transform();

      parent.addChild(child);
      child.setParent(null);

      expect(child.parent).toBeNull();
      expect(parent.children).not.toContain(child);
    });

    it('parent setter works', () => {
      const parent = new Transform();
      const child = new Transform();

      child.parent = parent;

      expect(child.parent).toBe(parent);
      expect(parent.children).toContain(child);
    });

    it('children getter returns readonly array', () => {
      const parent = new Transform();
      const child = new Transform();
      parent.addChild(child);

      const children = parent.children;
      expect(children.length).toBe(1);
      expect(children[0]).toBe(child);
    });
  });

  describe('matrix generation', () => {
    it('localMatrix composes TRS', () => {
      const t = new Transform();
      t.position.set(1, 2, 3);
      t.rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      t.scale.set(2, 2, 2);

      const matrix = t.localMatrix;

      const pos = matrix.getPosition();
      const scale = matrix.getScale();

      expect(pos.equals(new Vector3(1, 2, 3), EPSILON)).toBe(true);
      expect(scale.x).toBeCloseTo(2, 10);
    });

    it('worldMatrix equals localMatrix with no parent', () => {
      const t = new Transform();
      t.position.set(5, 10, 15);

      expect(t.worldMatrix.equals(t.localMatrix, EPSILON)).toBe(true);
    });

    it('worldMatrix combines parent transforms', () => {
      const parent = new Transform();
      parent.position.set(10, 0, 0);

      const child = new Transform();
      child.position.set(5, 0, 0);
      parent.addChild(child);

      const worldMatrix = child.worldMatrix;
      const worldPos = worldMatrix.getPosition();

      expect(worldPos.x).toBeCloseTo(15, 10);
    });

    it('updateMatrix() clears local dirty flag', () => {
      const t = new Transform();
      t.position.set(1, 2, 3);

      expect(t.isDirty).toBe(true);

      t.updateMatrix();

      // Local matrix dirty should be cleared
      const localMatrix = t.localMatrix;
      expect(localMatrix).toBeDefined();
    });

    it('updateWorldMatrix() updates full hierarchy', () => {
      const parent = new Transform();
      const child = new Transform();
      parent.addChild(child);

      parent.position.set(10, 0, 0);
      child.position.set(5, 0, 0);

      parent.updateWorldMatrix(true);

      const childWorldPos = child.worldMatrix.getPosition();
      expect(childWorldPos.x).toBeCloseTo(15, 10);
    });

    it('updateWorldMatrix() propagates to children', () => {
      const parent = new Transform();
      const child1 = new Transform();
      const child2 = new Transform();

      parent.addChild(child1);
      parent.addChild(child2);

      parent.position.set(10, 0, 0);

      parent.updateWorldMatrix(true);

      expect(child1.worldMatrix.getPosition().x).toBeCloseTo(10, 10);
      expect(child2.worldMatrix.getPosition().x).toBeCloseTo(10, 10);
    });
  });

  describe('lookAt functionality', () => {
    it('lookAt() rotates to face target', () => {
      const t = new Transform();
      t.position.set(0, 0, 10);

      t.lookAt(new Vector3(0, 0, 0));

      const forward = t.rotation.rotateVector(Vector3.forward());
      const expectedForward = new Vector3(0, 0, -1);

      expect(forward.equals(expectedForward, 1e-6)).toBe(true);
    });

    it('lookAt() handles custom up vector', () => {
      const t = new Transform();
      t.position.set(10, 0, 0);

      t.lookAt(new Vector3(0, 0, 0), Vector3.up());

      expect(t.rotation).toBeDefined();
    });

    it('lookAt() handles degenerate case (at target)', () => {
      const t = new Transform();
      t.position.set(0, 0, 0);

      t.lookAt(new Vector3(0, 0, 0));

      // Should handle gracefully
      expect(t.rotation).toBeDefined();
    });

    it('lookAt() with parent uses world position', () => {
      const parent = new Transform();
      parent.position.set(10, 0, 0);

      const child = new Transform();
      child.position.set(5, 0, 0);
      parent.addChild(child);

      child.lookAt(new Vector3(0, 0, 0));

      expect(child.rotation).toBeDefined();
    });

    it('rotateAround() rotates around point', () => {
      const t = new Transform();
      t.position.set(5, 0, 0);

      t.rotateAround(
        new Vector3(0, 0, 0),
        Vector3.up(),
        Math.PI / 2
      );

      // Should be at approximately (0, 0, -5)
      expect(t.position.x).toBeCloseTo(0, 5);
      expect(t.position.z).toBeCloseTo(-5, 5);
    });

    it('rotateAround() with parent', () => {
      const parent = new Transform();
      parent.position.set(10, 0, 0);

      const child = new Transform();
      child.position.set(5, 0, 0);
      parent.addChild(child);

      child.rotateAround(
        new Vector3(0, 0, 0),
        Vector3.up(),
        Math.PI / 2
      );

      expect(child.position).toBeDefined();
    });
  });

  describe('point and direction transformation', () => {
    it('transformPoint() transforms local to world', () => {
      const t = new Transform();
      t.position.set(10, 0, 0);

      const localPoint = new Vector3(5, 0, 0);
      const worldPoint = t.transformPoint(localPoint);

      expect(worldPoint.x).toBeCloseTo(15, 10);
    });

    it('transformPoint() applies rotation', () => {
      const t = new Transform();
      t.rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);

      const localPoint = new Vector3(1, 0, 0);
      const worldPoint = t.transformPoint(localPoint);

      expect(worldPoint.x).toBeCloseTo(0, 10);
      expect(worldPoint.z).toBeCloseTo(-1, 10);
    });

    it('transformPoint() applies scale', () => {
      const t = new Transform();
      t.scale.set(2, 2, 2);

      const localPoint = new Vector3(1, 1, 1);
      const worldPoint = t.transformPoint(localPoint);

      expect(worldPoint.x).toBeCloseTo(2, 10);
      expect(worldPoint.y).toBeCloseTo(2, 10);
      expect(worldPoint.z).toBeCloseTo(2, 10);
    });

    it('transformDirection() ignores translation', () => {
      const t = new Transform();
      t.position.set(100, 200, 300);
      t.scale.set(2, 2, 2);

      const localDir = new Vector3(1, 0, 0);
      const worldDir = t.transformDirection(localDir);

      expect(worldDir.x).toBeCloseTo(2, 10);
      expect(worldDir.y).toBeCloseTo(0, 10);
      expect(worldDir.z).toBeCloseTo(0, 10);
    });

    it('transformDirection() applies rotation', () => {
      const t = new Transform();
      t.rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);

      const localDir = new Vector3(1, 0, 0);
      const worldDir = t.transformDirection(localDir);

      expect(worldDir.x).toBeCloseTo(0, 10);
      expect(worldDir.z).toBeCloseTo(-1, 10);
    });

    it('inverseTransformPoint() transforms world to local', () => {
      const t = new Transform();
      t.position.set(10, 0, 0);

      const worldPoint = new Vector3(15, 0, 0);
      const localPoint = t.inverseTransformPoint(worldPoint);

      expect(localPoint.x).toBeCloseTo(5, 10);
    });

    it('inverseTransformPoint() roundtrip', () => {
      const t = new Transform();
      t.position.set(1, 2, 3);
      t.rotation = Quaternion.fromAxisAngle(Vector3.up(), 0.7);
      t.scale.set(2, 3, 4);

      const localPoint = new Vector3(5, 10, 15);
      const worldPoint = t.transformPoint(localPoint);
      const backToLocal = t.inverseTransformPoint(worldPoint);

      expect(backToLocal.equals(localPoint, 1e-6)).toBe(true);
    });

    it('inverseTransformDirection() roundtrip', () => {
      const t = new Transform();
      t.rotation = Quaternion.fromAxisAngle(Vector3.up(), 0.5);
      t.scale.set(2, 2, 2);

      const localDir = new Vector3(1, 0, 0);
      const worldDir = t.transformDirection(localDir);
      const backToLocal = t.inverseTransformDirection(worldDir);

      const normalized = backToLocal.normalize();
      expect(normalized.equals(localDir, 1e-6)).toBe(true);
    });

    it('inverseTransformPoint() handles singular matrix', () => {
      const t = new Transform();
      t.scale.set(0, 1, 1);

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const worldPoint = new Vector3(1, 2, 3);
      const result = t.inverseTransformPoint(worldPoint);

      expect(result).toBeDefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('clone and copy', () => {
    it('clone() creates independent copy', () => {
      const t1 = new Transform();
      t1.position.set(1, 2, 3);
      t1.rotation = Quaternion.fromAxisAngle(Vector3.up(), 0.5);
      t1.scale.set(2, 3, 4);

      const t2 = t1.clone();

      expect(t2.position.equals(t1.position)).toBe(true);
      expect(t2.rotation.equals(t1.rotation)).toBe(true);
      expect(t2.scale.equals(t1.scale)).toBe(true);

      t2.position.set(0, 0, 0);
      expect(t1.position.equals(new Vector3(1, 2, 3))).toBe(true);
    });

    it('clone() does not copy parent-child relationships', () => {
      const parent = new Transform();
      const child = new Transform();
      parent.addChild(child);

      const childClone = child.clone();

      expect(childClone.parent).toBeNull();
    });

    it('copy() copies TRS values', () => {
      const t1 = new Transform();
      t1.position.set(5, 10, 15);
      t1.rotation = Quaternion.fromAxisAngle(Vector3.right(), 0.7);
      t1.scale.set(1.5, 2.5, 3.5);

      const t2 = new Transform();
      t2.copy(t1);

      expect(t2.position.equals(t1.position)).toBe(true);
      expect(t2.rotation.equals(t1.rotation)).toBe(true);
      expect(t2.scale.equals(t1.scale)).toBe(true);
    });

    it('copy() does not copy parent-child relationships', () => {
      const parent = new Transform();
      const child = new Transform();
      parent.addChild(child);

      const t2 = new Transform();
      t2.copy(child);

      expect(t2.parent).toBeNull();
    });

    it('copy() returns this for chaining', () => {
      const t1 = new Transform();
      const t2 = new Transform();
      const result = t2.copy(t1);

      expect(result).toBe(t2);
    });
  });

  describe('reset', () => {
    it('reset() returns to identity', () => {
      const t = new Transform();
      t.position.set(10, 20, 30);
      t.rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      t.scale.set(2, 3, 4);

      t.reset();

      expect(t.position.equals(new Vector3(0, 0, 0))).toBe(true);
      expect(t.rotation.equals(Quaternion.identity())).toBe(true);
      expect(t.scale.equals(new Vector3(1, 1, 1))).toBe(true);
    });

    it('reset() returns this for chaining', () => {
      const t = new Transform();
      const result = t.reset();

      expect(result).toBe(t);
    });
  });

  describe('dirty flag propagation', () => {
    it('modifying position marks local matrix dirty', () => {
      const t = new Transform();
      t.updateMatrix();

      t.position.set(1, 2, 3);

      expect(t.isDirty).toBe(true);
    });

    it('modifying rotation marks dirty', () => {
      const t = new Transform();
      t.updateMatrix();

      t.rotation = Quaternion.fromAxisAngle(Vector3.up(), 0.5);

      expect(t.isDirty).toBe(true);
    });

    it('modifying scale marks dirty', () => {
      const t = new Transform();
      t.updateMatrix();

      t.scale.set(2, 2, 2);

      expect(t.isDirty).toBe(true);
    });

    it('dirty flag propagates to children', () => {
      const parent = new Transform();
      const child = new Transform();
      parent.addChild(child);

      parent.updateWorldMatrix(true);

      parent.position.set(10, 0, 0);

      expect(child.isDirty).toBe(true);
    });

    it('adding child marks child dirty', () => {
      const parent = new Transform();
      const child = new Transform();

      child.updateWorldMatrix();

      parent.addChild(child);

      expect(child.isDirty).toBe(true);
    });
  });

  describe('onChange callback', () => {
    it('onChange is called when transform changes', () => {
      const t = new Transform();
      let callCount = 0;

      t.onChange = () => {
        callCount++;
      };

      t.position.set(1, 2, 3);

      expect(callCount).toBeGreaterThan(0);
    });

    it('onChange can be null', () => {
      const t = new Transform();
      t.onChange = null;

      t.position.set(1, 2, 3);

      // Should not throw
      expect(t.position.x).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('handles zero scale gracefully', () => {
      const t = new Transform();
      t.scale.set(0, 1, 1);

      const matrix = t.localMatrix;
      expect(matrix.determinant()).toBe(0);
    });

    it('handles very large scale', () => {
      const t = new Transform();
      t.scale.set(1e6, 1e6, 1e6);

      const point = new Vector3(1, 1, 1);
      const transformed = t.transformPoint(point);

      expect(transformed.x).toBeCloseTo(1e6, 0);
    });

    it('handles very small scale', () => {
      const t = new Transform();
      t.scale.set(1e-6, 1e-6, 1e-6);

      const matrix = t.localMatrix;
      expect(matrix.determinant()).toBeCloseTo(1e-18, 20);
    });

    it('handles deep hierarchy', () => {
      const transforms: Transform[] = [];
      for (let i = 0; i < 10; i++) {
        transforms.push(new Transform());
        if (i > 0) {
          transforms[i - 1].addChild(transforms[i]);
        }
        transforms[i].position.set(1, 0, 0);
      }

      const deepestChild = transforms[9];
      const worldPos = deepestChild.worldPosition;

      expect(worldPos.x).toBeCloseTo(10, 10);
    });

    it('warns about non-uniform scale', () => {
      const t = new Transform();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      t.scale.set(1, 2, 3);
      t.updateMatrix();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles identity lookAt gracefully', () => {
      const t = new Transform();
      t.lookAt(Vector3.zero());

      expect(t.rotation).toBeDefined();
    });
  });

  describe('numerical stability', () => {
    it('accumulated transformations remain stable', () => {
      const t = new Transform();

      for (let i = 0; i < 100; i++) {
        t.position.addInPlace(new Vector3(0.01, 0, 0));
      }

      expect(t.position.x).toBeCloseTo(1, 6);
    });

    it('parent-child transform is numerically stable', () => {
      const parent = new Transform();
      const child = new Transform();
      parent.addChild(child);

      parent.position.set(1000, 2000, 3000);
      child.position.set(0.001, 0.002, 0.003);

      const worldPos = child.worldPosition;

      expect(worldPos.x).toBeCloseTo(1000.001, 6);
      expect(worldPos.y).toBeCloseTo(2000.002, 6);
      expect(worldPos.z).toBeCloseTo(3000.003, 6);
    });

    it('transform-inverse-transform roundtrip', () => {
      const t = new Transform();
      t.position.set(10, 20, 30);
      t.rotation = Quaternion.fromAxisAngle(
        new Vector3(1, 1, 1).normalize(),
        Math.PI / 3
      );
      t.scale.set(2, 3, 4);

      const point = new Vector3(5, 10, 15);
      const worldPoint = t.transformPoint(point);
      const localPoint = t.inverseTransformPoint(worldPoint);

      expect(localPoint.equals(point, 1e-6)).toBe(true);
    });
  });
});
