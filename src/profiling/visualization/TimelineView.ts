/**
 * Timeline view visualization
 *
 * Horizontal timeline with track-based layout, multiple frames view,
 * selection for details, and export functionality.
 */

import { ProfilerSession } from '../ProfilerSession';
import { FrameProfile, ProfileScope } from '../Profiler';

/**
 * Timeline configuration
 */
export interface TimelineConfig {
    /** Container element */
    container: HTMLElement;
    /** Width in pixels */
    width?: number;
    /** Height in pixels */
    height?: number;
    /** Track height */
    trackHeight?: number;
    /** Number of frames to display */
    frameCount?: number;
    /** Enable selection */
    enableSelection?: boolean;
}

/**
 * Timeline track
 */
interface TimelineTrack {
    name: string;
    category: string;
    scopes: ProfileScope[];
    y: number;
    height: number;
}

/**
 * Selection range
 */
interface SelectionRange {
    startFrame: number;
    endFrame: number;
    startTime: number;
    endTime: number;
}

/**
 * Timeline view visualization.
 * Displays profiling data as a horizontal timeline with tracks.
 *
 * @example
 * ```typescript
 * const container = document.getElementById('timeline');
 * const timeline = new TimelineView({ container });
 *
 * const session = Profiler.getSession();
 * timeline.setData(session);
 * ```
 */
export class TimelineView {
    private container: HTMLElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    private width: number;
    private height: number;
    private trackHeight: number;
    private frameCount: number;
    private enableSelection: boolean;

    private frames: FrameProfile[] = [];
    private tracks: TimelineTrack[] = [];
    private selection: SelectionRange | null = null;

    // Interaction state
    private isDragging: boolean = false;
    private dragStartX: number = 0;
    private hoveredScope: ProfileScope | null = null;
    private tooltip: HTMLDivElement | null = null;

    // Scroll and zoom
    private scrollOffset: number = 0;
    private zoom: number = 1;

    /**
     * Create a new timeline view
     */
    constructor(config: TimelineConfig) {
        this.container = config.container;
        this.width = config.width || this.container.clientWidth;
        this.height = config.height || 400;
        this.trackHeight = config.trackHeight || 30;
        this.frameCount = config.frameCount || 60;
        this.enableSelection = config.enableSelection !== false;

        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.style.cursor = 'crosshair';
        this.canvas.style.border = '1px solid #333';
        this.container.appendChild(this.canvas);

        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get 2D context');
        }
        this.ctx = ctx;

        // Create tooltip
        this.createTooltip();

        // Setup event listeners
        this.setupEventListeners();

