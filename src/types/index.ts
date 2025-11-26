// ============================================================================
// PRIMITIVE TYPES
// ============================================================================

/**
 * Type for numeric array constructors.
 *
 * Represents the constructor types for all TypedArray variants supported
 * by the engine. Used for creating typed arrays dynamically based on
 * data precision and memory requirements.
 *
 * @example
 * ```typescript
 * const arrayType: TypedArrayConstructor = Float32Array;
 * const buffer = new arrayType(10);
 * ```
 */
export type TypedArrayConstructor =
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Int32ArrayConstructor
  | Uint8ArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor;

/**
 * Union of all typed array types.
 *
 * Represents all possible TypedArray instances that can be used for
 * efficient storage and manipulation of numeric data. Commonly used
 * for vertex buffers, index buffers, and other GPU data.
 *
 * @example
 * ```typescript
 * function processBuffer(buffer: TypedArray): void {
 *   console.log(`Processing ${buffer.length} elements`);
 * }
 * ```
 */
export type TypedArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array;

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Makes all properties of T deeply readonly.
 *
 * Recursively applies readonly modifier to all properties and nested
 * properties of an object type. Useful for creating immutable configuration
 * objects or constants.
 *
 * @template T - The type to make deeply readonly
 *
 * @example
 * ```typescript
 * interface Config {
 *   settings: { quality: number };
 * }
 * const config: DeepReadonly<Config> = {
 *   settings: { quality: 1 }
 * };
 * // config.settings.quality = 2; // Error: readonly
 * ```
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Makes all properties of T deeply partial.
 *
 * Recursively applies optional modifier to all properties and nested
 * properties of an object type. Useful for update operations where only
 * a subset of properties need to be provided.
 *
 * @template T - The type to make deeply partial
 *
 * @example
 * ```typescript
 * interface Config {
 *   settings: { quality: number; shadows: boolean };
 * }
 * const updates: DeepPartial<Config> = {
 *   settings: { quality: 2 } // shadows is optional
 * };
 * ```
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extract constructor parameters as a tuple.
 *
 * Extracts the parameter types from a constructor function as a tuple type.
 * Useful for creating factory functions or wrappers around constructors.
 *
 * @template T - The constructor type to extract parameters from
 *
 * @example
 * ```typescript
 * class Vector3 {
 *   constructor(x: number, y: number, z: number) {}
 * }
 * type Params = ConstructorParameters<typeof Vector3>; // [number, number, number]
 * ```
 */
export type ConstructorParameters<T> = T extends new (...args: infer P) => any ? P : never;

/**
 * Extract the instance type from a constructor.
 *
 * Extracts the instance type produced by a constructor function. Useful
 * for working with class types in a generic context.
 *
 * @template T - The constructor type to extract instance type from
 *
 * @example
 * ```typescript
 * class Vector3 {
 *   x: number;
 * }
 * type Instance = InstanceType<typeof Vector3>; // Vector3
 * ```
 */
export type InstanceType<T> = T extends new (...args: any[]) => infer R ? R : never;

/**
 * Nullable type helper.
 *
 * Extends a type to allow null values. Used for values that may
 * explicitly be set to null to indicate absence or invalid state.
 *
 * @template T - The type to make nullable
 *
 * @example
 * ```typescript
 * let camera: Nullable<Camera> = null;
 * camera = new Camera();
 * ```
 */
export type Nullable<T> = T | null;

/**
 * Optional type helper.
 *
 * Extends a type to allow undefined values. Used for values that
 * may not be initialized or provided.
 *
 * @template T - The type to make optional
 *
 * @example
 * ```typescript
 * let texture: Optional<Texture> = undefined;
 * texture = loadTexture('image.png');
 * ```
 */
export type Optional<T> = T | undefined;

// ============================================================================
// POOLABLE INTERFACE
// ============================================================================

