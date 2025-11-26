import { SerializationFormat } from './Serializer';

/**
 * Save slot metadata
 */
export interface SaveSlotMetadata {
  /** Save name */
  name?: string;
  /** Save description */
  description?: string;
  /** Play time in seconds */
  playTime?: number;
  /** Game version */
  version?: string;
  /** Whether this is an auto-save */
  isAutoSave?: boolean;
  /** Custom metadata */
  [key: string]: any;
}

/**
 * Save slot system with metadata and thumbnails
 */
export class SaveSlot {
  private id: string;
  private data: string | ArrayBuffer | null = null;
  private format: SerializationFormat = SerializationFormat.JSON;
  private timestamp: number;
  private metadata: SaveSlotMetadata = {};
  private thumbnail: string | null = null;
  private compressed: boolean = false;

  /**
   * Creates a new save slot
   */
  constructor(id: string) {
    this.id = id;
    this.timestamp = Date.now();
  }

  /**
   * Gets the slot ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Gets the save data
   */
  getData(): string | ArrayBuffer | null {
    return this.data;
  }

  /**
   * Sets the save data
   */
  setData(data: string | ArrayBuffer, format: SerializationFormat): void {
    this.data = data;
    this.format = format;
    this.timestamp = Date.now();
  }

  /**
   * Gets the serialization format
   */
  getFormat(): SerializationFormat {
    return this.format;
  }

  /**
   * Gets the save timestamp
   */
  getTimestamp(): number {
    return this.timestamp;
  }

  /**
   * Gets the save date
   */
  getDate(): Date {
    return new Date(this.timestamp);
  }

  /**
   * Gets the metadata
   */
  getMetadata(): SaveSlotMetadata {
    return this.metadata;
  }

  /**
   * Sets metadata
   */
  setMetadata(metadata: SaveSlotMetadata): void {
    this.metadata = { ...this.metadata, ...metadata };
  }

  /**
   * Gets the thumbnail
   */
  getThumbnail(): string | null {
    return this.thumbnail;
  }

  /**
   * Sets the thumbnail
   */
  setThumbnail(thumbnail: string): void {
    this.thumbnail = thumbnail;
  }

  /**
   * Checks if data is compressed
   */
  isCompressed(): boolean {
    return this.compressed;
  }

  /**
   * Sets compression flag
   */
  setCompressed(compressed: boolean): void {
    this.compressed = compressed;
  }

  /**
   * Gets the data size in bytes
   */
  getSize(): number {
    if (!this.data) {
      return 0;
    }

    if (typeof this.data === 'string') {
      return this.data.length * 2;
    }

    return this.data.byteLength;
  }

  /**
   * Serializes to JSON
   */
  toJSON(): any {
    let dataString: string;

    if (this.data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(this.data);
      dataString = btoa(String.fromCharCode(...bytes));
    } else {
      dataString = this.data || '';
    }

    return {
      id: this.id,
      data: dataString,
      format: this.format,
      timestamp: this.timestamp,
      metadata: this.metadata,
      thumbnail: this.thumbnail,
      compressed: this.compressed
    };
  }

  /**
   * Deserializes from JSON
   */
  static fromJSON(json: any): SaveSlot {
    const slot = new SaveSlot(json.id);

    if (json.format === SerializationFormat.BINARY) {
      const binaryString = atob(json.data);
      const bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      slot.data = bytes.buffer;
    } else {
      slot.data = json.data;
    }

    slot.format = json.format;
    slot.timestamp = json.timestamp;
    slot.metadata = json.metadata || {};
    slot.thumbnail = json.thumbnail;
    slot.compressed = json.compressed || false;

    return slot;
  }
}
