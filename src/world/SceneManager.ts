/**
 * Scene management and transitions
 * @module World
 */

import { Scene } from './Scene';
import { Logger } from '../core/Logger';

/**
 * Scene transition type
 */
export enum SceneTransitionType {
    IMMEDIATE = 'immediate',
    FADE = 'fade',
    CROSSFADE = 'crossfade'
}

/**
 * Scene transition state
 */
interface SceneTransition {
    /** Source scene ID */
    fromSceneId: string | null;

    /** Target scene ID */
    toSceneId: string;

    /** Transition type */
    type: SceneTransitionType;

    /** Transition duration */
    duration: number;

    /** Elapsed time */
    elapsed: number;

    /** Transition progress [0-1] */
    progress: number;
}

/**
 * Scene manager for managing and transitioning between scenes
 */
export class SceneManager {
    /** All registered scenes */
    private scenes: Map<string, Scene>;

    /** Currently active scene */
    private activeScene: Scene | null;

    /** Active transition */
    private activeTransition: SceneTransition | null;

    /** Logger instance */
    private logger: Logger;

    /** Scene load callback */
    private onSceneLoadCallback?: (sceneId: string) => Promise<void>;

    /** Scene unload callback */
    private onSceneUnloadCallback?: (sceneId: string) => Promise<void>;

    /** Transition start callback */
    private onTransitionStartCallback?: (fromSceneId: string | null, toSceneId: string) => void;

    /** Transition end callback */
    private onTransitionEndCallback?: (sceneId: string) => void;

    /**
     * Creates a new scene manager
     */
    constructor() {
        this.scenes = new Map();
        this.activeScene = null;
        this.activeTransition = null;
        this.logger = Logger.get('SceneManager');

        this.logger.info('Scene manager initialized');
    }

    /**
     * Registers a scene
     * @param scene - Scene to register
     */
    public registerScene(scene: Scene): void {
        this.scenes.set(scene.id, scene);
        this.logger.info(`Registered scene: ${scene.name}`, { id: scene.id });
    }

    /**
     * Unregisters a scene
     * @param sceneId - Scene ID
     */
    public unregisterScene(sceneId: string): void {
        const scene = this.scenes.get(sceneId);
        if (scene === this.activeScene) {
            this.logger.warn(`Cannot unregister active scene: ${sceneId}`);
            return;
        }

        this.scenes.delete(sceneId);
        this.logger.info(`Unregistered scene: ${sceneId}`);
    }

    /**
     * Loads and activates a scene
     * @param sceneId - Scene ID to load
     * @param transitionType - Transition type
     * @param transitionDuration - Transition duration in seconds
     */
    public async loadScene(
        sceneId: string,
        transitionType: SceneTransitionType = SceneTransitionType.IMMEDIATE,
        transitionDuration: number = 1.0
    ): Promise<void> {
        const scene = this.scenes.get(sceneId);
        if (!scene) {
            this.logger.error(`Scene not found: ${sceneId}`);
            throw new Error(`Scene not found: ${sceneId}`);
        }

        if (this.activeTransition) {
            this.logger.warn('Transition already in progress');
            return;
        }

        const fromSceneId = this.activeScene?.id || null;

        this.activeTransition = {
            fromSceneId,
            toSceneId: sceneId,
            type: transitionType,
            duration: transitionType === SceneTransitionType.IMMEDIATE ? 0 : transitionDuration,
            elapsed: 0,
            progress: 0
        };

        if (this.onTransitionStartCallback) {
            this.onTransitionStartCallback(fromSceneId, sceneId);
        }

        this.logger.info(`Loading scene: ${scene.name}`, {
            id: sceneId,
            transition: transitionType
        });

        try {
            // Load new scene
            if (!scene.isLoaded()) {
                if (this.onSceneLoadCallback) {
                    await this.onSceneLoadCallback(sceneId);
                }
                scene.setLoaded(true);
            }

            // Handle immediate transition
            if (transitionType === SceneTransitionType.IMMEDIATE) {
                await this.completeTransition();
            }
        } catch (error) {
            this.logger.error(`Failed to load scene: ${scene.name}`, error);
            this.activeTransition = null;
            throw error;
        }
    }

    /**
     * Updates scene transitions
     * @param deltaTime - Time elapsed in seconds
     */
    public update(deltaTime: number): void {
        if (!this.activeTransition) {
            return;
        }

        this.activeTransition.elapsed += deltaTime;
        this.activeTransition.progress = Math.min(
            1,
            this.activeTransition.elapsed / this.activeTransition.duration
        );

        if (this.activeTransition.progress >= 1) {
            this.completeTransition();
        }
    }

