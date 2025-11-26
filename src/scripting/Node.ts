/**
 * Node.ts - Visual Scripting Node Base Class
 *
 * Base class for all visual scripting nodes.
 * Handles ports, execution, state, and validation.
 */

import { Port, PortType, PortDirection, PortConfig } from './Port';
import { ExecutionContext } from './execution/ExecutionContext';

/**
 * Node category
 */
export enum NodeCategory {
    EVENT = 'Event',
    FLOW = 'Flow Control',
    MATH = 'Math',
    LOGIC = 'Logic',
    VARIABLE = 'Variable',
    COMPONENT = 'Component',
    PHYSICS = 'Physics',
    ANIMATION = 'Animation',
    DEBUG = 'Debug',
    CUSTOM = 'Custom'
}

/**
 * Node execution result
 */
export interface NodeExecutionResult {
    success: boolean;
    outputFlowPort?: string;
    error?: string;
}

/**
 * Node configuration
 */
export interface NodeConfig {
    type: string;
    category: NodeCategory;
    title: string;
    description?: string;
    color?: string;
    icon?: string;
}

/**
 * Base Node class
 */
export abstract class Node {
    public readonly id: string;
    public readonly type: string;
    public readonly category: NodeCategory;
    public readonly title: string;
    public readonly description: string;
    public readonly color: string;
    public readonly icon: string;

    protected _inputs: Map<string, Port>;
    protected _outputs: Map<string, Port>;
    protected _state: Map<string, any>;
    protected _enabled: boolean;
    protected _breakpoint: boolean;

    /**
     * Create a new node
     */
    constructor(config: NodeConfig) {
        this.id = this.generateId();
        this.type = config.type;
        this.category = config.category;
        this.title = config.title;
        this.description = config.description ?? '';
        this.color = config.color ?? this.getCategoryColor();
        this.icon = config.icon ?? '';

        this._inputs = new Map();
        this._outputs = new Map();
        this._state = new Map();
        this._enabled = true;
        this._breakpoint = false;

        this.setupPorts();
    }

