import { Logger } from '../../core/Logger';

/**
 * Represents a single input command with metadata
 */
export interface Input {
  /** Unique sequence number for this input */
  sequence: number;
  /** Timestamp when input was created (ms) */
  timestamp: number;
  /** Input data (key states, mouse delta, etc.) */
  data: Record<string, any>;
}

/**
 * Configuration options for InputBuffer
 */
export interface InputBufferConfig {
  /** Maximum number of inputs to buffer */
  maxSize?: number;
  /** Maximum age of inputs in milliseconds */
  maxAge?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Input buffer with timestamps and sequence numbers for client prediction.
 * Stores input history for replay during server reconciliation.
 *
 * @example
 * ```typescript
 * const buffer = new InputBuffer({ maxSize: 120, maxAge: 2000 });
 * buffer.addInput({ forward: true, mouseX: 10, mouseY: 5 });
 * const inputs = buffer.getInputsSince(lastAckedSequence);
 * ```
 */
export class InputBuffer {
  private buffer: Input[] = [];
  private currentSequence: number = 0;
  private readonly maxSize: number;
  private readonly maxAge: number;
  private readonly debug: boolean;
  private readonly logger: Logger;

  constructor(config: InputBufferConfig = {}) {
    this.maxSize = config.maxSize ?? 120; // 2 seconds at 60 FPS
    this.maxAge = config.maxAge ?? 2000; // 2 seconds
    this.debug = config.debug ?? false;
    this.logger = new Logger('InputBuffer');
  }

  /**
   * Add a new input to the buffer
   *
   * @param data - Input data to store
   * @returns The sequence number assigned to this input
   */
  public addInput(data: Record<string, any>): number {
    const input: Input = {
      sequence: this.currentSequence++,
      timestamp: performance.now(),
      data: { ...data }
    };

    this.buffer.push(input);

    if (this.debug) {
      this.logger.debug(`Added input ${input.sequence}`, input.data);
    }

    this.pruneOldInputs();
    return input.sequence;
  }

  /**
   * Get all inputs after a specific sequence number
   * Used for replaying inputs during server reconciliation
   *
   * @param sequence - Get inputs after this sequence
   * @returns Array of inputs after the specified sequence
   */
  public getInputsSince(sequence: number): Input[] {
    return this.buffer.filter(input => input.sequence > sequence);
  }

  /**
   * Get input by exact sequence number
   *
   * @param sequence - Sequence number to retrieve
   * @returns The input or undefined if not found
   */
  public getInput(sequence: number): Input | undefined {
    return this.buffer.find(input => input.sequence === sequence);
  }

  /**
   * Remove all inputs up to and including the specified sequence
   * Called when server acknowledges inputs
   *
   * @param sequence - Remove inputs up to this sequence
   * @returns Number of inputs removed
   */
  public removeUntil(sequence: number): number {
    const initialLength = this.buffer.length;
    this.buffer = this.buffer.filter(input => input.sequence > sequence);
    const removed = initialLength - this.buffer.length;

    if (this.debug && removed > 0) {
      this.logger.debug(`Removed ${removed} inputs up to sequence ${sequence}`);
    }

    return removed;
  }

  /**
   * Get the latest input in the buffer
   *
   * @returns The most recent input or undefined if buffer is empty
   */
  public getLatest(): Input | undefined {
    return this.buffer[this.buffer.length - 1];
  }

  /**
   * Get the oldest input in the buffer
   *
   * @returns The oldest input or undefined if buffer is empty
   */
  public getOldest(): Input | undefined {
    return this.buffer[0];
  }

  /**
   * Get all inputs in the buffer
   *
   * @returns Copy of all buffered inputs
   */
  public getAll(): Input[] {
    return [...this.buffer];
  }

  /**
   * Get the number of inputs currently buffered
   *
   * @returns Current buffer size
   */
  public getSize(): number {
    return this.buffer.length;
  }

  /**
   * Get the current sequence number (next to be assigned)
   *
   * @returns Current sequence counter value
   */
  public getCurrentSequence(): number {
    return this.currentSequence;
  }

  /**
   * Clear all inputs from the buffer
   */
  public clear(): void {
    this.buffer = [];
    if (this.debug) {
      this.logger.debug('Buffer cleared');
    }
  }

  /**
   * Reset the buffer and sequence counter
   */
  public reset(): void {
    this.buffer = [];
    this.currentSequence = 0;
    if (this.debug) {
      this.logger.debug('Buffer reset');
    }
  }

  /**
   * Remove old inputs based on size and age constraints
   */
  private pruneOldInputs(): void {
    const now = performance.now();
    let pruned = false;

    // Remove by age
    const ageThreshold = now - this.maxAge;
    const initialLength = this.buffer.length;
    this.buffer = this.buffer.filter(input => input.timestamp >= ageThreshold);

    if (this.buffer.length < initialLength) {
      pruned = true;
    }

    // Remove by size (oldest first)
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(this.buffer.length - this.maxSize);
      pruned = true;
    }

    if (pruned && this.debug) {
      this.logger.debug(`Pruned inputs, buffer size: ${this.buffer.length}`);
    }
  }

  /**
   * Get buffer statistics
   *
   * @returns Statistics about the current buffer state
   */
  public getStats(): {
    size: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
    oldestSequence: number | null;
    newestSequence: number | null;
    ageMs: number | null;
  } {
    const oldest = this.getOldest();
    const newest = this.getLatest();

    return {
      size: this.buffer.length,
      oldestTimestamp: oldest?.timestamp ?? null,
      newestTimestamp: newest?.timestamp ?? null,
      oldestSequence: oldest?.sequence ?? null,
      newestSequence: newest?.sequence ?? null,
      ageMs: oldest && newest ? newest.timestamp - oldest.timestamp : null
    };
  }
}
