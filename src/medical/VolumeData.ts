/**
 * VolumeData.ts - 3D Volume Data Container for Medical Imaging
 *
 * Represents a 3D volumetric dataset with support for various voxel types.
 * Handles storage, access, and manipulation of volumetric medical imaging data.
 *
 * @example
 * ```typescript
 * const volume = new VolumeData(512, 512, 200, 'Uint16');
 * volume.setSpacing(0.5, 0.5, 1.0); // mm
 * volume.setVoxel(100, 100, 50, 1500); // Set HU value
 * const value = volume.getVoxel(100, 100, 50);
 * ```
 */

export type VoxelType = 'Uint8' | 'Uint16' | 'Int16' | 'Float32';

export interface VolumeMetadata {
  patientName?: string;
  patientID?: string;
  studyDate?: string;
  modality?: string;
  seriesDescription?: string;
  sliceThickness?: number;
}

export class VolumeData {
  private data: Uint8Array | Uint16Array | Int16Array | Float32Array;
  private width: number;
  private height: number;
  private depth: number;
  private voxelType: VoxelType;
  private spacingX: number = 1.0;
  private spacingY: number = 1.0;
  private spacingZ: number = 1.0;
  private originX: number = 0.0;
  private originY: number = 0.0;
  private originZ: number = 0.0;
  private windowCenter: number = 0;
  private windowWidth: number = 1;
  private minValue: number = 0;
  private maxValue: number = 0;
  private metadata: VolumeMetadata = {};

  /**
   * Creates a new VolumeData instance.
   *
   * @param width - Volume width (number of voxels in X direction)
   * @param height - Volume height (number of voxels in Y direction)
   * @param depth - Volume depth (number of voxels in Z direction)
   * @param voxelType - Data type for voxel values
   */
  constructor(width: number, height: number, depth: number, voxelType: VoxelType = 'Uint16') {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.voxelType = voxelType;

    const totalVoxels = width * height * depth;

    switch (voxelType) {
      case 'Uint8':
        this.data = new Uint8Array(totalVoxels);
        this.maxValue = 255;
        break;
      case 'Uint16':
        this.data = new Uint16Array(totalVoxels);
        this.maxValue = 65535;
        break;
      case 'Int16':
        this.data = new Int16Array(totalVoxels);
        this.minValue = -32768;
        this.maxValue = 32767;
        break;
      case 'Float32':
        this.data = new Float32Array(totalVoxels);
        this.maxValue = 1.0;
        break;
    }

    this.windowWidth = this.maxValue - this.minValue;
    this.windowCenter = (this.maxValue + this.minValue) / 2;
  }

