/**
 * @module Rendering/Debug
 * @description
 * On-screen debug overlay for displaying performance statistics and metrics.
 * Provides FPS counter, memory usage, draw calls, and other runtime information.
 */

import { RenderProfiler, FrameStats } from '../RenderProfiler';
import { ResourceManager } from '../ResourceManager';
import { Logger } from '../../core/Logger';

const logger = Logger.create('DebugOverlay');

/**
 * Overlay position.
 */
export enum OverlayPosition {
  TopLeft = 'top-left',
  TopRight = 'top-right',
  BottomLeft = 'bottom-left',
  BottomRight = 'bottom-right',
}

/**
 * Overlay style configuration.
 */
export interface OverlayStyle {
  /** Font family */
  fontFamily?: string;
  /** Font size */
  fontSize?: number;
  /** Text color */
  textColor?: string;
  /** Background color */
  backgroundColor?: string;
  /** Background opacity (0-1) */
  backgroundOpacity?: number;
  /** Padding */
  padding?: number;
  /** Line height */
  lineHeight?: number;
}

/**
 * Debug overlay configuration.
 */
export interface DebugOverlayConfig {
  /** Overlay position */
  position?: OverlayPosition;
  /** Style configuration */
  style?: OverlayStyle;
  /** Update interval in ms */
  updateInterval?: number;
  /** Show FPS */
  showFPS?: boolean;
  /** Show frame time */
  showFrameTime?: boolean;
  /** Show draw calls */
  showDrawCalls?: boolean;
  /** Show triangles */
  showTriangles?: boolean;
  /** Show memory */
  showMemory?: boolean;
  /** Show frame time graph */
  showGraph?: boolean;
  /** Graph width */
  graphWidth?: number;
  /** Graph height */
  graphHeight?: number;
  /** Graph samples */
  graphSamples?: number;
}

/**
 * Debug overlay for on-screen statistics.
 *
 * Features:
 * - FPS counter with moving average
 * - Frame time display
 * - Draw call and triangle counts
 * - Memory usage tracking
 * - Frame time graph
 * - Customizable position and styling
 *
 * @example
 * ```typescript
 * const overlay = new DebugOverlay(profiler, resourceManager, {
 *   position: OverlayPosition.TopLeft,
 *   showFPS: true,
 *   showFrameTime: true,
 *   showDrawCalls: true,
 *   showMemory: true,
 *   showGraph: true,
 * });
 *
 * // Show overlay
 * overlay.show();
 *
 * // Update each frame
 * function render() {
 *   // ... render scene
 *   overlay.update();
 *   requestAnimationFrame(render);
 * }
 *
 * // Hide overlay
 * overlay.hide();
 *
 * // Cleanup
 * overlay.dispose();
 * ```
 */
export class DebugOverlay {
  private profiler: RenderProfiler | null;
  private resourceManager: ResourceManager | null;
  private config: Required<DebugOverlayConfig & { style: Required<OverlayStyle> }>;

  // DOM elements
  private container: HTMLDivElement | null = null;
  private textElement: HTMLDivElement | null = null;
  private graphCanvas: HTMLCanvasElement | null = null;
  private graphContext: CanvasRenderingContext2D | null = null;

  // State
  private visible: boolean = false;
  private lastUpdateTime: number = 0;

  // Graph data
  private frameTimeHistory: number[] = [];

  /**
   * Creates a new DebugOverlay.
   *
   * @param profiler - Render profiler (optional)
   * @param resourceManager - Resource manager (optional)
   * @param config - Configuration options
   */
  constructor(
    profiler: RenderProfiler | null = null,
    resourceManager: ResourceManager | null = null,
    config?: DebugOverlayConfig
  ) {
    this.profiler = profiler;
    this.resourceManager = resourceManager;

    this.config = {
      position: config?.position ?? OverlayPosition.TopLeft,
      updateInterval: config?.updateInterval ?? 100,
      showFPS: config?.showFPS ?? true,
      showFrameTime: config?.showFrameTime ?? true,
      showDrawCalls: config?.showDrawCalls ?? true,
      showTriangles: config?.showTriangles ?? false,
      showMemory: config?.showMemory ?? true,
      showGraph: config?.showGraph ?? false,
      graphWidth: config?.graphWidth ?? 200,
      graphHeight: config?.graphHeight ?? 60,
      graphSamples: config?.graphSamples ?? 120,
      style: {
        fontFamily: config?.style?.fontFamily ?? 'monospace',
        fontSize: config?.style?.fontSize ?? 12,
        textColor: config?.style?.textColor ?? '#00ff00',
        backgroundColor: config?.style?.backgroundColor ?? '#000000',
        backgroundOpacity: config?.style?.backgroundOpacity ?? 0.7,
        padding: config?.style?.padding ?? 8,
        lineHeight: config?.style?.lineHeight ?? 1.4,
      },
    };

    this.createOverlay();

    logger.info('DebugOverlay created');
  }

