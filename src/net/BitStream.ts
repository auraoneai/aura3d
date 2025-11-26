/**
 * @fileoverview Bit-level read/write operations for network compression.
 * Provides efficient bit packing for bandwidth optimization.
 * @module net/BitStream
 */

/**
 * Bit stream writer for packing data at bit-level granularity.
 * Enables efficient bandwidth usage by packing values into minimal bits.
 *
 * @example
 * ```typescript
 * const writer = new BitStreamWriter(64);
 *
 * // Write various bit-packed values
 * writer.writeBits(playerID, 6);        // 0-63 (6 bits)
 * writer.writeBoolean(isAlive);         // 1 bit
 * writer.writeBits(health, 7);          // 0-127 (7 bits)
 * writer.writeFloat(position.x, -100, 100, 0.01); // Compressed float
 *
 * const buffer = writer.toBuffer();
 * ```
 */
export class BitStreamWriter {
  private buffer: Uint8Array;
  private byteIndex: number = 0;
  private bitIndex: number = 0;

  /**
   * Creates a new BitStreamWriter.
   *
   * @param sizeInBytes - Initial buffer size in bytes
   *
   * @example
   * ```typescript
   * const writer = new BitStreamWriter(256);
   * ```
   */
  constructor(sizeInBytes: number = 256) {
    this.buffer = new Uint8Array(sizeInBytes);
  }

  /**
   * Writes bits to the stream.
   *
   * @param value - Value to write
   * @param numBits - Number of bits to write (1-32)
   *
   * @example
   * ```typescript
   * writer.writeBits(15, 4);  // Writes 1111 in 4 bits
   * writer.writeBits(5, 3);   // Writes 101 in 3 bits
   * ```
   */
  writeBits(value: number, numBits: number): void {
    if (numBits < 1 || numBits > 32) {
      throw new Error('numBits must be between 1 and 32');
    }

    // Ensure value fits in specified bits
    const mask = (1 << numBits) - 1;
    value = (value & mask) >>> 0;

    let bitsLeft = numBits;

    while (bitsLeft > 0) {
      // Ensure buffer has space
      if (this.byteIndex >= this.buffer.length) {
        this.expandBuffer();
      }

      // Calculate how many bits we can write to current byte
      const bitsInCurrentByte = 8 - this.bitIndex;
      const bitsToWrite = Math.min(bitsLeft, bitsInCurrentByte);

      // Extract bits to write
      const shift = bitsLeft - bitsToWrite;
      const bits = (value >>> shift) & ((1 << bitsToWrite) - 1);

      // Write bits to current byte
      const byteShift = bitsInCurrentByte - bitsToWrite;
      this.buffer[this.byteIndex] |= bits << byteShift;

      // Update indices
      this.bitIndex += bitsToWrite;
      if (this.bitIndex >= 8) {
        this.byteIndex++;
        this.bitIndex = 0;
      }

      bitsLeft -= bitsToWrite;
    }
  }

  /**
   * Writes a boolean value (1 bit).
   *
   * @param value - Boolean value
   *
   * @example
   * ```typescript
   * writer.writeBoolean(true);
   * writer.writeBoolean(false);
   * ```
   */
  writeBoolean(value: boolean): void {
    this.writeBits(value ? 1 : 0, 1);
  }

  /**
   * Writes an unsigned 8-bit integer.
   *
   * @param value - Value to write (0-255)
   */
  writeUint8(value: number): void {
    this.writeBits(value, 8);
  }

  /**
   * Writes an unsigned 16-bit integer.
   *
   * @param value - Value to write (0-65535)
   */
  writeUint16(value: number): void {
    this.writeBits(value, 16);
  }

  /**
   * Writes an unsigned 32-bit integer.
   *
   * @param value - Value to write
   */
  writeUint32(value: number): void {
    this.writeBits(value >>> 0, 32);
  }

  /**
   * Writes a compressed float value.
   * Quantizes the float to a fixed-point representation.
   *
   * @param value - Float value to write
   * @param min - Minimum value
   * @param max - Maximum value
   * @param precision - Precision (e.g., 0.01 for 2 decimal places)
   *
   * @example
   * ```typescript
   * // Position between -100 and 100 with 0.01 precision
   * writer.writeFloat(42.5, -100, 100, 0.01);
   * ```
   */
  writeFloat(value: number, min: number, max: number, precision: number): void {
    // Clamp value
    value = Math.max(min, Math.min(max, value));

    // Calculate range and steps
    const range = max - min;
    const steps = Math.ceil(range / precision);
    const bitsNeeded = Math.ceil(Math.log2(steps + 1));

    // Quantize
    const normalized = (value - min) / range;
    const quantized = Math.round(normalized * steps);

    this.writeBits(quantized, bitsNeeded);
  }

