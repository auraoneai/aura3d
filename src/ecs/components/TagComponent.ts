/**
 * @fileoverview Tag component for entity categorization and filtering.
 * Provides a high-performance Set-based implementation for managing entity tags.
 * @module ecs/components/TagComponent
 */

import { IComponent, ComponentSchema } from '../Component';

/**
 * Component for tagging entities with string labels for categorization and filtering.
 * Uses an internal Set for O(1) tag operations and supports bulk operations,
 * queries, and iteration.
 *
 * Tags are case-sensitive strings that can be used to:
 * - Group entities by category (e.g., "enemy", "player", "collectible")
 * - Filter entities in queries (e.g., hasAny(["enemy", "boss"]))
 * - Toggle gameplay states (e.g., "stunned", "invisible", "frozen")
 * - Implement tag-based game logic
 *
 * @example
 * ```typescript
 * // Create with single tag
 * const tag1 = new TagComponent("enemy");
 *
 * // Create with multiple tags
 * const tag2 = new TagComponent(["player", "controllable"]);
 *
 * // Add and remove tags
 * tag1.add("boss").add("elite");
 * tag1.remove("enemy");
 *
 * // Query tags
 * if (tag1.has("boss")) {
 *   console.log("Entity is a boss");
 * }
 *
 * // Match multiple tags
 * if (tag2.hasAll(["player", "controllable"])) {
 *   console.log("Entity is a controllable player");
 * }
 *
 * // Toggle tags
 * tag1.toggle("frozen"); // Adds "frozen"
 * tag1.toggle("frozen"); // Removes "frozen"
 *
 * // Iterate over tags
 * for (const tag of tag1) {
 *   console.log(tag);
 * }
 * ```
 *
 * @implements {IComponent}
 */
class TagComponent implements IComponent {
  /**
   * Internal Set storing tags for O(1) add/remove/has operations.
   * @private
   */
  private _tags: Set<string>;

  /**
   * Component schema for serialization.
   * Tags are serialized as an array of strings.
   * @static
   * @readonly
   */
  static readonly schema: ComponentSchema = {
    tags: 'ref'
  };

  /**
   * Component name for registration and debugging.
   * @static
   * @readonly
   */
  static readonly _componentName: string = 'TagComponent';

  /**
   * Creates a new TagComponent with optional initial tags.
   *
   * @param {string | string[]} [tags] - Initial tag(s) to add. Can be a single
   *   string or an array of strings. If undefined, creates an empty tag set.
   *
   * @example
   * ```typescript
   * // Empty tag component
   * const empty = new TagComponent();
   *
   * // Single tag
   * const enemy = new TagComponent("enemy");
   *
   * // Multiple tags
   * const player = new TagComponent(["player", "controllable", "visible"]);
   * ```
   */
  constructor(tags?: string | string[]) {
    this._tags = new Set<string>();

    if (tags !== undefined) {
      if (typeof tags === 'string') {
        this._tags.add(tags);
      } else {
        for (const tag of tags) {
          this._tags.add(tag);
        }
      }
    }
  }

  /**
   * Adds a single tag to the component.
   * If the tag already exists, this is a no-op.
   * Performance: O(1)
   *
   * @param {string} tag - The tag to add (case-sensitive)
   * @returns {this} This component for method chaining
   *
   * @example
   * ```typescript
   * const tags = new TagComponent();
   * tags.add("enemy")
   *     .add("flying")
   *     .add("aggressive");
   * console.log(tags.count); // 3
   * ```
   */
  add(tag: string): this {
    this._tags.add(tag);
    return this;
  }

  /**
   * Removes a single tag from the component.
   * Performance: O(1)
   *
   * @param {string} tag - The tag to remove (case-sensitive)
   * @returns {boolean} True if the tag was present and removed, false otherwise
   *
   * @example
   * ```typescript
   * const tags = new TagComponent(["enemy", "flying"]);
   * const removed = tags.remove("flying"); // true
   * const notRemoved = tags.remove("swimming"); // false
   * console.log(tags.has("flying")); // false
   * ```
   */
  remove(tag: string): boolean {
    return this._tags.delete(tag);
  }

  /**
   * Checks if a tag is present in the component.
   * Performance: O(1)
   *
   * @param {string} tag - The tag to check (case-sensitive)
   * @returns {boolean} True if the tag is present, false otherwise
   *
   * @example
   * ```typescript
   * const tags = new TagComponent(["enemy", "boss"]);
   * console.log(tags.has("enemy")); // true
   * console.log(tags.has("Enemy")); // false (case-sensitive)
   * console.log(tags.has("player")); // false
   * ```
   */
  has(tag: string): boolean {
    return this._tags.has(tag);
  }