/**
 * Interface for objects that can be pooled.
 *
 * Objects implementing this interface can be reused from an object pool
 * to reduce garbage collection pressure. The reset() method should restore
 * the object to its initial state for reuse.
 *
 * @example
 * ```typescript
 * class Particle implements IPoolable {
 *   position = new Vector3();
 *   velocity = new Vector3();
 *
 *   reset(): void {
 *     this.position.set(0, 0, 0);
 *     this.velocity.set(0, 0, 0);
 *   }
 * }
 * ```
 */
export interface IPoolable {
  /**
   * Reset object to initial state for reuse.
   *
   * This method should clear all internal state and restore the object
   * to a clean state suitable for reuse from a pool. Should not allocate
   * new memory.
   */
  reset(): void;
}

/**
 * Interface for objects that can be disposed.
 *
 * Objects implementing this interface hold resources that must be
 * explicitly released. The dispose() method should release all held
 * resources such as GPU buffers, textures, or file handles.
 *
 * @example
 * ```typescript
 * class Texture implements IDisposable {
 *   private _isDisposed = false;
 *
 *   dispose(): void {
 *     if (!this._isDisposed) {
 *       // Release GPU resources
 *       this._isDisposed = true;
 *     }
 *   }
 *
 *   get isDisposed(): boolean {
 *     return this._isDisposed;
 *   }
 * }
 * ```
 */
export interface IDisposable {
  /**
   * Release all resources.
   *
   * This method should release all held resources and mark the object
   * as disposed. Should be idempotent - calling multiple times should
   * be safe.
   */
  dispose(): void;

  /**
   * Whether the object has been disposed.
   *
   * Returns true if dispose() has been called and resources have been
   * released. Operations on disposed objects should throw or fail safely.
   */
  readonly isDisposed: boolean;
}

/**
 * Interface for objects that can be cloned.
 *
 * Objects implementing this interface can create deep copies of themselves.
 * The clone should be a completely independent instance with no shared
 * references to the original.
 *
 * @template T - The type of object being cloned
 *
 * @example
 * ```typescript
 * class Vector3 implements IClonable<Vector3> {
 *   constructor(public x = 0, public y = 0, public z = 0) {}
 *
 *   clone(): Vector3 {
 *     return new Vector3(this.x, this.y, this.z);
 *   }
 * }
 * ```
 */
export interface IClonable<T> {
  /**
   * Create a deep copy of this object.
   *
   * Returns a new instance with the same values as this object. The clone
   * should be completely independent with no shared state.
   *
   * @returns A new instance that is a deep copy of this object
   */
  clone(): T;
}

/**
 * Interface for objects that can be copied from another.
 *
 * Objects implementing this interface can efficiently copy values from
 * another instance without allocating new memory. Useful for performance-
 * critical code where object reuse is important.
 *
 * @template T - The type of object to copy from
 *
 * @example
 * ```typescript
 * class Vector3 implements ICopyable<Vector3> {
 *   constructor(public x = 0, public y = 0, public z = 0) {}
 *
 *   copy(source: Vector3): this {
 *     this.x = source.x;
 *     this.y = source.y;
 *     this.z = source.z;
 *     return this;
 *   }
 * }
 * ```
 */
export interface ICopyable<T> {
  /**
   * Copy values from another object.
   *
   * Copies all values from the source object into this object. Does not
   * allocate new memory. Returns this for method chaining.
   *
   * @param source - The object to copy values from
   * @returns This object for method chaining
   */
  copy(source: T): this;
}

// ============================================================================
// SERIALIZATION TYPES
// ============================================================================

/**
 * JSON-serializable primitive value types.
 *
 * Represents the basic value types that can be serialized to JSON format.
 * These are the building blocks for all JSON-serializable data structures.
 *
 * @example
 * ```typescript
 * const value: JSONPrimitive = 42;
 * const text: JSONPrimitive = "hello";
 * const flag: JSONPrimitive = true;
 * const empty: JSONPrimitive = null;
 * ```
 */
export type JSONPrimitive = string | number | boolean | null;

