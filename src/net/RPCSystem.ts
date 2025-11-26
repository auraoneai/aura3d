/**
 * @fileoverview Remote Procedure Call (RPC) system.
 * Provides type-safe RPC registration and invocation for client-server communication.
 * @module net/RPCSystem
 */

import { Logger } from '../core/Logger';
import { NetworkId, PlayerId } from './NetworkEntity';
import { BinarySerializer } from './NetworkMessage';

const logger = Logger.create('RPCSystem');

/**
 * RPC call direction.
 */
export enum RPCDirection {
  /** Client-to-server call */
  CLIENT_TO_SERVER = 'client_to_server',
  /** Server-to-client call */
  SERVER_TO_CLIENT = 'server_to_client',
  /** Server-to-all-clients multicast */
  MULTICAST = 'multicast',
}

/**
 * RPC execution mode.
 */
export enum RPCMode {
  /** Execute immediately */
  IMMEDIATE = 'immediate',
  /** Queue for next tick */
  QUEUED = 'queued',
}

/**
 * RPC function signature.
 */
export type RPCFunction = (...args: any[]) => void | Promise<void>;

/**
 * RPC metadata.
 */
interface RPCMetadata {
  /** RPC name */
  name: string;
  /** RPC ID */
  id: number;
  /** Allowed direction */
  direction: RPCDirection;
  /** Execution mode */
  mode: RPCMode;
  /** Handler function */
  handler: RPCFunction;
}

/**
 * RPC invocation data.
 */
export interface RPCInvocation {
  /** RPC ID */
  rpcId: number;
  /** Target network entity ID (0 for global) */
  targetId: NetworkId;
  /** Caller player ID (0 for server) */
  callerId: PlayerId;
  /** Arguments */
  args: any[];
  /** Direction */
  direction: RPCDirection;
}

/**
 * Remote Procedure Call system.
 * Manages RPC registration and invocation across the network.
 *
 * @example
 * ```typescript
 * const rpcSystem = new RPCSystem();
 *
 * // Server-side: Register RPC
 * rpcSystem.register(
 *   'PlayerJump',
 *   RPCDirection.CLIENT_TO_SERVER,
 *   (playerId: number, height: number) => {
 *     console.log(`Player ${playerId} jumped ${height} units`);
 *   }
 * );
 *
 * // Client-side: Call RPC
 * rpcSystem.call('PlayerJump', 0, [42, 10]);
 *
 * // Server-side: Multicast to all clients
 * rpcSystem.multicast('GameStart', 0, []);
 * ```
 */
export class RPCSystem {
  /** Registered RPCs by ID */
  private rpcById = new Map<number, RPCMetadata>();

  /** Registered RPCs by name */
  private rpcByName = new Map<string, RPCMetadata>();

  /** Next RPC ID */
  private nextId: number = 1;

  /** Queued RPC invocations */
  private queuedCalls: RPCInvocation[] = [];

  /** Whether this is a server instance */
  private isServer: boolean;

  /**
   * Creates a new RPC system.
   * @param isServer - True if this is the server, false if client
   */
  constructor(isServer: boolean = false) {
    this.isServer = isServer;
  }

  /**
   * Registers an RPC.
   *
   * @param name - RPC name
   * @param direction - Allowed call direction
   * @param handler - Handler function
   * @param mode - Execution mode (default: IMMEDIATE)
   * @returns Assigned RPC ID
   *
   * @example
   * ```typescript
   * // Client-to-server RPC
   * rpcSystem.register(
   *   'SendChatMessage',
   *   RPCDirection.CLIENT_TO_SERVER,
   *   (playerId: number, message: string) => {
   *     console.log(`Player ${playerId}: ${message}`);
   *   }
   * );
   *
   * // Server-to-client RPC
   * rpcSystem.register(
   *   'UpdateScore',
   *   RPCDirection.SERVER_TO_CLIENT,
   *   (score: number) => {
   *     UI.updateScore(score);
   *   }
   * );
   * ```
   */
  register(
    name: string,
    direction: RPCDirection,
    handler: RPCFunction,
    mode: RPCMode = RPCMode.IMMEDIATE
  ): number {
    if (this.rpcByName.has(name)) {
      throw new Error(`RPC '${name}' is already registered`);
    }

    const id = this.nextId++;
    const metadata: RPCMetadata = {
      name,
      id,
      direction,
      mode,
      handler,
    };

    this.rpcById.set(id, metadata);
    this.rpcByName.set(name, metadata);

    logger.debug(`Registered RPC '${name}' (ID: ${id}, direction: ${direction})`);

    return id;
  }