  /**
   * Toggles a tag's presence in the component.
   * If the tag is present, it is removed. If absent, it is added.
   * Performance: O(1)
   *
   * @param {string} tag - The tag to toggle (case-sensitive)
   * @returns {boolean} The new state of the tag (true if added, false if removed)
   *
   * @example
   * ```typescript
   * const tags = new TagComponent(["visible"]);
   * const state1 = tags.toggle("invisible"); // true (added)
   * const state2 = tags.toggle("invisible"); // false (removed)
   * const state3 = tags.toggle("visible"); // false (removed)
   * ```
   */
  toggle(tag: string): boolean {
    if (this._tags.has(tag)) {
      this._tags.delete(tag);
      return false;
    } else {
      this._tags.add(tag);
      return true;
    }
  }

  /**
   * Removes all tags from the component.
   * Performance: O(1)
   *
   * @returns {this} This component for method chaining
   *
   * @example
   * ```typescript
   * const tags = new TagComponent(["enemy", "flying", "boss"]);
   * console.log(tags.count); // 3
   * tags.clear();
   * console.log(tags.count); // 0
   * ```
   */
  clear(): this {
    this._tags.clear();
    return this;
  }

  /**
   * Adds multiple tags to the component in bulk.
   * Performance: O(n) where n is the number of tags
   *
   * @param {string[]} tags - Array of tags to add
   * @returns {this} This component for method chaining
   *
   * @example
   * ```typescript
   * const tags = new TagComponent();
   * tags.addAll(["enemy", "flying", "aggressive"]);
   * console.log(tags.count); // 3
   *
   * // Chaining with other operations
   * tags.addAll(["boss", "elite"])
   *     .remove("aggressive");
   * ```
   */
  addAll(tags: string[]): this {
    for (const tag of tags) {
      this._tags.add(tag);
    }
    return this;
  }

  /**
   * Removes multiple tags from the component in bulk.
   * Performance: O(n) where n is the number of tags
   *
   * @param {string[]} tags - Array of tags to remove
   * @returns {this} This component for method chaining
   *
   * @example
   * ```typescript
   * const tags = new TagComponent(["enemy", "flying", "aggressive", "boss"]);
   * tags.removeAll(["flying", "aggressive"]);
   * console.log(tags.tags); // ["enemy", "boss"]
   * ```
   */
  removeAll(tags: string[]): this {
    for (const tag of tags) {
      this._tags.delete(tag);
    }
    return this;
  }

  /**
   * Replaces all current tags with a new set of tags.
   * Clears existing tags and adds the provided ones.
   * Performance: O(n) where n is the number of new tags
   *
   * @param {string[]} tags - Array of tags to set
   * @returns {this} This component for method chaining
   *
   * @example
   * ```typescript
   * const tags = new TagComponent(["enemy", "flying"]);
   * tags.setTags(["player", "controllable"]);
   * console.log(tags.tags); // ["player", "controllable"]
   * console.log(tags.has("enemy")); // false
   * ```
   */
  setTags(tags: string[]): this {
    this._tags.clear();
    for (const tag of tags) {
      this._tags.add(tag);
    }
    return this;
  }

  /**
   * Gets a readonly array of all tags.
   * Returns a new array on each access to prevent external modification.
   * Performance: O(n) where n is the number of tags
   *
   * @returns {readonly string[]} Array of all tags in the component
   *
   * @example
   * ```typescript
   * const tags = new TagComponent(["enemy", "flying", "boss"]);
   * const allTags = tags.tags;
   * console.log(allTags); // ["enemy", "flying", "boss"]
   *
   * // Array is readonly - the following would cause a TypeScript error:
   * // allTags.push("new-tag");
   * ```
   */
  get tags(): readonly string[] {
    return Array.from(this._tags);
  }

  /**
   * Gets the number of tags in the component.
   * Performance: O(1)
   *
   * @returns {number} The number of tags
   *
   * @example
   * ```typescript
   * const tags = new TagComponent(["enemy", "flying"]);
   * console.log(tags.count); // 2
   * tags.add("boss");
   * console.log(tags.count); // 3
   * ```
   */
  get count(): number {
    return this._tags.size;
  }

