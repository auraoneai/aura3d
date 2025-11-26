/**
 * @fileoverview Globally unique ID generation for entities and assets.
 * Provides fast integer IDs for entities, compact base62 strings for assets,
 * and deterministic ID generation for network synchronization.
 */

/**
 * Character set for base62 encoding (0-9, A-Z, a-z).
 * Used for compact asset ID generation.
 */
const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Safe integer limit for JavaScript (2^53 - 1).
 * IDs exceeding this value cannot be represented accurately.
 */
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

/**
 * Warning threshold at 2^48 (281 trillion).
 * A warning is logged when entity IDs approach unsafe territory.
 */
const WARNING_THRESHOLD = Math.pow(2, 48);

/**
 * Globally unique ID generator for entities, assets, and other game objects.
 * Provides multiple ID generation strategies optimized for different use cases.
 *
 * @example
 * ```typescript
 * // Generate entity IDs (fast integer comparison)
 * const entityId = IdGenerator.nextEntityId(); // 1, 2, 3...
 *
 * // Generate asset IDs (compact strings)
 * const assetId = IdGenerator.nextAssetId(); // "a1b2c3d"
 *
 * // Generate UUIDs (RFC 4122 v4)
 * const uuid = IdGenerator.nextUUID(); // "550e8400-e29b-41d4-a716-446655440000"
 *
 * // Use namespaced IDs to prevent collisions
 * const playerId = IdGenerator.next('player'); // 1
 * const npcId = IdGenerator.next('npc'); // 1
 *
 * // Generate deterministic IDs for network sync
 * const syncId = IdGenerator.fromSeed('player:123'); // Always same result
 * ```
 */
export class IdGenerator {
  /**
   * Global entity ID counter.
   * Starts at 1 because 0 is often used as a sentinel value.
   */
  private static entityCounter = 1;

  /**
   * Global asset ID counter.
   * Used for base62 encoding to create compact string IDs.
   */
  private static assetCounter = 1;

  /**
   * Namespace-specific counters for isolated ID generation.
   * Each namespace maintains its own counter to prevent collisions.
   */
  private static namespaceCounters = new Map<string, number>();

  /**
   * Flag indicating whether overflow warning has been logged.
   * Prevents spamming the console with repeated warnings.
   */
  private static overflowWarningLogged = false;

  /**
   * Generates the next entity ID as an incrementing integer.
   * Entity IDs start at 1 and increment by 1 for each call.
   *
   * @returns A unique integer ID for an entity.
   * @throws {Error} If the ID counter exceeds MAX_SAFE_INTEGER.
   *
   * @example
   * ```typescript
   * const id1 = IdGenerator.nextEntityId(); // 1
   * const id2 = IdGenerator.nextEntityId(); // 2
   * const id3 = IdGenerator.nextEntityId(); // 3
   * ```
   */
  static nextEntityId(): number {
    this.checkOverflow(this.entityCounter, 'entity');
    return this.entityCounter++;
  }

  /**
   * Generates the next asset ID as a compact base62 string.
   * Asset IDs use base62 encoding (0-9, A-Z, a-z) for URL-safe,
   * human-readable identifiers.
   *
   * @returns A unique base62-encoded string ID for an asset.
   * @throws {Error} If the ID counter exceeds MAX_SAFE_INTEGER.
   *
   * @example
   * ```typescript
   * const id1 = IdGenerator.nextAssetId(); // "1"
   * const id2 = IdGenerator.nextAssetId(); // "2"
   * const id62 = IdGenerator.nextAssetId(); // "10" (after 61 IDs)
   * ```
   */
  static nextAssetId(): string {
    this.checkOverflow(this.assetCounter, 'asset');
    const id = this.assetCounter++;
    return this.toBase62(id);
  }