  /**
   * Unregisters an RPC.
   * @param name - RPC name
   * @returns True if unregistered, false if not found
   */
  unregister(name: string): boolean {
    const metadata = this.rpcByName.get(name);
    if (!metadata) {
      return false;
    }

    this.rpcById.delete(metadata.id);
    this.rpcByName.delete(name);

    logger.debug(`Unregistered RPC '${name}'`);

    return true;
  }

  /**
   * Calls an RPC by name.
   *
   * @param name - RPC name
   * @param targetId - Target entity ID (0 for global)
   * @param args - Arguments
   * @param callerId - Caller player ID (0 for server)
   * @returns RPC invocation data for serialization
   *
   * @example
   * ```typescript
   * // Client calls server RPC
   * const invocation = rpcSystem.call('PlayerMove', playerEntityId, [x, y, z]);
   * // Send invocation over network
   * transport.send(serializeRPC(invocation));
   * ```
   */
  call(
    name: string,
    targetId: NetworkId,
    args: any[],
    callerId: PlayerId = 0
  ): RPCInvocation | null {
    const metadata = this.rpcByName.get(name);
    if (!metadata) {
      logger.error(`RPC '${name}' not found`);
      return null;
    }

    const invocation: RPCInvocation = {
      rpcId: metadata.id,
      targetId,
      callerId,
      args,
      direction: metadata.direction,
    };

    return invocation;
  }

  /**
   * Calls an RPC by ID.
   *
   * @param rpcId - RPC ID
   * @param targetId - Target entity ID
   * @param args - Arguments
   * @param callerId - Caller player ID
   * @returns RPC invocation data
   */
  callById(
    rpcId: number,
    targetId: NetworkId,
    args: any[],
    callerId: PlayerId = 0
  ): RPCInvocation | null {
    const metadata = this.rpcById.get(rpcId);
    if (!metadata) {
      logger.error(`RPC ID ${rpcId} not found`);
      return null;
    }

    const invocation: RPCInvocation = {
      rpcId,
      targetId,
      callerId,
      args,
      direction: metadata.direction,
    };

    return invocation;
  }

  /**
   * Multicasts an RPC to all clients.
   * Server-only.
   *
   * @param name - RPC name
   * @param targetId - Target entity ID
   * @param args - Arguments
   * @returns RPC invocation data
   *
   * @example
   * ```typescript
   * // Server broadcasts to all clients
   * const invocation = rpcSystem.multicast('PlayerSpawned', entityId, [x, y, z]);
   * // Send to all connected clients
   * ```
   */
  multicast(name: string, targetId: NetworkId, args: any[]): RPCInvocation | null {
    if (!this.isServer) {
      logger.error('Multicast can only be called on server');
      return null;
    }

    const metadata = this.rpcByName.get(name);
    if (!metadata) {
      logger.error(`RPC '${name}' not found`);
      return null;
    }

    const invocation: RPCInvocation = {
      rpcId: metadata.id,
      targetId,
      callerId: 0, // Server
      args,
      direction: RPCDirection.MULTICAST,
    };

    return invocation;
  }

  /**
   * Executes a received RPC invocation.
   *
   * @param invocation - RPC invocation to execute
   *
   * @example
   * ```typescript
   * // On receiving RPC from network
   * transport.onMessage((message) => {
   *   const invocation = deserializeRPC(message.data);
   *   rpcSystem.execute(invocation);
   * });
   * ```
   */
  execute(invocation: RPCInvocation): void {
    const metadata = this.rpcById.get(invocation.rpcId);
    if (!metadata) {
      logger.error(`Cannot execute RPC - ID ${invocation.rpcId} not found`);
      return;
    }

    // Validate direction
    if (!this.validateDirection(metadata.direction, invocation.direction)) {
      logger.error(
        `Invalid RPC direction - expected ${metadata.direction}, got ${invocation.direction}`
      );
      return;
    }

    // Execute immediately or queue
    if (metadata.mode === RPCMode.IMMEDIATE) {
      this.executeImmediate(metadata, invocation);
    } else {
      this.queuedCalls.push(invocation);
    }
  }

