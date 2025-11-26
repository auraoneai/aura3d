/**
 * ExecutionContext.ts - Execution Context
 *
 * Represents the execution context for a graph run.
 * Maintains state, variables, and execution stack.
 */

/**
 * Entity reference (simplified for scripting)
 */
export interface EntityRef {
    id: string;
    name?: string;
    [key: string]: any;
}

/**
 * Execution context class
 */
export class ExecutionContext {
    public readonly graphId: string;
    public readonly entity: EntityRef | null;
    public readonly deltaTime: number;
    public readonly fixedDeltaTime: number;
    public readonly time: number;

    private _localVariables: Map<string, any>;
    private _globalVariables: Map<string, any>;
    private _executionStack: string[];
    private _nodeExecutionCount: Map<string, number>;
    private _maxExecutionsPerNode: number;
    private _breakpoints: Set<string>;
    private _paused: boolean;
    private _profiling: boolean;
    private _profileData: Map<string, { count: number; totalTime: number }>;
    private _startTime: number;

    /**
     * Create execution context
     */
    constructor(
        graphId: string,
        entity: EntityRef | null = null,
        deltaTime: number = 0.016,
        globalVariables: Map<string, any> = new Map()
    ) {
        this.graphId = graphId;
        this.entity = entity;
        this.deltaTime = deltaTime;
        this.fixedDeltaTime = 0.02; // 50 FPS for physics
        this.time = Date.now() / 1000;

        this._localVariables = new Map();
        this._globalVariables = globalVariables;
        this._executionStack = [];
        this._nodeExecutionCount = new Map();
        this._maxExecutionsPerNode = 1000; // Prevent infinite loops
        this._breakpoints = new Set();
        this._paused = false;
        this._profiling = false;
        this._profileData = new Map();
        this._startTime = performance.now();
    }

    /**
     * Get local variable
     */
    public getLocal(name: string): any {
        return this._localVariables.get(name);
    }

    /**
     * Set local variable
     */
    public setLocal(name: string, value: any): void {
        this._localVariables.set(name, value);
    }

    /**
     * Has local variable
     */
    public hasLocal(name: string): boolean {
        return this._localVariables.has(name);
    }

    /**
     * Get global variable
     */
    public getGlobal(name: string): any {
        return this._globalVariables.get(name);
    }

    /**
     * Set global variable
     */
    public setGlobal(name: string, value: any): void {
        this._globalVariables.set(name, value);
    }

    /**
     * Has global variable
     */
    public hasGlobal(name: string): boolean {
        return this._globalVariables.has(name);
    }

    /**
     * Get variable (checks local first, then global)
     */
    public getVariable(name: string): any {
        if (this._localVariables.has(name)) {
            return this._localVariables.get(name);
        }
        return this._globalVariables.get(name);
    }

    /**
     * Set variable (sets local)
     */
    public setVariable(name: string, value: any): void {
        this._localVariables.set(name, value);
    }

    /**
     * Push node to execution stack
     */
    public pushNode(nodeId: string): void {
        this._executionStack.push(nodeId);

        // Increment execution count
        const count = (this._nodeExecutionCount.get(nodeId) || 0) + 1;
        this._nodeExecutionCount.set(nodeId, count);

        // Check for infinite loop
        if (count > this._maxExecutionsPerNode) {
            throw new Error(`Node ${nodeId} exceeded maximum executions (${this._maxExecutionsPerNode}). Possible infinite loop.`);
        }

        // Check for breakpoint
        if (this._breakpoints.has(nodeId)) {
            this._paused = true;
        }
    }

    /**
     * Pop node from execution stack
     */
    public popNode(): string | undefined {
        return this._executionStack.pop();
    }

    /**
     * Get current execution stack
     */
    public getStack(): readonly string[] {
        return this._executionStack;
    }

    /**
     * Get stack depth
     */
    public get stackDepth(): number {
        return this._executionStack.length;
    }

    /**
     * Get node execution count
     */
    public getNodeExecutionCount(nodeId: string): number {
        return this._nodeExecutionCount.get(nodeId) || 0;
    }

    /**
     * Reset execution counts
     */
    public resetExecutionCounts(): void {
        this._nodeExecutionCount.clear();
    }

    /**
     * Set max executions per node
     */
    public setMaxExecutionsPerNode(max: number): void {
        this._maxExecutionsPerNode = max;
    }

    /**
     * Add breakpoint
     */
    public addBreakpoint(nodeId: string): void {
        this._breakpoints.add(nodeId);
    }

    /**
     * Remove breakpoint
     */
    public removeBreakpoint(nodeId: string): void {
        this._breakpoints.delete(nodeId);
    }

    /**
     * Check if paused
     */
    public get isPaused(): boolean {
        return this._paused;
    }

    /**
     * Resume execution
     */
    public resume(): void {
        this._paused = false;
    }

    /**
     * Pause execution
     */
    public pause(): void {
        this._paused = true;
    }

    /**
     * Enable profiling
     */
    public enableProfiling(): void {
        this._profiling = true;
        this._profileData.clear();
    }

    /**
     * Disable profiling
     */
    public disableProfiling(): void {
        this._profiling = false;
    }

    /**
     * Start profiling a node
     */
    public startNodeProfile(nodeId: string): number {
        if (!this._profiling) return 0;
        return performance.now();
    }

    /**
     * End profiling a node
     */
    public endNodeProfile(nodeId: string, startTime: number): void {
        if (!this._profiling) return;

        const elapsed = performance.now() - startTime;
        const data = this._profileData.get(nodeId) || { count: 0, totalTime: 0 };

        data.count++;
        data.totalTime += elapsed;

        this._profileData.set(nodeId, data);
    }

    /**
     * Get profile data
     */
    public getProfileData(): Map<string, { count: number; totalTime: number; avgTime: number }> {
        const result = new Map();

        for (const [nodeId, data] of this._profileData) {
            result.set(nodeId, {
                count: data.count,
                totalTime: data.totalTime,
                avgTime: data.totalTime / data.count
            });
        }

        return result;
    }

    /**
     * Get total execution time
     */
    public getExecutionTime(): number {
        return performance.now() - this._startTime;
    }

    /**
     * Clone context for subgraph execution
     */
    public clone(): ExecutionContext {
        const clone = new ExecutionContext(
            this.graphId,
            this.entity,
            this.deltaTime,
            this._globalVariables
        );

        clone._localVariables = new Map(this._localVariables);
        clone._maxExecutionsPerNode = this._maxExecutionsPerNode;
        clone._breakpoints = new Set(this._breakpoints);
        clone._profiling = this._profiling;

        return clone;
    }

    /**
     * Clear context
     */
    public clear(): void {
        this._localVariables.clear();
        this._executionStack = [];
        this._nodeExecutionCount.clear();
        this._profileData.clear();
        this._paused = false;
    }

    /**
     * Get context snapshot (for debugging)
     */
    public getSnapshot(): object {
        return {
            graphId: this.graphId,
            entity: this.entity,
            deltaTime: this.deltaTime,
            time: this.time,
            localVariables: Array.from(this._localVariables.entries()),
            globalVariables: Array.from(this._globalVariables.entries()),
            executionStack: this._executionStack,
            nodeExecutionCounts: Array.from(this._nodeExecutionCount.entries()),
            paused: this._paused,
            profiling: this._profiling,
            executionTime: this.getExecutionTime()
        };
    }
}
