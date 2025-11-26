/**
 * @fileoverview Network message serialization and queue management.
 * Provides efficient binary encoding/decoding, message type registry, and priority queuing.
 * @module net/NetworkMessage
 */

/**
 * Network message type identifier.
 * Used to identify the message handler on the receiving end.
 */
export type MessageType = number;

/**
 * Message priority levels for queue ordering.
 * Higher priority messages are sent before lower priority ones.
 */
export enum MessagePriority {
  /** Low priority - bulk data, background updates */
  LOW = 0,
  /** Normal priority - regular game state updates */
  NORMAL = 1,
  /** High priority - player input, important events */
  HIGH = 2,
  /** Critical priority - connection control, urgent state */
  CRITICAL = 3,
}

/**
 * Delivery mode for network messages.
 */
export enum DeliveryMode {
  /** Unreliable, unordered - fastest, may drop or reorder */
  UNRELIABLE = 0,
  /** Reliable, ordered - guaranteed delivery in order */
  RELIABLE = 1,
  /** Reliable, unordered - guaranteed delivery, any order */
  RELIABLE_UNORDERED = 2,
}

/**
 * Base interface for serializable network messages.
 */
export interface INetworkMessage {
  /**
   * Serialize the message to a DataView for network transmission.
   * @param view - DataView to write to
   * @param offset - Offset to start writing at
   * @returns Number of bytes written
   */
  serialize(view: DataView, offset: number): number;

  /**
   * Deserialize the message from a DataView.
   * @param view - DataView to read from
   * @param offset - Offset to start reading from
   * @returns Number of bytes read
   */
  deserialize(view: DataView, offset: number): number;

  /**
   * Get the estimated size in bytes for this message.
   * @returns Estimated size in bytes
   */
  getSize(): number;
}

/**
 * Network message envelope containing type, priority, and payload.
 */
export class NetworkMessage {
  /** Message type identifier */
  type: MessageType;

  /** Message priority for queue ordering */
  priority: MessagePriority;

  /** Delivery mode */
  deliveryMode: DeliveryMode;

  /** Sequence number for ordering */
  sequence: number;

  /** Message payload data */
  data: ArrayBuffer;

  /** Timestamp when message was created */
  timestamp: number;

  /**
   * Creates a new network message.
   *
   * @param type - Message type identifier
   * @param data - Message payload data
   * @param priority - Message priority (default: NORMAL)
   * @param deliveryMode - Delivery mode (default: RELIABLE)
   * @param sequence - Sequence number (default: 0)
   *
   * @example
   * ```typescript
   * const data = new ArrayBuffer(16);
   * const message = new NetworkMessage(
   *   MessageTypes.PLAYER_MOVE,
   *   data,
   *   MessagePriority.HIGH,
   *   DeliveryMode.UNRELIABLE
   * );
   * ```
   */
  constructor(
    type: MessageType,
    data: ArrayBuffer,
    priority: MessagePriority = MessagePriority.NORMAL,
    deliveryMode: DeliveryMode = DeliveryMode.RELIABLE,
    sequence: number = 0
  ) {
    this.type = type;
    this.data = data;
    this.priority = priority;
    this.deliveryMode = deliveryMode;
    this.sequence = sequence;
    this.timestamp = Date.now();
  }

  /**
   * Gets the total size of the message including header.
   * @returns Total size in bytes
   */
  getSize(): number {
    // Header: type(2) + priority(1) + deliveryMode(1) + sequence(4) + dataLength(4) = 12 bytes
    return 12 + this.data.byteLength;
  }

  /**
   * Serializes the message to a binary format.
   * @returns Serialized message as ArrayBuffer
   */
  serialize(): ArrayBuffer {
    const size = this.getSize();
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);

    let offset = 0;

    // Write header
    view.setUint16(offset, this.type, true);
    offset += 2;

    view.setUint8(offset, this.priority);
    offset += 1;

    view.setUint8(offset, this.deliveryMode);
    offset += 1;

    view.setUint32(offset, this.sequence, true);
    offset += 4;

    view.setUint32(offset, this.data.byteLength, true);
    offset += 4;

    // Write payload
    const dataView = new Uint8Array(this.data);
    const targetView = new Uint8Array(buffer, offset);
    targetView.set(dataView);

    return buffer;
  }

  /**
   * Deserializes a message from binary format.
   * @param buffer - ArrayBuffer containing serialized message
   * @returns Deserialized NetworkMessage
   */
  static deserialize(buffer: ArrayBuffer): NetworkMessage {
    const view = new DataView(buffer);
    let offset = 0;

    // Read header
    const type = view.getUint16(offset, true);
    offset += 2;

    const priority = view.getUint8(offset) as MessagePriority;
    offset += 1;

    const deliveryMode = view.getUint8(offset) as DeliveryMode;
    offset += 1;

    const sequence = view.getUint32(offset, true);
    offset += 4;

    const dataLength = view.getUint32(offset, true);
    offset += 4;

    // Read payload
    const data = buffer.slice(offset, offset + dataLength);

    return new NetworkMessage(type, data, priority, deliveryMode, sequence);
  }
}

