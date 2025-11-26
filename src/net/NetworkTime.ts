/**
 * @fileoverview Network time synchronization system.
 * Provides accurate time synchronization across network with RTT measurement,
 * clock offset calculation, and jitter buffering.
 * @module net/NetworkTime
 */

import { Logger } from '../core/Logger';

const logger = Logger.create('NetworkTime');

/**
 * Time sync sample containing RTT and offset measurements.
 */
interface TimeSyncSample {
  /** Round-trip time in milliseconds */
  rtt: number;
  /** Clock offset from server in milliseconds */
  offset: number;
  /** Timestamp when sample was taken */
  timestamp: number;
}

/**
 * Network time synchronization system.
 * Maintains synchronized time across client and server using NTP-like algorithm.
 *
 * @example
 * ```typescript
 * const timeSync = new NetworkTime();
 *
 * // On receiving time sync response
 * const serverTime = response.serverTime;
 * const clientSendTime = response.clientSendTime;
 * const clientReceiveTime = Date.now();
 *
 * timeSync.addSample(serverTime, clientSendTime, clientReceiveTime);
 *
 * // Get synchronized time
 * const networkTime = timeSync.getNetworkTime();
 * console.log(`Network time: ${networkTime}`);
 *
 * // Get RTT
 * const rtt = timeSync.getRTT();
 * console.log(`Round-trip time: ${rtt}ms`);
 * ```
 */
export class NetworkTime {
  /** History of time sync samples */
  private samples: TimeSyncSample[] = [];

  /** Maximum number of samples to keep */
  private readonly maxSamples: number;

  /** Current clock offset from server (ms) */
  private clockOffset: number = 0;

  /** Current round-trip time (ms) */
  private rtt: number = 0;

  /** Minimum RTT observed (for best offset selection) */
  private minRTT: number = Infinity;

  /** Last sync time */
  private lastSyncTime: number = 0;

  /** Sync interval in milliseconds */
  private readonly syncInterval: number;

  /** Network tick rate (ticks per second) */
  private readonly tickRate: number;

  /** Current tick number */
  private currentTick: number = 0;

  /** Time accumulator for tick updates */
  private tickAccumulator: number = 0;

  /**
   * Creates a new NetworkTime instance.
   *
   * @param maxSamples - Maximum number of samples to keep (default: 10)
   * @param syncInterval - Time between sync requests in ms (default: 5000)
   * @param tickRate - Network tick rate in Hz (default: 60)
   *
   * @example
   * ```typescript
   * const timeSync = new NetworkTime(20, 3000, 30);
   * ```
   */
  constructor(
    maxSamples: number = 10,
    syncInterval: number = 5000,
    tickRate: number = 60
  ) {
    this.maxSamples = maxSamples;
    this.syncInterval = syncInterval;
    this.tickRate = tickRate;
  }

  /**
   * Adds a time synchronization sample.
   * Uses the NTP algorithm to calculate RTT and clock offset.
   *
   * @param serverTime - Server timestamp when it sent the response
   * @param clientSendTime - Client timestamp when request was sent
   * @param clientReceiveTime - Client timestamp when response was received
   *
   * @example
   * ```typescript
   * // Client sends sync request at t0
   * const t0 = Date.now();
   * sendSyncRequest(t0);
   *
   * // Client receives sync response
   * onSyncResponse((response) => {
   *   const t3 = Date.now();
   *   timeSync.addSample(response.serverTime, t0, t3);
   * });
   * ```
   */
  addSample(serverTime: number, clientSendTime: number, clientReceiveTime: number): void {
    // Calculate RTT (round-trip time)
    const rtt = clientReceiveTime - clientSendTime;

    // Calculate clock offset using NTP algorithm
    // offset = ((t1 - t0) + (t2 - t3)) / 2
    // where t0 = clientSendTime, t1 = serverTime, t2 = serverTime, t3 = clientReceiveTime
    // Simplified: offset = ((serverTime - clientSendTime) + (serverTime - clientReceiveTime)) / 2
    const offset = ((serverTime - clientSendTime) + (serverTime - clientReceiveTime)) / 2;

    const sample: TimeSyncSample = {
      rtt,
      offset,
      timestamp: clientReceiveTime,
    };

    // Add sample to history
    this.samples.push(sample);

    // Remove old samples
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    // Update current values
    this.updateFromSamples();

    this.lastSyncTime = clientReceiveTime;

    logger.debug(`Time sync sample added`, {
      rtt,
      offset,
      clockOffset: this.clockOffset,
    });
  }

