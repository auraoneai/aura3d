/**
 * G3D 5.0 Examples - Shared Utilities
 * Common utility functions for all example applications
 */

/**
 * Canvas setup and management utilities
 */
export class CanvasUtils {
  /**
   * Creates a fullscreen canvas element
   */
  static createFullscreenCanvas(containerId: string = 'canvas-container'): HTMLCanvasElement {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element #${containerId} not found`);
    }

    const canvas = document.createElement('canvas');
    canvas.id = 'game-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    container.appendChild(canvas);

    return canvas;
  }

  /**
   * Updates canvas size to match window dimensions
   */
  static resizeCanvas(canvas: HTMLCanvasElement): void {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }

  /**
   * Gets the aspect ratio of the canvas
   */
  static getAspectRatio(canvas: HTMLCanvasElement): number {
    return canvas.width / canvas.height;
  }
}

/**
 * Statistics tracking for FPS, memory usage, etc.
 */
export class Stats {
  private fps: number = 0;
  private frameCount: number = 0;
  private lastTime: number = performance.now();
  private fpsUpdateInterval: number = 500;
  private lastFpsUpdate: number = performance.now();
  private memoryUsage: number = 0;
  private drawCalls: number = 0;
  private triangles: number = 0;

  /**
   * Updates FPS counter
   */
  update(): void {
    this.frameCount++;
    const now = performance.now();
    const delta = now - this.lastFpsUpdate;

    if (delta >= this.fpsUpdateInterval) {
      this.fps = Math.round((this.frameCount * 1000) / delta);
      this.frameCount = 0;
      this.lastFpsUpdate = now;

      // Update memory usage if available
      if (performance.memory) {
        this.memoryUsage = performance.memory.usedJSHeapSize / (1024 * 1024);
      }
    }

    this.lastTime = now;
  }

  /**
   * Sets rendering statistics
   */
  setRenderStats(drawCalls: number, triangles: number): void {
    this.drawCalls = drawCalls;
    this.triangles = triangles;
  }

  /**
   * Gets current FPS
   */
  getFPS(): number {
    return this.fps;
  }

  /**
   * Gets memory usage in MB
   */
  getMemoryUsage(): number {
    return this.memoryUsage;
  }

  /**
   * Gets draw calls count
   */
  getDrawCalls(): number {
    return this.drawCalls;
  }

  /**
   * Gets triangle count
   */
  getTriangles(): number {
    return this.triangles;
  }

  /**
   * Renders stats to DOM element
   */
  render(elementId: string = 'stats-panel'): void {
    const element = document.getElementById(elementId);
    if (!element) return;

    const memClass = this.memoryUsage > 100 ? 'danger' : this.memoryUsage > 50 ? 'warning' : '';

    element.innerHTML = `
      <div class="stat-row">
        <span class="stat-label">FPS:</span>
        <span class="stat-value">${this.fps}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Memory:</span>
        <span class="stat-value ${memClass}">${this.memoryUsage.toFixed(1)} MB</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Draw Calls:</span>
        <span class="stat-value">${this.drawCalls}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Triangles:</span>
        <span class="stat-value">${this.formatNumber(this.triangles)}</span>
      </div>
    `;
  }

  /**
   * Formats large numbers with K/M suffixes
   */
  private formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }
}

/**
 * Error handling utilities
 */
export class ErrorHandler {
  private static errorCallback?: (error: Error) => void;

  /**
   * Initializes global error handling
   */
  static init(callback?: (error: Error) => void): void {
    this.errorCallback = callback;

    window.addEventListener('error', (event) => {
      this.handleError(new Error(event.message));
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(new Error(event.reason));
    });
  }

  /**
   * Handles an error
   */
  static handleError(error: Error): void {
    console.error('G3D Example Error:', error);

    if (this.errorCallback) {
      this.errorCallback(error);
    }

    this.showErrorMessage(error.message);
  }

  /**
   * Shows an error message to the user
   */
  static showErrorMessage(message: string): void {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 68, 68, 0.95);
      color: white;
      padding: 20px 30px;
      border-radius: 8px;
      font-family: monospace;
      max-width: 500px;
      z-index: 10000;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;
    errorDiv.innerHTML = `
      <strong>Error:</strong><br>
      ${message}<br><br>
      <button onclick="location.reload()" style="
        padding: 8px 16px;
        background: white;
        color: #ff4444;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
      ">Reload Page</button>
    `;
    document.body.appendChild(errorDiv);
  }
}

