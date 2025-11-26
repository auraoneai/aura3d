/**
 * Level streaming system for loading/unloading zones
 * @module World
 */

import { Vector3 } from '../math/Vector3';
import { Scene } from './Scene';
import { StreamingVolume, StreamingPriority } from './StreamingVolume';
import { Logger } from '../core/Logger';

/**
 * Level streaming state
 */
export enum StreamingState {
    UNLOADED = 'unloaded',
    LOADING = 'loading',
    LOADED = 'loaded',
    UNLOADING = 'unloading'
}

/**
 * Streamable level
 */
export interface StreamableLevel {
    /** Level identifier */
    id: string;

    /** Level name */
    name: string;

    /** Associated scene */
    scene: Scene;

    /** Current streaming state */
    state: StreamingState;

    /** Loading priority */
    priority: StreamingPriority;

    /** Load progress [0-1] */
    loadProgress: number;

    /** Time when loading started */
    loadStartTime: number;

    /** Associated streaming volume */
    volumeId?: string;
}

/**
 * Level streaming request
 */
interface StreamingRequest {
    /** Level ID */
    levelId: string;

    /** Request priority */
    priority: StreamingPriority;

    /** Request timestamp */
    timestamp: number;

    /** Load or unload */
    load: boolean;
}

/**
 * Level streaming system
 */
export class LevelStreaming {
    /** All streamable levels */
    private levels: Map<string, StreamableLevel>;

    /** Streaming volumes */
    private volumes: Map<string, StreamingVolume>;

    /** Pending streaming requests */
    private requestQueue: StreamingRequest[];

    /** Camera/player position */
    private viewerPosition: Vector3;

    /** Maximum concurrent loading operations */
    private readonly maxConcurrentLoads: number = 3;

    /** Currently loading levels */
    private currentlyLoading: Set<string>;

    /** Logger instance */
    private logger: Logger;

    /** Time accumulator */
    private timeAccumulator: number;

    /** Automatic streaming enabled */
    private autoStreaming: boolean;

    /** Load callback */
    private onLoadCallback?: (levelId: string) => Promise<void>;

    /** Unload callback */
    private onUnloadCallback?: (levelId: string) => Promise<void>;

    /**
     * Creates a new level streaming system
     */
    constructor() {
        this.levels = new Map();
        this.volumes = new Map();
        this.requestQueue = [];
        this.viewerPosition = new Vector3(0, 0, 0);
        this.currentlyLoading = new Set();
        this.logger = Logger.get('LevelStreaming');
        this.timeAccumulator = 0;
        this.autoStreaming = true;

        this.logger.info('Level streaming system initialized');
    }

    /**
     * Registers a streamable level
     * @param level - Streamable level
     */
    public registerLevel(level: StreamableLevel): void {
        this.levels.set(level.id, level);
        this.logger.info(`Registered level: ${level.name}`, { id: level.id });
    }

    /**
     * Unregisters a streamable level
     * @param levelId - Level ID
     */
    public unregisterLevel(levelId: string): void {
        const level = this.levels.get(levelId);
        if (level && level.state !== StreamingState.UNLOADED) {
            this.requestUnload(levelId);
        }
        this.levels.delete(levelId);
    }

    /**
     * Registers a streaming volume
     * @param volume - Streaming volume
     */
    public registerVolume(volume: StreamingVolume): void {
        this.volumes.set(volume.id, volume);
        this.logger.info(`Registered volume: ${volume.name}`, { id: volume.id });
    }

    /**
     * Unregisters a streaming volume
     * @param volumeId - Volume ID
     */
    public unregisterVolume(volumeId: string): void {
        this.volumes.delete(volumeId);
    }

    /**
     * Sets viewer position for streaming decisions
     * @param position - Viewer position
     */
    public setViewerPosition(position: Vector3): void {
        this.viewerPosition = position.clone();
    }

    /**
     * Requests a level to be loaded
     * @param levelId - Level ID
     * @param priority - Loading priority
     */
    public requestLoad(levelId: string, priority: StreamingPriority = StreamingPriority.NORMAL): void {
        const level = this.levels.get(levelId);
        if (!level) {
            this.logger.warn(`Level not found: ${levelId}`);
            return;
        }

        if (level.state === StreamingState.LOADED || level.state === StreamingState.LOADING) {
            return;
        }

        this.requestQueue.push({
            levelId,
            priority,
            timestamp: this.timeAccumulator,
            load: true
        });

        this.sortRequestQueue();
    }

    /**
     * Requests a level to be unloaded
     * @param levelId - Level ID
     */
    public requestUnload(levelId: string): void {
        const level = this.levels.get(levelId);
        if (!level) {
            return;
        }

        if (level.state === StreamingState.UNLOADED || level.state === StreamingState.UNLOADING) {
            return;
        }

        this.requestQueue.push({
            levelId,
            priority: StreamingPriority.NORMAL,
            timestamp: this.timeAccumulator,
            load: false
        });
    }

