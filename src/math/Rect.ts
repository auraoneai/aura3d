/**
 * 2D axis-aligned rectangle for UI and 2D bounds.
 * Provides comprehensive rectangle operations with both immutable and in-place variants.
 * @module Rect
 */

import { Vector2 } from './Vector2';
import { EPSILON, nearlyEqual } from './MathConstants';

/**
 * Represents a 2D axis-aligned rectangle.
 * Used for UI layout, 2D rendering, texture atlases, and collision detection.
 * Convention: y increases downward (screen space).
 *
 * @example
 * ```typescript
 * // Create rectangles
 * const rect1 = new Rect(10, 20, 100, 50);
 * const rect2 = Rect.fromMinMax(new Vector2(0, 0), new Vector2(100, 100));
 *
 * // Check containment
 * const point = new Vector2(50, 30);
 * rect1.contains(point);  // true
 *
 * // Operations
 * const expanded = rect1.expand(10);  // Expand by 10 units on all sides
 * const combined = rect1.union(rect2);  // Bounding rect of both
 * const overlap = rect1.intersection(rect2);  // Overlapping region or null
 * ```
 */
export class Rect {
  /**
   * The x coordinate of the rectangle's left edge.
   */
  public x: number;

  /**
   * The y coordinate of the rectangle's top edge.
   */
  public y: number;

  /**
   * The width of the rectangle.
   */
  public width: number;

  /**
   * The height of the rectangle.
   */
  public height: number;

  /**
   * Creates a new Rect instance.
   *
   * @param x - The x coordinate (default: 0)
   * @param y - The y coordinate (default: 0)
   * @param width - The width (default: 0)
   * @param height - The height (default: 0)
   *
   * @example
   * ```typescript
   * const rect1 = new Rect();                    // (0, 0, 0, 0)
   * const rect2 = new Rect(10, 20);              // (10, 20, 0, 0)
   * const rect3 = new Rect(10, 20, 100, 50);     // (10, 20, 100, 50)
   * ```
   */
  constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  /**
   * Gets the x coordinate of the left edge.
   *
   * @returns The left edge x coordinate
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 20, 100, 50);
   * rect.left;  // 10
   * ```
   */
  get left(): number {
    return this.x;
  }

  /**
   * Gets the x coordinate of the right edge.
   *
   * @returns The right edge x coordinate
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 20, 100, 50);
   * rect.right;  // 110
   * ```
   */
  get right(): number {
    return this.x + this.width;
  }

  /**
   * Gets the y coordinate of the top edge.
   * In screen space, this is the smaller y value.
   *
   * @returns The top edge y coordinate
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 20, 100, 50);
   * rect.top;  // 20
   * ```
   */
  get top(): number {
    return this.y;
  }

  /**
   * Gets the y coordinate of the bottom edge.
   * In screen space, this is the larger y value.
   *
   * @returns The bottom edge y coordinate
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 20, 100, 50);
   * rect.bottom;  // 70
   * ```
   */
  get bottom(): number {
    return this.y + this.height;
  }

  /**
   * Gets the center point of the rectangle.
   *
   * @returns A new Vector2 representing the center point
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 20, 100, 50);
   * rect.center;  // Vector2(60, 45)
   * ```
   */
  get center(): Vector2 {
    return new Vector2(this.x + this.width * 0.5, this.y + this.height * 0.5);
  }

  /**
   * Gets the size of the rectangle as a vector.
   *
   * @returns A new Vector2 representing the size (width, height)
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 20, 100, 50);
   * rect.size;  // Vector2(100, 50)
   * ```
   */
  get size(): Vector2 {
    return new Vector2(this.width, this.height);
  }

