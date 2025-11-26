/**
 * Port.ts - Visual Scripting Port Definition
 *
 * Represents an input or output port on a node.
 * Handles data types, connections, and value flow.
 */

import { Edge } from './Edge';

/**
 * Port data types
 */
export enum PortType {
    FLOW = 'flow',           // Execution flow
    BOOLEAN = 'boolean',     // Boolean value
    NUMBER = 'number',       // Number value
    STRING = 'string',       // String value
    VECTOR2 = 'Vector2',     // 2D vector
    VECTOR3 = 'Vector3',     // 3D vector
    QUATERNION = 'Quaternion', // Rotation
    ENTITY = 'Entity',       // Entity reference
    COMPONENT = 'Component', // Component reference
    ANY = 'any'              // Any type (wildcard)
}

/**
 * Port direction
 */
export enum PortDirection {
    INPUT = 'input',
    OUTPUT = 'output'
}

/**
 * Port configuration
 */
export interface PortConfig {
    name: string;
    type: PortType;
    direction: PortDirection;
    defaultValue?: any;
    allowMultiple?: boolean;
    optional?: boolean;
    description?: string;
}

/**
 * Port class - represents a connection point on a node
 */
export class Port {
    public readonly id: string;
    public readonly name: string;
    public readonly type: PortType;
    public readonly direction: PortDirection;
    public readonly allowMultiple: boolean;
    public readonly optional: boolean;
    public readonly description: string;

    private _defaultValue: any;
    private _currentValue: any;
    private _edges: Set<Edge>;
    private _ownerNodeId: string;

    /**
     * Create a new port
     */
    constructor(config: PortConfig, ownerNodeId: string) {
        this.id = this.generateId();
        this.name = config.name;
        this.type = config.type;
        this.direction = config.direction;
        this.allowMultiple = config.allowMultiple ?? (config.direction === PortDirection.OUTPUT);
        this.optional = config.optional ?? false;
        this.description = config.description ?? '';
        this._defaultValue = config.defaultValue;
        this._currentValue = config.defaultValue;
        this._edges = new Set();
        this._ownerNodeId = ownerNodeId;
    }

