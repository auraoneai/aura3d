/**
 * G3D 5.0 Timeline & Cinematics Module - Playable Graph
 *
 * Directed graph of playables with mixer connections and output bindings.
 * Provides graph evaluation and performance optimization.
 */

import { IPlayable, Playable, PlayableContext, PlayableOutput, createPlayableContext } from '../Playable';

/**
 * Output binding
 */
export interface OutputBinding {
    /** Binding ID */
    id: string;
    /** Target object */
    target: any;
    /** Property name */
    property?: string;
    /** Transform function */
    transform?: (value: any) => any;
}

/**
 * Graph connection
 */
export interface GraphConnection {
    /** Source playable */
    source: IPlayable;
    /** Target playable */
    target: IPlayable;
    /** Input index on target */
    inputIndex: number;
    /** Connection weight */
    weight: number;
}

/**
 * Playable Graph
 *
 * Manages a directed graph of playable nodes. Handles evaluation,
 * connections, and output bindings.
 */
export class PlayableGraph {
    /** Graph name */
    public readonly name: string;

    /** Root playables (outputs) */
    private _roots: IPlayable[];

    /** All playables in the graph */
    private _playables: Set<IPlayable>;

    /** Connections between playables */
    private _connections: GraphConnection[];

    /** Output bindings */
    private _bindings: Map<string, OutputBinding>;

    /** Whether graph is initialized */
    private _initialized: boolean;

    /** Whether graph is playing */
    private _isPlaying: boolean;

    /** Current time */
    private _time: number;

    /** Frame counter */
    private _frameCount: number;

    /** Performance metrics */
    private _metrics: {
        lastEvaluationTime: number;
        averageEvaluationTime: number;
        peakEvaluationTime: number;
        evaluationCount: number;
    };

    constructor(name: string = 'PlayableGraph') {
        this.name = name;
        this._roots = [];
        this._playables = new Set();
        this._connections = [];
        this._bindings = new Map();
        this._initialized = false;
        this._isPlaying = false;
        this._time = 0;
        this._frameCount = 0;
        this._metrics = {
            lastEvaluationTime: 0,
            averageEvaluationTime: 0,
            peakEvaluationTime: 0,
            evaluationCount: 0
        };
    }

    /**
     * Check if graph is initialized
     */
    public get initialized(): boolean {
        return this._initialized;
    }

    /**
     * Check if graph is playing
     */
    public get isPlaying(): boolean {
        return this._isPlaying;
    }

    /**
     * Get current time
     */
    public get time(): number {
        return this._time;
    }

    /**
     * Get number of playables
     */
    public get playableCount(): number {
        return this._playables.size;
    }

    /**
     * Get performance metrics
     */
    public get metrics() {
        return { ...this._metrics };
    }

    /**
     * Create a playable and add it to the graph
     */
    public createPlayable<T extends IPlayable>(playable: T): T {
        this._playables.add(playable);
        return playable;
    }

    /**
     * Add a root playable (output)
     */
    public addRoot(playable: IPlayable): void {
        if (!this._roots.includes(playable)) {
            this._roots.push(playable);
            this._playables.add(playable);
        }
    }

    /**
     * Remove a root playable
     */
    public removeRoot(playable: IPlayable): void {
        const index = this._roots.indexOf(playable);
        if (index !== -1) {
            this._roots.splice(index, 1);
        }
    }

    /**
     * Connect two playables
     */
    public connect(
        source: IPlayable,
        target: IPlayable,
        inputIndex?: number,
        weight: number = 1.0
    ): GraphConnection {
        // Add to graph if not already present
        this._playables.add(source);
        this._playables.add(target);

        // Determine input index
        const index = inputIndex !== undefined ? inputIndex : target.addInput(source);

        // Set input and weight
        target.setInput(index, source);
        target.setInputWeight(index, weight);

        // Create connection record
        const connection: GraphConnection = {
            source,
            target,
            inputIndex: index,
            weight
        };

        this._connections.push(connection);

        return connection;
    }

    /**
     * Disconnect two playables
     */
    public disconnect(source: IPlayable, target: IPlayable, inputIndex?: number): boolean {
        const connectionIndex = this._connections.findIndex(c =>
            c.source === source &&
            c.target === target &&
            (inputIndex === undefined || c.inputIndex === inputIndex)
        );

        if (connectionIndex !== -1) {
            const connection = this._connections[connectionIndex];
            target.removeInput(connection.inputIndex);
            this._connections.splice(connectionIndex, 1);
            return true;
        }

        return false;
    }

    /**
     * Bind an output to a target object property
     */
    public bind(
        playable: IPlayable,
        target: any,
        property?: string,
        transform?: (value: any) => any
    ): string {
        const bindingId = `binding_${this._bindings.size}`;

        const binding: OutputBinding = {
            id: bindingId,
            target,
            property,
            transform
        };

        this._bindings.set(playable.id, binding);

        return bindingId;
    }

    /**
     * Unbind an output
     */
    public unbind(playable: IPlayable): void {
        this._bindings.delete(playable.id);
    }

