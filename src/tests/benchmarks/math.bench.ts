/**
 * Math Benchmarks
 *
 * Performance benchmarks for math operations:
 * - Vector3 operations (1M ops)
 * - Matrix4 multiplication (100K ops)
 * - Quaternion slerp (100K ops)
 * - Transform operations (100K ops)
 */

import { bench, describe } from 'vitest';
import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';
import { Quaternion } from '../../math/Quaternion';

describe('Vector3 Benchmarks', () => {
  const v1 = new Vector3(1, 2, 3);
  const v2 = new Vector3(4, 5, 6);
  const v3 = new Vector3(7, 8, 9);

  bench('Vector3 creation (1M ops)', () => {
    for (let i = 0; i < 1_000_000; i++) {
      new Vector3(i, i + 1, i + 2);
    }
  });

  bench('Vector3 addition (1M ops)', () => {
    for (let i = 0; i < 1_000_000; i++) {
      v1.add(v2);
    }
  });

  bench('Vector3 subtraction (1M ops)', () => {
    for (let i = 0; i < 1_000_000; i++) {
      v1.sub(v2);
    }
  });

  bench('Vector3 scaling (1M ops)', () => {
    for (let i = 0; i < 1_000_000; i++) {
      v1.scale(2.5);
    }
  });

  bench('Vector3 dot product (1M ops)', () => {
    for (let i = 0; i < 1_000_000; i++) {
      v1.dot(v2);
    }
  });

  bench('Vector3 cross product (1M ops)', () => {
    for (let i = 0; i < 1_000_000; i++) {
      v1.cross(v2);
    }
  });

  bench('Vector3 length (1M ops)', () => {
    for (let i = 0; i < 1_000_000; i++) {
      v1.length();
    }
  });

  bench('Vector3 lengthSquared (1M ops)', () => {
    for (let i = 0; i < 1_000_000; i++) {
      v1.lengthSquared();
    }
  });

  bench('Vector3 normalize (1M ops)', () => {
    for (let i = 0; i < 1_000_000; i++) {
      v1.normalize();
    }
  });

  bench('Vector3 distance (1M ops)', () => {
    for (let i = 0; i < 1_000_000; i++) {
      v1.distanceTo(v2);
    }
  });

  bench('Vector3 lerp (1M ops)', () => {
    for (let i = 0; i < 1_000_000; i++) {
      v1.lerp(v2, 0.5);
    }
  });

  bench('Vector3 multiply components (1M ops)', () => {
    for (let i = 0; i < 1_000_000; i++) {
      Vector3.multiply(v1, v2);
    }
  });

  bench('Vector3 equals (1M ops)', () => {
    for (let i = 0; i < 1_000_000; i++) {
      v1.equals(v2);
    }
  });

  bench('Vector3 clone (1M ops)', () => {
    for (let i = 0; i < 1_000_000; i++) {
      v1.clone();
    }
  });
});

describe('Matrix4 Benchmarks', () => {
  const m1 = Matrix4.translation(1, 2, 3);
  const m2 = Matrix4.rotationY(Math.PI / 4);
  const m3 = Matrix4.scale(2, 2, 2);
  const vec = new Vector3(1, 2, 3);

  bench('Matrix4 creation (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      new Matrix4();
    }
  });

  bench('Matrix4 multiplication (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      m1.multiply(m2);
    }
  });

  bench('Matrix4 triple multiplication (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      m1.multiply(m2).multiply(m3);
    }
  });

  bench('Matrix4 invert (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      m1.invert();
    }
  });

  bench('Matrix4 transpose (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      m1.transpose();
    }
  });

  bench('Matrix4 determinant (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      m1.determinant();
    }
  });

  bench('Matrix4 translation creation (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      Matrix4.translation(i, i + 1, i + 2);
    }
  });

  bench('Matrix4 rotation creation (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      Matrix4.rotationY(i * 0.01);
    }
  });

  bench('Matrix4 scale creation (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      Matrix4.scale(2, 2, 2);
    }
  });

  bench('Matrix4 lookAt (100K ops)', () => {
    const eye = new Vector3(0, 5, 10);
    const target = new Vector3(0, 0, 0);
    const up = new Vector3(0, 1, 0);
    for (let i = 0; i < 100_000; i++) {
      Matrix4.lookAt(eye, target, up);
    }
  });

  bench('Matrix4 perspective (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      Matrix4.perspective(Math.PI / 4, 16 / 9, 0.1, 100);
    }
  });

  bench('Matrix4 orthographic (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      Matrix4.orthographic(-10, 10, -10, 10, 0.1, 100);
    }
  });

  bench('Matrix4 transformVector (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      m1.transformVector(vec);
    }
  });

  bench('Matrix4 decompose (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      m1.getPosition();
      m1.getScale();
      m1.getRotation();
    }
  });
});