  /**
   * Checks if the component has at least one of the provided tags.
   * Returns true if any tag matches.
   * Performance: O(n) where n is the number of tags to check
   *
   * @param {string[]} tags - Array of tags to check
   * @returns {boolean} True if at least one tag matches, false otherwise
   *
   * @example
   * ```typescript
   * const tags = new TagComponent(["enemy", "flying"]);
   * console.log(tags.hasAny(["enemy", "player"])); // true (has "enemy")
   * console.log(tags.hasAny(["player", "npc"])); // false (has neither)
   * console.log(tags.hasAny([])); // false (no tags to match)
   * ```
   */
  hasAny(tags: string[]): boolean {
    for (const tag of tags) {
      if (this._tags.has(tag)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if the component has all of the provided tags.
   * Returns true only if every tag matches.
   * Performance: O(n) where n is the number of tags to check
   *
   * @param {string[]} tags - Array of tags to check
   * @returns {boolean} True if all tags match, false otherwise
   *
   * @example
   * ```typescript
   * const tags = new TagComponent(["enemy", "flying", "boss"]);
   * console.log(tags.hasAll(["enemy", "flying"])); // true
   * console.log(tags.hasAll(["enemy", "swimming"])); // false
   * console.log(tags.hasAll([])); // true (vacuously true - all zero tags match)
   * ```
   */
  hasAll(tags: string[]): boolean {
    for (const tag of tags) {
      if (!this._tags.has(tag)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Resets the component to its default state.
   * Clears all tags for reuse in object pooling.
   * Performance: O(1)
   *
   * @example
   * ```typescript
   * const tags = new TagComponent(["enemy", "flying", "boss"]);
   * console.log(tags.count); // 3
   * tags.reset();
   * console.log(tags.count); // 0
   * ```
   */
  reset(): void {
    this._tags.clear();
  }

  /**
   * Serializes the component to a plain object.
   * Tags are stored as an array of strings.
   * Performance: O(n) where n is the number of tags
   *
   * @returns {object} Plain object with tags array
   *
   * @example
   * ```typescript
   * const tags = new TagComponent(["enemy", "flying"]);
   * const data = tags.serialize();
   * console.log(data); // { tags: ["enemy", "flying"] }
   * ```
   */
  serialize(): object {
    return {
      tags: Array.from(this._tags)
    };
  }

  /**
   * Deserializes the component from a plain object.
   * Replaces current tags with the deserialized ones.
   * Performance: O(n) where n is the number of tags
   *
   * @param {object} data - Plain object containing tags array
   *
   * @example
   * ```typescript
   * const tags = new TagComponent();
   * tags.deserialize({ tags: ["enemy", "flying", "boss"] });
   * console.log(tags.count); // 3
   * console.log(tags.has("enemy")); // true
   *
   * // Invalid data is handled gracefully
   * tags.deserialize({ tags: null }); // Sets empty tags
   * tags.deserialize({}); // Sets empty tags
   * ```
   */
  deserialize(data: object): void {
    const d = data as { tags?: string[] };
    this._tags.clear();

    if (d.tags && Array.isArray(d.tags)) {
      for (const tag of d.tags) {
        if (typeof tag === 'string') {
          this._tags.add(tag);
        }
      }
    }
  }

  /**
   * Returns an iterator over the tags.
   * Enables using the component in for...of loops.
   * Performance: O(1) to create, O(n) to iterate all tags
   *
   * @returns {Iterator<string>} Iterator over all tags
   *
   * @example
   * ```typescript
   * const tags = new TagComponent(["enemy", "flying", "boss"]);
   *
   * // Use in for...of loop
   * for (const tag of tags) {
   *   console.log(tag);
   * }
   *
   * // Manual iteration
   * const iterator = tags[Symbol.iterator]();
   * console.log(iterator.next().value); // "enemy"
   * ```
   */
  [Symbol.iterator](): Iterator<string> {
    return this._tags[Symbol.iterator]();
  }

  /**
   * Executes a callback function for each tag in the component.
   * Performance: O(n) where n is the number of tags
   *
   * @param {(tag: string) => void} callback - Function to execute for each tag
   *
   * @example
   * ```typescript
   * const tags = new TagComponent(["enemy", "flying", "boss"]);
   *
   * // Log each tag
   * tags.forEach(tag => {
   *   console.log(`Tag: ${tag}`);
   * });
   *
   * // Collect tags into an array (though tags.tags is more direct)
   * const collected: string[] = [];
   * tags.forEach(tag => collected.push(tag));
   * ```
   */
  forEach(callback: (tag: string) => void): void {
    this._tags.forEach(callback);
  }
}

export { TagComponent };