  /**
   * Gets a voxel value at the specified 3D coordinates.
   *
   * @param x - X coordinate (0 to width-1)
   * @param y - Y coordinate (0 to height-1)
   * @param z - Z coordinate (0 to depth-1)
   * @returns The voxel value, or 0 if out of bounds
   */
  getVoxel(x: number, y: number, z: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.depth) {
      return 0;
    }
    const index = x + y * this.width + z * this.width * this.height;
    return this.data[index];
  }

  /**
   * Sets a voxel value at the specified 3D coordinates.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   * @param value - The value to set
   */
  setVoxel(x: number, y: number, z: number, value: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.depth) {
      return;
    }
    const index = x + y * this.width + z * this.width * this.height;
    this.data[index] = value;
  }

  /**
   * Gets a voxel value using trilinear interpolation.
   *
   * @param x - X coordinate (can be fractional)
   * @param y - Y coordinate (can be fractional)
   * @param z - Z coordinate (can be fractional)
   * @returns Interpolated voxel value
   */
  getVoxelInterpolated(x: number, y: number, z: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const z1 = z0 + 1;

    const fx = x - x0;
    const fy = y - y0;
    const fz = z - z0;

    const c000 = this.getVoxel(x0, y0, z0);
    const c100 = this.getVoxel(x1, y0, z0);
    const c010 = this.getVoxel(x0, y1, z0);
    const c110 = this.getVoxel(x1, y1, z0);
    const c001 = this.getVoxel(x0, y0, z1);
    const c101 = this.getVoxel(x1, y0, z1);
    const c011 = this.getVoxel(x0, y1, z1);
    const c111 = this.getVoxel(x1, y1, z1);

    const c00 = c000 * (1 - fx) + c100 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;

    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;

    return c0 * (1 - fz) + c1 * fz;
  }

  /**
   * Extracts a 2D slice from the volume along a specific axis.
   *
   * @param axis - Axis to slice along ('x', 'y', or 'z')
   * @param index - Slice index along the axis
   * @returns 2D array of voxel values
   */
  getSlice(axis: 'x' | 'y' | 'z', index: number): Float32Array {
    let sliceWidth: number;
    let sliceHeight: number;
    let slice: Float32Array;

    switch (axis) {
      case 'x':
        if (index < 0 || index >= this.width) {
          throw new Error(`Slice index ${index} out of bounds for axis x (0-${this.width - 1})`);
        }
        sliceWidth = this.height;
        sliceHeight = this.depth;
        slice = new Float32Array(sliceWidth * sliceHeight);
        for (let z = 0; z < this.depth; z++) {
          for (let y = 0; y < this.height; y++) {
            slice[y + z * sliceWidth] = this.getVoxel(index, y, z);
          }
        }
        break;

      case 'y':
        if (index < 0 || index >= this.height) {
          throw new Error(`Slice index ${index} out of bounds for axis y (0-${this.height - 1})`);
        }
        sliceWidth = this.width;
        sliceHeight = this.depth;
        slice = new Float32Array(sliceWidth * sliceHeight);
        for (let z = 0; z < this.depth; z++) {
          for (let x = 0; x < this.width; x++) {
            slice[x + z * sliceWidth] = this.getVoxel(x, index, z);
          }
        }
        break;

      case 'z':
      default:
        if (index < 0 || index >= this.depth) {
          throw new Error(`Slice index ${index} out of bounds for axis z (0-${this.depth - 1})`);
        }
        sliceWidth = this.width;
        sliceHeight = this.height;
        slice = new Float32Array(sliceWidth * sliceHeight);
        for (let y = 0; y < this.height; y++) {
          for (let x = 0; x < this.width; x++) {
            slice[x + y * sliceWidth] = this.getVoxel(x, y, index);
          }
        }
        break;
    }

    return slice;
  }

  /**
   * Sets the voxel spacing (resolution) in world coordinates.
   *
   * @param x - Spacing in X direction (mm)
   * @param y - Spacing in Y direction (mm)
   * @param z - Spacing in Z direction (mm)
   */
  setSpacing(x: number, y: number, z: number): void {
    this.spacingX = x;
    this.spacingY = y;
    this.spacingZ = z;
  }

  /**
   * Sets the origin position in world coordinates.
   *
   * @param x - Origin X coordinate
   * @param y - Origin Y coordinate
   * @param z - Origin Z coordinate
   */
  setOrigin(x: number, y: number, z: number): void {
    this.originX = x;
    this.originY = y;
    this.originZ = z;
  }

  /**
   * Sets the window center and width for display.
   *
   * @param center - Window center value
   * @param width - Window width value
   */
  setWindow(center: number, width: number): void {
    this.windowCenter = center;
    this.windowWidth = width;
  }

  /**
   * Computes and caches the minimum and maximum values in the volume.
   */
  computeMinMax(): void {
    let min = this.data[0];
    let max = this.data[0];

    for (let i = 1; i < this.data.length; i++) {
      const val = this.data[i];
      if (val < min) min = val;
      if (val > max) max = val;
    }

    this.minValue = min;
    this.maxValue = max;
  }

  /**
   * Calculates the gradient at a voxel position using central differences.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   * @returns Gradient vector [gx, gy, gz]
   */
  getGradient(x: number, y: number, z: number): [number, number, number] {
    const gx = (this.getVoxel(x + 1, y, z) - this.getVoxel(x - 1, y, z)) / (2 * this.spacingX);
    const gy = (this.getVoxel(x, y + 1, z) - this.getVoxel(x, y - 1, z)) / (2 * this.spacingY);
    const gz = (this.getVoxel(x, y, z + 1) - this.getVoxel(x, y, z - 1)) / (2 * this.spacingZ);
    return [gx, gy, gz];
  }

  /**
   * Sets the volume metadata.
   *
   * @param metadata - Metadata object
   */
  setMetadata(metadata: VolumeMetadata): void {
    this.metadata = { ...this.metadata, ...metadata };
  }

  // Getters
  getWidth(): number { return this.width; }
  getHeight(): number { return this.height; }
  getDepth(): number { return this.depth; }
  getDimensions(): [number, number, number] { return [this.width, this.height, this.depth]; }
  getVoxelType(): VoxelType { return this.voxelType; }
  getSpacing(): [number, number, number] { return [this.spacingX, this.spacingY, this.spacingZ]; }
  getOrigin(): [number, number, number] { return [this.originX, this.originY, this.originZ]; }
  getWindow(): [number, number] { return [this.windowCenter, this.windowWidth]; }
  getMinValue(): number { return this.minValue; }
  getMaxValue(): number { return this.maxValue; }
  getMetadata(): VolumeMetadata { return { ...this.metadata }; }
  getData(): Uint8Array | Uint16Array | Int16Array | Float32Array { return this.data; }
  getByteSize(): number { return this.data.byteLength; }

  /**
   * Creates a clone of this volume data.
   *
   * @returns New VolumeData instance with copied data
   */
  clone(): VolumeData {
    const cloned = new VolumeData(this.width, this.height, this.depth, this.voxelType);
    cloned.data.set(this.data);
    cloned.setSpacing(this.spacingX, this.spacingY, this.spacingZ);
    cloned.setOrigin(this.originX, this.originY, this.originZ);
    cloned.setWindow(this.windowCenter, this.windowWidth);
    cloned.minValue = this.minValue;
    cloned.maxValue = this.maxValue;
    cloned.metadata = { ...this.metadata };
    return cloned;
  }

  /**
   * Applies a window/level transformation to map values to 0-255 range.
   *
   * @param value - Input voxel value
   * @returns Windowed value in range [0, 255]
   */
  applyWindow(value: number): number {
    const minWindow = this.windowCenter - this.windowWidth / 2;
    const maxWindow = this.windowCenter + this.windowWidth / 2;

    if (value <= minWindow) return 0;
    if (value >= maxWindow) return 255;

    return ((value - minWindow) / this.windowWidth) * 255;
  }
}