  /**
   * Writes a compressed Vector3.
   *
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   * @param min - Minimum value for each component
   * @param max - Maximum value for each component
   * @param precision - Precision for each component
   *
   * @example
   * ```typescript
   * writer.writeVector3(10, 20, 30, -100, 100, 0.1);
   * ```
   */
  writeVector3(
    x: number,
    y: number,
    z: number,
    min: number,
    max: number,
    precision: number
  ): void {
    this.writeFloat(x, min, max, precision);
    this.writeFloat(y, min, max, precision);
    this.writeFloat(z, min, max, precision);
  }

  /**
   * Writes a quaternion using smallest-three compression.
   * Only writes 3 components, reconstructs the 4th.
   *
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   * @param w - W component
   *
   * @example
   * ```typescript
   * writer.writeQuaternion(quat.x, quat.y, quat.z, quat.w);
   * ```
   */
  writeQuaternion(x: number, y: number, z: number, w: number): void {
    // Find largest component
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const absZ = Math.abs(z);
    const absW = Math.abs(w);

    let largest = 0;
    let maxAbs = absX;

    if (absY > maxAbs) {
      largest = 1;
      maxAbs = absY;
    }
    if (absZ > maxAbs) {
      largest = 2;
      maxAbs = absZ;
    }
    if (absW > maxAbs) {
      largest = 3;
    }

    // Write index of largest component (2 bits)
    this.writeBits(largest, 2);

    // Write sign of largest component (1 bit)
    const values = [x, y, z, w];
    this.writeBoolean(values[largest] < 0);

    // Write other 3 components (compressed to -0.707 to 0.707)
    for (let i = 0; i < 4; i++) {
      if (i !== largest) {
        this.writeFloat(values[i], -0.707107, 0.707107, 0.001);
      }
    }
  }

  /**
   * Aligns to the next byte boundary.
   *
   * @example
   * ```typescript
   * writer.writeBits(5, 3);  // 3 bits
   * writer.alignToByte();     // Skip 5 bits to next byte
   * ```
   */
  alignToByte(): void {
    if (this.bitIndex > 0) {
      this.byteIndex++;
      this.bitIndex = 0;
    }
  }

  /**
   * Expands the internal buffer.
   */
  private expandBuffer(): void {
    const newBuffer = new Uint8Array(this.buffer.length * 2);
    newBuffer.set(this.buffer);
    this.buffer = newBuffer;
  }

  /**
   * Gets the current write position in bits.
   * @returns Position in bits
   */
  getBitPosition(): number {
    return this.byteIndex * 8 + this.bitIndex;
  }

  /**
   * Gets the current write position in bytes (rounded up).
   * @returns Position in bytes
   */
  getBytePosition(): number {
    return this.bitIndex > 0 ? this.byteIndex + 1 : this.byteIndex;
  }

  /**
   * Converts the stream to an ArrayBuffer.
   * @returns ArrayBuffer containing written data
   */
  toBuffer(): ArrayBuffer {
    const length = this.getBytePosition();
    return this.buffer.slice(0, length).buffer;
  }

  /**
   * Resets the stream for reuse.
   */
  reset(): void {
    this.buffer.fill(0);
    this.byteIndex = 0;
    this.bitIndex = 0;
  }
}

/**
 * Bit stream reader for unpacking bit-packed data.
 * Companion to BitStreamWriter for reading compressed network data.
 *
 * @example
 * ```typescript
 * const reader = new BitStreamReader(buffer);
 *
 * const playerID = reader.readBits(6);
 * const isAlive = reader.readBoolean();
 * const health = reader.readBits(7);
 * const x = reader.readFloat(-100, 100, 0.01);
 * ```
 */
export class BitStreamReader {
  private buffer: Uint8Array;
  private byteIndex: number = 0;
  private bitIndex: number = 0;

  /**
   * Creates a new BitStreamReader.
   *
   * @param buffer - Buffer to read from
   *
   * @example
   * ```typescript
   * const reader = new BitStreamReader(receivedBuffer);
   * ```
   */
  constructor(buffer: ArrayBuffer) {
    this.buffer = new Uint8Array(buffer);
  }

