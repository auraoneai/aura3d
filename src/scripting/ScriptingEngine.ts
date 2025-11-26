/**
 * ScriptingEngine.ts - Visual Scripting Engine
 *
 * Main scripting runtime that manages graph execution.
 * Supports hot reload, event dispatch, debugging, and performance profiling.
 */

import { Graph } from './Graph';
import { Node } from './Node';
import { GraphExecutor, ExecutionResult } from './execution/GraphExecutor';
import { ExecutionContext, EntityRef } from './execution/ExecutionContext';
import { ScriptCompiler, CompiledGraph, CompilationOptions } from './compiler/ScriptCompiler';

/**
 * Graph instance
 */
interface GraphInstance {
    graph: Graph;
    executor: GraphExecutor;
    entity: EntityRef | null;
    compiled?: CompiledGraph;
    enabled: boolean;
}

/**
 * Engine configuration
 */
export interface EngineConfig {
    enableProfiling?: boolean;
    enableDebugMode?: boolean;
    maxExecutionTime?: number;
    maxNodesPerFrame?: number;
    autoCompile?: boolean;
}

/**
 * Event handler
 */
type EventHandler = (data?: any) => void;

/**
 * Scripting engine class
 */
export class ScriptingEngine {
    private _graphs: Map<string, GraphInstance>;
    private _globalVariables: Map<string, any>;
    private _compiler: ScriptCompiler;
    private _config: EngineConfig;
    private _events: Map<string, Set<EventHandler>>;
    private _isRunning: boolean;
    private _totalExecutionTime: number;
    private _frameCount: number;

    /**
     * Create scripting engine
     */
    constructor(config: EngineConfig = {}) {
        this._graphs = new Map();
        this._globalVariables = new Map();
        this._compiler = new ScriptCompiler();
        this._config = {
            enableProfiling: config.enableProfiling ?? false,
            enableDebugMode: config.enableDebugMode ?? false,
            maxExecutionTime: config.maxExecutionTime ?? 100,
            maxNodesPerFrame: config.maxNodesPerFrame ?? 1000,
            autoCompile: config.autoCompile ?? true
        };
        this._events = new Map();
        this._isRunning = false;
        this._totalExecutionTime = 0;
        this._frameCount = 0;
    }

    /**
     * Add graph to engine
     */
    public addGraph(entity: EntityRef | null, graph: Graph, id?: string): string {
        const graphId = id || graph.id;

        // Compile graph if auto-compile is enabled
        let compiled: CompiledGraph | undefined;
        if (this._config.autoCompile) {
            const result = this._compiler.compile(graph, {
                optimize: true,
                typeCheck: true,
                strictMode: false
            });

            if (result.success && result.compiled) {
                compiled = result.compiled;
            } else {
                console.warn(`Graph compilation warnings:`, result.warnings);
            }
        }

        // Create executor
        const executor = new GraphExecutor(
            compiled?.graph || graph,
            entity,
            {
                enableProfiling: this._config.enableProfiling,
                maxExecutionTime: this._config.maxExecutionTime,
                maxNodesPerFrame: this._config.maxNodesPerFrame,
                debugMode: this._config.enableDebugMode
            }
        );

        // Store instance
        this._graphs.set(graphId, {
            graph,
            executor,
            entity,
            compiled,
            enabled: true
        });

        return graphId;
    }

    /**
     * Remove graph from engine
     */
    public removeGraph(graphId: string): boolean {
        return this._graphs.delete(graphId);
    }

    /**
     * Get graph instance
     */
    public getGraph(graphId: string): Graph | undefined {
        return this._graphs.get(graphId)?.graph;
    }

    /**
     * Enable/disable graph
     */
    public setGraphEnabled(graphId: string, enabled: boolean): void {
        const instance = this._graphs.get(graphId);
        if (instance) {
            instance.enabled = enabled;
        }
    }

    /**
     * Update all graphs (called every frame)
     */
    public async update(deltaTime: number = 0.016): Promise<void> {
        if (!this._isRunning) {
            this._isRunning = true;
        }

        this._frameCount++;
        const frameStartTime = performance.now();

        for (const [graphId, instance] of this._graphs) {
            if (!instance.enabled) {
                continue;
            }

            try {
                // Update global variables in executor context
                (instance.executor.context as any)._globalVariables = this._globalVariables;

                // Execute graph
                const result = await instance.executor.execute(deltaTime);

                if (!result.success) {
                    console.error(`Graph ${graphId} execution failed:`, result.error);
                }

                this._totalExecutionTime += result.executionTime;

            } catch (error) {
                console.error(`Graph ${graphId} execution error:`, error);
            }
        }

        const frameTime = performance.now() - frameStartTime;

        // Warn if frame time is too high
        if (frameTime > 16.67) { // 60 FPS threshold
            console.warn(`Scripting engine frame time: ${frameTime.toFixed(2)}ms (target: 16.67ms)`);
        }
    }