    /**
     * Sorts request queue by priority and timestamp
     */
    private sortRequestQueue(): void {
        this.requestQueue.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return a.timestamp - b.timestamp;
        });
    }

    /**
     * Updates the streaming system
     * @param deltaTime - Time elapsed in seconds
     */
    public update(deltaTime: number): void {
        this.timeAccumulator += deltaTime;

        if (this.autoStreaming) {
            this.updateAutoStreaming();
        }

        this.processRequestQueue();
        this.updateLoadingLevels(deltaTime);
    }

    /**
     * Updates automatic streaming based on volumes
     */
    private updateAutoStreaming(): void {
        for (const volume of this.volumes.values()) {
            if (!volume.enabled) {
                continue;
            }

            const distance = volume.getDistanceToPoint(this.viewerPosition);

            for (const levelId of volume.levelIds) {
                const level = this.levels.get(levelId);
                if (!level) {
                    continue;
                }

                if (volume.shouldLoad(distance)) {
                    if (level.state === StreamingState.UNLOADED) {
                        this.requestLoad(levelId, volume.priority);
                    }
                } else if (volume.shouldUnload(distance)) {
                    if (level.state === StreamingState.LOADED) {
                        this.requestUnload(levelId);
                    }
                }
            }
        }
    }

    /**
     * Processes the request queue
     */
    private processRequestQueue(): void {
        while (
            this.requestQueue.length > 0 &&
            this.currentlyLoading.size < this.maxConcurrentLoads
        ) {
            const request = this.requestQueue.shift()!;
            const level = this.levels.get(request.levelId);

            if (!level) {
                continue;
            }

            if (request.load) {
                if (level.state === StreamingState.UNLOADED) {
                    this.startLoading(level);
                }
            } else {
                if (level.state === StreamingState.LOADED) {
                    this.startUnloading(level);
                }
            }
        }
    }

    /**
     * Starts loading a level
     * @param level - Level to load
     */
    private async startLoading(level: StreamableLevel): Promise<void> {
        level.state = StreamingState.LOADING;
        level.loadStartTime = this.timeAccumulator;
        level.loadProgress = 0;
        this.currentlyLoading.add(level.id);

        this.logger.info(`Loading level: ${level.name}`, { id: level.id });

        try {
            if (this.onLoadCallback) {
                await this.onLoadCallback(level.id);
            }

            level.state = StreamingState.LOADED;
            level.loadProgress = 1;
            level.scene.setLoaded(true);

            this.logger.info(`Level loaded: ${level.name}`, { id: level.id });
        } catch (error) {
            this.logger.error(`Failed to load level: ${level.name}`, error);
            level.state = StreamingState.UNLOADED;
        } finally {
            this.currentlyLoading.delete(level.id);
        }
    }

    /**
     * Starts unloading a level
     * @param level - Level to unload
     */
    private async startUnloading(level: StreamableLevel): Promise<void> {
        level.state = StreamingState.UNLOADING;

        this.logger.info(`Unloading level: ${level.name}`, { id: level.id });

        try {
            if (this.onUnloadCallback) {
                await this.onUnloadCallback(level.id);
            }

            level.state = StreamingState.UNLOADED;
            level.loadProgress = 0;
            level.scene.setLoaded(false);

            this.logger.info(`Level unloaded: ${level.name}`, { id: level.id });
        } catch (error) {
            this.logger.error(`Failed to unload level: ${level.name}`, error);
            level.state = StreamingState.LOADED;
        }
    }

    /**
     * Updates loading progress simulation
     * @param deltaTime - Time elapsed in seconds
     */
    private updateLoadingLevels(deltaTime: number): void {
        for (const level of this.levels.values()) {
            if (level.state === StreamingState.LOADING) {
                const elapsed = this.timeAccumulator - level.loadStartTime;
                const estimatedTime = 2.0;
                level.loadProgress = Math.min(0.99, elapsed / estimatedTime);
            }
        }
    }

    /**
     * Sets load callback
     * @param callback - Load callback function
     */
    public setLoadCallback(callback: (levelId: string) => Promise<void>): void {
        this.onLoadCallback = callback;
    }

    /**
     * Sets unload callback
     * @param callback - Unload callback function
     */
    public setUnloadCallback(callback: (levelId: string) => Promise<void>): void {
        this.onUnloadCallback = callback;
    }

    /**
     * Gets a level by ID
     * @param levelId - Level ID
     */
    public getLevel(levelId: string): StreamableLevel | undefined {
        return this.levels.get(levelId);
    }

    /**
     * Gets all loaded levels
     */
    public getLoadedLevels(): StreamableLevel[] {
        return Array.from(this.levels.values())
            .filter(level => level.state === StreamingState.LOADED);
    }

    /**
     * Gets all loading levels
     */
    public getLoadingLevels(): StreamableLevel[] {
        return Array.from(this.levels.values())
            .filter(level => level.state === StreamingState.LOADING);
    }

    /**
     * Gets streaming statistics
     */
    public getStatistics(): {
        totalLevels: number;
        loadedLevels: number;
        loadingLevels: number;
        unloadedLevels: number;
        pendingRequests: number;
    } {
        const levels = Array.from(this.levels.values());

        return {
            totalLevels: levels.length,
            loadedLevels: levels.filter(l => l.state === StreamingState.LOADED).length,
            loadingLevels: levels.filter(l => l.state === StreamingState.LOADING).length,
            unloadedLevels: levels.filter(l => l.state === StreamingState.UNLOADED).length,
            pendingRequests: this.requestQueue.length
        };
    }

    /**
     * Enables or disables automatic streaming
     * @param enabled - Auto streaming enabled
     */
    public setAutoStreaming(enabled: boolean): void {
        this.autoStreaming = enabled;
    }

    /**
     * Unloads all levels
     */
    public unloadAll(): void {
        for (const level of this.levels.values()) {
            if (level.state === StreamingState.LOADED) {
                this.requestUnload(level.id);
            }
        }
    }
}
