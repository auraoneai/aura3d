/**
 * DICOMLoader.ts - DICOM File Parser and Loader
 *
 * Parses DICOM Part 10 files, extracts metadata and pixel data,
 * and constructs 3D volume datasets from DICOM series.
 *
 * Supports:
 * - DICOM Part 10 file format
 * - Tag reading (group, element)
 * - Series sorting by instance number
 * - Uncompressed pixel data
 * - Multi-frame support
 *
 * @example
 * ```typescript
 * const loader = new DICOMLoader();
 * const volume = await loader.loadSeries(fileList);
 * console.log(volume.getMetadata());
 * ```
 */

import { VolumeData, VoxelType } from './VolumeData';

export interface DICOMTag {
  group: number;
  element: number;
  vr?: string;
  value: any;
}

export interface DICOMImage {
  width: number;
  height: number;
  pixelData: Uint8Array | Uint16Array | Int16Array;
  instanceNumber: number;
  sliceLocation?: number;
  imagePosition?: [number, number, number];
  imageOrientation?: [number, number, number, number, number, number];
  pixelSpacing?: [number, number];
  sliceThickness?: number;
  rescaleIntercept?: number;
  rescaleSlope?: number;
  windowCenter?: number;
  windowWidth?: number;
  bitsAllocated: number;
  bitsStored: number;
  pixelRepresentation: number;
  photometricInterpretation: string;
  samplesPerPixel: number;
  metadata: Map<string, any>;
}

export class DICOMLoader {
  private littleEndian: boolean = true;

  /**
   * Loads a single DICOM file.
   */
  async loadFile(file: File | ArrayBuffer): Promise<DICOMImage> {
    const buffer = file instanceof File ? await file.arrayBuffer() : file;
    return this.parseDICOM(buffer);
  }

  /**
   * Loads multiple DICOM files and constructs a 3D volume.
   */
  async loadSeries(files: File[] | ArrayBuffer[]): Promise<VolumeData> {
    const images: DICOMImage[] = [];

    for (const file of files) {
      try {
        const image = await this.loadFile(file);
        images.push(image);
      } catch (error) {
        console.warn('Failed to load DICOM file:', error);
      }
    }

    if (images.length === 0) {
      throw new Error('No valid DICOM files found');
    }

    // Sort by instance number or slice location
    images.sort((a, b) => {
      if (a.sliceLocation !== undefined && b.sliceLocation !== undefined) {
        return a.sliceLocation - b.sliceLocation;
      }
      return a.instanceNumber - b.instanceNumber;
    });

    return this.constructVolume(images);
  }

  private parseDICOM(buffer: ArrayBuffer): DICOMImage {
    const view = new DataView(buffer);
    let offset = 0;

    // Check for DICOM preamble (128 bytes) and prefix "DICM"
    const preamble = new Uint8Array(buffer, 0, 128);
    const prefix = String.fromCharCode(
      view.getUint8(128),
      view.getUint8(129),
      view.getUint8(130),
      view.getUint8(131)
    );

    if (prefix === 'DICM') {
      offset = 132; // Skip preamble and prefix
    } else {
      offset = 0; // No preamble, start parsing immediately
    }

    const metadata = new Map<string, any>();
    let pixelData: Uint8Array | Uint16Array | Int16Array | null = null;

    // Parse data elements
    while (offset < buffer.byteLength - 8) {
      const group = view.getUint16(offset, this.littleEndian);
      offset += 2;
      const element = view.getUint16(offset, this.littleEndian);
      offset += 2;

      // Meta information group uses explicit VR
      let vr = '';
      let length = 0;

      if (group === 0x0002 || this.isExplicitVR(view, offset)) {
        vr = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1));
        offset += 2;

        if (this.isLongVR(vr)) {
          offset += 2; // Reserved
          length = view.getUint32(offset, this.littleEndian);
          offset += 4;
        } else {
          length = view.getUint16(offset, this.littleEndian);
          offset += 2;
        }
      } else {
        // Implicit VR
        length = view.getUint32(offset, this.littleEndian);
        offset += 4;
        vr = this.getImplicitVR(group, element);
      }

      const tag = this.formatTag(group, element);

      // Handle undefined length
      if (length === 0xffffffff) {
        // Sequence with undefined length - skip for now
        offset = this.skipSequence(view, offset);
        continue;
      }

      // Extract value
      const value = this.readValue(view, offset, length, vr);
      metadata.set(tag, value);

      // Store specific tags
      if (group === 0x7fe0 && element === 0x0010) {
        // Pixel Data
        pixelData = this.extractPixelData(view, offset, length, metadata);
      }