/**
 * JSON-serializable object.
 *
 * Represents an object that can be serialized to JSON format. All property
 * values must themselves be JSON-serializable.
 *
 * @example
 * ```typescript
 * const obj: JSONObject = {
 *   name: "Camera",
 *   position: { x: 0, y: 1, z: 2 },
 *   enabled: true
 * };
 * ```
 */
export type JSONObject = { [key: string]: JSONValue };

/**
 * JSON-serializable array.
 *
 * Represents an array that can be serialized to JSON format. All elements
 * must themselves be JSON-serializable.
 *
 * @example
 * ```typescript
 * const arr: JSONArray = [1, "two", { three: 3 }, [4, 5]];
 * ```
 */
export type JSONArray = JSONValue[];

/**
 * Any JSON-serializable value.
 *
 * Represents any value that can be serialized to JSON format. This is the
 * union of all JSON-compatible types.
 *
 * @example
 * ```typescript
 * function serialize(value: JSONValue): string {
 *   return JSON.stringify(value);
 * }
 * ```
 */
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;

/**
 * Interface for serializable objects.
 *
 * Objects implementing this interface can be serialized to JSON format.
 * The toJSON() method is automatically called by JSON.stringify().
 *
 * @template T - The JSON type this object serializes to (defaults to JSONValue)
 *
 * @example
 * ```typescript
 * class Vector3 implements ISerializable {
 *   constructor(public x = 0, public y = 0, public z = 0) {}
 *
 *   toJSON(): JSONObject {
 *     return { x: this.x, y: this.y, z: this.z };
 *   }
 * }
 * ```
 */
