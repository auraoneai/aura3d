import { Logger } from '../core/Logger';

const logger = Logger.create('BinarySerializer');

/**
 * Binary serialization options
 */
export interface BinarySerializationOptions {
  /** Use compression */
  compress?: boolean;
  /** Little endian byte order */
  littleEndian?: boolean;
}

/**
 * Binary serializer for efficient data storage
 * Provides compact binary format for game state
 */
export class BinarySerializer {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset: number = 0;
  private littleEndian: boolean;

  /**
   * Creates a new binary serializer
   */
  constructor(initialSize: number = 1024, littleEndian: boolean = true) {
    this.buffer = new ArrayBuffer(initialSize);
    this.view = new DataView(this.buffer);
    this.littleEndian = littleEndian;
  }

  /**
   * Serializes an object to binary
   */
  static serialize(data: any, options: BinarySerializationOptions = {}): ArrayBuffer {
    const serializer = new BinarySerializer(1024, options.littleEndian);
    serializer.writeValue(data);
    return serializer.getBuffer();
  }

  /**
   * Deserializes binary data to object
   */
  static deserialize(buffer: ArrayBuffer, options: BinarySerializationOptions = {}): any {
    const serializer = new BinarySerializer(buffer.byteLength, options.littleEndian);
    serializer.buffer = buffer;
    serializer.view = new DataView(buffer);
    serializer.offset = 0;
    return serializer.readValue();
  }

  /**
   * Writes a value to the buffer
   */
  private writeValue(value: any): void {
    if (value === null) {
      this.writeUint8(0);
      return;
    }

    if (value === undefined) {
      this.writeUint8(1);
      return;
    }

    const type = typeof value;

    switch (type) {
      case 'boolean':
        this.writeUint8(2);
        this.writeUint8(value ? 1 : 0);
        break;

      case 'number':
        if (Number.isInteger(value)) {
          this.writeUint8(3);
          this.writeInt32(value);
        } else {
          this.writeUint8(4);
          this.writeFloat64(value);
        }
        break;

      case 'string':
        this.writeUint8(5);
        this.writeString(value);
        break;

      case 'object':
        if (Array.isArray(value)) {
          this.writeUint8(6);
          this.writeArray(value);
        } else if (value instanceof Float32Array) {
          this.writeUint8(7);
          this.writeFloat32Array(value);
        } else if (value instanceof Uint8Array) {
          this.writeUint8(8);
          this.writeUint8Array(value);
        } else if (value instanceof Uint16Array) {
          this.writeUint8(9);
          this.writeUint16Array(value);
        } else if (value instanceof Uint32Array) {
          this.writeUint8(10);
          this.writeUint32Array(value);
        } else {
          this.writeUint8(11);
          this.writeObject(value);
        }
        break;

      default:
        this.writeUint8(1);
    }
  }

  /**
   * Reads a value from the buffer
   */
  private readValue(): any {
    const type = this.readUint8();

    switch (type) {
      case 0:
        return null;
      case 1:
        return undefined;
      case 2:
        return this.readUint8() === 1;
      case 3:
        return this.readInt32();
      case 4:
        return this.readFloat64();
      case 5:
        return this.readString();
      case 6:
        return this.readArray();
      case 7:
        return this.readFloat32Array();
      case 8:
        return this.readUint8Array();
      case 9:
        return this.readUint16Array();
      case 10:
        return this.readUint32Array();
      case 11:
        return this.readObject();
      default:
        throw new Error(`Unknown type: ${type}`);
    }
  }

  /**
   * Writes uint8
   */
  private writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  /**
   * Reads uint8
   */
  private readUint8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  /**
   * Writes int32
   */
  private writeInt32(value: number): void {
    this.ensureCapacity(4);
    this.view.setInt32(this.offset, value, this.littleEndian);
    this.offset += 4;
  }

  /**
   * Reads int32
   */
  private readInt32(): number {
    const value = this.view.getInt32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }

  /**
   * Writes float64
   */
  private writeFloat64(value: number): void {
    this.ensureCapacity(8);
    this.view.setFloat64(this.offset, value, this.littleEndian);
    this.offset += 8;
  }

  /**
   * Reads float64
   */
  private readFloat64(): number {
    const value = this.view.getFloat64(this.offset, this.littleEndian);
    this.offset += 8;
    return value;
  }

