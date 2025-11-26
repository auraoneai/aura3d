/**
 * Math utilities for random distributions and noise generation.
 * Provides functions for generating random points in/on shapes, random directions,
 * and various noise functions for procedural generation.
 * @module RandomMath
 */

import { Random } from '../core/Random';
import { Vector2 } from './Vector2';
import { Vector3 } from './Vector3';
import { TWO_PI } from './MathConstants';

/**
 * Box3 interface for forward reference.
 */
interface Box3 {
  min: Vector3;
  max: Vector3;
}

/**
 * Collection of random distribution and noise utilities for procedural generation,
 * particle systems, and terrain generation.
 *
 * @example
 * ```typescript
 * const random = new Random(12345);
 *
 * // Generate random points
 * const pointInCircle = RandomMath.pointInCircle(random, 10);
 * const pointOnSphere = RandomMath.pointOnSphere(random, 5);
 *
 * // Generate noise
 * const perlinValue = RandomMath.perlin2D(x, y, seed);
 * const fbmValue = RandomMath.fbm2D(x, y, 4, 2.0, 0.5, seed);
 * ```
 */
const RandomMath = {
  /**
   * Generates a random point inside a circle with uniform distribution.
   *
   * @param random - Random number generator
   * @param radius - Circle radius (default: 1)
   * @returns Random point inside the circle
   *
   * @example
   * ```typescript
   * const random = new Random();
   * const point = RandomMath.pointInCircle(random, 10);
   * // point is uniformly distributed inside a circle of radius 10
   * ```
   */
  pointInCircle(random: Random, radius: number = 1): Vector2 {
    // Use sqrt for uniform distribution over area
    const r = Math.sqrt(random.next()) * radius;
    const theta = random.next() * TWO_PI;
    return new Vector2(r * Math.cos(theta), r * Math.sin(theta));
  },

  /**
   * Generates a random point on the circumference of a circle.
   *
   * @param random - Random number generator
   * @param radius - Circle radius (default: 1)
   * @returns Random point on the circle
   *
   * @example
   * ```typescript
   * const random = new Random();
   * const point = RandomMath.pointOnCircle(random, 5);
   * // point.length() === 5
   * ```
   */
  pointOnCircle(random: Random, radius: number = 1): Vector2 {
    const theta = random.next() * TWO_PI;
    return new Vector2(radius * Math.cos(theta), radius * Math.sin(theta));
  },

  /**
   * Generates a random point inside a sphere with uniform distribution.
   * Uses rejection sampling to ensure uniform distribution throughout the volume.
   *
   * @param random - Random number generator
   * @param radius - Sphere radius (default: 1)
   * @returns Random point inside the sphere
   *
   * @example
   * ```typescript
   * const random = new Random();
   * const point = RandomMath.pointInSphere(random, 10);
   * // point is uniformly distributed inside a sphere of radius 10
   * ```
   */
  pointInSphere(random: Random, radius: number = 1): Vector3 {
    // Use cube root for uniform distribution over volume
    const r = Math.pow(random.next(), 1 / 3) * radius;
    const theta = random.next() * TWO_PI;
    const phi = Math.acos(2 * random.next() - 1);

    const sinPhi = Math.sin(phi);
    return new Vector3(
      r * sinPhi * Math.cos(theta),
      r * sinPhi * Math.sin(theta),
      r * Math.cos(phi)
    );
  },

  /**
   * Generates a random point on the surface of a sphere with correct spherical distribution.
   * Uses proper spherical coordinate sampling to avoid clustering at poles.
   *
   * @param random - Random number generator
   * @param radius - Sphere radius (default: 1)
   * @returns Random point on the sphere surface
   *
   * @example
   * ```typescript
   * const random = new Random();
   * const point = RandomMath.pointOnSphere(random, 5);
   * // point.length() === 5
   * ```
   */
  pointOnSphere(random: Random, radius: number = 1): Vector3 {
    const theta = random.next() * TWO_PI;
    const phi = Math.acos(2 * random.next() - 1);

    const sinPhi = Math.sin(phi);
    return new Vector3(
      radius * sinPhi * Math.cos(theta),
      radius * sinPhi * Math.sin(theta),
      radius * Math.cos(phi)
    );
  },

  /**
   * Generates a random point inside an axis-aligned bounding box.
   *
   * @param random - Random number generator
   * @param box - Bounding box
   * @returns Random point inside the box
   *
   * @example
   * ```typescript
   * const random = new Random();
   * const box = new Box3(
   *   new Vector3(-10, -10, -10),
   *   new Vector3(10, 10, 10)
   * );
   * const point = RandomMath.pointInBox(random, box);
   * ```
   */
  pointInBox(random: Random, box: Box3): Vector3 {
    return new Vector3(
      random.nextRange(box.min.x, box.max.x),
      random.nextRange(box.min.y, box.max.y),
      random.nextRange(box.min.z, box.max.z)
    );
  },

  /**
   * Generates a random point on the surface of an axis-aligned bounding box.
   *
   * @param random - Random number generator
   * @param box - Bounding box
   * @returns Random point on the box surface
   *
   * @example
   * ```typescript
   * const random = new Random();
   * const box = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * const point = RandomMath.pointOnBox(random, box);
   * ```
   */
  pointOnBox(random: Random, box: Box3): Vector3 {
    const size = box.max.sub(box.min);
    const areas = [
      size.y * size.z * 2, // X faces
      size.x * size.z * 2, // Y faces
      size.x * size.y * 2, // Z faces
    ];
    const totalArea = areas[0] + areas[1] + areas[2];

    const r = random.next() * totalArea;
    let cumulative = 0;

    // Select face based on area
    if (r < (cumulative += areas[0])) {
      // X face
      const side = random.next() < 0.5 ? box.min.x : box.max.x;
      return new Vector3(
        side,
        random.nextRange(box.min.y, box.max.y),
        random.nextRange(box.min.z, box.max.z)
      );
    } else if (r < (cumulative += areas[1])) {
      // Y face
      const side = random.next() < 0.5 ? box.min.y : box.max.y;
      return new Vector3(
        random.nextRange(box.min.x, box.max.x),
        side,
        random.nextRange(box.min.z, box.max.z)
      );
    } else {
      // Z face
      const side = random.next() < 0.5 ? box.min.z : box.max.z;
      return new Vector3(
        random.nextRange(box.min.x, box.max.x),
        random.nextRange(box.min.y, box.max.y),
        side
      );
    }
  },

  /**
   * Generates a random point on the surface of a triangle.
   *
   * @param random - Random number generator
   * @param a - First vertex
   * @param b - Second vertex
   * @param c - Third vertex
   * @returns Random point on the triangle
   *
   * @example
   * ```typescript
   * const random = new Random();
   * const a = new Vector3(0, 0, 0);
   * const b = new Vector3(1, 0, 0);
   * const c = new Vector3(0, 1, 0);
   * const point = RandomMath.pointOnTriangle(random, a, b, c);
   * ```
   */
  pointOnTriangle(random: Random, a: Vector3, b: Vector3, c: Vector3): Vector3 {
    const r1 = random.next();
    const r2 = random.next();

    const sqrtR1 = Math.sqrt(r1);
    const u = 1 - sqrtR1;
    const v = sqrtR1 * (1 - r2);
    const w = sqrtR1 * r2;

    return new Vector3(
      u * a.x + v * b.x + w * c.x,
      u * a.y + v * b.y + w * c.y,
      u * a.z + v * b.z + w * c.z
    );
  },

  /**
   * Generates a random point inside a triangle (same as on triangle for 2D/3D).
   * Uses barycentric coordinates for uniform distribution.
   *
   * @param random - Random number generator
   * @param a - First vertex
   * @param b - Second vertex
   * @param c - Third vertex
   * @returns Random point in the triangle
   *
   * @example
   * ```typescript
   * const random = new Random();
   * const a = new Vector3(0, 0, 0);
   * const b = new Vector3(1, 0, 0);
   * const c = new Vector3(0, 1, 0);
   * const point = RandomMath.pointInTriangle(random, a, b, c);
   * ```
   */
  pointInTriangle(random: Random, a: Vector3, b: Vector3, c: Vector3): Vector3 {
    return RandomMath.pointOnTriangle(random, a, b, c);
  },

  /**
   * Generates a random unit vector in 2D.
   *
   * @param random - Random number generator
   * @returns Random unit vector
   *
   * @example
   * ```typescript
   * const random = new Random();
   * const dir = RandomMath.randomDirection2D(random);
   * // dir.length() === 1
   * ```
   */
  randomDirection2D(random: Random): Vector2 {
    const theta = random.next() * TWO_PI;
    return new Vector2(Math.cos(theta), Math.sin(theta));
  },

  /**
   * Generates a random unit vector in 3D.
   *
   * @param random - Random number generator
   * @returns Random unit vector
   *
   * @example
   * ```typescript
   * const random = new Random();
   * const dir = RandomMath.randomDirection3D(random);
   * // dir.length() === 1
   * ```
   */
  randomDirection3D(random: Random): Vector3 {
    return RandomMath.pointOnSphere(random, 1);
  },

  /**
   * Generates a random direction within a cone.
   * Uniform distribution within the solid angle of the cone.
   *
   * @param random - Random number generator
   * @param direction - Cone axis direction (should be normalized)
   * @param angle - Cone half-angle in radians
   * @returns Random direction within the cone
   *
   * @example
   * ```typescript
   * const random = new Random();
   * const direction = new Vector3(0, 1, 0); // Upward
   * const angle = Math.PI / 6; // 30 degree half-angle
   * const dir = RandomMath.randomInCone(random, direction, angle);
   * ```
   */
  randomInCone(random: Random, direction: Vector3, angle: number): Vector3 {
    const cosAngle = Math.cos(angle);
    const z = random.nextRange(cosAngle, 1);
    const phi = random.next() * TWO_PI;

    const sinTheta = Math.sqrt(1 - z * z);
    const x = sinTheta * Math.cos(phi);
    const y = sinTheta * Math.sin(phi);

    // Create local coordinate system
    const absZ = Math.abs(direction.z);
    const up = absZ < 0.999 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
    const tangent = up.cross(direction).normalize();
    const bitangent = direction.cross(tangent);

    return new Vector3(
      tangent.x * x + bitangent.x * y + direction.x * z,
      tangent.y * x + bitangent.y * y + direction.y * z,
      tangent.z * x + bitangent.z * y + direction.z * z
    );
  },

  /**
   * Generates a random direction in the hemisphere oriented by a normal vector.
   * Uses cosine-weighted distribution for physically-based rendering.
   *
   * @param random - Random number generator
   * @param normal - Hemisphere normal direction (should be normalized)
   * @returns Random direction in the hemisphere
   *
   * @example
   * ```typescript
   * const random = new Random();
   * const normal = new Vector3(0, 1, 0); // Upward
   * const dir = RandomMath.randomInHemisphere(random, normal);
   * // dir.dot(normal) >= 0
   * ```
   */
  randomInHemisphere(random: Random, normal: Vector3): Vector3 {
    const dir = RandomMath.randomDirection3D(random);
    return dir.dot(normal) >= 0 ? dir : dir.negate();
  },

  /**
   * Classic Perlin noise in 2D.
   * Returns values in the range [-1, 1].
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param seed - Optional seed for reproducible noise
   * @returns Noise value in range [-1, 1]
   *
   * @example
   * ```typescript
   * const value = RandomMath.perlin2D(x, y, 12345);
   * ```
   */
  perlin2D(x: number, y: number, seed?: number): number {
    const random = seed !== undefined ? new Random(seed) : Random.global;

    // Integer coordinates
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;

    // Fractional coordinates
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    // Fade curves
    const u = fade(xf);
    const v = fade(yf);

    // Hash coordinates
    const aa = hash2D(xi, yi, seed || 0);
    const ab = hash2D(xi, yi + 1, seed || 0);
    const ba = hash2D(xi + 1, yi, seed || 0);
    const bb = hash2D(xi + 1, yi + 1, seed || 0);

    // Gradient contributions
    const x1 = lerp(grad2D(aa, xf, yf), grad2D(ba, xf - 1, yf), u);
    const x2 = lerp(grad2D(ab, xf, yf - 1), grad2D(bb, xf - 1, yf - 1), u);

    return lerp(x1, x2, v);
  },

  /**
   * Classic Perlin noise in 3D.
   * Returns values in the range [-1, 1].
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   * @param seed - Optional seed for reproducible noise
   * @returns Noise value in range [-1, 1]
   *
   * @example
   * ```typescript
   * const value = RandomMath.perlin3D(x, y, z, 12345);
   * ```
   */
  perlin3D(x: number, y: number, z: number, seed?: number): number {
    // Integer coordinates
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const zi = Math.floor(z) & 255;

    // Fractional coordinates
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);

    // Fade curves
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);

    const s = seed || 0;

    // Hash coordinates
    const aaa = hash3D(xi, yi, zi, s);
    const aba = hash3D(xi, yi + 1, zi, s);
    const aab = hash3D(xi, yi, zi + 1, s);
    const abb = hash3D(xi, yi + 1, zi + 1, s);
    const baa = hash3D(xi + 1, yi, zi, s);
    const bba = hash3D(xi + 1, yi + 1, zi, s);
    const bab = hash3D(xi + 1, yi, zi + 1, s);
    const bbb = hash3D(xi + 1, yi + 1, zi + 1, s);

    // Interpolate
    const x1 = lerp(grad3D(aaa, xf, yf, zf), grad3D(baa, xf - 1, yf, zf), u);
    const x2 = lerp(grad3D(aba, xf, yf - 1, zf), grad3D(bba, xf - 1, yf - 1, zf), u);
    const x3 = lerp(grad3D(aab, xf, yf, zf - 1), grad3D(bab, xf - 1, yf, zf - 1), u);
    const x4 = lerp(grad3D(abb, xf, yf - 1, zf - 1), grad3D(bbb, xf - 1, yf - 1, zf - 1), u);

    const y1 = lerp(x1, x2, v);
    const y2 = lerp(x3, x4, v);

    return lerp(y1, y2, w);
  },

  /**
   * Simplex noise in 2D with better isotropy than Perlin noise.
   * Returns values in the range [-1, 1].
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param seed - Optional seed for reproducible noise
   * @returns Noise value in range [-1, 1]
   *
   * @example
   * ```typescript
   * const value = RandomMath.simplex2D(x, y, 12345);
   * ```
   */
  simplex2D(x: number, y: number, seed?: number): number {
    const s = seed || 0;
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;

    // Skew input space
    const skew = (x + y) * F2;
    const i = Math.floor(x + skew);
    const j = Math.floor(y + skew);

    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    // Determine which simplex
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    const gi0 = hash2D(ii, jj, s) % 12;
    const gi1 = hash2D(ii + i1, jj + j1, s) % 12;
    const gi2 = hash2D(ii + 1, jj + 1, s) % 12;

    const grad2 = [
      [1, 1], [-1, 1], [1, -1], [-1, -1],
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1]
    ];

    let n0 = 0, n1 = 0, n2 = 0;

    const t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const t0_2 = t0 * t0;
      n0 = t0_2 * t0_2 * (grad2[gi0][0] * x0 + grad2[gi0][1] * y0);
    }

    const t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const t1_2 = t1 * t1;
      n1 = t1_2 * t1_2 * (grad2[gi1][0] * x1 + grad2[gi1][1] * y1);
    }

    const t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const t2_2 = t2 * t2;
      n2 = t2_2 * t2_2 * (grad2[gi2][0] * x2 + grad2[gi2][1] * y2);
    }

    return 70 * (n0 + n1 + n2);
  },

  /**
   * Simplex noise in 3D with better isotropy than Perlin noise.
   * Returns values in the range [-1, 1].
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   * @param seed - Optional seed for reproducible noise
   * @returns Noise value in range [-1, 1]
   *
   * @example
   * ```typescript
   * const value = RandomMath.simplex3D(x, y, z, 12345);
   * ```
   */
  simplex3D(x: number, y: number, z: number, seed?: number): number {
    const s = seed || 0;
    const F3 = 1 / 3;
    const G3 = 1 / 6;

    const skew = (x + y + z) * F3;
    const i = Math.floor(x + skew);
    const j = Math.floor(y + skew);
    const k = Math.floor(z + skew);

    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    const z0 = z - Z0;

    let i1, j1, k1;
    let i2, j2, k2;

    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    const gi0 = hash3D(ii, jj, kk, s) % 12;
    const gi1 = hash3D(ii + i1, jj + j1, kk + k1, s) % 12;
    const gi2 = hash3D(ii + i2, jj + j2, kk + k2, s) % 12;
    const gi3 = hash3D(ii + 1, jj + 1, kk + 1, s) % 12;

    const grad3 = [
      [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
      [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
      [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
    ];

    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;

    const t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) {
      const t0_2 = t0 * t0;
      n0 = t0_2 * t0_2 * (grad3[gi0][0] * x0 + grad3[gi0][1] * y0 + grad3[gi0][2] * z0);
    }

    const t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) {
      const t1_2 = t1 * t1;
      n1 = t1_2 * t1_2 * (grad3[gi1][0] * x1 + grad3[gi1][1] * y1 + grad3[gi1][2] * z1);
    }

    const t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) {
      const t2_2 = t2 * t2;
      n2 = t2_2 * t2_2 * (grad3[gi2][0] * x2 + grad3[gi2][1] * y2 + grad3[gi2][2] * z2);
    }

    const t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) {
      const t3_2 = t3 * t3;
      n3 = t3_2 * t3_2 * (grad3[gi3][0] * x3 + grad3[gi3][1] * y3 + grad3[gi3][2] * z3);
    }

    return 32 * (n0 + n1 + n2 + n3);
  },

  /**
   * Worley (cellular) noise in 2D.
   * Returns distance to nearest cell center in range [0, 1] approximately.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param seed - Optional seed for reproducible noise
   * @returns Distance to nearest cell center
   *
   * @example
   * ```typescript
   * const value = RandomMath.worley2D(x, y, 12345);
   * ```
   */
  worley2D(x: number, y: number, seed?: number): number {
    const s = seed || 0;
    const xi = Math.floor(x);
    const yi = Math.floor(y);

    let minDist = Infinity;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cellX = xi + dx;
        const cellY = yi + dy;

        const hash = hash2D(cellX & 255, cellY & 255, s);
        const pointX = cellX + ((hash & 0xFF) / 255);
        const pointY = cellY + (((hash >> 8) & 0xFF) / 255);

        const distX = x - pointX;
        const distY = y - pointY;
        const dist = Math.sqrt(distX * distX + distY * distY);

        minDist = Math.min(minDist, dist);
      }
    }

    return Math.min(minDist, 1);
  },

  /**
   * Worley (cellular) noise in 3D.
   * Returns distance to nearest cell center in range [0, 1] approximately.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   * @param seed - Optional seed for reproducible noise
   * @returns Distance to nearest cell center
   *
   * @example
   * ```typescript
   * const value = RandomMath.worley3D(x, y, z, 12345);
   * ```
   */
  worley3D(x: number, y: number, z: number, seed?: number): number {
    const s = seed || 0;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);

    let minDist = Infinity;

    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cellX = xi + dx;
          const cellY = yi + dy;
          const cellZ = zi + dz;

          const hash = hash3D(cellX & 255, cellY & 255, cellZ & 255, s);
          const pointX = cellX + ((hash & 0xFF) / 255);
          const pointY = cellY + (((hash >> 8) & 0xFF) / 255);
          const pointZ = cellZ + (((hash >> 16) & 0xFF) / 255);

          const distX = x - pointX;
          const distY = y - pointY;
          const distZ = z - pointZ;
          const dist = Math.sqrt(distX * distX + distY * distY + distZ * distZ);

          minDist = Math.min(minDist, dist);
        }
      }
    }

    return Math.min(minDist, 1);
  },

  /**
   * Fractal Brownian Motion (fBm) noise in 2D.
   * Combines multiple octaves of noise for more natural-looking patterns.
   * Returns values in range [-1, 1].
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param octaves - Number of noise layers to combine
   * @param lacunarity - Frequency multiplier for each octave (default: 2.0)
   * @param gain - Amplitude multiplier for each octave (default: 0.5)
   * @param seed - Optional seed for reproducible noise
   * @returns Fractal noise value in range [-1, 1]
   *
   * @example
   * ```typescript
   * const value = RandomMath.fbm2D(x, y, 4, 2.0, 0.5, 12345);
   * ```
   */
  fbm2D(
    x: number,
    y: number,
    octaves: number,
    lacunarity: number = 2.0,
    gain: number = 0.5,
    seed?: number
  ): number {
    let result = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      result += RandomMath.perlin2D(x * frequency, y * frequency, seed) * amplitude;
      maxValue += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return result / maxValue;
  },

  /**
   * Fractal Brownian Motion (fBm) noise in 3D.
   * Combines multiple octaves of noise for more natural-looking patterns.
   * Returns values in range [-1, 1].
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   * @param octaves - Number of noise layers to combine
   * @param lacunarity - Frequency multiplier for each octave (default: 2.0)
   * @param gain - Amplitude multiplier for each octave (default: 0.5)
   * @param seed - Optional seed for reproducible noise
   * @returns Fractal noise value in range [-1, 1]
   *
   * @example
   * ```typescript
   * const value = RandomMath.fbm3D(x, y, z, 4, 2.0, 0.5, 12345);
   * ```
   */
  fbm3D(
    x: number,
    y: number,
    z: number,
    octaves: number,
    lacunarity: number = 2.0,
    gain: number = 0.5,
    seed?: number
  ): number {
    let result = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      result += RandomMath.perlin3D(x * frequency, y * frequency, z * frequency, seed) * amplitude;
      maxValue += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return result / maxValue;
  },

  /**
   * Value noise in 2D.
   * Simple interpolated random values, less smooth than Perlin noise.
   * Returns values in range [-1, 1].
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param seed - Optional seed for reproducible noise
   * @returns Noise value in range [-1, 1]
   *
   * @example
   * ```typescript
   * const value = RandomMath.valueNoise2D(x, y, 12345);
   * ```
   */
  valueNoise2D(x: number, y: number, seed?: number): number {
    const s = seed || 0;
    const xi = Math.floor(x);
    const yi = Math.floor(y);

    const xf = x - xi;
    const yf = y - yi;

    const u = fade(xf);
    const v = fade(yf);

    const aa = noise2DValue(xi, yi, s);
    const ab = noise2DValue(xi, yi + 1, s);
    const ba = noise2DValue(xi + 1, yi, s);
    const bb = noise2DValue(xi + 1, yi + 1, s);

    const x1 = lerp(aa, ba, u);
    const x2 = lerp(ab, bb, u);

    return lerp(x1, x2, v) * 2 - 1;
  },

  /**
   * Value noise in 3D.
   * Simple interpolated random values, less smooth than Perlin noise.
   * Returns values in range [-1, 1].
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   * @param seed - Optional seed for reproducible noise
   * @returns Noise value in range [-1, 1]
   *
   * @example
   * ```typescript
   * const value = RandomMath.valueNoise3D(x, y, z, 12345);
   * ```
   */
  valueNoise3D(x: number, y: number, z: number, seed?: number): number {
    const s = seed || 0;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);

    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;

    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);

    const aaa = noise3DValue(xi, yi, zi, s);
    const aba = noise3DValue(xi, yi + 1, zi, s);
    const aab = noise3DValue(xi, yi, zi + 1, s);
    const abb = noise3DValue(xi, yi + 1, zi + 1, s);
    const baa = noise3DValue(xi + 1, yi, zi, s);
    const bba = noise3DValue(xi + 1, yi + 1, zi, s);
    const bab = noise3DValue(xi + 1, yi, zi + 1, s);
    const bbb = noise3DValue(xi + 1, yi + 1, zi + 1, s);

    const x1 = lerp(aaa, baa, u);
    const x2 = lerp(aba, bba, u);
    const x3 = lerp(aab, bab, u);
    const x4 = lerp(abb, bbb, u);

    const y1 = lerp(x1, x2, v);
    const y2 = lerp(x3, x4, v);

    return lerp(y1, y2, w) * 2 - 1;
  },
};

