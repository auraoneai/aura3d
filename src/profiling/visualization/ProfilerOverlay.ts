/**
 * On-screen profiler overlay
 *
 * Provides an on-screen display with FPS counter, frame time graph,
 * memory usage, and GPU usage. Toggle with F3 key.
 */

import { Profiler } from '../Profiler';
import { MemoryProfiler } from '../MemoryProfiler';
import { CounterMarker, CounterName } from '../markers/CounterMarker';

/**
 * Overlay position
 */
export type OverlayPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * Overlay mode
 */
export type OverlayMode = 'minimal' | 'detailed';

/**
 * Overlay configuration
 */
export interface ProfilerOverlayConfig {
    /** Overlay position */
    position?: OverlayPosition;
    /** Overlay mode */
    mode?: OverlayMode;
    /** Enable toggle with F3 key */
    enableF3Toggle?: boolean;
    /** Show FPS */
    showFPS?: boolean;
    /** Show frame time */
    showFrameTime?: boolean;
    /** Show memory */
    showMemory?: boolean;
    /** Show counters */
    showCounters?: boolean;
    /** Update interval in milliseconds */
    updateInterval?: number;
    /** Graph height in pixels */
    graphHeight?: number;
    /** Graph width in pixels */
    graphWidth?: number;
}

/**
 * On-screen profiler overlay.
 * Displays FPS, frame time graph, memory usage, and counters.
 * Toggle with F3 key.
 *
 * @example
 * ```typescript
 * const overlay = new ProfilerOverlay({
 *   position: 'top-right',
 *   mode: 'detailed'
 * });
 * overlay.show();
 *
 * // In game loop
 * overlay.update();
 * ```
 */
export class ProfilerOverlay {
    private container: HTMLDivElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;

    private position: OverlayPosition;
    private mode: OverlayMode;
    private enableF3Toggle: boolean;
    private showFPS: boolean;
    private showFrameTime: boolean;
    private showMemory: boolean;
    private showCounters: boolean;
    private updateInterval: number;
    private graphHeight: number;
    private graphWidth: number;

    private visible: boolean = false;
    private lastUpdateTime: number = 0;

    private memoryProfiler: MemoryProfiler | null = null;

    // Key listener
    private keyListener: ((e: KeyboardEvent) => void) | null = null;

    /**
     * Create a new profiler overlay
     */
    constructor(config: ProfilerOverlayConfig = {}) {
        this.position = config.position || 'top-right';
        this.mode = config.mode || 'minimal';
        this.enableF3Toggle = config.enableF3Toggle !== false;
        this.showFPS = config.showFPS !== false;
        this.showFrameTime = config.showFrameTime !== false;
        this.showMemory = config.showMemory !== false;
        this.showCounters = config.showCounters !== false;
        this.updateInterval = config.updateInterval || 100;
        this.graphHeight = config.graphHeight || 60;
        this.graphWidth = config.graphWidth || 200;

        if (this.showMemory) {
            this.memoryProfiler = new MemoryProfiler({ enabled: true });
            this.memoryProfiler.start();
        }

        this.setupKeyListener();
    }

    /**
     * Setup F3 key listener
     */
    private setupKeyListener(): void {
        if (!this.enableF3Toggle || typeof window === 'undefined') {
            return;
        }

        this.keyListener = (e: KeyboardEvent) => {
            if (e.key === 'F3') {
                e.preventDefault();
                this.toggle();
            }
        };

        window.addEventListener('keydown', this.keyListener);
    }

    /**
     * Create the overlay DOM elements
     */
    private createOverlay(): void {
        if (typeof document === 'undefined') {
            return;
        }

        // Create container
        this.container = document.createElement('div');
        this.container.id = 'g3d-profiler-overlay';
        this.applyContainerStyles();

        // Create canvas for graph
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.graphWidth;
        this.canvas.height = this.graphHeight;
        this.canvas.style.display = 'block';
        this.canvas.style.marginTop = '8px';
        this.ctx = this.canvas.getContext('2d');

        this.container.appendChild(this.canvas);

        document.body.appendChild(this.container);
    }

    /**
     * Apply styles to container
     */
    private applyContainerStyles(): void {
        if (!this.container) {
            return;
        }

        const styles: Partial<CSSStyleDeclaration> = {
            position: 'fixed',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#ffffff',
            fontFamily: 'monospace',
            fontSize: '12px',
            padding: '8px',
            borderRadius: '4px',
            zIndex: '10000',
            pointerEvents: 'none',
            userSelect: 'none'
        };

        // Position
        switch (this.position) {
            case 'top-left':
                styles.top = '10px';
                styles.left = '10px';
                break;
            case 'top-right':
                styles.top = '10px';
                styles.right = '10px';
                break;
            case 'bottom-left':
                styles.bottom = '10px';
                styles.left = '10px';
                break;
            case 'bottom-right':
                styles.bottom = '10px';
                styles.right = '10px';
                break;
        }

        Object.assign(this.container.style, styles);
    }

    /**
     * Show the overlay
     */
    public show(): void {
        if (!this.container) {
            this.createOverlay();
        }

        if (this.container) {
            this.container.style.display = 'block';
            this.visible = true;
        }
    }

    /**
     * Hide the overlay
     */
    public hide(): void {
        if (this.container) {
            this.container.style.display = 'none';
            this.visible = false;
        }
    }

