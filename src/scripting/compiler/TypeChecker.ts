/**
 * TypeChecker.ts - Type Checker
 *
 * Validates port connections and type compatibility.
 */

import { Graph } from '../Graph';
import { Node } from '../Node';
import { Port, PortType } from '../Port';
import { Edge } from '../Edge';

/**
 * Type error
 */
export interface TypeError {
    message: string;
    nodeId: string;
    portName?: string;
    severity: 'error' | 'warning';
}

/**
 * Type checking result
 */
export interface TypeCheckResult {
    valid: boolean;
    errors: TypeError[];
    warnings: TypeError[];
}

/**
 * Type checker class
 */
export class TypeChecker {
    /**
     * Check graph types
     */
    public static check(graph: Graph): TypeCheckResult {
        const errors: TypeError[] = [];
        const warnings: TypeError[] = [];

        // Check all nodes
        for (const node of graph.nodes.values()) {
            const nodeErrors = this.checkNode(node, graph);
            errors.push(...nodeErrors.filter(e => e.severity === 'error'));
            warnings.push(...nodeErrors.filter(e => e.severity === 'warning'));
        }

        // Check all edges
        for (const edge of graph.edges.values()) {
            const edgeErrors = this.checkEdge(edge);
            errors.push(...edgeErrors.filter(e => e.severity === 'error'));
            warnings.push(...edgeErrors.filter(e => e.severity === 'warning'));
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Check single node
     */
    private static checkNode(node: Node, graph: Graph): TypeError[] {
        const errors: TypeError[] = [];

        // Check required inputs are connected or have defaults
        for (const [name, port] of node.inputs) {
            if (!port.optional && !port.isConnected && port.defaultValue === undefined) {
                errors.push({
                    message: `Required input '${name}' is not connected and has no default value`,
                    nodeId: node.id,
                    portName: name,
                    severity: 'error'
                });
            }
        }

        // Check for duplicate connections on single-connection inputs
        for (const [name, port] of node.inputs) {
            if (!port.allowMultiple && port.edges.size > 1) {
                errors.push({
                    message: `Input '${name}' has multiple connections but only allows one`,
                    nodeId: node.id,
                    portName: name,
                    severity: 'error'
                });
            }
        }

        // Warn about disconnected outputs
        for (const [name, port] of node.outputs) {
            if (!port.isConnected && port.isData) {
                errors.push({
                    message: `Output '${name}' is not connected`,
                    nodeId: node.id,
                    portName: name,
                    severity: 'warning'
                });
            }
        }

        return errors;
    }

    /**
     * Check single edge
     */
    private static checkEdge(edge: Edge): TypeError[] {
        const errors: TypeError[] = [];

        if (!edge.isValid) {
            errors.push({
                message: 'Edge is invalid',
                nodeId: edge.sourceNodeId,
                severity: 'error'
            });
            return errors;
        }

        // Check type compatibility
        const sourcePort = edge.sourcePort;
        const targetPort = edge.targetPort;

        if (!this.areTypesCompatible(sourcePort.type, targetPort.type)) {
            // Check if auto-conversion is possible
            if (this.canAutoConvert(sourcePort.type, targetPort.type)) {
                errors.push({
                    message: `Type '${sourcePort.type}' will be auto-converted to '${targetPort.type}'`,
                    nodeId: edge.sourceNodeId,
                    portName: sourcePort.name,
                    severity: 'warning'
                });
            } else {
                errors.push({
                    message: `Incompatible types: '${sourcePort.type}' cannot connect to '${targetPort.type}'`,
                    nodeId: edge.sourceNodeId,
                    portName: sourcePort.name,
                    severity: 'error'
                });
            }
        }

        return errors;
    }

    /**
     * Check if types are compatible
     */
    private static areTypesCompatible(sourceType: PortType, targetType: PortType): boolean {
        // Same types are compatible
        if (sourceType === targetType) {
            return true;
        }

        // ANY type is compatible with everything
        if (sourceType === PortType.ANY || targetType === PortType.ANY) {
            return true;
        }

        // Check auto-convertible types
        return this.canAutoConvert(sourceType, targetType);
    }

    /**
     * Check if auto-conversion is possible
     */
    private static canAutoConvert(sourceType: PortType, targetType: PortType): boolean {
        // Number to String
        if (sourceType === PortType.NUMBER && targetType === PortType.STRING) {
            return true;
        }

        // String to Number
        if (sourceType === PortType.STRING && targetType === PortType.NUMBER) {
            return true;
        }

        // Boolean to Number
        if (sourceType === PortType.BOOLEAN && targetType === PortType.NUMBER) {
            return true;
        }

        // Number to Boolean
        if (sourceType === PortType.NUMBER && targetType === PortType.BOOLEAN) {
            return true;
        }

        return false;
    }

    /**
     * Get conversion hint
     */
    public static getConversionHint(sourceType: PortType, targetType: PortType): string | null {
        if (sourceType === targetType) {
            return null;
        }

        if (sourceType === PortType.NUMBER && targetType === PortType.STRING) {
            return 'Number will be converted to string';
        }

        if (sourceType === PortType.STRING && targetType === PortType.NUMBER) {
            return 'String will be parsed as number (NaN if invalid)';
        }

        if (sourceType === PortType.BOOLEAN && targetType === PortType.NUMBER) {
            return 'Boolean will be converted (false=0, true=1)';
        }

        if (sourceType === PortType.NUMBER && targetType === PortType.BOOLEAN) {
            return 'Number will be converted (0=false, non-zero=true)';
        }

        if (sourceType === PortType.ANY || targetType === PortType.ANY) {
            return 'Any type allows all connections';
        }

        return 'Types are incompatible';
    }

    /**
     * Suggest fixes for type errors
     */
    public static suggestFix(error: TypeError): string[] {
        const suggestions: string[] = [];

        if (error.message.includes('Required input')) {
            suggestions.push('Connect an output to this input');
            suggestions.push('Set a default value for this input');
            suggestions.push('Make this input optional');
        }

        if (error.message.includes('multiple connections')) {
            suggestions.push('Remove extra connections');
            suggestions.push('Allow multiple connections on this port');
        }

        if (error.message.includes('Incompatible types')) {
            suggestions.push('Add a type conversion node between the ports');
            suggestions.push('Change the port type to match');
            suggestions.push('Use ANY type if type safety is not required');
        }

        return suggestions;
    }
}