export interface ISerializable<T = JSONValue> {
  /**
   * Serialize to JSON-compatible format.
   *
   * Converts this object to a JSON-compatible representation. This method
   * is automatically invoked by JSON.stringify().
   *
   * @returns A JSON-compatible representation of this object
   */
  toJSON(): T;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Generic event handler type.
 *
 * Represents a function that handles an event with associated data.
 * Used throughout the engine for event-driven programming.
 *
 * @template T - The type of data passed to the event handler (defaults to void)
 *
 * @example
 * ```typescript
 * const handler: EventHandler<MouseEvent> = (event) => {
 *   console.log(`Clicked at ${event.x}, ${event.y}`);
 * };
 * ```
 */
export type EventHandler<T = void> = (data: T) => void;

/**
 * Unsubscribe function returned by event subscriptions.
 *
 * A function that removes an event listener when called. Returned by
 * event subscription methods to allow cleanup.
 *
 * @example
 * ```typescript
 * const unsubscribe: Unsubscribe = emitter.on('update', handler);
 * // Later...
 * unsubscribe(); // Remove the listener
 * ```
 */
export type Unsubscribe = () => void;

// ============================================================================
// RENDERING TYPES
// ============================================================================

/**
 * Render backend type.
 *
 * Specifies which graphics API backend the engine should use for rendering.
 * WebGL2 is widely supported, while WebGPU offers modern features and
 * better performance on supported platforms.
 *
 * @example
 * ```typescript
 * const backend: RenderBackend = 'webgl2';
 * const renderer = new Renderer({ backend });
 * ```
 */
export type RenderBackend = 'webgl2' | 'webgpu';

/**
 * Quality preset levels.
 *
 * Predefined quality settings that control various rendering parameters
 * such as shadow resolution, texture quality, and post-processing effects.
 * Custom allows for fine-grained control of individual settings.
 *
 * @example
 * ```typescript
 * const quality: QualityPreset = 'high';
 * renderer.setQualityPreset(quality);
 * ```
 */
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';

/**
 * Clear flags for render targets.
 *
 * Bit flags that specify which buffers to clear before rendering.
 * Can be combined using bitwise OR to clear multiple buffers.
 *
 * @example
 * ```typescript
 * // Clear only color buffer
 * renderer.clear(ClearFlags.Color);
 *
 * // Clear color and depth
 * renderer.clear(ClearFlags.Color | ClearFlags.Depth);
 *
 * // Clear all buffers
 * renderer.clear(ClearFlags.All);
 * ```
 */
export enum ClearFlags {
  /** Clear no buffers */
  None = 0,
  /** Clear the color buffer */
  Color = 1 << 0,
  /** Clear the depth buffer */
  Depth = 1 << 1,
  /** Clear the stencil buffer */
  Stencil = 1 << 2,
  /** Clear all buffers (color, depth, and stencil) */
  All = Color | Depth | Stencil
}

// ============================================================================
// PHYSICS TYPES
// ============================================================================

/**
 * Physics body types.
 *
 * Defines how a physics body behaves in the simulation:
 * - static: Immovable, infinite mass (e.g., walls, floors)
 * - dynamic: Fully simulated, affected by forces and collisions
 * - kinematic: Movable by code, not affected by forces
 *
 * @example
 * ```typescript
 * const bodyType: PhysicsBodyType = 'dynamic';
 * const body = physics.createBody({ type: bodyType });
 * ```
 */
export type PhysicsBodyType = 'static' | 'dynamic' | 'kinematic';

/**
 * Collider shape types.
 *
 * Defines the geometric shape used for collision detection:
 * - box: Axis-aligned or oriented box (fast)
 * - sphere: Spherical shape (fastest)
 * - capsule: Cylinder with hemispheric caps (good for characters)
 * - cylinder: Cylindrical shape
 * - mesh: Arbitrary triangle mesh (slowest, static only)
 * - convex: Convex hull of points (good balance)
 *
 * @example
 * ```typescript
 * const shape: ColliderShapeType = 'capsule';
 * const collider = body.addCollider({ shape, radius: 0.5, height: 2 });
 * ```
 */
export type ColliderShapeType = 'box' | 'sphere' | 'capsule' | 'cylinder' | 'mesh' | 'convex';

// ============================================================================
// CALLBACK TYPES
// ============================================================================

/**
 * Factory function type.
 *
 * A function that creates and returns a new instance of type T.
 * Used for lazy initialization and object pooling.
 *
 * @template T - The type of object the factory creates
 *
 * @example
 * ```typescript
 * const factory: Factory<Vector3> = () => new Vector3();
 * const pool = new ObjectPool(factory);
 * ```
 */
export type Factory<T> = () => T;

/**
 * Reset function type.
 *
 * A function that resets an object to its initial state. Used in
 * object pools to prepare instances for reuse.
 *
 * @template T - The type of object to reset
 *
 * @example
 * ```typescript
 * const resetter: Resetter<Vector3> = (v) => v.set(0, 0, 0);
 * const pool = new ObjectPool(factory, resetter);
 * ```
 */
export type Resetter<T> = (obj: T) => void;

/**
 * Predicate function type.
 *
 * A function that tests whether a value satisfies a condition.
 * Returns true if the condition is met, false otherwise.
 *
 * @template T - The type of value to test
 *
 * @example
 * ```typescript
 * const isVisible: Predicate<Entity> = (entity) => entity.visible;
 * const visible = entities.filter(isVisible);
 * ```
 */
export type Predicate<T> = (value: T) => boolean;

/**
 * Comparator function type.
 *
 * A function that compares two values for ordering. Returns:
 * - Negative number if a < b
 * - Zero if a === b
 * - Positive number if a > b
 *
 * @template T - The type of values to compare
 *
 * @example
 * ```typescript
 * const byDistance: Comparator<Entity> = (a, b) => {
 *   return a.distanceToCamera - b.distanceToCamera;
 * };
 * entities.sort(byDistance);
 * ```
 */
export type Comparator<T> = (a: T, b: T) => number;

/**
 * Transformer function type.
 *
 * A function that transforms a value of type T into a value of type U.
 * Used for mapping and data transformation operations.
 *
 * @template T - The input type
 * @template U - The output type
 *
 * @example
 * ```typescript
 * const toPosition: Transformer<Entity, Vector3> = (entity) => {
 *   return entity.transform.position;
 * };
 * const positions = entities.map(toPosition);
 * ```
 */
export type Transformer<T, U> = (value: T) => U;