  /**
   * Creates the overlay DOM elements.
   */
  private createOverlay(): void {
    if (typeof document === 'undefined') {
      return; // Not in browser environment
    }

    // Create container
    this.container = document.createElement('div');
    this.container.style.position = 'fixed';
    this.container.style.zIndex = '9999';
    this.container.style.fontFamily = this.config.style.fontFamily;
    this.container.style.fontSize = `${this.config.style.fontSize}px`;
    this.container.style.color = this.config.style.textColor;
    this.container.style.backgroundColor = this.config.style.backgroundColor;
    this.container.style.opacity = this.config.style.backgroundOpacity.toString();
    this.container.style.padding = `${this.config.style.padding}px`;
    this.container.style.lineHeight = this.config.style.lineHeight.toString();
    this.container.style.pointerEvents = 'none';
    this.container.style.userSelect = 'none';

    // Position container
    this.applyPosition();

    // Create text element
    this.textElement = document.createElement('div');
    this.container.appendChild(this.textElement);

    // Create graph canvas
    if (this.config.showGraph) {
      this.graphCanvas = document.createElement('canvas');
      this.graphCanvas.width = this.config.graphWidth;
      this.graphCanvas.height = this.config.graphHeight;
      this.graphCanvas.style.display = 'block';
      this.graphCanvas.style.marginTop = `${this.config.style.padding}px`;
      this.graphContext = this.graphCanvas.getContext('2d');
      this.container.appendChild(this.graphCanvas);
    }

    // Initially hidden
    this.container.style.display = 'none';

    // Add to document
    if (document.body) {
      document.body.appendChild(this.container);
    }
  }

  /**
   * Applies position styling.
   */
  private applyPosition(): void {
    if (!this.container) return;

    const pos = this.config.position;

    // Reset all positions
    this.container.style.top = '';
    this.container.style.right = '';
    this.container.style.bottom = '';
    this.container.style.left = '';

    // Apply position
    switch (pos) {
      case OverlayPosition.TopLeft:
        this.container.style.top = '0';
        this.container.style.left = '0';
        break;
      case OverlayPosition.TopRight:
        this.container.style.top = '0';
        this.container.style.right = '0';
        break;
      case OverlayPosition.BottomLeft:
        this.container.style.bottom = '0';
        this.container.style.left = '0';
        break;
      case OverlayPosition.BottomRight:
        this.container.style.bottom = '0';
        this.container.style.right = '0';
        break;
    }
  }

  /**
   * Shows the overlay.
   */
  show(): void {
    if (this.container) {
      this.container.style.display = 'block';
      this.visible = true;
    }
  }

