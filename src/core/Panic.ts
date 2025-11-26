import { Logger } from './Logger';

/**
 * Custom error class for panic situations.
 * Extends Error with additional context information for crash reporting.
 */
export class PanicError extends Error {
  /** The context/subsystem where the panic occurred */
  readonly context: string;
  /** Timestamp when the panic occurred */
  readonly timestamp: number;

  /**
   * Creates a new PanicError.
   * @param message - The error message
   * @param context - The context/subsystem identifier
   */
  constructor(message: string, context: string) {
    super(message);
    this.name = 'PanicError';
    this.context = context;
    this.timestamp = Date.now();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PanicError);
    }
  }
}

/**
 * Information about the last panic that occurred.
 * Stored for crash reporting and debugging purposes.
 */
interface PanicInfo {
  /** The error that caused the panic */
  error: PanicError;
  /** The context/subsystem identifier */
  context: string;
  /** Timestamp when the panic occurred */
  timestamp: number;
}

/**
 * Hard failure handler for unrecoverable errors.
 *
 * Provides a centralized mechanism for handling fatal errors that cannot be recovered from.
 * By default, panics are logged at the FATAL level and then thrown as PanicError instances.
 * Custom handlers can be installed to provide user-friendly fatal error screens or custom
 * crash reporting behavior.
 *
 * @example
 * ```typescript
 * // Basic panic
 * Panic.panic('GPU context lost');
 *
 * // Panic with context
 * Panic.panic('Failed to initialize WebGL', 'Renderer');
 *
 * // Conditional panic (guard clause)
 * Panic.panicIf(device === null, 'Device must be initialized', 'Graphics');
 *
 * // Custom handler for user-friendly error screen
 * Panic.setCustomHandler((error, context) => {
 *   showFatalErrorScreen(error.message, context);
 *   sendCrashReport(error);
 * });
 * ```
 */
export class Panic {
  /**
   * The current panic handler function.
   * Invoked when a panic occurs to handle the fatal error.
   */
  static handler: (error: Error, context: string) => void = Panic.defaultHandler;

  /**
   * Information about the most recent panic.
   * Stored for crash reporting and post-mortem debugging.
   */
  private static lastPanic: PanicInfo | null = null;

  /**
   * Default panic handler that logs the error and throws.
   * @param error - The error that caused the panic
   * @param context - The context/subsystem identifier
   * @throws Always throws the error after logging
   */
  private static defaultHandler(error: Error, context: string): void {
    Logger.fatal('Panic', `[${context}] ${error.message}`, {
      context,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }

  /**
   * Triggers a panic with the given message.
   * Creates a PanicError with full stack trace, logs it, and invokes the panic handler.
   * This function never returns normally - it always throws.
   *
   * @param message - Description of the unrecoverable error
   * @param context - Optional context/subsystem identifier (defaults to 'Unknown')
   * @throws PanicError - Always throws after invoking the handler
   *
   * @example
   * ```typescript
   * if (!webglContext) {
   *   Panic.panic('Failed to create WebGL context', 'Renderer');
   * }
   * ```
   */
  static panic(message: string, context: string = 'Unknown'): never {
    const error = new PanicError(message, context);

    this.lastPanic = {
      error,
      context,
      timestamp: error.timestamp,
    };

    this.handler(error, context);

    throw error;
  }

  /**
   * Conditional panic that triggers only if the condition is true.
   * Useful for guard clauses and assertion-style checks.
   *
   * Note: This asserts that the condition should be FALSE. If the condition is TRUE,
   * it panics. This matches the semantic of "panic if this bad condition is true".
   *
   * @param condition - If true, triggers a panic
   * @param message - Description of the unrecoverable error
   * @param context - Optional context/subsystem identifier (defaults to 'Unknown')
   * @throws PanicError - Throws if condition is true
   *
   * @example
   * ```typescript
   * // Panic if device is null
   * Panic.panicIf(device === null, 'Device must be initialized', 'Graphics');
   *
   * // Panic if out of bounds
   * Panic.panicIf(index < 0 || index >= array.length, 'Index out of bounds', 'BufferManager');
   * ```
   */
  static panicIf(condition: boolean, message: string, context: string = 'Unknown'): void {
    if (condition) {
      this.panic(message, context);
    }
  }

  /**
   * Sets a custom panic handler.
   * The handler is invoked when a panic occurs, allowing for custom behavior such as
   * displaying user-friendly error screens or sending crash reports.
   *
   * The custom handler should either throw an error or terminate the application.
   * If the handler returns normally, the panic will still throw the original error.
   *
   * @param handler - Function to invoke when a panic occurs
   *
   * @example
   * ```typescript
   * Panic.setCustomHandler((error, context) => {
   *   // Display user-friendly error screen
   *   errorScreen.show({
   *     title: 'Fatal Error',
   *     message: error.message,
   *     context: context,
   *   });
   *
   *   // Send crash report to analytics
   *   analytics.sendCrashReport({
   *     error: error.message,
   *     stack: error.stack,
   *     context: context,
   *     timestamp: Date.now(),
   *   });
   *
   *   // Rethrow to halt execution
   *   throw error;
   * });
   * ```
   */
  static setCustomHandler(handler: (error: Error, context: string) => void): void {
    this.handler = handler;
  }

  /**
   * Resets the panic handler to the default behavior.
   * The default handler logs the error using Logger.fatal and throws.
   *
   * @example
   * ```typescript
   * // Set custom handler
   * Panic.setCustomHandler(myCustomHandler);
   *
   * // Later, reset to default
   * Panic.resetHandler();
   * ```
   */
  static resetHandler(): void {
    this.handler = Panic.defaultHandler;
  }

  /**
   * Gets information about the last panic that occurred.
   * Useful for crash reporting and debugging.
   *
   * @returns The last panic information, or null if no panic has occurred
   *
   * @example
   * ```typescript
   * const lastPanic = Panic.getLastPanic();
   * if (lastPanic) {
   *   console.log(`Last panic: ${lastPanic.error.message} at ${lastPanic.context}`);
   *   console.log(`Occurred at: ${new Date(lastPanic.timestamp).toISOString()}`);
   * }
   * ```
   */
  static getLastPanic(): PanicInfo | null {
    return this.lastPanic;
  }

  /**
   * Clears the stored last panic information.
   * Primarily used for testing or when starting a fresh session.
   *
   * @example
   * ```typescript
   * Panic.clearLastPanic();
   * ```
   */
  static clearLastPanic(): void {
    this.lastPanic = null;
  }
}
