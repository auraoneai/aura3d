/**
 * G3D 5.0 Timeline & Cinematics Module - Signal Receiver
 *
 * Listens for signals and triggers callbacks.
 * Supports filtering by signal type and entity binding.
 */

import { SignalAsset } from './SignalAsset';
import { EmissionRecord } from './SignalEmitter';

/**
 * Signal callback function
 */
export type SignalCallback = (signal: SignalAsset, payload: any, time: number) => void;

/**
 * Signal filter function
 */
export type SignalFilter = (signal: SignalAsset, payload: any) => boolean;

/**
 * Receiver configuration
 */
export interface ReceiverConfig {
    /** Entity ID to bind to (optional) */
    entityId?: string;
    /** Whether receiver is active */
    active?: boolean;
    /** Signal filter */
    filter?: SignalFilter;
}

/**
 * Signal listener registration
 */
interface SignalListener {
    /** Signal name or '*' for all signals */
    signalName: string;
    /** Callback function */
    callback: SignalCallback;
    /** Whether this is a one-time listener */
    once: boolean;
    /** Filter function */
    filter?: SignalFilter;
}

/**
 * Signal Receiver
 *
 * Receives and processes signals emitted from timelines.
 * Can filter signals and bind to specific entities.
 */
export class SignalReceiver {
    /** Entity ID this receiver is bound to */
    public entityId: string | null;

    /** Whether receiver is active */
    public active: boolean;

    /** Global signal filter */
    public filter: SignalFilter | null;

    /** Registered listeners */
    private _listeners: SignalListener[];

    /** Received signal history */
    private _receivedSignals: EmissionRecord[];

    /** Max history size */
    private _maxHistorySize: number;

    /** Signal count */
    private _signalCount: number;

    constructor(config: ReceiverConfig = {}) {
        this.entityId = config.entityId || null;
        this.active = config.active ?? true;
        this.filter = config.filter || null;
        this._listeners = [];
        this._receivedSignals = [];
        this._maxHistorySize = 100;
        this._signalCount = 0;
    }

    /**
     * Get signal count
     */
    public get signalCount(): number {
        return this._signalCount;
    }

    /**
     * Get received signals
     */
    public get receivedSignals(): readonly EmissionRecord[] {
        return this._receivedSignals;
    }

    /**
     * Get listener count
     */
    public get listenerCount(): number {
        return this._listeners.length;
    }

    /**
     * Register a signal callback
     *
     * @param signalName - Signal name or '*' for all signals
     * @param callback - Callback function
     * @param options - Additional options
     */
    public on(
        signalName: string,
        callback: SignalCallback,
        options?: {
            filter?: SignalFilter;
            once?: boolean;
        }
    ): void {
        this._listeners.push({
            signalName,
            callback,
            once: options?.once ?? false,
            filter: options?.filter
        });
    }

    /**
     * Register a one-time signal callback
     *
     * @param signalName - Signal name or '*' for all signals
     * @param callback - Callback function
     * @param filter - Optional filter
     */
    public once(signalName: string, callback: SignalCallback, filter?: SignalFilter): void {
        this.on(signalName, callback, { once: true, filter });
    }

    /**
     * Unregister a signal callback
     *
     * @param signalName - Signal name
     * @param callback - Callback function
     */
    public off(signalName: string, callback: SignalCallback): void {
        this._listeners = this._listeners.filter(
            l => !(l.signalName === signalName && l.callback === callback)
        );
    }

    /**
     * Unregister all callbacks for a signal
     *
     * @param signalName - Signal name
     */
    public offAll(signalName: string): void {
        this._listeners = this._listeners.filter(l => l.signalName !== signalName);
    }

    /**
     * Clear all listeners
     */
    public clear(): void {
        this._listeners = [];
    }

    /**
     * Receive and process a signal
     *
     * @param record - Emission record
     */
    public receive(record: EmissionRecord): void {
        if (!this.active) {
            return;
        }

        // Apply global filter
        if (this.filter && !this.filter(record.signal, record.payload)) {
            return;
        }

        // Add to history
        this._receivedSignals.push(record);
        if (this._receivedSignals.length > this._maxHistorySize) {
            this._receivedSignals.shift();
        }
        this._signalCount++;

        // Process listeners
        const listenersToRemove: SignalListener[] = [];

        for (const listener of this._listeners) {
            // Check if signal name matches
            if (listener.signalName !== '*' && listener.signalName !== record.signal.name) {
                continue;
            }

            // Apply listener filter
            if (listener.filter && !listener.filter(record.signal, record.payload)) {
                continue;
            }

            // Call callback
            try {
                listener.callback(record.signal, record.payload, record.time);
            } catch (error) {
                console.error(`Error in signal callback for '${record.signal.name}':`, error);
            }

            // Mark one-time listeners for removal
            if (listener.once) {
                listenersToRemove.push(listener);
            }
        }

        // Remove one-time listeners
        for (const listener of listenersToRemove) {
            const index = this._listeners.indexOf(listener);
            if (index !== -1) {
                this._listeners.splice(index, 1);
            }
        }
    }