    /**
     * Generate unique port ID
     */
    private generateId(): string {
        return `port_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get default value
     */
    public get defaultValue(): any {
        return this._defaultValue;
    }

    /**
     * Set default value
     */
    public set defaultValue(value: any) {
        if (this.validateValue(value)) {
            this._defaultValue = value;
            if (this._currentValue === undefined) {
                this._currentValue = value;
            }
        }
    }

    /**
     * Get current value
     */
    public get value(): any {
        return this._currentValue ?? this._defaultValue;
    }

    /**
     * Set current value
     */
    public set value(val: any) {
        if (this.validateValue(val)) {
            this._currentValue = val;
        }
    }

    /**
     * Get owner node ID
     */
    public get ownerNodeId(): string {
        return this._ownerNodeId;
    }

    /**
     * Get connected edges
     */
    public get edges(): ReadonlySet<Edge> {
        return this._edges;
    }

    /**
     * Check if port is connected
     */
    public get isConnected(): boolean {
        return this._edges.size > 0;
    }

    /**
     * Check if this is a flow port
     */
    public get isFlow(): boolean {
        return this.type === PortType.FLOW;
    }

    /**
     * Check if this is a data port
     */
    public get isData(): boolean {
        return this.type !== PortType.FLOW;
    }

    /**
     * Validate value against port type
     */
    public validateValue(value: any): boolean {
        if (value === null || value === undefined) {
            return this.optional;
        }

        switch (this.type) {
            case PortType.FLOW:
                return true; // Flow ports don't have values
            case PortType.BOOLEAN:
                return typeof value === 'boolean';
            case PortType.NUMBER:
                return typeof value === 'number' && !isNaN(value);
            case PortType.STRING:
                return typeof value === 'string';
            case PortType.VECTOR2:
                return value && typeof value.x === 'number' && typeof value.y === 'number';
            case PortType.VECTOR3:
                return value && typeof value.x === 'number' && typeof value.y === 'number' && typeof value.z === 'number';
            case PortType.QUATERNION:
                return value && typeof value.x === 'number' && typeof value.y === 'number' &&
                       typeof value.z === 'number' && typeof value.w === 'number';
            case PortType.ENTITY:
                return value && typeof value.id === 'string';
            case PortType.COMPONENT:
                return value && typeof value.type === 'string';
            case PortType.ANY:
                return true;
            default:
                return false;
        }
    }

    /**
     * Check if can connect to another port
     */
    public canConnectTo(otherPort: Port): boolean {
        // Can't connect to self
        if (otherPort.id === this.id) {
            return false;
        }

        // Must be different directions
        if (otherPort.direction === this.direction) {
            return false;
        }

        // Can't connect to same node
        if (otherPort.ownerNodeId === this._ownerNodeId) {
            return false;
        }

        // Check if input already has connection (unless multiple allowed)
        const inputPort = this.direction === PortDirection.INPUT ? this : otherPort;
        if (!inputPort.allowMultiple && inputPort.isConnected) {
            return false;
        }

        // Check type compatibility
        return this.isTypeCompatible(otherPort);
    }

    /**
     * Check type compatibility
     */
    public isTypeCompatible(otherPort: Port): boolean {
        // ANY type is compatible with everything
        if (this.type === PortType.ANY || otherPort.type === PortType.ANY) {
            return true;
        }

        // Same types are compatible
        if (this.type === otherPort.type) {
            return true;
        }

        // Number can convert to string
        if ((this.type === PortType.NUMBER && otherPort.type === PortType.STRING) ||
            (this.type === PortType.STRING && otherPort.type === PortType.NUMBER)) {
            return true;
        }

        // Boolean can convert to number
        if ((this.type === PortType.BOOLEAN && otherPort.type === PortType.NUMBER) ||
            (this.type === PortType.NUMBER && otherPort.type === PortType.BOOLEAN)) {
            return true;
        }

        return false;
    }

    /**
     * Add edge connection
     */
    public addEdge(edge: Edge): void {
        if (!this.allowMultiple && this._edges.size > 0) {
            throw new Error(`Port ${this.name} does not allow multiple connections`);
        }
        this._edges.add(edge);
    }

    /**
     * Remove edge connection
     */
    public removeEdge(edge: Edge): void {
        this._edges.delete(edge);
    }

    /**
     * Clear all edges
     */
    public clearEdges(): void {
        this._edges.clear();
    }

    /**
     * Reset value to default
     */
    public reset(): void {
        this._currentValue = this._defaultValue;
    }

    /**
     * Clone port
     */
    public clone(newOwnerNodeId: string): Port {
        return new Port({
            name: this.name,
            type: this.type,
            direction: this.direction,
            defaultValue: this._defaultValue,
            allowMultiple: this.allowMultiple,
            optional: this.optional,
            description: this.description
        }, newOwnerNodeId);
    }

    /**
     * Serialize to JSON
     */
    public toJSON(): object {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            direction: this.direction,
            defaultValue: this._defaultValue,
            allowMultiple: this.allowMultiple,
            optional: this.optional,
            description: this.description
        };
    }

    /**
     * Get type color (for visual editor)
     */
    public getTypeColor(): string {
        switch (this.type) {
            case PortType.FLOW: return '#FFFFFF';
            case PortType.BOOLEAN: return '#CC0000';
            case PortType.NUMBER: return '#00CC00';
            case PortType.STRING: return '#CC00CC';
            case PortType.VECTOR2: return '#CCCC00';
            case PortType.VECTOR3: return '#00CCCC';
            case PortType.QUATERNION: return '#CC6600';
            case PortType.ENTITY: return '#0066CC';
            case PortType.COMPONENT: return '#6600CC';
            case PortType.ANY: return '#999999';
            default: return '#FFFFFF';
        }
    }
}