  /**
   * Updates clock offset and RTT from samples.
   * Uses the sample with minimum RTT for best accuracy.
   */
  private updateFromSamples(): void {
    if (this.samples.length === 0) {
      return;
    }

    // Calculate average RTT
    const avgRTT = this.samples.reduce((sum, s) => sum + s.rtt, 0) / this.samples.length;
    this.rtt = avgRTT;

    // Find minimum RTT sample (most accurate)
    let minRTTSample = this.samples[0];
    for (const sample of this.samples) {
      if (sample.rtt < minRTTSample.rtt) {
        minRTTSample = sample;
      }
    }

    this.minRTT = minRTTSample.rtt;

    // Use offset from minimum RTT sample
    // Apply smoothing to avoid sudden jumps
    const targetOffset = minRTTSample.offset;
    const alpha = 0.3; // Smoothing factor
    this.clockOffset = this.clockOffset * (1 - alpha) + targetOffset * alpha;
  }

  /**
   * Gets the current network-synchronized time.
   * @returns Network time in milliseconds
   */
  getNetworkTime(): number {
    return Date.now() + this.clockOffset;
  }

  /**
   * Gets the current clock offset.
   * @returns Clock offset in milliseconds
   */
  getClockOffset(): number {
    return this.clockOffset;
  }

  /**
   * Gets the current round-trip time.
   * @returns RTT in milliseconds
   */
  getRTT(): number {
    return this.rtt;
  }

  /**
   * Gets the minimum RTT observed.
   * @returns Minimum RTT in milliseconds
   */
  getMinRTT(): number {
    return this.minRTT;
  }

  /**
   * Checks if time synchronization is needed.
   * @returns True if sync is needed
   */
  needsSync(): boolean {
    const now = Date.now();
    return now - this.lastSyncTime > this.syncInterval;
  }

  /**
   * Gets the time until next sync is needed.
   * @returns Time in milliseconds, or 0 if sync is needed now
   */
  getTimeUntilNextSync(): number {
    const now = Date.now();
    const elapsed = now - this.lastSyncTime;
    const remaining = this.syncInterval - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * Updates the tick system.
   * Call this every frame with delta time.
   *
   * @param deltaTime - Time since last update in seconds
   * @returns Number of ticks that occurred this frame
   *
   * @example
   * ```typescript
   * update(deltaTime: number): void {
   *   const ticks = timeSync.updateTicks(deltaTime);
   *   for (let i = 0; i < ticks; i++) {
   *     // Process one tick of network updates
   *     this.processNetworkTick();
   *   }
   * }
   * ```
   */
  updateTicks(deltaTime: number): number {
    const tickDelta = 1 / this.tickRate;
    this.tickAccumulator += deltaTime;

    let ticksThisFrame = 0;
    while (this.tickAccumulator >= tickDelta) {
      this.tickAccumulator -= tickDelta;
      this.currentTick++;
      ticksThisFrame++;
    }

    return ticksThisFrame;
  }

  /**
   * Gets the current tick number.
   * @returns Current tick
   */
  getCurrentTick(): number {
    return this.currentTick;
  }

  /**
   * Gets the tick rate.
   * @returns Ticks per second
   */
  getTickRate(): number {
    return this.tickRate;
  }

  /**
   * Gets the tick delta time.
   * @returns Time per tick in seconds
   */
  getTickDelta(): number {
    return 1 / this.tickRate;
  }

  /**
   * Converts a tick number to network time.
   * @param tick - Tick number
   * @returns Network time in milliseconds
   */
  tickToTime(tick: number): number {
    return tick * (1000 / this.tickRate);
  }

  /**
   * Converts network time to a tick number.
   * @param time - Network time in milliseconds
   * @returns Tick number
   */
  timeToTick(time: number): number {
    return Math.floor(time / (1000 / this.tickRate));
  }

  /**
   * Resets all time sync data.
   */
  reset(): void {
    this.samples.length = 0;
    this.clockOffset = 0;
    this.rtt = 0;
    this.minRTT = Infinity;
    this.lastSyncTime = 0;
    this.currentTick = 0;
    this.tickAccumulator = 0;
  }
}

/**
 * Jitter buffer for smoothing network time variations.
 * Stores timestamped packets and releases them at the appropriate time.
 *
 * @example
 * ```typescript
 * const jitterBuffer = new JitterBuffer(100, 3);
 *
 * // Add packets as they arrive
 * jitterBuffer.add({ data: packet1, timestamp: 1000 });
 * jitterBuffer.add({ data: packet2, timestamp: 1016 });
 *
 * // Process packets at the right time
 * update(networkTime: number): void {
 *   const packets = jitterBuffer.getReadyPackets(networkTime);
 *   for (const packet of packets) {
 *     processPacket(packet);
 *   }
 * }
 * ```
 */
export class JitterBuffer<T> {
  /** Buffered packets */
  private buffer: Array<{ data: T; timestamp: number }> = [];