describe('Quaternion Benchmarks', () => {
  const q1 = Quaternion.fromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4);
  const q2 = Quaternion.fromAxisAngle(new Vector3(1, 0, 0), Math.PI / 3);
  const axis = new Vector3(0, 1, 0);

  bench('Quaternion creation (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      new Quaternion(0, 0, 0, 1);
    }
  });

  bench('Quaternion fromAxisAngle (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      Quaternion.fromAxisAngle(axis, i * 0.01);
    }
  });

  bench('Quaternion fromEuler (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      Quaternion.fromEuler(i * 0.01, i * 0.02, i * 0.03, 'XYZ');
    }
  });

  bench('Quaternion multiply (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      q1.multiply(q2);
    }
  });

  bench('Quaternion normalize (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      q1.normalize();
    }
  });

  bench('Quaternion conjugate (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      q1.conjugate();
    }
  });

  bench('Quaternion inverse (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      q1.invert();
    }
  });

  bench('Quaternion slerp (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      q1.slerp(q2, 0.5);
    }
  });

  bench('Quaternion toAxisAngle (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      q1.toAxisAngle();
    }
  });

  bench('Quaternion toEuler (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      q1.toEuler('XYZ');
    }
  });

  bench('Quaternion dot (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      q1.dot(q2);
    }
  });

  bench('Quaternion length (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      q1.length();
    }
  });
});

describe('Transform Benchmarks', () => {
  const position = new Vector3(10, 5, -3);
  const rotation = Quaternion.fromEuler(0.5, 0.3, 0.2, 'XYZ');
  const scale = new Vector3(2, 2, 2);

  bench('Complete transform composition (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      const t = Matrix4.translation(position.x, position.y, position.z);
      const r = Matrix4.fromQuaternion(rotation);
      const s = Matrix4.scale(scale.x, scale.y, scale.z);
      t.multiply(r).multiply(s);
    }
  });

  bench('Transform decomposition (100K ops)', () => {
    const transform = Matrix4.translation(1, 2, 3)
      .multiply(Matrix4.fromQuaternion(rotation))
      .multiply(Matrix4.scale(2, 2, 2));

    for (let i = 0; i < 100_000; i++) {
      transform.getPosition();
      transform.getRotation();
      transform.getScale();
    }
  });

  bench('TRS matrix chain (100K ops)', () => {
    for (let i = 0; i < 100_000; i++) {
      Matrix4.translation(i, i + 1, i + 2)
        .multiply(Matrix4.rotationY(i * 0.01))
        .multiply(Matrix4.scale(1 + i * 0.001, 1 + i * 0.001, 1 + i * 0.001));
    }
  });

  bench('Point transformation (100K ops)', () => {
    const transform = Matrix4.translation(1, 2, 3)
      .multiply(Matrix4.rotationY(Math.PI / 4));
    const point = new Vector3(1, 0, 0);

    for (let i = 0; i < 100_000; i++) {
      transform.transformVector(point);
    }
  });
});

describe('Frustum Culling Simulation', () => {
  bench('Frustum culling (10K entities)', () => {
    const view = Matrix4.lookAt(
      new Vector3(0, 5, 10),
      new Vector3(0, 0, 0),
      new Vector3(0, 1, 0)
    );
    const projection = Matrix4.perspective(Math.PI / 4, 16 / 9, 0.1, 100);
    const viewProjection = projection.multiply(view);

    // Simulate 10K entities
    const entities = [];
    for (let i = 0; i < 10_000; i++) {
      entities.push({
        position: new Vector3(
          Math.random() * 100 - 50,
          Math.random() * 100 - 50,
          Math.random() * 100 - 50
        ),
        radius: Math.random() * 5 + 1
      });
    }

    // Perform frustum culling
    let visible = 0;
    for (const entity of entities) {
      const transformed = viewProjection.transformVector(entity.position);
      const w = Math.abs(transformed.z);
      if (
        Math.abs(transformed.x) <= w + entity.radius &&
        Math.abs(transformed.y) <= w + entity.radius &&
        transformed.z >= -entity.radius
      ) {
        visible++;
      }
    }
  });
});

describe('Batch Vector Operations', () => {
  const vectorCount = 100_000;
  const vectors = Array.from({ length: vectorCount }, (_, i) =>
    new Vector3(i, i + 1, i + 2)
  );

  bench('Batch normalize (100K vectors)', () => {
    for (const vector of vectors) {
      vector.normalize();
    }
  });

  bench('Batch scale (100K vectors)', () => {
    for (const vector of vectors) {
      vector.scale(2.5);
    }
  });

  bench('Batch dot product (100K vectors)', () => {
    const target = new Vector3(1, 0, 0);
    for (const vector of vectors) {
      vector.dot(target);
    }
  });

  bench('Batch cross product (100K vectors)', () => {
    const target = new Vector3(0, 1, 0);
    for (const vector of vectors) {
      vector.cross(target);
    }
  });

  bench('Batch lerp (100K vectors)', () => {
    const target = new Vector3(10, 10, 10);
    for (const vector of vectors) {
      vector.lerp(target, 0.5);
    }
  });
});
