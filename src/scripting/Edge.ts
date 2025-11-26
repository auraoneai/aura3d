/**
 * Edge.ts - Visual Scripting Edge Connection
 *
 * Represents a connection between two ports in a visual script graph.
 * Handles data flow and connection validation.
 */

import { Port, PortDirection } from './Port';

/**
 * Edge configuration
 */
export interface EdgeConfig {
    sourcePort: Port;
    targetPort: Port;
}

/**
 * Edge class - represents a connection between two ports
 */
export class Edge {
    public readonly id: string;
    private _sourcePort: Port;
    private _targetPort: Port;
    private _isValid: boolean;

    /**
     * Create a new edge
     */
    constructor(config: EdgeConfig) {
        this.id = this.generateId();
        this._sourcePort = config.sourcePort;
        this._targetPort = config.targetPort;
        this._isValid = this.validate();

        if (!this._isValid) {
            throw new Error(`Cannot create edge: Invalid connection between ${this._sourcePort.name} and ${this._targetPort.name}`);
        }

        // Register edge with ports
        this._sourcePort.addEdge(this);
        this._targetPort.addEdge(this);
    }

    /**
     * Generate unique edge ID
     */
    private generateId(): string {
        return `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get source port (output)
     */
    public get sourcePort(): Port {
        return this._sourcePort;
    }

    /**
     * Get target port (input)
     */
    public get targetPort(): Port {
        return this._targetPort;
    }

    /**
     * Get source node ID
     */
    public get sourceNodeId(): string {
        return this._sourcePort.ownerNodeId;
    }

    /**
     * Get target node ID
     */
    public get targetNodeId(): string {
        return this._targetPort.ownerNodeId;
    }

    /**
     * Check if this is a flow edge
     */
    public get isFlowEdge(): boolean {
        return this._sourcePort.isFlow;
    }

    /**
     * Check if this is a data edge
     */
    public get isDataEdge(): boolean {
        return this._sourcePort.isData;
    }

    /**
     * Check if edge is valid
     */
    public get isValid(): boolean {
        return this._isValid;
    }

    /**
     * Validate edge connection
     */
    private validate(): boolean {
        // Check if ports exist
        if (!this._sourcePort || !this._targetPort) {
            return false;
        }

        // Check if ports can connect
        if (!this._sourcePort.canConnectTo(this._targetPort)) {
            return false;
        }

        // Verify source is output and target is input
        if (this._sourcePort.direction !== PortDirection.OUTPUT ||
            this._targetPort.direction !== PortDirection.INPUT) {
            return false;
        }

        return true;
    }

    /**
     * Transfer data from source to target
     */
    public transferData(): void {
        if (!this.isDataEdge) {
            return; // Flow edges don't transfer data
        }

        const sourceValue = this._sourcePort.value;

        // Convert value if needed
        const convertedValue = this.convertValue(sourceValue);

        this._targetPort.value = convertedValue;
    }

    /**
     * Convert value between compatible types
     */
    private convertValue(value: any): any {
        if (value === null || value === undefined) {
            return this._targetPort.defaultValue;
        }

        const sourceType = this._sourcePort.type;
        const targetType = this._targetPort.type;

        // No conversion needed
        if (sourceType === targetType) {
            return value;
        }

        // Number to String
        if (sourceType === 'number' && targetType === 'string') {
            return String(value);
        }

        // String to Number
        if (sourceType === 'string' && targetType === 'number') {
            const num = parseFloat(value);
            return isNaN(num) ? 0 : num;
        }

        // Boolean to Number
        if (sourceType === 'boolean' && targetType === 'number') {
            return value ? 1 : 0;
        }

        // Number to Boolean
        if (sourceType === 'number' && targetType === 'boolean') {
            return value !== 0;
        }

        // Default: return as-is
        return value;
    }

    /**
     * Disconnect edge
     */
    public disconnect(): void {
        this._sourcePort.removeEdge(this);
        this._targetPort.removeEdge(this);
        this._isValid = false;
    }

    /**
     * Get flow direction (for visual rendering)
     */
    public getFlowDirection(): { from: string; to: string } {
        return {
            from: this.sourceNodeId,
            to: this.targetNodeId
        };
    }

    /**
     * Serialize to JSON
     */
    public toJSON(): object {
        return {
            id: this.id,
            sourceNodeId: this.sourceNodeId,
            sourcePortId: this._sourcePort.id,
            sourcePortName: this._sourcePort.name,
            targetNodeId: this.targetNodeId,
            targetPortId: this._targetPort.id,
            targetPortName: this._targetPort.name,
            isFlow: this.isFlowEdge
        };
    }

    /**
     * Check if edge creates a cycle
     */
    public createsCycle(visitedNodes: Set<string> = new Set()): boolean {
        if (visitedNodes.has(this.targetNodeId)) {
            return true;
        }

        // This is a simple check - full cycle detection is done in Graph
        return false;
    }

    /**
     * Get edge color (for visual editor)
     */
    public getColor(): string {
        return this._sourcePort.getTypeColor();
    }

    /**
     * Clone edge for new ports
     */
    public clone(sourcePort: Port, targetPort: Port): Edge {
        return new Edge({
            sourcePort,
            targetPort
        });
    }
}
