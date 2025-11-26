/**
 * MPRSlicer.ts - Multi-Planar Reconstruction Slicer
 *
 * Extracts 2D slices from 3D volume data along arbitrary planes.
 * Supports orthogonal views (axial, sagittal, coronal), oblique slicing,
 * and various interpolation methods.
 *
 * @example
 * ```typescript
 * const slicer = new MPRSlicer(volumeData);
 * const axialSlice = slicer.getSlice('axial', 128);
 * const obliqueSlice = slicer.getObliqueSlice(origin, normal, width, height);
 * ```
 */

import { VolumeData } from './VolumeData';

export type SliceOrientation = 'axial' | 'sagittal' | 'coronal';
export type InterpolationMode = 'nearest' | 'linear' | 'cubic';

export interface SliceData {
  pixels: Float32Array;
  width: number;
  height: number;
  orientation: SliceOrientation | 'oblique';
  sliceIndex?: number;
  spacing: [number, number];
  origin: [number, number, number];
}

export interface SlabSettings {
  thickness: number; // Number of slices to include
  mode: 'MIP' | 'MinIP' | 'AVERAGE'; // Slab projection mode
}

export class MPRSlicer {
  private volume: VolumeData;
  private interpolationMode: InterpolationMode = 'linear';

  constructor(volume: VolumeData) {
    this.volume = volume;
  }

  /**
   * Sets the interpolation mode for slice extraction.
   */
  setInterpolationMode(mode: InterpolationMode): void {
    this.interpolationMode = mode;
  }

  /**
   * Extracts an orthogonal slice from the volume.
   *
   * @param orientation - Slice orientation (axial, sagittal, or coronal)
   * @param index - Slice index along the orientation axis
   * @param slabSettings - Optional slab thickness settings
   * @returns SliceData object containing pixel data and metadata
   */
  getSlice(
    orientation: SliceOrientation,
    index: number,
    slabSettings?: SlabSettings
  ): SliceData {
    const [width, height, depth] = this.volume.getDimensions();
    const spacing = this.volume.getSpacing();
    const origin = this.volume.getOrigin();

    let sliceWidth: number;
    let sliceHeight: number;
    let sliceSpacing: [number, number];
    let sliceOrigin: [number, number, number];

    switch (orientation) {
      case 'axial':
        sliceWidth = width;
        sliceHeight = height;
        sliceSpacing = [spacing[0], spacing[1]];
        sliceOrigin = [origin[0], origin[1], origin[2] + index * spacing[2]];
        break;

      case 'sagittal':
        sliceWidth = height;
        sliceHeight = depth;
        sliceSpacing = [spacing[1], spacing[2]];
        sliceOrigin = [origin[0] + index * spacing[0], origin[1], origin[2]];
        break;

      case 'coronal':
        sliceWidth = width;
        sliceHeight = depth;
        sliceSpacing = [spacing[0], spacing[2]];
        sliceOrigin = [origin[0], origin[1] + index * spacing[1], origin[2]];
        break;
    }

    let pixels: Float32Array;

    if (slabSettings) {
      pixels = this.extractSlab(orientation, index, slabSettings, sliceWidth, sliceHeight);
    } else {
      pixels = this.extractSlice(orientation, index, sliceWidth, sliceHeight);
    }

    return {
      pixels,
      width: sliceWidth,
      height: sliceHeight,
      orientation,
      sliceIndex: index,
      spacing: sliceSpacing,
      origin: sliceOrigin
    };
  }

  private extractSlice(
    orientation: SliceOrientation,
    index: number,
    sliceWidth: number,
    sliceHeight: number
  ): Float32Array {
    const pixels = new Float32Array(sliceWidth * sliceHeight);

    for (let y = 0; y < sliceHeight; y++) {
      for (let x = 0; x < sliceWidth; x++) {
        const voxelCoords = this.sliceToVolumeCoords(orientation, x, y, index);
        const value = this.sampleVolume(voxelCoords[0], voxelCoords[1], voxelCoords[2]);
        pixels[x + y * sliceWidth] = value;
      }
    }

    return pixels;
  }