  /**
   * Generates a UUID v4 (random) string.
   * Uses crypto.getRandomValues when available (browser/Node.js with crypto),
   * falls back to Math.random for environments without crypto API.
   *
   * @returns A RFC 4122 v4 UUID string in canonical format.
   *
   * @example
   * ```typescript
   * const uuid = IdGenerator.nextUUID();
   * // "550e8400-e29b-41d4-a716-446655440000"
   * ```
   */
  static nextUUID(): string {
    // Try to use crypto API for better randomness
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      return this.generateUUIDWithCrypto();
    }
    // Fallback to Math.random
    return this.generateUUIDWithMath();
  }

  /**
   * Generates a namespaced ID with an isolated counter.
   * Each namespace maintains its own counter, preventing ID collisions
   * between different systems or entity types.
   *
   * @param namespace - The namespace identifier (e.g., 'player', 'npc', 'projectile').
   * @returns A unique integer ID within the specified namespace.
   * @throws {Error} If the namespace counter exceeds MAX_SAFE_INTEGER.
   *
   * @example
   * ```typescript
   * const player1 = IdGenerator.next('player'); // 1
   * const player2 = IdGenerator.next('player'); // 2
   * const npc1 = IdGenerator.next('npc'); // 1 (separate counter)
   * const npc2 = IdGenerator.next('npc'); // 2
   * ```
   */
  static next(namespace: string): number {
    let counter = this.namespaceCounters.get(namespace);
    if (counter === undefined) {
      counter = 1;
    }

    this.checkOverflow(counter, `namespace:${namespace}`);
    this.namespaceCounters.set(namespace, counter + 1);
    return counter;
  }

  /**
   * Generates a deterministic ID from a seed string.
   * Always produces the same ID for the same seed, enabling network
   * synchronization and reproducible ID generation.
   *
   * Uses a simple but effective hash function (DJB2) to convert
   * the seed string into a unique identifier.
   *
   * @param seed - The seed string to hash (e.g., 'player:123', 'level:boss').
   * @returns A deterministic base62-encoded string ID.
   *
   * @example
   * ```typescript
   * const id1 = IdGenerator.fromSeed('player:123'); // "4fK9pL"
   * const id2 = IdGenerator.fromSeed('player:123'); // "4fK9pL" (same)
   * const id3 = IdGenerator.fromSeed('player:456'); // "7qW2xN" (different)
   * ```
   */
  static fromSeed(seed: string): string {
    const hash = this.hashString(seed);
    return this.toBase62(hash);
  }

  /**
   * Resets all ID counters to their initial state.
   * WARNING: This should only be used in testing environments.
   * Calling this in production will cause ID reuse and potential conflicts.
   *
   * @example
   * ```typescript
   * // In a test file
   * beforeEach(() => {
   *   IdGenerator.reset();
   * });
   * ```
   */
  static reset(): void {
    this.entityCounter = 1;
    this.assetCounter = 1;
    this.namespaceCounters.clear();
    this.overflowWarningLogged = false;
  }

  /**
   * Converts a number to base62 encoding.
   * Base62 uses 0-9, A-Z, a-z (62 characters total) for compact,
   * URL-safe string representation.
   *
   * @param num - The number to encode (must be positive).
   * @returns The base62-encoded string.
   *
   * @private
   */
  private static toBase62(num: number): string {
    if (num === 0) {
      return BASE62_CHARS[0];
    }

    let result = '';
    let remaining = Math.abs(Math.floor(num));

    while (remaining > 0) {
      const remainder = remaining % 62;
      result = BASE62_CHARS[remainder] + result;
      remaining = Math.floor(remaining / 62);
    }

    return result;
  }

  /**
   * Generates a UUID v4 using the Web Crypto API.
   * Provides cryptographically secure random values.
   *
   * @returns A RFC 4122 v4 UUID string.
   *
   * @private
   */
  private static generateUUIDWithCrypto(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    // Set version (4) and variant (RFC 4122) bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

    // Convert to hex string with dashes
    const hex = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return [
      hex.substring(0, 8),
      hex.substring(8, 12),
      hex.substring(12, 16),
      hex.substring(16, 20),
      hex.substring(20, 32),
    ].join('-');
  }

  /**
   * Generates a UUID v4 using Math.random as fallback.
   * Less secure than crypto API but compatible with all environments.
   *
   * @returns A RFC 4122 v4 UUID string.
   *
   * @private
   */
  private static generateUUIDWithMath(): string {
    // Based on RFC 4122 format
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Hashes a string using the DJB2 algorithm.
   * Produces a 32-bit hash value that's deterministic and
   * has good distribution properties.
   *
   * @param str - The string to hash.
   * @returns A positive 32-bit integer hash value.
   *
   * @private
   */
  private static hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      // hash * 33 + char code
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      // Keep within 32-bit integer range
      hash = hash & 0x7fffffff;
    }
    return hash;
  }

  /**
   * Checks if a counter is approaching or exceeding safe integer limits.
   * Logs a warning at 2^48 and throws an error at MAX_SAFE_INTEGER.
   *
   * @param counter - The current counter value.
   * @param type - A descriptor for the counter type (for error messages).
   * @throws {Error} If the counter exceeds MAX_SAFE_INTEGER.
   *
   * @private
   */
  private static checkOverflow(counter: number, type: string): void {
    if (counter >= MAX_SAFE_INTEGER) {
      throw new Error(
        `IdGenerator overflow: ${type} counter exceeded MAX_SAFE_INTEGER (${MAX_SAFE_INTEGER}). ` +
        'IDs are no longer guaranteed to be unique.'
      );
    }

    if (counter >= WARNING_THRESHOLD && !this.overflowWarningLogged) {
      console.warn(
        `IdGenerator warning: ${type} counter exceeded 2^48 (${WARNING_THRESHOLD}). ` +
        'Approaching unsafe integer territory. Consider implementing ID recycling or resetting.'
      );
      this.overflowWarningLogged = true;
    }
  }
}