  /**
   * Reads bits from the stream.
   *
   * @param numBits - Number of bits to read (1-32)
   * @returns Read value
   *
   * @example
   * ```typescript
   * const value = reader.readBits(4);  // Read 4 bits
   * ```
   */
  readBits(numBits: number): number {
    if (numBits < 1 || numBits > 32) {
      throw new Error('numBits must be between 1 and 32');
    }

    let value = 0;
    let bitsLeft = numBits;

    while (bitsLeft > 0) {
      if (this.byteIndex >= this.buffer.length) {
        throw new Error('Read past end of buffer');
      }

      // Calculate how many bits we can read from current byte
      const bitsInCurrentByte = 8 - this.bitIndex;
      const bitsToRead = Math.min(bitsLeft, bitsInCurrentByte);

      // Extract bits from current byte
      const byteShift = bitsInCurrentByte - bitsToRead;
      const mask = ((1 << bitsToRead) - 1) << byteShift;
      const bits = (this.buffer[this.byteIndex] & mask) >>> byteShift;

      // Add bits to value
      const valueShift = bitsLeft - bitsToRead;
      value |= bits << valueShift;

      // Update indices
      this.bitIndex += bitsToRead;
      if (this.bitIndex >= 8) {
        this.byteIndex++;
        this.bitIndex = 0;
      }

      bitsLeft -= bitsToRead;
    }

    return value >>> 0;
  }

  /**
   * Reads a boolean value (1 bit).
   * @returns Boolean value
   */
  readBoolean(): boolean {
    return this.readBits(1) !== 0;
  }

  /**
   * Reads an unsigned 8-bit integer.
   * @returns Value (0-255)
   */
  readUint8(): number {
    return this.readBits(8);
  }

  /**
   * Reads an unsigned 16-bit integer.
   * @returns Value (0-65535)
   */
  readUint16(): number {
    return this.readBits(16);
  }

  /**
   * Reads an unsigned 32-bit integer.
   * @returns Value
   */
  readUint32(): number {
    return this.readBits(32);
  }

  /**
   * Reads a compressed float value.
   *
   * @param min - Minimum value
   * @param max - Maximum value
   * @param precision - Precision used during writing
   * @returns Float value
   */
  readFloat(min: number, max: number, precision: number): number {
    const range = max - min;
    const steps = Math.ceil(range / precision);
    const bitsNeeded = Math.ceil(Math.log2(steps + 1));

    const quantized = this.readBits(bitsNeeded);
    const normalized = quantized / steps;
    return min + normalized * range;
  }

  /**
   * Reads a compressed Vector3.
   *
   * @param min - Minimum value for each component
   * @param max - Maximum value for each component
   * @param precision - Precision for each component
   * @returns Tuple of [x, y, z]
   */
  readVector3(min: number, max: number, precision: number): [number, number, number] {
    const x = this.readFloat(min, max, precision);
    const y = this.readFloat(min, max, precision);
    const z = this.readFloat(min, max, precision);
    return [x, y, z];
  }

  /**
   * Reads a quaternion compressed with smallest-three.
   * @returns Tuple of [x, y, z, w]
   */
  readQuaternion(): [number, number, number, number] {
    // Read index of largest component (2 bits)
    const largest = this.readBits(2);

    // Read sign of largest component (1 bit)
    const largestNegative = this.readBoolean();

    // Read other 3 components
    const values = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      if (i !== largest) {
        values[i] = this.readFloat(-0.707107, 0.707107, 0.001);
      }
    }

    // Reconstruct largest component
    const sumOfSquares = values.reduce((sum, v, i) => {
      return i !== largest ? sum + v * v : sum;
    }, 0);

    values[largest] = Math.sqrt(Math.max(0, 1 - sumOfSquares));
    if (largestNegative) {
      values[largest] = -values[largest];
    }

    return values as [number, number, number, number];
  }

  /**
   * Aligns to the next byte boundary.
   */
  alignToByte(): void {
    if (this.bitIndex > 0) {
      this.byteIndex++;
      this.bitIndex = 0;
    }
  }

  /**
   * Gets the current read position in bits.
   * @returns Position in bits
   */
  getBitPosition(): number {
    return this.byteIndex * 8 + this.bitIndex;
  }

  /**
   * Gets the current read position in bytes.
   * @returns Position in bytes
   */
  getBytePosition(): number {
    return this.byteIndex;
  }

  /**
   * Checks if there are more bits to read.
   * @returns True if more data available
   */
  hasMoreData(): boolean {
    return this.byteIndex < this.buffer.length ||
           (this.byteIndex === this.buffer.length - 1 && this.bitIndex < 8);
  }

  /**
   * Gets the remaining bits in the buffer.
   * @returns Number of bits remaining
   */
  getRemainingBits(): number {
    const totalBits = this.buffer.length * 8;
    const currentBit = this.byteIndex * 8 + this.bitIndex;
    return totalBits - currentBit;
  }
}