/**
 * Resize handling with debouncing
 */
export class ResizeHandler {
  private canvas: HTMLCanvasElement;
  private callback: (width: number, height: number) => void;
  private debounceTimeout?: number;
  private debounceDelay: number = 100;

  constructor(canvas: HTMLCanvasElement, callback: (width: number, height: number) => void) {
    this.canvas = canvas;
    this.callback = callback;

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  private onResize(): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    this.debounceTimeout = window.setTimeout(() => {
      CanvasUtils.resizeCanvas(this.canvas);
      this.callback(this.canvas.width, this.canvas.height);
    }, this.debounceDelay);
  }

  /**
   * Removes resize listener
   */
  destroy(): void {
    window.removeEventListener('resize', () => this.onResize());
  }
}

/**
 * Fullscreen utilities
 */
export class FullscreenManager {
  /**
   * Requests fullscreen mode
   */
  static async requestFullscreen(element: HTMLElement = document.documentElement): Promise<void> {
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if ((element as any).webkitRequestFullscreen) {
        await (element as any).webkitRequestFullscreen();
      } else if ((element as any).mozRequestFullScreen) {
        await (element as any).mozRequestFullScreen();
      } else if ((element as any).msRequestFullscreen) {
        await (element as any).msRequestFullscreen();
      }
    } catch (error) {
      console.warn('Fullscreen request failed:', error);
    }
  }

  /**
   * Exits fullscreen mode
   */
  static async exitFullscreen(): Promise<void> {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        await (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
    } catch (error) {
      console.warn('Exit fullscreen failed:', error);
    }
  }

  /**
   * Toggles fullscreen mode
   */
  static async toggle(): Promise<void> {
    if (this.isFullscreen()) {
      await this.exitFullscreen();
    } else {
      await this.requestFullscreen();
    }
  }

  /**
   * Checks if currently in fullscreen mode
   */
  static isFullscreen(): boolean {
    return !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );
  }
}

/**
 * Screenshot capture utilities
 */
export class ScreenshotCapture {
  /**
   * Captures a screenshot from a canvas
   */
  static capture(canvas: HTMLCanvasElement, filename: string = 'screenshot.png'): void {
    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('Failed to create screenshot blob');
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  /**
   * Captures a high-resolution screenshot
   */
  static captureHighRes(
    canvas: HTMLCanvasElement,
    scale: number = 2,
    filename: string = 'screenshot-hires.png'
  ): void {
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;

    canvas.width = originalWidth * scale;
    canvas.height = originalHeight * scale;

    setTimeout(() => {
      this.capture(canvas, filename);
      canvas.width = originalWidth;
      canvas.height = originalHeight;
    }, 100);
  }
}

/**
 * Device detection utilities
 */
export class DeviceDetection {
  /**
   * Checks if running on mobile device
   */
  static isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  /**
   * Checks if running on tablet
   */
  static isTablet(): boolean {
    return /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(navigator.userAgent);
  }

  /**
   * Checks if running on desktop
   */
  static isDesktop(): boolean {
    return !this.isMobile() && !this.isTablet();
  }

  /**
   * Checks if touch is supported
   */
  static isTouchSupported(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  /**
   * Gets device pixel ratio
   */
  static getPixelRatio(): number {
    return window.devicePixelRatio || 1;
  }

  /**
   * Gets GPU tier (low, medium, high)
   */
  static getGPUTier(): 'low' | 'medium' | 'high' {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');

    if (!gl) return 'low';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'medium';

    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();

    if (renderer.includes('nvidia') || renderer.includes('amd') || renderer.includes('radeon')) {
      return 'high';
    } else if (renderer.includes('intel') || renderer.includes('integrated')) {
      return 'medium';
    }

    return 'low';
  }
}

/**
 * Loading tips for better user experience
 */
export const LOADING_TIPS = [
  'Use WASD keys to move around',
  'Right-click and drag to rotate the camera',
  'Press F for fullscreen mode',
  'Press P to capture a screenshot',
  'Adjust quality settings in the debug panel',
  'Physics simulations update at 60Hz',
  'All examples use the G3D 5.0 engine',
  'Assets are cached for faster loading',
  'GPU instancing improves rendering performance',
  'Frustum culling reduces draw calls',
];

/**
 * Gets a random loading tip
 */
export function getRandomLoadingTip(): string {
  return LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
}
