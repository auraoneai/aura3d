/**
 * Log level enumeration for categorizing log messages by severity.
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
}

/**
 * Structured log entry containing all metadata for a log message.
 */
export interface LogEntry {
  /** Severity level of the log message */
  level: LogLevel;
  /** Category/component that generated the log */
  category: string;
  /** Human-readable log message */
  message: string;
  /** Unix timestamp in milliseconds when the log was created */
  timestamp: number;
  /** Optional structured data attached to the log entry */
  data?: unknown;
  /** Optional stack trace, automatically captured for ERROR and FATAL levels */
  stack?: string;
}

/**
 * Interface for log output destinations.
 * Implement this interface to create custom log sinks.
 */
export interface LogSink {
  /**
   * Write a log entry to the sink.
   * @param entry - The log entry to write
   */
  write(entry: LogEntry): void;
}

/**
 * Console sink that outputs log entries to the browser/Node.js console
 * with appropriate styling and formatting.
 */
export class ConsoleSink implements LogSink {
  private readonly useColors: boolean;
  private readonly levelColors: Map<LogLevel, string>;
  private readonly levelNames: Map<LogLevel, string>;

  /**
   * Creates a new console sink.
   * @param useColors - Whether to use ANSI color codes (default: true for Node.js, false for browser)
   */
  constructor(useColors: boolean = typeof process !== 'undefined') {
    this.useColors = useColors;
    this.levelColors = new Map([
      [LogLevel.TRACE, '\x1b[90m'],     // Gray
      [LogLevel.DEBUG, '\x1b[36m'],     // Cyan
      [LogLevel.INFO, '\x1b[32m'],      // Green
      [LogLevel.WARN, '\x1b[33m'],      // Yellow
      [LogLevel.ERROR, '\x1b[31m'],     // Red
      [LogLevel.FATAL, '\x1b[35m'],     // Magenta
    ]);
    this.levelNames = new Map([
      [LogLevel.TRACE, 'TRACE'],
      [LogLevel.DEBUG, 'DEBUG'],
      [LogLevel.INFO, 'INFO '],
      [LogLevel.WARN, 'WARN '],
      [LogLevel.ERROR, 'ERROR'],
      [LogLevel.FATAL, 'FATAL'],
    ]);
  }

  /**
   * Writes a log entry to the console.
   * @param entry - The log entry to write
   */
  write(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const levelName = this.levelNames.get(entry.level) || 'UNKNOWN';
    const color = this.levelColors.get(entry.level) || '';
    const reset = '\x1b[0m';

    let logMessage: string;
    if (this.useColors) {
      logMessage = `${color}[${timestamp}] [${levelName}] [${entry.category}]${reset} ${entry.message}`;
    } else {
      logMessage = `[${timestamp}] [${levelName}] [${entry.category}] ${entry.message}`;
    }

    const consoleMethod = this.getConsoleMethod(entry.level);

    if (entry.data !== undefined) {
      consoleMethod(logMessage, entry.data);
    } else {
      consoleMethod(logMessage);
    }

    if (entry.stack) {
      consoleMethod(entry.stack);
    }
  }

  /**
   * Maps log level to appropriate console method.
   * @param level - The log level
   * @returns The console method to use
   */
  private getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
    switch (level) {
      case LogLevel.TRACE:
      case LogLevel.DEBUG:
        return console.debug.bind(console);
      case LogLevel.INFO:
        return console.info.bind(console);
      case LogLevel.WARN:
        return console.warn.bind(console);
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        return console.error.bind(console);
      default:
        return console.log.bind(console);
    }
  }
}

/**
 * Array sink that stores log entries in memory with a maximum capacity.
 * Useful for implementing in-game consoles or debugging tools.
 */
export class ArraySink implements LogSink {
  /** Read-only array of stored log entries */
  readonly entries: LogEntry[] = [];
  /** Maximum number of entries to store before oldest are removed */
  readonly maxEntries: number;