  /**
   * Hides the overlay.
   */
  hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
      this.visible = false;
    }
  }

  /**
   * Toggles overlay visibility.
   */
  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Updates the overlay (call every frame).
   */
  update(): void {
    if (!this.visible || !this.container || !this.textElement) {
      return;
    }

    const now = performance.now();
    if (now - this.lastUpdateTime < this.config.updateInterval) {
      return;
    }

    this.lastUpdateTime = now;

    // Gather stats
    const stats = this.profiler?.getFrameStats();
    const memoryUsage = this.resourceManager?.getMemoryUsage();

    // Build text
    const lines: string[] = [];

    if (this.config.showFPS && stats) {
      lines.push(`FPS: ${stats.fps.toFixed(1)}`);
    }

    if (this.config.showFrameTime && stats) {
      lines.push(`Frame: ${stats.frameTime.toFixed(2)}ms`);
      if (stats.cpuTime > 0) {
        lines.push(`  CPU: ${stats.cpuTime.toFixed(2)}ms`);
      }
      if (stats.gpuTime > 0) {
        lines.push(`  GPU: ${stats.gpuTime.toFixed(2)}ms`);
      }
    }

    if (this.config.showDrawCalls && stats) {
      lines.push(`Draw Calls: ${stats.drawCalls}`);
    }

    if (this.config.showTriangles && stats) {
      lines.push(`Triangles: ${stats.triangles.toLocaleString()}`);
      lines.push(`Vertices: ${stats.vertices.toLocaleString()}`);
    }

    if (this.config.showMemory && memoryUsage) {
      const usedMB = (memoryUsage.used / 1024 / 1024).toFixed(1);
      const budgetMB = (memoryUsage.budget / 1024 / 1024).toFixed(1);
      const percentage = (memoryUsage.percentage * 100).toFixed(1);
      lines.push(`Memory: ${usedMB}MB / ${budgetMB}MB (${percentage}%)`);
    }

    // Update text
    this.textElement.innerHTML = lines.join('<br>');

    // Update graph
    if (this.config.showGraph && stats) {
      this.updateGraph(stats);
    }
  }

  /**
   * Updates the frame time graph.
   */
  private updateGraph(stats: FrameStats): void {
    if (!this.graphCanvas || !this.graphContext) {
      return;
    }

    // Add to history
    this.frameTimeHistory.push(stats.frameTime);
    if (this.frameTimeHistory.length > this.config.graphSamples) {
      this.frameTimeHistory.shift();
    }

    const ctx = this.graphContext;
    const width = this.graphCanvas.width;
    const height = this.graphCanvas.height;

    // Clear
    ctx.fillStyle = this.config.style.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Find max value
    const maxValue = Math.max(...this.frameTimeHistory, 33.33); // At least 30 FPS

    // Draw grid lines
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
    ctx.lineWidth = 1;

    // 60 FPS line (16.67ms)
    const y60 = height - (16.67 / maxValue) * height;
    ctx.beginPath();
    ctx.moveTo(0, y60);
    ctx.lineTo(width, y60);
    ctx.stroke();

    // 30 FPS line (33.33ms)
    const y30 = height - (33.33 / maxValue) * height;
    ctx.beginPath();
    ctx.moveTo(0, y30);
    ctx.lineTo(width, y30);
    ctx.stroke();

    // Draw graph
    if (this.frameTimeHistory.length > 1) {
      ctx.strokeStyle = this.config.style.textColor;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const xStep = width / this.config.graphSamples;

      for (let i = 0; i < this.frameTimeHistory.length; i++) {
        const x = i * xStep;
        const y = height - (this.frameTimeHistory[i] / maxValue) * height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    }

    // Draw labels
    ctx.fillStyle = this.config.style.textColor;
    ctx.font = '10px monospace';
    ctx.fillText('60', 2, y60 - 2);
    ctx.fillText('30', 2, y30 - 2);
  }

  /**
   * Sets the overlay position.
   *
   * @param position - New position
   */
  setPosition(position: OverlayPosition): void {
    this.config.position = position;
    this.applyPosition();
  }

  /**
   * Enables/disables specific stats.
   *
   * @param stat - Stat name
   * @param enabled - Whether to show
   */
  setStat(stat: 'fps' | 'frameTime' | 'drawCalls' | 'triangles' | 'memory' | 'graph', enabled: boolean): void {
    switch (stat) {
      case 'fps':
        this.config.showFPS = enabled;
        break;
      case 'frameTime':
        this.config.showFrameTime = enabled;
        break;
      case 'drawCalls':
        this.config.showDrawCalls = enabled;
        break;
      case 'triangles':
        this.config.showTriangles = enabled;
        break;
      case 'memory':
        this.config.showMemory = enabled;
        break;
      case 'graph':
        this.config.showGraph = enabled;
        if (enabled && !this.graphCanvas) {
          this.createGraphCanvas();
        } else if (!enabled && this.graphCanvas) {
          this.graphCanvas.remove();
          this.graphCanvas = null;
          this.graphContext = null;
        }
        break;
    }
  }

  /**
   * Creates graph canvas (if not already created).
   */
  private createGraphCanvas(): void {
    if (this.graphCanvas || !this.container) {
      return;
    }

    this.graphCanvas = document.createElement('canvas');
    this.graphCanvas.width = this.config.graphWidth;
    this.graphCanvas.height = this.config.graphHeight;
    this.graphCanvas.style.display = 'block';
    this.graphCanvas.style.marginTop = `${this.config.style.padding}px`;
    this.graphContext = this.graphCanvas.getContext('2d');
    this.container.appendChild(this.graphCanvas);
  }

  /**
   * Checks if overlay is visible.
   *
   * @returns True if visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Disposes of the overlay.
   */
  dispose(): void {
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }

    this.container = null;
    this.textElement = null;
    this.graphCanvas = null;
    this.graphContext = null;

    logger.info('DebugOverlay disposed');
  }
}