  /**
   * Executes an RPC immediately.
   */
  private executeImmediate(metadata: RPCMetadata, invocation: RPCInvocation): void {
    try {
      const result = metadata.handler(...invocation.args);

      // Handle async handlers
      if (result instanceof Promise) {
        result.catch((error) => {
          logger.error(`RPC '${metadata.name}' async error`, error);
        });
      }
    } catch (error) {
      logger.error(`RPC '${metadata.name}' execution error`, error);
    }
  }

  /**
   * Validates RPC direction.
   */
  private validateDirection(registered: RPCDirection, invoked: RPCDirection): boolean {
    // Multicast can be received as server-to-client
    if (invoked === RPCDirection.MULTICAST && registered === RPCDirection.SERVER_TO_CLIENT) {
      return true;
    }

    return registered === invoked;
  }

  /**
   * Processes queued RPC calls.
   * Call this once per tick to execute queued RPCs.
   *
   * @example
   * ```typescript
   * fixedUpdate(): void {
   *   rpcSystem.processQueue();
   * }
   * ```
   */
  processQueue(): void {
    const calls = [...this.queuedCalls];
    this.queuedCalls.length = 0;

    for (const invocation of calls) {
      const metadata = this.rpcById.get(invocation.rpcId);
      if (metadata) {
        this.executeImmediate(metadata, invocation);
      }
    }
  }

  /**
   * Gets the number of queued RPC calls.
   * @returns Queue size
   */
  getQueueSize(): number {
    return this.queuedCalls.length;
  }

  /**
   * Clears the RPC queue.
   */
  clearQueue(): void {
    this.queuedCalls.length = 0;
  }

  /**
   * Serializes an RPC invocation to binary format.
   *
   * @param invocation - RPC invocation
   * @returns Serialized data
   *
   * @example
   * ```typescript
   * const invocation = rpcSystem.call('PlayerMove', entityId, [x, y, z]);
   * if (invocation) {
   *   const data = rpcSystem.serialize(invocation);
   *   transport.send(new NetworkMessage(MSG_RPC, data));
   * }
   * ```
   */
  serialize(invocation: RPCInvocation): ArrayBuffer {
    // Estimate size
    let size = 4 + 4 + 4 + 1 + 2; // rpcId + targetId + callerId + direction + argCount
    for (const arg of invocation.args) {
      size += this.estimateArgSize(arg);
    }

    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    let offset = 0;

    // Write header
    view.setUint32(offset, invocation.rpcId, true);
    offset += 4;
    view.setUint32(offset, invocation.targetId, true);
    offset += 4;
    view.setUint32(offset, invocation.callerId, true);
    offset += 4;
    view.setUint8(offset, this.directionToCode(invocation.direction));
    offset += 1;
    view.setUint16(offset, invocation.args.length, true);
    offset += 2;

    // Write arguments
    for (const arg of invocation.args) {
      offset += this.writeArg(view, offset, arg);
    }

    return buffer.slice(0, offset);
  }

  /**
   * Deserializes an RPC invocation from binary format.
   *
   * @param buffer - Buffer containing serialized RPC
   * @returns Deserialized invocation
   *
   * @example
   * ```typescript
   * transport.onMessage((message) => {
   *   const invocation = rpcSystem.deserialize(message.data);
   *   rpcSystem.execute(invocation);
   * });
   * ```
   */
  deserialize(buffer: ArrayBuffer): RPCInvocation {
    const view = new DataView(buffer);
    let offset = 0;

    // Read header
    const rpcId = view.getUint32(offset, true);
    offset += 4;
    const targetId = view.getUint32(offset, true);
    offset += 4;
    const callerId = view.getUint32(offset, true);
    offset += 4;
    const directionCode = view.getUint8(offset);
    offset += 1;
    const argCount = view.getUint16(offset, true);
    offset += 2;

    // Read arguments
    const args: any[] = [];
    for (let i = 0; i < argCount; i++) {
      const [arg, bytes] = this.readArg(view, offset);
      args.push(arg);
      offset += bytes;
    }

    return {
      rpcId,
      targetId,
      callerId,
      args,
      direction: this.codeToDirection(directionCode),
    };
  }