  /**
   * Writes string
   */
  private writeString(str: string): void {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);
    this.writeUint32(encoded.length);
    this.ensureCapacity(encoded.length);
    new Uint8Array(this.buffer, this.offset, encoded.length).set(encoded);
    this.offset += encoded.length;
  }

  /**
   * Reads string
   */
  private readString(): string {
    const length = this.readUint32();
    const decoder = new TextDecoder();
    const str = decoder.decode(new Uint8Array(this.buffer, this.offset, length));
    this.offset += length;
    return str;
  }

  /**
   * Writes uint32
   */
  private writeUint32(value: number): void {
    this.ensureCapacity(4);
    this.view.setUint32(this.offset, value, this.littleEndian);
    this.offset += 4;
  }

  /**
   * Reads uint32
   */
  private readUint32(): number {
    const value = this.view.getUint32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }

  /**
   * Writes array
   */
  private writeArray(arr: any[]): void {
    this.writeUint32(arr.length);
    for (const item of arr) {
      this.writeValue(item);
    }
  }

  /**
   * Reads array
   */
  private readArray(): any[] {
    const length = this.readUint32();
    const arr: any[] = [];
    for (let i = 0; i < length; i++) {
      arr.push(this.readValue());
    }
    return arr;
  }

  /**
   * Writes object
   */
  private writeObject(obj: Record<string, any>): void {
    const keys = Object.keys(obj);
    this.writeUint32(keys.length);

    for (const key of keys) {
      this.writeString(key);
      this.writeValue(obj[key]);
    }
  }

  /**
   * Reads object
   */
  private readObject(): Record<string, any> {
    const length = this.readUint32();
    const obj: Record<string, any> = {};

    for (let i = 0; i < length; i++) {
      const key = this.readString();
      const value = this.readValue();
      obj[key] = value;
    }

    return obj;
  }

  /**
   * Writes Float32Array
   */
  private writeFloat32Array(arr: Float32Array): void {
    this.writeUint32(arr.length);
    this.ensureCapacity(arr.length * 4);

    for (let i = 0; i < arr.length; i++) {
      this.view.setFloat32(this.offset, arr[i], this.littleEndian);
      this.offset += 4;
    }
  }

  /**
   * Reads Float32Array
   */
  private readFloat32Array(): Float32Array {
    const length = this.readUint32();
    const arr = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      arr[i] = this.view.getFloat32(this.offset, this.littleEndian);
      this.offset += 4;
    }

    return arr;
  }

  /**
   * Writes Uint8Array
   */
  private writeUint8Array(arr: Uint8Array): void {
    this.writeUint32(arr.length);
    this.ensureCapacity(arr.length);
    new Uint8Array(this.buffer, this.offset, arr.length).set(arr);
    this.offset += arr.length;
  }

  /**
   * Reads Uint8Array
   */
  private readUint8Array(): Uint8Array {
    const length = this.readUint32();
    const arr = new Uint8Array(this.buffer.slice(this.offset, this.offset + length));
    this.offset += length;
    return arr;
  }

  /**
   * Writes Uint16Array
   */
  private writeUint16Array(arr: Uint16Array): void {
    this.writeUint32(arr.length);
    this.ensureCapacity(arr.length * 2);

    for (let i = 0; i < arr.length; i++) {
      this.view.setUint16(this.offset, arr[i], this.littleEndian);
      this.offset += 2;
    }
  }

  /**
   * Reads Uint16Array
   */
  private readUint16Array(): Uint16Array {
    const length = this.readUint32();
    const arr = new Uint16Array(length);

    for (let i = 0; i < length; i++) {
      arr[i] = this.view.getUint16(this.offset, this.littleEndian);
      this.offset += 2;
    }

    return arr;
  }

  /**
   * Writes Uint32Array
   */
  private writeUint32Array(arr: Uint32Array): void {
    this.writeUint32(arr.length);
    this.ensureCapacity(arr.length * 4);

    for (let i = 0; i < arr.length; i++) {
      this.view.setUint32(this.offset, arr[i], this.littleEndian);
      this.offset += 4;
    }
  }

  /**
   * Reads Uint32Array
   */
  private readUint32Array(): Uint32Array {
    const length = this.readUint32();
    const arr = new Uint32Array(length);

    for (let i = 0; i < length; i++) {
      arr[i] = this.view.getUint32(this.offset, this.littleEndian);
      this.offset += 4;
    }

    return arr;
  }

  /**
   * Ensures buffer capacity
   */
  private ensureCapacity(bytes: number): void {
    const required = this.offset + bytes;

    if (required > this.buffer.byteLength) {
      const newSize = Math.max(required, this.buffer.byteLength * 2);
      const newBuffer = new ArrayBuffer(newSize);
      new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));

      this.buffer = newBuffer;
      this.view = new DataView(newBuffer);
    }
  }

  /**
   * Gets the serialized buffer
   */
  getBuffer(): ArrayBuffer {
    return this.buffer.slice(0, this.offset);
  }

  /**
   * Resets the serializer
   */
  reset(): void {
    this.offset = 0;
  }
}