    /**
     * Receive multiple signals
     *
     * @param records - Emission records
     */
    public receiveMultiple(records: EmissionRecord[]): void {
        for (const record of records) {
            this.receive(record);
        }
    }

    /**
     * Check if receiver is listening for a signal
     *
     * @param signalName - Signal name
     * @returns True if listening
     */
    public isListening(signalName: string): boolean {
        return this._listeners.some(
            l => l.signalName === signalName || l.signalName === '*'
        );
    }

    /**
     * Get listeners for a signal
     *
     * @param signalName - Signal name
     * @returns Array of listeners
     */
    public getListeners(signalName: string): SignalListener[] {
        return this._listeners.filter(
            l => l.signalName === signalName || l.signalName === '*'
        );
    }

    /**
     * Clear signal history
     */
    public clearHistory(): void {
        this._receivedSignals = [];
        this._signalCount = 0;
    }

    /**
     * Set max history size
     */
    public setMaxHistorySize(size: number): void {
        this._maxHistorySize = Math.max(0, size);
        while (this._receivedSignals.length > this._maxHistorySize) {
            this._receivedSignals.shift();
        }
    }

    /**
     * Get signals received in time range
     *
     * @param startTime - Start time
     * @param endTime - End time
     * @returns Array of emission records
     */
    public getSignalsInRange(startTime: number, endTime: number): EmissionRecord[] {
        return this._receivedSignals.filter(
            r => r.time >= startTime && r.time <= endTime
        );
    }

    /**
     * Get the last received signal
     */
    public getLastSignal(): EmissionRecord | null {
        return this._receivedSignals[this._receivedSignals.length - 1] || null;
    }

    /**
     * Get the last received signal of a specific type
     *
     * @param signalName - Signal name
     * @returns Last emission record or null
     */
    public getLastSignalOfType(signalName: string): EmissionRecord | null {
        for (let i = this._receivedSignals.length - 1; i >= 0; i--) {
            if (this._receivedSignals[i].signal.name === signalName) {
                return this._receivedSignals[i];
            }
        }
        return null;
    }

    /**
     * Reset receiver state
     */
    public reset(): void {
        this.clearHistory();
    }

    /**
     * Dispose receiver
     */
    public dispose(): void {
        this.clear();
        this.clearHistory();
    }
}

/**
 * Signal Receiver Registry
 *
 * Manages multiple signal receivers.
 */
export class SignalReceiverRegistry {
    private static _instance: SignalReceiverRegistry | null = null;
    private _receivers: Map<string, SignalReceiver>;

    private constructor() {
        this._receivers = new Map();
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): SignalReceiverRegistry {
        if (!SignalReceiverRegistry._instance) {
            SignalReceiverRegistry._instance = new SignalReceiverRegistry();
        }
        return SignalReceiverRegistry._instance;
    }

    /**
     * Register a receiver
     *
     * @param id - Receiver ID
     * @param receiver - Signal receiver
     */
    public register(id: string, receiver: SignalReceiver): void {
        this._receivers.set(id, receiver);
    }

    /**
     * Unregister a receiver
     *
     * @param id - Receiver ID
     * @returns True if unregistered
     */
    public unregister(id: string): boolean {
        return this._receivers.delete(id);
    }

    /**
     * Get a receiver by ID
     *
     * @param id - Receiver ID
     * @returns Signal receiver or null
     */
    public get(id: string): SignalReceiver | null {
        return this._receivers.get(id) || null;
    }

    /**
     * Get all receivers
     */
    public getAll(): SignalReceiver[] {
        return Array.from(this._receivers.values());
    }

    /**
     * Get receivers bound to an entity
     *
     * @param entityId - Entity ID
     * @returns Array of receivers
     */
    public getForEntity(entityId: string): SignalReceiver[] {
        return this.getAll().filter(r => r.entityId === entityId);
    }

    /**
     * Broadcast a signal to all active receivers
     *
     * @param record - Emission record
     */
    public broadcast(record: EmissionRecord): void {
        for (const receiver of this._receivers.values()) {
            receiver.receive(record);
        }
    }

    /**
     * Broadcast multiple signals
     *
     * @param records - Emission records
     */
    public broadcastMultiple(records: EmissionRecord[]): void {
        for (const record of records) {
            this.broadcast(record);
        }
    }

    /**
     * Clear all receivers
     */
    public clear(): void {
        for (const receiver of this._receivers.values()) {
            receiver.dispose();
        }
        this._receivers.clear();
    }

    /**
     * Get receiver count
     */
    public get count(): number {
        return this._receivers.size;
    }
}

/**
 * Helper function to create a signal receiver with common setup
 */
export function createSignalReceiver(
    entityId?: string,
    handlers?: Record<string, SignalCallback>
): SignalReceiver {
    const receiver = new SignalReceiver({ entityId });

    if (handlers) {
        for (const [signalName, callback] of Object.entries(handlers)) {
            receiver.on(signalName, callback);
        }
    }

    return receiver;
}
