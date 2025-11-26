/**
 * DebugNodes.ts - Debug Nodes
 *
 * Nodes for debugging and visualization.
 */

import { Node, NodeCategory, NodeExecutionResult } from '../Node';
import { PortType } from '../Port';
import { ExecutionContext } from '../execution/ExecutionContext';

/**
 * Log - console log output
 */
export class Log extends Node {
    constructor() {
        super({
            type: 'Debug.Log',
            category: NodeCategory.DEBUG,
            title: 'Log',
            description: 'Print message to console',
            color: '#607D8B'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'message',
            type: PortType.ANY,
            description: 'Message to log'
        });
        this.addInput({
            name: 'level',
            type: PortType.STRING,
            description: 'Log level (log, warn, error)',
            defaultValue: 'log'
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const message = this.getInputValue('message', '');
        const level = this.getInputValue<string>('level', 'log');

        const logMessage = `[Visual Script] ${message}`;

        switch (level) {
            case 'warn':
                console.warn(logMessage);
                break;
            case 'error':
                console.error(logMessage);
                break;
            default:
                console.log(logMessage);
        }

        return this.success('out');
    }
}

/**
 * DrawLine - draw debug line
 */
export class DrawLine extends Node {
    constructor() {
        super({
            type: 'Debug.DrawLine',
            category: NodeCategory.DEBUG,
            title: 'Draw Line',
            description: 'Draw debug line in world space',
            color: '#607D8B'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'start',
            type: PortType.VECTOR3,
            description: 'Line start position'
        });
        this.addInput({
            name: 'end',
            type: PortType.VECTOR3,
            description: 'Line end position'
        });
        this.addInput({
            name: 'color',
            type: PortType.STRING,
            description: 'Line color (hex)',
            defaultValue: '#FFFFFF'
        });
        this.addInput({
            name: 'duration',
            type: PortType.NUMBER,
            description: 'Duration in seconds (0 = one frame)',
            defaultValue: 0
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const start = this.getInputValue('start', { x: 0, y: 0, z: 0 });
        const end = this.getInputValue('end', { x: 1, y: 1, z: 1 });
        const color = this.getInputValue<string>('color', '#FFFFFF');
        const duration = this.getInputValue<number>('duration', 0);

        // Store debug draw command (would be rendered by debug renderer)
        const debugDraws = context.getLocal('debugDraws') || [];
        debugDraws.push({
            type: 'line',
            start,
            end,
            color,
            duration,
            timestamp: Date.now()
        });
        context.setLocal('debugDraws', debugDraws);

        return this.success('out');
    }
}

/**
 * DrawSphere - draw debug sphere
 */
export class DrawSphere extends Node {
    constructor() {
        super({
            type: 'Debug.DrawSphere',
            category: NodeCategory.DEBUG,
            title: 'Draw Sphere',
            description: 'Draw debug sphere in world space',
            color: '#607D8B'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'position',
            type: PortType.VECTOR3,
            description: 'Sphere center position'
        });
        this.addInput({
            name: 'radius',
            type: PortType.NUMBER,
            description: 'Sphere radius',
            defaultValue: 0.5
        });
        this.addInput({
            name: 'color',
            type: PortType.STRING,
            description: 'Sphere color (hex)',
            defaultValue: '#FFFFFF'
        });
        this.addInput({
            name: 'duration',
            type: PortType.NUMBER,
            description: 'Duration in seconds (0 = one frame)',
            defaultValue: 0
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const position = this.getInputValue('position', { x: 0, y: 0, z: 0 });
        const radius = this.getInputValue<number>('radius', 0.5);
        const color = this.getInputValue<string>('color', '#FFFFFF');
        const duration = this.getInputValue<number>('duration', 0);

        const debugDraws = context.getLocal('debugDraws') || [];
        debugDraws.push({
            type: 'sphere',
            position,
            radius,
            color,
            duration,
            timestamp: Date.now()
        });
        context.setLocal('debugDraws', debugDraws);

        return this.success('out');
    }
}

/**
 * Breakpoint - pause execution
 */
export class Breakpoint extends Node {
    constructor() {
        super({
            type: 'Debug.Breakpoint',
            category: NodeCategory.DEBUG,
            title: 'Breakpoint',
            description: 'Pause execution at this point',
            color: '#607D8B'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'enabled',
            type: PortType.BOOLEAN,
            description: 'Breakpoint enabled',
            defaultValue: true
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const enabled = this.getInputValue<boolean>('enabled', true);

        if (enabled) {
            context.pause();
            console.log('[Visual Script] Breakpoint hit at node:', this.title);
        }

        return this.success('out');
    }
}

/**
 * Assert - assertion check
 */
export class Assert extends Node {
    constructor() {
        super({
            type: 'Debug.Assert',
            category: NodeCategory.DEBUG,
            title: 'Assert',
            description: 'Assert condition is true',
            color: '#607D8B'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'condition',
            type: PortType.BOOLEAN,
            description: 'Condition to assert'
        });
        this.addInput({
            name: 'message',
            type: PortType.STRING,
            description: 'Error message if assertion fails',
            defaultValue: 'Assertion failed'
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const condition = this.getInputValue<boolean>('condition', false);
        const message = this.getInputValue<string>('message', 'Assertion failed');

        if (!condition) {
            console.error(`[Visual Script] Assertion failed: ${message}`);
            return this.error(message);
        }

        return this.success('out');
    }
}

/**
 * StartProfiler - start profiler marker
 */
export class StartProfiler extends Node {
    constructor() {
        super({
            type: 'Debug.StartProfiler',
            category: NodeCategory.DEBUG,
            title: 'Start Profiler',
            description: 'Start profiler marker',
            color: '#607D8B'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'markerName',
            type: PortType.STRING,
            description: 'Profiler marker name'
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const markerName = this.getInputValue<string>('markerName', 'Marker');

        const markers = context.getLocal('profilerMarkers') || {};
        markers[markerName] = performance.now();
        context.setLocal('profilerMarkers', markers);

        return this.success('out');
    }
}

/**
 * EndProfiler - end profiler marker
 */
export class EndProfiler extends Node {
    constructor() {
        super({
            type: 'Debug.EndProfiler',
            category: NodeCategory.DEBUG,
            title: 'End Profiler',
            description: 'End profiler marker and print duration',
            color: '#607D8B'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'markerName',
            type: PortType.STRING,
            description: 'Profiler marker name'
        });
        this.addFlowOutput('out');
        this.addOutput({
            name: 'duration',
            type: PortType.NUMBER,
            description: 'Duration in milliseconds'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const markerName = this.getInputValue<string>('markerName', 'Marker');

        const markers = context.getLocal('profilerMarkers') || {};
        const startTime = markers[markerName];

        if (startTime !== undefined) {
            const duration = performance.now() - startTime;
            console.log(`[Profiler] ${markerName}: ${duration.toFixed(2)}ms`);
            this.setOutputValue('duration', duration);
            delete markers[markerName];
            context.setLocal('profilerMarkers', markers);
        } else {
            this.setOutputValue('duration', 0);
        }

        return this.success('out');
    }
}

/**
 * GetFrameCount - get current frame count
 */
export class GetFrameCount extends Node {
    private static _frameCount: number = 0;

    constructor() {
        super({
            type: 'Debug.GetFrameCount',
            category: NodeCategory.DEBUG,
            title: 'Get Frame Count',
            description: 'Get current frame number',
            color: '#607D8B'
        });
    }

    protected setupPorts(): void {
        this.addOutput({
            name: 'frameCount',
            type: PortType.NUMBER,
            description: 'Current frame number'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        GetFrameCount._frameCount++;
        this.setOutputValue('frameCount', GetFrameCount._frameCount);
        return this.success();
    }
}