  /** Target buffer size in milliseconds */
  private readonly targetDelay: number;

  /** Maximum buffer size */
  private readonly maxSize: number;

  /** Statistics */
  private stats = {
    packetsAdded: 0,
    packetsDropped: 0,
    packetsPlayed: 0,
  };

  /**
   * Creates a new jitter buffer.
   *
   * @param targetDelay - Target delay in milliseconds (default: 100)
   * @param maxSize - Maximum number of packets to buffer (default: 30)
   *
   * @example
   * ```typescript
   * const buffer = new JitterBuffer<GameStatePacket>(150, 50);
   * ```
   */
  constructor(targetDelay: number = 100, maxSize: number = 30) {
    this.targetDelay = targetDelay;
    this.maxSize = maxSize;
  }

  /**
   * Adds a packet to the buffer.
   *
   * @param data - Packet data
   * @param timestamp - Packet timestamp
   * @returns True if added, false if dropped
   *
   * @example
   * ```typescript
   * const added = buffer.add(stateUpdate, networkTime);
   * if (!added) {
   *   console.warn('Packet dropped - buffer full');
   * }
   * ```
   */
  add(data: T, timestamp: number): boolean {
    // Drop if buffer is full
    if (this.buffer.length >= this.maxSize) {
      this.stats.packetsDropped++;
      return false;
    }

    // Insert in timestamp order
    const packet = { data, timestamp };
    let insertIndex = this.buffer.length;

    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (timestamp >= this.buffer[i].timestamp) {
        break;
      }
      insertIndex = i;
    }

    this.buffer.splice(insertIndex, 0, packet);
    this.stats.packetsAdded++;
    return true;
  }

  /**
   * Gets packets that are ready to be played.
   * Packets are ready when current time exceeds their timestamp + target delay.
   *
   * @param currentTime - Current network time
   * @returns Array of ready packets
   *
   * @example
   * ```typescript
   * const packets = buffer.getReadyPackets(networkTime.getNetworkTime());
   * for (const packet of packets) {
   *   applyStateUpdate(packet);
   * }
   * ```
   */
  getReadyPackets(currentTime: number): T[] {
    const playTime = currentTime - this.targetDelay;
    const ready: T[] = [];

    while (this.buffer.length > 0 && this.buffer[0].timestamp <= playTime) {
      const packet = this.buffer.shift()!;
      ready.push(packet.data);
      this.stats.packetsPlayed++;
    }

    return ready;
  }

  /**
   * Peeks at the next packet without removing it.
   * @returns Next packet or undefined
   */
  peek(): { data: T; timestamp: number } | undefined {
    return this.buffer[0];
  }

  /**
   * Gets the current buffer size.
   * @returns Number of buffered packets
   */
  get size(): number {
    return this.buffer.length;
  }

  /**
   * Gets the current buffer delay in milliseconds.
   * @param currentTime - Current network time
   * @returns Buffer delay in milliseconds
   */
  getCurrentDelay(currentTime: number): number {
    if (this.buffer.length === 0) {
      return 0;
    }
    return currentTime - this.buffer[0].timestamp;
  }

  /**
   * Gets buffer statistics.
   * @returns Buffer statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Clears all buffered packets.
   */
  clear(): void {
    this.buffer.length = 0;
  }

  /**
   * Resets statistics.
   */
  resetStats(): void {
    this.stats.packetsAdded = 0;
    this.stats.packetsDropped = 0;
    this.stats.packetsPlayed = 0;
  }
}