    /**
     * Fixed update for physics-rate updates
     */
    public async fixedUpdate(fixedDeltaTime: number = 0.02): Promise<void> {
        // Similar to update but for fixed timestep
        await this.update(fixedDeltaTime);
    }

    /**
     * Dispatch custom event
     */
    public dispatchEvent(eventName: string, data?: any): void {
        // Store event data in context
        for (const instance of this._graphs.values()) {
            instance.executor.context.setLocal(`event_${eventName}_data`, data);
        }

        // Call event handlers
        const handlers = this._events.get(eventName);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Event handler error for ${eventName}:`, error);
                }
            }
        }
    }

    /**
     * Subscribe to event
     */
    public on(eventName: string, handler: EventHandler): void {
        if (!this._events.has(eventName)) {
            this._events.set(eventName, new Set());
        }
        this._events.get(eventName)!.add(handler);
    }

    /**
     * Unsubscribe from event
     */
    public off(eventName: string, handler: EventHandler): void {
        const handlers = this._events.get(eventName);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    /**
     * Get global variable
     */
    public getGlobalVariable(name: string): any {
        return this._globalVariables.get(name);
    }

    /**
     * Set global variable
     */
    public setGlobalVariable(name: string, value: any): void {
        this._globalVariables.set(name, value);
    }

    /**
     * Get all global variables
     */
    public get globalVariables(): ReadonlyMap<string, any> {
        return this._globalVariables;
    }

    /**
     * Hot reload graph
     */
    public hotReload(graphId: string, newGraph: Graph): boolean {
        const instance = this._graphs.get(graphId);
        if (!instance) {
            return false;
        }

        // Recompile
        const result = this._compiler.hotReload(newGraph, {
            optimize: true,
            typeCheck: true
        });

        if (result.success && result.compiled) {
            // Update instance
            instance.graph = newGraph;
            instance.compiled = result.compiled;
            instance.executor.updateGraph(result.compiled.graph);

            console.log(`Hot reloaded graph ${graphId}`);
            return true;
        }

        console.error(`Hot reload failed for graph ${graphId}:`, result.errors);
        return false;
    }

    /**
     * Enable/disable profiling
     */
    public setProfiling(enabled: boolean): void {
        this._config.enableProfiling = enabled;

        for (const instance of this._graphs.values()) {
            if (enabled) {
                instance.executor.context.enableProfiling();
            } else {
                instance.executor.context.disableProfiling();
            }
        }
    }

    /**
     * Enable/disable debug mode
     */
    public setDebugMode(enabled: boolean): void {
        this._config.enableDebugMode = enabled;
    }

    /**
     * Get profiling data for graph
     */
    public getProfilingData(graphId: string): Map<string, { count: number; totalTime: number; avgTime: number }> | null {
        const instance = this._graphs.get(graphId);
        if (!instance) {
            return null;
        }
        return instance.executor.getProfileData();
    }

    /**
     * Get engine statistics
     */
    public getStats(): {
        graphCount: number;
        enabledGraphs: number;
        totalExecutionTime: number;
        averageFrameTime: number;
        frameCount: number;
    } {
        const enabledGraphs = Array.from(this._graphs.values()).filter(g => g.enabled).length;

        return {
            graphCount: this._graphs.size,
            enabledGraphs,
            totalExecutionTime: this._totalExecutionTime,
            averageFrameTime: this._frameCount > 0 ? this._totalExecutionTime / this._frameCount : 0,
            frameCount: this._frameCount
        };
    }

    /**
     * Reset statistics
     */
    public resetStats(): void {
        this._totalExecutionTime = 0;
        this._frameCount = 0;
    }

    /**
     * Validate all graphs
     */
    public validateAll(): Map<string, { valid: boolean; errors: string[]; warnings: string[] }> {
        const results = new Map();

        for (const [graphId, instance] of this._graphs) {
            const result = this._compiler.validate(instance.graph);
            results.set(graphId, result);
        }

        return results;
    }

    /**
     * Clear all graphs
     */
    public clear(): void {
        this._graphs.clear();
        this._globalVariables.clear();
        this._events.clear();
        this._compiler.clearCache();
        this._totalExecutionTime = 0;
        this._frameCount = 0;
    }

    /**
     * Pause execution
     */
    public pause(): void {
        this._isRunning = false;
    }

    /**
     * Resume execution
     */
    public resume(): void {
        this._isRunning = true;
    }

    /**
     * Check if engine is running
     */
    public get isRunning(): boolean {
        return this._isRunning;
    }

    /**
     * Get compiler
     */
    public get compiler(): ScriptCompiler {
        return this._compiler;
    }

    /**
     * Get configuration
     */
    public get config(): Readonly<EngineConfig> {
        return this._config;
    }
}