  /**
   * Estimates the size of an argument.
   */
  private estimateArgSize(arg: any): number {
    if (arg === null || arg === undefined) return 1;
    if (typeof arg === 'number') return 9;
    if (typeof arg === 'boolean') return 2;
    if (typeof arg === 'string') return 3 + arg.length;
    if (Array.isArray(arg)) return 3 + arg.length * 8;
    return 100;
  }

  /**
   * Writes an argument to a DataView.
   */
  private writeArg(view: DataView, offset: number, arg: any): number {
    const startOffset = offset;

    if (arg === null || arg === undefined) {
      view.setUint8(offset, 0); // Type: null
      return 1;
    }

    if (typeof arg === 'number') {
      view.setUint8(offset, 1); // Type: number
      view.setFloat64(offset + 1, arg, true);
      return 9;
    }

    if (typeof arg === 'boolean') {
      view.setUint8(offset, 2); // Type: boolean
      view.setUint8(offset + 1, arg ? 1 : 0);
      return 2;
    }

    if (typeof arg === 'string') {
      view.setUint8(offset, 3); // Type: string
      const written = BinarySerializer.writeString(view, offset + 1, arg);
      return 1 + written;
    }

    if (Array.isArray(arg)) {
      view.setUint8(offset, 4); // Type: array
      offset += 1;
      view.setUint16(offset, arg.length, true);
      offset += 2;

      for (const item of arg) {
        if (typeof item === 'number') {
          view.setFloat32(offset, item, true);
          offset += 4;
        }
      }

      return offset - startOffset;
    }

    // Unknown type
    view.setUint8(offset, 0);
    return 1;
  }

  /**
   * Reads an argument from a DataView.
   */
  private readArg(view: DataView, offset: number): [any, number] {
    const type = view.getUint8(offset);

    switch (type) {
      case 0: // null
        return [null, 1];

      case 1: // number
        return [view.getFloat64(offset + 1, true), 9];

      case 2: // boolean
        return [view.getUint8(offset + 1) === 1, 2];

      case 3: // string
        {
          const [str, bytes] = BinarySerializer.readString(view, offset + 1);
          return [str, 1 + bytes];
        }

      case 4: // array
        {
          const length = view.getUint16(offset + 1, true);
          let arrayOffset = offset + 3;
          const arr: number[] = [];

          for (let i = 0; i < length; i++) {
            arr.push(view.getFloat32(arrayOffset, true));
            arrayOffset += 4;
          }

          return [arr, arrayOffset - offset];
        }

      default:
        return [null, 1];
    }
  }

  /**
   * Converts direction enum to code.
   */
  private directionToCode(direction: RPCDirection): number {
    switch (direction) {
      case RPCDirection.CLIENT_TO_SERVER:
        return 1;
      case RPCDirection.SERVER_TO_CLIENT:
        return 2;
      case RPCDirection.MULTICAST:
        return 3;
      default:
        return 0;
    }
  }

  /**
   * Converts code to direction enum.
   */
  private codeToDirection(code: number): RPCDirection {
    switch (code) {
      case 1:
        return RPCDirection.CLIENT_TO_SERVER;
      case 2:
        return RPCDirection.SERVER_TO_CLIENT;
      case 3:
        return RPCDirection.MULTICAST;
      default:
        return RPCDirection.CLIENT_TO_SERVER;
    }
  }

  /**
   * Gets all registered RPC names.
   * @returns Array of RPC names
   */
  getRegisteredRPCs(): string[] {
    return Array.from(this.rpcByName.keys());
  }

  /**
   * Checks if an RPC is registered.
   * @param name - RPC name
   * @returns True if registered
   */
  has(name: string): boolean {
    return this.rpcByName.has(name);
  }

  /**
   * Clears all registered RPCs.
   */
  clear(): void {
    this.rpcById.clear();
    this.rpcByName.clear();
    this.queuedCalls.length = 0;
    this.nextId = 1;
  }
}