  /**
   * Creates a new array sink.
   * @param maxEntries - Maximum number of entries to store (default: 1000)
   */
  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Writes a log entry to the array.
   * If the array is at capacity, the oldest entry is removed.
   * @param entry - The log entry to write
   */
  write(entry: LogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  /**
   * Clears all stored log entries.
   */
  clear(): void {
    this.entries.length = 0;
  }
}

/**
 * Scoped logger that pre-binds a category for convenient logging.
 * All log methods automatically use the bound category.
 */
export interface ScopedLogger {
  /**
   * Log a trace-level message.
   * @param message - The log message
   * @param data - Optional structured data
   */
  trace(message: string, data?: unknown): void;

  /**
   * Log a debug-level message.
   * @param message - The log message
   * @param data - Optional structured data
   */
  debug(message: string, data?: unknown): void;

  /**
   * Log an info-level message.
   * @param message - The log message
   * @param data - Optional structured data
   */
  info(message: string, data?: unknown): void;

  /**
   * Log a warning-level message.
   * @param message - The log message
   * @param data - Optional structured data
   */
  warn(message: string, data?: unknown): void;

  /**
   * Log an error-level message.
   * @param message - The log message
   * @param data - Optional structured data
   */
  error(message: string, data?: unknown): void;

  /**
   * Log a fatal-level message.
   * @param message - The log message
   * @param data - Optional structured data
   */
  fatal(message: string, data?: unknown): void;
}

/**
 * Rate limiter for preventing log spam.
 * Tracks message counts per category within time windows.
 */
class RateLimiter {
  private readonly maxMessagesPerSecond: number;
  private readonly categoryCounters: Map<string, { count: number; windowStart: number }>;

  /**
   * Creates a new rate limiter.
   * @param maxMessagesPerSecond - Maximum messages allowed per category per second
   */
  constructor(maxMessagesPerSecond: number = 100) {
    this.maxMessagesPerSecond = maxMessagesPerSecond;
    this.categoryCounters = new Map();
  }

  /**
   * Checks if a log message should be allowed for the given category.
   * @param category - The log category
   * @returns True if the message should be logged, false if rate-limited
   */
  shouldLog(category: string): boolean {
    const now = Date.now();
    const counter = this.categoryCounters.get(category);

    if (!counter) {
      this.categoryCounters.set(category, { count: 1, windowStart: now });
      return true;
    }

    const windowElapsed = now - counter.windowStart;

    if (windowElapsed >= 1000) {
      counter.count = 1;
      counter.windowStart = now;
      return true;
    }

    if (counter.count < this.maxMessagesPerSecond) {
      counter.count++;
      return true;
    }

    return false;
  }

  /**
   * Resets rate limiting for a specific category.
   * @param category - The category to reset
   */
  reset(category: string): void {
    this.categoryCounters.delete(category);
  }

  /**
   * Resets all rate limiting counters.
   */
  resetAll(): void {
    this.categoryCounters.clear();
  }
}

/**
 * Central logging system with structured logging, level filtering, and multiple output sinks.
 * Supports per-category log levels, rate limiting, and scoped loggers for convenience.
 */
export class Logger implements ScopedLogger {
  private static categoryLevels: Map<string, LogLevel> = new Map();
  private static globalLevel: LogLevel = LogLevel.INFO;
  private static sinks: Set<LogSink> = new Set();
  private static rateLimiter: RateLimiter = new RateLimiter(100);
  private static historyBuffer: ArraySink = new ArraySink(1000);
  private static initialized: boolean = false;
  private static instance: Logger | null = null;

  /** Instance category for scoped logging */
  private readonly category: string;

  /**
   * Creates a new Logger instance bound to a specific category.
   * Prefer using Logger.create() for most use cases.
   * @param category - The category name to bind
   */
  constructor(category: string = 'Default') {
    this.category = category;
  }