  private extractSlab(
    orientation: SliceOrientation,
    centerIndex: number,
    settings: SlabSettings,
    sliceWidth: number,
    sliceHeight: number
  ): Float32Array {
    const pixels = new Float32Array(sliceWidth * sliceHeight);
    const halfThickness = Math.floor(settings.thickness / 2);

    for (let y = 0; y < sliceHeight; y++) {
      for (let x = 0; x < sliceWidth; x++) {
        const values: number[] = [];

        for (let i = -halfThickness; i <= halfThickness; i++) {
          const sliceIndex = centerIndex + i;
          const voxelCoords = this.sliceToVolumeCoords(orientation, x, y, sliceIndex);
          const value = this.sampleVolume(voxelCoords[0], voxelCoords[1], voxelCoords[2]);
          values.push(value);
        }

        let result: number;
        switch (settings.mode) {
          case 'MIP':
            result = Math.max(...values);
            break;
          case 'MinIP':
            result = Math.min(...values);
            break;
          case 'AVERAGE':
            result = values.reduce((a, b) => a + b, 0) / values.length;
            break;
        }

        pixels[x + y * sliceWidth] = result;
      }
    }

    return pixels;
  }

  /**
   * Extracts an oblique slice defined by an origin point and normal vector.
   *
   * @param origin - Origin point in world coordinates [x, y, z]
   * @param normal - Slice plane normal vector [x, y, z]
   * @param width - Output slice width in pixels
   * @param height - Output slice height in pixels
   * @param pixelSpacing - Pixel spacing [x, y] in world units
   * @returns SliceData object
   */
  getObliqueSlice(
    origin: [number, number, number],
    normal: [number, number, number],
    width: number,
    height: number,
    pixelSpacing: [number, number] = [1, 1]
  ): SliceData {
    // Normalize the normal vector
    const normalizedNormal = this.normalize(normal);

    // Create orthogonal basis vectors
    const [u, v] = this.createOrthogonalBasis(normalizedNormal);

    const pixels = new Float32Array(width * height);
    const volumeOrigin = this.volume.getOrigin();
    const volumeSpacing = this.volume.getSpacing();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Calculate world position on the oblique plane
        const worldX = origin[0] + (x - width / 2) * pixelSpacing[0] * u[0] + (y - height / 2) * pixelSpacing[1] * v[0];
        const worldY = origin[1] + (x - width / 2) * pixelSpacing[0] * u[1] + (y - height / 2) * pixelSpacing[1] * v[1];
        const worldZ = origin[2] + (x - width / 2) * pixelSpacing[0] * u[2] + (y - height / 2) * pixelSpacing[1] * v[2];

        // Convert world coordinates to voxel coordinates
        const voxelX = (worldX - volumeOrigin[0]) / volumeSpacing[0];
        const voxelY = (worldY - volumeOrigin[1]) / volumeSpacing[1];
        const voxelZ = (worldZ - volumeOrigin[2]) / volumeSpacing[2];

        const value = this.sampleVolume(voxelX, voxelY, voxelZ);
        pixels[x + y * width] = value;
      }
    }

    return {
      pixels,
      width,
      height,
      orientation: 'oblique',
      spacing: pixelSpacing,
      origin
    };
  }

  /**
   * Gets a slice with crosshair overlay coordinates for multi-view synchronization.
   *
   * @param orientation - Primary slice orientation
   * @param index - Slice index
   * @param crosshairPoint - 3D point for crosshair [x, y, z] in voxel coordinates
   * @returns SliceData with crosshair coordinates
   */
  getSliceWithCrosshair(
    orientation: SliceOrientation,
    index: number,
    crosshairPoint: [number, number, number]
  ): SliceData & { crosshair: [number, number] } {
    const slice = this.getSlice(orientation, index);

    let crosshairX: number;
    let crosshairY: number;

    switch (orientation) {
      case 'axial':
        crosshairX = crosshairPoint[0];
        crosshairY = crosshairPoint[1];
        break;
      case 'sagittal':
        crosshairX = crosshairPoint[1];
        crosshairY = crosshairPoint[2];
        break;
      case 'coronal':
        crosshairX = crosshairPoint[0];
        crosshairY = crosshairPoint[2];
        break;
    }

    return {
      ...slice,
      crosshair: [crosshairX, crosshairY]
    };
  }

  private sliceToVolumeCoords(
    orientation: SliceOrientation,
    x: number,
    y: number,
    index: number
  ): [number, number, number] {
    switch (orientation) {
      case 'axial':
        return [x, y, index];
      case 'sagittal':
        return [index, x, y];
      case 'coronal':
        return [x, index, y];
    }
  }

  private sampleVolume(x: number, y: number, z: number): number {
    switch (this.interpolationMode) {
      case 'nearest':
        return this.sampleNearest(x, y, z);
      case 'linear':
        return this.sampleLinear(x, y, z);
      case 'cubic':
        return this.sampleCubic(x, y, z);
      default:
        return this.sampleLinear(x, y, z);
    }
  }

  private sampleNearest(x: number, y: number, z: number): number {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iz = Math.round(z);
    return this.volume.getVoxel(ix, iy, iz);
  }

  private sampleLinear(x: number, y: number, z: number): number {
    return this.volume.getVoxelInterpolated(x, y, z);
  }

  private sampleCubic(x: number, y: number, z: number): number {
    // Bicubic interpolation using Catmull-Rom splines
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);

    const fx = x - ix;
    const fy = y - iy;
    const fz = z - iz;

    const samples: number[] = [];

    for (let k = -1; k <= 2; k++) {
      for (let j = -1; j <= 2; j++) {
        for (let i = -1; i <= 2; i++) {
          samples.push(this.volume.getVoxel(ix + i, iy + j, iz + k));
        }
      }
    }

    // Apply cubic interpolation in each dimension
    const wx = this.cubicWeights(fx);
    const wy = this.cubicWeights(fy);
    const wz = this.cubicWeights(fz);

    let result = 0;
    for (let k = 0; k < 4; k++) {
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          const idx = i + j * 4 + k * 16;
          result += samples[idx] * wx[i] * wy[j] * wz[k];
        }
      }
    }

    return result;
  }

  private cubicWeights(t: number): [number, number, number, number] {
    const t2 = t * t;
    const t3 = t2 * t;

    return [
      -0.5 * t3 + t2 - 0.5 * t,
      1.5 * t3 - 2.5 * t2 + 1,
      -1.5 * t3 + 2 * t2 + 0.5 * t,
      0.5 * t3 - 0.5 * t2
    ];
  }

  private normalize(v: [number, number, number]): [number, number, number] {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len < 1e-10) return [0, 0, 1];
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  private createOrthogonalBasis(
    normal: [number, number, number]
  ): [[number, number, number], [number, number, number]] {
    // Choose a vector not parallel to normal
    let arbitrary: [number, number, number] = [1, 0, 0];
    if (Math.abs(normal[0]) > 0.9) {
      arbitrary = [0, 1, 0];
    }

    // Create first orthogonal vector using cross product
    const u = this.cross(arbitrary, normal);
    const uNorm = this.normalize(u);

    // Create second orthogonal vector
    const v = this.cross(normal, uNorm);
    const vNorm = this.normalize(v);

    return [uNorm, vNorm];
  }

  private cross(
    a: [number, number, number],
    b: [number, number, number]
  ): [number, number, number] {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  /**
   * Converts slice pixel data to displayable RGBA image.
   *
   * @param sliceData - Input slice data
   * @param windowCenter - Window center for display
   * @param windowWidth - Window width for display
   * @returns Uint8ClampedArray RGBA image data
   */
  toRGBA(sliceData: SliceData, windowCenter?: number, windowWidth?: number): Uint8ClampedArray {
    const { pixels, width, height } = sliceData;
    const rgba = new Uint8ClampedArray(width * height * 4);

    const [wc, ww] = windowCenter !== undefined && windowWidth !== undefined
      ? [windowCenter, windowWidth]
      : this.volume.getWindow();

    const minWindow = wc - ww / 2;
    const maxWindow = wc + ww / 2;

    for (let i = 0; i < pixels.length; i++) {
      let value = pixels[i];

      // Apply windowing
      if (value <= minWindow) {
        value = 0;
      } else if (value >= maxWindow) {
        value = 255;
      } else {
        value = ((value - minWindow) / ww) * 255;
      }

      const idx = i * 4;
      rgba[idx + 0] = value; // R
      rgba[idx + 1] = value; // G
      rgba[idx + 2] = value; // B
      rgba[idx + 3] = 255;   // A
    }

    return rgba;
  }

  /**
   * Gets the volume being sliced.
   */
  getVolume(): VolumeData {
    return this.volume;
  }
}
