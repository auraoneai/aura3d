/**
 * Flame graph visualization
 *
 * Hierarchical timing visualization with stack-based layout,
 * zoom and pan, search functionality, and click to inspect.
 */

import { ProfilerSession } from '../ProfilerSession';
import { ProfileScope } from '../Profiler';

/**
 * Flame graph node
 */
interface FlameNode {
    name: string;
    category: string;
    value: number;
    startTime: number;
    endTime: number;
    depth: number;
    children: FlameNode[];
    parent: FlameNode | null;
}

/**
 * Flame graph configuration
 */
export interface FlameGraphConfig {
    /** Container element */
    container: HTMLElement;
    /** Graph width */
    width?: number;
    /** Graph height */
    height?: number;
    /** Row height in pixels */
    rowHeight?: number;
    /** Enable search */
    enableSearch?: boolean;
    /** Enable zoom */
    enableZoom?: boolean;
    /** Color scheme */
    colorScheme?: 'category' | 'hot' | 'cold';
}

/**
 * Flame graph visualization.
 * Displays hierarchical timing data as a flame graph.
 *
 * @example
 * ```typescript
 * const container = document.getElementById('flame-graph');
 * const graph = new FlameGraph({ container });
 *
 * const session = Profiler.getSession();
 * graph.setData(session);
 * ```
 */
export class FlameGraph {
    private container: HTMLElement;
    private canvas!: HTMLCanvasElement;
    private ctx!: CanvasRenderingContext2D;
    private searchInput: HTMLInputElement | null = null;

    private width: number;
    private height: number;
    private rowHeight: number;
    private enableSearch: boolean;
    private enableZoom: boolean;
    private colorScheme: 'category' | 'hot' | 'cold';

    private root: FlameNode | null = null;
    private focusedNode: FlameNode | null = null;
    private searchTerm: string = '';
    private matchedNodes: Set<FlameNode> = new Set();

    // Interaction state
    private hoveredNode: FlameNode | null = null;
    private tooltip: HTMLDivElement | null = null;

    /**
     * Create a new flame graph
     */
    constructor(config: FlameGraphConfig) {
        this.container = config.container;
        this.width = config.width || this.container.clientWidth;
        this.height = config.height || 600;
        this.rowHeight = config.rowHeight || 20;
        this.enableSearch = config.enableSearch !== false;
        this.enableZoom = config.enableZoom !== false;
        this.colorScheme = config.colorScheme || 'category';

        // Create UI elements
        this.createUI();

        // Get canvas context
        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get 2D context');
        }
        this.ctx = ctx;