  /**
   * Gets a singleton instance of the Logger.
   * @returns The global Logger instance
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger('Global');
    }
    return Logger.instance;
  }

  /**
   * Alias for Logger.create() for backward compatibility.
   * @param category - The category name
   * @returns A Logger instance bound to the category
   */
  static get(category: string): Logger {
    return new Logger(category);
  }

  // Instance methods for ScopedLogger interface
  trace(message: string, data?: unknown): void {
    Logger.trace(this.category, message, data);
  }

  debug(message: string, data?: unknown): void {
    Logger.debug(this.category, message, data);
  }

  info(message: string, data?: unknown): void {
    Logger.info(this.category, message, data);
  }

  warn(message: string, data?: unknown): void {
    Logger.warn(this.category, message, data);
  }

  error(message: string, data?: unknown): void {
    Logger.error(this.category, message, data);
  }

  fatal(message: string, data?: unknown): void {
    Logger.fatal(this.category, message, data);
  }

  /**
   * Ensures the logger is initialized with default sinks.
   */
  private static ensureInitialized(): void {
    if (!this.initialized) {
      this.sinks.add(new ConsoleSink());
      this.sinks.add(this.historyBuffer);
      this.initialized = true;
    }
  }

  /**
   * Sets the log level for a specific category.
   * Messages below this level will be filtered out for this category.
   * @param category - The category name
   * @param level - The minimum log level to display
   */
  static setLevel(category: string, level: LogLevel): void {
    this.categoryLevels.set(category, level);
  }

  /**
   * Sets the global log level that applies to all categories.
   * This overrides individual category levels.
   * @param level - The minimum log level to display globally
   */
  static setGlobalLevel(level: LogLevel): void {
    this.globalLevel = level;
  }

  /**
   * Adds a log sink to receive log entries.
   * @param sink - The sink to add
   */
  static addSink(sink: LogSink): void {
    this.ensureInitialized();
    this.sinks.add(sink);
  }

  /**
   * Removes a log sink.
   * @param sink - The sink to remove
   */
  static removeSink(sink: LogSink): void {
    this.sinks.delete(sink);
  }

  /**
   * Gets the effective log level for a category.
   * Returns the category-specific level if set, otherwise the global level.
   * @param category - The category name
   * @returns The effective log level
   */
  private static getEffectiveLevel(category: string): LogLevel {
    return this.categoryLevels.get(category) ?? this.globalLevel;
  }

  /**
   * Checks if a log message should be processed based on level and rate limiting.
   * @param category - The category name
   * @param level - The log level
   * @returns True if the message should be logged, false otherwise
   */
  private static shouldLog(category: string, level: LogLevel): boolean {
    const effectiveLevel = this.getEffectiveLevel(category);
    if (level < effectiveLevel) {
      return false;
    }

    return this.rateLimiter.shouldLog(category);
  }

  /**
   * Captures the current stack trace, excluding logger internal frames.
   * @returns The formatted stack trace or undefined if unavailable
   */
  private static captureStackTrace(): string | undefined {
    const error = new Error();
    if (!error.stack) {
      return undefined;
    }

    const lines = error.stack.split('\n');
    const relevantLines = lines.slice(3);
    return relevantLines.join('\n');
  }

  /**
   * Core logging method that creates and dispatches log entries to all sinks.
   * @param category - The category name
   * @param level - The log level
   * @param message - The log message
   * @param data - Optional structured data
   */
  private static log(
    category: string,
    level: LogLevel,
    message: string,
    data?: unknown
  ): void {
    if (!this.shouldLog(category, level)) {
      return;
    }

    this.ensureInitialized();

    const entry: LogEntry = {
      level,
      category,
      message,
      timestamp: Date.now(),
      data,
    };

    if (level >= LogLevel.ERROR) {
      entry.stack = this.captureStackTrace();
    }

    for (const sink of this.sinks) {
      try {
        sink.write(entry);
      } catch (error) {
        console.error('Logger: Failed to write to sink', error);
      }
    }
  }