/**
 * Message type metadata for registration.
 */
interface MessageTypeMetadata {
  /** Message type ID */
  id: MessageType;
  /** Human-readable name */
  name: string;
  /** Factory function to create message instances */
  factory?: () => INetworkMessage;
}

/**
 * Registry for message types and handlers.
 * Manages message type IDs and provides serialization helpers.
 *
 * @example
 * ```typescript
 * // Register a message type
 * const PLAYER_MOVE = MessageRegistry.register('PlayerMove', () => new PlayerMoveMessage());
 *
 * // Create and serialize
 * const msg = MessageRegistry.create(PLAYER_MOVE);
 * const buffer = MessageRegistry.serializeTyped(PLAYER_MOVE, msg);
 *
 * // Deserialize
 * const decoded = MessageRegistry.deserializeTyped(buffer);
 * ```
 */
export class MessageRegistry {
  private static nextId: MessageType = 1;
  private static typeMap = new Map<MessageType, MessageTypeMetadata>();
  private static nameMap = new Map<string, MessageType>();

  /**
   * Registers a new message type.
   *
   * @param name - Human-readable message name
   * @param factory - Optional factory function for creating instances
   * @returns Assigned message type ID
   *
   * @example
   * ```typescript
   * const CHAT_MESSAGE = MessageRegistry.register('ChatMessage');
   * ```
   */
  static register(name: string, factory?: () => INetworkMessage): MessageType {
    if (this.nameMap.has(name)) {
      throw new Error(`Message type '${name}' is already registered`);
    }

    const id = this.nextId++;
    const metadata: MessageTypeMetadata = { id, name, factory };

    this.typeMap.set(id, metadata);
    this.nameMap.set(name, id);

    return id;
  }

  /**
   * Gets metadata for a message type.
   * @param id - Message type ID
   * @returns Message metadata or undefined
   */
  static getMetadata(id: MessageType): MessageTypeMetadata | undefined {
    return this.typeMap.get(id);
  }

  /**
   * Gets a message type ID by name.
   * @param name - Message type name
   * @returns Message type ID or undefined
   */
  static getTypeByName(name: string): MessageType | undefined {
    return this.nameMap.get(name);
  }

  /**
   * Creates a new message instance using the registered factory.
   * @param id - Message type ID
   * @returns New message instance
   * @throws Error if type is not registered or has no factory
   */
  static create(id: MessageType): INetworkMessage {
    const metadata = this.typeMap.get(id);
    if (!metadata) {
      throw new Error(`Message type ${id} is not registered`);
    }
    if (!metadata.factory) {
      throw new Error(`Message type ${id} has no factory function`);
    }
    return metadata.factory();
  }

  /**
   * Serializes a typed message with its type header.
   * @param id - Message type ID
   * @param message - Message to serialize
   * @returns Serialized message with type header
   */
  static serializeTyped(id: MessageType, message: INetworkMessage): ArrayBuffer {
    const messageSize = message.getSize();
    const buffer = new ArrayBuffer(2 + messageSize); // 2 bytes for type ID
    const view = new DataView(buffer);

    // Write type ID
    view.setUint16(0, id, true);

    // Write message data
    message.serialize(view, 2);

    return buffer;
  }

  /**
   * Deserializes a typed message.
   * @param buffer - Buffer containing type header and message data
   * @returns Deserialized message instance
   * @throws Error if type is not registered
   */
  static deserializeTyped(buffer: ArrayBuffer): INetworkMessage {
    const view = new DataView(buffer);
    const id = view.getUint16(0, true);

    const message = this.create(id);
    message.deserialize(view, 2);

    return message;
  }

  /**
   * Clears all registered message types (for testing).
   * @internal
   */
  static clear(): void {
    this.nextId = 1;
    this.typeMap.clear();
    this.nameMap.clear();
  }
}

/**
 * Priority queue for network messages.
 * Messages are ordered by priority (highest first) and timestamp (oldest first).
 */
export class MessageQueue {
  private queue: NetworkMessage[] = [];
  private maxSize: number;

  /**
   * Creates a new message queue.
   * @param maxSize - Maximum number of messages in queue (default: 1000)
   */
  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Enqueues a message.
   * Messages are inserted in priority order.
   *
   * @param message - Message to enqueue
   * @returns True if enqueued, false if queue is full
   *
   * @example
   * ```typescript
   * const queue = new MessageQueue();
   * const msg = new NetworkMessage(1, new ArrayBuffer(8), MessagePriority.HIGH);
   * queue.enqueue(msg);
   * ```
   */
  enqueue(message: NetworkMessage): boolean {
    if (this.queue.length >= this.maxSize) {
      return false;
    }

    // Binary search for insertion point
    let left = 0;
    let right = this.queue.length;

    while (left < right) {
      const mid = (left + right) >>> 1;
      const midMsg = this.queue[mid];

      // Compare priority first, then timestamp
      if (
        message.priority > midMsg.priority ||
        (message.priority === midMsg.priority && message.timestamp < midMsg.timestamp)
      ) {
        right = mid;
      } else {
        left = mid + 1;
      }
    }

    this.queue.splice(left, 0, message);
    return true;
  }

