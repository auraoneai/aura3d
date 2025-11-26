/**
 * AnimationNodes.ts - Animation Nodes
 *
 * Nodes for controlling animations.
 */

import { Node, NodeCategory, NodeExecutionResult } from '../Node';
import { PortType } from '../Port';
import { ExecutionContext } from '../execution/ExecutionContext';

/**
 * PlayAnimation - play animation
 */
export class PlayAnimation extends Node {
    constructor() {
        super({
            type: 'Animation.Play',
            category: NodeCategory.ANIMATION,
            title: 'Play Animation',
            description: 'Play animation on entity',
            color: '#E91E63'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity with animator',
            optional: true
        });
        this.addInput({
            name: 'animationName',
            type: PortType.STRING,
            description: 'Animation name to play'
        });
        this.addInput({
            name: 'loop',
            type: PortType.BOOLEAN,
            description: 'Loop animation',
            defaultValue: true
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;
        const animationName = this.getInputValue<string>('animationName', '');
        const loop = this.getInputValue<boolean>('loop', true);

        if (!entity) {
            return this.error('No entity provided');
        }

        const animator = entity.animator;
        if (animator && animator.play) {
            animator.play(animationName, { loop });
        }

        return this.success('out');
    }
}

/**
 * StopAnimation - stop animation
 */
export class StopAnimation extends Node {
    constructor() {
        super({
            type: 'Animation.Stop',
            category: NodeCategory.ANIMATION,
            title: 'Stop Animation',
            description: 'Stop current animation',
            color: '#E91E63'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity with animator',
            optional: true
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;

        if (!entity) {
            return this.error('No entity provided');
        }

        const animator = entity.animator;
        if (animator && animator.stop) {
            animator.stop();
        }

        return this.success('out');
    }
}

/**
 * SetAnimationSpeed - set animation playback speed
 */
export class SetAnimationSpeed extends Node {
    constructor() {
        super({
            type: 'Animation.SetSpeed',
            category: NodeCategory.ANIMATION,
            title: 'Set Animation Speed',
            description: 'Set animation playback speed',
            color: '#E91E63'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity with animator',
            optional: true
        });
        this.addInput({
            name: 'speed',
            type: PortType.NUMBER,
            description: 'Playback speed multiplier',
            defaultValue: 1.0
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;
        const speed = this.getInputValue<number>('speed', 1.0);

        if (!entity) {
            return this.error('No entity provided');
        }

        const animator = entity.animator;
        if (animator) {
            animator.speed = speed;
        }

        return this.success('out');
    }
}

/**
 * BlendAnimations - blend between animations
 */
export class BlendAnimations extends Node {
    constructor() {
        super({
            type: 'Animation.Blend',
            category: NodeCategory.ANIMATION,
            title: 'Blend Animations',
            description: 'Blend between two animations',
            color: '#E91E63'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity with animator',
            optional: true
        });
        this.addInput({
            name: 'animationA',
            type: PortType.STRING,
            description: 'First animation name'
        });
        this.addInput({
            name: 'animationB',
            type: PortType.STRING,
            description: 'Second animation name'
        });
        this.addInput({
            name: 'blend',
            type: PortType.NUMBER,
            description: 'Blend factor (0-1)',
            defaultValue: 0.5
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;
        const animationA = this.getInputValue<string>('animationA', '');
        const animationB = this.getInputValue<string>('animationB', '');
        const blend = this.getInputValue<number>('blend', 0.5);

        if (!entity) {
            return this.error('No entity provided');
        }

        const animator = entity.animator;
        if (animator && animator.blend) {
            animator.blend(animationA, animationB, blend);
        }

        return this.success('out');
    }
}

/**
 * GetAnimationState - get current animation state
 */
export class GetAnimationState extends Node {
    constructor() {
        super({
            type: 'Animation.GetState',
            category: NodeCategory.ANIMATION,
            title: 'Get Animation State',
            description: 'Get current animation state',
            color: '#E91E63'
        });
    }

    protected setupPorts(): void {
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity with animator',
            optional: true
        });
        this.addOutput({
            name: 'currentAnimation',
            type: PortType.STRING,
            description: 'Current animation name'
        });
        this.addOutput({
            name: 'isPlaying',
            type: PortType.BOOLEAN,
            description: 'Whether animation is playing'
        });
        this.addOutput({
            name: 'time',
            type: PortType.NUMBER,
            description: 'Current animation time'
        });
        this.addOutput({
            name: 'normalizedTime',
            type: PortType.NUMBER,
            description: 'Normalized time (0-1)'
        });
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;

        if (!entity) {
            this.setOutputValue('currentAnimation', '');
            this.setOutputValue('isPlaying', false);
            this.setOutputValue('time', 0);
            this.setOutputValue('normalizedTime', 0);
            return this.success();
        }

        const animator = entity.animator;
        if (animator) {
            this.setOutputValue('currentAnimation', animator.currentAnimation || '');
            this.setOutputValue('isPlaying', animator.isPlaying || false);
            this.setOutputValue('time', animator.time || 0);
            this.setOutputValue('normalizedTime', animator.normalizedTime || 0);
        } else {
            this.setOutputValue('currentAnimation', '');
            this.setOutputValue('isPlaying', false);
            this.setOutputValue('time', 0);
            this.setOutputValue('normalizedTime', 0);
        }

        return this.success();
    }
}

/**
 * CrossfadeAnimation - crossfade to animation
 */
export class CrossfadeAnimation extends Node {
    constructor() {
        super({
            type: 'Animation.Crossfade',
            category: NodeCategory.ANIMATION,
            title: 'Crossfade Animation',
            description: 'Smoothly transition to another animation',
            color: '#E91E63'
        });
    }

    protected setupPorts(): void {
        this.addFlowInput('in');
        this.addInput({
            name: 'entity',
            type: PortType.ENTITY,
            description: 'Entity with animator',
            optional: true
        });
        this.addInput({
            name: 'animationName',
            type: PortType.STRING,
            description: 'Animation to crossfade to'
        });
        this.addInput({
            name: 'duration',
            type: PortType.NUMBER,
            description: 'Crossfade duration in seconds',
            defaultValue: 0.3
        });
        this.addFlowOutput('out');
    }

    public async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
        const entity = this.getInputValue('entity') || context.entity;
        const animationName = this.getInputValue<string>('animationName', '');
        const duration = this.getInputValue<number>('duration', 0.3);

        if (!entity) {
            return this.error('No entity provided');
        }

        const animator = entity.animator;
        if (animator && animator.crossfade) {
            animator.crossfade(animationName, duration);
        }

        return this.success('out');
    }
}