        // Setup event listeners
        this.setupEventListeners();
    }

    /**
     * Create UI elements
     */
    private createUI(): void {
        // Clear container
        this.container.innerHTML = '';

        // Create search bar if enabled
        if (this.enableSearch) {
            const searchContainer = document.createElement('div');
            searchContainer.style.marginBottom = '8px';

            this.searchInput = document.createElement('input');
            this.searchInput.type = 'text';
            this.searchInput.placeholder = 'Search...';
            this.searchInput.style.width = '200px';
            this.searchInput.style.padding = '4px';
            this.searchInput.style.fontFamily = 'monospace';

            this.searchInput.addEventListener('input', () => {
                this.searchTerm = this.searchInput!.value.toLowerCase();
                this.updateSearch();
                this.draw();
            });

            searchContainer.appendChild(this.searchInput);
            this.container.appendChild(searchContainer);
        }

        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.style.cursor = 'pointer';
        this.canvas.style.border = '1px solid #333';
        this.container.appendChild(this.canvas);

        // Create tooltip
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
        this.tooltip.style.maxWidth = '300px';
        document.body.appendChild(this.tooltip);
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners(): void {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            this.handleHover(x, y, e.clientX, e.clientY);
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.hoveredNode = null;
            this.hideTooltip();
            this.draw();
        });

        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            this.handleClick(x, y);
        });

        // Reset on double-click
        this.canvas.addEventListener('dblclick', () => {
            this.focusedNode = null;
            this.draw();
        });
    }

    /**
     * Set data from profiler session
     */
    public setData(session: ProfilerSession): void {
        const frames = session.getFrames();

        if (frames.length === 0) {
            return;
        }

        // Use the last frame for visualization
        const lastFrame = frames[frames.length - 1];
        this.buildFlameGraph(lastFrame.scopes);
        this.draw();
    }

    /**
     * Build flame graph from scopes
     */
    private buildFlameGraph(scopes: readonly ProfileScope[]): void {
        if (scopes.length === 0) {
            return;
        }

        // Find root scopes (depth 0)
        const rootScopes = scopes.filter(s => s.depth === 0);

        // Create a virtual root node
        const totalTime = rootScopes.reduce((sum, s) => sum + s.duration, 0);

        this.root = {
            name: 'Frame',
            category: 'frame',
            value: totalTime,
            startTime: 0,
            endTime: totalTime,
            depth: -1,
            children: [],
            parent: null
        };

        // Build tree
        const nodeMap = new Map<number, FlameNode>();
        nodeMap.set(-1, this.root);

        for (let i = 0; i < scopes.length; i++) {
            const scope = scopes[i];

            const node: FlameNode = {
                name: scope.name,
                category: scope.category,
                value: scope.duration,
                startTime: scope.startTime,
                endTime: scope.endTime,
                depth: scope.depth,
                children: [],
                parent: null
            };

            nodeMap.set(i, node);

            // Find parent
            const parentIndex = scope.parentIndex;
            const parent = nodeMap.get(parentIndex);

            if (parent) {
                node.parent = parent;
                parent.children.push(node);
            }
        }

        this.focusedNode = null;
    }

    /**
     * Handle hover
     */
    private handleHover(x: number, y: number, clientX: number, clientY: number): void {
        if (!this.root) {
            return;
        }

        const node = this.findNodeAtPosition(x, y);

        if (node !== this.hoveredNode) {
            this.hoveredNode = node;

            if (node) {
                this.showTooltip(node, clientX, clientY);
            } else {
                this.hideTooltip();
            }

            this.draw();
        }
    }

    /**
     * Handle click
     */
    private handleClick(x: number, y: number): void {
        if (!this.enableZoom) {
            return;
        }

        const node = this.findNodeAtPosition(x, y);

        if (node) {
            this.focusedNode = node;
            this.draw();
        }
    }

    /**
     * Find node at position
     */
    private findNodeAtPosition(x: number, y: number): FlameNode | null {
        if (!this.root) {
            return null;
        }

        const rootNode = this.focusedNode || this.root;
        return this.findNodeAtPositionRecursive(rootNode, x, y, 0, this.width, 0);
    }

    /**
     * Recursively find node at position
     */
    private findNodeAtPositionRecursive(
        node: FlameNode,
        x: number,
        y: number,
        left: number,
        right: number,
        depth: number
    ): FlameNode | null {
        const nodeY = depth * this.rowHeight;
        const nodeHeight = this.rowHeight;

        if (x >= left && x <= right && y >= nodeY && y < nodeY + nodeHeight) {
            return node;
        }

        // Check children
        if (node.children.length > 0) {
            let childLeft = left;

            for (const child of node.children) {
                const childWidth = ((child.value / node.value) * (right - left));
                const childRight = childLeft + childWidth;

                const found = this.findNodeAtPositionRecursive(
                    child,
                    x,
                    y,
                    childLeft,
                    childRight,
                    depth + 1
                );

                if (found) {
                    return found;
                }

                childLeft = childRight;
            }
        }

        return null;
    }

    /**
     * Show tooltip for node
     */
    private showTooltip(node: FlameNode, x: number, y: number): void {
        if (!this.tooltip) {
            return;
        }

        const percentage = this.root
            ? ((node.value / this.root.value) * 100).toFixed(2)
            : '0.00';

        this.tooltip.innerHTML = `
            <strong>${node.name}</strong><br>
            Category: ${node.category}<br>
            Time: ${node.value.toFixed(3)}ms<br>
            Percentage: ${percentage}%
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
     * Update search results
     */
    private updateSearch(): void {
        this.matchedNodes.clear();

        if (!this.root || !this.searchTerm) {
            return;
        }

        this.searchRecursive(this.root);
    }

    /**
     * Recursively search nodes
     */
    private searchRecursive(node: FlameNode): void {
        if (node.name.toLowerCase().includes(this.searchTerm)) {
            this.matchedNodes.add(node);
        }

        for (const child of node.children) {
            this.searchRecursive(child);
        }
    }

    /**
     * Draw the flame graph
     */
    private draw(): void {
        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (!this.root) {
            return;
        }

        const rootNode = this.focusedNode || this.root;
        this.drawNode(rootNode, 0, this.width, 0);
    }

    /**
     * Draw a node and its children
     */
    private drawNode(node: FlameNode, left: number, right: number, depth: number): void {
        const y = depth * this.rowHeight;
        const width = right - left;
        const height = this.rowHeight - 1;

        if (width < 1 || y + height > this.height) {
            return;
        }

        // Determine color
        const isHovered = node === this.hoveredNode;
        const isMatched = this.matchedNodes.has(node);

        let color = this.getNodeColor(node);

        if (isMatched) {
            color = '#ff44ff'; // Magenta for search matches
        }

        // Draw rectangle
        this.ctx.fillStyle = color;
        this.ctx.fillRect(left, y, width, height);

        // Draw border
        this.ctx.strokeStyle = isHovered ? '#ffffff' : '#000000';
        this.ctx.lineWidth = isHovered ? 2 : 1;
        this.ctx.strokeRect(left, y, width, height);

        // Draw text if there's enough space
        if (width > 20) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '12px monospace';
            this.ctx.textBaseline = 'middle';

            const text = this.truncateText(node.name, width - 4);
            this.ctx.fillText(text, left + 2, y + height / 2);
        }

        // Draw children
        if (node.children.length > 0) {
            let childLeft = left;

            for (const child of node.children) {
                const childWidth = (child.value / node.value) * width;
                const childRight = childLeft + childWidth;

                this.drawNode(child, childLeft, childRight, depth + 1);

                childLeft = childRight;
            }
        }
    }

    /**
     * Get color for node based on color scheme
     */
    private getNodeColor(node: FlameNode): string {
        switch (this.colorScheme) {
            case 'category':
                return this.getCategoryColor(node.category);
            case 'hot':
                return this.getHotColor(node.value);
            case 'cold':
                return this.getColdColor(node.value);
            default:
                return '#4488ff';
        }
    }

    /**
     * Get color for category
     */
    private getCategoryColor(category: string): string {
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
     * Get hot color (red gradient)
     */
    private getHotColor(value: number): string {
        const intensity = Math.min(value / 20, 1);
        const r = Math.floor(255 * intensity);
        const g = Math.floor(128 * (1 - intensity));
        return `rgb(${r}, ${g}, 0)`;
    }

    /**
     * Get cold color (blue gradient)
     */
    private getColdColor(value: number): string {
        const intensity = Math.min(value / 20, 1);
        const b = Math.floor(255 * intensity);
        const g = Math.floor(128 * (1 - intensity));
        return `rgb(0, ${g}, ${b})`;
    }

    /**
     * Truncate text to fit width
     */
    private truncateText(text: string, maxWidth: number): string {
        this.ctx.font = '12px monospace';
        const metrics = this.ctx.measureText(text);

        if (metrics.width <= maxWidth) {
            return text;
        }

        // Binary search for best fit
        let left = 0;
        let right = text.length;

        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            const truncated = text.substring(0, mid) + '...';
            const width = this.ctx.measureText(truncated).width;

            if (width <= maxWidth) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }

        return text.substring(0, left - 1) + '...';
    }

    /**
     * Reset zoom
     */
    public resetZoom(): void {
        this.focusedNode = null;
        this.draw();
    }

    /**
     * Set color scheme
     */
    public setColorScheme(scheme: 'category' | 'hot' | 'cold'): void {
        this.colorScheme = scheme;
        this.draw();
    }

    /**
     * Export as image
     */
    public exportImage(): string {
        return this.canvas.toDataURL('image/png');
    }

    /**
     * Dispose the flame graph
     */
    public dispose(): void {
        if (this.tooltip && this.tooltip.parentNode) {
            this.tooltip.parentNode.removeChild(this.tooltip);
        }

        this.container.innerHTML = '';
    }
}
