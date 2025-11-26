/**
 * G3D 5.0 Examples - Debug UI Panel
 * Provides runtime debugging controls and statistics visualization
 */

export interface DebugUIConfig {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  defaultVisible?: boolean;
  showFPSGraph?: boolean;
  maxFPSHistory?: number;
}

export interface DebugControl {
  type: 'toggle' | 'slider' | 'button' | 'separator';
  label: string;
  value?: boolean | number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: boolean | number) => void;
  onClick?: () => void;
}

export interface DebugSection {
  title: string;
  controls: DebugControl[];
}

/**
 * Debug UI Panel for runtime controls and statistics
 */
export class DebugUI {
  private container: HTMLDivElement;
  private fpsCanvas?: HTMLCanvasElement;
  private fpsCtx?: CanvasRenderingContext2D;
  private fpsHistory: number[] = [];
  private sections: Map<string, DebugSection> = new Map();
  private config: Required<DebugUIConfig>;
  private isVisible: boolean;

  // Statistics
  private fps: number = 0;
  private frameTime: number = 0;
  private memoryUsage: number = 0;
  private drawCalls: number = 0;
  private triangles: number = 0;
  private entities: number = 0;
  private physicsBodies: number = 0;

  constructor(config: DebugUIConfig = {}) {
    this.config = {
      position: config.position || 'top-left',
      defaultVisible: config.defaultVisible !== false,
      showFPSGraph: config.showFPSGraph !== false,
      maxFPSHistory: config.maxFPSHistory || 60,
    };

    this.isVisible = this.config.defaultVisible;
    this.container = this.createContainer();
    this.setupKeyboardShortcuts();
  }

  /**
   * Creates the debug panel container
   */
  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.id = 'debug-ui-panel';
    container.style.cssText = this.getPositionStyles();

    if (!this.isVisible) {
      container.style.display = 'none';
    }

