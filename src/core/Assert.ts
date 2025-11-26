/**
 * Custom error class for assertion failures.
 * Extends the standard Error class to provide better error identification.
 */
export class AssertionError extends Error {
  /**
   * Creates a new AssertionError.
   * @param message - The error message describing the assertion failure
   */
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';

    // Maintains proper stack trace for where the error was thrown (V8 only)
    const ErrorWithCapture = Error as typeof Error & { captureStackTrace?: (error: Error, constructor: Function) => void };
    if (ErrorWithCapture.captureStackTrace) {
      ErrorWithCapture.captureStackTrace(this, AssertionError);
    }
  }
}

/**
 * Assertion utilities for development-time validation.
 *
 * Provides a comprehensive set of assertion methods that throw AssertionError
 * when conditions are not met. These utilities leverage TypeScript's assertion
 * signatures to provide type narrowing at compile time.
 *
 * @example
 * ```typescript
 * const value: string | undefined = getValue();
 * Assert.isDefined(value); // value is now narrowed to string
 *
 * Assert.isTrue(x > 0, 'x must be positive');
 * Assert.isInRange(index, 0, array.length - 1);
 * ```
 */
export class Assert {
  /**
   * Asserts that a condition is true.
   * Uses TypeScript's assertion signature to narrow types based on the condition.
   *
   * @param condition - The condition to check
   * @param message - Optional custom error message
   * @throws {AssertionError} If the condition is false
   *
   * @example
   * ```typescript
   * Assert.isTrue(x > 0, 'x must be positive');
   * ```
   */
  static isTrue(condition: boolean, message?: string): asserts condition {
    if (!condition) {
      throw new AssertionError(message || 'Assertion failed: condition is not true');
    }
  }

  /**
   * Asserts that a condition is false.
   *
   * @param condition - The condition to check
   * @param message - Optional custom error message
   * @throws {AssertionError} If the condition is true
   *
   * @example
   * ```typescript
   * Assert.isFalse(hasErrors, 'Should not have errors at this point');
   * ```
   */
  static isFalse(condition: boolean, message?: string): void {
    if (condition) {
      throw new AssertionError(message || 'Assertion failed: condition is not false');
    }
  }

  /**
   * Asserts that a value is defined (not null or undefined).
   * Uses TypeScript's assertion signature to narrow the type to exclude null and undefined.
   *
   * @param value - The value to check
   * @param message - Optional custom error message
   * @throws {AssertionError} If the value is null or undefined
   *
   * @example
   * ```typescript
   * const user: User | undefined = findUser(id);
   * Assert.isDefined(user, 'User must exist');
   * // user is now narrowed to User
   * ```
   */
  static isDefined<T>(value: T | undefined | null, message?: string): asserts value is T {
    if (value === undefined || value === null) {
      throw new AssertionError(message || 'Assertion failed: value is not defined');
    }
  }

  /**
   * Asserts that a value is a number.
   * Uses TypeScript's assertion signature to narrow the type to number.
   *
   * @param value - The value to check
   * @param message - Optional custom error message
   * @throws {AssertionError} If the value is not a number
   *
   * @example
   * ```typescript
   * const input: unknown = getUserInput();
   * Assert.isNumber(input, 'Input must be a number');
   * // input is now narrowed to number
   * ```
   */
  static isNumber(value: unknown, message?: string): asserts value is number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new AssertionError(message || 'Assertion failed: value is not a number');
    }
  }

  /**
   * Asserts that a number is finite (not Infinity or -Infinity).
   *
   * @param value - The number to check
   * @param message - Optional custom error message
   * @throws {AssertionError} If the value is not finite
   *
   * @example
   * ```typescript
   * Assert.isFinite(result, 'Calculation result must be finite');
   * ```
   */
  static isFinite(value: number, message?: string): void {
    if (!Number.isFinite(value)) {
      throw new AssertionError(message || `Assertion failed: value ${value} is not finite`);
    }
  }

  /**
   * Asserts that a number is within a specified range (inclusive).
   *
   * @param value - The number to check
   * @param min - The minimum allowed value (inclusive)
   * @param max - The maximum allowed value (inclusive)
   * @param message - Optional custom error message
   * @throws {AssertionError} If the value is outside the range
   *
   * @example
   * ```typescript
   * Assert.isInRange(index, 0, array.length - 1, 'Index out of bounds');
   * Assert.isInRange(percentage, 0, 100);
   * ```
   */
  static isInRange(value: number, min: number, max: number, message?: string): void {
    if (value < min || value > max) {
      throw new AssertionError(
        message || `Assertion failed: value ${value} is not in range [${min}, ${max}]`
      );
    }
  }

  /**
   * Asserts that a value is an array.
   * Uses TypeScript's assertion signature to narrow the type to an array.
   *
   * @param value - The value to check
   * @param message - Optional custom error message
   * @throws {AssertionError} If the value is not an array
   *
   * @example
   * ```typescript
   * const data: unknown = parseData();
   * Assert.isArray(data, 'Data must be an array');
   * // data is now narrowed to unknown[]
   * ```
   */
  static isArray<T>(value: unknown, message?: string): asserts value is T[] {
    if (!Array.isArray(value)) {
      throw new AssertionError(message || 'Assertion failed: value is not an array');
    }
  }

  /**
   * Asserts that a value is an instance of a specific class or constructor.
   * Uses TypeScript's assertion signature to narrow the type to the specified class.
   *
   * @param value - The value to check
   * @param type - The constructor function to check against
   * @param message - Optional custom error message
   * @throws {AssertionError} If the value is not an instance of the specified type
   *
   * @example
   * ```typescript
   * const obj: unknown = getSomeObject();
   * Assert.isInstanceOf(obj, Date, 'Object must be a Date');
   * // obj is now narrowed to Date
   * ```
   */
  static isInstanceOf<T>(
    value: unknown,
    type: new (...args: any[]) => T,
    message?: string
  ): asserts value is T {
    if (!(value instanceof type)) {
      const typeName = type.name || 'specified type';
      throw new AssertionError(
        message || `Assertion failed: value is not an instance of ${typeName}`
      );
    }
  }

  /**
   * Marks code paths that should never be reached.
   * Useful for exhaustive switch statements and ensuring all cases are handled.
   *
   * @param message - Optional custom error message
   * @returns Never returns (always throws)
   * @throws {AssertionError} Always throws when called
   *
   * @example
   * ```typescript
   * type Status = 'pending' | 'success' | 'error';
   *
   * function handleStatus(status: Status) {
   *   switch (status) {
   *     case 'pending':
   *       return 'Processing...';
   *     case 'success':
   *       return 'Done!';
   *     case 'error':
   *       return 'Failed!';
   *     default:
   *       return Assert.unreachable('Unhandled status');
   *   }
   * }
   * ```
   */
  static unreachable(message?: string): never {
    throw new AssertionError(message || 'Assertion failed: unreachable code was reached');
  }
}