    /**
     * Get binding for a playable
     */
    public getBinding(playable: IPlayable): OutputBinding | null {
        return this._bindings.get(playable.id) || null;
    }

    /**
     * Initialize the graph
     */
    public initialize(): void {
        if (this._initialized) {
            return;
        }

        // Initialize all playables
        for (const playable of this._playables) {
            playable.initialize();
        }

        this._initialized = true;
    }

    /**
     * Start playing
     */
    public play(): void {
        if (!this._initialized) {
            this.initialize();
        }

        this._isPlaying = true;
    }

    /**
     * Stop playing
     */
    public stop(): void {
        this._isPlaying = false;
        this._time = 0;
        this._frameCount = 0;
    }

    /**
     * Pause playing
     */
    public pause(): void {
        this._isPlaying = false;
    }

    /**
     * Evaluate the graph at current time
     */
    public evaluate(deltaTime: number = 0): void {
        if (!this._initialized) {
            this.initialize();
        }

        const startTime = performance.now();

        // Update time
        if (this._isPlaying) {
            this._time += deltaTime;
        }

        // Create context
        const context = createPlayableContext(
            this._time,
            deltaTime,
            this._frameCount
        );

        // Prepare all playables
        for (const playable of this._playables) {
            playable.prepareFrame(context);
        }

        // Evaluate roots and apply bindings
        for (const root of this._roots) {
            const output = root.processFrame(context);

            // Apply binding if exists
            const binding = this.getBinding(root);
            if (binding && output.valid) {
                this.applyBinding(binding, output);
            }
        }

        this._frameCount++;

        // Update metrics
        const evaluationTime = performance.now() - startTime;
        this._metrics.lastEvaluationTime = evaluationTime;
        this._metrics.evaluationCount++;
        this._metrics.averageEvaluationTime =
            (this._metrics.averageEvaluationTime * (this._metrics.evaluationCount - 1) + evaluationTime) /
            this._metrics.evaluationCount;
        this._metrics.peakEvaluationTime = Math.max(this._metrics.peakEvaluationTime, evaluationTime);
    }

    /**
     * Apply an output binding
     */
    private applyBinding(binding: OutputBinding, output: PlayableOutput): void {
        let value = output.value;

        // Apply transform if provided
        if (binding.transform) {
            value = binding.transform(value);
        }

        // Apply to target
        if (binding.property) {
            binding.target[binding.property] = value;
        } else if (typeof binding.target === 'function') {
            binding.target(value);
        }
    }

    /**
     * Get all connections
     */
    public getConnections(): readonly GraphConnection[] {
        return this._connections;
    }

    /**
     * Get connections for a playable
     */
    public getConnectionsFor(playable: IPlayable): GraphConnection[] {
        return this._connections.filter(c => c.source === playable || c.target === playable);
    }

    /**
     * Get all playables
     */
    public getPlayables(): readonly IPlayable[] {
        return Array.from(this._playables);
    }

    /**
     * Get root playables
     */
    public getRoots(): readonly IPlayable[] {
        return this._roots;
    }

    /**
     * Clear all playables and connections
     */
    public clear(): void {
        this.stop();

        for (const playable of this._playables) {
            playable.dispose();
        }

        this._playables.clear();
        this._roots = [];
        this._connections = [];
        this._bindings.clear();
        this._initialized = false;
    }

    /**
     * Dispose the graph
     */
    public dispose(): void {
        this.clear();
    }

    /**
     * Validate graph structure
     */
    public validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Check for cycles
        if (this.hasCycles()) {
            errors.push('Graph contains cycles');
        }

        // Check for disconnected playables
        const visited = new Set<IPlayable>();
        for (const root of this._roots) {
            this.markVisited(root, visited);
        }

        for (const playable of this._playables) {
            if (!visited.has(playable) && !this._roots.includes(playable)) {
                errors.push(`Playable ${playable.id} is not connected to any root`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Mark playables as visited (for validation)
     */
    private markVisited(playable: IPlayable, visited: Set<IPlayable>): void {
        if (visited.has(playable)) {
            return;
        }

        visited.add(playable);

        for (let i = 0; i < playable.inputCount; i++) {
            const input = playable.getInput(i);
            if (input) {
                this.markVisited(input, visited);
            }
        }
    }

    /**
     * Check for cycles in the graph
     */
    public hasCycles(): boolean {
        const visiting = new Set<IPlayable>();
        const visited = new Set<IPlayable>();

        for (const playable of this._playables) {
            if (this.detectCycle(playable, visiting, visited)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Detect cycle using DFS
     */
    private detectCycle(
        playable: IPlayable,
        visiting: Set<IPlayable>,
        visited: Set<IPlayable>
    ): boolean {
        if (visited.has(playable)) {
            return false;
        }

        if (visiting.has(playable)) {
            return true; // Cycle detected
        }

        visiting.add(playable);

        for (let i = 0; i < playable.inputCount; i++) {
            const input = playable.getInput(i);
            if (input && this.detectCycle(input, visiting, visited)) {
                return true;
            }
        }

        visiting.delete(playable);
        visited.add(playable);

        return false;
    }
}