        this.draw();
    }

    /**
     * Create tooltip element
     */
    private createTooltip(): void {
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
     * Setup event listeners
     */
    private setupEventListeners(): void {
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.enableSelection) {
                const rect = this.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;

                this.isDragging = true;
                this.dragStartX = x;
                this.selection = null;
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (this.isDragging && this.enableSelection) {
                this.updateSelection(this.dragStartX, x);
                this.draw();
            } else {
                this.handleHover(x, y, e.clientX, e.clientY);
            }
        });

        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
            this.hoveredScope = null;
            this.hideTooltip();
            this.draw();
        });

        // Wheel for zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();

            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom *= delta;
            this.zoom = Math.max(0.1, Math.min(10, this.zoom));

            this.draw();
        });
    }

    /**
     * Set data from profiler session
     */
    public setData(session: ProfilerSession): void {
        this.frames = Array.from(session.getFrames());
        this.buildTracks();
        this.draw();
    }

    /**
     * Build tracks from frames
     */
    private buildTracks(): void {
        this.tracks = [];

        if (this.frames.length === 0) {
            return;
        }

        // Collect unique scope names
        const scopeNames = new Set<string>();
        for (const frame of this.frames) {
            for (const scope of frame.scopes) {
                scopeNames.add(scope.name);
            }
        }

        // Create tracks
        let y = 20; // Start below time ruler
        for (const name of scopeNames) {
            const scopes: ProfileScope[] = [];
            let category = 'default';

            // Collect scopes for this track
            for (const frame of this.frames) {
                for (const scope of frame.scopes) {
                    if (scope.name === name) {
                        scopes.push(scope);
                        category = scope.category;
                    }
                }
            }

            this.tracks.push({
                name,
                category,
                scopes,
                y,
                height: this.trackHeight
            });

            y += this.trackHeight + 2;
        }

        // Update canvas height if needed
        const requiredHeight = y + 20;
        if (requiredHeight > this.height) {
            this.height = requiredHeight;
            this.canvas.height = this.height;
        }
    }

    /**
     * Update selection range
     */
    private updateSelection(startX: number, endX: number): void {
        const minX = Math.min(startX, endX);
        const maxX = Math.max(startX, endX);

        const timeRange = this.getVisibleTimeRange();
        const pixelsPerMs = this.width / (timeRange.end - timeRange.start);

        const startTime = timeRange.start + (minX / pixelsPerMs);
        const endTime = timeRange.start + (maxX / pixelsPerMs);

        // Find frames in range
        let startFrame = -1;
        let endFrame = -1;

        for (let i = 0; i < this.frames.length; i++) {
            const frame = this.frames[i];

            if (startFrame === -1 && frame.startTime >= startTime) {
                startFrame = i;
            }

            if (frame.endTime <= endTime) {
                endFrame = i;
            }
        }

        if (startFrame !== -1 && endFrame !== -1) {
            this.selection = {
                startFrame,
                endFrame,
                startTime,
                endTime
            };
        }
    }

    /**
     * Get visible time range
     */
    private getVisibleTimeRange(): { start: number; end: number } {
        if (this.frames.length === 0) {
            return { start: 0, end: 1000 };
        }

        const displayFrames = this.frames.slice(
            this.scrollOffset,
            this.scrollOffset + this.frameCount
        );

        if (displayFrames.length === 0) {
            return { start: 0, end: 1000 };
        }

        const start = displayFrames[0].startTime;
        const end = displayFrames[displayFrames.length - 1].endTime;

        return { start, end };
    }

    /**
     * Handle hover
     */
    private handleHover(x: number, y: number, clientX: number, clientY: number): void {
        const scope = this.findScopeAtPosition(x, y);

        if (scope !== this.hoveredScope) {
            this.hoveredScope = scope;

            if (scope) {
                this.showTooltip(scope, clientX, clientY);
            } else {
                this.hideTooltip();
            }

            this.draw();
        }
    }

    /**
     * Find scope at position
     */
    private findScopeAtPosition(x: number, y: number): ProfileScope | null {
        const timeRange = this.getVisibleTimeRange();
        const pixelsPerMs = this.width / (timeRange.end - timeRange.start);

        for (const track of this.tracks) {
            if (y >= track.y && y < track.y + track.height) {
                for (const scope of track.scopes) {
                    const scopeX = (scope.startTime - timeRange.start) * pixelsPerMs;
                    const scopeWidth = scope.duration * pixelsPerMs;

                    if (x >= scopeX && x < scopeX + scopeWidth) {
                        return scope;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Show tooltip
     */
    private showTooltip(scope: ProfileScope, x: number, y: number): void {
        if (!this.tooltip) {
            return;
        }

        this.tooltip.innerHTML = `
            <strong>${scope.name}</strong><br>
            Category: ${scope.category}<br>
            Duration: ${scope.duration.toFixed(3)}ms<br>
            Start: ${scope.startTime.toFixed(3)}ms<br>
            Depth: ${scope.depth}
        `;

        this.tooltip.style.left = `${x + 10}px`;
        this.tooltip.style.top = `${y + 10}px`;
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
     * Draw the timeline
     */
    private draw(): void {
        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw time ruler
        this.drawTimeRuler();

        // Draw tracks
        this.drawTracks();

        // Draw selection
        if (this.selection) {
            this.drawSelection();
        }
    }

    /**
     * Draw time ruler
     */
    private drawTimeRuler(): void {
        const timeRange = this.getVisibleTimeRange();
        const duration = timeRange.end - timeRange.start;

        this.ctx.fillStyle = '#333333';
        this.ctx.fillRect(0, 0, this.width, 20);

        this.ctx.strokeStyle = '#666666';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 20);
        this.ctx.lineTo(this.width, 20);
        this.ctx.stroke();

        // Draw time markers
        const interval = this.calculateTimeInterval(duration);
        const pixelsPerMs = this.width / duration;

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'center';

        for (let time = Math.ceil(timeRange.start / interval) * interval; time < timeRange.end; time += interval) {
            const x = (time - timeRange.start) * pixelsPerMs;

            this.ctx.beginPath();
            this.ctx.moveTo(x, 15);
            this.ctx.lineTo(x, 20);
            this.ctx.stroke();

            this.ctx.fillText(`${time.toFixed(0)}ms`, x, 12);
        }
    }

    /**
     * Calculate appropriate time interval for ruler
     */
    private calculateTimeInterval(duration: number): number {
        const intervals = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

        for (const interval of intervals) {
            if (duration / interval < 20) {
                return interval;
            }
        }

        return 1000;
    }

    /**
     * Draw tracks
     */
    private drawTracks(): void {
        const timeRange = this.getVisibleTimeRange();
        const pixelsPerMs = this.width / (timeRange.end - timeRange.start);

        for (const track of this.tracks) {
            // Draw track background
            this.ctx.fillStyle = '#222222';
            this.ctx.fillRect(0, track.y, this.width, track.height);

            // Draw track label
            this.ctx.fillStyle = '#aaaaaa';
            this.ctx.font = '11px monospace';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(track.name, 5, track.y + track.height / 2 + 4);

            // Draw scopes
            for (const scope of track.scopes) {
                if (scope.endTime < timeRange.start || scope.startTime > timeRange.end) {
                    continue;
                }

                const x = (scope.startTime - timeRange.start) * pixelsPerMs;
                const width = scope.duration * pixelsPerMs;

                const isHovered = scope === this.hoveredScope;

                this.ctx.fillStyle = this.getScopeColor(scope.category);
                this.ctx.globalAlpha = isHovered ? 1.0 : 0.8;
                this.ctx.fillRect(x, track.y + 2, Math.max(width, 1), track.height - 4);

                this.ctx.globalAlpha = 1.0;
                this.ctx.strokeStyle = isHovered ? '#ffffff' : '#000000';
                this.ctx.lineWidth = isHovered ? 2 : 1;
                this.ctx.strokeRect(x, track.y + 2, Math.max(width, 1), track.height - 4);
            }
        }
    }

    /**
     * Draw selection
     */
    private drawSelection(): void {
        if (!this.selection) {
            return;
        }

        const timeRange = this.getVisibleTimeRange();
        const pixelsPerMs = this.width / (timeRange.end - timeRange.start);

        const x = (this.selection.startTime - timeRange.start) * pixelsPerMs;
        const width = (this.selection.endTime - this.selection.startTime) * pixelsPerMs;

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.fillRect(x, 0, width, this.height);

        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, 0, width, this.height);
    }

    /**
     * Get color for scope category
     */
    private getScopeColor(category: string): string {
        const colors: Record<string, string> = {
            rendering: '#4444ff',
            physics: '#44ff44',
            animation: '#ff8844',
            ai: '#ff44ff',
            audio: '#44ffff',
            input: '#ffcc44',
            networking: '#ff88cc',
            scripting: '#ff4444',
            ui: '#ffffff',
            default: '#888888'
        };

        return colors[category] || colors.default;
    }

    /**
     * Get selection data
     */
    public getSelection(): SelectionRange | null {
        return this.selection;
    }

    /**
     * Clear selection
     */
    public clearSelection(): void {
        this.selection = null;
        this.draw();
    }

    /**
     * Export selection
     */
    public exportSelection(): FrameProfile[] | null {
        if (!this.selection) {
            return null;
        }

        return this.frames.slice(this.selection.startFrame, this.selection.endFrame + 1);
    }

    /**
     * Dispose the timeline
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