      offset += length;
    }

    // Construct DICOMImage
    return this.buildDICOMImage(metadata, pixelData);
  }

  private isExplicitVR(view: DataView, offset: number): boolean {
    const vr = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1));
    const validVRs = ['AE', 'AS', 'AT', 'CS', 'DA', 'DS', 'DT', 'FL', 'FD', 'IS', 'LO', 'LT',
      'OB', 'OD', 'OF', 'OW', 'PN', 'SH', 'SL', 'SQ', 'SS', 'ST', 'TM', 'UI', 'UL', 'UN', 'US', 'UT'];
    return validVRs.includes(vr);
  }

  private isLongVR(vr: string): boolean {
    return ['OB', 'OD', 'OF', 'OL', 'OW', 'SQ', 'UC', 'UN', 'UR', 'UT'].includes(vr);
  }

  private getImplicitVR(group: number, element: number): string {
    // Basic VR inference - in practice, use a DICOM data dictionary
    if (group === 0x7fe0 && element === 0x0010) return 'OW';
    return 'UN';
  }

  private formatTag(group: number, element: number): string {
    return `(${group.toString(16).padStart(4, '0')},${element.toString(16).padStart(4, '0')})`;
  }

  private skipSequence(view: DataView, offset: number): number {
    let depth = 1;
    while (depth > 0 && offset < view.byteLength - 8) {
      const group = view.getUint16(offset, this.littleEndian);
      const element = view.getUint16(offset + 2, this.littleEndian);
      const length = view.getUint32(offset + 4, this.littleEndian);

      offset += 8;

      if (group === 0xfffe && element === 0xe000) {
        depth++; // Item
      } else if (group === 0xfffe && element === 0xe00d) {
        depth--; // Item Delimiter
      } else if (group === 0xfffe && element === 0xe0dd) {
        depth--; // Sequence Delimiter
      }

      if (length !== 0xffffffff && length > 0) {
        offset += length;
      }
    }
    return offset;
  }

  private readValue(view: DataView, offset: number, length: number, vr: string): any {
    if (length === 0) return null;

    try {
      switch (vr) {
        case 'US': // Unsigned Short
          return view.getUint16(offset, this.littleEndian);
        case 'SS': // Signed Short
          return view.getInt16(offset, this.littleEndian);
        case 'UL': // Unsigned Long
          return view.getUint32(offset, this.littleEndian);
        case 'SL': // Signed Long
          return view.getInt32(offset, this.littleEndian);
        case 'FL': // Float
          return view.getFloat32(offset, this.littleEndian);
        case 'FD': // Double
          return view.getFloat64(offset, this.littleEndian);
        case 'IS': // Integer String
        case 'DS': // Decimal String
          return this.readString(view, offset, length).trim();
        case 'AT': // Attribute Tag
          return `(${view.getUint16(offset, this.littleEndian).toString(16)},${view.getUint16(offset + 2, this.littleEndian).toString(16)})`;
        default:
          return this.readString(view, offset, length).trim();
      }
    } catch {
      return null;
    }
  }

  private readString(view: DataView, offset: number, length: number): string {
    const bytes = new Uint8Array(view.buffer, offset, length);
    return String.fromCharCode(...Array.from(bytes)).replace(/\0/g, '');
  }

  private extractPixelData(
    view: DataView,
    offset: number,
    length: number,
    metadata: Map<string, any>
  ): Uint8Array | Uint16Array | Int16Array {
    const bitsAllocated = parseInt(metadata.get('(0028,0100)') || '16');
    const pixelRepresentation = parseInt(metadata.get('(0028,0103)') || '0');

    if (bitsAllocated === 8) {
      return new Uint8Array(view.buffer, offset, length);
    } else if (bitsAllocated === 16) {
      const wordCount = length / 2;
      if (pixelRepresentation === 1) {
        return new Int16Array(view.buffer, offset, wordCount);
      } else {
        return new Uint16Array(view.buffer, offset, wordCount);
      }
    }

    throw new Error(`Unsupported bits allocated: ${bitsAllocated}`);
  }

  private buildDICOMImage(metadata: Map<string, any>, pixelData: Uint8Array | Uint16Array | Int16Array | null): DICOMImage {
    const width = parseInt(metadata.get('(0028,0011)') || '0');
    const height = parseInt(metadata.get('(0028,0010)') || '0');
    const instanceNumber = parseInt(metadata.get('(0020,0013)') || '1');
    const bitsAllocated = parseInt(metadata.get('(0028,0100)') || '16');
    const bitsStored = parseInt(metadata.get('(0028,0101)') || bitsAllocated.toString());
    const pixelRepresentation = parseInt(metadata.get('(0028,0103)') || '0');
    const photometricInterpretation = metadata.get('(0028,0004)') || 'MONOCHROME2';
    const samplesPerPixel = parseInt(metadata.get('(0028,0002)') || '1');

    const pixelSpacingStr = metadata.get('(0028,0030)');
    const pixelSpacing = pixelSpacingStr ? pixelSpacingStr.split('\\').map(parseFloat) : undefined;

    const sliceThickness = parseFloat(metadata.get('(0018,0050)') || '1.0');

    const imagePositionStr = metadata.get('(0020,0032)');
    const imagePosition = imagePositionStr
      ? imagePositionStr.split('\\').map(parseFloat)
      : undefined;

    const imageOrientationStr = metadata.get('(0020,0037)');
    const imageOrientation = imageOrientationStr
      ? imageOrientationStr.split('\\').map(parseFloat)
      : undefined;

    const sliceLocation = parseFloat(metadata.get('(0020,1041)') || (imagePosition ? imagePosition[2].toString() : '0'));

    const rescaleIntercept = parseFloat(metadata.get('(0028,1052)') || '0');
    const rescaleSlope = parseFloat(metadata.get('(0028,1053)') || '1');

    const windowCenterStr = metadata.get('(0028,1050)');
    const windowWidthStr = metadata.get('(0028,1051)');
    const windowCenter = windowCenterStr ? parseFloat(windowCenterStr.split('\\')[0]) : undefined;
    const windowWidth = windowWidthStr ? parseFloat(windowWidthStr.split('\\')[0]) : undefined;

    if (!pixelData) {
      throw new Error('No pixel data found in DICOM file');
    }

    return {
      width,
      height,
      pixelData,
      instanceNumber,
      sliceLocation,
      imagePosition: imagePosition as [number, number, number],
      imageOrientation: imageOrientation as [number, number, number, number, number, number],
      pixelSpacing: pixelSpacing as [number, number],
      sliceThickness,
      rescaleIntercept,
      rescaleSlope,
      windowCenter,
      windowWidth,
      bitsAllocated,
      bitsStored,
      pixelRepresentation,
      photometricInterpretation,
      samplesPerPixel,
      metadata
    };
  }

  private constructVolume(images: DICOMImage[]): VolumeData {
    const firstImage = images[0];
    const width = firstImage.width;
    const height = firstImage.height;
    const depth = images.length;

    // Determine voxel type
    let voxelType: VoxelType = 'Uint16';
    if (firstImage.bitsAllocated === 8) {
      voxelType = 'Uint8';
    } else if (firstImage.pixelRepresentation === 1) {
      voxelType = 'Int16';
    } else {
      voxelType = 'Uint16';
    }

    const volume = new VolumeData(width, height, depth, voxelType);

    // Copy pixel data
    for (let z = 0; z < depth; z++) {
      const image = images[z];
      const rescaleSlope = image.rescaleSlope || 1;
      const rescaleIntercept = image.rescaleIntercept || 0;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcIndex = x + y * width;
          let value = image.pixelData[srcIndex];

          // Apply rescale
          value = value * rescaleSlope + rescaleIntercept;

          volume.setVoxel(x, y, z, value);
        }
      }
    }

    // Set spacing
    const pixelSpacing = firstImage.pixelSpacing || [1, 1];
    const sliceThickness = firstImage.sliceThickness || 1;
    volume.setSpacing(pixelSpacing[0], pixelSpacing[1], sliceThickness);

    // Set origin from first image position
    if (firstImage.imagePosition) {
      volume.setOrigin(
        firstImage.imagePosition[0],
        firstImage.imagePosition[1],
        firstImage.imagePosition[2]
      );
    }

    // Set window/level
    if (firstImage.windowCenter !== undefined && firstImage.windowWidth !== undefined) {
      volume.setWindow(firstImage.windowCenter, firstImage.windowWidth);
    }

    // Compute min/max
    volume.computeMinMax();

    // Set metadata
    volume.setMetadata({
      patientName: firstImage.metadata.get('(0010,0010)'),
      patientID: firstImage.metadata.get('(0010,0020)'),
      studyDate: firstImage.metadata.get('(0008,0020)'),
      modality: firstImage.metadata.get('(0008,0060)'),
      seriesDescription: firstImage.metadata.get('(0008,103e)'),
      sliceThickness
    });

    return volume;
  }
}