/**
 * Helper functions for noise generation
 */

/**
 * Fade function for smooth interpolation (6t^5 - 15t^4 + 10t^3).
 */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Linear interpolation.
 */
function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/**
 * 2D hash function for noise generation.
 */
function hash2D(x: number, y: number, seed: number): number {
  const n = x * 374761393 + y * 668265263 + seed * 1013904223;
  return (n ^ (n >>> 13)) & 0xFFFFFFFF;
}

/**
 * 3D hash function for noise generation.
 */
function hash3D(x: number, y: number, z: number, seed: number): number {
  const n = x * 374761393 + y * 668265263 + z * 1013904223 + seed * 1664525;
  return (n ^ (n >>> 13)) & 0xFFFFFFFF;
}

/**
 * 2D gradient calculation for Perlin noise.
 */
function grad2D(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/**
 * 3D gradient calculation for Perlin noise.
 */
function grad3D(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/**
 * Generate a random value for value noise in 2D.
 */
function noise2DValue(x: number, y: number, seed: number): number {
  const hash = hash2D(x & 255, y & 255, seed);
  return (hash & 0xFFFF) / 0xFFFF;
}

/**
 * Generate a random value for value noise in 3D.
 */
function noise3DValue(x: number, y: number, z: number, seed: number): number {
  const hash = hash3D(x & 255, y & 255, z & 255, seed);
  return (hash & 0xFFFF) / 0xFFFF;
}

export { RandomMath };
