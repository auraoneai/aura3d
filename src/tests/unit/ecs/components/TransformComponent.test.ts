/**
 * @fileoverview Unit tests for TransformComponent.
 * Tests transformation operations, hierarchies, matrix computations, and serialization.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TransformComponent } from '../../../../ecs/components/TransformComponent';
import { Vector3 } from '../../../../math/Vector3';
import { Quaternion } from '../../../../math/Quaternion';
import { Matrix4 } from '../../../../math/Matrix4';

describe('TransformComponent', () => {
  describe('initialization', () => {
    it('creates with identity transform by default', () => {
      const transform = new TransformComponent();

      expect(transform.position.x).toBe(0);
      expect(transform.position.y).toBe(0);
      expect(transform.position.z).toBe(0);

      expect(transform.rotation.x).toBe(0);
      expect(transform.rotation.y).toBe(0);
      expect(transform.rotation.z).toBe(0);
      expect(transform.rotation.w).toBe(1);

      expect(transform.scale.x).toBe(1);
      expect(transform.scale.y).toBe(1);
      expect(transform.scale.z).toBe(1);

      expect(transform.parentEntity).toBe(0);
    });

    it('creates with initial position', () => {
      const position = new Vector3(10, 20, 30);
      const transform = new TransformComponent({ position });

      expect(transform.position.x).toBe(10);
      expect(transform.position.y).toBe(20);
      expect(transform.position.z).toBe(30);

      expect(transform.rotation.w).toBe(1);
      expect(transform.scale.x).toBe(1);
    });

    it('creates with initial rotation', () => {
      const rotation = Quaternion.fromEuler(0, Math.PI / 2, 0);
      const transform = new TransformComponent({ rotation });

      expect(transform.rotation.x).toBeCloseTo(rotation.x);
      expect(transform.rotation.y).toBeCloseTo(rotation.y);
      expect(transform.rotation.z).toBeCloseTo(rotation.z);
      expect(transform.rotation.w).toBeCloseTo(rotation.w);

      expect(transform.position.x).toBe(0);
      expect(transform.scale.x).toBe(1);
    });

    it('creates with initial scale', () => {
      const scale = new Vector3(2, 3, 4);
      const transform = new TransformComponent({ scale });

      expect(transform.scale.x).toBe(2);
      expect(transform.scale.y).toBe(3);
      expect(transform.scale.z).toBe(4);

      expect(transform.position.x).toBe(0);
      expect(transform.rotation.w).toBe(1);
    });

    it('creates with complete initial state', () => {
      const position = new Vector3(1, 2, 3);
      const rotation = Quaternion.fromEuler(Math.PI / 4, Math.PI / 2, 0);
      const scale = new Vector3(2, 2, 2);

      const transform = new TransformComponent({ position, rotation, scale });

      expect(transform.position.x).toBe(1);
      expect(transform.position.y).toBe(2);
      expect(transform.position.z).toBe(3);

      expect(transform.rotation.x).toBeCloseTo(rotation.x);
      expect(transform.rotation.y).toBeCloseTo(rotation.y);
      expect(transform.rotation.z).toBeCloseTo(rotation.z);
      expect(transform.rotation.w).toBeCloseTo(rotation.w);

      expect(transform.scale.x).toBe(2);
      expect(transform.scale.y).toBe(2);
      expect(transform.scale.z).toBe(2);
    });

    it('clones input vectors to avoid external mutations', () => {
      const position = new Vector3(1, 2, 3);
      const scale = new Vector3(2, 2, 2);
      const transform = new TransformComponent({ position, scale });

      position.set(100, 200, 300);
      scale.set(10, 10, 10);

      expect(transform.position.x).toBe(1);
      expect(transform.position.y).toBe(2);
      expect(transform.position.z).toBe(3);

      expect(transform.scale.x).toBe(2);
      expect(transform.scale.y).toBe(2);
      expect(transform.scale.z).toBe(2);
    });
  });

  describe('local transform operations', () => {
    let transform: TransformComponent;

    beforeEach(() => {
      transform = new TransformComponent();
    });

    it('translate() updates position correctly', () => {
      transform.translate(new Vector3(5, 10, 15));

      expect(transform.position.x).toBe(5);
      expect(transform.position.y).toBe(10);
      expect(transform.position.z).toBe(15);
    });

    it('translate() accumulates multiple translations', () => {
      transform.translate(new Vector3(1, 0, 0));
      transform.translate(new Vector3(0, 2, 0));
      transform.translate(new Vector3(0, 0, 3));

      expect(transform.position.x).toBe(1);
      expect(transform.position.y).toBe(2);
      expect(transform.position.z).toBe(3);
    });

    it('rotateX() rotates around X axis', () => {
      transform.rotateX(Math.PI / 2);

      const forward = transform.forward;
      expect(forward.x).toBeCloseTo(0);
      expect(forward.y).toBeCloseTo(-1);
      expect(forward.z).toBeCloseTo(0, 5);
    });

    it('rotateY() rotates around Y axis', () => {
      transform.rotateY(Math.PI / 2);

      const forward = transform.forward;
      expect(forward.x).toBeCloseTo(1, 5);
      expect(forward.y).toBeCloseTo(0);
      expect(forward.z).toBeCloseTo(0);
    });

    it('rotateZ() rotates around Z axis', () => {
      transform.rotateZ(Math.PI / 2);

      const right = transform.right;
      expect(right.x).toBeCloseTo(0);
      expect(right.y).toBeCloseTo(1, 5);
      expect(right.z).toBeCloseTo(0);
    });

    it('rotate() rotates around arbitrary axis', () => {
      const axis = new Vector3(0, 1, 0).normalize();
      transform.rotate(axis, Math.PI / 2);

      const forward = transform.forward;
      expect(forward.x).toBeCloseTo(1, 5);
      expect(forward.z).toBeCloseTo(0);
    });

    it('scaleBy() with uniform factor', () => {
      transform.scaleBy(2);

      expect(transform.scale.x).toBe(2);
      expect(transform.scale.y).toBe(2);
      expect(transform.scale.z).toBe(2);
    });

    it('scaleBy() with vector factor', () => {
      transform.scaleBy(new Vector3(2, 3, 4));

      expect(transform.scale.x).toBe(2);
      expect(transform.scale.y).toBe(3);
      expect(transform.scale.z).toBe(4);
    });

    it('scaleBy() accumulates multiple scalings', () => {
      transform.scaleBy(2);
      transform.scaleBy(3);

      expect(transform.scale.x).toBe(6);
      expect(transform.scale.y).toBe(6);
      expect(transform.scale.z).toBe(6);
    });

    it('method chaining works correctly', () => {
      const result = transform
        .translate(new Vector3(10, 0, 0))
        .rotateY(Math.PI / 2)
        .scaleBy(2);

      expect(result).toBe(transform);
      expect(transform.position.x).toBe(10);
      expect(transform.scale.x).toBe(2);
    });
  });

  describe('local matrix computation', () => {
    it('getLocalMatrix() returns identity for default transform', () => {
      const transform = new TransformComponent();
      const matrix = transform.localMatrix;

      const identity = new Matrix4();
      for (let i = 0; i < 16; i++) {
        expect(matrix.elements[i]).toBeCloseTo(identity.elements[i]);
      }
    });

    it('getLocalMatrix() incorporates position', () => {
      const transform = new TransformComponent({
        position: new Vector3(10, 20, 30)
      });

      const matrix = transform.localMatrix;
      const extractedPos = matrix.getPosition();

      expect(extractedPos.x).toBeCloseTo(10);
      expect(extractedPos.y).toBeCloseTo(20);
      expect(extractedPos.z).toBeCloseTo(30);
    });

    it('getLocalMatrix() incorporates rotation', () => {
      const rotation = Quaternion.fromEuler(0, Math.PI / 2, 0);
      const transform = new TransformComponent({ rotation });

      const matrix = transform.localMatrix;
      const extractedRot = matrix.getRotation();

      expect(extractedRot.x).toBeCloseTo(rotation.x);
      expect(extractedRot.y).toBeCloseTo(rotation.y);
      expect(extractedRot.z).toBeCloseTo(rotation.z);
      expect(extractedRot.w).toBeCloseTo(rotation.w);
    });

    it('getLocalMatrix() incorporates scale', () => {
      const transform = new TransformComponent({
        scale: new Vector3(2, 3, 4)
      });

      const matrix = transform.localMatrix;
      const extractedScale = matrix.getScale();

      expect(extractedScale.x).toBeCloseTo(2);
      expect(extractedScale.y).toBeCloseTo(3);
      expect(extractedScale.z).toBeCloseTo(4);
    });

    it('getLocalMatrix() computes TRS matrix correctly', () => {
      const position = new Vector3(10, 20, 30);
      const rotation = Quaternion.fromEuler(0, Math.PI / 4, 0);
      const scale = new Vector3(2, 2, 2);

      const transform = new TransformComponent({ position, rotation, scale });
      const matrix = transform.localMatrix;

      const extractedPos = matrix.getPosition();
      const extractedRot = matrix.getRotation();
      const extractedScale = matrix.getScale();

      expect(extractedPos.x).toBeCloseTo(10);
      expect(extractedPos.y).toBeCloseTo(20);
      expect(extractedPos.z).toBeCloseTo(30);

      expect(extractedRot.x).toBeCloseTo(rotation.x);
      expect(extractedRot.y).toBeCloseTo(rotation.y);
      expect(extractedRot.z).toBeCloseTo(rotation.z);
      expect(extractedRot.w).toBeCloseTo(rotation.w);

      expect(extractedScale.x).toBeCloseTo(2);
      expect(extractedScale.y).toBeCloseTo(2);
      expect(extractedScale.z).toBeCloseTo(2);
    });

    it('local matrix updates lazily on access', () => {
      const transform = new TransformComponent();
      const matrix1 = transform.localMatrix;

      transform.position.set(5, 5, 5);
      transform.setDirty();

      const matrix2 = transform.localMatrix;
      const extractedPos = matrix2.getPosition();

      expect(extractedPos.x).toBeCloseTo(5);
      expect(extractedPos.y).toBeCloseTo(5);
      expect(extractedPos.z).toBeCloseTo(5);
    });
  });

  describe('world transform computation', () => {
    it('getWorldMatrix() equals local matrix with no parent', () => {
      const transform = new TransformComponent({
        position: new Vector3(10, 20, 30)
      });

      const worldMatrix = transform.worldMatrix;
      const localMatrix = transform.localMatrix;

      for (let i = 0; i < 16; i++) {
        expect(worldMatrix.elements[i]).toBeCloseTo(localMatrix.elements[i]);
      }
    });

    it('getWorldMatrix() combines with parent matrix', () => {
      const parentTransform = new TransformComponent({
        position: new Vector3(10, 0, 0)
      });

      const childTransform = new TransformComponent({
        position: new Vector3(5, 0, 0)
      });

      childTransform.updateWorldMatrix(parentTransform.worldMatrix);

      const worldPos = childTransform.worldPosition;
      expect(worldPos.x).toBeCloseTo(15);
      expect(worldPos.y).toBeCloseTo(0);
      expect(worldPos.z).toBeCloseTo(0);
    });

    it('getWorldPosition() extracts correct position', () => {
      const transform = new TransformComponent({
        position: new Vector3(1, 2, 3)
      });

      const worldPos = transform.worldPosition;
      expect(worldPos.x).toBeCloseTo(1);
      expect(worldPos.y).toBeCloseTo(2);
      expect(worldPos.z).toBeCloseTo(3);
    });

    it('getWorldRotation() extracts correct rotation', () => {
      const rotation = Quaternion.fromEuler(0, Math.PI / 2, 0);
      const transform = new TransformComponent({ rotation });

      const worldRot = transform.worldRotation;
      expect(worldRot.x).toBeCloseTo(rotation.x);
      expect(worldRot.y).toBeCloseTo(rotation.y);
      expect(worldRot.z).toBeCloseTo(rotation.z);
      expect(worldRot.w).toBeCloseTo(rotation.w);
    });

    it('getWorldScale() extracts correct scale', () => {
      const transform = new TransformComponent({
        scale: new Vector3(2, 3, 4)
      });

      const worldScale = transform.worldScale;
      expect(worldScale.x).toBeCloseTo(2);
      expect(worldScale.y).toBeCloseTo(3);
      expect(worldScale.z).toBeCloseTo(4);
    });

    it('dirty flag propagates correctly', () => {
      const transform = new TransformComponent();
      transform.setDirty();

      transform.position.set(5, 10, 15);
      transform.setDirty();

      const worldMatrix = transform.worldMatrix;
      const worldPos = worldMatrix.getPosition();

      expect(worldPos.x).toBeCloseTo(5);
      expect(worldPos.y).toBeCloseTo(10);
      expect(worldPos.z).toBeCloseTo(15);
    });
  });

  describe('direction vectors', () => {
    it('forward() returns -Z for identity rotation', () => {
      const transform = new TransformComponent();
      const forward = transform.forward;

      expect(forward.x).toBeCloseTo(0);
      expect(forward.y).toBeCloseTo(0);
      expect(forward.z).toBeCloseTo(1, 4);
      expect(forward.length()).toBeCloseTo(1);
    });

    it('right() returns +X for identity rotation', () => {
      const transform = new TransformComponent();
      const right = transform.right;

      expect(right.x).toBeCloseTo(1);
      expect(right.y).toBeCloseTo(0);
      expect(right.z).toBeCloseTo(0);
      expect(right.length()).toBeCloseTo(1);
    });

    it('up() returns +Y for identity rotation', () => {
      const transform = new TransformComponent();
      const up = transform.up;

      expect(up.x).toBeCloseTo(0);
      expect(up.y).toBeCloseTo(1);
      expect(up.z).toBeCloseTo(0);
      expect(up.length()).toBeCloseTo(1);
    });

    it('direction vectors update with rotation', () => {
      const transform = new TransformComponent();
      transform.rotateY(Math.PI / 2);

      const forward = transform.forward;
      expect(forward.x).toBeCloseTo(1, 4);
      expect(forward.z).toBeCloseTo(0, 4);
    });

    it('direction vectors are normalized', () => {
      const transform = new TransformComponent();
      transform.rotateX(Math.PI / 4);
      transform.rotateY(Math.PI / 6);

      expect(transform.forward.length()).toBeCloseTo(1);
      expect(transform.right.length()).toBeCloseTo(1);
      expect(transform.up.length()).toBeCloseTo(1);
    });
  });

  describe('lookAt functionality', () => {
    it('lookAt() orients toward target position', () => {
      const transform = new TransformComponent({
        position: new Vector3(0, 0, 0)
      });

      const target = new Vector3(10, 0, 0);
      transform.lookAt(target);

      const forward = transform.forward;
      const expectedDirection = target.sub(transform.position).normalize();

      expect(forward.x).toBeCloseTo(expectedDirection.x, 3);
      expect(forward.y).toBeCloseTo(expectedDirection.y, 3);
      expect(forward.z).toBeCloseTo(expectedDirection.z, 3);
    });

    it('lookAt() works with custom up vector', () => {
      const transform = new TransformComponent({
        position: new Vector3(0, 0, 0)
      });

      const target = new Vector3(10, 5, 0);
      const customUp = new Vector3(0, 1, 0);

      transform.lookAt(target, customUp);

      const forward = transform.forward;
      const expectedDirection = target.sub(transform.position).normalize();

      expect(forward.x).toBeCloseTo(expectedDirection.x, 2);
      expect(forward.y).toBeCloseTo(expectedDirection.y, 2);
      expect(forward.z).toBeCloseTo(expectedDirection.z, 2);
    });

    it('lookAt() handles target at same position gracefully', () => {
      const transform = new TransformComponent({
        position: new Vector3(5, 5, 5),
        rotation: Quaternion.fromEuler(0, Math.PI / 4, 0)
      });

      const initialRotation = transform.rotation.clone();
      transform.lookAt(new Vector3(5, 5, 5));

      expect(transform.rotation.x).toBeCloseTo(initialRotation.x);
      expect(transform.rotation.y).toBeCloseTo(initialRotation.y);
      expect(transform.rotation.z).toBeCloseTo(initialRotation.z);
      expect(transform.rotation.w).toBeCloseTo(initialRotation.w);
    });

    it('lookAt() supports method chaining', () => {
      const transform = new TransformComponent();
      const result = transform.lookAt(new Vector3(10, 0, 0));

      expect(result).toBe(transform);
    });
  });

  describe('serialization', () => {
    it('serialize() produces correct structure', () => {
      const transform = new TransformComponent({
        position: new Vector3(1, 2, 3),
        rotation: Quaternion.fromEuler(0, Math.PI / 2, 0),
        scale: new Vector3(2, 2, 2)
      });
      transform.parentEntity = 42;

      const data = transform.serialize();

      expect(data).toHaveProperty('position');
      expect(data).toHaveProperty('rotation');
      expect(data).toHaveProperty('scale');
      expect(data).toHaveProperty('parentEntity');
    });

    it('deserialize() restores transform state', () => {
      const originalTransform = new TransformComponent({
        position: new Vector3(10, 20, 30),
        rotation: Quaternion.fromEuler(Math.PI / 4, Math.PI / 2, 0),
        scale: new Vector3(3, 4, 5)
      });
      originalTransform.parentEntity = 99;

      const data = originalTransform.serialize();
      const newTransform = new TransformComponent();
      newTransform.deserialize(data);

      expect(newTransform.position.x).toBeCloseTo(10);
      expect(newTransform.position.y).toBeCloseTo(20);
      expect(newTransform.position.z).toBeCloseTo(30);

      expect(newTransform.rotation.x).toBeCloseTo(originalTransform.rotation.x);
      expect(newTransform.rotation.y).toBeCloseTo(originalTransform.rotation.y);
      expect(newTransform.rotation.z).toBeCloseTo(originalTransform.rotation.z);
      expect(newTransform.rotation.w).toBeCloseTo(originalTransform.rotation.w);

      expect(newTransform.scale.x).toBeCloseTo(3);
      expect(newTransform.scale.y).toBeCloseTo(4);
      expect(newTransform.scale.z).toBeCloseTo(5);

      expect(newTransform.parentEntity).toBe(99);
    });

    it('serialize/deserialize round-trip preserves data', () => {
      const transform1 = new TransformComponent({
        position: new Vector3(7, 8, 9),
        rotation: Quaternion.fromAxisAngle(new Vector3(1, 1, 0).normalize(), Math.PI / 3),
        scale: new Vector3(1.5, 2.5, 3.5)
      });

      const data = transform1.serialize();
      const transform2 = new TransformComponent();
      transform2.deserialize(data);

      const data2 = transform2.serialize();

      expect(JSON.stringify(data)).toBe(JSON.stringify(data2));
    });

    it('deserialize() marks transform as dirty', () => {
      const transform = new TransformComponent();
      const data = {
        position: { x: 5, y: 10, z: 15 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
        parentEntity: 0
      };

      transform.deserialize(data);

      const worldPos = transform.worldPosition;
      expect(worldPos.x).toBeCloseTo(5);
      expect(worldPos.y).toBeCloseTo(10);
      expect(worldPos.z).toBeCloseTo(15);
    });
  });

  describe('lifecycle methods', () => {
    it('reset() returns transform to identity', () => {
      const transform = new TransformComponent({
        position: new Vector3(10, 20, 30),
        rotation: Quaternion.fromEuler(1, 2, 3),
        scale: new Vector3(5, 6, 7)
      });
      transform.parentEntity = 42;

      transform.reset();

      expect(transform.position.x).toBe(0);
      expect(transform.position.y).toBe(0);
      expect(transform.position.z).toBe(0);

      expect(transform.rotation.x).toBe(0);
      expect(transform.rotation.y).toBe(0);
      expect(transform.rotation.z).toBe(0);
      expect(transform.rotation.w).toBe(1);

      expect(transform.scale.x).toBe(1);
      expect(transform.scale.y).toBe(1);
      expect(transform.scale.z).toBe(1);

      expect(transform.parentEntity).toBe(0);
    });

    it('onAttach() can be called without errors', () => {
      const transform = new TransformComponent();
      expect(() => transform.onAttach(123)).not.toThrow();
    });

    it('onDetach() can be called without errors', () => {
      const transform = new TransformComponent();
      expect(() => transform.onDetach(123)).not.toThrow();
    });
  });

  describe('component metadata', () => {
    it('has correct component name', () => {
      expect(TransformComponent._componentName).toBe('TransformComponent');
    });

    it('has valid schema', () => {
      const schema = TransformComponent.schema;

      expect(schema).toHaveProperty('position');
      expect(schema).toHaveProperty('rotation');
      expect(schema).toHaveProperty('scale');
      expect(schema).toHaveProperty('parentEntity');

      expect(schema.position).toBe('vec3');
      expect(schema.rotation).toBe('quat');
      expect(schema.scale).toBe('vec3');
      expect(schema.parentEntity).toBe('entity');
    });
  });

  describe('parent-child relationships', () => {
    it('parentEntity defaults to 0 (no parent)', () => {
      const transform = new TransformComponent();
      expect(transform.parentEntity).toBe(0);
    });

    it('can set parent entity', () => {
      const transform = new TransformComponent();
      transform.parentEntity = 42;
      expect(transform.parentEntity).toBe(42);
    });

    it('parent entity persists through serialization', () => {
      const transform = new TransformComponent();
      transform.parentEntity = 99;

      const data = transform.serialize();
      const newTransform = new TransformComponent();
      newTransform.deserialize(data);

      expect(newTransform.parentEntity).toBe(99);
    });
  });

  describe('edge cases and robustness', () => {
    it('handles zero scale gracefully', () => {
      const transform = new TransformComponent({
        scale: new Vector3(0, 0, 0)
      });

      expect(() => transform.localMatrix).not.toThrow();
    });

    it('handles very small scale values', () => {
      const transform = new TransformComponent({
        scale: new Vector3(0.0001, 0.0001, 0.0001)
      });

      const matrix = transform.localMatrix;
      const extractedScale = matrix.getScale();

      expect(extractedScale.x).toBeCloseTo(0.0001, 6);
    });

    it('handles very large position values', () => {
      const transform = new TransformComponent({
        position: new Vector3(1000000, 2000000, 3000000)
      });

      const worldPos = transform.worldPosition;
      expect(worldPos.x).toBeCloseTo(1000000);
      expect(worldPos.y).toBeCloseTo(2000000);
      expect(worldPos.z).toBeCloseTo(3000000);
    });

    it('handles multiple rapid updates efficiently', () => {
      const transform = new TransformComponent();

      for (let i = 0; i < 1000; i++) {
        transform.position.set(i, i, i);
        transform.setDirty();
      }

      const worldPos = transform.worldPosition;
      expect(worldPos.x).toBeCloseTo(999);
    });

    it('maintains quaternion normalization through operations', () => {
      const transform = new TransformComponent();

      for (let i = 0; i < 10; i++) {
        transform.rotateY(Math.PI / 10);
      }

      const length = Math.sqrt(
        transform.rotation.x * transform.rotation.x +
        transform.rotation.y * transform.rotation.y +
        transform.rotation.z * transform.rotation.z +
        transform.rotation.w * transform.rotation.w
      );

      expect(length).toBeCloseTo(1, 5);
    });
  });
});