    /**
     * Toggle overlay visibility
     */
    public toggle(): void {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Check if overlay is visible
     */
    public isVisible(): boolean {
        return this.visible;
    }

    /**
     * Update the overlay (call once per frame)
     */
    public update(): void {
        if (!this.visible || !this.container) {
            return;
        }

        const now = performance.now();
        if (now - this.lastUpdateTime < this.updateInterval) {
            return;
        }

        this.lastUpdateTime = now;

        // Clear container
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }

        // Add stats
        const stats = this.createStatsElement();
        this.container.appendChild(stats);

        // Add graph
        if (this.canvas && this.showFrameTime) {
            this.container.appendChild(this.canvas);
            this.drawFrameGraph();
        }
    }

    /**
     * Create stats text element
     */
    private createStatsElement(): HTMLDivElement {
        const stats = document.createElement('div');
        const lines: string[] = [];

        // FPS
        if (this.showFPS) {
            const fps = Profiler.getFPS();
            const color = this.getFPSColor(fps);
            lines.push(`<span style="color: ${color}">FPS: ${fps.toFixed(1)}</span>`);
        }

        // Frame time
        if (this.showFrameTime) {
            const frameTime = Profiler.getAverageFrameTime();
            const color = this.getFrameTimeColor(frameTime);
            lines.push(`<span style="color: ${color}">Frame: ${frameTime.toFixed(2)}ms</span>`);
        }

        // Memory
        if (this.showMemory && this.memoryProfiler) {
            const memInfo = this.memoryProfiler.getCurrentMemoryInfo();
            const usedMB = (memInfo.usedJSHeapSize / 1024 / 1024).toFixed(1);
            lines.push(`Memory: ${usedMB}MB`);

            if (this.mode === 'detailed') {
                const textureMB = (memInfo.textureMemory / 1024 / 1024).toFixed(1);
                const bufferMB = (memInfo.bufferMemory / 1024 / 1024).toFixed(1);
                lines.push(`  Textures: ${textureMB}MB`);
                lines.push(`  Buffers: ${bufferMB}MB`);
            }
        }

        // Counters
        if (this.showCounters && this.mode === 'detailed') {
            const drawCalls = CounterMarker.get(CounterName.DRAW_CALLS);
            const triangles = CounterMarker.get(CounterName.TRIANGLES);
            const instances = CounterMarker.get(CounterName.INSTANCES);

            lines.push(`Draw Calls: ${drawCalls}`);
            lines.push(`Triangles: ${this.formatNumber(triangles)}`);
            if (instances > 0) {
                lines.push(`Instances: ${instances}`);
            }
        }

        stats.innerHTML = lines.join('<br>');
        return stats;
    }

    /**
     * Draw frame time graph
     */
    private drawFrameGraph(): void {
        if (!this.ctx || !this.canvas) {
            return;
        }

        const width = this.canvas.width;
        const height = this.canvas.height;
        const frameTimer = Profiler.getFrameTimer();
        const history = frameTimer.getHistoryChronological();
        const targetFrameTime = frameTimer.getTargetFrameTime();

        // Clear canvas
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, width, height);

        // Draw target line
        const targetY = height - (targetFrameTime / 50) * height;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, targetY);
        this.ctx.lineTo(width, targetY);
        this.ctx.stroke();

        // Draw frame times
        const barWidth = width / Math.min(history.length, width);

        for (let i = 0; i < history.length; i++) {
            const frameTime = history[i];
            const x = i * barWidth;
            const barHeight = Math.min((frameTime / 50) * height, height);
            const y = height - barHeight;

            // Color based on performance
            this.ctx.fillStyle = this.getFrameTimeColor(frameTime);
            this.ctx.fillRect(x, y, barWidth - 1, barHeight);
        }
    }

    /**
     * Get color for FPS value
     */
    private getFPSColor(fps: number): string {
        if (fps >= 55) {
            return '#44ff44'; // Green
        } else if (fps >= 30) {
            return '#ffcc44'; // Yellow
        } else {
            return '#ff4444'; // Red
        }
    }

    /**
     * Get color for frame time value
     */
    private getFrameTimeColor(frameTime: number): string {
        if (frameTime <= 16.67) {
            return '#44ff44'; // Green (60+ FPS)
        } else if (frameTime <= 33.33) {
            return '#ffcc44'; // Yellow (30-60 FPS)
        } else {
            return '#ff4444'; // Red (<30 FPS)
        }
    }

    /**
     * Format number with K/M suffix
     */
    private formatNumber(num: number): string {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        } else {
            return num.toString();
        }
    }

    /**
     * Set overlay position
     */
    public setPosition(position: OverlayPosition): void {
        this.position = position;
        if (this.container) {
            this.applyContainerStyles();
        }
    }

    /**
     * Set overlay mode
     */
    public setMode(mode: OverlayMode): void {
        this.mode = mode;
    }

    /**
     * Dispose the overlay
     */
    public dispose(): void {
        if (this.keyListener && typeof window !== 'undefined') {
            window.removeEventListener('keydown', this.keyListener);
        }

        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }

        if (this.memoryProfiler) {
            this.memoryProfiler.dispose();
        }

        this.container = null;
        this.canvas = null;
        this.ctx = null;
    }
}
