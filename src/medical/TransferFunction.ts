/**
 * TransferFunction.ts - Transfer Function Mapping for Volume Rendering
 *
 * Maps scalar voxel values to RGBA colors for volume visualization.
 * Supports control points with interpolation, opacity modulation, and presets.
 *
 * @example
 * ```typescript
 * const tf = TransferFunction.preset('CT_BONE');
 * tf.addControlPoint(1000, [1, 1, 1, 1]); // Add white at HU 1000
 * const texture = tf.generateTexture(4096);
 * ```
 */

export interface ControlPoint {
  value: number;
  color: [number, number, number, number]; // RGBA [0-1]
}

export type TransferFunctionPreset = 'CT_BONE' | 'CT_SOFT_TISSUE' | 'MRI_BRAIN' | 'CT_ANGIO' | 'CT_CARDIAC';

export class TransferFunction {
  private controlPoints: ControlPoint[] = [];
  private minValue: number = -1024;
  private maxValue: number = 3071;
  private gradientOpacity: boolean = false;
  private gradientScale: number = 1.0;

  /**
   * Creates a new transfer function.
   *
   * @param minValue - Minimum scalar value
   * @param maxValue - Maximum scalar value
   */
  constructor(minValue: number = -1024, maxValue: number = 3071) {
    this.minValue = minValue;
    this.maxValue = maxValue;

    // Default: linear ramp from transparent black to opaque white
    this.controlPoints = [
      { value: minValue, color: [0, 0, 0, 0] },
      { value: maxValue, color: [1, 1, 1, 1] }
    ];
  }

  /**
   * Adds a control point to the transfer function.
   *
   * @param value - Scalar value
   * @param color - RGBA color [0-1]
   */
  addControlPoint(value: number, color: [number, number, number, number]): void {
    // Find insertion position to keep sorted by value
    let insertIndex = this.controlPoints.findIndex(cp => cp.value > value);
    if (insertIndex === -1) {
      insertIndex = this.controlPoints.length;
    }

    // Check if point already exists at this value
    const existingIndex = this.controlPoints.findIndex(cp => cp.value === value);
    if (existingIndex !== -1) {
      this.controlPoints[existingIndex].color = color;
    } else {
      this.controlPoints.splice(insertIndex, 0, { value, color });
    }
  }

  /**
   * Removes a control point at the specified value.
   *
   * @param value - Scalar value of control point to remove
   */
  removeControlPoint(value: number): void {
    const index = this.controlPoints.findIndex(cp => cp.value === value);
    if (index !== -1 && this.controlPoints.length > 2) {
      this.controlPoints.splice(index, 1);
    }
  }

  /**
   * Clears all control points and sets new ones.
   *
   * @param controlPoints - Array of control points
   */
  setControlPoints(controlPoints: ControlPoint[]): void {
    this.controlPoints = controlPoints.sort((a, b) => a.value - b.value);
  }

  /**
   * Gets the interpolated color for a scalar value.
   *
   * @param value - Scalar value
   * @param gradientMagnitude - Optional gradient magnitude for opacity modulation
   * @returns RGBA color [0-1]
   */
  getColor(value: number, gradientMagnitude: number = 0): [number, number, number, number] {
    if (this.controlPoints.length === 0) {
      return [0, 0, 0, 0];
    }

    // Clamp value to range
    value = Math.max(this.minValue, Math.min(this.maxValue, value));

    // Find surrounding control points
    let lowerIndex = 0;
    let upperIndex = this.controlPoints.length - 1;

    for (let i = 0; i < this.controlPoints.length - 1; i++) {
      if (value >= this.controlPoints[i].value && value <= this.controlPoints[i + 1].value) {
        lowerIndex = i;
        upperIndex = i + 1;
        break;
      }
    }

    const lower = this.controlPoints[lowerIndex];
    const upper = this.controlPoints[upperIndex];

    // Linear interpolation
    let t = 0;
    if (upper.value !== lower.value) {
      t = (value - lower.value) / (upper.value - lower.value);
    }

    const r = lower.color[0] + (upper.color[0] - lower.color[0]) * t;
    const g = lower.color[1] + (upper.color[1] - lower.color[1]) * t;
    const b = lower.color[2] + (upper.color[2] - lower.color[2]) * t;
    let a = lower.color[3] + (upper.color[3] - lower.color[3]) * t;

    // Apply gradient-based opacity modulation
    if (this.gradientOpacity && gradientMagnitude > 0) {
      const gradientFactor = Math.min(1.0, gradientMagnitude * this.gradientScale);
      a *= gradientFactor;
    }

    return [r, g, b, a];
  }

  /**
   * Generates a 1D texture for GPU-based transfer function lookup.
   *
   * @param size - Texture size (typically 256, 1024, or 4096)
   * @returns Uint8Array containing RGBA values
   */
  generateTexture(size: number = 256): Uint8Array {
    const texture = new Uint8Array(size * 4);
    const range = this.maxValue - this.minValue;

    for (let i = 0; i < size; i++) {
      const value = this.minValue + (i / (size - 1)) * range;
      const color = this.getColor(value);

      texture[i * 4 + 0] = Math.floor(color[0] * 255);
      texture[i * 4 + 1] = Math.floor(color[1] * 255);
      texture[i * 4 + 2] = Math.floor(color[2] * 255);
      texture[i * 4 + 3] = Math.floor(color[3] * 255);
    }

    return texture;
  }

  /**
   * Enables or disables gradient-based opacity modulation.
   *
   * @param enable - True to enable gradient opacity
   * @param scale - Gradient scale factor
   */
  setGradientOpacity(enable: boolean, scale: number = 1.0): void {
    this.gradientOpacity = enable;
    this.gradientScale = scale;
  }

