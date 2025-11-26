/**
 * Frame graph visualization
 *
 * Displays a bar chart of frame times with target line,
 * color coding, hover details, and scrollable history.
 */

import { FrameTimer } from '../FrameTimer';

/**
 * Frame graph configuration
 */
export interface FrameGraphConfig {
    /** Canvas element or container element */
    container: HTMLElement | HTMLCanvasElement;
    /** Graph width in pixels */
    width?: number;
    /** Graph height in pixels */
    height?: number;
    /** Target FPS for target line */
    targetFPS?: number;
    /** Maximum frame time to display (ms) */
    maxFrameTime?: number;
    /** Number of frames to display */
    frameCount?: number;
    /** Enable hover tooltips */
    enableHover?: boolean;
    /** Background color */
    backgroundColor?: string;
}

/**
 * Frame graph visualization.
 * Displays a bar chart of frame times with color coding and hover details.
 *
 * @example
 * ```typescript
 * const container = document.getElementById('frame-graph');
 * const graph = new FrameGraph({
 *   container,
 *   width: 800,
 *   height: 200,
 *   targetFPS: 60
 * });
 *
 * const timer = Profiler.getFrameTimer();
 * graph.update(timer);
 * ```
 */
export class FrameGraph {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private targetFPS: number;
    private targetFrameTime: number;
    private maxFrameTime: number;
    private frameCount: number;
    private enableHover: boolean;
    private backgroundColor: string;

    private frameData: number[] = [];
    private scrollOffset: number = 0;

    // Hover state
    private hoverIndex: number = -1;
    private tooltip: HTMLDivElement | null = null;

    /**
     * Create a new frame graph
     */
    constructor(config: FrameGraphConfig) {
        this.width = config.width || 800;
        this.height = config.height || 200;
        this.targetFPS = config.targetFPS || 60;
        this.targetFrameTime = 1000 / this.targetFPS;
        this.maxFrameTime = config.maxFrameTime || 50;
        this.frameCount = config.frameCount || Math.floor(this.width / 4);
        this.enableHover = config.enableHover !== false;
        this.backgroundColor = config.backgroundColor || '#1a1a1a';

        // Create or get canvas
        if (config.container instanceof HTMLCanvasElement) {
            this.canvas = config.container;
        } else {
            this.canvas = document.createElement('canvas');
            config.container.appendChild(this.canvas);
        }

        this.canvas.width = this.width;
        this.canvas.height = this.height;

        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get 2D context');
        }
        this.ctx = ctx;

        // Setup hover listeners
        if (this.enableHover) {
            this.setupHoverListeners();
        }