    /**
     * Generate unique node ID
     */
    private generateId(): string {
        return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Setup node ports (override in subclasses)
     */
    protected abstract setupPorts(): void;

    /**
     * Execute node logic (override in subclasses)
     */
    public abstract execute(context: ExecutionContext): Promise<NodeExecutionResult>;

    /**
     * Add input port
     */
    protected addInput(config: Omit<PortConfig, 'direction'>): Port {
        const port = new Port({ ...config, direction: PortDirection.INPUT }, this.id);
        this._inputs.set(port.name, port);
        return port;
    }

    /**
     * Add output port
     */
    protected addOutput(config: Omit<PortConfig, 'direction'>): Port {
        const port = new Port({ ...config, direction: PortDirection.OUTPUT }, this.id);
        this._outputs.set(port.name, port);
        return port;
    }

    /**
     * Add flow input port
     */
    protected addFlowInput(name: string = 'in'): Port {
        return this.addInput({
            name,
            type: PortType.FLOW,
            description: 'Execution input'
        });
    }

    /**
     * Add flow output port
     */
    protected addFlowOutput(name: string = 'out'): Port {
        return this.addOutput({
            name,
            type: PortType.FLOW,
            description: 'Execution output'
        });
    }

    /**
     * Get input port by name
     */
    public getInput(name: string): Port | undefined {
        return this._inputs.get(name);
    }

    /**
     * Get output port by name
     */
    public getOutput(name: string): Port | undefined {
        return this._outputs.get(name);
    }

    /**
     * Get all input ports
     */
    public get inputs(): ReadonlyMap<string, Port> {
        return this._inputs;
    }

    /**
     * Get all output ports
     */
    public get outputs(): ReadonlyMap<string, Port> {
        return this._outputs;
    }

    /**
     * Get port by ID
     */
    public getPortById(portId: string): Port | undefined {
        for (const port of this._inputs.values()) {
            if (port.id === portId) return port;
        }
        for (const port of this._outputs.values()) {
            if (port.id === portId) return port;
        }
        return undefined;
    }

    /**
     * Get all ports
     */
    public getAllPorts(): Port[] {
        return [...this._inputs.values(), ...this._outputs.values()];
    }

    /**
     * Check if node is enabled
     */
    public get enabled(): boolean {
        return this._enabled;
    }

    /**
     * Set node enabled state
     */
    public set enabled(value: boolean) {
        this._enabled = value;
    }

    /**
     * Check if breakpoint is set
     */
    public get hasBreakpoint(): boolean {
        return this._breakpoint;
    }

    /**
     * Set breakpoint
     */
    public set breakpoint(value: boolean) {
        this._breakpoint = value;
    }

    /**
     * Get state value
     */
    public getState<T = any>(key: string): T | undefined {
        return this._state.get(key);
    }

    /**
     * Set state value
     */
    public setState(key: string, value: any): void {
        this._state.set(key, value);
    }

    /**
     * Clear state
     */
    public clearState(): void {
        this._state.clear();
    }

    /**
     * Validate node
     */
    public validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Check required inputs are connected
        for (const [name, port] of this._inputs) {
            if (!port.optional && !port.isConnected && port.value === undefined) {
                errors.push(`Required input '${name}' is not connected`);
            }
        }

        // Validate port values
        for (const port of this._inputs.values()) {
            if (port.value !== undefined && !port.validateValue(port.value)) {
                errors.push(`Invalid value for input '${port.name}'`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Reset node state
     */
    public reset(): void {
        this.clearState();
        for (const port of this._inputs.values()) {
            port.reset();
        }
        for (const port of this._outputs.values()) {
            port.reset();
        }
    }

    /**
     * Clone node
     */
    public clone(): Node {
        const clone = Object.create(Object.getPrototypeOf(this));
        clone.id = this.generateId();
        clone.type = this.type;
        clone.category = this.category;
        clone.title = this.title;
        clone.description = this.description;
        clone.color = this.color;
        clone.icon = this.icon;
        clone._inputs = new Map();
        clone._outputs = new Map();
        clone._state = new Map(this._state);
        clone._enabled = this._enabled;
        clone._breakpoint = false;

        // Clone ports
        for (const [name, port] of this._inputs) {
            clone._inputs.set(name, port.clone(clone.id));
        }
        for (const [name, port] of this._outputs) {
            clone._outputs.set(name, port.clone(clone.id));
        }

        return clone;
    }

    /**
     * Serialize to JSON
     */
    public toJSON(): object {
        return {
            id: this.id,
            type: this.type,
            category: this.category,
            title: this.title,
            description: this.description,
            color: this.color,
            icon: this.icon,
            enabled: this._enabled,
            breakpoint: this._breakpoint,
            inputs: Array.from(this._inputs.values()).map(p => p.toJSON()),
            outputs: Array.from(this._outputs.values()).map(p => p.toJSON()),
            state: Array.from(this._state.entries())
        };
    }

    /**
     * Get category color
     */
    private getCategoryColor(): string {
        switch (this.category) {
            case NodeCategory.EVENT: return '#4CAF50';
            case NodeCategory.FLOW: return '#2196F3';
            case NodeCategory.MATH: return '#9C27B0';
            case NodeCategory.LOGIC: return '#FF9800';
            case NodeCategory.VARIABLE: return '#F44336';
            case NodeCategory.COMPONENT: return '#00BCD4';
            case NodeCategory.PHYSICS: return '#8BC34A';
            case NodeCategory.ANIMATION: return '#E91E63';
            case NodeCategory.DEBUG: return '#607D8B';
            case NodeCategory.CUSTOM: return '#795548';
            default: return '#9E9E9E';
        }
    }

    /**
     * Get input value helper
     */
    protected getInputValue<T = any>(portName: string, defaultValue?: T): T {
        const port = this._inputs.get(portName);
        if (!port) {
            return defaultValue as T;
        }
        return (port.value ?? defaultValue) as T;
    }

    /**
     * Set output value helper
     */
    protected setOutputValue(portName: string, value: any): void {
        const port = this._outputs.get(portName);
        if (port) {
            port.value = value;
        }
    }

    /**
     * Success result helper
     */
    protected success(outputFlowPort?: string): NodeExecutionResult {
        return {
            success: true,
            outputFlowPort
        };
    }

    /**
     * Error result helper
     */
    protected error(message: string): NodeExecutionResult {
        return {
            success: false,
            error: message
        };
    }
}