  /**
   * Dequeues the highest priority message.
   * @returns Next message or undefined if queue is empty
   */
  dequeue(): NetworkMessage | undefined {
    return this.queue.shift();
  }

  /**
   * Peeks at the next message without removing it.
   * @returns Next message or undefined if queue is empty
   */
  peek(): NetworkMessage | undefined {
    return this.queue[0];
  }

  /**
   * Gets the number of messages in the queue.
   * @returns Queue size
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Checks if the queue is empty.
   * @returns True if empty
   */
  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Checks if the queue is full.
   * @returns True if full
   */
  get isFull(): boolean {
    return this.queue.length >= this.maxSize;
  }

  /**
   * Clears all messages from the queue.
   */
  clear(): void {
    this.queue.length = 0;
  }

  /**
   * Gets messages matching a filter.
   * @param predicate - Filter function
   * @returns Array of matching messages
   */
  filter(predicate: (msg: NetworkMessage) => boolean): NetworkMessage[] {
    return this.queue.filter(predicate);
  }

  /**
   * Removes messages matching a filter.
   * @param predicate - Filter function
   * @returns Number of messages removed
   */
  remove(predicate: (msg: NetworkMessage) => boolean): number {
    const originalLength = this.queue.length;
    this.queue = this.queue.filter((msg) => !predicate(msg));
    return originalLength - this.queue.length;
  }
}

/**
 * Utility for binary serialization of common data types in network messages.
 */
export class NetworkBinarySerializer {
  /**
   * Writes a UTF-8 string to a DataView.
   * Format: length (2 bytes) + UTF-8 bytes
   *
   * @param view - DataView to write to
   * @param offset - Offset to write at
   * @param str - String to write
   * @returns Number of bytes written
   */
  static writeString(view: DataView, offset: number, str: string): number {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);

    // Write length
    view.setUint16(offset, encoded.length, true);
    offset += 2;

    // Write bytes
    const target = new Uint8Array(view.buffer, view.byteOffset + offset);
    target.set(encoded);

    return 2 + encoded.length;
  }

  /**
   * Reads a UTF-8 string from a DataView.
   *
   * @param view - DataView to read from
   * @param offset - Offset to read from
   * @returns Tuple of [string, bytes read]
   */
  static readString(view: DataView, offset: number): [string, number] {
    const length = view.getUint16(offset, true);
    offset += 2;

    const decoder = new TextDecoder();
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
    const str = decoder.decode(bytes);

    return [str, 2 + length];
  }

  /**
   * Writes a Vector3 to a DataView.
   * @param view - DataView to write to
   * @param offset - Offset to write at
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   * @returns Number of bytes written (12)
   */
  static writeVector3(
    view: DataView,
    offset: number,
    x: number,
    y: number,
    z: number
  ): number {
    view.setFloat32(offset, x, true);
    view.setFloat32(offset + 4, y, true);
    view.setFloat32(offset + 8, z, true);
    return 12;
  }

  /**
   * Reads a Vector3 from a DataView.
   * @param view - DataView to read from
   * @param offset - Offset to read from
   * @returns Tuple of [x, y, z, bytes read]
   */
  static readVector3(view: DataView, offset: number): [number, number, number, number] {
    const x = view.getFloat32(offset, true);
    const y = view.getFloat32(offset + 4, true);
    const z = view.getFloat32(offset + 8, true);
    return [x, y, z, 12];
  }

  /**
   * Writes a Quaternion to a DataView.
   * @param view - DataView to write to
   * @param offset - Offset to write at
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   * @param w - W component
   * @returns Number of bytes written (16)
   */
  static writeQuaternion(
    view: DataView,
    offset: number,
    x: number,
    y: number,
    z: number,
    w: number
  ): number {
    view.setFloat32(offset, x, true);
    view.setFloat32(offset + 4, y, true);
    view.setFloat32(offset + 8, z, true);
    view.setFloat32(offset + 12, w, true);
    return 16;
  }

  /**
   * Reads a Quaternion from a DataView.
   * @param view - DataView to read from
   * @param offset - Offset to read from
   * @returns Tuple of [x, y, z, w, bytes read]
   */
  static readQuaternion(
    view: DataView,
    offset: number
  ): [number, number, number, number, number] {
    const x = view.getFloat32(offset, true);
    const y = view.getFloat32(offset + 4, true);
    const z = view.getFloat32(offset + 8, true);
    const w = view.getFloat32(offset + 12, true);
    return [x, y, z, w, 16];
  }
}
