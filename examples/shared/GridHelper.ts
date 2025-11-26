/**
 * G3D 5.0 Examples - Grid Helper
 * Creates a reference grid for scene orientation
 */

export interface GridHelperConfig {
  size?: number;
  divisions?: number;
  centerLineColor?: string;
  gridColor?: string;
  axisLength?: number;
  showAxes?: boolean;
}

/**
 * Grid helper for visualizing scene orientation
 */
export class GridHelper {
  private size: number;
  private divisions: number;
  private centerLineColor: string;
  private gridColor: string;
  private axisLength: number;
  private showAxes: boolean;

  // Geometry data
  private vertices: Float32Array;
  private colors: Float32Array;
  private lineCount: number;

  constructor(config: GridHelperConfig = {}) {
    this.size = config.size || 10;
    this.divisions = config.divisions || 10;
    this.centerLineColor = config.centerLineColor || '#444444';
    this.gridColor = config.gridColor || '#222222';
    this.axisLength = config.axisLength || this.size;
    this.showAxes = config.showAxes !== false;

    this.lineCount = 0;
    this.vertices = new Float32Array(0);
    this.colors = new Float32Array(0);

    this.build();
  }

  /**
   * Builds the grid geometry
   */
  private build(): void {
    const halfSize = this.size / 2;
    const step = this.size / this.divisions;
    const lines: number[] = [];
    const colors: number[] = [];

    // Helper function to parse color
    const parseColor = (color: string): [number, number, number] => {
      const hex = color.replace('#', '');
      return [
        parseInt(hex.substr(0, 2), 16) / 255,
        parseInt(hex.substr(2, 2), 16) / 255,
        parseInt(hex.substr(4, 2), 16) / 255,
      ];
    };

    const gridColor = parseColor(this.gridColor);
    const centerColor = parseColor(this.centerLineColor);

    // Create grid lines
    for (let i = 0; i <= this.divisions; i++) {
      const pos = -halfSize + i * step;
      const isCenter = Math.abs(pos) < 0.001;
      const color = isCenter ? centerColor : gridColor;

      // Lines parallel to Z axis
      lines.push(-halfSize, 0, pos, halfSize, 0, pos);
      colors.push(...color, ...color);

      // Lines parallel to X axis
      lines.push(pos, 0, -halfSize, pos, 0, halfSize);
      colors.push(...color, ...color);

      this.lineCount += 2;
    }

    // Add coordinate axes if enabled
    if (this.showAxes) {
      // X axis (red)
      lines.push(0, 0, 0, this.axisLength, 0, 0);
      colors.push(1, 0, 0, 1, 0, 0);
      this.lineCount++;

      // Y axis (green)
      lines.push(0, 0, 0, 0, this.axisLength, 0);
      colors.push(0, 1, 0, 0, 1, 0);
      this.lineCount++;

      // Z axis (blue)
      lines.push(0, 0, 0, 0, 0, this.axisLength);
      colors.push(0, 0, 1, 0, 0, 1);
      this.lineCount++;
    }

    this.vertices = new Float32Array(lines);
    this.colors = new Float32Array(colors);
  }

  /**
   * Gets vertex positions
   */
  getVertices(): Float32Array {
    return this.vertices;
  }

  /**
   * Gets vertex colors
   */
  getColors(): Float32Array {
    return this.colors;
  }

  /**
   * Gets number of lines
   */
  getLineCount(): number {
    return this.lineCount;
  }

  /**
   * Updates grid parameters and rebuilds
   */
  update(config: Partial<GridHelperConfig>): void {
    if (config.size !== undefined) this.size = config.size;
    if (config.divisions !== undefined) this.divisions = config.divisions;
    if (config.centerLineColor !== undefined) this.centerLineColor = config.centerLineColor;
    if (config.gridColor !== undefined) this.gridColor = config.gridColor;
    if (config.axisLength !== undefined) this.axisLength = config.axisLength;
    if (config.showAxes !== undefined) this.showAxes = config.showAxes;

    this.build();
  }

  /**
   * Creates a simple rendering context for canvas 2D
   */
  renderToCanvas2D(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.clearRect(0, 0, width, height);
    ctx.save();

    // Set up simple orthographic projection
    const scale = Math.min(width, height) / (this.size * 2);
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, -scale);

    // Draw grid lines
    for (let i = 0; i < this.lineCount; i++) {
      const idx = i * 6;
      const colorIdx = i * 6;

      const x1 = this.vertices[idx];
      const z1 = this.vertices[idx + 2];
      const x2 = this.vertices[idx + 3];
      const z2 = this.vertices[idx + 5];

      const r = Math.floor(this.colors[colorIdx] * 255);
      const g = Math.floor(this.colors[colorIdx + 1] * 255);
      const b = Math.floor(this.colors[colorIdx + 2] * 255);

      ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      ctx.moveTo(x1, z1);
      ctx.lineTo(x2, z2);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Gets grid bounds
   */
  getBounds(): { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } {
    const halfSize = this.size / 2;
    return {
      min: { x: -halfSize, y: 0, z: -halfSize },
      max: { x: halfSize, y: 0, z: halfSize },
    };
  }

  /**
   * Checks if a point is within grid bounds (XZ plane)
   */
  containsPoint(x: number, z: number): boolean {
    const halfSize = this.size / 2;
    return x >= -halfSize && x <= halfSize && z >= -halfSize && z <= halfSize;
  }

  /**
   * Snaps a position to the grid
   */
  snapToGrid(x: number, z: number): { x: number; z: number } {
    const step = this.size / this.divisions;
    return {
      x: Math.round(x / step) * step,
      z: Math.round(z / step) * step,
    };
  }
}