    /**
     * Completes the active transition
     */
    private async completeTransition(): Promise<void> {
        if (!this.activeTransition) {
            return;
        }

        const { fromSceneId, toSceneId } = this.activeTransition;
        const newScene = this.scenes.get(toSceneId);

        if (!newScene) {
            this.activeTransition = null;
            return;
        }

        // Unload old scene if needed
        if (fromSceneId && this.activeScene) {
            try {
                if (this.onSceneUnloadCallback) {
                    await this.onSceneUnloadCallback(fromSceneId);
                }
                this.activeScene.setLoaded(false);
            } catch (error) {
                this.logger.error(`Failed to unload scene: ${fromSceneId}`, error);
            }
        }

        this.activeScene = newScene;
        this.activeTransition = null;

        if (this.onTransitionEndCallback) {
            this.onTransitionEndCallback(toSceneId);
        }

        this.logger.info(`Scene transition complete: ${newScene.name}`, {
            id: toSceneId
        });
    }

    /**
     * Gets the currently active scene
     */
    public getActiveScene(): Scene | null {
        return this.activeScene;
    }

    /**
     * Gets a scene by ID
     * @param sceneId - Scene ID
     */
    public getScene(sceneId: string): Scene | undefined {
        return this.scenes.get(sceneId);
    }

    /**
     * Gets all registered scenes
     */
    public getAllScenes(): Scene[] {
        return Array.from(this.scenes.values());
    }

    /**
     * Checks if a scene is loaded
     * @param sceneId - Scene ID
     */
    public isSceneLoaded(sceneId: string): boolean {
        const scene = this.scenes.get(sceneId);
        return scene?.isLoaded() ?? false;
    }

    /**
     * Checks if a transition is active
     */
    public isTransitioning(): boolean {
        return this.activeTransition !== null;
    }

    /**
     * Gets transition progress [0-1]
     */
    public getTransitionProgress(): number {
        return this.activeTransition?.progress ?? 0;
    }

    /**
     * Gets active transition type
     */
    public getTransitionType(): SceneTransitionType | null {
        return this.activeTransition?.type ?? null;
    }

    /**
     * Sets scene load callback
     * @param callback - Load callback
     */
    public setLoadCallback(callback: (sceneId: string) => Promise<void>): void {
        this.onSceneLoadCallback = callback;
    }

    /**
     * Sets scene unload callback
     * @param callback - Unload callback
     */
    public setUnloadCallback(callback: (sceneId: string) => Promise<void>): void {
        this.onSceneUnloadCallback = callback;
    }

    /**
     * Sets transition start callback
     * @param callback - Transition start callback
     */
    public setTransitionStartCallback(
        callback: (fromSceneId: string | null, toSceneId: string) => void
    ): void {
        this.onTransitionStartCallback = callback;
    }

    /**
     * Sets transition end callback
     * @param callback - Transition end callback
     */
    public setTransitionEndCallback(callback: (sceneId: string) => void): void {
        this.onTransitionEndCallback = callback;
    }

    /**
     * Unloads the active scene
     */
    public async unloadActiveScene(): Promise<void> {
        if (!this.activeScene) {
            return;
        }

        const sceneId = this.activeScene.id;

        this.logger.info(`Unloading active scene: ${this.activeScene.name}`, {
            id: sceneId
        });

        try {
            if (this.onSceneUnloadCallback) {
                await this.onSceneUnloadCallback(sceneId);
            }

            this.activeScene.setLoaded(false);
            this.activeScene = null;

            this.logger.info('Active scene unloaded');
        } catch (error) {
            this.logger.error('Failed to unload active scene', error);
            throw error;
        }
    }

    /**
     * Creates a new scene
     * @param id - Scene ID
     * @param name - Scene name
     * @returns Created scene
     */
    public createScene(id: string, name: string): Scene {
        if (this.scenes.has(id)) {
            throw new Error(`Scene already exists: ${id}`);
        }

        const scene = new Scene(id, name);
        this.registerScene(scene);

        return scene;
    }

    /**
     * Gets scene manager statistics
     */
    public getStatistics(): {
        totalScenes: number;
        loadedScenes: number;
        activeSceneId: string | null;
        isTransitioning: boolean;
    } {
        const scenes = Array.from(this.scenes.values());

        return {
            totalScenes: scenes.length,
            loadedScenes: scenes.filter(s => s.isLoaded()).length,
            activeSceneId: this.activeScene?.id ?? null,
            isTransitioning: this.activeTransition !== null
        };
    }
}