  /**
   * Logs a trace-level message.
   * Use for very detailed diagnostic information.
   * @param category - The category name
   * @param message - The log message
   * @param data - Optional structured data
   */
  static trace(category: string, message: string, data?: unknown): void {
    this.log(category, LogLevel.TRACE, message, data);
  }

  /**
   * Logs a debug-level message.
   * Use for detailed information useful during development.
   * @param category - The category name
   * @param message - The log message
   * @param data - Optional structured data
   */
  static debug(category: string, message: string, data?: unknown): void {
    this.log(category, LogLevel.DEBUG, message, data);
  }

  /**
   * Logs an info-level message.
   * Use for general informational messages.
   * @param category - The category name
   * @param message - The log message
   * @param data - Optional structured data
   */
  static info(category: string, message: string, data?: unknown): void {
    this.log(category, LogLevel.INFO, message, data);
  }

  /**
   * Logs a warning-level message.
   * Use for potentially harmful situations.
   * @param category - The category name
   * @param message - The log message
   * @param data - Optional structured data
   */
  static warn(category: string, message: string, data?: unknown): void {
    this.log(category, LogLevel.WARN, message, data);
  }

  /**
   * Logs an error-level message.
   * Use for error events that might still allow the application to continue.
   * Automatically captures stack trace.
   * @param category - The category name
   * @param message - The log message
   * @param data - Optional structured data
   */
  static error(category: string, message: string, data?: unknown): void {
    this.log(category, LogLevel.ERROR, message, data);
  }

  /**
   * Logs a fatal-level message.
   * Use for severe errors that will lead to application termination.
   * Automatically captures stack trace.
   * @param category - The category name
   * @param message - The log message
   * @param data - Optional structured data
   */
  static fatal(category: string, message: string, data?: unknown): void {
    this.log(category, LogLevel.FATAL, message, data);
  }

  /**
   * Creates a scoped logger bound to a specific category.
   * All log methods on the returned object will automatically use the bound category.
   * @param category - The category name to bind
   * @returns A scoped logger instance
   */
  static create(category: string): ScopedLogger {
    return {
      trace: (message: string, data?: unknown): void => {
        Logger.trace(category, message, data);
      },
      debug: (message: string, data?: unknown): void => {
        Logger.debug(category, message, data);
      },
      info: (message: string, data?: unknown): void => {
        Logger.info(category, message, data);
      },
      warn: (message: string, data?: unknown): void => {
        Logger.warn(category, message, data);
      },
      error: (message: string, data?: unknown): void => {
        Logger.error(category, message, data);
      },
      fatal: (message: string, data?: unknown): void => {
        Logger.fatal(category, message, data);
      },
    };
  }

  /**
   * Gets the history buffer containing the last N log entries.
   * Useful for debugging and implementing in-game consoles.
   * @returns The array sink containing historical log entries
   */
  static getHistory(): ArraySink {
    this.ensureInitialized();
    return this.historyBuffer;
  }

  /**
   * Resets rate limiting for a specific category.
   * @param category - The category to reset
   */
  static resetRateLimit(category: string): void {
    this.rateLimiter.reset(category);
  }

  /**
   * Resets all rate limiting counters.
   */
  static resetAllRateLimits(): void {
    this.rateLimiter.resetAll();
  }

  /**
   * Clears all category-specific log levels.
   */
  static clearCategoryLevels(): void {
    this.categoryLevels.clear();
  }

  /**
   * Removes all sinks and resets the logger to uninitialized state.
   * Primarily used for testing.
   */
  static reset(): void {
    this.sinks.clear();
    this.categoryLevels.clear();
    this.globalLevel = LogLevel.INFO;
    this.rateLimiter.resetAll();
    this.historyBuffer.clear();
    this.initialized = false;
  }
}