    document.body.appendChild(container);
    return container;
  }

  /**
   * Gets position-specific styles
   */
  private getPositionStyles(): string {
    const baseStyles = `
      position: fixed;
      background: rgba(0, 0, 0, 0.9);
      backdrop-filter: blur(10px);
      padding: 15px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: white;
      z-index: 9999;
      min-width: 280px;
      max-width: 350px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;

    const positions = {
      'top-left': 'top: 20px; left: 20px;',
      'top-right': 'top: 20px; right: 20px;',
      'bottom-left': 'bottom: 20px; left: 20px;',
      'bottom-right': 'bottom: 20px; right: 20px;',
    };

    return baseStyles + positions[this.config.position];
  }

  /**
   * Sets up keyboard shortcuts for debug panel
   */
  private setupKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      // Toggle debug panel with '`' (backtick) or F3
      if (e.key === '`' || e.key === 'F3') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  /**
   * Adds a section to the debug panel
   */
  addSection(id: string, section: DebugSection): void {
    this.sections.set(id, section);
    this.render();
  }

  /**
   * Removes a section from the debug panel
   */
  removeSection(id: string): void {
    this.sections.delete(id);
    this.render();
  }

  /**
   * Updates statistics
   */
  updateStats(stats: {
    fps?: number;
    frameTime?: number;
    memoryUsage?: number;
    drawCalls?: number;
    triangles?: number;
    entities?: number;
    physicsBodies?: number;
  }): void {
    if (stats.fps !== undefined) this.fps = stats.fps;
    if (stats.frameTime !== undefined) this.frameTime = stats.frameTime;
    if (stats.memoryUsage !== undefined) this.memoryUsage = stats.memoryUsage;
    if (stats.drawCalls !== undefined) this.drawCalls = stats.drawCalls;
    if (stats.triangles !== undefined) this.triangles = stats.triangles;
    if (stats.entities !== undefined) this.entities = stats.entities;
    if (stats.physicsBodies !== undefined) this.physicsBodies = stats.physicsBodies;

    // Update FPS history for graph
    if (stats.fps !== undefined && this.config.showFPSGraph) {
      this.fpsHistory.push(stats.fps);
      if (this.fpsHistory.length > this.config.maxFPSHistory) {
        this.fpsHistory.shift();
      }
    }
  }

  /**
   * Renders the debug panel
   */
  render(): void {
    let html = '<div style="margin-bottom: 15px;">';
    html += '<div style="font-weight: bold; font-size: 14px; color: #667eea; margin-bottom: 10px;">DEBUG PANEL</div>';

    // Statistics section
    html += this.renderStatsSection();

    // FPS Graph
    if (this.config.showFPSGraph) {
      html += '<div style="margin: 15px 0;">';
      html += '<canvas id="fps-graph" width="250" height="60" style="width: 100%; background: rgba(0,0,0,0.3); border-radius: 4px;"></canvas>';
      html += '</div>';
    }

    html += '</div>';

    // Custom sections
    for (const [id, section] of this.sections) {
      html += this.renderSection(id, section);
    }

    this.container.innerHTML = html;

    // Update FPS graph if enabled
    if (this.config.showFPSGraph) {
      this.setupFPSGraph();
      this.updateFPSGraph();
    }

    // Reattach event listeners
    this.attachEventListeners();
  }

  /**
   * Renders statistics section
   */
  private renderStatsSection(): string {
    const formatNumber = (num: number) => {
      if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
      return num.toString();
    };

    const fpsColor = this.fps >= 55 ? '#00ff00' : this.fps >= 30 ? '#ffaa00' : '#ff4444';
    const memColor = this.memoryUsage > 100 ? '#ff4444' : this.memoryUsage > 50 ? '#ffaa00' : '#00ff00';

    return `
      <div style="font-size: 11px; line-height: 1.8;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: rgba(255,255,255,0.7);">FPS:</span>
          <span style="color: ${fpsColor}; font-weight: bold;">${this.fps.toFixed(0)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: rgba(255,255,255,0.7);">Frame Time:</span>
          <span style="color: #00ff00;">${this.frameTime.toFixed(2)} ms</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: rgba(255,255,255,0.7);">Memory:</span>
          <span style="color: ${memColor};">${this.memoryUsage.toFixed(1)} MB</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: rgba(255,255,255,0.7);">Draw Calls:</span>
          <span style="color: #00ff00;">${this.drawCalls}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: rgba(255,255,255,0.7);">Triangles:</span>
          <span style="color: #00ff00;">${formatNumber(this.triangles)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: rgba(255,255,255,0.7);">Entities:</span>
          <span style="color: #00ff00;">${this.entities}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: rgba(255,255,255,0.7);">Physics Bodies:</span>
          <span style="color: #00ff00;">${this.physicsBodies}</span>
        </div>
      </div>
    `;
  }

  /**
   * Renders a custom section
   */
  private renderSection(id: string, section: DebugSection): string {
    let html = '<div style="margin-bottom: 15px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 15px;">';
    html += `<div style="font-weight: bold; font-size: 12px; color: #667eea; margin-bottom: 10px; text-transform: uppercase;">${section.title}</div>`;

    for (let i = 0; i < section.controls.length; i++) {
      const control = section.controls[i];

      if (control.type === 'separator') {
        html += '<div style="height: 1px; background: rgba(255,255,255,0.1); margin: 8px 0;"></div>';
        continue;
      }

      html += '<div style="margin-bottom: 8px;">';

      if (control.type === 'toggle') {
        html += `
          <label style="display: flex; align-items: center; cursor: pointer; user-select: none;">
            <input type="checkbox" data-section="${id}" data-index="${i}" ${control.value ? 'checked' : ''}
              style="margin-right: 8px; cursor: pointer;">
            <span style="color: rgba(255,255,255,0.9);">${control.label}</span>
          </label>
        `;
      } else if (control.type === 'slider') {
        html += `
          <div style="display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="color: rgba(255,255,255,0.9); font-size: 11px;">${control.label}</span>
              <span style="color: #00ff00; font-weight: bold;" id="slider-value-${id}-${i}">${control.value?.toFixed(2)}</span>
            </div>
            <input type="range" data-section="${id}" data-index="${i}"
              min="${control.min}" max="${control.max}" step="${control.step}" value="${control.value}"
              style="width: 100%; cursor: pointer;">
          </div>
        `;
      } else if (control.type === 'button') {
        html += `
          <button data-section="${id}" data-index="${i}"
            style="width: 100%; padding: 6px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">
            ${control.label}
          </button>
        `;
      }

      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Attaches event listeners to controls
   */
  private attachEventListeners(): void {
    this.container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      const element = checkbox as HTMLInputElement;
      const sectionId = element.dataset.section!;
      const index = parseInt(element.dataset.index!);
      const section = this.sections.get(sectionId);
      if (!section) return;

      const control = section.controls[index];
      element.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        control.value = checked;
        control.onChange?.(checked);
      });
    });

    this.container.querySelectorAll('input[type="range"]').forEach((slider) => {
      const element = slider as HTMLInputElement;
      const sectionId = element.dataset.section!;
      const index = parseInt(element.dataset.index!);
      const section = this.sections.get(sectionId);
      if (!section) return;

      const control = section.controls[index];
      element.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        control.value = value;

        const valueDisplay = document.getElementById(`slider-value-${sectionId}-${index}`);
        if (valueDisplay) {
          valueDisplay.textContent = value.toFixed(2);
        }

        control.onChange?.(value);
      });
    });

    this.container.querySelectorAll('button').forEach((button) => {
      const element = button as HTMLButtonElement;
      const sectionId = element.dataset.section!;
      const index = parseInt(element.dataset.index!);
      const section = this.sections.get(sectionId);
      if (!section) return;

      const control = section.controls[index];
      element.addEventListener('click', () => {
        control.onClick?.();
      });
    });
  }

  /**
   * Sets up FPS graph canvas
   */
  private setupFPSGraph(): void {
    const canvas = document.getElementById('fps-graph') as HTMLCanvasElement;
    if (!canvas) return;

    this.fpsCanvas = canvas;
    this.fpsCtx = canvas.getContext('2d')!;
  }

  /**
   * Updates FPS graph visualization
   */
  private updateFPSGraph(): void {
    if (!this.fpsCtx || !this.fpsCanvas) return;

    const ctx = this.fpsCtx;
    const width = this.fpsCanvas.width;
    const height = this.fpsCanvas.height;

    ctx.clearRect(0, 0, width, height);

    if (this.fpsHistory.length < 2) return;

    const maxFPS = 60;
    const stepWidth = width / this.config.maxFPSHistory;

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < this.fpsHistory.length; i++) {
      const x = i * stepWidth;
      const y = height - (this.fpsHistory[i] / maxFPS) * height;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Draw 60 FPS reference line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width, 0);
    ctx.stroke();

    // Draw 30 FPS reference line
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }

  /**
   * Toggles debug panel visibility
   */
  toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.style.display = this.isVisible ? 'block' : 'none';
  }

  /**
   * Shows the debug panel
   */
  show(): void {
    this.isVisible = true;
    this.container.style.display = 'block';
  }

  /**
   * Hides the debug panel
   */
  hide(): void {
    this.isVisible = false;
    this.container.style.display = 'none';
  }

  /**
   * Updates and re-renders the panel
   */
  update(): void {
    if (this.isVisible) {
      this.render();
    }
  }

  /**
   * Destroys the debug panel
   */
  destroy(): void {
    this.container.remove();
  }
}