        this.draw();
    }

    /**
     * Setup hover event listeners
     */
    private setupHoverListeners(): void {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            this.handleHover(x, y);
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.hoverIndex = -1;
            this.hideTooltip();
            this.draw();
        });

        // Create tooltip element
        this.tooltip = document.createElement('div');
        this.tooltip.style.position = 'fixed';
        this.tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        this.tooltip.style.color = 'white';
        this.tooltip.style.padding = '8px';
        this.tooltip.style.borderRadius = '4px';
        this.tooltip.style.fontSize = '12px';
        this.tooltip.style.fontFamily = 'monospace';
        this.tooltip.style.pointerEvents = 'none';
        this.tooltip.style.display = 'none';
        this.tooltip.style.zIndex = '10001';
        document.body.appendChild(this.tooltip);
    }

    /**
     * Handle hover event
     */
    private handleHover(x: number, y: number): void {
        const barWidth = this.width / this.frameCount;
        const index = Math.floor(x / barWidth);

        if (index >= 0 && index < this.frameData.length) {
            this.hoverIndex = index;
            this.showTooltip(x, y, this.frameData[index], index);
            this.draw();
        } else {
            this.hoverIndex = -1;
            this.hideTooltip();
        }
    }

    /**
     * Show tooltip
     */
    private showTooltip(x: number, y: number, frameTime: number, index: number): void {
        if (!this.tooltip) {
            return;
        }

        const fps = 1000 / frameTime;
        const rect = this.canvas.getBoundingClientRect();

        this.tooltip.innerHTML = `
            Frame: ${index}<br>
            Time: ${frameTime.toFixed(2)}ms<br>
            FPS: ${fps.toFixed(1)}
        `;

        this.tooltip.style.left = `${rect.left + x + 10}px`;
        this.tooltip.style.top = `${rect.top + y + 10}px`;
        this.tooltip.style.display = 'block';
    }

    /**
     * Hide tooltip
     */
    private hideTooltip(): void {
        if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
    }

    /**
     * Update graph with new data
     */
    public update(frameTimer: FrameTimer): void {
        this.frameData = frameTimer.getHistoryChronological();
        this.draw();
    }

    /**
     * Set frame data directly
     */
    public setData(frameData: number[]): void {
        this.frameData = frameData;
        this.draw();
    }

    /**
     * Draw the graph
     */
    private draw(): void {
        // Clear canvas
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw grid lines
        this.drawGrid();

        // Draw target line
        this.drawTargetLine();

        // Draw bars
        this.drawBars();

        // Draw hover highlight
        if (this.hoverIndex >= 0) {
            this.drawHoverHighlight();
        }
    }

    /**
     * Draw grid lines
     */
    private drawGrid(): void {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;

        // Horizontal lines (every 10ms)
        for (let ms = 0; ms <= this.maxFrameTime; ms += 10) {
            const y = this.height - (ms / this.maxFrameTime) * this.height;

            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();

            // Label
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.font = '10px monospace';
            this.ctx.fillText(`${ms}ms`, 5, y - 2);
        }
    }

    /**
     * Draw target frame time line
     */
    private drawTargetLine(): void {
        const y = this.height - (this.targetFrameTime / this.maxFrameTime) * this.height;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);

        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(this.width, y);
        this.ctx.stroke();

        this.ctx.setLineDash([]);

        // Label
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.font = '12px monospace';
        this.ctx.fillText(`${this.targetFPS} FPS`, this.width - 60, y - 5);
    }

    /**
     * Draw frame time bars
     */
    private drawBars(): void {
        const barWidth = this.width / this.frameCount;
        const displayData = this.frameData.slice(-this.frameCount);

        for (let i = 0; i < displayData.length; i++) {
            const frameTime = displayData[i];
            const x = i * barWidth;
            const barHeight = Math.min((frameTime / this.maxFrameTime) * this.height, this.height);
            const y = this.height - barHeight;

            // Color based on performance
            this.ctx.fillStyle = this.getFrameTimeColor(frameTime);

            // Highlight if hovered
            if (i === this.hoverIndex) {
                this.ctx.globalAlpha = 1.0;
            } else {
                this.ctx.globalAlpha = 0.8;
            }

            this.ctx.fillRect(x, y, barWidth - 1, barHeight);
        }

        this.ctx.globalAlpha = 1.0;
    }

    /**
     * Draw hover highlight
     */
    private drawHoverHighlight(): void {
        const barWidth = this.width / this.frameCount;
        const x = this.hoverIndex * barWidth;

        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, 0, barWidth - 1, this.height);
    }

    /**
     * Get color for frame time
     */
    private getFrameTimeColor(frameTime: number): string {
        if (frameTime <= this.targetFrameTime) {
            return '#44ff44'; // Green (at or above target)
        } else if (frameTime <= this.targetFrameTime * 1.5) {
            return '#ffcc44'; // Yellow (slightly below target)
        } else if (frameTime <= this.targetFrameTime * 2) {
            return '#ff8844'; // Orange (below target)
        } else {
            return '#ff4444'; // Red (well below target)
        }
    }

    /**
     * Set target FPS
     */
    public setTargetFPS(fps: number): void {
        this.targetFPS = fps;
        this.targetFrameTime = 1000 / fps;
        this.draw();
    }

    /**
     * Set maximum frame time
     */
    public setMaxFrameTime(ms: number): void {
        this.maxFrameTime = ms;
        this.draw();
    }

    /**
     * Resize the graph
     */
    public resize(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
        this.frameCount = Math.floor(width / 4);
        this.draw();
    }

    /**
     * Clear the graph
     */
    public clear(): void {
        this.frameData = [];
        this.draw();
    }

    /**
     * Dispose the graph
     */
    public dispose(): void {
        if (this.tooltip && this.tooltip.parentNode) {
            this.tooltip.parentNode.removeChild(this.tooltip);
        }

        if (this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }
}