  /**
   * Sets the value range for the transfer function.
   *
   * @param min - Minimum value
   * @param max - Maximum value
   */
  setRange(min: number, max: number): void {
    this.minValue = min;
    this.maxValue = max;
  }

  /**
   * Gets the current control points.
   *
   * @returns Array of control points
   */
  getControlPoints(): ControlPoint[] {
    return [...this.controlPoints];
  }

  /**
   * Gets the value range.
   *
   * @returns [min, max]
   */
  getRange(): [number, number] {
    return [this.minValue, this.maxValue];
  }

  /**
   * Creates a transfer function from a preset.
   *
   * @param preset - Preset name
   * @returns TransferFunction instance
   */
  static preset(preset: TransferFunctionPreset): TransferFunction {
    const tf = new TransferFunction();

    switch (preset) {
      case 'CT_BONE':
        tf.setRange(-1024, 3071);
        tf.setControlPoints([
          { value: -1024, color: [0, 0, 0, 0] },        // Air - transparent
          { value: -500, color: [0.3, 0.15, 0.1, 0] },  // Soft tissue - transparent
          { value: 200, color: [0.9, 0.7, 0.5, 0.3] },  // Bone start - semi-transparent
          { value: 600, color: [1.0, 0.95, 0.9, 0.8] }, // Dense bone - mostly opaque
          { value: 3071, color: [1.0, 1.0, 1.0, 1.0] }  // Maximum - opaque
        ]);
        tf.setGradientOpacity(true, 0.5);
        break;

      case 'CT_SOFT_TISSUE':
        tf.setRange(-1024, 3071);
        tf.setControlPoints([
          { value: -1024, color: [0, 0, 0, 0] },        // Air - transparent
          { value: -150, color: [0, 0, 0, 0] },         // Fat - transparent
          { value: -50, color: [0.6, 0.4, 0.3, 0.2] },  // Fat/muscle - light
          { value: 50, color: [0.8, 0.5, 0.4, 0.5] },   // Soft tissue
          { value: 150, color: [0.9, 0.7, 0.6, 0.8] },  // Dense tissue
          { value: 3071, color: [1.0, 1.0, 1.0, 1.0] }  // Maximum
        ]);
        tf.setGradientOpacity(true, 0.3);
        break;

      case 'MRI_BRAIN':
        tf.setRange(0, 4095);
        tf.setControlPoints([
          { value: 0, color: [0, 0, 0, 0] },            // Background - transparent
          { value: 500, color: [0, 0, 0, 0] },          // CSF - transparent
          { value: 1000, color: [0.7, 0.5, 0.5, 0.3] }, // Gray matter
          { value: 1500, color: [0.9, 0.8, 0.7, 0.6] }, // White matter
          { value: 2500, color: [1.0, 0.9, 0.8, 0.9] }, // Bright tissue
          { value: 4095, color: [1.0, 1.0, 1.0, 1.0] }  // Maximum
        ]);
        tf.setGradientOpacity(true, 0.4);
        break;

      case 'CT_ANGIO':
        tf.setRange(-1024, 3071);
        tf.setControlPoints([
          { value: -1024, color: [0, 0, 0, 0] },        // Air - transparent
          { value: 0, color: [0, 0, 0, 0] },            // Soft tissue - transparent
          { value: 150, color: [0.8, 0.2, 0.2, 0.3] },  // Contrast start - red
          { value: 300, color: [1.0, 0.3, 0.2, 0.7] },  // High contrast - bright red
          { value: 500, color: [1.0, 0.5, 0.4, 0.9] },  // Very high - lighter red
          { value: 3071, color: [1.0, 0.8, 0.8, 1.0] }  // Maximum
        ]);
        tf.setGradientOpacity(true, 0.6);
        break;

      case 'CT_CARDIAC':
        tf.setRange(-1024, 3071);
        tf.setControlPoints([
          { value: -1024, color: [0, 0, 0, 0] },        // Air - transparent
          { value: -500, color: [0, 0, 0, 0] },         // Lung - transparent
          { value: 0, color: [0.6, 0.3, 0.3, 0.1] },    // Muscle - very transparent
          { value: 100, color: [0.8, 0.4, 0.4, 0.3] },  // Dense muscle
          { value: 200, color: [1.0, 0.9, 0.8, 0.6] },  // Bone/calcification
          { value: 3071, color: [1.0, 1.0, 1.0, 1.0] }  // Maximum
        ]);
        tf.setGradientOpacity(true, 0.4);
        break;
    }

    return tf;
  }

  /**
   * Creates a simple opacity ramp.
   *
   * @param startValue - Value where opacity starts
   * @param endValue - Value where opacity reaches maximum
   * @param color - RGB color [0-1]
   * @returns TransferFunction instance
   */
  static opacityRamp(
    startValue: number,
    endValue: number,
    color: [number, number, number] = [1, 1, 1]
  ): TransferFunction {
    const tf = new TransferFunction(startValue, endValue);
    tf.setControlPoints([
      { value: startValue, color: [color[0], color[1], color[2], 0] },
      { value: endValue, color: [color[0], color[1], color[2], 1] }
    ]);
    return tf;
  }

  /**
   * Clones this transfer function.
   *
   * @returns New TransferFunction instance
   */
  clone(): TransferFunction {
    const tf = new TransferFunction(this.minValue, this.maxValue);
    tf.setControlPoints(this.controlPoints.map(cp => ({
      value: cp.value,
      color: [...cp.color] as [number, number, number, number]
    })));
    tf.setGradientOpacity(this.gradientOpacity, this.gradientScale);
    return tf;
  }
}