  /**
   * Gets the minimum corner (top-left) of the rectangle.
   *
   * @returns A new Vector2 representing the min corner
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 20, 100, 50);
   * rect.min;  // Vector2(10, 20)
   * ```
   */
  get min(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  /**
   * Gets the maximum corner (bottom-right) of the rectangle.
   *
   * @returns A new Vector2 representing the max corner
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 20, 100, 50);
   * rect.max;  // Vector2(110, 70)
   * ```
   */
  get max(): Vector2 {
    return new Vector2(this.x + this.width, this.y + this.height);
  }

  /**
   * Checks if a point is contained within this rectangle (inclusive).
   *
   * @param point - The point to test
   * @returns True if the point is inside or on the boundary, false otherwise
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 20, 100, 50);
   * rect.contains(new Vector2(50, 30));   // true
   * rect.contains(new Vector2(10, 20));   // true (on boundary)
   * rect.contains(new Vector2(5, 30));    // false
   * rect.contains(new Vector2(150, 30));  // false
   * ```
   */
  contains(point: Vector2): boolean {
    return (
      point.x >= this.x &&
      point.x <= this.x + this.width &&
      point.y >= this.y &&
      point.y <= this.y + this.height
    );
  }

  /**
   * Checks if another rectangle is completely contained within this rectangle.
   *
   * @param rect - The rectangle to test
   * @returns True if the other rectangle is completely inside, false otherwise
   *
   * @example
   * ```typescript
   * const outer = new Rect(0, 0, 100, 100);
   * const inner = new Rect(10, 10, 20, 20);
   * const partial = new Rect(50, 50, 100, 100);
   *
   * outer.containsRect(inner);    // true
   * outer.containsRect(partial);  // false
   * inner.containsRect(outer);    // false
   * ```
   */
  containsRect(rect: Rect): boolean {
    return (
      rect.x >= this.x &&
      rect.y >= this.y &&
      rect.x + rect.width <= this.x + this.width &&
      rect.y + rect.height <= this.y + this.height
    );
  }

  /**
   * Checks if this rectangle intersects with another rectangle.
   *
   * @param rect - The rectangle to test
   * @returns True if the rectangles overlap, false otherwise
   *
   * @example
   * ```typescript
   * const rect1 = new Rect(0, 0, 100, 100);
   * const rect2 = new Rect(50, 50, 100, 100);
   * const rect3 = new Rect(200, 200, 100, 100);
   *
   * rect1.intersects(rect2);  // true
   * rect1.intersects(rect3);  // false
   * ```
   */
  intersects(rect: Rect): boolean {
    return !(
      this.x + this.width < rect.x ||
      rect.x + rect.width < this.x ||
      this.y + this.height < rect.y ||
      rect.y + rect.height < this.y
    );
  }

  /**
   * Computes the intersection of this rectangle with another rectangle.
   *
   * @param rect - The rectangle to intersect with
   * @returns A new Rect representing the overlapping region, or null if they don't overlap
   *
   * @example
   * ```typescript
   * const rect1 = new Rect(0, 0, 100, 100);
   * const rect2 = new Rect(50, 50, 100, 100);
   * const overlap = rect1.intersection(rect2);  // Rect(50, 50, 50, 50)
   *
   * const rect3 = new Rect(200, 200, 100, 100);
   * rect1.intersection(rect3);  // null
   * ```
   */
  intersection(rect: Rect): Rect | null {
    const x1 = Math.max(this.x, rect.x);
    const y1 = Math.max(this.y, rect.y);
    const x2 = Math.min(this.x + this.width, rect.x + rect.width);
    const y2 = Math.min(this.y + this.height, rect.y + rect.height);

    const width = x2 - x1;
    const height = y2 - y1;

    if (width < 0 || height < 0) {
      return null;
    }

    return new Rect(x1, y1, width, height);
  }

  /**
   * Computes the union (bounding rectangle) of this rectangle with another rectangle.
   *
   * @param rect - The rectangle to union with
   * @returns A new Rect that contains both rectangles
   *
   * @example
   * ```typescript
   * const rect1 = new Rect(0, 0, 50, 50);
   * const rect2 = new Rect(100, 100, 50, 50);
   * const combined = rect1.union(rect2);  // Rect(0, 0, 150, 150)
   * ```
   */
  union(rect: Rect): Rect {
    const x1 = Math.min(this.x, rect.x);
    const y1 = Math.min(this.y, rect.y);
    const x2 = Math.max(this.x + this.width, rect.x + rect.width);
    const y2 = Math.max(this.y + this.height, rect.y + rect.height);

    return new Rect(x1, y1, x2 - x1, y2 - y1);
  }

  /**
   * Expands the rectangle by the specified amount on all sides.
   *
   * @param amount - The amount to expand (can be negative to shrink)
   * @returns A new expanded Rect
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 10, 50, 50);
   * const expanded = rect.expand(5);   // Rect(5, 5, 60, 60)
   * const shrunk = rect.expand(-5);    // Rect(15, 15, 40, 40)
   * ```
   */
  expand(amount: number): Rect {
    return new Rect(
      this.x - amount,
      this.y - amount,
      this.width + amount * 2,
      this.height + amount * 2
    );
  }

  /**
   * Expands the rectangle to include the specified point.
   *
   * @param point - The point to include
   * @returns A new Rect that contains the original rectangle and the point
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 10, 50, 50);
   * const expanded = rect.expandByPoint(new Vector2(100, 100));
   * // Rect(10, 10, 90, 90) - expanded to include (100, 100)
   *
   * const alreadyContained = rect.expandByPoint(new Vector2(20, 20));
   * // Rect(10, 10, 50, 50) - unchanged as point is already inside
   * ```
   */
  expandByPoint(point: Vector2): Rect {
    const x1 = Math.min(this.x, point.x);
    const y1 = Math.min(this.y, point.y);
    const x2 = Math.max(this.x + this.width, point.x);
    const y2 = Math.max(this.y + this.height, point.y);

    return new Rect(x1, y1, x2 - x1, y2 - y1);
  }

  /**
   * Expands the rectangle by the specified amount on all sides in-place.
   *
   * @param amount - The amount to expand (can be negative to shrink)
   * @returns This rectangle for chaining
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 10, 50, 50);
   * rect.expandInPlace(5);   // rect is now (5, 5, 60, 60)
   * rect.expandInPlace(-5);  // rect is now (10, 10, 50, 50)
   * ```
   */
  expandInPlace(amount: number): this {
    this.x -= amount;
    this.y -= amount;
    this.width += amount * 2;
    this.height += amount * 2;
    return this;
  }

  /**
   * Expands the rectangle to include the specified point in-place.
   *
   * @param point - The point to include
   * @returns This rectangle for chaining
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 10, 50, 50);
   * rect.expandByPointInPlace(new Vector2(100, 100));
   * // rect is now (10, 10, 90, 90)
   * ```
   */
  expandByPointInPlace(point: Vector2): this {
    const x1 = Math.min(this.x, point.x);
    const y1 = Math.min(this.y, point.y);
    const x2 = Math.max(this.x + this.width, point.x);
    const y2 = Math.max(this.y + this.height, point.y);

    this.x = x1;
    this.y = y1;
    this.width = x2 - x1;
    this.height = y2 - y1;

    return this;
  }

  /**
   * Computes the union (bounding rectangle) of this rectangle with another rectangle in-place.
   *
   * @param rect - The rectangle to union with
   * @returns This rectangle for chaining
   *
   * @example
   * ```typescript
   * const rect1 = new Rect(0, 0, 50, 50);
   * const rect2 = new Rect(100, 100, 50, 50);
   * rect1.unionInPlace(rect2);  // rect1 is now (0, 0, 150, 150)
   * ```
   */
  unionInPlace(rect: Rect): this {
    const x1 = Math.min(this.x, rect.x);
    const y1 = Math.min(this.y, rect.y);
    const x2 = Math.max(this.x + this.width, rect.x + rect.width);
    const y2 = Math.max(this.y + this.height, rect.y + rect.height);

    this.x = x1;
    this.y = y1;
    this.width = x2 - x1;
    this.height = y2 - y1;

    return this;
  }

  /**
   * Sets the x, y, width, and height of this rectangle.
   *
   * @param x - The new x coordinate
   * @param y - The new y coordinate
   * @param width - The new width
   * @param height - The new height
   * @returns This rectangle for chaining
   *
   * @example
   * ```typescript
   * const rect = new Rect();
   * rect.set(10, 20, 100, 50);  // rect is now (10, 20, 100, 50)
   * ```
   */
  set(x: number, y: number, width: number, height: number): this {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    return this;
  }

  /**
   * Creates a new rectangle with the same properties as this one.
   *
   * @returns A new cloned Rect
   *
   * @example
   * ```typescript
   * const rect1 = new Rect(10, 20, 100, 50);
   * const rect2 = rect1.clone();  // rect2 is (10, 20, 100, 50)
   * rect2.x = 20;  // rect1 remains unchanged
   * ```
   */
  clone(): Rect {
    return new Rect(this.x, this.y, this.width, this.height);
  }

  /**
   * Copies the properties from another rectangle to this rectangle.
   *
   * @param r - The rectangle to copy from
   * @returns This rectangle for chaining
   *
   * @example
   * ```typescript
   * const rect1 = new Rect(0, 0, 50, 50);
   * const rect2 = new Rect(10, 20, 100, 50);
   * rect1.copy(rect2);  // rect1 is now (10, 20, 100, 50)
   * ```
   */
  copy(r: Rect): this {
    this.x = r.x;
    this.y = r.y;
    this.width = r.width;
    this.height = r.height;
    return this;
  }

  /**
   * Checks if this rectangle is equal to another rectangle within an epsilon tolerance.
   *
   * @param r - The rectangle to compare with
   * @param epsilon - The epsilon tolerance (default: EPSILON)
   * @returns True if the rectangles are nearly equal, false otherwise
   *
   * @example
   * ```typescript
   * const rect1 = new Rect(10, 20, 100, 50);
   * const rect2 = new Rect(10.0000001, 20.0000001, 100.0000001, 50.0000001);
   * rect1.equals(rect2);  // true (within default epsilon)
   *
   * const rect3 = new Rect(10, 20, 100, 60);
   * rect1.equals(rect3);  // false
   *
   * const rect4 = new Rect(10, 20, 100.1, 50);
   * rect1.equals(rect4, 0.2);  // true (within custom epsilon)
   * ```
   */
  equals(r: Rect, epsilon: number = EPSILON): boolean {
    return (
      nearlyEqual(this.x, r.x, epsilon) &&
      nearlyEqual(this.y, r.y, epsilon) &&
      nearlyEqual(this.width, r.width, epsilon) &&
      nearlyEqual(this.height, r.height, epsilon)
    );
  }

  /**
   * Checks if the rectangle is empty (has zero or negative width or height).
   *
   * @returns True if width or height <= 0, false otherwise
   *
   * @example
   * ```typescript
   * const rect1 = new Rect(10, 20, 0, 50);
   * rect1.isEmpty();  // true
   *
   * const rect2 = new Rect(10, 20, 100, -10);
   * rect2.isEmpty();  // true
   *
   * const rect3 = new Rect(10, 20, 100, 50);
   * rect3.isEmpty();  // false
   * ```
   */
  isEmpty(): boolean {
    return this.width <= 0 || this.height <= 0;
  }

  /**
   * Converts this rectangle to a tuple array.
   *
   * @returns A tuple [x, y, width, height]
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 20, 100, 50);
   * const arr = rect.toArray();  // [10, 20, 100, 50]
   * ```
   */
  toArray(): [number, number, number, number] {
    return [this.x, this.y, this.width, this.height];
  }

  /**
   * Sets the properties of this rectangle from an array-like object.
   *
   * @param arr - The array-like object to read from
   * @param offset - The offset in the array to start reading from (default: 0)
   * @returns This rectangle for chaining
   *
   * @example
   * ```typescript
   * const rect = new Rect();
   * rect.fromArray([10, 20, 100, 50]);  // rect is now (10, 20, 100, 50)
   * rect.fromArray([1, 2, 10, 20, 100, 50], 2);  // rect is now (10, 20, 100, 50)
   * ```
   */
  fromArray(arr: ArrayLike<number>, offset: number = 0): this {
    this.x = arr[offset];
    this.y = arr[offset + 1];
    this.width = arr[offset + 2];
    this.height = arr[offset + 3];
    return this;
  }

  /**
   * Converts this rectangle to a JSON-serializable object.
   *
   * @returns An object with x, y, width, and height properties
   *
   * @example
   * ```typescript
   * const rect = new Rect(10, 20, 100, 50);
   * const json = JSON.stringify(rect.toJSON());
   * // '{"x":10,"y":20,"width":100,"height":50}'
   * ```
   */
  toJSON(): { x: number; y: number; width: number; height: number } {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  /**
   * Creates a zero rectangle (0, 0, 0, 0).
   *
   * @returns A new zero Rect
   *
   * @example
   * ```typescript
   * const zero = Rect.zero();  // Rect(0, 0, 0, 0)
   * ```
   */
  static zero(): Rect {
    return new Rect(0, 0, 0, 0);
  }

  /**
   * Creates a rectangle from minimum and maximum corner points.
   *
   * @param min - The minimum corner (top-left)
   * @param max - The maximum corner (bottom-right)
   * @returns A new Rect
   *
   * @example
   * ```typescript
   * const min = new Vector2(10, 20);
   * const max = new Vector2(110, 70);
   * const rect = Rect.fromMinMax(min, max);  // Rect(10, 20, 100, 50)
   * ```
   */
  static fromMinMax(min: Vector2, max: Vector2): Rect {
    return new Rect(min.x, min.y, max.x - min.x, max.y - min.y);
  }

  /**
   * Creates a rectangle from a center point and size.
   *
   * @param center - The center point
   * @param size - The size (width, height)
   * @returns A new Rect
   *
   * @example
   * ```typescript
   * const center = new Vector2(50, 50);
   * const size = new Vector2(100, 60);
   * const rect = Rect.fromCenterSize(center, size);  // Rect(0, 20, 100, 60)
   * ```
   */
  static fromCenterSize(center: Vector2, size: Vector2): Rect {
    const halfWidth = size.x * 0.5;
    const halfHeight = size.y * 0.5;
    return new Rect(center.x - halfWidth, center.y - halfHeight, size.x, size.y);
  }

  /**
   * Creates a rectangle that bounds all the given points.
   *
   * @param points - An array of points to bound
   * @returns A new Rect that contains all points, or zero rect if array is empty
   *
   * @example
   * ```typescript
   * const points = [
   *   new Vector2(10, 20),
   *   new Vector2(100, 30),
   *   new Vector2(50, 80)
   * ];
   * const rect = Rect.fromPoints(points);  // Rect(10, 20, 90, 60)
   *
   * const empty = Rect.fromPoints([]);  // Rect(0, 0, 0, 0)
   * ```
   */
  static fromPoints(points: Vector2[]): Rect {
    if (points.length === 0) {
      return new Rect(0, 0, 0, 0);
    }

    let minX = points[0].x;
    let minY = points[0].y;
    let maxX = points[0].x;
    let maxY = points[0].y;

    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }

    return new Rect(minX, minY, maxX - minX, maxY - minY);
  }
}
